# Deploying doctor.shafa.care to EC2 — step-by-step runbook

Production deployment for the Next.js app on a single **t4g.medium** (Ubuntu
24.04 LTS, arm64) behind nginx, managed by PM2. **GitHub Actions** builds the app
on an ARM64 runner and ships it to the box **over SSH**; the box only serves.

Follow the parts in order the first time. Each part says whether it's done in
**AWS**, **GitHub**, **on your laptop**, or **on the box**.

```
GitHub Actions (dedicated ed25519 deploy key — GitHub secret)
  builds on ubuntu-24.04-arm  →  release.tar.gz
  ├─ scp ──────────────────►  appuser@13.232.159.121:/tmp/<tag>.tar.gz
  └─ ssh ──────────────────►  appuser runs /srv/doctor-id/bin/release.sh
                                 ├─ unpack → symlink current → pm2 reload
                                 └─ /api/health gate → auto-rollback on failure
nginx (TLS, X-Real-IP, limit_req)  →  127.0.0.1:3000  (PM2: next start)
app runtime only:  instance role → sts:AssumeRole (shafa) → S3 photos + SES email
```

**Security model (what keeps this safe):**
- Deploy auth is **one ed25519 SSH key** (GitHub secret), installed on the box with
  `restrict` (no shell PTY / no forwarding), targeting **`appuser` which has no sudo**.
- The box's SSH is **key-only** (no passwords, no root), with **fail2ban** and a
  **pinned host key** in CI (so a man-in-the-middle can't impersonate the box).
- The **only AWS credential** is the instance role's single `sts:AssumeRole` for the
  app's runtime S3/SES — **temporary creds, no static AWS keys, no OIDC, no S3 deploy
  bucket, no SSM dependency**.
- App secrets live **only** in `/srv/doctor-id/shared/.env.production.local` on the box.
  **CI never sees them.**
- Trade-off you're accepting: port 22 is open and there's one long-lived key. The
  controls above make that a standard, safe posture. See [Appendix A](#appendix-a--removing-the-open-ssh-port) to remove the open port entirely later.

## Reference values (used throughout)

| Thing | Value |
|---|---|
| Domain | `doctor.shafa.care` |
| Elastic IP | `13.232.159.121` |
| AWS region | `ap-south-1` (app runtime only) |
| Instance type | t4g.medium (arm64), Ubuntu 24.04 LTS, **≥30 GB gp3** root |
| Linux users | `ubuntu` (sudo, your admin login) · `appuser` (app + deploy target, no sudo) |
| App base dir | `/srv/doctor-id` → `releases/<tag>/`, `shared/`, `bin/`, `current` symlink |
| Live port | `127.0.0.1:3000` (never exposed publicly) |

## Files in `deployment/ec2/`

| File | Runs where | Role |
|---|---|---|
| `bootstrap.sh` | on the box (once, sudo) | Installs Node/PM2/nginx/TLS/ufw/fail2ban, hardens SSH, installs the deploy key. |
| `nginx/doctor-shafa-care.conf` | on the box | Hardened reverse-proxy vhost (installed by bootstrap). |
| `nginx/limit_req.conf` | on the box | Edge rate-limit zones → `/etc/nginx/conf.d/`. |
| `release.sh` | on the box | Atomic release: unpack → swap → reload → health-gate → auto-rollback. |
| `iam/instance-role-policy.json` | AWS | The one runtime IAM policy (assume-role only). |
| `.github/workflows/deploy.yml` | GitHub | CI: build → scp → ssh `release.sh`. |

---

# Part 0 — Prerequisites

Have these ready before you start:
- An AWS account with permission to create EC2 instances, Elastic IPs, IAM roles.
- The **shafa cross-account role ARN** the app assumes for S3/SES (CLAUDE.md #17).
- Admin access to **shafa.care DNS**, the **MongoDB Atlas** project, the **SSL
  Wireless** SMS portal, **AWS SES**, and **Cloudflare Turnstile**.
- A completed **`.env.production.local`** (your real production secrets).
- The repo on GitHub with permission to set Actions secrets/variables.
- `ssh` / `ssh-keygen` / `ssh-keyscan` on your laptop.

---

# Part 1 — AWS setup

### 1.1 Launch the EC2 instance  *(AWS Console → EC2 → Launch instance)*
1. **Name**: `doctor-id-prod`.
2. **AMI**: *Ubuntu Server 24.04 LTS*, architecture **64-bit (Arm)**.
3. **Instance type**: `t4g.medium`.
4. **Key pair**: create/select one (this is your `ubuntu` admin login — keep it safe).
5. **Storage**: change the root volume to **30 GiB gp3** (8 GiB is too small once you
   keep several releases that each bundle `node_modules`).
6. **Network**: default VPC is fine. We set the firewall in 1.3.
7. Launch.

### 1.2 Elastic IP  *(EC2 → Elastic IPs)*
1. **Allocate** an Elastic IP (or use the existing `13.232.159.121`).
2. **Associate** it with the instance. *Everything downstream pins to this IP.*

### 1.3 Security Group  *(EC2 → Security Groups → the instance's SG)*
Inbound rules — **only these**:

| Type | Port | Source | Why |
|---|---|---|---|
| HTTPS | 443 | `0.0.0.0/0`, `::/0` | public site |
| HTTP | 80 | `0.0.0.0/0` | ACME challenge + HTTP→HTTPS redirect |
| SSH | 22 | your admin IP **+ deploy source** | admin + CI deploy (see note) |

> **Port 22 source:** lock it to your admin IP plus wherever CI connects from.
> GitHub-hosted runners have a large, changing IP range, so in practice you'll open
> 22 to `0.0.0.0/0` — that's acceptable here because SSH is **key-only + fail2ban +
> pinned host key** and `appuser` has no sudo. To avoid the open port entirely, see
> [Appendix A](#appendix-a--removing-the-open-ssh-port).

**Do NOT** add port 3000 — the app binds to `127.0.0.1` only. Outbound: leave default (allow all).

### 1.4 IAM instance role  *(IAM → Roles)*  — the only AWS credential the box gets
1. **Create role** → trusted entity **AWS service → EC2**.
2. Attach an **inline policy** with the contents of
   [`iam/instance-role-policy.json`](iam/instance-role-policy.json). Replace
   `<CROSS_ACCOUNT_ROLE_ARN>` with the shafa role the app assumes for S3/SES.
3. *(Optional break-glass)* Also attach the AWS-managed **`AmazonSSMManagedInstanceCore`**
   if you want SSM Session Manager as a no-SSH recovery path.
4. Name it `doctor-id-prod-role` and create.
5. **Attach to the instance**: EC2 → select instance → *Actions → Security → Modify
   IAM role* → choose `doctor-id-prod-role`.

CLI equivalent for step 2 (optional):
```bash
aws iam put-role-policy --role-name doctor-id-prod-role \
  --policy-name doctor-id-runtime \
  --policy-document file://deployment/ec2/iam/instance-role-policy.json
```

---

# Part 2 — DNS  *(your DNS provider for shafa.care)*

Create an **A record**: `doctor.shafa.care` → `13.232.159.121`. Verify it resolves
**before** Part 4 (the `certbot --nginx` HTTP-01 challenge needs DNS live + port 80
reachable):
```bash
dig +short doctor.shafa.care      # must print 13.232.159.121
```
The `:80` vhost also 301-redirects `www.doctor.shafa.care` → the apex. To make `www`
truly usable (especially over HTTPS) you'd additionally add a `www` A-record **and**
`-d www.doctor.shafa.care` to the cert — the current cert + `:443` block are apex-only.

---

# Part 3 — External service allowlists  *(each provider's portal)*

These fail **silently** if skipped — do them now:
- **MongoDB Atlas** → *Network Access* → add `13.232.159.121`. Without it the app boots
  but `/api/health` returns 503 (and the homepage/API can't read data).
- **SSL Wireless portal** → whitelist `13.232.159.121`, or **every OTP/SMS returns
  `FAILED`** (CLAUDE.md #14) → login & registration break.
- **AWS SES** → verify the sending domain (shafa's likely already is) and ensure the
  account is **out of sandbox** for arbitrary recipients.
- **Cloudflare Turnstile** → add `doctor.shafa.care` to the widget's allowed hostnames.

---

# Part 4 — Prepare the box

### 4.1 Generate the CI deploy key  *(on your laptop)*
```bash
ssh-keygen -t ed25519 -C "doctor-id-ci" -f deploy_key -N ""
# Produces:
#   deploy_key      (PRIVATE) → GitHub secret SSH_DEPLOY_KEY   (Part 5)
#   deploy_key.pub  (PUBLIC)  → goes onto the box in 4.3
```
Keep `deploy_key` secret; it's the only thing that can deploy.

### 4.2 Copy the deployment files to the box  *(on your laptop)*
Use your launch key (the `ubuntu` admin login) or EC2 Instance Connect:
```bash
scp -r deployment/ec2 ubuntu@13.232.159.121:~/deploy
scp deploy_key.pub    ubuntu@13.232.159.121:~/deploy/
```

### 4.3 Run bootstrap  *(on the box, as `ubuntu`)*
```bash
ssh ubuntu@13.232.159.121
cd ~/deploy
chmod +x bootstrap.sh release.sh
sudo LETSENCRYPT_EMAIL=tanbir@shafa.care \
     DEPLOY_PUBKEY="$(cat deploy_key.pub)" \
     bash bootstrap.sh
```
This is idempotent and does everything box-side: Node 22, PM2 (+startup +logrotate),
nginx, **issues the TLS cert via `certbot certonly --nginx`** (auto-renews via the
certbot timer + a reload hook), ufw, 2 GB swap, unattended-upgrades, chrony,
**fail2ban**, **sshd hardening** (key-only/no-root/no-password), and installs the
**deploy key** into `appuser` (locked with `restrict`). It installs **no app code and
no secrets**. At the end it prints the remaining manual steps.

### 4.4 Place the secrets  *(on the box)*
Copy your completed env file into the shared slot bootstrap pre-created:
```bash
# from your laptop:
scp .env.production.local ubuntu@13.232.159.121:/tmp/prod.env
# on the box:
sudo install -m 600 -o appuser -g appuser /tmp/prod.env /srv/doctor-id/shared/.env.production.local
sudo rm -f /tmp/prod.env
```
**Production sanity-check the file:**
- **No `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`** — prod assumes the cross-account
  role. Set `AWS_ASSUME_ROLE_ARN` + `AWS_S3_EXTERNAL_ID` + `AWS_REGION=ap-south-1`.
- `AWS_PUBLIC_BUCKET_NAME` **and** `AWS_PRIVATE_BUCKET_NAME` both set.
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` set — **the app refuses to boot
  without them** in production.
- `TURNSTILE_SECRET_KEY` set — OTP forms fail closed without it.
- `AUTH_SECRET` (≥16 chars), `AUTH_URL=https://doctor.shafa.care`,
  `NEXT_PUBLIC_APP_URL=https://doctor.shafa.care`, `TRUSTED_PROXY_HOPS=1`.
- `MONGO_URI` = your Atlas SRV string, `SSL_SMS_*`, `SES_*`, `ADMIN_EMAILS`.

### 4.5 Pin the box's SSH host key for CI  *(on your laptop)*
```bash
ssh-keyscan 13.232.159.121       # copy the FULL output (may be several lines)
```
You'll paste this into the `SSH_KNOWN_HOSTS` GitHub variable next. It's what lets CI
confirm it's talking to *your* box (`StrictHostKeyChecking=yes`).

---

# Part 5 — GitHub setup  *(GitHub → repo → Settings → Secrets and variables → Actions)*

### 5.1 Secret  *(the "Secrets" tab)*
| Name | Value |
|---|---|
| `SSH_DEPLOY_KEY` | the **entire** contents of the private `deploy_key` (incl. the `-----BEGIN/END-----` lines) |

### 5.2 Variables  *(the "Variables" tab — these are non-secret)*
| Name | Value |
|---|---|
| `SSH_HOST` | `13.232.159.121` |
| `SSH_USER` | `appuser` |
| `SSH_KNOWN_HOSTS` | the `ssh-keyscan` output from step 4.5 |
| `NEXT_PUBLIC_APP_URL` | `https://doctor.shafa.care` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | your Turnstile **site** key |

> ⚠️ **`NEXT_PUBLIC_*` are baked into the JS bundle at BUILD time.** They must be set
> here (not only in the runtime env file), or the browser ships with empty/wrong
> values — e.g. a broken Turnstile widget on the register/login forms.

### 5.3 What the workflow does  *(`.github/workflows/deploy.yml`, already in the repo)*
On every push to `main` (or *Run workflow* manually) it:
1. Builds on `ubuntu-24.04-arm` so the native `@img/sharp-linux-arm64` binary matches
   the Graviton box (CLAUDE.md #22).
2. `npm ci` → `npm run build` → `npm prune --omit=dev`. The build uses **dummy**
   `AUTH_SECRET`/`MONGO_URI` placeholders purely to satisfy env validation — **no
   database is contacted at build** (the sitemap and homepage render at runtime).
3. Tars `.next`, `public`, `node_modules`, configs → `release.tar.gz`.
4. Loads `SSH_DEPLOY_KEY` + the pinned `SSH_KNOWN_HOSTS`, `scp`s the artifact, and runs
   `release.sh` over SSH. `release.sh` health-gates and auto-rolls-back on failure, so
   a bad build can't take the site down.

---

# Part 6 — First deploy & verify

1. Commit/push to `main` (or GitHub → **Actions → Deploy → Run workflow**).
2. Watch the run in the **Actions** tab. The final step prints `release.sh` output.
3. Verify:
```bash
curl -s https://doctor.shafa.care/api/health      # {"status":"ok"}
ssh appuser@13.232.159.121 'pm2 status'           # doctor-id = online
```
4. Open `https://doctor.shafa.care` in a browser — valid padlock, site loads.

> **First-deploy note:** there's no previous release to roll back to yet, so if the
> health check fails the job fails and the site isn't live. SSH in and read
> `pm2 logs doctor-id` — usually a missing/incorrect value in
> `.env.production.local`, or an Atlas/SSL-Wireless allowlist you skipped in Part 3.

---

# Part 7 — Day-2 operations

**Deploy:** push to `main`. That's it.

**Rollback** to the previous release (instant symlink swap + reload):
```bash
ssh appuser@13.232.159.121 '/srv/doctor-id/bin/release.sh rollback'
```

**App logs / status** (as `appuser`, no sudo needed):
```bash
ssh appuser@13.232.159.121 'pm2 status'
ssh appuser@13.232.159.121 'pm2 logs doctor-id --lines 100'
```

**nginx / system** (needs sudo → use the `ubuntu` admin login):
```bash
ssh ubuntu@13.232.159.121 'sudo nginx -t && sudo systemctl reload nginx'
ssh ubuntu@13.232.159.121 'sudo certbot renew --dry-run'    # verify auto-renew
```

**Update a secret:** edit `/srv/doctor-id/shared/.env.production.local` (as root,
keep `chmod 600`), then `ssh appuser@... 'pm2 reload doctor-id --update-env'`.

**Disaster recovery:** the box is **stateless** (uploads → S3, DB → Atlas, secrets in
the env file). To rebuild: launch a new instance, re-run Parts 1 & 4, re-place
secrets, re-point the Elastic IP, push to `main`. Take an **AMI snapshot** after a
clean bootstrap so rebuilds are one click. Set a **CloudWatch alarm on
`CPUCreditBalance`** — t4g is burstable, and exhausting credits throttles the box.

---

# Part 8 — Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| CI step "Ship + deploy" hangs/`Host key verification failed` | `SSH_KNOWN_HOSTS` missing/stale | redo 4.5 → update the variable |
| CI `Permission denied (publickey)` | deploy key not on the box, or wrong `SSH_USER` | confirm `appuser` `authorized_keys` has the key; re-run bootstrap with `DEPLOY_PUBKEY` |
| `release.sh` fails health check (first deploy) | bad `.env.production.local` or skipped allowlist | `pm2 logs doctor-id`; fix env / Atlas / SSL-Wireless |
| `/api/health` → 503 | Mongo unreachable | add the Elastic IP to Atlas Network Access (Part 3) |
| OTP/SMS never arrives | SSL Wireless IP not whitelisted | whitelist `13.232.159.121` in the SSL portal |
| Turnstile widget blank / login blocked | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` not set **at build** | set the GitHub *variable* (5.2) and re-run the workflow |
| Browser cert warning on `www.` | cert is apex-only | add `www` to DNS + cert (Part 2) or just use the apex |
| Photo upload returns 413 | reverse proxy body cap | already handled (`client_max_body_size 12m`); check you didn't edit it out |
| `certbot` fails in bootstrap | DNS not propagated / port 80 closed | confirm `dig` (Part 2) + SG allows 80, then re-run bootstrap |

---

# Appendix A — Removing the open SSH port (optional hardening)

The default posture (22 open, key-only, no root/passwords, fail2ban, pinned host key,
`restrict`-ed deploy key, sudo-less `appuser`) is a standard secure setup. To take the
port off the public internet entirely, pick one:
- **Restrict 22 to GitHub's Actions IP ranges** (`api.github.com/meta`) + your admin
  IP — secure but high-maintenance (the list is large and changes often).
- **Tailscale / WireGuard**: put the box and a CI step on a private tailnet and SSH
  over it — 22 never faces the internet. Costs one dependency (a tailnet auth key).
- **Self-hosted runner inside the VPC**: deploy over the private IP; 22 stays
  SG-internal only.

# Appendix B — Later optimizations (deferred, see CLAUDE.md #22)
- **CloudFront** in front of `/_next/image` + the public bucket (durable fix for AVIF
  optimizer CPU cost). If you front the whole site, set `TRUSTED_PROXY_HOPS=2` and add
  `set_real_ip_from` for the CDN ranges in nginx.
- Scale to **2 PM2 instances** behind an nginx `upstream` when traffic warrants (uses
  both vCPUs + enables truly zero-downtime reloads).

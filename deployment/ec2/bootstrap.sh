#!/usr/bin/env bash
#
# bootstrap.sh — one-time, idempotent setup for the doctor.shafa.care box.
# Target: Ubuntu 24.04 LTS on arm64 (AWS Graviton, t4g.medium).
#
# Run ONCE on a fresh instance as a sudo-capable user (e.g. ubuntu), from inside
# this directory so it can find its sibling files (nginx/*.conf, release.sh):
#
#   sudo LETSENCRYPT_EMAIL=you@example.com bash bootstrap.sh
#
# What it does: app user + dir layout, Node 22, PM2 (+ logrotate, +startup),
# nginx (hardened reverse proxy + TLS via Let's Encrypt), ufw, fail2ban, SSH
# hardening (key-only) + the CI deploy key, swap, unattended-upgrades, chrony,
# and an optional SSM agent. It installs NO application code and NO secrets —
# code arrives via the CI release pipeline (SSH), secrets via the
# .env.production.local you place by hand (see the final printout).
#
# Re-running is safe: every step is guarded.

set -euo pipefail

DOMAIN="daktar.link"
DOMAIN_WWW="www.daktar.link"
APP_USER="appuser"
APP_BASE="/srv/doctor-id"
NODE_MAJOR="22"
SWAP_GB="2"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-tanbir@shafa.care}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { echo "[bootstrap] $*"; }
[ "$(id -u)" = "0" ] || { echo "Run with sudo: sudo bash bootstrap.sh" >&2; exit 1; }

# --- 1. System packages ----------------------------------------------------
log "Updating apt and installing base packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y nginx curl git ufw snapd chrony unattended-upgrades ca-certificates fail2ban

# --- 2. Node.js (NodeSource) ------------------------------------------------
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt "${NODE_MAJOR}" ]; then
  log "Installing Node.js ${NODE_MAJOR}.x..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
else
  log "Node.js $(node -v) already present, skipping."
fi

# --- 3. PM2 (process manager) -----------------------------------------------
# (Log rotation is configured under the app user's PM2 daemon in step 14, not
# root's — otherwise it'd watch the wrong daemon's logs.)
if ! command -v pm2 >/dev/null 2>&1; then
  log "Installing PM2 globally..."
  npm install -g pm2
fi

# --- 4. Unprivileged app user ----------------------------------------------
if ! id "${APP_USER}" >/dev/null 2>&1; then
  log "Creating app user '${APP_USER}' (no sudo, no password login)..."
  useradd -m -s /bin/bash "${APP_USER}"
  passwd -l "${APP_USER}"          # lock password — key/SSM access only
fi

# --- 5. Directory layout ----------------------------------------------------
log "Creating ${APP_BASE} layout..."
mkdir -p "${APP_BASE}/releases" "${APP_BASE}/shared" "${APP_BASE}/bin"
install -m 0755 -o "${APP_USER}" -g "${APP_USER}" "${SCRIPT_DIR}/release.sh" "${APP_BASE}/bin/release.sh"
chown -R "${APP_USER}:${APP_USER}" "${APP_BASE}"
# Pre-create the secrets file with locked-down perms so the slot is ready.
if [ ! -e "${APP_BASE}/shared/.env.production.local" ]; then
  install -m 0600 -o "${APP_USER}" -g "${APP_USER}" /dev/null "${APP_BASE}/shared/.env.production.local"
  log "Created empty ${APP_BASE}/shared/.env.production.local (0600) — fill it before first deploy."
fi

# --- 6. Swap (OOM safety net for the 4 GB box; not for routine use) ---------
if ! swapon --show | grep -q '/swapfile'; then
  log "Creating ${SWAP_GB}G swapfile..."
  fallocate -l "${SWAP_GB}G" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=$((SWAP_GB * 1024))
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10 >/dev/null
  grep -q 'vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
fi

# --- 7. Automatic security updates + clock sync -----------------------------
log "Enabling unattended-upgrades and chrony..."
dpkg-reconfigure -f noninteractive unattended-upgrades || true
systemctl enable --now chrony >/dev/null 2>&1 || systemctl enable --now chronyd >/dev/null 2>&1 || true

# --- 8. SSM agent (OPTIONAL break-glass admin — only works if the instance role
#        includes AmazonSSMManagedInstanceCore; harmless otherwise) ------------
# Deploy + normal admin are over SSH; this just leaves a no-SSH recovery path
# available should you choose to grant the role. Preinstalled on Ubuntu AWS images.
if snap list 2>/dev/null | grep -q amazon-ssm-agent; then
  snap start amazon-ssm-agent >/dev/null 2>&1 || true
fi

# --- 9. Firewall (defense in depth; the EC2 Security Group is primary) ------
log "Configuring ufw (allow 80/443 + OpenSSH; default deny incoming)..."
ufw allow OpenSSH        >/dev/null || true   # 22 — needed for the SSH deploy + admin
ufw allow 'Nginx Full'   >/dev/null || true   # 80 + 443
ufw --force enable        >/dev/null || true

# --- 9.5 SSH hardening + CI deploy key --------------------------------------
# Key-only, no root, no passwords. (EC2 cloud images already disable password
# auth; this enforces it.) Ensure you keep the instance's launch keypair / a
# sudo-capable admin key before this runs, or you can lock yourself out.
log "Hardening sshd (key-only, no root login, no passwords)..."
cat > /etc/ssh/sshd_config.d/10-doctor-id-hardening.conf <<'SSHD'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
SSHD
systemctl restart ssh 2>/dev/null || systemctl restart sshd 2>/dev/null || true

# fail2ban throttles SSH brute-force (its default sshd jail is enabled on Ubuntu).
systemctl enable --now fail2ban >/dev/null 2>&1 || true

# Install the CI deploy PUBLIC key into appuser's authorized_keys, locked down
# with `restrict` (no PTY/port/agent forwarding — it only scp's the artifact and
# runs release.sh). Pass it in:  DEPLOY_PUBKEY="$(cat deploy_key.pub)"
if [ -n "${DEPLOY_PUBKEY:-}" ]; then
  install -d -m 700 -o "${APP_USER}" -g "${APP_USER}" "/home/${APP_USER}/.ssh"
  touch "/home/${APP_USER}/.ssh/authorized_keys"
  if ! grep -qF "${DEPLOY_PUBKEY}" "/home/${APP_USER}/.ssh/authorized_keys"; then
    echo "restrict ${DEPLOY_PUBKEY}" >> "/home/${APP_USER}/.ssh/authorized_keys"
  fi
  chown -R "${APP_USER}:${APP_USER}" "/home/${APP_USER}/.ssh"
  chmod 600 "/home/${APP_USER}/.ssh/authorized_keys"
  log "Installed CI deploy key for ${APP_USER} (restricted)."
else
  log "DEPLOY_PUBKEY not set — add the CI public key to /home/${APP_USER}/.ssh/authorized_keys before deploying."
fi

# --- 10. Certbot (Let's Encrypt) -------------------------------------------
if ! command -v certbot >/dev/null 2>&1; then
  log "Installing certbot (snap)..."
  snap install --classic certbot
  ln -sf /snap/bin/certbot /usr/bin/certbot
fi

# --- 11. nginx: temporary HTTP-only vhost as the ACME attach point ----------
# Needed ONLY before the first issuance: `certbot --nginx` needs a running :80
# server block for the domain to attach the challenge to, but the hardened vhost
# can't load yet (it references cert files that don't exist). Skipped once the
# cert exists, so re-runs never flip the live site to this placeholder.
rm -f /etc/nginx/sites-enabled/default
if [ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
  cat > /etc/nginx/sites-available/doctor-shafa-care-bootstrap <<NGINX
server {
    listen 80;
    server_name ${DOMAIN};
    location / { return 200 'bootstrap'; add_header Content-Type text/plain; }
}
NGINX
  ln -sfn /etc/nginx/sites-available/doctor-shafa-care-bootstrap /etc/nginx/sites-enabled/doctor-shafa-care
  nginx -t && systemctl reload nginx
fi

# --- 12. Obtain the certificate (skip if already present) -------------------
# nginx authenticator: certbot temporarily tweaks the live nginx config to answer
# the HTTP-01 challenge (using the :80 vhost from step 11), then reverts.
# `certonly` = obtain only — do NOT let certbot rewrite our hand-tuned vhost.
# --deploy-hook reloads nginx after every future auto-renewal so the new cert is
# actually served (certbot's snap installs the renewal timer automatically).
if [ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
  log "Requesting Let's Encrypt cert for ${DOMAIN} and ${DOMAIN_WWW} (DNS must already point here)..."
  certbot certonly --nginx -d "${DOMAIN}" -d "${DOMAIN_WWW}"\
    --email "${LETSENCRYPT_EMAIL}" --agree-tos --non-interactive \
    --deploy-hook "systemctl reload nginx"
else
  log "Certificate for ${DOMAIN} already exists, skipping issuance."
fi

# --- 13. Install the hardened vhost + rate-limit zones ----------------------
log "Installing hardened nginx config..."
install -m 0644 "${SCRIPT_DIR}/nginx/limit_req.conf" /etc/nginx/conf.d/doctor-id-limits.conf
install -m 0644 "${SCRIPT_DIR}/nginx/doctor-shafa-care.conf" /etc/nginx/sites-available/doctor-shafa-care
ln -sfn /etc/nginx/sites-available/doctor-shafa-care /etc/nginx/sites-enabled/doctor-shafa-care
rm -f /etc/nginx/sites-available/doctor-shafa-care-bootstrap
nginx -t && systemctl reload nginx

# --- 14. PM2 boot persistence for the app user ------------------------------
log "Configuring PM2 startup for ${APP_USER}..."
env PATH="$PATH:/usr/bin" pm2 startup systemd -u "${APP_USER}" --hp "/home/${APP_USER}" >/dev/null 2>&1 || \
  pm2 startup systemd -u "${APP_USER}" --hp "/home/${APP_USER}" || true

# Bound the app user's PM2 logs (10 MB/file, keep 14). Spins up the (empty)
# appuser PM2 daemon; the real app process starts on first deploy.
runuser -l "${APP_USER}" -c 'pm2 install pm2-logrotate >/dev/null 2>&1 && pm2 set pm2-logrotate:max_size 10M && pm2 set pm2-logrotate:retain 14' || true

cat <<DONE

[bootstrap] ✅ Base setup complete for ${DOMAIN}.

Remaining manual steps before the first deploy:
  1. Place secrets:  copy your .env.production.local to
       ${APP_BASE}/shared/.env.production.local   (chmod 600, owned by ${APP_USER})
  2. Confirm DNS:    ${DOMAIN}  ->  this instance's Elastic IP
  3. Allowlist this Elastic IP in:  MongoDB Atlas (Network Access) and the
     SSL Wireless SMS portal (or every OTP send returns FAILED).
  4. CI over SSH:    open port 22 in the Security Group; make sure the deploy key
     was installed (DEPLOY_PUBKEY above); pin the host key for CI with
       ssh-keyscan ${DOMAIN}    ->  GitHub Actions variable SSH_KNOWN_HOSTS
  5. Trigger the CI pipeline (push to main) — release.sh takes it from here.

Certbot auto-renews via its systemd timer (nginx authenticator + reload hook).
DONE

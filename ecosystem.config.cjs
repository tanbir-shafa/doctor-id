/**
 * PM2 process definition for running doctor.id.bd on an EC2 instance behind nginx.
 *
 *   pm2 start ecosystem.config.cjs     # boot the app
 *   pm2 save                           # persist the process list (after `pm2 startup`)
 *   pm2 reload doctor-id               # zero-downtime reload after a deploy
 *   pm2 logs doctor-id                 # tail logs
 *
 * Why `next start -H 127.0.0.1`:
 *   The app MUST bind to localhost only, never 0.0.0.0. nginx terminates TLS and
 *   forwards the real client IP via `X-Real-IP`; if the Node port were reachable
 *   directly, a client could bypass nginx and forge that header, defeating the
 *   per-IP rate limits (see doc/getting-started.md §11.5 and CLAUDE.md #21).
 *   `next start` IGNORES a `HOSTNAME` env var — the bind host is only settable via
 *   the `-H` flag — so it is hard-coded here. (The standalone server.js used by
 *   the Docker image is different: it reads HOSTNAME from the environment.)
 *
 * Secrets (MONGO_URI, AUTH_SECRET, UPSTASH_*, SSL_SMS_*, AWS_*, …) are NOT listed
 * here — this file is committed. `next start` auto-loads `.env.production.local`
 * (gitignored via `.env.*.local`) at boot, so put production secrets there. Only
 * non-secret runtime vars live in `env` below.
 */
module.exports = {
  apps: [
    {
      name: "doctor-id",
      // Invoke Next's binary directly so we can pass `-H`/`-p` cleanly (running
      // `npm start` through PM2 would need an awkward double `--` to forward args).
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3000",
      cwd: __dirname,
      // Single fork process. 1 vCPU comfortably serves the SSR/profile workload.
      // To use more cores either raise this with exec_mode "cluster" (validate
      // Next compatibility first) or run several fork-mode apps on different
      // ports behind an nginx upstream.
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      // Safety net against a leak; sharp + AVIF encoding are memory-hungry, so
      // give it room. Pick an instance with >= 2 GB RAM.
      max_memory_restart: "1G",
      time: true,
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        NEXT_TELEMETRY_DISABLED: "1",
        // Trusted reverse-proxy hops in front of the app (nginx = 1). Bump if you
        // later add Cloudflare / an LB ahead of nginx. (Also settable in
        // .env.production.local — this is just a sensible default.)
        TRUSTED_PROXY_HOPS: "1",
      },
    },
  ],
};

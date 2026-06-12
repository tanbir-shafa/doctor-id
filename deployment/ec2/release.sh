#!/usr/bin/env bash
#
# release.sh — atomic release on the box (brief restart blip on each deploy).
# Installed at /srv/doctor-id/bin/release.sh by bootstrap.sh. Runs as the
# unprivileged app user (it drives that user's PM2 daemon) — CI invokes it over
# SSH: `ssh appuser@host '/srv/doctor-id/bin/release.sh <tag> <tarball>'`.
#
#   release.sh <release-tag> <path-to-release.tar.gz>   # deploy a new build
#   release.sh rollback                                  # revert to previous release
#
# The tarball is produced by CI and scp'd to the box before this runs — this
# script just consumes a local tarball, keeping the transport decoupled.
#
# Layout it maintains:
#   /srv/doctor-id/releases/<tag>/      extracted build (+ symlinked env)
#   /srv/doctor-id/shared/.env.production.local   secrets (0600, you place once)
#   /srv/doctor-id/current -> releases/<tag>      the live symlink

set -euo pipefail

APP_NAME="doctor-id"
APP_BASE="/srv/doctor-id"
RELEASES_DIR="${APP_BASE}/releases"
SHARED_ENV="${APP_BASE}/shared/.env.production.local"
CURRENT_LINK="${APP_BASE}/current"
KEEP_RELEASES=3
HEALTH_URL="http://127.0.0.1:3000/api/health"
HEALTH_RETRIES=20          # ~40s total (20 × 2s) for the app to come up
HEALTH_INTERVAL=2

log() { echo "[release] $*"; }
die() { echo "[release][ERROR] $*" >&2; exit 1; }

[ "$(id -un)" = "appuser" ] || log "WARNING: expected to run as 'appuser', running as '$(id -un)'."

# --- reload + health-gate; rolls the symlink back to $1 on failure ----------
reload_and_verify() {
  local rollback_target="${1:-}"

  log "Restarting PM2 (${APP_NAME})..."
  cd "${CURRENT_LINK}"
  # Delete + start (NOT reload/startOrReload). `pm2 reload` reuses the process's
  # STORED cwd + script path, so it would keep running the first release this
  # daemon ever started: the ecosystem's `cwd: __dirname` resolves THROUGH the
  # symlink to a per-release real path, which PM2 then pins forever. --update-env
  # only refreshes env vars, never cwd/script. Deleting clears that pinned env;
  # `start` re-reads the ecosystem and picks up the freshly-flipped symlink.
  # Trade-off: a brief restart blip instead of a graceful reload.
  pm2 delete "${APP_NAME}" 2>/dev/null || true
  pm2 start ecosystem.config.cjs --update-env

  log "Health-checking ${HEALTH_URL} ..."
  local i
  for ((i = 1; i <= HEALTH_RETRIES; i++)); do
    if curl -fsS --max-time 4 "${HEALTH_URL}" | grep -q '"status":"ok"'; then
      log "Healthy after ${i} attempt(s)."
      pm2 save --force >/dev/null
      return 0
    fi
    sleep "${HEALTH_INTERVAL}"
  done

  # Failed to come up healthy.
  if [ -n "${rollback_target}" ] && [ -e "${rollback_target}" ]; then
    log "Health check FAILED — rolling back to ${rollback_target}."
    ln -sfn "${rollback_target}" "${CURRENT_LINK}"
    cd "${CURRENT_LINK}"
    pm2 delete "${APP_NAME}" 2>/dev/null || true
    pm2 start ecosystem.config.cjs --update-env
    pm2 save --force >/dev/null
  fi
  die "Deploy failed health check at ${HEALTH_URL}."
}

# --- rollback subcommand ----------------------------------------------------
if [ "${1:-}" = "rollback" ]; then
  current_target="$(readlink -f "${CURRENT_LINK}" || true)"
  # Newest release that isn't the current one.
  prev="$(ls -1dt "${RELEASES_DIR}"/*/ 2>/dev/null | grep -v "^${current_target}/\?$" | head -n1 || true)"
  [ -n "${prev}" ] || die "No previous release to roll back to."
  prev="${prev%/}"
  log "Rolling back: ${current_target} -> ${prev}"
  ln -sfn "${prev}" "${CURRENT_LINK}"
  reload_and_verify "${current_target}"
  exit 0
fi

# --- deploy subcommand ------------------------------------------------------
TAG="${1:-}"
TARBALL="${2:-}"
[ -n "${TAG}" ]     || die "Usage: release.sh <tag> <tarball> | release.sh rollback"
[ -f "${TARBALL}" ] || die "Artifact not found: ${TARBALL}"
[ -f "${SHARED_ENV}" ] || die "Missing secrets file ${SHARED_ENV} (place it once, chmod 600)."

PREVIOUS_TARGET="$(readlink -f "${CURRENT_LINK}" 2>/dev/null || true)"
RELEASE_DIR="${RELEASES_DIR}/${TAG}"

log "Unpacking ${TARBALL} -> ${RELEASE_DIR}"
rm -rf "${RELEASE_DIR}"
mkdir -p "${RELEASE_DIR}"
tar -xzf "${TARBALL}" -C "${RELEASE_DIR}"

# Link secrets into the release root so `next start` auto-loads them from cwd.
ln -sfn "${SHARED_ENV}" "${RELEASE_DIR}/.env.production.local"

# Flip the live symlink, then reload + verify (auto-rollback on failure).
log "Pointing ${CURRENT_LINK} -> ${RELEASE_DIR}"
ln -sfn "${RELEASE_DIR}" "${CURRENT_LINK}"
reload_and_verify "${PREVIOUS_TARGET}"

# Prune old releases (keep newest $KEEP_RELEASES), never deleting the live one.
log "Pruning old releases (keeping ${KEEP_RELEASES})..."
live="$(readlink -f "${CURRENT_LINK}")"
ls -1dt "${RELEASES_DIR}"/*/ 2>/dev/null | tail -n "+$((KEEP_RELEASES + 1))" | while read -r old; do
  old="${old%/}"
  [ "${old}" = "${live}" ] && continue
  log "  removing ${old}"
  rm -rf "${old}"
done

rm -f "${TARBALL}" || true   # best-effort cleanup; never fail the deploy on it
log "Release ${TAG} live and healthy."

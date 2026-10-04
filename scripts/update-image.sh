#!/usr/bin/env bash
# Update a running Mood Reader to the newest published image, but only when
# its cosign signature checks out. Made to run from cron.
#
#   1. Ask the registry for the digest behind the tag (no pull).
#   2. Same digest as the local image: nothing to do.
#   3. Verify the signature on that exact digest (keyless, this repo's
#      publish workflow). Fail: stop, change nothing.
#   4. Pull by digest and point the local tag at it, so compose runs exactly
#      the image that was verified, even if the tag moves meanwhile.
#   5. Recreate the api and worker services, wait for the API to answer.
#   6. Test and reload nginx: the new api container can have a new IP.
#
# cosign: uses a local `cosign` if there is one, else runs the official
# cosign image, so nothing needs installing on the server.
#
# Usage:
#   scripts/update-image.sh            check, verify, update
#   scripts/update-image.sh --check    only say whether an update exists
#
# Settings (environment variables, defaults in brackets):
#   COMPOSE_DIR      folder with the compose file          [current folder]
#   COMPOSE_FILE     compose file, relative to COMPOSE_DIR  [docker-compose.yml]
#   IMAGE            image and tag the compose file uses    [ghcr.io/bocan/mood-rss-reader:main]
#   SERVICES         compose services to recreate           [api worker]
#   API_SERVICE      the service that serves the API        [api]
#   NGINX_CONTAINER  nginx container to reload; empty: skip [nginx]
#   CERT_IDENTITY    expected signer                        [this repo's docker-publish.yml on main]
#   READY_TIMEOUT    seconds to wait for the API            [90]
#   PRUNE            1: remove dangling images after        [1]
#
# Cron, every 30 minutes, with a log:
#   */30 * * * * COMPOSE_DIR=/srv/mood /srv/mood/update-image.sh >> /var/log/mood-update.log 2>&1
#
# Exit codes: 0 up to date or updated, 1 failure (nothing changed if it
# failed before step 5), 2 update available (--check only).

set -euo pipefail

COMPOSE_DIR=${COMPOSE_DIR:-$PWD}
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.yml}
IMAGE=${IMAGE:-ghcr.io/bocan/mood-rss-reader:main}
SERVICES=${SERVICES:-api worker}
API_SERVICE=${API_SERVICE:-api}
NGINX_CONTAINER=${NGINX_CONTAINER-nginx}
CERT_IDENTITY=${CERT_IDENTITY:-https://github.com/bocan/mood-rss-reader/.github/workflows/docker-publish.yml@refs/heads/main}
CERT_ISSUER=https://token.actions.githubusercontent.com
COSIGN_IMAGE=${COSIGN_IMAGE:-ghcr.io/sigstore/cosign/cosign:v3.1.3}
READY_TIMEOUT=${READY_TIMEOUT:-90}
PRUNE=${PRUNE:-1}

CHECK_ONLY=0
case "${1:-}" in
  --check) CHECK_ONLY=1 ;;
  '') ;;
  *) echo "usage: $0 [--check]" >&2; exit 1 ;;
esac

REPO=${IMAGE%:*} # the image without its tag

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*"; exit 1; }

compose() { docker compose --project-directory "$COMPOSE_DIR" -f "$COMPOSE_DIR/$COMPOSE_FILE" "$@"; }

# One run at a time: a slow pull must not overlap the next cron run.
exec 9>"${TMPDIR:-/tmp}/mood-update.lock"
flock -n 9 || { log "another update is running; skipping"; exit 0; }

# 1. The digest the registry has for the tag now (the image index digest).
remote=$(docker buildx imagetools inspect "$IMAGE" --format '{{ .Manifest.Digest }}' 2>/dev/null) ||
  die "could not read $IMAGE from the registry"
[[ $remote == sha256:* ]] || die "unexpected digest from the registry: $remote"

# 2. The digest of the local image under the same tag. With the classic image
# store it is in RepoDigests; with the containerd store it is the image ID.
local_digests=$(docker image inspect "$IMAGE" \
  --format '{{ .Id }}{{ range .RepoDigests }} {{ . }}{{ end }}' 2>/dev/null || true)
if [[ " $local_digests " == *"$remote"* ]]; then
  log "up to date ($remote)"
  exit 0
fi
log "update available: $remote"
if (( CHECK_ONLY )); then exit 2; fi

# 3. Verify the signature on that digest, before anything changes.
cosign_verify() {
  if command -v cosign >/dev/null 2>&1; then
    cosign verify "$@"
  else
    docker run --rm "$COSIGN_IMAGE" verify "$@"
  fi
}
if ! cosign_verify "$REPO@$remote" \
  --certificate-identity "$CERT_IDENTITY" \
  --certificate-oidc-issuer "$CERT_ISSUER" >/dev/null; then
  die "signature check FAILED for $REPO@$remote; nothing changed"
fi
log "signature verified for $REPO@$remote"

# 4. Pull exactly the verified digest, and give it the tag compose uses.
docker pull --quiet "$REPO@$remote" >/dev/null || die "pull of $REPO@$remote failed; nothing changed"
docker tag "$REPO@$remote" "$IMAGE"

# 5. Recreate the services on the new image. --pull never: never fetch the
# tag again, which could be a newer, unverified image by now.
# shellcheck disable=SC2086 # SERVICES is a list of names
compose up -d --pull never --no-deps $SERVICES || die "compose up failed"
log "recreated: $SERVICES"

# The API runs its migrations first, then listens. Wait until it answers a
# request that also reads the database.
api_container=$(compose ps -q "$API_SERVICE")
[[ -n $api_container ]] || die "no container for service $API_SERVICE"
ready=0
for ((i = 0; i < READY_TIMEOUT; i += 3)); do
  if docker exec "$api_container" node -e \
    "fetch('http://127.0.0.1:3000/api/auth/registration-mode').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" \
    >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 3
done
(( ready )) || die "the API did not answer within ${READY_TIMEOUT}s; see: docker logs $api_container"
log "API is up"

# 6. nginx resolves the api name only when it starts or reloads.
if [[ -n $NGINX_CONTAINER ]]; then
  docker exec "$NGINX_CONTAINER" nginx -t >/dev/null 2>&1 ||
    die "nginx -t failed in $NGINX_CONTAINER; not reloading"
  docker exec "$NGINX_CONTAINER" nginx -s reload >/dev/null || die "nginx reload failed"
  log "nginx reloaded"
fi

if [[ $PRUNE == 1 ]]; then
  docker image prune -f >/dev/null || log "warning: image prune failed"
fi

log "updated to $remote"

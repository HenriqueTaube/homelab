#!/bin/sh

set -eu

MEMPOOL_REPO="${MEMPOOL_REPO:-$HOME/projetos/mempool}"
MEMPOOL_TAG="${MEMPOOL_TAG:?set MEMPOOL_TAG, e.g. v3.2.1}"

FRONTEND_IMAGE="${FRONTEND_IMAGE:?set FRONTEND_IMAGE, e.g. 192.168.1.191:3000/henrique/mempool-frontend}"
BACKEND_IMAGE="${BACKEND_IMAGE:?set BACKEND_IMAGE, e.g. 192.168.1.191:3000/henrique/mempool-backend}"
BUILDER_NAME="${BUILDER_NAME:-mempool-multiarch}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"

cd "$MEMPOOL_REPO"
git fetch --tags
git checkout "$MEMPOOL_TAG"

SHORT_SHA=$(git rev-parse --short HEAD)

# Stage the backend build context — same as docker/init.sh, minus GeoIP
# (MAXMIND.ENABLED is false by default and we don't use the node map).
# The Dockerfile still unconditionally COPYs ./GeoIP/ though, so it must exist.
cp -r ./docker/backend/* ./backend/
mkdir -p ./backend/GeoIP/

# Some backend scripts (npm_package.sh, npm_package_rm_build_deps.sh as of
# v3.3.1) ship with a broken shebang ("#/bin/sh", missing the "!") — not a
# valid interpreter directive. Works by accident on native exec via shell
# ENOEXEC fallback, but fails outright under QEMU arm64 emulation. Fix any
# script with this bug, in case a future release adds more.
for f in ./backend/*.sh; do
  sed -i -e '1s|^#/bin/sh|#!/bin/sh|' "$f"
done

# Stage the frontend build context.
cp ./docker/frontend/* ./frontend/
cp ./nginx.conf ./frontend/
cp ./nginx-mempool.conf ./frontend/
sed -i -e "s/127.0.0.1:80/0.0.0.0:__MEMPOOL_FRONTEND_HTTP_PORT__/g" ./frontend/nginx.conf
sed -i -e "s/127.0.0.1/0.0.0.0/g" ./frontend/nginx.conf
sed -i -e "s/user nobody;//g" ./frontend/nginx.conf
sed -i -e "s!/etc/nginx/nginx-mempool.conf!/etc/nginx/conf.d/nginx-mempool.conf!g" ./frontend/nginx.conf
sed -i -e "s/127.0.0.1:8999/__MEMPOOL_BACKEND_MAINNET_HTTP_HOST__:__MEMPOOL_BACKEND_MAINNET_HTTP_PORT__/g" ./frontend/nginx-mempool.conf

# sync-assets.js fetches mining-pool logos/promo video from api.github.com with
# no request timeout — if that call can't complete it hangs the build forever.
# We don't use those assets, so skip them via the script's own SKIP_SYNC escape hatch.
sed -i -e "/^RUN npm run build$/i ENV SKIP_SYNC=1" ./frontend/Dockerfile

if ! docker buildx inspect "$BUILDER_NAME" >/dev/null 2>&1; then
  docker buildx create --name "$BUILDER_NAME" --use
else
  docker buildx use "$BUILDER_NAME"
fi
docker buildx inspect --bootstrap >/dev/null

docker buildx build \
  --platform "$PLATFORMS" \
  --build-arg commitHash="$SHORT_SHA" \
  -t "${FRONTEND_IMAGE}:${MEMPOOL_TAG}" \
  -t "${FRONTEND_IMAGE}:latest" \
  --output type=registry,registry.insecure=true \
  ./frontend/

docker buildx build \
  --platform "$PLATFORMS" \
  --build-context rustgbt=./rust \
  --build-context backend=./backend \
  --build-arg commitHash="$SHORT_SHA" \
  -t "${BACKEND_IMAGE}:${MEMPOOL_TAG}" \
  -t "${BACKEND_IMAGE}:latest" \
  --output type=registry,registry.insecure=true \
  ./backend/

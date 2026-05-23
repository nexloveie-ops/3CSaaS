#!/bin/sh
set -e

# Cloud Run sets PORT (e.g. 8080) for the public listener.
NGINX_PORT="${PORT:-8080}"
API_PORT="${API_INTERNAL_PORT:-3000}"

export PORT="${API_PORT}"
export HOST="${HOST:-0.0.0.0}"
export NODE_ENV="${NODE_ENV:-production}"

node /app/apps/api/dist/main.js &
API_PID=$!

export API_UPSTREAM="http://127.0.0.1:${API_PORT}/api/"
export NGINX_PORT

# Alpine nginx includes servers from http.d, not conf.d (see /etc/nginx/nginx.conf).
rm -f /etc/nginx/http.d/default.conf 2>/dev/null || true
envsubst '${API_UPSTREAM} ${NGINX_PORT}' \
  < /etc/nginx/nginx.combined.conf.template \
  > /etc/nginx/http.d/default.conf

nginx -t

trap 'kill "$API_PID" 2>/dev/null || true' EXIT TERM INT
exec nginx -g 'daemon off;'

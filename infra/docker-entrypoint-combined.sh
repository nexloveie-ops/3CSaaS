#!/bin/sh
set -e

# Cloud Run sets PORT (e.g. 8080) for the service entrypoint.
NGINX_PORT="${PORT:-8080}"
API_PORT="${API_INTERNAL_PORT:-3000}"

export PORT="${API_PORT}"
export HOST="${HOST:-0.0.0.0}"
export NODE_ENV="${NODE_ENV:-production}"

node /app/apps/api/dist/main.js &
API_PID=$!

export API_UPSTREAM="http://127.0.0.1:${API_PORT}/api/"
export NGINX_PORT
envsubst '${API_UPSTREAM} ${NGINX_PORT}' \
  < /etc/nginx/nginx.combined.conf.template \
  > /etc/nginx/conf.d/default.conf

# Wait until API responds (max ~60s)
i=0
while [ "$i" -lt 60 ]; do
  if wget -qO- "http://127.0.0.1:${API_PORT}/api/health" >/dev/null 2>&1; then
    break
  fi
  i=$((i + 1))
  sleep 1
done

trap 'kill "$API_PID" 2>/dev/null || true' EXIT TERM INT
exec nginx -g 'daemon off;'

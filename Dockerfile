# Single Cloud Run service (Web + API). Keep in sync with infra/Dockerfile.combined
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN npm ci

COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/web ./apps/web

RUN npm run build -w @lz3c/shared \
 && npm run build -w @lz3c/db \
 && npm run build -w @lz3c/api \
 && npm run build -w @lz3c/web

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV SERVE_WEB=1
ENV HOST=0.0.0.0
ENV PORT=8080

RUN apk add --no-cache wget \
    chromium nss freetype harfbuzz ca-certificates ttf-freefont

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/package.json ./
COPY --from=builder /app/apps/web/dist ./apps/web/dist

EXPOSE 8080

CMD ["node", "apps/api/dist/main.js"]

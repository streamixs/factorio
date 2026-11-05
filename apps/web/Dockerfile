# syntax=docker/dockerfile:1

FROM node:24-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm@11.28.5

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY libs/shared/package.json libs/shared/

RUN pnpm install --frozen-lockfile --filter @factorio/web...

COPY libs/shared libs/shared
COPY apps/web apps/web

RUN pnpm --filter @factorio/shared build \
    && pnpm --filter @factorio/web build

FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public

USER node

EXPOSE 3000

CMD ["node", "apps/web/server.js"]

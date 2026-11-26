# syntax=docker/dockerfile:1

ARG APP_VERSION=dev

FROM node:26-alpine AS builder

ARG APP_VERSION
ENV NEXT_PUBLIC_APP_VERSION=${APP_VERSION}

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

FROM node:26-alpine AS runner

ARG APP_VERSION=dev

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_PUBLIC_APP_VERSION=${APP_VERSION}

LABEL org.opencontainers.image.title="Factorio Web" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.source="https://github.com/streamixs/factorio"

COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public

USER node

EXPOSE 3000

CMD ["node", "apps/web/server.js"]

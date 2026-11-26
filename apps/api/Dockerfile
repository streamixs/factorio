# syntax=docker/dockerfile:1

ARG APP_VERSION=dev

FROM node:24-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm@11.28.5

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY libs/shared/package.json libs/shared/

RUN pnpm install --frozen-lockfile --filter @factorio/api...

COPY libs/shared libs/shared
COPY apps/api apps/api

RUN pnpm --filter @factorio/shared build \
    && pnpm --filter @factorio/api build \
    && pnpm --filter @factorio/api --prod deploy /prod/api

FROM node:24-alpine AS runner

ARG APP_VERSION=dev

WORKDIR /app

ENV NODE_ENV=production
ENV APP_VERSION=${APP_VERSION}

LABEL org.opencontainers.image.title="Factorio API" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.source="https://github.com/streamixs/factorio"

COPY --from=builder --chown=node:node /prod/api ./

USER node

EXPOSE 3001

CMD ["node", "dist/main.js"]

# syntax=docker/dockerfile:1

ARG APP_VERSION=dev

# Build on the build platform: Turbopack's native binary and some dependency
# install scripts are not reliable under QEMU for the arm64 image, while the
# Next.js server output is architecture-independent. The runner stage stays
# target-specific. This mirrors the agent Dockerfile.
FROM --platform=$BUILDPLATFORM node:26-alpine AS builder

ARG APP_VERSION
ENV NEXT_PUBLIC_APP_VERSION=${APP_VERSION}
ENV NEXT_TELEMETRY_DISABLED=1

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
    && pnpm --filter @factorio/web build \
    && rm -rf apps/web/.next/standalone/node_modules/.pnpm/sharp@* \
              apps/web/.next/standalone/node_modules/.pnpm/@img+sharp-*

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

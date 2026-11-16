# 基础镜像可通过 --build-arg NODE_IMAGE=... 覆盖（国内可指向镜像站）
ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
# npm 源：默认官方源；国内构建可传 --build-arg NPM_REGISTRY=https://registry.npmmirror.com
ARG NPM_REGISTRY=https://registry.npmjs.org
COPY package.json package-lock.json ./
RUN npm config set registry "$NPM_REGISTRY" \
 && npm ci

FROM dependencies AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATA_DIR=/tmp/nestopia-build
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
# Debian 软件源：默认阿里云镜像；海外或需要官方源时传 --build-arg APT_MIRROR=deb.debian.org
ARG APT_MIRROR=mirrors.aliyun.com
RUN if [ "$APT_MIRROR" != "deb.debian.org" ] && [ -f /etc/apt/sources.list.d/debian.sources ]; then \
      sed -i "s|deb.debian.org|$APT_MIRROR|g" /etc/apt/sources.list.d/debian.sources; \
    fi \
 && apt-get update \
 && apt-get install -y --no-install-recommends poppler-utils \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 DATA_DIR=/app/data
WORKDIR /app
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/migrations ./migrations
COPY --from=build --chown=node:node /app/scripts/backup.ts ./scripts/backup.ts
COPY --from=build --chown=node:node /app/package.json /app/next.config.ts ./
RUN rm -rf /app/.next/cache \
 && mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]

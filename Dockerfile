# syntax=docker/dockerfile:1.7

FROM node:22.22.0-bookworm-slim AS toolchain
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.1.1 --activate
WORKDIR /workspace

FROM toolchain AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/api/prisma/schema.prisma apps/api/prisma/schema.prisma
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/fixtures/package.json packages/fixtures/package.json
COPY packages/game-engine/package.json packages/game-engine/package.json
COPY packages/word-tools/package.json packages/word-tools/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY apps/api apps/api
COPY packages/contracts packages/contracts
COPY packages/fixtures packages/fixtures
COPY packages/game-engine packages/game-engine
COPY packages/word-tools packages/word-tools
RUN pnpm --filter @wordle-royale/api db:generate
RUN pnpm --filter @wordle-royale/api build
RUN pnpm --config.inject-workspace-packages=true --filter @wordle-royale/api deploy --prod --ignore-scripts /opt/api \
    && cp -a apps/api/dist /opt/api/dist \
    && set -- /workspace/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client \
    && [ "$#" -eq 1 ] \
    && source_client="$1" \
    && set -- /opt/api/node_modules/.pnpm/@prisma+client@*/node_modules \
    && [ "$#" -eq 1 ] \
    && target_modules="$1" \
    && mkdir -p "$target_modules/.prisma" \
    && cp -a "$source_client" "$target_modules/.prisma/client"

FROM toolchain AS runtime
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app
COPY --from=build --chown=node:node /opt/api/ ./
USER node
EXPOSE 3001
CMD ["node", "dist/apps/api/src/main.js"]

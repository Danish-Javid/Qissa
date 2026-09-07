# ============================================================================
# Qissa — single multi-stage Dockerfile.
#
# Security decisions baked in here:
#   * node:24-alpine — smallest practical attack surface, actively patched.
#   * .dockerignore excludes .env — no secret can ever land in a layer.
#   * The runtime stage runs as the unprivileged built-in "node" user.
#   * Dependencies are installed from package-lock.json (npm ci) so the image
#     is reproducible and supply-chain-pinned.
#   * The Prisma engine binary target for Alpine (musl) is declared in
#     schema.prisma so migrate deploy works inside this image.
# ============================================================================

# ---------- Stage 1: install ALL dependencies (needed for the build) --------
FROM node:24-alpine AS deps
WORKDIR /srv/qissa

# Copy only manifests first — this layer caches until dependencies change.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/video/package.json packages/video/
COPY packages/web/package.json packages/web/
RUN npm ci

# ---------- Stage 2: compile core + server, bundle the web app --------------
FROM node:24-alpine AS build
WORKDIR /srv/qissa

COPY --from=deps /srv/qissa/node_modules ./node_modules
COPY --from=deps /srv/qissa/package.json ./package.json
COPY package.json tsconfig.base.json ./
COPY packages packages

# Generate the Prisma client against the schema, then build in dependency
# order: core (shared pedagogy) -> server (API) -> web (React bundle).
# The prisma binary is invoked by its hoisted path: `npx`/`npm exec` in a
# workspace root can fail to resolve it and silently download a mismatched
# prisma version from the registry — never let a build do that.
RUN ./node_modules/.bin/prisma generate --schema packages/server/prisma/schema.prisma \
 && npm run build -w @qissa/core \
 && npm run build -w @qissa/video \
 && npm run build -w @qissa/server \
 && npm run build -w @qissa/web

# ---------- Stage 3: production dependencies only ----------------------------
FROM node:24-alpine AS prod-deps
WORKDIR /srv/qissa
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/video/package.json packages/video/
COPY packages/web/package.json packages/web/
# The generated Prisma client must exist in THIS node_modules tree — the
# build stage's generation does not survive a fresh install. The schema is
# copied so post-install generation can run; the prisma CLI is a production
# dependency of @qissa/server precisely for this and `migrate deploy`.
COPY packages/server/prisma packages/server/prisma
RUN npm ci --omit=dev \
 && ./node_modules/.bin/prisma generate --schema packages/server/prisma/schema.prisma

# ---------- Stage 4: runtime --------------------------------------------------
FROM node:24-alpine AS runtime
WORKDIR /srv/qissa
ENV NODE_ENV=production

# Runtime copies: production deps, compiled server, compiled core, web bundle,
# Prisma schema + migrations (for `migrate deploy` at container start).
COPY --from=prod-deps /srv/qissa/node_modules ./node_modules
COPY --from=build /srv/qissa/package.json ./package.json
COPY --from=build /srv/qissa/packages/core/dist ./packages/core/dist
COPY --from=build /srv/qissa/packages/core/package.json ./packages/core/package.json
COPY --from=build /srv/qissa/packages/video/dist ./packages/video/dist
COPY --from=build /srv/qissa/packages/video/package.json ./packages/video/package.json
# Remotion's bundler compiles the compositions from TYPESCRIPT SOURCE at render
# time, so unlike every other package here the video sources must ship in the
# image, not just its dist. src/render.ts resolves the entry point relative to
# its own module, so this layout is what it expects.
COPY --from=build /srv/qissa/packages/video/src ./packages/video/src
COPY --from=build /srv/qissa/packages/server/dist ./packages/server/dist
COPY --from=build /srv/qissa/packages/server/package.json ./packages/server/package.json
COPY --from=build /srv/qissa/packages/server/prisma ./packages/server/prisma
COPY --from=build /srv/qissa/packages/web/dist ./packages/web/dist

# Audio clips and generated images live on a volume, never inside the image.
RUN mkdir -p /srv/qissa/data-runtime \
 && chown -R node:node /srv/qissa
USER node

EXPOSE 3000

# Liveness probe hits the unauthenticated health route.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

# Apply pending migrations, then start. `migrate deploy` never prompts and
# never drifts — it applies committed migration files only. The prisma CLI
# ships with the server workspace's production dependencies and is invoked
# by its hoisted path (see build stage comment for why).
#
# First, pin the on-disk caches (audio clips, story illustrations, early
# track art) into the qissa-data volume via symlinks, so they genuinely
# survive container rebuilds as promised in docker-compose.yml.
CMD ["sh", "-c", "mkdir -p data && for d in audio illustrations early-art; do mkdir -p data-runtime/$d && rm -rf data/$d && ln -sfn ../data-runtime/$d data/$d; done && ./node_modules/.bin/prisma migrate deploy --schema packages/server/prisma/schema.prisma && node packages/server/dist/index.js"]

# ---------- Stage 5: runtime WITH video rendering ----------------------------
#
# A second, deliberately separate target. Remotion renders by driving a headless
# Chrome, and Chrome does not run on Alpine — Remotion's own docs list Alpine as
# unsupported "due to unsupported Libc symbols" (musl). Rendering therefore
# needs a glibc base.
#
# The default `runtime` target above stays on alpine, and that is the point:
# this image is larger and has a wider attack surface, so an operator who does
# not want personalized video should not be made to run it. Video is opt-in
# twice over — this image, and VIDEO_ENABLED — because it is also opt-in
# legally: Remotion is free for individuals and companies of up to three
# people and requires a paid company licence beyond that.
#
#   docker build --target runtime-video -t qissa:video .
#
# Production dependencies installed on GLIBC, which this image genuinely needs
# rather than reusing the alpine `prod-deps` tree.
#
# Both Remotion and Prisma ship PLATFORM-SPECIFIC native binaries chosen at
# install time: Remotion's compositor resolves to a musl or a gnu build via
# optional dependencies, and Prisma generates its query engine for whatever
# libc it is generating on. Copying the alpine tree into a Debian image would
# put musl binaries in a glibc container — an image that builds cleanly and
# then fails at the first render and the first query.
FROM node:24-bookworm-slim AS prod-deps-gnu
WORKDIR /srv/qissa
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/video/package.json packages/video/
COPY packages/web/package.json packages/web/
COPY packages/server/prisma packages/server/prisma
RUN npm ci --omit=dev \
 && ./node_modules/.bin/prisma generate --schema packages/server/prisma/schema.prisma

FROM node:24-bookworm-slim AS runtime-video
WORKDIR /srv/qissa
ENV NODE_ENV=production

# Chrome's shared-library dependencies, per Remotion's Linux requirements.
# Remotion downloads and manages its own Chrome Headless Shell and ffmpeg
# binaries, so neither is installed here — only the libraries they link.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates fonts-liberation wget \
      libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
      libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
      libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 libatspi2.0-0 \
 && rm -rf /var/lib/apt/lists/*

COPY --from=prod-deps-gnu /srv/qissa/node_modules ./node_modules
COPY --from=build /srv/qissa/package.json ./package.json
COPY --from=build /srv/qissa/packages/core/dist ./packages/core/dist
COPY --from=build /srv/qissa/packages/core/package.json ./packages/core/package.json
COPY --from=build /srv/qissa/packages/video/dist ./packages/video/dist
COPY --from=build /srv/qissa/packages/video/package.json ./packages/video/package.json
COPY --from=build /srv/qissa/packages/video/src ./packages/video/src
COPY --from=build /srv/qissa/packages/server/dist ./packages/server/dist
COPY --from=build /srv/qissa/packages/server/package.json ./packages/server/package.json
COPY --from=build /srv/qissa/packages/server/prisma ./packages/server/prisma
COPY --from=build /srv/qissa/packages/web/dist ./packages/web/dist

RUN mkdir -p /srv/qissa/data-runtime \
 && chown -R node:node /srv/qissa
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

# Same startup as `runtime`, plus the video caches in the symlink list so
# rendered songs and their narration survive a container rebuild.
CMD ["sh", "-c", "mkdir -p data && for d in audio illustrations early-art videos video-narration video-art; do mkdir -p data-runtime/$d && rm -rf data/$d && ln -sfn ../data-runtime/$d data/$d; done && ./node_modules/.bin/prisma migrate deploy --schema packages/server/prisma/schema.prisma && node packages/server/dist/index.js"]

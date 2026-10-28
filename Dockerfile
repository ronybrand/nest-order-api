# syntax=docker/dockerfile:1

# Build stage - compiles with the Nest CLI (nest build already applies the @nestjs/swagger
# plugin configured in nest-cli.json - see docs/api-docs). Tests are skipped here: CI
# (.github/workflows/ci.yml) already runs lint + unit + e2e (Testcontainers) on every push/PR;
# re-running them (and needing Docker-in-Docker for Testcontainers) inside the image build
# would be redundant and slow.
FROM node:26-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS build
WORKDIR /workspace

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY src/ src/
RUN npm run build

# Runtime stage - production deps only, non-root user, no build toolchain in the shipped image.
FROM node:26-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797
RUN apk upgrade --no-cache
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY package.json package-lock.json ./
# npm, npx and corepack ship with the base image and are not used at runtime (CMD is plain
# node); Trivy reports ten HIGH findings, all in npm's own bundled packages, so they go.
RUN npm ci --omit=dev \
    && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
              /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

COPY --from=build /workspace/dist ./dist
USER app

EXPOSE 3000

# Liveness/readiness: GET /health is public, outside the rate limit, and runs SELECT 1 against the database.
# Node ships fetch, so no curl/wget is needed in the image. This image only runs the API (no worker).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3   CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main"]

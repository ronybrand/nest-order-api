# syntax=docker/dockerfile:1

# Build stage - compiles with the Nest CLI (nest build already applies the @nestjs/swagger
# plugin configured in nest-cli.json - see docs/api-docs). Tests are skipped here: CI
# (.github/workflows/ci.yml) already runs lint + unit + e2e (Testcontainers) on every push/PR;
# re-running them (and needing Docker-in-Docker for Testcontainers) inside the image build
# would be redundant and slow.
FROM node:22-alpine AS build
WORKDIR /workspace

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY src/ src/
RUN npm run build

# Runtime stage - production deps only, non-root user, no build toolchain in the shipped image.
FROM node:22-alpine
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /workspace/dist ./dist
USER app

EXPOSE 3000
CMD ["node", "dist/main"]

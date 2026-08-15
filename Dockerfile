# Pinned Node build image — version + digest for reproducible Foundation builds.
# Digest fetched from Docker Hub for node:22.18.0-bookworm-slim.
FROM node:22.18.0-bookworm-slim@sha256:752ea8a2f758c34002a0461bd9f1cee4f9a3c36d48494586f60ffce1fc708e0e

WORKDIR /app

# Dependency layer first for cache reuse.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Validate and produce the static distribution only.
RUN npm run check && npm run build

# No CMD/ENTRYPOINT — this image is a build adapter, not a server.

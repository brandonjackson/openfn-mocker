# syntax=docker/dockerfile:1

# ---- Builder ----
FROM node:20-slim AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install
COPY . .
RUN pnpm build

# ---- Runtime ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/mock.config.yaml ./mock.config.yaml
# No adaptor API specs are needed at runtime: responses are built from the
# hand-written seeds compiled into dist/. Spec fidelity is a dev-time concern.
# Seed datasets. The image ships the committed `default` (served from the
# built-in seeds); a custom dataset can be baked in by committing/copying it too.
COPY --from=builder /app/datasets ./datasets
# One shared port; every system is mounted at /<name> beneath it. Railway/PaaS
# platforms inject $PORT, which the server honors over the config default (4000).
EXPOSE 4000
CMD ["node", "dist/index.js"]

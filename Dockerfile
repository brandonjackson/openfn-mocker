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
# The server reads spec JSON from specs/ at runtime.
COPY --from=builder /app/specs ./specs
EXPOSE 4000-4020
CMD ["node", "dist/index.js"]

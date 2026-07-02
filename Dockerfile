# Multi-stage Dockerfile for all Speclyn services
# Targets: api, web, worker

# ── Build args for Next.js (needed at build time) ────────────────────────
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=""
ARG NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
ARG NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
ARG NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/projects
ARG NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/projects

# ── Stage 1: Full install ────────────────────────────────────────────────
FROM node:22-slim AS base
RUN apt-get update && apt-get install -y curl git && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN npm install -g tsx

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_CLERK_SIGN_IN_URL
ARG NEXT_PUBLIC_CLERK_SIGN_UP_URL
ARG NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL
ARG NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CLERK_SIGN_IN_URL=$NEXT_PUBLIC_CLERK_SIGN_IN_URL
ENV NEXT_PUBLIC_CLERK_SIGN_UP_URL=$NEXT_PUBLIC_CLERK_SIGN_UP_URL
ENV NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=$NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL
ENV NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=$NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL

RUN pnpm turbo build || true

# ── Stage 2: API ─────────────────────────────────────────────────────────
FROM base AS api
EXPOSE 3001
CMD ["npx", "tsx", "apps/api/src/server.ts"]

# ── Stage 3: Web (Next.js) ──────────────────────────────────────────────
FROM base AS web
RUN cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static 2>/dev/null || true
RUN mkdir -p apps/web/.next/standalone/apps/web/public && cp -r apps/web/public/* apps/web/.next/standalone/apps/web/public/ 2>/dev/null || true
WORKDIR /app/apps/web/.next/standalone
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]

# ── Stage 4: Workers (generic) ──────────────────────────────────────────
FROM base AS worker
ARG WORKER_PATH
ENV WORKER_ENTRYPOINT=${WORKER_PATH}
CMD ["sh", "-c", "npx tsx ${WORKER_ENTRYPOINT}"]

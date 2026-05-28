# --- Stage 1: deps ----------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# --- Stage 2: build ---------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

# Env vars referenced during `next build` (these must be present at build time
# *only if* they're used in static export paths — most aren't, but we keep the
# placeholders here so the build doesn't crash on a missing required var).
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
# Force NextAuth to skip auth-secret validation during build (real secret comes
# in at runtime via the ECS task definition).
ENV AUTH_SECRET=build-only-placeholder-32-chars-aaaaa
ENV MONGO_URI=mongodb://placeholder/build
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# --- Stage 3: runner --------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Non-root user.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

# Healthcheck — ECS uses this to decide if the task is healthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -q -O- http://127.0.0.1:3000/api/health | grep -q '"status":"ok"' || exit 1

CMD ["node", "server.js"]

FROM node:22-alpine AS deps
WORKDIR /app
COPY workers/market-collector/package.json workers/market-collector/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY workers/reaction-map/index.mjs ./index.mjs
CMD ["node", "index.mjs"]

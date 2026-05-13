# Legacy Railway compatibility shim.
# Some Railway services still point at workers/whale-indexer as their root.
# Build the active momentum-alerts worker from here so those deploys do not fail.
FROM node:22-alpine AS deps
WORKDIR /app
COPY workers/momentum-alerts/package.json workers/momentum-alerts/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY workers/momentum-alerts/index.mjs ./index.mjs
COPY workers/momentum-alerts/chart.mjs ./chart.mjs
CMD ["npm", "start"]

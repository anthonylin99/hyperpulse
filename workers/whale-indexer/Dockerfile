FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./package.json
COPY index.mjs ./index.mjs
COPY supervisor.mjs ./supervisor.mjs
COPY schema.sql ./schema.sql
COPY momentum-alerts ./momentum-alerts
CMD ["npm", "start"]

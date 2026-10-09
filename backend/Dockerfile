# Backend image: NestJS + Prisma. Build context is this folder (backend/).
FROM node:20-bookworm-slim

WORKDIR /app

# Install dependencies first so the layer caches across source changes.
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .

# Compile the app and generate the typed Prisma client.
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
EXPOSE 4001

# Apply pending migrations, then start. `migrate deploy` is safe to run on every
# boot: with no pending migrations it's a no-op.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]

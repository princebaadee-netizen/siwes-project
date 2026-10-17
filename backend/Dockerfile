# Backend image: NestJS + Prisma. Build context is this folder (backend/).
FROM node:20-bookworm-slim

WORKDIR /app

# PDF export uses Puppeteer. Skip its bundled Chrome download (big and missing
# shared libs on slim) and use Debian's chromium instead, with the fonts a
# report cover page needs.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium fonts-liberation ca-certificates \
    && rm -rf /var/lib/apt/lists/*

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

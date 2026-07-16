FROM mcr.microsoft.com/playwright:v1.61.1-jammy

WORKDIR /app

# better-sqlite3 may need to compile native bindings on Node 24
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY . .

RUN mkdir -p /data

ENV NODE_ENV=production
ENV DB_PATH=/data/keepalive.db
ENV PORT=3000

EXPOSE 3000

CMD ["node", "src/index.js"]

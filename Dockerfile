FROM mcr.microsoft.com/playwright:v1.49.1-jammy

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY . .

RUN mkdir -p /data

ENV NODE_ENV=production
ENV DB_PATH=/data/keepalive.db
ENV PORT=3000

EXPOSE 3000

CMD ["node", "src/index.js"]

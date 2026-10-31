# Production image: Node 22 + ffmpeg + yt-dlp + Vite build + Express (server.ts)
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
  && curl -L "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux" -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
# Vite/tailwind/tsx live in devDependencies — keep dev installs for build even if the host sets NODE_ENV=production.
ENV NODE_ENV=development
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
# Render injects PORT at runtime (often 10000). Local default when unset is 43123 in server.ts.
EXPOSE 43123

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||43123)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]

FROM node:24-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@11.19.0
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile \
    && pnpm --filter @content-center/worker build \
    && ffmpeg -version > /dev/null \
    && ffprobe -version > /dev/null
ENV NODE_ENV=production
WORKDIR /app/apps/worker
USER node
CMD ["node", "--import", "tsx", "src/index.ts"]

# VIX · VXN 波动率追踪 — 云部署镜像
# 用法: 把本目录上传到云平台(Railway / Render / Fly.io / 自建 VPS)，或用:
#   docker build -t vix-vxn-app .
#   docker run -d -p 8788:8788 --env-file .env vix-vxn-app
FROM node:20-alpine

WORKDIR /app

# 时区: 确保 "每天 08:30" 定时推送按用户本地时间触发, 而非容器默认的 UTC.
# 否则 "30 8 * * *" 会在 UTC 08:30 (= 北京时间 16:30) 触发.
RUN apk add --no-cache tzdata
ENV TZ=Asia/Hong_Kong

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public
COPY scripts ./scripts

ENV NODE_ENV=production
ENV PORT=8788
EXPOSE 8788

# 启动。云平台会注入 PORT / VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY 等环境变量。
CMD ["node", "server/index.js"]

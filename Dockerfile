# ────────────────────────────────────────────────
# Stage 1: Build
# ────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# ────────────────────────────────────────────────
# Stage 2: Runtime
# ────────────────────────────────────────────────
FROM node:20-alpine

LABEL maintainer="omnibox-to-applecms"
LABEL description="OmniBox 爬虫脚本 → AppleCMS V10 接口转换代理"

WORKDIR /app

# 安装必要工具（tzdata 用于时区，ca-certificates 用于 HTTPS）
RUN apk add --no-cache tzdata ca-certificates && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone

# 非 root 用户运行（安全）
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

COPY --from=build /app/node_modules ./node_modules
COPY src/ ./src/
COPY public/ ./public/
COPY package.json ./

# 数据目录（挂载持久化卷）
RUN mkdir -p /app/data && chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/admin/status || exit 1

CMD ["node", "src/index.js"]

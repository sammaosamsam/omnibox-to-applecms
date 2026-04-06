#!/bin/bash
# Omnibox to AppleCMS - 构建并推送镜像脚本

set -e

cd /root/omnibox-to-applecms

echo "=== 1. 拉取最新代码 ==="
git pull

echo "=== 2. 构建 Docker 镜像 ==="
docker build -t omnibox-to-applecms:latest -f Dockerfile .

echo "=== 3. 标记镜像版本 ==="
docker tag omnibox-to-applecms:latest registry.cn-shanghai.aliyuncs.com/sammao/omnibox-to-applecms:latest

echo "=== 4. 推送镜像 ==="
docker push registry.cn-shanghai.aliyuncs.com/sammao/omnibox-to-applecms:latest

echo "=== 5. 重启服务 ==="
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d

echo "=== 完成 ==="
docker logs -f omnibox-to-applecms --tail 20

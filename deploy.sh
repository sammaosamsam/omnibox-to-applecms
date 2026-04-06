#!/bin/bash
# ────────────────────────────────────────────────
# OmniBox to AppleCMS - 一键部署脚本
# ────────────────────────────────────────────────
# 用法：
#   ./deploy.sh              # 交互式选择
#   ./deploy.sh prod         # 生产环境
#   ./deploy.sh autoupdate   # 带自动更新
#   ./deploy.sh update       # 仅更新镜像
#   ./deploy.sh logs         # 查看日志
#   ./deploy.sh stop         # 停止服务
#   ./deploy.sh restart      # 重启服务
# ────────────────────────────────────────────────

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 项目目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 检查 .env 文件
check_env() {
    if [ ! -f .env ]; then
        log_warn ".env 文件不存在，创建默认配置..."
        cp .env.example .env
        log_warn "请编辑 .env 文件设置 ADMIN_API_KEY！"
        exit 1
    fi
}

# 拉取最新镜像
pull_image() {
    log_info "正在拉取最新镜像..."
    docker pull ghcr.io/sammaosamsam/omnibox-to-applecms:latest
}

# 启动生产环境
start_prod() {
    check_env
    pull_image
    docker compose -f docker-compose.prod.yml up -d
    log_info "生产环境已启动！"
    show_status
}

# 启动自动更新环境
start_autoupdate() {
    check_env
    pull_image
    docker compose -f docker-compose.autoupdate.yml up -d
    log_info "自动更新环境已启动！（Watchtower 每小时检查更新）"
    show_status
}

# 仅更新镜像
do_update() {
    check_env
    pull_image
    docker compose -f docker-compose.prod.yml up -d
    log_info "镜像已更新！"
}

# 查看日志
show_logs() {
    docker compose -f docker-compose.prod.yml logs -f --tail=100
}

# 查看状态
show_status() {
    echo ""
    docker compose -f docker-compose.prod.yml ps
    echo ""
    log_info "访问地址：http://localhost:3033"
    log_info "管理界面：http://localhost:3033/admin"
}

# 停止服务
do_stop() {
    docker compose -f docker-compose.prod.yml down
    docker compose -f docker-compose.autoupdate.yml down 2>/dev/null || true
    log_info "服务已停止"
}

# 重启服务
do_restart() {
    check_env
    docker compose -f docker-compose.prod.yml restart
    log_info "服务已重启"
}

# 卸载
do_uninstall() {
    log_warn "即将删除所有相关容器和数据卷..."
    read -p "确认删除？(y/N): " confirm
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        docker compose -f docker-compose.prod.yml down -v
        log_info "已卸载完成"
    else
        log_info "已取消"
    fi
}

# 主菜单
show_menu() {
    echo ""
    echo "╔══════════════════════════════════════════╗"
    echo "║   OmniBox to AppleCMS 部署管理脚本       ║"
    echo "╠══════════════════════════════════════════╣"
    echo "║  1) 生产环境部署（推荐）                 ║"
    echo "║  2) 自动更新部署（Watchtower）           ║"
    echo "║  3) 仅更新镜像                          ║"
    echo "║  4) 查看日志                            ║"
    echo "║  5) 查看状态                            ║"
    echo "║  6) 重启服务                            ║"
    echo "║  7) 停止服务                            ║"
    echo "║  8) 卸载                                ║"
    echo "║  0) 退出                                ║"
    echo "╚══════════════════════════════════════════╝"
    echo ""
}

# 主程序
case "${1:-menu}" in
    prod|1)
        start_prod
        ;;
    autoupdate|2)
        start_autoupdate
        ;;
    update|3)
        do_update
        ;;
    logs|4)
        show_logs
        ;;
    status|5)
        show_status
        ;;
    restart|6)
        do_restart
        ;;
    stop|7)
        do_stop
        ;;
    uninstall|8)
        do_uninstall
        ;;
    *)
        show_menu
        read -p "请选择 [0-8]: " choice
        case $choice in
            1) start_prod ;;
            2) start_autoupdate ;;
            3) do_update ;;
            4) show_logs ;;
            5) show_status ;;
            6) do_restart ;;
            7) do_stop ;;
            8) do_uninstall ;;
            *) log_info "已退出" ;;
        esac
        ;;
esac

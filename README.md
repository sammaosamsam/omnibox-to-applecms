# OmniBox → AppleCMS V10 转换代理

将任意 OmniBox 格式爬虫脚本（`.js`）自动转换为 **AppleCMS V10（MacCMS）标准采集接口**，支持多源管理、定时监控脚本变更、可视化管理面板，一键 Docker 部署。

---

## 功能特性

| 特性 | 说明 |
|------|------|
| 🔄 自动监控 | 定时从 GitHub / URL 拉取最新脚本，自动更新 |
| 📡 多源支持 | 同时管理 N 个 OmniBox 源，每个源独立 API 地址 |
| 🎯 标准接口 | 完整兼容 AppleCMS V10 采集接口规范 |
| 🖥️ 管理面板 | 可视化 Web 界面，无需配置文件 |
| 🐳 Docker 部署 | 一行命令启动，数据持久化 |
| 🔒 安全可选 | 可配置 API Key 保护管理接口 |

---

## 快速部署

### 方式一：Docker Compose（推荐）

```bash
# 1. 克隆项目
git clone <this-repo>
cd omnibox-to-applecms

# 2. 配置环境变量
cp .env.example .env
nano .env  # 编辑 ADMIN_API_KEY（必填）

# 3. 启动服务
docker compose -f docker-compose.prod.yml up -d

# 4. 访问管理界面
open http://localhost:3000
```

### 方式二：拉取预构建镜像（推荐）

```bash
# 1. 直接使用 GitHub Container Registry
docker compose -f docker-compose.prod.yml up -d

# 2. 自动更新版（Watchtower 每小时检查更新）
docker compose -f docker-compose.autoupdate.yml up -d
```

### 方式三：使用部署脚本

```bash
chmod +x deploy.sh
./deploy.sh              # 交互式菜单
./deploy.sh prod         # 生产环境
./deploy.sh autoupdate   # 自动更新版
./deploy.sh update       # 仅更新镜像
./deploy.sh logs         # 查看日志
./deploy.sh restart       # 重启服务
```

### 方式四：直接 Docker 运行

```bash
docker run -d \
  --name omnibox-applecms \
  --restart unless-stopped \
  -p 3033:3033 \
  -v omnibox_data:/app/data \
  omnibox-to-applecms:latest
```

### 方式三：本地开发运行

```bash
npm install
node src/index.js
```

---

## 使用方式

### 第一步：添加 OmniBox 源

打开 `http://localhost:3033`，点击「添加新源」，填入：

- **名称**：如 `瓜子APP`
- **URL**：GitHub 链接（自动转换为 raw URL）或直接 raw URL  
  例如：`https://github.com/Silent1566/OmniBox-Spider/blob/main/影视/采集/瓜子.js`
- **Cron**：刷新频率（默认每2小时）

### 第二步：将接口地址填入 AppleCMS

系统会自动生成以下接口地址：

| 类型 | URL |
|------|-----|
| 聚合所有源 | `http://your-host:3000/api/vod` |
| 单个源 | `http://your-host:3000/source/{sourceId}/api/vod` |

**在 AppleCMS 后台** → 采集管理 → 新增采集站点 → 填入接口 URL 即可。

### AppleCMS 接口参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `ac=videolist` | 获取分类列表 | `?ac=videolist` |
| `t=1` | 按分类获取列表 | `?ac=videolist&t=1` |
| `pg=2` | 翻页 | `?ac=videolist&t=1&pg=2` |
| `wd=xxx` | 搜索 | `?ac=videolist&wd=复仇` |
| `ids=xxx` | 按 ID 获取详情 | `?ac=videolist&ids=src1__123` |

---

## 管理 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/admin/sources` | GET | 获取所有源列表 |
| `/admin/sources` | POST | 添加新源 |
| `/admin/sources/:id` | PUT | 修改源 |
| `/admin/sources/:id` | DELETE | 删除源 |
| `/admin/sources/:id/refresh` | POST | 手动刷新脚本 |
| `/admin/status` | GET | 服务状态 |

### 添加源示例

```bash
curl -X POST http://localhost:3033/admin/sources \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "瓜子APP",
    "url": "https://github.com/Silent1566/OmniBox-Spider/blob/main/影视/采集/瓜子.js",
    "cronExpr": "0 */2 * * *",
    "enabled": true
  }'
```

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 服务端口 |
| `ADMIN_API_KEY` | 空（无需认证）| 管理 API 密钥 |
| `LOG_LEVEL` | `info` | 日志级别 |
| `DATA_FILE` | `/app/data/sources.json` | 数据存储路径 |

---

## 脚本兼容性说明

本工具支持 OmniBox 脚本的以下导出格式：

```javascript
// 格式 1：Class 导出（最常见）
module.exports = class Spider {
  async home() { ... }
  async category({ categoryId, page, filters }) { ... }
  async detail({ videoId }) { ... }
  async search({ keyword, page }) { ... }
}

// 格式 2：对象导出
module.exports = { home, category, detail, search }
```

脚本内部可使用：`axios`、`crypto`、`node-fetch`（均已内置沙盒）

---

## 注意事项

- OmniBox 脚本在 Node.js VM 沙盒中执行，隔离运行，不影响宿主环境
- 源脚本的可用性取决于对应 API 服务是否在线
- 建议定期查看管理面板中的错误状态

# Sci-Fi Village

类我的世界风格的科幻沙盒游戏框架（Vue3 + Node + Redis + MySQL）。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + TypeScript + Vite + Three.js |
| 后端 | Node.js（兼容 **v16.20.2**）+ Express |
| 缓存 / 会话 | Redis |
| 持久化 | MySQL 8 |

## 目录结构

```
Sci-Fi Village/
├── client/          # Vue3 前端 + Three.js 体素场景
├── server/          # Express API + WebSocket
│   ├── sql/         # 数据库初始化脚本
│   └── src/
└── package.json     # 根脚本（同时启前后端）
```

## 环境要求

- Node.js `>= 16.20.2`（后端按 16.20.2 兼容编写）
- MySQL 8
- Redis（可选：未启动时后端会降级为内存会话，仅开发用）

## MySQL 配置

| 环境 | 数据库 | 用户 | 密码 |
|------|--------|------|------|
| 本地 (development) | `sv_village` | `root` | `123456` |
| 生产 (production) | `sv_village` | `root` | `1234` |

复制环境文件：

```bash
cp server/.env.development.example server/.env
# 生产：使用 server/.env.production.example
```

## 快速开始

```bash
# 1. 安装依赖
npm install
npm install --prefix server
npm install --prefix client

# 2. 初始化数据库（需本地 MySQL 已启动）
npm run db:init

# 3. 启动（API :3000 + 前端 :5173）
npm run dev
```

浏览器打开 http://localhost:5173

## API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/login` | 登录 |
| GET | `/api/auth/me` | 当前用户 |
| GET | `/api/worlds` | 世界列表 |
| POST | `/api/worlds` | 创建世界 |
| GET | `/api/worlds/:id` | 世界详情 / 区块元数据 |
| PUT | `/api/player/position` | 同步玩家坐标 |
| GET | `/api/player/inventory` | 背包 |

WebSocket：`ws://localhost:3000/ws`（多人位置同步预留）

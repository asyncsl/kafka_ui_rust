# Kafka UI Rust — 设计文档

> 基于 Kafbat UI 核心功能（集群管理 + Topic 消息查看）的 Rust 实现方案。

---

## 1. 项目概述

使用 Rust + React 实现一个 Kafka 管理 Web UI。MVP 聚焦两个核心功能：
- **集群管理**：添加、删除、查看 Kafka 集群配置
- **Topic 消息查看**：列举 Topic，按 Partition + Offset 拉取消息内容

---

## 2. 整体架构

采用**前后端分离**架构：

```
kafka_ui_rust/
├── Cargo.toml              # Rust 后端
├── src/
│   ├── main.rs             # Axum 启动入口
│   ├── api/                # HTTP 路由层
│   ├── cluster/            # 集群管理逻辑
│   ├── topic/              # Topic 逻辑
│   ├── kafka/              # rdkafka 封装
│   └── error.rs            # 统一错误类型
├── frontend/               # React 前端（Vite）
│   ├── src/
│   │   ├── api/            # HTTP 客户端
│   │   ├── pages/          # 页面组件
│   │   ├── components/     # 复用组件
│   │   └── types/          # TypeScript 类型
│   └── package.json
└── ...
```

- **后端**：Axum 提供 REST API，端口 `8080`，开发期开启 CORS
- **前端**：Vite + React + TypeScript，端口 `5173`，开发期通过 proxy 指向后端
- **通信**：JSON over HTTP

---

## 3. 后端设计

### 3.1 REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/clusters` | 列出所有已配置集群 |
| `POST` | `/api/clusters` | 添加新集群（name + bootstrap.servers） |
| `DELETE` | `/api/clusters/:id` | 删除集群配置 |
| `GET` | `/api/clusters/:id/topics` | 列出该集群的所有 Topic（含分区数、副本数） |
| `GET` | `/api/clusters/:id/topics/:name` | Topic 详情（配置、分区分布） |
| `GET` | `/api/clusters/:id/topics/:name/messages` | 拉取消息，参数：`partition`, `offset`, `limit`, `timestamp` |

### 3.2 Kafka 客户端

使用 `rdkafka` crate：
- **AdminClient**：列举 Topic、获取元数据
- **BaseConsumer**：按指定 offset 拉取消息（`seek` 后 `poll`，非订阅模式）

每个集群的 Kafka Client 按需创建并**缓存**（`Arc<RwLock<HashMap<ClusterId, KafkaClients>>>`），避免重复建连。

### 3.3 错误处理

统一错误类型，Axum 自动转换为 HTTP 响应：
- `ClusterNotFound` → 404
- `KafkaConnectionError` → 502
- `TopicNotFound` → 404
- `Timeout` / `InvalidParam` → 400/408

---

## 4. 前端设计

### 4.1 技术栈

- **Vite** + **React** + **TypeScript**
- **React Router**：页面路由
- **TanStack Query**：数据获取、缓存、自动刷新、错误重试
- **Tailwind CSS**：样式
- **Axios**：HTTP 客户端

### 4.2 核心页面

| 页面 | 路径 | 功能 |
|------|------|------|
| 集群列表 | `/` | 展示所有集群（名称、地址、状态），支持添加/删除 |
| Topic 列表 | `/clusters/:id/topics` | 展示该集群所有 Topic（名称、分区数、副本数） |
| 消息查看 | `/clusters/:id/topics/:name/messages` | 分区选择器 + Offset 输入 + 消息列表 |

### 4.3 消息查看页交互

1. 选择 **Partition**（下拉框，从 Topic 详情获取）
2. 输入 **Start Offset**（或选 "Latest"/"Earliest"）
3. 点击"拉取"，展示消息表格（Key / Value / Offset / Timestamp）
4. 支持"加载更多"（以上次最后 Offset 为起点继续拉取）

### 4.4 开发代理

Vite `server.proxy` 将 `/api` 转发到后端 `localhost:8080`，开发时无跨域问题。

---

## 5. 数据流

```
集群列表：UI → GET /api/clusters → 返回内存配置列表
Topic 列表：UI → GET /api/clusters/:id/topics → AdminClient 请求 Kafka 元数据
消息查看：UI → GET /api/clusters/:id/topics/:name/messages
              → BaseConsumer.seek(offset) → poll(limit) → 返回消息后关闭 Consumer
```

---

## 6. 边界情况

- **Kafka 连不上**：后端返回 502，前端提示"集群不可达"
- **Topic 不存在**：404，前端提示"Topic 未找到"
- **消息拉取超时**：设置 10s 超时，返回已拉到的消息 + `has_more: false`
- **Offset 越界**：rdkafka 自动 clamp 到可用范围，后端不做特殊处理

---

## 7. 开发流程

```bash
# 终端 1：启动后端
cargo run

# 终端 2：启动前端
cd frontend && npm run dev
```

前端访问 `http://localhost:5173`，API 请求自动代理到 `8080`。

---

## 8. 明确排除（MVP 不做）

- 消费者组管理
- Schema Registry
- 消息生产/发送
- 集群配置持久化（重启丢失，后续可接入 SQLite/JSON）
- 认证/鉴权
- WebSocket 实时推送（消息页手动刷新即可）

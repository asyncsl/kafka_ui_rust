# 集群分组管理 — 设计文档

> 在现有集群管理页面之上，新增多级分组（树结构）与拖拽移动能力。

---

## 1. 目标与场景

支持把集群按「业务/团队」与「环境（prod/staging/dev）」两个维度组合到树形分组下：

- **多级分组**：分组可嵌套（无硬性深度限制），父子单向
- **拖拽移动**：分组节点可被拖到新父级或同级排序；集群卡片可被拖到任意分组节点
- **集群仍可不归属任何分组**：以「Ungrouped」虚拟节点呈现

不在本次范围内：分组级权限、跨集群批量操作、按标签的多维度过滤。

---

## 2. 整体架构

仍保持现有「Axum 后端 + React 前端 + 单文件持久化」结构。本次新增：

```
src/
├── group/                   # 新增模块（与 cluster/ 平级）
│   ├── mod.rs
│   ├── model.rs             # Group 数据结构
│   └── handler.rs           # CRUD + 移动
├── cluster/
│   └── model.rs             # 扩展 parent_group_id, order 字段
└── state.rs                 # AppState 增加 groups 字段，save() 同时落盘两个文件

frontend/src/
├── pages/ClusterListPage.tsx        # 重写为两栏布局
├── components/cluster/              # 新目录
│   ├── ClusterTree.tsx
│   ├── GroupNode.tsx
│   ├── ClusterDetailPanel.tsx
│   ├── ClusterCard.tsx
│   ├── GroupEditModal.tsx
│   └── IconPicker.tsx
├── api/groups.ts                    # 新
├── api/clusters.ts                  # 增加 moveCluster
├── hooks/useClusterTree.ts          # 装配树（纯函数）
└── types/index.ts                   # 扩展类型

data/
├── clusters.json            # 已存在；字段向后兼容扩展
└── groups.json              # 新增
```

---

## 3. 后端设计

### 3.1 数据模型

```rust
// src/group/model.rs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Group {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,    // None = 顶级分组
    pub color: Option<String>,        // hex 格式 "#RRGGBB"
    pub icon: Option<String>,         // 单个 emoji 字符
    pub description: Option<String>,
    pub order: i32,                   // 同级内排序
}

#[derive(Debug, Deserialize)]
pub struct CreateGroupRequest {
    pub name: String,
    pub parent_id: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateGroupRequest {
    pub name: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct MoveGroupRequest {
    pub parent_id: Option<String>,    // None = 顶级
    pub order: i32,
}

// src/cluster/model.rs（扩展）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cluster {
    pub id: String,
    pub name: String,
    pub bootstrap_servers: String,
    #[serde(default)] pub parent_group_id: Option<String>,
    #[serde(default)] pub order: i32,
}

#[derive(Debug, Deserialize)]
pub struct MoveClusterRequest {
    pub parent_group_id: Option<String>,
    pub order: i32,
}
```

### 3.2 持久化

- `data/clusters.json`：现有结构，新字段通过 `#[serde(default)]` 兜底首次启动
- `data/groups.json`：`HashMap<String, Group>`，与 clusters.json 同样的 pretty JSON 格式
- `AppState.save()` 一次同时写两个文件，**任一失败不回滚另一个**（单机场景，简单优于复杂；只记日志）

### 3.3 REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/groups` | 列出所有分组（扁平数组） |
| `POST` | `/api/groups` | 创建分组 |
| `PATCH` | `/api/groups/{id}` | 修改 name/color/icon/description |
| `DELETE` | `/api/groups/{id}` | 删除（非空时 409） |
| `POST` | `/api/groups/{id}/move` | 修改 parent_id + order |
| `POST` | `/api/clusters/{id}/move` | 修改 parent_group_id + order |

`GET /api/clusters` 保持原状返回扁平 `Vec<Cluster>`；前端自行组装树。

### 3.4 服务端校验

- **移动分组防环**：递归收集被移动分组的全部后代 ID；若 `parent_id` 在其中，返回 `409 CycleDetected`
- **非空删除**：统计 `parent_id == group.id` 的子组数 + `parent_group_id == group.id` 的子集群数，任一非零返回 `409 GroupNotEmpty { group_count, cluster_count }`
- **字段格式**：
  - `color` 必须匹配正则 `^#[0-9a-fA-F]{6}$`
  - `icon` 限制长度 ≤ 8 字符（一个 emoji 通常 ≤ 4 字节，留余量）
  - `name` 不能为空、首尾 trim 后长度 ≤ 64

### 3.5 错误类型扩展

```rust
// src/error.rs
pub enum AppError {
    // ... existing
    ClusterNotFound,
    GroupNotFound,
    GroupNotEmpty { group_count: usize, cluster_count: usize },
    CycleDetected,
    BadRequest(String),
}
```

HTTP 映射：`GroupNotFound → 404`、`GroupNotEmpty → 409`、`CycleDetected → 409`、`BadRequest → 400`。

---

## 4. 前端设计

### 4.1 类型扩展

```ts
// types/index.ts
export interface Group {
  id: string;
  name: string;
  parent_id: string | null;
  color: string | null;
  icon: string | null;
  description: string | null;
  order: number;
}

export interface Cluster {
  id: string;
  name: string;
  bootstrap_servers: string;
  parent_group_id: string | null;
  order: number;
}
```

### 4.2 布局结构

```
┌──────────────────────────────────────────────────────────┐
│ Clusters                                  [+ New Group]   │
│ Manage your Kafka cluster connections                     │
├─────────────┬────────────────────────────────────────────┤
│ Tree (288px)│ Detail Panel                                │
│             │ 业务A / prod        [Direct ○ Recursive ●] │
│ ▾ All       │                                             │
│  ▾ 业务A 🛒 │ ┌────────┐ ┌────────┐                       │
│   ▾ prod 🔴 │ │Cluster1│ │Cluster2│   + Add Cluster      │
│    Cluster1 │ └────────┘ └────────┘                       │
│   ▸ staging │                                             │
│  ▸ 业务B    │                                             │
│ ▸ Ungrouped │                                             │
└─────────────┴────────────────────────────────────────────┘
```

- 桌面端 `md` 以上：两栏并排（左 `w-72`，右 `flex-1`）
- 移动端 `< md`：折叠为 Tab 切换（"Tree" / "Clusters"）
- 视觉沿用现有 `glass-panel` + `glow-border` + amber/cyan 调色

### 4.3 状态管理

- **服务端缓存**（TanStack Query）：`['groups']` 与 `['clusters']` 两个独立 query；不引入 `/tree` 端点
- **派生状态**：`useClusterTree(groups, clusters)` 用 `useMemo` 把扁平数组装配成嵌套树（按 `(order, id)` 稳定排序）
- **UI 本地状态**（页面级 `useState`）：
  - `selection: Selection`，默认 `{ kind: 'all' }`
    ```ts
    type Selection =
      | { kind: 'all' }                  // 显示全部集群（递归）
      | { kind: 'ungrouped' }            // 显示 parent_group_id 为 null 的集群
      | { kind: 'group'; id: string };   // 显示该分组（按 viewMode 决定是否递归）
    ```
  - `viewMode: 'direct' | 'recursive'`（默认 recursive；仅在 `selection.kind === 'group'` 时显示与生效，其他两种选中下隐藏切换器）
  - `expandedIds: Set<string>`，持久化到 `localStorage`，加载时与现有分组 ID 取交集清理脏数据
  - `editingGroup: Group | null`

### 4.4 集群卡片来源

把现有 `ClusterListPage.tsx` 中卡片渲染部分抽到独立组件 `ClusterCard.tsx`，包含主题色样式、删除按钮、进入 Topics 链接等不变逻辑。卡片网格支持同组内拖拽排序（`useSortable`）。

### 4.5 入口按钮

- **顶部「+ New Group」**：在右上角，打开创建分组弹窗。默认 `parent_id` = 当前选中分组（`selection.kind === 'group'` 时为 `selection.id`；选中 "All" / "Ungrouped" 时为 `null`）。
- **右侧面板「+ Add Cluster」**：打开/展开创建集群表单。默认 `parent_group_id` 同样跟随选中。

### 4.6 「All clusters」与「Ungrouped」虚拟节点

不是真实 Group 实体，仅前端渲染层概念：

- 「All clusters」：树顶部首行；选中时右侧显示所有集群（忽略 viewMode 切换器）
- 「Ungrouped」：根级列表的**最底部**（所有顶级分组之后）；选中时仅显示 `parent_group_id === null` 的集群
- 两者均：可作为拖拽落点（拖入 = `parent_group_id` 置为 `null`），不可重命名/删除/编辑/被拖动
- 「Ungrouped」当集合为空时仍渲染（提供落点），可折叠

### 4.7 树节点交互

| 元素 | 单击行为 |
|---|---|
| 折叠箭头 ▾/▸ | 切换展开状态（不改变 selection） |
| 节点行主体（图标 + 名称） | 设为 selection 并展开 |
| Hover 右侧出现的「⋯」图标 | 弹出操作菜单：编辑、添加子分组、删除（非空时置灰） |
| 整行 | 作为 dnd-kit 拖拽源（带 150ms 长按激活，避免与点击冲突） |

根级排序：`[All clusters, ...顶级分组按 (order, id), Ungrouped]`。

---

## 5. 拖拽交互

### 5.1 库选型

`@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`：

- React 19 兼容
- 轻量（约 25 KB gzipped）
- 内置键盘 + 触屏支持，可定制视觉反馈

### 5.2 装配

```
<DndContext sensors={[PointerSensor, KeyboardSensor]} onDragEnd={...}>
  <SortableContext items={topLevelIds}>
    ClusterTree（递归嵌套 SortableContext）
  </SortableContext>
  ClusterDetailPanel（卡片用 useDraggable）
  <DragOverlay>...</DragOverlay>
</DndContext>
```

PointerSensor 配置 `activationConstraint: { delay: 150, tolerance: 5 }`，防止触屏滚动误触。

### 5.3 拖拽源 × 落点矩阵

| 拖动者 | 合法落点 |
|---|---|
| 集群卡片 | 任意分组节点；Ungrouped 节点；同组卡片间（排序） |
| 分组节点 | 其他分组节点（成为子）；树顶层；同级位置（排序） |
| 任何节点 | **非法**：被拖分组的后代节点 → red dashed + `cursor-not-allowed` |

### 5.4 视觉反馈

- 源节点拖起：`opacity-40`
- `DragOverlay`：cyan 边框的小卡片，含名称 + 图标
- 合法落点 hover：cyan 描边 + 内层光晕 `shadow-cyan-500/30`
- 非法落点 hover：red dashed 描边
- 同级排序：在落点位置插入 1px cyan 横线

### 5.5 防环

前端：拖起分组 G 时，预计算 G 的后代 ID Set，渲染时给这些节点加 `disabled` 状态。
后端：`/groups/{id}/move` 独立复查（防御深度）。

### 5.6 乐观更新

```
onDragEnd:
  1. queryClient.setQueryData 立即更新本地缓存
  2. POST /move
  3a. 成功 → invalidateQueries（与服务端最终一致）
  3b. 失败 → 回滚 + 错误 toast "Failed to move: <error>"
```

### 5.7 order 字段计算

- 拖入新父级末尾：`order = max(siblings.order) + 1024`
- 同级插入两兄弟之间：`order = (prev.order + next.order) / 2`
- 当相邻 order 差距 < 1 时，前端发起一次「同级 order 整理」请求（用整数 1024、2048… 重写），极少触发

### 5.8 无障碍 & 自动滚动

- 键盘：dnd-kit 内置（Space 抓起、方向键、Enter 落下、Esc 取消）
- 自动滚动：dnd-kit `autoScroll` 模块开箱即用

---

## 6. 边界情况

| 场景 | 处理 |
|---|---|
| Add Cluster 表单 | 默认 `parent_group_id` = 当前选中分组；选中 "All" / "Ungrouped" 时 = `null` |
| 删除非空分组 | 前端按钮置灰 + tooltip；后端独立校验返回 409 |
| 拖到自己的后代 | 前端禁用落点；后端校验拒绝 |
| 并发编辑（多窗口） | 后端 `RwLock` 串行化；最后写的覆盖（单机使用，可接受） |
| order 冲突（手改 JSON） | 渲染时按 `(order, id)` 稳定排序，永不崩 |
| 颜色字段非法 | 反序列化时校验，非法值降级为 `None` + 日志告警 |
| 网络错误 | 乐观更新回滚 + 红色 toast |
| localStorage 残留已删分组 ID | 装配树后清理：`expandedIds ∩ existingIds` |

**空状态文案**

- 全无：保留 "No clusters connected"
- 进入空分组：`No clusters in <Group Name>. Drag clusters here or click + Add Cluster.`

---

## 7. 测试策略

### 7.1 后端（`cargo test`）

- `cluster::model::tests` —— 保留现有测试
- `group::model::tests` —— 序列化往返、嵌套结构构造
- `group::handler::tests`：
  - 创建分组后 `groups.json` 持久化
  - 删除非空分组返回 409
  - 移动到后代触发 cycle detection 返回 409
  - 移动到 `parent_id = None` 成功（提升到顶级）
- `cluster::handler::tests`：移动集群更新 `parent_group_id` 与 `order`

### 7.2 前端

- `hooks/useClusterTree.test.ts` —— 装配函数纯函数测试（无需浏览器）
- 手动验收（参照 `CLAUDE.md`）：启动 backend + frontend dev，浏览器跑黄金路径
  - 创建顶级分组 → 创建子分组 → 拖集群进子分组 → 拖子分组到另一顶级 → 删除非空（应失败） → 删除空（成功）
  - 关掉网络模拟拖拽失败 → 验证回滚 + toast

---

## 8. 实施顺序

1. **后端基础**：`src/group/` 模块 + AppState 扩展 + 路由 + 单元测试（无前端依赖）
2. **前端数据层**：types 扩展 + API client + `useClusterTree` 装配 + 纯函数测试
3. **静态布局**：两栏布局 + 树渲染 + 集群卡片网格（无拖拽，但能 CRUD 分组）
4. **拖拽接入**：先实现分组拖分组，再实现集群拖分组；同级排序最后做
5. **打磨**：动画、空状态、错误 toast、移动端 Tab 折叠

---

## 9. 明确排除

- 标签（多维度过滤）功能
- 分组级权限或访问控制
- 跨集群批量操作（如「对该分组下所有集群执行 X」）
- 分组配色/图标的自定义主题（仅提供固定预设）
- 撤销/重做拖拽操作
- WebSocket 多端实时同步（单机使用场景，无需求）

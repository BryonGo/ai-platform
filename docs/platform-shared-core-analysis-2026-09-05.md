# 后端共用方案总结（后宫 × GameLora × tunetune）

整理日期：2026-09-05。**已定案版本**，供后端动工时直接执行。
模块统一使用品牌名 `gamelora` / `hougong`（废弃 reskin 等旧语义）。
契约文件：`docs/contracts/openapi-hougong.yaml`（已建骨架）。

## 1. 定案

1. **仓库**：A 方案——都在 `go-sdk` 里做（平台底座 + 三个产品插件）。
2. **数据库**：沿用 MySQL，后宫跟随，不迁移（GoFrame ORM 支持多驱动，以后需要再迁 PG）。
3. **积分**：按产品隔离（= 按站隔离），gamelora 与 hougong 钱包互不相通。
4. **计费单位**：统一积分。
5. **支付**：复用 go-sdk 现有支付（通道以后可加）。
6. **账号**：按站隔离，同一邮箱在三个产品分别注册。未来要做互通再加一个用户中心做同步与积分转换，**现在不做**。

## 2. 架构：站群三层

go-sdk 已有站群骨架（`sys_site` + 全业务表 `site_id` + 每站独立配置 `cms_site_config`），三个产品线 = 三个站点，不新造概念。

```text
  tunetune.ai          gamelora.ai           hougong.ai
     │                     │                     │
  前端(现有)         gamelora-web(Nuxt)      ai-platform 后宫(Nuxt)
     │                     │                     │
     └────────── 域名 / X-Site-Code ──────────────┘
                          │
        ┌─────────────────▼──────────────────┐
        │          Go 单体（go-sdk）          │
        │  ① 站点层 sys_site（已存在）        │
        │     tunetune 站 | gamelora 站 | hougong 站
        │     域名/语言/主题/支付通道/对象存储   │
        │  ② 产品插件层（业务各不相同）         │
        │     addon/tunetune   订阅问答        │
        │     addon/gamelora   素材换皮        │
        │     addon/hougong    影像创作        │
        │  ③ 平台底座（全局只维护一份）         │
        │     既有：identity/upload/pay/order/ │
        │           mq/minio/mail/webhook/pms  │
        │     新建：credit/task/provider/      │
        │           events/contract           │
        └──────┬──────┬──────┬──────┬──────────┘
           MySQL   Redis  MinIO RabbitMQ  ComfyUI / 外部 AI
```

- **站点层**：一个产品 = 一行 `sys_site`；每站支付通道、MinIO 桶、ComfyUI 地址等敏感配置放 `cms_site_config.secrets`（Cloudflare/MinIO 已是此模式）。
- **产品插件层**：只写各产品差异业务，互不 import，只调底座接口。
- **底座层**：三站共用的能力只维护一份。
- **数据隔离**：`account`/`order`/`products`/`pay_config` 已带 `site_id`；新积分表/任务表/素材表同样加 `site_id`。
- **后台任务**：scheduler/executor 从业务数据恢复 `site_id` 再干活，禁止静默用 default 站。

现有六站（写死进迁移）：default=gamelor.io、jiuguan、dzmm、taohuadao、opencode、dianziji。新增 gamelora/hougong 站点行前先核对实际 `sys_site`。

## 3. 模块盘点（按 go-sdk 实况核对）

### 复用：已存在

| 模块 | 已有内容 |
|---|---|
| account | 注册/登录/邮箱短信验证码/平台登录/游客/自动登录/刷新/登出/设备/会话踢下线/改密/改邮箱/注销 |
| upload | 单图/多图、presigned PUT 直传、分片 init/part/merge/abort/register、list/del |
| pay | 通道管理；creem/waffo/alipay/wechat/apple/google 驱动；payment create/verify/query、统一回调 notify |
| order/balance | 充值 recharge、订单 orders/cancel、退款申请 refund-apply、余额 balance、balance-log |
| 站群 | sys_site / cms_site_config / X-Site-Code 上下文、site_id 隔离、每站配置懒加载 |
| 其他 | mq（含 RabbitMQ 适配）、minio、mail、webhook、pms/Casbin、SDK 网关（game/developer/version） |

### 修补：3 个 P0（先于新功能）

1. **支付回调校验**：实付金额/币种/SKU/环境与本地订单核对后才入账。
2. **退款真实状态机**：调支付通道 + 逆向流水，不只改订单状态。
3. **MQ 可靠化**：启动预声明拓扑、Publisher Confirm、DLQ，失败不得静默降级内存队列。

影响面：P0-1、P0-2 影响 recharge、cms、**subscription（tunetune）**及未来 gamelora/hougong 积分发货；P0-3 只影响 gamelora/hougong 任务链，tunetune 不依赖 MQ。

tunetune 现状：订阅制（Waffo 单笔订单顺延到期），`Deliver` 只有正向无逆向（退款后权益收不回），plan→product_id 硬编码 map。发货器插件化模式已存在（`plugin.SubscriptionDeliverer`），建积分发货器时补 `Revoke/Undo` 逆向接口，顺手修 tunetune 退款回收。

### 新建

```text
internal/platform/
  credit/     积分账本：钱包、不可变流水、预占/结算/退回、购买、过期（表带 site_id）
  task/       任务编排：状态机、幂等、取消竞态、重试、重启恢复、Outbox
  provider/   生成供应商适配（见第 5 节）
  events/     SSE/WebSocket 任务与积分事件
  contract/   OpenAPI 生成、统一错误模型、幂等中间件

internal/addon/gamelora/   GameLora 业务域
internal/addon/hougong/    后宫业务域
```

## 4. 计费预扣（两端共用，只实现一次）

- 操作集：`GRANT` / `RESERVE` / `CAPTURE` / `RELEASE` / `REFUND` / `EXPIRE`（+ 管理 `ADJUST` 带审计）。
- **事务边界**：创建任务 + 预占积分 + 写账本 + 写 Outbox = 同一数据库事务；MQ 发送由 Outbox Publisher 在事务外确认。
- **幂等**：`clientKey` 唯一，重复提交返回原任务、只扣一次；retry 是新建任务重新计费，不复活旧任务。
- **失败/取消**：未结算 `RELEASE`，已结算 `REFUND`；账本只追加不可修改。
- **报价快照**：任务创建冻结 `rate_version`，结算按快照价；同时保存输入/输出配置快照（旧作品可追溯）。
- **购买**：接口只收 `package_id + channel`，价格/积分数/币种/SKU 由后端冻结为购买快照；发货器按站发放（`product=gamelora|hougong`）。
- 表：`credit_wallet` / `credit_ledger` / `credit_hold` / `credit_package` / `credit_purchase` / `billing_rate_version` / `provider_usage_cost`（供应商成本与用户账本分离）。
- 验收场景：重复提交只扣一次；失败/取消自动退回；取消与完成竞态只有一方生效；重启后任务可恢复且不多扣；退款有逆向流水；每笔 RESERVE 可对到 task_id 与 provider 成本。

## 5. Provider / OpenAI

**可行，两边经验互补，不新造接口：**

- go-sdk/tunetune：OpenAI 兼容 **chat/completions 流式**（DeepSeek，配置键 `tunetune.deepseek.endpoint/api_key/model` + function calling）——文本/LLM 沿用。
- PeachArt：OpenAI 兼容 **images/generations 异步生图**（`xiaoyi-client.ts`：submit → task_id → 轮询；`engines.ts` 引擎注册表；中转站按模型路由多 key）——图片侧照搬行为与契约，用 Go 按 go-sdk 约束重写（不搬 TS 代码）。

**抽公共：**

```text
internal/platform/provider/
  openai_compat.go   chat/completions 流式 + images/generations 异步轮询
  comfy.go           ComfyUI 适配（/prompt、/history、/view、WS 进度）
  driver.go          接口 + 注册（沿用 pay 的 driver 模式）
```

- 配置按站读取：`site.<plugin>.llm.*` / `site.<plugin>.image.*`，密钥进 `cms_site_config.secrets`。
- tunetune 现有 DeepSeek 调用保持路由与配置键兼容，可选渐进切换到公共 client，不强制。
- 中转站（小易类）= OpenAI 兼容 endpoint + 多 key 按模型路由，做成配置项即可。
- 文本（prompt 优化/描述分析）与图像（生成/编辑）分开封装；视频接口暂不接。
- 跨 Provider 重试必须新建 `TaskAttempt`，记录 Provider/模型/参数快照与计费结果；不允许悄悄把私有素材切到外部中转站。

## 6. 系统约束（写代码前强制遵守）

1. **GoFrame V2 技能**：已安装 `~\.agents\skills\goframe-v2`（`npx skills add github.com/gogf/skills -g --all` + `npx skills update`），动工 Go 代码前强制加载。关键规范：配置走既有 `CmsSetting().SaveSiteConfig` 服务与 DAO/DO；不用 `g.Map` 作 ORM Data；不手改生成的 DAO/DO/Entity。
2. **不新造接口**：OpenAI 部分兼容现有调用（tunetune DeepSeek / pay driver 模式）。
3. **函数命名**：service/controller/logic 分层与命名照现有模块（`sXxx` 服务、`InitRouter`）。
4. **建表**：一律 `sql/migrations/<plugin>/NNN_xxx.sql` 顺序追加（`plugin_migrations` 按 plugin+seq 记录，禁止中间插入或改动已执行序号）；不手写运行期 DDL。
5. **addon 调用**：插件全局只注册一次（`InitRouter` → `BindController`，或 `internal/app/<x>/plugin.go` 模式），配置按站懒加载，禁止按站点重复 `init()`。
6. **配置分层**：`config.yaml` 只放部署启动项；站点业务配置放 `cms_site_config`；`cms.yaml` 只作无敏感值模板。

## 7. 契约与事件

- 契约骨架已建：`docs/contracts/openapi-hougong.yaml`（19 条 path，三段：platform 积分 / hougong 任务角色故事 / gamelora 占位）。
- 统一约定：`/api/v1` 前缀；请求带 `X-Site-Code`；响应 `{code,message,data}`（code=0 成功）；认证 `Bearer UserToken`（前台 account，不走 PMS Casbin）；上传复用 `/upload/*`。
- 后宫路径：`POST /hougong/tasks`（clientKey 幂等，创建即 RESERVE）、`GET /tasks/{id}`、`POST /tasks/{id}/cancel|retry`、`/hougong/characters*`（含 `ageVerified` 成年标识）、`/hougong/stories*`（片段排序只改项目不覆盖作品）。
- 平台路径：`GET /account/credits`（balance/holds/available）、`GET /account/credit-ledger`、`GET /account/credit-packages`、`POST /account/credit-purchase`。
- SSE：`GET /hougong/events`，事件 `task.created/queued/started/progress/completed/failed` + `credits.changed`，支持 `Last-Event-ID` 续传。

## 8. 实施顺序

1. **契约 + Mock Server**：OpenAPI 三段定稿；共享 Mock Server 供两个前端对接（GameLora 替换 Pinia Mock，后宫按契约出页面）。
2. **平台底座**：计费预扣优先 + 3 个 P0 修补。
3. **gamelora 闭环**：项目/素材包/风格 → 任务 → ComfyUI 单图换皮（5090 环境已具备）。
4. **hougong 闭环**：角色/服装/会话 → ComfyUI 文生图 → 图生视频（复用内核，只写角色/会话/视频域）。

前端协作：两个 Nuxt 仓库独立开发，不合并 UI（GameLora 紫青 / 后宫黑灰 Amber），只共享契约生成的请求类型；产品域禁止私建扣费逻辑，只依赖 `internal/platform/credit`。

## 9. 待办

- [x] skills 安装/更新（goframe-v2）
- [x] 契约骨架（openapi-hougong.yaml）
- [ ] 动工前加载 goframe-v2 技能
- [ ] 站点规划：gamelora / hougong 站点行与现有六站关系
- [ ] 平台底座：credit 账本 + 3 个 P0（顺序见第 8 节）
- [ ] 共享 Mock Server

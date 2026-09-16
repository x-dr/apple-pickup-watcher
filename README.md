# Apple Pickup Watcher Web

Apple 到店取货库存监控 Web 应用。前端使用 React 19、TypeScript、Vite 和 Ant Design 6，服务端通过 EdgeOne Makers Cloud Functions 查询 Apple 到店取货接口，并可发送浏览器通知、提示音，以及 Bark 或 NotifyHub 推送。

> 本项目基于 [ENCHIGO/apple-pickup-watcher](https://github.com/ENCHIGO/apple-pickup-watcher) 重新实现，当前仓库为 [x-dr/apple-pickup-watcher](https://github.com/x-dr/apple-pickup-watcher)。

## 一键部署到 EdgeOne Pages

<p align="center">
	<a href="https://console.cloud.tencent.com/edgeone/pages/new?repository-url=https%3A%2F%2Fgithub.com%2Fx-dr%2Fapple-pickup-watcher&env=APW_ACCESS_TOKEN%2CAPW_IP_API_KEY">
		<img src="https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg" alt="使用 EdgeOne Pages 部署">
	</a>
</p>

点击按钮后，授权 GitHub 并确认仓库与部署分支即可创建项目。部署向导会预填两个必需的环境变量：

- `APW_ACCESS_TOKEN` 为必填项，请设置至少 16 位的随机访问口令；浏览器通过它访问库存查询接口。
- `APW_IP_API_KEY` 为必填项，填写 IP-API Pro Key，用于由服务端查询函数出口 IP,可以填`EEKS6bLi6D91G1p`。
- 服务端通知不是必需功能。如需启用，可在项目创建后填写 `BARK_URL`，或同时填写 `NOTIFYHUB_WEBHOOK_URL` 和 `NOTIFYHUB_TOKEN`。两种渠道只能选择一个，不要同时配置。
- 不要在公网部署中配置 `APW_ALLOW_UNAUTHENTICATED=true`。部署完成后，使用生成的项目域名访问应用；构建和运行时配置已由 `edgeone.json` 提供。

需要配置自动部署、预览环境或查看完整验证流程，请继续阅读[通过 Git 部署到 EdgeOne Makers](#通过-git-部署到-edgeone-makers)。



## 功能特性

- 支持中国大陆、中国香港、中国台湾、日本、新加坡、澳大利亚和马来西亚。
- 支持 iPhone、iPad 和 Mac；可按机型、容量、颜色添加目标，也可批量添加同容量的全部颜色。
- 同一门店的多个型号合并查询，每轮最多监控 24 项、6 家门店。
- 库存查询仅接受精简的 v2 分组协议，商品名、门店名和跳转链接只保留在浏览器端；旧版请求会被拒绝。
- 严格区分有货、无货、未知和待查询；拦截、限流、网络失败或接口结构异常不会被误判为无货。
- 支持浏览器通知、提示音、Bark / NotifyHub 二选一的服务端推送，以及有货时打开 Apple 商品页。
- 可按需查看本次请求的客户 IP，以及函数实例的出口 IP、位置和网络信息。
- 通知失败会在后续确认有货时重试；明确无货后再次有货会重新提醒。
- 监控目标和设置保存在 `localStorage`；访问口令和运行状态仅保存在当前标签页的 `sessionStorage`。
- 提供桌面表格和移动端卡片布局，支持浅色、深色主题。

## 运行边界

EdgeOne Makers Cloud Functions 是按请求运行的 Serverless 服务，持续轮询由浏览器页面负责。因此：

- 页面关闭、标签页被系统冻结或设备休眠后，监控会停止。
- 浏览器后台节流可能延长实际查询间隔。
- Apple 可能限制云函数出口 IP；HTTP 403、541、429、5xx 和异常响应会显示为“未知”并进入退避，不会显示成“无货”。
- 冷却和会话状态保存在单个云函数实例的内存中，不是跨实例的全局限流。

建议使用 60 秒或更长的查询间隔。需要完全无人值守的后台监控时，应使用常驻进程版本或独立定时任务。

## 技术栈

- React 19 + TypeScript 5
- Vite 7
- Ant Design 6
- Vitest 5
- EdgeOne Makers Cloud Functions
- Node.js 22.12+

## 项目结构

```text
.
├── cloud-functions/api/   # 健康检查、鉴权、库存查询和服务端推送接口
├── public/catalog/        # 各地区门店和商品目录快照
├── scripts/               # 上游目录导入工具
├── src/                   # React 前端
├── tests/                 # 单元与可靠性测试
├── edgeone.json           # Makers 构建和运行时配置
└── .env.example           # 本地环境变量示例
```

## 本地开发

### 1. 获取代码

```bash
git clone https://github.com/x-dr/apple-pickup-watcher.git
cd apple-pickup-watcher
npm ci
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`：

```dotenv
APW_ACCESS_TOKEN=请替换为至少16位的随机访问口令
APW_IP_API_KEY=请替换为你的IP-API-Pro-Key

# 可选渠道一：完整的 Bark 推送地址，仅由服务端读取
# BARK_URL=https://api.day.app/你的BarkKey

# 可选渠道二：NotifyHub Webhook 与 Token，必须同时填写
# 不要与 BARK_URL 同时配置
# NOTIFYHUB_WEBHOOK_URL=https://notifyhub.example.com/api/v1/hooks/01ARZ3NDEKTSV4RRFFQ69G5FAV
# NOTIFYHUB_TOKEN=请替换为你的NotifyHubToken

# 仅限本机临时调试，公网环境不要开启
# APW_ALLOW_UNAUTHENTICATED=true
```

`.env`、`.env.*`、`.edgeone/` 和 `dist/` 已被 Git 忽略。不要把访问口令、IP-API Key、Bark Key、NotifyHub Token 或 EdgeOne API Token 提交到仓库。

### 3. 启动完整开发环境

```bash
npm install -g edgeone
edgeone login
npm run dev:makers
```

访问 `http://localhost:8088/`。`npm run dev` 只启动 Vite 前端，不会模拟 Cloud Functions，因此库存查询和服务端通知接口不可用。

## Git 仓库关联

本仓库当前使用：

```text
origin  https://github.com/x-dr/apple-pickup-watcher.git
branch  main
```

检查本地关联：

```bash
git remote -v
git branch --show-current
```

如果是已有本地仓库但尚未设置远端：

```bash
git remote add origin https://github.com/x-dr/apple-pickup-watcher.git
git branch -M main
git push -u origin main
```

如果 `origin` 已存在但地址不正确：

```bash
git remote set-url origin https://github.com/x-dr/apple-pickup-watcher.git
git push -u origin main
```

提交前先确认 `.env` 等敏感文件没有进入暂存区：

```bash
git status
git diff --cached
```

## 通过 Git 部署到 EdgeOne Makers

推荐使用 Makers 的 Git 自动部署。它与本地 `git remote` 是两层独立关联：本地仓库推送到 GitHub 后，还需要在 Makers 控制台授权并绑定该 GitHub 仓库。

### 1. 导入或重新关联仓库

1. 登录 [EdgeOne Makers 控制台](https://edgeone.ai/)。
2. 新建项目时选择“导入 Git 仓库”，连接 GitHub 并授权访问 `x-dr/apple-pickup-watcher`。
3. 如果 Makers 项目已经存在，进入“项目设置 → Git 管理”，关联或重新关联该仓库。
4. 在“项目设置 → 环境管理”中，将生产环境关联到 `main` 分支并开启自动部署；其他分支可作为预览环境。

### 2. 确认构建配置

仓库中的 `edgeone.json` 已提供所需配置。控制台应识别为：

| 配置项 | 值 |
| --- | --- |
| 根目录 | `./` |
| 安装命令 | `npm ci` |
| 构建命令 | `npm run build` |
| 输出目录 | `dist` |
| Node.js | `22.17.1` |

Cloud Functions 位于 `cloud-functions/api/`，部署后会生成同源的 `/api/*` 路由。

### 3. 配置生产环境变量

在“项目设置 → 环境管理 → Production → 环境变量”中添加：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `APW_ACCESS_TOKEN` | 是 | 至少 16 位，浏览器访问接口时使用 |
| `APW_IP_API_KEY` | 是 | IP-API Pro Key，仅由服务端用于查询函数出口 IP |
| `BARK_URL` | 否 | 通知渠道一：完整 Bark HTTPS 推送地址，仅服务端读取 |
| `NOTIFYHUB_WEBHOOK_URL` | 否 | 通知渠道二：`/api/v1/hooks/<接入点ID>` Webhook 地址，需与 Token 同时配置 |
| `NOTIFYHUB_TOKEN` | 否 | NotifyHub Webhook 的 Bearer Token，仅服务端读取 |
| `APW_ALLOW_UNAUTHENTICATED` | 否 | 仅本地调试可设为 `true`，公网不要配置 |

`BARK_URL` 与 NotifyHub 两项配置只能二选一；两套同时存在或 NotifyHub 只填写一项时，通知会失败关闭。环境变量修改只会作用于新的部署。修改后请在控制台重新部署，或推送一次新提交。

### 4. 首次部署与后续发布

首次确认配置后点击“开始部署”。以后向生产分支推送即可自动构建并发布：

```bash
git add README.md
git commit -m "docs: update deployment guide"
git push origin main
```

提交、推送和生产发布会改变远端状态，请在确认改动后自行执行。建议日常功能分支先生成 Preview，验证通过后再合并到 `main`。

### 5. 部署后验证

先检查公开健康接口：

```bash
curl https://你的域名/api/health
```

正常响应应包含 `"ok":true`，并且 `authConfigured` 应为 `true`。如配置了服务端通知，`notificationProvider` 应为 `"bark"` 或 `"notifyhub"`；未配置或配置冲突时为 `null`。

再验证访问口令；以下变量只保存在当前终端，不要把真实口令写入脚本或提交到 Git：

```bash
read -rsp "APW access token: " APW_TOKEN
echo
curl -H "Authorization: Bearer ${APW_TOKEN}" https://你的域名/api/verify
unset APW_TOKEN
```

返回 `{"ok":true}` 后，再在浏览器中添加少量目标进行实际库存查询。构建成功只代表代码已发布，不代表 Apple 当前允许该出口 IP 查询。

## CLI 直接上传部署（可选）

如果使用的是“直接上传”类型的 Makers 项目，也可以从本地部署。Git 关联项目应优先通过推送或控制台重新部署，避免混用两种发布来源。

```bash
npm install -g edgeone
edgeone login
edgeone makers deploy -n apple-pickup-watcher-web
```

也可以运行仓库脚本：

```bash
npm run deploy -- -n apple-pickup-watcher-web
```

`-n` 指定的项目不存在时，CLI 会创建项目。`edgeone makers link` 用于把当前目录关联到兼容的 Makers 项目并同步项目环境配置；它不等同于在控制台绑定 GitHub，也不会单独建立 Git Push 自动部署。

## 可用命令

```bash
npm run dev            # 仅启动 Vite 前端
npm run dev:makers     # 启动前端和 Cloud Functions
npm run typecheck      # TypeScript 类型检查
npm test               # 运行测试
npm run build          # 生成生产构建
npm run preview        # 本地预览 dist
npm run deploy         # 使用 EdgeOne CLI 部署
```

## 更新内置目录

目录数据来自上游 GPL-3.0 项目快照。更新时先获取上游源码，再执行导入：

```bash
git clone https://github.com/ENCHIGO/apple-pickup-watcher.git ../apple-pickup-watcher-upstream
npm run catalog:import -- ../apple-pickup-watcher-upstream
```

导入器会重新生成 `public/catalog/*.json`，并记录上游提交和快照日期。提交前请检查生成差异并运行测试。

## 常见问题

### Git 推送后没有自动部署

检查 Makers 项目的 Git 管理是否仍关联正确仓库、Production 是否关联 `main`，以及自动部署是否开启。仅配置本地 `origin` 或运行 `edgeone makers link` 不会创建 Git 自动部署。

### 页面提示服务端未配置访问口令

确认 Production 环境存在至少 16 位的 `APW_ACCESS_TOKEN`，然后触发一次新部署。旧部署不会自动获得新环境变量。

### 库存一直显示未知

查看页面活动日志。Apple 的 403、541、429、网络失败或响应结构变化都会显示为未知；请降低查询频率并等待冷却，不要把未知当作无货。

### 关闭页面后不再提醒

这是当前浏览器轮询架构的预期行为。需要持续后台运行时，请改用常驻服务或可靠的定时任务。

## 许可

本项目是 `ENCHIGO/apple-pickup-watcher` 的 Web 派生实现，并包含来自 `hteen/apple-store-helper` 的目录数据，整体按 GNU GPL v3 授权。详见 [NOTICE](./NOTICE) 和 [LICENSE](./LICENSE)。

## 相关文档

- [EdgeOne Makers：导入 Git 仓库](https://pages.edgeone.ai/document/importing-a-git-repository)
- [EdgeOne Makers：构建配置与环境管理](https://pages.edgeone.ai/document/build-guide)
- [EdgeOne Makers CLI](https://pages.edgeone.ai/document/edgeone-cli)

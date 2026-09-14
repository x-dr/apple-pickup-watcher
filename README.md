# Apple Pickup Watcher Web

基于 [ENCHIGO/apple-pickup-watcher](https://github.com/ENCHIGO/apple-pickup-watcher) 重新实现的 Web 版：React 19 + TypeScript + Ant Design 6 前端，Node.js 云函数代理 Apple 到店取货查询，可直接部署到腾讯云 EdgeOne Makers。

## 功能

- 支持中国大陆、中国香港、中国台湾、日本、新加坡、澳大利亚、马来西亚。
- 支持 iPhone、iPad、Mac、Apple Watch；iPhone 按机型、容量、颜色逐级选择。
- 同一门店的多个型号合并为一次 Apple 请求。
- 严格区分「有货 / 无货 / 未知 / 待查询」；HTTP 541、限流、网络失败和结构变化绝不会显示成无货。
- 目标和设置保存在浏览器 `localStorage`，访问口令只保存在当前标签页的 `sessionStorage`。
- 支持浏览器通知、提示音、可选 Bark 服务端推送和有货时打开 Apple 页面。
- 桌面表格与移动端卡片两套响应式布局，支持深浅主题。

## Web 版边界

Makers 云函数是按请求运行的 Serverless 环境，不是常驻进程。因此轮询由浏览器页面发起：页面关闭或设备休眠后监控会停止，浏览器后台节流也可能拉长查询间隔。如果需要真正无人值守的后台任务，请继续使用原项目桌面版或 CLI。

Apple 会按出口 IP 限制取货查询。应用默认 60 秒一轮，前端最小 30 秒，云函数还限制单客户端 25 秒内最多一轮、每轮最多 24 项和 6 家门店。EdgeOne 出口仍可能被 Apple 返回 541；界面会明确显示为「未知」。

## 本地开发

要求 Node.js 22.12+。

```bash
npm install
cp .env.example .env
```

在 `.env` 中设置至少 16 位的 `APW_ACCESS_TOKEN`。如需 Bark，再设置完整的 `BARK_URL`。不要把 `.env` 提交到 Git。

安装并登录 EdgeOne CLI 后启动完整前后端：

```bash
npm install -g edgeone
edgeone login
npm run dev:makers
```

访问 `http://localhost:8088/`。`npm run dev` 只启动 Vite 界面，不会模拟 Node 云函数。

## 部署到 EdgeOne Makers

项目已经包含 `edgeone.json`：构建命令为 `npm run build`，静态输出目录为 `dist`，Node 运行时使用 22.17.1；`cloud-functions/api/*.ts` 会按文件名生成同源 API 路由。

1. 在 EdgeOne Makers 控制台创建或关联项目。
2. 在“项目设置 → 环境管理”中配置生产环境变量：
   - `APW_ACCESS_TOKEN`：必填，至少 16 位随机口令。
   - `BARK_URL`：可选，完整 Bark 推送地址，只在服务端读取。
   - 不要在公网配置 `APW_ALLOW_UNAUTHENTICATED=true`。
3. 本地已登录 CLI 时执行：

```bash
edgeone makers deploy -n apple-pickup-watcher-web
```

也可以把仓库导入 Makers，平台会在生产分支提交后自动执行构建和发布。环境变量变更只对下一次部署生效。

## 检查

```bash
npm run typecheck
npm test
npm run build
```

## 更新内置目录

目录来源于原项目的 GPL-3.0 快照。先拉取原项目，再运行导入器：

```bash
git clone https://github.com/ENCHIGO/apple-pickup-watcher.git ../apple-pickup-watcher-upstream
npm run catalog:import -- ../apple-pickup-watcher-upstream
```

导入器会把上游门店和商品快照转换为 `public/catalog/*.json`，并记录上游提交与快照日期。

## 许可

本项目是 `ENCHIGO/apple-pickup-watcher` 的 Web 派生实现，并继续包含来自 `hteen/apple-store-helper` 的目录数据；整体按 GNU GPL v3 授权。详见 [NOTICE](./NOTICE) 与 [LICENSE](./LICENSE)。

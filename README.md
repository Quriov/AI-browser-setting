# AI Browser Setting

Claude Code 的 WebFetch 工具无法获取 SPA（单页应用）页面的实际内容，因为这些页面依赖 JavaScript 渲染。本方案通过 PostToolUse Hook 自动检测 SPA 内容，并引导 Claude 使用 [fetcher-mcp](https://github.com/jae-jae/fetcher-mcp) 重新获取渲染后的页面。

## 解决什么问题

Claude Code 在调研任务中用 WebFetch 访问 React / Vue / Next.js 等 SPA 页面时：

- **之前**: WebFetch 拿到空白或 JS 代码 -> Claude 放弃核心信息源，转向次级来源，导致信息质量下降
- **之后**: Hook 自动检测 SPA -> 注入警告 -> Claude 用 fetcher-mcp 重新获取完整内容

## 快速安装

```bash
git clone https://github.com/Quriov/AI-browser-setting.git
cd AI-browser-setting
node setup.js
# 重启 Claude Code 即可
```

## 安装了什么

| 组件 | 位置 | 作用 |
|------|------|------|
| Hook 脚本 | `~/.claude/hooks/webfetch-spa-detector.js` | 每次 WebFetch 后自动检测 SPA 内容 |
| MCP Server | `settings.json` -> `mcpServers.fetcher` | fetcher-mcp，Playwright 渲染 + Readability 提取 |
| PostToolUse Hook | `settings.json` -> `hooks.PostToolUse` | 将检测脚本注册为 WebFetch 的后置钩子 |
| Rule 文件 | `~/.claude/rules/common/web-fetch-fallback.md` | Claude 的降级策略指导 |
| CLAUDE.md 段落 | `~/.claude/CLAUDE.md` | 强制性工具层级指令 |

## 管理命令

```bash
node setup.js           # 安装（幂等，可重复运行）
node setup.js --check   # 检查安装状态
node setup.js --remove  # 完全卸载
```

## 工作原理

```
WebFetch 请求页面
       |
  PostToolUse Hook
       |
  检测 SPA 特征
   /        \
 是 SPA    正常页面
  |           |
 输出警告   静默通过
  |
  v
Claude 用 fetcher-mcp 重新获取
（Playwright 渲染 JS + Readability 提取干净内容）
```

## SPA 检测指标

| 指标 | 类型 | 说明 |
|------|------|------|
| `empty_response` | 强 | 响应少于 50 字符 |
| `empty_spa_container` | 强 | 空的 `<div id="root">` 等 SPA 挂载点 |
| `js_required_message` | 强 | 包含 "requires JavaScript" 等提示 |
| `framework_boilerplate` | 弱 | `__NEXT_DATA__`、`webpackChunk` 等框架代码 |
| `script_heavy` | 弱 | script 标签 > 3 且有效文本 < 800 字符 |
| `short_text_vs_long_html` | 弱 | 去标签文本 < 300 字符但 HTML > 500 字符 |

强指标单项触发，弱指标需 2 个以上同时出现。

## 工具职责划分

| 工具 | 用途 | 场景 |
|------|------|------|
| **WebFetch** | 轻量 HTTP 获取 | 静态页面、API 文档（默认） |
| **fetcher-mcp** | JS 渲染内容提取 | SPA 页面（Hook 自动触发） |
| **agent-browser** | 浏览器自动化 | 填表、点击、E2E 测试 |
| **browser-use** | AI 浏览器交互 | 复杂多步操作 |

## 前置条件

- Node.js 18+
- Claude Code 已安装（`~/.claude/settings.json` 存在）

安装脚本会自动全局安装 fetcher-mcp（`npm install -g fetcher-mcp`）。
使用全局安装而非 npx 是因为 Claude Code 启动 MCP server 时，npx 的下载延迟可能导致初始化超时。

## FAQ

**Q: 会影响正常 WebFetch 吗？**
A: 不会。Hook 只在检测到 SPA 特征时输出警告，正常页面静默通过。

**Q: fetcher-mcp 首次运行慢？**
A: 安装脚本已改为全局安装，避免了 npx 每次下载的延迟。如 Playwright 浏览器未安装，运行 `npx playwright install chromium`。

**Q: 如何验证生效？**
A: 让 Claude Code 用 WebFetch 访问任意 React/Next.js 页面，观察 `[SPA DETECTED]` 警告。

## License

MIT

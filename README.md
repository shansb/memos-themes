# memos-themes

Memos 实例范围的 **CSS 主题**与 **JavaScript 增强脚本**。

在 Memos 的 `设置 → 外观`（或系统设置）里粘贴即可，作用于整个实例、所有用户。

> **适配 Memos v0.31+**（Tailwind v4 + CSS 变量主题系统）。
> v0.30 之前的前端使用 `.note-card` / `.sidebar` 这类类名，本仓库的 CSS 不适用于那些版本。

---

## 内容

```
css/catppuccin.css    Catppuccin Latte（浅色）/ Mocha（深色）主题
js/enhance.js         增强脚本：快捷键、进度条、回到顶部等
docs/injection.md     注入机制详解（升级后排查问题先看这个）
docs/changelog.md     适配记录
```

---

## CSS 主题

`css/catppuccin.css` — 基于 [Catppuccin](https://catppuccin.com/) 调色板。

**浅色 Latte**

| 用途 | 色值 |
|---|---|
| 页面底色 | `#eff1f5` (base) |
| 卡片 | `#ffffff` |
| 正文 | `#4c4f69` (text) |
| 主色 | `#1e66f5` (blue) |
| 侧栏 | `#e6e9ef` (mantle) |
| 描边 | `#ccd0da` (surface0) |

**深色 Mocha**

| 用途 | 色值 |
|---|---|
| 页面底色 | `#1e1e2e` (base) |
| 卡片 | `#252537` — 在 base 与 surface0 之间取一档，分层但不刺眼 |
| 正文 | `#cdd6f4` (text) |
| 主色 | `#89b4fa` (blue) |
| 侧栏 | `#181825` (mantle，后退) |
| 描边 | `#313244` (surface0) |

**实现要点**

- 只覆盖 `:root` 上的 CSS 变量，不碰类名 —— 前端改版也不会失效
- 用 `:root:root` 提升优先级，盖过应用注入的主题变量
- 深色分支用 `[style*="color-scheme: dark"]` 匹配。应用切换主题时会把 `color-scheme` 写到 `<html style>` 上，这样**手动切深色和跟随系统两种情况都能命中**，比 `@media (prefers-color-scheme)` 更准
- 附带 `body` 兜底：应用把主题色作为 fallback 内联进了 `var(--background, …)`，显式绑定变量确保切主题即时生效
- 阴影用暖中性色（浅色）/ 纯黑半透明（深色），不使用单一 `rgba(0,0,0,.1)`

---

## JS 增强脚本

`js/enhance.js` — 纯原生 JS，无依赖。

| 功能 | 触发方式 |
|---|---|
| 快捷键导航 | `g h` 首页 · `g e` 发现 · `g c` 日历 · `g m` 地图 · `g a` 附件 |
| 搜索聚焦 | `/` |
| 字号缩放 | `+` / `-`（存 localStorage，刷新保持） |
| 快捷键帮助 | `?`（Esc 或点击关闭） |
| 阅读进度条 | 顶部 2px，自动出现 |
| 回到顶部 | 右下浮动按钮，滚动超过一屏才显示 |
| 相对时间提示 | 悬停 `<time>` 显示「5 分钟前 · 2026/10/10 13:21:52」 |
| 外链新窗口 | 自动加 `target=_blank` + `noopener noreferrer`，站内链接不动 |

**开关**：脚本顶部的 `OPTIONS` 对象，想关掉哪项改 `false`。

```js
var OPTIONS = {
  hotkeys: true,
  progressBar: true,
  relativeTime: true,
  externalLinks: true,
  fontZoom: true,
  scrollTop: true
};
```

**设计上的注意点**

- **防重复注入**：应用不会检查脚本是否已存在，靠 `window.__memosEnhance` 标志拦截
- **模块隔离**：`boot()` 用 `safe(name, fn)` 逐个包 try/catch —— 任一模块出错只留 console 警告，不影响其余功能
- **storage 包装**：`localStorage` 在隐私模式 / 第三方 Cookie 被禁时会**直接抛错**（实测踩过），统一走 `storageGet` / `storageSet`
- **不依赖 Tailwind 类名**：v0.31 的类名是编译生成的哈希，改版即失效
- **不改应用逻辑**：只往 `body` 挂自有元素、只读改 `title`/`target` 等属性

---

## 使用

1. 登录 Memos
2. `设置 → 外观`（或 `系统设置 → 外观`）
3. 把 `css/catppuccin.css` 全文粘进 **实例范围 CSS**
4. 把 `js/enhance.js` 全文粘进 **实例范围 JavaScript**
5. 保存，刷新页面

主题在 `system` / `default` / `paper` 下都可用 —— CSS 只覆盖变量，不干扰应用的切换逻辑。

---

## 升级 Memos 后失效了怎么办

先看 [`docs/injection.md`](docs/injection.md) 的「升级排查」。

通常只有两种情况：

1. **变量名变了** —— 去编译产物里看新的变量定义：
   ```bash
   curl -s https://<你的实例>/ | grep -o '/assets/[^"]*\.css'
   curl -s https://<你的实例>/assets/index-XXXX.css | head -c 2000
   ```
   开头就有 `:root{--background:...}` 的定义。

2. **注入机制变了** —— 抓 JS 搜 `additionalScript` 附近的实现。

---

## 安全提示

**不要把 Memos 的 access token 写进实例级 JavaScript。**
实例级脚本会下发到所有访问者的浏览器，任何登录用户都能从源码里读到。

需要 API 自动化（批量导出、自动打标签等）应该放在服务端，不要放在这里。

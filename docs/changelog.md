# 适配记录

## 2026-10 · 适配 Memos v0.31.0

**背景**：mars 实例从 v0.29.1 升到 v0.31.0（跳过 v0.30），前端类名体系整体更换。
v0.30 之前那份基于 `.note-card` / `.sidebar` 的 CSS 全部失效。

**已完成**

- CSS 重写为变量覆盖方案（`:root:root`），浅色 Latte + 深色 Mocha
- 深色分支用 `[style*="color-scheme: dark"]` 匹配，覆盖手动切换与跟随系统两种情况
- 补 `body` 兜底（应用把主题色作为 fallback 内联进了变量引用）
- JS 增强脚本首版：快捷键、进度条、回到顶部、相对时间、外链处理、字号缩放、帮助面板

**实测环境**

```
实例版本  0.31.0
commit    2b2192d4e153bd04f1d325b60fd880cf00d68b01
前端      tailwindcss v4.2.4
主题列表  ['system','default','default-dark','paper']
```

**验证结论**

| 项目 | 结果 |
|---|---|
| 浅色底色 | `rgb(239,241,245)` = `#eff1f5` ✓ |
| 深色底色 | `rgb(30,30,46)` = `#1e1e2e` ✓ |
| 双向切换 | light ↔ dark 正常 ✓ |
| 变量消费 | 临时元素 `var(--background)` 解析正确 ✓ |
| 快捷键 | `g→e` 跳到 `/explore`，`g→c` 跳到 `/calendar` ✓ |
| 帮助面板 | 9 行内容正确渲染 ✓ |
| 字号缩放 | `htmlFontSize: 108%` + toast ✓ |
| 相对时间 | `"5 分钟前 · 2026/10/10 13:21:52"` ✓ |
| 外链处理 | `{target:"_blank", rel:"noopener noreferrer"}` ✓ |
| 站内链接 | 未被改动 ✓ |
| console 警告 | 零 ✓ |

**过程中修掉的缺陷**

1. `localStorage` 在受限环境（隐私模式 / 第三方 Cookie 被禁）会直接抛错，
   导致 `boot()` 静默中断、后续模块全部不执行。
   → 包装 `storageGet` / `storageSet`。
2. 单模块异常会影响整个脚本初始化。
   → `boot()` 改为 `safe(name, fn)` 逐模块隔离。

**遗留**

- 「字数统计」「标签快捷条」这类需要挂编辑器的功能未做 —— 盲写选择器易失效，
  需登录后在真实 memo 页面确认 DOM 结构再补。
- 「N 年前的今天」需要读 memo 数据，同样待定。

# Memos 自定义样式的注入机制

本文记录 Memos v0.31 前端如何加载「实例范围 CSS / JavaScript」，以及实测确认的行为约束。
**升级 Memos 后自定义样式失效，先读本文。**

---

## 一、注入方式

设置项存在服务端的 `system_setting` 表的 `GENERAL` 行里，字段为 `additionalStyle` 和 `additionalScript`。

前端拿到后按下面的方式注入（源码 `web/src/contexts/InstanceContext.tsx`，v0.31.0）：

```js
// CSS —— 追加到 body 末尾
if (instance.additionalStyle) {
  const style = document.createElement('style');
  style.innerHTML = instance.additionalStyle;
  style.setAttribute('type', 'text/css');
  document.body.insertAdjacentElement('beforeend', style);
}

// JavaScript —— 挂到 head
if (instance.additionalScript) {
  const script = document.createElement('script');
  script.innerHTML = instance.additionalScript;
  document.head.appendChild(script);
}
```

压缩后的产物（`app.js`）里长这样：

```js
(d=()=>{if(i.additionalScript){let e=document.createElement(`script`);
e.innerHTML=i.additionalScript,document.head.appendChild(e)}},
f=[i.additionalScript],...)
```

### 三个直接后果

1. **是原生脚本，不是沙箱** —— 完整 `window` / `document` 权限，和页面自身代码同级。
2. **CSS 注入点在 body 末尾，JS 在 head** —— CSS 因为在最后，天然有较高的层叠顺序；JS 在 head 意味着它执行时 `body` 可能还不完整。
3. **不检查重复** —— 没有 `getElementById` 之类的去重，脚本必须自备防重复标志。

---

## 二、执行时机

`useEffect` 的依赖数组是 `[instance.additionalScript]` / `[instance.additionalStyle]`：

```js
f = [i.additionalScript]
```

**结论：整页加载时执行一次，SPA 路由切换不重跑。**

这是最重要的一条 —— Memos 是 React Router 单页应用，点侧栏跳转不会触发页面刷新，注入的脚本也不会再次执行。

### 实测时序

```
注入时 document.readyState = "complete"
注入时 body 已存在（<div id="root"> + <style>）
```

到达 `complete` 才注入，所以 `DOMContentLoaded` / `load` 已经过去，不能靠它们。

### 应对方式

脚本必须自己处理「内容还没渲染」的情况，三种手段组合使用：

| 手段 | 用途 |
|---|---|
| `MutationObserver` | 监听 `body` 子树新增节点，标注新渲染的元素 |
| 覆盖 `history.pushState` / `replaceState` | 感知 SPA 内部导航（React Router 走 history API，不触发 `popstate`） |
| `waitFor(selector, timeout)` | 等特定元素出现，超时返回 `null` 让调用方跳过而不是抛错 |

---

## 三、React 的影响范围

React 只管理 `<div id="root">` 内部。

```
body
├── div#root          ← React 管这里，内部节点随时被替换
├── style             ← 应用注入的自定义 CSS（body 末尾）
└── （自由区域）        ← 往这里加 DOM 不会被 React 清掉
```

**实测确认**：往 `body` 直接 `appendChild` 的元素在 SPA 导航后依然存在。

所以全局 UI（进度条、悬浮按钮、提示条）挂 `body` 是安全的；但**不要往 `#root` 里塞东西**，React 重渲染会把它抹掉。

---

## 四、主题系统

v0.31 的前端**完全由 CSS 变量驱动**，样式定义在 `web/src/themes/` 下的三个文件：

| 文件 | 说明 |
|---|---|
| `default.css` | 浅色默认主题 |
| `default-dark.css` | 深色主题 |
| `paper.css` | 纸色主题 |

主题列表（前端硬编码）：

```js
['system', 'default', 'default-dark', 'paper']
```

都写在 `:root` 上：

```css
:root {
  --background: oklch(98.18% .0054 95.0986);
  --foreground: oklch(24.38% .0269 95.7226);
  --card: oklch(100% 0 0);
  --primary: oklch(45% .08 250);
  --border: oklch(88.47% .0069 97.3627);
  --sidebar: oklch(96.63% .008 98.8792);
  --radius: .5rem;
  ...
}
```

### 可用的变量

```
background / foreground         页面底色、正文
card / card-foreground          卡片
popover / popover-foreground    弹层、浮窗
primary / primary-foreground    主色：按钮、选中、链接
secondary / secondary-foreground
muted / muted-foreground        代码块、骨架屏、次要文字
accent / accent-foreground      悬停态
destructive / destructive-foreground
success / success-foreground
warning / warning-foreground
border / input / ring           描边、输入框、聚焦环
overlay
sidebar / sidebar-foreground / sidebar-accent / sidebar-accent-foreground
font-sans / font-serif / font-mono
radius
shadow-xs / sm / / md / lg / xl / float
```

### 暗色模式怎么判断

**没有 `.dark` 类，也没有 `data-theme` 属性。**

应用切换主题时会写 `<html style="color-scheme: dark;">`：

```js
jb = e => { document.documentElement.style.colorScheme = Ab(e) ? 'dark' : 'light' }
```

`Ab` 的判断是主题名以 `-dark` 或 `.dark` 结尾。

所以自定义 CSS 里这样匹配：

```css
:root:root[style*="color-scheme: dark"] { ... }
```

**为什么不用 `@media (prefers-color-scheme: dark)`**：那只覆盖「跟随系统」的情况，用户手动选 `default-dark` 时不会命中。

实测确认：

```
跟随系统 → htmlStyle = "color-scheme: light;" / "color-scheme: dark;"
手动切换 → 同样写到 style 属性上
```

### 为什么用 `:root:root`

自定义 CSS 被追加到 `body` 末尾，而主题变量定义在 `:root`。两者选择器优先级相同时，后出现的胜出，但为了稳妥（且避免被未来调整影响），用双写提高特异性。

### body 兜底的必要性

应用把主题色作为 fallback 内联进了变量引用：

```css
body { background: var(--background, #faf9f5); }
```

实测现象：只改变量时，`getComputedStyle(document.body).backgroundColor` 不会立即跟着变。加一条显式绑定解决：

```css
body {
  background-color: var(--background);
  color: var(--foreground);
}
```

---

## 五、可用的稳定锚点

写脚本时选择器要稳定，别依赖 Tailwind 类名。

### 路由

```
/                        首页
/explore                 发现
/calendar/:year?/:month?/:day?
/map                     地图
/attachments             附件
/memos/:uid              单条 memo
/memos/shares/:token     分享
/auth                    登录
/signup                  /admin /403 /404
```

### 语义标签与属性

- `<time datetime="...">` —— 时间，可用来补 `title`
- `a[href^="http"]` —— 链接，可判站内/站外
- `aria-label` / `aria-expanded` / `aria-checked` 等 ARIA 属性 —— base-ui 组件会输出
- `data-slot` —— base-ui 的插槽标记（**注意**：v0.31 编译产物里较难直接 grep 到，用前先在真实页面验证）

### 不要依赖

- **Tailwind 类名**（`.bg-muted`, `.text-sidebar-foreground` 等）—— 编译生成，含哈希，改版即失效
- **旧的语义类名**（`.note-card`, `.sidebar`, `.modal-content`）—— v0.30 起已不存在

---

## 六、实测验证方法

改完自定义样式，用浏览器控制台验证而不是靠猜：

```js
// 1. 当前变量值
(() => {
  const cs = getComputedStyle(document.documentElement);
  return JSON.stringify({
    bg: cs.getPropertyValue('--background').trim(),
    primary: cs.getPropertyValue('--primary').trim(),
    scheme: cs.colorScheme,
    htmlStyle: document.documentElement.getAttribute('style')
  });
})()

// 2. 变量消费是否正确（造个临时元素试）
(() => {
  const d = document.createElement('div');
  d.style.backgroundColor = 'var(--background)';
  document.body.appendChild(d);
  const bg = getComputedStyle(d).backgroundColor;
  d.remove();
  return bg;
})()

// 3. 注入的 style/script 是否在位
JSON.stringify({
  styleInBody: document.body.querySelectorAll('style').length,
  scriptInHead: document.head.querySelectorAll('script').length
})
```

### 抓取前端产物

```bash
# 找 CSS/JS 文件名（带哈希）
curl -s https://<实例>/ | grep -oE '/assets/[^"]+\.(css|js)'

# CSS 头部就是变量定义
curl -s https://<实例>/assets/index-XXXX.css | head -c 2000

# 在 JS 里搜注入逻辑
curl -s https://<实例>/assets/index-XXXX.js -o app.js
grep -o '.\{100\}additionalScript.\{250\}' app.js
```

---

## 七、升级排查清单

Memos 升级后自定义样式失效，按顺序查：

1. **变量名是否变了** —— 抓 CSS 产物看 `:root` 定义（见上）
2. **注入机制是否变了** —— 抓 JS 搜 `additionalScript`
3. **暗色判断方式是否变了** —— 看 `<html>` 的 `style` 属性，或搜 `colorScheme`
4. **是否变成了私有实例** —— v0.30 起，没设 instance URL 的实例会把匿名访客重定向到登录页
5. **主题列表是否新增** —— `['system','default','default-dark','paper']` 是 v0.31 的

### 已知的版本断点

| 版本 | 变化 |
|---|---|
| v0.30 | 前端换 Tailwind v4 + CSS 变量；Markdown 编辑器重写；MCP 重写；未设 instance URL 则变私有 |
| v0.31 | Shortcuts → Views；Spaces；日历/地图视图；导出导入 |

**v0.30 之前写的自定义 CSS 全部作废** —— 类名体系整个换了。

---

## 八、注意

- 实例范围脚本会下发到**所有访问者**的浏览器，不要写任何 token、密钥
- 脚本出错会影响页面观感（不是页面本身的功能，但要避免抛错中断）—— 用模块级 try/catch 隔离
- `localStorage` 可能被浏览器拒绝（隐私模式、第三方 Cookie 被禁），访问要包 try/catch，否则会中断整个脚本

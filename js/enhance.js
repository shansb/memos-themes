/* ============================================================
   Memos 实例范围 JavaScript · v0.31+ 增强工具集
   粘贴位置：设置 → 外观 → 实例范围 JavaScript
   ------------------------------------------------------------
   已验证的运行事实（在 mars 实例上实测）：
   · 注入方式 = <script> 挂 <head>，页面 complete 后执行一次
   · React 只管理 #root 内部，body 下自由添加的 DOM 不会被清除
   · 所以这里采用「全局一次性脚本 + 安全锚定」架构，不依赖具体 memo 页面结构
   · 找不到目标元素时静默跳过，不抛错、不干扰原生功能
   ============================================================ */

(function () {
  'use strict';

  /* ---------- 开关（想关掉哪项改成 false） ---------- */
  var OPTIONS = {
    hotkeys: true,        // 快捷键
    progressBar: true,    // 阅读进度条
    relativeTime: true,   // 时间 title 提示
    externalLinks: true,  // 外链新窗口
    fontZoom: true,       // 字号缩放
    scrollTop: true       // 回到顶部按钮
  };

  /* 防重复注入 */
  if (window.__memosEnhance) return;
  window.__memosEnhance = true;

  /* ============================================================
     工具函数
     ============================================================ */

  /* 等待元素出现（SPA 路由切换后 memo 才渲染） */
  function waitFor(selector, timeout) {
    return new Promise(function (resolve) {
      var existing = document.querySelector(selector);
      if (existing) return resolve(existing);

      var observer = new MutationObserver(function () {
        var el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          clearTimeout(timer);
          resolve(el);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      var timer = setTimeout(function () {
        observer.disconnect();
        resolve(null); // 超时不报错，返回 null 让调用方跳过
      }, timeout || 8000);
    });
  }

  /* 当前输入框是否聚焦（判断快捷键该不该响应） */
  function isTyping(el) {
    if (!el) return false;
    var tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
  }

  /* 安全的 localStorage 读写
     隐私模式 / 第三方 Cookie 被禁时访问 localStorage 会直接抛错，
     不能让它中断整个 boot() —— 所以统一包一层。 */
  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* 忽略 */ }
  }

  /* SPA 路由变化监听（React Router 用 history API，不触发页面加载） */
  function onRouteChange(fn) {
    // 覆盖 pushState/replaceState，让程序内导航也能感知
    ['pushState', 'replaceState'].forEach(function (m) {
      var orig = history[m];
      history[m] = function () {
        var ret = orig.apply(this, arguments);
        try { fn(location.pathname); } catch (e) {}
        return ret;
      };
    });
    // 浏览器前进后退
    window.addEventListener('popstate', function () {
      try { fn(location.pathname); } catch (e) {}
    });
  }

  /* ============================================================
     1. 快捷键
     约定：单键直接跳，g+字母 组合跳，? 显示帮助
     ============================================================ */
  function initHotkeys() {
    if (!OPTIONS.hotkeys) return;

    /* g 开头的组合键 */
    var G_MAP = {
      'h': '/',        // home
      'e': '/explore', // explore
      'c': '/calendar',// calendar
      'm': '/map',     // map
      'a': '/attachments' // attachments
    };

    var pendingG = false;
    var pendingGTimer = null;

    document.addEventListener('keydown', function (e) {
      /* 输入框里不响应，避免打字误触 */
      if (isTyping(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      /* Escape 取消组合键等待 */
      if (e.key === 'Escape' && pendingG) {
        pendingG = false;
        return;
      }

      /* g 组合键 */
      if (pendingG) {
        var target = G_MAP[e.key];
        pendingG = false;
        clearTimeout(pendingGTimer);
        if (target) {
          e.preventDefault();
          navigateTo(target);
        }
        return;
      }

      /* 等待组合：按 g */
      if (e.key === 'g') {
        pendingG = true;
        clearTimeout(pendingGTimer);
        pendingGTimer = setTimeout(function () { pendingG = false; }, 1200);
        return;
      }

      /* / 聚焦搜索框 */
      if (e.key === '/') {
        var search = document.querySelector(
          'input[type="search"], input[placeholder*="搜索"], input[placeholder*="search" i], [data-slot="search"] input'
        );
        if (search) {
          e.preventDefault();
          search.focus();
        }
        return;
      }

      /* ? 显示快捷键帮助 */
      if (e.key === '?') {
        e.preventDefault();
        toggleHelp();
        return;
      }

      /* + / - 缩放字号 */
      if (OPTIONS.fontZoom && (e.key === '+' || e.key === '-')) {
        e.preventDefault();
        zoomFont(e.key === '+' ? 1 : -1);
      }
    }, true);

    /* 客户端导航 */
    onRouteChange(function () { pendingG = false; });
  }

  /* SPA 导航：直接改地址栏由应用自己接管 */
  function navigateTo(path) {
    if (location.pathname === path) return;
    history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  /* ============================================================
     2. 快捷键帮助面板
     ============================================================ */
  var HELP_HTML =
    '<div id="memos-help-panel" style="' +
      'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'z-index:10001;padding:20px 24px;border-radius:12px;' +
      'background:var(--popover);color:var(--popover-foreground);' +
      'border:1px solid var(--border);box-shadow:var(--shadow-float);' +
      'font-size:14px;line-height:1.9;max-width:320px">' +
      '<div style="font-weight:600;margin-bottom:10px">快捷键</div>' +
      '<div><code>g h</code> · 首页</div>' +
      '<div><code>g e</code> · 发现</div>' +
      '<div><code>g c</code> · 日历</div>' +
      '<div><code>g m</code> · 地图</div>' +
      '<div><code>g a</code> · 附件</div>' +
      '<div><code>/</code> · 搜索</div>' +
      '<div><code>+ / -</code> · 字号</div>' +
      '<div><code>?</code> · 关闭本面板</div>' +
    '</div>';

  function toggleHelp() {
    var existing = document.getElementById('memos-help-panel');
    if (existing) { existing.remove(); return; }

    var wrap = document.createElement('div');
    wrap.innerHTML = HELP_HTML;
    document.body.appendChild(wrap.firstChild);

    /* 点击任意处或 Esc 关闭 */
    function close(e) {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      var p = document.getElementById('memos-help-panel');
      if (p) p.remove();
      document.removeEventListener('keydown', close, true);
      document.removeEventListener('click', close, true);
    }
    setTimeout(function () {
      document.addEventListener('keydown', close, true);
      document.addEventListener('click', close, true);
    }, 50);
  }

  /* ============================================================
     3. 阅读进度条
     ============================================================ */
  function initProgressBar() {
    if (!OPTIONS.progressBar) return;

    var bar = document.createElement('div');
    bar.id = 'memos-progress-bar';
    bar.style.cssText =
      'position:fixed;top:0;left:0;height:2px;width:0;' +
      'background:var(--primary);z-index:9999;transition:width .12s ease-out;' +
      'pointer-events:none';
    document.body.appendChild(bar);

    function update() {
      var doc = document.documentElement;
      var h = doc.scrollHeight - window.innerHeight;
      bar.style.width = h > 0 ? (window.scrollY / h) * 100 + '%' : '0%';
    }
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
  }

  /* ============================================================
     4. 时间 title 提示（相对时间）
     应用里时间是 <time> 或带 datetime 属性的元素，补 title 即可
     ============================================================ */
  function initRelativeTime() {
    if (!OPTIONS.relativeTime) return;

    function annotate() {
      var nodes = document.querySelectorAll('time[datetime], [data-timestamp]');
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (el.dataset.richTimeAnnotated) continue;

        var raw = el.getAttribute('datetime') || el.getAttribute('data-timestamp');
        if (!raw) continue;

        var d = new Date(/^\d+$/.test(raw) ? Number(raw) : raw);
        if (isNaN(d.getTime())) continue;

        var diff = Date.now() - d.getTime();
        var abs = Math.abs(diff);
        var text;

        if (abs < 60e3) text = '刚刚';
        else if (abs < 3600e3) text = Math.round(abs / 60e3) + ' 分钟前';
        else if (abs < 86400e3) text = Math.round(abs / 3600e3) + ' 小时前';
        else if (abs < 2592e6) text = Math.round(abs / 86400e3) + ' 天前';
        else {
          text = d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
        }

        el.title = (diff >= 0 ? text + ' · ' : '') + d.toLocaleString();
        el.dataset.richTimeAnnotated = '1';
      }
    }

    /* 首次执行 + SPA 导航后重扫 + 定期补充新渲染的元素 */
    setTimeout(annotate, 1500);
    onRouteChange(function () { setTimeout(annotate, 800); });

    /* MutationObserver 增量标注（比轮询省资源） */
    var mo = new MutationObserver(function () { annotate(); });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ============================================================
     5. 外链新窗口打开
     ============================================================ */
  function initExternalLinks() {
    if (!OPTIONS.externalLinks) return;

    function scan() {
      var host = location.hostname;
      var links = document.querySelectorAll('a[href^="http"]');
      for (var i = 0; i < links.length; i++) {
        var a = links[i];
        try {
          if (new URL(a.href).hostname === host) continue;
        } catch (e) { continue; }

        a.target = '_blank';
        /* noreferrer 防止新窗口拿到你笔记的地址 */
        a.rel = (a.rel ? a.rel + ' ' : '') + 'noopener noreferrer';
      }
    }

    setTimeout(scan, 1500);
    onRouteChange(function () { setTimeout(scan, 800); });

    var mo = new MutationObserver(function () { scan(); });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ============================================================
     6. 字号缩放（存 localStorage，刷新保持）
     ============================================================ */
  function zoomFont(dir) {
    var KEY = 'memos-font-zoom';
    var current = Number(storageGet(KEY) || 0);
    current = Math.min(3, Math.max(-2, current + dir));
    storageSet(KEY, current);

    document.documentElement.style.fontSize = current === 0 ? '' : (100 + current * 8) + '%';

    /* 轻提示 */
    var t = document.getElementById('memos-zoom-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'memos-zoom-toast';
      t.style.cssText =
        'position:fixed;bottom:24px;right:24px;padding:8px 14px;' +
        'border-radius:8px;background:var(--popover);color:var(--popover-foreground);' +
        'border:1px solid var(--border);box-shadow:var(--shadow-md);z-index:10000;' +
        'font-size:13px;transition:opacity .3s';
      document.body.appendChild(t);
    }
    t.textContent = current === 0 ? '字号已重置' : (current > 0 ? '+' : '') + current;
    t.style.opacity = '1';
    clearTimeout(t.__timer);
    t.__timer = setTimeout(function () { t.style.opacity = '0'; }, 1200);
  }

  function restoreFontZoom() {
    var saved = Number(storageGet('memos-font-zoom') || 0);
    if (saved !== 0) document.documentElement.style.fontSize = (100 + saved * 8) + '%';
  }

  /* ============================================================
     7. 回到顶部按钮
     ============================================================ */
  function initScrollTop() {
    if (!OPTIONS.scrollTop) return;

    var btn = document.createElement('button');
    btn.id = 'memos-scroll-top';
    btn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<polyline points="18 15 12 9 6 15"></polyline></svg>';
    btn.setAttribute('aria-label', '回到顶部');
    btn.style.cssText =
      'position:fixed;bottom:88px;right:24px;width:40px;height:40px;' +
      'display:flex;align-items:center;justify-content:center;' +
      'border-radius:50%;border:1px solid var(--border);cursor:pointer;' +
      'background:var(--popover);color:var(--popover-foreground);' +
      'box-shadow:var(--shadow-md);z-index:9998;' +
      'opacity:0;pointer-events:none;transition:opacity .25s, transform .25s;' +
      'transform:translateY(8px)';
    document.body.appendChild(btn);

    function update() {
      var show = window.scrollY > window.innerHeight * 1.2;
      btn.style.opacity = show ? '1' : '0';
      btn.style.pointerEvents = show ? 'auto' : 'none';
      btn.style.transform = show ? 'translateY(0)' : 'translateY(8px)';
    }
    window.addEventListener('scroll', update, { passive: true });

    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ============================================================
     启动
     ============================================================ */
  /* 每个模块独立 try/catch：任一模块出错不影响其余功能，
     也避免整个脚本因单点异常而静默失效。 */
  function safe(name, fn) {
    try {
      fn();
    } catch (e) {
      /* 只在控制台留痕，不打扰使用 */
      if (window.console && console.warn) {
        console.warn('[memos-enhance] ' + name + ' 失败：', e);
      }
    }
  }

  function boot() {
    safe('字号恢复', restoreFontZoom);
    safe('快捷键', initHotkeys);
    safe('进度条', initProgressBar);
    safe('回到顶部', initScrollTop);
    safe('时间提示', initRelativeTime);
    safe('外链处理', initExternalLinks);
  }

  /* 等 React 首屏渲染完成再挂全局元素（脚本注入时 body 可能还是空的） */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

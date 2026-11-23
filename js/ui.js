/* ============================================================
 * 全局框架：路由 / 导航 / 顶栏 / 抽屉 / 表格 / 通用组件
 * ============================================================ */
(function () {
  'use strict';
  const D = window.DB;

  /* ---------- 图标 ---------- */
  const IC = {
    dash: '<path d="M3 3h8v10H3zM13 3h8v6h-8zM13 11h8v10h-8zM3 15h8v6H3z"/>',
    map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zm0 2.2l6 2v11.6l-6-2V6.2z"/>',
    dev: '<path d="M4 4h16v12H4zM8 20h8M12 16v4" fill="none" stroke="currentColor" stroke-width="2"/>',
    db: '<ellipse cx="12" cy="5" rx="8" ry="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" fill="none" stroke="currentColor" stroke-width="2"/>',
    diag: '<path d="M12 2l9 5v10l-9 5-9-5V7l9-5zm0 4v6l4 2" fill="none" stroke="currentColor" stroke-width="2"/>',
    opt: '<path d="M12 8a4 4 0 100 8 4 4 0 000-8zm8 4l2-2-2-2-1.5.5-2-1.2L18 5h-3l-.5 1.5-2 .5-2-.5L10 5H7l-.5 2.3-2 1.2L3 8 1 10l2 2" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    task: '<path d="M9 3h6v3H9zM5 5h2v2h10V5h2v16H5V5zm3 7l2.5 2.5L15 10" fill="none" stroke="currentColor" stroke-width="2"/>',
    cost: '<path d="M12 3v18M7 8c0-2 2.2-3 5-3s5 1 5 3-2 2.6-5 3-5 1-5 3 2.2 3 5 3 5-1 5-3" fill="none" stroke="currentColor" stroke-width="2"/>',
    ai: '<path d="M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4L12 2zM19 15l1.2 2.8L23 19l-2.8 1.2L19 23l-1.2-2.8L15 19l2.8-1.2L19 15z"/>',
    cfg: '<path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="9" cy="6" r="2.4" fill="currentColor"/><circle cx="15" cy="12" r="2.4" fill="currentColor"/><circle cx="7" cy="18" r="2.4" fill="currentColor"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2"/>',
    bell: '<path d="M12 3a6 6 0 00-6 6v4l-2 4h16l-2-4V9a6 6 0 00-6-6zm-2 15a2 2 0 004 0" fill="none" stroke="currentColor" stroke-width="2"/>',
    reset: '<path d="M4 10a8 8 0 0114-4l2 2M20 4v4h-4M20 14a8 8 0 01-14 4l-2-2M4 20v-4h4" fill="none" stroke="currentColor" stroke-width="2"/>',
    export: '<path d="M12 3v12m0-12L8 7m4-4l4 4M4 15v5h16v-5" fill="none" stroke="currentColor" stroke-width="2"/>',
    back: '<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2"/>',
    link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1.2 1.2M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1.2-1.2" fill="none" stroke="currentColor" stroke-width="2"/>',
    topo: '<circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="5" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M7.3 11l9.4-5M7.3 13l9.4 5" stroke="currentColor" stroke-width="1.8" fill="none"/>',
    cam: '<path d="M3 7h12v10H3zM15 10l6-3v10l-6-3" fill="none" stroke="currentColor" stroke-width="2"/>',
    fan: '<circle cx="12" cy="12" r="2"/><path d="M12 10c0-4-1.5-7-4-7 5-1 6 4 4 7zm2 2c4 0 7-1.5 7-4 1 5-4 6-7 4zm-2 2c0 4 1.5 7 4 7-5 1-6-4-4-7zm-2-2c-4 0-7 1.5-7 4-1-5 4-6 7-4z"/>',
    bulb: '<path d="M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2zM9 20h6M10 22h4" fill="none" stroke="currentColor" stroke-width="2"/>',
    batt: '<rect x="3" y="8" width="16" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M21 11v3M7 11v3M11 11v3" stroke="currentColor" stroke-width="2"/>',
    road: '<path d="M4 21L9 3h6l5 18M12 5v3m0 4v3m0 4v2" fill="none" stroke="currentColor" stroke-width="2"/>',
    eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.6"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 16V6a2 2 0 012-2h10" fill="none" stroke="currentColor" stroke-width="2"/>',
    warn: '<path d="M12 3L2 21h20L12 3zm0 7v5m0 3v.5" fill="none" stroke="currentColor" stroke-width="2"/>',
    cube: '<path d="M12 2l9 5v10l-9 5-9-5V7l9-5zm0 0v10m9-5l-9 5m-9-5l9 5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    play: '<path d="M6 4l14 8-14 8z"/>',
    check: '<path d="M4 12l5 5L20 6" fill="none" stroke="currentColor" stroke-width="2.5"/>'
  };
  function icon(name, size) {
    return `<svg viewBox="0 0 24 24" fill="currentColor" style="width:${size || 16}px;height:${size || 16}px">${IC[name] || IC.dev}</svg>`;
  }

  /* ---------- 导航定义 ---------- */
  const NAV = [
    { key: 'dashboard', name: '综合驾驶舱', icon: 'dash' },
    { key: 'gis', name: '数字孪生一张图', icon: 'map' },
    { key: 'devices', name: '设备监测', icon: 'dev', children: [
      { name: '设备总览', params: {} }, { name: '监控设施', params: { cat: 'monitor' } },
      { name: '通信设施', params: { cat: 'comm' } }, { name: '收费设施', params: { cat: 'toll' } },
      { name: '供配电设施', params: { cat: 'power' } }, { name: '隧道机电', params: { cat: 'tunnel' } },
      { name: '内场机房', params: { cat: 'room' } }
    ]},
    { key: 'sources', name: '数据接入', icon: 'db', children: [
      { name: '数据源总览', params: {} }, { name: '字段映射', params: { tab: 'map' } }, { name: '数据质量', params: { tab: 'quality' } }
    ]},
    { key: 'diagnosis', name: '智能诊断', icon: 'diag', badge: true, children: [
      { name: '诊断事件总览', params: {}, key: 'diagnosis' },
      { name: '摄像机集体离线', params: {}, key: 'scene-camera' },
      { name: '照明区域异常', params: {}, key: 'scene-lighting' },
      { name: '重点设备分析', params: {}, key: 'keydev' },
      { name: '设备关系拓扑', params: {}, key: 'topology' }
    ]},
    { key: 'fan', name: '运行优化', icon: 'opt', children: [
      { name: '隧道风机优化', params: {}, key: 'fan' }, { name: '隧道照明调光', params: {}, key: 'light' }
    ]},
    { key: 'tasks', name: '现场作业统筹', icon: 'task' },
    { key: 'cost', name: '成本与决策', icon: 'cost', children: [
      { name: '运维成本分析', params: {}, key: 'cost' },
      { name: '成效评价', params: {}, key: 'kpi' }
    ]},
    { key: 'config', name: '基础配置', icon: 'cfg' }
  ];
  const ROLE_MENUS = {
    '运维管理人员': null,
    '运营管理人员': ['dashboard', 'gis', 'cost', 'kpi'],
    '监控值班人员': ['dashboard', 'gis', 'devices', 'diagnosis', 'scene-camera', 'scene-lighting'],
    '维护工程师': ['devices', 'keydev', 'topology', 'scene-camera', 'scene-lighting', 'sources'],
    '维保调度人员': ['dashboard', 'gis', 'tasks'],
    '系统配置人员': ['sources', 'config', 'devices', 'topology']
  };

  /* ---------- 路由 ---------- */
  const Pages = {};
  let current = { page: 'dashboard', params: {} };
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '') || 'dashboard';
    const [page, qs] = h.split('?');
    const params = {};
    if (qs) qs.split('&').forEach(kv => { const [k, v] = kv.split('='); params[decodeURIComponent(k)] = decodeURIComponent(v || ''); });
    return { page: Pages[page] ? page : 'dashboard', params };
  }
  function go(page, params) {
    const qs = params && Object.keys(params).length ? '?' + Object.entries(params).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&') : '';
    location.hash = '#/' + page + qs;
  }
  function render() {
    current = parseHash();
    const p = Pages[current.page];
    renderNav();
    const content = document.getElementById('content');
    content.scrollTop = 0;
    Charts.hideTip();
    closeDrawer();
    if (window.Twin) Twin.destroyAll();
    content.innerHTML = `<div class="crumb"><a href="#/dashboard">首页</a><span class="sep">/</span>${p.crumb ? `<a>${p.group || p.title}</a><span class="sep">/</span>` : ''}<span class="cur">${p.title}</span></div><div id="page-body" class="fade-in"></div>`;
    const body = document.getElementById('page-body');
    try { p.render(body, current.params); }
    catch (err) { console.error(err); body.innerHTML = `<div class="card"><div class="card-b"><div class="empty">页面渲染异常：${err.message}</div></div></div>`; }
    document.title = p.title + ' · 高速公路机电智能运维平台';
    syncRobot();
  }

  /* ---------- 导航渲染 ---------- */
  let role = '运维管理人员';
  function renderNav() {
    const nav = document.getElementById('nav');
    const allow = ROLE_MENUS[role];
    let html = '';
    NAV.forEach(item => {
      const childKeys = item.children ? item.children.map(c => c.key || item.key) : [item.key];
      const visible = !allow || childKeys.some(k => allow.includes(k)) || allow.includes(item.key);
      if (!visible) return;
      const activeGroup = childKeys.includes(current.page);
      if (item.children) {
        const open = activeGroup;
        html += `<div class="nav-group"><div class="nav-item ${activeGroup ? 'active' : ''} ${open ? 'open' : ''}" data-grp="${item.key}">${icon(item.icon)}<span>${item.name}</span>${item.badge ? '<span class="nav-badge">2</span>' : ''}<span class="arrow">▶</span></div><div class="nav-sub ${open ? 'open' : ''}">`;
        item.children.forEach(c => {
          const k = c.key || item.key;
          if (allow && !allow.includes(k) && !allow.includes(item.key)) return;
          const act = current.page === k && matchParams(k, c.params);
          html += `<div class="nav-sub-item ${act ? 'active' : ''}" data-page="${k}" data-params='${JSON.stringify(c.params)}'>${c.name}</div>`;
        });
        html += '</div></div>';
      } else {
        html += `<div class="nav-item ${current.page === item.key ? 'active' : ''}" data-page="${item.key}" data-params="{}">${icon(item.icon)}<span>${item.name}</span></div>`;
      }
    });
    nav.innerHTML = html;
    nav.querySelectorAll('[data-page]').forEach(el => {
      el.addEventListener('click', () => go(el.dataset.page, JSON.parse(el.dataset.params || '{}')));
    });
    nav.querySelectorAll('[data-grp]').forEach(el => {
      el.addEventListener('click', () => {
        const sub = el.nextElementSibling;
        const isOpen = sub.classList.contains('open');
        if (isOpen && el.classList.contains('active')) { sub.classList.remove('open'); el.classList.remove('open'); }
        else {
          // 点击组：进入第一个子页
          const first = sub.querySelector('[data-page]');
          if (first && !el.classList.contains('active')) go(first.dataset.page, JSON.parse(first.dataset.params || '{}'));
          else { sub.classList.add('open'); el.classList.add('open'); }
        }
      });
    });
  }
  function matchParams(pageKey, params) {
    if (pageKey !== current.page) return false;
    if (!params || !Object.keys(params).length) return !current.params.cat && !current.params.tab;
    return Object.entries(params).every(([k, v]) => current.params[k] === v);
  }

  /* ---------- 抽屉 / 弹窗 / Toast ---------- */
  function openDrawer(title, html, wide) {
    const dr = document.getElementById('drawer');
    dr.classList.toggle('wide', !!wide);
    dr.innerHTML = `<div class="drawer-h"><div class="drawer-t">${title}</div><span class="badge-demo">模拟数据</span><button class="drawer-x" onclick="UI.closeDrawer()">✕</button></div><div class="drawer-b dark-scroll">${html}</div>`;
    dr.classList.add('show');
    document.getElementById('drawer-mask').classList.add('show');
    return dr.querySelector('.drawer-b');
  }
  function closeDrawer() {
    document.getElementById('drawer').classList.remove('show');
    document.getElementById('drawer-mask').classList.remove('show');
  }
  function modal(title, html, footHtml) {
    const m = document.getElementById('modal');
    m.innerHTML = `<div class="drawer-h"><div class="drawer-t">${title}</div><button class="drawer-x" onclick="UI.closeModal()">✕</button></div><div class="drawer-b">${html}</div>${footHtml ? `<div style="padding:12px 18px;border-top:1px solid var(--line);display:flex;justify-content:flex-end;gap:8px">${footHtml}</div>` : ''}`;
    document.getElementById('modal-mask').classList.add('show');
    return m.querySelector('.drawer-b');
  }
  function closeModal() { document.getElementById('modal-mask').classList.remove('show'); }
  function toast(msg, type) {
    const t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.innerHTML = icon(type === 'ok' ? 'check' : type === 'warn' ? 'warn' : 'ai', 14) + '<span>' + msg + '</span>';
    document.getElementById('toasts').appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = 0; setTimeout(() => t.remove(), 320); }, 3200);
  }
  function copy(text) {
    const done = () => toast('已复制到剪贴板', 'ok');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(() => fallback());
    else fallback();
    function fallback() {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败，请手动选择文本', 'warn'); }
      ta.remove();
    }
  }

  /* ---------- 通用组件 ---------- */
  function statusTag(st, lg) {
    const s = D.STATUS[st] || D.STATUS.online;
    return `<span class="tag ${s.cls}${lg ? ' lg' : ''}"><span class="sd"></span>${s.name}</span>`;
  }
  function levelTag(lv) { const n = D.LEVELS[lv] || lv; return `<span class="lv lv-${n}">${n}</span>`; }
  function catTag(cat) {
    const c = D.CATS[cat];
    return `<span class="tag" style="background:${c.color}18;color:${c.color}">${c.name}</span>`;
  }
  function demoBadge(txt, cls) { return `<span class="badge-demo ${cls || ''}">${txt || '模拟数据'}</span>`; }
  function pageHead(title, desc, actions, badge) {
    return `<div class="page-head"><div><div class="page-title">${title} ${badge || demoBadge()}</div><div class="page-desc">${desc || ''}</div></div><div class="spacer"></div><div class="page-actions">${actions || ''}</div></div>`;
  }
  function kpi(label, val, sub, color, onclick, iconName, unit) {
    return `<div class="card kpi" style="--kc:${color || 'var(--blue)'}" ${onclick ? `onclick="${onclick}"` : ''}>
      <div class="kpi-label">${label}</div><div class="kpi-val">${val}${unit ? `<small>${unit}</small>` : ''}</div>
      <div class="kpi-sub">${sub || ''}</div>${iconName ? `<div class="kpi-icon">${icon(iconName)}</div>` : ''}</div>`;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  /* ---------- 表格 ---------- */
  function table(el, opt) {
    let sortKey = opt.sortKey || null, sortDir = opt.sortDir || -1, page = 1;
    const ps = opt.pageSize || 12;
    function draw() {
      let rows = opt.rows.slice();
      if (sortKey) {
        const col = opt.cols.find(c => c.key === sortKey);
        rows.sort((a, b) => {
          let va = col.sortVal ? col.sortVal(a) : a[sortKey], vb = col.sortVal ? col.sortVal(b) : b[sortKey];
          if (va == null) return 1; if (vb == null) return -1;
          if (typeof va === 'string') return va.localeCompare(vb, 'zh') * sortDir;
          return (va - vb) * sortDir;
        });
      }
      const total = rows.length, pages = Math.max(1, Math.ceil(total / ps));
      if (page > pages) page = pages;
      const view = rows.slice((page - 1) * ps, page * ps);
      let html = '<div class="tbl-wrap"><table class="tbl"><thead><tr>';
      opt.cols.forEach(c => {
        const arr = sortKey === c.key ? (sortDir > 0 ? '▲' : '▼') : '';
        html += `<th class="${c.sortable ? 'sortable' : ''}" data-sk="${c.key}" ${c.width ? `style="width:${c.width}"` : ''}>${c.title}${c.sortable ? `<span class="s-arr">${arr}</span>` : ''}</th>`;
      });
      html += '</tr></thead><tbody>';
      if (!view.length) html += `<tr><td colspan="${opt.cols.length}"><div class="empty">${icon('search', 32)}没有符合条件的记录${opt.onClear ? '，<a onclick="UI.tableClear()">清空筛选</a>' : ''}</div></td></tr>`;
      view.forEach((r, i) => {
        html += `<tr data-i="${(page - 1) * ps + i}" class="${opt.rowClass ? opt.rowClass(r) : ''}">`;
        opt.cols.forEach(c => { html += `<td class="${c.cls || ''}">${c.render ? c.render(r, opt.rows.indexOf(r)) : esc(r[c.key])}</td>`; });
        html += '</tr>';
      });
      html += '</tbody></table></div>';
      html += `<div class="pager"><span>共 <b>${total}</b> 条 · 第 ${page}/${pages} 页</span><span class="spacer"></span>
        <button class="pg-btn" data-pg="prev" ${page <= 1 ? 'disabled' : ''}>‹</button>`;
      const start = Math.max(1, Math.min(page - 2, pages - 4));
      for (let p = start; p <= Math.min(pages, start + 4); p++) html += `<button class="pg-btn ${p === page ? 'on' : ''}" data-pg="${p}">${p}</button>`;
      html += `<button class="pg-btn" data-pg="next" ${page >= pages ? 'disabled' : ''}>›</button></div>`;
      el.innerHTML = html;
      el.querySelectorAll('th.sortable').forEach(th => th.addEventListener('click', () => {
        const k = th.dataset.sk;
        if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = -1; }
        draw();
      }));
      el.querySelectorAll('.pg-btn').forEach(b => b.addEventListener('click', () => {
        const v = b.dataset.pg;
        if (v === 'prev') page--; else if (v === 'next') page++; else page = +v;
        draw();
      }));
      if (opt.onRow) el.querySelectorAll('tbody tr[data-i]').forEach(tr => tr.addEventListener('click', ev => {
        if (ev.target.closest('a,button')) return;
        opt.onRow(rows[+tr.dataset.i]);
      }));
    }
    draw();
    return { refresh: draw };
  }

  /* ---------- 设备详情抽屉 ---------- */
  function paramTemplate(dev) {
    const t = dev.type;
    const drop = dev.code === 'FIBER-07' ? { dropAt: 20, dropTo: -27.8 } : dev.code === 'L-CIR-03' ? { dropAt: 18, dropTo: 0.4 } : {};
    if (t.includes('摄像机')) return [
      { name: '视频码流', unit: 'Mbps', data: D.series(dev.code + 'a', 24, 4.2, 0.8, dev.status === 'offline' ? { dropAt: 21, dropTo: 0 } : {}), color: '#2f7bff' },
      { name: '图像质量评分', unit: '分', data: D.series(dev.code + 'b', 24, 92, 6, dev.status === 'offline' ? { dropAt: 21, dropTo: 0 } : {}), color: '#00b8d9' }
    ];
    if (t.includes('交换机')) return [
      { name: 'CPU利用率', unit: '%', data: D.series(dev.code + 'a', 24, 34, 14, { spikeAt: dev.code === 'SW-12' ? 21 : undefined, spike: 20 }), color: '#2f7bff' },
      { name: '上联口丢包率', unit: '%', data: D.series(dev.code + 'b', 24, 0.1, 0.2, dev.code === 'SW-12' ? { dropAt: 21, dropTo: 100 } : {}), color: '#ef4444' }
    ];
    if (t.includes('光缆') || t.includes('光传输')) return [
      { name: '接收光功率', unit: 'dBm', data: D.series(dev.code + 'a', 24, -12.4, 1.2, Object.assign({ fix: 1 }, drop)), color: '#00b8d9', threshold: -25 }
    ];
    if (t.includes('蓄电池')) return [
      { name: '组端电压', unit: 'V', data: D.series(dev.code + 'a', 24, 432, 3, { drift: -4 }), color: '#2f7bff' },
      { name: '最大单体内阻', unit: 'mΩ', data: D.series(dev.code + 'b', 24, 8.9, 0.6, { drift: 0.8 }), color: '#f59e0b' }
    ];
    if (t.includes('UPS')) return [
      { name: '负载率', unit: '%', data: D.series(dev.code + 'a', 24, 46, 10, { daily: true }), color: '#2f7bff' },
      { name: '输出电流', unit: 'A', data: D.series(dev.code + 'b', 24, 82, 12, { daily: true }), color: '#00b8d9' }
    ];
    if (t.includes('馈线') || t.includes('配电') || t.includes('断路器') || t.includes('变压器') || t.includes('机柜')) return [
      { name: 'A相电流', unit: 'A', data: D.series(dev.code + 'a', 24, dev.code === 'BRK-03' ? 16.2 : 62, 8, dev.code === 'BRK-03' ? { dropAt: 18, dropTo: 0.4 } : { daily: true }), color: '#2f7bff' },
      { name: '负载率', unit: '%', data: D.series(dev.code + 'b', 24, 58, 12, { daily: true }), color: '#f59e0b' }
    ];
    if (t.includes('风机')) return [
      { name: '运行功率', unit: 'kW', data: D.series(dev.code + 'a', 24, dev.ratedPower ? dev.ratedPower * 0.86 : 26, 3, { daily: true, cycles: 2 }), color: '#2f7bff' },
      { name: '振动速度', unit: 'mm/s', data: D.series(dev.code + 'b', 24, 2.1, 0.5), color: '#00b8d9' }
    ];
    if (t.includes('照明回路')) return [
      { name: '回路电流', unit: 'A', data: D.series(dev.code + 'a', 24, 16.2, 1.2, Object.assign({}, drop)), color: '#2f7bff' },
      { name: '回路功率', unit: 'kW', data: D.series(dev.code + 'b', 24, 3.6, 0.3, dev.code === 'L-CIR-03' ? { dropAt: 18, dropTo: 0.09 } : {}), color: '#f59e0b' }
    ];
    if (t.includes('灯具')) return [
      { name: '调光等级', unit: '%', data: D.series(dev.code + 'a', 24, 80, 10, dev.status === 'warn' ? { dropAt: 18, dropTo: 0 } : { daily: true }), color: '#f59e0b' }
    ];
    if (t.includes('CO/VI')) return [
      { name: 'CO浓度', unit: 'ppm', data: D.series(dev.code + 'a', 24, 12, 6, { daily: true, cycles: 2 }), color: '#2f7bff' },
      { name: 'VI能见度衰减', unit: '%', data: D.series(dev.code + 'b', 24, 18, 8, { daily: true, cycles: 2 }), color: '#8b5cf6' }
    ];
    if (t.includes('空调')) return [
      { name: '回风温度', unit: '℃', data: D.series(dev.code + 'a', 24, 24, 1.5, { daily: true }), color: '#2f7bff' },
      { name: '相对湿度', unit: '%', data: D.series(dev.code + 'b', 24, 48, 6, { daily: true }), color: '#00b8d9' }
    ];
    if (t.includes('服务器') || t.includes('存储')) return [
      { name: 'CPU利用率', unit: '%', data: D.series(dev.code + 'a', 24, 42, 18, { daily: true }), color: '#2f7bff' },
      { name: '内存占用', unit: '%', data: D.series(dev.code + 'b', 24, 63, 8), color: '#8b5cf6' }
    ];
    return [
      { name: '心跳间隔', unit: 's', data: D.series(dev.code + 'a', 24, 30, 3, dev.status === 'offline' ? { dropAt: 20, dropTo: 0 } : {}), color: '#2f7bff' }
    ];
  }
  function openDevice(code) {
    const dev = D.byCode[code];
    if (!dev) { toast('未找到设备 ' + code, 'warn'); return; }
    const src = D.sources.find(s => s.id === dev.sourceId);
    const rels = D.relations.filter(r => r.source === code || r.target === code);
    const devAlarms = D.alarms.filter(a => a.asset === code).slice(0, 8);
    const html = `
      <div class="flex ai-center wrap" style="margin-bottom:10px">
        ${statusTag(dev.status, true)} ${catTag(dev.cat)} <span class="tag plain">${dev.importance}</span>
        <span class="spacer" style="flex:1"></span>
        <button class="btn sm" onclick="UI.go('gis',{focus:'${code}'})">${icon('map', 13)} 孪生定位</button>
        <button class="btn sm" onclick="UI.go('topology',{focus:'${code}'})">${icon('topo', 13)} 拓扑关系</button>
        <button class="btn sm" onclick="UI.go('ai',{q:'${encodeURIComponent('设备' + code + '近30天有哪些异常？')}'})">${icon('ai', 13)} AI分析</button>
      </div>
      <div class="sec-t">设备身份</div>
      <div class="kv">
        <span class="k">统一编码</span><span class="v mono"><b>${dev.code}</b></span>
        <span class="k">设备名称</span><span class="v">${dev.name}</span>
        <span class="k">专业/类型</span><span class="v">${D.CATS[dev.cat].name} / ${dev.type}</span>
        <span class="k">厂家/型号</span><span class="v">${dev.vendor} / ${dev.model}</span>
        <span class="k">出厂编号</span><span class="v mono">${dev.serial}</span>
        <span class="k">安装日期</span><span class="v">${dev.installDate}</span>
      </div>
      <div class="sec-t">空间位置</div>
      <div class="kv">
        <span class="k">路段/方向</span><span class="v">${dev.road} · ${dev.direction}</span>
        <span class="k">桩号</span><span class="v mono">${dev.kmText}</span>
        <span class="k">位置</span><span class="v">${dev.place || dev.section}</span>
        <span class="k">经纬度</span><span class="v mono small">${dev.lng}, ${dev.lat}</span>
      </div>
      <div class="sec-t">运行信息</div>
      <div class="kv">
        <span class="k">在线状态</span><span class="v">${statusTag(dev.status)}</span>
        <span class="k">最近通信</span><span class="v">${D.fmtTime(dev.lastComm)}${dev.status === 'offline' ? ' <span class="tag err">数据中断</span>' : ''}</span>
        <span class="k">累计运行</span><span class="v">${dev.runHours.toLocaleString()} 小时</span>
        <span class="k">当前告警</span><span class="v">${devAlarms.filter(a => a.status === 'active').length} 条</span>
      </div>
      <div class="sec-t">参数趋势 <span class="badge-demo">模拟数据</span>
        <span style="flex:1"></span>
        <span class="btn-group" id="dev-range">
          <button class="seg on" data-r="24">近24小时</button><button class="seg" data-r="7">近7天</button><button class="seg" data-r="30">近30天</button>
        </span>
      </div>
      <div id="dev-charts"></div>
      <div class="sec-t">历史告警（${devAlarms.length}）</div>
      ${devAlarms.length ? devAlarms.map(a => `
        <div class="evi" style="cursor:pointer" onclick="UI.openAlarm('${a.id}')">
          <div class="evi-t">${levelTag(a.level)} ${a.type} <span style="flex:1"></span><span class="small muted">${a.status === 'active' ? '<span class="tag err">未解除</span>' : '<span class="tag ok">已恢复</span>'}</span></div>
          <div class="evi-d">${a.desc}</div>
          <div class="src">${D.fmtTime(a.start)} 发生${a.end ? ' · ' + D.fmtTime(a.end) + ' 恢复' : ''} · 来源 ${a.sourceId}</div>
        </div>`).join('') : '<div class="muted small" style="padding:4px 0">近期无告警记录（模拟数据）</div>'}
      <div class="sec-t">维护摘要</div>
      <div class="kv">
        <span class="k">最近维修</span><span class="v">${dev.lastRepair}</span>
        <span class="k">维修次数</span><span class="v">${dev.repairs} 次（历史摘要）</span>
        <span class="k">备件更换</span><span class="v">${dev.repairs > 2 ? '电源模块×1、驱动电源×2（历史记录）' : '暂无关键备件更换记录'}</span>
      </div>
      <div class="sec-t">关联设备（${rels.length}）</div>
      ${rels.length ? rels.slice(0, 10).map(r => {
        const other = r.source === code ? r.target : r.source;
        const od = D.byCode[other];
        return `<div class="evi" style="cursor:pointer;padding:8px 12px" onclick="UI.openDevice('${other}')">
          <div class="evi-t"><span class="tag ${r.status === 'down' ? 'err' : r.status === 'warn' ? 'warn' : 'info'}">${r.type}</span>
          <span class="mono">${r.source === code ? code + ' → ' + other : other + ' → ' + code}</span></div>
          <div class="src">${od ? od.name : ''} · ${r.note} · ${r.status === 'down' ? '<b style="color:var(--red)">链路中断</b>' : r.status === 'warn' ? '状态异常' : '正常'}</div>
        </div>`;
      }).join('') : '<div class="muted small">未维护关联关系（关系数据完整性提示：该设备暂无供电/通信/控制关系记录）</div>'}
      <div class="sec-t">数据来源</div>
      <div class="kv">
        <span class="k">来源平台</span><span class="v"><a onclick="UI.go('sources',{focus:'${dev.sourceId}'})">${src ? src.name : dev.sourceId}</a></span>
        <span class="k">接入方式</span><span class="v">${src ? src.access : '—'} · ${src ? src.api : ''}</span>
        <span class="k">最后更新</span><span class="v">${src ? D.fmtTime(src.sync) : '—'}</span>
        <span class="k">质量状态</span><span class="v">${src && src.status === '正常' ? '<span class="tag ok">正常</span>' : src && src.status === '延迟' ? '<span class="tag warn">同步延迟</span>' : '<span class="tag err">部分中断</span>'}</span>
      </div>`;
    const body = openDrawer(dev.name + ' <span class="mono small muted">' + dev.code + '</span>', html, true);
    // 趋势图
    const tpl = paramTemplate(dev);
    function drawRange(r) {
      const box = body.querySelector('#dev-charts');
      box.innerHTML = '';
      tpl.forEach(p => {
        const n = r === 24 ? 24 : r === 7 ? 28 : 30;
        const labels = D.hoursAxis(n, r === 24 ? 1 : r === 7 ? 6 : 24);
        const data = r === 24 ? p.data : D.series(dev.code + p.name + r, n, p.data.reduce((a, b) => a + b, 0) / p.data.length, Math.max(...p.data) - Math.min(...p.data) || 1, dev.status === 'offline' ? { dropAt: n - 3, dropTo: 0 } : {});
        const wrap = document.createElement('div');
        wrap.style.marginBottom = '6px';
        box.appendChild(wrap);
        Charts.line(wrap, { labels, series: [{ name: p.name, color: p.color, data, unit: p.unit }], height: 150, yUnit: p.unit, area: true, legend: false, threshold: p.threshold });
      });
    }
    drawRange(24);
    body.querySelectorAll('#dev-range .seg').forEach(b => b.addEventListener('click', () => {
      body.querySelectorAll('#dev-range .seg').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); drawRange(+b.dataset.r);
    }));
  }
  function openAlarm(id) {
    const a = D.alarms.find(x => x.id === id);
    if (!a) return;
    const dev = D.byCode[a.asset];
    openDrawer('告警详情 <span class="mono small muted">' + a.id + '</span>', `
      <div class="flex ai-center mb">${levelTag(a.level)} ${a.status === 'active' ? '<span class="tag err">未解除</span>' : '<span class="tag ok">已恢复</span>'} ${demoBadge()}</div>
      <div class="kv">
        <span class="k">告警类型</span><span class="v"><b>${a.type}</b></span>
        <span class="k">涉及设备</span><span class="v"><a class="mono" onclick="UI.openDevice('${a.asset}')">${a.asset}</a> ${dev ? dev.name : ''}</span>
        <span class="k">发生时间</span><span class="v">${D.fmtTime(a.start, 'full')}</span>
        <span class="k">恢复时间</span><span class="v">${a.end ? D.fmtTime(a.end, 'full') : '—'}</span>
        <span class="k">数据来源</span><span class="v">${a.sourceId}</span>
      </div>
      <div class="sec-t">告警描述</div><p style="font-size:12px;line-height:1.8;color:var(--text-2)">${a.desc}</p>
      <div class="divider"></div>
      <button class="btn primary" onclick="UI.openDevice('${a.asset}')">${icon('dev', 14)} 查看设备档案</button>
      <button class="btn" onclick="UI.go('topology',{focus:'${a.asset}'})">${icon('topo', 14)} 查看拓扑关系</button>`);
  }

  /* ---------- 顶栏 ---------- */
  function initTopbar() {
    const active = D.alarms.filter(a => a.status === 'active');
    document.getElementById('alarm-cnt').textContent = active.length;
    document.getElementById('alarm-btn').addEventListener('click', () => {
      openDrawer('当前告警（' + active.length + '）', active.map(a => {
        const dev = D.byCode[a.asset];
        return `<div class="evi" style="cursor:pointer" onclick="UI.openAlarm('${a.id}')">
          <div class="evi-t">${levelTag(a.level)} ${a.type}<span style="flex:1"></span><span class="small muted">${D.fmtTime(a.start)}</span></div>
          <div class="evi-d"><span class="mono" style="color:var(--blue-deep)">${a.asset}</span> ${dev ? dev.name : ''} — ${a.desc}</div>
        </div>`;
      }).join(''));
    });
    document.getElementById('role-sel').addEventListener('change', ev => {
      role = ev.target.value;
      toast('已切换角色：' + role + '（菜单与首页关注内容已调整）', 'ok');
      go('dashboard');
      renderNav();
    });
    document.getElementById('reset-btn').addEventListener('click', () => {
      localStorage.removeItem('demo-cfg-edits'); localStorage.removeItem('demo-light-plan');
      toast('模拟数据已重置为默认状态', 'ok');
      render();
    });
    const si = document.getElementById('top-search-input');
    si.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && si.value.trim()) { go('devices', { q: si.value.trim() }); si.value = ''; }
    });
    // 系统时钟
    const t0 = Date.now();
    setInterval(() => {
      const t = new Date(D.NOW.getTime() + (Date.now() - t0));
      document.getElementById('top-clock').innerHTML = `系统时间 <b>${D.fmtTime(t, 'full')}</b>`;
    }, 1000);
  }

  /* ---------- 全局 AI 助手小机器人 ---------- */
  const robot = { open: false, page: 'dashboard', greeted: false };
  function robotPresets() {
    const box = document.getElementById('rp-presets');
    if (!box) return;
    const list = window.AIEngine ? AIEngine.presetsFor(robot.page) : [];
    box.innerHTML = `<div class="rp-pt">猜你想问 · ${ (Pages[robot.page] || {}).title ? Pages[robot.page].title.split(' · ')[0] : '当前页面' }</div>` +
      list.map(q => `<button class="rp-chip" data-q="${esc(q)}">${esc(q)}</button>`).join('');
    box.querySelectorAll('.rp-chip').forEach(b => b.addEventListener('click', () => robotAsk(b.dataset.q)));
  }
  function syncRobot() {
    robot.page = current.page;
    const lab = document.getElementById('rp-page');
    if (lab) lab.textContent = (Pages[current.page] || {}).title || '';
    robotPresets();
    const btn = document.getElementById('robot-btn');
    if (btn) { btn.classList.remove('ping'); void btn.offsetWidth; btn.classList.add('ping'); }
  }
  function robotMsg(a) {
    const thread = document.getElementById('rp-thread');
    const wrap = document.createElement('div');
    wrap.className = 'rp-ai';
    const links = (a.links || []).map(l => l.code
      ? `<button class="btn sm" onclick="UI.openDevice('${l.code}')">${icon('dev', 12)} ${l.label}</button>`
      : `<button class="btn sm" onclick="UI.go('${l.page}'${l.params ? ',' + JSON.stringify(l.params).replace(/"/g, '&quot;') : ''})">${icon('link', 12)} ${l.label}</button>`).join('');
    wrap.innerHTML = `<div class="rp-ai-h">${icon('ai', 13)} 分析结论 ${demoBadge('模拟数据')}</div>
      <p class="rp-sum">${a.summary}</p>
      ${(a.data || []).length ? `<div class="rp-data">${a.data.map(x => `<div><span>${x.label}</span><b>${x.value}</b></div>`).join('')}</div>` : ''}
      ${(a.basis || []).length ? `<div class="rp-toggle" data-t>分析依据 ▾</div><div class="rp-basis" style="display:none">${a.basis.map(b => '<div>· ' + b + '</div>').join('')}</div>` : ''}
      ${(a.limits || []).length ? `<div class="rp-limits">${a.limits.map(l => '· ' + l).join('<br>')}</div>` : ''}
      ${links ? `<div class="rp-links">${links}</div>` : ''}`;
    thread.appendChild(wrap);
    const t = wrap.querySelector('[data-t]');
    if (t) t.addEventListener('click', () => {
      const b = wrap.querySelector('.rp-basis');
      const on = b.style.display === 'none';
      b.style.display = on ? 'block' : 'none';
      t.textContent = on ? '分析依据 ▴' : '分析依据 ▾';
    });
    thread.scrollTop = thread.scrollHeight;
  }
  function robotAsk(q) {
    q = (q || '').trim();
    if (!q || !window.AIEngine) return;
    const thread = document.getElementById('rp-thread');
    const u = document.createElement('div');
    u.className = 'rp-user'; u.textContent = q;
    thread.appendChild(u);
    robotMsg(AIEngine.answer(q, { page: robot.page }));
    const inp = document.getElementById('rp-input');
    if (inp) inp.value = '';
  }
  function robotWelcome() {
    const thread = document.getElementById('rp-thread');
    thread.innerHTML = `<div class="rp-hello"><b>${icon('ai', 14)} 运维分析助手</b>
      <div>我已读取当前页面的模拟数据上下文。点击上方预设问题即可快速分析，也可输入设备编码（CAM-01）/事件编号（EV-1123-01）。</div>
      <div class="muted">仅基于内置模拟数据作答 · 无数据则说明无法判断 · 不提供控制/审批/外部操作</div></div>`;
  }
  function initRobot() {
    const btn = document.getElementById('robot-btn');
    const panel = document.getElementById('robot-panel');
    btn.addEventListener('click', () => {
      robot.open = !robot.open;
      panel.classList.toggle('open', robot.open);
      btn.classList.toggle('on', robot.open);
      if (robot.open && !robot.greeted) { robot.greeted = true; robotWelcome(); }
      if (robot.open) setTimeout(() => document.getElementById('rp-input').focus(), 220);
    });
    document.getElementById('rp-close').addEventListener('click', () => {
      robot.open = false; panel.classList.remove('open'); btn.classList.remove('on');
    });
    document.getElementById('rp-reset').addEventListener('click', () => { robotWelcome(); toast('助手对话已重置', 'ok'); });
    document.getElementById('rp-send').addEventListener('click', () => robotAsk(document.getElementById('rp-input').value));
    document.getElementById('rp-input').addEventListener('keydown', ev => { if (ev.key === 'Enter') robotAsk(ev.target.value); });
    syncRobot();
  }

  /* ---------- 启动 ---------- */
  function boot() {
    document.getElementById('app').innerHTML = `
      <aside id="sidebar">
        <div class="brand"><div class="brand-logo">
          <div class="brand-mark"><svg viewBox="0 0 24 24" fill="#fff"><path d="M4 21L9 3h6l5 18h-3l-1.2-4H8.2L7 21H4zm5-7h6l-2.2-8h-1.6L9 14z"/></svg></div>
          <div><div class="brand-name">机电智能运维平台</div><div class="brand-sub">高速公路 · 数字孪生</div></div>
        </div></div>
        <nav id="nav" class="dark-scroll"></nav>
        <div class="sidebar-foot">A高速示范路段（虚构）<br>不连接真实设备与外部系统</div>
      </aside>
      <div id="main">
        <header id="topbar">
          <div class="top-road">${icon('road', 15)} A高速示范路段 <span class="tag plain">K0+000 — K58+000</span></div>
          <div class="top-search">${icon('search', 14)}<input id="top-search-input" placeholder="搜索设备编号 / 名称 / 桩号，回车检索"></div>
          <div class="top-spacer"></div>
          <div class="top-clock" id="top-clock"></div>
          <button class="top-icon-btn" id="alarm-btn" title="当前告警">${icon('bell', 16)}<span class="cnt" id="alarm-cnt"></span></button>
          <button class="top-icon-btn" id="reset-btn" title="重置模拟数据">${icon('reset', 15)}</button>
          <select class="role-select" id="role-sel" title="角色切换">
            ${Object.keys(ROLE_MENUS).map(r => `<option>${r}</option>`).join('')}
          </select>
          <div class="top-user"><div class="avatar">演</div><span>演示用户</span></div>
        </header>
        <main id="content"></main>
      </div>
      <div id="drawer-mask" onclick="UI.closeDrawer()"></div>
      <div id="drawer"></div>
      <div id="modal-mask"><div id="modal"></div></div>
      <div id="toasts"></div>
      <button id="robot-btn" title="AI 运维分析助手" aria-label="AI 运维分析助手">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 6.6A2.6 2.6 0 0 1 6.6 4h10.8A2.6 2.6 0 0 1 20 6.6v7.3a2.6 2.6 0 0 1-2.6 2.6H11l-4.3 3.1c-.55.4-1.3-.05-1.18-.7l.53-2.4A2.6 2.6 0 0 1 4 13.9z"/>
          <path d="M12 7.1c.32 2 .95 2.63 2.95 2.95-2 .32-2.63.95-2.95 2.95-.32-2-.95-2.63-2.95-2.95 2-.32 2.63-.95 2.95-2.95z" fill="currentColor" stroke="none"/>
        </svg>
      </button>
      <div id="robot-panel" role="dialog" aria-label="AI 运维分析助手">
        <div class="rp-h">
          <div class="rp-ava">${icon('ai', 16)}</div>
          <div class="rp-tt"><b>运维分析助手</b><span id="rp-page"></span></div>
          <button class="rp-ib" id="rp-reset" title="重置对话">${icon('reset', 14)}</button>
          <button class="rp-ib" id="rp-close" title="收起">✕</button>
        </div>
        <div class="rp-presets" id="rp-presets"></div>
        <div class="rp-thread" id="rp-thread"></div>
        <div class="rp-in">
          <input class="inp" id="rp-input" placeholder="输入问题 / 设备编码 / 事件编号…" autocomplete="off">
          <button class="btn primary" id="rp-send">${icon('ai', 14)} 分析</button>
        </div>
        <div class="rp-note">仅基于内置模拟数据 · 关联≠因果 · 不提供控制/审批/外部操作</div>
      </div>`;
    document.getElementById('modal-mask').addEventListener('click', ev => { if (ev.target.id === 'modal-mask') closeModal(); });
    initTopbar();
    initRobot();
    window.addEventListener('hashchange', render);
    render();
  }

  window.Pages = Pages;
  window.UI = {
    icon, go, render, openDrawer, closeDrawer, modal, closeModal, toast, copy,
    statusTag, levelTag, catTag, demoBadge, pageHead, kpi, esc, table, openDevice, openAlarm,
    paramTemplate, boot, get role() { return role; }, NAV
  };
})();
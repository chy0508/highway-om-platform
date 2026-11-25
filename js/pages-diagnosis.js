/* ============================================================
 * 页面：智能诊断中心 / 摄像机集体离线 / 照明区域异常 /
 *       重点设备分析 / 设备关系拓扑
 * 全部为模拟诊断结果，输出故障源候选而非已确认根因
 * ============================================================ */
(function () {
  'use strict';
  const D = window.DB, P = window.Pages, U = window.UI;
  const pad = (n, w) => String(n).padStart(w || 2, '0');

  /* ---------- 关系类型元数据 ---------- */
  const REL = {
    '网络上联': { color: '#2f7bff', dash: '' },
    '光链路': { color: '#00b8d9', dash: '' },
    '供电回路': { color: '#f59e0b', dash: '7,4' },
    '控制指令': { color: '#8b5cf6', dash: '2,3' },
    '同机柜': { color: '#64748b', dash: '1,4' }
  };
  const ST_COLOR = { online: '#16a34a', warn: '#f59e0b', offline: '#94a3b8' };

  /* ---------- 拓扑数据模型（灯具/风机聚合为组节点） ---------- */
  function topoModel() {
    const groupMap = {};
    const lmpMembers = [], jfMembers = [];
    for (let i = 1; i <= 18; i++) { const c = 'LMP-03-' + pad(i); groupMap[c] = 'GRP-LMP'; lmpMembers.push(c); }
    for (let i = 1; i <= 4; i++) { const c = 'JF-' + pad(i); groupMap[c] = 'GRP-JF'; jfMembers.push(c); }
    const POS = {
      'CSW-01': [905, 72], 'OTN-02': [700, 72], 'FIBER-07': [498, 72], 'SW-12': [300, 185],
      'CAM-01': [92, 70], 'CAM-02': [92, 132], 'CAM-03': [92, 194], 'CAM-04': [92, 256],
      'COVI-01': [92, 330], 'LC-01': [300, 332],
      'FDR-05': [905, 430], 'PDB-02': [700, 430], 'BRK-03': [520, 430], 'L-CIR-03': [340, 430], 'GRP-LMP': [120, 430],
      'CAB-03': [300, 548], 'GRP-JF': [92, 548], 'UPS-01': [905, 566], 'BAT-01': [700, 566]
    };
    const nodes = Object.keys(POS).map(code => {
      const [x, y] = POS[code];
      if (code === 'GRP-LMP') return { code, x, y, name: 'Z-03 灯具组', sub: '18盏 · LMP-03-01~18', status: 'warn', cat: 'tunnel', group: true, members: lmpMembers };
      if (code === 'GRP-JF') return { code, x, y, name: '射流风机组', sub: 'JF-01~04 · 4台', status: 'online', cat: 'tunnel', group: true, members: jfMembers };
      const d = D.byCode[code];
      return { code, x, y, name: d ? d.name.replace('青岭隧道北洞', '').replace('青岭北洞', '').replace('监控中心', '') : code, sub: d ? d.type : '', status: d ? d.status : 'online', cat: d ? d.cat : 'comm', dev: d };
    });
    const nodeBy = {}; nodes.forEach(n => nodeBy[n.code] = n);
    const seen = {}, edges = [];
    function addEdge(s, t, type, status, note) {
      s = groupMap[s] || s; t = groupMap[t] || t;
      if (s === t || !nodeBy[s] || !nodeBy[t]) return;
      const key = s + '>' + t + '>' + type;
      if (seen[key]) { if (status === 'down') seen[key].status = 'down'; else if (status === 'warn' && seen[key].status === 'normal') seen[key].status = 'warn'; return; }
      const e = { source: s, target: t, type, status: status || 'normal', note: note || '' };
      seen[key] = e; edges.push(e);
    }
    D.relations.forEach(r => addEdge(r.source, r.target, r.type, r.status, r.note));
    addEdge('SW-12', 'CAB-03', '同机柜', 'normal', '同处青岭北洞外场机柜03');
    addEdge('LC-01', 'PDB-02', '同机柜', 'normal', '同处北洞配电硐室');
    return { nodes, edges, nodeBy };
  }

  /* ---------- 拓扑渲染引擎（缩放/拖拽/高亮/类型筛选） ---------- */
  function mountTopo(container, model, opts) {
    opts = opts || {};
    const W = 1040, H = 640, height = opts.height || 540;
    const NW = 130, NH = 46;
    let scale = 1, tx = 0, ty = 0;
    let activeTypes = opts.types || new Set(Object.keys(REL));
    let focus = opts.focus || null;
    container.innerHTML = `
      <div class="topo-bar">
        <button class="hud-btn" data-z="in">${U.icon('search', 12)} 放大</button>
        <button class="hud-btn" data-z="out">缩小</button>
        <button class="hud-btn" data-z="center">居中</button>
        <button class="hud-btn" data-z="reset">${U.icon('reset', 12)} 重置布局</button>
        <span class="spacer" style="flex:1"></span>
        <span class="small" style="color:#7e95b8">拖拽平移 · 滚轮缩放 · 点击节点高亮上下游</span>
      </div>
      <div class="topo-wrap" style="height:${height}px">
        <svg class="topo-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="height:100%">
          <defs>
            ${Object.entries({ blue: '#2f7bff', cyan: '#00b8d9', amber: '#f59e0b', violet: '#8b5cf6', gray: '#64748b', red: '#ef4444' }).map(([k, c]) =>
              `<marker id="ar-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="${c}"/></marker>`).join('')}
          </defs>
          <g class="vp"></g>
        </svg>
        <div class="topo-tip"></div>
      </div>`;
    const svg = container.querySelector('.topo-svg');
    const vp = container.querySelector('.vp');
    const tip = container.querySelector('.topo-tip');
    const wrap = container.querySelector('.topo-wrap');
    const colorKey = c => ({ '#2f7bff': 'blue', '#00b8d9': 'cyan', '#f59e0b': 'amber', '#8b5cf6': 'violet', '#64748b': 'gray', '#ef4444': 'red' }[c] || 'blue');
    const edgeColor = e => e.status === 'down' ? '#ef4444' : e.status === 'warn' ? '#f59e0b' : (REL[e.type] || REL['网络上联']).color;

    // 边
    const edgeEls = model.edges.map(e => {
      const a = model.nodeBy[e.source], b = model.nodeBy[e.target];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const bow = e.type === '供电回路' ? 26 : e.type === '同机柜' ? -22 : 12;
      const cx = mx + (-dy / len) * bow, cy = my + (dx / len) * bow;
      const col = edgeColor(e);
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'topo-edge');
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hit.setAttribute('d', `M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`);
      hit.setAttribute('stroke', 'transparent'); hit.setAttribute('stroke-width', 14); hit.setAttribute('fill', 'none');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`);
      path.setAttribute('stroke', col); path.setAttribute('fill', 'none');
      path.setAttribute('stroke-width', e.status === 'down' ? 2.6 : e.status === 'warn' ? 2 : 1.5);
      path.setAttribute('stroke-dasharray', (REL[e.type] || {}).dash || '');
      path.setAttribute('marker-end', `url(#ar-${colorKey(col)})`);
      path.setAttribute('opacity', .9);
      g.appendChild(hit); g.appendChild(path); vp.appendChild(g);
      const showTip = ev => {
        const r = wrap.getBoundingClientRect();
        tip.innerHTML = `<b style="color:${col}">${e.type}</b> · ${e.source} → ${e.target}<br>${e.status === 'down' ? '<span style="color:#ff9d9d">链路中断</span>' : e.status === 'warn' ? '<span style="color:#fbbf24">状态异常</span>' : '正常'}${e.note ? ' · ' + e.note : ''}`;
        tip.style.display = 'block';
        tip.style.left = Math.min(ev.clientX - r.left + 12, r.width - 200) + 'px';
        tip.style.top = (ev.clientY - r.top + 12) + 'px';
      };
      hit.addEventListener('mousemove', showTip);
      hit.addEventListener('mouseleave', () => tip.style.display = 'none');
      hit.style.cursor = 'pointer';
      hit.addEventListener('click', ev => { ev.stopPropagation(); tip.style.display = 'none'; opts.onEdge && opts.onEdge(e); });
      return { e, g, path };
    });

    // 节点
    const nodeEls = model.nodes.map(n => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'topo-node');
      g.setAttribute('transform', `translate(${n.x},${n.y})`);
      const sc = ST_COLOR[n.status] || '#16a34a';
      const cc = (D.CATS[n.cat] || D.CATS.comm).color;
      g.innerHTML = `
        <rect class="nd-box" x="${-NW / 2}" y="${-NH / 2}" width="${NW}" height="${NH}" rx="8" fill="#0e2a4d" stroke="${sc}" stroke-width="${n.status === 'online' ? 1.3 : 2}" ${n.group ? 'stroke-dasharray="5,3"' : ''}/>
        <rect x="${-NW / 2}" y="${-NH / 2}" width="4" height="${NH}" rx="2" fill="${cc}"/>
        <circle cx="${-NW / 2 + 15}" cy="${-NH / 2 + 14}" r="4" fill="${sc}"/>
        <text x="${-NW / 2 + 25}" y="${-NH / 2 + 18}" font-size="12" font-weight="700" fill="#fff" font-family="Consolas,monospace">${n.code}</text>
        <text x="${-NW / 2 + 12}" y="${NH / 2 - 9}" font-size="9.5" fill="#9fb4d0">${U.esc(n.name.length > 13 ? n.name.slice(0, 13) + '…' : n.name)}</text>
        ${n.group ? `<rect x="${NW / 2 - 30}" y="${-NH / 2 - 8}" width="30" height="16" rx="8" fill="${cc}"/><text x="${NW / 2 - 15}" y="${-NH / 2 + 4}" font-size="9" fill="#fff" text-anchor="middle">${n.members.length}</text>` : ''}`;
      vp.appendChild(g);
      g.addEventListener('click', ev => { ev.stopPropagation(); opts.onNode && opts.onNode(n.code); });
      g.addEventListener('mousemove', ev => {
        const r = wrap.getBoundingClientRect();
        tip.innerHTML = `<b>${n.dev ? n.dev.name : n.name}</b><br>${n.code} · ${n.sub}<br>状态：${D.STATUS[n.status].name}${n.group ? ' · 点击展开成员' : ''}`;
        tip.style.display = 'block';
        tip.style.left = Math.min(ev.clientX - r.left + 12, r.width - 200) + 'px';
        tip.style.top = (ev.clientY - r.top + 12) + 'px';
      });
      g.addEventListener('mouseleave', () => tip.style.display = 'none');
      return { n, g };
    });

    function applyTransform() { vp.setAttribute('transform', `translate(${tx},${ty}) scale(${scale})`); }
    function neighbors(code) {
      const set = new Set([code]);
      model.edges.forEach(e => {
        if (!activeTypes.has(e.type)) return;
        if (e.source === code) set.add(e.target);
        if (e.target === code) set.add(e.source);
      });
      return set;
    }
    function refresh() {
      const vis = focus ? neighbors(focus) : null;
      edgeEls.forEach(({ e, g, path }) => {
        const typeOn = activeTypes.has(e.type);
        g.style.display = typeOn ? '' : 'none';
        if (!typeOn) return;
        const connected = !vis || (vis.has(e.source) && vis.has(e.target));
        path.setAttribute('opacity', connected ? .95 : .12);
      });
      nodeEls.forEach(({ n, g }) => {
        const hasEdge = model.edges.some(e => activeTypes.has(e.type) && (e.source === n.code || e.target === n.code));
        let op = 1;
        if (vis) op = vis.has(n.code) ? 1 : .16;
        else if (!hasEdge) op = .35;
        g.setAttribute('opacity', op);
        const box = g.querySelector('.nd-box');
        if (focus === n.code) { box.setAttribute('stroke', '#00b8d9'); box.setAttribute('stroke-width', 3); }
        else { box.setAttribute('stroke', ST_COLOR[n.status] || '#16a34a'); box.setAttribute('stroke-width', n.status === 'online' ? 1.3 : 2); }
      });
    }
    // 平移/缩放
    let dragging = false, sx = 0, sy = 0;
    svg.addEventListener('mousedown', ev => { if (ev.target.closest('.topo-node')) return; dragging = true; sx = ev.clientX; sy = ev.clientY; svg.style.cursor = 'grabbing'; });
    window.addEventListener('mousemove', ev => { if (!dragging) return; const r = svg.getBoundingClientRect(); const k = W / r.width; tx += (ev.clientX - sx) * k; ty += (ev.clientY - sy) * k; sx = ev.clientX; sy = ev.clientY; applyTransform(); });
    window.addEventListener('mouseup', () => { dragging = false; svg.style.cursor = 'grab'; });
    svg.addEventListener('wheel', ev => {
      ev.preventDefault();
      const r = svg.getBoundingClientRect();
      const mx = (ev.clientX - r.left) * (W / r.width), my = (ev.clientY - r.top) * (H / r.height);
      const f = ev.deltaY < 0 ? 1.12 : 0.89;
      const ns = Math.max(.45, Math.min(3.2, scale * f));
      tx = mx - (mx - tx) * (ns / scale); ty = my - (my - ty) * (ns / scale); scale = ns; applyTransform();
    }, { passive: false });
    function zoomBy(f) { const ns = Math.max(.45, Math.min(3.2, scale * f)); tx = W / 2 - (W / 2 - tx) * (ns / scale); ty = H / 2 - (H / 2 - ty) * (ns / scale); scale = ns; applyTransform(); }
    container.querySelectorAll('[data-z]').forEach(b => b.addEventListener('click', () => {
      const z = b.dataset.z;
      if (z === 'in') zoomBy(1.2); else if (z === 'out') zoomBy(0.83);
      else { scale = 1; tx = 0; ty = 0; applyTransform(); }
    }));
    svg.addEventListener('click', ev => { if (!ev.target.closest('.topo-node') && !ev.target.closest('.topo-edge')) { focus = null; refresh(); opts.onClear && opts.onClear(); } });
    applyTransform(); refresh();
    return {
      setFocus(code) { focus = code; refresh(); },
      clearFocus() { focus = null; refresh(); },
      setTypes(set) { activeTypes = set; refresh(); },
      reset() { scale = 1; tx = 0; ty = 0; focus = null; applyTransform(); refresh(); }
    };
  }

  /* ---------- 节点详情 HTML ---------- */
  function nodeDetail(code, model, api) {
    const n = model.nodeBy[code];
    if (!n) return '<div class="empty">请选择拓扑节点</div>';
    const up = model.edges.filter(e => e.target === code).map(e => ({ code: e.source, type: e.type, status: e.status, note: e.note }));
    const down = model.edges.filter(e => e.source === code).map(e => ({ code: e.target, type: e.type, status: e.status, note: e.note }));
    const d = n.dev;
    const alarms = d ? D.alarms.filter(a => a.asset === code).slice(0, 5) : [];
    const src = d ? D.sources.find(s => s.id === d.sourceId) : null;
    const relRow = r => `<div class="evi" style="padding:6px 10px;cursor:pointer;margin-bottom:5px" onclick="UI.openDevice('${r.code}')">
      <div class="evi-t small"><span class="tag ${r.status === 'down' ? 'err' : r.status === 'warn' ? 'warn' : 'info'}">${r.type}</span><span class="mono">${r.code}</span></div>
      <div class="src">${(D.byCode[r.code] || {}).name || r.code} · ${r.note || ''} · ${r.status === 'down' ? '<b style="color:var(--red)">中断</b>' : r.status === 'warn' ? '异常' : '正常'}</div></div>`;
    return `
      <div class="flex ai-center wrap mb">${U.statusTag(n.status, true)} ${U.catTag(n.cat)} ${n.group ? '<span class="tag violet">聚合节点</span>' : `<span class="tag plain">${d ? d.importance : ''}</span>`}</div>
      <div class="kv">
        <span class="k">节点编码</span><span class="v mono"><b>${code}</b></span>
        <span class="k">名称</span><span class="v">${d ? d.name : n.name}</span>
        <span class="k">类型</span><span class="v">${n.sub}${n.group ? '（' + n.members.length + ' 台聚合）' : ''}</span>
        ${d ? `<span class="k">位置</span><span class="v">${d.kmText} · ${d.place || d.section}</span>
        <span class="k">厂家/型号</span><span class="v">${d.vendor} / ${d.model}</span>` : ''}
      </div>
      ${n.group ? `<div class="sec-t">组成员（${n.members.length}）</div><div class="chip-row">${n.members.map(m => `<span class="ref-chip" onclick="UI.openDevice('${m}')">${m}</span>`).join('')}</div>` : ''}
      <div class="sec-t">上游节点（${up.length}）</div>
      ${up.length ? up.map(relRow).join('') : '<div class="muted small">无上游关系记录</div>'}
      <div class="sec-t">下游节点（${down.length}）</div>
      ${down.length ? down.map(relRow).join('') : '<div class="muted small">无下游关系记录</div>'}
      ${d ? `<div class="sec-t">相关告警（${alarms.length}）</div>
      ${alarms.length ? alarms.map(a => `<div class="evi" style="padding:6px 10px;cursor:pointer;margin-bottom:5px" onclick="UI.openAlarm('${a.id}')"><div class="evi-t small">${U.levelTag(a.level)} ${a.type}</div><div class="src">${D.fmtTime(a.start)} · ${a.status === 'active' ? '未解除' : '已恢复'}</div></div>`).join('') : '<div class="muted small">近期无告警</div>'}
      <div class="sec-t">数据来源</div><div class="kv"><span class="k">来源平台</span><span class="v">${src ? src.name : '—'}</span><span class="k">最近同步</span><span class="v">${src ? D.fmtTime(src.sync) : '—'}</span></div>` : ''}
      <div class="divider"></div>
      <div class="flex wrap">
        ${d ? `<button class="btn sm primary" onclick="UI.openDevice('${code}')">${U.icon('dev', 13)} 设备详情</button>
        <button class="btn sm" onclick="UI.go('gis',{focus:'${code}'})">${U.icon('map', 13)} 孪生定位</button>` : `<button class="btn sm primary" onclick="UI.go('scene-lighting')">照明诊断 ›</button>`}
        <button class="btn sm" id="nd-impact">${U.icon('eye', 13)} 查看影响范围</button>
      </div>
      <div class="note-box gray mt">拓扑相关性仅用于生成故障源候选，不等同于已确认根因。关系数据完整性：该节点已维护 ${up.length + down.length} 条关系记录。</div>`;
  }

  /* ---------- 通用：设备趋势图 ---------- */
  function devTrends(box, dev, range) {
    const tpl = U.paramTemplate(dev);
    box.innerHTML = '';
    tpl.forEach(p => {
      const n = range === 24 ? 24 : range === 7 ? 28 : 30;
      const labels = D.hoursAxis(n, range === 24 ? 1 : range === 7 ? 6 : 24);
      const avg = p.data.reduce((a, b) => a + b, 0) / p.data.length;
      const amp = Math.max(...p.data) - Math.min(...p.data) || 1;
      const data = range === 24 ? p.data : D.series(dev.code + p.name + range, n, avg, amp, dev.status === 'offline' ? { dropAt: n - 3, dropTo: 0 } : {});
      const wrap = document.createElement('div'); wrap.style.marginBottom = '8px'; box.appendChild(wrap);
      Charts.line(wrap, { labels, series: [{ name: p.name, color: p.color, data, unit: p.unit }], height: 168, yUnit: p.unit, area: true, legend: false, threshold: p.threshold });
    });
  }
  function rangeSeg(id, def) {
    return `<span class="btn-group" id="${id}"><button class="seg ${def === 24 ? 'on' : ''}" data-r="24">近24小时</button><button class="seg ${def === 7 ? 'on' : ''}" data-r="7">近7天</button><button class="seg ${def === 30 ? 'on' : ''}" data-r="30">近30天</button></span>`;
  }
  function bindRange(el, id, cb) {
    el.querySelectorAll('#' + id + ' .seg').forEach(b => b.addEventListener('click', () => {
      el.querySelectorAll('#' + id + ' .seg').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); cb(+b.dataset.r);
    }));
  }
  function summaryModal(title, text) {
    U.modal(title, `<div class="note-box blue mb">以下为系统根据当前数据生成的结构化摘要，可复制用于汇报。结论为候选建议，需现场确认。</div>
      <pre id="sum-text" style="white-space:pre-wrap;font-family:var(--font);font-size:12px;line-height:1.85;background:#f6f8fa;border:1px solid var(--line);border-radius:7px;padding:12px 14px;color:var(--text)">${U.esc(text)}</pre>`,
      `<button class="btn" onclick="UI.closeModal()">关闭</button><button class="btn primary" onclick="UI.copy(document.getElementById('sum-text').textContent)">${U.icon('copy', 14)} 复制摘要</button>`);
  }

  /* ================= 8.7 智能诊断中心 ================= */
  P.diagnosis = {
    title: '智能诊断中心 · 异常事件总览', group: '智能诊断', crumb: true,
    render(el, params) {
      const evs = D.events;
      const selected = evs.find(e => e.id === params.id);
      if (selected?.traceWindows) return P.diagnosis.renderDropoutTrace(el, selected, params);
      const cnt = st => evs.filter(e => e.status === st).length;
      const major = evs.filter(D.isOpenMajor).length;
      const state = { cat: 'all', type: 'all', level: params.level || 'all', status: params.status === 'open' ? 'open' : 'all', range: 'all', q: '' };
      el.innerHTML = U.pageHead('智能诊断中心 · 异常事件总览',
        '集中呈现设备异常、告警聚集与智能分析结果。系统输出故障源候选与检查优先级，诊断状态含“现场待确认”，不自动派发工单、不替代现场确认。',
        `<button class="btn" onclick="UI.openEvent('EV-1120-08')">${U.icon('diag', 14)} 间歇性掉线追溯</button>
         <button class="btn" onclick="UI.go('scene-camera')">${U.icon('cam', 14)} 摄像机离线场景</button>
         <button class="btn" onclick="UI.go('scene-lighting')">${U.icon('bulb', 14)} 照明异常场景</button>`, U.demoBadge('诊断分析')) +
        `<div class="grid g-6 mb" id="diag-kpis"></div>
        <div class="flex">
          <div class="grow">
            <div class="card mb"><div class="card-b">
              <div class="filter-bar">
                <input class="inp" id="dg-q" placeholder="搜索事件编号 / 名称 / 位置">
                <label class="fld">专业 <select class="sel" id="dg-cat"><option value="all">全部</option>${Object.keys(D.CATS).map(c => `<option value="${c}">${D.CATS[c].name}</option>`).join('')}</select></label>
                <label class="fld">类型 <select class="sel" id="dg-type"><option value="all">全部</option>${[...new Set(evs.map(e => e.type))].map(t => `<option>${t}</option>`).join('')}</select></label>
                <label class="fld">等级 <select class="sel" id="dg-level"><option value="all">全部</option><option>严重</option><option>重要</option><option>一般</option><option>提示</option></select></label>
                <label class="fld">诊断状态 <select class="sel" id="dg-status"><option value="all">全部</option><option value="open">未解除</option>${[...new Set(evs.map(e => e.status))].map(s => `<option>${s}</option>`).join('')}</select></label>
                <label class="fld">时间 <select class="sel" id="dg-range"><option value="all">全部</option><option value="24">近24小时</option><option value="168">近7天</option><option value="720">近30天</option></select></label>
                <button class="btn sm" id="dg-clear">${U.icon('reset', 13)} 清空</button>
              </div>
            </div></div>
            <div class="card"><div class="card-h"><span class="card-t">诊断事件列表</span><span class="sub">点击事件进入专属诊断 · 点击影响设备数下钻清单</span><span class="spacer"></span>${U.demoBadge()}</div>
              <div class="card-b tight" id="dg-table"></div></div>
          </div>
          <div style="width:320px;flex:0 0 320px">
            <div class="card dark-panel">
              <div class="card-h"><span class="card-t">高优先级诊断摘要</span><span class="spacer"></span>${U.demoBadge()}</div>
              <div class="card-b" id="diag-side"></div>
            </div>
            <div class="card mt">
              <div class="card-h"><span class="card-t">诊断状态分布</span></div>
              <div class="card-b" id="diag-status-chart"></div>
            </div>
            <div class="note-box mt">诊断建议不是自动工单派发；“现场待确认”仅为诊断状态标识。关联评分为算法评分，不代表真实故障概率。</div>
          </div>
        </div>`;
      el.querySelector('#diag-kpis').innerHTML =
        U.kpi('诊断事件', evs.length, '近30天累计', '#2f7bff', null, 'diag', '起') +
        U.kpi('未解除重大', major, '含等待业务复核的严重事件', '#ef4444', "UI.go('diagnosis',{level:'严重',status:'open'})", 'warn', '起') +
        U.kpi('已生成候选', cnt('已生成候选原因'), '含故障源候选与评分', '#00b8d9', null, 'check', '起') +
        U.kpi('现场待确认', cnt('现场待确认'), '需现场核查后确认', '#f59e0b', null, 'eye', '起') +
        U.kpi('分析中', cnt('分析中'), '关联分析进行中', '#8b5cf6', null, 'opt', '起') +
        U.kpi('已确认/恢复', evs.filter(e => e.status.includes('已恢复') || e.status.includes('已确认')).length, '确认记录', '#16a34a', null, 'check', '起');
      // 侧栏
      const hi = evs.filter(e => !e.status.includes('已恢复') && (e.level === '严重' || e.level === '重要')).slice(0, 3);
      el.querySelector('#diag-side').innerHTML = hi.map(e => `
        <div style="border:1px solid var(--line-dark);border-radius:7px;padding:10px 12px;margin-bottom:9px;background:rgba(22,64,122,.22)">
          <div class="flex ai-center" style="gap:6px">${U.levelTag(e.level)}<span class="small" style="color:#7e95b8">${D.fmtTime(e.time)}</span></div>
          <div style="color:#eaf2fc;font-size:12.5px;font-weight:600;margin:5px 0">${e.name}</div>
          <div style="color:#9fb4d0;font-size:11px;line-height:1.6">${e.recoverySummary || e.summary}</div>
          <div style="color:#7ee7fa;font-size:11px;margin-top:6px">${e.candidate}</div>
          ${e.score ? `<div class="score-bar" style="background:#1c3a63"><i style="width:${e.score}%"></i></div><div class="small" style="color:#6d84a6;margin-top:3px">关联评分 ${e.score}</div>` : ''}
          <button class="hud-btn" style="margin-top:8px" onclick="UI.openEvent('${e.id}')">进入诊断分析 ›</button>
        </div>`).join('');
      // 状态分布
      const stCount = {};
      evs.forEach(e => stCount[e.status] = (stCount[e.status] || 0) + 1);
      const stColors = { '已生成候选原因': '#00b8d9', '现场待确认': '#f59e0b', '待复核': '#eab308', '分析中': '#8b5cf6', '已恢复': '#16a34a', '已确认/已恢复': '#16a34a' };
      Charts.donut(el.querySelector('#diag-status-chart'), {
        size: 150, thick: .62, center: evs.length, centerSub: '事件',
        items: Object.keys(stCount).map(s => ({ name: s, value: stCount[s], color: stColors[s] || '#94a3b8' })),
        onClick: it => { state.status = it.name; el.querySelector('#dg-status').value = it.name; drawTable(); }
      });
      function filtered() {
        return evs.filter(e => {
          if (state.cat !== 'all' && e.cat !== state.cat) return false;
          if (state.type !== 'all' && e.type !== state.type) return false;
          if (state.level !== 'all' && e.level !== state.level) return false;
          if (state.status === 'open' ? e.status.includes('已恢复') : state.status !== 'all' && e.status !== state.status) return false;
          if (state.range !== 'all' && (D.NOW - e.time) / 3600000 > +state.range) return false;
          if (state.q) { const q = state.q.toLowerCase(); if (!(e.id.toLowerCase().includes(q) || e.name.toLowerCase().includes(q) || e.place.toLowerCase().includes(q))) return false; }
          return true;
        });
      }
      const lvOrder = { '严重': 4, '重要': 3, '一般': 2, '提示': 1 };
      function drawTable() {
        U.table(el.querySelector('#dg-table'), {
          rows: filtered(), pageSize: 10, sortKey: 'time', sortDir: -1,
          cols: [
            { key: 'id', title: '事件编号', sortable: true, render: e => `<span class="code">${e.id}</span>` },
            { key: 'name', title: '事件名称', render: e => `<b>${e.name}</b><br><span class="small muted">${e.type}${D.isOpenMajor(e) ? `<span data-event-read="${e.id}"> · ${U.isNoticeRead('event', e.id) ? '已读' : '未读'}</span>` : ''}</span>` },
            { key: 'cat', title: '专业', render: e => U.catTag(e.cat) },
            { key: 'level', title: '等级', sortable: true, sortVal: e => lvOrder[e.level], render: e => U.levelTag(e.level) },
            { key: 'time', title: '发生时间', sortable: true, sortVal: e => e.time.getTime(), render: e => `<span class="small muted">${D.fmtTime(e.time)}</span>` },
            { key: 'place', title: '位置', render: e => `<span class="small">${e.place}</span>` },
            { key: 'affected', title: '影响设备', sortable: true, sortVal: e => e.affected.length, cls: 'num', render: e => `<a class="tag ${e.affected.length > 4 ? 'err' : 'info'}" onclick="event.stopPropagation();UI.diagnosisAffected('${e.id}')">${e.affected.length} 台</a>` },
            { key: 'duration', title: '持续', render: e => `<span class="small muted">${e.duration}</span>` },
            { key: 'status', title: '诊断状态', render: e => `<span class="tag ${e.status.includes('候选') ? 'cyan' : e.status.includes('待') ? 'warn' : e.status.includes('恢复') || e.status.includes('确认') ? 'ok' : 'violet'}">${e.status}</span>` },
            { key: 'op', title: '操作', render: e => `<a onclick="event.stopPropagation();UI.openEvent('${e.id}')">诊断 ›</a> <a title="查看拓扑" onclick="event.stopPropagation();UI.go('topology',{focus:'${e.affected[0]}'})">${U.icon('topo', 14)}</a>` }
          ],
          onRow: e => U.openEvent(e.id),
          rowClass: e => e.level === '严重' && !e.status.includes('恢复') ? 'hl' : ''
        });
      }
      window.UI.diagnosisAffected = id => {
        const e = evs.find(x => x.id === id);
        U.openDrawer('受影响设备清单 · ' + e.id, `
          <div class="flex ai-center mb">${U.levelTag(e.level)} <b>${e.name}</b> ${U.demoBadge()}</div>
          <div class="note-box blue mb">事件发生时涉及 ${e.affected.length} 台设备。点击查看设备档案。${e.recoverySummary || ''}</div>
          ${e.affected.map(c => { const d = D.byCode[c]; return `<div class="evi" style="cursor:pointer" onclick="UI.openDevice('${c}')"><div class="evi-t">${U.statusTag(d.status)} <span class="mono">${c}</span></div><div class="evi-d">${d.name} · ${d.kmText} ${d.place}</div></div>`; }).join('')}
          ${e.related.length ? `<div class="sec-t">关联分析对象（${e.related.length}）</div>${e.related.map(c => { const d = D.byCode[c]; return `<div class="evi" style="cursor:pointer;padding:7px 12px" onclick="UI.openDevice('${c}')"><div class="evi-t small"><span class="mono">${c}</span> ${U.statusTag(d.status)}</div><div class="src">${d.name}</div></div>`; }).join('')}` : ''}
          <button class="btn primary mt" onclick="UI.openEvent('${e.id}')">进入诊断分析 ›</button>`, true);
      };
      function sync() {
        for (const key of ['cat','type','level','status','range']) el.querySelector('#dg-' + key).value = state[key];
      }
      sync(); drawTable();
      let qt;
      el.querySelector('#dg-q').addEventListener('input', ev => { clearTimeout(qt); qt = setTimeout(() => { state.q = ev.target.value.trim(); drawTable(); }, 200); });
      [['#dg-cat', 'cat'], ['#dg-type', 'type'], ['#dg-level', 'level'], ['#dg-status', 'status'], ['#dg-range', 'range']].forEach(([s, k]) => el.querySelector(s).addEventListener('change', ev => { state[k] = ev.target.value; drawTable(); }));
      el.querySelector('#dg-clear').addEventListener('click', () => { Object.assign(state, { cat: 'all', type: 'all', level: 'all', status: 'all', range: 'all', q: '' }); el.querySelector('#dg-q').value = ''; sync(); drawTable(); });
      if (params.id) U.openEvent(params.id);
    }
  };

  /* ================= 8.8 场景5｜摄像机集体离线 ================= */
  function cameraReviewPanel(box, event, open) {
    const task = D.tasks.find(t => t.eventId === event.id);
    const review = task.review;
    const verified = review?.outcome === 'verified';
    const history = Array.isArray(review?.history) ? review.history : [];
    function receipt(record) {
      const time = new Date(record.time);
      return `<div class="evi"><div class="evi-t"><span class="tag ${record.outcome === 'verified' ? 'ok' : 'warn'}">${record.outcome === 'verified' ? '已恢复 · 已销项' : '待复核'}</span>
        ${Number.isNaN(+time) ? '' : '<small class="muted">登记于 ' + D.fmtTime(time, 'full') + '</small>'}</div>
        <div class="evi-d">${D.describeCameraChecks(record.checks)}</div>
        ${record.note ? '<div class="src">现场记录　' + U.esc(record.note) + '</div>' : ''}</div>`;
    }
    box.innerHTML = `<div class="card-h"><span class="card-t">业务恢复核验</span><span class="sub">路维智策 · CAM-01 至 CAM-04</span><span class="spacer"></span>
      <button class="btn sm" onclick="UI.go('tasks',{id:'${task.id}'})">现场任务 ${task.id}</button></div>
      <div class="card-b">
        ${review ? receipt(review) : '<p class="small muted">逐路核对网络心跳和实时画面，抽查四路录像回放，完成稳定观察后销项。</p>'}
        ${history.length ? `<details class="mb"><summary>此前核验记录（${history.length}）</summary>${history.slice().reverse().map(receipt).join('')}</details>` : ''}
        ${verified ? '' : `<details id="sc-review-form" ${open ? 'open' : ''}><summary style="color:var(--blue);cursor:pointer;font-weight:600">${review ? '继续复核' : '登记恢复核验'}</summary>
          <form class="mt">
            <div class="flex wrap mb">
              <button type="button" class="btn sm" data-sample="frozen">载入返网后冻结工况</button>
              <button type="button" class="btn sm" data-sample="live">载入四路恢复工况</button>
            </div>
            <div class="filter-bar">${event.affected.map(code => `<label class="fld">${code} 实时画面
              <select class="sel" name="${code}" required><option value="">请选择</option><option value="offline">设备离线</option><option value="frozen">已在线，画面冻结</option><option value="live">已在线，画面连续</option></select></label>`).join('')}</div>
            <div class="flex wrap mt">
              <label class="check"><input type="checkbox" name="playback"> 四路录像均可回放</label>
              <label class="check"><input type="checkbox" name="stable"> 稳定观察期内画面连续</label>
              <label class="check"><input type="checkbox" name="link"> 上联端口及光功率复测正常</label>
            </div>
            <label class="fld mt" style="display:block">现场备注（选填）<textarea class="inp" name="note" rows="2" maxlength="500" style="display:block;width:100%"></textarea></label>
            <div class="flex ai-center wrap mt"><button class="btn primary" type="submit">保存核验结果</button><small class="muted">核验记录保存在当前浏览器。</small></div>
          </form></details>`}
      </div>`;
    const form = box.querySelector('form');
    if (!form) return;
    const fields = form.elements;
    if (review?.checks) {
      event.affected.forEach(c => { fields[c].value = review.checks.streams?.[c] || ''; });
      ['playback', 'stable', 'link'].forEach(key => { fields[key].checked = review.checks[key] === true; });
    }
    form.querySelectorAll('[data-sample]').forEach(button => button.onclick = () => {
      const healthy = button.dataset.sample === 'live';
      event.affected.forEach((c, i) => { fields[c].value = healthy || i > 0 ? 'live' : 'frozen'; });
      fields.playback.checked = healthy;
      fields.stable.checked = healthy;
      fields.link.checked = true;
    });
    form.onsubmit = ev => {
      ev.preventDefault();
      const streams = Object.fromEntries(event.affected.map(c => [c, fields[c].value]));
      const checks = { streams, playback: fields.playback.checked, stable: fields.stable.checked, link: fields.link.checked };
      try {
        if (!D.saveCameraReview(checks, fields.note.value)) {
          U.render();
          U.toast('请核对最新现场记录', 'warn');
          return;
        }
      } catch {
        U.toast('浏览器未能保存本次记录，请重试', 'warn');
        return;
      }
      U.render();
      U.toast(event.status === '已恢复' ? '四路业务核验通过，事件已销项' : '已保存，事件保留待复核', 'ok');
    };
    if (open) box.scrollIntoView({ block: 'start' });
  }
  P['scene-camera'] = {
    title: '摄像机集体离线关联诊断', group: '智能诊断', crumb: true,
    render(el, params) {
      const e = D.events.find(x => x.id === 'EV-1123-01');
      const cams = e.affected;
      const offlineCount = cams.filter(code => D.byCode[code].status === 'offline').length;
      const model = topoModel();
      let confirmed = null;
      const candidates = [
        { name: 'FIBER-07 上联光缆链路劣化/中断', score: 86, level: '高', why: '接收光功率 -27.8dBm 低于门限 -25dBm，劣化发生在摄像机离线之前；SW-12 上联光口随之 Down。', ev: ['光功率劣化告警 09:38', 'SW-12 上联端口Down 09:41'] },
        { name: 'SW-12 上联光口/光模块故障', score: 72, level: '高', why: '上联光口 GE0/0/25 状态 Down，历史存在端口 CRC 错误记录，光模块异常可导致上联中断。', ev: ['上联端口Down', '历史CRC错误（已恢复）'] },
        { name: 'SW-12 整机供电/设备故障', score: 41, level: '中', why: '4台摄像机共用 SW-12，整机故障可解释集体离线；但 CAB-03 供电与 PoE 当前正常，可能性降低。', ev: ['共用接入交换机', 'CAB-03供电正常'] },
        { name: 'CAB-03 供电回路异常', score: 18, level: '低', why: '供电/PoE 状态当前未发现同步异常，4台摄像机供电回路正常，暂不支持供电故障判断。', ev: ['PoE供电正常'] }
      ];
      el.innerHTML = U.pageHead('青岭隧道北洞摄像机集体离线',
        '青岭隧道北向 K18+500 附近，CAM-01~CAM-04 在 78 秒内相继离线。系统结合网络拓扑、告警时序与供电状态寻找共同故障源候选。',
        `<button class="btn" onclick="UI.go('diagnosis')">${U.icon('back', 14)} 返回诊断中心</button>
         <button class="btn" id="sc-impact">${U.icon('eye', 14)} 查看影响范围</button>
         <button class="btn" onclick="UI.go('gis',{focus:'SW-12'})">${U.icon('map', 14)} 孪生定位</button>
         <button class="btn primary" id="sc-summary">${U.icon('copy', 14)} 生成诊断摘要</button>`, U.demoBadge('诊断分析')) +
        `<div class="card dark-panel mb">
          <div class="card-b">
            <div class="flex ai-center wrap" style="gap:8px;margin-bottom:10px">
              ${U.levelTag(e.level)} <span class="mono" style="color:#7ee7fa">${e.id}</span>
              <span style="color:#eaf2fc;font-weight:600">${e.name}</span>
              <span class="tag ${e.status === '已恢复' ? 'ok' : 'warn'}" id="sc-status">${e.status}</span>
              <span class="spacer" style="flex:1"></span>
              <span class="small" style="color:#7e95b8">发生 ${D.fmtTime(e.time)} · 位置 ${e.place}</span>
            </div>
            <div class="grid g-6" style="gap:9px">
              <div class="dp-kpi"><div class="l">当前离线摄像机</div><div class="v ${offlineCount ? 'rd' : 'cy'}">${offlineCount}<small> 台</small></div></div>
              <div class="dp-kpi"><div class="l">共用接入交换机</div><div class="v cy" style="font-size:16px">SW-12</div></div>
              <div class="dp-kpi"><div class="l">上联光链路</div><div class="v am" style="font-size:16px">FIBER-07</div></div>
              <div class="dp-kpi"><div class="l">离线时间窗</div><div class="v">78<small> 秒</small></div></div>
              <div class="dp-kpi"><div class="l">关联评分</div><div class="v cy">86<small> /100</small></div></div>
              <div class="dp-kpi"><div class="l">首次诊断时已持续</div><div class="v am">48<small> 分钟</small></div></div>
            </div>
          </div>
        </div>
        <div class="card mb" id="sc-review"></div>
        <div class="flex">
          <div style="width:250px;flex:0 0 250px">
            <div class="card">
              <div class="card-h"><span class="card-t">涉事摄像机清单</span><span class="spacer"></span>${U.demoBadge()}</div>
              <div class="card-b tight" id="sc-cams"></div>
            </div>
            <div class="card mt">
              <div class="card-h"><span class="card-t">空间位置示意</span></div>
              <div class="card-b" id="sc-spatial"></div>
            </div>
            <div class="card mt">
              <div class="card-h"><span class="card-t">供电/PoE 状态</span></div>
              <div class="card-b">
                <div class="kv"><span class="k">外场机柜</span><span class="v"><a class="mono" onclick="UI.openDevice('CAB-03')">CAB-03</a> ${U.statusTag('online')}</span>
                <span class="k">PoE回路</span><span class="v"><span class="tag ok">供电正常</span></span>
                <span class="k">AC→DC</span><span class="v">AC220V→DC48V 正常</span></div>
                <div class="note-box mt">供电状态当前未发现同步异常，不支持将本次离线判定为供电故障。</div>
              </div>
            </div>
          </div>
          <div class="grow">
            <div class="card">
              <div class="card-h">
                <span class="btn-group" id="sc-tabs">
                  <button class="seg on" data-t="topo">${U.icon('topo', 13)} 网络/供电拓扑</button>
                  <button class="seg" data-t="time">${U.icon('bell', 13)} 告警时序</button>
                  <button class="seg" data-t="evi">${U.icon('diag', 13)} 分析证据</button>
                </span>
                <span class="spacer"></span>${U.demoBadge()}
              </div>
              <div class="card-b" id="sc-center"></div>
            </div>
          </div>
          <div style="width:330px;flex:0 0 330px">
            <div class="card">
              <div class="card-h"><span class="card-t">关联分析结论</span><span class="spacer"></span>${U.demoBadge('诊断分析')}</div>
              <div class="card-b" id="sc-concl"></div>
            </div>
          </div>
        </div>
        <div class="card mt">
          <div class="card-h"><span class="card-t">诊断过程时间线</span><span class="sub">问题出现 → 数据汇聚 → 智能分析 → 结果输出</span><span class="spacer"></span>${U.demoBadge()}</div>
          <div class="card-b"><div class="timeline" id="sc-flow"></div></div>
        </div>`;
      cameraReviewPanel(el.querySelector('#sc-review'), e, params.review === '1');
      // 摄像机清单
      el.querySelector('#sc-cams').innerHTML = cams.map(c => {
        const d = D.byCode[c];
        return `<div class="evi" style="cursor:pointer;margin:6px 4px" data-cam="${c}">
          <div class="evi-t">${U.statusTag(d.status)} <span class="mono">${c}</span></div>
          <div class="evi-d small">${d.name}</div>
          <div class="src">${d.kmText} · 最近通信 ${D.fmtTime(d.lastComm)} · ${d.switchPort}</div>
        </div>`;
      }).join('');
      // 空间示意
      el.querySelector('#sc-spatial').innerHTML = `<div class="small muted mb">青岭隧道北洞 K18+420 — K18+600</div>
        <div style="position:relative;height:64px;background:linear-gradient(90deg,#0e2a4d,#16407a);border-radius:7px;border:1px solid var(--line-dark)">
          <div style="position:absolute;left:8px;right:8px;top:30px;height:4px;background:#2c4a75;border-radius:2px"></div>
          ${cams.map((c, i) => `<div title="${c} · ${D.STATUS[D.byCode[c].status].name}" data-cam="${c}" style="position:absolute;left:${18 + i * 22}%;top:22px;width:18px;height:18px;border-radius:50%;background:${ST_COLOR[D.byCode[c].status]};border:2px solid #dce8f5;cursor:pointer;transform:translateX(-50%)"></div>`).join('')}
          <div style="position:absolute;left:8px;bottom:4px;font-size:9px;color:#7e95b8">K18+420</div>
          <div style="position:absolute;right:8px;bottom:4px;font-size:9px;color:#7e95b8">K18+600</div>
        </div>
        <div class="small muted mt">灰色离线 · 橙色异常 · 绿色在线</div>`;
      // 结论面板
      function drawConcl() {
        el.querySelector('#sc-concl').innerHTML = `
          <div class="concl">
            <h4>${confirmed ? '共同故障源（已确认）' : '共同故障源候选'}</h4>
            <p>${confirmed ? '现场确认结果：<b>' + confirmed + '</b>（确认记录）。' : '优先排查 <b>SW-12 上联光链路 FIBER-07</b>；供电状态当前未发现同步异常。'}</p>
            <div class="score-bar"><i style="width:86%"></i></div>
            <div class="small muted" style="margin-top:4px">关联评分 86 / 100 · 不代表真实故障概率</div>
          </div>
          <div class="sec-t">可能原因排序（候选）</div>
          ${candidates.map((c, i) => `
            <div class="evi" style="${i === 0 ? 'border-color:#b5e8f2;background:#f0fbfd' : ''}">
              <div class="evi-t"><span class="tag ${c.level === '高' ? 'err' : c.level === '中' ? 'warn' : 'plain'}">${c.level}</span>${c.name}<span class="spacer" style="flex:1"></span><b class="mono small">${c.score}</b></div>
              <div class="score-bar"><i style="width:${c.score}%"></i></div>
              <div class="evi-d small">${c.why}</div>
              <div class="src">依据：${c.ev.join(' · ')}</div>
            </div>`).join('')}
          <div class="sec-t">建议优先检查对象</div>
          <div class="chip-row">
            <span class="ref-chip" onclick="UI.openDevice('FIBER-07')">① FIBER-07 光功率测试</span>
            <span class="ref-chip" onclick="UI.openDevice('SW-12')">② SW-12 上联光口/光模块</span>
            <span class="ref-chip" onclick="UI.openDevice('OTN-02')">③ OTN-02 管理站侧收光</span>
          </div>
          <div class="sec-t">故障发生时的影响</div>
          <p class="small" style="color:var(--text-2);line-height:1.7">青岭隧道北洞 4 台摄像机视频中断。同期 COVI-01 环境数据、LC-01 控制通信及管理站侧骨干环网正常。</p>
          <div class="note-box mt">边界说明：以上为拓扑+时序关联推导的候选原因，需现场核查光链路后确认。系统不直接判定“已确认交换机故障”。</div>
          <div class="divider"></div>
          <div class="flex wrap">
            <button class="btn sm" onclick="UI.go('topology',{focus:'SW-12'})">${U.icon('topo', 13)} 完整拓扑</button>
            <button class="btn sm" onclick="UI.go('tasks',{id:'FT-03'})">关联现场任务 FT-03</button>
            <button class="btn sm" id="sc-confirm">${U.icon('check', 13)} 登记现场核查</button>
          </div>`;
        el.querySelector('#sc-confirm').addEventListener('click', () => {
          U.modal('登记现场核查', `<div class="note-box blue mb">现场检查后填写确认结果。核查记录保存在当前浏览器。</div>
            <div class="sec-t">选择现场确认的故障源</div>
            ${candidates.map(c => `<label class="check" style="display:flex;padding:7px 0"><input type="radio" name="cf" value="${c.name}"> ${c.name}（评分${c.score}）</label>`).join('')}
            <div class="sec-t">确认备注</div><input class="inp" id="cf-note" style="width:100%" value="OTDR测试发现FIBER-07光缆接头损耗过大">`,
            `<button class="btn" onclick="UI.closeModal()">取消</button><button class="btn primary" id="cf-ok">确认</button>`);
          setTimeout(() => {
            const ok = document.getElementById('cf-ok');
            ok && ok.addEventListener('click', () => {
              const sel = document.querySelector('input[name=cf]:checked');
              if (!sel) { U.toast('请选择现场核实的故障源', 'warn'); return; }
              confirmed = sel.value;
              U.closeModal(); drawConcl();
              U.toast('已记录现场确认结果：' + confirmed, 'ok');
            });
          }, 50);
        });
      }
      drawConcl();
      // 中心标签页
      let topoApi = null;
      function drawCenter(tab) {
        const box = el.querySelector('#sc-center');
        if (tab === 'topo') {
          box.innerHTML = '<div id="sc-topo"></div><div class="note-box gray mt">拓扑显示当前链路状态。红色表示链路中断，琥珀色表示异常。点击节点查看上下游。</div>';
          topoApi = mountTopo(box.querySelector('#sc-topo'), model, {
            height: 470, focus: 'SW-12',
            onNode: code => { topoApi.setFocus(code); U.openDrawer('节点详情 · ' + code, nodeDetail(code, model, topoApi), true); bindImpact(); },
            onEdge: ed => { if (ed.status !== 'normal') U.go('diagnosis', { id: 'EV-1123-01' }); else U.toast(ed.type + '：' + ed.source + ' → ' + ed.target + '（正常）'); }
          });
          function bindImpact() { const b = document.getElementById('nd-impact'); b && b.addEventListener('click', () => { topoApi.setFocus('SW-12'); U.toast('已高亮 SW-12 下游受影响设备'); }); }
        } else if (tab === 'time') {
          box.innerHTML = `<div class="grid g-2"><div><div class="sec-t" style="margin-top:0">告警时序（09:38—09:42）</div><div class="timeline" id="sc-tl"></div></div>
            <div><div class="sec-t" style="margin-top:0">FIBER-07 接收光功率</div><div id="sc-opt"></div>
            <div class="sec-t">SW-12 上联口丢包率</div><div id="sc-loss"></div></div></div>`;
          const tl = [
            ['09:38:12', 'red', 'FIBER-07 接收光功率由 -12.4dBm 降至 -27.8dBm，低于门限 -25dBm（光功率劣化告警）'],
            ['09:41:05', 'red', 'SW-12 上联光口 GE0/0/25 误码率突增后状态 Down（上联端口Down·严重）'],
            ['09:41:24', 'amber', 'CAM-01 心跳丢失，视频码流中断（设备离线）'],
            ['09:41:41', 'amber', 'CAM-02 心跳丢失，视频码流中断'],
            ['09:41:58', 'amber', 'CAM-03 心跳丢失，视频码流中断'],
            ['09:42:15', 'amber', 'CAM-04 心跳丢失，视频码流中断（4台在78秒内相继离线）'],
            ['09:42:30', 'green', '系统触发关联分析：识别共用节点 SW-12，光功率劣化先于摄像机离线']
          ];
          box.querySelector('#sc-tl').innerHTML = tl.map(([t, c, x]) => `<div class="tl-item ${c}"><div class="tl-time">${t}</div><div class="tl-text">${x}</div></div>`).join('');
          Charts.line(box.querySelector('#sc-opt'), { labels: D.hoursAxis(24, 1), series: [{ name: '接收光功率', color: '#00b8d9', data: D.series('FIBER-07a', 24, -12.4, 1.2, { fix: 1, dropAt: 20, dropTo: -27.8 }), unit: 'dBm' }], height: 160, yUnit: 'dBm', threshold: -25, thresholdLabel: '门限 -25dBm', area: true, legend: false });
          Charts.line(box.querySelector('#sc-loss'), { labels: D.hoursAxis(24, 1), series: [{ name: '上联口丢包率', color: '#ef4444', data: D.series('SW-12b', 24, 0.1, 0.2, { dropAt: 21, dropTo: 100 }), unit: '%' }], height: 160, yUnit: '%', zero: true, area: true, legend: false });
        } else {
          const evid = [
            ['时间接近性', '4台摄像机离线时间集中在 09:41:24—09:42:15（78秒），不符合独立随机故障特征。', 'DS-01 视频监控平台 · 心跳/码流', 'amber'],
            ['共用接入交换机', 'CAM-01~04 均上联至 SW-12（端口 GE0/0/1~4），存在共同网络节点。', '设备关系 CFG-05 · 网络上联', 'cyan'],
            ['上联端口异常', 'SW-12 上联光口 GE0/0/25 状态 Down，误码率突增，时间晚于光功率劣化、早于摄像机离线。', 'DS-02 通信网管 · 端口状态', 'red'],
            ['光功率劣化先行', 'FIBER-07 接收光功率 09:38 降至 -27.8dBm（门限 -25dBm），先于全部离线事件。', 'DS-02 通信网管 · 光功率', 'red'],
            ['供电/PoE 正常', 'CAB-03 外场机柜供电正常，PoE 回路正常，未发现与离线同步的供电异常。', 'DS-04 电力监控 · 开关状态', 'green'],
            ['管理站侧正常', 'OTN-02 管理站侧收光正常，骨干环网正常，故障范围收敛至青岭北洞上联段。', 'DS-02 通信网管 · 光传输', 'green']
          ];
          box.innerHTML = `<div class="grid g-2">${evid.map(([t, x, s, c]) => `
            <div class="evi" style="border-left:3px solid var(--${c === 'cyan' ? 'cyan' : c === 'red' ? 'red' : c === 'green' ? 'green' : 'amber'})">
              <div class="evi-t">${t}</div><div class="evi-d">${x}</div><div class="src">数据来源：${s}</div>
            </div>`).join('')}</div>
            <div class="note-box blue mt">证据链结论：光功率劣化（FIBER-07）→ 上联口Down（SW-12）→ 摄像机集体离线，时间顺序与拓扑关系一致，支持“上联光链路故障”候选。供电证据不支持供电故障判断。</div>`;
        }
      }
      drawCenter('topo');
      el.querySelectorAll('#sc-tabs .seg').forEach(b => b.addEventListener('click', () => {
        el.querySelectorAll('#sc-tabs .seg').forEach(x => x.classList.remove('on'));
        b.classList.add('on'); drawCenter(b.dataset.t);
      }));
      // 影响范围
      el.querySelector('#sc-impact').addEventListener('click', () => {
        el.querySelectorAll('#sc-tabs .seg').forEach(x => x.classList.toggle('on', x.dataset.t === 'topo'));
        drawCenter('topo'); setTimeout(() => topoApi && topoApi.setFocus('SW-12'), 60);
        U.toast('已高亮共同节点 SW-12 及其下游受影响设备');
      });
      // 摄像机/空间点击定位
      el.querySelectorAll('[data-cam]').forEach(x => x.addEventListener('click', () => {
        const c = x.dataset.cam;
        el.querySelectorAll('#sc-tabs .seg').forEach(y => y.classList.toggle('on', y.dataset.t === 'topo'));
        drawCenter('topo'); setTimeout(() => topoApi && topoApi.setFocus(c), 60);
        U.openDevice(c);
      }));
      // 诊断过程时间线
      el.querySelector('#sc-flow').innerHTML = [
        ['问题出现', 'red', '09:41—09:42 青岭北洞4台摄像机集体离线，北洞视频监测中断，增加逐台排查工作量。'],
        ['数据汇聚', 'amber', '汇聚 DS-01 视频心跳/码流、DS-02 通信网管端口/光功率、DS-04 电力供电状态，跨3个厂家平台统一时间轴。'],
        ['智能分析', 'cyan', '时间关联（78秒集中离线）+ 拓扑关联（共用SW-12）+ 时序先后（光功率劣化先行）+ 供电排除，收敛共同故障源。'],
        ['结果输出', 'green', '输出故障源候选 FIBER-07/SW-12上联（关联评分86）、影响范围、优先检查节点与判断依据，供现场核查。'],
        ['业主价值', 'green', '由“逐台排查4台摄像机+交换机+供电”转为“优先核查1条上联光链路”，缩短定位时间、减少无效出车。']
      ].map(([t, c, x]) => `<div class="tl-item ${c}"><div class="tl-time">${t}</div><div class="tl-text">${x}</div></div>`).join('');
      // 摘要
      el.querySelector('#sc-summary').addEventListener('click', () => {
        summaryModal('摄像机集体离线 · 诊断摘要', `【事件】${e.id} ${e.name}
【等级】严重 【发生】${D.fmtTime(e.time)} 【位置】${e.place}
【现象】CAM-01~CAM-04 在78秒内相继离线，共用接入交换机 SW-12。
【共同故障源候选】SW-12 上联光链路 FIBER-07（关联评分 86/100，不代表真实故障概率）
【判断依据】
  1. FIBER-07 接收光功率 09:38 由 -12.4dBm 降至 -27.8dBm，低于门限 -25dBm；
  2. SW-12 上联光口 GE0/0/25 于 09:41 Down，先于摄像机离线；
  3. 4台摄像机共用 SW-12，离线时间高度集中；
  4. CAB-03 供电/PoE 正常，未发现同步供电异常。
【可能原因排序】FIBER-07光链路(86) > SW-12光口/光模块(72) > SW-12整机(41) > CAB-03供电(18)
【建议优先检查】① FIBER-07 光功率/OTDR测试 ② SW-12 上联光口与光模块 ③ OTN-02 管理站侧收光
【故障发生时的影响】青岭北洞4台摄像机视频中断，COVI-01/LC-01 通信同期正常。
【业务恢复核验】${e.status}　${e.recoverySummary || '等待现场核验'}（现场任务 FT-03）
【边界说明】本结论为诊断分析，需现场核查确认；供电状态当前未发现同步异常。`);
      });
    }
  };

  /* ================= 8.9 场景6｜照明区域异常 ================= */
  P['scene-lighting'] = {
    title: '隧道照明区域异常诊断', group: '智能诊断', crumb: true,
    render(el, params) {
      const e = D.events.find(x => x.id === 'EV-1123-02');
      const model = topoModel();
      const fieldTask = D.tasks.find(t => t.eventId === e.id);
      const zones = ['Z-01', 'Z-02', 'Z-03', 'Z-04', 'Z-05', 'Z-06'];
      let selZone = 'Z-03', evTab = 'power';
      el.innerHTML = U.pageHead('青岭隧道 Z-03 照明分区异常',
        '青岭隧道北向 Z-03 分区 18 盏灯具同时失去反馈。系统沿供电回路、控制指令与灯具反馈逐层缩小故障范围，输出可能故障层级与优先检查对象。',
        `<button class="btn" onclick="UI.go('diagnosis')">${U.icon('back', 14)} 返回诊断中心</button>
         <button class="btn" onclick="UI.go('gis',{mode:'tunnel',scene:'QL',focus:'Z-03'})">${U.icon('cube', 14)} 定位 Z-03 分区</button>
         <button class="btn" id="sl-check">${U.icon('check', 14)} 建议检查顺序</button>
         <button class="btn primary" id="sl-summary">${U.icon('copy', 14)} 生成诊断摘要</button>`, U.demoBadge('诊断分析')) +
        `<div class="card dark-panel mb"><div class="card-b">
          <div class="flex ai-center wrap" style="gap:8px;margin-bottom:10px">
            ${U.levelTag(e.level)} <span class="mono" style="color:#7ee7fa">${e.id}</span>
            <span style="color:#eaf2fc;font-weight:600">${e.name}</span><span class="tag ${e.status === '已恢复' ? 'ok' : 'warn'}">${e.status}</span>
            <span class="spacer" style="flex:1"></span><span class="small" style="color:#7e95b8">发生 ${D.fmtTime(e.time)} · ${e.place}</span>
          </div>
          ${fieldTask.review ? `<div class="mb"><b>现场核验 · ${e.status}</b>　${U.esc(fieldTask.review.note)}</div>` : ''}
          <div class="grid g-6" style="gap:9px">
            <div class="dp-kpi"><div class="l">事发分区</div><div class="v rd" style="font-size:18px">Z-03</div></div>
            <div class="dp-kpi"><div class="l">涉及灯具</div><div class="v am">18<small> 盏</small></div></div>
            <div class="dp-kpi"><div class="l">事发时回路电流</div><div class="v rd">0.4<small> A</small></div></div>
            <div class="dp-kpi"><div class="l">正常电流</div><div class="v">16.2<small> A</small></div></div>
            <div class="dp-kpi"><div class="l">关联评分</div><div class="v cy">82<small> /100</small></div></div>
            <div class="dp-kpi"><div class="l">持续时长</div><div class="v am">2<small> 时15分</small></div></div>
          </div>
        </div></div>
        <div class="flex">
          <div style="width:280px;flex:0 0 280px">
            <div class="card">
              <div class="card-h"><span class="card-t">隧道分区照明示意</span><span class="spacer"></span>${U.demoBadge()}</div>
              <div class="card-b" id="sl-zones"></div>
            </div>
            <div class="card mt">
              <div class="card-h"><span class="card-t">分区详情</span></div>
              <div class="card-b" id="sl-zone-detail"></div>
            </div>
          </div>
          <div class="grow">
            <div class="card">
              <div class="card-h"><span class="card-t">故障判断树</span><span class="sub">点击节点展开对应证据</span><span class="spacer"></span>${U.demoBadge()}</div>
              <div class="card-b" id="sl-tree"></div>
            </div>
            <div class="card mt">
              <div class="card-h"><span class="card-t">关联分析结论</span><span class="spacer"></span>${U.demoBadge('诊断分析')}</div>
              <div class="card-b" id="sl-concl"></div>
            </div>
          </div>
          <div style="width:330px;flex:0 0 330px">
            <div class="card">
              <div class="card-h"><span class="btn-group" id="sl-evtabs">
                <button class="seg on" data-t="power">供电</button><button class="seg" data-t="ctrl">控制</button><button class="seg" data-t="lamp">灯具</button>
              </span><span class="spacer"></span>${U.demoBadge()}</div>
              <div class="card-b" id="sl-evidence"></div>
            </div>
          </div>
        </div>`;
      // 分区示意
      function drawZones() {
        const box = el.querySelector('#sl-zones');
        box.innerHTML = `<div class="small muted mb">青岭隧道北洞 · 入口 → 出口（6 照明分区）</div>
          <div style="display:flex;gap:4px">${zones.map(z => {
            const bad = z === 'Z-03';
            return `<div data-zone="${z}" style="flex:1;cursor:pointer;text-align:center">
              <div style="height:70px;border-radius:6px;border:2px solid ${z === selZone ? '#00b8d9' : bad ? '#ef4444' : '#2c4a75'};background:${bad ? 'rgba(239,68,68,.18)' : 'rgba(22,64,122,.3)'};position:relative;display:flex;flex-wrap:wrap;align-content:center;justify-content:center;gap:3px;padding:6px">
                ${Array.from({ length: bad ? 18 : 16 }, (_, i) => `<span style="width:5px;height:5px;border-radius:50%;background:${bad ? '#ef4444' : '#ffd28a'}"></span>`).join('')}
              </div>
              <div class="small" style="margin-top:4px;color:${bad ? '#f87171' : z === selZone ? '#7ee7fa' : '#9fb4d0'};font-weight:${z === selZone ? 700 : 400}">${z}${bad ? ' ⚠' : ''}</div>
            </div>`;
          }).join('')}</div>
          <div class="legend mt"><span class="li"><span class="cd" style="background:#ffd28a"></span>正常灯具</span><span class="li"><span class="cd" style="background:#ef4444"></span>异常/无反馈</span></div>
          <div class="note-box mt">Z-03 分区 18 盏灯具同时无反馈，异常集中于同一供电回路 L-CIR-03。点击分区查看灯具与回路分布。</div>`;
        box.querySelectorAll('[data-zone]').forEach(z => z.addEventListener('click', () => { selZone = z.dataset.zone; drawZones(); drawZoneDetail(); }));
      }
      function drawZoneDetail() {
        const bad = selZone === 'Z-03';
        const cir = bad ? 'L-CIR-03' : 'L-CIR-0' + selZone.slice(-1);
        el.querySelector('#sl-zone-detail').innerHTML = `
          <div class="flex ai-center mb">${bad ? '<span class="tag err lg">异常</span>' : '<span class="tag ok lg">正常</span>'} <b>${selZone} 分区</b></div>
          <div class="kv">
            <span class="k">灯具数量</span><span class="v">${bad ? 18 : 16} 盏</span>
            <span class="k">供电回路</span><span class="v mono"><a onclick="UI.openDevice('${cir}')">${cir}</a></span>
            <span class="k">回路电流</span><span class="v">${bad ? '<b style="color:var(--red)">0.4 A</b>（正常16.2A）' : '15.8 A'}</span>
            <span class="k">断路器</span><span class="v mono">${bad ? '<a onclick="UI.openDevice(\'BRK-03\')">BRK-03</a> <span class="tag warn">反馈异常</span>' : '正常'}</span>
            <span class="k">控制器</span><span class="v mono"><a onclick="UI.openDevice('LC-01')">LC-01</a></span>
            <span class="k">灯具状态</span><span class="v">${bad ? '<span class="tag err">18盏无反馈</span>' : '<span class="tag ok">全部正常</span>'}</span>
          </div>
          ${bad ? `<button class="btn sm primary mt" onclick="UI.go('gis',{mode:'bim'})">${U.icon('cube', 13)} BIM查看Z-03</button>
          <button class="btn sm mt" onclick="UI.go('topology',{focus:'L-CIR-03'})">${U.icon('topo', 13)} 关联拓扑</button>` : `<div class="note-box gray mt">该分区当前正常。本页聚焦 Z-03 异常分区。</div>`}`;
      }
      drawZones(); drawZoneDetail();
      // 故障判断树
      const tree = [
        { id: 'root', t: '18盏灯具同时失去反馈', d: 'Z-03分区18盏灯具照度低于阈值、无回馈，非单灯随机故障。', tab: 'lamp', open: true, children: [
          { id: 'q1', t: '是否集中在同一供电回路？ → 是', d: '18盏灯具均属 L-CIR-03 回路（Z-03分组），异常高度集中，指向回路级而非单灯级。', tab: 'power', children: [
            { id: 'q2', t: '控制指令与实际反馈是否一致？ → 不一致', d: 'LC-01 下发合闸/调光指令，BRK-03 反馈为分闸，指令与反馈不一致。', tab: 'ctrl', children: [
              { id: 'q3', t: '断路器及回路电气量？ → 异常', d: 'BRK-03 反馈分闸；L-CIR-03 回路电流由16.2A突降至0.4A，功率由3.6kW降至0.09kW。', tab: 'power', children: [
                { id: 'c1', t: '单灯故障？ → 排除', d: '18盏同时异常，不符合单灯/驱动电源独立故障特征。', tab: 'lamp', leaf: 'exclude' },
                { id: 'c2', t: '回路/断路器故障？ → 候选（优先）', d: '回路电流骤降+断路器反馈分闸，优先检查 BRK-03 与 L-CIR-03 回路。', tab: 'power', leaf: 'hit' },
                { id: 'c3', t: '控制器/通信故障？ → 候选（次优）', d: 'LC-01 通信经 SW-12 正常，指令已下发但反馈不一致，控制器本体故障可能性次之。', tab: 'ctrl', leaf: 'mid' }
              ]}
            ]}
          ]}
        ]}
      ];
      function renderTree(nodes, depth) {
        return nodes.map(n => `
          <div style="margin-left:${depth * 16}px">
            <div class="evi" data-tree="${n.id}" style="cursor:pointer;margin-bottom:6px;${n.leaf === 'hit' ? 'border-color:#f3ddb0;background:#fef9f0' : n.leaf === 'exclude' ? 'opacity:.7' : ''}">
              <div class="evi-t">${n.children ? '<span class="small muted">▼</span>' : n.leaf === 'hit' ? '<span class="tag warn">优先</span>' : n.leaf === 'exclude' ? '<span class="tag plain">排除</span>' : '<span class="tag info">次优</span>'} ${n.t}</div>
              <div class="evi-d small">${n.d}</div>
              <div class="src">点击查看${n.tab === 'power' ? '供电' : n.tab === 'ctrl' ? '控制' : '灯具'}证据 ›</div>
            </div>
            ${n.children ? renderTree(n.children, depth + 1) : ''}
          </div>`).join('');
      }
      el.querySelector('#sl-tree').innerHTML = renderTree(tree, 0);
      const treeMap = {}; (function flat(ns) { ns.forEach(n => { treeMap[n.id] = n; if (n.children) flat(n.children); }); })(tree);
      el.querySelectorAll('[data-tree]').forEach(x => x.addEventListener('click', () => {
        const n = treeMap[x.dataset.tree];
        evTab = n.tab; syncEvTabs(); drawEvidence();
        U.toast('已展开「' + n.t.replace(/？.*/, '') + '」对应证据');
      }));
      // 证据面板
      function syncEvTabs() { el.querySelectorAll('#sl-evtabs .seg').forEach(b => b.classList.toggle('on', b.dataset.t === evTab)); }
      function drawEvidence() {
        const box = el.querySelector('#sl-evidence');
        if (evTab === 'power') {
          box.innerHTML = `
            <div class="sec-t" style="margin-top:0">供电链路</div>
            <div class="evi" style="cursor:pointer" onclick="UI.openDevice('PDB-02')"><div class="evi-t"><span class="mono">PDB-02</span> 照明配电柜 ${U.statusTag('online')}</div><div class="src">总状态正常 · Z-03馈线输出异常</div></div>
            <div class="evi" style="cursor:pointer;border-color:#f3ddb0" onclick="UI.openDevice('BRK-03')"><div class="evi-t"><span class="mono">BRK-03</span> 断路器 ${U.statusTag('warn')}</div><div class="evi-d small">指令合闸 / 反馈分闸，状态不一致</div><div class="src">DS-04 电力监控 · 开关状态</div></div>
            <div class="evi" style="cursor:pointer;border-color:#f3ddb0" onclick="UI.openDevice('L-CIR-03')"><div class="evi-t"><span class="mono">L-CIR-03</span> 照明回路 ${U.statusTag('warn')}</div><div class="evi-d small">电流 0.4A（正常16.2A）· 功率 0.09kW</div><div class="src">DS-05 隧道控制 · 回路电气量</div></div>
            <div class="sec-t">回路电流趋势</div><div id="sl-cur"></div>
            <div class="sec-t">回路功率趋势</div><div id="sl-pow"></div>`;
          Charts.line(box.querySelector('#sl-cur'), { labels: D.hoursAxis(24, 1), series: [{ name: '回路电流', color: '#2f7bff', data: D.series('L-CIR-03a', 24, 16.2, 1.2, { dropAt: 18, dropTo: 0.4 }), unit: 'A' }], height: 150, yUnit: 'A', area: true, legend: false });
          Charts.line(box.querySelector('#sl-pow'), { labels: D.hoursAxis(24, 1), series: [{ name: '回路功率', color: '#f59e0b', data: D.series('L-CIR-03b', 24, 3.6, 0.3, { dropAt: 18, dropTo: 0.09 }), unit: 'kW' }], height: 150, yUnit: 'kW', area: true, legend: false });
        } else if (evTab === 'ctrl') {
          box.innerHTML = `
            <div class="sec-t" style="margin-top:0">控制链路</div>
            <div class="evi" style="cursor:pointer" onclick="UI.openDevice('LC-01')"><div class="evi-t"><span class="mono">LC-01</span> 照明控制器 ${U.statusTag('online')}</div><div class="src">DS-05 隧道控制 · 控制指令</div></div>
            <div class="evi"><div class="evi-t">控制通信链路</div><div class="evi-d small">LC-01 → SW-12 网络上联正常，指令通道未中断。</div><div class="src">设备关系 · 网络上联（正常）</div></div>
            <div class="sec-t">指令与反馈核对（历史记录）</div>
            <div class="timeline">
              <div class="tl-item green"><div class="tl-time">08:14:50</div><div class="tl-text">LC-01 下发 Z-03 合闸/调光80% 指令</div></div>
              <div class="tl-item red"><div class="tl-time">08:15:02</div><div class="tl-text">BRK-03 反馈信号 = 分闸（与指令不一致）</div></div>
              <div class="tl-item red"><div class="tl-time">08:15:05</div><div class="tl-text">L-CIR-03 回路电流骤降至 0.4A</div></div>
              <div class="tl-item amber"><div class="tl-time">08:15:10</div><div class="tl-text">18盏灯具陆续无回馈，照度低于阈值</div></div>
            </div>
            <div class="note-box mt">指令已下发但断路器反馈分闸，提示故障可能在断路器/回路侧，而非控制通信中断。控制器本体故障为次优候选。</div>`;
        } else {
          const lamps = Array.from({ length: 18 }, (_, i) => 'LMP-03-' + pad(i + 1));
          box.innerHTML = `
            <div class="sec-t" style="margin-top:0">Z-03 灯具清单（18盏）</div>
            <div class="note-box blue mb">18盏灯具均无回馈、照度低于阈值，状态一致，支持回路级故障判断。单灯级定位需现场确认。</div>
            <div style="max-height:340px;overflow-y:auto" class="dark-scroll">
            ${lamps.map(c => { const d = D.byCode[c]; return `<div class="evi" style="cursor:pointer;padding:6px 10px;margin-bottom:5px" onclick="UI.openDevice('${c}')"><div class="evi-t small"><span class="mono">${c}</span> ${U.statusTag(d.status)}</div><div class="src">${d.name} · 调光反馈0% · 照度&lt;阈值</div></div>`; }).join('')}
            </div>
            <button class="btn sm mt" onclick="UI.go('devices',{q:'LMP-03'})">设备列表查看 ›</button>`;
        }
      }
      syncEvTabs(); drawEvidence();
      el.querySelectorAll('#sl-evtabs .seg').forEach(b => b.addEventListener('click', () => { evTab = b.dataset.t; syncEvTabs(); drawEvidence(); }));
      // 结论
      el.querySelector('#sl-concl').innerHTML = `
        <div class="grid g-2">
          <div class="concl"><h4>异常分区与故障层级</h4><p>异常分区 <b>Z-03</b>（18盏）。可能故障层级：<b>回路/断路器级</b>（优先），控制器级次之；已排除单灯级独立故障。</p>
            <div class="score-bar"><i style="width:82%"></i></div><div class="small muted" style="margin-top:4px">关联评分 82 / 100</div></div>
          <div><div class="sec-t" style="margin-top:0">相关对象清单</div>
            <div class="chip-row">
              <span class="ref-chip" onclick="UI.openDevice('L-CIR-03')">回路 L-CIR-03</span>
              <span class="ref-chip" onclick="UI.openDevice('BRK-03')">断路器 BRK-03</span>
              <span class="ref-chip" onclick="UI.openDevice('PDB-02')">配电柜 PDB-02</span>
              <span class="ref-chip" onclick="UI.openDevice('LC-01')">控制器 LC-01</span>
              <span class="ref-chip" onclick="UI.go('devices',{q:'LMP-03'})">灯具 ×18</span>
            </div>
            <div class="sec-t">判断依据</div>
            <p class="small" style="color:var(--text-2);line-height:1.7">① 18盏集中同一回路；② 指令合闸/反馈分闸不一致；③ 回路电流16.2A→0.4A；④ 控制通信正常。证据与拓扑关系一致。</p>
          </div>
        </div>
        <div class="note-box mt">定位粒度说明：本页具备回路级电气量与断路器反馈，可定位到回路/断路器；若仅有配电柜总状态，则定位粒度只能到配电柜/区域，不承诺单灯级定位。分析建议不等于已完成现场故障确认。</div>
        <div class="flex wrap mt">
          <button class="btn sm" onclick="UI.go('topology',{focus:'L-CIR-03'})">${U.icon('topo', 13)} 查看关联设备</button>
          <button class="btn sm" id="sl-check2">${U.icon('check', 13)} 查看建议检查顺序</button>
        </div>`;
      function checkOrder() {
        U.modal('建议检查顺序（分层排查）', `
          <div class="note-box blue mb">按“先供电后控制、先回路后单灯”的顺序分层排查，缩小故障范围。以下为建议，需现场执行并回填确认。</div>
          <div class="timeline">
            <div class="tl-item red"><div class="tl-time">第1层 · 优先</div><div class="tl-text"><b>BRK-03 断路器</b>：核查实际分合闸位置、脱扣机构、反馈触点；测量出线侧电压。</div></div>
            <div class="tl-item red"><div class="tl-time">第2层</div><div class="tl-text"><b>L-CIR-03 回路</b>：测量回路绝缘、电流、接线端子；排查回路短路/断路/接触不良。</div></div>
            <div class="tl-item amber"><div class="tl-time">第3层</div><div class="tl-text"><b>PDB-02 配电柜</b>：核查 Z-03 馈线输出、母排电压、保护动作记录。</div></div>
            <div class="tl-item amber"><div class="tl-time">第4层 · 次优</div><div class="tl-text"><b>LC-01 控制器</b>：核对指令输出与反馈采集回路，排除控制器本体/采样故障。</div></div>
            <div class="tl-item green"><div class="tl-time">第5层 · 验证</div><div class="tl-text"><b>灯具分组</b>：恢复供电后逐组验证灯具回馈与照度，确认无单灯级遗留故障。</div></div>
          </div>`, `<button class="btn" onclick="UI.closeModal()">关闭</button><button class="btn primary" onclick="UI.closeModal();UI.go('tasks',{id:'FT-02'})">${U.icon('task', 14)} 关联现场任务 FT-02</button>`);
      }
      el.querySelector('#sl-check').addEventListener('click', checkOrder);
      setTimeout(() => { const b = el.querySelector('#sl-check2'); b && b.addEventListener('click', checkOrder); }, 0);
      el.querySelector('#sl-summary').addEventListener('click', () => {
        summaryModal('照明区域异常 · 诊断摘要', `【事件】${e.id} ${e.name}
【等级】严重 【发生】${D.fmtTime(e.time)} 【位置】${e.place}
【现象】Z-03分区18盏灯具同时无反馈，回路电流由16.2A降至0.4A。
【异常分区】Z-03（青岭隧道北洞）
【可能故障层级】回路/断路器级（优先）；控制器级次之；已排除单灯级独立故障。
【判断依据】
  1. 18盏灯具均属 L-CIR-03 回路，异常集中；
  2. LC-01 指令合闸，BRK-03 反馈分闸，指令与反馈不一致；
  3. 回路电流16.2A→0.4A，功率3.6kW→0.09kW；
  4. LC-01→SW-12 控制通信正常，排除通信中断。
【相关对象】L-CIR-03回路 / BRK-03断路器 / PDB-02配电柜 / LC-01控制器 / 18盏灯具
【建议检查顺序】① BRK-03断路器 ② L-CIR-03回路绝缘/电流 ③ PDB-02馈线输出 ④ LC-01控制器 ⑤ 灯具分组验证
【关联评分】82/100（不代表真实故障概率）
【边界说明】具备回路级数据，可定位到回路/断路器；单灯级定位需现场确认。现场核验：${fieldTask.review ? e.status + '，' + fieldTask.review.note : '待现场确认'}。`);
      });
    }
  };

  /* ================= 8.10 重点设备分析 ================= */
  P.keydev = {
    title: '重点设备分析 · 状态与专业诊断', group: '智能诊断', crumb: true,
    render(el, params) {
      const KEY = [
        { code: 'BAT-01', grp: 'UPS蓄电池' }, { code: 'UPS-01', grp: 'UPS蓄电池' },
        { code: 'FDR-05', grp: '供配电' }, { code: 'PDB-02', grp: '供配电' }, { code: 'BRK-03', grp: '供配电' },
        { code: 'CSW-01', grp: '通信/核心' }, { code: 'OTN-02', grp: '通信/核心' }, { code: 'SW-12', grp: '通信/核心' }, { code: 'FIBER-07', grp: '通信/核心' },
        { code: 'CAM-057', grp: '外场摄像机' }, { code: 'CAM-01', grp: '外场摄像机' },
        { code: 'JF-01', grp: '隧道风机' }
      ];
      let sel = params.focus || params.code || 'BAT-01';
      if (!D.byCode[sel]) sel = 'BAT-01';
      let range = 24;
      // 专业诊断线索与数据条件
      const DIAG = {
        'BAT-01': { abnormal: [['单体电压离散', '#07/#12/#19 浮充电压偏低（12.4~12.6V）', 'warn'], ['内阻上升', '最大单体内阻较投运基线上升约35%', 'warn'], ['温度偏高', '异常单体温度31~34℃（正常24~27℃）', 'warn']], clue: '3节单体（#07/#12/#19）电压偏低、内阻上升、温度偏高，呈现老化特征。建议核对性放电测试核查容量，再评估分批更新经济性。', data: '具备单体电压/内阻/温度/容量数据，支持老化评估与更新经济性分析；不支持精确剩余寿命预测。', link: ['ups', '查看UPS更新决策 ›'] },
        'UPS-01': { abnormal: [['旁路电压波动', '历史旁路电压波动（已恢复）', 'info'], ['负载率', '当前负载率46%，处于合理区间', 'ok']], clue: 'UPS主机运行正常，历史旁路电压波动已恢复。蓄电池组 BAT-01 存在单体离散，建议结合电池分析评估供电可靠性。', data: '具备负载率/输出电流/旁路电压数据；电池健康需结合 BAT-01 单体数据。', link: ['ups', '查看UPS更新决策 ›'] },
        'FDR-05': { abnormal: [['负载率偏高', '历史负载率偏高告警（已恢复）', 'info'], ['电流采样跳变', 'DS-04 出现瞬时跳变，已标记质量位', 'warn']], clue: '馈线历史负载率偏高已恢复，近期电流采样存在瞬时跳变（数据质量标记）。建议结合预防性试验核查绝缘与载流能力。', data: '具备电压/电流/负载率/温度数据；部分采样存在质量位，分析需剔除突变点。', link: ['cost', '查看维护成本 ›'] },
        'PDB-02': { abnormal: [['Z-03馈线异常', 'Z-03回路输出异常（关联照明事件）', 'warn'], ['雷击抢修史', '2026-08 雷击应急抢修记录', 'info']], clue: '配电柜总状态正常，但 Z-03 馈线输出异常，关联照明区域异常事件。历史有雷击抢修记录，建议核查防雷与接地。', data: '具备馈线输出/开关状态数据；定位粒度到馈线/区域，单灯级需现场确认。', link: ['scene-lighting', '查看照明诊断 ›'] },
        'BRK-03': { abnormal: [['反馈不一致', '指令合闸/反馈分闸', 'warn'], ['回路电流骤降', 'L-CIR-03 电流0.4A', 'warn']], clue: '断路器反馈与指令不一致，回路电流骤降，为照明异常优先检查对象。建议核查脱扣机构与反馈触点。', data: '具备开关状态/反馈/回路电流数据，支持回路级判断。', link: ['scene-lighting', '查看照明诊断 ›'] },
        'CSW-01': { abnormal: [['CPU利用率', '历史CPU短时82%（已恢复，业务高峰）', 'info'], ['内存占用', '内存占用63%，正常', 'ok']], clue: '核心交换机历史CPU偏高与视频调阅高峰重合，已自动恢复。当前运行正常，建议关注高峰时段负载趋势。', data: '具备CPU/内存/端口状态数据；不支持业务级根因预测。', link: ['topology', '查看关联关系 ›'] },
        'OTN-02': { abnormal: [['收光功率', '管理站侧收光正常', 'ok'], ['上联链路', 'FIBER-07 侧光功率劣化（关联摄像机事件）', 'warn']], clue: '光传输设备管理站侧收光正常，骨干环网正常；下游 FIBER-07 光功率劣化关联摄像机集体离线事件。', data: '具备收光功率/端口/链路拓扑数据。', link: ['scene-camera', '查看摄像机诊断 ›'] },
        'SW-12': { abnormal: [['上联端口Down', 'GE0/0/25 状态Down', 'err'], ['CPU突增', 'CPU利用率短时突增', 'warn'], ['CRC错误史', '历史端口CRC错误（已恢复）', 'info']], clue: '接入交换机上联口Down，为摄像机集体离线共同节点候选。建议核查上联光口与光模块，并比对 FIBER-07 光功率。', data: '具备端口状态/丢包/误码/CPU/光功率数据。', link: ['scene-camera', '查看摄像机诊断 ›'] },
        'FIBER-07': { abnormal: [['接收光功率', '-27.8dBm，低于门限-25dBm', 'err']], clue: '上联光缆链路接收光功率劣化至 -27.8dBm，先于摄像机离线发生，为共同故障源优先候选。建议 OTDR 测试定位接头/熔接点。', data: '具备接收光功率时序数据；精确故障点需现场 OTDR 测试。', link: ['scene-camera', '查看摄像机诊断 ›'] },
        'CAM-057': { abnormal: [['重启次数偏多', '历史重启次数偏多（已恢复）', 'info'], ['电源模块故障', '2026-09 电源模块更换×2', 'warn']], clue: '外场摄像机历史重启偏多、电源模块重复故障，建议核查供电稳定性与电源模块批次质量。', data: '具备在线状态/码流/图像质量/重启次数/供电状态数据。', link: ['cost', '查看维修成本 ›'] },
        'CAM-01': { abnormal: [['设备离线', '心跳丢失，视频码流中断', 'err'], ['图像质量', '离线前图像质量评分正常', 'ok']], clue: '摄像机当前离线，属青岭北洞集体离线事件。离线前图像质量正常，不支持本体故障判断，优先核查上联网络。', data: '具备在线状态/码流/图像质量数据；离线期间无实时数据。', link: ['scene-camera', '查看摄像机诊断 ›'] },
        'JF-01': { abnormal: [['运行时长', '累计运行超保养周期（提示）', 'info'], ['振动速度', '振动速度2.1mm/s，正常区间', 'ok']], clue: '射流风机运行参数正常，运行时长超保养周期建议季度检测。风机运行组合存在能耗优化空间。', data: '具备功率/电流/振动/运行时长数据；无轴承专用传感器，当前数据不足以支持轴承早期磨损诊断。', link: ['fan', '查看风机优化 ›'] }
      };
      const camera = D.events.find(e => e.id === 'EV-1123-01');
      const review = D.tasks.find(t => t.eventId === camera.id).review;
      if (review?.checks?.streams) {
        const stream = review.checks.streams['CAM-01'];
        DIAG['CAM-01'].abnormal = [['实时画面', { offline: '设备仍离线', frozen: '设备已在线，实时画面冻结', live: '设备已在线，实时画面连续' }[stream], stream === 'live' ? 'ok' : 'err']];
        if (D.byCode['SW-12'].status === 'online') DIAG['SW-12'].abnormal = [['上联端口', '端口通信已恢复', 'ok']];
        if (review.checks.link) {
          DIAG['FIBER-07'].abnormal = [['接收光功率', '现场复测正常', 'ok']];
          DIAG['OTN-02'].abnormal = [['收光功率', '管理站侧收光正常，上联光链路已复测', 'ok']];
        }
        ['CAM-01', 'SW-12', 'FIBER-07', 'OTN-02'].forEach(code => { DIAG[code].clue = camera.recoverySummary; });
      }
      el.innerHTML = U.pageHead('重点设备分析 · 设备状态与专业诊断',
        '对少数高影响、高成本设备开展专业分析，而非对所有设备套用同一预测算法。指标与趋势随设备类型变化；无专用传感器或必要数据时明确提示数据不足。',
        `<button class="btn" id="kd-topo">${U.icon('topo', 14)} 查看关联关系</button>
         <button class="btn" onclick="UI.go('devices')">${U.icon('dev', 14)} 全部设备</button>`, U.demoBadge('诊断分析')) +
        `<div class="flex">
          <div style="width:240px;flex:0 0 240px">
            <div class="card"><div class="card-h"><span class="card-t">重点设备列表</span><span class="spacer"></span>${U.demoBadge()}</div>
              <div class="card-b tight" id="kd-list" style="max-height:640px;overflow-y:auto"></div></div>
          </div>
          <div class="grow">
            <div class="card mb" id="kd-head"></div>
            <div class="card">
              <div class="card-h"><span class="card-t">参数趋势</span><span class="sub" id="kd-range-label">近24小时</span><span class="spacer"></span>${rangeSeg('kd-range', 24)}</div>
              <div class="card-b" id="kd-trends"></div>
            </div>
            <div class="card mt">
              <div class="card-h"><span class="card-t">同类设备对比</span><span class="sub" id="kd-peer-sub"></span><span class="spacer"></span>${U.demoBadge()}</div>
              <div class="card-b" id="kd-peer"></div>
            </div>
          </div>
          <div style="width:320px;flex:0 0 320px">
            <div class="card"><div class="card-h"><span class="card-t">异常指标</span><span class="sub">点击查看告警与来源</span></div><div class="card-b" id="kd-abnormal"></div></div>
            <div class="card mt"><div class="card-h"><span class="card-t">诊断线索</span><span class="spacer"></span>${U.demoBadge()}</div><div class="card-b" id="kd-clue"></div></div>
            <div class="card mt"><div class="card-h"><span class="card-t">数据条件</span></div><div class="card-b" id="kd-data"></div></div>
          </div>
        </div>`;
      function drawList() {
        const groups = {};
        KEY.forEach(k => { (groups[k.grp] = groups[k.grp] || []).push(k.code); });
        el.querySelector('#kd-list').innerHTML = Object.keys(groups).map(g => `
          <div class="small muted" style="padding:7px 8px 3px;font-weight:600">${g}</div>
          ${groups[g].map(c => { const d = D.byCode[c]; return `<div class="nav-sub-item" data-kd="${c}" style="padding:7px 10px;border-radius:6px;margin:1px 4px;${c === sel ? 'background:#e8f0fe;color:var(--blue-deep);font-weight:600' : ''}">
            <div class="flex ai-center" style="gap:6px">${U.statusTag(d.status)}<span class="mono small">${c}</span></div>
            <div class="small muted" style="margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${d.name}</div></div>`; }).join('')}`).join('');
        el.querySelectorAll('[data-kd]').forEach(x => x.addEventListener('click', () => { sel = x.dataset.kd; drawAll(); }));
      }
      function drawHead() {
        const d = D.byCode[sel];
        const acts = d.alarms.filter(a => a.status === 'active').length;
        el.querySelector('#kd-head').innerHTML = `<div class="card-b">
          <div class="flex ai-center wrap">
            ${U.statusTag(d.status, true)} ${U.catTag(d.cat)} <span class="tag plain">${d.importance}</span>
            <b style="font-size:15px;color:var(--navy-800)">${d.name}</b><span class="mono muted">${d.code}</span>
            <span class="spacer" style="flex:1"></span>
            <button class="btn sm" onclick="UI.openDevice('${d.code}')">${U.icon('dev', 13)} 完整档案</button>
            <button class="btn sm" onclick="UI.go('gis',{focus:'${d.code}'})">${U.icon('map', 13)} 孪生定位</button>
          </div>
          <div class="grid g-6 mt" style="gap:9px">
            <div class="dp-kpi" style="background:#f6f8fa;border-color:var(--line)"><div class="l" style="color:var(--text-3)">厂家/型号</div><div class="v" style="font-size:12px;color:var(--text)">${d.vendor}<br>${d.model}</div></div>
            <div class="dp-kpi" style="background:#f6f8fa;border-color:var(--line)"><div class="l" style="color:var(--text-3)">位置</div><div class="v" style="font-size:12px;color:var(--text)">${d.kmText}<br>${d.place || d.section}</div></div>
            <div class="dp-kpi" style="background:#f6f8fa;border-color:var(--line)"><div class="l" style="color:var(--text-3)">累计运行</div><div class="v" style="color:var(--navy-800)">${(d.runHours / 1000).toFixed(1)}<small style="color:var(--text-3)"> 千小时</small></div></div>
            <div class="dp-kpi" style="background:#f6f8fa;border-color:var(--line)"><div class="l" style="color:var(--text-3)">当前告警</div><div class="v ${acts ? 'rd' : 'gn'}" style="color:${acts ? '#b91c1c' : '#15803d'}">${acts}<small style="color:var(--text-3)"> 条</small></div></div>
            <div class="dp-kpi" style="background:#f6f8fa;border-color:var(--line)"><div class="l" style="color:var(--text-3)">最近通信</div><div class="v" style="font-size:12px;color:var(--text)">${D.fmtTime(d.lastComm)}</div></div>
            <div class="dp-kpi" style="background:#f6f8fa;border-color:var(--line)"><div class="l" style="color:var(--text-3)">数据来源</div><div class="v" style="font-size:12px;color:var(--text)">${d.sourceId}</div></div>
          </div></div>`;
      }
      function drawTrends() {
        el.querySelector('#kd-range-label').textContent = range === 24 ? '近24小时' : range === 7 ? '近7天' : '近30天';
        devTrends(el.querySelector('#kd-trends'), D.byCode[sel], range);
      }
      function drawPeer() {
        const d = D.byCode[sel];
        const peers = D.devices.filter(x => x.type === d.type && x.code !== sel).slice(0, 7);
        const tpl = U.paramTemplate(d);
        const metric = tpl[0];
        el.querySelector('#kd-peer-sub').textContent = d.type + ' · ' + metric.name + '（' + metric.unit + '）均值对比';
        const base = metric.data.reduce((a, b) => a + b, 0) / metric.data.length;
        const items = [{ name: d.code + '（本机）', value: +base.toFixed(2), color: '#ef4444' }].concat(
          peers.map(p => { const pt = U.paramTemplate(p)[0]; const v = pt.data.reduce((a, b) => a + b, 0) / pt.data.length; return { name: p.code, value: +v.toFixed(2), color: '#2f7bff', sub: p.place }; }));
        Charts.hbar(el.querySelector('#kd-peer'), { items, unit: ' ' + metric.unit, labelW: 130, onClick: it => { const c = it.name.split('（')[0]; if (D.byCode[c]) U.openDevice(c); } });
        if (peers.length < 2) el.querySelector('#kd-peer').innerHTML += '<div class="note-box gray mt">同类样本较少，对比仅供参考。</div>';
      }
      function drawRight() {
        const dg = DIAG[sel] || { abnormal: [['运行状态', '当前未见明显异常指标', 'ok']], clue: '该设备当前运行参数处于正常区间，建议按周期开展预防性检测。', data: '具备基础运行参数；专业诊断需结合更多传感数据。', link: ['topology', '查看关联关系 ›'] };
        const d = D.byCode[sel];
        el.querySelector('#kd-abnormal').innerHTML = dg.abnormal.map(([n, v, c]) => `
          <div class="evi" style="cursor:pointer;border-left:3px solid var(--${c === 'err' ? 'red' : c === 'warn' ? 'amber' : c === 'ok' ? 'green' : 'blue'})" data-ab="${n}">
            <div class="evi-t small">${n} ${c === 'err' ? '<span class="tag err">异常</span>' : c === 'warn' ? '<span class="tag warn">关注</span>' : c === 'ok' ? '<span class="tag ok">正常</span>' : '<span class="tag info">历史</span>'}</div>
            <div class="evi-d small">${v}</div></div>`).join('');
        el.querySelectorAll('[data-ab]').forEach(x => x.addEventListener('click', () => {
          const rel = d.alarms.slice(0, 5);
          const src = D.sources.find(s => s.id === d.sourceId);
          U.modal('异常指标 · ' + x.dataset.ab, `
            <div class="kv mb"><span class="k">设备</span><span class="v mono">${d.code} ${d.name}</span><span class="k">指标</span><span class="v">${x.dataset.ab}</span><span class="k">数据来源</span><span class="v">${src ? src.name + '（' + d.sourceId + '）' : d.sourceId}</span></div>
            <div class="sec-t">相关告警</div>
            ${rel.length ? rel.map(a => `<div class="evi" style="cursor:pointer" onclick="UI.openAlarm('${a.id}')"><div class="evi-t small">${U.levelTag(a.level)} ${a.type}</div><div class="src">${D.fmtTime(a.start)} · ${a.status === 'active' ? '未解除' : '已恢复'} · ${a.desc}</div></div>`).join('') : '<div class="muted small">无直接关联告警</div>'}
            <div class="note-box mt">指标异常需结合数据源质量与现场确认综合判断，单一指标不等同于已确认故障。</div>`);
        }));
        el.querySelector('#kd-clue').innerHTML = `<div class="concl"><p>${dg.clue}</p></div>
          <button class="btn sm primary mt" onclick="UI.go('${dg.link[0]}')">${dg.link[1]}</button>`;
        el.querySelector('#kd-data').innerHTML = `<p class="small" style="color:var(--text-2);line-height:1.75">${dg.data}</p>
          ${sel === 'JF-01' ? '<div class="note-box mt">当前数据不足以支持轴承早期磨损诊断（无专用振动频谱传感器）。</div>' : ''}
          ${sel === 'BAT-01' ? '<div class="note-box blue mt">支持基于单体电压/内阻/容量的老化评估与更新经济性测算（方案测算），不承诺精确剩余寿命。</div>' : ''}`;
      }
      function drawAll() { drawList(); drawHead(); drawTrends(); drawPeer(); drawRight(); }
      drawAll();
      bindRange(el, 'kd-range', r => { range = r; drawTrends(); });
      el.querySelector('#kd-topo').addEventListener('click', () => U.go('topology', { focus: sel }));
    }
  };

  /* ================= 8.6 设备关系拓扑 ================= */
  P.topology = {
    title: '设备关系拓扑 · 供电/通信/控制', group: '智能诊断', crumb: true,
    render(el, params) {
      const model = topoModel();
      let api = null;
      const types = Object.keys(REL);
      const active = new Set(types);
      el.innerHTML = U.pageHead('设备关系拓扑 · 供电、通信与控制',
        '将设备之间的连接关系可视化，为跨设备根因定位提供基础。关系类型含网络上联、光链路、供电回路、控制指令、同机柜；异常链路突出显示。拓扑相关性仅用于生成故障源候选。',
        `<button class="btn" onclick="UI.go('diagnosis')">${U.icon('diag', 14)} 诊断中心</button>
         <button class="btn" onclick="UI.go('scene-camera')">${U.icon('cam', 14)} 摄像机场景</button>
         <button class="btn" onclick="UI.go('scene-lighting')">${U.icon('bulb', 14)} 照明场景</button>`, U.demoBadge('关系数据')) +
        `<div class="flex">
          <div style="width:230px;flex:0 0 230px">
            <div class="card dark-panel">
              <div class="card-h"><span class="card-t">关系类型筛选</span></div>
              <div class="card-b" id="tp-types"></div>
            </div>
            <div class="card dark-panel mt">
              <div class="card-h"><span class="card-t">图例</span></div>
              <div class="card-b">
                <div class="small" style="color:#9fb4d0;line-height:2">
                  <div><span style="display:inline-block;width:22px;height:0;border-top:2px solid #ef4444;vertical-align:middle"></span> 中断链路</div>
                  <div><span style="display:inline-block;width:22px;height:0;border-top:2px solid #f59e0b;vertical-align:middle"></span> 异常链路</div>
                  <div><span style="display:inline-block;width:22px;height:0;border-top:2px dashed #f59e0b;vertical-align:middle"></span> 供电回路</div>
                  <div><span style="display:inline-block;width:22px;height:0;border-top:2px dotted #8b5cf6;vertical-align:middle"></span> 控制指令</div>
                  <div style="margin-top:6px">节点边框：绿=在线 / 琥珀=异常 / 灰=离线</div>
                  <div>虚线框=聚合节点（灯具组/风机组）</div>
                </div>
              </div>
            </div>
            <div class="card mt">
              <div class="card-h"><span class="card-t">关系数据完整性</span></div>
              <div class="card-b">
                <div class="stat-mini" style="flex-direction:column;gap:6px">
                  <span class="it"><b>${model.nodes.length}</b>拓扑节点</span>
                  <span class="it"><b>${model.edges.length}</b>关系记录</span>
                  <span class="it"><b style="color:#b91c1c">${model.edges.filter(e => e.status === 'down').length}</b>中断链路</span>
                </div>
                <div class="note-box mt">拓扑关系是诊断的前提。核心场景设备关系已维护；其余设备关系逐步补充，无关系记录的设备提示“关系数据待完善”。</div>
              </div>
            </div>
          </div>
          <div class="grow">
            <div class="card"><div class="card-b tight" id="tp-canvas"></div></div>
            <div class="card mt">
              <div class="card-h"><span class="card-t">异常链路时间线</span><span class="sub">点击跳转诊断事件</span><span class="spacer"></span>${U.demoBadge()}</div>
              <div class="card-b" id="tp-abnormal"></div>
            </div>
          </div>
          <div style="width:320px;flex:0 0 320px">
            <div class="card"><div class="card-h"><span class="card-t">节点详情</span><span class="spacer"></span>${U.demoBadge()}</div>
              <div class="card-b" id="tp-detail"><div class="empty">点击拓扑节点查看上下游关系、告警与数据来源</div></div></div>
          </div>
        </div>`;
      // 类型筛选
      el.querySelector('#tp-types').innerHTML = types.map(t => `
        <div class="flex ai-center" style="padding:5px 0;font-size:12px;color:#b9cde8">
          <span style="width:22px;height:0;border-top:2px ${REL[t].dash ? 'dashed' : 'solid'} ${REL[t].color};flex:0 0 22px"></span>
          <span style="flex:1;margin-left:8px">${t}</span>
          <span class="small" style="color:#6d84a6">${model.edges.filter(e => e.type === t).length}</span>
          <span class="switch on" data-type="${t}" style="margin-left:8px"></span>
        </div>`).join('') +
        `<div class="flex ai-center" style="padding:5px 0;font-size:12px;color:#6d84a6"><span style="flex:1;margin-left:30px">空间隶属</span><span class="small">位置字段表达</span></div>`;
      el.querySelectorAll('[data-type]').forEach(sw => sw.addEventListener('click', () => {
        sw.classList.toggle('on');
        const t = sw.dataset.type;
        if (sw.classList.contains('on')) active.add(t); else active.delete(t);
        api.setTypes(active);
      }));
      // 拓扑
      function showDetail(code) {
        api.setFocus(code);
        const box = el.querySelector('#tp-detail');
        box.innerHTML = nodeDetail(code, model, api);
        const b = box.querySelector('#nd-impact');
        b && b.addEventListener('click', () => {
          const down = model.edges.filter(e => e.source === code).map(e => e.target);
          api.setFocus(code);
          U.toast('已高亮 ' + code + ' 下游 ' + down.length + ' 个关联节点');
        });
      }
      api = mountTopo(el.querySelector('#tp-canvas'), model, {
        height: 560, focus: params.focus || null,
        onNode: code => showDetail(code),
        onEdge: e => {
          if (e.status !== 'normal') {
            const ev = D.events.find(x => x.affected.includes(e.source) || x.affected.includes(e.target) || x.related.includes(e.source) || x.related.includes(e.target));
            if (ev) U.go(ev.page, { id: ev.id }); else U.go('diagnosis');
          } else U.toast(e.type + '：' + e.source + ' → ' + e.target + '（正常）');
        },
        onClear: () => { el.querySelector('#tp-detail').innerHTML = '<div class="empty">点击拓扑节点查看上下游关系、告警与数据来源</div>'; }
      });
      if (params.focus && model.nodeBy[params.focus]) showDetail(params.focus);
      // 异常链路时间线
      const abn = model.edges.filter(e => e.status !== 'normal');
      const evOf = e => D.events.find(x => x.affected.includes(e.source) || x.affected.includes(e.target) || x.related.includes(e.source) || x.related.includes(e.target));
      el.querySelector('#tp-abnormal').innerHTML = `<div class="timeline">${abn.map(e => {
        const ev = evOf(e);
        const tm = ev ? D.fmtTime(ev.time) : '—';
        return `<div class="tl-item ${e.status === 'down' ? 'red' : 'amber'}" style="cursor:pointer" ${ev ? `onclick="UI.go('${ev.page}',{id:'${ev.id}'})"` : ''}>
          <div class="tl-time">${tm} · ${e.type}</div>
          <div class="tl-text"><span class="mono">${e.source} → ${e.target}</span> · ${e.status === 'down' ? '<b style="color:var(--red)">链路中断</b>' : '状态异常'} · ${e.note}${ev ? ' <a>跳转 ' + ev.id + ' ›</a>' : ''}</div></div>`;
      }).join('')}</div>`;
    }
  };
})();

/* ============================================================
 * SVG 图表库：折线 / 柱状(堆叠) / 环形 / 横向排行 / 迷你图
 * 全部带悬停提示、图例、单位与坐标轴
 * ============================================================ */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  function S(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  let tipEl = null;
  function tip() {
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'chart-tip'; document.body.appendChild(tipEl); }
    return tipEl;
  }
  function showTip(html, ev) {
    const t = tip(); t.innerHTML = html; t.style.display = 'block';
    const w = t.offsetWidth, h = t.offsetHeight;
    let x = ev.clientX + 14, y = ev.clientY + 12;
    if (x + w > innerWidth - 8) x = ev.clientX - w - 12;
    if (y + h > innerHeight - 8) y = ev.clientY - h - 10;
    t.style.left = x + 'px'; t.style.top = y + 'px';
  }
  function hideTip() { if (tipEl) tipEl.style.display = 'none'; }
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  function fmtN(v) {
    if (v == null) return '—';
    if (Math.abs(v) >= 10000) return (v / 10000).toFixed(1) + '万';
    return Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : (+v).toFixed(Math.abs(v) < 10 ? 2 : 1).replace(/\.?0+$/, '');
  }

  /* ---------- 折线图 ---------- */
  function line(el, opt) {
    el.innerHTML = '';
    const W = el.clientWidth || 600, H = opt.height || 220;
    const padL = 46, padR = 14, padT = 14, padB = 26;
    const labels = opt.labels, series = opt.series.filter(s => !s.hidden);
    const n = labels.length;
    let max = 0, min = opt.min != null ? opt.min : Infinity;
    series.forEach(s => s.data.forEach(v => { if (v == null) return; if (v > max) max = v; if (opt.min == null && v < min) min = v; }));
    if (!isFinite(min)) min = 0;
    if (opt.zero) min = 0;
    if (max === min) max = min + 1;
    const span = max - min;
    max = niceMax(max + span * 0.08); if (opt.min == null && !opt.zero) min = Math.max(0, min - span * 0.1);
    const iw = W - padL - padR, ih = H - padT - padB;
    const X = i => padL + (n === 1 ? iw / 2 : i / (n - 1) * iw);
    const Y = v => padT + ih - (v - min) / (max - min) * ih;
    const svg = S('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, el);
    // grid + y axis
    for (let g = 0; g <= 4; g++) {
      const v = min + (max - min) * g / 4, y = Y(v);
      S('line', { x1: padL, x2: W - padR, y1: y, y2: y, stroke: opt.dark ? '#1c3a63' : '#e8edf3', 'stroke-width': 1, 'stroke-dasharray': g === 0 ? '' : '3,3' }, svg);
      const t = S('text', { x: padL - 7, y: y + 4, 'text-anchor': 'end', 'font-size': 10, fill: opt.dark ? '#6d84a6' : '#8b99ab' }, svg);
      t.textContent = fmtN(v);
    }
    if (opt.yUnit) { const u = S('text', { x: padL - 7, y: padT - 3, 'text-anchor': 'end', 'font-size': 9, fill: opt.dark ? '#6d84a6' : '#8b99ab' }, svg); u.textContent = opt.yUnit; }
    // x labels
    const step = Math.max(1, Math.ceil(n / Math.floor(iw / 62)));
    labels.forEach((lb, i) => {
      if (i % step !== 0 && i !== n - 1) return;
      const t = S('text', { x: X(i), y: H - 8, 'text-anchor': 'middle', 'font-size': 10, fill: opt.dark ? '#6d84a6' : '#8b99ab' }, svg);
      t.textContent = lb;
    });
    // threshold
    if (opt.threshold != null) {
      S('line', { x1: padL, x2: W - padR, y1: Y(opt.threshold), y2: Y(opt.threshold), stroke: '#ef4444', 'stroke-width': 1, 'stroke-dasharray': '5,4' }, svg);
      const t = S('text', { x: W - padR, y: Y(opt.threshold) - 4, 'text-anchor': 'end', 'font-size': 9, fill: '#ef4444' }, svg);
      t.textContent = opt.thresholdLabel || ('阈值 ' + opt.threshold);
    }
    // series
    series.forEach((s, si) => {
      let d = '', area = '';
      s.data.forEach((v, i) => {
        if (v == null) return;
        const cmd = d ? 'L' : 'M';
        d += `${cmd}${X(i).toFixed(1)},${Y(v).toFixed(1)}`;
      });
      if (opt.area && series.length <= 2) {
        const gid = 'g' + Math.random().toString(36).slice(2, 8);
        const defs = S('defs', {}, svg);
        const lg = S('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
        S('stop', { offset: '0%', 'stop-color': s.color, 'stop-opacity': .22 }, lg);
        S('stop', { offset: '100%', 'stop-color': s.color, 'stop-opacity': 0 }, lg);
        area = d + `L${X(n - 1)},${padT + ih}L${X(0)},${padT + ih}Z`;
        S('path', { d: area, fill: `url(#${gid})`, stroke: 'none' }, svg);
      }
      S('path', { d, fill: 'none', stroke: s.color, 'stroke-width': opt.width || 2, 'stroke-linejoin': 'round', 'stroke-dasharray': s.dash || '' }, svg);
    });
    // hover
    const hoverG = S('g', { style: 'display:none' }, svg);
    const hl = S('line', { y1: padT, y2: padT + ih, stroke: opt.dark ? '#3d5f92' : '#b6c4d6', 'stroke-width': 1 }, hoverG);
    const dots = series.map(s => S('circle', { r: 3.5, fill: s.color, stroke: opt.dark ? '#0a1c38' : '#fff', 'stroke-width': 1.5 }, hoverG));
    const rect = S('rect', { x: padL, y: padT, width: iw, height: ih, fill: 'transparent' }, svg);
    rect.addEventListener('mousemove', ev => {
      const box = svg.getBoundingClientRect();
      const mx = (ev.clientX - box.left) * (W / box.width);
      const i = Math.max(0, Math.min(n - 1, Math.round((mx - padL) / iw * (n - 1))));
      hoverG.style.display = '';
      hl.setAttribute('x1', X(i)); hl.setAttribute('x2', X(i));
      let html = `<div class="tt">${labels[i]}</div>`;
      series.forEach((s, si) => {
        const v = s.data[i];
        if (v != null) { dots[si].style.display = ''; dots[si].setAttribute('cx', X(i)); dots[si].setAttribute('cy', Y(v)); }
        else dots[si].style.display = 'none';
        html += `<div class="row"><span class="cd" style="background:${s.color}"></span>${s.name}：<b>${v == null ? '无数据' : fmtN(v) + (s.unit || opt.yUnit || '')}</b></div>`;
      });
      showTip(html, ev);
    });
    rect.addEventListener('mouseleave', () => { hoverG.style.display = 'none'; hideTip(); });
    if (opt.legend !== false) legend(el, opt.series, opt);
    return svg;
  }

  /* ---------- 柱状 / 堆叠柱 ---------- */
  function bar(el, opt) {
    el.innerHTML = '';
    const W = el.clientWidth || 600, H = opt.height || 220;
    const padL = 46, padR = 12, padT = 14, padB = 26;
    const labels = opt.labels, series = opt.series;
    const n = labels.length;
    const totals = labels.map((_, i) => series.reduce((a, s) => a + (s.data[i] || 0), 0));
    const max = niceMax(Math.max(...totals, 0.1) * 1.1);
    const iw = W - padL - padR, ih = H - padT - padB;
    const bw = Math.min(46, iw / n * 0.55);
    const X = i => padL + (i + 0.5) / n * iw;
    const Y = v => padT + ih - v / max * ih;
    const svg = S('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, el);
    for (let g = 0; g <= 4; g++) {
      const v = max * g / 4, y = Y(v);
      S('line', { x1: padL, x2: W - padR, y1: y, y2: y, stroke: opt.dark ? '#1c3a63' : '#e8edf3', 'stroke-dasharray': g === 0 ? '' : '3,3' }, svg);
      const t = S('text', { x: padL - 7, y: y + 4, 'text-anchor': 'end', 'font-size': 10, fill: opt.dark ? '#6d84a6' : '#8b99ab' }, svg);
      t.textContent = fmtN(v);
    }
    if (opt.yUnit) { const u = S('text', { x: padL - 7, y: padT - 3, 'text-anchor': 'end', 'font-size': 9, fill: opt.dark ? '#6d84a6' : '#8b99ab' }, svg); u.textContent = opt.yUnit; }
    labels.forEach((lb, i) => {
      if (!opt.labelEvery || i % opt.labelEvery === 0 || i === n - 1) {
        const t = S('text', { x: X(i), y: H - 8, 'text-anchor': 'middle', 'font-size': 10, fill: opt.dark ? '#6d84a6' : '#8b99ab' }, svg);
        t.textContent = lb;
      }
      let acc = 0;
      series.forEach(s => {
        const v = s.data[i] || 0;
        if (v <= 0) return;
        const y = Y(acc + v), h = Y(acc) - y;
        const r = S('rect', { x: X(i) - bw / 2, y, width: bw, height: Math.max(1, h), fill: s.color, rx: 2 }, svg);
        r.addEventListener('mousemove', ev => {
          let html = `<div class="tt">${lb}</div>`;
          series.forEach(ss => { html += `<div class="row"><span class="cd" style="background:${ss.color}"></span>${ss.name}：<b>${fmtN(ss.data[i] || 0)}${opt.yUnit || ''}</b></div>`; });
          if (series.length > 1) html += `<div class="row">合计：<b>${fmtN(totals[i])}${opt.yUnit || ''}</b></div>`;
          showTip(html, ev);
          r.setAttribute('opacity', .82);
        });
        r.addEventListener('mouseleave', () => { hideTip(); r.setAttribute('opacity', 1); });
        if (opt.onClick) { r.style.cursor = 'pointer'; r.addEventListener('click', () => opt.onClick(i, lb)); }
        acc += v;
      });
      if (opt.showTotal) {
        const t2 = S('text', { x: X(i), y: Y(totals[i]) - 5, 'text-anchor': 'middle', 'font-size': 10, fill: opt.dark ? '#9fb4d0' : '#5a6b7f', 'font-weight': 600 }, svg);
        t2.textContent = fmtN(totals[i]);
      }
    });
    if (opt.legend !== false) legend(el, series, opt);
    return svg;
  }

  /* ---------- 环形图 ---------- */
  function donut(el, opt) {
    el.innerHTML = '';
    const size = opt.size || 180, cx = size / 2, cy = size / 2, R = size / 2 - 8, r = R * (opt.thick || 0.66);
    const total = opt.items.reduce((a, x) => a + x.value, 0) || 1;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:16px;flex-wrap:wrap;';
    el.appendChild(wrap);
    const svg = S('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` }, wrap);
    let ang = -Math.PI / 2;
    opt.items.forEach(it => {
      const a2 = ang + it.value / total * Math.PI * 2;
      const large = a2 - ang > Math.PI ? 1 : 0;
      const p = (a, rad) => `${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`;
      const d = `M${p(ang, R)}A${R},${R} 0 ${large} 1 ${p(a2, R)}L${p(a2, r)}A${r},${r} 0 ${large} 0 ${p(ang, r)}Z`;
      const path = S('path', { d, fill: it.color, stroke: opt.dark ? '#0a1c38' : '#fff', 'stroke-width': 2 }, svg);
      path.style.cursor = opt.onClick ? 'pointer' : 'default';
      path.addEventListener('mousemove', ev => {
        showTip(`<div class="row"><span class="cd" style="background:${it.color}"></span>${it.name}：<b>${fmtN(it.value)}${opt.unit || ''}</b>（${(it.value / total * 100).toFixed(1)}%）</div>`, ev);
        path.setAttribute('opacity', .85);
      });
      path.addEventListener('mouseleave', () => { hideTip(); path.setAttribute('opacity', 1); });
      if (opt.onClick) path.addEventListener('click', () => opt.onClick(it));
      ang = a2;
    });
    if (opt.center) {
      const t1 = S('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', 'font-size': opt.centerSize || 20, 'font-weight': 700, fill: opt.dark ? '#fff' : '#0b2242' }, svg);
      t1.textContent = opt.center;
      const t2 = S('text', { x: cx, y: cy + 16, 'text-anchor': 'middle', 'font-size': 10, fill: opt.dark ? '#6d84a6' : '#8b99ab' }, svg);
      t2.textContent = opt.centerSub || '';
    }
    const lg = document.createElement('div');
    lg.style.cssText = 'flex:1;min-width:130px;';
    opt.items.forEach(it => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:7px;font-size:12px;padding:3px 0;color:' + (opt.dark ? '#9fb4d0' : '#5a6b7f') + ';cursor:' + (opt.onClick ? 'pointer' : 'default');
      row.innerHTML = `<span style="width:9px;height:9px;border-radius:2px;background:${it.color};flex:0 0 9px"></span><span style="flex:1">${it.name}</span><b style="color:${opt.dark ? '#fff' : '#1c2b3a'};font-variant-numeric:tabular-nums">${fmtN(it.value)}${opt.unit || ''}</b><span style="width:44px;text-align:right;font-size:11px">${(it.value / total * 100).toFixed(1)}%</span>`;
      if (opt.onClick) row.addEventListener('click', () => opt.onClick(it));
      lg.appendChild(row);
    });
    wrap.appendChild(lg);
  }

  /* ---------- 横向排行 ---------- */
  function hbar(el, opt) {
    el.innerHTML = '';
    const max = Math.max(...opt.items.map(x => x.value), 0.1);
    opt.items.forEach((it, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:9px;padding:5px 0;font-size:12px;' + (opt.onClick ? 'cursor:pointer;' : '');
      row.innerHTML = `
        <span style="width:18px;height:18px;border-radius:4px;background:${i < 3 ? 'var(--navy-700)' : 'var(--gray-bg)'};color:${i < 3 ? '#fff' : 'var(--text-2)'};display:flex;align-items:center;justify-content:center;font-size:10px;flex:0 0 18px">${i + 1}</span>
        <span style="width:${opt.labelW || 150}px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${it.name}">${it.name}</span>
        <span style="flex:1;height:9px;background:var(--gray-bg);border-radius:4px;overflow:hidden"><i style="display:block;height:100%;width:${it.value / max * 100}%;background:${it.color || 'linear-gradient(90deg,#2f7bff,#00b8d9)'};border-radius:4px"></i></span>
        <b style="width:70px;text-align:right;font-variant-numeric:tabular-nums">${fmtN(it.value)}${opt.unit || ''}</b>`;
      if (it.sub) {
        const s = document.createElement('div');
        s.style.cssText = 'font-size:10px;color:var(--text-3);margin:-2px 0 3px 27px;';
        s.textContent = it.sub;
        el.appendChild(row); el.appendChild(s);
      } else el.appendChild(row);
      if (opt.onClick) row.addEventListener('click', () => opt.onClick(it, i));
      row.addEventListener('mousemove', ev => { if (it.tip) showTip(it.tip, ev); });
      row.addEventListener('mouseleave', hideTip);
    });
  }

  /* ---------- 迷你图 ---------- */
  function spark(el, data, color, w, h) {
    w = w || 90; h = h || 26;
    const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
    const pts = data.map((v, i) => `${(i / (data.length - 1) * w).toFixed(1)},${(h - 2 - (v - min) / span * (h - 4)).toFixed(1)}`).join(' ');
    el.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${color || '#2f7bff'}" stroke-width="1.5"/></svg>`;
  }

  function legend(el, series, opt) {
    const lg = document.createElement('div');
    lg.className = 'legend';
    series.forEach(s => {
      const li = document.createElement('span');
      li.className = 'li' + (s.hidden ? ' off' : '') + (opt.legendToggle ? ' click' : '');
      li.innerHTML = `<span class="cd" style="background:${s.color}"></span>${s.name}`;
      if (opt.legendToggle) li.addEventListener('click', () => { s.hidden = !s.hidden; (opt.type === 'bar' ? bar : line)(el, opt); });
      lg.appendChild(li);
    });
    el.appendChild(lg);
  }

  window.Charts = { line, bar, donut, hbar, spark, fmtN, hideTip };
})();
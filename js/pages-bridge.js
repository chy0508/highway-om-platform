(function () {
  'use strict';
  const D = window.DB, U = window.UI;

  window.Pages.gis.renderBridge = function (el, params, heading) {
    const road = D.ROAD;
    const tunnels = D.TUNNELS;
    const focused = D.byCode[params.focus];
    const origin = [...Twin.ROAD_SCENES, ...D.ROOMS].find(s => s.id === params.scene);
    const section = D.SECTIONS.find(s => s.id === params.scope);
    const km = focused?.km ?? origin?.km ?? section?.from ?? tunnels[0].start;
    const distance = t => Math.max(t.start-km, km-t.end, 0);
    const scope = tunnels.find(t => t.id === (params.scope || params.scene)) ||
      tunnels.find(t => origin?.name.includes(t.name)) || [...tunnels].sort((a,b) => distance(a)-distance(b))[0];
    const inScope = d => d.km >= scope.start && d.km <= scope.end;
    const devices = D.devices.filter(d => d.road === road.name && inScope(d));
    const events = D.events.filter(inScope).sort((a, b) => Number(a.status.includes('已恢复')) - Number(b.status.includes('已恢复')) || b.time - a.time);
    const tasks = D.tasks.filter(t => inScope(t) && t.tunnel === scope.name);
    const pending = tasks.filter(t => t.review?.outcome !== 'verified').length;
    const counts = { devices: devices.length, events: events.length, tasks: tasks.length };
    const externalView = ['bridge','songlan'].includes(params.view);
    let environment = params.environment == null ? externalView : params.environment !== 'off';
    el.innerHTML = `<section class="gis-bridge">${heading}
      <header class="bridge-context">
        <div><h2><span>${U.icon('road', 18)} ${road.name}</span><i>›</i>${scope.name}</h2>
        <p>${D.kmText(scope.start)} — ${D.kmText(scope.end)}<span>${(scope.end - scope.start).toLocaleString('zh-CN', { maximumFractionDigits: 1 })} km</span></p></div>
        <dl><div><dt>纳管设备</dt><dd>${devices.length}<small> 台</small></dd></div>
        <div><dt>未恢复事件</dt><dd>${events.filter(e => !e.status.includes('已恢复')).length}<small> 起</small></dd></div>
        <div><dt>检修待办</dt><dd>${pending}<small> 项</small></dd></div></dl>
        <a class="bridge-workbench" href="#/gis?view=workbench&amp;mode=tunnel&amp;scene=${scope.id}">场景控制台 ›</a>
      </header>
      <div class="bridge-layout">
        <section class="bridge-map-wrap" aria-label="${scope.name}三维模型"></section>
        <aside class="bridge-list"><div class="bridge-tabs" role="group" aria-label="点位关联记录">
          ${[['events','事件'],['devices','设备'],['tasks','检修']].map(([key,label]) => `<button type="button" data-tab="${key}">${label} <small>${counts[key]}</small></button>`).join('')}
        </div><div id="bridge-records"></div>
        <div class="bridge-summary">
          <section><h3>设备运行</h3><div class="bridge-health">${Object.entries(D.STATUS).map(([key, meta]) => {
            const count = devices.filter(d => d.status === key).length;
            return `<div><span><i style="background:${meta.color}"></i>${meta.name}</span><b>${count}</b></div>`;
          }).join('')}</div></section>
          ${pending ? `<section><h3>待办检修</h3>${tasks.filter(t => t.review?.outcome !== 'verified').slice(0,3).map(t => `<button type="button" class="bridge-task-link" data-task="${t.id}"><b>${t.type}</b><span>${t.window} ›</span></button>`).join('')}</section>` : ''}
        </div></aside>
      </div></section>`;
    const select = el.querySelector('#gis-scene');
    select.innerHTML = tunnels.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    select.value = scope.id;
    select.onchange = () => U.go('gis', {view:'bridge',mode:'tunnel',scene:select.value,environment:environment ? 'on' : 'off',pose:viewer.pose});
    el.querySelectorAll('#gis-mode button').forEach(b => {
      b.onclick = () => U.go('gis', b.dataset.m === 'tunnel' ? {mode:'tunnel',scene:scope.id} : {mode:b.dataset.m});
    });

    let tab = events.length ? 'events' : 'devices';
    let page = 0, query = '';
    const records = el.querySelector('#bridge-records');
    function drawRecords() {
      const queryBox = tab === 'devices';
      records.innerHTML = (queryBox ? '<label class="bridge-search"><input type="search" placeholder="搜索本范围设备名称或编码" aria-label="搜索本范围设备"></label>' : '') + '<div class="bridge-rows"></div><div class="bridge-pager"></div>';
      if (queryBox) {
        const field = records.querySelector('input');
        field.value = query;
        field.oninput = () => { query = field.value.trim().toLowerCase(); page = 0; drawRows(); };
      }
      el.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
      el.querySelector('.bridge-summary').hidden = tab !== 'events';
      drawRows();
    }
    function drawRows() {
      let rows;
      if (tab === 'events') {
        rows = events.map(e => [e.id, e.name, `${D.kmText(e.km)} · ${e.id}`, e.status, e.status.includes('已恢复') ? 'ok' : 'warn']);
      } else if (tab === 'tasks') {
        rows = tasks.map(t => [t.id, t.type, `${t.id} · ${t.window}`, t.review?.outcome === 'verified' ? '已核验' : t.review ? '待复核' : '待办', t.review?.outcome === 'verified' ? 'ok' : 'info']);
      } else {
        rows = devices.filter(d => !query || (d.code + ' ' + d.name).toLowerCase().includes(query)).map(d => [d.code, d.name, `${d.code} · ${d.kmText}`, D.STATUS[d.status].name, D.STATUS[d.status].cls]);
      }
      const size = 8, pages = Math.ceil(rows.length / size);
      records.querySelector('.bridge-rows').innerHTML = rows.length ? rows.slice(page * size, (page + 1) * size).map(([id,name,sub,status,cls]) =>
        `<button class="bridge-record" type="button" data-record="${id}"><span><b>${name}</b><small>${sub}</small></span><em class="tag ${cls}">${status}</em></button>`).join('') : `<p class="empty">${query ? '未找到匹配的设备' : '当前范围暂无' + (tab === 'events' ? '诊断事件' : tab === 'tasks' ? '检修任务' : '设备')}</p>`;
      const pager = records.querySelector('.bridge-pager');
      pager.innerHTML = pages > 1 ? `<button class="btn sm" data-step="-1" ${page === 0 ? 'disabled' : ''}>上一页</button><span>${page+1} / ${pages}</span><button class="btn sm" data-step="1" ${page+1 === pages ? 'disabled' : ''}>下一页</button>` : '';
    }
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; page = 0; query = ''; drawRecords(); });
    records.onclick = ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.step) { page += Number(b.dataset.step); drawRows(); return; }
      const code = b.dataset.record;
      if (tab === 'devices') { viewer.focusAsset(code); U.openDevice(code); }
      if (tab === 'events') U.openEvent(code);
      if (tab === 'tasks') U.go('tasks', {id:code});
    };
    drawRecords();
    el.querySelectorAll('.bridge-task-link').forEach(b => b.onclick = () => U.go('tasks', {id:b.dataset.task}));

    const viewer = document.createElement('bridge-twin');
    const explicitPose = ['cutaway','top','interior','overview'].includes(params.pose);
    const pose = explicitPose ? params.pose : externalView ? 'overview' : 'cutaway';
    viewer.context = {scope,devices,events,environment,pose,explicitPose,focus:focused && inScope(focused) ? focused.code : /^Z-0[1-6]$/.test(params.focus) ? params.focus : null};
    el.querySelector('.bridge-map-wrap').appendChild(viewer);
    const toggle = el.querySelector('#gis-environment');
    function reflectEnvironment() {
      toggle.setAttribute('aria-checked',String(environment));
      toggle.classList.toggle('primary',environment);
      toggle.textContent = '地形环境　' + (environment ? '开' : '关');
    }
    reflectEnvironment();
    toggle.onclick = () => {
      environment = !environment;
      viewer.setEnvironment(environment);
      reflectEnvironment();
      const next = new URLSearchParams({view:'bridge',mode:'tunnel',scene:scope.id,environment:environment ? 'on' : 'off',pose:viewer.pose});
      if (viewer.selected) next.set('focus',viewer.selected);
      history.replaceState(history.state,'','#/gis?'+next);
    };
  };
})();

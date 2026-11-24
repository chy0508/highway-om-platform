
'use strict';
window.RoadCockpit = (() => {
  const U = RoadUI, N = RoadNetwork, M = U.M;
  const {btn, ico, fmt} = U;
  const routeTabs = [
    ['overview','路段总览','road'],['devices',U.platformLabel('devices'),'box'],
    ['diag',U.platformLabel('diag'),'diag'],['energy',U.platformLabel('energy'),'energy'],
    ['plan',U.platformLabel('plan'),'plan']
  ];
  const signs = ['监控摄像机','通信设备','照明设备','射流风机'];
  let labelsOn = true;
  let pilotAsset = null;

  function status(label, value, unit, icon, highlight = false, attrs = '') {
    return `<div class="cockpit-stat${highlight?' warning':''}">${ico(icon,19)}<div>
      <strong ${attrs}>${value}</strong><small>${unit}</small><span>${label}</span></div></div>`;
  }

  function panel(label, icon, content, extra = '', kind = '') {
    return `<section class="cockpit-panel ${kind}"><div class="cockpit-panel-title"><h2>${ico(icon,14)}${label}</h2>${extra}</div>${content}</section>`;
  }

  function header() {
    const current = N.route(U.s.route);
    const tabs = routeTabs.map(([id, name, icon]) => {
      const active = id === U.s.page;
      return `<button type="button" data-action="page" data-value="${id}"
        aria-current="${active?'page':'false'}" ${id !== 'overview' && U.s.route !== 'qinglan' ? 'disabled' : ''}>
        ${ico(icon,14)}${name}</button>`;
    }).join('');
    const brand =
      `<div class="cockpit-brand"><img src="assets/platform-logo.svg" width="24" height="24" alt="">${btn('‹ 综合驾驶舱','page','dashboard','back-link') .replace('<button','<button aria-label="返回综合驾驶舱"')}
       <span class="cockpit-slash">/</span><h1>${current.name}${current.id==='qinglan'?'东段':''}</h1></div>`;
    return `<header class="cockpit-head">${brand}<nav aria-label="路段业务">${tabs}</nav>
      <div class="cockpit-utilities">
        <button type="button" data-action="layers" aria-pressed="${labelsOn}">${ico('layers',14)}图层</button>
        <button type="button" data-action="screen">${ico('arrow',14)}全屏</button>
      </div></header>`;
  }

  function tools() {
    return `<div class="cockpit-map-tools"><button type="button" aria-label="恢复视角" data-action="reset-view">${ico('pin',16)}</button>
      <button type="button" aria-label="放大地图" data-action="zoom" data-value="1">+</button>
      <button type="button" aria-label="缩小地图" data-action="zoom" data-value="-1">−</button></div>`;
  }

  function attribution() {
    return `<small class="map-attribution">路线示意 · 高程 Mapzen / USGS<br>
      <a href="https://cloudless.eox.at/" target="_blank" rel="noopener noreferrer">EOxCloudless</a> by EOX IT Services GmbH · Contains modified Copernicus Sentinel data 2016<br>
      水域 <a href="https://global-surface-water.appspot.com/download" target="_blank" rel="noopener noreferrer">Source: EC JRC/Google</a></small>`;
  }

  function sitesList() {
    return M.sites.map(site=>`<button class="site-line ${site.id===U.s.site?'chosen':''}" type="button" data-action="site"
      data-value="${site.id}" aria-label="定位${site.name}"><span>${ico('pin',14)}${site.name}</span>
      <small>K${site.km}+000 · ${M.sum(site.counts)} 台</small>${ico('chev',10)}</button>`).join('');
  }

  function siteEvents() {
    return M.events.map(event=>{
      const closed = U.s.cases[event.id]?.closed;
      return `<button class="site-line event-line" type="button" data-action="event" data-value="${event.id}">
        <span><i class="${closed?'done':event.id==='lights'?'waiting':'doing'}"></i>${event.title}</span>
        <time>${event.time}</time><small>${M.site(event.site).name}</small>
        <small class="${closed?'':'orange'}">${closed?'已核验':'待处置'}</small></button>`;
    }).join('');
  }

  function workWindows() {
    const time = minute => String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
    return RoadData.tasks.map(task=>`<button type="button" class="site-line work-window ${task.site===U.s.site?'chosen':''}"
      data-action="plan-site" data-value="${task.site}"><b>${M.site(task.site).name}</b><time>${task.site==='B' && U.s.late?'11/24':'11/23'} ${time(task.start)}–${time(task.end)}</time>
      <small>${task.crew}</small><small>${task.duration} 分钟 · ${task.meter}</small></button>`).join('');
  }

  function detail() {
    const route = N.route(U.s.route);
    const same = route.id === 'qinglan';
    const pending = N.pending(M.events,U.s.cases,route.id);
    if (!same) {
      return `${header()}<div class="cockpit-kpis compact">
        ${status('养护里程',fmt(route.km),'km','road')}${status('待处置事件',pending,'起','bell',true,'data-pending="detail"')}</div>
        <aside class="cockpit-rail cockpit-left">${panel('路线概况','road',`<div class="corridor-info">
        <b>${route.name}</b><span>路线走向 · 三维示意</span><span>该线路暂无运维记录</span></div>`)}</aside>
        ${tools()}<div class="cockpit-mapfoot"><div class="scene-key"><span class="route-key"></span>${route.name}</div></div>${attribution()}`;
    }
    const site = M.site(U.s.site);
    const event = M.events.find(e=>e.site===site.id);
    const closed = U.s.cases[event.id]?.closed;
    const total = M.sum(site.counts);
    const pilot = site.id === 'C';
    const assetRows = signs.map((name,i)=>`<button type="button" data-action="device-category" data-value="${['monitor','comm','tunnel','tunnel'][i]}" aria-label="${U.platformLabel('devices')}：${name}"><span>${ico(['diag','link','energy','settings'][i],14)}${name}</span><b>${site.counts[i]} 台</b>
      <i class="asset-share" style="--percent:${site.counts[i]/total*100}%"></i></button>`).join('');
    return `${header()}
      <div class="cockpit-kpis">${status('纳管设备',M.sum(M.sites.flatMap(site=>site.counts)),'台','box')}
        ${status('纳管隧道',M.sites.length,'座','pin')}
        ${status('待处置事件',pending,'起','bell',true,'data-pending="detail"')}
        ${status('计划检测',RoadData.tasks.length,'项','calendar')}</div>
      <aside class="cockpit-rail cockpit-left detail-rail">${panel('沿线点位','pin',sitesList(),'<small>按桩号</small>','detail-points')}
        ${panel('当班事件','bell',siteEvents(),'<small>按时间</small>','detail-events')}
        ${panel('计划检测','calendar',workWindows(),'<small>3 个窗口</small>','detail-work')}</aside>
      <aside class="cockpit-rail cockpit-right detail-rail inspect"><section class="cockpit-panel detail-assets">
        <div class="cockpit-panel-title site-heading"><h2>${ico('pin',18)}${site.name}</h2><small>K${site.km}+000</small></div>
        <div class="cockpit-panel-title"><h2>${ico('layers',14)}资产明细</h2><small>合计 ${total} 台</small></div>
        <div class="site-assets">${assetRows}</div>
        ${pilot ? `<div class="pilot-devices" aria-label="场景设备">
          <button type="button" data-action="pilot-asset" data-value="C-L01" aria-label="定位入口段加强照明灯具">${ico('energy',14)}灯具</button>
          <button type="button" data-action="pilot-asset" data-value="C-CCTV01" aria-label="定位洞口监控摄像机">${ico('diag',14)}摄像机</button>
          <button type="button" data-action="pilot-asset" data-value="C-DB01" aria-label="定位照明配电控制柜">${ico('box',14)}配电柜</button>
        </div><div class="pilot-selection" hidden><span>所选设备</span><strong></strong><small></small><button type="button" class="inspect-secondary" data-action="event" hidden>查看设备关联告警</button><button type="button" class="inspect-secondary" data-action="device-category">设备监测</button></div>` : ''}</section><section class="cockpit-panel detail-alert">
        <div class="cockpit-panel-title"><h2>${ico('bell',14)}本站告警</h2></div>
        <div class="alert-info"><strong class="${closed?'':'orange'}">${event.title}</strong>
          <span>${event.time} · ${event.code}</span>
          <dl><div><dt>处置状态</dt><dd>${closed?'工单已关闭':'待处置'}</dd></div>
              <div><dt>关联专业</dt><dd>${event.type}</dd></div>
              <div><dt>告警等级</dt><dd>${event.severity}</dd></div>
              <div><dt>受影响点位</dt><dd>${event.impact} 个</dd></div></dl>
          ${btn('打开'+U.platformLabel('diag'),'event',event.id,'inspect-action')}</div>
        </section></aside>${tools()}
      ${pilot ? `<div class="pilot-views" aria-label="松岚桥隧视角">
        <button type="button" data-action="pilot-view" data-value="overview" aria-pressed="true">${ico('road',14)}桥隧外景</button>
        <button type="button" data-action="pilot-view" data-value="interior" aria-pressed="false">${ico('pin',14)}进入洞内</button>
      </div>` : ''}
      <div class="cockpit-mapfoot chainage"><div>${M.sites.map(s=>`<button type="button" data-action="site" data-value="${s.id}"
       class="${s.id===site.id?'chosen':''}"><i></i>K${s.km} · ${s.name.replace('隧道','')}</button>`).join('')}</div></div>
      <small class="map-attribution">青岚高速东段 · 桥隧与地形为示意模型</small>`;
  }

  function reflectPilotAsset(asset) {
    pilotAsset = asset;
    const detail = document.querySelector('.pilot-selection');
    if (!detail) return;
    detail.hidden = !asset;
    if (asset) {
      detail.dataset.selectedAsset = asset.id;
      detail.querySelector('strong').textContent = asset.label;
      detail.querySelector('small').textContent = [asset.id,asset.chainage,asset.direction].filter(Boolean).join(' · ');
      const related=M.events.find(e=>e.id===asset.eventId && e.site===U.s.site);
      const action=detail.querySelector('[data-action="event"]');
      detail.querySelector('[data-action="device-category"]').dataset.value =
        {luminaire:'tunnel',cctv:'monitor',cabinet:'power'}[asset.kind];
      action.hidden=!related;
      if(related)action.dataset.value=related.id;
      else delete action.dataset.value;
    } else {
      delete detail.dataset.selectedAsset;
    }
    for (const button of document.querySelectorAll('[data-action="pilot-asset"]')) {
      button.setAttribute('aria-pressed',String(button.dataset.value===asset?.id));
    }
  }

  function reflectPilotView(view) {
    for (const button of document.querySelectorAll('[data-action="pilot-view"]')) {
      button.setAttribute('aria-pressed',String(button.dataset.value===view));
    }
  }

  function render() {
    document.body.dataset.theme = U.s.theme;
    document.body.dataset.shell = 'cockpit';
    document.getElementById('app').innerHTML = `<main class="cockpit-view route-view" aria-label="路段三维运维">${detail()}</main>`;
    reflectPilotAsset(U.s.site!=='C' ? null : pilotAsset);
    RoadSpatial.show('overview', {
      route: U.s.route, site: U.s.site, mode: U.s.mode, theme: U.s.theme, cases: U.s.cases,
      pending:U.alerts().length
    }, U.dispatch, reflectPilotAsset, reflectPilotView);
    return true;
  }

  function sceneAction(action, value, element) {
    if (action === 'layers') {
      labelsOn = RoadSpatial.toggleLabels();
      element?.setAttribute('aria-pressed',labelsOn);
    } else if (action === 'screen') {
      const change = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
      change?.catch(() => {});
    } else if (action === 'zoom') {
      RoadSpatial.zoom(Number(value));
    } else if (action === 'reset-view') {
      RoadSpatial.resetView();
    } else if (action === 'pilot-view') {
      RoadSpatial.pilotView(value);
    } else if (action === 'pilot-asset') {
      RoadSpatial.pilotAsset(value);
    } else return false;
    return true;
  }

  return {render, sceneAction};
})();

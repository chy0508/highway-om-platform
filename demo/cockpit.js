
'use strict';
window.RoadCockpit = (() => {
  const U = RoadUI, N = RoadNetwork, M = U.M;
  const {btn, ico, fmt} = U;
  const routeTabs = [
    ['overview','路段总览','road'],['plan','养护与检修','plan'],
    ['diag','故障诊断','diag'],['energy','能效分析','energy']
  ];
  const mapTabs = [
    ['all','路网总览','road'],['facility-map','设施分布','layers'],['alarm-map','故障告警','bell'],
    ['work-map','检修计划','calendar'],['energy-map','能耗分布','energy']
  ];
  const assets = [
    ['收费站',186,185],['ETC 门架',412,409],['隧道',126,125],['监控点位',8240,8108]
  ];
  const systemStatus = [
    ['ETC 门架在线率',assets[1][2]/assets[1][1]*100,[6,6,8,7,8,8,9,8,9]],
    ['视频在线率',98.4,[6,4,7,7,6,8,7,7,8]],
    ['通信可用率',99.8,[7,8,8,7,9,8,9,8,9]],
    ['供配电完好率',99.1,[6,7,7,8,6,8,8,9,8]],
    ['隧道照明完好率',99,[5,8,7,7,6,8,8,7,8]],
    ['通风设备完好率',98.9,[5,5,7,5,6,7,7,8,8]]
  ];
  const signs = ['监控摄像机','通信设备','照明设备','射流风机'];
  const tasks = [
    {day:'一', plan:4, done:3},{day:'二',plan:3,done:2},{day:'三',plan:5,done:4},
    {day:'四',plan:5,done:4},{day:'五',plan:4,done:3},{day:'六',plan:4,done:3},{day:'日',plan:3,done:2}
  ];
  const taskStatuses = [['已完成',21,'done'],['进行中',5,'doing'],['待执行',2,'waiting']];
  const energy = [['照明',52.1],['通风',18.6],['其他',15.7]];
  const totalEnergy = energy.reduce((sum, [, value]) => sum + value, 0);
  const energyShares = energy.map(([, value]) => Math.round(value/totalEnergy*1000)/10);
  const history = [
    ['摄像机巡检复测','北川高速','08:41'],['门架端口恢复','清源高速','08:32'],
    ['照明支路复核','临江高速','08:21'],['光纤链路复测','南岭高速','08:13'],
    ['备用电源巡检','松川高速','07:58'],['通信柜接地核验','云岭高速','07:44']
  ];
  const timeline = [0,0,0,0,1,2,0,0,1,0,1,0,1,0,0,0,1,0,0,2,1,1,0,1];
  let labelsOn = true;
  let pilotAsset = null;

  function status(label, value, unit, icon, highlight = false, attrs = '') {
    return `<div class="cockpit-stat${highlight?' warning':''}">${ico(icon,19)}<div>
      <strong ${attrs}>${value}</strong><small>${unit}</small><span>${label}</span></div></div>`;
  }

  function panel(label, icon, content, extra = '', kind = '') {
    return `<section class="cockpit-panel ${kind}"><div class="cockpit-panel-title"><h2>${ico(icon,14)}${label}</h2>${extra}</div>${content}</section>`;
  }

  function header(network) {
    const current = N.route(U.s.route);
    const tabs = (network ? mapTabs : routeTabs).map(([id, name, icon]) => {
      const active = id === (network ? U.s.mode : U.s.page);
      return `<button type="button" data-action="${network?'mode':'page'}" data-value="${id}"
        aria-current="${active?'page':'false'}" ${!network && id !== 'overview' && U.s.route !== 'qinglan' ? 'disabled' : ''}>
        ${ico(icon,14)}${name}</button>`;
    }).join('');
    const theme = U.s.theme === 'dark' ? '浅色' : '暗色';
    const brand = network ?
      `<div class="cockpit-brand">${ico('brand',22)}<h1>路维智策——公路机电智能运维决策平台</h1></div>` :
      `<div class="cockpit-brand">${ico('brand',22)}${btn('‹ 路网总览','page','network','back-link') .replace('<button','<button aria-label="返回路网总览"')}
       <span class="cockpit-slash">/</span><h1>${current.name}${current.id==='qinglan'?'东段':''}</h1></div>`;
    return `<header class="cockpit-head">${brand}<nav aria-label="${network?'地图专题':'路段业务'}">${tabs}</nav>
      <div class="cockpit-utilities">
        <button type="button" data-action="layers" aria-pressed="${labelsOn}">${ico('layers',14)}图层</button>
        <button type="button" data-action="theme" aria-label="切换${theme}">${U.s.theme==='dark'?'☾':'☼'} ${U.s.theme==='dark'?'暗色':'浅色'}</button>
        <button type="button" data-action="screen">${ico('arrow',14)}全屏</button>
      </div></header>`;
  }

  function spark(values) {
    return `<svg viewBox="0 0 72 14" class="cockpit-spark" aria-hidden="true">
      <polyline points="${values.map((v,i)=>i*9+','+(13-v)).join(' ')}"></polyline></svg>`;
  }

  function routeRows() {
    return `<div class="route-matrix"><div class="triplet table-label"><span>路线名称</span><span>里程 / km</span><span>待办</span></div>
      <div class="route-scroll" tabindex="0" aria-label="全部 24 条养护线路">${N.routes.map(route => {
        const pending = N.pending(M.events,U.s.cases,route.id);
        return `<button type="button" class="triplet route-row ${route.id==='qinglan'?'main-route':''}"
          data-action="route" data-value="${route.id}"><span><i></i>${route.name}</span><b>${fmt(route.km)}</b>
          <span class="${pending?'orange':''}">${pending || '—'} ${ico('chev',10)}</span></button>`;
      }).join('')}</div></div>`;
  }

  function urbanAssets() {
    return `<div class="infra-table">
      <div class="table-label"><span>设施</span><span>纳管</span><span>在线</span><span>异常</span></div>
      ${assets.map(([label,total,online])=>`<div><span>${label}</span><b>${fmt(total)}</b><b>${fmt(online)}</b>
      <span class="${total-online?'orange':''}">${fmt(total-online)}</span></div>`).join('')}</div>`;
  }

  function systems() {
    return `<div class="systems">${systemStatus.map(([label,ratio,values]) =>
      `<div><span>${label}</span>${spark(values)}<b>${ratio.toFixed(1)}%</b></div>`).join('')}</div>`;
  }

  function composition() {
    const groups = [['收费',548],['监控',8240],['通信',1536],['供配电',980],['隧道机电',1076]];
    const total = groups.reduce((sum, [, count])=>sum+count,0);
    return `<div class="composition">${groups.map(([name,count])=>`<div><span>${name}</span><b>${fmt(count)}</b>
      <i style="--percent:${count/total*100}%"></i><small>${(count/total*100).toFixed(1)}%</small></div>`).join('')}</div>`;
  }

  function faultRows() {
    const originals = M.events.map(e => {
      const closed = U.s.cases[e.id]?.closed;
      return `<button type="button" class="fault-line" data-action="event" data-value="${e.id}">
        <span><i class="${closed?'done':e.severity==='高'?'waiting':'doing'}"></i>${e.title}</span>
        <span>${M.site(e.site).name}</span><time>${e.time}</time><b class="${closed?'':'orange'}">${closed?'已核验':'待处置'}</b></button>`;
    });
    const records = history.map(([title,place,time])=>`<div class="fault-line"><span><i class="done"></i>${title}</span>
      <span>${place}</span><time>${time}</time><b>已完成</b></div>`);
    const pending = U.alerts().length;
    const verified = M.events.length-pending;
    const percent = Math.round((history.length+verified)/(history.length+M.events.length)*100);
    return `<div class="fault-summary"><div><strong data-pending="right">${pending}</strong><span>当前待处置</span></div>
      <div><strong>${verified}</strong><span>当班已核验</span></div>
      <div class="closure-ratio" style="--closure:${percent}%"><strong>${percent}%</strong><span>列表闭环率</span></div></div>
      <div class="fault-line table-label"><span>事件</span><span>点位 / 路线</span><span>时间</span><span>状态</span></div>
      <div class="fault-scroll">${originals.concat(records).join('')}</div>`;
  }

  function maintenanceCharts() {
    const seen = tasks.reduce((sum, t)=>sum+t.done,0);
    const all = tasks.reduce((sum, t)=>sum+t.plan,0);
    const bars = tasks.map(t=>`<div><span class="plan-bar" style="--level:${t.plan/6*100}%"></span>
      <span class="done-bar" style="--level:${t.done/6*100}%"></span><small>${t.day}</small></div>`).join('');
    const dots = taskStatuses.map(([,count,status])=>`<i class="${status}"></i>`.repeat(count)).join('');
    return panel('养护与检修','plan',`<div class="chart-pair">
      <div class="chart"><h3>每日计划 / 完成</h3><div class="week-bars">${bars}</div></div>
      <div class="chart"><h3>任务状态</h3><div class="task-dots">${dots}</div>
        <div class="task-key">${taskStatuses.map(([name,n,status])=>`<span><i class="${status}"></i>${name} <b>${n}</b></span>`).join('')}</div></div></div>
      <div class="budget-run"><span>修换预算执行</span><i style="--percent:75%"></i><b>75%</b></div>`,`<small>本周 ${seen} / ${all} 项</small>`,'maintenance-panel');
  }

  function energyCharts() {
    const priorTotal = 89.26;
    const points = (shape, total) => {
      const sum = shape.reduce((a,b)=>a+b,0);
      return shape.map((v,i)=>[i*13,54-v/sum*total*4.1].join(',')).join(' ');
    };
    const today = points([3,4.1,4.9,5.3,6.1,7,7.7,9.2,8.2,7.1,5.9,5.2],totalEnergy);
    const yesterday = points([2.5,3.4,3.7,4.3,4.9,4.7,5.9,6.5,6.9,6.2,5.8,4.8],priorTotal);
    const change = ((totalEnergy/priorTotal-1)*100).toFixed(1).replace('-','−');
    const endOfBlue = energyShares[0] + energyShares[1];
    return panel('能效分析','energy',`<div class="energy-reading"><b>${fmt(totalEnergy)}</b><small>MWh</small><span>全网今日用电</span><em>${change}% 较昨日</em></div>
      <div class="chart-pair"><div class="chart"><h3>今昨用电</h3><svg class="energy-svg" viewBox="0 0 143 57" preserveAspectRatio="none" aria-label="今日和昨日用电趋势" role="img">
      <defs><linearGradient id="energy-fill" x2="0" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="#38d8c3" stop-opacity=".46"></stop><stop offset="1" stop-color="#38d8c3" stop-opacity=".01"></stop></linearGradient></defs>
      <path d="M0 16h143 M0 33h143 M0 54h143" fill="none" class="energy-grid"></path>
      <polygon points="0,54 ${today} 143,54" fill="url(#energy-fill)"></polygon>
      <polyline points="${yesterday}" class="yesterday"></polyline><polyline points="${today}" class="today"></polyline>
      </svg><div class="hour-key"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div></div>
      <div class="chart"><h3>分项用电</h3><div class="energy-mix">
        <div class="mix-ring" style="--first:${energyShares[0]}%;--second:${endOfBlue}%"></div>
        <div>${energy.map(([name,value],i)=>`<span><i class="energy-color-${i}"></i>${name}<b title="${value} MWh">${energyShares[i]}%</b><small>${value.toFixed(1)} MWh</small></span>`).join('')}</div>
      </div></div></div>`,'','efficiency-panel');
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

  function home() {
    const pending = N.pending(M.events,U.s.cases);
    const km = N.routes.reduce((sum,route)=>sum+route.km,0);
    const modeText = {
      'facility-map':'沿线设施 · 选中路线查看点位',
      'alarm-map':pending + ' 起当班待处置事件',
      'work-map':'本周计划 28 项 · 已完成 21 项',
      'energy-map':`全网用电 ${fmt(totalEnergy)} MWh · 点位明细为青岚东段三座隧道照明与通风`
    }[U.s.mode];
    return `${header(true)}
      <div class="cockpit-kpis">${status('养护总里程',fmt(km),'km','road',false,'data-total-km="7000"')}
      ${status('纳管高速',N.routes.length,'条','layers')}
      ${status('设备完好率','98.7','%','settings')}
      ${status('待处置事件',pending,'起','bell',true,'data-pending="network"')}</div>
      <aside class="cockpit-rail cockpit-left">${panel('养护路线','road',routeRows(),'<small>全部 24 条</small>','routes-panel')}
        ${panel('沿线设施','box',urbanAssets())}${panel('关键系统状态','diag',systems())}
        ${panel('设备构成','layers',composition())}</aside>
      <aside class="cockpit-rail cockpit-right">${panel('故障处置','bell',faultRows(),'<small>当前及历史记录</small>','fault-panel')}
        ${maintenanceCharts()}${energyCharts()}</aside>
      ${tools()}
      <div class="cockpit-mapfoot">${modeText?`<div class="map-mode">${modeText}</div>`:''}
        <div class="alert-timeline"><span>${ico('bell',15)}近 24 小时告警 <b>${timeline.reduce((a,b)=>a+b,0)}</b> 起</span>
          <div>${timeline.map((v,i)=>`<i data-hour="${i%3===0?String(i).padStart(2,'0'):''}" style="--level:${v*38+9}%" class="${v>1?'spike':''}" title="${i}:00 · ${v} 起"></i>`).join('')}</div></div>
        <div class="scene-key"><span class="route-key"></span>选中线路 <span class="road-key"></span>养护路线
           <span class="hub-key"></span>路线节点 <span class="facility-key"></span>隧道 <span class="alarm-key"></span>待处置</div></div>${attribution()}`;
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
      return `${header(false)}<div class="cockpit-kpis compact">
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
    const assetRows = signs.map((name,i)=>`<div><span>${ico(['diag','link','energy','settings'][i],14)}${name}</span><b>${site.counts[i]} 台</b>
      <i class="asset-share" style="--percent:${site.counts[i]/total*100}%"></i></div>`).join('');
    return `${header(false)}
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
        </div><div class="pilot-selection" hidden><span>所选设备</span><strong></strong><small></small><button type="button" class="inspect-secondary" data-action="event" hidden>查看设备关联告警</button></div>` : ''}</section><section class="cockpit-panel detail-alert">
        <div class="cockpit-panel-title"><h2>${ico('bell',14)}本站告警</h2></div>
        <div class="alert-info"><strong class="${closed?'':'orange'}">${event.title}</strong>
          <span>${event.time} · ${event.code}</span>
          <dl><div><dt>处置状态</dt><dd>${closed?'工单已关闭':'待处置'}</dd></div>
              <div><dt>关联专业</dt><dd>${event.type}</dd></div>
              <div><dt>告警等级</dt><dd>${event.severity}</dd></div>
              <div><dt>受影响点位</dt><dd>${event.impact} 个</dd></div></dl>
          ${btn('打开故障诊断','event',event.id,'inspect-action')}</div>
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
      const action=detail.querySelector('button');
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
    const page = U.s.page;
    document.body.dataset.theme = U.s.theme;
    if (page !== 'network' && page !== 'overview') {
      document.body.dataset.shell = 'legacy';
      RoadSpatial.hide();
      return false;
    }
    const isNetwork = page === 'network';
    document.body.dataset.shell = 'cockpit';
    const app = document.getElementById('app');
    app.innerHTML = `<main class="cockpit-view ${isNetwork?'network-view':'route-view'}" aria-label="${isNetwork?'路网驾驶舱':'单路三维运维'}">${isNetwork?home():detail()}</main>`;
    for (const row of app.querySelectorAll('button[data-action="route"]')) {
      row.addEventListener('pointerenter', () => RoadSpatial.highlight(row.dataset.value));
      row.addEventListener('pointerleave', () => RoadSpatial.highlight(null));
    }
    reflectPilotAsset(isNetwork || U.s.site!=='C' ? null : pilotAsset);
    RoadSpatial.show(isNetwork?'network':'overview', {
      route: isNetwork ? null : U.s.route, site: U.s.site, mode: U.s.mode, theme: U.s.theme, cases: U.s.cases,
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

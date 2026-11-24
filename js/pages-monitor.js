/* ============================================================
 * 页面：综合驾驶舱 / 数字孪生一张图 / 设备监测 / 数据接入
 * ============================================================ */
(function () {
  'use strict';
  const D = window.DB, P = window.Pages, U = window.UI;

  const cockpitNumber = value => value.toLocaleString('zh-CN',{maximumFractionDigits:1});

  function panel(label, icon, content, extra = '', kind = '') {
    return `<section class="cockpit-panel ${kind}"><div class="cockpit-panel-title"><h2>${U.icon(icon,14)}${label}</h2>${extra}</div>${content}</section>`;
  }

  function spark(values) {
    return `<svg viewBox="0 0 72 14" class="cockpit-spark" aria-hidden="true">
      <polyline points="${values.map((v,i)=>i*9+','+(13-v)).join(' ')}"></polyline></svg>`;
  }

  function dashboardPanels() {
    const categories = Object.entries(D.CATS);
    const total = D.stats().total;
    const current = D.events.filter(event => !event.status.includes('已恢复'));
    const resolved = D.events.length-current.length;
    const percent = Math.round(resolved/D.events.length*100);
    const routes = D.SECTIONS.map(section => {
      const pending = current.filter(event => D.sectionOf(event.km)===section).length;
      const scene = Twin.ROAD_SCENES.find(item=>D.sectionOf(item.km)===section);
      const link = scene ? '#/gis?mode=road&scene='+scene.id : '#/gis?mode=macro';
      return `<a class="triplet route-row" href="${link}" title="${section.name}"><span><i></i>${section.name.replace(/^K\S+ /,'')}</span><b>${section.to-section.from}</b>
        <span class="${pending?'orange':''}">${pending || '—'}</span></a>`;
    }).join('');
    const facilities = [['收费设施','toll','road'],['监控设施','monitor','cam'],['隧道机电','tunnel','fan'],['内场机房','room','db']];
    const infra = facilities.map(([label,key,icon])=>{
      const stat = D.catStats[key];
      return `<a href="#/devices?cat=${key}"><span class="facility-label">${U.icon(icon,12)}${label}</span><b>${stat.total}</b><b>${stat.online}</b>
        <span class="${stat.warn+stat.offline?'orange':''}">${stat.warn+stat.offline}</span></a>`;
    }).join('');
    const systems = categories.map(([key,meta])=>{
      const stat = D.catStats[key];
      const ratio = stat.online/stat.total*100;
      const trend = D.series('system-'+key,9,7,3,{fix:1});
      return `<a href="#/devices?cat=${key}"><span>${meta.name}</span>${spark(trend)}<b>${ratio.toFixed(1)}%</b></a>`;
    }).join('');
    const composition = categories.map(([key,meta])=>{
      const count = D.catStats[key].total;
      const share = (count/total*100).toFixed(1);
      return `<a href="#/devices?cat=${key}"><span>${meta.name}</span><b>${cockpitNumber(count)}</b>
        <i style="--percent:${share}%;--geo-blue:${meta.color};--geo-teal-strong:${meta.color}"></i><small>${share}%</small></a>`;
    }).join('');
    let cumulative = 0;
    const slices = categories.map(([key,meta])=>{
      const start = cumulative;
      cumulative += D.catStats[key].total / total * 100;
      return `${meta.color} ${start}% ${cumulative}%`;
    });
    const ring = `<div class="device-ring" aria-hidden="true" style="background:conic-gradient(${slices.join(',')})"></div>`;
    const events = D.events.map(event=>{
      const finished = !current.includes(event);
      const link = '#/'+event.page+'?'+new URLSearchParams({id:event.id});
      return `<a class="fault-line" href="${link}" aria-label="${event.name}">
        <span title="${event.name}"><i class="${finished?'done':event.level==='严重'?'waiting':'doing'}"></i>${event.name}</span>
        <span title="${event.place}">${event.place}</span><time>${D.fmtTime(event.time).slice(-5)}</time>
        <b class="${finished?'':'orange'}">${finished?'已恢复':'待处置'}</b></a>`;
    }).join('');
    return {
      left: panel('养护路线','road',`<div class="route-matrix"><div class="triplet table-label"><span>路线名称</span><span>里程 / km</span><span>待办</span></div>
        <div class="route-scroll">${routes}</div></div>`,'<a href="#/gis?mode=macro">路网总览 ›</a>','routes-panel')
        + panel('沿线设施','dev',`<div class="infra-table"><div class="table-label"><span>设施</span><span>纳管</span><span>在线</span><span>异常</span></div>${infra}</div><button type="button" class="camera-preview" data-video-preview><span>${U.icon('play',14)} 隧道照明预警 · 样片</span></button>`,
          '<button type="button" class="video-link" data-video-preview>查看视频 ›</button>')
        + panel('关键系统状态','diag',`<div class="systems">${systems}</div>`,'<small>在线率</small>')
        + panel('设备构成','db',`<div class="composition">${composition}</div>`,ring),
      right: panel('故障处置','bell',`<div class="fault-summary"><div><strong>${current.length}</strong><span>当前待处置</span></div>
        <div><strong>${resolved}</strong><span>已恢复</span></div>
        <div class="closure-ratio" style="--closure:${percent}%"><strong>${percent}%</strong><span>列表闭环率</span></div></div>
        <div class="fault-line table-label"><span>事件</span><span>点位 / 路线</span><span>时间</span><span>状态</span></div>
        <div class="fault-scroll">${events}</div>`,'<a href="#/diagnosis">智能诊断 ›</a>','fault-panel')
        + maintenanceCharts() + energyCharts()
    };
  }

  function maintenanceCharts() {
    const windows = new Map();
    for (const task of D.tasks) {
      const group = windows.get(task.window) || {count:0,hours:0,names:[]};
      group.count++;
      group.hours+=task.duration;
      group.names.push(task.type);
      windows.set(task.window,group);
    }
    const rows = [...windows].map(([window,group])=>`<a class="work-window" href="#/tasks" title="${group.names.join('、')}">
      <strong>${window}</strong><b>${group.count} 项</b><small>${group.names.join(' · ')}</small><span>${group.hours} 小时</span></a>`).join('');
    return panel('养护与检修','task',`<div class="work-windows">${rows}</div>
      <a class="drive-panel-foot" href="#/tasks"><span>计划总工时</span><b>${D.tasks.reduce((sum,t)=>sum+t.duration,0)} 小时 ›</b></a>`,
      `<a href="#/tasks">${D.tasks.length} 项计划 ›</a>`,'maintenance-panel');
  }

  function energyCharts() {
    const metric = D.kpis.find(item=>item.key==='energy');
    const latestMonth = D.costMonths[D.costMonths.length-1];
    const tracked = D.costRecords.filter(record=>record.cat==='energy' && record.month===latestMonth);
    const categories = [['照明','L-CIR','light'],['通风','JF','fan'],['机房','UPS','cost']].map(([name,prefix,link])=>({
      name, link, value:tracked.filter(record=>record.asset.startsWith(prefix)).reduce((sum,record)=>sum+record.amount,0)
    }));
    const expense = categories.reduce((sum,category)=>sum+category.value,0);
    const shares = categories.map(category=>expense ? category.value/expense*100 : 0);
    const spread = Math.max(...metric.trend)-Math.min(...metric.trend) || 1;
    const minimum = Math.min(...metric.trend);
    const points = metric.trend.map((value,i)=>`${i*143/(metric.trend.length-1)},${49-(value-minimum)/spread*39}`).join(' ');
    const change = (100*(metric.current/metric.baseline-1)).toFixed(1);
    const ranked = categories.map((item,i)=>({...item,share:shares[i]})).sort((a,b)=>b.value-a.value);
    return panel('能效分析','opt',`<a href="#/kpi" class="energy-summary">
      <div><small>单位工况能耗</small><strong>${metric.current.toFixed(2)}</strong><span>${metric.unit}</span></div>
      <div class="energy-change"><svg viewBox="0 0 143 57" preserveAspectRatio="none" aria-label="能耗变化趋势"><polyline points="${points}"/></svg><small>较基线 ${change}%</small></div></a>
      <div class="cost-ranking"><header><strong>本月能源费用样例</strong><span class="cost-stack" aria-hidden="true">${ranked.map(({share},i)=>`<i style="flex:${share};background:${['#6faeff','#78cece','#bc9aff'][i]}"></i>`).join('')}</span><span>万元</span></header>
      ${ranked.map(({name,value,link,share})=>`<a href="#/${link}" class="cost-rank"><span>${name}</span><i><em style="width:${share}%"></em></i><b>${value.toFixed(1)}</b><small>${share.toFixed(0)}%</small></a>`).join('')}</div>`,
      '<a href="#/fan">运行优化 ›</a>','efficiency-panel');
  }

  /* ================= 综合驾驶舱 ================= */
  P.dashboard = {
    title: '综合驾驶舱 · 运行总览', group: '综合驾驶舱',
    render(el) {
      const panels = dashboardPanels();
      const stats = D.stats();
      const pending = D.events.filter(event=>!event.status.includes('已恢复')).length;
      const metrics = [
        ['养护总里程', D.ROAD.end-D.ROAD.start,'km','road','gis'],
        ['纳管设备', cockpitNumber(stats.total),'台','dev','devices'],
        ['设备在线率', stats.onlineRate.toFixed(1),'%','diag','devices'],
        ['待处置事件', pending,'起','bell','diagnosis']
      ];
      const navKeys = ['dashboard','gis','devices','diagnosis','tasks','fan'];
      const visibleKeys = new Set(Array.from(document.querySelectorAll('#nav [data-page],#nav [data-grp]'),
        item=>item.dataset.page || item.dataset.grp));
      const navigation = navKeys.filter(key=>key==='dashboard'||visibleKeys.has(key)).map(key=>{
        const item = U.NAV.find(entry=>entry.key===key);
        return `<a href="#/${key}"${key==='dashboard'?' aria-current="page"':''}>${U.icon(item.icon,14)}${item.name}</a>`;
      }).join('');
      const hours = new Array(24).fill(0);
      D.alarms.forEach(alarm => {
        const elapsed = Math.floor((D.NOW-alarm.start)/3600000);
        if (elapsed>=0 && elapsed<hours.length) hours[hours.length-1-elapsed]++;
      });
      const hourlyMax = Math.max(1,...hours);
      const alarms = hours.reduce((sum,count)=>sum+count,0);
      const alarmBars = hours.map((count,index) => {
        const hour = new Date(D.NOW.getTime()-(23-index)*3600000).getHours();
        return `<i data-hour="${index%4===0?String(hour).padStart(2,'0'):''}" style="--level:${Math.max(8,count/hourlyMax*100)}%" title="${hour}时 · ${count} 起"></i>`;
      }).join('');
      el.innerHTML = `<div class="drive" data-boards="${matchMedia('(max-width: 900px)').matches ? 'off' : 'on'}">
        <div id="dash-map" aria-label="A高速示范路段交互地图"></div>
        <header class="drive-head">
          <div class="drive-brand">
            <button class="drive-menu" type="button" aria-label="业务导航" aria-controls="sidebar" aria-expanded="false">☰</button>
            <img src="assets/platform-logo.svg" width="24" height="24" alt="" class="drive-brand-mark"><h1>机电智能运维平台 <span>· 综合驾驶舱</span></h1>
          </div>
          <nav class="drive-top-nav" aria-label="驾驶舱业务导航">${navigation}</nav>
          <div class="drive-actions"><button class="drive-toggle" type="button"></button></div>
        </header>
        <button type="button" class="drive-nav-mask" aria-label="关闭业务导航"></button>
        <div class="drive-mobile-tabs"><button data-side="left" aria-pressed="true">路线与设备</button><button data-side="right" aria-pressed="false">处置与能效</button></div>
        <section class="drive-kpis" aria-label="${D.ROAD.name}运行指标">${metrics.map(([label,value,unit,icon,link])=>`
          <a href="#/${link}">${U.icon(icon,17)}<div><b>${value}</b><small>${unit}</small><span>${label}</span></div></a>`).join('')}</section>
        <aside class="drive-rail drive-left" aria-label="路线与设备看板">${panels.left}</aside>
        <aside class="drive-rail drive-right" aria-label="处置与能效看板">${panels.right}</aside>
        <section class="drive-alert-timeline" aria-label="近24小时告警趋势">
          <a href="#/diagnosis">${U.icon('bell',14)}近 24 小时告警 <b>${alarms}</b> 起</a><div>${alarmBars}</div>
        </section>
      </div>`;
      const drive = el.querySelector('.drive');
      drive.querySelectorAll('[data-video-preview]').forEach(button=>button.onclick=()=>{
        U.modal('隧道照明预警 · 演示视频',
          '<video controls autoplay playsinline preload="metadata" style="display:block;width:100%;max-height:68vh;background:#071324" src="assets/tunnel-lighting-demo.mp4"></video>');
      });
      const toggle = drive.querySelector('.drive-toggle');
      function setBoards(open) {
        drive.dataset.boards = open ? 'on' : 'off';
        toggle.textContent = open ? '收起看板' : '显示看板';
        toggle.setAttribute('aria-expanded', String(open));
      }
      setBoards(drive.dataset.boards === 'on');
      toggle.onclick = () => setBoards(drive.dataset.boards !== 'on');
      drive.dataset.side = 'left';
      drive.querySelectorAll('[data-side]').forEach(button => button.onclick = () => {
        drive.dataset.side = button.dataset.side;
        drive.querySelectorAll('[data-side]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      });
      const menu = drive.querySelector('.drive-menu');
      function showMenu(open) {
        document.body.classList.toggle('drive-nav-open', open);
        menu.setAttribute('aria-expanded', String(open));
        if (!open) menu.focus();
      }
      menu.onclick = () => showMenu(!document.body.classList.contains('drive-nav-open'));
      drive.querySelector('.drive-nav-mask').onclick = () => showMenu(false);
      Twin.geoMap(el.querySelector('#dash-map'), {
        fill: true,
        onSelect(sel) {
          if (sel.kind === 'event') { const e = D.events.find(x => x.id === sel.code); if (e) U.go(e.page, { id: sel.code }); }
          else if (sel.kind === 'tunnel') U.go('gis', { mode: 'tunnel', scene: sel.code });
          else if (sel.kind === 'room') U.go('gis', { mode: 'room', scene: sel.code });
          else if (sel.kind === 'toll') U.go('devices', { cat: 'toll' });
          else U.openDevice(sel.code);
        }
      });
    }
  };

  /* ================= 数字孪生一张图 · 三级数字孪生 ================= */
  P.gis = {
    title: '数字孪生一张图', group: '数字孪生一张图',
    render(el, params) {
      const bridgeView = params.view === 'bridge';
      const modes = [['macro', 'map', '宏观路网'], ['road', 'road', '路段孪生'], ['tunnel', 'cube', '隧道孪生'], ['room', 'db', '机房孪生']];
      const heading = `<header class="gis-heading">
        <div class="page-title">数字孪生一张图 · ${bridgeView ? '桥隧场景' : '重点区位数字孪生'} ${U.demoBadge()}</div>
        <div class="gis-toolbar" role="group" aria-label="孪生场景工具栏">
          <div class="btn-group" id="gis-mode">${modes.map(([key, icon, label]) =>
            `<button type="button" class="seg" data-m="${key}" aria-pressed="false">${U.icon(icon, 13)} ${label}</button>`).join('')}</div>
          <select class="sel" id="gis-scene" aria-label="场景点位"${bridgeView ? ' disabled' : ''}>${bridgeView ? '<option>桥隧场景</option>' : ''}</select>
          <button type="button" class="btn" id="gis-back">${U.icon('back', 14)} 返回宏观</button>
          <button type="button" class="btn primary" id="gis-view-switch">${U.icon(bridgeView ? 'back' : 'road', 15)} ${bridgeView ? '返回设备孪生' : '切换至桥隧场景'}</button>
        </div></header>`;
      if (bridgeView) {
        const { view, ...returnParams } = params;
        el.innerHTML = `<section class="gis-bridge">
          ${heading}
          <iframe class="gis-bridge-frame" title="青岚高速东段桥隧场景" src="cockpit.html#/route/qinglan" allowfullscreen></iframe>
        </section>`;
        el.querySelector('#gis-view-switch').onclick = () => U.go('gis', returnParams);
        el.querySelectorAll('#gis-mode button').forEach(button => {
          button.onclick = () => U.go('gis', button.dataset.m === returnParams.mode ? returnParams : { mode: button.dataset.m });
        });
        el.querySelector('#gis-back').onclick = () => U.go('gis', { mode: 'macro' });
        // The bridge scene uses a different Three.js version and its own asset registry.
        const frame = el.querySelector('iframe');
        frame.addEventListener('load', () => {
          if (frame.contentDocument?.getElementById('spatial')) return;
          const message = document.createElement('p');
          message.setAttribute('role', 'alert');
          message.textContent = '桥隧场景暂未加载，请刷新页面重试。';
          frame.replaceWith(message);
        });
        return;
      }
      let mode = ['road', 'room', 'macro', 'tunnel'].includes(params.mode) ? params.mode : params.mode === 'bim' ? 'tunnel' : null;
      const fdev = params.focus ? D.byCode[params.focus] : null;
      const fpl = fdev ? (fdev.place || '') : '';
      if (!mode) mode = params.focus ? (/机房/.test(fpl) && !/隧道/.test(fpl) ? 'room' : /隧道/.test(fpl) ? 'tunnel' : 'road') : 'tunnel';
      let sceneKey = params.scene || (mode === 'tunnel' ? ((D.TUNNELS.find(t => fpl.indexOf(t.name) >= 0) || {}).id || 'QL') : mode === 'room' ? ((D.ROOMS.find(r => fpl.indexOf(r.name) >= 0) || {}).id || 'MR-01') : 'RS-QL');
      let twin = null;
      let buildSeq = 0;
      const ROAD = Twin.ROAD_SCENES;
      el.innerHTML = heading +
        '<div class="page-desc gis-instructions">默认进入隧道数字孪生场景，映射风机/照明/配电等洞内机电与实时状态；右上角可切换宏观路网、路段孪生与机房孪生——路段展示情报板/摄像机/车流光轨，机房展示机柜排/UPS/精密空调与实时动环，提供模拟调控与预警预测。拖拽旋转 · 滚轮缩放 · 右键平移。</div>' +
        `<div class="flex">
          <div style="width:232px;flex:0 0 232px" class="flex col">
            <div class="card dark-panel">
              <div class="card-h"><span class="card-t" id="layer-title">图层控制</span></div>
              <div class="card-b" id="gis-layers"></div>
            </div>
            <div class="card dark-panel mt">
              <div class="card-h"><span class="card-t">重点区位 · 点击下钻</span></div>
              <div class="card-b" id="gis-drill"></div>
            </div>
            <div class="card dark-panel mt" id="gis-status-card">
              <div class="card-h"><span class="card-t">状态筛选</span></div>
              <div class="card-b"><div class="pills" id="gis-status">
                <span class="pill on" data-s="all">全部</span><span class="pill" data-s="online">在线</span>
                <span class="pill" data-s="warn">异常</span><span class="pill" data-s="offline">离线</span>
              </div>
              <div class="divider" style="background:var(--line-dark)"></div>
              <div class="small" style="color:#7e95b8;line-height:1.8">点位颜色=专业类别；外圈红色=异常/离线；红色光柱=严重诊断事件；紫色点位=现场检测任务。</div>
              </div>
            </div>
            <div class="card mt">
              <div class="card-h"><span class="card-t">操作提示</span></div>
              <div class="card-b small muted" style="line-height:1.9">左键拖拽 · 旋转视角<br>滚轮 · 缩放距离<br>右键/Shift拖拽 · 平移<br>单击热区 · 下钻孪生场景<br>单击设备 · 查看详情<br>空闲5秒 · 自动巡航</div>
            </div>
          </div>
          <div class="grow">
            <div class="twin-wrap" id="twin-box" style="height:600px">
              <div class="twin-hud">
                <button class="hud-btn" id="hud-back" style="display:none">${U.icon('back', 13)} 宏观路网</button>
                <button class="hud-btn" id="hud-top">${U.icon('eye', 13)} 俯瞰</button>
                <button class="hud-btn" id="hud-inside" style="display:none">${U.icon('play', 13)} 洞内视角</button>
                <button class="hud-btn on" id="hud-auto">${U.icon('reset', 13)} 自动巡航</button>
              </div>
              <div class="twin-hud-r"><span class="hud-live" id="hud-live" style="display:none"></span><span class="badge-demo">孪生场景 · 模拟坐标</span></div>
              <div class="twin-legend" id="twin-legend"></div>
              <div class="twin-tip"></div>
              <div class="twin-info" id="twin-info"></div>
              <div class="twin-loading" id="twin-loading"><span class="spin"></span>正在构建数字孪生场景…</div>
            </div>
            <div class="card mt">
              <div class="card-h"><span class="card-t">场景控制台</span><span class="sub">所有参数实时作用于三维场景</span><span class="spacer"></span>${U.demoBadge()}</div>
              <div class="card-b">
                <div class="console-grid">
                  <div class="ctl-group">
                    <div class="ctl-t">环境光照</div>
                    <div class="btn-group" id="ctl-time" style="margin-bottom:8px">
                      <button class="seg on" data-t="day">白昼</button><button class="seg" data-t="night">夜间</button>
                    </div>
                    <div class="range-row"><span>雾浓度</span><input type="range" id="ctl-fog" min="0" max="100" value="50"><span class="rv" id="ctl-fog-v">50%</span></div>
                  </div>
                  <div class="ctl-group">
                    <div class="ctl-t">交通流</div>
                    <div class="range-row"><span>车流密度</span><input type="range" id="ctl-traffic" min="0" max="40" value="26"><span class="rv" id="ctl-traffic-v">26</span></div>
                    <button class="btn sm mt" id="ctl-rand" style="width:100%">${U.icon('reset', 12)} 随机车流</button>
                  </div>
                  <div class="ctl-group">
                    <div class="ctl-t">显示与视角</div>
                    <div class="flex ai-center" style="font-size:12px;color:var(--text-2);margin-bottom:6px"><span style="flex:1">对象标签</span><span class="switch on" id="ctl-labels"></span></div>
                    <label class="fld" style="margin-bottom:6px">视角 <select class="sel" id="ctl-view"><option value="orbit">环绕</option><option value="top">俯瞰</option><option value="side">路侧/侧视</option><option value="inside">洞内/贴近</option></select></label>
                    <label class="fld">画质 <select class="sel" id="ctl-quality"><option value="low">流畅</option><option value="mid" selected>均衡</option><option value="high">高清</option></select></label>
                  </div>
                  <div class="ctl-group">
                    <div class="ctl-t">设备图层</div>
                    <div class="ctl-sw"><span>摄像机</span><span class="switch on" data-eq="cam"></span></div>
                    <div class="ctl-sw"><span>情报板</span><span class="switch on" data-eq="vms"></span></div>
                    <div class="ctl-sw"><span>射流风机</span><span class="switch on" data-eq="fan"></span></div>
                    <div class="ctl-sw"><span>照明分区</span><span class="switch on" data-eq="light"></span></div>
                    <div class="ctl-sw"><span>供配电/检测</span><span class="switch on" data-eq="power"></span></div>
                  </div>
                  <div class="ctl-group" id="ctl-room" style="display:none">
                    <div class="ctl-t">机房模拟调控 <span class="tag warn" style="margin-left:4px">不下发</span></div>
                    <div class="range-row"><span>空调设定</span><input type="range" id="ctl-setpoint" min="18" max="28" step="0.5" value="24"><span class="rv" id="ctl-setpoint-v">24℃</span></div>
                    <div class="range-row"><span>机柜负载</span><input type="range" id="ctl-load" min="20" max="95" value="60"><span class="rv" id="ctl-load-v">60%</span></div>
                    <div class="range-row"><span>照明亮度</span><input type="range" id="ctl-roomlight" min="0" max="100" value="60"><span class="rv" id="ctl-roomlight-v">60%</span></div>
                    <div class="ctl-sw"><span>气流可视化</span><span class="switch" id="ctl-airflow"></span></div>
                    <div class="ctl-sw"><span>地板热力图</span><span class="switch" id="ctl-heat"></span></div>
                  </div>
                  <div class="ctl-group">
                    <div class="ctl-t">巡航与输出</div>
                    <div class="flex ai-center" style="font-size:12px;color:var(--text-2);margin-bottom:8px"><span style="flex:1">自动巡航</span><span class="switch on" id="ctl-auto"></span></div>
                    <button class="btn sm" id="ctl-reset" style="width:100%;margin-bottom:6px">${U.icon('reset', 12)} 重置视角</button>
                    <button class="btn sm primary" id="ctl-shot" style="width:100%">${U.icon('export', 12)} 导出场景截图</button>
                  </div>
                </div>
              </div>
            </div>
            <div class="card mt" id="gis-bottom"></div>
          </div>
        </div>`;
      const box = el.querySelector('#twin-box');
      const info = el.querySelector('#twin-info');
      function showInfo(sel) {
        let html = '';
        if (sel.kind === 'device') {
          const d = D.byCode[sel.code];
          if (!d) {
            html = `<h4><span class="tag info">场景对象</span> ${sel.name || sel.code}</h4>
              <div class="row"><span>编码</span><b class="mono">${sel.code}</b></div>
              <div style="margin-top:6px;color:#90a7c7;line-height:1.6">该对象为当前孪生场景的示意模型，未纳入统一设备台账。</div>`;
          } else {
            const acts = d.alarms.filter(a => a.status === 'active').length;
            html = `<h4>${U.statusTag(d.status)} ${d.name}</h4>
              <div class="row"><span>统一编码</span><b class="mono">${d.code}</b></div>
              <div class="row"><span>专业/类型</span><b>${D.CATS[d.cat].name} · ${d.type}</b></div>
              <div class="row"><span>位置</span><b>${d.kmText} ${d.place}</b></div>
              <div class="row"><span>最近数据</span><b>${D.fmtTime(d.lastComm)}</b></div>
              <div class="row"><span>当前告警</span><b>${acts} 条</b></div>
              <div class="acts"><button class="hud-btn" onclick="UI.openDevice('${d.code}')">查看详情</button>
              <button class="hud-btn" onclick="UI.go('topology',{focus:'${d.code}'})">拓扑关系</button></div>`;
          }
        } else if (sel.kind === 'event') {
          const e = D.events.find(x => x.id === sel.code);
          html = `<h4>${U.levelTag(e.level)} ${e.name}</h4>
            <div class="row"><span>事件编号</span><b class="mono">${e.id}</b></div>
            <div class="row"><span>影响设备</span><b>${e.affected.length} 台</b></div>
            <div class="row"><span>诊断状态</span><b>${e.status}</b></div>
            <div style="margin-top:6px;color:#90a7c7;line-height:1.6">${e.summary}</div>
            <div class="acts"><button class="hud-btn" onclick="UI.go('${e.page}',{id:'${e.id}'})">进入诊断分析 ›</button></div>`;
        } else if (sel.kind === 'zone') {
          const bad = sel.code === 'Z-03';
          html = `<h4>${bad ? '<span class="tag err">异常</span>' : '<span class="tag ok">正常</span>'} ${sel.name}</h4>
            <div class="row"><span>灯具数量</span><b>${bad ? 18 : 16} 盏</b></div>
            <div class="row"><span>供电回路</span><b class="mono">${bad ? 'L-CIR-03' : 'L-CIR-0' + sel.code.slice(-1)}</b></div>
            <div class="row"><span>回路电流</span><b>${bad ? '0.4 A（异常）' : '15.8 A'}</b></div>
            ${bad ? '<div style="margin-top:6px;color:#ff9d9d">18盏灯具同时失去反馈，集中于同一供电回路。</div><div class="acts"><button class="hud-btn" onclick="UI.go(\'scene-lighting\')">进入照明诊断 ›</button></div>' : '<div class="acts"><button class="hud-btn" onclick="UI.go(\'light\')">照明调光分析 ›</button></div>'}`;
        } else if (sel.kind === 'fan') {
          html = `<h4><span class="tag ok">运行</span> ${sel.name}</h4>
            <div class="row"><span>额定功率</span><b>30 kW</b></div>
            <div class="row"><span>当前功率</span><b>25.8 kW</b></div>
            <div class="row"><span>今日运行</span><b>14.2 小时</b></div>
            <div class="row"><span>供电回路</span><b>CAB-03 风机动力回路</b></div>
            <div class="acts"><button class="hud-btn" onclick="UI.openDevice('${sel.code}')">设备详情</button>
            <button class="hud-btn" onclick="UI.go('fan')">风机优化分析 ›</button></div>`;
        } else if (sel.kind === 'toll' || sel.kind === 'room') {
          const st = sel.kind === 'toll' ? D.TOLLS.find(x => x.id === sel.code) : D.ROOMS.find(x => x.id === sel.code);
          const cnt = D.devices.filter(d => d.place === st.name).length;
          html = `<h4>${st.name}</h4>
            <div class="row"><span>桩号</span><b>${D.kmText(st.km)}</b></div>
            <div class="row"><span>纳管设备</span><b>${cnt} 台/套</b></div>
            <div class="acts"><button class="hud-btn" onclick="UI.go('devices',{q:'${st.name}'})">设备清单 ›</button></div>`;
        } else if (sel.kind === 'task') {
          const t = D.tasks.find(x => x.id === sel.code);
          html = `<h4><span class="tag violet">检测任务</span> ${t.type}</h4>
            <div class="row"><span>任务编号</span><b class="mono">${t.id}</b></div>
            <div class="row"><span>位置</span><b>${t.tunnel} ${D.kmText(t.km)}</b></div>
            <div class="row"><span>预计时长</span><b>${t.duration} 小时</b></div>
            <div class="row"><span>作业窗口</span><b>${t.window}</b></div>
            <div class="acts"><button class="hud-btn" onclick="UI.go('tasks')">任务统筹 ›</button></div>`;
        }
        if (mode === 'room' && sel.kind === 'device' && twin && twin.roomSim) {
          const s = twin.roomSim;
          const off = ((sel.code || '').length % 5) * 0.4;
          html += `<div class="divider" style="background:var(--line-dark);margin:6px 0"></div>
            <div class="row"><span>进风温度(映射)</span><b>${(s.coldAisle + off).toFixed(1)} ℃</b></div>
            <div class="row"><span>机柜负载(映射)</span><b>${Math.round(s.load * 100)} %</b></div>
            <div class="row"><span>回路功率(映射)</span><b>${(s.load * 6 + off).toFixed(1)} kW</b></div>
            <div class="small" style="color:#6d84a6;margin-top:4px">指标为动环/电源模拟映射值</div>`;
        }
        info.innerHTML = html;
        info.classList.add('show');
      }
      function onSelect(sel) {
        if (sel.kind === 'tunnel') { drill('tunnel', sel.code); return; }
        if (sel.kind === 'roadsec') { drill('road', sel.code); return; }
        if (sel.kind === 'room') { drill('room', sel.code); return; }
        showInfo(sel);
      }
      function drill(m, key) {
        mode = m; sceneKey = key;
        rebuild();
        U.toast(m === 'tunnel' ? '已下钻进入隧道数字孪生场景' : m === 'room' ? '已下钻进入机房数字孪生场景' : '已下钻进入路段数字孪生场景', 'ok');
      }
      function buildLayers() {
        const lb = el.querySelector('#gis-layers');
        if (mode === 'macro') {
          el.querySelector('#layer-title').textContent = '图层控制';
          const items = Object.keys(D.CATS).map(c => [c, D.CATS[c].name, D.catStats[c].total, D.CATS[c].color])
            .concat([['events', '诊断事件', 2, '#ef4444'], ['tasks', '现场检测任务', D.tasks.length, '#8b5cf6']]);
          lb.innerHTML = items.map(([k, n, cnt, col]) => `
            <div class="flex ai-center" style="padding:4px 0;font-size:12px;color:#b9cde8">
              <span class="cd" style="width:9px;height:9px;border-radius:50%;background:${col};flex:0 0 9px"></span>
              <span style="flex:1;margin-left:7px">${n}</span><span class="small" style="color:#6d84a6">${cnt}</span>
              <span class="switch on" data-layer="${k}" style="margin-left:8px"></span>
            </div>`).join('');
          lb.querySelectorAll('[data-layer]').forEach(sw => sw.addEventListener('click', () => {
            sw.classList.toggle('on');
            twin && twin.setLayer(sw.dataset.layer, sw.classList.contains('on'));
          }));
        } else if (mode === 'room') {
          el.querySelector('#layer-title').textContent = '机房对象定位';
          const rm = D.ROOMS.find(x => x.id === sceneKey) || D.ROOMS[0];
          const inR = D.devices.filter(d => d.place === rm.name);
          const ac = inR.filter(d => d.type === '精密空调').slice(0, 2);
          const ups = inR.find(d => d.type === 'UPS主机');
          const sw = inR.find(d => d.type === '核心交换机');
          const env = inR.find(d => d.type === '动环监控主机');
          const badRack = inR.find(d => (d.type === '应用服务器' || d.type === '存储阵列') && d.status !== 'online');
          const objs = [
            ups && [ups.code, 'UPS 主机'],
            ['BAT-01', '⚠ UPS 蓄电池组'],
            sw && [sw.code, '⚠ 核心交换机'],
            ['PDB-R1', '机房配电柜'],
            env && [env.code, '动环监控主机'],
            ...ac.map((a, i) => [a.code, '精密空调 ' + (i + 1)]),
            badRack && [badRack.code, '⚠ ' + (badRack.status === 'offline' ? '离线' : '异常') + '机柜 ' + badRack.code]
          ].filter(Boolean);
          lb.innerHTML = objs.map(([c, n]) => `<div class="nav-sub-item" style="padding:6px 8px;color:${n.includes('⚠') ? '#ff9d9d' : '#9fb4d0'}" data-focus="${c}">${n}</div>`).join('');
          lb.querySelectorAll('[data-focus]').forEach(it => it.addEventListener('click', () => {
            twin && twin.focus(it.dataset.focus);
            showInfo({ kind: 'device', code: it.dataset.focus, name: it.textContent.replace('⚠ ', '') });
          }));
        } else {
          el.querySelector('#layer-title').textContent = mode === 'tunnel' ? '洞内对象定位' : '路段对象定位';
          const objs = mode === 'tunnel'
            ? [['JF-01', '射流风机 JF-01'], ['JF-02', '射流风机 JF-02'], ['JF-03', '射流风机 JF-03'], ['JF-04', '射流风机 JF-04'], ['Z-03', '⚠ Z-03 照明分区'], ['CAM-01', '⚠ 摄像机 CAM-01'], ['CAB-03', '外场机柜 CAB-03'], ['PDB-02', '照明配电柜 PDB-02']]
            : [['VMS-01', '情报板 VMS-01'], ['VMS-02', '情报板 VMS-02'], ['CAM-101', '门架摄像机 CAM-101'], ['CAM-201', '路侧摄像机 CAM-201'], ['MET-01', '气象检测器 MET-01']];
          lb.innerHTML = objs.map(([c, n]) => `<div class="nav-sub-item" style="padding:6px 8px;color:${n.includes('⚠') ? '#ff9d9d' : '#9fb4d0'}" data-focus="${c}">${n}</div>`).join('');
          lb.querySelectorAll('[data-focus]').forEach(it => it.addEventListener('click', () => {
            twin && twin.focus(it.dataset.focus);
            const code = it.dataset.focus;
            if (code.startsWith('Z-')) showInfo({ kind: 'zone', code, name: code + ' 照明分区' });
            else if (code.startsWith('JF')) showInfo({ kind: 'fan', code, name: '射流风机 ' + code });
            else showInfo({ kind: 'device', code, name: it.textContent.replace('⚠ ', '') });
          }));
        }
      }
      function buildDrill() {
        const db = el.querySelector('#gis-drill');
        const items = D.TUNNELS.map(t => ({ m: 'tunnel', key: t.id, name: t.name, sub: D.kmText(t.start) + '—' + D.kmText(t.end), col: t.hero ? '#4fd8f0' : '#7fb0ff' }))
          .concat(ROAD.map(r => ({ m: 'road', key: r.id, name: r.name, sub: D.kmText(r.km), col: '#ffd24a' })))
          .concat(D.ROOMS.map(rm => ({ m: 'room', key: rm.id, name: rm.name, sub: D.kmText(rm.km), col: '#19e3ff' })));
        db.innerHTML = items.map(it => `
          <div class="nav-sub-item" style="padding:7px 8px;display:flex;align-items:center;gap:8px;${mode === it.m && sceneKey === it.key ? 'background:rgba(47,123,255,.18);border-radius:6px' : ''}" data-drill="${it.m}|${it.key}">
            <span class="cd" style="width:8px;height:8px;border-radius:50%;background:${it.col};flex:0 0 8px"></span>
            <span style="flex:1;color:#cfe0f5;font-size:12px">${it.name}<br><span class="small" style="color:#6d84a6">${it.sub} · ${it.m === 'tunnel' ? '隧道孪生' : it.m === 'room' ? '机房孪生' : '路段孪生'}</span></span>
            <span style="color:#4fd8f0">›</span>
          </div>`).join('');
        db.querySelectorAll('[data-drill]').forEach(it => it.addEventListener('click', () => {
          const [m, k] = it.dataset.drill.split('|');
          drill(m, k);
        }));
      }
      function spark(vals, color) {
        if (!vals || vals.length < 2) return '<div class="small muted" style="padding:8px 0">采集累积中…</div>';
        const min = Math.min(...vals), max = Math.max(...vals), span = (max - min) || 1;
        const pts = vals.map((v, i) => (i / (vals.length - 1) * 118 + 1).toFixed(1) + ',' + (42 - (v - min) / span * 36).toFixed(1)).join(' ');
        return `<svg viewBox="0 0 120 46" style="width:100%;height:46px;display:block"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6"/><polyline points="1,45 ${pts} 119,45" fill="${color}" opacity=".12" stroke="none"/></svg>`;
      }
      function addMonths(date, m) { const d = new Date(date); d.setMonth(d.getMonth() + m); return d; }
      function fmtYM(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
      function fmtMD(d) { return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
      function renderTelemetry(s, hist) {
        const k = el.querySelector('#rm-kpis'); if (!k) return;
        const hl = el.querySelector('#hud-live');
        if (hl) { hl.style.display = ''; hl.textContent = '冷通道 ' + s.coldAisle.toFixed(1) + '℃ · UPS ' + s.upsLoad.toFixed(0) + '% · PUE ' + s.pue.toFixed(2); }
        const items = [
          ['冷通道温度', s.coldAisle.toFixed(1), '℃', s.coldAisle >= 26 ? 'warn' : 'ok'],
          ['热通道温度', s.hotAisle.toFixed(1), '℃', s.hotAisle >= 38 ? 'warn' : 'ok'],
          ['相对湿度', s.humidity.toFixed(0), '%', 'ok'],
          ['UPS 负载', s.upsLoad.toFixed(0), '%', s.upsLoad >= 80 ? 'warn' : 'ok'],
          ['电池健康', s.batteryHealth.toFixed(0), '%', s.batteryHealth < 90 ? 'warn' : 'ok'],
          ['PUE', s.pue.toFixed(2), '', s.pue >= 1.8 ? 'warn' : 'ok']
        ];
        k.innerHTML = items.map(([n, v, u, st]) => `
          <div class="rm-kpi ${st}"><div class="small muted">${n}</div><div class="rm-v">${v}<span class="rm-u">${u}</span></div></div>`).join('');
        const st = el.querySelector('#rm-spark-temp'); if (st) st.innerHTML = spark(hist.temp, '#19e3ff');
        const su = el.querySelector('#rm-spark-ups'); if (su) su.innerHTML = spark(hist.ups, '#f59e0b');
        const p = el.querySelector('#rm-preds'); if (!p) return;
        const target = s.setpoint + s.load * 6;
        const tempMin = target > 28 ? Math.max(1, Math.round((28 - s.coldAisle) / Math.max(0.05, (target - s.coldAisle) / 10))) : 0;
        const batMonths = Math.max(1, Math.round((s.batteryHealth - 80) / 0.3));
        const batDate = addMonths(D.NOW, batMonths);
        const filterDays = Math.max(1, Math.round((150 - s.filterDP) / 0.6));
        const filterDate = new Date(D.NOW.getTime() + filterDays * 86400000);
        const cpuHours = Math.max(1, Math.round((90 - s.cpu) / 0.4));
        p.innerHTML = `
          <div class="pred ${tempMin ? 'warn' : 'ok'}">
            <div class="pred-h"><b>机柜进风温度超阈预测</b><span class="tag ${tempMin ? 'warn' : 'ok'}">${tempMin ? '关注' : '正常'}</span></div>
            <div class="pred-b">${tempMin ? '按当前设定 ' + s.setpoint + '℃ 与负载 ' + Math.round(s.load * 100) + '%，冷通道预计 <b>' + tempMin + ' 分钟</b>后触及 28℃ 阈值（模拟推算）。' : '当前设定 ' + s.setpoint + '℃ 下冷通道无超阈风险（模拟推算）。'}</div>
            <div class="pred-f"><span class="small muted">阈值 28℃ · 模拟预测</span><button class="btn sm" onclick="UI.go('diagnosis')">诊断中心 ›</button></div>
          </div>
          <div class="pred warn">
            <div class="pred-h"><b>UPS 电池容量衰减预测</b><span class="tag warn">关注</span></div>
            <div class="pred-b">电池健康 ${s.batteryHealth.toFixed(0)}%，按离散趋势预计 <b>${fmtYM(batDate)}</b> 容量低于 80%，建议分批更新（模拟推算）。</div>
            <div class="pred-f"><span class="small muted">阈值 80% · 模拟预测</span><button class="btn sm" onclick="UI.go('ups')">UPS 决策 ›</button></div>
          </div>
          <div class="pred warn">
            <div class="pred-h"><b>精密空调滤网堵塞预测</b><span class="tag warn">关注</span></div>
            <div class="pred-b">滤网压差 ${s.filterDP.toFixed(0)} Pa，预计 <b>${filterDays} 天</b>（${fmtMD(filterDate)}）达 150 Pa 堵塞阈值（模拟推算）。</div>
            <div class="pred-f"><span class="small muted">阈值 150Pa · 模拟预测</span><button class="btn sm" onclick="UI.go('keydev')">重点设备 ›</button></div>
          </div>
          <div class="pred">
            <div class="pred-h"><b>核心交换机 CPU 趋势预测</b><span class="tag info">一般</span></div>
            <div class="pred-b">CPU ${s.cpu.toFixed(0)}%，趋势 +0.4%/h，预计 <b>${cpuHours} 小时</b>后达 90%（模拟推算）。</div>
            <div class="pred-f"><span class="small muted">阈值 90% · 模拟预测</span><button class="btn sm" onclick="UI.go('diagnosis')">诊断中心 ›</button></div>
          </div>`;
      }
      function buildBottom() {
        const bt = el.querySelector('#gis-bottom');
        if (mode === 'macro') {
          bt.innerHTML = `<div class="card-h"><span class="card-t">事件时间轴</span><span class="sub">点击定位到宏观场景位置</span><span class="spacer"></span>${U.demoBadge()}</div>
            <div class="card-b tight" style="display:flex;gap:8px;overflow-x:auto;padding:10px" id="gis-timeline"></div>`;
          bt.querySelector('#gis-timeline').innerHTML = D.events.map(e => `
            <div class="evi" style="min-width:210px;margin:0;cursor:pointer;flex:0 0 auto" data-ev="${e.id}">
              <div class="evi-t">${U.levelTag(e.level)} <span class="small">${D.fmtTime(e.time)}</span></div>
              <div class="evi-d" style="font-size:11px">${e.name}</div>
            </div>`).join('');
          bt.querySelectorAll('[data-ev]').forEach(c => c.addEventListener('click', () => {
            const e = D.events.find(x => x.id === c.dataset.ev);
            twin && twin.focusEvent(e.id); showInfo({ kind: 'event', code: e.id });
          }));
        } else if (mode === 'room') {
          bt.innerHTML = `
            <div class="card-h"><span class="card-t">机房实时映射 · 预警预测</span><span class="sub">动环/电源/负载模拟映射 · 模拟推算</span><span class="spacer"></span>${U.demoBadge()}</div>
            <div class="card-b">
              <div class="cap-strip">
                <div class="cap"><b>模仿</b><span>环境/负载/气流仿真</span></div>
                <div class="cap"><b>映射</b><span>动环·电源·负载实时映射</span></div>
                <div class="cap"><b>控制</b><span>模拟调控 · 不下发指令</span></div>
                <div class="cap"><b>预警预测</b><span>阈值/趋势/容量推算</span></div>
              </div>
              <div class="grid g-2 mt">
                <div>
                  <div class="rm-kpis" id="rm-kpis"></div>
                  <div class="grid g-2 mt">
                    <div class="rm-spark-card"><div class="small muted">冷通道温度趋势 (℃)</div><div id="rm-spark-temp"></div></div>
                    <div class="rm-spark-card"><div class="small muted">UPS 负载趋势 (%)</div><div id="rm-spark-ups"></div></div>
                  </div>
                </div>
                <div id="rm-preds"></div>
              </div>
            </div>`;
          if (twin && twin.roomSim) renderTelemetry(twin.roomSim, twin.simHist);
        } else {
          const rows = mode === 'tunnel'
            ? [['JF-01', '射流风机', '运行'], ['JF-02', '射流风机', '运行'], ['JF-03', '射流风机', '运行'], ['JF-04', '射流风机', '运行'], ['Z-03', '照明分区', '异常'], ['CAM-01', '洞内摄像机', '离线'], ['CAB-03', '外场机柜', '异常'], ['PDB-02', '照明配电柜', '异常'], ['COVI-01', 'CO/VI检测器', '在线'], ['SOS-01', '紧急电话/消火栓', '在线']]
            : [['VMS-01', '门架情报板', '在线'], ['VMS-02', '门架情报板', '在线'], ['CAM-101', '门架摄像机', '在线'], ['CAM-102', '门架摄像机', '在线'], ['CAM-201', '路侧摄像机', '在线'], ['MET-01', '气象检测器', '在线']];
          bt.innerHTML = `<div class="card-h"><span class="card-t">场景设备清单</span><span class="sub">点击定位到孪生模型对象</span><span class="spacer"></span>${U.demoBadge()}</div>
            <div class="card-b tight"><table class="tbl"><thead><tr><th>编码</th><th>类型</th><th>状态</th><th style="width:90px">操作</th></tr></thead><tbody>
            ${rows.map(([c, t, s]) => `<tr><td class="mono">${c}</td><td>${t}</td><td>${s === '在线' || s === '运行' ? '<span class="tag ok">' + s + '</span>' : s === '异常' ? '<span class="tag warn">' + s + '</span>' : '<span class="tag err">' + s + '</span>'}</td><td><button class="btn sm" data-loc="${c}">定位</button></td></tr>`).join('')}
            </tbody></table></div>`;
          bt.querySelectorAll('[data-loc]').forEach(b => b.addEventListener('click', () => {
            const c = b.dataset.loc;
            twin && twin.focus(c);
            if (c.startsWith('Z-')) showInfo({ kind: 'zone', code: c, name: c + ' 照明分区' });
            else if (c.startsWith('JF')) showInfo({ kind: 'fan', code: c, name: '射流风机 ' + c });
            else showInfo({ kind: 'device', code: c });
          }));
        }
      }
      function syncSceneSel() {
        const sel = el.querySelector('#gis-scene');
        sel.disabled = mode === 'macro';
        if (sel.disabled) { sel.innerHTML = '<option>全线路网</option>'; return; }
        const opts = mode === 'tunnel' ? D.TUNNELS.map(t => [t.id, t.name]) : mode === 'room' ? D.ROOMS.map(r => [r.id, r.name]) : ROAD.map(r => [r.id, r.name]);
        sel.innerHTML = opts.map(([v, n]) => `<option value="${v}" ${v === sceneKey ? 'selected' : ''}>${n}</option>`).join('');
      }
      function syncConsole() {
        const eqMap = { macro: [], road: ['cam', 'vms', 'power'], tunnel: ['cam', 'fan', 'light', 'power'], room: ['cam', 'fan', 'light', 'power'] };
        const active = eqMap[mode];
        el.querySelectorAll('[data-eq]').forEach(sw => {
          const on = active.includes(sw.dataset.eq);
          sw.style.opacity = on ? '1' : '.35';
          sw.style.pointerEvents = on ? '' : 'none';
        });
        el.querySelector('#ctl-room').style.display = mode === 'room' ? '' : 'none';
        el.querySelector('#hud-live').style.display = mode === 'room' ? '' : 'none';
        el.querySelector('#ctl-view option[value="inside"]').disabled = mode === 'macro';
        el.querySelector('#gis-status-card').style.display = mode === 'macro' ? '' : 'none';
        el.querySelector('#hud-back').style.display = mode === 'macro' ? 'none' : '';
        el.querySelector('#gis-back').disabled = mode === 'macro';
        const inside = el.querySelector('#hud-inside');
        inside.style.display = mode === 'macro' ? 'none' : '';
        inside.innerHTML = mode === 'tunnel' ? U.icon('play', 13) + ' 洞内视角' : U.icon('play', 13) + ' 贴近视角';
      }
      function buildTwin() {
        const seq = ++buildSeq;
        if (twin) { twin.destroy(); twin = null; }
        info.classList.remove('show');
        el.querySelector('#twin-legend').innerHTML = mode === 'macro'
          ? Object.keys(D.CATS).map(c => `<div class="li"><span class="cd" style="background:${D.CATS[c].color}"></span>${D.CATS[c].name}</div>`).join('')
          : mode === 'room'
            ? '<div class="li"><span class="cd" style="background:#19b8ff"></span>在线机柜 / 冷通道地砖</div><div class="li"><span class="cd" style="background:#f59e0b"></span>异常 / 蓄电池组</div><div class="li"><span class="cd" style="background:#39424c"></span>离线机柜</div><div class="li"><span class="cd" style="background:#39ff8e"></span>UPS / 动环正常</div>'
            : mode === 'tunnel'
              ? '<div class="li"><span class="cd" style="background:#ffd28a"></span>照明正常分区</div><div class="li"><span class="cd" style="background:#ef4444"></span>Z-03 异常 / 离线摄像机</div><div class="li"><span class="cd" style="background:#4fd8f0"></span>运行风机 / 控制设备</div>'
              : '<div class="li"><span class="cd" style="background:#39ff8e"></span>情报板 / 尾灯光轨</div><div class="li"><span class="cd" style="background:#ffc46b"></span>头灯光轨 / 路灯</div><div class="li"><span class="cd" style="background:#7fb0ff"></span>摄像机 / 气象检测</div>';
        const loading = el.querySelector('#twin-loading');
        loading.style.display = 'flex';
        setTimeout(() => {
          if (seq !== buildSeq || !box.isConnected) return;
          if (twin) { twin.destroy(); twin = null; }
          twin = new Twin.Twin(box, {
            mode, sceneKey, onSelect,
            onTelemetry: (s, h) => renderTelemetry(s, h),
            time: el.querySelector('#ctl-time .seg.on').dataset.t,
            focus: params.focus || null
          });
          twin.setTraffic(+el.querySelector('#ctl-traffic').value);
          twin.setFog(+el.querySelector('#ctl-fog').value / 100);
          twin.setLabels(el.querySelector('#ctl-labels').classList.contains('on'));
          twin.setQuality(el.querySelector('#ctl-quality').value);
          twin.autoRotate = el.querySelector('#ctl-auto').classList.contains('on');
          el.querySelectorAll('[data-eq]').forEach(sw => twin.setEquip(sw.dataset.eq, sw.classList.contains('on')));
          if (mode === 'room') {
            twin.setRoomParam('setpoint', +el.querySelector('#ctl-setpoint').value);
            twin.setRoomParam('load', +el.querySelector('#ctl-load').value);
            twin.setRoomParam('light', +el.querySelector('#ctl-roomlight').value);
            twin.setRoomParam('airflow', el.querySelector('#ctl-airflow').classList.contains('on'));
            twin.setRoomParam('heat', el.querySelector('#ctl-heat').classList.contains('on'));
            renderTelemetry(twin.roomSim, twin.simHist);
          }
          loading.style.display = 'none';
          buildLayers();
          if (params.focus) {
            const d = D.byCode[params.focus];
            if (d) showInfo({ kind: 'device', code: d.code });
          }
        }, 30);
      }
      function rebuild() {
        el.querySelectorAll('#gis-mode .seg').forEach(b => {
          const selected = b.dataset.m === mode;
          b.classList.toggle('on', selected);
          b.setAttribute('aria-pressed', String(selected));
        });
        syncSceneSel(); syncConsole(); buildDrill(); buildBottom(); buildTwin();
      }
      rebuild();
      /* ---- 头部导航 ---- */
      el.querySelector('#gis-view-switch').onclick = () => {
        const current = { ...params, mode };
        if (mode === 'macro') delete current.scene;
        else current.scene = sceneKey;
        // Keep browser Back and the return button on the same equipment scene.
        history.replaceState(history.state, '', '#/gis?' + new URLSearchParams(current));
        U.go('gis', { ...current, view: 'bridge' });
      };
      el.querySelectorAll('#gis-mode .seg').forEach(b => b.addEventListener('click', () => {
        if (b.dataset.m === mode) return;
        mode = b.dataset.m;
        sceneKey = mode === 'tunnel' ? 'QL' : mode === 'road' ? 'RS-QL' : mode === 'room' ? 'MR-01' : sceneKey;
        rebuild();
      }));
      el.querySelector('#gis-scene').addEventListener('change', ev => { sceneKey = ev.target.value; rebuild(); });
      const backMacro = () => { mode = 'macro'; rebuild(); };
      el.querySelector('#gis-back').addEventListener('click', backMacro);
      el.querySelector('#hud-back').addEventListener('click', backMacro);
      el.querySelector('#hud-top').addEventListener('click', () => twin && twin.topView());
      el.querySelector('#hud-inside').addEventListener('click', () => twin && twin.insideView());
      function setAuto(on) {
        el.querySelector('#hud-auto').classList.toggle('on', on);
        el.querySelector('#ctl-auto').classList.toggle('on', on);
        if (twin) twin.autoRotate = on;
      }
      el.querySelector('#hud-auto').addEventListener('click', ev => setAuto(!ev.currentTarget.classList.contains('on')));
      el.querySelector('#ctl-auto').addEventListener('click', ev => setAuto(!ev.currentTarget.classList.contains('on')));
      el.querySelectorAll('#gis-status .pill').forEach(p => p.addEventListener('click', () => {
        el.querySelectorAll('#gis-status .pill').forEach(x => x.classList.remove('on'));
        p.classList.add('on');
        twin && twin.setStatusFilter(p.dataset.s);
      }));
      /* ---- 控制台 ---- */
      el.querySelectorAll('#ctl-time .seg').forEach(b => b.addEventListener('click', () => {
        el.querySelectorAll('#ctl-time .seg').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        twin && twin.setTime(b.dataset.t);
      }));
      el.querySelector('#ctl-fog').addEventListener('input', ev => {
        el.querySelector('#ctl-fog-v').textContent = ev.target.value + '%';
        twin && twin.setFog(+ev.target.value / 100);
      });
      el.querySelector('#ctl-traffic').addEventListener('input', ev => {
        el.querySelector('#ctl-traffic-v').textContent = ev.target.value;
        twin && twin.setTraffic(+ev.target.value);
      });
      el.querySelector('#ctl-rand').addEventListener('click', () => { twin && twin.randomize(); U.toast('已随机重布车流', 'ok'); });
      el.querySelector('#ctl-labels').addEventListener('click', ev => {
        ev.currentTarget.classList.toggle('on');
        twin && twin.setLabels(ev.currentTarget.classList.contains('on'));
      });
      el.querySelector('#ctl-view').addEventListener('change', ev => twin && twin.setView(ev.target.value));
      el.querySelector('#ctl-quality').addEventListener('change', ev => twin && twin.setQuality(ev.target.value));
      el.querySelectorAll('[data-eq]').forEach(sw => sw.addEventListener('click', () => {
        sw.classList.toggle('on');
        twin && twin.setEquip(sw.dataset.eq, sw.classList.contains('on'));
      }));
      el.querySelector('#ctl-setpoint').addEventListener('input', ev => {
        el.querySelector('#ctl-setpoint-v').textContent = (+ev.target.value).toFixed(1) + '℃';
        twin && twin.setRoomParam('setpoint', +ev.target.value);
        if (twin && twin.roomSim) renderTelemetry(twin.roomSim, twin.simHist);
      });
      el.querySelector('#ctl-load').addEventListener('input', ev => {
        el.querySelector('#ctl-load-v').textContent = ev.target.value + '%';
        twin && twin.setRoomParam('load', +ev.target.value);
        if (twin && twin.roomSim) renderTelemetry(twin.roomSim, twin.simHist);
      });
      el.querySelector('#ctl-roomlight').addEventListener('input', ev => {
        el.querySelector('#ctl-roomlight-v').textContent = ev.target.value + '%';
        twin && twin.setRoomParam('light', +ev.target.value);
      });
      el.querySelector('#ctl-airflow').addEventListener('click', ev => {
        ev.currentTarget.classList.toggle('on');
        twin && twin.setRoomParam('airflow', ev.currentTarget.classList.contains('on'));
      });
      el.querySelector('#ctl-heat').addEventListener('click', ev => {
        ev.currentTarget.classList.toggle('on');
        twin && twin.setRoomParam('heat', ev.currentTarget.classList.contains('on'));
      });
      el.querySelector('#ctl-reset').addEventListener('click', () => { twin && twin.resetView(); el.querySelector('#ctl-view').value = 'orbit'; });
      el.querySelector('#ctl-shot').addEventListener('click', () => {
        if (!twin || !twin.renderer) { U.toast('场景尚未就绪', 'warn'); return; }
        const url = twin.screenshot();
        const a = document.createElement('a');
        a.href = url; a.download = 'digital-twin-' + mode + '.png';
        document.body.appendChild(a); a.click(); a.remove();
        U.toast('已导出当前场景截图', 'ok');
      });
    }
  };

  /* ================= 设备监测 ================= */
  P.devices = {
    title: '设备监测 · 全专业设备台账', group: '设备监测',
    render(el, params) {
      const state = { cat: params.cat || 'all', status: params.status || 'all', q: params.q || '', imp: 'all', place: 'all', vendor: 'all' };
      const vendors = [...new Set(D.devices.map(d => d.vendor))];
      const places = [...D.TUNNELS.map(t => t.name), ...D.TOLLS.map(t => t.name), ...D.ROOMS.map(r => r.name)];
      el.innerHTML = U.pageHead('设备监测 · 全专业设备列表',
        '统一纳管六大专业 ' + D.stats().total.toLocaleString() + ' 台设备。不同厂家设备映射到统一编码；无采集数据的设备显示数据中断，不默认正常。点击行打开设备档案抽屉。',
        `<button class="btn" id="dev-clear">${U.icon('reset', 14)} 清空筛选</button>
         <button class="btn" onclick="UI.toast('已模拟导出设备台账（模拟反馈）','ok')">${U.icon('export', 14)} 导出台账</button>`) +
        `<div class="tabs" id="dev-tabs"></div>
        <div class="card mb"><div class="card-b">
          <div class="filter-bar">
            <input class="inp" id="dev-q" placeholder="搜索设备编号 / 名称 / 桩号 / 位置" value="${U.esc(state.q)}">
            <label class="fld">状态 <select class="sel" id="dev-status"><option value="all">全部</option><option value="online">在线</option><option value="warn">异常</option><option value="offline">离线</option></select></label>
            <label class="fld">重要等级 <select class="sel" id="dev-imp"><option value="all">全部</option><option>关键</option><option>重要</option><option>一般</option></select></label>
            <label class="fld">位置 <select class="sel" id="dev-place"><option value="all">全路段</option>${places.map(p => `<option>${p}</option>`).join('')}</select></label>
            <label class="fld">厂家 <select class="sel" id="dev-vendor"><option value="all">全部厂家</option>${vendors.map(v => `<option>${v}</option>`).join('')}</select></label>
          </div>
          <div class="stat-mini mt" id="dev-stats"></div>
        </div></div>
        <div class="card"><div class="card-b tight" id="dev-table"></div></div>`;
      // tabs
      const tabs = el.querySelector('#dev-tabs');
      function drawTabs() {
        const items = [['all', '全部', D.devices.length]].concat(Object.keys(D.CATS).map(c => [c, D.CATS[c].name, D.catStats[c].total]));
        tabs.innerHTML = items.map(([k, n, cnt]) => `<div class="tab ${state.cat === k ? 'on' : ''}" data-cat="${k}">${n}<span class="n">${cnt}</span></div>`).join('');
        tabs.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => { state.cat = t.dataset.cat; drawTabs(); drawTable(); }));
      }
      function filtered() {
        return D.devices.filter(d => {
          if (state.cat !== 'all' && d.cat !== state.cat) return false;
          if (state.status !== 'all' && d.status !== state.status) return false;
          if (state.imp !== 'all' && d.importance !== state.imp) return false;
          if (state.place !== 'all' && d.place !== state.place) return false;
          if (state.vendor !== 'all' && d.vendor !== state.vendor) return false;
          if (state.q) {
            const q = state.q.toLowerCase();
            if (!(d.code.toLowerCase().includes(q) || d.name.toLowerCase().includes(q) || d.kmText.toLowerCase().includes(q) || (d.place || '').toLowerCase().includes(q))) return false;
          }
          return true;
        });
      }
      const impOrder = { '关键': 3, '重要': 2, '一般': 1 };
      const stOrder = { warn: 3, offline: 2, online: 1 };
      function drawTable() {
        const rows = filtered();
        const s = D.stats(rows);
        el.querySelector('#dev-stats').innerHTML = `
          <span class="it" style="cursor:pointer" data-st="all"><b>${s.total}</b>设备总数</span>
          <span class="it" style="cursor:pointer" data-st="online"><b style="color:#15803d">${s.onlineRate.toFixed(1)}%</b>在线率（${s.online}）</span>
          <span class="it" style="cursor:pointer" data-st="warn"><b style="color:#b45309">${s.warn}</b>异常</span>
          <span class="it" style="cursor:pointer" data-st="offline"><b style="color:#64748b">${s.offline}</b>离线</span>
          <span class="it muted small" style="align-self:center">点击统计可快速筛选 · ${U.demoBadge()}</span>`;
        el.querySelectorAll('#dev-stats [data-st]').forEach(x => x.addEventListener('click', () => {
          state.status = x.dataset.st; el.querySelector('#dev-status').value = state.status; drawTable();
        }));
        U.table(el.querySelector('#dev-table'), {
          rows, pageSize: 12, sortKey: null,
          cols: [
            { key: 'code', title: '设备编码', sortable: true, render: d => `<span class="code">${d.code}</span>` },
            { key: 'name', title: '设备名称', render: d => U.esc(d.name) },
            { key: 'cat', title: '专业', render: d => U.catTag(d.cat) },
            { key: 'type', title: '类型', render: d => `<span class="muted">${d.type}</span>` },
            { key: 'vendor', title: '厂家/型号', render: d => `<span class="small">${d.vendor}<br><span class="muted">${d.model}</span></span>` },
            { key: 'kmText', title: '位置', sortable: true, sortVal: d => d.km, render: d => `<span class="small mono">${d.kmText}</span><br><span class="small muted">${U.esc(d.place || d.section)}</span>` },
            { key: 'status', title: '状态', sortable: true, sortVal: d => stOrder[d.status], render: d => U.statusTag(d.status) + (d.status === 'offline' ? '<br><span class="small" style="color:#b91c1c">数据中断</span>' : '') },
            { key: 'alarmCnt', title: '当前告警', sortable: true, sortVal: d => d.alarms.filter(a => a.status === 'active').length, render: d => { const n = d.alarms.filter(a => a.status === 'active').length; return n ? `<span class="tag err">${n} 条</span>` : '<span class="muted">0</span>'; } },
            { key: 'importance', title: '等级', sortable: true, sortVal: d => impOrder[d.importance], render: d => `<span class="tag ${d.importance === '关键' ? 'warn' : 'plain'}">${d.importance}</span>` },
            { key: 'lastComm', title: '最近通信', sortable: true, sortVal: d => d.lastComm.getTime(), render: d => `<span class="small muted">${D.fmtTime(d.lastComm)}</span>` },
            { key: 'op', title: '关联', render: d => `<a title="查看拓扑关系" onclick="event.stopPropagation();UI.go('topology',{focus:'${d.code}'})">${U.icon('topo', 15)}</a>` }
          ],
          onRow: d => U.openDevice(d.code),
          rowClass: d => d.status !== 'online' ? 'hl' : '',
          onClear: true
        });
      }
      window.UI.tableClear = () => { state.cat = 'all'; state.status = 'all'; state.q = ''; state.imp = 'all'; state.place = 'all'; state.vendor = 'all'; syncInputs(); drawTabs(); drawTable(); };
      function syncInputs() {
        el.querySelector('#dev-q').value = state.q;
        el.querySelector('#dev-status').value = state.status;
        el.querySelector('#dev-imp').value = state.imp;
        el.querySelector('#dev-place').value = state.place;
        el.querySelector('#dev-vendor').value = state.vendor;
      }
      syncInputs(); drawTabs(); drawTable();
      let qt = null;
      el.querySelector('#dev-q').addEventListener('input', ev => { clearTimeout(qt); qt = setTimeout(() => { state.q = ev.target.value.trim(); drawTable(); }, 220); });
      [['#dev-status', 'status'], ['#dev-imp', 'imp'], ['#dev-place', 'place'], ['#dev-vendor', 'vendor']].forEach(([sel, key]) => {
        el.querySelector(sel).addEventListener('change', ev => { state[key] = ev.target.value; drawTable(); });
      });
      el.querySelector('#dev-clear').addEventListener('click', () => UI.tableClear());
    }
  };

  /* ================= 数据接入 ================= */
  P.sources = {
    title: '数据接入 · 多厂家数据源', group: '数据接入',
    render(el, params) {
      let tab = params.tab || 'overview';
      const ok = D.sources.filter(s => s.status === '正常').length;
      el.innerHTML = U.pageHead('数据接入 · 多厂家数据源总览',
        '平台优先复用各厂家既有平台与接口：API、数据库只读视图、标准协议、边缘网关与文件批量同步。区分“源平台中断”与“设备离线”，避免把采集链路故障误判为设备故障。',
        `<button class="btn" onclick="UI.toast('已模拟触发全量同步检查（模拟反馈）','ok')">${U.icon('reset', 14)} 同步检查</button>`) +
        `<div class="grid g-4 mb">
          ${U.kpi('接入数据源', D.sources.length, '覆盖 6 大专业 + 台账文件', '#2f7bff', null, 'db', '个')}
          ${U.kpi('连接正常', ok, 'API×3 · 协议×1 · 视图×1 · 文件×1', '#16a34a', null, 'check', '个')}
          ${U.kpi('同步延迟', 1, '电力监控系统 · 平均延迟46s', '#f59e0b', null, 'warn', '个')}
          ${U.kpi('部分中断', 1, '隧道控制系统 · EG-QL-01网关', '#ef4444', null, 'bell', '个')}
        </div>
        <div class="tabs" id="src-tabs">
          <div class="tab" data-t="overview">数据源总览</div>
          <div class="tab" data-t="map">字段映射</div>
          <div class="tab" data-t="quality">数据质量</div>
        </div>
        <div id="src-body"></div>`;
      function drawTab() {
        el.querySelectorAll('#src-tabs .tab').forEach(t => t.classList.toggle('on', t.dataset.t === tab));
        const body = el.querySelector('#src-body');
        if (tab === 'overview') {
          body.innerHTML = `
            <div class="card dark-panel mb"><div class="card-h"><span class="card-t">统一接入数据流</span><span class="sub">厂商平台/设备 → 多源接入 → 字段标准化 → 统一设备编码 → 数据底座</span><span class="spacer"></span>${U.demoBadge()}</div>
              <div class="card-b" id="src-flow"></div></div>
            <div class="grid g-3" id="src-cards"></div>`;
          drawFlow(body.querySelector('#src-flow'));
          const cards = body.querySelector('#src-cards');
          D.sources.forEach(s => {
            const stTag = s.status === '正常' ? '<span class="tag ok">正常</span>' : s.status === '延迟' ? '<span class="tag warn">延迟</span>' : '<span class="tag err">部分中断</span>';
            const c = document.createElement('div');
            c.className = 'card';
            c.style.cursor = 'pointer';
            c.innerHTML = `<div class="card-h"><span class="card-t">${s.name}</span><span class="spacer"></span>${stTag}</div>
              <div class="card-b">
                <div class="kv">
                  <span class="k">厂家/系统</span><span class="v">${s.vendor}</span>
                  <span class="k">专业类别</span><span class="v">${U.catTag(s.cat)}</span>
                  <span class="k">接入方式</span><span class="v"><span class="tag info">${s.access}</span></span>
                  <span class="k">覆盖设备</span><span class="v"><b>${s.deviceCount}</b> 台/套</span>
                  <span class="k">最近同步</span><span class="v">${D.fmtTime(s.sync)}</span>
                  <span class="k">平均延迟</span><span class="v">${s.latency != null ? s.latency + ' s' : '非实时（每日批量）'}</span>
                  <span class="k">异常记录</span><span class="v">${s.errors ? '<span style="color:#b45309">' + s.errors + ' 条</span>' : '0'}</span>
                </div>
              </div>`;
            c.addEventListener('click', () => openSource(s));
            cards.appendChild(c);
          });
          if (params.focus) { const s = D.sources.find(x => x.id === params.focus); if (s) setTimeout(() => openSource(s), 100); }
        } else if (tab === 'map') {
          body.innerHTML = `<div class="card"><div class="card-h"><span class="card-t">字段映射规则</span><span class="sub">源字段 → 统一字段 · 点击行查看转换示例</span><span class="spacer"></span>${U.demoBadge()}<button class="btn sm" onclick="UI.go('config')">配置维护 ›</button></div><div class="card-b tight" id="map-tbl"></div></div>
          <div class="note-box blue mt">统一数据口径：时间戳统一为 UTC+8；状态枚举统一为 online/warn/offline；告警级别统一为 严重/重要/一般/提示。同一设备在不同厂家平台中的编码通过映射表归一到统一 asset_code。</div>`;
          U.table(body.querySelector('#map-tbl'), {
            rows: D.fieldMappings, pageSize: 10,
            cols: [
              { key: 'source', title: '数据源', render: m => `<span class="code">${m.source}</span> ${(D.sources.find(s => s.id === m.source) || {}).name || ''}` },
              { key: 'src', title: '源字段', render: m => `<span class="mono">${m.src}</span>` },
              { key: 'dst', title: '统一字段', render: m => `<span class="mono" style="color:#0e7490">${m.dst}</span>` },
              { key: 'rule', title: '转换规则', render: m => `<span class="tag info">${m.rule}</span>` }
            ],
            onRow: m => U.modal('字段映射详情', `<div class="kv"><span class="k">数据源</span><span class="v">${m.source}</span><span class="k">源字段</span><span class="v mono">${m.src}</span><span class="k">统一字段</span><span class="v mono">${m.dst}</span><span class="k">规则</span><span class="v">${m.rule}</span></div><div class="sec-t">转换示例</div><div class="note-box gray mono small">输入：${m.src} = ${m.src.includes('status') ? '1' : m.src.includes('power') ? '-12.4' : 'HV-N-0182'}<br>输出：${m.dst} = ${m.src.includes('status') ? 'online' : m.src.includes('power') ? '-12.4 dBm' : 'CAM-01'}</div>`)
          });
        } else {
          body.innerHTML = `<div class="card"><div class="card-h"><span class="card-t">数据质量校验</span><span class="sub">缺失 / 重复 / 异常值 / 时间漂移 / 单位不一致 / 数据中断</span><span class="spacer"></span>${U.demoBadge()}</div><div class="card-b tight" id="q-tbl"></div></div>
          <div class="note-box mt">数据源不可用时，相关设备显示“数据中断/最后更新时间”，不会将无数据解释为设备正常。当前 EG-QL-01 网关部分中断影响 Z-04 分区照度点位 26 个。</div>`;
          U.table(body.querySelector('#q-tbl'), {
            rows: D.qualityIssues, pageSize: 10,
            cols: [
              { key: 'rule', title: '质量规则', render: q => `<b>${q.rule}</b>` },
              { key: 'source', title: '数据源', render: q => `<span class="code">${q.source}</span>` },
              { key: 'hits', title: '命中数', sortable: true, cls: 'num', render: q => `<span class="tag warn">${q.hits}</span>` },
              { key: 'detail', title: '说明', render: q => `<span class="small muted">${q.detail}</span>` },
              { key: 'last', title: '最近命中', sortable: true, sortVal: q => q.last.getTime(), render: q => `<span class="small muted">${D.fmtTime(q.last)}</span>` }
            ],
            onRow: q => U.modal('质量规则命中记录 · ' + q.rule, `<p style="font-size:12px;line-height:1.8;color:var(--text-2)">${q.detail}</p><div class="sec-t">最近命中（历史记录）</div>` + Array.from({ length: Math.min(q.hits, 5) }, (_, i) => `<div class="evi"><div class="evi-t small">${D.fmtTime(D.ago(i * 17 + 3))} · ${q.source}</div><div class="evi-d small">记录 #${1000 + i}：${q.rule}，已标记质量位并保留原始值。</div></div>`).join(''))
          });
        }
      }
      function drawFlow(box) {
        const steps = [['厂商平台/设备', '6专业 · 12厂家', '#64748b'], ['多源接入', 'API/视图/协议/网关/文件', '#2f7bff'], ['字段标准化', '口径/单位/枚举/时间', '#00b8d9'], ['统一设备编码', '映射表 MAP-01', '#8b5cf6'], ['统一数据底座', '1,286台 · 时序/告警/关系', '#16a34a']];
        box.innerHTML = `<div style="display:flex;align-items:stretch;gap:0;flex-wrap:wrap">` + steps.map(([n, s, c], i) => `
          <div style="flex:1;min-width:130px;background:rgba(22,64,122,.3);border:1px solid ${c}55;border-radius:8px;padding:10px 12px;position:relative">
            <div style="font-size:12px;font-weight:700;color:${c}">${i + 1}. ${n}</div>
            <div style="font-size:10px;color:#7e95b8;margin-top:3px">${s}</div>
          </div>${i < 4 ? '<div style="display:flex;align-items:center;padding:0 6px;color:#3d5f92;font-size:16px">→</div>' : ''}`).join('') + '</div>';
      }
      function openSource(s) {
        const devs = D.devices.filter(d => d.sourceId === s.id);
        const sample = devs.slice(0, 10);
        U.openDrawer(s.name + ' <span class="small muted">' + s.id + '</span>', `
          <div class="flex ai-center mb">${s.status === '正常' ? '<span class="tag ok lg">连接正常</span>' : s.status === '延迟' ? '<span class="tag warn lg">同步延迟</span>' : '<span class="tag err lg">部分中断</span>'} <span class="tag info">${s.access}</span> ${U.demoBadge()}</div>
          <div class="kv">
            <span class="k">厂家/系统</span><span class="v">${s.vendor}</span>
            <span class="k">接口/协议</span><span class="v mono small">${s.api}</span>
            <span class="k">同步频率</span><span class="v">${s.freq}</span>
            <span class="k">数据类型</span><span class="v">${s.types}</span>
            <span class="k">覆盖设备</span><span class="v"><b>${s.deviceCount}</b> 台/套</span>
            <span class="k">最近同步</span><span class="v">${D.fmtTime(s.sync, 'full')}</span>
            <span class="k">平均延迟</span><span class="v">${s.latency != null ? s.latency + ' s' : '非实时'}</span>
          </div>
          ${s.status !== '正常' ? `<div class="note-box mt">${s.status === '延迟' ? '电力监控 API 平均延迟 46s（门限 30s），已标记质量位。受影响设备显示“数据延迟”而非离线。' : 'EG-QL-01 边缘网关上送部分中断，影响 Z-04 分区照度点位 26 个。相关点位显示“数据中断 · 最后更新 10:27”，不判定为设备故障。'}</div>` : ''}
          <div class="sec-t">最近错误记录（${s.errors}）</div>
          ${s.errors ? Array.from({ length: Math.min(s.errors, 4) }, (_, i) => `<div class="evi"><div class="evi-t small">${D.fmtTime(D.ago(i * 13 + 4))}</div><div class="evi-d small">${s.status === '延迟' ? 'API 响应超时（>30s），自动重试成功' : '网关缓存上送超时，点位质量位标记为 BAD'}</div></div>`).join('') : '<div class="muted small">无错误记录</div>'}
          <div class="sec-t">覆盖设备清单（前10 / 共${devs.length}）</div>
          ${sample.map(d => `<div class="evi" style="cursor:pointer;padding:7px 12px" onclick="UI.openDevice('${d.code}')"><div class="evi-t small"><span class="mono">${d.code}</span> ${U.statusTag(d.status)}</div><div class="src">${d.name} · ${d.kmText}</div></div>`).join('')}
          <button class="btn mt" onclick="UI.go('devices',{cat:'${s.cat}'})">查看该专业全部设备 ›</button>`, true);
      }
      el.querySelectorAll('#src-tabs .tab').forEach(t => t.addEventListener('click', () => { tab = t.dataset.t; drawTab(); }));
      drawTab();
    }
  };
})();

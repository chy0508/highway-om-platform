(()=>{
  const U=RoadUI,{M,ico,btn,pill,heading,stat}=U;
  U.views.overview=()=>{
    const site=M.site(U.s.site),open=U.alerts(),tasks=M.schedule(U.s.combine,U.s.late);
    const total=M.sum(M.sites.map(s=>M.sum(s.counts)));
    const active=M.sum(open.map(e=>e.impact));
    const cost=M.sum(M.sites.map(s=>M.energy(s.id,'light','sun','high','control').meter+M.energy(s.id,'fan','sun','high','control').meter));
    const event=M.events.find(e=>e.site===site.id);
    const pins=Object.entries(RoadMap.anchors).map(([id,[x,y]])=>{
      if(id==='O')return `<span class="basepin" style="left:${x*100}%;top:${y*100}%"><i></i><b>养护基地</b></span>`;
      const selected=site.id===id;
      return `<button class="map-pin ${selected?'active':''}" data-action="site" data-value="${id}" style="left:${x*100}%;top:${y*100}%" aria-pressed="${selected}"><i></i><b>${M.site(id).name}</b></button>`;
    }).join('');
    return `<div class="stats">${stat('纳管设备',total,'台','box','3 座隧道 · 4 类资产','feature')}${stat('待处置事件',open.length,'起','bell',`涉及 ${active} 台 / 组设备`,'amber')}${stat('计划检测任务','3','项','plan',`当前编排 ${tasks.trips.length} 趟出车`)}${stat('日用电参考值',U.fmt(Math.round(cost)),'kWh','energy','照明与通风合计')}</div>
    <div class="overviewgrid"><section class="card mapcard">${heading('路段运行图','','road')}
      <div class="maparea"><canvas id="corridorMap" aria-hidden="true"></canvas><div class="mapname"><em>QLEX</em><span>青岚高速东段</span></div><div class="compass"><b>N</b>↑</div>${pins}<div class="maplegend"><span></span> 所辖路段 <b></b> 隧道节点</div></div>
      <div class="sitebar"><div class="siteid">${ico('pin',22)}</div><div><strong>${site.name}</strong><small>K${site.km}+000 · ${M.sum(site.counts)} 台设备</small></div><div class="siteactions">${btn('关联事件 '+ico('right',14),'event',event.id,'textbtn')}${btn(U.s.assets?'收起资产':'资产明细','assets','','textbtn')}</div></div>
      ${U.s.assets?'<div class="assetlines">'+['监控摄像机','通信设备','照明设备','射流风机'].map((label,i)=>'<div><span>'+label+'</span><strong>'+site.counts[i]+' 台</strong></div>').join('')+'</div>':''}</section>
    <section class="card events">${heading('当班事件',`<span class="counter">${open.length} 待处置</span>`,'bell')}
    <div class="eventlist">${M.events.map(e=>`<button class="eventcard ${U.s.cases[e.id]?.closed?'cleared':e.severity==='高'?'priority':''}" data-action="event" data-value="${e.id}"><div class="evtop">${pill(U.s.cases[e.id]?.closed?'已核验':e.severity==='高'?'重点关注':'跟踪中',U.s.cases[e.id]?.closed?'green':e.severity==='高'?'orange':'neutral')}<time>${e.time}</time></div><h3>${e.title}</h3><div class="evbottom"><span>${M.site(e.site).name} · ${e.type}</span>${ico('right',16)}</div></button>`).join('')}</div></section></div>
    <section class="workareas">${heading('业务工作区','','home')}<div class="entrygrid">${[
      ['plan','plan','养护与检修','检测任务统筹、设备修换与预算'],
      ['diag','diag','故障诊断','共同故障源定位与修复核验'],
      ['energy','energy','能效分析','运行策略、改造投资与收益核验']
    ].map(([id,ic,t,desc])=>`<button class="entry" data-action="page" data-value="${id}"><span class="entryicon">${ico(ic,22)}</span><span><strong>${t}</strong><small>${desc}</small></span>${ico('arrow',16)}</button>`).join('')}</div></section>`;
  };
})();

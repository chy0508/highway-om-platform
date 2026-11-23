(()=>{
  const U=RoadUI,{M,ico,heading,seg,stat,fmt,select,line,pill}=U;
  function task(){
    const s=U.s,v=M.schedule(s.combine,s.late);
    const hhmm=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
    const selectedTrip=v.trips.find(t=>t.ids.includes(s.site));
    const selectedStop=selectedTrip.stops.find(stop=>stop.id===s.site);
    const toolbar=`<div class="controls">${select('late',[['false','11/23 · 同日窗口'],['true','11/24 · 次日窗口']],s.late,'云岭隧道作业窗口')}${seg('combine',[['false','分次出车'],['true','集中编排']],s.combine)}</div>`;
    return `<div class="card panel">${heading('风机振动检测',pill('计划作业','green'),'plan')}${toolbar}<p class="task-context">当前任务 · ${M.site(s.site).name}射流风机 ${s.site}-F01 · ${selectedTrip.day} ${hhmm(selectedStop.start)}–${hhmm(selectedStop.end)} · ${selectedTrip.crew} / ${selectedTrip.meter}</p>
    <div class="inmetrics"><div><small>出车安排</small><b>${v.trips.length} <em>趟</em></b></div><div><small>往返总里程</small><b>${v.km} <em>km</em></b></div><div><small>预计作业费用</small><b>¥ ${fmt(v.cost)}</b></div><div><small>较分次出车节省</small><b class="teal">${v.saved} <em>km</em></b></div></div>
    <div class="routewrap">${v.trips.map((t,i)=>`<div class="routeline"><span class="routecode">趟次 ${i+1}<small>${t.day}</small></span><div class="stops"><b>基地出发<small>${hhmm(t.depart)}</small></b>${t.stops.map(stop=>`<i>→</i><strong>${M.site(stop.id).name}<small>${hhmm(stop.start)}–${hhmm(stop.end)}</small></strong>`).join('')}<i>→</i><b>返回基地<small>${hhmm(t.returnAt)}</small></b></div><span>${t.km} km</span></div>`).join('')}</div>
    <div class="callout">${ico('info')}<span>${s.late?'云岭任务移至次日，无法与石门任务同趟完成。':s.combine?'石门与云岭共用机电一班和振动仪 V-01，同日窗口允许连续检测。':'分次方案按每座隧道各自往返基地计费。'} 松岚须由具备该段作业许可的机电二班独立执行。</span></div></div>
    <div class="card panel">${heading('任务与资源','','layers')}<div class="tablewrap"><table><thead><tr><th>隧道 / 桩号</th><th>检测设备</th><th>作业窗口</th><th>班组 / 仪器</th><th>预计耗时</th></tr></thead><tbody>${M.sites.map(x=>`<tr class="${x.id===s.site?'current-task':''}"><td><b>${x.name}</b> · K${x.km}</td><td>射流风机 ${x.id}-F01</td><td>${x.id==='B'&&s.late?x.window.replace('23','24'):x.window}</td><td>${x.id==='C'?'机电二班 / V-02':'机电一班 / V-01'}</td><td>40 min</td></tr>`).join('')}</tbody></table></div><p class="footnote">车辆与班组固定费用为 380 元/趟，行驶费用为 4 元/km。里程按养护基地往返估算。</p></div>`;
  }
  function budget(){
    const s=U.s,v=M.allocation(s.budget,s.age),r=M.replace(s.age);
    const camera=v.items.find(c=>c.id==='CAM-B02');
    const decision=!camera.eligible?'继续使用，暂缓更新':camera.funded?'已纳入预算，本期一并更换':'本期延后，按更新次序预算尚差 '+fmt(camera.shortfall)+' 元';
    return `<div class="twocol"><section class="card panel">${heading('同杆摄像机修换比较','<small>CAM-B02</small>','settings')}${select('age',[['1','1 年'],['3','3 年'],['5','5 年']],s.age,'仍在线设备的已服役年限')}
    <div class="bigread"><span>同杆一并更换净收益</span><b class="${r.net<0?'ochre':'teal'}">${r.net>0?'+':''}${fmt(r.net)} <em>元</em></b></div>
    ${line('可避免的单独出车与占道费用','¥ 1,680')}${line('提前更换的剩余价值损失','¥ '+fmt(r.residual))}${line('经济性判断',r.net>0?'一并更换可节约费用':'继续使用更经济')}${line('本期执行安排',decision)}
    <p class="footnote">设备购置价按 4,600 元、使用年限按 6 年测算，剩余价值按直线法折算。</p></section>
    <section class="card panel">${heading('年度更新预算','','calendar')}${select('budget',[['0','0 元'],['13000','13,000 元'],['16000','16,000 元'],['22000','22,000 元']],s.budget,'可用预算')}
    <div class="bigread"><span>已安排资金</span><b>¥ ${fmt(v.used)}</b></div>${line('安排更新',v.items.filter(c=>c.funded).length+' 项')}${line('剩余预算','¥ '+fmt(v.left))}
    <p class="footnote">候选设备按业务中断影响和年度维修记录预排序，按序纳入预算可覆盖的项目。</p></section></div>
    <section class="card panel">${heading('年度更新候选清单','','plan')}<div class="tablewrap"><table><thead><tr><th>设备</th><th>业务影响</th><th>年维修支出</th><th>更新费用</th><th>本年安排</th></tr></thead><tbody>${v.items.map(c=>`<tr><td><b>${c.name}</b><small>${c.id}</small></td><td>${c.impact}</td><td>¥ ${fmt(c.cost)}</td><td>¥ ${fmt(c.budget)}</td><td>${pill(c.funded?'纳入更新':c.eligible?'预算延后':'继续使用',''+(c.funded?'green':'neutral'))}</td></tr>`).join('')}</tbody></table></div></section>`;
  }
  U.views.plan=()=>`<div class="pagetabs">${seg('planTab',[['task','现场检修统筹'],['budget','设备修换与预算']],U.s.planTab)}</div>${U.s.planTab==='task'?task():budget()}`;
})();

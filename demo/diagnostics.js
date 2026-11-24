(()=>{
  const U=RoadUI,{M,btn,seg,heading,pill,select,ico,line}=U;
  U.views.diag=()=>{
    const s=U.s,v=U.currentCase(),d=M.diagnosis(s.event,v.evidence),e=d.e;
    const isLight=e.id==='lights',isPulse=e.id==='pulse';
    const note=isLight?'灯具回路电流及亮度反馈': '连续可用画面和录像完整性';
    const evidenceNames=isLight?[['power','回路分闸'],['network','控制器失联']]:[['power',isPulse?'电压波动':'机柜失压'],['network',isPulse?'端口反复重连':'上联光口中断']];
    const results=[['freeze',isLight?'在线但照明无反馈':'在线但画面冻结'],['relapse','短期复发'],['stable','观察期稳定']];
    const findRoot=v.step>=1;
    const stamps=isPulse?['08:41','08:50','08:58']:isLight?['09:25:41','09:25:48','09:26:00']:['09:41:54','09:41:57','09:42:00'];
    const sequence=isPulse?(v.evidence==='power'?['电压跌落后出现首次离线','同端口第二次掉线','第三次掉线，随后恢复']:['端口重连，视频暂时中断','同端口再次重连','短时离线，随后恢复']):isLight?(v.evidence==='power'?['支路保护分闸','回路电流降至 0 A','三组照明未响应']:['开灯指令下发','控制器确认超时','三组照明未响应']):(v.evidence==='power'?['机柜支路电压降至 0 V','交换机心跳中断','四台摄像机离线']:['上联端口出现 LOS','上游监测失去视频流','四台摄像机离线']);
    return `<div class="card caseselect"><div>${ico('bell',18)}<strong>事件回放</strong></div>${select('event',M.events.map(x=>[x.id,M.site(x.site).name+' · '+x.title]),e.id,'告警事件')}</div>
    <section class="card panel"><div class="sectionhead"><div><div class="eyebrow">${e.code} · ${M.site(e.site).name}</div><h2>${e.title}</h2></div>${pill(v.closed?'工单已关闭':'处理中',v.closed?'green':'orange')}</div>
    <div class="steps">${['告警发现','关联诊断','修复核验'].map((t,i)=>btn(`<span>${i+1}</span>${t}`,'step',i,'step '+(v.step===i?'current':''))).join('')}</div>
    <div class="twocol inside"><div><h3>${ico('link',17)} 设备关联关系</h3><div class="topology">${d.topology.map((label,i)=>`<div class="toponode ${findRoot&&d.first===i?'rootnode':''}">${ico(i===0?'energy':i===1?'link':'box',19)}<strong>${label}</strong><small>${findRoot&&d.first===i?'首查节点':i===2?'受影响设备':'关联节点'}</small></div>${i<2?'<b class="wire">→</b>':''}`).join('')}</div>
    <div class="smalltitle">故障特征</div>${v.closed?line('核验记录',evidenceNames.find(([id])=>id===v.evidence)[1]):seg('evidence',evidenceNames,v.evidence)}</div>
    <div class="evidencebox"><div class="eyebrow">事件时间 · ${e.time}</div>
    <h3>${findRoot?'首查位置：'+d.root:'发现 '+e.impact+' 个受影响点位'}</h3><p>${findRoot?d.reason:'告警集中于同一站点，涉及设备共用供电或通信节点。'}</p>
    ${findRoot?d.readings.map(x=>`<div class="evidence">${ico('check',14)}${x}</div>`).join(''):btn('查看关联诊断 '+ico('right',14),'step',1,'primary')}
    </div></div>
    ${findRoot?'<div class="timerecord">'+sequence.map((label,i)=>'<div><time>'+stamps[i]+'</time><strong>'+label+'</strong></div>').join('')+'</div>':''}</section>
    <div class="card panel">${v.step<2?`${heading('工单核验',pill(v.closed?'已核验':'待核验',v.closed?'green':'neutral'),'plan')}<p class="support">业务恢复以${note}及观察期内的复发记录为依据。</p>${btn('进入修复核验 '+ico('right',14),'step',2,'btn')}`:`
    ${heading('维修后的业务恢复',pill(v.closed?'已核验':'核验中',v.closed?'green':'neutral'),'check')}<div class="controls"><span>修复后状态</span>${v.closed?'<strong>观察期稳定</strong>':seg('result',results,v.result)}</div>
    <div class="checkgrid">${line('终端在线状态',v.result==='relapse'?'离线复发':'在线')}${line(isLight?'照明反馈':'视频 / 录像',v.result==='freeze'?(isLight?'亮度反馈缺失':'画面冻结'):(v.result==='relapse'?'记录中断':'连续有效'))}${line('观察期（30 分钟）',v.result==='stable'?'全程稳定':v.result==='relapse'?'第 12 分钟复发':'业务未恢复')}</div>
    <div class="closefoot"><strong>${v.closed?'恢复记录已关联原工单':M.canClose(v.result)?'业务已恢复，核验通过':'核验未通过，工单继续跟踪'}</strong><button class="primary" data-action="close" ${v.closed||!M.canClose(v.result)?'disabled':''}>${v.closed?'工单已关闭':'核验并关闭工单'}</button>${v.closed?btn('重新打开工单','reopen','','btn'):''}</div>`}</div>`;
  };
})();

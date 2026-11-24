(()=>{
  const U=RoadUI,{M,seg,heading,select,ico,line,stat,fmt}=U;
  U.views.energy=()=>{
    const s=U.s,v=M.energy(s.site,s.kind,s.weather,s.traffic,s.strategy),light=s.kind==='light';
    const choices=light?[['control','分区智能调光'],['retrofit','调光 + 灯具更新']]:[['control','分组运行'],['retrofit','分组 + 高效风机']];
    const alt=M.energy(s.site,s.kind,s.weather,s.traffic,s.strategy==='control'?'retrofit':'control');
    return `<section class="card panel filters">${heading('工况与设备','','settings')}<div class="filtergrid">
    ${select('site',M.sites.map(x=>[x.id,x.name]),s.site,'隧道')}${select('kind',[['light','隧道照明'],['fan','射流风机']],s.kind,'设备')}${select('traffic',[['high','峰时车流'],['low','低流量']],s.traffic,'交通工况')}${light?select('weather',[['sun','晴天'],['cloud','阴天']],s.weather,'天气'):`<div class="selectlabel">环境记录<strong>${v.condition}</strong></div>`}</div></section>
    <div class="stats energy-stats">${stat('校正后基线',fmt(v.base),'kWh','layers','按当日工况校正')}${stat('方案预计用电',fmt(v.proposed),'kWh','energy',choices.find(x=>x[0]===s.strategy)[1])}${stat('预计节电',fmt(v.saved),'kWh','diag','相对基线 '+(100*v.saved/v.base).toFixed(1)+'%')}${stat('静态投资回收期',fmt(v.years),'年','calendar','按年等效运行 300 天')}</div>
    <div class="energygrid"><section class="card panel">${heading('预计日内功率曲线','<small>kW</small>','diag')}${seg('strategy',choices,s.strategy)}
    <div class="chartlegend"><i></i>基线策略 <i></i>所选方案</div><canvas id="energyChart" role="img" aria-label="基线与所选方案的预计日内功率曲线"></canvas>
    <div class="loads">${v.segments.map(x=>'<div><strong>'+x.name+'</strong><span>目标负荷 '+x.load+'% · 下限 '+x.floor+'%</span></div>').join('')}</div><div class="callout">${ico('info')}<span>${v.guard}</span></div></section>
    <section class="card panel">${heading('改造投资比较','','energy')}${line('所选方案',choices.find(x=>x[0]===s.strategy)[1])}${line('改造投入','¥ '+fmt(v.capital))}${line('预计年节电收益','¥ '+fmt(v.annual))}${line('另一方案回收期',fmt(alt.years)+' 年')}<p class="footnote">测算电价为 0.85 元/kWh，全年按同等工况折算 300 天。</p></section></div>
    <section class="card panel">${heading('改造后节能量核算','','check')}<div class="checkgrid">${line('核验对象',light?'分区调光':'分组运行')}${line('分项表计参考电量',fmt(v.meter)+' kWh')}${line('组合节电量',fmt(v.verified)+' kWh')}</div><p class="footnote">${M.site(s.site).name} · ${v.flow} · ${v.condition}。节电量为校正基线与分项表计参考电量之差。同期实施的多项措施合并核算。</p></section>`;
  };
})();

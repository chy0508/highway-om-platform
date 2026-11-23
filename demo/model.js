'use strict';
const RoadModel = (() => {
  const {sites,events,candidates,meters,tasks}=typeof module!=='undefined' && module.exports ? require('./data.js') : RoadData;
  const site=id=>sites.find(s=>s.id===id)||sites[1];
  const event=id=>events.find(e=>e.id===id)||events[0];
  const sum=a=>a.reduce((v,n)=>v+n,0);
  const round=n=>Math.round(n*10)/10;
  function schedule(combine,late){
    const trips=[];
    const driveMinutes=km=>Math.ceil(Math.abs(km)*60/40);
    for(const task of tasks){
      const day=late && task.site==='B'?'11/24':'11/23';
      const occupied=trips.filter(t=>t.day===day && (t.crew===task.crew || t.meter===task.meter));
      let trip=occupied.at(-1);
      const km=site(task.site).km;
      const canCombine=combine && trip && trip.crew===task.crew && trip.meter===task.meter &&
        Math.max(task.start,trip.finish+driveMinutes(km-trip.lastKm))+task.duration<=task.end;
      if(!canCombine){
        const ready=Math.max(510,...occupied.map(t=>t.returnAt));
        const depart=Math.max(ready,task.start-driveMinutes(km));
        trip={ids:[],stops:[],day,crew:task.crew,meter:task.meter,depart,lastKm:0,finish:depart,km:0};
        trips.push(trip);
      }
      const arrival=trip.finish+driveMinutes(km-trip.lastKm);
      const start=Math.max(task.start,arrival);
      trip.stops.push({id:task.site,start,end:start+task.duration});
      trip.ids.push(task.site);
      trip.km+=Math.abs(km-trip.lastKm);
      trip.lastKm=km;
      trip.finish=start+task.duration;
      trip.returnAt=trip.finish+driveMinutes(km);
    }
    for(const trip of trips)trip.km+=trip.lastKm;
    const km=sum(trips.map(t=>t.km));
    return {trips,km,cost:trips.length*380+km*4, saved:80-km};
  }
  function allocation(budget,age){
    let left=budget;
    const items=candidates.map(c=>{
      const eligible=c.id!=='CAM-B02' || age===undefined || replace(age).net>0;
      const shortfall=Math.max(0,c.budget-left);
      const funded=eligible && shortfall===0;
      if(funded)left-=c.budget;
      return {...c,eligible,shortfall,funded};
    });
    return {items,used:budget-left,left};
  }
  function replace(age){
    const residual=Math.round(4600*Math.max(0,6-age)/6);
    return {residual,shared:1680,net:1680-residual};
  }
  function diagnosis(id,evidence){
    const e=event(id);
    let root, readings, reason, topology;
    if(id==='camera'){
      const power=evidence==='power';
      root=power?'B 柜低压供电支路':'B 柜交换机上联链路';
      readings=power?['回路电压 0 V','同柜交换机失去心跳','相邻机柜供电正常']:['回路电压 228 V','交换机本地心跳正常','上联光口 LOS 告警'];
      reason=power?'同柜终端同时离线，独立配电测点先出现失压。':'配电与本地交换正常，上联光口先于下游终端报障。';
      topology=['B 柜供电','交换机上联','4 台摄像机'];
    } else if(id==='lights'){
      const circuit=evidence==='power';
      root=circuit?'C 区照明支路 L-03':'C 区照明控制器';
      readings=circuit?['开灯指令已送达','支路电流 0 A','断路器分闸反馈']:['支路电源 230 V','断路器合闸','控制器未反馈开灯指令'];
      reason=circuit?'同一回路三组灯具异常，控制指令已送达，电流与分闸状态吻合。':'供电侧测点正常，故障集中在同一控制组，缺少执行反馈。';
      topology=['C 柜支路','控制分组','3 组灯具'];
    } else {
      const power=evidence==='power';
      root=power?'A 柜电源波动':'A 柜通信端口';
      readings=power?['三次掉线前均有电压跌落','最低电压 174 V','到场电压恢复至 229 V']:['供电保持 229 V','端口反复重连 3 次','到场时端口恢复在线'];
      reason=power?'多次短时掉线与电压跌落对应，现场复测时供电已恢复。':'历史窗口内供电平稳，端口重连与三次视频中断相对应。';
      topology=['A 柜供电','通信端口','入口监控点'];
    }
    return {root,readings,reason,topology,first:evidence==='power'?0:1,e};
  }
  const canClose=result=>result==='stable';
  function powerProfile(kind,base,proposed){
    const weights=kind==='light'?[.46,.43,.44,.55,.83,1,1.13,1.17,1.24,1.15,1.06,.91,.76,.56,.46]:[.5,.48,.49,.6,.84,1.2,1.1,.9,.86,1.03,1.28,1.1,.9,.68,.5];
    const hours=24/(weights.length-1);
    const area=hours*(sum(weights)-(weights[0]+weights.at(-1))/2);
    return weights.map((w,i)=>({hour:i*hours,base:base*w/area,proposed:proposed*w/area}));
  }
  // All values are offline fixture assumptions, not engineering limits.
  function energy(siteId,kind,weather,traffic,strategy){
    const f=site(siteId).factor,light=kind==='light',high=traffic==='high',sun=weather==='sun';
    const base=round((light?(high?510:465)*(sun?1:.92):(high?560:440))*f);
    // Floors are normalized demonstration loads, not field lighting/air-quality limits.
    const minimums=light?[sun?.78:.58,high?.67:.52,.48]:[high?.88:.64];
    const requested=light?[(sun?.91:.73)*(high?1:.88),(sun?.79:.62)*(high?1:.9),high?.64:.53]:[high?.92:.70];
    const weights=light?[.45,.30,.25]:[1];
    const segments=requested.map((request,i)=>({
      name:light?['入口段','过渡段','中间段'][i]:'通风机组',
      floor:Math.round(minimums[i]*100),load:Math.round(Math.max(request,minimums[i])*100)
    }));
    const duty=sum(segments.map((x,i)=>weights[i]*x.load/100));
    const upgrade=strategy==='retrofit';
    const proposed=round(base*duty*(upgrade?(light?.84:.91):1));
    const meter=round(meters[kind][weather][traffic]*f);
    const capital=light?(upgrade?98000:32000):(upgrade?146000:48000);
    const saved=round(base-proposed), annual=round(saved*.85*300);
    return {base,proposed,profile:powerProfile(kind,base,proposed),meter,saved,verified:round(base-meter),capital,annual,segments,years:round(capital/annual),
      condition:light?(sun?'洞外亮度 4,800 cd/m²':'洞外亮度 1,650 cd/m²'):(high?'CO 21 ppm · 消光系数 0.006 m⁻¹':'CO 8 ppm · 消光系数 0.002 m⁻¹'),
      flow:high?'980 辆/小时':'280 辆/小时',
      guard:light?'调光需满足分区亮度与均匀度要求，应急照明独立供电。':(high?'高流量工况保留基础通风，仅调整辅助机组运行时段。':'低流量工况减少辅助机组运行时段，保留基础通风。')};
  }
  return {sites,events,tasks,site,event,sum,schedule,allocation,replace,diagnosis,canClose,energy};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=RoadModel;

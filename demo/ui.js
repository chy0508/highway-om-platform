(()=>{
const M=RoadModel;
const icons={
brand:'M4 20 9 4m11 16L15 4m-3 1v3m0 3v3m0 3v3',home:'M4 4h7v10H4z M15 4h5v5h-5z M15 13h5v7h-5z M4 18h7v2H4z',
plan:'M5 5h14v16H5z M9 3h6v4H9z M8 12h8 M8 16h6',diag:'M2 12h5l3-7 4 14 3-7h5',
energy:'m14 2-9 12h6l-1 8 9-13h-6z', pin:'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z M14 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
bell:'M5 17h14l-2-3V9a5 5 0 0 0-10 0v5z M10 20h4',clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z M12 7v5l4 2',
box:'m3 7 9-4 9 4v10l-9 4-9-4z M3 7l9 5 9-5 M12 12v9',right:'M5 12h14 M13 6l6 6-6 6',arrow:'M5 17 17 5 M7 5h10v10',
layers:'m3 8 9-5 9 5-9 5z M3 12l9 5 9-5 M3 16l9 5 9-5',
flag:'M5 21V4l7-1 7 4-6 3-8-1',road:'M7 21 10 3 M17 21 14 3 M12 7v3 M12 14v3',chev:'m9 5 7 7-7 7',
check:'m4 12 5 5L20 6',settings:'M3 6h18 M3 12h18 M3 18h18 M7 3v6 M16 9v6 M10 15v6',calendar:'M3 6h18v15H3z M7 3v5 M17 3v5 M3 10h18',
link:'m8 14-2 2a3 3 0 0 0 4 4l4-4a3 3 0 0 0 0-4 M16 10l2-2a3 3 0 0 0-4-4l-4 4a3 3 0 0 0 0 4',info:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z M12 11v6 M12 7v1',menu:'M3 5h18 M3 12h18 M3 19h18',
truck:'M2 6h12v11H2z M14 10h4l4 4v3h-8 M8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z M20 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z'
};
const ico=(key,size=18)=>`<svg aria-hidden="true" class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="${icons[key]||icons.layers}"/></svg>`;
const pages={overview:['路段总览','home'],plan:['养护与检修','plan'],diag:['故障诊断','diag'],energy:['能效分析','energy']};
const cockpitEnabled=document.body.classList.contains('cockpit-host');
function getTheme(){
  if(!cockpitEnabled)return 'light';
  try{return localStorage.getItem('luoheng-theme')==='light'?'light':'dark';}catch{return 'dark';}
}
const init=()=>({page:cockpitEnabled?'network':'overview',route:'qinglan',mode:'all',theme:getTheme(),site:'B',event:'camera',cases:{},planTab:'task',combine:true,late:false,budget:16000,age:3,kind:'light',weather:'sun',traffic:'high',strategy:'control',menu:false,assets:false});
let state=init();const views={};
function readRoute(){
  const id=location.hash.match(/^#\/route\/([a-z]+)$/)?.[1];
  if(id&&RoadNetwork.route(id)){
    if(state.route!==id||state.page==='network')state.site=id==='qinglan'?'C':'B';
    state.route=id;state.page='overview';
  }else state.page='network';
}
if(cockpitEnabled){
  readRoute();
  window.addEventListener('popstate',()=>{readRoute();render(true);});
}
const fmt=n=>Number(n).toLocaleString('zh-CN',{maximumFractionDigits:1});
const btn=(text,action,val='',cls='btn')=>`<button type="button" class="${cls}" data-action="${action}" data-value="${val}">${text}</button>`;
const seg=(action,choices,value)=>`<div class="seg">${choices.map(([v,label])=>`<button type="button" data-action="${action}" data-value="${v}" aria-pressed="${String(value)===v}" class="${String(value)===v?'on':''}">${label}</button>`).join('')}</div>`;
const pill=(s,tone='')=>`<span class="pill ${tone}"><i></i>${s}</span>`;
const heading=(title,aside='',icon='')=>`<div class="sectionhead"><h2>${icon?`<span class="section-icon">${ico(icon,17)}</span>`:''}${title}</h2>${aside}</div>`;
const stat=(label,val,unit,icon,sub,tone='')=>`<article class="stat ${tone}"><div class="statlabel">${label}<span class="stat-icon">${ico(icon,17)}</span></div><div class="statval">${val}<small>${unit}</small></div><div class="statnote">${sub}</div></article>`;
const line=(key,value)=>`<div class="kv"><span>${key}</span><strong>${value}</strong></div>`;
function currentCase(){return state.cases[state.event]||{evidence:'power',step:0,result:'freeze',closed:false};}
function caseUpdate(changes){state.cases[state.event]={...currentCase(),...changes};}
function alerts(){return M.events.filter(e=>!state.cases[e.id]?.closed);}
function go(page){state.page=pages[page]||(cockpitEnabled&&page==='network')?page:'overview';state.menu=false;}
function openEvent(id){
  const e=M.event(id);state.event=e.id;state.site=e.site;
  if(cockpitEnabled)state.route='qinglan';
  go('diag');
}
function goToDemoSite(site,page){
  if(!cockpitEnabled||!M.sites.some(item=>item.id===site))return;
  state.route='qinglan';state.site=site;
  if(page==='plan')state.planTab='task';
  go(page);
}
function nav(){
const items=Object.entries(pages).map(([page,[name,icon]])=>{
  const current=state.page===page;
  return `<button type="button" class="navbtn${current?' selected':''}" data-action="page" data-value="${page}"${current?' aria-current="page"':''}>
    <span class="nav-icon">${ico(icon)}</span><span>${name}</span>${ico('chev',14)}
  </button>`;
});
return `<aside class="rail ${state.menu?'open':''}" id="workspace-rail"><div class="brand"><span class="brand-icon">${ico('brand',26)}</span><div><strong>路维智策</strong><small>公路机电智能运维决策平台</small></div></div>
${cockpitEnabled?'<button type="button" class="return-network" data-action="page" data-value="network" aria-label="返回路网总览">‹　路网总览</button>':''}
<div class="railgroup">工作空间</div><nav aria-label="工作空间">${items.join('')}</nav>
</aside>`;}
function render(toTop=false){
const focused=document.activeElement?.dataset;
const oldAction=focused?.action,oldValue=focused?.value;
if(cockpitEnabled&&window.RoadCockpit?.render()){
  if(toTop)window.scrollTo(0,0);
  if(oldAction)Array.from(document.querySelectorAll('button[data-action]'))
    .find(el=>el.dataset.action===oldAction&&el.dataset.value===oldValue)?.focus({preventScroll:true});
  return;
}
const [title,pageIcon]=pages[state.page];
const descriptors={overview:'青岚高速东段设备运行与当班任务',plan:'检修窗口、作业资源与年度更新预算',diag:'关联告警、证据回放与工单核验',energy:'隧道照明与通风运行策略比较'};
document.querySelector('#app').innerHTML=`${nav()}<main class="main"><header class="top"><div class="crumb"><button type="button" class="mobile-menu" data-action="menu" data-value="" aria-label="工作空间菜单" aria-expanded="${state.menu}" aria-controls="workspace-rail">${ico('menu')}</button><span class="crumb-root">运营管理中心</span>${ico('chev',12)}<strong>${title}</strong></div><span class="date">${ico('calendar',15)}2026.11.23</span></header>
<div class="body"><div class="pagehead"><div class="page-title"><span class="page-icon">${ico(pageIcon,24)}</span><div>${state.page==='overview'?'<div class="overline"><i></i>当班快照 · 09:45</div>':''}<h1>${title}</h1><p>${descriptors[state.page]}</p></div></div><div class="loc">${ico('pin',15)}青岚高速 · 东段</div></div>${views[state.page]()}</div></main><div id="announce" role="status" aria-live="polite" class="sr"></div>`;
RoadMap.draw(document.getElementById('corridorMap'));
if(state.page==='energy'){
const v=M.energy(state.site,state.kind,state.weather,state.traffic,state.strategy);
RoadMap.profile(document.getElementById('energyChart'),v.profile);
}
if(toTop)window.scrollTo(0,0);
if(oldAction==='page'&&window.matchMedia('(max-width: 700px)').matches){
  document.querySelector('.mobile-menu').focus({preventScroll:true});
}else if(oldAction&&(!toTop||oldAction==='page')){
  const target=Array.from(document.querySelectorAll('[data-action]'))
    .find(x=>x.dataset.action===oldAction&&x.dataset.value===oldValue);
  target?.focus({preventScroll:true});
}
}
const actions={
page:v=>{if(v==='diag'&&M.event(state.event).site!==state.site){state.event=M.events.find(e=>e.site===state.site).id;}go(v);},
route:v=>{if(cockpitEnabled&&RoadNetwork.route(v)){state.route=v;state.site=v==='qinglan'?'C':'B';go('overview');}},
'route-site':v=>goToDemoSite(v,'overview'),'plan-site':v=>goToDemoSite(v,'plan'),'energy-site':v=>goToDemoSite(v,'energy'),
mode:v=>{state.mode=v;},
theme:()=>{state.theme=state.theme==='dark'?'light':'dark';try{localStorage.setItem('luoheng-theme',state.theme);}catch{}},
assets:()=>{state.assets=!state.assets;},site:v=>{if(cockpitEnabled&&state.site===v)window.RoadSpatial?.focusSite(v);state.site=v;},event:openEvent,menu:()=>{state.menu=!state.menu;},
planTab:v=>{state.planTab=v;},combine:v=>{state.combine=v==='true';},late:v=>{state.late=v==='true';},
budget:v=>{state.budget=Number(v);},age:v=>{state.age=Number(v);},
evidence:v=>{const c=currentCase();if(!c.closed && c.evidence!==v)caseUpdate({evidence:v,step:0,result:'freeze'});},step:v=>caseUpdate({step:Number(v)}),
result:v=>{if(!currentCase().closed)caseUpdate({result:v});},
reopen:()=>{if(currentCase().closed)caseUpdate({result:'freeze',step:2,closed:false});},close:()=>{if(currentCase().step===2&&M.canClose(currentCase().result))caseUpdate({closed:true});},
kind:v=>{state.kind=v;},weather:v=>{state.weather=v;},traffic:v=>{state.traffic=v;},strategy:v=>{state.strategy=v;}
};
function dispatch(action,value,element){
  if(cockpitEnabled&&window.RoadCockpit?.sceneAction(action,value,element))return;
  const old=state.page;
  if(actions[action]){
    actions[action](value);
    if(cockpitEnabled){
      const hash=state.page==='network'?'#/network':'#/route/'+state.route;
      if(location.hash!==hash)history.pushState(null,'',hash);
    }
    render(old!==state.page);
  }
}
function act(el){dispatch(el.dataset.action,el.dataset.value??el.value,el);}
document.addEventListener('click',e=>{const el=e.target.closest('button[data-action]');if(el&&!el.disabled)act(el);});
document.addEventListener('change',e=>{if(e.target.matches('select[data-action],input[data-action]'))act(e.target);});
function select(action,items,value,label){return `<label class="selectlabel">${label}<select data-action="${action}">${items.map(([v,label])=>`<option value="${v}" ${String(value)===v?'selected':''}>${label}</option>`).join('')}</select></label>`;}
let resizeId;
window.addEventListener('resize',()=>{clearTimeout(resizeId);resizeId=setTimeout(()=>{RoadMap.draw(document.querySelector('#corridorMap'));if(state.page==='energy'){const v=M.energy(state.site,state.kind,state.weather,state.traffic,state.strategy);RoadMap.profile(document.querySelector('#energyChart'),v.profile);}},120);});
window.RoadUI={get s(){return state;},M,ico,btn,seg,pill,heading,stat,line,fmt,select,views,alerts,currentCase,render,dispatch};
})();

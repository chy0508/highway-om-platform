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
const state={page:'overview',route:'qinglan',mode:'all',theme:'dark',site:'C',cases:{},assets:false};
function readRoute(){
  const id=location.hash.match(/^#\/route\/([a-z]+)$/)?.[1];
  if(id&&RoadNetwork.route(id)){
    if(state.route!==id)state.site=id==='qinglan'?'C':'B';
    state.route=id;state.page='overview';
  }else {
    const target=new URL('index.html#/dashboard',document.baseURI);
    window.top.location.replace(target.href);
  }
}
readRoute();
window.addEventListener('popstate',()=>{readRoute();render(true);});
const fmt=n=>Number(n).toLocaleString('zh-CN',{maximumFractionDigits:1});
const btn=(text,action,val='',cls='btn')=>`<button type="button" class="${cls}" data-action="${action}" data-value="${val}">${text}</button>`;
function alerts(){return M.events.filter(e=>!state.cases[e.id]?.closed);}
const platformPages={
  dashboard:['dashboard','综合驾驶舱'],
  devices:['devices','设备监测'],
  plan:['tasks','现场作业统筹'],
  diag:['diagnosis','智能诊断'],
  energy:['fan','运行优化']
};
const parentUI = window.parent === window ? null : window.parent.UI;
function platformLabel(page) {
  const [key,label] = platformPages[page];
  return parentUI?.NAV.find(item=>item.key===key)?.name || label;
}
function openPlatform(page, event, params) {
  const diagnostic = {camera:'scene-camera',lights:'scene-lighting'}[event];
  const destination = diagnostic || platformPages[page][0];
  if (parentUI) return parentUI.go(destination,params);
  const target = new URL('index.html', document.baseURI);
  const query = new URLSearchParams(params);
  target.hash = '#/' + destination + (query.size ? '?' + query : '');
  window.location.href = target.href;
}
function render(toTop=false){
  const focus = document.activeElement?.dataset;
  RoadCockpit.render();
  if(toTop) window.scrollTo(0,0);
  if(focus?.action) Array.from(document.querySelectorAll('button[data-action]'))
    .find(button=>button.dataset.action===focus.action && button.dataset.value===focus.value)
    ?.focus({preventScroll:true});
}
const actions={
  page(value) {
    if (platformPages[value]) return openPlatform(value);
    state.page=value;
  },
  route(value) {
    if (!RoadNetwork.route(value)) return;
    state.route=value;
    state.site=value==='qinglan'?'C':'B';
    state.page='overview';
  },
  'route-site'(value) {
    state.route='qinglan';
    state.site=value;
    state.page='overview';
  },
  'plan-site':()=>openPlatform('plan'),
  'energy-site':()=>openPlatform('energy'),
  mode(value){state.mode=value;},
  assets(){state.assets=!state.assets;},
  'device-category'(cat){openPlatform('devices',null,{cat});},
  site(value) {
    if(state.site===value) RoadSpatial.focusSite(value);
    state.site=value;
  },
  event(value){openPlatform('diag',value);}
};
function dispatch(action,value,element){
  if(RoadCockpit.sceneAction(action,value,element))return;
  const old=state.page;
  if(actions[action]){
    actions[action](value);
    const hash='#/route/'+state.route;
    if(location.hash!==hash)history.pushState(null,'',hash);
    render(old!==state.page);
  }
}
function act(el){dispatch(el.dataset.action,el.dataset.value??el.value,el);}
document.addEventListener('click',e=>{const el=e.target.closest('button[data-action]');if(el&&!el.disabled)act(el);});
document.addEventListener('change',e=>{if(e.target.matches('select[data-action],input[data-action]'))act(e.target);});
window.RoadUI={get s(){return state;},M,ico,btn,fmt,alerts,render,dispatch,platformLabel};
})();

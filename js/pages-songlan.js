(function () {
  'use strict';
  const D = window.DB, U = window.UI;

  function modelConfig(base, {scope,devices,events,focus}) {
    const groups = [
      ['cctv', d => /摄像机/.test(d.type), 4, -11.6, 4.7],
      ['luminaire', d => d.type === 'LED照明灯具', 8, -10.7, 6.24],
      ['cabinet', d => /配电柜|配电机柜/.test(d.type), 2, -12.8, 1.14],
      ['fan', d => d.type === '射流风机', 4, -8.5, 6.15]
    ];
    const open = events.filter(e => !e.status.includes('已恢复'));
    const eventFor = d => open.find(e => e.affected.includes(d.code) || e.related.includes(d.code));
    const placed = [];
    for (const [kind, match, limit, offset, height] of groups) {
      const candidates = devices.filter(match).sort((a,b) => a.km-b.km);
      if (!candidates.length) continue;
      const selected = new Set(candidates.filter(d => d.code === focus));
      // Include examples from the full length as well as assets with open events.
      const priority = candidates.filter(d => D.HERO[d.code] || eventFor(d));
      for (const d of priority.slice(0,kind === 'fan' || kind === 'cctv' ? limit : Math.ceil(limit/2))) selected.add(d);
      for (let i=0; i<limit && selected.size<limit; i++) selected.add(candidates[Math.round(i*(candidates.length-1)/(limit-1))]);
      for (const d of candidates) { if (selected.size >= limit) break; selected.add(d); }
      for (const d of selected) {
        // Project ledger chainage into the reusable tunnel section (Blender model coordinates).
        const x = 278 + 122*(d.km-scope.start)/(scope.end-scope.start);
        placed.push({id:d.code,kind,label:d.name,chainage:d.kmText,position:[x,offset,22+.007*x+height],
          inside:true,warning:d.status!=='online',eventId:eventFor(d)?.id});
      }
    }
    for (const id of ['CAB-03','SW-12','PDB-02','LC-01','COVI-01']) {
      const d = devices.find(asset => asset.code === id);
      if (!d || placed.some(p => p.id === id)) continue;
      const x = 278 + 122*(d.km-scope.start)/(scope.end-scope.start);
      placed.push({id, kind:'cabinet', label:d.name, chainage:d.kmText, position:[x,-12.8,23+.007*x],inside:true,warning:d.status!=='online',eventId:eventFor(d)?.id});
    }
    const site = {id:scope.id,name:scope.name,chainage:D.kmText(scope.start),eventId:open[0]?.id};
    return {...base,site,devices:placed};
  }

  class BridgeTwin extends HTMLElement {
    connectedCallback() {
      const {scope,devices,events,focus} = this.context;
      this.environment = this.context.environment;
      this.pose = 'overview';
      this.selected = null;
      this.config = modelConfig({},this.context);
      this.innerHTML = `<div class="songlan-stage" aria-label="${scope.name} · 桥隧三维示意">
        <div class="songlan-canvas"></div><div class="songlan-labels"></div>
        <div class="bridge-scene-actions"><button class="hud-btn" data-view="cutaway">${U.icon('eye',13)} 隧道整体</button><button class="hud-btn" data-view="top">俯瞰</button><button class="hud-btn" data-view="interior">${U.icon('play',13)} 洞内视角</button><button class="hud-btn" data-cruise aria-pressed="false">${U.icon('reset',13)} 自动巡航</button><button class="hud-btn" data-view="overview">桥隧全景</button></div>
        <div class="twin-legend bridge-legend"><div class="li"><span class="cd" style="background:#ffd28a"></span>照明分区</div><div class="li"><span class="cd" style="background:#4fd8f0"></span>风机与控制设备</div></div>
        <div class="songlan-tools"><button aria-label="放大模型" data-zoom="1">＋</button><button aria-label="缩小模型" data-zoom="-1">−</button></div>
        <div class="songlan-message" role="status">正在加载${scope.name}三维模型…</div>
        <div class="bridge-selection" aria-live="polite" hidden></div>
        <small class="songlan-credit">${scope.name} · 桥隧与设备位置为示意</small>
      </div>`;
      const stage = this.querySelector('.songlan-stage');
      const panel = this.querySelector('.bridge-selection');
      const message = this.querySelector('.songlan-message');
      const select = device => {
        if (!device) return;
        const asset = D.byCode[device.id];
        if (!asset || !devices.includes(asset)) return;
        this.selected = asset.code;
        stage.dataset.selectedAsset = asset.code;
        const event = events.find(e => e.affected.includes(asset.code) || e.related.includes(asset.code));
        panel.hidden = false;
        panel.innerHTML = `<b>${asset.name}</b><small>${asset.code} · ${asset.kmText} · ${D.STATUS[asset.status].name}</small><div><button class="hud-btn" data-detail>设备档案</button>${event ? '<button class="hud-btn" data-event>关联事件</button>' : ''}</div>`;
        panel.querySelector('[data-detail]').onclick = () => U.openDevice(asset.code);
        if (event) panel.querySelector('[data-event]').onclick = () => U.openEvent(event.id);
      };
      this.showSelection = select;
      const inspect = object => {
        if (D.byCode[object.code]) { select({id:object.code}); return; }
        this.selected = object.code || null;
        stage.dataset.selectedAsset = this.selected || '';
        panel.hidden = false;
        panel.replaceChildren();
        const title = document.createElement('b');
        title.textContent = object.name; panel.append(title);
        const note = document.createElement('small');
        const zoneEvent = events.find(e => object.code === 'Z-03' && e.page === 'scene-lighting');
        note.textContent = zoneEvent ? zoneEvent.status + ' · ' + zoneEvent.affected.length + ' 盏关联灯具' : scope.name + ' · ' + (object.kind === 'zone' ? '照明分区' : '示意设备');
        panel.append(note);
        if (zoneEvent) {
          const b = document.createElement('button'); b.className='hud-btn'; b.textContent='照明诊断'; b.onclick=()=>U.openEvent(zoneEvent.id); panel.append(b);
        }
      };
      const reflectView = pose => {
        this.pose = pose;
        if (this.cruising && !['cutaway','top'].includes(pose)) {
          this.cruising=false; this.model?.setCruise(false);
          this.querySelector('[data-cruise]').setAttribute('aria-pressed','false');
        }
        stage.dataset.pose = pose;
        this.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.view === pose)));
      };
      reflectView(this.context.pose);
      this.querySelectorAll('[data-view]').forEach(b => b.onclick = () => {
        if (this.model) this.model.setView(b.dataset.view);
        else { reflectView(b.dataset.view); this.drawFallback?.(); }
      });
      this.querySelectorAll('[data-zoom]').forEach(b => b.onclick = () => this.model?.zoom(Number(b.dataset.zoom)));
      const cruise = this.querySelector('[data-cruise]');
      cruise.onclick = () => {
        this.cruising = !this.cruising;
        cruise.setAttribute('aria-pressed',String(this.cruising));
        this.model?.setCruise(this.cruising);
      };
      this.setEnvironment(this.environment);
      if (/^Z-0[1-6]$/.test(focus)) inspect({code:focus,kind:'zone',name:focus+' 照明分区'});
      else if (focus) this.focusAsset(focus);
      const load = async () => {
        message.textContent='正在加载'+scope.name+'三维模型…';
        try {
          const [response, module] = await Promise.all([fetch('assets/3d/songlan-engineering.json',{signal:AbortSignal.timeout(12000)}), import('../demo/songlan.js?v=20261124-git474230a')]);
          if (!response.ok) throw new Error('模型配置未加载');
          const base = await response.json();
          if (!this.isConnected) return;
          const config = {...base,...this.config};
          const model = await module.createSonglan(this.querySelector('.songlan-canvas'),this.querySelector('.songlan-labels'),stage,config);
          if (!this.isConnected) { model.dispose(); return; }
          this.model = model;
          const pendingPose = this.pose;
          model.show({theme:'light',labelEnabled:true,cases:{}},{onView:reflectView,onAsset:select,onInspect:inspect,onEvent:id => U.openEvent(id)},true);
          model.setEnvironment(this.environment);
          model.setCruise(Boolean(this.cruising));
          if (this.selected && config.devices.some(d => d.id === this.selected)) { model.select(this.selected,!this.context.explicitPose); if(this.context.explicitPose) model.setView(pendingPose); }
          else if (pendingPose !== 'overview') model.setView(pendingPose);
          stage.dataset.ready = 'model';
          cruise.disabled = false;
          this.querySelector('.songlan-tools').hidden = false;
          message.hidden = true;
        } catch (error) {
          if (!this.isConnected) return;
          stage.dataset.ready = 'schematic';
          cruise.disabled = true;
          this.querySelector('.songlan-tools').hidden = true;
          message.textContent = '三维模型暂不可用，当前显示桥隧示意图';
          this.buildFallback();
          const retry=document.createElement('button');
          retry.type='button'; retry.className='hud-btn'; retry.textContent='重试三维模型';
          retry.onclick=()=>{
            this.observer?.disconnect();
            this.drawFallback=null;
            this.querySelector('.songlan-canvas').replaceChildren();
            stage.dataset.ready='loading';
            load();
          };
          message.append(' ',retry);
        }
      };
      load();
    }
    focusAsset(code) {
      const asset = this.context.devices.find(d => d.code === code);
      if (!asset) return;
      const point = this.config.devices.find(d => d.id === code);
      if (point && this.model) this.model.select(code,true);
      else this.showSelection({id:code});
      this.drawFallback?.();
    }
    setEnvironment(value) {
      this.environment = Boolean(value);
      this.dataset.environment = this.environment ? 'on' : 'off';
      this.model?.setEnvironment(this.environment);
      this.drawFallback?.();
    }
    buildFallback() {
      const canvas = document.createElement('canvas');
      this.querySelector('.songlan-canvas').replaceChildren(canvas);
      const hits = [];
      this.drawFallback = () => {
        const width=canvas.clientWidth, height=canvas.clientHeight;
        if (!width || !height) return;
        canvas.width=width; canvas.height=height;
        const c=canvas.getContext('2d'), y=height*.58;
        const section=this.pose==='cutaway' || this.pose==='top';
        const scale=this.pose==='overview' ? 1 : this.pose==='cutaway' ? 1.9 : 2.8;
        const offset=scale===1 ? 0 : width*(.75*scale-.5);
        c.fillStyle=this.environment?'#c0d6de':'#1a2b3b'; c.fillRect(0,0,width,height);
        if(section) {
          if(this.environment) {
            c.fillStyle='#67826c'; c.beginPath(); c.moveTo(0,height);
            for(let i=0;i<=40;i++) c.lineTo(width*i/40,height*(.51+.15*Math.sin(i*.31)));
            c.lineTo(width,height);c.fill();
          } else {
            c.strokeStyle='#2d4058';
            for(let i=0;i<=width;i+=36) {c.beginPath();c.moveTo(i,0);c.lineTo(i,height);c.stroke();}
            for(let i=0;i<=height;i+=36) {c.beginPath();c.moveTo(0,i);c.lineTo(width,i);c.stroke();}
          }
          const left=width*.07, span=width*.86;
          c.fillStyle='#566575';c.fillRect(left,y,span,18);
          c.strokeStyle='#efeee6';c.setLineDash([10,8]);c.beginPath();c.moveTo(left,y+9);c.lineTo(left+span,y+9);c.stroke();c.setLineDash([]);
          c.font='12px sans-serif'; c.textAlign='center';
          for(let i=0;i<6;i++) {
            const x=left+span*(i+.5)/6;
            c.strokeStyle='#c2d0d8';c.beginPath();c.arc(x,y,Math.min(32,span/15),Math.PI,2*Math.PI);c.stroke();
            c.fillStyle='#0c2440';c.fillRect(x-20,y-64,40,20);c.fillStyle='#ffdc99';c.fillText('Z-0'+(i+1),x,y-50);
          }
          c.fillStyle=this.environment?'#102233':'#e9f3fa';c.font='bold 15px sans-serif';
          c.fillText(this.context.scope.name+' · 隧道整体',width/2,y-99);
          hits.length=0;
          for(const device of this.config.devices) {
            const x=left+span*(D.byCode[device.id].km-this.context.scope.start)/(this.context.scope.end-this.context.scope.start);
            const cy=y-({cctv:12,luminaire:26,cabinet:4,fan:19}[device.kind]);
            c.fillStyle=device.id===this.selected?'#ffd28a':device.warning?'#e77b68':'#4fd8f0';
            c.beginPath();c.arc(x,cy,4,0,2*Math.PI);c.fill();hits.push({x,y:cy,device});
          }
          return;
        }
        c.save(); c.translate(-offset,0); c.scale(scale,1);
        if (this.environment) {
          c.fillStyle='#718b76'; c.beginPath(); c.moveTo(0,height);
          for (let i=0;i<=40;i++) c.lineTo(width*i/40,height*(.43+.08*Math.sin(i*.26)+.1*Math.cos(i*.4)));
          c.lineTo(width,height); c.fill();
          c.fillStyle='#6697a1'; c.fillRect(0,y+35,width*.54,height);
        }
        c.fillStyle='#788c95'; c.fillRect(width*.05,y,width*.90,12);
        for (const k of [.12,.24,.36,.48]) c.fillRect(width*k,y+10,9,height*.16);
        c.strokeStyle='#a9b7ba'; c.lineWidth=6;
        for (let i=0;i<6;i++) {const x=width*(.55+i*.071); c.beginPath();c.arc(x,y,Math.min(30,width*.035),Math.PI,2*Math.PI);c.stroke();}
        c.font='12px sans-serif'; c.fillStyle=this.environment?'#152b36':'#ebf2f4';
        c.fillText(this.context.scope.name+'  '+D.kmText(this.context.scope.start),width*.52,y-53);
        hits.length=0;
        this.config.devices.forEach(device=>{
          const x=width*(.55+(device.position[0]-278)/122*.36);
          const dy={cctv:18,luminaire:34,cabinet:4,fan:26}[device.kind];
          const cy=y-dy; c.fillStyle=device.id===this.selected?'#ffcb64':device.warning?'#ec7457':'#27b6b0';
          c.beginPath();c.arc(x,cy,device.id===this.selected?6:4,0,2*Math.PI);c.fill();hits.push({x:x*scale-offset,y:cy,device});
        });
        c.restore();
      };
      canvas.onclick = e => {
        const b=canvas.getBoundingClientRect(), x=e.clientX-b.left, y=e.clientY-b.top;
        const nearest=hits.map(p=>({p,d:Math.hypot(p.x-x,p.y-y)})).sort((a,b)=>a.d-b.d)[0];
        if(nearest?.d<13) this.focusAsset(nearest.p.device.id);
      };
      this.observer=new ResizeObserver(this.drawFallback); this.observer.observe(canvas);
      this.drawFallback();
    }
    disconnectedCallback() {
      this.observer?.disconnect();
      this.model?.dispose();
      this.model=null;
    }
  }
  customElements.define('bridge-twin',BridgeTwin);
})();

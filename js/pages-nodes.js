(function () {
  'use strict';
  const D = window.DB, U = window.UI;
  const overview = '#/gis?mode=macro&display=screen';
  const nodeURL = id => '#/gis?view=node&node=' + id + '&display=screen';
  const views = {
    bridge: {
      buttons: [['overview','桥梁全景'],['under','桥下视角'],['top','俯瞰']],
      cameras: {
        overview: {position:[38,-205,106],target:[-11,0,18],fov:52},
        under: {position:[-90,-82,26],target:[-12,0,18],fov:57},
        top: {position:[-10,-97,279],target:[-5,0,19],fov:50}
      },
      parts: ['双幅桥面','主梁与桥墩','河道与两岸边坡'],
      image: 'assets/3d/songlan-overview.png'
    },
    tunnel: {
      buttons: [['overview','洞口近景'],['interior','洞内视角'],['landscape','桥隧全景']],
      cameras: {
        overview: {position:[218,-58,47],target:[276,-1,30],fov:47},
        landscape: {position:[49,-171,85],target:[218,-1,32],fov:51}
      },
      parts: ['分离式双洞门','洞内车道与机电照明','洞口边坡与桥隧衔接'],
      link: ['设备孪生', '#/gis?mode=tunnel&scene=QL&display=screen'],
      image: 'assets/3d/songlan-overview.png'
    },
    hub: {
      buttons: [['overview','枢纽全景'],['top','俯瞰'],['ramps','匝道近景']],
      parts: ['主线与跨线桥','直接匝道与环形匝道','边坡及周边林地'],
      link: ['路段孪生', '#/gis?mode=road&scene=RS-HUB&display=screen']
    }
  };

  class RouteNodeView extends HTMLElement {
    connectedCallback() {
      const node = this.context;
      const spec = views[node.id];
      this.view = 'overview';
      this.terrain = true;
      this.innerHTML = `<div class="route-node-canvas songlan-canvas"></div><div class="songlan-labels"></div>
        <div class="route-node-actions" role="group" aria-label="三维场景控制">
          ${spec.buttons.map(([key, label]) => `<button class="hud-btn" type="button" data-node-view="${key}">${label}</button>`).join('')}
          <button class="hud-btn" type="button" role="switch" aria-label="周边地形" data-node-terrain>地形 开</button>
          <button class="hud-btn" type="button" aria-label="放大" data-node-zoom="1">＋</button>
          <button class="hud-btn" type="button" aria-label="缩小" data-node-zoom="-1">−</button>
        </div><div class="route-node-status" role="status">正在加载模型与地形…</div>`;
      const stage = this.querySelector('.route-node-canvas');
      const overlay = this.querySelector('.songlan-labels');
      const status = this.querySelector('.route-node-status');
      const terrainBtn = this.querySelector('[data-node-terrain]');
      const changeView = name => {
        this.view = name;
        this.querySelectorAll('[data-node-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.nodeView === name)));
      };
      const reflectTerrain = () => {
        terrainBtn.setAttribute('aria-checked', String(this.terrain));
        terrainBtn.textContent = this.terrain ? '地形 开' : '地形 关';
      };
      changeView(this.view);
      reflectTerrain();
      this.querySelectorAll('[data-node-view]').forEach(b => b.onclick = () => { changeView(b.dataset.nodeView); this.model?.setView(this.view); });
      terrainBtn.onclick = () => { this.terrain = !this.terrain; this.model?.setEnvironment(this.terrain); reflectTerrain(); };
      this.querySelectorAll('[data-node-zoom]').forEach(b => b.onclick = () => this.model?.zoom(Number(b.dataset.nodeZoom)));

      const load = async () => {
        status.hidden = false;
        status.textContent = '正在加载模型与地形…';
        this.dataset.ready = 'loading';
        try {
          let model;
          if (node.id === 'hub') {
            const { createInterchange } = await import('./twin-interchange.js?v=20261126');
            if (!this.isConnected) return;
            model = createInterchange(stage, this);
          } else {
            const [response, { createSonglan }] = await Promise.all([
              fetch('assets/3d/songlan-engineering.json', {signal:AbortSignal.timeout(12000)}),
              import('../demo/songlan.js?v=20261124-git474230a')
            ]);
            if (!response.ok) throw new Error('缺少模型配置');
            const base = await response.json();
            if (!this.isConnected) return;
            const config = {...base, cameras:{...base.cameras, ...spec.cameras}, devices:[]};
            if (node.id === 'tunnel') config.site = {id:'QL', name:node.name, chainage:D.kmText(D.TUNNELS[0].start)};
            model = await createSonglan(stage, overlay, this, config);
            if (!this.isConnected) { model.dispose(); return; }
          }
          this.model = model;
          model.show?.({theme:'light', labelEnabled:false, cases:{}}, {}, true);
          model.setEnvironment(this.terrain);
          model.setView(this.view);
          this.dataset.ready = 'model';
          status.hidden = true;
        } catch (error) {
          if (!this.isConnected) return;
          this.model?.dispose();
          this.model = null;
          this.dataset.ready = 'fallback';
          stage.replaceChildren();
          if (spec.image) {
            const image = document.createElement('img');
            image.src = spec.image;
            image.alt = node.name + '模型预览';
            stage.append(image);
          }
          status.textContent = '三维模型暂不可用';
          const retry = document.createElement('button');
          retry.className = 'hud-btn';
          retry.type = 'button'; retry.textContent = '重新加载';
          retry.onclick = () => {stage.replaceChildren(); load();};
          status.append(' ', retry);
        }
      };
      load();
    }
    disconnectedCallback() {
      this.model?.dispose();
      this.model = null;
    }
  }
  customElements.define('route-node-view', RouteNodeView);

  window.Pages.gis.renderFeature = function (el, node) {
    document.body.classList.add('gis-screen-mode');
    const spec = views[node.id];
    el.innerHTML = `<section class="route-node-shell" aria-label="${U.esc(node.name)}三维近景">
      <header class="route-node-header">
        <a class="hud-btn route-node-back" href="${overview}">${U.icon('back',14)} 返回宏观路网</a>
        <div class="route-node-title"><h2>${node.name}</h2><span>${D.ROAD.name} · ${D.kmText(node.km)}</span></div>
        <nav aria-label="重点节点">${Twin.FEATURE_NODES.map(item =>
          `<a href="${nodeURL(item.id)}" ${item.id === node.id ? 'aria-current="page"' : ''}>${U.icon(item.icon,14)} ${item.type}</a>`).join('')}</nav>
      </header>
      <div class="route-node-viewport">
        <aside class="route-node-info" id="route-node-info"><h3>主体构件</h3>
          <ul>${spec.parts.map(part => `<li>${part}</li>`).join('')}</ul>
          ${spec.link ? `<a href="${spec.link[1]}">${spec.link[0]} ›</a>` : ''}
        </aside>
        <small class="route-node-credit">模型示意</small>
      </div>
    </section>`;
    const viewport = el.querySelector('.route-node-viewport');
    const viewer = document.createElement('route-node-view');
    viewer.context = node;
    viewport.prepend(viewer);
    const panel = el.querySelector('#route-node-info');
    const compact = U.compactCockpit.matches;
    const state = U.cockpitPanelState();
    state.lists ??= !compact;
    panel.hidden = !state.lists;
    U.bindBoardToggle(open => {panel.hidden = !open;}, panel.id);
  };
})();

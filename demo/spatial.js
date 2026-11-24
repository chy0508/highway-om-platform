'use strict';
window.RoadSpatial = (() => {
  const host = document.getElementById('spatial');
  const canvasHost = document.getElementById('scene-canvas');
  const labelHost = document.getElementById('scene-labels');
  const pilotCanvas = document.getElementById('songlan-canvas');
  const pilotLabels = document.getElementById('songlan-labels');
  const pilotLoading = document.getElementById('songlan-loading');
  const N = RoadNetwork;
  let viewer, config, frame, prepared, stage, routeId, lastSite, detailModel, detailRequest;
  let regionModel, networkCamera, errorBox, onAction, lastState;
  let tracks = new Map();
  let markerViews = [];
  let labelAnimation = 0;
  let focusedRoute = null;
  let labelEnabled = true;
  let viewTicket = 0;
  let pilot, pilotRequest;
  let pilotActive = false, pilotDisplayed = false;
  const mapEast = value => value * 760;
  const mapNorth = value => value * 810;

  function point(east, north, up = 0) {
    return Cesium.Matrix4.multiplyByPoint(frame, new Cesium.Cartesian3(east, north, up), new Cesium.Cartesian3());
  }

  function localHeight(east, north) {
    const {bounds, columns, rows, heights} = config.region;
    const [west, eastEdge, south, northEdge] = bounds;
    const u = Math.min(columns-1.001, Math.max(0, (east-west)/(eastEdge-west)*(columns-1)));
    const v = Math.min(rows-1.001, Math.max(0, (north-south)/(northEdge-south)*(rows-1)));
    const x = Math.floor(u), y = Math.floor(v), a = u-x, b = v-y;
    const at = (i, j) => heights[j*columns+i];
    const diagonal = at(x+1,y+1);
    return a>=b ? (1-a)*at(x,y)+(a-b)*at(x+1,y)+b*diagonal :
      (1-b)*at(x,y)+(b-a)*at(x,y+1)+a*diagonal;
  }

  function smooth(points) {
    const curve = new Cesium.CatmullRomSpline({
      times: points.map((_, index) => index),
      points: points.map(([x, y]) => new Cesium.Cartesian3(mapEast(x), mapNorth(y), 0))
    });
    return Array.from({length: (points.length-1)*56+1}, (_, index) => curve.evaluate(index/56));
  }

  function routePoint(p, elevation = 730) {
    return point(p.x, p.y, localHeight(p.x, p.y)+elevation);
  }

  function configureRoutes() {
    for (const route of N.routes) {
      const line = smooth(route.points);
      const positions = line.map(p => routePoint(p));
      const stroke = viewer.entities.add({ polyline: {
        positions, width: 3.2, arcType: Cesium.ArcType.NONE,
        material: Cesium.Color.fromCssColorString('#93aeb9')
      } });
      const nodes = route.points.slice(1, -1).filter((_, i) => i % 2 === 0).map(([x, y]) =>
        viewer.entities.add({ position: routePoint({x:mapEast(x),y:mapNorth(y)}, 860),
          point: { pixelSize:5.2, color:Cesium.Color.fromCssColorString('#25445a'), outlineWidth:1.2,
            outlineColor:Cesium.Color.fromCssColorString('#a0cdec'),
            disableDepthTestDistance: 0 }
        })
      );
      tracks.set(route.id, { line, stroke, nodes, major:route.km>=300, entities:new Set([stroke, ...nodes]) });
    }
  }

  function requestRender() {
    viewer?.scene.requestRender();
  }

  function updateStrokes() {
    if (!viewer || !lastState) return;
    const light = lastState.theme === 'light';
    const selected = focusedRoute || routeId || 'qinglan';
    for (const [id, track] of tracks) {
      const active = selected === id;
      const themed = lastState.mode === 'energy-map' && id !== 'qinglan';
      const shows = stage === 'network' || (stage === 'route' && id === routeId);
      track.stroke.show = shows;
      track.nodes.forEach(node => { node.show = shows && (active || (labelEnabled && track.major)); });
      const signature = [light,active,lastState.mode].join('/');
      if (track.style === signature) continue;
      track.style = signature;
      track.stroke.polyline.width = active ? 13 : track.major ? 3.25 : 2.1;
      let color = active ? (light ? '#00bcaa' : '#00e9e3') : (light ? '#578cae' : track.major ? '#77b7e2' : '#577e9f');
      if (themed) color = light ? '#a694c4' : '#ad9acf';
      const tint = Cesium.Color.fromCssColorString(color);
      const material = active ? new Cesium.PolylineGlowMaterialProperty({color:tint,glowPower:.25}) :
        new Cesium.PolylineOutlineMaterialProperty({
          color:tint.withAlpha(track.major ? .83 : .62),
          outlineColor:Cesium.Color.fromCssColorString('#102535').withAlpha(.75),outlineWidth:.5
        });
      track.stroke.polyline.material = material;
      track.stroke.polyline.depthFailMaterial = material;
    }
    requestRender();
  }

  function createMarker(position, description) {
    const node = document.createElement(description.action ? 'button' : 'span');
    node.className = 'map-label ' + (description.className || '');
    node.hidden = true;
    if (description.caption) {
      const title = document.createElement('strong');
      const caption = document.createElement('small');
      const enter = document.createElement('em');
      title.textContent = description.text;
      caption.textContent = description.caption;
      enter.textContent = description.cta || '进入路段 ›';
      node.append(title,caption,enter);
    } else {
      if (description.icon) node.insertAdjacentHTML('afterbegin',RoadUI.ico(description.icon,13));
      node.append(document.createTextNode(description.text));
    }
    if (description.action) {
      node.type = 'button';
      node.setAttribute('aria-label', description.label || description.text);
      node.addEventListener('click', () => onAction?.(description.action, description.value));
      if (description.action === 'route') {
        node.addEventListener('pointerenter', () => highlight(description.value));
        node.addEventListener('pointerleave', () => highlight(null));
      }
    }
    labelHost.appendChild(node);
    markerViews.push({ node, position });
  }

  function clearMarkers() {
    labelHost.replaceChildren();
    markerViews = [];
  }

  function plotMarkers() {
    if (pilotActive) return;
    const model = stage === 'detail' ? detailModel : regionModel;
    if (model?.ready && !host.hidden) host.dataset.sceneReady = stage;
    if (labelAnimation) cancelAnimationFrame(labelAnimation);
    labelAnimation = requestAnimationFrame(() => {
      labelAnimation = 0;
      if (!viewer || host.hidden || pilotActive) return;
      const { width, height } = host.getBoundingClientRect();
      const limitToMap = stage === 'network' && width > 800;
      const west = limitToMap ? document.querySelector('.network-view .cockpit-left')?.getBoundingClientRect().right + 28 : 18;
      const east = limitToMap ? document.querySelector('.network-view .cockpit-right')?.getBoundingClientRect().left - 28 : width-18;
      const occupied = [];
      for (const {node, position} of markerViews) {
        const shifted = Cesium.Cartesian3.subtract(position, viewer.camera.positionWC, new Cesium.Cartesian3());
        const visible = Cesium.Cartesian3.dot(shifted, viewer.camera.directionWC) > 0;
        const p = visible && Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, position);
        const overlaps = limitToMap && p && occupied.some(other => Math.abs(other.x-p.x)<82 && Math.abs(other.y-p.y)<27);
        const inside = p && p.x > west && p.y > (limitToMap?125:45) && p.x < east && p.y < height-44 && !overlaps;
        node.hidden = !inside;
        if (inside) {
          occupied.push(p);
          node.style.transform = `translate(${p.x}px,${p.y}px) translate(calc(-50% + var(--label-x,0px)),calc(-100% + var(--label-y,0px)))`;
        }
      }
    });
  }

  function fillMarkers() {
    clearMarkers();
    if (!config || !stage || !lastState) return;
    if (stage === 'network') {
      const labeled = [
        ['qinglan',.52],['yunling',.29],['songchuan',.60],['jiangbei',.64],
        ['linjiang',.76],['nanling',.46],['xiling',.42],['beichuan',.36],['qingyuan',.62]
      ];
      for (const [id, at] of labeled) {
        if (!labelEnabled && id !== 'qinglan') continue;
        const {line} = tracks.get(id);
        const p = line[Math.round((line.length-1) * at)];
        const route = N.route(id);
        createMarker(routePoint(p, 1280), {
          text:route.name, label:'地图进入'+route.name, action:'route', value:id,
          caption:id==='qinglan' ? route.km+' km · '+lastState.pending+' 起待处置' : '',
          className:id==='qinglan' ? 'route-callout' : ''
        });
      }
      const mode = lastState.mode;
      if (labelEnabled) {
        const {line} = tracks.get('qinglan');
        for (const [index, site] of RoadModel.sites.entries()) {
          const event = RoadModel.events.find(item => item.site === site.id);
          const task = RoadData.tasks.find(item => item.site === site.id);
          if (mode === 'alarm-map' && lastState.cases[event.id]?.closed) continue;
          const at = [.29,.43,.73][index];
          const position = routePoint(line[Math.round((line.length-1)*at)], 2500);
          const energy = RoadModel.energy(site.id,'light','sun','high','control').meter +
            RoadModel.energy(site.id,'fan','sun','high','control').meter;
          const description = {
            all:{text:site.name, action:'route-site', value:site.id, icon:lastState.cases[event.id]?.closed?'pin':'bell',
              className:lastState.cases[event.id]?.closed?'facility-mark':'alert-pin'},
            'facility-map':{text:site.name, action:'route-site', value:site.id, icon:'pin',className:'facility-mark'},
            'alarm-map':{text:event.title, action:'event', value:event.id, icon:'bell',className:'alert-pin'},
            'work-map':{text:site.name+' · '+task.crew, action:'plan-site', value:site.id, icon:'calendar',className:'facility-mark'},
            'energy-map':{text:site.name+' · '+Math.round(energy)+' kWh', action:'energy-site', value:site.id, icon:'energy',className:'facility-mark'}
          }[mode];
          if (description) createMarker(position, description);
        }
        if (mode === 'all') {
          createMarker(routePoint({x:-65000,y:45000},500),{text:'秦岭山地',className:'mark-context'});
          createMarker(routePoint({x:33000,y:-66000},500),{text:'汉江流域',className:'mark-context'});
        }
      }
    } else if (stage === 'route') {
      const track = tracks.get(routeId);
      const p = track.line[Math.floor(track.line.length/2)];
      createMarker(routePoint(p, 1340), {text:N.route(routeId).name, className:'primary-mark'});
    } else if (stage === 'detail') {
      for (const site of RoadModel.sites) {
        const isActive = site.id === lastState.site;
        const e = RoadModel.events.find(event => event.site === site.id);
        const actionAlert = isActive && !(lastState.cases[e.id]?.closed);
        if (!labelEnabled && !isActive) continue;
        const [x,y,z] = config.detail.markers[site.id];
        createMarker(point(x,y,z+(isActive?24:5)), {
          text: site.name + ' · K' + site.km + '+000',
          label: actionAlert ? '地图告警 ' + e.title : '地图定位' + site.name,
          action: actionAlert ? 'event' : 'site',
          value: actionAlert ? e.id : site.id,
          caption:actionAlert ? '◆ '+e.title : '',
          cta:'查看故障诊断 ›',
          className: actionAlert ? 'route-callout alert-mark' : ''
        });
      }
      if (labelEnabled && lastState.site === 'C') {
        const [x,y,z] = config.detail.cameraMarker;
        createMarker(point(x,y,z+7), {text:'监控摄像机',icon:'diag',className:'equipment-mark facility-mark'});
      }
    }
    plotMarkers();
    requestRender();
  }

  async function loadModel(file) {
    const model = await Cesium.Model.fromGltfAsync({
      url:new URL('assets/3d/' + file, document.baseURI).href, modelMatrix:frame, forwardAxis:Cesium.Axis.X,
      allowPicking:false, enableVerticalExaggeration:false
    });
    model.show = false;
    viewer.scene.primitives.add(model);
    return model;
  }

  function loadCesium() {
    if (window.Cesium) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('vendor/cesium/Cesium.js', document.baseURI);
      script.onload = resolve;
      script.onerror = () => { script.remove(); reject(new Error('三维路网引擎未加载')); };
      document.head.appendChild(script);
    });
  }

  async function initialize() {
    const [input] = await Promise.all([fetch('assets/3d/scene.json', {signal: AbortSignal.timeout(15000)}), loadCesium()]);
    if (!input.ok) throw new Error('三维场景数据未找到');
    config = await input.json();
    frame = Cesium.Transforms.eastNorthUpToFixedFrame(
      Cesium.Cartesian3.fromDegrees(...config.region.origin, 0));
    viewer = new Cesium.Viewer(canvasHost, {
      animation:false, timeline:false, baseLayerPicker:false, navigationHelpButton:false,
      geocoder:false, homeButton:false, sceneModePicker:false, fullscreenButton:false,
      infoBox:false, selectionIndicator:false, shouldAnimate:false, baseLayer:false,
      globe:false, skyBox:false, skyAtmosphere:false, requestRenderMode:true,
      maximumRenderTimeChange:Infinity, creditContainer:document.createElement('div')
    });
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#243c3c');
    viewer.scene.fog.enabled = false;
    if (viewer.scene.sun) viewer.scene.sun.show = false;
    if (viewer.scene.moon) viewer.scene.moon.show = false;
    viewer.scene.postProcessStages.fxaa.enabled = true;
    viewer.scene.highDynamicRange = false;
    viewer.resolutionScale = Math.min(1, 1.55 / window.devicePixelRatio);
    viewer.scene.renderError.addEventListener((_, error) => showError(error));
    viewer.scene.postRender.addEventListener(plotMarkers);

    configureRoutes();
    regionModel = await loadModel('region.glb');
    const handle = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handle.setInputAction(({position}) => {
      if (stage !== 'network') return;
      const picked = viewer.scene.pick(position, 7, 7);
      for (const [id, record] of tracks) {
        if (record.entities.has(picked?.id)) {
          onAction?.('route', id);
          return;
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  function getOrientation(eye, target) {
    const destination = point(...eye);
    const direction = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.subtract(point(...target), destination, new Cesium.Cartesian3()), new Cesium.Cartesian3());
    const vertical = Cesium.Matrix4.multiplyByPointAsVector(frame, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3());
    const right = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(direction, vertical, new Cesium.Cartesian3()), new Cesium.Cartesian3());
    const up = Cesium.Cartesian3.cross(right, direction, new Cesium.Cartesian3());
    return { destination, orientation:{direction, up} };
  }

  function chooseView(animate = false, site = lastSite) {
    if (!viewer || !stage) return;
    let setup;
    if (stage === 'network') {
      setup = networkCamera || getOrientation([7000,-167000,294000],[0,4200,4500]);
    } else if (stage === 'route') {
      const points = N.route(routeId).points;
      const x = points.map(p => mapEast(p[0]));
      const y = points.map(p => mapNorth(p[1]));
      const xc = (Math.min(...x)+Math.max(...x))/2;
      const yc = (Math.min(...y)+Math.max(...y))/2;
      const spread = Math.max(xc-Math.min(...x),yc-Math.min(...y),35000);
      setup = getOrientation([xc,yc-spread*.86,spread*1.75],[xc,yc,4200]);
    } else if (site === 'C') {
      setup = getOrientation([-155,-164,115],[250,110,53]);
    } else {
      const target = config.detail.markers[site] || config.detail.markers.A;
      setup = getOrientation([target[0]-360,target[1]-490,target[2]+224],target);
    }
    viewer.camera.cancelFlight();
    if (animate) viewer.camera.flyTo({...setup,duration:.72});
    else viewer.camera.setView(setup);
    requestRender();
  }

  function memorizeNetwork() {
    networkCamera = {destination: viewer.camera.positionWC.clone(),
      orientation: {direction:viewer.camera.directionWC.clone(), up:viewer.camera.upWC.clone()}};
  }

  function showError(error) {
    if (!errorBox) {
      errorBox = document.createElement('div');
      errorBox.className = 'scene-message';
      errorBox.setAttribute('role','status');
      host.appendChild(errorBox);
    }
    errorBox.textContent = '三维场景加载失败。仍可从路线表进入运维页面。';
    const retry = document.createElement('button');
    retry.className = 'scene-retry';
    retry.textContent = '重试';
    retry.onclick = () => RoadUI.render();
    errorBox.append(' ', retry);
    errorBox.hidden = false;
    host.dataset.sceneReady = 'error';
    console.error(error);
  }

  function pilotVisibility(active) {
    pilotActive = active;
    canvasHost.hidden = active;
    labelHost.hidden = active;
    pilotCanvas.hidden = !active;
    pilotLabels.hidden = !active;
    if (viewer) viewer.useDefaultRenderLoop = !active;
    if (!active) {
      pilot?.hide();
      pilotDisplayed = false;
      pilotLoading.hidden = true;
      delete host.dataset.pilotView;
      delete host.dataset.waterMaterial;
    }
    host.dataset.sceneEngine = active ? 'three' : 'cesium';
  }

  async function showPilot(state, action, onAsset, onView, ticket) {
    if (!pilotActive && stage === 'network') memorizeNetwork();
    pilotVisibility(true);
    if (!pilot) {
      host.dataset.sceneReady = 'loading';
      pilotLoading.hidden = false;
      pilotRequest ||= import('./songlan.js')
        .then(module=>module.createSonglan(pilotCanvas,pilotLabels,host))
        .catch(error=>{pilotRequest=undefined;throw error;});
      pilot = await pilotRequest;
    }
    if (ticket !== viewTicket) return;
    pilot.show({...state,labelEnabled},{onEvent:id=>action('event',id),onAsset,onView},!pilotDisplayed);
    pilotDisplayed = true;
    pilotLoading.hidden = true;
    host.dataset.waterMaterial = 'river';
    host.dataset.sceneReady = 'detail';
  }

  async function show(screen, state, action, onAsset, onView) {
    host.hidden = false;
    if (errorBox) errorBox.hidden = true;
    onAction = action;
    lastState = state;
    const ticket = ++viewTicket;
    try {
      if (screen!=='network' && state.route==='qinglan' && state.site==='C') {
        await showPilot(state,action,onAsset,onView,ticket);
        return;
      }
      const leavingPilot = pilotActive;
      pilotVisibility(false);
      prepared ||= initialize().catch(error=>{prepared=undefined;throw error;});
      await prepared;
      if (ticket !== viewTicket) return;
      const nextStage = screen === 'network' ? 'network' : state.route === 'qinglan' ? 'detail' : 'route';
      const stageChanged = leavingPilot || stage !== nextStage || routeId !== state.route;
      if (stageChanged) host.dataset.sceneReady = 'loading';
      if (stageChanged && stage === 'network') memorizeNetwork();
      if (nextStage === 'detail' && !detailModel) {
        detailRequest ||= loadModel('songlan.glb').catch(error=>{detailRequest=undefined;throw error;});
        detailModel = await detailRequest;
        if (ticket !== viewTicket) return;
      }
      const siteChanged = stage === 'detail' && lastSite !== state.site;
      routeId = state.route;
      stage = nextStage;
      lastSite = state.site;
      focusedRoute = null;
      regionModel.show = stage !== 'detail';
      if (detailModel) detailModel.show = stage === 'detail';
      if (stageChanged || siteChanged) chooseView(!stageChanged);
      updateStrokes();
      fillMarkers();
      viewer.resize();
      requestRender();
    } catch (error) {
      if (ticket === viewTicket) {
        pilotLoading.hidden = true;
        showError(error);
      }
    }
  }

  function hide() {
    host.hidden = true;
    ++viewTicket;
    pilotVisibility(false);
    if (viewer) viewer.camera.cancelFlight();
  }

  function highlight(id) {
    focusedRoute = id;
    updateStrokes();
  }

  function zoom(factor) {
    if (pilotActive) {
      pilot?.zoom(factor);
      return;
    }
    if (!viewer) return;
    const distance = stage === 'detail' ? 185 : 27000;
    viewer.camera.moveForward(distance * factor);
    requestRender();
  }

  function resetView() {
    if (pilotActive) {
      pilot?.setView('overview');
      return;
    }
    networkCamera = undefined;
    chooseView(true);
  }

  function focusSite(site) {
    if (pilotActive) pilot?.setView('overview');
    else if (stage === 'detail') chooseView(true, site);
  }

  function toggleLabels() {
    labelEnabled = !labelEnabled;
    if (pilotActive) {
      pilot?.setLabels(labelEnabled);
      return labelEnabled;
    }
    updateStrokes();
    fillMarkers();
    return labelEnabled;
  }

  function cameraKey() {
    if (pilotActive) return pilot?.cameraKey() || '';
    if (!viewer) return '';
    const {positionWC, directionWC} = viewer.camera;
    return [positionWC.x, positionWC.y, positionWC.z, directionWC.x, directionWC.y, directionWC.z].join(',');
  }

  function pilotView(name) {
    if (pilotActive) pilot?.setView(name);
  }

  function pilotAsset(id) {
    if (pilotActive) pilot?.select(id,true);
  }

  return {show, hide, highlight, zoom, resetView, focusSite, toggleLabels, cameraKey, pilotView, pilotAsset};
})();

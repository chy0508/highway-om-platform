import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const assetRoot = new URL('assets/3d/', document.baseURI).href;
const fromBlender = ([x,y,z]) => new THREE.Vector3(x,z,-y);

function riverMaterial(flowMap) {
  return new THREE.ShaderMaterial({
    name:'松岚河 · 流纹与岸边浅滩',
    uniforms:{elapsed:{value:0},lightTheme:{value:0},flowMap:{value:flowMap}},
    vertexShader:`
      varying vec2 flowUv;
      varying vec3 worldPoint;
      void main() {
        flowUv=uv;
        worldPoint=(modelMatrix*vec4(position,1.0)).xyz;
        gl_Position=projectionMatrix*viewMatrix*vec4(worldPoint,1.0);
      }
    `,
    fragmentShader:`
      uniform float elapsed;
      uniform float lightTheme;
      uniform sampler2D flowMap;
      varying vec2 flowUv;
      varying vec3 worldPoint;
      void main() {
        vec2 p=worldPoint.xz;
        vec2 bends=vec2(2.8*sin(p.y*.069)+.72*sin(dot(p,vec2(.28,.34))),
                        1.7*sin(dot(p,vec2(-.087,.16)))+.45*sin(p.x*.58));
        vec2 current=p+bends;
        float wave0=dot(current,vec2(.37,.82))-elapsed*1.7;
        float wave1=dot(current,vec2(.87,-1.94))+elapsed*2.28;
        float wave2=dot(current,vec2(3.1,5.3))-elapsed*3.6;
        float longitudinal=flowUv.y*99.0-elapsed*.52;
        vec2 detailWave=texture2D(flowMap,current*.079+vec2(.0,elapsed*.045)).rg*2.0-1.0;
        vec3 N=normalize(vec3(.058*cos(wave0)+.044*cos(wave1)+.020*cos(wave2)+detailWave.x*.045,
                             1.0,.052*cos(wave0)-.047*cos(wave1)+.022*cos(wave2)+detailWave.y*.045));
        vec3 viewDirection=normalize(cameraPosition-worldPoint);
        vec3 sun=normalize(vec3(-.55,.66,.51));
        float grazing=pow(1.0-clamp(dot(viewDirection,N),0.0,1.0),4.8);
        float glint=pow(max(dot(N,normalize(sun+viewDirection)),0.0),98.0);
        float bankEdge=min(flowUv.x,1.0-flowUv.x);
        float shallow=1.0-smoothstep(.03,.25,bankEdge);
        vec3 deep=vec3(.028,.095,.109);
        vec3 bank=vec3(.097,.171,.147);
        vec3 sky=vec3(.24,.38,.45);
        float channel=sin(worldPoint.x*.42+sin(longitudinal*.22)*1.9+longitudinal*.8);
        float breaks=smoothstep(.28,.77,.5+.5*sin(dot(current,vec2(.17,.29))));
        float streak=pow(max(0.0,.69*channel+.31*cos(wave1)),13.0)*breaks*.068;
        float foam=(1.0-smoothstep(.004,.040,bankEdge))
                   *smoothstep(.76,1.0,sin(longitudinal+2.2*cos(wave0)))*.19;
        vec3 color=mix(mix(deep,bank,shallow*.85),sky,grazing*.62);
        color+=vec3(.83,.94,1.0)*(glint*.55+streak+foam);
        // Project the twin bridge decks toward the water along the daylight direction.
        vec2 above=p+vec2(-.97,.81)*(22.0-worldPoint.y);
        float bend=max(0.0,130.0-above.x);
        float centreOffset=above.y+.00011*bend*bend;
        float deck=min(abs(centreOffset-8.5),abs(centreOffset+8.5));
        float shadow=(1.0-smoothstep(5.0,7.4,deck))
                    *smoothstep(-163.0,-155.0,above.x)*(1.0-smoothstep(141.0,148.0,above.x));
        color*=1.0-.34*shadow;
        color*=.91+.13*lightTheme;
        float distanceFog=smoothstep(525.0,1780.0,distance(worldPoint,cameraPosition));
        gl_FragColor=vec4(mix(color,sky,distanceFog*.82),1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
}

function addDaylight(scene) {
  const ambient=new THREE.HemisphereLight(0xd8e9ff,0x827a62,1.44);
  scene.add(ambient);
  const sunlight=new THREE.DirectionalLight(0xffe8c7,2.3);
  sunlight.position.set(-148,250,190);
  sunlight.target.position.set(80,15,0);
  sunlight.castShadow=true;
  sunlight.shadow.mapSize.set(2048,2048);
  sunlight.shadow.camera.left=-255;
  sunlight.shadow.camera.right=255;
  sunlight.shadow.camera.top=200;
  sunlight.shadow.camera.bottom=-200;
  sunlight.shadow.camera.near=20;
  sunlight.shadow.camera.far=680;
  sunlight.shadow.normalBias=.11;
  sunlight.shadow.bias=-.00017;
  scene.add(sunlight,sunlight.target);
  return {sunlight,ambient};
}

function tag(parent,text,aria,action) {
  const button=document.createElement('button');
  button.type='button';
  button.className='map-label pilot-tag';
  button.hidden=true;
  button.setAttribute('aria-label',aria || text);
  button.append(document.createElement('i'),document.createTextNode(text));
  button.addEventListener('click',action);
  parent.appendChild(button);
  return button;
}

async function fetchAsset(file, timeout, signal) {
  const signals=[AbortSignal.timeout(timeout)];
  if (signal) signals.push(signal);
  const response=await fetch(assetRoot+file,{signal:AbortSignal.any(signals)});
  if (!response.ok) throw new Error('场景资源加载失败：'+file);
  return response;
}

async function loadModel(file, timeout, signal) {
  const response=await fetchAsset(file,timeout,signal);
  return new GLTFLoader().parseAsync(await response.arrayBuffer(),assetRoot);
}

function disposeMeshes(group, resources=new Set()) {
  group.traverse(node=>{
    if (node.geometry) resources.add(node.geometry);
    for (const mat of [].concat(node.material || [])) {
      resources.add(mat);
      for (const value of Object.values(mat)) if (value?.isTexture) resources.add(value);
    }
  });
  resources.forEach(resource=>resource.dispose());
}

function equipSite(engineering,config) {
  const templates=new Map(), plaques=[];
  engineering.traverse(node=>{
    if (node.userData.assetId) templates.set(node.userData.kind,node);
    if (/^Songlan[ _]portal[ _]name/i.test(node.name)) plaques.push(node);
  });
  // The original name is baked into two meshes on the portal faces.
  const sign=document.createElement('canvas');
  sign.width=512; sign.height=96;
  const pen=sign.getContext('2d');
  pen.fillStyle='#233b43'; pen.fillRect(0,0,512,96);
  pen.font='bold 68px "Microsoft YaHei",sans-serif'; pen.fillStyle='white';
  pen.textAlign='center'; pen.textBaseline='middle'; pen.fillText(config.site.name,256,49,488);
  const texture=new THREE.CanvasTexture(sign); texture.colorSpace=THREE.SRGBColorSpace;
  const signMaterial=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide});
  for (const plaque of plaques) {
    plaque.visible=false;
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(4.6,.72),signMaterial);
    panel.position.copy(plaque.position); panel.position.x-=.025;
    panel.rotation.y=-Math.PI/2; engineering.add(panel);
  }
  const fan=new THREE.Group();
  const shell=new THREE.Mesh(new THREE.CylinderGeometry(.62,.62,2.8,20,1,true),new THREE.MeshStandardMaterial({color:0x7793a1,metalness:.55,roughness:.42,side:THREE.DoubleSide}));
  shell.rotation.z=Math.PI/2; fan.add(shell);
  const blade=new THREE.Mesh(new THREE.BoxGeometry(.13,1.04,.15),new THREE.MeshStandardMaterial({color:0x374955}));
  blade.position.x=-1.32; fan.add(blade);
  const otherBlade=blade.clone(); otherBlade.rotation.x=Math.PI/2; fan.add(otherBlade);
  templates.set('fan',fan);
  for (const node of templates.values()) node.visible=false;
  for (const device of config.devices) {
    const object=templates.get(device.kind).clone(true);
    object.name=device.id;
    object.userData={assetId:device.id};
    object.visible=true;
    object.position.copy(fromBlender(device.position));
    engineering.add(object);
  }
}

export async function createSonglan(canvasHost,overlay,root,metadata) {
  const [config,engineering]=await Promise.all([
    metadata || fetchAsset('songlan-engineering.json',12000).then(r=>r.json()),
    loadModel('songlan-engineering.glb',18000)
  ]);
  const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.6));
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.04;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate=false;
  canvasHost.appendChild(renderer.domElement);

  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0xb8cade);
  scene.fog=new THREE.FogExp2(0xb8cade,.00094);
  const {sunlight,ambient}=addDaylight(scene);
  const camera=new THREE.PerspectiveCamera(44,1,.23,4100);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=false;
  controls.enablePan=true;
  controls.minPolarAngle=.08;
  controls.maxPolarAngle=Math.PI/2+.13;
  controls.minDistance=3;
  controls.maxDistance=790;
  const landscape=new THREE.Group();
  const terrainRequest=new AbortController();
  let water, waterMesh, originalWater, flowMap, terrainLoading=false, disposed=false;
  const terrainStatus=document.createElement('div');
  terrainStatus.className='terrain-status';
  terrainStatus.setAttribute('role','status');
  terrainStatus.hidden=true;
  canvasHost.appendChild(terrainStatus);

  if (config.site) equipSite(engineering.scene,config);
  const devices=new Map(config.devices.map(device=>[device.id,device]));
  const assetNodes=new Map();
  engineering.scene.traverse(node=>{
    if (devices.has(node.userData.assetId)) assetNodes.set(node.userData.assetId,node);
    if (node.isMesh) {
      node.castShadow=true;
      node.receiveShadow=true;
    }
  });
  for (const id of devices.keys()) {
    if (!assetNodes.has(id)) throw new Error('松岚设备缺少独立模型：'+id);
  }
  scene.add(landscape,engineering.scene);
  // The inspection drawing and the landscape share the north bore and its equipment.
  const detail=config.site && window.Twin.createTunnelDetail(THREE,config.site.id);
  if (detail) {
    detail.scene.scale.set(.7,.63,.63);
    detail.scene.position.set(341,27.2,8.5);
    detail.scene.rotation.z=.007;
    detail.draftingSurface[0].material.color.setHex(0x425a74);
    detail.draftingSurface[1].material.opacity=.72;
    detail.labelSprites[detail.labelSprites.length-1].position.y+=9;
    scene.add(detail.scene);
    detail.scene.updateMatrixWorld(true);
    for (const child of detail.scene.children) if (child.isPointLight) child.visible=false;
    for (const obj of [...detail.equipGroups.fan.children,...detail.equipGroups.cam.children,...detail.equipGroups.power.children]) {
      const id=obj.userData.code;
      if (!devices.has(id)) continue;
      assetNodes.get(id).visible=false;
      assetNodes.set(id,obj);
      const p=obj.getWorldPosition(new THREE.Vector3());
      devices.get(id).position=[p.x,-p.z,p.y];
    }
  }
  // A local section cut is a separate camera tool. It works with either terrain state.
  const sectionMaterials=new Set();
  const groundSections=[];
  const sectionLines=new THREE.Group();
  sectionLines.visible=false;
  const collect=object=>object.traverse(n=>{
      if (n.isMesh) for (const m of [].concat(n.material)) if (!m.isShaderMaterial) sectionMaterials.add(m);
    });
  function prepareTerrainSections(valley) {
    for(const node of valley.children) {
      if (!/ridge.and.valley.floor|ridge.and.tunnel.cover/i.test(node.name)) {collect(node);continue;}
      node.traverse(mesh=>{
        if(!mesh.isMesh) return;
        const whole=mesh.geometry, excavated=whole.clone(), points=excavated.attributes.position;
        for(let i=0;i<points.count;i++) {
          const x=points.getX(i), z=points.getZ(i);
          // Open the overburden along the bore and grade the shoulder back into the original hillside.
          const outside=Math.max(267-x,x-445,-30-z,z-68,0);
          const formation=20+.007*x+outside*.88;
          if(points.getY(i)>formation) points.setY(i,formation);
        }
        excavated.computeVertexNormals();
        groundSections.push({mesh,whole,excavated});
      });
    }
  }
  if (config.site) {
    renderer.localClippingEnabled=true;
    config.cameras.cutaway={position:[414,-71,76],target:[341,-8.5,29],fov:46};
    config.cameras.top={position:[364,-22,140],target:[341,-8.5,26],fov:49};
    engineering.scene.children.filter(n=>/linings|cladding|wing.walls/i.test(n.name)).forEach(collect);
    // Keep the tunnel cross-section legible where the roof is cut away.
    const outline=new THREE.LineBasicMaterial({color:0xc6d4de,transparent:true,opacity:.76});
    for (const center of [-8.5,8.5]) {
      for (let x=278;x<=404;x+=25) {
        const floor=22+.007*x;
        const points=[fromBlender([x,center+6,floor])];
        for (let step=0;step<=24;step++) {
          const angle=Math.PI*step/24;
          points.push(fromBlender([x,center+6*Math.cos(angle),floor+1.95+6*Math.sin(angle)]));
        }
        points.push(fromBlender([x,center-6,floor]));
        sectionLines.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),outline));
      }
    }
    scene.add(sectionLines);
  }
  const sectionPlanes=[new THREE.Plane(new THREE.Vector3(-1,0,0),272),new THREE.Plane(new THREE.Vector3(0,-1,0),26.4),
    new THREE.Plane(new THREE.Vector3(1,0,0),-505),new THREE.Plane(new THREE.Vector3(0,0,-1),-19),new THREE.Plane(new THREE.Vector3(0,0,1),-135)];
  const selectedOutline=new THREE.Box3Helper(new THREE.Box3(),0x67e8cf);
  selectedOutline.visible=false;
  scene.add(selectedOutline);
  const lightDevices=config.devices.filter(device=>device.kind==='luminaire');
  const tunnelLighting=new THREE.Group();
  for (const x of [293,306,321,342,370]) {
    const fill=new THREE.PointLight(0xfff0d9,24,25,1.55);
    fill.position.copy(fromBlender([x,-6.3,27.9]));
    tunnelLighting.add(fill);
  }
  scene.add(tunnelLighting);
  const lampMeshes=[];
  let workingLed;
  engineering.scene.traverse(node=>{
    if (node.isMesh && node.material.name==='LED luminaire operating modules') workingLed=node.material;
  });
  for (const device of lightDevices) assetNodes.get(device.id).traverse(node=>{
    if (node.isMesh && node.material.name==='LED luminaire inactive modules') {
      lampMeshes.push({node,off:node.material,device});
    }
  });

  const raycaster=new THREE.Raycaster();
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const cursor=new THREE.Vector2();
  let visible=false, pending=0, lastFrame=-1000, selected=null, view='overview', lightTheme=false;
  let labelEnabled=true, closed=false, callbacks={}, width=0, height=0, pointerDown;
  let cruising=false, lastInteraction=0;
  const sectionView=()=>view==='cutaway' || view==='top';
  function updateDetail() {
    if (!detail) return;
    const inspection=sectionView();
    for(const section of groundSections) section.mesh.geometry=inspection ? section.excavated : section.whole;
    detail.draftingSurface.forEach(n=>n.visible=inspection && !landscape.visible);
    detail.labelSprites.forEach(n=>n.visible=inspection && labelEnabled);
  }

  const site=config.site;
  const portalLabel=site ? site.name+' · '+site.chainage : '松岚隧道 · K20+000';
  const portalTag=tag(overlay,portalLabel,portalLabel,()=>{
    if (!site) callbacks.onEvent?.('lights');
    else if (site.eventId) callbacks.onEvent?.(site.eventId);
    else setView('interior');
  });
  const labels=new Map(config.devices.map(device=>[device.id,
    tag(overlay,site ? device.id : device.label,'选中'+device.label,()=>select(device.id,false))]));

  function project(node,coordinates,allowed=true) {
    if (!allowed) {
      node.hidden=true;
      return;
    }
    const p=fromBlender(coordinates);
    const direction=camera.getWorldDirection(new THREE.Vector3());
    const facing=p.clone().sub(camera.position).dot(direction)>0;
    p.project(camera);
    const x=(p.x*.5+.5)*width, y=(-p.y*.5+.5)*height;
    node.hidden=!facing || p.z>1 || x<width*.15 || x>width*.85 || y<90 || y>height-45;
    if (!node.hidden) node.style.transform=`translate(${x}px,${y}px) translate(-50%,calc(-100% - 9px))`;
  }

  function layoutLabels() {
    project(portalTag,config.anchors.portal,labelEnabled && view==='overview');
    const occupied=[];
    const order=view==='cutaway' && selected ? [[selected,labels.get(selected)],...Array.from(labels).filter(([id])=>id!==selected)] : labels;
    for (const [id,label] of order) {
      const device=devices.get(id);
      const inTunnel=site ? device.inside : device.kind==='luminaire';
      const warning=site ? device.warning : device.eventId==='lights' && !closed;
      const shown=id===selected || (view==='interior' && inTunnel && warning && (!site || !selected));
      label.classList.toggle('warning',warning);
      project(label,device.position,labelEnabled && shown);
      if(view==='cutaway' && !label.hidden) {
        const r=label.getBoundingClientRect();
        label.hidden=occupied.some(b=>r.left<b.right+4 && r.right>b.left-4 && r.top<b.bottom+3 && r.bottom>b.top-3);
        if(!label.hidden) occupied.push(r);
      }
    }
  }

  function render(now) {
    pending=0;
    if (!visible) return;
    const dt=Math.min(.08,Math.max(0,(now-lastFrame)/1000));
    if (cruising && sectionView() && now-lastInteraction>1500 && !document.hidden) {
      const offset=camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0,1,0),dt*.095);
      camera.position.copy(controls.target).add(offset); camera.lookAt(controls.target);
    }
    if (detail && sectionView() && !reducedMotion.matches) {
      for (const fan of detail.spinners) fan.obj.rotation.x+=dt*fan.speed;
      const cars=detail.carsTunnel, m=new THREE.Matrix4();
      cars.list.forEach((car,i)=>{
        car.x=(car.x+90+dt*car.v)%180-90;
        m.makeTranslation(car.x,-3.6,car.off);
        cars.mesh.setMatrixAt(i,m);
      });
      cars.mesh.instanceMatrix.needsUpdate=true;
    }
    if (water) water.uniforms.elapsed.value=reducedMotion.matches ? 0 : now/1000;
    renderer.render(scene,camera);
    layoutLabels();
    lastFrame=now;
    if (!document.hidden && ((water && landscape.visible && view==='overview' || detail && sectionView()) && !reducedMotion.matches || cruising && sectionView())) {
      pending=requestAnimationFrame(function animate(time) {
        if (!visible) {
          pending=0;
        } else if (time-lastFrame>=33) {
          render(time);
        } else {
          pending=requestAnimationFrame(animate);
        }
      });
    }
  }

  function redraw() {
    if (!visible) return;
    if (pending) cancelAnimationFrame(pending);
    pending=requestAnimationFrame(render);
  }

  function size() {
    width=canvasHost.clientWidth;
    height=canvasHost.clientHeight;
    if (!width || !height) return;
    camera.aspect=width/height;
    camera.updateProjectionMatrix();
    renderer.setSize(width,height,false);
    redraw();
  }

  function useCamera(position,target,fieldOfView) {
    camera.position.copy(position);
    camera.fov=fieldOfView;
    camera.updateProjectionMatrix();
    controls.target.copy(target);
    controls.update();
    camera.updateMatrixWorld();
    redraw();
  }

  function updateClipping() {
    for (const m of sectionMaterials) {
      m.clippingPlanes=sectionView() ? sectionPlanes : null;
      m.clipIntersection=true;
      m.needsUpdate=true;
    }
  }

  async function loadTerrain() {
    if (terrainLoading || disposed || landscape.children.length && (!waterMesh || water)) return;
    terrainLoading=true;
    terrainStatus.hidden=!landscape.visible;
    terrainStatus.textContent='正在补载地形细节';
    try {
      if (!landscape.children.length) {
        const {scene:valley}=await loadModel('songlan-valley.glb',30000,terrainRequest.signal);
        if (disposed) { disposeMeshes(valley); return; }
        valley.traverse(node=>{
          if (!node.isMesh) return;
          node.receiveShadow=true;
          if (/songlanwater/i.test(node.name) || [].concat(node.material).some(m=>/songlanwater/i.test(m.name))) waterMesh=node;
        });
        if (detail) prepareTerrainSections(valley);
        landscape.add(valley);
        updateDetail(); updateClipping();
        renderer.shadowMap.needsUpdate=true;
        root.dataset.terrainReady='true';
        redraw();
      }
      if (waterMesh && !water) {
        const texture=await new THREE.TextureLoader().loadAsync(assetRoot+'songlan-water-normal.png');
        if (disposed) {texture.dispose();return;}
        flowMap=texture;
        flowMap.wrapS=flowMap.wrapT=THREE.RepeatWrapping;
        water=riverMaterial(flowMap);
        water.uniforms.lightTheme.value=lightTheme ? 1 : 0;
        originalWater=waterMesh.material;
        waterMesh.material=water;
        redraw();
      }
      terrainStatus.hidden=true;
    } catch (error) {
      if (disposed) return;
      terrainStatus.textContent=landscape.children.length ? '水面细节未加载 ' : '地形未加载，桥隧模型仍可查看 ';
      const retry=document.createElement('button');
      retry.type='button';retry.className='scene-retry';retry.textContent='重试';
      retry.onclick=loadTerrain;
      terrainStatus.appendChild(retry);
      terrainStatus.hidden=!landscape.visible;
    } finally {terrainLoading=false;}
  }

  function setView(name) {
    const pose=config.cameras[name];
    if (!pose) return;
    view=name;
    lastInteraction=performance.now();
    root.dataset.pilotView=name;
    sectionLines.visible=!detail && sectionView();
    updateDetail();
    updateClipping();
    renderer.shadowMap.needsUpdate=true;
    const isInterior=name==='interior';
    controls.maxDistance=isInterior ? 28 : 790;
    controls.minDistance=isInterior ? 1.3 : 9;
    tunnelLighting.visible=isInterior;
    ambient.intensity=isInterior ? .58 : 1.44;
    const fieldOfView=isInterior ? 58 : 45;
    const target=fromBlender(pose.target), eye=fromBlender(pose.position);
    if(sectionView() && width && height) {
      const distance=Math.max(1,1.55*height/width);
      eye.sub(target).multiplyScalar(distance).add(target);
    }
    useCamera(eye,target,pose.fov || fieldOfView);
    callbacks.onView?.(name);
  }

  function select(id,focus) {
    const device=devices.get(id);
    if (!device) return;
    selected=id;
    if (focus) {
      if (site ? device.inside : device.kind==='luminaire') {
        setView('interior');
        const target=fromBlender(device.position);
        useCamera(target.clone().add(new THREE.Vector3(-9,-2.8,-1.8)),target,55);
      } else {
        setView('overview');
        const target=fromBlender(device.position);
        useCamera(target.clone().add(new THREE.Vector3(-9,4,9)),target,40);
      }
    }
    selectedOutline.box.setFromObject(assetNodes.get(id));
    selectedOutline.visible=!selectedOutline.box.isEmpty();
    callbacks.onAsset?.(device);
    redraw();
  }

  function pick(event) {
    if (!pointerDown || Math.hypot(event.clientX-pointerDown.x,event.clientY-pointerDown.y)>5) return;
    const bounds=renderer.domElement.getBoundingClientRect();
    cursor.set((event.clientX-bounds.left)/bounds.width*2-1,1-(event.clientY-bounds.top)/bounds.height*2);
    raycaster.setFromCamera(cursor,camera);
    if (detail && (sectionView() || view==='interior')) {
      const hit=raycaster.intersectObjects(detail.pickables,false).find(h=>h.object.visible);
      if (hit) {
        const item=hit.object.userData;
        if (devices.has(item.code)) select(item.code,false);
        else if (item.name) callbacks.onInspect?.(item);
        return;
      }
    }
    const nearest=raycaster.intersectObject(engineering.scene,true).find(hit=>{
      for (let object=hit.object;object;object=object.parent) if (!object.visible) return false;
      return true;
    });
    for (let node=nearest?.object;node;node=node.parent) {
      const id=node.userData.assetId;
      if (devices.has(id)) {
        select(id,false);
        return;
      }
    }
  }

  renderer.domElement.addEventListener('pointerdown',event=>{pointerDown={x:event.clientX,y:event.clientY};});
  renderer.domElement.addEventListener('pointerup',pick);
  controls.addEventListener('change',redraw);
  controls.addEventListener('start',()=>{lastInteraction=Infinity;});
  controls.addEventListener('end',()=>{lastInteraction=performance.now();});
  const observer=new ResizeObserver(size);
  observer.observe(canvasHost);
  document.addEventListener('visibilitychange',redraw);
  reducedMotion.addEventListener('change',redraw);

  return {
    show(state,handlers,startOverview) {
      callbacks=handlers;
      if (!site) loadTerrain();
      visible=true;
      labelEnabled=state.labelEnabled;
      updateDetail();
      closed=Boolean(state.cases.lights?.closed);
      if (workingLed) for (const {node,off,device} of lampMeshes) node.material=(site ? !device.warning : closed) ? workingLed : off;
      const light=state.theme==='light';
      if (light!==lightTheme || startOverview) {
        lightTheme=light;
        renderer.toneMappingExposure=light ? 1.15 : 1.04;
        sunlight.intensity=light ? 2.5 : 2.3;
        if (water) water.uniforms.lightTheme.value=light ? 1 : 0;
      }
      portalTag.classList.toggle('warning',site ? Boolean(site.eventId) : !closed);
      portalTag.setAttribute('aria-label',site ? portalLabel : closed?'松岚隧道 · 已核验':'地图告警 照明回路无反馈');
      size();
      if (startOverview) {
        selected=null;
        selectedOutline.visible=false;
        callbacks.onAsset?.(null);
        setView('overview');
      } else {
        callbacks.onView?.(view);
      }
      renderer.shadowMap.needsUpdate=true;
      if (pending) cancelAnimationFrame(pending);
      render(performance.now());
    },
    hide() {
      visible=false;
      if (pending) cancelAnimationFrame(pending);
      pending=0;
    },
    dispose() {
      this.hide();
      disposed=true; terrainRequest.abort();
      observer.disconnect();
      document.removeEventListener('visibilitychange',redraw);
      reducedMotion.removeEventListener('change',redraw);
      renderer.domElement.removeEventListener('pointerup',pick);
      controls.dispose();
      const resources=new Set([flowMap,originalWater].flat().filter(Boolean));
      for(const section of groundSections) {resources.add(section.whole);resources.add(section.excavated);}
      disposeMeshes(scene,resources);
      sunlight.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvasHost.replaceChildren();
      overlay.replaceChildren();
    },
    setView,select,
    setCruise(value) {cruising=Boolean(value); if (cruising && !sectionView()) setView('cutaway'); redraw();},
    setEnvironment(value) {
      landscape.visible=Boolean(value);
      if (!value) terrainStatus.hidden=true;
      else if (terrainLoading) terrainStatus.hidden=false;
      else loadTerrain();
      scene.background.set(value ? 0xb8cade : 0x0a1424);
      scene.fog.density=value ? .00094 : 0;
      updateDetail();
      renderer.shadowMap.needsUpdate=true;
      redraw();
    },
    setLabels(value) {labelEnabled=value;updateDetail();redraw();},
    zoom(factor) {
      const offset=camera.position.clone().sub(controls.target);
      const distance=THREE.MathUtils.clamp(offset.length()*(factor>0?.81:1.24),controls.minDistance,controls.maxDistance);
      camera.position.copy(controls.target).add(offset.setLength(distance));
      controls.update();
      redraw();
    },
    cameraKey() {
      return [...camera.position,...controls.target].join(',');
    }
  };
}

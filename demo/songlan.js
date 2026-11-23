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

async function sceneAssets() {
  const loader=new GLTFLoader();
  const input=fetch(assetRoot+'songlan-engineering.json').then(response=>{
    if (!response.ok) throw new Error('未找到松岚场景设备与镜头');
    return response.json();
  });
  return Promise.all([input,loader.loadAsync(assetRoot+'songlan-engineering.glb'),
    loader.loadAsync(assetRoot+'songlan-valley.glb'),
    new THREE.TextureLoader().loadAsync(assetRoot+'songlan-water-normal.png')]);
}

export async function createSonglan(canvasHost,overlay,root) {
  const [config,engineering,valley,flowMap]=await sceneAssets();
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
  flowMap.wrapS=flowMap.wrapT=THREE.RepeatWrapping;
  const water=riverMaterial(flowMap);
  let waterMesh;
  valley.scene.traverse(node=>{
    if (!node.isMesh) return;
    const materials=Array.isArray(node.material)?node.material:[node.material];
    if (/songlanwater/i.test(node.name) || materials.some(material=>/songlanwater/i.test(material.name))) {
      node.material=water;
      waterMesh=node;
    } else {
      node.receiveShadow=true;
    }
  });
  if (!waterMesh) throw new Error('松岚河面材质未找到');

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
  scene.add(valley.scene,engineering.scene);
  const selectedOutline=new THREE.Box3Helper(new THREE.Box3(),0x67e8cf);
  selectedOutline.visible=false;
  scene.add(selectedOutline);
  const lightDevice=config.devices.find(device=>device.eventId==='lights');
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
  assetNodes.get(lightDevice.id).traverse(node=>{
    if (node.isMesh && node.material.name==='LED luminaire inactive modules') {
      lampMeshes.push({node,off:node.material});
    }
  });

  const raycaster=new THREE.Raycaster();
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const cursor=new THREE.Vector2();
  let visible=false, pending=0, lastFrame=-1000, selected=null, view='overview', lightTheme=false;
  let labelEnabled=true, closed=false, callbacks={}, width=0, height=0, pointerDown;

  const portalTag=tag(overlay,'松岚隧道 · K20+000','地图告警 照明回路无反馈',()=>callbacks.onEvent?.('lights'));
  const labels=new Map(config.devices.map(device=>[device.id,
    tag(overlay,device.label,'选中'+device.label,()=>select(device.id,false))]));

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
    for (const [id,label] of labels) {
      const device=devices.get(id);
      const inTunnel=device.kind==='luminaire';
      const shown=view==='interior' ? inTunnel && (id===selected || device.eventId==='lights') :
        !inTunnel && id===selected;
      const warning=device.eventId==='lights' && !closed;
      label.classList.toggle('warning',warning);
      project(label,device.position,labelEnabled && shown);
    }
  }

  function render(now) {
    pending=0;
    if (!visible) return;
    water.uniforms.elapsed.value=reducedMotion.matches ? 0 : now/1000;
    renderer.render(scene,camera);
    layoutLabels();
    lastFrame=now;
    if (view==='overview' && !reducedMotion.matches && !document.hidden) {
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

  function setView(name) {
    const pose=config.cameras[name];
    if (!pose) return;
    view=name;
    root.dataset.pilotView=name;
    const isInterior=name==='interior';
    controls.maxDistance=isInterior ? 28 : 790;
    controls.minDistance=isInterior ? 1.3 : 9;
    tunnelLighting.visible=isInterior;
    ambient.intensity=isInterior ? .58 : 1.44;
    const fieldOfView=isInterior ? 58 : 45;
    useCamera(fromBlender(pose.position),fromBlender(pose.target),pose.fov || fieldOfView);
    callbacks.onView?.(name);
  }

  function select(id,focus) {
    const device=devices.get(id);
    if (!device) return;
    selected=id;
    if (focus) {
      if (device.eventId==='lights') {
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
    const nearest=raycaster.intersectObject(engineering.scene,true)[0];
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
  new ResizeObserver(size).observe(canvasHost);
  document.addEventListener('visibilitychange',redraw);
  reducedMotion.addEventListener('change',redraw);

  return {
    show(state,handlers,startOverview) {
      callbacks=handlers;
      visible=true;
      labelEnabled=state.labelEnabled;
      closed=Boolean(state.cases.lights?.closed);
      if (workingLed) for (const {node,off} of lampMeshes) node.material=closed ? workingLed : off;
      const light=state.theme==='light';
      if (light!==lightTheme || startOverview) {
        lightTheme=light;
        renderer.toneMappingExposure=light ? 1.15 : 1.04;
        sunlight.intensity=light ? 2.5 : 2.3;
        water.uniforms.lightTheme.value=light ? 1 : 0;
      }
      portalTag.classList.toggle('warning',!closed);
      portalTag.setAttribute('aria-label',closed?'松岚隧道 · 已核验':'地图告警 照明回路无反馈');
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
    setView,select,
    setLabels(value) {labelEnabled=value;redraw();},
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

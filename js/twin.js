/* ============================================================
 * 数字孪生场景引擎 · Three.js r128
 * 三级场景：macro(GIS宏观路网) → road(重点路段孪生) / tunnel(隧道孪生)
 * 单 RAF 循环 · 阻尼轨道控制 · 像素比封顶 · 材质/几何复用
 * ============================================================ */
(function () {
  'use strict';
  const D = window.DB;
  const instances = [];
  const KM2X = km => (km - 29) * 10;
  const centerZ = x => 16 * Math.sin(x * 0.011) + 6 * Math.sin(x * 0.027 + 1.3);
  const riverZ = x => 44 * Math.sin(x * .016 + .5) + 23 * Math.sin(x * .029);
  const riverWidth = x => 9 + 3 * Math.cos(x * .023);
  const tunnelRidges = D.TUNNELS.map(t => ({
    x: KM2X((t.start + t.end) / 2), halfLength: (KM2X(t.end) - KM2X(t.start)) / 2
  }));

  // Build the landscape in the road's chainage coordinates so all asset anchors stay fixed.
  function landHeight(x, z) {
    const offset = z - centerZ(x);
    const foothills = THREE.MathUtils.smoothstep(Math.abs(offset), 26, 90);
    const crest = 1 - Math.abs(Math.sin(z * .032 + Math.sin(x * .024) + .36 * Math.sin(z * .061 - x * .037) + x * .008));
    const relief = 29 + 19 * Math.sin(x * .026 - z * .018) + 30 * crest;
    const detail = 4 * Math.sin(x * .13 + z * .07) + 2 * Math.cos(z * .21 - x * .15);
    let height = -.45 + foothills * (relief + detail);
    for (const ridge of tunnelRidges) {
      const dx = (x - ridge.x) / ridge.halfLength;
      const dz = (offset + 5) / 24;
      height += 30 * Math.max(0, 1 - dx * dx - dz * dz);
    }
    const bank = THREE.MathUtils.smoothstep(Math.abs(z - riverZ(x)), riverWidth(x) - 2, riverWidth(x) + 6);
    return -4 + (height + 4) * bank;
  }

  function makeRouteLandscape() {
    const group = new THREE.Group();
    const ground = new THREE.PlaneGeometry(1180, 670, 384, 216);
    ground.rotateX(-Math.PI / 2);
    const pos = ground.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, landHeight(pos.getX(i), pos.getZ(i)));
    ground.computeVertexNormals();
    const grass = new THREE.Color(0x617a49).convertSRGBToLinear();
    const rock = new THREE.Color(0xa29a85).convertSRGBToLinear();
    const shore = new THREE.Color(0x9c906f).convertSRGBToLinear();
    const tint = new THREE.Color(), colors = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = pos.getY(i);
      const slope = 1 - ground.attributes.normal.getY(i);
      const stone = THREE.MathUtils.smoothstep(slope + h * .003, .19, .55);
      tint.copy(grass).lerp(rock, stone);
      if (h < -.5) tint.lerp(shore, .8);
      tint.multiplyScalar(.93 + .08 * Math.sin(x * .4 + z * .27) + .08 * Math.cos(z * .09 - x * .17));
      colors.push(tint.r, tint.g, tint.b);
    }
    ground.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const loader = new THREE.TextureLoader();
    function tileTexture(file, along, across) {
      const texture = loader.load('assets/3d/' + file);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(along, across);
      return texture;
    }
    group.add(new THREE.Mesh(ground, new THREE.MeshStandardMaterial({
      vertexColors:true, roughness:.94, map:tileTexture('network-slope-detail.png', 25, 14),
      normalMap:tileTexture('network-rock-normal.png', 50, 28), normalScale:new THREE.Vector2(.65,.65)
    })));
    // A river ribbon follows the channel, including the crossings beneath the viaduct.
    const water = new THREE.PlaneGeometry(1180, 2, 384, 1);
    water.rotateX(-Math.PI / 2);
    const wp = water.attributes.position;
    for (let i = 0; i < wp.count; i++) {
      const x = wp.getX(i);
      wp.setXYZ(i, x, -.85, riverZ(x) + wp.getZ(i) * (riverWidth(x) + 6));
    }
    group.add(new THREE.Mesh(water, new THREE.MeshStandardMaterial({
      color:new THREE.Color(0x37686c).convertSRGBToLinear(), roughness:.36, metalness:.18,
      normalMap:tileTexture('songlan-water-normal.png', 52, 1), normalScale:new THREE.Vector2(.65,.65)
    })));
    return group;
  }

  function macroOverviewRadius(aspect) {
    // Reserve room for both endpoints at the default oblique camera angle.
    return Math.max(330, 305 * Math.cos(.5) / (Math.tan(25 * Math.PI / 180) * aspect * .92) + 130);
  }

  /* 重点路段（可下钻的道路孪生场景） */
  const ROAD_SCENES = [
    { id: 'RS-HUB', name: '青龙枢纽互通', km: 8.0, desc: '互通立交 · 情报板/摄像机密集区' },
    { id: 'RS-QL', name: '青岭隧道外路段', km: 17.2, desc: '隧道衔接段 · 洞口情报板/车速反馈' },
    { id: 'RS-NL', name: '南岭隧道外路段', km: 30.6, desc: '长下坡衔接段 · 气象检测/摄像机' }
  ];

  function labelTexture(text, color, sub, three = window.THREE) {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const fs = 30;
    ctx.font = `600 ${fs}px "Microsoft YaHei", sans-serif`;
    const w = Math.ceil(ctx.measureText(text).width) + 36;
    c.width = w; c.height = sub ? 84 : 56;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(8,26,51,0.82)';
    g.beginPath(); g.roundRect ? g.roundRect(0, 0, c.width, c.height, 10) : g.rect(0, 0, c.width, c.height); g.fill();
    g.strokeStyle = color; g.lineWidth = 2; g.stroke();
    g.font = `600 ${fs}px "Microsoft YaHei", sans-serif`;
    g.fillStyle = '#eaf2fc'; g.textBaseline = 'middle';
    g.fillText(text, 18, sub ? 26 : c.height / 2);
    if (sub) { g.font = '20px "Microsoft YaHei"'; g.fillStyle = color; g.fillText(sub, 18, 60); }
    const t = new three.CanvasTexture(c);
    t.minFilter = three.LinearFilter;
    return { tex: t, aspect: c.width / c.height };
  }
  function markerTexture(color, ring) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.beginPath(); g.arc(32, 32, 22, 0, Math.PI * 2);
    g.fillStyle = 'rgba(8,26,51,.85)'; g.fill();
    g.lineWidth = 4; g.strokeStyle = color; g.stroke();
    g.beginPath(); g.arc(32, 32, 10, 0, Math.PI * 2); g.fillStyle = color; g.fill();
    if (ring) { g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.lineWidth = 2; g.strokeStyle = ring; g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter;
    return t;
  }
  function vmsTexture(lines, accent) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 192;
    const g = c.getContext('2d');
    g.fillStyle = '#04140a'; g.fillRect(0, 0, 512, 192);
    g.strokeStyle = '#123a24'; g.lineWidth = 6; g.strokeRect(3, 3, 506, 186);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 52px "Microsoft YaHei"';
    g.fillStyle = accent || '#39ff8e';
    g.shadowColor = accent || '#39ff8e'; g.shadowBlur = 18;
    g.fillText(lines[0] || '', 256, 62);
    g.font = '600 40px "Microsoft YaHei"';
    g.fillStyle = '#ffd24a'; g.shadowColor = '#ffd24a';
    g.fillText(lines[1] || '', 256, 132);
    const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter;
    return t;
  }

  /* 共享几何/材质缓存（复用，避免重复创建） */
  const GEO = {};
  function geo(key, make) { if (!GEO[key]) GEO[key] = make(); return GEO[key]; }

  class Twin {
    constructor(el, opts) {
      this.el = el; this.opts = opts || {};
      this.mode = this.opts.mode === 'road' ? 'road' : this.opts.mode === 'tunnel' ? 'tunnel' : this.opts.mode === 'room' ? 'room' : (this.opts.mode === 'bim' ? 'tunnel' : 'macro');
      this.sceneKey = this.opts.sceneKey || (this.mode === 'tunnel' ? 'QL' : this.mode === 'room' ? 'MR-01' : 'RS-QL');
      this.time = this.opts.time || (this.mode === 'macro' ? 'day' : 'night');
      this.dead = false;
      this.layers = { monitor: true, comm: true, toll: true, power: true, tunnel: true, room: true, events: true, tasks: true };
      this.equip = { cam: true, vms: true, fan: true, light: true, power: true };
      this.labelsOn = true;
      this.traffic = this.mode === 'macro' ? 26 : 30;
      this.fogAmt = 0.5;
      this.pickables = []; this.pulses = []; this.spinners = []; this.cars = []; this.trails = [];
      this.labelSprites = []; this.equipGroups = {}; this.nightMats = []; this.dayLights = []; this.nightLights = [];
      this.clock = new THREE.Clock();
      this.lastInteract = 0;
      this.autoRotate = this.opts.autoRotate !== false;
      try { this.init(); } catch (e) { console.error('Twin init failed', e); this.fallback(); }
      instances.push(this);
      Twin.active = this;
    }
    init() {
      if (!window.THREE) throw new Error('THREE missing');
      const W = this.el.clientWidth || 800, H = this.el.clientHeight || 480;
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
      this.renderer.setSize(W, H);
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      this.renderer.domElement.className = 'twin-canvas';
      this.el.appendChild(this.renderer.domElement);
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(50, W / H, 0.5, 2600);
      const M = this.mode;
      this.target = new THREE.Vector3(0, M === 'macro' ? 4 : M === 'room' ? 1.3 : 0, M === 'room' ? -4 : 0);
      this.targetGoal = this.target.clone();
      const preset = M === 'macro' ? { r: macroOverviewRadius(this.camera.aspect), theta: 0.5, phi: 0.94 } : M === 'road' ? { r: 120, theta: 0.35, phi: 1.12 } : M === 'room' ? { r: 16, theta: 0.02, phi: 1.5 } : { r: 120, theta: 0.85, phi: 1.05 };
      this.sph = Object.assign({}, preset); this.goal = Object.assign({}, preset);
      this.rMin = M === 'macro' ? 40 : M === 'room' ? 6 : 14; this.rMax = M === 'macro' ? Math.max(720, preset.r * 1.2) : M === 'room' ? 140 : 300;
      this.buildLights();
      if (M === 'macro') this.buildMacro(); else if (M === 'road') this.buildRoad(); else if (M === 'room') this.buildRoom(); else this.buildTunnel();
      this.applyTime();
      this.applyFog();
      this.bindControls();
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(this.el);
      this.loop();
      if (this.opts.focus) setTimeout(() => this.focus(this.opts.focus), 400);
    }
    buildLights() {
      const S = this.scene;
      this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x6b5a42, 0.9); S.add(this.hemi);
      this.sun = new THREE.DirectionalLight(0xfff0d0, 1.25); this.sun.position.set(220, 320, 140); S.add(this.sun);
      this.rim = new THREE.DirectionalLight(0x7fb0ff, 0.35); this.rim.position.set(-200, 120, -180); S.add(this.rim);
      this.amb = new THREE.AmbientLight(0x22364f, 0.5); S.add(this.amb);
    }
    applyTime() {
      const day = this.time === 'day';
      const M = this.mode;
      if (M === 'macro') {
        this.scene.background = new THREE.Color(day ? (this.routeLandscape?.visible ? 0xbacbd9 : 0xc5cfda) : 0x060f22);
        this.hemi.intensity = day ? 0.7 : 0.25;
        this.hemi.color.set(day ? 0xbfd9ff : 0x2a4a7c);
        this.hemi.groundColor.set(day ? 0x8a7a5a : 0x0a1424);
        this.sun.intensity = day ? .95 : 0.18;
        this.sun.color.set(day ? 0xfff0d0 : 0x8fb4ff);
        this.rim.intensity = day ? 0.35 : 0.5;
        this.amb.intensity = day ? 0.5 : 0.4;
      } else if (M === 'road') {
        this.scene.background = new THREE.Color(day ? 0x8fb8d8 : 0x050d1e);
        this.hemi.intensity = day ? 0.9 : 0.22;
        this.hemi.color.set(day ? 0xbfd9ff : 0x24406e);
        this.hemi.groundColor.set(day ? 0x6b6b60 : 0x060d18);
        this.sun.intensity = day ? 1.2 : 0.12;
        this.sun.color.set(day ? 0xfff0d0 : 0x6f9fff);
        this.rim.intensity = day ? 0.3 : 0.55;
        this.amb.intensity = day ? 0.5 : 0.42;
      } else if (M === 'room') {
        this.scene.background = new THREE.Color(0x0a1019);
        this.hemi.intensity = 0.55; this.hemi.color.set(0x9fb8d8); this.hemi.groundColor.set(0x333a42);
        this.sun.intensity = 0.12; this.rim.intensity = 0.25; this.rim.color.set(0x7fb0ff);
        this.amb.intensity = 0.55;
        if (this.roomLightLevel != null) this.applyRoomLight();
      } else {
        this.scene.background = new THREE.Color(0x0a1424);
        this.hemi.intensity = 0.4; this.sun.intensity = 0.25; this.amb.intensity = 0.55;
      }
      // 夜间发光元素
      this.nightMats.forEach(m => { m.emissiveIntensity = day ? m.userData.dayI : m.userData.nightI; });
      if (this.windowMesh) this.windowMesh.visible = !day;
      if (this.starPoints) this.starPoints.visible = !day || M !== 'macro';
      if (this.streetHeads) this.streetHeads.forEach(h => { h.material.emissiveIntensity = day ? 0.15 : 1.6; });
      if (this.streetLights) this.streetLights.forEach(l => { l.intensity = day ? 0 : l.userData.ni; });
      this.trails.forEach(tr => { tr.mesh.material.opacity = day ? 0.5 : 0.95; });
    }
    applyFog() {
      const M = this.mode;
      const base = M === 'macro' ? [420, 1100] : M === 'road' ? [120, 420] : M === 'room' ? [45, 150] : [90, 320];
      const f = 1.6 - this.fogAmt * 1.2; // 0→1.6(清) 1→0.4(浓)
      const col = this.scene.background;
      this.scene.fog = new THREE.Fog(col.getHex(), base[0] * f, base[1] * f);
    }
    addLabel(text, color, sub, x, y, z, scale) {
      const THREE = this.three || window.THREE;
      const lb = labelTexture(text, color, sub, THREE);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: lb.tex, transparent: true, depthTest: false }));
      spr.scale.set(lb.aspect * scale, scale, 1);
      spr.position.set(x, y, z);
      this.scene.add(spr); this.labelSprites.push(spr);
      return spr;
    }
    addPulse(x, y, z, color, base) {
      const ring = new THREE.Mesh(geo('pulse', () => new THREE.RingGeometry(1, 1.5, 32)), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(x, y, z);
      this.scene.add(ring); this.pulses.push({ mesh: ring, t: Math.random() * 2, base: base || 4 });
    }
    regEquip(key, obj) {
      if (!this.equipGroups[key]) { this.equipGroups[key] = new THREE.Group(); this.scene.add(this.equipGroups[key]); }
      this.equipGroups[key].add(obj);
      return obj;
    }
    nightMat(mat, dayI, nightI) { mat.userData = { dayI, nightI }; this.nightMats.push(mat); return mat; }

    /* ================= 宏观 GIS 路网 ================= */
    buildMacro() {
      const S = this.scene;
      const r = D.rng('macro-env');
      this.routeLandscape = makeRouteLandscape();
      S.add(this.routeLandscape);
      this.routeGrid = new THREE.GridHelper(920, 92, 0x71869a, 0x99adbb);
      this.routeGrid.material.transparent = true;
      this.routeGrid.material.opacity = .42;
      this.routeGrid.position.y = -.5;
      S.add(this.routeGrid);
      this.setRouteTerrain(this.opts.terrain !== false);
      // 星空（夜）
      const starGeo = new THREE.BufferGeometry(); const sp = [];
      const rs = D.rng('stars');
      for (let i = 0; i < 400; i++) { const a = rs() * Math.PI * 2, e = rs() * Math.PI * 0.45, rad = 900 + rs() * 300; sp.push(rad * Math.cos(a) * Math.cos(e), 140 + rad * Math.sin(e) * 0.5, rad * Math.sin(a) * Math.cos(e)); }
      starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
      this.starPoints = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x9fc4e8, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.7 }));
      S.add(this.starPoints);
      // 城区高层（实例化）+ 窗光
      const hiGeo = geo('hi', () => new THREE.BoxGeometry(10, 1, 10));
      const hiMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x8f9194).convertSRGBToLinear(), roughness: 0.8 });
      const hiCount = 18;
      const hi = new THREE.InstancedMesh(hiGeo, hiMat, hiCount);
      const winGeo = geo('win', () => new THREE.BoxGeometry(10.3, 1, 10.3));
      const winMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.85 });
      const win = new THREE.InstancedMesh(winGeo, winMat, hiCount);
      const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const sc = new THREE.Vector3(); const pv = new THREE.Vector3();
      for (let i = 0; i < hiCount; i++) {
        const x = -246 + r() * 88, z = centerZ(x) - 30 - r() * 7;
        if (landHeight(x,z) < -.6) { i--; continue; }
        const h = 8 + r() * 15, base = landHeight(x,z) - 1.5;
        pv.set(x, base + h / 2, z); sc.set(.65, h, .65); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 0.4);
        m4.compose(pv, q, sc); hi.setMatrixAt(i, m4);
        pv.set(x, base + h * .55, z); sc.set(.65, h * .5, .65); m4.compose(pv, q, sc); win.setMatrixAt(i, m4);
      }
      this.routeLandscape.add(hi, win); this.windowMesh = win;
      // 民居（白墙蓝顶，实例化两层）
      const houseGeo = geo('house', () => new THREE.BoxGeometry(7, 5, 7));
      const houseMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xa49d8e).convertSRGBToLinear(), roughness: 0.85 });
      const roofGeo = geo('roof', () => new THREE.ConeGeometry(5.4, 3, 4));
      const roofMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x556675).convertSRGBToLinear(), roughness: 0.7, flatShading: true });
      const hn = 36;
      const houses = new THREE.InstancedMesh(houseGeo, houseMat, hn);
      const roofs = new THREE.InstancedMesh(roofGeo, roofMat, hn);
      for (let i = 0; i < hn; i++) {
        const side = r() > 0.5 ? 1 : -1;
        const x = -280 + r() * 560, z = centerZ(x) + side * (26 + r() * 14);
        const base = landHeight(x,z);
        if (base < -.6) { i--; continue; }
        pv.set(x, base + 2.1, z); sc.set(1, 1, 1); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI);
        m4.compose(pv, q, sc); houses.setMatrixAt(i, m4);
        pv.set(x, base + 6, z); m4.compose(pv, q, sc); roofs.setMatrixAt(i, m4);
      }
      this.routeLandscape.add(houses, roofs);
      // 树木（实例化：树干+冠）
      const trunkGeo = geo('trunk', () => new THREE.CylinderGeometry(0.35, 0.5, 3, 5));
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });
      const canopyGeo = geo('macro-crown', () => new THREE.IcosahedronGeometry(1, 0));
      const canopyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
      const tn = 1050;
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, tn);
      const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, tn);
      for (let i = 0; i < tn; i++) {
        const x = -290 + r() * 580, side = r() > 0.5 ? 1 : -1;
        const z = centerZ(x) + side * (28 + r() * 150);
        const base = landHeight(x,z);
        if (base < -.6) { i--; continue; }
        const s = 0.7 + r() * 0.8;
        pv.set(x, base + 1.5 * s, z); sc.set(s, s, s); q.identity(); m4.compose(pv, q, sc); trunks.setMatrixAt(i, m4);
        pv.set(x, base + 4 * s, z); sc.set(2.1*s, 3.7*s, 2.3*s);
        q.setFromAxisAngle(new THREE.Vector3(0,1,0), r()*Math.PI);
        m4.compose(pv, q, sc); canopies.setMatrixAt(i, m4);
        canopies.setColorAt(i, new THREE.Color().setHSL(.22+r()*.07,.25+r()*.12,.16+r()*.10).convertSRGBToLinear());
      }
      this.routeLandscape.add(trunks, canopies);
      // 高架桥面（沿中心线，高 y=8）+ 桥墩
      const deckPts = [], deckIdx = []; const N = 160;
      for (let i = 0; i <= N; i++) {
        const x = -292 + i / N * 584, z = centerZ(x);
        deckPts.push(x, 8, z - 5, x, 8, z + 5);
        if (i < N) { const a = i * 2; deckIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const dg = new THREE.BufferGeometry();
      dg.setAttribute('position', new THREE.Float32BufferAttribute(deckPts, 3));
      dg.setIndex(deckIdx); dg.computeVertexNormals();
      S.add(new THREE.Mesh(dg, new THREE.MeshStandardMaterial({ color: new THREE.Color(0x4a4b4b).convertSRGBToLinear(), roughness: 0.9 })));
      const laneMarks = [];
      for (let x = -290; x < 290; x += 6) {
        for (const offset of [-2.4,2.4]) laneMarks.push(new THREE.Vector3(x,8.08,centerZ(x)+offset), new THREE.Vector3(x+3,8.08,centerZ(x+3)+offset));
      }
      S.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(laneMarks), new THREE.LineBasicMaterial({color:0xc6c6bc})));
      // 桥面护栏
      [-5, 5].forEach(off => {
        const bp = [];
        for (let i = 0; i <= N; i++) { const x = -292 + i / N * 584; bp.push(new THREE.Vector3(x, 8.8, centerZ(x) + off)); }
        S.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(bp), new THREE.LineBasicMaterial({ color: 0xd8dade })));
      });
      // 桥墩
      const pierGeo = geo('pier', () => new THREE.BoxGeometry(2.4, 8, 2.4));
      const pierMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.9 });
      const piers = new THREE.InstancedMesh(pierGeo, pierMat, 40);
      for (let i = 0; i < 40; i++) { const x = -285 + i * 14.6; pv.set(x, 4, centerZ(x)); sc.set(1, 1, 1); q.identity(); m4.compose(pv, q, sc); piers.setMatrixAt(i, m4); }
      S.add(piers);
      // 蓝色拱桥（两处）
      [(-120), (40)].forEach(ax => {
        for (let k = 0; k < 3; k++) {
          const arch = new THREE.Mesh(new THREE.TorusGeometry(9, 0.7, 8, 24, Math.PI), new THREE.MeshStandardMaterial({ color: 0x2f6fd0, roughness: 0.5 }));
          arch.position.set(ax + k * 20, 8, centerZ(ax + k * 20));
          arch.rotation.y = Math.PI / 2;
          S.add(arch);
        }
      });
      // 地面平行道路
      const gPts = [], gIdx = [];
      for (let i = 0; i <= N; i++) {
        const x = -292 + i / N * 584, z = centerZ(x) + 16;
        gPts.push(x, 0.1, z - 4, x, 0.1, z + 4);
        if (i < N) { const a = i * 2; gIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.Float32BufferAttribute(gPts, 3));
      gg.setIndex(gIdx); gg.computeVertexNormals();
      S.add(new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.95 })));
      // 隧道山体 + 洞口 + 标签 + 下钻热区
      D.TUNNELS.forEach(t => {
        const cx = KM2X((t.start + t.end) / 2), cz = centerZ(cx);
        const len = (t.end - t.start) * 10;
        [t.start, t.end].forEach(km => {
          const x = KM2X(km), z = centerZ(x);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.6, 8, 24, Math.PI), new THREE.MeshBasicMaterial({ color: t.hero ? 0x4fd8f0 : 0x2f7bff }));
          ring.position.set(x, 8, z); ring.rotation.y = Math.PI / 2; S.add(ring);
        });
        const spr = this.addLabel(t.name, t.hero ? '#4fd8f0' : '#cfe0f5', D.kmText(t.start) + '—' + D.kmText(t.end) + ' · 点击进入隧道孪生', cx, 52, cz, 10);
        spr.userData = { kind: 'tunnel', code: t.id, name: t.name };
        this.pickables.push(spr);
        const pick = new THREE.Mesh(new THREE.BoxGeometry(len, 34, 26), new THREE.MeshBasicMaterial({ visible: false }));
        pick.position.set(cx, 14, cz);
        pick.userData = { kind: 'tunnel', code: t.id, name: t.name };
        S.add(pick); this.pickables.push(pick);
        if (t.hero) this.addPulse(cx, 8.2, cz, 0x4fd8f0, 7);
      });
      // 重点路段热区
      ROAD_SCENES.forEach(rs => {
        const x = KM2X(rs.km), z = centerZ(x);
        const spr = this.addLabel(rs.name, '#ffd24a', rs.desc + ' · 点击进入路段孪生', x, 26, z + 16, 8);
        spr.userData = { kind: 'roadsec', code: rs.id, name: rs.name };
        this.pickables.push(spr);
        const pick = new THREE.Mesh(new THREE.BoxGeometry(24, 16, 14), new THREE.MeshBasicMaterial({ visible: false }));
        pick.position.set(x, 8, z); pick.userData = { kind: 'roadsec', code: rs.id, name: rs.name };
        S.add(pick); this.pickables.push(pick);
        this.addPulse(x, 8.2, z, 0xffd24a, 5);
      });
      // 收费站
      D.TOLLS.forEach(ts => {
        const x = KM2X(ts.km), z = centerZ(x) + 16;
        const grp = new THREE.Group();
        const canopy = new THREE.Mesh(new THREE.BoxGeometry(7, 1.2, 22), new THREE.MeshStandardMaterial({ color: 0x2f6fd0, roughness: 0.6 }));
        canopy.position.set(x, 8, z); grp.add(canopy);
        [-9, -3, 3, 9].forEach(dz => {
          const p = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 8, 6), new THREE.MeshStandardMaterial({ color: 0x9aa0a6 }));
          p.position.set(x, 4, z + dz); grp.add(p);
        });
        S.add(grp);
        const spr = this.addLabel(ts.name, '#b79df7', null, x, 16, z, 6);
        spr.userData = { kind: 'toll', code: ts.id, name: ts.name }; this.pickables.push(spr);
        const pick = new THREE.Mesh(new THREE.BoxGeometry(10, 12, 24), new THREE.MeshBasicMaterial({ visible: false }));
        pick.position.set(x, 5, z); pick.userData = { kind: 'toll', code: ts.id, name: ts.name };
        S.add(pick); this.pickables.push(pick);
      });
      // 机房
      D.ROOMS.forEach(rm => {
        const x = KM2X(rm.km), z = centerZ(x) - 20;
        const b = new THREE.Mesh(new THREE.BoxGeometry(8, 7, 8), new THREE.MeshStandardMaterial({ color: 0xd8d5cc, roughness: 0.7 }));
        b.position.set(x, 3.5, z); S.add(b);
        const spr = this.addLabel(rm.name, '#cfe0f5', '点击进入机房孪生', x, 12, z, 5.5);
        spr.userData = { kind: 'room', code: rm.id, name: rm.name }; this.pickables.push(spr);
        const pick = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ visible: false }));
        pick.position.set(x, 4, z); pick.userData = { kind: 'room', code: rm.id, name: rm.name };
        S.add(pick); this.pickables.push(pick);
        if (rm.id === 'MR-01') this.addPulse(x, 0.2, z, 0x19e3ff, 5);
      });
      // 桩号
      for (const km of [0, 10, 20, 30, 40, 50, D.ROAD.end]) {
        const x = KM2X(km), z = centerZ(x);
        this.addLabel(D.kmText(km), '#5a7ba6', null, x, 1.5, z + 24, 4);
      }
      // 设备点位（专业图层）
      this.markerGroups = {};
      const texCache = {};
      const sample = D.devices.filter((d, i) => D.HERO[d.code] || i % 7 === 0);
      Object.keys(D.CATS).forEach(c => { this.markerGroups[c] = new THREE.Group(); S.add(this.markerGroups[c]); });
      sample.forEach(d => {
        const key = d.cat + '|' + d.status;
        if (!texCache[key]) {
          const col = d.status === 'offline' ? '#94a3b8' : d.status === 'warn' ? '#f59e0b' : D.CATS[d.cat].color;
          texCache[key] = markerTexture(col, d.status !== 'online' ? '#ef4444' : null);
        }
        const x = KM2X(d.km), z = centerZ(x) + (d.direction === '南向' ? 7 : -7);
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: texCache[key], transparent: true, depthTest: false }));
        const sz = D.HERO[d.code] ? 6 : 4;
        spr.scale.set(sz, sz, 1); spr.position.set(x, 11, z);
        spr.userData = { kind: 'device', code: d.code, name: d.name };
        this.markerGroups[d.cat].add(spr); this.pickables.push(spr);
      });
      // 事件光柱
      this.eventGroup = new THREE.Group(); S.add(this.eventGroup);
      D.events.filter(D.isOpenMajor).forEach((e, i) => {
        const x = KM2X(e.km), z = centerZ(x) + (i ? 9 : -9);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.6, 42, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
        beam.position.set(x, 29, z); this.eventGroup.add(beam);
        this.addPulse(x, 8.2, z, 0xef4444, 8);
        const spr = this.addLabel('⚠ ' + e.name, '#ff9d9d', e.id + ' · 影响' + e.affected.length + '台', x, 52, z, 7);
        spr.userData = { kind: 'event', code: e.id, name: e.name };
        this.eventGroup.add(spr); this.pickables.push(spr);
        const pick = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 44, 8), new THREE.MeshBasicMaterial({ visible: false }));
        pick.position.set(x, 28, z); pick.userData = { kind: 'event', code: e.id, name: e.name };
        this.eventGroup.add(pick); this.pickables.push(pick);
      });
      // 任务点
      this.taskGroup = new THREE.Group(); S.add(this.taskGroup);
      D.tasks.forEach(t => {
        const x = KM2X(t.km), z = centerZ(x) - 13;
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture('#8b5cf6'), transparent: true, depthTest: false }));
        spr.scale.set(4.5, 4.5, 1); spr.position.set(x, 10, z);
        spr.userData = { kind: 'task', code: t.id, name: t.type };
        this.taskGroup.add(spr); this.pickables.push(spr);
      });
      // 高架车流
      this.buildCars(24, x => centerZ(x), 8.7);
    }

    /* ================= 重点路段孪生（开放高速） ================= */
    buildRoad() {
      const S = this.scene;
      const L = 260, HALF = L / 2;
      const rs = ROAD_SCENES.find(x => x.id === this.sceneKey) || ROAD_SCENES[1];
      // 地面 + 网格
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 300), new THREE.MeshStandardMaterial({ color: 0x0a1424, roughness: 1 }));
      ground.rotation.x = -Math.PI / 2; ground.position.y = -6; S.add(ground);
      const grid = new THREE.GridHelper(600, 60, 0x14335c, 0x0e2544);
      grid.position.y = -5.9; grid.material.transparent = true; grid.material.opacity = 0.35; S.add(grid);
      // 星空
      const starGeo = new THREE.BufferGeometry(); const sp = []; const rr = D.rng('roadstars');
      for (let i = 0; i < 300; i++) { const a = rr() * Math.PI * 2, e = rr() * Math.PI * 0.4, rad = 500 + rr() * 200; sp.push(rad * Math.cos(a) * Math.cos(e), 80 + rad * Math.sin(e) * 0.5, rad * Math.sin(a) * Math.cos(e)); }
      starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
      this.starPoints = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x9fc4e8, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.7 }));
      S.add(this.starPoints);
      // 周边建筑剪影
      const bGeo = geo('rb', () => new THREE.BoxGeometry(12, 1, 12));
      const bMat = new THREE.MeshStandardMaterial({ color: 0x101c30, roughness: 0.9 });
      const bn = 40; const bs = new THREE.InstancedMesh(bGeo, bMat, bn);
      const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const sc = new THREE.Vector3(); const pv = new THREE.Vector3();
      const rb = D.rng('roadb');
      for (let i = 0; i < bn; i++) {
        const side = i % 2 ? 1 : -1;
        const x = -HALF + rb() * L, z = side * (30 + rb() * 60);
        const h = 10 + rb() * 26;
        pv.set(x, h / 2 - 6, z); sc.set(1, h, 1); q.identity(); m4.compose(pv, q, sc); bs.setMatrixAt(i, m4);
      }
      S.add(bs);
      // 高架桥面 + 桥墩
      const deck = new THREE.Mesh(new THREE.BoxGeometry(L, 1.2, 24), new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.95 }));
      deck.position.y = -0.6; S.add(deck);
      const pierGeo = geo('rpier', () => new THREE.BoxGeometry(2.6, 6, 2.6));
      const piers = new THREE.InstancedMesh(pierGeo, new THREE.MeshStandardMaterial({ color: 0x6f747c, roughness: 0.9 }), 14);
      for (let i = 0; i < 14; i++) { pv.set(-HALF + 8 + i * 19, -3.6, 0); sc.set(1, 1, 1); q.identity(); m4.compose(pv, q, sc); piers.setMatrixAt(i, m4); }
      S.add(piers);
      // 混凝土护栏（浅灰，两侧）
      [-12, 12].forEach(z => {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(L, 1.1, 0.7), new THREE.MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.8 }));
        bar.position.set(0, 0.55, z); S.add(bar);
      });
      // 车道虚线（实例化）
      const dashGeo = geo('rdash', () => new THREE.BoxGeometry(3, 0.06, 0.22));
      const dashMat = new THREE.MeshBasicMaterial({ color: 0xe8eef5, transparent: true, opacity: 0.85 });
      const lanesA = [-2.4, -6, -9.6], lanesB = [2.4, 6, 9.6];
      const dashCount = 4 * 40;
      const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
      let di = 0;
      [-4.2, -7.8, 4.2, 7.8].forEach(z => {
        for (let i = 0; i < 40; i++) { m4.makeTranslation(-HALF + 3 + i * 6.5, 0.03, z); dashes.setMatrixAt(di++, m4); }
      });
      S.add(dashes);
      // 边缘实线
      [-11, -0.6, 0.6, 11].forEach(z => {
        const line = new THREE.Mesh(new THREE.BoxGeometry(L, 0.06, 0.18), new THREE.MeshBasicMaterial({ color: Math.abs(z) > 5 ? 0xf5f7fa : 0xffd24a, transparent: true, opacity: 0.8 }));
        line.position.set(0, 0.03, z); S.add(line);
      });
      // 中央绿化分隔带
      const med = new THREE.Mesh(new THREE.BoxGeometry(L, 0.5, 1.4), new THREE.MeshStandardMaterial({ color: 0x2f4a2a, roughness: 1 }));
      med.position.set(0, 0.25, 0); S.add(med);
      const tGeo = geo('rt', () => new THREE.ConeGeometry(1.1, 3.4, 6));
      const tMat = new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 1, flatShading: true });
      const trees = new THREE.InstancedMesh(tGeo, tMat, 60);
      for (let i = 0; i < 60; i++) { pv.set(-HALF + 2 + i * 4.3, 2.1, 0); sc.set(1, 1, 1); q.identity(); m4.compose(pv, q, sc); trees.setMatrixAt(i, m4); }
      S.add(trees);
      // 路灯（杆+发光头+点光）
      this.streetHeads = []; this.streetLights = [];
      const poleGeo = geo('pole', () => new THREE.CylinderGeometry(0.18, 0.24, 8, 6));
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x8f959c, roughness: 0.6 });
      for (let i = 0; i < 8; i++) {
        const x = -HALF + 16 + i * 32;
        [-12, 12].forEach(z => {
          const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.set(x, 4, z); S.add(pole);
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 2.4), poleMat); arm.position.set(x, 8, z + (z > 0 ? -1.2 : 1.2)); S.add(arm);
          const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 1.4), this.nightMat(new THREE.MeshStandardMaterial({ color: 0xfff2d8, emissive: 0xffd9a0, emissiveIntensity: 1.6 }), 0.15, 1.6));
          head.position.set(x, 7.9, z + (z > 0 ? -2.3 : 2.3)); S.add(head); this.streetHeads.push(head);
          if (i % 2 === 0) { const pl = new THREE.PointLight(0xffd9a0, 0.7, 30); pl.position.set(x, 7.5, z + (z > 0 ? -2.3 : 2.3)); pl.userData = { ni: 0.7 }; S.add(pl); this.streetLights.push(pl); }
        });
      }
      // 情报板门架（VMS）
      const vmsGrp = new THREE.Group();
      const gantryMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.6 });
      [-12, 12].forEach(z => { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 8, 8), gantryMat); post.position.set(-40, 4, z); vmsGrp.add(post); });
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 25), gantryMat); beam.position.set(-40, 8, 0); vmsGrp.add(beam);
      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.4, 12), new THREE.MeshBasicMaterial({ map: vmsTexture(['前方隧道 减速慢行', '限速 80 · 开启大灯'], '#39ff8e') }));
      screen.position.set(-40, 6.2, -5); screen.rotation.y = Math.PI / 2; vmsGrp.add(screen);
      const screen2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.4, 9), new THREE.MeshBasicMaterial({ map: vmsTexture(['青岭隧道 1.8km', '货车靠右'], '#ffd24a') }));
      screen2.position.set(-40, 6.2, 6); screen2.rotation.y = Math.PI / 2; vmsGrp.add(screen2);
      screen.userData = { kind: 'device', code: 'VMS-01', name: '情报板 VMS-01（门架式）' };
      screen2.userData = { kind: 'device', code: 'VMS-02', name: '情报板 VMS-02（门架式）' };
      this.pickables.push(screen, screen2);
      this.regEquip('vms', vmsGrp);
      this.addLabel('情报板 VMS-01/02', '#39ff8e', '门架式 · 模拟发布内容', -40, 12, 0, 5);
      // 摄像机门架 + 立杆
      const camGrp = new THREE.Group();
      [-12, 12].forEach(z => { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 7, 8), gantryMat); post.position.set(20, 3.5, z); camGrp.add(post); });
      const cbeam = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 25), gantryMat); cbeam.position.set(20, 7, 0); camGrp.add(cbeam);
      [-8, -3, 3, 8].forEach((z, i) => {
        const cam = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: 0xd8dade, roughness: 0.5 }));
        cam.add(body);
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.5, 10), new THREE.MeshBasicMaterial({ color: 0x2f7bff }));
        lens.rotation.z = Math.PI / 2; lens.position.x = 0.9; cam.add(lens);
        cam.position.set(20, 6.4, z);
        cam.userData = { kind: 'device', code: 'CAM-10' + (i + 1), name: '路段摄像机 CAM-10' + (i + 1) };
        cam.traverse(o => { if (o.isMesh) { o.userData = cam.userData; this.pickables.push(o); } });
        camGrp.add(cam);
      });
      this.regEquip('cam', camGrp);
      this.addLabel('摄像机组 CAM-101~104', '#7fb0ff', '门架 + 立杆 · 车流/事件检测', 20, 11, 0, 5);
      // 路侧摄像机立杆 + 气象检测
      const poleCam = new THREE.Group();
      [(-90), (70)].forEach((x, i) => {
        const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.set(x, 4, 12); poleCam.add(pole);
        const cam = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.7), new THREE.MeshStandardMaterial({ color: 0xd8dade }));
        cam.position.set(x, 7.6, 11); cam.userData = { kind: 'device', code: 'CAM-20' + (i + 1), name: '路侧摄像机 CAM-20' + (i + 1) };
        poleCam.add(cam); this.pickables.push(cam);
      });
      const met = new THREE.Group();
      const mpole = new THREE.Mesh(poleGeo, poleMat); mpole.position.set(100, 4, -12); met.add(mpole);
      const mhead = new THREE.Mesh(new THREE.BoxGeometry(1, 1.4, 1), new THREE.MeshStandardMaterial({ color: 0xe8e6df })); mhead.position.set(100, 8, -12);
      mhead.userData = { kind: 'device', code: 'MET-01', name: '气象检测器 MET-01' }; met.add(mhead); this.pickables.push(mhead);
      this.regEquip('cam', poleCam); this.regEquip('power', met);
      // 车流光轨（头灯暖白/尾灯青绿）
      this.buildTrails(lanesA, lanesB, HALF);
      // 场景标签
      this.addLabel(rs.name + ' · 路段数字孪生', '#4fd8f0', D.kmText(rs.km) + ' · ' + rs.desc + ' · 示意模型', 0, 20, 0, 8);
      // 漂浮尘粒
      const dustGeo = new THREE.BufferGeometry(); const dp = []; const rd = D.rng('dust');
      for (let i = 0; i < 160; i++) dp.push(-HALF + rd() * L, rd() * 14, -20 + rd() * 40);
      dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
      this.dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0x6f9fff, size: 0.5, transparent: true, opacity: 0.4 }));
      S.add(this.dust);
    }
    buildTrails(lanesA, lanesB, HALF) {
      const mk = (lanes, dir, color, len) => {
        const g = geo('trail' + len, () => new THREE.BoxGeometry(len, 0.14, 0.3));
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
        const max = 40;
        const mesh = new THREE.InstancedMesh(g, mat, max);
        this.scene.add(mesh);
        const r = D.rng('trail' + dir);
        const list = [];
        for (let i = 0; i < max; i++) list.push({ x: -HALF + r() * HALF * 2, v: (24 + r() * 20) * dir, lane: lanes[i % lanes.length] });
        mesh.count = Math.min(this.traffic, max);
        this.trails.push({ mesh, list, dir, max });
      };
      mk(lanesA, 1, 0xffc46b, 7);   // 头灯暖橙
      mk(lanesB, -1, 0x39ff8e, 7);  // 尾灯青绿
    }

    /* ================= 隧道孪生（洞内机电） ================= */
    buildTunnel() {
      const THREE = this.three || window.THREE;
      const geometry = this.three ? this.sharedGeometry : geo;
      const S = this.scene;
      const L = 180;
      const t = D.TUNNELS.find(x => x.id === this.sceneKey) || D.TUNNELS[0];
      const qingling = t.id === 'QL';
      const lightingEvent = D.events.find(e => e.id === 'EV-1123-02');
      const zoneFault = qingling && lightingEvent && D.isOpenMajor(lightingEvent);
      this.tunnelFocus = new Map();
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 220), new THREE.MeshStandardMaterial({ color: 0x0a1424, roughness: 1 }));
      ground.rotation.x = -Math.PI / 2; ground.position.y = -5.6; S.add(ground);
      const grid = new THREE.GridHelper(400, 40, 0x14335c, 0x0e2544);
      grid.position.y = -5.5; grid.material.transparent = true; grid.material.opacity = 0.4; S.add(grid);
      this.draftingSurface = [ground, grid];
      // 混凝土衬砌壳体（上半圆筒）
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, L, 32, 1, true, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x8f9298, roughness: 0.9, side: THREE.BackSide }));
      shell.rotation.z = Math.PI / 2; shell.position.y = -1.5; S.add(shell);
      // 衬砌环肋
      for (let i = 0; i <= 12; i++) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(10, 0.3, 6, 28, Math.PI), new THREE.MeshStandardMaterial({ color: 0x6f747c, roughness: 0.8 }));
        rib.rotation.y = Math.PI / 2; rib.position.set(-L / 2 + i * 15, -1.5, 0); S.add(rib);
      }
      // 洞口端墙 + 光
      [-L / 2, L / 2].forEach(x => {
        const portal = new THREE.Mesh(new THREE.TorusGeometry(10, 1.2, 8, 28, Math.PI), new THREE.MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.8 }));
        portal.rotation.y = Math.PI / 2; portal.position.set(x, -1.5, 0); S.add(portal);
        const glow = new THREE.PointLight(0xbfd9ff, 0.8, 40); glow.position.set(x, 2, 0); S.add(glow);
      });
      // 路面
      const deck = new THREE.Mesh(new THREE.BoxGeometry(L, 0.6, 13), new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.95 }));
      deck.position.y = -4.6; S.add(deck);
      [-7.4, 7.4].forEach(z => {
        const walk = new THREE.Mesh(new THREE.BoxGeometry(L, 1.1, 1.8), new THREE.MeshStandardMaterial({ color: 0x9aa0a6 }));
        walk.position.set(0, -4.1, z); S.add(walk);
        const edge = new THREE.Mesh(new THREE.BoxGeometry(L, 0.12, 0.15), new THREE.MeshBasicMaterial({ color: 0x00b8d9 }));
        edge.position.set(0, -3.5, z + (z > 0 ? -0.9 : 0.9)); S.add(edge);
      });
      const dashGeo = geometry('tdash', () => new THREE.BoxGeometry(3, 0.06, 0.22));
      const dashes = new THREE.InstancedMesh(dashGeo, new THREE.MeshBasicMaterial({ color: 0xe8eef5, transparent: true, opacity: 0.8 }), 30);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < 30; i++) { m4.makeTranslation(-L / 2 + 3 + i * 6, -4.25, 0); dashes.setMatrixAt(i, m4); }
      S.add(dashes);
      [-5.8, 5.8].forEach(z => {
        const line = new THREE.Mesh(new THREE.BoxGeometry(L, 0.06, 0.2), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.7 }));
        line.position.set(0, -4.25, z); S.add(line);
      });
      // 照明分区
      this.zoneMeshes = {};
      const zones = ['Z-01', 'Z-02', 'Z-03', 'Z-04', 'Z-05', 'Z-06'];
      const zoneNames = ['入口段', '入口段', '过渡段', '中间段', '中间段', '出口段'];
      const lightGrp = new THREE.Group(); S.add(lightGrp); this.equipGroups.light = lightGrp;
      zones.forEach((z, i) => {
        const x0 = -L / 2 + i * 30 + 15;
        const bad = zoneFault && z === 'Z-03';
        const zoneSelection = { kind: qingling ? 'zone' : 'schematic', code: z, name: z + ' 照明分区（' + zoneNames[i] + '）' };
        this.tunnelFocus.set(z, x0);
        const stripMat = new THREE.MeshStandardMaterial({ color: bad ? 0x3a2a2a : 0xfff2d8, emissive: bad ? 0x220000 : 0xffd28a, emissiveIntensity: bad ? 0.15 : (i < 2 ? 1.5 : i === 2 ? 1.1 : 0.9) });
        const grp = new THREE.Group();
        [-6.2, 6.2].forEach(zz => {
          const strip = new THREE.Mesh(new THREE.BoxGeometry(26, 0.35, 0.7), stripMat);
          strip.position.set(x0, 4.6, zz); strip.rotation.x = zz > 0 ? -0.35 : 0.35;
          strip.userData = zoneSelection;
          grp.add(strip); this.pickables.push(strip);
        });
        if (!bad) {
          const glow = new THREE.Mesh(new THREE.PlaneGeometry(26, 11), new THREE.MeshBasicMaterial({ color: 0xffd28a, transparent: true, opacity: i < 2 ? 0.14 : 0.08, depthWrite: false }));
          glow.rotation.x = -Math.PI / 2; glow.position.set(x0, -4.2, 0); grp.add(glow);
          const pl = new THREE.PointLight(0xffd9a0, i < 2 ? 0.9 : 0.55, 34); pl.position.set(x0, 3, 0); grp.add(pl);
        } else {
          for (let k = 0; k < 6; k++) {
            const mk = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
            mk.position.set(x0 - 11 + k * 4.4, 4.6, k % 2 ? 6.2 : -6.2); grp.add(mk);
            this.pulses.push({ mesh: mk, t: k * 0.3, base: 1, blink: true });
          }
          const pl = new THREE.PointLight(0xff3030, 0.5, 26); pl.position.set(x0, 2, 0); grp.add(pl);
        }
        lightGrp.add(grp); this.zoneMeshes[z] = grp;
        const spr = this.addLabel(z + ' ' + zoneNames[i], bad ? '#ff9d9d' : '#ffd28a', bad ? '⚠ 18盏灯具异常' : qingling ? '照明正常' : '分区示意', x0, 12.5, 0, 5.4);
        spr.userData = zoneSelection; this.pickables.push(spr);
      });
      // 射流风机
      const fanGrp = new THREE.Group(); S.add(fanGrp); this.equipGroups.fan = fanGrp;
      for (let i = 0; i < 4; i++) {
        const x = -60 + i * 40;
        const grp = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 6, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x3a6a9c, roughness: 0.5, side: THREE.DoubleSide }));
        body.rotation.z = Math.PI / 2; grp.add(body);
        const ring1 = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.18, 8, 20), new THREE.MeshBasicMaterial({ color: 0x4fd8f0 }));
        ring1.rotation.y = Math.PI / 2; ring1.position.x = 3; grp.add(ring1);
        const ring2 = ring1.clone(); ring2.position.x = -3; grp.add(ring2);
        const blades = new THREE.Group();
        for (let b = 0; b < 4; b++) {
          const bladeGeometry = geometry('blade', () => { const g = new THREE.BoxGeometry(0.25, 2.9, 0.7); g.translate(0, 1.45, 0); return g; });
          const bl = new THREE.Mesh(bladeGeometry, new THREE.MeshStandardMaterial({ color: 0x9fc4e8, roughness: 0.4 }));
          const pivot = new THREE.Group(); pivot.add(bl); pivot.rotation.x = b * Math.PI / 2; blades.add(pivot);
        }
        grp.add(blades);
        this.spinners.push({ obj: blades, speed: 5 + i * 0.4 });
        grp.position.set(x, 6.2, i % 2 ? 2.6 : -2.6);
        const fanCode = 'JF-0' + (i + 1);
        grp.userData = qingling ? { kind: 'fan', code: fanCode, name: '射流风机 ' + fanCode } : { kind: 'schematic', name: '射流风机示意' };
        if (qingling) this.tunnelFocus.set(fanCode, x);
        fanGrp.add(grp);
        grp.traverse(o => { if (o.isMesh) { o.userData = grp.userData; this.pickables.push(o); } });
        const fanLabel = this.addLabel(qingling ? fanCode : '射流风机', '#4fd8f0', qingling ? '运行 · 30kW' : '设备示意', x, 10.2, grp.position.z, 3.6);
        fanLabel.userData = grp.userData; this.pickables.push(fanLabel);
      }
      // 按当前隧道的台账状态绘制摄像机，恢复后取消故障标记。
      const camGrp = new THREE.Group(); S.add(camGrp); this.equipGroups.cam = camGrp;
      const cameras = D.devices.filter(d => d.tunnel === t.name && d.type.includes('摄像机')).slice(0, 4);
      cameras.forEach((device, i) => {
        const x = -52 + i * 12;
        const cam = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.9), new THREE.MeshStandardMaterial({ color: 0x55606e }));
        cam.add(body);
        const lensColor = device.status === 'offline' ? 0xef4444 : device.status === 'warn' ? 0xf59e0b : 0x16a34a;
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.5, 10), new THREE.MeshBasicMaterial({ color: lensColor }));
        lens.rotation.z = Math.PI / 2; lens.position.x = 1; cam.add(lens);
        cam.position.set(x, 3.4, -7.6);
        cam.userData = { kind: 'device', code: device.code, name: device.name + ' ' + device.code + '（' + D.STATUS[device.status].name + '）' };
        this.tunnelFocus.set(device.code, x);
        camGrp.add(cam);
        cam.traverse(o => { if (o.isMesh) { o.userData = cam.userData; this.pickables.push(o); } });
        if (device.status !== 'online') this.pulses.push({ mesh: lens, t: i * 0.4, base: 1, blink: true });
      });
      // 配电/控制/检测硐室
      const powGrp = new THREE.Group(); S.add(powGrp); this.equipGroups.power = powGrp;
      const cabs = [
        { code: 'CAB-03', name: '外场机柜 CAB-03', x: -46 },
        { code: 'SW-12', name: '接入交换机 SW-12', x: -42 },
        { code: 'PDB-02', name: '照明配电柜 PDB-02', x: -8 },
        { code: 'LC-01', name: '照明控制器 LC-01', x: -4 },
        { code: 'COVI-01', name: 'CO/VI检测器', x: 20 }
      ];
      cabs.forEach(c => {
        const box = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.4, 1.4), new THREE.MeshStandardMaterial({ color: 0x24466f, roughness: 0.6 }));
        box.position.set(c.x, -2.2, 8.6);
        const device = qingling && D.byCode[c.code];
        const name = c.name.replace(' ' + c.code, '');
        box.userData = device ? { kind: 'device', code: c.code, name: c.name } : {kind:'schematic', name:name + '示意'};
        if (device) this.tunnelFocus.set(c.code, c.x);
        powGrp.add(box); this.pickables.push(box);
        const color = device ? D.STATUS[device.status].color : '#4fd8f0';
        const led = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.25, 1.45), new THREE.MeshBasicMaterial({ color }));
        led.position.set(c.x, -0.8, 8.6); powGrp.add(led);
        const cabinetLabel = this.addLabel(device ? c.code : name, color, null, c.x, 1.4, 8.6, 3.2);
        cabinetLabel.userData = box.userData; this.pickables.push(cabinetLabel);
      });
      // 紧急电话/消火栓 niches
      [-70, -10, 50].forEach((x, i) => {
        const niche = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 0.6), new THREE.MeshStandardMaterial({ color: 0xd0453a, roughness: 0.6 }));
        niche.position.set(x, -2.6, -8.4);
        niche.userData = { kind: 'schematic', name: '紧急电话/消火栓箱 ' + (i + 1) };
        powGrp.add(niche); this.pickables.push(niche);
      });
      this.addLabel(t.name + ' · 隧道数字孪生（洞内机电）', '#4fd8f0', D.kmText(t.start) + '—' + D.kmText(t.end) + ' · 长' + t.length + 'm · 示意模型', 0, 20, 0, 7.5);
      this.buildCarsTunnel(10);
    }
    buildCars(n, zFn, y) {
      const g = geo('car', () => new THREE.BoxGeometry(2.6, 1.1, 1.3));
      const mk = (color, dir, off) => {
        const mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35 }), Math.floor(n / 2));
        this.scene.add(mesh);
        const r = D.rng('cars' + dir);
        const list = [];
        for (let i = 0; i < Math.floor(n / 2); i++) list.push({ x: -290 + r() * 580, v: (14 + r() * 16) * dir, off });
        mesh.count = Math.min(Math.floor(this.traffic / 2), Math.floor(n / 2));
        this.cars.push({ mesh, list, zFn, dir, y: y || 0.75, max: Math.floor(n / 2) });
      };
      mk(0xcfe4ff, 1, -1.7); mk(0xffc46b, -1, 1.7);
    }
    buildCarsTunnel(n) {
      const THREE = this.three || window.THREE;
      const geometry = this.three ? this.sharedGeometry : geo;
      const g = geometry('tcar', () => new THREE.BoxGeometry(2.4, 1, 1.2));
      const mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0xcfe4ff, emissive: 0x88aaff, emissiveIntensity: 0.3 }), n);
      this.scene.add(mesh);
      const r = D.rng('bimcars');
      const list = [];
      for (let i = 0; i < n; i++) list.push({ x: -90 + r() * 180, v: 10 + r() * 8, off: i % 2 ? 2.9 : -2.9 });
      mesh.count = Math.min(Math.round(this.traffic / 3), n);
      this.carsTunnel = { mesh, list, max: n };
    }

    /* ================= 内场机房孪生 ================= */
    buildRoom() {
      const S = this.scene;
      const room = D.ROOMS.find(x => x.id === this.sceneKey) || D.ROOMS[0];
      const r = D.rng('room' + room.id);
      const inRoom = D.devices.filter(d => d.place === room.name);
      const racksDev = inRoom.filter(d => d.type === '应用服务器' || d.type === '存储阵列');
      const acDev = inRoom.filter(d => d.type === '精密空调');
      const upsDev = inRoom.find(d => d.type === 'UPS主机');
      const swDev = inRoom.find(d => d.type === '核心交换机');
      const envDev = inRoom.find(d => d.type === '动环监控主机');
      const batDev = D.byCode['BAT-01'] && D.byCode['BAT-01'].place === room.name ? D.byCode['BAT-01'] : null;
      // 初始化仿真状态
      this.roomSim = {
        temp: 24.6, humidity: 47, upsLoad: 62, batteryHealth: 91, pue: 1.62,
        coldAisle: 18.4, hotAisle: 32.1, filterDP: 118, cpu: 78,
        setpoint: 24, load: 0.6, light: 0.6
      };
      this.simHist = { temp: [], ups: [] };
      this._teleAcc = 0;
      this.roomLightLevel = 0.6;
      // 地面（防静电地板灰）
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 44), new THREE.MeshStandardMaterial({ color: 0x5b6570, roughness: 0.85, metalness: 0.1 }));
      floor.rotation.x = -Math.PI / 2; S.add(floor);
      // 地板网格缝
      const grid = new THREE.GridHelper(70, 35, 0x3a434d, 0x3a434d);
      grid.position.y = 0.01; grid.material.transparent = true; grid.material.opacity = 0.6; S.add(grid);
      // 冷通道发光地砖点（青色，实例化）
      const dotGeo = geo('rdot', () => new THREE.BoxGeometry(0.9, 0.04, 0.9));
      const dotMat = new THREE.MeshBasicMaterial({ color: 0x19e3ff });
      const dots = new THREE.InstancedMesh(dotGeo, dotMat, 120);
      const m4 = new THREE.Matrix4(); let di = 0;
      for (let ix = 0; ix < 15; ix++) for (let iz = 0; iz < 8; iz++) {
        m4.makeTranslation(-28 + ix * 4, 0.03, -14 + iz * 4); dots.setMatrixAt(di++, m4);
      }
      S.add(dots); this.roomDots = dots;
      // 通道虚线 + 前沿青色引导线
      const dashGeo = geo('rdash2', () => new THREE.BoxGeometry(1.4, 0.03, 0.16));
      const dashMat = new THREE.MeshBasicMaterial({ color: 0x20262c });
      const dashes = new THREE.InstancedMesh(dashGeo, dashMat, 5 * 20);
      let ai = 0;
      [-6, -2, 2, 6, 10].forEach(z => { for (let i = 0; i < 20; i++) { m4.makeTranslation(-28 + i * 3, 0.02, z); dashes.setMatrixAt(ai++, m4); } });
      S.add(dashes);
      const guide = new THREE.Mesh(new THREE.BoxGeometry(64, 0.04, 0.14), new THREE.MeshBasicMaterial({ color: 0x19e3ff }));
      guide.position.set(0, 0.03, 13); S.add(guide);
      // 墙体 + 天花（相机在机房外或顶部视角时剖切隐藏）
      const shellGrp = new THREE.Group(); S.add(shellGrp); this.roomShell = shellGrp;
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x4d5661, roughness: 0.95, side: THREE.DoubleSide });
      [[0, -22, 70, 0], [0, 22, 70, 0], [-35, 0, 44, 1], [35, 0, 44, 1]].forEach(([x, z, len, rot]) => {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(len, 6), wallMat);
        w.position.set(x, 3, z); if (rot) w.rotation.y = Math.PI / 2; shellGrp.add(w);
      });
      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(70, 44), new THREE.MeshStandardMaterial({ color: 0x39434d, roughness: 1, side: THREE.DoubleSide }));
      ceil.rotation.x = Math.PI / 2; ceil.position.y = 6; shellGrp.add(ceil);
      // 天花桥架 + 灯带
      const lightGrp = new THREE.Group(); S.add(lightGrp); this.equipGroups.light = lightGrp;
      this.roomStrips = []; this.roomPointLights = [];
      [-8, -4, 0, 4, 8].forEach(z => {
        const tray = new THREE.Mesh(new THREE.BoxGeometry(60, 0.15, 0.8), new THREE.MeshStandardMaterial({ color: 0x2a333f, roughness: 0.7 }));
        tray.position.set(0, 5.4, z); lightGrp.add(tray);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(56, 0.08, 0.3), new THREE.MeshBasicMaterial({ color: 0xbfeaff }));
        strip.position.set(0, 5.2, z + 1.6); lightGrp.add(strip); this.roomStrips.push(strip);
        const pl = new THREE.PointLight(0xbfe4ff, 0.5, 26); pl.position.set(0, 4.8, z + 1.6); lightGrp.add(pl); this.roomPointLights.push(pl);
      });
      // 机柜排（5 排 × 6 列）
      const rackBodyGeo = geo('rack', () => new THREE.BoxGeometry(1.5, 2.4, 1.1));
      const rackMat = new THREE.MeshStandardMaterial({ color: 0x1a212b, roughness: 0.55, metalness: 0.35 });
      const stripGeo = geo('rstrip', () => new THREE.BoxGeometry(1.5, 0.08, 1.12));
      const ledGeo = geo('rled', () => new THREE.BoxGeometry(0.1, 0.06, 0.02));
      const ventGeo = geo('rvent', () => new THREE.BoxGeometry(1.2, 0.5, 0.02));
      const ventMat = new THREE.MeshStandardMaterial({ color: 0x232b35, roughness: 0.8 });
      const stripMats = {
        online: new THREE.MeshBasicMaterial({ color: 0x19b8ff }),
        warn: new THREE.MeshBasicMaterial({ color: 0xf59e0b }),
        offline: new THREE.MeshBasicMaterial({ color: 0x39424c })
      };
      const ledMats = {
        g: new THREE.MeshBasicMaterial({ color: 0x39ff8e }),
        a: new THREE.MeshBasicMaterial({ color: 0xffd24a }),
        r: new THREE.MeshBasicMaterial({ color: 0xef4444 })
      };
      this.rackMeshes = [];
      const rowsZ = [-8, -4, 0, 4, 8];
      let ri = 0;
      rowsZ.forEach((z, row) => {
        for (let c = 0; c < 6; c++) {
          const x = -14 + c * 3.2 + (row % 2 ? 1.6 : 0);
          const dev = racksDev[ri % Math.max(1, racksDev.length)];
          const status = dev ? dev.status : 'online';
          const code = dev ? dev.code : ('RM-D' + ri);
          const grp = new THREE.Group();
          const body = new THREE.Mesh(rackBodyGeo, rackMat); body.position.y = 1.2; grp.add(body);
          const strip = new THREE.Mesh(stripGeo, stripMats[status] || stripMats.online); strip.position.y = 0.06; grp.add(strip);
          const vent = new THREE.Mesh(ventGeo, ventMat); vent.position.set(0, 1.5, 0.56); grp.add(vent);
          const vent2 = new THREE.Mesh(ventGeo, ventMat); vent2.position.set(0, 0.8, 0.56); grp.add(vent2);
          const leds = status === 'offline' ? ['r', 'r', 'r'] : status === 'warn' ? ['g', 'a', 'a'] : ['g', 'g', 'a'];
          leds.forEach((L, k) => { const led = new THREE.Mesh(ledGeo, ledMats[L]); led.position.set(-0.4 + k * 0.22, 2.1, 0.56); grp.add(led); });
          grp.position.set(x, 0, z);
          grp.userData = { kind: 'device', code, name: (dev ? dev.name : '机柜 ' + code), rack: true, row, col: c };
          grp.traverse(o => { if (o.isMesh) { o.userData = grp.userData; this.pickables.push(o); } });
          S.add(grp); this.rackMeshes.push({ grp, strip, status, code, row, col: c });
          ri++;
        }
      });
      // 精密空调（两端，带风机旋转 + 气流）
      const fanGrp = new THREE.Group(); S.add(fanGrp); this.equipGroups.fan = fanGrp;
      this.acUnits = [];
      [-24, 24].forEach((x, i) => {
        const dev = acDev[i];
        const grp = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 1.6), new THREE.MeshStandardMaterial({ color: 0xd8dade, roughness: 0.5 }));
        body.position.y = 1.3; grp.add(body);
        const grille = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 0.06), new THREE.MeshStandardMaterial({ color: 0x2b3138, roughness: 0.8 }));
        grille.position.set(0, 1.4, 0.83); grp.add(grille);
        const disp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.05), new THREE.MeshBasicMaterial({ color: 0x19e3ff }));
        disp.position.set(0, 2.3, 0.83); grp.add(disp);
        const blades = new THREE.Group();
        for (let b = 0; b < 3; b++) {
          const bl = new THREE.Mesh(geo('acblade', () => { const g = new THREE.BoxGeometry(0.12, 1.0, 0.3); g.translate(0, 0.5, 0); return g; }), new THREE.MeshStandardMaterial({ color: 0x9fc4e8 }));
          const piv = new THREE.Group(); piv.add(bl); piv.rotation.z = b * Math.PI * 2 / 3; blades.add(piv);
        }
        blades.position.set(0, 1.4, 0.9); blades.rotation.x = Math.PI / 2;
        grp.add(blades); this.spinners.push({ obj: blades, speed: 6 + i });
        grp.position.set(x, 0, -12);
        grp.userData = { kind: 'device', code: dev ? dev.code : 'AC-0' + (i + 1), name: dev ? dev.name : '精密空调 AC-0' + (i + 1), ac: true };
        grp.traverse(o => { if (o.isMesh) { o.userData = grp.userData; this.pickables.push(o); } });
        fanGrp.add(grp); this.acUnits.push(grp);
        this.addLabel(dev ? dev.code : 'AC-0' + (i + 1), '#7fb0ff', '精密空调 · 回风 ' + (27 + i) + '℃', x, 3.6, -12, 3.4);
      });
      // UPS + 蓄电池柜 + 配电 + 核心交换机 + 动环
      const powGrp = new THREE.Group(); S.add(powGrp); this.equipGroups.power = powGrp;
      const mkCab = (x, z, w, h, d, color, code, name, ledColor) => {
        const grp = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 }));
        body.position.y = h / 2; grp.add(body);
        const led = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.1, d + 0.02), new THREE.MeshBasicMaterial({ color: ledColor }));
        led.position.y = h * 0.8; grp.add(led);
        grp.position.set(x, 0, z);
        grp.userData = { kind: 'device', code, name };
        grp.traverse(o => { if (o.isMesh) { o.userData = grp.userData; this.pickables.push(o); } });
        powGrp.add(grp);
        this.addLabel(code, '#' + ledColor.toString(16).padStart(6, '0'), name, x, h + 1.2, z, 3.2);
        return grp;
      };
      mkCab(-24, 8, 2.2, 2.4, 1.4, 0x2a3441, upsDev ? upsDev.code : 'UPS-01', upsDev ? upsDev.name : 'UPS 主机', 0x39ff8e);
      mkCab(-20, 8, 2.6, 1.8, 1.4, 0x202833, batDev ? batDev.code : 'BAT-01', batDev ? batDev.name : 'UPS 蓄电池组', 0xf59e0b);
      mkCab(-16, 8, 1.8, 2.4, 1.2, 0x2a3441, 'PDB-R1', '机房配电柜 PDB-R1', 0x39ff8e);
      mkCab(24, 8, 1.8, 2.6, 1.2, 0x181e28, swDev ? swDev.code : 'CSW-01', swDev ? swDev.name : '核心交换机', 0x19e3ff);
      // 动环/传感（cam 图层）
      const camGrp = new THREE.Group(); S.add(camGrp); this.equipGroups.cam = camGrp;
      const envPole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2.2, 6), new THREE.MeshStandardMaterial({ color: 0x8f959c }));
      envPole.position.set(0, 1.1, 12); camGrp.add(envPole);
      const envHead = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.4), new THREE.MeshStandardMaterial({ color: 0xe8e6df }));
      envHead.position.set(0, 2.3, 12);
      envHead.userData = { kind: 'device', code: envDev ? envDev.code : 'ENV-01', name: envDev ? envDev.name : '动环监控主机 ENV-01' };
      camGrp.add(envHead); this.pickables.push(envHead);
      this.addLabel(envDev ? envDev.code : 'ENV-01', '#39ff8e', '温湿度/漏水/烟感', 0, 3.4, 12, 3.2);
      // 漏水检测绳（沿地板前沿）
      const leak = new THREE.Mesh(new THREE.BoxGeometry(60, 0.03, 0.08), new THREE.MeshBasicMaterial({ color: 0x2f7bff }));
      leak.position.set(0, 0.02, 11); camGrp.add(leak);
      // 烟感（天花）
      for (let i = 0; i < 6; i++) {
        const sm = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.12, 10), new THREE.MeshStandardMaterial({ color: 0xe8e6df }));
        sm.position.set(-25 + i * 10, 5.9, 0); camGrp.add(sm);
      }
      // 气流粒子（冷通道 cyan / 热通道 warm）
      const afGeo = new THREE.BufferGeometry(); const afp = []; const afv = [];
      const ra = D.rng('airflow');
      for (let i = 0; i < 240; i++) {
        const cold = i % 2 === 0;
        afp.push(-26 + ra() * 52, 0.3 + ra() * 2.2, cold ? (-10 + ra() * 4) : (6 + ra() * 4));
        afv.push(cold ? 1 : -1);
      }
      afGeo.setAttribute('position', new THREE.Float32BufferAttribute(afp, 3));
      this.airflow = new THREE.Points(afGeo, new THREE.PointsMaterial({ color: 0x37e0ff, size: 0.16, transparent: true, opacity: 0.7 }));
      this.airflow.visible = false; this.airflowDir = afv;
      S.add(this.airflow);
      // 热力图（地板叠加）
      const hc = document.createElement('canvas'); hc.width = hc.height = 256;
      const hg = hc.getContext('2d');
      hg.fillStyle = 'rgba(0,0,0,0)'; hg.clearRect(0, 0, 256, 256);
      const heat = (cx, cy, rad, col) => { const g = hg.createRadialGradient(cx, cy, 0, cx, cy, rad); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); hg.fillStyle = g; hg.fillRect(0, 0, 256, 256); };
      heat(70, 120, 60, 'rgba(239,68,68,.75)'); heat(150, 90, 50, 'rgba(245,158,11,.6)'); heat(200, 150, 55, 'rgba(239,68,68,.5)'); heat(110, 170, 70, 'rgba(57,224,255,.4)');
      const ht = new THREE.CanvasTexture(hc);
      this.heatPlane = new THREE.Mesh(new THREE.PlaneGeometry(64, 40), new THREE.MeshBasicMaterial({ map: ht, transparent: true, opacity: 0.85, depthWrite: false }));
      this.heatPlane.rotation.x = -Math.PI / 2; this.heatPlane.position.y = 0.06; this.heatPlane.visible = false;
      S.add(this.heatPlane);
      // 漂浮尘粒
      const dustGeo = new THREE.BufferGeometry(); const dp = []; const rd = D.rng('roomdust');
      for (let i = 0; i < 120; i++) dp.push(-30 + rd() * 60, rd() * 5, -18 + rd() * 36);
      dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
      this.dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0x37e0ff, size: 0.08, transparent: true, opacity: 0.35 }));
      S.add(this.dust);
      this.addLabel(room.name + ' · 机房数字孪生', '#19e3ff', '动环/电源/负载实时映射 · 示意模型', 0, 7.4, 0, 6);
      this.applyRoomLight();
    }
    applyRoomLight() {
      const L = this.roomLightLevel != null ? this.roomLightLevel : 0.6;
      if (this.roomStrips) this.roomStrips.forEach(s => { s.material.color.setScalar(0.35 + L * 0.65); s.material.color.multiply(new THREE.Color(0xbfeaff)); });
      if (this.roomPointLights) this.roomPointLights.forEach(p => { p.intensity = 0.35 + L * 1.05; });
      this.amb.intensity = 0.5 + L * 0.5;
    }
    setRoomParam(key, val) {
      if (!this.roomSim) return;
      if (key === 'setpoint') this.roomSim.setpoint = val;
      else if (key === 'load') this.roomSim.load = val / 100;
      else if (key === 'light') { this.roomLightLevel = val / 100; this.applyRoomLight(); }
      else if (key === 'airflow') this.airflow.visible = !!val;
      else if (key === 'heat') this.heatPlane.visible = !!val;
    }
    updateRoomSim(dt) {
      if (this.roomShell) {
        const c = this.camera.position;
        this.roomShell.visible = c.y < 5.7 && Math.abs(c.x) < 34 && Math.abs(c.z) < 21.5;
      }
      const s = this.roomSim;
      const target = s.setpoint + s.load * 6;
      s.temp += (target - s.temp) * Math.min(1, dt * 0.12);
      s.temp += Math.sin(performance.now() * 0.0004) * 0.002;
      s.humidity += (47 - s.humidity) * dt * 0.05 + Math.sin(performance.now() * 0.0003) * 0.004;
      s.upsLoad += ((s.load * 100 + 8) - s.upsLoad) * dt * 0.2;
      s.coldAisle += ((s.setpoint - 5.5) - s.coldAisle) * dt * 0.15;
      s.hotAisle += ((s.temp + 8 + s.load * 4) - s.hotAisle) * dt * 0.15;
      s.pue = 1.45 + s.load * 0.3 + (s.temp - 24) * 0.01;
      s.filterDP += dt * 0.02;
      this._teleAcc += dt;
      if (this._teleAcc >= 1) {
        this._teleAcc = 0;
        this.simHist.temp.push(s.temp); if (this.simHist.temp.length > 60) this.simHist.temp.shift();
        this.simHist.ups.push(s.upsLoad); if (this.simHist.ups.length > 60) this.simHist.ups.shift();
        if (this.opts.onTelemetry) this.opts.onTelemetry(s, this.simHist);
      }
      // 机柜负载 LED /  strips 随负载微变
      if (this.rackMeshes) {
        const hot = s.load > 0.8;
        this.rackMeshes.forEach(rk => {
          if (rk.status === 'online') rk.strip.material.color.setHex(hot ? 0x19e3ff : 0x19b8ff);
        });
      }
      // 气流漂移
      if (this.airflow && this.airflow.visible) {
        const pos = this.airflow.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          let x = pos.getX(i) + this.airflowDir[i] * dt * 3;
          if (x > 27) x = -27; if (x < -27) x = 27;
          pos.setX(i, x);
        }
        pos.needsUpdate = true;
      }
    }

    /* ================= 控制 ================= */
    bindControls() {
      const cv = this.renderer.domElement;
      this.ray = new THREE.Raycaster();
      this.pointer = new THREE.Vector2();
      let dragging = false, moved = 0, lx = 0, ly = 0, btn = 0;
      const down = ev => { dragging = true; moved = 0; lx = ev.clientX; ly = ev.clientY; btn = ev.button; this.lastInteract = performance.now(); cv.setPointerCapture && cv.setPointerCapture(ev.pointerId); };
      const move = ev => {
        if (dragging) {
          const dx = ev.clientX - lx, dy = ev.clientY - ly;
          moved += Math.abs(dx) + Math.abs(dy);
          lx = ev.clientX; ly = ev.clientY;
          this.lastInteract = performance.now();
          if (btn === 2 || ev.shiftKey) {
            const s = this.sph.r * 0.0016;
            const sin = Math.sin(this.sph.theta), cos = Math.cos(this.sph.theta);
            this.targetGoal.x -= (dx * cos) * s; this.targetGoal.z += (dx * sin) * s;
            this.targetGoal.x += (dy * sin) * s; this.targetGoal.z += (dy * cos) * s;
          } else {
            this.goal.theta -= dx * 0.005;
            this.goal.phi = Math.max(0.18, Math.min(1.48, this.goal.phi - dy * 0.004));
          }
        } else this.hover(ev);
      };
      const up = ev => { if (dragging && moved < 6) this.pick(ev); dragging = false; };
      const wheel = ev => {
        ev.preventDefault();
        this.lastInteract = performance.now();
        this.goal.r = Math.max(this.rMin, Math.min(this.rMax, this.goal.r * Math.pow(1.12, Math.sign(ev.deltaY))));
      };
      cv.addEventListener('pointerdown', down);
      cv.addEventListener('pointermove', move);
      cv.addEventListener('pointerup', up);
      cv.addEventListener('pointerleave', () => { dragging = false; this.hideTip(); });
      cv.addEventListener('wheel', wheel, { passive: false });
      cv.addEventListener('contextmenu', ev => ev.preventDefault());
      this._listeners = () => {
        cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move);
        cv.removeEventListener('pointerup', up); cv.removeEventListener('wheel', wheel);
      };
    }
    castAt(ev) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      this.ray.setFromCamera(this.pointer, this.camera);
      const hits = this.ray.intersectObjects(this.pickables.filter(p => this.visibleChain(p)), false);
      return hits[0] ? hits[0].object : null;
    }
    visibleChain(o) { let p = o; while (p) { if (!p.visible) return false; p = p.parent; } return true; }
    hover(ev) {
      const hit = this.castAt(ev);
      const tip = this.el.querySelector('.twin-tip');
      if (hit && hit.userData && hit.userData.name) {
        this.renderer.domElement.style.cursor = 'pointer';
        if (tip) {
          tip.style.display = 'block';
          tip.textContent = hit.userData.name + (hit.userData.kind === 'tunnel' || hit.userData.kind === 'roadsec' ? '（点击下钻）' : '');
          const rect = this.el.getBoundingClientRect();
          tip.style.left = (ev.clientX - rect.left + 14) + 'px';
          tip.style.top = (ev.clientY - rect.top + 10) + 'px';
        }
      } else { this.renderer.domElement.style.cursor = 'grab'; this.hideTip(); }
    }
    hideTip() { const t = this.el.querySelector('.twin-tip'); if (t) t.style.display = 'none'; }
    pick(ev) {
      const hit = this.castAt(ev);
      if (hit && hit.userData && this.opts.onSelect) this.opts.onSelect(hit.userData);
    }
    /* ---- 实时控制 API ---- */
    setTime(t) { this.time = t; if (!this.fallbackEl) { this.applyTime(); this.applyFog(); } }
    setTraffic(n) {
      this.traffic = n;
      this.trails.forEach(tr => { tr.mesh.count = Math.min(n, tr.max); });
      this.cars.forEach(c => { c.mesh.count = Math.min(Math.floor(n / 2), c.max); });
      if (this.carsTunnel) this.carsTunnel.mesh.count = Math.min(Math.round(n / 3), this.carsTunnel.max);
    }
    setFog(v) { this.fogAmt = v; if (!this.fallbackEl) this.applyFog(); }
    setLabels(on) { this.labelsOn = on; this.labelSprites.forEach(s => { s.visible = on; }); }
    setEquip(key, on) { this.equip[key] = on; if (this.equipGroups[key]) this.equipGroups[key].visible = on; }
    setQuality(q) { if (this.fallbackEl) return; const cap = q === 'low' ? 1 : q === 'high' ? 2 : 1.5; this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, cap)); this.resize(); }
    setRouteTerrain(on) {
      if (!this.routeLandscape || !this.routeGrid) return;
      this.routeLandscape.visible = on;
      this.routeGrid.visible = !on;
      if (this.scene.background) { this.applyTime(); this.applyFog(); }
    }
    setLayer(key, on) {
      this.layers[key] = on;
      if (key === 'events' && this.eventGroup) this.eventGroup.visible = on;
      else if (key === 'tasks' && this.taskGroup) this.taskGroup.visible = on;
      else if (this.markerGroups && this.markerGroups[key]) this.markerGroups[key].visible = on;
      this.applyStatusFilter();
    }
    setStatusFilter(st) { this.statusFilter = st || 'all'; this.applyStatusFilter(); }
    applyStatusFilter() {
      if (!this.markerGroups) return;
      const f = this.statusFilter || 'all';
      Object.values(this.markerGroups).forEach(g => g.children.forEach(spr => {
        const d = D.byCode[spr.userData.code];
        spr.visible = f === 'all' || (d && d.status === f);
      }));
    }
    setView(v) {
      if (this.fallbackEl) { this.fallbackMap?.resetView(); return; }
      const M = this.mode;
      if (v === 'top') { this.goal.phi = 0.22; this.goal.r = M === 'macro' ? 420 : M === 'room' ? 60 : 170; }
      else if (v === 'inside') {
        if (M === 'room') { this.targetGoal.set(0, 1.3, -4); this.goal.r = 16; this.goal.phi = 1.5; this.goal.theta = 0.02; }
        else { this.targetGoal.set(M === 'tunnel' ? -55 : -60, M === 'tunnel' ? -1 : 1, 0); this.goal.r = M === 'tunnel' ? 22 : 30; this.goal.phi = 1.32; this.goal.theta = Math.PI / 2 - 0.12; }
      }
      else if (v === 'side') { this.goal.phi = 1.35; this.goal.theta = 0.1; this.goal.r = M === 'macro' ? 200 : M === 'room' ? 30 : 90; }
      else { this.resetView(); return; }
      this.lastInteract = performance.now();
    }
    focus(code) {
      if (this.fallbackEl) return;
      const dev = D.byCode[code];
      if (dev && this.mode === 'macro') {
        const x = KM2X(dev.km);
        this.targetGoal.set(x, 8, centerZ(x)); this.goal.r = 70; this.goal.phi = 0.9;
        this.lastInteract = performance.now();
      } else if (this.mode === 'tunnel') {
        const x = this.tunnelFocus?.get(code);
        if (x != null) { this.targetGoal.set(x, 0, 0); this.goal.r = 45; this.lastInteract = performance.now(); }
      } else if (this.mode === 'room') {
        const rk = (this.rackMeshes || []).find(x => x.code === code);
        if (rk) { this.targetGoal.set(rk.grp.position.x, 1.2, rk.grp.position.z); this.goal.r = 12; this.lastInteract = performance.now(); return; }
        const map = { 'UPS-01': [-24, 8], 'BAT-01': [-20, 8], 'PDB-R1': [-16, 8], 'CSW-01': [24, 8], 'ENV-01': [0, 12], 'AC-01': [-24, -12], 'AC-02': [24, -12] };
        const dev = D.byCode[code];
        let pos = map[code];
        if (!pos && dev) { const ac = (this.acUnits || []).findIndex(u => u.userData.code === code); if (ac >= 0) pos = [ac ? 24 : -24, -12]; }
        if (pos) { this.targetGoal.set(pos[0], 1.2, pos[1]); this.goal.r = 14; this.lastInteract = performance.now(); }
      } else if (this.mode === 'road') {
        const map = { 'VMS-01': -40, 'VMS-02': -40, 'CAM-101': 20, 'CAM-102': 20, 'MET-01': 100 };
        if (map[code] != null) { this.targetGoal.set(map[code], 2, 0); this.goal.r = 45; this.lastInteract = performance.now(); }
      }
    }
    focusEvent(id) {
      if (this.fallbackEl) return;
      const e = D.events.find(x => x.id === id);
      if (e && this.mode === 'macro') {
        const x = KM2X(e.km);
        this.targetGoal.set(x, 10, centerZ(x)); this.goal.r = 85; this.goal.phi = 0.85;
        this.lastInteract = performance.now();
      }
    }
    resetView() {
      if (this.fallbackEl) { this.fallbackMap?.resetView(); return; }
      const M = this.mode;
      const p = M === 'macro' ? { r: macroOverviewRadius(this.camera.aspect), theta: 0.5, phi: 0.94 } : M === 'road' ? { r: 120, theta: 0.35, phi: 1.12 } : M === 'room' ? { r: 16, theta: 0.02, phi: 1.5 } : { r: 120, theta: 0.85, phi: 1.05 };
      this.targetGoal.set(0, M === 'macro' ? 4 : M === 'room' ? 1.3 : 0, M === 'room' ? -4 : 0);
      Object.assign(this.goal, p);
      this.lastInteract = performance.now();
    }
    topView() { this.setView('top'); }
    insideView() { this.setView('inside'); }
    randomize() {
      const r = D.rng('rnd' + Date.now());
      this.trails.forEach(tr => tr.list.forEach(c => { c.x = -130 + r() * 260; c.v = (24 + r() * 24) * tr.dir; }));
      this.cars.forEach(c => c.list.forEach(car => { car.x = -290 + r() * 580; car.v = (14 + r() * 18) * c.dir; }));
      this.lastInteract = performance.now();
    }
    screenshot() {
      this.renderer.render(this.scene, this.camera);
      return this.renderer.domElement.toDataURL('image/png');
    }
    resize() {
      if (this.dead || !this.renderer) return;
      const W = this.el.clientWidth, H = this.el.clientHeight;
      if (!W || !H) return;
      this.renderer.setSize(W, H);
      this.camera.aspect = W / H;
      this.camera.updateProjectionMatrix();
    }
    loop() {
      if (this.dead) return;
      this.raf = requestAnimationFrame(() => this.loop());
      const dt = Math.min(this.clock.getDelta(), 0.05);
      const k = 1 - Math.pow(0.0015, dt);
      this.sph.r += (this.goal.r - this.sph.r) * k;
      this.sph.theta += (this.goal.theta - this.sph.theta) * k;
      this.sph.phi += (this.goal.phi - this.sph.phi) * k;
      this.target.lerp(this.targetGoal, k);
      if (this.autoRotate && performance.now() - this.lastInteract > 5000) this.goal.theta += dt * 0.03;
      const { r, theta, phi } = this.sph;
      this.camera.position.set(
        this.target.x + r * Math.sin(phi) * Math.sin(theta),
        this.target.y + r * Math.cos(phi),
        this.target.z + r * Math.sin(phi) * Math.cos(theta)
      );
      this.camera.lookAt(this.target);
      this.pulses.forEach(p => {
        p.t += dt;
        if (p.blink) { p.mesh.material.opacity = 0.4 + Math.abs(Math.sin(p.t * 3)) * 0.6; p.mesh.material.transparent = true; return; }
        const c = (p.t % 2) / 2;
        const s = p.base * (0.4 + c * 1.4);
        p.mesh.scale.set(s, s, 1);
        p.mesh.material.opacity = 0.75 * (1 - c);
      });
      this.spinners.forEach(s => { s.obj.rotation.x += dt * s.speed; });
      const m4 = new THREE.Matrix4();
      const HALF = this.mode === 'road' ? 130 : 292;
      this.trails.forEach(tr => {
        for (let i = 0; i < tr.mesh.count; i++) {
          const car = tr.list[i];
          car.x += car.v * dt;
          if (car.x > HALF) car.x = -HALF; if (car.x < -HALF) car.x = HALF;
          m4.makeTranslation(car.x, 0.5, car.lane);
          tr.mesh.setMatrixAt(i, m4);
        }
        tr.mesh.instanceMatrix.needsUpdate = true;
      });
      this.cars.forEach(c => {
        for (let i = 0; i < c.mesh.count; i++) {
          const car = c.list[i];
          car.x += car.v * dt;
          if (car.x > 292) car.x = -292; if (car.x < -292) car.x = 292;
          m4.makeTranslation(car.x, c.y, c.zFn(car.x) + car.off);
          c.mesh.setMatrixAt(i, m4);
        }
        c.mesh.instanceMatrix.needsUpdate = true;
      });
      if (this.carsTunnel) {
        for (let i = 0; i < this.carsTunnel.mesh.count; i++) {
          const car = this.carsTunnel.list[i];
          car.x += car.v * dt;
          if (car.x > 92) car.x = -92;
          m4.makeTranslation(car.x, -3.7, car.off);
          this.carsTunnel.mesh.setMatrixAt(i, m4);
        }
        this.carsTunnel.mesh.instanceMatrix.needsUpdate = true;
      }
      if (this.dust) { this.dust.rotation.y += dt * 0.01; }
      if (this.mode === 'room') this.updateRoomSim(dt);
      this.renderer.render(this.scene, this.camera);
    }
    destroy() {
      if (this.dead) return;
      this.dead = true;
      cancelAnimationFrame(this.raf);
      this.ro && this.ro.disconnect();
      this._listeners && this._listeners();
      if (this.scene) this.scene.traverse(o => {
        if (o.geometry && !Object.values(GEO).includes(o.geometry)) o.geometry.dispose();
        if (o.material) {
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach(m => { if (m.map) m.map.dispose(); m.normalMap?.dispose(); m.dispose(); });
        }
      });
      if (this.renderer) { this.renderer.dispose(); this.renderer.domElement.remove(); }
      this.fallbackMap?.destroy();
      this.fallbackEl?.remove();
      const i = instances.indexOf(this);
      if (i >= 0) instances.splice(i, 1);
    }
    fallback() {
      if (this.renderer && this.renderer.domElement) this.renderer.domElement.remove();
      this.fallbackEl = document.createElement('div');
      this.fallbackEl.style.cssText = 'position:absolute;inset:0';
      this.el.appendChild(this.fallbackEl);
      if (this.mode !== 'macro') {
        const tunnel = this.mode === 'tunnel' && D.TUNNELS.find(t => t.id === this.sceneKey);
        const room = this.mode === 'room' && D.ROOMS.find(r => r.id === this.sceneKey);
        const road = ROAD_SCENES.find(s => s.id === this.sceneKey);
        const section = road && D.sectionOf(road.km);
        const devices = D.devices.filter(d => tunnel ? D.tunnelOf(d.km)?.id === tunnel.id : room ? d.place === room.name : section && D.sectionOf(d.km).id === section.id);
        this.fallbackEl.className = 'asset-model-fallback';
        this.fallbackEl.innerHTML = `<h3>${(tunnel || room || section)?.name || '当前场景'} · 设备档案</h3><p>当前浏览器无法显示三维模型，可按设备编码查看档案。</p>
          ${devices.map(d => `<button type="button" data-asset="${d.code}">${d.code} · ${d.name} · ${d.kmText}</button>`).join('')}`;
        this.fallbackEl.onclick = e => { const b = e.target.closest('[data-asset]'); if (b) this.opts.onSelect?.({kind:'device', code:b.dataset.asset}); };
        return;
      }
      const note = document.createElement('div');
      note.style.cssText = 'position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:8;background:rgba(8,26,51,.9);border:1px solid #f59e0b;color:#ffd28a;font-size:11px;padding:4px 10px;border-radius:6px';
      note.textContent = '当前环境不支持 WebGL，已切换二维示意模式';
      this.fallbackEl.appendChild(note);
      Twin.map2D(this.fallbackEl, this.opts);
    }
  }

  /* ---------- 2D 路段示意图（驾驶舱 / 降级） ---------- */
  Twin.map2D = function (el, opts) {
    opts = opts || {};
    const W = Math.max(el.clientWidth || 800, 360), H = opts.height || el.clientHeight || 260;
    const padX = 30, padY = 46;
    const X = km => padX + km / 58 * (W - padX * 2);
    const Y = km => H / 2 + Math.sin(km * 0.32) * (H * 0.16);
    let svg = `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block">`;
    svg += `<defs><linearGradient id="rdg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2f7bff"/><stop offset="1" stop-color="#00b8d9"/></linearGradient></defs>`;
    let d = '';
    for (let km = 0; km <= 58; km += 0.5) d += (km === 0 ? 'M' : 'L') + X(km).toFixed(1) + ',' + Y(km).toFixed(1);
    svg += `<path d="${d}" fill="none" stroke="#1c3a63" stroke-width="14" stroke-linecap="round"/>`;
    svg += `<path d="${d}" fill="none" stroke="url(#rdg)" stroke-width="3" stroke-dasharray="8,5"/>`;
    D.TUNNELS.forEach(t => {
      const x1 = X(t.start), x2 = X(t.end), y = Y((t.start + t.end) / 2);
      svg += `<rect x="${x1}" y="${y - 11}" width="${x2 - x1}" height="22" rx="10" fill="${t.hero ? 'rgba(0,184,217,.25)' : 'rgba(47,123,255,.18)'}" stroke="${t.hero ? '#4fd8f0' : '#2f7bff'}" stroke-width="1.2"/>`;
      svg += `<text x="${(x1 + x2) / 2}" y="${y - 18}" text-anchor="middle" font-size="11" fill="${t.hero ? '#7ee7fa' : '#8fb4dd'}">${t.name}</text>`;
    });
    D.TOLLS.forEach(t => {
      const x = X(t.km), y = Y(t.km);
      svg += `<rect x="${x - 4}" y="${y - 16}" width="8" height="8" fill="#8b5cf6" rx="2"/><text x="${x}" y="${y + 26}" text-anchor="middle" font-size="10" fill="#b79df7">${t.name}</text>`;
    });
    D.ROOMS.forEach(r => {
      const x = X(r.km), y = Y(r.km);
      svg += `<rect x="${x - 3.5}" y="${y + 8}" width="7" height="7" fill="#64748b" rx="1"/><text x="${x}" y="${y + 30}" text-anchor="middle" font-size="9" fill="#7e95b8">${r.name.replace('机房', '')}</text>`;
    });
    for (let km = 0; km <= 58; km += 10) svg += `<text x="${X(km)}" y="${H - 8}" text-anchor="middle" font-size="9" fill="#5a7ba6">${D.kmText(km)}</text>`;
    const sample = D.devices.filter((d, i) => D.HERO[d.code] || i % 16 === 0);
    sample.forEach(d => {
      const x = X(d.km), y = Y(d.km) + (d.direction === '南向' ? 6 : -6);
      const col = d.status === 'offline' ? '#94a3b8' : d.status === 'warn' ? '#f59e0b' : D.CATS[d.cat].color;
      svg += `<circle class="m2d-pt" data-code="${d.code}" cx="${x}" cy="${y}" r="${D.HERO[d.code] ? 4 : 2.4}" fill="${col}" stroke="#060f22" stroke-width="1" style="cursor:pointer"/>`;
    });
    D.events.filter(D.isOpenMajor).forEach((e, i) => {
      const x = X(e.km), y = Y(e.km);
      svg += `<g class="m2d-ev" data-id="${e.id}" style="cursor:pointer">
        <circle cx="${x}" cy="${y}" r="12" fill="none" stroke="#ef4444" stroke-width="1.5" opacity=".8"><animate attributeName="r" values="7;16" dur="1.6s" repeatCount="indefinite"/><animate attributeName="opacity" values=".9;0" dur="1.6s" repeatCount="indefinite"/></circle>
        <circle cx="${x}" cy="${y}" r="5.5" fill="#ef4444"/>
        <text x="${x}" y="${y - 24 - i * 14}" text-anchor="middle" font-size="10" fill="#ff9d9d">⚠ ${e.name}</text></g>`;
    });
    svg += '</svg>';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;width:100%;height:' + H + 'px;background:#0a1c38;border-radius:7px;overflow:hidden';
    wrap.innerHTML = svg;
    el.appendChild(wrap);
    wrap.querySelectorAll('.m2d-pt').forEach(c => c.addEventListener('click', () => opts.onSelect && opts.onSelect({ kind: 'device', code: c.dataset.code })));
    wrap.querySelectorAll('.m2d-ev').forEach(c => c.addEventListener('click', () => opts.onSelect && opts.onSelect({ kind: 'event', code: c.dataset.id })));
    return wrap;
  };

  /* ---------- 在线地图 · 路段态势（驾驶舱） ----------
   * 底图为真实互联网瓦片（高德路网），路线与节点为模拟数据映射。
   * 瓦片不可用时自动降级为二维示意地图。 */
  const GEO_ROUTE = [
    [120.055, 30.245], [119.950, 30.262], [119.830, 30.252], [119.720, 30.235], [119.570, 30.212],
    [119.420, 30.180], [119.280, 30.132], [119.150, 30.100], [119.000, 30.062], [118.880, 30.020]
  ];
  Twin.geoMap = function (el, opts) {
    opts = opts || {};
    const H = opts.height || 320;
    const startKm = Math.max(D.ROAD.start, opts.scope?.start);
    const endKm = Math.min(D.ROAD.end, opts.scope?.end);
    const scoped = startKm < endKm && Number.isFinite(startKm) && Number.isFinite(endKm);
    const inScope = km => !scoped || (km >= startKm && km <= endKm);
    const wrap = document.createElement('div');
    wrap.className = scoped ? 'geo-map gm-scoped' : 'geo-map';
    wrap.style.height = opts.fill ? '100%' : H + 'px';
    wrap.innerHTML =
      '<div class="gm-tiles"></div><svg class="gm-svg"></svg><div class="gm-nodes"></div>' +
      '<div class="gm-ctl"><button data-z="1" title="放大">+</button><button data-z="-1" title="缩小">−</button>' + '<button data-z="0" title="复位视图">⌂</button>' + '</div>' +
      (scoped
        ? '<div class="gm-legend"><span class="li"><i class="ln"></i>当前区间</span><span class="li"><i style="background:#35e0ff"></i>隧道</span><span class="li"><i style="background:#f2b84b"></i>设备</span><span class="li"><i style="background:#ef4444"></i>事件</span></div>'
        : '<div class="gm-legend"><span class="li"><i class="ln"></i>示范路段路线</span><span class="li"><i style="background:#35e0ff"></i>隧道</span><span class="li"><i style="background:#a78bfa"></i>收费站</span><span class="li"><i style="background:#8fa6c4"></i>机房</span><span class="li"><i style="background:#ef4444"></i>严重事件</span></div>') +
      '<div class="gm-attr">在线地图 © 高德 · 路线/节点为模拟映射</div>' +
      '<div class="gm-load">正在加载在线地图…</div>';
    el.appendChild(wrap);
    const tilesBox = wrap.querySelector('.gm-tiles');
    const svg = wrap.querySelector('.gm-svg');
    const nodesBox = wrap.querySelector('.gm-nodes');
    const loadNote = wrap.querySelector('.gm-load');
    const HOME = { z: 10, lng: 119.46, lat: 30.145 };
    let tileSize = 256;
    function fitZoom() {
      if (scoped) {
        // Double the farthest offset so an off-centre focus still includes both ends.
        const centerPoint = px(HOME.lng, HOME.lat, 256);
        let dx = 0, dy = 0;
        for (const [lng, lat] of route) {
          const [x, y] = px(lng, lat, 256);
          dx = Math.max(dx, Math.abs(x - centerPoint[0]));
          dy = Math.max(dy, Math.abs(y - centerPoint[1]));
        }
        const width = Math.max(64, wrap.clientWidth - Math.min(160, wrap.clientWidth * 0.3));
        const height = Math.max(40, (wrap.clientHeight || H) - 100);
        const level = Math.min(18, Math.log2(Math.min(width / (2 * dx || 1e-9), height / (2 * dy || 1e-9))));
        const nearest = Math.max(8, Math.round(level));
        tileSize = 256 * Math.pow(2, level - nearest);
        return nearest;
      }
      if (!opts.fill) return HOME.z;
      const rail = el.closest('.drive')?.querySelector('.drive-left');
      const sides = innerWidth > 900 && rail?.getBoundingClientRect().width || 0;
      const width = Math.max(120, wrap.clientWidth - 2 * sides - (sides ? 112 : 52));
      const longitudeSpan = Math.abs(GEO_ROUTE[0][0] - GEO_ROUTE[GEO_ROUTE.length - 1][0]);
      const height = wrap.clientHeight;
      const drive = el.closest('.drive');
      const history = drive?.querySelector('.drive-history');
      const bottom = history?.offsetParent && innerWidth > 900 ? height - history.offsetTop : 44;
      const inset = Math.max(drive?.querySelector('.drive-head')?.offsetHeight || 0, bottom);
      const usableHeight = Math.max(60, height - 2 * (inset + 16));
      const latitudes = GEO_ROUTE.map(point => point[1]);
      const latitudeSpan = (Math.max(...latitudes) - Math.min(...latitudes)) / Math.cos(HOME.lat * Math.PI / 180);
      const level = Math.min(12, Math.log2(360 / 256 * Math.min(width / longitudeSpan, usableHeight / latitudeSpan)));
      const nearest = Math.max(8, Math.round(level));
      tileSize = 256 * Math.pow(2, level - nearest);
      return nearest;
    }
    let homeView = true;
    let failed = false, loaded = 0, errs = 0;
    const cache = new Map();
    const world = () => tileSize * Math.pow(2, z);
    function px(lng, lat, w = world()) {
      const s = Math.sin(lat * Math.PI / 180);
      return [(lng + 180) / 360 * w, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * w];
    }
    function unpx(x, y) {
      const w = world(), n = Math.PI - 2 * Math.PI * y / w;
      return [x / w * 360 - 180, 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))];
    }
    // 路线密集点 + 里程累计（用于把演示 K0—K58 映射到真实路线）
    const dense = [];
    for (let i = 0; i < GEO_ROUTE.length - 1; i++) {
      const a = GEO_ROUTE[i], b = GEO_ROUTE[i + 1];
      for (let t = 0; t < 14; t++) dense.push([a[0] + (b[0] - a[0]) * t / 14, a[1] + (b[1] - a[1]) * t / 14]);
    }
    dense.push(GEO_ROUTE[GEO_ROUTE.length - 1]);
    const cum = [0];
    for (let i = 1; i < dense.length; i++) {
      const dx = (dense[i][0] - dense[i - 1][0]) * Math.cos(dense[i][1] * Math.PI / 180), dy = dense[i][1] - dense[i - 1][1];
      cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    const totalLen = cum[cum.length - 1];
    function kmLL(km) {
      const target = Math.max(0, Math.min(1, km / 58)) * totalLen;
      let i = 1; while (i < cum.length - 1 && cum[i] < target) i++;
      const f = (target - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
      return [dense[i - 1][0] + (dense[i][0] - dense[i - 1][0]) * f, dense[i - 1][1] + (dense[i][1] - dense[i - 1][1]) * f];
    }
    const route = scoped ? [kmLL(startKm), ...dense.filter((point, index) => {
      const km = cum[index] / totalLen * D.ROAD.end;
      return km > startKm && km < endKm;
    }), kmLL(endKm)] : dense;
    if (scoped) {
      const focusKm = Number.isFinite(opts.focusKm) ? Math.min(endKm, Math.max(startKm, opts.focusKm)) : (startKm + endKm) / 2;
      [HOME.lng, HOME.lat] = kmLL(focusKm);
    }
    let z = fitZoom(), center = { lng: HOME.lng, lat: HOME.lat };
    const kmLabels = scoped ? [startKm, (startKm + endKm) / 2, endKm] : [0, 10, 20, 30, 40, 50, 58];
    function view() {
      const w = Math.max(wrap.clientWidth, 200), h = wrap.clientHeight || H;
      const c = px(center.lng, center.lat);
      return { w, h, tl: [c[0] - w / 2, c[1] - h / 2] };
    }
    function fail() {
      if (failed) return;
      if (opts.fill || scoped) {
        wrap.classList.add('gm-offline');
        wrap.querySelector('.gm-attr').textContent = '路段示意 · 在线底图暂不可用';
        loadNote.style.display = 'none';
        return;
      }
      failed = true;
      clearTimeout(failTimer);
      wrap.innerHTML = '';
      const note = document.createElement('div');
      note.className = 'gm-fallback';
      note.textContent = '互联网底图暂不可用，已切换为路段示意地图';
      wrap.appendChild(note);
      Twin.map2D(wrap, { height: H - 26, onSelect: opts.onSelect });
    }
    const failTimer = setTimeout(() => { if (!loaded) fail(); }, 8000);
    function renderTiles(v) {
      const n = Math.pow(2, z);
      const x0 = Math.floor(v.tl[0] / tileSize), x1 = Math.floor((v.tl[0] + v.w) / tileSize);
      const y0 = Math.max(0, Math.floor(v.tl[1] / tileSize)), y1 = Math.min(n - 1, Math.floor((v.tl[1] + v.h) / tileSize));
      const need = new Set();
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const wx = ((x % n) + n) % n, key = z + '/' + wx + '/' + y;
        need.add(key);
        let img = cache.get(key);
        if (!img) {
          img = document.createElement('img');
          img.alt = '';
          img.draggable = false;
          img.src = 'https://webrd0' + ((wx + y) % 4 + 1) + '.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x=' + wx + '&y=' + y + '&z=' + z;
          img.addEventListener('load', () => { loaded++; loadNote.style.display = 'none'; if (wrap.classList.contains('gm-offline')) { wrap.classList.remove('gm-offline'); wrap.querySelector('.gm-attr').textContent = '在线地图 © 高德 · 路线/节点为模拟映射'; } });
          img.addEventListener('error', () => { img.style.visibility = 'hidden'; errs++; if (!loaded && errs >= 8) fail(); });
          cache.set(key, img);
          tilesBox.appendChild(img);
        }
        img.style.width = img.style.height = (tileSize + (opts.fill ? 0.5 : 0)) + 'px';
        img.style.left = (x * tileSize - v.tl[0]) + 'px';
        img.style.top = (y * tileSize - v.tl[1]) + 'px';
      }
      cache.forEach((img, key) => { if (!need.has(key)) { img.remove(); cache.delete(key); } });
    }
    function renderOverlay(v) {
      svg.setAttribute('width', v.w); svg.setAttribute('height', v.h);
      svg.setAttribute('viewBox', '0 0 ' + v.w + ' ' + v.h);
      let d = '';
      route.forEach((ll, i) => {
        const p = px(ll[0], ll[1]);
        d += (i ? 'L' : 'M') + (p[0] - v.tl[0]).toFixed(1) + ',' + (p[1] - v.tl[1]).toFixed(1);
      });
      svg.innerHTML =
        '<path d="' + d + '" fill="none" stroke="#22d3ee" stroke-opacity=".22" stroke-width="12" stroke-linecap="round"/>' +
        '<path d="' + d + '" fill="none" stroke="#0b3a55" stroke-width="6.5" stroke-linecap="round"/>' +
        '<path class="gm-flow" d="' + d + '" fill="none" stroke="#35e0ff" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="10 7"/>';
      const nodes = Array.isArray(opts.nodes) ? opts.nodes : [
        ...D.events.filter(D.isOpenMajor).map(e => ({kind:'event', code:e.id, km:e.km, label:e.name})),
        ...D.TOLLS.map(t => ({kind:'toll', code:t.id, km:t.km, label:t.name})),
        ...D.TUNNELS.map(t => ({kind:'tunnel', code:t.id, km:(t.start+t.end)/2, label:t.name, cls:t.hero ? 'hero' : ''})),
        ...D.ROOMS.map(r => ({kind:'room', code:r.id, km:r.km, label:r.name.replace('机房', '')}))
      ];
      let evIdx = 0;
      const placed = [];
      const leaders = [];
      const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      nodesBox.innerHTML = nodes.filter(n => n && Number.isFinite(n.km) && inScope(n.km)).map(n => {
        const ll = kmLL(n.km), p = px(ll[0], ll[1]);
        const x = p[0] - v.tl[0], y = p[1] - v.tl[1];
        if (x < -80 || x > v.w + 80 || y < -40 || y > v.h + 40) return '';
        let oy = n.kind === 'tunnel' ? 16 : n.kind === 'toll' ? -14 : n.kind === 'event' ? -16 - (evIdx++ % 2) * 17 : 0;
        const w = n.kind === 'room' ? 18 : n.label.length * 11 + 24, h = 18;
        const dir = (n.kind === 'toll' || n.kind === 'event') ? -1 : 1;
        for (let t = 0; t < (scoped ? Math.max(4, nodes.length) : 4); t++) {
          const rect = { x: x - w / 2, y: y + oy - h / 2, w, h };
          if (!placed.some(q => hit(rect, q))) { placed.push(rect); break; }
          oy += dir * 20;
        }
        if (scoped && Math.abs(oy) > 12) {
          const lineEnd = y + oy - Math.sign(oy) * h / 2;
          leaders.push('<line x1="' + x + '" y1="' + y + '" x2="' + x + '" y2="' + lineEnd + '" stroke="#8cabad" stroke-opacity=".65"/>');
        }
        const esc = window.UI.esc;
        return '<button class="gm-n ' + esc(n.kind) + ' ' + esc(n.cls || '') + '" style="left:' + x.toFixed(1) + 'px;top:' + (y + oy).toFixed(1) + 'px" data-kind="' + esc(n.kind) + '" data-code="' + esc(n.code) + '" title="' + esc(n.label) + '"><i></i><span>' + esc(n.label) + '</span></button>';
      }).join('') + kmLabels.map(km => {
        const ll = kmLL(km), p = px(ll[0], ll[1]);
        const x = p[0] - v.tl[0], y = p[1] - v.tl[1];
        if (x < 0 || x > v.w || y < 0 || y > v.h) return '';
        let top = y + 14;
        if (opts.fill) {
          const label = {x:x-26, y:top, w:52, h:12};
          while (placed.some(item => hit(item, label))) label.y += 13;
          top = label.y;
          placed.push(label);
        }
        return '<span class="gm-km" style="left:' + x.toFixed(1) + 'px;top:' + top.toFixed(1) + 'px">' + D.kmText(km) + '</span>';
      }).join('');
      if (leaders.length) svg.insertAdjacentHTML('beforeend', leaders.join(''));
      nodesBox.querySelectorAll('.gm-n').forEach(b => b.addEventListener('click', ev => {
        ev.stopPropagation();
        opts.onSelect && opts.onSelect({ kind: b.dataset.kind, code: b.dataset.code });
      }));
    }
    function render() {
      if (failed) return;
      const v = view();
      renderTiles(v);
      renderOverlay(v);
      if (loaded) loadNote.style.display = 'none';
    }
    let frame = 0;
    function requestMapFrame() {
      if (!frame) frame=requestAnimationFrame(()=>{
        frame=0;
        render();
      });
    }
    let drag = null;
    function onDown(ev) {
      if (!ev.isPrimary || ev.button!==0 || ev.target.closest('.gm-ctl')) return;
      drag={id:ev.pointerId,x:ev.clientX,y:ev.clientY,origin:px(center.lng,center.lat),moving:false};
      (ev.target.closest('.gm-n') || wrap).setPointerCapture(ev.pointerId);
    }
    function onMove(ev) {
      if (!drag || drag.id!==ev.pointerId) return;
      const dx=ev.clientX-drag.x, dy=ev.clientY-drag.y;
      if (!drag.moving) {
        if (Math.hypot(dx,dy)<5) return;
        drag.moving=true;
        wrap.setPointerCapture(ev.pointerId);
        wrap.classList.add('grabbing');
      }
      homeView=false;
      const [lng,lat]=unpx(drag.origin[0]-dx,drag.origin[1]-dy);
      center={lng,lat:Math.max(-80,Math.min(80,lat))};
      requestMapFrame();
    }
    function onUp(ev) {
      if (drag?.id!==ev.pointerId) return;
      drag=null;
      wrap.classList.remove('grabbing');
    }
    function zoomAt(delta, mx, my) {
      const level=Math.log2(world()/256);
      const next=Math.max(8,Math.min(scoped ? 18 : 14,level+delta));
      if (Math.abs(next-level)<0.00001) return;
      const v=view();
      const anchor=unpx(v.tl[0]+mx,v.tl[1]+my);
      homeView=false;
      z=Math.round(next);
      tileSize=256*Math.pow(2,next-z);
      const point=px(anchor[0],anchor[1]);
      const [lng,lat]=unpx(point[0]+v.w/2-mx,point[1]+v.h/2-my);
      center={lng,lat:Math.max(-80,Math.min(80,lat))};
      requestMapFrame();
    }
    function onWheel(ev) {
      ev.preventDefault();
      if (drag || !ev.deltaY) return;
      const unit=ev.deltaMode===1?16:ev.deltaMode===2?wrap.clientHeight:1;
      const delta=Math.max(-1,Math.min(1,-ev.deltaY*unit/280));
      const rect=wrap.getBoundingClientRect();
      zoomAt(delta,ev.clientX-rect.left,ev.clientY-rect.top);
    }
    wrap.addEventListener('pointerdown', onDown);
    wrap.addEventListener('pointermove', onMove);
    wrap.addEventListener('pointerup', onUp);
    wrap.addEventListener('pointercancel', onUp);
    wrap.addEventListener('wheel', onWheel, { passive: false });
    wrap.querySelectorAll('.gm-ctl button').forEach(b => b.addEventListener('click', () => {
      const dz = +b.dataset.z;
      if (dz === 0) resetView();
      else zoomAt(dz, wrap.clientWidth / 2, wrap.clientHeight / 2);
    }));
    function resetView() {
      drag = null; wrap.classList.remove('grabbing');
      homeView = true;
      tileSize = 256;
      z = fitZoom();
      center = { lng: HOME.lng, lat: HOME.lat };
      render();
    }
    const ro = new ResizeObserver(() => { if (homeView) z = fitZoom(); render(); });
    ro.observe(wrap);
    render();
    const inst = {
      resetView,
      destroy() {
        failed = true;
        clearTimeout(failTimer);
        cancelAnimationFrame(frame);
        ro.disconnect();
        cache.forEach(img => img.remove()); cache.clear();
        wrap.remove();
        const i = instances.indexOf(inst);
        if (i >= 0) instances.splice(i, 1);
      }
    };
    instances.push(inst);
    return inst;
  };

  Twin.destroyAll = function () { instances.slice().forEach(i => i.destroy()); };
  Twin.instances = instances;
  Twin.Twin = Twin;
  // Reuse the inspection model in the bridge scene without creating another camera or renderer.
  Twin.createTunnelDetail = function (three, sceneKey) {
    const cache = new Map();
    const detail = Object.assign(Object.create(Twin.prototype), {
      three, sceneKey, scene: new three.Group(), traffic: 26,
      equipGroups: {}, pickables: [], spinners: [], pulses: [], labelSprites: [],
      sharedGeometry(key, make) {
        if (!cache.has(key)) cache.set(key, make());
        return cache.get(key);
      }
    });
    detail.buildTunnel();
    return detail;
  };
  Twin.ROAD_SCENES = ROAD_SCENES;
  window.Twin = Twin;
})();

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const { lerp, smoothstep } = THREE.MathUtils;
const mainGrade = 0.75;
const crossGrade = distance => mainGrade + 12.5 * (1 - smoothstep(Math.abs(distance), 20, 188));
const grass = new THREE.Color(0x6c8052);
const stone = new THREE.Color(0xa29988);
const cameras = {
  overview: { eye: [202, 183, 255], target: [0, 6, 0] },
  top: { eye: [52, 425, 84], target: [0, 0, 0] },
  ramps: { eye: [123, 45, 137], target: [40, 7, 44] }
};

function terrainHeight(x, z) {
  const hills =
    77 * Math.exp(-(((x + 218) / 80) ** 2 + ((z - 159) / 84) ** 2)) +
    123 * Math.exp(-(((x - 235) / 97) ** 2 + ((z + 177) / 85) ** 2)) +
    54 * Math.exp(-(((x - 215) / 95) ** 2 + ((z - 205) / 93) ** 2)) +
    96 * Math.exp(-(((x + 234) / 122) ** 2 + ((z + 179) / 94) ** 2));
  const folds = Math.sin(x * 0.046 + Math.cos(z * 0.033)) * 4 +
    Math.cos(z * 0.052 - Math.sin(x * 0.039)) * 3 + Math.sin((x - z) * 0.14) * 0.9;
  const outOfValley = smoothstep(Math.min(Math.abs(x), Math.abs(z)), 22, 96);
  const outOfInterchange = smoothstep(Math.hypot(x, z), 120, 190);
  return -0.5 + outOfValley * outOfInterchange * (hills + folds);
}

function centerline(points) {
  return new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
}

function roadFrame(curve, segments) {
  const points = curve.getSpacedPoints(segments);
  return points.map((point, index) => {
    const from = points[Math.max(0, index - 1)];
    const to = points[Math.min(segments, index + 1)];
    const side = new THREE.Vector3(to.z - from.z, 0, from.x - to.x).normalize();
    return { point, side };
  });
}

function strip(frame, profile, material) {
  const vertices = [], uv = [], indices = [];
  const stride = profile.length;
  let distance = 0;
  frame.forEach(({ point, side }, index) => {
    if (index > 0) distance += point.distanceTo(frame[index - 1].point);
    profile.forEach(([offset, height], col) => {
      vertices.push(point.x + side.x * offset, point.y + height, point.z + side.z * offset);
      uv.push(col / (stride - 1), distance / 10);
      if (index === 0 || col === 0) return;
      const i = index * stride + col;
      indices.push(i - stride - 1, i - 1, i - stride, i - stride, i - 1, i);
    });
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

function createRoad(group, curve, width, materials, dashes, columns, laneCount, trim = 0) {
  const length = curve.getLength();
  const segments = Math.ceil(length / 2.7);
  const frame = roadFrame(curve, segments);
  const edge = width / 2;
  group.add(strip(frame, [[-edge, 0], [edge, 0]], materials.asphalt));
  group.add(strip(frame, [[-edge, 0], [-edge, -0.83], [edge, -0.83], [edge, 0]], materials.concrete));

  const marginSamples = Math.ceil(trim / 2.7);
  const shoulder = frame.slice(marginSamples, frame.length - marginSamples);
  for (const side of [-1, 1]) {
    const offset = side * (edge - 0.42);
    group.add(strip(shoulder, [[offset - 0.085, 0.045], [offset + 0.085, 0.045]], materials.white));
    const rim = side * (edge - 0.15);
    group.add(strip(shoulder, [[rim - 0.14, 0.55], [rim, 0.55], [rim, 0.75], [rim + 0.12, 0.75]], materials.rail));
  }

  if (laneCount === 2) {
    for (let i = 1; i + 2 < frame.length; i += 4) {
      dashes.push([frame[i].point.clone().lerp(frame[i + 2].point, 0.5), frame[i].side]);
    }
  }

  for (let along = 20; along < length - 15; along += 27) {
    const at = Math.round(along / length * segments);
    const { point, side } = frame[at];
    const atCrossing = Math.abs(point.x) <= 17 && Math.abs(point.z) <= 18;
    const ground = terrainHeight(point.x, point.z);
    if (point.y - ground < 2 || atCrossing) continue;
    columns.push({ point, side, width, ground });
  }
  return frame.map(({ point }) => point);
}

function createStructures(group, materials, columns, dashes) {
  const columnGeometry = new THREE.BoxGeometry(1, 1, 1);
  const piers = new THREE.InstancedMesh(columnGeometry, materials.concrete, columns.length);
  const caps = new THREE.InstancedMesh(columnGeometry, materials.concrete, columns.length);
  const laneDashes = new THREE.InstancedMesh(columnGeometry, materials.white, dashes.length);
  laneDashes.name = '车道标线';
  const shape = new THREE.Object3D();
  columns.forEach(({ point, side, width, ground }, index) => {
    const height = point.y - 0.9 - ground;
    shape.rotation.y = Math.atan2(-side.z, side.x);
    shape.position.set(point.x, ground + height / 2, point.z);
    shape.scale.set(width > 10 ? 3.4 : 1.8, height + 0.16, 1.9);
    shape.updateMatrix();
    piers.setMatrixAt(index, shape.matrix);
    shape.position.y = point.y - 1.03;
    shape.scale.set(width * 0.72, 0.58, 1.75);
    shape.updateMatrix();
    caps.setMatrixAt(index, shape.matrix);
  });
  dashes.forEach(([point, side], index) => {
    shape.rotation.y = Math.atan2(-side.z, side.x);
    shape.position.copy(point);
    shape.position.y += 0.055;
    shape.scale.set(0.15, 0.015, 5.1);
    shape.updateMatrix();
    laneDashes.setMatrixAt(index, shape.matrix);
  });
  group.add(piers, caps, laneDashes);
}

function addVegetation(environment, roadPoints) {
  const random = (() => {
    let state = 59281;
    return () => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  })();
  const trees = [];
  for (let i = 0; i < 2800; i++) {
    const x = (random() - 0.5) * 845, z = (random() - 0.5) * 768;
    const raised = terrainHeight(x, z);
    const density = 0.58 + 0.39 * Math.sin(x * 0.022 + z * 0.017) * Math.sin(z * 0.025 - x * 0.017);
    if (random() > density || (Math.hypot(x, z) < 140 && random() < 0.72)) continue;
    if (roadPoints.some(point => (point.x - x) ** 2 + (point.z - z) ** 2 < 17 ** 2)) continue;
    trees.push({ x, z, y: raised, size: 2.8 + random() ** 2 * 6.1, rotation: random() * Math.PI });
  }
  const bark = new THREE.MeshStandardMaterial({ color: 0x5f5541, roughness: 1 });
  const leaves = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.095, 0.16, 1, 5), bark, trees.length);
  const boughs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), leaves, trees.length * 2);
  const shape = new THREE.Object3D();
  const tint = new THREE.Color();
  trees.forEach(({ x, y, z, size, rotation }, index) => {
    shape.rotation.y = rotation;
    shape.position.set(x, y + size * 0.27, z);
    shape.scale.set(size * 0.29, size * 0.60, size * 0.29);
    shape.updateMatrix();
    trunks.setMatrixAt(index, shape.matrix);
    tint.setHSL(0.23 + random() * 0.065, 0.29 + random() * 0.15, 0.07 + random() * 0.09);
    for (let tier = 0; tier < 2; tier++) {
      shape.position.set(x + tier * size * 0.13, y + size * (0.55 + tier * 0.26), z - tier * size * 0.08);
      const spread = size * (0.3 - tier * 0.09);
      shape.scale.set(spread, size * (0.32 - tier * 0.075), spread * 0.94);
      shape.updateMatrix();
      boughs.setMatrixAt(index * 2 + tier, shape.matrix);
      boughs.setColorAt(index * 2 + tier, tint);
    }
  });
  environment.add(trunks, boughs);
}

export function createInterchange(stage, root) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  stage.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbacbd9);
  scene.fog = new THREE.FogExp2(0xbacbd9, 0.0012);
  const sky = new THREE.HemisphereLight(0xdbeeff, 0x8a8067, 2.0);
  const sun = new THREE.DirectionalLight(0xffedd1, 2.1);
  sun.position.set(-270, 185, 120);
  scene.add(sky, sun);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.45, 1600);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = 24;
  controls.maxDistance = 670;
  controls.maxPolarAngle = Math.PI * 0.48;
  let disposed = false;
  const draw = () => { if (!disposed) renderer.render(scene, camera); };
  controls.addEventListener('change', draw);

  const loader = new THREE.TextureLoader();
  const loadTexture = (file, repeatX, repeatY, color) => {
    const texture = loader.load(new URL('../assets/3d/' + file, import.meta.url), draw, undefined, () => {});
    if (color) texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return texture;
  };
  const groundTexture = loadTexture('network-ground-grass.png', 19, 19, true);
  const rockNormal = loadTexture('network-rock-normal.png', 24, 24, false);
  const asphaltTexture = loadTexture('network-asphalt.png', 1, 1, true);
  const materials = {
    asphalt: new THREE.MeshStandardMaterial({ color: 0x66686a, map: asphaltTexture, roughness: 0.94, side: THREE.DoubleSide }),
    concrete: new THREE.MeshStandardMaterial({ color: 0xb6af9d, roughness: 0.88, side: THREE.DoubleSide }),
    rail: new THREE.MeshStandardMaterial({ color: 0xa7adae, metalness: 0.36, roughness: 0.56, side: THREE.DoubleSide }),
    white: new THREE.MeshStandardMaterial({ color: 0xfff7d9, roughness: 0.85, side: THREE.DoubleSide })
  };

  const environment = new THREE.Group();
  environment.name = '丘陵地形与林地';
  const terrain = new THREE.PlaneGeometry(970, 870, 231, 211);
  terrain.rotateX(-Math.PI / 2);
  const position = terrain.attributes.position;
  const vertexColors = [];
  const tint = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i);
    const height = terrainHeight(x, z);
    position.setY(i, height);
    const slope = Math.hypot(terrainHeight(x + 2, z) - height, terrainHeight(x, z + 2) - height) / 2;
    tint.copy(grass).lerp(stone, smoothstep(slope + 0.15 * Math.sin(x * 0.16 + z * 0.09), 0.20, 0.83));
    tint.multiplyScalar(0.76 + 0.20 * Math.sin(x * 0.057 + z * 0.025) ** 2 + 0.18 * Math.cos(z * 0.072) ** 2);
    vertexColors.push(tint.r, tint.g, tint.b);
  }
  terrain.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
  terrain.computeVertexNormals();
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0xf5f3e9, vertexColors: true, roughness: 1,
    map: groundTexture, normalMap: rockNormal, normalScale: new THREE.Vector2(0.42, 0.42)
  });
  environment.add(new THREE.Mesh(terrain, groundMaterial));
  scene.add(environment);

  const structures = new THREE.Group();
  structures.name = '立交主线、跨线桥与互通匝道';
  scene.add(structures);
  const columns = [], dashes = [], roadPoints = [];
  const addRoad = (points, width, laneCount, trim) => {
    const frame = createRoad(structures, centerline(points), width, materials, dashes, columns, laneCount, trim);
    roadPoints.push(...frame);
  };

  for (const lane of [-8.6, 8.6]) {
    addRoad([[-440, mainGrade, lane], [0, mainGrade, lane], [440, mainGrade, lane]], 14, 2);
    const points = Array.from({ length: 47 }, (_, i) => {
      const z = -414 + 18 * i;
      return [lane, crossGrade(z), z];
    });
    addRoad(points, 14, 2);
  }

  const direct = [[-179, 8.6], [-154, 15], [-137, 36], [-119, 70], [-93, 99], [-60, 125], [-26, 145], [-12, 167], [-8.6, 193]];
  const loop = [[34, 8.6], [63, 12], [84, 26], [92, 49], [82, 72], [61, 83], [38, 79], [20, 62], [11.5, 45], [8.6, 27]];
  for (let quadrant = 0; quadrant < 4; quadrant++) {
    const angle = quadrant * Math.PI / 2;
    const c = Math.round(Math.cos(angle)), s = Math.round(Math.sin(angle));
    for (const path of [direct, loop]) {
      const points = path.map(([x, z], index) => {
        const t = smoothstep(index / (path.length - 1), 0.08, 0.97);
        const y = quadrant % 2 ? lerp(crossGrade(x), mainGrade, t) : lerp(mainGrade, crossGrade(z), t);
        return [x * c - z * s, y, x * s + z * c];
      });
      addRoad(points, 6.7, 1, 15);
    }
  }
  createStructures(structures, materials, columns, dashes);
  addVegetation(environment, roadPoints);

  const resize = () => {
    const { clientWidth: width, clientHeight: height } = stage;
    if (width === 0 || height === 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    draw();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(stage);

  const setView = name => {
    const { eye, target } = cameras[name] || cameras.overview;
    camera.position.fromArray(eye);
    controls.target.fromArray(target);
    controls.update();
    draw();
  };
  setView('overview');
  resize();
  root.dataset.terrainReady = 'true';

  return {
    setView,
    setEnvironment(visible) {
      environment.visible = visible;
      draw();
    },
    zoom(direction) {
      const offset = camera.position.clone().sub(controls.target);
      offset.setLength(THREE.MathUtils.clamp(offset.length() * (direction > 0 ? 0.82 : 1.22), controls.minDistance, controls.maxDistance));
      camera.position.copy(controls.target).add(offset);
      controls.update();
      draw();
    },
    dispose() {
      disposed = true;
      observer.disconnect();
      controls.dispose();
      const geometries = new Set(), sceneMaterials = new Set();
      scene.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) sceneMaterials.add(object.material);
      });
      geometries.forEach(geometry => geometry.dispose());
      sceneMaterials.forEach(material => material.dispose());
      [groundTexture, rockNormal, asphaltTexture].forEach(texture => texture.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    }
  };
}

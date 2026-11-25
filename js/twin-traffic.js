(function () {
  'use strict';
  const THREE = window.THREE;
  const linear = color => new THREE.Color(color).convertSRGBToLinear();

  function panels(faces) {
    const positions = [];
    for (const [a, b, c, d] of faces) positions.push(...a, ...b, ...c, ...a, ...c, ...d);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return geometry;
  }

  function bodyGeometry() {
    const sections = [
      [-1.64, .48, .25, .45], [-1.49, .66, .20, .57], [-.97, .71, .21, .64], [-.63, .72, .21, .63],
      [.54, .73, .21, .62], [.94, .70, .2, .55], [1.43, .65, .22, .49], [1.62, .48, .26, .40]
    ].map(([x, width, sill, hood]) => [
      [x, sill, -width * .82], [x, sill + .055, -width], [x, hood - .09, -width],
      [x, hood, -width * .82], [x, hood, width * .82], [x, hood - .09, width],
      [x, sill + .055, width], [x, sill, width * .82]
    ]);
    const faces = [];
    sections.slice(1).forEach((next, index) => {
      const previous = sections[index];
      for (let i = 1; i < previous.length; i++) {
        faces.push([previous[i - 1], previous[i], next[i], next[i - 1]]);
      }
    });
    for (const end of [sections[0], sections[sections.length - 1]]) {
      faces.push([end[0], end[1], end[2], end[3]], [end[0], end[3], end[4], end[7]], [end[4], end[5], end[6], end[7]]);
    }
    const roof = [[-.49, 1.126, -.44], [.26, 1.126, -.43], [.26, 1.126, .43], [-.49, 1.126, .44]];
    const frame = [[-.96, .63, -.577], [.67, .612, -.565], [.67, .612, .565], [-.96, .63, .577]];
    faces.push(roof);
    for (let i = 0; i < roof.length; i++) {
      const next = (i + 1) % roof.length;
      faces.push([frame[i], frame[next], roof[next], roof[i]]);
    }
    return panels(faces);
  }

  function glassGeometry() {
    const faces = [
      [[.64, .657, -.532], [.64, .657, .532], [.291, 1.104, .402], [.291, 1.104, -.402]],
      [[-.92, .685, -.539], [-.92, .685, .539], [-.519, 1.104, .41], [-.519, 1.104, -.41]]
    ];
    for (const side of [-1, 1]) {
      faces.push(
        [[-.884, .682, side * .572], [-.179, .677, side * .57], [-.199, 1.098, side * .454], [-.467, 1.098, side * .458]],
        [[-.112, .677, side * .569], [.575, .674, side * .56], [.251, 1.098, side * .448], [-.121, 1.098, side * .455]]
      );
    }
    return panels(faces);
  }

  function create(scene, road, capacity) {
    const group = new THREE.Group();
    group.name = '路网小客车';
    scene.add(group);
    function material(color, roughness, metalness = 0) {
      return new THREE.MeshStandardMaterial({ color: linear(color), roughness, metalness, side: THREE.DoubleSide });
    }
    function part(name, geometry, appearance) {
      const mesh = new THREE.InstancedMesh(geometry, appearance, capacity);
      mesh.name = name;
      mesh.frustumCulled = false;
      group.add(mesh);
      return mesh;
    }
    const body = part('车身', bodyGeometry(), material(0xffffff, .32, .24));
    body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    part('车窗', glassGeometry(), material(0x334657, .23, .28));
    const tire = material(0x25292b, .93), hub = material(0x8d9598, .45, .62);
    for (const x of [-.99, .96]) {
      for (const side of [-1, 1]) {
        const wheel = new THREE.CylinderGeometry(.252, .252, .183, 12).rotateX(Math.PI / 2);
        part('车轮', wheel.translate(x, .254, side * .656), tire);
        const rim = new THREE.CylinderGeometry(.143, .148, .023, 10).rotateX(Math.PI / 2);
        part('轮毂', rim.translate(x, .254, side * .754), hub);
      }
    }
    const head = material(0xe8e4cf, .29), tail = material(0xb62f30, .41);
    head.emissive.set(0xffead0).multiplyScalar(.27);
    tail.emissive.set(0xdb313c).multiplyScalar(.16);
    for (const side of [-1, 1]) {
      part('车灯', new THREE.BoxGeometry(.068, .075, .24).translate(1.516, .395, .451 * side), head);
      part('尾灯', new THREE.BoxGeometry(.073, .084, .256).translate(-1.523, .49, .47 * side), tail);
    }
    part('进气格栅', new THREE.BoxGeometry(.038, .106, .48).translate(1.626, .319, 0), tire);
    for (const mesh of group.children) mesh.instanceMatrix = body.instanceMatrix;

    const palette = [0xd8dad5, 0x456379, 0x863d36, 0x6e787e, 0xc7b79f, 0x394740, 0xabb8be, 0x34404e].map(linear);
    const lanes = [1.83, -1.83, 4.81, -4.81];
    const length = road.trafficExtent * 2;
    const spacing = length / Math.ceil(capacity / lanes.length);
    const cars = Array.from({ length: capacity }, (_, i) => {
      const lane = i % lanes.length;
      const offset = lanes[lane], direction = Math.sign(offset);
      body.setColorAt(i, palette[(i + Math.floor(i / 4)) % palette.length]);
      return { lane, offset, direction, x: 0, speed: (Math.abs(offset) < 3 ? 17.5 : 14.8) * direction };
    });
    const matrix = new THREE.Matrix4();
    const wrap = x => THREE.MathUtils.euclideanModulo(x + road.trafficExtent, length) - road.trafficExtent;
    let count = 0;
    function advance(dt) {
      for (let i = 0; i < count; i++) {
        const car = cars[i];
        car.x = wrap(car.x + car.speed * dt);
        road.trafficMatrix(car.x, car.offset, car.direction, matrix);
        body.setMatrixAt(i, matrix);
      }
      body.instanceMatrix.needsUpdate = true;
    }
    function setCount(value) {
      count = Math.max(0, Math.min(Math.floor(value), capacity));
      group.children.forEach(mesh => { mesh.count = count; });
      advance(0);
    }
    function randomize(rng) {
      const phase = lanes.map(() => rng() * length);
      cars.forEach((car, i) => { car.x = wrap(phase[car.lane] + (Math.floor(i / lanes.length) + rng() * .33) * spacing); });
      advance(0);
    }

    return { advance, setCount, randomize };
  }

  window.TwinTraffic = { create };
})();

(function () {
  'use strict';
  const THREE = window.THREE;
  const smooth = THREE.MathUtils.smoothstep;
  const linear = hex => new THREE.Color(hex).convertSRGBToLinear();
  const mix = THREE.MathUtils.lerp;
  const roadY = 8;
  const extent = 292;
  const boreCenters = [-3.33, 3.33];
  const boreRadius = 2.87;
  const boreWall = 1.08;
  const boreRise = boreRadius;
  const portalY = roadY - .06;

  function reliefAt(x, z) {
    const bend = z + 14 * Math.sin(x * .024) + 6 * Math.sin(x * .057 + z * .048);
    const ridge = 1 - Math.abs(Math.sin(bend * .039 + x * .012));
    return 29 + 15 * Math.sin(x * .023 - z * .019) + 38 * ridge ** 1.7
      + 7 * Math.sin(x * .085 + z * .11) * Math.cos(z * .056 - x * .036)
      + 2.2 * Math.cos(x * .24 + z * .28) + 1.3 * Math.sin(z * .43 - x * .18);
  }

  function create(center, tunnels) {
    const river = x => 44 * Math.sin((x + 32) * .016 + .5) + 23 * Math.sin((x + 32) * .029);
    const riverWidth = x => 7.6 + 2.5 * Math.cos(x * .023) + 1.6 * Math.sin(x * .083);
    const waterY = -.85;

    function height(x, z) {
      const offset = z - center(x);
      const bank = smooth(Math.abs(z - river(x)), riverWidth(x) - 2, riverWidth(x) + 8);
      const slopes = smooth(Math.abs(offset), 16, 94);
      let h = mix(roadY - .65, reliefAt(x, z), slopes);
      const shoulder = (1 - smooth(Math.abs(offset), 8, 26)) * smooth(Math.abs(x), 280, 315);
      h -= 4 * shoulder;
      for (const { start, end } of tunnels) {
        const inset = Math.min(x - start, end - x);
        const distance = Math.abs(offset);
        const cover = smooth(inset, .8, 4.6) * (1 - smooth(distance, 8, 33));
        const flank = smooth(inset, -24, 2) * smooth(distance, 10, 22) * (1 - smooth(distance, 29, 80));
        h += cover * (19 + 5 * Math.sin((x - start) * .15 + offset * .096)) + 21 * flank;
      }
      return mix(-5 + .6 * Math.cos(z * .42 + x * .52), h, bank);
    }

    function slope(x, z, h) {
      return Math.hypot(height(x + 1.5, z) - h, height(x, z + 1.5) - h) / 1.5;
    }

    function cutPortalOpenings(material) {
      // The terrain mesh is a height field. Mask its intersections with the
      // two arched openings near each mouth, leaving the mountain above them.
      const mouths = tunnels.flatMap(({ start, end }) => [[start, 1], [end, -1]].map(([x, sign]) => {
        const angle = heading(x);
        return new THREE.Vector4(x, center(x), sign * Math.cos(angle), sign * Math.sin(angle));
      }));
      if (!mouths.length) return;
      material.userData.boreCutCount = mouths.length;
      material.customProgramCacheKey = () => 'portal-openings-' + mouths.length;
      material.onBeforeCompile = shader => {
        shader.uniforms.portalMouths = { value: mouths };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 terrainPosition;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nterrainPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>
            varying vec3 terrainPosition;
            uniform vec4 portalMouths[${mouths.length}];`)
          .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
            for (int i = 0; i < ${mouths.length}; i++) {
              vec4 mouth = portalMouths[i];
              vec2 delta = terrainPosition.xz - mouth.xy;
              float distanceIn = dot(delta, mouth.zw);
              float cross = abs(dot(delta, vec2(-mouth.w, mouth.z)));
              float offset = abs(cross - ${boreCenters[1]});
              float ratio = offset / ${boreRadius + .24};
              float ceiling = ${portalY + boreWall} + ${boreRise + .27} * sqrt(max(0.0, 1.0 - ratio * ratio));
              if (distanceIn > -1.6 && distanceIn < 6.2 && ratio < 1.0 &&
                  terrainPosition.y > ${roadY - .42} && terrainPosition.y < ceiling) discard;
            }`);
      };
    }

    function landscape(anisotropy) {
      const group = new THREE.Group();
      const ground = new THREE.PlaneGeometry(1180, 670, 472, 268);
      ground.rotateX(-Math.PI / 2);
      const pos = ground.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, height(pos.getX(i), pos.getZ(i)));
      ground.computeVertexNormals();
      const grass = linear(0x65734d), scrub = linear(0x4c6342), rock = linear(0x9c927d);
      const shore = linear(0x8f8370), tint = new THREE.Color();
      const colors = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i), h = pos.getY(i);
        const strata = Math.sin(z * .18 + x * .11 + 1.2 * Math.sin(x * .054));
        const stone = smooth(1 - ground.attributes.normal.getY(i) + .063 * strata + h * .0018, .11, .44);
        const patch = smooth(Math.sin(x * .076) * Math.cos(z * .069 + x * .056), -.42, .59);
        tint.copy(grass).lerp(scrub, patch).lerp(rock, stone);
        if (h < 3.5) tint.lerp(shore, 1 - smooth(h, waterY, 3.5));
        tint.multiplyScalar(.89 + .094 * patch + .053 * strata);
        tint.toArray(colors, i * 3);
      }
      ground.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const loader = new THREE.TextureLoader();
      function texture(file, along, across, color = false) {
        const tex = loader.load('assets/3d/' + file);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(along, across);
        tex.anisotropy = Math.min(8, anisotropy);
        if (color) tex.encoding = THREE.sRGBEncoding;
        return tex;
      }
      const terrainMaterial = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: .93, map: texture('network-slope-detail.png', 25, 14, true),
        normalMap: texture('network-rock-normal.png', 56, 32), normalScale: new THREE.Vector2(.9, .9)
      });
      cutPortalOpenings(terrainMaterial);
      group.add(new THREE.Mesh(ground, terrainMaterial));
      const water = new THREE.PlaneGeometry(1180, 2, 472, 9);
      water.rotateX(-Math.PI / 2);
      const points = water.attributes.position;
      const deep = linear(0x406e72), shallow = linear(0x64928b);
      const shades = new Float32Array(points.count * 3);
      for (let i = 0; i < points.count; i++) {
        const x = points.getX(i), across = points.getZ(i);
        points.setXYZ(i, x, waterY, river(x) + across * (riverWidth(x) + 5));
        tint.copy(deep).lerp(shallow, smooth(Math.abs(across), .15, .95))
          .multiplyScalar(.95 + .09 * Math.sin(x * .21 + across * 13) * Math.cos(x * .127));
        tint.toArray(shades, i * 3);
      }
      water.setAttribute('color', new THREE.BufferAttribute(shades, 3));
      group.add(new THREE.Mesh(water, new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: .36, metalness: .12,
        normalMap: texture('songlan-water-normal.png', 56, 3), normalScale: new THREE.Vector2(.9, .9)
      })));
      return group;
    }

    function needleCanopy() {
      const positions = [], colors = [];
      const branchEdge = [[0, 0], [.23, .74], [.40, .94], [.51, .58], [.59, .82],
        [.76, .43], [1, 0], [.77, -.44], [.61, -.78], [.49, -.49], [.39, -.92], [.22, -.71]];
      const layers = [[.20, 1.22, 6], [.69, 1.06, 6], [1.16, .91, 5], [1.65, .74, 5], [2.11, .56, 4],
        [2.53, .36, 4], [2.86, .19, 3]];
      layers.forEach(([height, reach, count], layer) => {
        for (let i = 0; i < count; i++) {
          const angle = i * Math.PI * 2 / count + layer * 1.67;
          const length = reach * (1 + .17 * Math.sin(angle * 2.4 + layer));
          const lift = .32 - .055 * layer + .085 * Math.sin(angle + layer);
          const breadth = reach * (.44 + .055 * Math.cos(angle * 3.1 + layer));
          const cosine = Math.cos(angle), sine = Math.sin(angle);
          const branchPoint = (along, side, ridge = 0) => [
            .073 * height + length * along * cosine - breadth * side * sine,
            height + lift * (1 - along) - .15 * along + ridge,
            length * along * sine + breadth * side * cosine
          ];
          const ridge = branchPoint(.43, 0, .29 - .024 * layer);
          const leafEdge = branchEdge.map(([along, side]) => branchPoint(along, side));
          for (let k = 0; k < leafEdge.length; k++) {
            positions.push(...leafEdge[k], ...leafEdge[(k + 1) % leafEdge.length], ...ridge);
            const shade = .74 + .025 * layer + .062 * Math.cos(angle + k * 1.7);
            colors.push(shade, shade, shade * .97, shade, shade, shade * .97, shade + .13, shade + .15, shade + .106);
          }
        }
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.computeVertexNormals();
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      return geometry;
    }

    function leafCanopy(clusters) {
      const shell = new THREE.IcosahedronGeometry(1, 1);
      const shape = shell.attributes.position, shellNormals = shell.attributes.normal;
      const vertices = [], normals = [], colors = [], normal = new THREE.Vector3();
      for (const [dx, dy, dz, sx, sy, sz, brightness] of clusters) {
        for (let i = 0; i < shape.count; i++) {
          const x = shape.getX(i), y = shape.getY(i), z = shape.getZ(i);
          const irregularity = .99 + .086 * Math.sin(x * 8.4 + y * 8.7 - z * 7.3 + dx * 2.8);
          vertices.push(dx + sx * x * irregularity, dy + sy * y * irregularity, dz + sz * z * irregularity);
          normal.set(shellNormals.getX(i) / sx, shellNormals.getY(i) / sy, shellNormals.getZ(i) / sz).normalize();
          normals.push(normal.x, normal.y, normal.z);
          const shade = brightness * (.89 + .08 * y + .042 * Math.sin(z * 7 + x * 5));
          colors.push(shade, shade * 1.02, shade * .94);
        }
      }
      shell.dispose();
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      return geometry;
    }

    function forest(rng) {
      const group = new THREE.Group();
      group.name = '河谷林地';
      const spots = [];
      for (let i = 0; i < 7200 && spots.length < 1780; i++) {
        const x = -365 + rng() * 730;
        const z = center(x) + (rng() < .5 ? -1 : 1) * (23 + 187 * rng());
        const h = height(x, z);
        const soil = 1 - smooth(slope(x, z, h), .74, 1.32);
        const clump = .09 + .83 * smooth(Math.sin(x * .081 + z * .042) + .72 * Math.sin(x * .131 - z * .077), -.49, 1.05);
        if (h > 1.2 && rng() < clump * soil) {
          const kind = rng() < (h > 30 ? .66 : .34) ? 0 : rng() < .56 ? 1 : 2;
          spots.push({ x, z, h, kind, size: .55 + 1.07 * rng(), hue: rng(), yaw: Math.PI * 2 * rng() });
        }
      }
      const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.095, .2, 2.15, 6),
        new THREE.MeshStandardMaterial({ color: linear(0x655748), roughness: 1 }), spots.length);
      const crown = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .98, vertexColors: true });
      const needles = crown.clone();
      needles.side = THREE.DoubleSide;
      const crowns = [
        needleCanopy(),
        leafCanopy([
          [0, .88, -.07, .91, .72, .88, .98], [-.84, .49, .31, .61, .47, .63, .88],
          [.86, .38, -.27, .57, .49, .59, .86], [.16, .45, .88, .58, .51, .65, .93],
          [-.12, .70, -.82, .61, .48, .58, .91], [.34, 1.31, .23, .55, .47, .53, 1.12]
        ]),
        leafCanopy([
          [0, .98, 0, .74, .82, .76, .97], [-.61, .54, -.45, .54, .54, .49, .9],
          [.64, .74, .35, .56, .62, .56, .9], [-.29, .68, .68, .54, .57, .55, .94],
          [.23, .88, -.63, .54, .53, .48, .96], [-.13, 1.58, .17, .52, .52, .49, 1.08]
        ])
      ].map((geometry, kind) => new THREE.InstancedMesh(geometry, kind === 0 ? needles : crown,
        spots.filter(s => s.kind === kind).length));
      const transform = new THREE.Object3D(), tint = new THREE.Color();
      const indices = [0, 0, 0];
      spots.forEach(({ x, z, h, size, kind, hue, yaw }, i) => {
        transform.rotation.y = yaw;
        transform.position.set(x, h + .92 * size, z);
        transform.scale.set(size, size, size);
        transform.updateMatrix();
        trunk.setMatrixAt(i, transform.matrix);
        const mesh = crowns[kind];
        const index = indices[kind]++;
        transform.position.y = h + (kind === 0 ? .86 : 1.43) * size;
        transform.scale.set((.83 + .23 * hue) * size, (1.12 - .15 * hue) * size, size);
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
        tint.setHSL([.273, .227, .195][kind] + .031 * hue, .23 + .13 * hue, .24 + .12 * hue);
        mesh.setColorAt(index, tint.convertSRGBToLinear());
      });
      group.add(trunk, ...crowns);
      return group;
    }

    function heading(x) {
      return Math.atan2(center(x + 1) - center(x - 1), 2);
    }

    function lateralPoint(x, lateral, y) {
      const angle = heading(x);
      return [x - Math.sin(angle) * lateral, y, center(x) + Math.cos(angle) * lateral];
    }

    function trafficMatrix(x, lateral, direction, matrix) {
      const angle = heading(x);
      matrix.makeRotationY(-angle + (direction < 0 ? Math.PI : 0));
      matrix.setPosition(x - Math.sin(angle) * lateral, roadY, center(x) + Math.cos(angle) * lateral);
    }

    function strip(intervals, profile, material, colorAt = null) {
      const vertices = [], indices = [], colors = [];
      for (const [start, end] of intervals) {
        const count = Math.ceil((end - start) / 2.6);
        const first = vertices.length / 3;
        for (let p = 0; p <= count; p++) {
          const x = mix(start, end, p / count);
          profile.forEach(([lateral, y]) => {
            vertices.push(...lateralPoint(x, lateral, y));
            if (colorAt) colors.push(...colorAt(x, start, end, y));
          });
          if (p === count) continue;
          for (let k = 0; k < profile.length - 1; k++) {
            const a = first + p * profile.length + k, b = a + profile.length;
            indices.push(a, a + 1, b, a + 1, b + 1, b);
          }
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      if (colorAt) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      return new THREE.Mesh(geometry, material);
    }

    function concrete(hex) {
      return new THREE.MeshStandardMaterial({ color: linear(hex), roughness: .88, side: THREE.DoubleSide });
    }

    function engineering() {
      const decks = new THREE.Group(), paint = new THREE.Group(), structures = new THREE.Group();
      decks.name = '双幅桥面';
      const road = [[-extent, extent]], asphalt = concrete(0x42474a), slab = concrete(0xa69e8d);
      const underground = tunnels.map(({ start, end }) => [start, end]);
      const ends = [-extent, ...underground.flat(), extent];
      const outdoor = ends.filter((_, i) => i % 2 === 0).map((x, i) => [x, ends[2 * i + 1]]);
      const tunnelPavement = concrete(0x32373b);
      const edge = new THREE.MeshBasicMaterial({ color: linear(0xe5e2d5) });
      const median = new THREE.MeshBasicMaterial({ color: linear(0xd6c491) });
      const breaks = Array.from({ length: 87 }, (_, i) => [-290 + i * 6.7, -287.25 + i * 6.7]);
      for (const [left, right] of [[-6.3, -.34], [.34, 6.3]]) {
        const group = new THREE.Group();
        const pavement = [[left, roadY], [right, roadY]];
        group.add(strip(outdoor, pavement, asphalt));
        if (underground.length) group.add(strip(underground, pavement, tunnelPavement));
        group.add(strip(road, [[left, roadY], [left + .22, roadY - 1.05], [right - .22, roadY - 1.05], [right, roadY]], slab));
        for (const lateral of [left, right - .17]) {
          group.add(strip(road, [[lateral, roadY], [lateral, roadY + .42], [lateral + .17, roadY + .42], [lateral + .17, roadY]], slab));
        }
        const middle = (left + right) / 2;
        paint.add(strip(breaks, [[middle - .07, roadY + .018], [middle + .07, roadY + .018]], edge));
        for (const [offset, material] of [[left + .43, left > 0 ? median : edge], [right - .43, right < 0 ? median : edge]]) {
          paint.add(strip(road, [[offset - .055, roadY + .02], [offset + .055, roadY + .02]], material));
        }
        decks.add(group);
      }
      const column = new THREE.BoxGeometry(1.35, 1, 1.55);
      const cap = new THREE.BoxGeometry(1.78, .58, 4.65);
      for (let x = -280; x <= 280; x += 8.5) {
        if (tunnels.some(({ start, end }) => x > start - 2 && x < end + 2)) continue;
        for (const lateral of [-3.4, 3.4]) {
          const [px, , pz] = lateralPoint(x, lateral, roadY);
          const base = height(px, pz);
          if (base >= roadY - 2.4) continue;
          const support = new THREE.Mesh(column, slab);
          support.scale.y = roadY - .8 - base;
          support.position.set(px, base + support.scale.y / 2, pz);
          const head = new THREE.Mesh(cap, slab);
          head.rotation.y = -heading(x);
          head.position.set(px, roadY - 1.18, pz);
          structures.add(support, head);
        }
      }
      if (!structures.children.length) { column.dispose(); cap.dispose(); }
      return [decks, paint, structures, tunnelInteriors()];
    }

    function tunnelInteriors() {
      const interiors = new THREE.Group();
      interiors.name = '连续隧道洞身';
      const lining = concrete(0xffffff);
      lining.vertexColors = true;
      const light = linear(0xa6a6a0), shadow = linear(0x525654), tint = new THREE.Color();
      const lightFixture = new THREE.MeshBasicMaterial({ color: linear(0xffebc2), side: THREE.DoubleSide });
      const walkway = concrete(0x7d7d74);
      const wallPanel = concrete(0xb6bcb5);
      const guidanceStripe = concrete(0x609999);
      const panelJoint = concrete(0x777d78);
      const tray = concrete(0x505651);
      const bracket = concrete(0x343d40);
      for (const { start, end } of tunnels) {
        const interval = [[start - .12, end + .12]];
        const furnish = [[start + .34, end - .34]];
        const fixtures = [], seams = [];
        for (let x = start + 1.25; x < end - .9; x += 2.72) fixtures.push([x, x + .48]);
        for (let x = start + 1; x < end - .5; x += 1.85) seams.push([x, x + .034]);
        for (const center of boreCenters) {
          const profile = [[center - boreRadius, roadY - .06]];
          for (let i = 0; i <= 16; i++) {
            const angle = Math.PI * (1 - i / 16);
            profile.push([center + boreRadius * Math.cos(angle), portalY + boreWall + boreRise * Math.sin(angle)]);
          }
          profile.push([center + boreRadius, roadY - .06]);
          const tunnel = new THREE.Group();
          tunnel.add(strip(interval, profile, lining, (x, from, to, y) => {
            const depth = smooth(Math.min(x - from, to - x), .4, 5);
            const crown = smooth(y, roadY + .6, portalY + boreWall + boreRise);
            return tint.copy(light).lerp(shadow, .26 + .5 * depth + .09 * crown).toArray();
          }));
          for (const side of [-1, 1]) {
            const wall = center + side * (boreRadius - .033);
            tunnel.add(strip(furnish, [[wall - side * .37, roadY + .14], [wall, roadY + .14]], walkway));
            tunnel.add(strip(furnish, [[wall, roadY + .14], [wall, roadY + .99]], wallPanel));
            const stripe = wall - side * .016;
            tunnel.add(strip(furnish, [[stripe, roadY + .47], [stripe, roadY + .56]], guidanceStripe));
            const joint = wall - side * .027;
            tunnel.add(strip(seams, [[joint, roadY + .15], [joint, roadY + .98]], panelJoint));
          }
          const ceiling = portalY + boreWall + boreRise;
          tunnel.add(strip(furnish, [[center - .12, ceiling - .04], [center - .12, ceiling - .15],
            [center + .12, ceiling - .15], [center + .12, ceiling - .04]], tray));
          for (const offset of [-.88, .88]) {
            const x = center + offset;
            const roof = portalY + boreWall + Math.sqrt(boreRise ** 2 - offset ** 2);
            const body = roof - .27;
            tunnel.add(strip(fixtures, [[x - .11, roof - .06], [x - .15, body],
              [x + .15, body], [x + .11, roof - .06]], bracket));
            const lamp = strip(fixtures, [[x - .106, body - .012], [x + .106, body - .012]], lightFixture);
            lamp.name = '分列顶灯';
            tunnel.add(lamp);
          }
          interiors.add(tunnel);
        }
      }
      return interiors;
    }

    function bore(contour, cx, width, floor, wall, rise) {
      contour.moveTo(cx - width, floor);
      contour.lineTo(cx - width, wall);
      contour.absellipse(cx, wall, width, rise, Math.PI, 0, true);
      contour.lineTo(cx + width, floor);
      contour.closePath();
      return contour;
    }

    function portalSign(name) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 56;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#263c47';
      ctx.fillRect(0, 0, 256, 56);
      ctx.strokeStyle = '#829398';
      ctx.lineWidth = 2;
      ctx.strokeRect(2, 2, 252, 52);
      ctx.font = '600 30px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f3f1e6';
      ctx.fillText(name, 128, 29, 234);
      const texture = new THREE.CanvasTexture(canvas);
      texture.encoding = THREE.sRGBEncoding;
      return new THREE.MeshBasicMaterial({ map: texture });
    }

    function portal(x, downstream, name) {
      const group = new THREE.Group();
      group.name = '隧道双洞门';
      group.position.set(x, portalY, center(x));
      group.rotation.y = -Math.PI / 2 - heading(x) + (downstream ? Math.PI : 0);
      const face = concrete(0xb2b2a7), reveal = concrete(0x87908b);
      const signMaterial = portalSign(name);
      for (const cx of boreCenters) {
        const collar = bore(new THREE.Shape(), cx, 3.19, -.43, boreWall + .095, boreRise + .36);
        collar.holes.push(bore(new THREE.Path(), cx, boreRadius, -.055, boreWall, boreRise));
        const arch = new THREE.Mesh(new THREE.ExtrudeGeometry(collar,
          { depth: 1.54, curveSegments: 22, bevelEnabled: false, material: 0, extrudeMaterial: 1 }), [face, reveal]);
        arch.name = '独立拱形洞门';
        arch.position.z = -.86;
        group.add(arch);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.43, .31), signMaterial);
        sign.position.set(cx, boreWall + boreRise + .183, .699);
        group.add(sign);
      }
      const walls = new THREE.Group();
      walls.name = '阶梯式翼墙';
      const wallMaterial = concrete(0x9d9e93), coping = concrete(0xb2b2a5);
      const steps = [[.05, 1.65, 2.06], [1.65, 3.28, 1.49], [3.28, 4.93, .95], [4.93, 6.53, .62]];
      for (const side of [-1, 1]) {
        for (const [from, to, height] of steps) {
          const length = to - from, center = (to + from) / 2, lateral = side * (6.64 + center * .13);
          const wing = new THREE.Mesh(new THREE.BoxGeometry(.47, height + .22, length + .025), wallMaterial);
          wing.position.set(lateral, height / 2 - .11, center);
          wing.rotation.y = side * .13;
          const cap = new THREE.Mesh(new THREE.BoxGeometry(.53, .11, length + .025), coping);
          cap.position.set(lateral, height - .16, center);
          cap.rotation.y = wing.rotation.y;
          walls.add(wing, cap);
        }
      }
      group.add(walls);
      return group;
    }

    return { height, landscape, forest, engineering, portal, trafficMatrix, trafficExtent: extent };
  }

  window.TwinCorridor = { create };
})();

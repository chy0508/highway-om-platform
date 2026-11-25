(function () {
  'use strict';
  const THREE = window.THREE;
  const smooth = THREE.MathUtils.smoothstep;
  const linear = hex => new THREE.Color(hex).convertSRGBToLinear();
  const mix = THREE.MathUtils.lerp;
  const roadY = 8;
  const extent = 292;
  const boreCenters = [-3.33, 3.33];
  const boreRadius = 2.77;
  const boreWall = 2.59;
  const boreRise = 2.24;
  const portalY = roadY - .06;

  function reliefAt(x, z) {
    const bend = z + 14 * Math.sin(x * .024) + 6 * Math.sin(x * .057 + z * .048);
    const ridge = 1 - Math.abs(Math.sin(bend * .039 + x * .012));
    return 29 + 15 * Math.sin(x * .023 - z * .019) + 38 * ridge ** 1.7
      + 7 * Math.sin(x * .085 + z * .11) * Math.cos(z * .056 - x * .036)
      + 2.2 * Math.cos(x * .24 + z * .28) + 1.3 * Math.sin(z * .43 - x * .18);
  }

  function create(center, tunnels) {
    const river = x => 44 * Math.sin((x + 30) * .016 + .5) + 23 * Math.sin((x + 30) * .029);
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

    function forest(rng) {
      const group = new THREE.Group();
      group.name = '河谷林地';
      const spots = [];
      for (let i = 0; i < 6100 && spots.length < 1830; i++) {
        const x = -335 + rng() * 670;
        const z = center(x) + (rng() < .5 ? -1 : 1) * (22 + 176 * rng());
        const h = height(x, z);
        const openRock = slope(x, z, h) > 1.06;
        const clump = .25 + .66 * smooth(Math.sin(x * .062 + z * .051) + .63 * Math.sin(x * .124 - z * .079), -.65, .9);
        if (h > .8 && rng() < clump * (openRock ? .16 : 1)) {
          spots.push({ x, z, h, size: .58 + 1.33 * rng(), fir: rng() > .51, hue: rng(), yaw: 6.28 * rng() });
        }
      }
      const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.15, .28, 2.6, 6),
        new THREE.MeshStandardMaterial({ color: linear(0x665240), roughness: 1 }), spots.length);
      const crown = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .98 });
      const firProfile = [[0, 0], [1.21, .25], [.71, .78], [1.07, .77], [.65, 1.42],
        [.84, 1.37], [.43, 2.02], [.55, 1.98], [0, 3.12]];
      const fir = new THREE.InstancedMesh(new THREE.LatheGeometry(firProfile.map(([x, y]) => new THREE.Vector2(x, y)), 7),
        crown, spots.filter(s => s.fir).length);
      const broadleaf = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), crown.clone(), spots.length - fir.count);
      const transform = new THREE.Object3D(), tint = new THREE.Color();
      let firIndex = 0, leafIndex = 0;
      spots.forEach(({ x, z, h, size, fir: needle, hue, yaw }, i) => {
        transform.rotation.y = yaw;
        transform.position.set(x, h + 1.02 * size, z);
        transform.scale.set(size, size, size);
        transform.updateMatrix();
        trunk.setMatrixAt(i, transform.matrix);
        const mesh = needle ? fir : broadleaf;
        const index = needle ? firIndex++ : leafIndex++;
        transform.position.y = h + (needle ? 1.12 : 2.45) * size;
        transform.scale.set((needle ? 1.09 : 1.64) * size, (needle ? 1.18 : 1.32) * size, (needle ? 1 : 1.37) * size);
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
        tint.setHSL(needle ? .26 + .05 * hue : .19 + .097 * hue, .25 + .12 * hue, .19 + .105 * hue);
        mesh.setColorAt(index, tint.convertSRGBToLinear());
      });
      group.add(trunk, fir, broadleaf);
      return group;
    }

    function heading(x) {
      return Math.atan2(center(x + 1) - center(x - 1), 2);
    }

    function lateralPoint(x, lateral, y) {
      const angle = heading(x);
      return [x - Math.sin(angle) * lateral, y, center(x) + Math.cos(angle) * lateral];
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
      const lightFixture = new THREE.MeshBasicMaterial({ color: linear(0xffdfa8), side: THREE.DoubleSide });
      const walkway = concrete(0x7d7d74);
      for (const { start, end } of tunnels) {
        const interval = [[start - .12, end + .12]];
        const fixtures = [];
        for (let x = start + 1.45; x < end - .75; x += 2.4) fixtures.push([x, x + .5]);
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
            const crown = smooth(y, roadY + .6, roadY + 4.8);
            return tint.copy(light).lerp(shadow, .3 + .56 * depth + .12 * crown).toArray();
          }));
          for (const side of [-1, 1]) {
            const edge = center + side * (boreRadius - .08);
            tunnel.add(strip(interval, [[edge - side * .27, roadY + .14], [edge, roadY + .14]], walkway));
          }
          if (fixtures.length) {
            tunnel.add(strip(fixtures, [[center - .13, roadY + 4.28], [center + .13, roadY + 4.28]], lightFixture));
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

    function portal(x, downstream) {
      const group = new THREE.Group();
      group.name = '隧道双洞门';
      group.position.set(x, portalY, center(x));
      group.rotation.y = -Math.PI / 2 - heading(x) + (downstream ? Math.PI : 0);
      const front = new THREE.Shape();
      front.moveTo(-7.8, -.35); front.lineTo(7.8, -.35); front.lineTo(6.88, 5.58);
      front.lineTo(5.33, 6.64); front.lineTo(-5.33, 6.64); front.lineTo(-6.88, 5.58); front.closePath();
      boreCenters.forEach(cx => front.holes.push(bore(new THREE.Path(), cx, boreRadius + .11, -.11, boreWall, boreRise + .09)));
      const face = new THREE.Mesh(new THREE.ExtrudeGeometry(front, { depth: 1.65, curveSegments: 14, bevelEnabled: false }), concrete(0xa8a69b));
      face.position.z = -1.3;
      group.add(face);
      for (const cx of boreCenters) {
        const trim = bore(new THREE.Shape(), cx, 3.05, -.11, 2.68, 2.47);
        trim.holes.push(bore(new THREE.Path(), cx, boreRadius, .015, boreWall, boreRise));
        const rim = new THREE.Mesh(new THREE.ExtrudeGeometry(trim, { depth: .34, curveSegments: 14, bevelEnabled: false }), concrete(0xd9d1bb));
        rim.position.z = .28;
        group.add(rim);
      }
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(.52, 3.3, 4.3), concrete(0x9b9484));
        wing.position.set(side * 7.7, 1.37, 1.23);
        wing.rotation.y = side * .36;
        group.add(wing);
      }
      return group;
    }

    return { height, landscape, forest, engineering, portal };
  }

  window.TwinCorridor = { create };
})();

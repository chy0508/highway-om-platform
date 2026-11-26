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

  // Surface and sky photographs are adapted from Poly Haven's CC0 assets:
  // aerial_grass_rock, rocky_terrain_02, stone_wall, kloppenheim_03_puresky,
  // island_tree_01 (leaf textures), and clean_asphalt.
  function texture(file, anisotropy, { repeat, color = true, onLoad } = {}) {
    const map = new THREE.TextureLoader().load('assets/3d/' + file, onLoad);
    if (repeat) {
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(...repeat);
    }
    map.anisotropy = Math.min(8, anisotropy);
    if (color) map.encoding = THREE.sRGBEncoding;
    return map;
  }

  function daylightSky() {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 48, 24), new THREE.MeshBasicMaterial({
      map: texture('network-day-sky.png', 1),
      side: THREE.BackSide, depthWrite: false, fog: false
    }));
    sky.name = '日间天空';
    sky.rotation.y = Math.PI * .55;
    sky.renderOrder = -100;
    sky.frustumCulled = false;
    return sky;
  }

  function reliefAt(x, z) {
    const bend = z + 19 * Math.sin(x * .021) + 8 * Math.sin(x * .042 + z * .035);
    const ridge = .5 + .5 * Math.cos(bend * .048 + x * .026);
    return 26 + 14 * Math.sin(x * .021 - z * .017) + 32 * ridge ** 1.5
      + 5.5 * Math.sin(x * .071 + z * .085) * Math.cos(z * .054 - x * .034)
      + 1.1 * Math.cos(x * .17 + z * .23) + .55 * Math.sin(z * .37 - x * .19);
  }

  function create(center, tunnels, section) {
    const river = x => 44 * Math.sin((x + 32) * .016 + .5) + 23 * Math.sin((x + 32) * .029);
    const riverWidth = x => 7.6 + 2.5 * Math.cos(x * .023) + 1.6 * Math.sin(x * .083);
    const waterY = -.85;

    function height(x, z) {
      if (section) return section.height(x, z);
      const offset = z - center(x);
      const bank = smooth(Math.abs(z - river(x)), riverWidth(x) - 2, riverWidth(x) + 8);
      const slopes = smooth(Math.abs(offset), 9, 103);
      let h = mix(roadY - .65, reliefAt(x, z), slopes);
      const shoulder = (1 - smooth(Math.abs(offset), 8, 26)) * smooth(Math.abs(x), 280, 315);
      h -= 4 * shoulder;
      for (const { start, end } of tunnels) {
        const inset = Math.min(x - start, end - x);
        const distance = Math.abs(offset);
        const envelope = 1 - smooth(distance, 8, 46);
        const cover = 5.8 * smooth(inset, .25, 5.7) + 11 * smooth(inset, 5.2, 21);
        const flank = smooth(inset, -29, 8) * smooth(distance, 7, 30) * (1 - smooth(distance, 35, 95));
        h += envelope * cover + 12 * flank;
      }
      return mix(-5 + .6 * Math.cos(z * .42 + x * .52), h, bank);
    }

    function slope(x, z, h) {
      return Math.hypot(height(x + 1.5, z) - h, height(x, z + 1.5) - h) / 1.5;
    }

    function shadeTerrain(material, scrubMap) {
      // The terrain mesh is a height field. Mask its intersections with the
      // two arched openings near each mouth, leaving the mountain above them.
      const mouths = tunnels.flatMap(({ start, end }) => [[start, 1], [end, -1]].map(([x, sign]) => {
        const angle = heading(x);
        return new THREE.Vector4(x, center(x), sign * Math.cos(angle), sign * Math.sin(angle));
      }));
      material.userData.boreCutCount = mouths.length;
      material.addEventListener('dispose', () => scrubMap.dispose());
      const sectionPortal = section?.portal === true;
      material.customProgramCacheKey = () => sectionPortal ? 'wooded-terrain-single-bore' : 'wooded-terrain-' + mouths.length;
      material.onBeforeCompile = shader => {
        if (mouths.length) shader.uniforms.portalMouths = { value: mouths };
        shader.uniforms.scrubMap = { value: scrubMap };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>
            attribute float scrubCoverage;
            varying float terrainScrub;
            varying vec3 terrainPosition;
            varying vec3 terrainNormal;`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            terrainScrub = scrubCoverage;
            terrainNormal = mat3(modelMatrix) * normal;
            terrainPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
        const aperture = sectionPortal ? `
            float offset = abs(terrainPosition.z) / 9.38;
            float ceiling = -1.5 + 9.38 * sqrt(max(0.0, 1.0 - offset * offset));
            if (abs(abs(terrainPosition.x) - 90.0) < 5.5 &&
                offset < 1.0 && terrainPosition.y >= -5.4 && terrainPosition.y < ceiling) discard;
          ` : mouths.length ? `
            for (int i = 0; i < ${mouths.length}; i++) {
              vec4 mouth = portalMouths[i];
              vec2 delta = terrainPosition.xz - mouth.xy;
              float distanceIn = dot(delta, mouth.zw);
              float cross = abs(dot(delta, vec2(-mouth.w, mouth.z)));
              float offset = abs(cross - ${boreCenters[1]});
              float ratio = offset / ${boreRadius + .24};
              float ceiling = ${portalY + boreWall} + ${boreRise + .27} * sqrt(max(0.0, 1.0 - ratio * ratio));
              if (distanceIn > -1.6 && distanceIn < 10.4 && ratio < 1.0 &&
                  terrainPosition.y > ${roadY - .42} && terrainPosition.y < ceiling) discard;
            }` : '';
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>
            varying float terrainScrub;
            varying vec3 terrainPosition;
            varying vec3 terrainNormal;
            uniform sampler2D scrubMap;
            ${mouths.length ? 'uniform vec4 portalMouths[' + mouths.length + '];' : ''}`)
          .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>' + aperture)
          .replace('#include <map_fragment>', `
            vec3 slopes = abs(normalize(terrainNormal));
            vec3 weights = pow(slopes, vec3(5.0));
            weights /= weights.x + weights.y + weights.z;
            vec4 grassFlat = mapTexelToLinear(texture2D(map, terrainPosition.xz * .103));
            vec4 grassEast = mapTexelToLinear(texture2D(map, terrainPosition.zy * .103));
            vec4 grassNorth = mapTexelToLinear(texture2D(map, terrainPosition.xy * .103));
            vec4 openGrass = grassFlat * weights.y + grassEast * weights.x + grassNorth * weights.z;
            vec2 scrubUv = vec2(terrainPosition.x + .17 * terrainPosition.z, terrainPosition.z) * .067;
            vec4 scrub = mapTexelToLinear(texture2D(scrubMap, scrubUv));
            diffuseColor *= mix(openGrass, scrub, terrainScrub);`);
      };
    }

    function landscape(anisotropy) {
      const group = new THREE.Group();
      const ground = section ? new THREE.PlaneGeometry(780, 520, 260, 180) :
        new THREE.PlaneGeometry(1180, 670, 472, 268);
      ground.rotateX(-Math.PI / 2);
      const pos = ground.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, height(pos.getX(i), pos.getZ(i)));
      ground.computeVertexNormals();
      const grass = linear(0xe1e9cd), scrub = linear(0xaebf9e), rock = linear(0xb9ad9e);
      const shore = linear(0xa6ac96), tint = new THREE.Color();
      const colors = new Float32Array(pos.count * 3);
      const scrubCoverage = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i), h = pos.getY(i);
        const strata = Math.sin(z * .18 + x * .11 + 1.2 * Math.sin(x * .054));
        const stone = smooth(1 - ground.attributes.normal.getY(i) + .065 * strata, .36, .72);
        const patch = smooth(Math.sin(x * .064 + z * .038) + .59 * Math.cos(z * .117 - x * .087), -.7, 1.18);
        const hillside = smooth(Math.abs(z - center(x)), 8, 34);
        scrubCoverage[i] = hillside * (.27 + .69 * patch) * (1 - .74 * stone);
        tint.copy(grass).lerp(scrub, patch).lerp(rock, stone);
        if (!section && h < 3.5) tint.lerp(shore, 1 - smooth(h, waterY, 3.5));
        tint.multiplyScalar(.89 + .094 * patch + .053 * strata);
        tint.toArray(colors, i * 3);
      }
      ground.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      ground.setAttribute('scrubCoverage', new THREE.BufferAttribute(scrubCoverage, 1));
      const terrainMaterial = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: .95,
        map: texture('network-ground-grass.png', anisotropy, { repeat: [91, 54] }),
        normalMap: texture('network-rock-normal.png', anisotropy, { color: false }),
        normalScale: new THREE.Vector2(.18, .18)
      });
      shadeTerrain(terrainMaterial, texture('network-ground-scrub.png', anisotropy, { repeat: [1, 1] }));
      const hillside = new THREE.Mesh(ground, terrainMaterial);
      hillside.receiveShadow = true;
      group.add(hillside);
      if (section) return group;
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
        normalMap: texture('songlan-water-normal.png', anisotropy, { repeat: [56, 3], color: false }),
        normalScale: new THREE.Vector2(.57, .57)
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
      const shell = new THREE.IcosahedronGeometry(1, 0);
      const shape = shell.attributes.position, shellNormals = shell.attributes.normal, shellUVs = shell.attributes.uv;
      const vertices = [], normals = [], colors = [], uvs = [], normal = new THREE.Vector3();
      for (const [dx, dy, dz, sx, sy, sz, brightness] of clusters) {
        for (let i = 0; i < shape.count; i++) {
          const x = shape.getX(i), y = shape.getY(i), z = shape.getZ(i);
          const irregularity = .86 + .09 * Math.sin(x * 8.4 + y * 8.7 - z * 7.3 + dx * 2.8);
          vertices.push(dx + sx * x * irregularity, dy + sy * y * irregularity, dz + sz * z * irregularity);
          normal.set(shellNormals.getX(i) / sx, shellNormals.getY(i) / sy, shellNormals.getZ(i) / sz).normalize();
          normals.push(normal.x, normal.y, normal.z);
          const shade = brightness * (.89 + .08 * y + .042 * Math.sin(z * 7 + x * 5));
          colors.push(shade, shade * 1.02, shade * .94);
          uvs.push(shellUVs.getX(i) + dx * .33, shellUVs.getY(i) + dz * .27);
        }
      }
      shell.dispose();
      const coreVertices = vertices.length / 3;
      const clusterUVs = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]];
      for (const [dx, dy, dz, sx, sy, sz, brightness] of clusters) {
        for (let k = 0; k < 9; k++) {
          const yaw = k * 2.399963 + 3.7 * dx;
          const y = -.5 + 1.44 * (k + .5) / 9;
          const ring = Math.sqrt(1 - y * y);
          const sine = Math.sin(yaw), cosine = Math.cos(yaw);
          const direction = new THREE.Vector3(cosine * ring, y, sine * ring);
          const right = new THREE.Vector3(-sine, 0, cosine);
          const up = new THREE.Vector3().crossVectors(direction, right);
          const width = (sx + sz) * .82, height = sy * 1.49;
          const point = new THREE.Vector3(dx + sx * direction.x * .79,
            dy + sy * direction.y * .81, dz + sz * direction.z * .79);
          const shade = brightness * (.86 + .21 * y);
          for (const [u, v] of clusterUVs) {
            vertices.push(point.x + (u - .5) * width * right.x + (v - .5) * height * up.x,
              point.y + (v - .5) * height * up.y,
              point.z + (u - .5) * width * right.z + (v - .5) * height * up.z);
            normals.push(direction.x, direction.y, direction.z);
            colors.push(shade, shade, shade);
            uvs.push(u, v);
          }
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.addGroup(0, coreVertices, 0);
      geometry.addGroup(coreVertices, vertices.length / 3 - coreVertices, 1);
      return geometry;
    }

    function forest(rng, anisotropy, onFoliageLoad) {
      const group = new THREE.Group();
      group.name = '河谷林地';
      const spots = [];
      const planted = new Set();
      function plant(x, z, nearPortal, undergrowth = false) {
        const h = height(x, z);
        const overBore = tunnels.some(({ start, end }) => x > start + 8 && x < end - 8);
        const offset = Math.abs(z - center(x));
        if (section && !section.portal) {
          if (offset < 19 || h < -5.4) return;
        } else if (h < 1.8 || (offset < 10.4 && !(overBore && h > 13.1))) return;
        const key = Math.round(x / 2.5) + ',' + Math.round(z / 2.5);
        if (planted.has(key)) return;
        const gradient = slope(x, z, h);
        const soil = nearPortal ? 1 - smooth(gradient, 1.05, 1.8) : 1 - smooth(gradient, .8, 1.48);
        if (rng() > soil) return;
        const conifers = nearPortal ? 0 : h > 37 ? .25 : .11;
        const kind = rng() < conifers ? 0 : rng() < .54 ? 1 : 2;
        const size = undergrowth ? .36 + .49 * rng() : nearPortal ? .92 + 1.2 * rng() : .62 + 1.28 * rng();
        spots.push({ x, z, h, kind, size, hue: rng(), yaw: Math.PI * 2 * rng() });
        planted.add(key);
      }

      for (const { start, end } of tunnels) {
        for (const [mouth, sign] of [[start, 1], [end, -1]]) {
          for (let station = -20; station < 36; station += 3.9) {
            const x = mouth + sign * (station + 2.2 * rng());
            for (let side = -1; side <= 1; side += 2) {
              const firstRow = station > 8 ? 5 : 11.6;
              for (let row = firstRow; row < 39; row += 4.6) {
                const z = center(x) + side * (row + 2.7 * rng());
                if (rng() > .13) plant(x + 1.15 * rng(), z, true);
                if (row < 23 && rng() > .27) plant(x + 2.5, z + 1.9 * side, true, true);
              }
            }
          }
        }
        for (let x = start + 8.9; x < end - 7.8; x += 2.8) {
          for (let offset = -9; offset < 9; offset += 2.9) {
            plant(x + rng() * 1.1, center(x) + offset + rng() * 1.3, true);
          }
        }
      }
      const treeLimit = section ? 1200 : 3650;
      const samples = section ? 4400 : 12800;
      for (let i = 0; i < samples && spots.length < treeLimit; i++) {
        const x = -338 + rng() * 676;
        const z = center(x) + (rng() < .5 ? -1 : 1) * (12 + 195 * rng() ** 1.28);
        const clump = .24 + .72 * smooth(Math.sin(x * .083 + z * .059) + .71 * Math.sin(x * .142 - z * .071), -.63, 1);
        if (rng() < clump) plant(x, z, false);
      }
      const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.057, .126, 1.86, 6),
        new THREE.MeshStandardMaterial({ color: linear(0x655748), roughness: 1 }), spots.length);
      const crown = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .98, vertexColors: true });
      const needles = crown.clone();
      needles.side = THREE.DoubleSide;
      crown.map = texture('network-canopy-detail.png', anisotropy, { repeat: [2, 2] });
      const foliage = new THREE.MeshStandardMaterial({
        map: texture('network-leaf-cluster.png', anisotropy, { onLoad: onFoliageLoad }), vertexColors: true,
        roughness: .96, side: THREE.DoubleSide, alphaTest: .43
      });
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
      ].map((geometry, kind) => new THREE.InstancedMesh(geometry, kind === 0 ? needles : [crown, foliage],
        spots.filter(s => s.kind === kind).length));
      const transform = new THREE.Object3D(), tint = new THREE.Color();
      const indices = [0, 0, 0];
      spots.forEach(({ x, z, h, size, kind, hue, yaw }, i) => {
        transform.rotation.y = yaw;
        transform.position.set(x, h + .76 * size, z);
        transform.scale.set(size, size, size);
        transform.updateMatrix();
        trunk.setMatrixAt(i, transform.matrix);
        const mesh = crowns[kind];
        const index = indices[kind]++;
        transform.position.y = h + (kind === 0 ? .86 : 1.18) * size;
        transform.scale.set((.83 + .23 * hue) * size, (1.12 - .15 * hue) * size, size);
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
        tint.setHSL([.255, .234, .206][kind] + .045 * hue, .25 + .19 * hue, .26 + .17 * hue);
        mesh.setColorAt(index, tint.convertSRGBToLinear());
      });
      for (const mesh of [trunk, ...crowns]) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
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

    function strip(intervals, profile, material, colorAt = null, grade = null) {
      const vertices = [], indices = [], colors = [], uvs = [];
      for (const [start, end] of intervals) {
        const count = Math.ceil((end - start) / 2.6);
        const first = vertices.length / 3;
        for (let p = 0; p <= count; p++) {
          const x = mix(start, end, p / count);
          profile.forEach(([lateral, y]) => {
            vertices.push(...lateralPoint(x, lateral, grade ? y + grade(x) : y));
            if (colorAt) colors.push(...colorAt(x, start, end, y));
            if (material.map) uvs.push(x / 2.1, lateral / 2.1);
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
      if (material.map) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      return new THREE.Mesh(geometry, material);
    }

    function concrete(hex) {
      return new THREE.MeshStandardMaterial({ color: linear(hex), roughness: .88, side: THREE.DoubleSide });
    }

    function engineering(anisotropy) {
      const decks = new THREE.Group(), paint = new THREE.Group(), structures = new THREE.Group();
      decks.name = '双幅桥面';
      const road = [[-extent, extent]], asphalt = concrete(0xe1e3e1), slab = concrete(0x949487);
      asphalt.map = texture('network-asphalt.png', anisotropy, { repeat: [1, 1] });
      const underground = tunnels.map(({ start, end }) => [start, end]);
      const ends = [-extent, ...underground.flat(), extent];
      const outdoor = ends.filter((_, i) => i % 2 === 0).map((x, i) => [x, ends[2 * i + 1]]);
      const tunnelPavement = concrete(0x616663);
      tunnelPavement.map = asphalt.map;
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

    function portal(x, downstream, name, stone) {
      const group = new THREE.Group();
      group.name = '隧道双洞门';
      group.position.set(x, portalY, center(x));
      group.rotation.y = -Math.PI / 2 - heading(x) + (downstream ? Math.PI : 0);
      const face = concrete(0xa1a297), reveal = concrete(0x828680);
      const signMaterial = portalSign(name);

      // The wall spans both existing bores, leaving the lane and arch clear.
      const facade = new THREE.Shape();
      facade.moveTo(-9.7, -.58);
      facade.lineTo(9.7, -.58);
      facade.lineTo(9.7, 1.35);
      facade.lineTo(7.65, 3.45);
      facade.lineTo(7.65, 4.9);
      facade.lineTo(-7.65, 4.9);
      facade.lineTo(-7.65, 3.45);
      facade.lineTo(-9.7, 1.35);
      facade.closePath();
      for (const cx of boreCenters) {
        facade.holes.push(bore(new THREE.Path(), cx, boreRadius + .065, -.39, boreWall, boreRise + .065));
      }
      const masonry = new THREE.Mesh(new THREE.ExtrudeGeometry(facade,
        { depth: .77, curveSegments: 24, bevelEnabled: false }), stone);
      masonry.name = '双洞石砌端墙';
      masonry.position.z = -.45;
      const top = new THREE.Mesh(new THREE.BoxGeometry(15.48, .18, 1.02), face);
      top.position.set(0, 4.92, -.04);
      group.add(masonry, top);
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
      const wallMaterial = concrete(0x96978d), coping = concrete(0xa6a89d);
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
      group.traverse(mesh => {
        if (!mesh.isMesh || mesh.material === signMaterial) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      });
      return group;
    }

    function portalStone(anisotropy) {
      const stone = concrete(0xc3c6c2);
      stone.map = texture('network-portal-stone.png', anisotropy, { repeat: [.415, .415] });
      return stone;
    }

    function utilityRoom() {
      const building = new THREE.Group();
      const wall = concrete(0xc1bbab), roof = concrete(0x52616a);
      const trim = concrete(0x87887f), glass = concrete(0x34474d);
      function box(material, width, height, depth, x, y, z) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        building.add(mesh);
      }
      box(trim, 7.9, 2.3, 6.2, 0, -.92, 0);
      box(wall, 7.55, 3.55, 5.85, 0, 1.84, 0);
      box(roof, 8.05, .24, 6.33, 0, 3.68, 0);
      box(trim, 1.01, 2.18, .09, -2.17, 1.22, 2.96);
      for (const x of [-.62, 1.17, 2.45]) box(glass, .96, .76, .07, x, 2.34, 2.96);
      for (const side of [-1, 1]) {
        box(glass, .08, 1.45, 1.02, side * 3.8, 2.18, .93);
        for (let y = 1.62; y < 2.85; y += .205) box(trim, .105, .075, 1.06, side * 3.84, y, .93);
      }
      return building;
    }

    return { height, landscape, daylightSky, forest, heading, lateralPoint, strip, engineering, portal, portalStone, utilityRoom,
      trafficMatrix, trafficExtent: extent };
  }

  function createSectionLandscape(mode, key, anisotropy) {
    const tunnel = mode === 'tunnel';
    const random = window.DB.rng('detail-terrain-' + key);
    const phase = 2 * Math.PI * random();
    const halfLength = tunnel ? 90 : 130;
    const halfWidth = tunnel ? 6.5 : 12;
    const length = 390;
    const bend = x => Math.sign(x) * smooth(Math.abs(x), halfLength + 8, 310) * (x < 0 ? 36 : 52);
    const grade = x => tunnel ? -4.3 : smooth(Math.abs(x), 146, 350) * (x < 0 ? -.9 : 4.1);
    const ravineStation = -28 + 46 * Math.sin(phase);
    const corridor = create(bend, tunnel ? [{ start: -halfLength, end: halfLength }] : [], {
      portal: tunnel,
      height(x, z) {
        const offset = z - bend(x);
        const distance = Math.abs(offset);
        const crest = .5 + .5 * Math.sin(x * .025 + z * .041 + phase);
        const hillside = smooth(distance, 23, 105) * (17 + 34 * crest ** 1.5 + 7 * Math.sin(x * .049 - z * .053));
        const soil = 1.3 * Math.cos(x * .097 + z * .105) + .65 * Math.sin(z * .216 - x * .111);
        const valley = -4.7 + soil + hillside;
        if (tunnel) {
          const access = mix(grade(x) - .3, valley, smooth(distance, 8.7, 22));
          if (Math.abs(x) > halfLength) return access;
          // Retain the slope over the bore and cut the two end faces at the portal stations.
          const spine = offset + 6 * Math.sin(x * .038 + phase);
          const flank = 1 - smooth(Math.abs(spine), 13, 78);
          const interior = 1 - smooth(Math.abs(x), 28, 90);
          const ridge = 18.5 + (22 + 5 * Math.cos(x * .062 + z * .051)) * interior;
          return access + flank * ridge;
        }
        const ravine = 1 - smooth(Math.abs(x - ravineStation - 10 * Math.sin(z * .054 + phase)), 7, 36);
        const roadbed = grade(x) - 1.15 - 4.65 * ravine;
        return mix(roadbed, valley - 2.5 * ravine, smooth(distance, 12.5, 39));
      }
    });
    const surround = corridor.landscape(anisotropy);
    surround.name = tunnel ? '隧道周边地形' : '路段周边地形';
    if (tunnel) surround.userData.titleHeight = corridor.height(0, 0) + 6;
    surround.add(corridor.forest(random, anisotropy));
    const approaches = new THREE.Group();
    approaches.name = '两端接线路面';
    const intervals = [[-length, -halfLength], [halfLength, length]];
    const asphalt = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: .95 });
    const concreteEdge = new THREE.MeshStandardMaterial({ color: 0xb9bcc2, roughness: .83, side: THREE.DoubleSide });
    const white = new THREE.MeshBasicMaterial({ color: 0xe8eef5 });
    const yellow = new THREE.MeshBasicMaterial({ color: 0xe9c86a });
    const addStrip = (spans, profile, material) => approaches.add(corridor.strip(spans, profile, material, null, grade));
    addStrip(intervals, [[-halfWidth, 0], [halfWidth, 0]], asphalt);
    const dashes = intervals.flatMap(([start, end]) => {
      const count = Math.floor((end - start) / 6.5);
      return Array.from({ length: count }, (_, i) => [start + 3 + i * 6.5, start + 5.8 + i * 6.5]);
    });
    for (const offset of tunnel ? [0] : [-7.8, -4.2, 4.2, 7.8]) {
      addStrip(dashes, [[offset - .1, .05], [offset + .1, .05]], white);
    }
    for (const side of [-1, 1]) {
      const edge = (halfWidth - (tunnel ? .7 : 1)) * side;
      addStrip(intervals, [[edge - .08, .05], [edge + .08, .05]], tunnel ? yellow : white);
      if (tunnel) continue;
      const median = side * .62;
      addStrip(intervals, [[median - .08, .05], [median + .08, .05]], yellow);
      const rail = side * halfWidth;
      addStrip(intervals, [[rail - .35, -1.2], [rail - .35, .85], [rail + .35, .85], [rail + .35, -1.2]], concreteEdge);
    }
    surround.add(approaches);
    return surround;
  }

  window.TwinCorridor = { create, createSectionLandscape };
})();

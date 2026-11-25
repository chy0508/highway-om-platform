(function () {
  'use strict';
  const { Twin, THREE } = window;
  if (!Twin || !THREE) return;

  const seasons = {
    spring: { land: 0x89ac62, plants: [0x84ad5d, 0x9cc77c, 0xf4b9cc, 0x77a566], sky: 0xb7d6ed, portal: 0xd1efc1 },
    summer: { portal: 0xbfd9ff },
    autumn: { land: 0xb1895d, plants: [0xd6a343, 0xbe6942, 0xcf843a, 0x9a6639], sky: 0xe5c49d, portal: 0xffd4a1 },
    winter: { land: 0xd6e2eb, plants: [0xb4cbd4, 0x748e99, 0x9eb3bc, 0xc9d9e1], sky: 0xbccfdd, portal: 0xb9d9ff }
  };
  const weatherTypes = {
    clear: { sky: null, haze: 1, sun: 1 },
    cloudy: { sky: 0x8597a9, haze: 0.88, sun: 0.52 },
    rain: { sky: 0x566b85, haze: 0.73, sun: 0.38 },
    snow: { sky: 0xb4c9d5, haze: 0.84, sun: 0.58 },
    fog: { sky: 0xa9b9c6, haze: 0.52, sun: 0.54 }
  };
  const states = new WeakMap();
  const linear = color => new THREE.Color(color).convertSRGBToLinear();

  function saveColorAttribute(attribute) {
    return attribute && { attribute, original: attribute.array.slice() };
  }

  function findOutdoorSurfaces(twin) {
    const objects = twin.scene.children;
    if (twin.mode === 'macro') {
      const landscape = twin.routeLandscape?.children || [];
      const terrain = landscape.find(object => object.geometry?.getAttribute('color'));
      const crowns = landscape.find(object => object.isInstancedMesh && object.instanceColor);
      return {
        terrain: saveColorAttribute(terrain?.geometry.getAttribute('color')),
        heights: terrain?.geometry.getAttribute('position'),
        crowns: saveColorAttribute(crowns?.instanceColor)
      };
    }
    if (twin.mode === 'road') {
      const ground = objects.find(object => object.isMesh && object.geometry?.type === 'PlaneGeometry' && object.position.y < 0);
      const median = objects.find(object => object.isMesh && object.geometry?.parameters?.width >= 200 && object.geometry.parameters.depth < 2 && object.position.z === 0);
      const shrubs = objects.find(object => object.isInstancedMesh && object.geometry?.type === 'ConeGeometry');
      return { ground, plants: [median, shrubs].filter(Boolean) };
    }
    if (twin.mode === 'tunnel') {
      return {
        ground: twin.draftingSurface?.[0],
        portals: objects.filter(object => object.isPointLight && Math.abs(object.position.x) === 90 && object.position.z === 0)
      };
    }
    return {};
  }

  function getState(twin) {
    if (states.has(twin)) return states.get(twin);
    const surfaces = findOutdoorSurfaces(twin);
    const ground = surfaces.ground?.material?.color.clone();
    const plants = (surfaces.plants || []).map(plant => plant.material.color.clone());
    const state = { surfaces, ground, plants, season: 'summer', weather: 'clear', particles: null, frameTime: 0 };
    states.set(twin, state);
    return state;
  }

  function applySeason(state) {
    const { terrain, heights, crowns, ground, plants = [] } = state.surfaces;
    const palette = seasons[state.season];
    const isWinter = state.season === 'winter';
    const tint = palette.land == null ? null : linear(palette.land);
    if (terrain) {
      const { attribute, original } = terrain;
      if (!tint) attribute.array.set(original);
      else {
        const current = new THREE.Color();
        for (let i = 0; i < attribute.count; i++) {
          const p = i * 3;
          const height = heights.getY(i);
          // Leave wet river margins and the paved shoulders visible in winter.
          const coverage = isWinter ? (height > 2 ? 0.78 + Math.min(height / 600, 0.13) : 0.38) : 0.32;
          current.setRGB(original[p], original[p + 1], original[p + 2]).lerp(tint, coverage);
          attribute.setXYZ(i, current.r, current.g, current.b);
        }
      }
      attribute.needsUpdate = true;
    }
    if (crowns) {
      const { attribute, original } = crowns;
      if (!palette.plants) attribute.array.set(original);
      else {
        const colors = palette.plants.map(linear);
        const current = new THREE.Color();
        for (let i = 0; i < attribute.count; i++) {
          current.copy(colors[(i * 13 + Math.floor(i / 7)) % colors.length]).multiplyScalar(0.7 + (i % 17) / 50);
          attribute.setXYZ(i, current.r, current.g, current.b);
        }
      }
      attribute.needsUpdate = true;
    }
    if (ground) {
      ground.material.color.copy(state.ground);
      if (tint) ground.material.color.lerp(tint, isWinter ? 0.7 : 0.32);
    }
    plants.forEach((plant, index) => {
      plant.material.color.copy(state.plants[index]);
      if (palette.plants) plant.material.color.lerp(linear(palette.plants[index]), 0.8);
    });
  }

  function applyAtmosphere(twin, state) {
    const day = twin.time === 'day';
    const { sky, sun } = weatherTypes[state.weather];
    const palette = seasons[state.season];
    const background = twin.scene.background;
    const outdoor = twin.mode === 'macro' || twin.mode === 'road';
    if (outdoor) {
      if (day && palette.sky != null) background.lerp(new THREE.Color(palette.sky), 0.48);
      if (sky != null) {
        background.lerp(new THREE.Color(sky), day ? 0.78 : 0.17);
        twin.sun.intensity *= sun;
        if (twin.starPoints) twin.starPoints.visible = false;
      }
    } else if (twin.mode === 'tunnel') {
      (state.surfaces.portals || []).forEach(light => {
        light.color.set(palette.portal);
        light.intensity = (day ? 0.8 : 0.34) * sun;
      });
      if (!day) background.set(0x050a15);
      if (sky != null) background.lerp(new THREE.Color(sky), day ? 0.25 : 0.13);
    } else {
      // A sealed room keeps its own lights and simulation independent of outside weather.
      if (!day) background.set(0x060a12);
      if (palette.sky != null) background.lerp(new THREE.Color(palette.sky), day ? 0.08 : 0.04);
      if (sky != null) background.lerp(new THREE.Color(sky), day ? 0.22 : 0.13);
    }
  }

  function makeFlakeTexture() {
    const side = 16;
    const pixels = new Uint8Array(side * side * 4);
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
      const i = (y * side + x) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
      pixels[i + 3] = Math.round(255 * Math.max(0, Math.min(1, (7 - Math.hypot(x - 7.5, y - 7.5)) / 3)));
    }
    const texture = new THREE.DataTexture(pixels, side, side, THREE.RGBAFormat);
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }

  function makeParticles(twin, rain) {
    const tunnel = twin.mode === 'tunnel';
    const macro = twin.mode === 'macro';
    const count = tunnel ? 320 : macro ? 1000 : 700;
    const span = macro ? [360, 205, 185] : tunnel ? [60, 45, 54] : [185, 110, 125];
    const data = new Float32Array(count * 4);
    const vertices = new Float32Array(count * (rain ? 6 : 3));
    for (let i = 0; i < count; i++) {
      const p = i * 4;
      const x = tunnel ? (96 + Math.random() * span[0]) * (i % 2 ? -1 : 1) : (Math.random() * 2 - 1) * span[0];
      data[p] = x;
      data[p + 1] = Math.random() * span[2];
      data[p + 2] = (Math.random() * 2 - 1) * span[1];
      data[p + 3] = 0.65 + Math.random() * 0.7;
    }
    const geometry = new THREE.BufferGeometry();
    const attribute = new THREE.BufferAttribute(vertices, 3).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', attribute);
    const material = rain
      ? new THREE.LineBasicMaterial({ color: 0xb8d8f6, transparent: true, opacity: 0.62, depthWrite: false })
      : new THREE.PointsMaterial({ color: 0xf2f9ff, size: 3.1, sizeAttenuation: false, map: makeFlakeTexture(), transparent: true, opacity: 0.78, depthWrite: false });
    const object = rain ? new THREE.LineSegments(geometry, material) : new THREE.Points(geometry, material);
    object.name = rain ? 'environment-rain' : 'environment-snow';
    object.frustumCulled = false;
    twin.scene.add(object);
    const effect = { object, data, attribute, rain, span, tunnel, speed: rain ? (macro ? 112 : 62) : (macro ? 15 : 8), length: macro ? 8 : 4, time: 0 };
    moveParticles(effect, 0);
    return effect;
  }

  function moveParticles(effect, step) {
    const { data, attribute, rain, span, tunnel, speed, length } = effect;
    const vertices = attribute.array;
    effect.time += step;
    for (let i = 0, v = 0; i < data.length; i += 4) {
      data[i + 1] -= speed * step * data[i + 3];
      if (data[i + 1] < -2) data[i + 1] = span[2];
      const drift = rain ? Math.min(8, data[i + 1] * 0.07) : Math.sin(effect.time * 0.9 + i) * 1.8;
      const x = data[i] + (tunnel && data[i] < 0 ? -drift : drift);
      const y = data[i + 1], z = data[i + 2];
      vertices[v++] = x;
      vertices[v++] = y;
      vertices[v++] = z;
      if (rain) {
        vertices[v++] = x + (tunnel && x < 0 ? -length * 0.22 : length * 0.22);
        vertices[v++] = y + length;
        vertices[v++] = z;
      }
    }
    attribute.needsUpdate = true;
  }

  function setPrecipitation(twin, state) {
    if (state.particles) {
      const { object } = state.particles;
      twin.scene.remove(object);
      object.geometry.dispose();
      object.material.map?.dispose();
      object.material.dispose();
      state.particles = null;
    }
    if (twin.mode !== 'room' && (state.weather === 'rain' || state.weather === 'snow')) {
      state.particles = makeParticles(twin, state.weather === 'rain');
      state.frameTime = performance.now();
    }
  }

  const { applyTime, applyFog, loop } = Twin.prototype;
  Twin.prototype.applyTime = function () {
    applyTime.call(this);
    const state = states.get(this);
    if (state) applyAtmosphere(this, state);
  };
  Twin.prototype.applyFog = function () {
    applyFog.call(this);
    const state = states.get(this);
    if (state && this.mode !== 'room') {
      const haze = this.mode === 'tunnel' ? Math.sqrt(weatherTypes[state.weather].haze) : weatherTypes[state.weather].haze;
      this.scene.fog.near *= haze;
      this.scene.fog.far *= haze;
    }
  };
  Twin.prototype.loop = function () {
    const state = states.get(this);
    if (!this.dead && state?.particles) {
      const now = performance.now();
      const step = Math.min(0.05, (now - state.frameTime) / 1000);
      state.frameTime = now;
      moveParticles(state.particles, step);
    }
    loop.call(this);
  };

  Twin.prototype.setEnvironment = function (season, weather) {
    if (this.dead || this.fallbackEl || !this.renderer || !this.scene?.background?.isColor) return false;
    if (!Object.hasOwn(seasons, season) || !Object.hasOwn(weatherTypes, weather)) return false;
    const state = getState(this);
    if (state.season !== season) {
      state.season = season;
      applySeason(state);
    }
    if (state.weather !== weather) {
      state.weather = weather;
      setPrecipitation(this, state);
    }
    this.applyTime();
    this.applyFog();
    return true;
  };
})();

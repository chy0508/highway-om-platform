/* 场景漫游与预设视角 */
(function () {
  'use strict';
  const prototype = window.Twin?.Twin?.prototype;
  if (!prototype) return;

  const tours = new WeakMap();
  const frameLimit = 50;

  const pose = (x, y, z, r, theta, phi) => ({ x, y, z, r, theta, phi });
  const step = (duration, view) => ({ duration, view });

  function fitRadius(twin, minimum, halfWidth) {
    const aspect = Math.max(.45, twin.camera.aspect || 1);
    const fit = halfWidth / (Math.tan(Math.PI * 25 / 180) * aspect * .9);
    return Math.min(twin.rMax, Math.max(minimum, fit));
  }

  function preset(twin, name) {
    const options = {
      macro: {
        overview: () => pose(0, 4, 0, fitRadius(twin, 450, 280), .50, .94),
        top: () => pose(0, 4, 0, fitRadius(twin, 415, 305), 0, .20),
        side: () => pose(0, 10, 0, fitRadius(twin, 430, 300), .10, 1.24),
        close: () => pose(-104, 8, 0, 105, -.42, 1.06)
      },
      road: {
        overview: () => pose(0, 1, 0, fitRadius(twin, 170, 116), .46, .88),
        top: () => pose(0, 1, 0, fitRadius(twin, 168, 135), 0, .21),
        side: () => pose(0, 1, 0, fitRadius(twin, 145, 132), .05, 1.27),
        close: () => pose(-18, 2, 0, 49, -1.12, 1.29)
      },
      tunnel: {
        overview: () => twin.detailLandscape?.visible ? twin.tunnelExteriorView() : pose(0, 0, 0, fitRadius(twin, 128, 74), .65, .93),
        top: () => pose(0, 0, 0, fitRadius(twin, 132, 95), 0, .22),
        side: () => pose(0, 1, 0, fitRadius(twin, 111, 95), .06, 1.24),
        close: () => pose(-45, -.7, 0, 25, -1.45, 1.52)
      },
      room: {
        overview: () => pose(0, 1, 0, fitRadius(twin, 63, 35), .38, .87),
        top: () => pose(0, 1, 0, fitRadius(twin, 57, 36), 0, .22),
        side: () => pose(0, 2, 0, fitRadius(twin, 57, 35), .13, 1.22),
        close: () => pose(-7, 1.4, -4, 13, -.98, 1.50)
      }
    };
    return options[twin.mode]?.[name]?.();
  }

  // Each route is set in the local coordinates of its scene. Targets follow
  // the road, tunnel lane or equipment aisles instead of orbiting one point.
  const routes = {
    macro: [
      step(4200, pose(-221, 9, 0, 163, -.44, .83)),
      step(5200, pose(-95, 11, -4, 141, -.18, .72)),
      step(5200, pose(72, 11, 4, 142, .18, .74)),
      step(5000, pose(215, 10, 0, 168, .49, .81))
    ],
    road: [
      step(3600, pose(-84, 2, 0, 60, -1.03, 1.18)),
      step(4700, pose(-30, 2, 0, 52, -.68, 1.24)),
      step(4400, pose(34, 2, 0, 60, -.32, 1.15)),
      step(4200, pose(98, 2, 0, 63, .11, 1.12))
    ],
    tunnel: [
      step(3900, pose(-62, -.7, 0, 26, -1.44, 1.51)),
      step(4500, pose(-20, -.7, 0, 25, -1.48, 1.52)),
      step(4400, pose(21, -.6, 0, 25, -1.52, 1.51)),
      step(4400, pose(69, -.4, 0, 26, -1.45, 1.49))
    ],
    room: [
      step(3500, pose(-18, 1.5, 7, 15, -.86, 1.43)),
      step(4400, pose(-10, 1.6, -2, 14, -.60, 1.48)),
      step(4400, pose(7, 1.65, -4, 15, -.98, 1.48)),
      step(4400, pose(19, 1.6, -7, 16, -1.25, 1.45))
    ]
  };

  function supportsCamera(twin) {
    return !twin.dead && !twin.fallbackEl && !!(twin.camera && twin.targetGoal && twin.renderer?.domElement);
  }

  function currentView(twin) {
    const { x, y, z } = twin.target;
    const { r, theta, phi } = twin.sph;
    return pose(x, y, z, r, theta, phi);
  }

  function nearestAngle(theta, target) {
    const distance = target - theta;
    return theta + Math.atan2(Math.sin(distance), Math.cos(distance));
  }

  function applyView(twin, view) {
    twin.targetGoal.set(view.x, view.y, view.z);
    twin.goal.r = view.r;
    twin.goal.phi = view.phi;
    twin.goal.theta = view.theta;
  }

  function finishTour(twin, holdView, notify = true) {
    const tour = tours.get(twin);
    if (!tour) return false;
    tours.delete(twin);
    tour.listeners.abort();
    if (holdView) applyView(twin, currentView(twin));
    twin.autoRotate = tour.autoRotate;
    twin.lastInteract = performance.now();
    if (notify) tour.onState?.('idle');
    return true;
  }

  function advance(twin, tour, now) {
    if (tour.lastFrame === null) tour.lastFrame = now;
    tour.elapsed += Math.min(frameLimit, Math.max(0, now - tour.lastFrame));
    tour.lastFrame = now;
    const segment = tour.path[tour.index];
    const start = tour.index ? tour.path[tour.index - 1].view : tour.start;
    const end = segment.view;
    const t = Math.min(1, tour.elapsed / segment.duration);
    const ease = t * t * (3 - 2 * t);
    const mix = (a, b) => a + (b - a) * ease;
    applyView(twin, pose(
      mix(start.x, end.x), mix(start.y, end.y), mix(start.z, end.z),
      mix(start.r, end.r), mix(start.theta, end.theta), mix(start.phi, end.phi)
    ));
    if (t < 1) return;
    tour.elapsed -= segment.duration;
    tour.index++;
    if (tour.index === tour.path.length) finishTour(twin, false);
  }

  Object.defineProperty(prototype, 'tourState', {
    get() { return tours.get(this)?.state || 'idle'; }
  });

  prototype.startTour = function (onState) {
    if (!supportsCamera(this) || !routes[this.mode]) return false;
    const existing = tours.get(this);
    if (existing?.state === 'playing') return false;
    if (existing) {
      if (typeof onState === 'function') existing.onState = onState;
      existing.state = 'playing';
      existing.lastFrame = null;
      this.autoRotate = false;
      existing.onState?.('playing');
      return true;
    }

    const start = currentView(this);
    let previousAngle = start.theta;
    const sections = [...routes[this.mode], step(4200, preset(this, 'overview'))];
    const path = sections.map(({ duration, view }) => {
      const theta = nearestAngle(previousAngle, view.theta);
      previousAngle = theta;
      return step(duration, { ...view, theta });
    });
    const listeners = new AbortController();
    const tour = {
      state: 'playing', onState: typeof onState === 'function' ? onState : null,
      autoRotate: this.autoRotate, lastFrame: null, elapsed: 0, index: 0, start, path, listeners
    };
    tours.set(this, tour);
    this.autoRotate = false;
    const canvas = this.renderer.domElement;
    const interrupt = () => this.stopTour();
    const options = { capture: true, passive: true, signal: listeners.signal };
    canvas.addEventListener('pointerdown', interrupt, options);
    canvas.addEventListener('wheel', interrupt, options);
    tour.onState?.('playing');
    return true;
  };

  prototype.pauseTour = function () {
    const tour = tours.get(this);
    if (tour?.state !== 'playing') return false;
    tour.state = 'paused';
    applyView(this, currentView(this));
    tour.onState?.('paused');
    return true;
  };

  prototype.stopTour = function () { return finishTour(this, true); };

  prototype.setPresetView = function (name) {
    if (!supportsCamera(this)) {
      if (name === 'overview' || name === 'top') this.fallbackMap?.resetView();
      return false;
    }
    const view = preset(this, name);
    if (!view) return false;
    this.stopTour();
    view.theta = nearestAngle(this.sph.theta, view.theta);
    applyView(this, view);
    this.lastInteract = performance.now();
    return true;
  };

  const renderFrame = prototype.loop;
  prototype.loop = function () {
    const tour = tours.get(this);
    if (tour?.state === 'playing' && !this.dead) advance(this, tour, performance.now());
    return renderFrame.call(this);
  };

  for (const method of ['setView', 'resetView', 'focus', 'focusEvent']) {
    const previous = prototype[method];
    prototype[method] = function (...args) {
      this.stopTour();
      return previous.apply(this, args);
    };
  }

  const destroy = prototype.destroy;
  prototype.destroy = function () {
    finishTour(this, false, false);
    return destroy.call(this);
  };
})();

import * as THREE from 'three';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { vertexShader, fragmentShader } from './shaders.js';

gsap.registerPlugin(ScrollTrigger);

// ---------------------------------------------------------------------------
// CONFIG — single source of truth for the spiral's look and motion.
// ---------------------------------------------------------------------------

const CONFIG = {
  totalImages: 10,
  tilesPerRevolution: 15,
  revolutions: 5,
  startRadius: 5,
  endRadius: 3.5,
  tileHeightRatio: 1.1,
  tileSegments: 24,
  spiralGap: 0.35,
  tileOverlap: 0.005,
  cameraZ: 12,
  cameraSmoothing: 0.075,
  baseRotationSpeed: 0.001,
  scrollRotationMultiplier: 0.0035,
  rotationDecay: 0.9,
  scrollMultiplier: 1.25,
  cameraYMultiplier: 0.2,
  parallaxStrength: 0.1,
  spiralOffsetY: -2.0,
};

const heroSection = document.querySelector('.hero');

const state = {
  isMobile: window.innerWidth < 768,
  width: heroSection.clientWidth,
  height: heroSection.clientHeight,
  scrollProgress: 0,
  scrollVelocity: 0,
  spinVelocity: 0,
  targetCameraY: 0,
  currentCameraY: 0,
  mouseX: 0,
  mouseY: 0,
  targetTiltX: 0,
  targetTiltZ: 0,
  currentTiltX: 0,
  currentTiltZ: 0,
};

// ---------------------------------------------------------------------------
// Lenis smooth scrolling — wired before WebGL so the page feels smooth from
// the first interaction even while textures stream in.
// ---------------------------------------------------------------------------

const lenis = new Lenis({
  duration: 1.2,
  smoothWheel: true,
  smoothTouch: false,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
});

lenis.on('scroll', ({ scroll, limit, velocity }) => {
  const max = Math.max(limit, 1);
  state.scrollProgress = Math.min(scroll / max, 1);
  state.scrollVelocity = velocity;
  state.spinVelocity +=
    velocity * CONFIG.scrollRotationMultiplier * CONFIG.scrollMultiplier;
});

// Keep ScrollTrigger in sync with Lenis so reveals fire at the right scroll
// positions even though Lenis is interpolating wheel events.
lenis.on('scroll', ScrollTrigger.update);

function onMouseMove(event) {
  if (state.isMobile) return;
  state.mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  state.mouseY = (event.clientY / window.innerHeight) * 2 - 1;
  state.targetTiltX = state.mouseY * CONFIG.parallaxStrength;
  state.targetTiltZ = state.mouseX * CONFIG.parallaxStrength * -0.5;
}
window.addEventListener('mousemove', onMouseMove);

function lenisRaf(time) {
  lenis.raf(time);
  requestAnimationFrame(lenisRaf);
}
requestAnimationFrame(lenisRaf);

// ---------------------------------------------------------------------------
// Scroll reveals — slow, cinematic fade-up for every `.reveal-text` block
// below the hero. Each element gets its own ScrollTrigger so the reveals
// stagger naturally with how the user scrolls, not on a fixed clock.
//
// Project is vanilla JS, but we still wrap in `gsap.context()` so all
// triggers can be reverted as a group when Vite hot-reloads this module —
// otherwise duplicates would pile up on every save.
// ---------------------------------------------------------------------------

const revealCtx = gsap.context(() => {
  gsap.utils.toArray('.reveal-text').forEach((el) => {
    gsap.fromTo(
      el,
      { opacity: 0, y: 50 },
      {
        opacity: 1,
        y: 0,
        duration: 1.4,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 80%',
          toggleActions: 'play none none none',
          // once it's revealed, leave it alone — feels less like a UI gimmick
          once: true,
        },
      }
    );
  });
});

// Recompute trigger positions once everything (fonts, images, WebGL) has
// fully loaded so the reveal "top 80%" lines up with the final layout.
window.addEventListener('load', () => ScrollTrigger.refresh());

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    revealCtx.revert();
  });
}

// ---------------------------------------------------------------------------
// Three.js — deferred until after the headline has painted so it doesn't
// compete with LCP.
// ---------------------------------------------------------------------------

let scene;
let camera;
let renderer;
let spiral;
let clock;

const totalTiles = CONFIG.tilesPerRevolution * CONFIG.revolutions;
const angleStep = (Math.PI * 2) / CONFIG.tilesPerRevolution;

const textureLoader = new THREE.TextureLoader();

function loadTexture(url) {
  return new Promise((resolve) => {
    textureLoader.load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        if (renderer) {
          texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        }
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        resolve(texture);
      },
      undefined,
      () => {
        const fallback = new THREE.DataTexture(
          new Uint8Array([22, 22, 24, 255]),
          1,
          1,
          THREE.RGBAFormat
        );
        fallback.needsUpdate = true;
        resolve(fallback);
      }
    );
  });
}

const textureUrls = Array.from(
  { length: CONFIG.totalImages },
  (_, i) => `/images/img${i + 1}.jpg`
);

// ---------------------------------------------------------------------------
// Curved tile geometry — a strip of a cylinder wall, not a flat plane.
// Each tile follows a sin/cos curve so the spiral reads as one continuous
// surface rather than a series of facets.
// ---------------------------------------------------------------------------

function createCurvedTileGeometry(radius, arcAngle, tileHeight, segments) {
  const geometry = new THREE.BufferGeometry();

  const positions = [];
  const uvs = [];
  const indices = [];

  const halfArc = arcAngle / 2;
  const halfHeight = tileHeight / 2;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const theta = -halfArc + arcAngle * t;
    const x = Math.sin(theta) * radius;
    const z = Math.cos(theta) * radius;

    positions.push(x, halfHeight, z);
    positions.push(x, -halfHeight, z);

    uvs.push(t, 1);
    uvs.push(t, 0);
  }

  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;

    indices.push(a, b, c);
    indices.push(b, d, c);
  }

  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

function buildSpiral(textures) {
  const arcAngle = angleStep + CONFIG.tileOverlap;
  // Anchor tile height to the chord length at the start radius so each
  // tile reads as proportional even as the radius tapers down the helix.
  const chord = 2 * CONFIG.startRadius * Math.sin(angleStep / 2);
  const tileHeight = chord * CONFIG.tileHeightRatio;

  const totalHeight = (totalTiles - 1) * CONFIG.spiralGap;
  const startY = totalHeight / 2;

  for (let i = 0; i < totalTiles; i++) {
    const progress = totalTiles === 1 ? 0 : i / (totalTiles - 1);
    const radius =
      CONFIG.startRadius + (CONFIG.endRadius - CONFIG.startRadius) * progress;

    const geometry = createCurvedTileGeometry(
      radius,
      arcAngle,
      tileHeight,
      CONFIG.tileSegments
    );

    const texture = textures[i % textures.length];

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uMap: { value: texture },
        uCameraPosition: { value: camera.position },
      },
      side: THREE.DoubleSide,
      transparent: true,
    });

    const tile = new THREE.Mesh(geometry, material);
    tile.position.y = startY - i * CONFIG.spiralGap;
    tile.rotation.y = i * angleStep;
    spiral.add(tile);
  }
}

function onResize() {
  state.isMobile = window.innerWidth < 768;
  state.width = heroSection.clientWidth;
  state.height = heroSection.clientHeight;

  if (!camera || !renderer) return;

  camera.aspect = state.width / state.height;
  camera.position.z = CONFIG.cameraZ + (state.isMobile ? 3 : 0);
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(state.width, state.height);

  if (state.isMobile) {
    state.targetTiltX = 0;
    state.targetTiltZ = 0;
  }
}
window.addEventListener('resize', onResize);

function tick() {
  if (renderer && camera && scene && spiral && clock) {
    clock.getDelta();

    spiral.rotation.y += CONFIG.baseRotationSpeed + state.spinVelocity;
    state.spinVelocity *= CONFIG.rotationDecay;

    if (!state.isMobile) {
      state.currentTiltX +=
        (state.targetTiltX - state.currentTiltX) * CONFIG.cameraSmoothing;
      state.currentTiltZ +=
        (state.targetTiltZ - state.currentTiltZ) * CONFIG.cameraSmoothing;
      spiral.rotation.x = state.currentTiltX;
      spiral.rotation.z = state.currentTiltZ;
    }

    state.targetCameraY =
      -state.scrollProgress * CONFIG.cameraYMultiplier * 10;
    state.currentCameraY +=
      (state.targetCameraY - state.currentCameraY) * CONFIG.cameraSmoothing;
    camera.position.y = state.currentCameraY;
    camera.lookAt(0, state.currentCameraY * 0.4, 0);

    renderer.render(scene, camera);
  }
  requestAnimationFrame(tick);
}

function initThreeJs() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    45,
    state.width / state.height,
    0.1,
    100
  );
  camera.position.set(0, 0, CONFIG.cameraZ + (state.isMobile ? 3 : 0));

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(state.width, state.height);
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.classList.add('hero__canvas');
  heroSection.appendChild(renderer.domElement);

  spiral = new THREE.Group();
  spiral.position.y = CONFIG.spiralOffsetY;
  scene.add(spiral);

  clock = new THREE.Clock();

  requestAnimationFrame(tick);

  Promise.all(textureUrls.map(loadTexture)).then((textures) => {
    buildSpiral(textures);
    renderer.domElement.classList.add('is-ready');
  });
}

if ('requestIdleCallback' in window) {
  requestIdleCallback(initThreeJs, { timeout: 1500 });
} else {
  requestAnimationFrame(() => requestAnimationFrame(initThreeJs));
}

import * as THREE from 'three';

export const ADDITIVE_OPACITY_MIN = 0.36;
export const ADDITIVE_OPACITY_MAX = 0.86;

/**
 * Enforces balanced additive blending intensity limits [0.36 .. 0.86] for crisp non-transparent VFX.
 * Allows subtle lower opacities (down to 0.18) for passive shields, barriers, and ground telegraphs
 * when `allowLower` is set, while preventing multi-layer whiteout stacking.
 */
export function clampAdditiveOpacity(opacity: number, allowLower = false): number {
  if (!Number.isFinite(opacity)) return ADDITIVE_OPACITY_MIN;
  const low = allowLower ? 0.18 : ADDITIVE_OPACITY_MIN;
  return Math.max(low, Math.min(ADDITIVE_OPACITY_MAX, opacity));
}

export interface VFXTextureAtlas {
  coreGlowTex: THREE.CanvasTexture | null;
  smokePuffTex: THREE.CanvasTexture | null;
  scrollingTurbulenceTex: THREE.CanvasTexture | null;
  scrollingMagmaTex: THREE.CanvasTexture | null;
  scrollingEnergyTex: THREE.CanvasTexture | null;
  scrollingWindTex: THREE.CanvasTexture | null;
  taperedSlashTex: THREE.CanvasTexture | null;
  spiderwebCraterTex: THREE.CanvasTexture | null;
  shockRingTex: THREE.CanvasTexture | null;
  allTextures: THREE.CanvasTexture[];
  dispose: () => void;
  updateScrolling: (dt: number) => void;
}

// Deterministic fast hash noise in [0..1] for seamless periodic textures
function hash2(ix: number, iy: number, period: number, seed: number): number {
  const x = ((ix % period) + period) % period;
  const y = ((iy % period) + period) % period;
  let n = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  n = (n ^ (n >> 13)) * 1274126177;
  n = n ^ (n >> 16);
  return (n >>> 0) / 4294967295;
}

function periodicValueNoise(u: number, v: number, freq: number, seed: number): number {
  const x = u * freq;
  const y = v * freq;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const n00 = hash2(x0, y0, freq, seed);
  const n10 = hash2(x0 + 1, y0, freq, seed);
  const n01 = hash2(x0, y0 + 1, freq, seed);
  const n11 = hash2(x0 + 1, y0 + 1, freq, seed);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function periodicFbm(u: number, v: number, baseFreq: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.52;
  let norm = 0;
  let freq = baseFreq;
  for (let o = 0; o < octaves; o++) {
    sum += amp * periodicValueNoise(u, v, freq, seed + o * 31);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / Math.max(0.0001, norm);
}

/**
 * Generates all 5 procedural startup textures once at initialization (zero runtime allocation).
 * Safely returns null textures in headless Node environments without `document`.
 */
export function createVFXTextureAtlas(): VFXTextureAtlas {
  const allTextures: THREE.CanvasTexture[] = [];

  if (typeof document === 'undefined') {
    return {
      coreGlowTex: null,
      smokePuffTex: null,
      scrollingTurbulenceTex: null,
      scrollingMagmaTex: null,
      scrollingEnergyTex: null,
      scrollingWindTex: null,
      taperedSlashTex: null,
      spiderwebCraterTex: null,
      shockRingTex: null,
      allTextures,
      dispose: () => {},
      updateScrolling: () => {},
    };
  }

  // 1. Soft-Falloff Saturated Core Glow (intense core fading smoothly into rich saturated shell)
  const coreCanvas = document.createElement('canvas');
  coreCanvas.width = 128;
  coreCanvas.height = 128;
  const coreCtx = coreCanvas.getContext('2d');
  if (coreCtx) {
    const rad = coreCtx.createRadialGradient(64, 64, 1, 64, 64, 62);
    rad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    rad.addColorStop(0.20, 'rgba(255, 255, 255, 0.96)');
    rad.addColorStop(0.45, 'rgba(255, 255, 255, 0.56)');
    rad.addColorStop(0.74, 'rgba(255, 255, 255, 0.18)');
    rad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    coreCtx.fillStyle = rad;
    coreCtx.fillRect(0, 0, 128, 128);
  }
  const coreGlowTex = new THREE.CanvasTexture(coreCanvas);
  coreGlowTex.colorSpace = THREE.SRGBColorSpace;
  coreGlowTex.needsUpdate = true;
  allTextures.push(coreGlowTex);

  // 2. Billowing Organic Smoke & Cloud Puff (NormalBlending volumetric dust/charcoal/storm sprites)
  const smokeCanvas = document.createElement('canvas');
  smokeCanvas.width = 160;
  smokeCanvas.height = 160;
  const smokeCtx = smokeCanvas.getContext('2d');
  if (smokeCtx) {
    const img = smokeCtx.createImageData(160, 160);
    const data = img.data;
    for (let y = 0; y < 160; y++) {
      for (let x = 0; x < 160; x++) {
        const dx = (x - 80) / 72;
        const dy = (y - 80) / 72;
        const dist = Math.hypot(dx, dy);
        const lobeAngle = Math.atan2(dy, dx);
        const lobeWarp = 1 + 0.14 * Math.sin(lobeAngle * 5 + 0.8) + 0.08 * Math.cos(lobeAngle * 3 - 0.5);
        const falloff = Math.max(0, 1 - dist / lobeWarp);
        const smoothEdge = falloff * falloff * (3 - 2 * falloff);
        const n = periodicFbm(x / 160, y / 160, 4, 4, 17);
        const nDetail = periodicFbm(x / 160, y / 160, 8, 3, 53);
        const billow = Math.min(1, Math.max(0, smoothEdge * (0.42 + n * 0.65 + nDetail * 0.25)));
        const topLight = Math.max(0, -dy * 0.16);
        const shade = Math.round(Math.min(255, 138 + n * 78 + nDetail * 28 + topLight * 55));
        const idx = (y * 160 + x) * 4;
        data[idx] = shade;
        data[idx + 1] = shade;
        data[idx + 2] = shade;
        data[idx + 3] = Math.round(billow * 245);
      }
    }
    smokeCtx.putImageData(img, 0, 0);
  }
  const smokePuffTex = new THREE.CanvasTexture(smokeCanvas);
  smokePuffTex.colorSpace = THREE.SRGBColorSpace;
  smokePuffTex.needsUpdate = true;
  allTextures.push(smokePuffTex);

  // 3a. Seamless Scrolling Flame / General Turbulence (RepeatWrapping)
  const turbCanvas = document.createElement('canvas');
  turbCanvas.width = 256;
  turbCanvas.height = 256;
  const turbCtx = turbCanvas.getContext('2d');
  if (turbCtx) {
    const img = turbCtx.createImageData(256, 256);
    const data = img.data;
    for (let y = 0; y < 256; y++) {
      const v = y / 256;
      for (let x = 0; x < 256; x++) {
        const u = x / 256;
        const warpX = periodicFbm(u, v, 4, 3, 5);
        const warpY = periodicFbm(u, v, 4, 3, 19);
        const n1 = periodicFbm(u + warpX * 0.24, v + warpY * 0.24, 6, 4, 41);
        const ridge = 1 - Math.abs(n1 * 2 - 1);
        const intensity = Math.min(1, Math.max(0, 0.18 + n1 * 0.42 + ridge * ridge * 0.56));
        const val = Math.round(intensity * 255);
        const alpha = Math.round(Math.min(1, 0.24 + intensity * 0.82) * 255);
        const idx = (y * 256 + x) * 4;
        data[idx] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
        data[idx + 3] = alpha;
      }
    }
    turbCtx.putImageData(img, 0, 0);
  }
  const scrollingTurbulenceTex = new THREE.CanvasTexture(turbCanvas);
  scrollingTurbulenceTex.wrapS = THREE.RepeatWrapping;
  scrollingTurbulenceTex.wrapT = THREE.RepeatWrapping;
  scrollingTurbulenceTex.repeat.set(1.5, 1.5);
  scrollingTurbulenceTex.colorSpace = THREE.SRGBColorSpace;
  scrollingTurbulenceTex.needsUpdate = true;
  allTextures.push(scrollingTurbulenceTex);

  // 3b. Dedicated High-Contrast Molten Magma & Flame Flow
  const magmaCanvas = document.createElement('canvas');
  magmaCanvas.width = 256;
  magmaCanvas.height = 256;
  const magmaCtx = magmaCanvas.getContext('2d');
  if (magmaCtx) {
    const img = magmaCtx.createImageData(256, 256);
    const data = img.data;
    for (let y = 0; y < 256; y++) {
      const v = y / 256;
      for (let x = 0; x < 256; x++) {
        const u = x / 256;
        const w = periodicFbm(u, v, 4, 3, 67);
        const cell = periodicFbm(u + w * 0.28, v * 1.0 - w * 0.18, 5, 4, 83);
        const vein = Math.pow(Math.max(0, 1 - Math.abs(cell * 2 - 1) * 1.45), 1.8);
        const intensity = Math.min(1, Math.max(0, 0.12 + cell * 0.28 + vein * 0.78));
        const val = Math.round(intensity * 255);
        const alpha = Math.round(Math.min(1, 0.28 + vein * 0.72 + cell * 0.18) * 255);
        const idx = (y * 256 + x) * 4;
        data[idx] = val;
        data[idx + 1] = Math.round(val * 0.92);
        data[idx + 2] = Math.round(val * 0.85);
        data[idx + 3] = alpha;
      }
    }
    magmaCtx.putImageData(img, 0, 0);
  }
  const scrollingMagmaTex = new THREE.CanvasTexture(magmaCanvas);
  scrollingMagmaTex.wrapS = THREE.RepeatWrapping;
  scrollingMagmaTex.wrapT = THREE.RepeatWrapping;
  scrollingMagmaTex.repeat.set(1.6, 1.8);
  scrollingMagmaTex.colorSpace = THREE.SRGBColorSpace;
  scrollingMagmaTex.needsUpdate = true;
  allTextures.push(scrollingMagmaTex);

  // 3c. Dedicated Crisp Plasma / Energy Filaments
  const energyCanvas = document.createElement('canvas');
  energyCanvas.width = 256;
  energyCanvas.height = 256;
  const energyCtx = energyCanvas.getContext('2d');
  if (energyCtx) {
    const img = energyCtx.createImageData(256, 256);
    const data = img.data;
    for (let y = 0; y < 256; y++) {
      const v = y / 256;
      for (let x = 0; x < 256; x++) {
        const u = x / 256;
        const w = periodicFbm(u, v, 3, 3, 97);
        const band = Math.sin((u * 3 + v * 2 + w * 0.85) * Math.PI * 2);
        const filament = Math.pow(Math.max(0, 1 - Math.abs(band) * 1.15), 2.2);
        const arc = periodicFbm(u * 1.0 + w * 0.16, v * 1.0, 6, 3, 109);
        const intensity = Math.min(1, Math.max(0, 0.16 + filament * 0.74 + arc * 0.34));
        const val = Math.round(intensity * 255);
        const alpha = Math.round(Math.min(1, 0.22 + intensity * 0.85) * 255);
        const idx = (y * 256 + x) * 4;
        data[idx] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
        data[idx + 3] = alpha;
      }
    }
    energyCtx.putImageData(img, 0, 0);
  }
  const scrollingEnergyTex = new THREE.CanvasTexture(energyCanvas);
  scrollingEnergyTex.wrapS = THREE.RepeatWrapping;
  scrollingEnergyTex.wrapT = THREE.RepeatWrapping;
  scrollingEnergyTex.repeat.set(2.0, 2.2);
  scrollingEnergyTex.colorSpace = THREE.SRGBColorSpace;
  scrollingEnergyTex.needsUpdate = true;
  allTextures.push(scrollingEnergyTex);

  // 3d. Dedicated Swirling Diagonal Wind Shear Ribbons (for realistic twisting tornadoes & cyclones)
  const windCanvas = document.createElement('canvas');
  windCanvas.width = 256;
  windCanvas.height = 256;
  const windCtx = windCanvas.getContext('2d');
  if (windCtx) {
    const img = windCtx.createImageData(256, 256);
    const data = img.data;
    for (let y = 0; y < 256; y++) {
      const v = y / 256;
      for (let x = 0; x < 256; x++) {
        const u = x / 256;
        const turb = periodicFbm(u, v, 4, 3, 131);
        // Crisp diagonal spiral air streams (periodic integer cycles in u and v)
        const s1 = Math.sin((u * 4 + v * 2 + turb * 0.45) * Math.PI * 2) * 0.5 + 0.5;
        const s2 = Math.sin((u * 8 + v * 3 - turb * 0.35) * Math.PI * 2) * 0.5 + 0.5;
        const streak = Math.pow(s1, 2.4) * 0.68 + Math.pow(s2, 3.2) * 0.48;
        const wisp = Math.min(1, Math.max(0, 0.08 + streak + turb * 0.16));
        const val = Math.round(wisp * 255);
        // Strong alpha contrast so wind gaps remain airy while spiral streams pop crisply
        const alpha = Math.round(Math.min(1, Math.max(0.06, streak * 0.96 + turb * 0.14)) * 255);
        const idx = (y * 256 + x) * 4;
        data[idx] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
        data[idx + 3] = alpha;
      }
    }
    windCtx.putImageData(img, 0, 0);
  }
  const scrollingWindTex = new THREE.CanvasTexture(windCanvas);
  scrollingWindTex.wrapS = THREE.RepeatWrapping;
  scrollingWindTex.wrapT = THREE.RepeatWrapping;
  scrollingWindTex.repeat.set(2.2, 1.4);
  scrollingWindTex.colorSpace = THREE.SRGBColorSpace;
  scrollingWindTex.needsUpdate = true;
  allTextures.push(scrollingWindTex);

  // 4. Tapered High-Velocity Slash & Wind Streak (feathered tips + fine longitudinal filaments)
  const slashCanvas = document.createElement('canvas');
  slashCanvas.width = 256;
  slashCanvas.height = 64;
  const slashCtx = slashCanvas.getContext('2d');
  if (slashCtx) {
    const img = slashCtx.createImageData(256, 64);
    const data = img.data;
    for (let y = 0; y < 64; y++) {
      const v = y / 63; // across ribbon width
      const edgeDist = Math.abs(v - 0.5) * 2;
      const crossFade = Math.pow(Math.max(0, 1 - edgeDist), 1.35);
      const streak =
        0.55 +
        0.25 * Math.sin(v * Math.PI * 10) +
        0.2 * Math.sin(v * Math.PI * 22 + 1.2);
      for (let x = 0; x < 256; x++) {
        const u = x / 255; // along ribbon arc length
        const tipEnv = Math.sin(u * Math.PI);
        const endFade = Math.pow(Math.max(0, tipEnv), 0.7);
        const leadingBias = Math.pow(Math.max(0, 1 - Math.abs(v - 0.56) * 2.1), 1.6);
        const alpha = Math.min(1, Math.max(0, endFade * crossFade * (0.68 + 0.32 * streak)));
        const lum = Math.round(Math.min(255, (0.62 + 0.38 * leadingBias) * 255));
        const idx = (y * 256 + x) * 4;
        data[idx] = lum;
        data[idx + 1] = lum;
        data[idx + 2] = lum;
        data[idx + 3] = Math.round(alpha * 255);
      }
    }
    slashCtx.putImageData(img, 0, 0);
  }
  const taperedSlashTex = new THREE.CanvasTexture(slashCanvas);
  taperedSlashTex.colorSpace = THREE.SRGBColorSpace;
  taperedSlashTex.needsUpdate = true;
  allTextures.push(taperedSlashTex);

  // 6. Feathered Radial Pressure Shockwave Ring (replaces flat solid RingGeometry)
  const shockCanvas = document.createElement('canvas');
  shockCanvas.width = 256;
  shockCanvas.height = 256;
  const shockCtx = shockCanvas.getContext('2d');
  if (shockCtx) {
    const img = shockCtx.createImageData(256, 256);
    const data = img.data;
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const dx = (x - 128) / 124;
        const dy = (y - 128) / 124;
        const r = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        const rays = 0.72 + 0.28 * Math.sin(ang * 18 + r * 6) * Math.cos(ang * 11 - r * 4);
        const outerFade = Math.max(0, Math.min(1, (1.0 - r) / 0.16));
        const innerFade = Math.max(0, Math.min(1, (r - 0.56) / 0.28));
        const crest = Math.exp(-Math.pow((r - 0.85) / 0.095, 2));
        const ringAlpha = Math.min(1, Math.max(0, outerFade * innerFade * (0.45 + 0.55 * crest) * rays));
        const lum = Math.round(Math.min(255, (0.65 + 0.35 * crest) * 255));
        const idx = (y * 256 + x) * 4;
        data[idx] = lum;
        data[idx + 1] = lum;
        data[idx + 2] = lum;
        data[idx + 3] = Math.round(ringAlpha * 255);
      }
    }
    shockCtx.putImageData(img, 0, 0);
  }
  const shockRingTex = new THREE.CanvasTexture(shockCanvas);
  shockRingTex.colorSpace = THREE.SRGBColorSpace;
  shockRingTex.needsUpdate = true;
  allTextures.push(shockRingTex);

  // 5. Radial Spiderweb Crater Fissures & Scorch Decal
  const craterCanvas = document.createElement('canvas');
  craterCanvas.width = 256;
  craterCanvas.height = 256;
  const cCtx = craterCanvas.getContext('2d');
  if (cCtx) {
    cCtx.clearRect(0, 0, 256, 256);
    // Dark organic charcoal scorch center
    const scorch = cCtx.createRadialGradient(128, 128, 6, 128, 128, 118);
    scorch.addColorStop(0.0, 'rgba(15, 14, 16, 0.92)');
    scorch.addColorStop(0.32, 'rgba(24, 22, 26, 0.65)');
    scorch.addColorStop(0.68, 'rgba(28, 25, 23, 0.24)');
    scorch.addColorStop(1.0, 'rgba(28, 25, 23, 0.0)');
    cCtx.fillStyle = scorch;
    cCtx.fillRect(0, 0, 256, 256);

    // Jagged radial spiderweb fissures
    cCtx.lineCap = 'round';
    cCtx.lineJoin = 'round';
    const rays = 14;
    for (let r = 0; r < rays; r++) {
      let ang = (r / rays) * Math.PI * 2 + (hash2(r, 3, 32, 9) - 0.5) * 0.25;
      let px = 128 + Math.cos(ang) * 8;
      let py = 128 + Math.sin(ang) * 8;
      const steps = 6;
      const maxLen = 78 + hash2(r, 7, 32, 13) * 40;
      cCtx.strokeStyle = 'rgba(10, 10, 14, 0.94)';
      cCtx.lineWidth = 3.2 - (r % 3) * 0.55;
      cCtx.beginPath();
      cCtx.moveTo(px, py);
      for (let s = 1; s <= steps; s++) {
        const dist = (s / steps) * maxLen;
        ang += (hash2(r * 7 + s, s, 64, 21) - 0.5) * 0.42;
        const nx = 128 + Math.cos(ang) * dist;
        const ny = 128 + Math.sin(ang) * dist;
        cCtx.lineTo(nx, ny);
        px = nx;
        py = ny;
        // Occasional branching spiderweb fork
        if (s === 2 || s === 4) {
          const forkAng = ang + (s % 2 === 0 ? 0.55 : -0.55);
          const forkLen = 18 + hash2(r, s, 32, 47) * 20;
          cCtx.moveTo(px, py);
          cCtx.lineTo(px + Math.cos(forkAng) * forkLen, py + Math.sin(forkAng) * forkLen);
          cCtx.moveTo(px, py);
        }
      }
      cCtx.stroke();
    }

    // Concentric fractured inner rings
    for (let ring = 0; ring < 2; ring++) {
      const rad = ring === 0 ? 34 : 58;
      cCtx.strokeStyle = ring === 0 ? 'rgba(12, 12, 16, 0.78)' : 'rgba(20, 18, 22, 0.52)';
      cCtx.lineWidth = ring === 0 ? 2.1 : 1.5;
      cCtx.beginPath();
      for (let a = 0; a <= 24; a++) {
        const t = (a / 24) * Math.PI * 2;
        const jitterR = rad + (hash2(a, ring, 32, 77) - 0.5) * 7;
        const rx = 128 + Math.cos(t) * jitterR;
        const ry = 128 + Math.sin(t) * jitterR;
        if (a === 0) cCtx.moveTo(rx, ry);
        else cCtx.lineTo(rx, ry);
      }
      cCtx.stroke();
    }
  }
  const spiderwebCraterTex = new THREE.CanvasTexture(craterCanvas);
  spiderwebCraterTex.colorSpace = THREE.SRGBColorSpace;
  spiderwebCraterTex.needsUpdate = true;
  allTextures.push(spiderwebCraterTex);

  return {
    coreGlowTex,
    smokePuffTex,
    scrollingTurbulenceTex,
    scrollingMagmaTex,
    scrollingEnergyTex,
    scrollingWindTex,
    taperedSlashTex,
    spiderwebCraterTex,
    shockRingTex,
    allTextures,
    dispose: () => {
      for (const tex of allTextures) {
        tex.dispose();
      }
    },
    updateScrolling: (dt: number) => {
      scrollingTurbulenceTex.offset.x = (scrollingTurbulenceTex.offset.x + dt * 0.65) % 1;
      scrollingTurbulenceTex.offset.y = (scrollingTurbulenceTex.offset.y - dt * 1.15) % 1;
      scrollingMagmaTex.offset.x = (scrollingMagmaTex.offset.x - dt * 0.38) % 1;
      scrollingMagmaTex.offset.y = (scrollingMagmaTex.offset.y - dt * 0.78) % 1;
      scrollingEnergyTex.offset.x = (scrollingEnergyTex.offset.x + dt * 0.9) % 1;
      scrollingEnergyTex.offset.y = (scrollingEnergyTex.offset.y - dt * 1.85) % 1;
      scrollingWindTex.offset.x = (scrollingWindTex.offset.x + dt * 1.6) % 1;
      scrollingWindTex.offset.y = (scrollingWindTex.offset.y - dt * 0.95) % 1;
    },
  };
}

/**
 * 32+ segment tapered crescent blade/wind ribbon BufferGeometry.
 * Tapers smoothly to zero radial width at both ends with clean (u, v) UVs for `taperedSlashTex`.
 */
export function createTaperedCrescentGeometry(
  innerR: number,
  outerR: number,
  arcAngle: number,
  segments = 36,
  arcOffset = 0
): THREE.BufferGeometry {
  const segCount = Math.max(32, Math.floor(segments));
  const vertCount = (segCount + 1) * 2;
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const indices: number[] = [];

  const halfWidthBase = (outerR - innerR) * 0.5;
  const midR = (innerR + outerR) * 0.5;
  const startAngle = arcOffset - arcAngle * 0.5;

  for (let i = 0; i <= segCount; i++) {
    const t = i / segCount;
    const ang = startAngle + t * arcAngle;
    const cosA = Math.cos(ang);
    const sinA = Math.sin(ang);

    // Pinpoint taper at both ends + slight forward crest bulge
    const taper = Math.pow(Math.max(0, Math.sin(t * Math.PI)), 0.72);
    const localHalfW = halfWidthBase * taper;
    const rCenter = midR + halfWidthBase * 0.14 * taper;
    const rIn = Math.max(0.02, rCenter - localHalfW);
    const rOut = rCenter + localHalfW;

    const vIdx = i * 2;
    positions[vIdx * 3] = cosA * rIn;
    positions[vIdx * 3 + 1] = sinA * rIn;
    positions[vIdx * 3 + 2] = 0;

    positions[(vIdx + 1) * 3] = cosA * rOut;
    positions[(vIdx + 1) * 3 + 1] = sinA * rOut;
    positions[(vIdx + 1) * 3 + 2] = 0;

    normals[vIdx * 3 + 2] = 1;
    normals[(vIdx + 1) * 3 + 2] = 1;

    uvs[vIdx * 2] = t;
    uvs[vIdx * 2 + 1] = 0;
    uvs[(vIdx + 1) * 2] = t;
    uvs[(vIdx + 1) * 2 + 1] = 1;

    if (i < segCount) {
      const a = vIdx;
      const b = vIdx + 1;
      const c = vIdx + 2;
      const d = vIdx + 3;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeBoundingSphere();
  return geom;
}

/**
 * Smooth multi-segment tapered volumetric beam/funnel/cone shell (no flat untextured cylinders).
 */
export function createTaperedConeShellGeometry(
  topR: number,
  botR: number,
  height: number,
  radialSegs = 24,
  heightSegs = 8,
  bulge = 0.08
): THREE.BufferGeometry {
  const geom = new THREE.CylinderGeometry(topR, botR, height, radialSegs, heightSegs, true);
  const pos = geom.attributes.position as THREE.BufferAttribute;
  const halfH = Math.max(0.001, height * 0.5);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = (y + halfH) / (halfH * 2); // 0 bottom .. 1 top
    const profile = 1 + Math.sin(t * Math.PI) * bulge;
    pos.setX(i, pos.getX(i) * profile);
    pos.setZ(i, pos.getZ(i) * profile);
  }
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  return geom;
}

/**
 * Twisted, helically fluted vortex shell for tornadoes & cyclones (NO smooth traffic-cone shape).
 * Uses concave hyperboloid waist, spiral flutes, organic wind ripples, and helical axis sway.
 */
export function createTwistedVortexGeometry(
  topR: number,
  botR: number,
  height: number,
  radialSegs = 36,
  heightSegs = 22,
  twistTurns = 2.2
): THREE.BufferGeometry {
  const rSegs = Math.max(24, radialSegs);
  const hSegs = Math.max(12, heightSegs);
  const geom = new THREE.CylinderGeometry(1, 1, height, rSegs, hSegs, true);
  const pos = geom.attributes.position as THREE.BufferAttribute;
  const halfH = Math.max(0.001, height * 0.5);

  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const t = (py + halfH) / (halfH * 2); // 0 bottom .. 1 top
    const angle = Math.atan2(pz, px);

    // Concave funnel flare (narrow ground anchor, slender twisting stem, flared storm crown)
    const flare = Math.pow(t, 1.55);
    const baseR = botR + (topR - botR) * flare;

    // Spiral helical flutes + billowing anvil lip ripples
    const twistPhase = angle + t * twistTurns * Math.PI * 2;
    const flutes = 1 + 0.18 * Math.sin(twistPhase * 4.0) + 0.09 * Math.cos(twistPhase * 7.0 - t * 5.0);
    const verticalWave = 1 + 0.08 * Math.sin(t * Math.PI * 5.0 + angle * 2.0);
    const r = baseR * flutes * verticalWave;

    // Subtle helical S-curve centerline sway so vortex feels whipped by air currents
    const swayAmt = Math.sin(t * Math.PI) * Math.min(botR, topR) * 0.32;
    const swayX = Math.cos(t * Math.PI * 2.0) * swayAmt;
    const swayZ = Math.sin(t * Math.PI * 2.0) * swayAmt;

    pos.setX(i, Math.cos(angle) * r + swayX);
    pos.setZ(i, Math.sin(angle) * r + swayZ);
  }

  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  return geom;
}

/**
 * Multi-strand 3D spiraling wind-blade ribbons that wrap helically around a tornado funnel.
 * Each ribbon tapers sharply at both ends with UVs mapped for `taperedSlashTex`.
 */
export function createSpiralWindRibbonsGeometry(
  turns = 2.1,
  botR = 0.34,
  topR = 1.32,
  height = 2.35,
  ribbons = 3,
  segsPerRibbon = 36
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let vertBase = 0;

  for (let b = 0; b < ribbons; b++) {
    const startPhase = (b / ribbons) * Math.PI * 2;
    const rMult = 0.94 + (b % 2) * 0.14;
    for (let i = 0; i <= segsPerRibbon; i++) {
      const t = i / segsPerRibbon;
      const ang = startPhase + t * turns * Math.PI * 2;
      const flare = Math.pow(t, 1.38);
      const r = (botR + (topR - botR) * flare) * rMult;
      const cx = Math.cos(ang) * r;
      const cz = Math.sin(ang) * r;
      const cy = t * height;

      const taper = Math.pow(Math.max(0.02, Math.sin(t * Math.PI)), 0.7);
      const halfBandH = (0.14 + 0.1 * t) * taper;
      const halfBandOut = (0.08 + 0.06 * t) * taper;

      const nx = Math.cos(ang);
      const nz = Math.sin(ang);

      // Inner-lower edge & outer-upper edge for tilted 3D wind vane ribbon
      positions.push(
        cx - nx * halfBandOut * 0.3,
        cy - halfBandH,
        cz - nz * halfBandOut * 0.3,
        cx + nx * halfBandOut,
        cy + halfBandH,
        cz + nz * halfBandOut
      );
      normals.push(nx, 0.35, nz, nx, 0.35, nz);
      uvs.push(t, 0, t, 1);

      if (i < segsPerRibbon) {
        const a = vertBase + i * 2;
        const bIdx = a + 1;
        const c = a + 2;
        const d = a + 3;
        indices.push(a, bIdx, c, bIdx, d, c);
      }
    }
    vertBase += (segsPerRibbon + 1) * 2;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  return geom;
}

/**
 * Chiseled asymmetric crystal obelisk spire with stepped crystalline shoulder facets
 * (replaces smooth ConeGeometry on Ice Nova & Spike Crowns).
 */
export function createFacetedCrystalSpireGeometry(
  radius = 0.56,
  height = 5.2,
  sides = 7,
  seed = 19
): THREE.BufferGeometry {
  const geom = new THREE.CylinderGeometry(0.03, radius, height, Math.max(5, sides), 5, false);
  geom.translate(0, height * 0.5, 0);
  const pos = geom.attributes.position as THREE.BufferAttribute;

  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const t = Math.max(0, Math.min(1, py / Math.max(0.01, height)));
    const ang = Math.atan2(pz, px);
    const facetJitter = 0.8 + 0.35 * Math.abs(Math.sin(ang * 3.0 + seed));
    const step = t < 0.35 ? 1.12 : t < 0.72 ? 0.88 : 0.72;
    const leanX = t * t * Math.sin(seed) * radius * 0.38;
    const leanZ = t * t * Math.cos(seed) * radius * 0.38;
    pos.setX(i, px * facetJitter * step + leanX);
    pos.setZ(i, pz * facetJitter * step + leanZ);
  }

  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  return geom;
}

/**
 * Irregular faceted rock / crystal shard geometry (replaces BoxGeometry debris/slabs).
 */
export function createFacetedRockGeometry(radius = 0.42, seed = 11): THREE.BufferGeometry {
  const geom = new THREE.DodecahedronGeometry(radius, 0);
  const pos = geom.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const h = Math.sin(x * 12.7 + y * 7.3 + z * 19.1 + seed) * 0.5 + 0.5;
    const scale = 0.72 + h * 0.52;
    pos.setXYZ(i, x * scale, y * (0.68 + h * 0.45), z * scale);
  }
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  return geom;
}

/**
 * Irregular jagged geological crater ridge (replaces trenchSlabGeo / kameTrenchRailGeo BoxGeometry).
 */
export function createFacetedRidgeGeometry(
  width = 0.58,
  height = 0.48,
  length = 3.2,
  segments = 6
): THREE.BufferGeometry {
  const segs = Math.max(3, segments);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const z = (t - 0.5) * length;
    const endTaper = Math.pow(Math.max(0.05, Math.sin(t * Math.PI)), 0.45);
    const jagged = 0.78 + 0.42 * Math.abs(Math.sin(i * 2.17 + 0.6));
    const hw = width * 0.5 * endTaper * (0.85 + 0.25 * Math.cos(i * 1.9));
    const peakY = height * endTaper * jagged;
    const apexOffsetX = Math.sin(i * 2.7) * hw * 0.25;

    // 3 verts per cross-section: left base, jagged peak, right base
    positions.push(-hw, 0, z, apexOffsetX, peakY, z, hw, 0, z);
    uvs.push(0, t, 0.5, t, 1, t);

    if (i < segs) {
      const base = i * 3;
      const next = (i + 1) * 3;
      // Left slope
      indices.push(base, base + 1, next, base + 1, next + 1, next);
      // Right slope
      indices.push(base + 1, base + 2, next + 1, base + 2, next + 2, next + 1);
      // Underside cap
      indices.push(base, next, base + 2, base + 2, next, next + 2);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  return geom;
}

/**
 * Merges a small array of indexed/non-indexed BufferGeometries into one static BufferGeometry.
 */
function mergeStaticGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIndexed = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  let totalVerts = 0;
  for (const g of nonIndexed) {
    totalVerts += g.attributes.position.count;
  }
  const posArr = new Float32Array(totalVerts * 3);
  const normArr = new Float32Array(totalVerts * 3);
  const uvArr = new Float32Array(totalVerts * 2);

  let offset = 0;
  for (const g of nonIndexed) {
    const p = g.attributes.position as THREE.BufferAttribute;
    const n = g.attributes.normal as THREE.BufferAttribute | undefined;
    const u = g.attributes.uv as THREE.BufferAttribute | undefined;
    for (let i = 0; i < p.count; i++) {
      const vIdx = offset + i;
      posArr[vIdx * 3] = p.getX(i);
      posArr[vIdx * 3 + 1] = p.getY(i);
      posArr[vIdx * 3 + 2] = p.getZ(i);
      if (n) {
        normArr[vIdx * 3] = n.getX(i);
        normArr[vIdx * 3 + 1] = n.getY(i);
        normArr[vIdx * 3 + 2] = n.getZ(i);
      }
      if (u) {
        uvArr[vIdx * 2] = u.getX(i);
        uvArr[vIdx * 2 + 1] = u.getY(i);
      }
    }
    offset += p.count;
    if (g !== parts[nonIndexed.indexOf(g)]) {
      g.dispose();
    }
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Sculpted metallic-gold revolver / spectral firearm silhouette (NO BoxGeometry).
 * Barrel points along +Z for clean lookAt orientation.
 */
export function createSculptedFirearmGeometry(): THREE.BufferGeometry {
  // Long tapered barrel along +Z
  const barrel = new THREE.CylinderGeometry(0.055, 0.072, 0.72, 10);
  barrel.rotateX(Math.PI * 0.5);
  barrel.translate(0, 0.08, 0.24);

  // Underbarrel shroud / rail
  const underLug = new THREE.CylinderGeometry(0.038, 0.052, 0.46, 8);
  underLug.rotateX(Math.PI * 0.5);
  underLug.translate(0, 0.015, 0.16);

  // Revolver drum / cylinder
  const drum = new THREE.CylinderGeometry(0.095, 0.095, 0.24, 12);
  drum.rotateX(Math.PI * 0.5);
  drum.translate(0, 0.06, -0.1);

  // Sleek flared hammer/frame spine
  const frame = new THREE.ConeGeometry(0.085, 0.34, 8);
  frame.rotateX(-Math.PI * 0.5);
  frame.translate(0, 0.07, -0.22);

  // Angled revolver grip
  const grip = new THREE.CylinderGeometry(0.052, 0.068, 0.32, 8);
  grip.rotateX(-0.36);
  grip.translate(0, -0.11, -0.26);

  const merged = mergeStaticGeometries([barrel, underLug, drum, frame, grip]);
  barrel.dispose();
  underLug.dispose();
  drum.dispose();
  frame.dispose();
  grip.dispose();
  return merged;
}

/**
 * Sculpted shadow-clone silhouette geometries for Khen's clones & decoys (NO BoxGeometry).
 */
export interface ShadowClonePartsGeo {
  cloakTorsoGeo: THREE.BufferGeometry;
  hoodedHeadGeo: THREE.BufferGeometry;
  bladeArmGeo: THREE.BufferGeometry;
  visorCrescentGeo: THREE.BufferGeometry;
}

export function createShadowClonePartsGeo(): ShadowClonePartsGeo {
  // Flared flowing cloak torso
  const torso = new THREE.CylinderGeometry(0.2, 0.42, 1.05, 14, 2, false);
  const shoulderMantle = new THREE.ConeGeometry(0.42, 0.36, 12);
  shoulderMantle.translate(0, 0.32, 0);
  const cloakTorsoGeo = mergeStaticGeometries([torso, shoulderMantle]);
  torso.dispose();
  shoulderMantle.dispose();

  // Hooded cowl head (tapered organic icosahedron + back hood point)
  const cranium = new THREE.IcosahedronGeometry(0.22, 1);
  const hoodPeak = new THREE.ConeGeometry(0.23, 0.34, 10);
  hoodPeak.rotateX(-0.65);
  hoodPeak.translate(0, 0.07, -0.1);
  const hoodedHeadGeo = mergeStaticGeometries([cranium, hoodPeak]);
  cranium.dispose();
  hoodPeak.dispose();

  // Tapered katana/shadow arm blade
  const upperArm = new THREE.CylinderGeometry(0.065, 0.095, 0.58, 8);
  const shadowBlade = new THREE.ConeGeometry(0.045, 0.65, 6);
  shadowBlade.rotateX(Math.PI * 0.48);
  shadowBlade.translate(0, -0.24, 0.3);
  const bladeArmGeo = mergeStaticGeometries([upperArm, shadowBlade]);
  upperArm.dispose();
  shadowBlade.dispose();

  // Curved visor glint
  const visorCrescentGeo = createTaperedCrescentGeometry(0.14, 0.22, Math.PI * 0.55, 32, Math.PI * 0.5);

  return { cloakTorsoGeo, hoodedHeadGeo, bladeArmGeo, visorCrescentGeo };
}

/**
 * Pre-allocated jagged lightning spline ribbon geometry (34 vertices = 16 segments).
 * Updated in place via `updateLightningRibbonGeometry` with ZERO allocations.
 */
export function buildLightningRibbonGeometry(segments = 16): THREE.BufferGeometry {
  const segCount = Math.max(8, segments);
  const vertCount = (segCount + 1) * 2;
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const indices: number[] = [];

  for (let i = 0; i <= segCount; i++) {
    const t = i / segCount;
    uvs[i * 4] = t;
    uvs[i * 4 + 1] = 0;
    uvs[i * 4 + 2] = t;
    uvs[i * 4 + 3] = 1;
    if (i < segCount) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  return geom;
}

const _lDir = new THREE.Vector3();
const _lSide = new THREE.Vector3();
const _lUp = new THREE.Vector3();
const _lWorldUp = new THREE.Vector3(0, 1, 0);
const _lAltUp = new THREE.Vector3(1, 0, 0);

/**
 * Generates deterministic jagged midpoint-displaced points and writes a 3D cross-billboarded
 * ribbon mesh directly into `geom.attributes.position` with zero per-frame allocations.
 */
export function updateLightningRibbonGeometry(
  geom: THREE.BufferGeometry,
  sx: number,
  sy: number,
  sz: number,
  ex: number,
  ey: number,
  ez: number,
  width: number,
  jitter: number,
  seed: number
): void {
  const posAttr = geom.attributes.position as THREE.BufferAttribute;
  const segCount = Math.max(1, posAttr.count / 2 - 1);

  _lDir.set(ex - sx, ey - sy, ez - sz);
  const len = _lDir.length();
  if (len < 0.001) {
    _lDir.set(0, 1, 0);
  } else {
    _lDir.multiplyScalar(1 / len);
  }
  const refUp = Math.abs(_lDir.y) > 0.92 ? _lAltUp : _lWorldUp;
  _lSide.crossVectors(_lDir, refUp).normalize();
  _lUp.crossVectors(_lSide, _lDir).normalize();

  for (let i = 0; i <= segCount; i++) {
    const t = i / segCount;
    const envelope = Math.sin(t * Math.PI);
    const jx =
      i === 0 || i === segCount
        ? 0
        : (Math.sin(i * 19.3 + seed * 7.1) * 0.65 + Math.cos(i * 31.7 - seed * 11.3) * 0.35) *
          jitter *
          envelope;
    const jy =
      i === 0 || i === segCount
        ? 0
        : (Math.cos(i * 23.1 + seed * 13.7) * 0.65 + Math.sin(i * 37.9 + seed * 5.3) * 0.35) *
          jitter *
          envelope;

    const px = sx + (ex - sx) * t + _lSide.x * jx + _lUp.x * jy;
    const py = sy + (ey - sy) * t + _lSide.y * jx + _lUp.y * jy;
    const pz = sz + (ez - sz) * t + _lSide.z * jx + _lUp.z * jy;

    const halfW = width * (0.45 + 0.55 * envelope);
    const vIdx = i * 2;
    posAttr.setXYZ(vIdx, px - _lSide.x * halfW, py - _lSide.y * halfW, pz - _lSide.z * halfW);
    posAttr.setXYZ(vIdx + 1, px + _lSide.x * halfW, py + _lSide.y * halfW, pz + _lSide.z * halfW);
  }

  posAttr.needsUpdate = true;
  geom.computeBoundingSphere();
}

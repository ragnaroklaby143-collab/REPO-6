import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  FrozenWaterZone,
  MAP_BY_ID,
  MapId,
  MapObstacle,
  ObstacleState,
  computeObstacleLayoutSignature,
  getMapObstacles,
  getMapTerrainHeight,
} from '../shared/gameData.ts';
import {
  EnterableBuildingSpec,
  MAP_ENTERABLE_BUILDINGS,
  MAP_TERRAIN_ZONES,
  TEMPLE_NPC_SPAWN,
  findEnterableBuildingAt,
  getMapStatic3DZones,
  getStatic3DZoneTopAt,
} from './mapLogic.ts';
import type { VFXManager } from './vfxManager.ts';

export function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export interface MapQualityOptions {
  groundTexSize?: number;
  terrainSegments?: number;
  enableBumpMap?: boolean;
  moteCount?: number;
}

function createProceduralGroundTex(mapId: MapId, texSize = 512): THREE.CanvasTexture {
  const size = Math.max(128, Math.min(512, Math.round(texSize)));
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  if (size !== 512) {
    ctx.scale(size / 512, size / 512);
  }

  if (mapId === 'shibuya') {
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 1200; i++) {
      ctx.fillStyle =
        i % 3 === 0
          ? 'rgba(148, 163, 184, 0.14)'
          : i % 3 === 1
          ? 'rgba(15, 23, 42, 0.22)'
          : 'rgba(226, 232, 240, 0.08)';
      ctx.fillRect((i * 79) % 512, (i * 151) % 512, 3 + (i % 4), 3 + (i % 3));
    }
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.14)';
    ctx.lineWidth = 2;
    for (let x = 0; x < 512; x += 128) {
      ctx.strokeRect(x + 1, 1, 126, 510);
    }
  } else if (mapId === 'meadow') {
    ctx.fillStyle = '#477614';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle =
        i % 3 === 0
          ? 'rgba(132, 204, 22, 0.22)'
          : i % 3 === 1
          ? 'rgba(54, 83, 20, 0.26)'
          : 'rgba(163, 230, 53, 0.14)';
      ctx.fillRect((i * 67) % 512, (i * 131) % 512, 5 + (i % 8), 5 + (i % 7));
    }
    ctx.strokeStyle = 'rgba(254, 240, 138, 0.14)';
    ctx.lineWidth = 2;
    for (let x = 0; x < 512; x += 64) {
      for (let y = 0; y < 512; y += 64) {
        ctx.strokeRect(x + 2, y + 2, 60, 60);
      }
    }
  } else if (mapId === 'temple') {
    ctx.fillStyle = '#383242';
    ctx.fillRect(0, 0, 512, 512);
    for (let x = 0; x < 512; x += 64) {
      for (let y = 0; y < 512; y += 64) {
        ctx.fillStyle = (x / 64 + y / 64) % 2 === 0 ? 'rgba(71, 85, 105, 0.28)' : 'rgba(30, 41, 59, 0.26)';
        ctx.fillRect(x + 2, y + 2, 60, 60);
        ctx.strokeStyle = 'rgba(251, 146, 60, 0.24)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, 62, 62);
      }
    }
  } else {
    ctx.fillStyle = '#151526';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.28)';
    ctx.lineWidth = 2;
    for (let x = 0; x < 512; x += 64) {
      for (let y = 0; y < 512; y += 64) {
        ctx.strokeRect(x + 1, y + 1, 62, 62);
      }
    }
    ctx.strokeStyle = 'rgba(192, 132, 252, 0.36)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 24; i++) {
      ctx.beginPath();
      const sx = (i * 89) % 512;
      const sy = (i * 137) % 512;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + ((i % 2 === 0 ? 1 : -1) * 65), sy + ((i % 3 === 0 ? 1 : -1) * 58));
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(34, 34);
  return tex;
}

function createProceduralBumpTex(mapId: MapId): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);

  if (mapId === 'shibuya') {
    for (let i = 0; i < 800; i++) {
      const shade = 115 + (i % 4) * 12;
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.fillRect((i * 53) % 256, (i * 113) % 256, 2, 2);
    }
  } else if (mapId === 'meadow') {
    for (let i = 0; i < 650; i++) {
      const shade = 110 + (i % 5) * 14;
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.fillRect((i * 73) % 256, (i * 137) % 256, 4, 8);
    }
    ctx.strokeStyle = '#555555';
    ctx.lineWidth = 2;
    for (let x = 0; x < 256; x += 32) {
      for (let y = 0; y < 256; y += 32) {
        ctx.strokeRect(x + 1, y + 1, 30, 30);
      }
    }
  } else if (mapId === 'temple') {
    ctx.strokeStyle = '#383838';
    ctx.lineWidth = 3;
    for (let x = 0; x < 256; x += 32) {
      for (let y = 0; y < 256; y += 32) {
        ctx.fillStyle = (x / 32 + y / 32) % 2 === 0 ? '#969696' : '#7a7a7a';
        ctx.fillRect(x + 2, y + 2, 28, 28);
        ctx.strokeRect(x + 1, y + 1, 30, 30);
      }
    }
  } else {
    ctx.strokeStyle = '#303030';
    ctx.lineWidth = 2;
    for (let x = 0; x < 256; x += 32) {
      for (let y = 0; y < 256; y += 32) {
        ctx.strokeRect(x + 1, y + 1, 30, 30);
      }
    }
    ctx.strokeStyle = '#c8c8c8';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 18; i++) {
      ctx.beginPath();
      const sx = (i * 59) % 256;
      const sy = (i * 97) % 256;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (i % 2 === 0 ? 1 : -1) * 34, sy + 28);
      ctx.stroke();
    }
  }

  const bump = new THREE.CanvasTexture(c);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(24, 24);
  return bump;
}

function createWindowFacadeTexture(accentHex: number, cols = 6, rows = 8): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  const hexStr = '#' + accentHex.toString(16).padStart(6, '0');

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 256, 512);

  // Subtle horizontal floor slabs
  const cellW = 256 / cols;
  const cellH = 512 / rows;
  for (let r = 0; r < rows; r++) {
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, r * cellH, 256, 5);
    for (let col = 0; col < cols; col++) {
      const litSeed = (r * 7 + col * 13) % 5;
      if (litSeed === 0) {
        ctx.fillStyle = '#fef08a';
      } else if (litSeed === 1) {
        ctx.fillStyle = '#bae6fd';
      } else if (litSeed === 2) {
        ctx.fillStyle = hexStr;
      } else if (litSeed === 3) {
        ctx.fillStyle = '#64748b';
      } else {
        ctx.fillStyle = '#0f172a';
      }
      ctx.fillRect(col * cellW + 5, r * cellH + 9, cellW - 10, cellH - 16);
      // Window glare highlight
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(col * cellW + 7, r * cellH + 11, (cellW - 14) * 0.4, cellH - 22);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createNeonBillboardTexture(label: string, bgHex: string, fgHex: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, 256, 96);
  ctx.strokeStyle = fgHex;
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, 248, 88);

  ctx.fillStyle = fgHex;
  ctx.font = 'bold 28px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 48);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createAwningStripeTexture(colorHex: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const hexStr = '#' + colorHex.toString(16).padStart(6, '0');
  for (let x = 0; x < 128; x += 16) {
    ctx.fillStyle = (x / 16) % 2 === 0 ? hexStr : '#f8fafc';
    ctx.fillRect(x, 0, 16, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createCrackOverlayTexture(heavy: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 256);

  const strokes = heavy ? 11 : 5;
  for (let i = 0; i < strokes; i++) {
    ctx.beginPath();
    let x = ((i * 53) % 190) + 32;
    let y = ((i * 89) % 190) + 32;
    ctx.moveTo(x, y);
    for (let s = 0; s < (heavy ? 5 : 3); s++) {
      x += Math.cos(i * 1.4 + s * 1.1) * (heavy ? 36 : 26);
      y += Math.sin(i * 1.9 + s * 0.9) * (heavy ? 36 : 26);
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.lineWidth = heavy ? 6 : 4;
    ctx.stroke();

    if (heavy) {
      ctx.strokeStyle = 'rgba(249, 115, 22, 0.72)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSkyDome(mapId: MapId): THREE.Mesh {
  const geo = new THREE.SphereGeometry(240, 20, 12);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  const topColor = new THREE.Color(
    mapId === 'shibuya'
      ? 0x38bdf8
      : mapId === 'meadow'
      ? 0x1d4ed8
      : mapId === 'temple'
      ? 0x451a03
      : 0x090418
  );
  const midColor = new THREE.Color(
    mapId === 'shibuya'
      ? 0xbae6fd
      : mapId === 'meadow'
      ? 0x38bdf8
      : mapId === 'temple'
      ? 0xc2410c
      : 0x3b0764
  );
  const horizonColor = new THREE.Color(
    mapId === 'shibuya'
      ? 0xf1f5f9
      : mapId === 'meadow'
      ? 0xfef3c7
      : mapId === 'temple'
      ? 0xfdba74
      : 0x6b21a8
  );
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const yNorm = THREE.MathUtils.clamp((pos.getY(i) + 25) / 250, 0, 1);
    if (yNorm < 0.35) {
      tmp.copy(horizonColor).lerp(midColor, yNorm / 0.35);
    } else {
      tmp.copy(midColor).lerp(topColor, (yNorm - 0.35) / 0.65);
    }
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.castShadow = false;
  sky.receiveShadow = false;
  return sky;
}

function safeMerge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (geos.length === 0) return null;
  const nonIndexed = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(nonIndexed, false);
  for (const g of geos) g.dispose();
  for (const g of nonIndexed) {
    if (!geos.includes(g)) g.dispose();
  }
  return merged;
}

const _tmpObsColor = new THREE.Color();
const _tmpObsMat4 = new THREE.Matrix4();
const _tmpObsPos = new THREE.Vector3();
const _tmpObsEuler = new THREE.Euler();
const _tmpObsQuat = new THREE.Quaternion();
const _tmpObsScale = new THREE.Vector3(1, 1, 1);

function pushColoredGeo(
  bucket: THREE.BufferGeometry[],
  geo: THREE.BufferGeometry,
  colorHex: number,
  px = 0,
  py = 0,
  pz = 0,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = 1,
  sz = 1
): void {
  const work = geo.index ? geo.toNonIndexed() : geo;
  if (work !== geo) geo.dispose();
  if (
    rx !== 0 ||
    ry !== 0 ||
    rz !== 0 ||
    sx !== 1 ||
    sy !== 1 ||
    sz !== 1 ||
    px !== 0 ||
    py !== 0 ||
    pz !== 0
  ) {
    _tmpObsPos.set(px, py, pz);
    _tmpObsEuler.set(rx, ry, rz);
    _tmpObsQuat.setFromEuler(_tmpObsEuler);
    _tmpObsScale.set(sx, sy, sz);
    _tmpObsMat4.compose(_tmpObsPos, _tmpObsQuat, _tmpObsScale);
    work.applyMatrix4(_tmpObsMat4);
  }
  const count = work.attributes.position.count;
  const colors = new Float32Array(count * 3);
  _tmpObsColor.setHex(colorHex);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = _tmpObsColor.r;
    colors[i * 3 + 1] = _tmpObsColor.g;
    colors[i * 3 + 2] = _tmpObsColor.b;
  }
  work.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  bucket.push(work);
}

interface ObstacleRenderEntry {
  spec: MapObstacle;
  wrapper: THREE.Group;
  mainGroup: THREE.Group;
  rubbleGroup: THREE.Group;
  crackLow: THREE.Mesh;
  crackHigh: THREE.Mesh;
  baseX: number;
  baseY: number;
  baseZ: number;
  lastHp: number;
  shakeTimer: number;
  wasDestroyed: boolean;
}

const SHIBUYA_SIGNS = ['SHIBUYA 109', 'ARCADE 24H', 'CYBER CAFE', 'RAMEN NEO', 'METRO LINE'];

function buildObstacleVisual(
  obs: MapObstacle,
  obsIdx: number,
  mapId: MapId,
  groundY: number,
  crackMatLow: THREE.MeshBasicMaterial,
  crackMatHigh: THREE.MeshBasicMaterial,
  sharedStdObsMat: THREE.MeshStandardMaterial,
  sharedBasicObsMat: THREE.MeshBasicMaterial,
  extraTexturesToDispose: THREE.Texture[],
  sharedTexCache: Map<string, THREE.Texture>
): ObstacleRenderEntry {
  const wrapper = new THREE.Group();
  wrapper.position.set(obs.x, groundY, obs.z);

  const mainGroup = new THREE.Group();
  wrapper.add(mainGroup);

  const w = obs.halfW * 2;
  const d = obs.halfD * 2;
  const h = obs.topY;
  const variant = obs.variant;

  const stdGeos: THREE.BufferGeometry[] = [];
  const basicGeos: THREE.BufferGeometry[] = [];

  const getCachedFacadeTex = (accentHex: number) => {
    const key = `win:${accentHex}`;
    let t = sharedTexCache.get(key);
    if (!t) {
      t = createWindowFacadeTexture(accentHex, 5, 6);
      sharedTexCache.set(key, t);
      extraTexturesToDispose.push(t);
    }
    return t;
  };
  const getCachedSignTex = (label: string, bg: string, fg: string) => {
    const key = `sign:${label}:${bg}:${fg}`;
    let t = sharedTexCache.get(key);
    if (!t) {
      t = createNeonBillboardTexture(label, bg, fg);
      sharedTexCache.set(key, t);
      extraTexturesToDispose.push(t);
    }
    return t;
  };

  const plinthHex =
    mapId === 'shibuya' ? 0x94a3b8 : mapId === 'temple' ? 0x451a03 : mapId === 'obsidian' ? 0x0f172a : 0x78716c;

  if (variant === 'bus') {
    pushColoredGeo(stdGeos, new THREE.BoxGeometry(w * 0.96, Math.max(0.5, h - 0.34), d * 0.92), obs.colorHex, 0, 0.24 + (h - 0.34) * 0.5, 0);
    pushColoredGeo(stdGeos, new THREE.BoxGeometry(w * 0.98, 0.14, d * 0.94), obs.roofColorHex, 0, h - 0.07, 0);
    pushColoredGeo(basicGeos, new THREE.BoxGeometry(w * 0.98, h * 0.34, d * 0.8), 0xbae6fd, 0, h * 0.62, 0);
    for (const wx of [-w * 0.3, w * 0.3]) {
      for (const wz of [-d * 0.44, d * 0.44]) {
        pushColoredGeo(stdGeos, new THREE.CylinderGeometry(0.28, 0.28, 0.2, 8), 0x0f172a, wx, 0.28, wz, Math.PI * 0.5, 0, 0);
      }
    }
  } else if (variant === 'overpass' || variant === 'woodBridge') {
    const legH = Math.max(0.3, h - 0.24);
    for (const lx of [-w * 0.42, w * 0.42]) {
      for (const lz of [-d * 0.38, d * 0.38]) {
        pushColoredGeo(stdGeos, new THREE.BoxGeometry(0.32, legH, 0.32), plinthHex, lx, legH * 0.5, lz);
      }
    }
    pushColoredGeo(stdGeos, new THREE.BoxGeometry(w, 0.26, d), obs.colorHex, 0, h - 0.13, 0);
    for (const rz of [-d * 0.47, d * 0.47]) {
      pushColoredGeo(stdGeos, new THREE.BoxGeometry(w * 0.98, 0.14, 0.12), obs.roofColorHex, 0, h + 0.07, rz);
    }
  } else if (variant === 'boulder') {
    const zScale = d / Math.max(0.5, w);
    pushColoredGeo(stdGeos, new THREE.CylinderGeometry(w * 0.46, w * 0.54, h * 0.84, 7), obs.colorHex, 0, h * 0.42, 0, 0, 0, 0, 1, 1, zScale);
    pushColoredGeo(stdGeos, new THREE.CylinderGeometry(w * 0.44, w * 0.49, 0.26, 7), obs.roofColorHex, 0, h - 0.13, 0, 0, 0, 0, 1, 1, zScale);
    for (let s = 0; s < 3; s++) {
      const ang = (s / 3) * Math.PI * 2 + obsIdx * 0.9;
      pushColoredGeo(stdGeos, new THREE.DodecahedronGeometry(Math.min(w, d) * 0.22, 0), obs.colorHex, Math.cos(ang) * w * 0.42, h * 0.28, Math.sin(ang) * d * 0.42);
    }
  } else if (variant === 'spire') {
    pushColoredGeo(stdGeos, new THREE.CylinderGeometry(w * 0.4, w * 0.52, h * 0.55, 6), obs.colorHex, 0, h * 0.275, 0);
    pushColoredGeo(stdGeos, new THREE.ConeGeometry(w * 0.36, h * 0.5, 6), obs.colorHex, 0, h * 0.75, 0);
    pushColoredGeo(basicGeos, new THREE.TorusGeometry(w * 0.38, 0.08, 6, 12), obs.roofColorHex, 0, h * 0.54, 0, Math.PI * 0.5, 0, 0);
  } else if (variant === 'stepPlatform' || variant === 'rooftop') {
    pushColoredGeo(stdGeos, new THREE.BoxGeometry(w, h * 0.5, d), plinthHex, 0, h * 0.25, 0);
    pushColoredGeo(stdGeos, new THREE.BoxGeometry(w * 0.92, h * 0.44, d * 0.92), obs.colorHex, 0, h * 0.72, 0);
    pushColoredGeo(stdGeos, new THREE.BoxGeometry(w * 0.96, 0.14, d * 0.96), obs.roofColorHex, 0, h - 0.07, 0);
  } else if (variant === 'vending') {
    for (const vx of [-w * 0.24, w * 0.24]) {
      pushColoredGeo(stdGeos, new THREE.BoxGeometry(w * 0.44, h, d * 0.88), obs.colorHex, vx, h * 0.5, 0);
      pushColoredGeo(basicGeos, new THREE.BoxGeometry(w * 0.34, h * 0.52, d * 0.92), obs.roofColorHex, vx, h * 0.56, 0);
    }
  } else if (variant === 'crate' || variant === 'barricade') {
    pushColoredGeo(stdGeos, new THREE.BoxGeometry(w * 0.96, h - 0.1, d * 0.96), obs.colorHex, 0, (h - 0.1) * 0.5, 0);
    pushColoredGeo(stdGeos, new THREE.BoxGeometry(w, 0.12, d), obs.roofColorHex, 0, h - 0.06, 0);
  } else if (mapId === 'shibuya') {
    if (obs.kind === 'pillar') {
      pushColoredGeo(stdGeos, new THREE.BoxGeometry(w, 0.34, d), plinthHex, 0, 0.17, 0);
      pushColoredGeo(stdGeos, new THREE.BoxGeometry(0.28, h * 0.62, d * 0.92), 0xe2e8f0, -w * 0.4, 0.34 + h * 0.31, 0);
      pushColoredGeo(stdGeos, new THREE.BoxGeometry(0.28, h * 0.62, d * 0.92), 0xe2e8f0, w * 0.4, 0.34 + h * 0.31, 0);
      pushColoredGeo(stdGeos, new THREE.BoxGeometry(w * 0.86, h * 0.62, 0.28), 0xe2e8f0, 0, 0.34 + h * 0.31, -d * 0.36);
      for (let s = 0; s < 3; s++) {
        pushColoredGeo(stdGeos, new THREE.BoxGeometry(w * 0.62, 0.24, 0.42), 0x475569, 0, 0.42 + s * 0.24, 0.38 - s * 0.34);
      }
      for (const sx of [-w * 0.42, w * 0.42]) {
        for (const sz of [-d * 0.42, d * 0.42]) {
          pushColoredGeo(stdGeos, new THREE.CylinderGeometry(0.08, 0.09, h * 0.92, 6), 0x334155, sx, h * 0.46, sz);
        }
      }
      pushColoredGeo(stdGeos, new THREE.BoxGeometry(w * 1.12, 0.22, d * 1.12), 0x38bdf8, 0, h - 0.25, 0, -0.08, 0, 0);

      const signTex = getCachedSignTex('METRO B2', '#0f172a', '#38bdf8');
      const stationSign = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.96, 0.56, 0.22),
        new THREE.MeshBasicMaterial({ map: signTex })
      );
      stationSign.position.set(0, h + 0.25, d * 0.42);
      mainGroup.add(stationSign);
    } else {
      pushColoredGeo(stdGeos, new THREE.BoxGeometry(w * 1.05, 0.32, d * 1.05), plinthHex, 0, 0.16, 0);
      const winTex = getCachedFacadeTex(obs.roofColorHex);
      const coreMat = new THREE.MeshStandardMaterial({
        color: obs.colorHex,
        map: winTex,
        roughness: 0.42,
        metalness: 0.22,
      });
      const bodyH = Math.max(1.2, h - 0.85);
      const body = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, bodyH, d * 0.92), coreMat);
      body.position.y = 0.32 + bodyH * 0.5;
      mainGroup.add(body);

      for (const px of [-w * 0.45, w * 0.45]) {
        for (const pz of [-d * 0.45, d * 0.45]) {
          pushColoredGeo(stdGeos, new THREE.BoxGeometry(0.32, bodyH + 0.35, 0.32), 0xf1f5f9, px, 0.32 + (bodyH + 0.35) * 0.5, pz);
        }
      }
      pushColoredGeo(basicGeos, new THREE.BoxGeometry(w * 0.94, 0.95, d * 0.94), 0xe0f2fe, 0, 0.82, 0);
      pushColoredGeo(stdGeos, new THREE.BoxGeometry(w * 1.06, 0.22, d * 1.06), obs.roofColorHex, 0, 1.46, 0);

      const signLabel = SHIBUYA_SIGNS[obsIdx % SHIBUYA_SIGNS.length];
      const signTex = getCachedSignTex(
        signLabel,
        '#0f172a',
        '#' + obs.roofColorHex.toString(16).padStart(6, '0')
      );
      pushColoredGeo(stdGeos, new THREE.BoxGeometry(w * 0.9, 0.7, 0.18), 0x0f172a, 0, h - 0.65, d * 0.5 + 0.01);

      const frontBillboard = new THREE.Mesh(
        new THREE.PlaneGeometry(w * 0.84, 0.58),
        new THREE.MeshBasicMaterial({ map: signTex })
      );
      frontBillboard.position.set(0, h - 0.65, d * 0.5 + 0.11);
      mainGroup.add(frontBillboard);

      pushColoredGeo(basicGeos, new THREE.BoxGeometry(0.24, h * 0.48, 0.85), obs.roofColorHex, w * 0.52, h * 0.62, 0);
      pushColoredGeo(stdGeos, new THREE.BoxGeometry(w * 0.98, 0.24, d * 0.98), 0x334155, 0, h - 0.12, 0);
      pushColoredGeo(stdGeos, new THREE.BoxGeometry(w * 0.38, 0.48, d * 0.36), 0x94a3b8, -w * 0.16, h + 0.24, -d * 0.12);
      pushColoredGeo(stdGeos, new THREE.CylinderGeometry(0.05, 0.08, 1.05, 6), 0x475569, w * 0.24, h + 0.52, d * 0.18);
    }
  } else if (mapId === 'temple') {
    pushColoredGeo(stdGeos, new THREE.BoxGeometry(w, 0.46, d), plinthHex, 0, 0.23, 0);
    pushColoredGeo(basicGeos, new THREE.BoxGeometry(w * 0.78, h * 0.44, d * 0.78), 0xfde68a, 0, 0.46 + h * 0.22, 0);
    for (const px of [-w * 0.4, w * 0.4]) {
      for (const pz of [-d * 0.4, d * 0.4]) {
        pushColoredGeo(stdGeos, new THREE.CylinderGeometry(0.16, 0.19, h * 0.5, 8), obs.colorHex, px, 0.46 + h * 0.25, pz);
      }
    }
    pushColoredGeo(stdGeos, new THREE.BoxGeometry(w * 1.18, 0.26, d * 1.18), 0x1e293b, 0, 0.46 + h * 0.48, 0);
    pushColoredGeo(stdGeos, new THREE.BoxGeometry(w * 0.56, h * 0.26, d * 0.56), obs.colorHex, 0, 0.46 + h * 0.65, 0);
    pushColoredGeo(stdGeos, new THREE.ConeGeometry(Math.max(w, d) * 0.68, h * 0.26, 4), 0x1e293b, 0, h - 0.18, 0, 0, Math.PI * 0.25, 0);
    pushColoredGeo(stdGeos, new THREE.CylinderGeometry(0.05, 0.14, 0.85, 8), obs.roofColorHex, 0, h + 0.35, 0);
  } else if (mapId === 'meadow') {
    pushColoredGeo(stdGeos, new THREE.BoxGeometry(w * 1.04, 0.42, d * 1.04), 0x78716c, 0, 0.21, 0);
    pushColoredGeo(stdGeos, new THREE.BoxGeometry(w * 0.62, h - 0.85, d * 0.62), obs.colorHex, 0, 0.42 + (h - 0.85) * 0.5, 0);
    for (const px of [-w * 0.4, w * 0.4]) {
      for (const pz of [-d * 0.4, d * 0.4]) {
        pushColoredGeo(stdGeos, new THREE.CylinderGeometry(0.2, 0.24, h - 0.72, 8), obs.colorHex, px, 0.42 + (h - 0.72) * 0.5, pz);
      }
    }
    pushColoredGeo(stdGeos, new THREE.BoxGeometry(w * 1.12, 0.36, d * 1.12), obs.colorHex, 0, h - 0.26, 0);
    pushColoredGeo(stdGeos, new THREE.BoxGeometry(w * 0.84, 0.26, d * 0.84), obs.roofColorHex, 0, h + 0.04, 0);
  } else {
    pushColoredGeo(stdGeos, new THREE.CylinderGeometry(w * 0.56, w * 0.66, 0.55, 6), plinthHex, 0, 0.275, 0);
    pushColoredGeo(stdGeos, new THREE.CylinderGeometry(w * 0.38, w * 0.48, h - 0.75, 6), 0x1e293b, 0, 0.55 + (h - 0.75) * 0.5, 0);
    for (let f = 0; f < 4; f++) {
      const ang = (f / 4) * Math.PI * 2 + Math.PI * 0.25;
      const fx = Math.cos(ang) * w * 0.42;
      const fy = 0.55 + h * 0.37;
      const fz = Math.sin(ang) * d * 0.42;
      const fry = -ang + Math.PI * 0.5;
      pushColoredGeo(stdGeos, new THREE.BoxGeometry(0.28, h * 0.74, 0.62), 0x1e293b, fx, fy, fz, 0, fry, 0);
      pushColoredGeo(basicGeos, new THREE.BoxGeometry(0.1, h * 0.62, 0.66), obs.roofColorHex, fx, fy, fz, 0, fry, 0);
    }
    pushColoredGeo(basicGeos, new THREE.TorusGeometry(w * 0.42, 0.08, 6, 12), obs.roofColorHex, 0, h - 0.12, 0, Math.PI * 0.5, 0, 0);
    pushColoredGeo(basicGeos, new THREE.OctahedronGeometry(Math.min(w, d) * 0.36, 0), obs.roofColorHex, 0, h + 0.42, 0);
  }

  const mergedStdGeo = safeMerge(stdGeos);
  if (mergedStdGeo) {
    const stdMesh = new THREE.Mesh(mergedStdGeo, sharedStdObsMat);
    stdMesh.castShadow = false;
    stdMesh.receiveShadow = false;
    mainGroup.add(stdMesh);
  }
  const mergedBasicGeo = safeMerge(basicGeos);
  if (mergedBasicGeo) {
    const basicMesh = new THREE.Mesh(mergedBasicGeo, sharedBasicObsMat);
    basicMesh.castShadow = false;
    basicMesh.receiveShadow = false;
    mainGroup.add(basicMesh);
  }

  // Progressive fracture overlay shells (clean polygonOffset, never z-fights)
  const crackGeo = new THREE.BoxGeometry(w * 0.99, Math.max(0.65, h - 0.35), d * 0.99);
  const crackLow = new THREE.Mesh(crackGeo, crackMatLow);
  crackLow.position.y = 0.25 + (h - 0.35) * 0.5;
  crackLow.visible = false;
  crackLow.renderOrder = 3;
  mainGroup.add(crackLow);

  const crackHigh = new THREE.Mesh(crackGeo, crackMatHigh);
  crackHigh.position.y = 0.25 + (h - 0.35) * 0.5;
  crackHigh.visible = false;
  crackHigh.renderOrder = 4;
  mainGroup.add(crackHigh);

  // Merged low demolished rubble pad revealed after collapse (1 draw call)
  const rubbleGroup = new THREE.Group();
  rubbleGroup.visible = false;
  const rubbleGeos: THREE.BufferGeometry[] = [];
  pushColoredGeo(rubbleGeos, new THREE.BoxGeometry(w * 0.96, 0.08, d * 0.96), 0x475569, 0, 0.04, 0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    pushColoredGeo(
      rubbleGeos,
      new THREE.BoxGeometry(0.44 + (i % 2) * 0.26, 0.16, 0.4),
      plinthHex,
      Math.cos(a) * obs.halfW * 0.44,
      0.11,
      Math.sin(a) * obs.halfD * 0.44,
      0.16,
      a,
      0.14
    );
  }
  const mergedRubble = safeMerge(rubbleGeos);
  if (mergedRubble) {
    const rubbleMesh = new THREE.Mesh(mergedRubble, sharedStdObsMat);
    rubbleMesh.castShadow = false;
    rubbleMesh.receiveShadow = false;
    rubbleGroup.add(rubbleMesh);
  }
  wrapper.add(rubbleGroup);

  return {
    spec: obs,
    wrapper,
    mainGroup,
    rubbleGroup,
    crackLow,
    crackHigh,
    baseX: obs.x,
    baseY: groundY,
    baseZ: obs.z,
    lastHp: obs.maxHp ?? 100,
    shakeTimer: 0,
    wasDestroyed: false,
  };
}

export interface BuiltMapScene {
  group: THREE.Group;
  update: (dt: number, elapsed: number) => void;
  syncObstacles: (obstacles: ObstacleState[] | undefined, vfx?: VFXManager | null) => void;
  syncBuildingRoofCutaway: (localX: number, localRelY: number, localZ: number, dt: number) => void;
  syncFrozenWater: (zones?: FrozenWaterZone[]) => void;
  dispose: () => void;
}

export function buildArenaMap(
  mapId: MapId,
  scene: THREE.Scene,
  maxAniso: number,
  quality?: MapQualityOptions
): BuiltMapScene {
  const spec = MAP_BY_ID[mapId];
  scene.background = new THREE.Color(spec.skyHex);
  scene.fog = new THREE.FogExp2(
    spec.fogHex,
    mapId === 'shibuya' ? 0.004 : mapId === 'meadow' ? 0.0058 : 0.0074
  );

  const group = new THREE.Group();
  scene.add(group);
  const extraTextures: THREE.Texture[] = [];

  const groundTexSize = quality?.groundTexSize ?? 512;
  const terrainSegments = Math.max(84, quality?.terrainSegments ?? 96);
  const enableBumpMap = quality?.enableBumpMap ?? true;
  const targetMoteCount = quality?.moteCount ?? 52;

  // 1-draw-call atmospheric sky dome
  group.add(createSkyDome(mapId));

  const groundTex = createProceduralGroundTex(mapId, groundTexSize);
  groundTex.anisotropy = maxAniso;
  const bumpTex = enableBumpMap ? createProceduralBumpTex(mapId) : null;
  if (bumpTex) {
    bumpTex.anisotropy = maxAniso;
  }

  const terrainGeo = new THREE.PlaneGeometry(310, 310, terrainSegments, terrainSegments);
  terrainGeo.rotateX(-Math.PI * 0.5);
  const pos = terrainGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, getMapTerrainHeight(mapId, pos.getX(i), pos.getZ(i)));
  }
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    map: groundTex,
    ...(bumpTex
      ? {
          bumpMap: bumpTex,
          bumpScale: mapId === 'shibuya' ? 0.03 : mapId === 'meadow' ? 0.045 : 0.065,
        }
      : {}),
    roughness: mapId === 'obsidian' ? 0.62 : mapId === 'shibuya' ? 0.78 : 0.84,
    metalness: mapId === 'obsidian' ? 0.25 : 0.05,
  });
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.receiveShadow = false;
  terrain.castShadow = false;
  group.add(terrain);

  // Grand inlaid stone/gold/neon combat rings & cardinal runway inlays (1 merged draw call)
  const accentHex =
    mapId === 'shibuya'
      ? 0x38bdf8
      : mapId === 'meadow'
      ? 0xfacc15
      : mapId === 'temple'
      ? 0xfb923c
      : 0xa855f7;
  const ringGeos: THREE.BufferGeometry[] = [];
  const outerRingGeo = new THREE.RingGeometry(spec.arenaRadius - 0.38, spec.arenaRadius + 0.14, 72);
  outerRingGeo.rotateX(-Math.PI * 0.5);
  outerRingGeo.translate(0, 0.03, 0);
  ringGeos.push(outerRingGeo);

  const midRingGeo = new THREE.RingGeometry(spec.arenaRadius * 0.54, spec.arenaRadius * 0.54 + 0.34, 64);
  midRingGeo.rotateX(-Math.PI * 0.5);
  midRingGeo.translate(0, 0.026, 0);
  ringGeos.push(midRingGeo);

  const innerRingGeo = new THREE.RingGeometry(5.1, 5.45, 48);
  innerRingGeo.rotateX(-Math.PI * 0.5);
  innerRingGeo.translate(0, 0.028, 0);
  ringGeos.push(innerRingGeo);

  for (let c = 0; c < 4; c++) {
    const spokeLen = spec.arenaRadius - 6.2;
    const spoke = new THREE.PlaneGeometry(0.42, spokeLen);
    spoke.rotateX(-Math.PI * 0.5);
    spoke.translate(0, 0.022, 5.4 + spokeLen * 0.5);
    spoke.rotateY((c * Math.PI) / 2);
    ringGeos.push(spoke);
  }

  const ringsMerged = safeMerge(ringGeos);
  if (ringsMerged) {
    const ringMesh = new THREE.Mesh(
      ringsMerged,
      new THREE.MeshBasicMaterial({
        color: accentHex,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      })
    );
    ringMesh.castShadow = false;
    ringMesh.receiveShadow = false;
    group.add(ringMesh);
  }

  const animatedMeshes: Array<(dt: number, elapsed: number) => void> = [];
  const outerR = spec.arenaRadius + 4.2;

  if (mapId === 'shibuya') {
    // Shibuya Scramble diagonal & cardinal white zebra crosswalk stripes (1 merged draw call)
    const stripeGeos: THREE.BufferGeometry[] = [];
    const directions = [0, Math.PI * 0.5, Math.PI * 0.25, -Math.PI * 0.25];
    for (const dirAng of directions) {
      for (let s = -16; s <= 16; s += 1.7) {
        if (Math.abs(s) < 2.2) continue;
        const stripe = new THREE.PlaneGeometry(3.0, 0.68);
        stripe.rotateX(-Math.PI * 0.5);
        stripe.translate(0, 0.02, s);
        stripe.rotateY(dirAng);
        stripeGeos.push(stripe);
      }
    }
    const mergedCrosswalk = safeMerge(stripeGeos);
    if (mergedCrosswalk) {
      const crosswalkMesh = new THREE.Mesh(
        mergedCrosswalk,
        new THREE.MeshBasicMaterial({
          color: 0xf8fafc,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        })
      );
      crosswalkMesh.castShadow = false;
      crosswalkMesh.receiveShadow = false;
      group.add(crosswalkMesh);
    }

    // Contoured Sidewalk Apron around the expanded scramble perimeter
    const sidewalkGeo = new THREE.RingGeometry(spec.arenaRadius + 0.35, spec.arenaRadius + 24, 72, 4);
    sidewalkGeo.rotateX(-Math.PI * 0.5);
    const swPos = sidewalkGeo.attributes.position;
    for (let i = 0; i < swPos.count; i++) {
      const sx = swPos.getX(i);
      const sz = swPos.getZ(i);
      swPos.setY(i, getMapTerrainHeight('shibuya', sx, sz) + 0.045);
    }
    sidewalkGeo.computeVertexNormals();
    const sidewalkMesh = new THREE.Mesh(
      sidewalkGeo,
      new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.85,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      })
    );
    sidewalkMesh.receiveShadow = false;
    sidewalkMesh.castShadow = false;
    group.add(sidewalkMesh);

    // Instanced Shibuya urban streetlamps + pedestrian guard bollards around perimeter (zero PointLight!)
    const lampCount = 24;
    const poleGeo = new THREE.CylinderGeometry(0.14, 0.18, 5.2, 8);
    poleGeo.translate(0, 2.6, 0);
    const poleInst = new THREE.InstancedMesh(
      poleGeo,
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6, roughness: 0.4 }),
      lampCount
    );
    poleInst.castShadow = false;

    const bulbGeo = new THREE.BoxGeometry(0.85, 0.28, 0.45);
    bulbGeo.translate(0, 5.25, -0.45);
    const bulbInst = new THREE.InstancedMesh(
      bulbGeo,
      new THREE.MeshBasicMaterial({ color: 0xfef08a }),
      lampCount
    );
    bulbInst.castShadow = false;

    const lDummy = new THREE.Object3D();
    for (let i = 0; i < lampCount; i++) {
      const ang = (i / lampCount) * Math.PI * 2;
      lDummy.position.set(Math.cos(ang) * outerR, 0, Math.sin(ang) * outerR);
      lDummy.rotation.set(0, -ang + Math.PI * 0.5, 0);
      lDummy.scale.setScalar(1);
      lDummy.updateMatrix();
      poleInst.setMatrixAt(i, lDummy.matrix);
      bulbInst.setMatrixAt(i, lDummy.matrix);
    }
    poleInst.instanceMatrix.needsUpdate = true;
    bulbInst.instanceMatrix.needsUpdate = true;
    group.add(poleInst, bulbInst);

    // Instanced street curb bollards along arena sidewalk perimeter
    const bollardCount = 44;
    const bolGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.85, 8);
    bolGeo.translate(0, 0.425, 0);
    const bolInst = new THREE.InstancedMesh(
      bolGeo,
      new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.55, roughness: 0.35 }),
      bollardCount
    );
    bolInst.castShadow = false;
    for (let i = 0; i < bollardCount; i++) {
      const ang = (i / bollardCount) * Math.PI * 2 + 0.09;
      lDummy.position.set(Math.cos(ang) * (spec.arenaRadius + 1.0), 0, Math.sin(ang) * (spec.arenaRadius + 1.0));
      lDummy.rotation.set(0, 0, 0);
      lDummy.scale.setScalar(1);
      lDummy.updateMatrix();
      bolInst.setMatrixAt(i, lDummy.matrix);
    }
    bolInst.instanceMatrix.needsUpdate = true;
    group.add(bolInst);

    // Detailed Multi-Part Surrounding Shibuya Skyline Skyscrapers (Window-textured Facades + Rooftop Crowns + Neon Signs)
    const skyBuildCount = 32;
    const facadeTex = createWindowFacadeTexture(0x38bdf8, 8, 12);
    extraTextures.push(facadeTex);
    const towerGeo = new THREE.BoxGeometry(11.5, 1, 11.5);
    towerGeo.translate(0, 0.5, 0);
    const towerInst = new THREE.InstancedMesh(
      towerGeo,
      new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        map: facadeTex,
        roughness: 0.45,
        metalness: 0.22,
      }),
      skyBuildCount
    );
    towerInst.castShadow = false;

    const crownGeo = new THREE.BoxGeometry(9.0, 3.0, 9.0);
    const crownInst = new THREE.InstancedMesh(
      crownGeo,
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.4 }),
      skyBuildCount
    );
    crownInst.castShadow = false;

    const signGeo = new THREE.BoxGeometry(9.2, 2.7, 11.9);
    const signInst = new THREE.InstancedMesh(
      signGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      skyBuildCount
    );
    signInst.castShadow = false;

    const palette = [0x38bdf8, 0xf43f5e, 0xfacc15, 0x2dd4bf, 0x6366f1];
    const bDummy = new THREE.Object3D();
    const cTmp = new THREE.Color();
    for (let i = 0; i < skyBuildCount; i++) {
      const ang = (i / skyBuildCount) * Math.PI * 2 + 0.13;
      const dist = outerR + 13.5 + (i % 4) * 8.0;
      const bh = 24 + (i % 6) * 8.2;
      const bx = Math.cos(ang) * dist;
      const bz = Math.sin(ang) * dist;

      bDummy.position.set(bx, 0, bz);
      bDummy.rotation.set(0, -ang, 0);
      bDummy.scale.set(1, bh, 1);
      bDummy.updateMatrix();
      towerInst.setMatrixAt(i, bDummy.matrix);
      towerInst.setColorAt(i, cTmp.setHex(i % 2 === 0 ? 0xf8fafc : 0xe2e8f0));

      bDummy.position.set(bx, bh + 1.5, bz);
      bDummy.scale.set(1, 1, 1);
      bDummy.updateMatrix();
      crownInst.setMatrixAt(i, bDummy.matrix);

      bDummy.position.set(bx, 8.8 + (i % 4) * 3.2, bz);
      bDummy.updateMatrix();
      signInst.setMatrixAt(i, bDummy.matrix);
      signInst.setColorAt(i, cTmp.setHex(palette[i % palette.length]));
    }
    towerInst.instanceMatrix.needsUpdate = true;
    crownInst.instanceMatrix.needsUpdate = true;
    signInst.instanceMatrix.needsUpdate = true;
    if (towerInst.instanceColor) towerInst.instanceColor.needsUpdate = true;
    if (signInst.instanceColor) signInst.instanceColor.needsUpdate = true;
    group.add(towerInst, crownInst, signInst);
  } else {
    // Instanced inlaid energy floor tiles across the mid-outer ring (1 draw call)
    const tileCount = 32;
    const tileGeo = new THREE.PlaneGeometry(2.8, 1.55);
    tileGeo.rotateX(-Math.PI * 0.5);
    tileGeo.translate(0, 0.016, 0);
    const tileMat = new THREE.MeshBasicMaterial({
      color: mapId === 'meadow' ? 0xfef08a : mapId === 'temple' ? 0xfdba74 : 0xc084fc,
      side: THREE.DoubleSide,
    });
    const tileInst = new THREE.InstancedMesh(tileGeo, tileMat, tileCount);
    tileInst.castShadow = false;
    tileInst.receiveShadow = false;
    const tileDummy = new THREE.Object3D();
    for (let i = 0; i < tileCount; i++) {
      const ang = (i / tileCount) * Math.PI * 2;
      const r = i % 2 === 0 ? spec.arenaRadius * 0.78 : spec.arenaRadius * 0.36;
      tileDummy.position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
      tileDummy.rotation.set(0, -ang + Math.PI * 0.5, 0);
      tileDummy.scale.setScalar(1);
      tileDummy.updateMatrix();
      tileInst.setMatrixAt(i, tileDummy.matrix);
    }
    tileInst.instanceMatrix.needsUpdate = true;
    tileInst.computeBoundingSphere();
    group.add(tileInst);

    // Perimeter Stone Pillars with Solid Sculpted Glowing Braziers (InstancedMesh, zero PointLight!)
    const brazierCount = 22;
    const pedGeo = new THREE.CylinderGeometry(0.68, 0.85, 3.8, 8);
    pedGeo.translate(0, 1.9, 0);
    const pedInst = new THREE.InstancedMesh(
      pedGeo,
      new THREE.MeshStandardMaterial({
        color: mapId === 'meadow' ? 0x64748b : mapId === 'temple' ? 0x991b1b : 0x1e293b,
        roughness: 0.72,
        metalness: 0.18,
      }),
      brazierCount
    );
    pedInst.castShadow = false;
    pedInst.receiveShadow = false;

    const bowlGeo = new THREE.CylinderGeometry(0.95, 0.55, 0.55, 8);
    bowlGeo.translate(0, 4.05, 0);
    const bowlInst = new THREE.InstancedMesh(
      bowlGeo,
      new THREE.MeshStandardMaterial({
        color: mapId === 'obsidian' ? 0x312e81 : 0xb45309,
        roughness: 0.38,
        metalness: 0.65,
      }),
      brazierCount
    );
    bowlInst.castShadow = false;
    bowlInst.receiveShadow = false;

    const flameGeo = new THREE.OctahedronGeometry(0.64, 0);
    flameGeo.translate(0, 4.72, 0);
    const flameColor = mapId === 'meadow' ? 0xfacc15 : mapId === 'temple' ? 0xf97316 : 0xc084fc;
    const flameMat = new THREE.MeshBasicMaterial({ color: flameColor });
    const flameInst = new THREE.InstancedMesh(flameGeo, flameMat, brazierCount);
    flameInst.castShadow = false;
    flameInst.receiveShadow = false;

    const haloGeo = new THREE.TorusGeometry(0.85, 0.08, 6, 16);
    haloGeo.rotateX(Math.PI * 0.5);
    haloGeo.translate(0, 4.55, 0);
    const haloInst = new THREE.InstancedMesh(
      haloGeo,
      new THREE.MeshBasicMaterial({
        color: mapId === 'meadow' ? 0xfef08a : mapId === 'temple' ? 0xfdba74 : 0xe9d5ff,
      }),
      brazierCount
    );
    haloInst.castShadow = false;
    haloInst.receiveShadow = false;

    const pDummy = new THREE.Object3D();
    for (let i = 0; i < brazierCount; i++) {
      const ang = (i / brazierCount) * Math.PI * 2;
      const px = Math.cos(ang) * outerR;
      const pz = Math.sin(ang) * outerR;
      pDummy.position.set(px, getMapTerrainHeight(mapId, px, pz) * 0.4, pz);
      pDummy.rotation.set(0, -ang, 0);
      pDummy.scale.setScalar(1);
      pDummy.updateMatrix();
      pedInst.setMatrixAt(i, pDummy.matrix);
      bowlInst.setMatrixAt(i, pDummy.matrix);
      flameInst.setMatrixAt(i, pDummy.matrix);
      haloInst.setMatrixAt(i, pDummy.matrix);
    }
    pedInst.instanceMatrix.needsUpdate = true;
    bowlInst.instanceMatrix.needsUpdate = true;
    flameInst.instanceMatrix.needsUpdate = true;
    haloInst.instanceMatrix.needsUpdate = true;
    group.add(pedInst, bowlInst, flameInst, haloInst);

    // Distant Mountain / Spire / Cliff Silhouettes beyond expanded border (1 merged static draw call)
    const silhouetteGeos: THREE.BufferGeometry[] = [];
    const silCount = 24;
    for (let i = 0; i < silCount; i++) {
      const ang = (i / silCount) * Math.PI * 2 + 0.14;
      const dist = 94 + (i % 3) * 14;
      const h = 24 + (i % 4) * 9;
      const peak =
        mapId === 'obsidian'
          ? new THREE.CylinderGeometry(2.2, 6.8, h, 5)
          : new THREE.ConeGeometry(10 + (i % 4) * 3.5, h, 5);
      peak.translate(Math.cos(ang) * dist, h * 0.42, Math.sin(ang) * dist);
      silhouetteGeos.push(peak);
    }
    const mergedSilhouette = safeMerge(silhouetteGeos);
    if (mergedSilhouette) {
      const silMesh = new THREE.Mesh(
        mergedSilhouette,
        new THREE.MeshStandardMaterial({
          color: mapId === 'meadow' ? 0x334155 : mapId === 'temple' ? 0x451a2b : 0x0f172a,
          roughness: 0.92,
        })
      );
      silMesh.castShadow = false;
      silMesh.receiveShadow = false;
      group.add(silMesh);
    }
  }

  if (mapId === 'meadow') {
    const moatGeo = new THREE.RingGeometry(spec.arenaRadius + 1.4, spec.arenaRadius + 5.2, 72);
    moatGeo.rotateX(-Math.PI * 0.5);
    moatGeo.translate(0, 0.015, 0);
    const moatMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      side: THREE.DoubleSide,
    });
    const moatMesh = new THREE.Mesh(moatGeo, moatMat);
    moatMesh.castShadow = false;
    moatMesh.receiveShadow = false;
    group.add(moatMesh);
    animatedMeshes.push((_dt, elapsed) => {
      moatMat.color.setHex(Math.sin(elapsed * 2.2) > 0 ? 0x0284c7 : 0x0ea5e9);
    });

    // 4 Cardinal Stone Bridges spanning the moat
    const bridgeGeos: THREE.BufferGeometry[] = [];
    for (let b = 0; b < 4; b++) {
      const deck = new THREE.BoxGeometry(4.2, 0.38, 5.6);
      deck.translate(0, 0.18, spec.arenaRadius + 3.3);
      deck.rotateY((b * Math.PI) / 2);
      bridgeGeos.push(deck);
    }
    const mergedBridges = safeMerge(bridgeGeos);
    if (mergedBridges) {
      const bridgeMesh = new THREE.Mesh(
        mergedBridges,
        new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.85 })
      );
      bridgeMesh.castShadow = false;
      bridgeMesh.receiveShadow = true;
      group.add(bridgeMesh);
    }

    const treeCount = 32;
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.48, 4.6, 6);
    trunkGeo.translate(0, 2.3, 0);
    const trunkInst = new THREE.InstancedMesh(
      trunkGeo,
      new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.9 }),
      treeCount
    );
    trunkInst.castShadow = false;
    trunkInst.receiveShadow = false;

    const crownGeo = new THREE.DodecahedronGeometry(2.5, 0);
    crownGeo.translate(0, 5.1, 0);
    const crownInst = new THREE.InstancedMesh(
      crownGeo,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.84 }),
      treeCount
    );
    crownInst.castShadow = false;
    crownInst.receiveShadow = false;

    const dummy = new THREE.Object3D();
    const greenA = new THREE.Color(0x4d7c0f);
    const greenB = new THREE.Color(0x84cc16);
    const goldLeaf = new THREE.Color(0xb45309);
    for (let t = 0; t < treeCount; t++) {
      const ang = (t / treeCount) * Math.PI * 2 + 0.18;
      const dist = outerR + 8.5 + (t % 3) * 5.0;
      const tx = Math.cos(ang) * dist;
      const tz = Math.sin(ang) * dist;
      const ty = getMapTerrainHeight('meadow', tx, tz);
      const scale = 0.96 + (t % 3) * 0.2;
      dummy.position.set(tx, ty, tz);
      dummy.rotation.set(0, ang, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(t, dummy.matrix);
      crownInst.setMatrixAt(t, dummy.matrix);
      crownInst.setColorAt(t, t % 4 === 0 ? goldLeaf : t % 2 === 0 ? greenA : greenB);
    }
    trunkInst.instanceMatrix.needsUpdate = true;
    crownInst.instanceMatrix.needsUpdate = true;
    if (crownInst.instanceColor) crownInst.instanceColor.needsUpdate = true;
    group.add(trunkInst, crownInst);

    // Grand Ancient Coliseum (NW corner at -25.5, -24.5): Multi-tiered spectator bleachers + marble arches
    const colX = -25.5;
    const colZ = -24.5;
    const colGy = getMapTerrainHeight('meadow', colX, colZ);
    const tierCount = 18;
    const tierGeo = new THREE.BoxGeometry(2.8, 0.82, 1.55);
    const tierInst = new THREE.InstancedMesh(
      tierGeo,
      new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.8 }),
      tierCount
    );
    const archPillarGeo = new THREE.CylinderGeometry(0.36, 0.42, 4.1, 8);
    archPillarGeo.translate(0, 2.05, 0);
    const archPillarInst = new THREE.InstancedMesh(
      archPillarGeo,
      new THREE.MeshStandardMaterial({ color: 0xf5f5f4, roughness: 0.55, metalness: 0.08 }),
      14
    );
    const cDummy = new THREE.Object3D();
    for (let i = 0; i < tierCount; i++) {
      const ang = -Math.PI * 0.98 + (i / (tierCount - 1)) * (Math.PI * 1.16);
      const rad = 8.4 + (i % 2) * 1.45;
      cDummy.position.set(colX + Math.cos(ang) * rad, colGy + 0.52 + (i % 2) * 0.78, colZ + Math.sin(ang) * rad);
      cDummy.rotation.set(0, -ang + Math.PI * 0.5, 0);
      cDummy.scale.set(1, 1 + (i % 2) * 0.4, 1);
      cDummy.updateMatrix();
      tierInst.setMatrixAt(i, cDummy.matrix);
    }
    for (let i = 0; i < 14; i++) {
      const ang = -Math.PI * 0.92 + (i / 13) * (Math.PI * 1.06);
      const rad = 7.4;
      cDummy.position.set(colX + Math.cos(ang) * rad, colGy, colZ + Math.sin(ang) * rad);
      cDummy.rotation.set(0, -ang, 0);
      cDummy.scale.setScalar(1);
      cDummy.updateMatrix();
      archPillarInst.setMatrixAt(i, cDummy.matrix);
    }
    tierInst.instanceMatrix.needsUpdate = true;
    archPillarInst.instanceMatrix.needsUpdate = true;
    tierInst.computeBoundingSphere();
    archPillarInst.computeBoundingSphere();
    group.add(tierInst, archPillarInst);

    // Deep Underground Catacombs (SE corner at 26.5, 25.5): Stepped staircase descending to -3.6m, sarcophagi, crypt vault ribs & torches
    const catX = 26.5;
    const catZ = 25.5;
    const catGy = getMapTerrainHeight('meadow', catX, catZ);
    const stepGeos: THREE.BufferGeometry[] = [];
    for (let s = 0; s < 12; s++) {
      const t = s / 11;
      const sx = 15.2 + t * 6.8;
      const sz = 14.8 + t * 6.4;
      const sy = getMapTerrainHeight('meadow', sx, sz);
      const step = new THREE.BoxGeometry(3.4, 0.36, 0.84);
      step.rotateY(Math.PI * 0.25);
      step.translate(sx, sy + 0.14, sz);
      stepGeos.push(step);
    }
    // Carved stone sarcophagi & crypt pillars inside Deep Underground Catacombs
    for (const offset of [-3.4, 3.4]) {
      const sarc = new THREE.BoxGeometry(1.35, 0.92, 2.4);
      sarc.translate(catX + offset, catGy + 0.46, catZ + 3.2);
      stepGeos.push(sarc);
    }
    for (const px of [-5.2, 5.2]) {
      for (const pz of [-4.2, 4.2]) {
        const col = new THREE.CylinderGeometry(0.42, 0.5, 3.85, 8);
        col.translate(catX + px, catGy + 1.92, catZ + pz);
        stepGeos.push(col);
      }
    }
    const mergedCatacombStone = safeMerge(stepGeos);
    if (mergedCatacombStone) {
      const catStoneMesh = new THREE.Mesh(
        mergedCatacombStone,
        new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.88 })
      );
      group.add(catStoneMesh);
    }
    // Instanced Catacomb glowing torch flames along subterranean crypt walls
    const torchCount = 10;
    const torchInst = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.28, 0),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 }),
      torchCount
    );
    const tDummy = new THREE.Object3D();
    for (let i = 0; i < torchCount; i++) {
      const ang = (i / torchCount) * Math.PI * 2;
      tDummy.position.set(catX + Math.cos(ang) * 5.8, catGy + 2.25, catZ + Math.sin(ang) * 5.8);
      tDummy.rotation.set(0, ang, 0);
      tDummy.scale.set(0.9, 1.5, 0.9);
      tDummy.updateMatrix();
      torchInst.setMatrixAt(i, tDummy.matrix);
    }
    torchInst.instanceMatrix.needsUpdate = true;
    torchInst.computeBoundingSphere();
    group.add(torchInst);
  } else if (mapId === 'temple') {
    const daisMesh = new THREE.Mesh(
      new THREE.CircleGeometry(11.2, 48),
      new THREE.MeshBasicMaterial({
        color: 0x475569,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      })
    );
    daisMesh.rotation.x = -Math.PI * 0.5;
    daisMesh.position.y = 0.015;
    daisMesh.castShadow = false;
    daisMesh.receiveShadow = false;
    group.add(daisMesh);

    // Shrine challenger glowing golden rune seal at TEMPLE_NPC_SPAWN (0, -20.5)
    const npcGy = getMapTerrainHeight('temple', TEMPLE_NPC_SPAWN.x, TEMPLE_NPC_SPAWN.z);
    const npcPad = new THREE.Mesh(
      new THREE.RingGeometry(1.15, 1.7, 28),
      new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        side: THREE.DoubleSide,
      })
    );
    npcPad.rotation.x = -Math.PI * 0.5;
    npcPad.position.set(TEMPLE_NPC_SPAWN.x, npcGy + 0.05, TEMPLE_NPC_SPAWN.z);
    group.add(npcPad);

    // Instanced Japanese stone lanterns flanking Grand Shrine staircase, koi pond bridges & dojo avenues
    const lanternPositions: Array<[number, number]> = [
      [-4.8, -21.8], [4.8, -21.8],
      [-4.8, -26.5], [4.8, -26.5],
      [-4.8, -30.5], [4.8, -30.5],
      [-16.2, 5.4], [-16.2, 11.6],
      [16.2, -5.4], [16.2, -11.6],
      [-17.8, -16.0], [17.8, 16.0],
    ];
    const lanPostGeo = new THREE.BoxGeometry(0.48, 1.85, 0.48);
    lanPostGeo.translate(0, 0.92, 0);
    const lanPostInst = new THREE.InstancedMesh(
      lanPostGeo,
      new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.85 }),
      lanternPositions.length
    );
    const lanGlowGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    lanGlowGeo.translate(0, 2.02, 0);
    const lanGlowInst = new THREE.InstancedMesh(
      lanGlowGeo,
      new THREE.MeshBasicMaterial({ color: 0xfde047 }),
      lanternPositions.length
    );
    const lDummy = new THREE.Object3D();
    for (let i = 0; i < lanternPositions.length; i++) {
      const [lx, lz] = lanternPositions[i];
      lDummy.position.set(lx, getMapTerrainHeight('temple', lx, lz), lz);
      lDummy.rotation.set(0, 0, 0);
      lDummy.scale.setScalar(1);
      lDummy.updateMatrix();
      lanPostInst.setMatrixAt(i, lDummy.matrix);
      lanGlowInst.setMatrixAt(i, lDummy.matrix);
    }
    lanPostInst.instanceMatrix.needsUpdate = true;
    lanGlowInst.instanceMatrix.needsUpdate = true;
    lanPostInst.computeBoundingSphere();
    lanGlowInst.computeBoundingSphere();
    group.add(lanPostInst, lanGlowInst);

    // 4 Cardinal Outer Vermilion Torii Gates + Grand Shrine Stairway Ceremonial Torii (merged 1 draw call)
    const toriiGeos: THREE.BufferGeometry[] = [];
    for (let g = 0; g < 4; g++) {
      const ang = (g * Math.PI) / 2;
      const dist = spec.arenaRadius + 5.6;
      const pL = new THREE.CylinderGeometry(0.36, 0.42, 6.8, 8);
      pL.translate(-2.8, 3.4, dist);
      pL.rotateY(ang);
      const pR = new THREE.CylinderGeometry(0.36, 0.42, 6.8, 8);
      pR.translate(2.8, 3.4, dist);
      pR.rotateY(ang);
      const topBeam = new THREE.BoxGeometry(8.2, 0.58, 0.78);
      topBeam.translate(0, 6.6, dist);
      topBeam.rotateY(ang);
      const subBeam = new THREE.BoxGeometry(6.4, 0.38, 0.5);
      subBeam.translate(0, 5.3, dist);
      subBeam.rotateY(ang);
      toriiGeos.push(pL, pR, topBeam, subBeam);
    }
    // Inner ceremonial Torii framing the Grand Shrine stairway (wide 9.2m span so stairs stay 100% clear)
    for (const tz of [-23.0, -28.6]) {
      const tgy = getMapTerrainHeight('temple', 0, tz);
      const pL = new THREE.CylinderGeometry(0.28, 0.34, 5.8, 8);
      pL.translate(-4.7, tgy + 2.9, tz);
      const pR = new THREE.CylinderGeometry(0.28, 0.34, 5.8, 8);
      pR.translate(4.7, tgy + 2.9, tz);
      const topBeam = new THREE.BoxGeometry(11.4, 0.48, 0.68);
      topBeam.translate(0, tgy + 5.7, tz);
      const subBeam = new THREE.BoxGeometry(9.6, 0.32, 0.44);
      subBeam.translate(0, tgy + 4.5, tz);
      toriiGeos.push(pL, pR, topBeam, subBeam);
    }
    const mergedTorii = safeMerge(toriiGeos);
    if (mergedTorii) {
      const toriiMesh = new THREE.Mesh(
        mergedTorii,
        new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.48, metalness: 0.12 })
      );
      toriiMesh.castShadow = false;
      group.add(toriiMesh);
    }
  } else if (mapId === 'obsidian') {
    const crystalCount = 16;
    const spireGeo = new THREE.ConeGeometry(1.35, 6.8, 5);
    spireGeo.translate(0, 3.3, 0);
    const crystalInst = new THREE.InstancedMesh(
      spireGeo,
      new THREE.MeshStandardMaterial({
        color: 0xc084fc,
        emissive: 0x9333ea,
        emissiveIntensity: 1.15,
        roughness: 0.25,
        metalness: 0.5,
      }),
      crystalCount
    );
    crystalInst.castShadow = false;
    crystalInst.receiveShadow = false;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < crystalCount; i++) {
      const ang = (i / crystalCount) * Math.PI * 2 + 0.19;
      const dist = outerR + 3.8 + (i % 2) * 3.5;
      const scaleY = 0.95 + (i % 3) * 0.38;
      dummy.position.set(Math.cos(ang) * dist, 0, Math.sin(ang) * dist);
      dummy.rotation.set(0, ang, (i % 2 === 0 ? 1 : -1) * 0.14);
      dummy.scale.set(1, scaleY, 1);
      dummy.updateMatrix();
      crystalInst.setMatrixAt(i, dummy.matrix);
    }
    crystalInst.instanceMatrix.needsUpdate = true;
    group.add(crystalInst);

    const centerSeal = new THREE.Mesh(
      new THREE.RingGeometry(5.8, 6.2, 6),
      new THREE.MeshBasicMaterial({
        color: 0xa855f7,
        side: THREE.DoubleSide,
      })
    );
    centerSeal.rotation.x = -Math.PI * 0.5;
    centerSeal.position.y = 0.035;
    centerSeal.castShadow = false;
    centerSeal.receiveShadow = false;
    group.add(centerSeal);
    animatedMeshes.push((dt) => {
      centerSeal.rotation.z += dt * 0.25;
    });
  }

  // Peripheral Instanced Natural Rock Clusters (all outdoor maps) & Shibuya Sidewalk Props (1 draw call)
  if (mapId === 'shibuya') {
    const carCount = 14;
    const carGeo = new THREE.BoxGeometry(3.2, 1.15, 1.65);
    carGeo.translate(0, 0.58, 0);
    const carInst = new THREE.InstancedMesh(
      carGeo,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.45 }),
      carCount
    );
    const cDummy = new THREE.Object3D();
    const carCols = [0xef4444, 0x3b82f6, 0xf8fafc, 0xfacc15, 0x14b8a6];
    const tmpCol = new THREE.Color();
    for (let i = 0; i < carCount; i++) {
      const ang = (i / carCount) * Math.PI * 2 + 0.22;
      const r = spec.arenaRadius + 3.4;
      cDummy.position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
      cDummy.rotation.set(0, -ang + Math.PI * 0.5, 0);
      cDummy.updateMatrix();
      carInst.setMatrixAt(i, cDummy.matrix);
      carInst.setColorAt(i, tmpCol.setHex(carCols[i % carCols.length]));
    }
    carInst.instanceMatrix.needsUpdate = true;
    if (carInst.instanceColor) carInst.instanceColor.needsUpdate = true;
    group.add(carInst);
  } else {
    const rimRockCount = 34;
    const rimRockGeo = new THREE.DodecahedronGeometry(1.65, 0);
    const rimRockInst = new THREE.InstancedMesh(
      rimRockGeo,
      new THREE.MeshStandardMaterial({
        color: mapId === 'obsidian' ? 0x1e293b : mapId === 'temple' ? 0x57534e : 0x78716c,
        roughness: 0.88,
        metalness: 0.08,
      }),
      rimRockCount
    );
    const rDummy = new THREE.Object3D();
    for (let i = 0; i < rimRockCount; i++) {
      const ang = (i / rimRockCount) * Math.PI * 2 + 0.08;
      const dist = spec.arenaRadius + 2.6 + (i % 4) * 1.6;
      const rx = Math.cos(ang) * dist;
      const rz = Math.sin(ang) * dist;
      const ry = getMapTerrainHeight(mapId, rx, rz);
      rDummy.position.set(rx, ry + 0.55, rz);
      rDummy.rotation.set(i * 0.4, ang, i * 0.3);
      rDummy.scale.set(1.0 + (i % 3) * 0.35, 0.72 + (i % 2) * 0.42, 0.9 + (i % 3) * 0.28);
      rDummy.updateMatrix();
      rimRockInst.setMatrixAt(i, rDummy.matrix);
    }
    rimRockInst.instanceMatrix.needsUpdate = true;
    group.add(rimRockInst);
  }

  // Destructible Buildings / Natural Boulders / Jumpable Platforms inside the Arena
  const crackTexLow = createCrackOverlayTexture(false);
  const crackTexHigh = createCrackOverlayTexture(true);
  const crackMatLow = new THREE.MeshBasicMaterial({
    map: crackTexLow,
    alphaTest: 0.35,
    transparent: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const crackMatHigh = new THREE.MeshBasicMaterial({
    map: crackTexHigh,
    alphaTest: 0.35,
    transparent: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });

  const sharedStdObsMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.68,
    metalness: 0.16,
  });
  const sharedBasicObsMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
  });

  const sharedObstacleTexCache = new Map<string, THREE.Texture>();
  const obstacleContainer = new THREE.Group();
  group.add(obstacleContainer);
  const obstacleEntries = new Map<string, ObstacleRenderEntry>();

  const rebuildObstacles = (list: MapObstacle[]) => {
    for (const entry of obstacleEntries.values()) {
      obstacleContainer.remove(entry.wrapper);
      entry.wrapper.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (
          m.material &&
          m.material !== crackMatLow &&
          m.material !== crackMatHigh &&
          m.material !== sharedStdObsMat &&
          m.material !== sharedBasicObsMat
        ) {
          if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
          else m.material.dispose();
        }
      });
    }
    obstacleEntries.clear();
    list.forEach((obs, idx) => {
      const gy = getMapTerrainHeight(mapId, obs.x, obs.z);
      const entry = buildObstacleVisual(
        obs,
        idx,
        mapId,
        gy,
        crackMatLow,
        crackMatHigh,
        sharedStdObsMat,
        sharedBasicObsMat,
        extraTextures,
        sharedObstacleTexCache
      );
      obstacleContainer.add(entry.wrapper);
      obstacleEntries.set(obs.id, entry);
    });
  };

  const initialObstacles = getMapObstacles(mapId);
  rebuildObstacles(initialObstacles);
  let currentLayoutSig = computeObstacleLayoutSignature(initialObstacles);

  // Multi-Biome Interactive Terrain Zones (Water, Lava, Tall Grass/Bamboo, Steam Vents)
  const terrainZones = MAP_TERRAIN_ZONES[mapId] ?? [];
  const waterMats: THREE.MeshStandardMaterial[] = [];
  const lavaMats: THREE.MeshBasicMaterial[] = [];
  const grassBladeGroups: Array<{ group: THREE.Group; phase: number }> = [];
  const steamClouds: Array<{ rings: THREE.Mesh[]; baseY: number; radius: number; phase: number }> = [];

  for (let zi = 0; zi < terrainZones.length; zi++) {
    const zSpec = terrainZones[zi];
    if (zSpec.kind === 'water') {
      const surfaceY = (zSpec.floorOffsetY ?? -0.22) + 0.13;
      const waterGeo =
        zSpec.shape === 'circle'
          ? new THREE.CircleGeometry((zSpec.radius ?? 4) * 0.96, 36)
          : new THREE.PlaneGeometry((zSpec.halfW ?? 4) * 1.94, (zSpec.halfD ?? 2) * 1.94);
      waterGeo.rotateX(-Math.PI * 0.5);
      const wMat = new THREE.MeshStandardMaterial({
        color: mapId === 'shibuya' ? 0x0ea5e9 : mapId === 'temple' ? 0x06b6d4 : 0x22d3ee,
        emissive: 0x0284c7,
        emissiveIntensity: 0.3,
        roughness: 0.14,
        metalness: 0.55,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      });
      const wMesh = new THREE.Mesh(waterGeo, wMat);
      wMesh.position.set(zSpec.x, surfaceY, zSpec.z);
      wMesh.renderOrder = 2;
      group.add(wMesh);
      waterMats.push(wMat);

      // Solid crisp water ripple rings
      const rippleR = zSpec.shape === 'circle' ? (zSpec.radius ?? 4) * 0.56 : Math.min(zSpec.halfW ?? 4, zSpec.halfD ?? 2) * 0.72;
      const ripGeo = new THREE.RingGeometry(rippleR * 0.78, rippleR * 0.92, 28);
      ripGeo.rotateX(-Math.PI * 0.5);
      const ripMat = new THREE.MeshBasicMaterial({
        color: 0xe0f2fe,
        side: THREE.DoubleSide,
      });
      const ripMesh = new THREE.Mesh(ripGeo, ripMat);
      ripMesh.position.set(zSpec.x, surfaceY + 0.015, zSpec.z);
      group.add(ripMesh);
      animatedMeshes.push((_dt, elapsed) => {
        const wave = 0.88 + 0.14 * Math.sin(elapsed * 2.2 + zi * 1.7);
        ripMesh.scale.setScalar(wave);
      });
    } else if (zSpec.kind === 'lava') {
      const surfaceY = (zSpec.floorOffsetY ?? -0.32) + 0.16;
      const lavaGeo =
        zSpec.shape === 'circle'
          ? new THREE.CircleGeometry((zSpec.radius ?? 3.8) * 0.95, 28)
          : new THREE.PlaneGeometry((zSpec.halfW ?? 6) * 1.94, (zSpec.halfD ?? 2.5) * 1.94);
      lavaGeo.rotateX(-Math.PI * 0.5);
      const lMat = new THREE.MeshBasicMaterial({
        color: 0xf97316,
      });
      const lMesh = new THREE.Mesh(lavaGeo, lMat);
      lMesh.position.set(zSpec.x, surfaceY, zSpec.z);
      lMesh.renderOrder = 2;
      group.add(lMesh);
      lavaMats.push(lMat);

      // Solid incandescent lava core
      const coreGeo =
        zSpec.shape === 'circle'
          ? new THREE.CircleGeometry((zSpec.radius ?? 3.8) * 0.56, 20)
          : new THREE.PlaneGeometry((zSpec.halfW ?? 6) * 1.35, (zSpec.halfD ?? 2.5) * 1.12);
      coreGeo.rotateX(-Math.PI * 0.5);
      const coreMat = new THREE.MeshBasicMaterial({
        color: 0xfef08a,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.position.set(zSpec.x, surfaceY + 0.02, zSpec.z);
      group.add(coreMesh);
      animatedMeshes.push((_dt, elapsed) => {
        const s = 0.92 + 0.08 * Math.sin(elapsed * 4.4 + zi * 1.9);
        coreMesh.scale.setScalar(s);
      });
    } else if (zSpec.kind === 'grass') {
      const r = zSpec.radius ?? 3.2;
      const gy = getMapTerrainHeight(mapId, zSpec.x, zSpec.z);
      const padMesh = new THREE.Mesh(
        new THREE.CircleGeometry(r, 24),
        new THREE.MeshBasicMaterial({
          color: mapId === 'temple' ? 0x15803d : 0x65a30d,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        })
      );
      padMesh.rotation.x = -Math.PI * 0.5;
      padMesh.position.set(zSpec.x, gy + 0.02, zSpec.z);
      group.add(padMesh);

      const grassGroup = new THREE.Group();
      grassGroup.position.set(zSpec.x, gy, zSpec.z);
      const bladeGeos: THREE.BufferGeometry[] = [];
      const bladeCount = mapId === 'temple' ? 18 : 26;
      const isBamboo = mapId === 'temple';
      for (let b = 0; b < bladeCount; b++) {
        const ang = (b / bladeCount) * Math.PI * 2 + b * 0.71;
        const dist = ((b * 37) % 100) / 100 * (r * 0.84);
        const bx = Math.cos(ang) * dist;
        const bz = Math.sin(ang) * dist;
        const bh = isBamboo ? 2.15 + (b % 3) * 0.45 : 1.15 + (b % 4) * 0.22;
        const blade = isBamboo
          ? new THREE.CylinderGeometry(0.06, 0.09, bh, 5)
          : new THREE.ConeGeometry(0.16, bh, 4);
        pushColoredGeo(
          bladeGeos,
          blade,
          b % 3 === 0 ? 0x4d7c0f : b % 3 === 1 ? 0x84cc16 : 0x16a34a,
          bx,
          bh * 0.5,
          bz,
          (Math.sin(b) * 0.14),
          ang,
          (Math.cos(b) * 0.12)
        );
      }
      const mergedBlades = safeMerge(bladeGeos);
      if (mergedBlades) {
        const bladesMesh = new THREE.Mesh(mergedBlades, sharedStdObsMat);
        bladesMesh.castShadow = false;
        grassGroup.add(bladesMesh);
      }
      group.add(grassGroup);
      grassBladeGroups.push({ group: grassGroup, phase: zi * 1.4 });
    } else if (zSpec.kind === 'steam') {
      const r = zSpec.radius ?? 3.0;
      const gy = getMapTerrainHeight(mapId, zSpec.x, zSpec.z);
      const grate = new THREE.Mesh(
        new THREE.RingGeometry(r * 0.28, r * 0.92, 20),
        new THREE.MeshBasicMaterial({
          color: mapId === 'shibuya' ? 0xbae6fd : 0x94a3b8,
          side: THREE.DoubleSide,
        })
      );
      grate.rotation.x = -Math.PI * 0.5;
      grate.position.set(zSpec.x, gy + 0.025, zSpec.z);
      group.add(grate);

      const rings: THREE.Mesh[] = [];
      for (let k = 0; k < 3; k++) {
        const sMesh = new THREE.Mesh(
          new THREE.TorusGeometry(r * 0.55, 0.07, 6, 18),
          new THREE.MeshBasicMaterial({
            color: mapId === 'shibuya' ? 0xe0f2fe : 0xcbd5e1,
          })
        );
        sMesh.rotation.x = Math.PI * 0.5;
        sMesh.position.set(zSpec.x, gy + 0.4 + k * 0.55, zSpec.z);
        group.add(sMesh);
        rings.push(sMesh);
      }
      steamClouds.push({ rings, baseY: gy, radius: r, phase: zi * 1.3 });
    }
  }

  if (waterMats.length > 0 || lavaMats.length > 0 || grassBladeGroups.length > 0 || steamClouds.length > 0) {
    animatedMeshes.push((_dt, elapsed) => {
      for (let i = 0; i < waterMats.length; i++) {
        waterMats[i].emissiveIntensity = 0.24 + 0.1 * Math.sin(elapsed * 2.5 + i);
      }
      for (let i = 0; i < lavaMats.length; i++) {
        lavaMats[i].color.setHex(Math.sin(elapsed * 3.8 + i * 1.2) > 0 ? 0xf97316 : 0xea580c);
      }
      for (const gb of grassBladeGroups) {
        gb.group.rotation.z = Math.sin(elapsed * 2.1 + gb.phase) * 0.045;
        gb.group.rotation.x = Math.cos(elapsed * 1.7 + gb.phase) * 0.035;
      }
      for (const sc of steamClouds) {
        for (let k = 0; k < sc.rings.length; k++) {
          const cyc = ((elapsed * 0.55 + k / sc.rings.length + sc.phase) % 1);
          const m = sc.rings[k];
          m.position.y = sc.baseY + 0.25 + cyc * 1.85;
          m.rotation.z = elapsed * (0.45 + k * 0.15);
          const pulseScale = Math.max(0.15, Math.sin(cyc * Math.PI)) * (0.85 + cyc * 0.3);
          m.scale.set(pulseScale, pulseScale, pulseScale);
        }
      }
    });
  }

  // Merged Static 3D Playable Platforms: Bridges, Skybridges, Staircases, Parkour Courses & Pedestal Podiums (2 draw calls)
  const static3DStdGeos: THREE.BufferGeometry[] = [];
  const static3DBasicGeos: THREE.BufferGeometry[] = [];
  const static3DZones = getMapStatic3DZones(mapId);

  for (const zSpec of static3DZones) {
    if (zSpec.zoneType === 'second_floor' || zSpec.zoneType === 'balcony' || zSpec.zoneType === 'floor_slab') {
      continue;
    }
    const w = zSpec.maxX - zSpec.minX;
    const d = zSpec.maxZ - zSpec.minZ;
    const cx = (zSpec.minX + zSpec.maxX) * 0.5;
    const cz = (zSpec.minZ + zSpec.maxZ) * 0.5;
    const colHex = zSpec.colorHex ?? 0x475569;
    const accHex = zSpec.accentHex ?? accentHex;

    if (zSpec.zoneType === 'stairs') {
      const steps = 10;
      const axis = zSpec.rampAxis ?? 'z';
      for (let s = 0; s < steps; s++) {
        const t = (s + 0.5) / steps;
        const sx = axis === 'x' ? zSpec.minX + w * t : cx;
        const sz = axis === 'z' ? zSpec.minZ + d * t : cz;
        const topRel = getStatic3DZoneTopAt(zSpec, sx, sz);
        const gy = getMapTerrainHeight(mapId, sx, sz);
        const stepThick = Math.max(0.24, Math.min(0.45, zSpec.topY / steps + 0.14));
        const treadW = axis === 'x' ? w / steps + 0.04 : w;
        const treadD = axis === 'z' ? d / steps + 0.04 : d;
        pushColoredGeo(
          static3DStdGeos,
          new THREE.BoxGeometry(treadW, stepThick, treadD),
          colHex,
          sx,
          gy + topRel - stepThick * 0.5,
          sz
        );
        if (s % 2 === 0) {
          pushColoredGeo(
            static3DBasicGeos,
            new THREE.BoxGeometry(axis === 'x' ? treadW * 0.85 : w * 0.92, 0.04, axis === 'z' ? treadD * 0.85 : d * 0.92),
            accHex,
            sx,
            gy + topRel + 0.01,
            sz
          );
        }
      }
      // Side guard rails along stairs
      const midGy = getMapTerrainHeight(mapId, cx, cz);
      const yStart = zSpec.rampStartY ?? 0;
      const yEnd = zSpec.rampEndY ?? zSpec.topY;
      const spanLen = axis === 'x' ? w : d;
      const slopeLen = Math.hypot(spanLen, yEnd - yStart);
      const pitchAng = Math.atan2(yEnd - yStart, spanLen);
      for (const sideSign of [-1, 1]) {
        const railX = axis === 'z' ? cx + sideSign * (w * 0.48) : cx;
        const railZ = axis === 'x' ? cz + sideSign * (d * 0.48) : cz;
        const railY = midGy + (yStart + yEnd) * 0.5 + 0.58;
        pushColoredGeo(
          static3DStdGeos,
          new THREE.BoxGeometry(axis === 'x' ? slopeLen : 0.12, 0.14, axis === 'z' ? slopeLen : 0.12),
          0x1e293b,
          railX,
          railY,
          railZ,
          axis === 'z' ? -pitchAng : 0,
          0,
          axis === 'x' ? pitchAng : 0
        );
      }
    } else if (zSpec.zoneType === 'skybridge') {
      const gy = getMapTerrainHeight(mapId, cx, cz);
      const isGroundBridge = zSpec.bottomY <= 0.05 && !zSpec.passUnder;
      const baseFloorY = isGroundBridge ? -0.45 : gy + zSpec.bottomY;
      const topWorldY = gy + zSpec.topY;
      const deckH = Math.max(0.28, topWorldY - baseFloorY);
      pushColoredGeo(
        static3DStdGeos,
        new THREE.BoxGeometry(w, deckH, d),
        colHex,
        cx,
        baseFloorY + deckH * 0.5,
        cz
      );
      // Glowing trim edge & safety handrails along longer edges
      const longAlongX = w >= d;
      for (const sideSign of [-1, 1]) {
        const rx = longAlongX ? cx : cx + sideSign * (w * 0.47);
        const rz = longAlongX ? cz + sideSign * (d * 0.47) : cz;
        pushColoredGeo(
          static3DBasicGeos,
          new THREE.BoxGeometry(longAlongX ? w : 0.08, 0.09, longAlongX ? 0.08 : d),
          accHex,
          rx,
          topWorldY + 0.04,
          rz
        );
        pushColoredGeo(
          static3DStdGeos,
          new THREE.BoxGeometry(longAlongX ? w : 0.1, 0.72, longAlongX ? 0.1 : d),
          0x1e293b,
          rx,
          topWorldY + 0.36,
          rz
        );
      }
      if (zSpec.passUnder) {
        // End support pylons flanking skybridge
        for (const endSign of [-1, 1]) {
          const px = longAlongX ? cx + endSign * (w * 0.45) : cx;
          const pz = longAlongX ? cz : cz + endSign * (d * 0.45);
          const pGy = getMapTerrainHeight(mapId, px, pz);
          const colH = Math.max(0.5, topWorldY - pGy);
          pushColoredGeo(
            static3DStdGeos,
            new THREE.CylinderGeometry(0.22, 0.28, colH, 8),
            0x334155,
            px,
            pGy + colH * 0.5,
            pz
          );
        }
      }
    } else if (zSpec.zoneType === 'parkour') {
      const gy = getMapTerrainHeight(mapId, cx, cz);
      const thick = Math.max(0.45, zSpec.topY - zSpec.bottomY);
      const midY = gy + zSpec.bottomY + thick * 0.5;
      pushColoredGeo(static3DStdGeos, new THREE.BoxGeometry(w, thick, d), colHex, cx, midY, cz);
      pushColoredGeo(
        static3DBasicGeos,
        new THREE.BoxGeometry(w * 0.94, 0.1, d * 0.94),
        accHex,
        cx,
        gy + zSpec.topY - 0.03,
        cz
      );
      if (zSpec.passUnder && zSpec.bottomY > 0.4) {
        // Decorative glowing anchor beam or pillar offset cleanly so walking underneath is unobstructed
        pushColoredGeo(
          static3DStdGeos,
          new THREE.BoxGeometry(w * 0.5, 0.28, d * 0.5),
          0x0f172a,
          cx,
          gy + zSpec.bottomY - 0.14,
          cz
        );
      }
    } else if (zSpec.zoneType === 'pedestal') {
      const gy = getMapTerrainHeight(mapId, cx, cz);
      const radius = Math.min(w, d) * 0.5;
      const thick = Math.max(0.5, zSpec.topY - zSpec.bottomY);
      const plinthH = thick * 0.62;
      const capH = thick * 0.38;
      // Tiered octagonal Glowing Podium
      pushColoredGeo(
        static3DStdGeos,
        new THREE.CylinderGeometry(radius * 0.86, radius * 1.04, plinthH, 8),
        colHex,
        cx,
        gy + zSpec.bottomY + plinthH * 0.5,
        cz
      );
      pushColoredGeo(
        static3DStdGeos,
        new THREE.CylinderGeometry(radius * 0.96, radius * 0.9, capH, 8),
        colHex,
        cx,
        gy + zSpec.bottomY + plinthH + capH * 0.5,
        cz
      );
      pushColoredGeo(
        static3DBasicGeos,
        new THREE.RingGeometry(radius * 0.55, radius * 0.88, 16),
        accHex,
        cx,
        gy + zSpec.topY + 0.025,
        cz,
        -Math.PI * 0.5,
        0,
        0
      );
      pushColoredGeo(
        static3DBasicGeos,
        new THREE.TorusGeometry(radius * 0.94, 0.065, 6, 16),
        accHex,
        cx,
        gy + zSpec.topY - 0.04,
        cz,
        Math.PI * 0.5,
        0,
        0
      );
    }
  }

  const mergedStatic3DStd = safeMerge(static3DStdGeos);
  if (mergedStatic3DStd) {
    const m = new THREE.Mesh(mergedStatic3DStd, sharedStdObsMat);
    m.castShadow = false;
    m.receiveShadow = false;
    group.add(m);
  }
  const mergedStatic3DBasic = safeMerge(static3DBasicGeos);
  if (mergedStatic3DBasic) {
    const m = new THREE.Mesh(mergedStatic3DBasic, sharedBasicObsMat);
    m.castShadow = false;
    m.receiveShadow = false;
    group.add(m);
  }

  // Enterable Multi-Story Buildings: Interior Floor Pads, Furnishings, Playable 2F Floors/Balconies & Smart Multi-Level Cutaway
  const enterableBuildings: EnterableBuildingSpec[] = MAP_ENTERABLE_BUILDINGS[mapId] ?? [];
  const buildingCutaways: Array<{
    spec: EnterableBuildingSpec;
    hasSecondFloor: boolean;
    secondFloorY: number;
    ceiling2FGroup: THREE.Group | null;
    mats2F: THREE.MeshStandardMaterial[];
    basicMats2F: THREE.MeshBasicMaterial[];
    opacity2F: number;
    upperRoofGroup: THREE.Group;
    roofMats: THREE.MeshStandardMaterial[];
    basicMats: THREE.MeshBasicMaterial[];
    opacityRoof: number;
  }> = [];

  for (const b of enterableBuildings) {
    const gy = getMapTerrainHeight(mapId, b.x, b.z);
    const bWrap = new THREE.Group();
    bWrap.position.set(b.x, gy, b.z);
    group.add(bWrap);

    // 1F Textured Interior Floor Pad
    const floorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(b.halfW * 2 - 0.18, 0.08, b.halfD * 2 - 0.18),
      new THREE.MeshStandardMaterial({ color: b.floorColorHex, roughness: 0.72, metalness: 0.08 })
    );
    floorMesh.position.y = 0.04;
    bWrap.add(floorMesh);

    // 1F Interior Furnishings & Corner Foundation Pillars (static ground floor details)
    const intStdGeos: THREE.BufferGeometry[] = [];
    const intBasicGeos: THREE.BufferGeometry[] = [];
    const cornerH = b.wallHeight;
    for (const cxSign of [-1, 1]) {
      for (const czSign of [-1, 1]) {
        pushColoredGeo(
          intStdGeos,
          new THREE.BoxGeometry(0.46, cornerH, 0.46),
          b.wallColorHex,
          cxSign * (b.halfW - 0.12),
          cornerH * 0.5,
          czSign * (b.halfD - 0.12)
        );
      }
    }

    // Doorway lintel arches & glowing threshold strips so entrances look crisp from outside & inside
    const doorHalfGap = b.style === 'volcano' || b.style === 'coliseum' || b.isSubterranean ? 2.25 : 1.55;
    for (const side of b.doorSides) {
      const isHoriz = side === 'n' || side === 's';
      const doorMat = new THREE.MeshBasicMaterial({
        color: b.accentColorHex,
      });
      const thresh = new THREE.Mesh(
        new THREE.BoxGeometry(isHoriz ? doorHalfGap * 1.9 : 0.24, 0.06, isHoriz ? 0.24 : doorHalfGap * 1.9),
        doorMat
      );
      thresh.position.set(
        side === 'w' ? -b.halfW : side === 'e' ? b.halfW : 0,
        0.075,
        side === 'n' ? -b.halfD : side === 's' ? b.halfD : 0
      );
      bWrap.add(thresh);

      // Doorway header beam above opening
      pushColoredGeo(
        intStdGeos,
        new THREE.BoxGeometry(isHoriz ? doorHalfGap * 2.15 : 0.44, 0.52, isHoriz ? 0.44 : doorHalfGap * 2.15),
        b.wallColorHex,
        side === 'w' ? -b.halfW : side === 'e' ? b.halfW : 0,
        Math.min(3.35, b.wallHeight - 0.25),
        side === 'n' ? -b.halfD : side === 's' ? b.halfD : 0
      );
    }

    // Thematic 1F Interior Props placed away from doorway centers
    if (b.style === 'store' || b.style === 'ramen') {
      pushColoredGeo(intStdGeos, new THREE.BoxGeometry(3.2, 0.95, 0.85), 0x475569, 1.5, 0.48, -b.halfD + 1.2);
      pushColoredGeo(intBasicGeos, new THREE.BoxGeometry(3.0, 0.16, 0.88), b.accentColorHex, 1.5, 0.96, -b.halfD + 1.2);
    } else if (b.style === 'arcade') {
      for (const ax of [-2.2, 0, 2.2]) {
        pushColoredGeo(intStdGeos, new THREE.BoxGeometry(0.9, 1.7, 0.8), 0x1e293b, ax, 0.85, -b.halfD + 1.1);
        pushColoredGeo(intBasicGeos, new THREE.BoxGeometry(0.75, 0.65, 0.12), b.accentColorHex, ax, 1.2, -b.halfD + 1.52);
      }
    } else if (b.style === 'dojo' || b.style === 'pavilion' || b.style === 'shrine') {
      pushColoredGeo(intStdGeos, new THREE.BoxGeometry(3.6, 0.12, 2.2), 0xa3e635, 0, 0.09, -b.halfD + 1.8);
      pushColoredGeo(intStdGeos, new THREE.BoxGeometry(2.6, 0.72, 0.7), 0x78350f, 0, 0.36, -b.halfD + 0.9);
      pushColoredGeo(intBasicGeos, new THREE.OctahedronGeometry(0.32, 0), 0xfacc15, 0, 1.1, -b.halfD + 0.9);
    } else if (b.style === 'forge') {
      pushColoredGeo(intStdGeos, new THREE.BoxGeometry(1.4, 0.88, 0.9), 0x334155, 2.0, 0.44, 1.8);
      pushColoredGeo(intBasicGeos, new THREE.BoxGeometry(1.0, 0.25, 1.0), 0xf97316, 2.0, 0.95, 1.8);
    }

    const mergedIntStd = safeMerge(intStdGeos);
    if (mergedIntStd) bWrap.add(new THREE.Mesh(mergedIntStd, sharedStdObsMat));
    const mergedIntBasic = safeMerge(intBasicGeos);
    if (mergedIntBasic) bWrap.add(new THREE.Mesh(mergedIntBasic, sharedBasicObsMat));

    // Playable 2nd Floor Slab + Balcony + Guardrails + 2F Furniture (independent cutaway layer #1)
    let ceiling2FGroup: THREE.Group | null = null;
    const mats2F: THREE.MeshStandardMaterial[] = [];
    const basicMats2F: THREE.MeshBasicMaterial[] = [];

    if (b.hasSecondFloor && b.secondFloorY) {
      ceiling2FGroup = new THREE.Group();
      bWrap.add(ceiling2FGroup);

      const slab2FMat = new THREE.MeshStandardMaterial({
        color: b.floorColorHex,
        roughness: 0.65,
        metalness: 0.12,
      });
      const rail2FMat = new THREE.MeshStandardMaterial({
        color: b.wallColorHex,
        roughness: 0.55,
        metalness: 0.25,
      });
      const accent2FMat = new THREE.MeshBasicMaterial({
        color: b.accentColorHex,
      });
      mats2F.push(slab2FMat, rail2FMat);
      basicMats2F.push(accent2FMat);

      const sy = b.secondFloorY;
      const slabThickness = 0.28;

      if (b.stairSide === 'interior') {
        // Split 2F slab cleanly around interior stairwell hole (cutout on west interior flank)
        const rightSlabW = b.halfW * 2 - 2.6;
        const rightSlab = new THREE.Mesh(
          new THREE.BoxGeometry(rightSlabW, slabThickness, b.halfD * 2 - 0.2),
          slab2FMat
        );
        rightSlab.position.set(1.2, sy - slabThickness * 0.5, 0);
        ceiling2FGroup.add(rightSlab);

        const northCap = new THREE.Mesh(new THREE.BoxGeometry(2.4, slabThickness, Math.max(0.8, b.halfD - 2.6)), slab2FMat);
        northCap.position.set(-b.halfW + 1.35, sy - slabThickness * 0.5, -(b.halfD + 2.6) * 0.5 + 0.15);
        const southCap = new THREE.Mesh(new THREE.BoxGeometry(2.4, slabThickness, Math.max(0.8, b.halfD - 2.2)), slab2FMat);
        southCap.position.set(-b.halfW + 1.35, sy - slabThickness * 0.5, (b.halfD + 2.2) * 0.5 - 0.15);
        ceiling2FGroup.add(northCap, southCap);
      } else {
        const slab2F = new THREE.Mesh(
          new THREE.BoxGeometry(b.halfW * 2 - 0.12, slabThickness, b.halfD * 2 - 0.12),
          slab2FMat
        );
        slab2F.position.y = sy - slabThickness * 0.5;
        ceiling2FGroup.add(slab2F);
      }

      // Playable 2nd Floor Balcony + Railings
      if (b.balconySide && b.balconyDepth) {
        const bd = b.balconyDepth;
        const horiz = b.balconySide === 'n' || b.balconySide === 's';
        const bw = horiz ? b.halfW * 2 - 0.6 : bd + 0.2;
        const bdepth = horiz ? bd + 0.2 : b.halfD * 2 - 1.0;
        const bx = b.balconySide === 'w' ? -(b.halfW + bd * 0.5 - 0.05) : b.balconySide === 'e' ? b.halfW + bd * 0.5 - 0.05 : 0;
        const bz = b.balconySide === 'n' ? -(b.halfD + bd * 0.5 - 0.05) : b.balconySide === 's' ? b.halfD + bd * 0.5 - 0.05 : 0;

        const balDeck = new THREE.Mesh(new THREE.BoxGeometry(bw, slabThickness, bdepth), slab2FMat);
        balDeck.position.set(bx, sy - slabThickness * 0.5, bz);
        ceiling2FGroup.add(balDeck);

        const outerOffset = horiz ? (b.balconySide === 's' ? bz + bd * 0.45 : bz - bd * 0.45) : (b.balconySide === 'e' ? bx + bd * 0.45 : bx - bd * 0.45);
        const balRail = new THREE.Mesh(
          new THREE.BoxGeometry(horiz ? bw : 0.14, 0.78, horiz ? 0.14 : bdepth),
          rail2FMat
        );
        balRail.position.set(horiz ? bx : outerOffset, sy + 0.39, horiz ? outerOffset : bz);
        ceiling2FGroup.add(balRail);

        const balGlow = new THREE.Mesh(
          new THREE.BoxGeometry(horiz ? bw : 0.16, 0.1, horiz ? 0.16 : bdepth),
          accent2FMat
        );
        balGlow.position.set(horiz ? bx : outerOffset, sy + 0.78, horiz ? outerOffset : bz);
        ceiling2FGroup.add(balGlow);
      }

      // 2F Perimeter Trim & Decorative Tables/Seating
      const midTrim = new THREE.Mesh(new THREE.BoxGeometry(b.halfW * 2 + 0.42, 0.14, b.halfD * 2 + 0.42), accent2FMat);
      midTrim.position.y = sy - 0.06;
      ceiling2FGroup.add(midTrim);

      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.48, 0.9), rail2FMat);
      bench.position.set(0.8, sy + 0.24, 0);
      ceiling2FGroup.add(bench);
    }

    // Upper Roof & Upper 2F Perimeter Crown Group (independent cutaway layer #2)
    const upperRoofGroup = new THREE.Group();
    bWrap.add(upperRoofGroup);

    const roofMat = new THREE.MeshStandardMaterial({
      color: b.roofColorHex,
      roughness: 0.52,
      metalness: 0.22,
    });
    const upperWallMat = new THREE.MeshStandardMaterial({
      color: b.wallColorHex,
      roughness: 0.6,
      metalness: 0.14,
    });
    const trimMat = new THREE.MeshBasicMaterial({
      color: b.accentColorHex,
    });

    const topRoofY = b.hasSecondFloor && b.upperRoofY ? b.upperRoofY : b.wallHeight;

    // 2nd Story Upper Corner Columns + Upper Window Collar Walls (when 2-story building)
    if (b.hasSecondFloor && b.secondFloorY) {
      const story2H = Math.max(2.6, topRoofY - b.secondFloorY);
      const mid2Y = b.secondFloorY + story2H * 0.5;
      for (const cxSign of [-1, 1]) {
        for (const czSign of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.46, story2H, 0.46), upperWallMat);
          post.position.set(cxSign * (b.halfW - 0.12), mid2Y, czSign * (b.halfD - 0.12));
          upperRoofGroup.add(post);
        }
      }
      // Panoramic 2F header lintels along front/back walls
      for (const zSign of [-1, 1]) {
        const hdr = new THREE.Mesh(new THREE.BoxGeometry(b.halfW * 2, 0.72, 0.34), upperWallMat);
        hdr.position.set(0, topRoofY - 0.36, zSign * (b.halfD - 0.1));
        upperRoofGroup.add(hdr);
      }
    }

    const roofSlab = new THREE.Mesh(
      new THREE.BoxGeometry(b.halfW * 2 + 0.9, 0.36, b.halfD * 2 + 0.9),
      roofMat
    );
    roofSlab.position.y = topRoofY + 0.18;
    upperRoofGroup.add(roofSlab);

    if (b.style === 'dojo' || b.style === 'pavilion' || b.style === 'shrine') {
      const peakRoof = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(b.halfW, b.halfD) * 1.48, 1.75, 4),
        roofMat
      );
      peakRoof.position.y = topRoofY + 1.15;
      peakRoof.rotation.y = Math.PI * 0.25;
      upperRoofGroup.add(peakRoof);
    } else if (b.style === 'volcano') {
      const volcanoCone = new THREE.Mesh(
        new THREE.CylinderGeometry(4.2, Math.max(b.halfW, b.halfD) * 1.38, 3.8, 10, 1, true),
        roofMat
      );
      volcanoCone.position.y = topRoofY + 1.75;
      upperRoofGroup.add(volcanoCone);
      const magmaRim = new THREE.Mesh(
        new THREE.TorusGeometry(4.15, 0.28, 6, 16),
        trimMat
      );
      magmaRim.rotation.x = Math.PI * 0.5;
      magmaRim.position.y = topRoofY + 3.6;
      upperRoofGroup.add(magmaRim);
      const innerLava = new THREE.Mesh(
        new THREE.RingGeometry(2.1, 3.1, 20),
        new THREE.MeshBasicMaterial({
          color: 0xf97316,
          side: THREE.DoubleSide,
        })
      );
      innerLava.rotation.x = -Math.PI * 0.5;
      innerLava.position.y = 0.095;
      bWrap.add(innerLava);
    } else if (b.style === 'coliseum') {
      const colonnadeRing = new THREE.Mesh(
        new THREE.TorusGeometry(Math.max(b.halfW, b.halfD) * 0.98, 0.32, 6, 18),
        roofMat
      );
      colonnadeRing.rotation.x = Math.PI * 0.5;
      colonnadeRing.position.y = topRoofY + 0.45;
      upperRoofGroup.add(colonnadeRing);
    } else if (b.style === 'catacomb') {
      const cryptSeal = new THREE.Mesh(
        new THREE.RingGeometry(2.0, 2.95, 16),
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          side: THREE.DoubleSide,
        })
      );
      cryptSeal.rotation.x = -Math.PI * 0.5;
      cryptSeal.position.y = 0.095;
      bWrap.add(cryptSeal);
    }

    const trimBand = new THREE.Mesh(
      new THREE.BoxGeometry(b.halfW * 2 + 0.96, 0.16, b.halfD * 2 + 0.96),
      trimMat
    );
    trimBand.position.y = topRoofY + 0.06;
    upperRoofGroup.add(trimBand);

    const signTex = createNeonBillboardTexture(
      b.name,
      '#0f172a',
      '#' + b.accentColorHex.toString(16).padStart(6, '0')
    );
    extraTextures.push(signTex);
    const roofSignMat = new THREE.MeshBasicMaterial({
      map: signTex,
    });
    const roofSign = new THREE.Mesh(new THREE.BoxGeometry(Math.min(5.2, b.halfW * 1.45), 0.78, 0.22), roofSignMat);
    roofSign.position.set(0, topRoofY + 0.76, b.halfD + 0.38);
    upperRoofGroup.add(roofSign);

    buildingCutaways.push({
      spec: b,
      hasSecondFloor: Boolean(b.hasSecondFloor && b.secondFloorY),
      secondFloorY: b.secondFloorY ?? b.wallHeight,
      ceiling2FGroup,
      mats2F,
      basicMats2F,
      opacity2F: 1,
      upperRoofGroup,
      roofMats: [roofMat, upperWallMat],
      basicMats: [trimMat, roofSignMat],
      opacityRoof: 1,
    });
  }

  // Cryo Frozen Water Sheets Pool (6 reusable meshes layered cleanly over frozen ponds)
  const frozenPool: Array<{ mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial }> = [];
  const frozenGeo = new THREE.CylinderGeometry(1, 1, 0.08, 24);
  for (let i = 0; i < 6; i++) {
    const fMat = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.45,
      roughness: 0.1,
      metalness: 0.3,
    });
    const fMesh = new THREE.Mesh(frozenGeo, fMat);
    fMesh.visible = false;
    fMesh.renderOrder = 3;
    group.add(fMesh);
    frozenPool.push({ mesh: fMesh, mat: fMat });
  }

  animatedMeshes.push((dt) => {
    for (const entry of obstacleEntries.values()) {
      if (entry.shakeTimer > 0) {
        entry.shakeTimer = Math.max(0, entry.shakeTimer - dt);
        const mag = (entry.shakeTimer / 0.14) * 0.14;
        entry.wrapper.position.set(
          entry.baseX + (Math.random() - 0.5) * mag,
          entry.baseY,
          entry.baseZ + (Math.random() - 0.5) * mag
        );
      } else if (entry.wrapper.position.x !== entry.baseX || entry.wrapper.position.z !== entry.baseZ) {
        entry.wrapper.position.set(entry.baseX, entry.baseY, entry.baseZ);
      }
    }
  });

  // Ambient drifting atmospheric motes (single InstancedMesh draw call, zero-GC updates)
  const moteCount = Math.max(8, targetMoteCount);
  const moteGeo = new THREE.OctahedronGeometry(0.13, 0);
  const moteColor =
    mapId === 'shibuya'
      ? 0x38bdf8
      : mapId === 'meadow'
      ? 0xfef08a
      : mapId === 'temple'
      ? 0xfb923c
      : 0xc084fc;
  const moteMat = new THREE.MeshBasicMaterial({
    color: moteColor,
  });
  const moteInst = new THREE.InstancedMesh(moteGeo, moteMat, moteCount);
  moteInst.frustumCulled = false;
  const moteSeeds = Array.from({ length: moteCount }, (_, i) => ({
    angle: (i / moteCount) * Math.PI * 2,
    radius: 8.5 + (i % 9) * 3.2,
    baseY: 0.9 + (i % 5) * 1.2,
    speed: (i % 2 === 0 ? 1 : -1) * (0.12 + (i % 4) * 0.045),
    bobSpeed: 1.4 + (i % 3) * 0.6,
    scale: 0.65 + (i % 4) * 0.22,
  }));
  const moteDummy = new THREE.Object3D();
  group.add(moteInst);
  animatedMeshes.push((_dt, elapsed) => {
    for (let i = 0; i < moteCount; i++) {
      const s = moteSeeds[i];
      const a = s.angle + elapsed * s.speed;
      moteDummy.position.set(
        Math.cos(a) * s.radius,
        s.baseY + Math.sin(elapsed * s.bobSpeed + i) * 0.45,
        Math.sin(a) * s.radius
      );
      moteDummy.rotation.set(elapsed * 1.1 + i, elapsed * 0.8, 0);
      const pulse = s.scale * (0.75 + 0.3 * Math.sin(elapsed * 3.0 + i * 1.3));
      moteDummy.scale.setScalar(pulse);
      moteDummy.updateMatrix();
      moteInst.setMatrixAt(i, moteDummy.matrix);
    }
    moteInst.instanceMatrix.needsUpdate = true;
  });

  return {
    group,
    update: (dt, elapsed) => {
      for (const fn of animatedMeshes) fn(dt, elapsed);
    },
    syncObstacles: (obstacles, vfx) => {
      if (!obstacles || obstacles.length === 0) return;
      const nextSig = computeObstacleLayoutSignature(obstacles);
      if (nextSig !== currentLayoutSig) {
        currentLayoutSig = nextSig;
        rebuildObstacles(obstacles);
      }
      for (const obs of obstacles) {
        const entry = obstacleEntries.get(obs.id);
        if (!entry) continue;
        if (obs.hp < entry.lastHp && !obs.destroyed) {
          entry.shakeTimer = 0.14;
        }
        entry.lastHp = obs.hp;

        if (obs.destroyed) {
          if (!entry.wasDestroyed) {
            entry.wasDestroyed = true;
            vfx?.spawnRubbleBurst(
              entry.baseX,
              entry.baseY,
              entry.baseZ,
              Math.max(entry.spec.halfW, entry.spec.halfD),
              entry.spec.roofColorHex
            );
          }
          entry.mainGroup.visible = false;
          entry.crackLow.visible = false;
          entry.crackHigh.visible = false;
          entry.rubbleGroup.visible = true;
        } else {
          entry.wasDestroyed = false;
          entry.mainGroup.visible = true;
          entry.rubbleGroup.visible = false;
          const pct = obs.hp / Math.max(1, obs.maxHp);
          entry.crackLow.visible = pct < 0.72;
          entry.crackHigh.visible = pct < 0.38;
        }
      }
    },
    syncBuildingRoofCutaway: (localX, localRelY, localZ, dt) => {
      if (buildingCutaways.length === 0) return;
      const inside = findEnterableBuildingAt(mapId, localX, localRelY, localZ);
      let insideId = inside?.id ?? null;
      // Smoothly fade subterranean Catacombs lid as soon as player steps down into the stairwell pit
      if (!insideId && mapId === 'meadow') {
        const localTerrainY = getMapTerrainHeight('meadow', localX, localZ);
        if (localTerrainY + localRelY < -0.55 && localX > 13 && localZ > 13) {
          insideId = 'mead-catacomb-se';
        }
      }
      const damp = 1 - Math.exp(-12 * Math.max(0.001, dt));
      for (const bc of buildingCutaways) {
        const isInsideThis = bc.spec.id === insideId;
        // Multi-Level Cutaway:
        // - Inside 1F (< secondFloorY - 0.35): fade BOTH 2F ceiling AND upper roof for 100% clear view
        // - On 2F / Balcony (>= secondFloorY - 0.35): keep 2F ceiling solid underfoot, fade ONLY upper roof
        const onSecondFloorOrAbove = bc.hasSecondFloor && localRelY >= bc.secondFloorY - 0.35;
        const target2F = isInsideThis && bc.hasSecondFloor && !onSecondFloorOrAbove ? 0.08 : 1.0;
        const targetRoof = isInsideThis ? 0.08 : 1.0;

        if (bc.ceiling2FGroup) {
          bc.opacity2F += (target2F - bc.opacity2F) * damp;
          const faded2F = bc.opacity2F < 0.96;
          for (const m of bc.mats2F) {
            if (m.transparent !== faded2F) {
              m.transparent = faded2F;
              m.needsUpdate = true;
            }
            m.opacity = faded2F ? bc.opacity2F : 1.0;
            m.depthWrite = !faded2F;
          }
          for (const bm of bc.basicMats2F) {
            if (bm.transparent !== faded2F) {
              bm.transparent = faded2F;
              bm.needsUpdate = true;
            }
            bm.opacity = faded2F ? bc.opacity2F : 1.0;
            bm.depthWrite = !faded2F;
          }
          bc.ceiling2FGroup.visible = bc.opacity2F > 0.03;
        }

        bc.opacityRoof += (targetRoof - bc.opacityRoof) * damp;
        const fadedRoof = bc.opacityRoof < 0.96;
        for (const rm of bc.roofMats) {
          if (rm.transparent !== fadedRoof) {
            rm.transparent = fadedRoof;
            rm.needsUpdate = true;
          }
          rm.opacity = fadedRoof ? bc.opacityRoof : 1.0;
          rm.depthWrite = !fadedRoof;
        }
        for (const bm of bc.basicMats) {
          if (bm.transparent !== fadedRoof) {
            bm.transparent = fadedRoof;
            bm.needsUpdate = true;
          }
          bm.opacity = fadedRoof ? bc.opacityRoof : 1.0;
          bm.depthWrite = !fadedRoof;
        }
        bc.upperRoofGroup.visible = bc.opacityRoof > 0.03;
      }
    },
    syncFrozenWater: (zones) => {
      const list = zones ?? [];
      for (let i = 0; i < frozenPool.length; i++) {
        const slot = frozenPool[i];
        const fz = list[i];
        if (!fz || fz.remaining <= 0) {
          slot.mesh.visible = false;
          continue;
        }
        slot.mesh.visible = true;
        slot.mesh.position.set(fz.x, -0.05, fz.z);
        slot.mesh.scale.set(fz.radius, 1, fz.radius);
      }
    },
    dispose: () => {
      scene.remove(group);
      group.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
          if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
          else m.material.dispose();
        }
      });
      for (const tex of extraTextures) tex.dispose();
      sharedStdObsMat.dispose();
      sharedBasicObsMat.dispose();
      crackTexLow.dispose();
      crackTexHigh.dispose();
      groundTex.dispose();
      bumpTex?.dispose();
    },
  };
}

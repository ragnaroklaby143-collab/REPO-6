import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { FighterId, SkinId } from '../shared/gameData.ts';
import { AWAKENING_CONFIG } from '../shared/awakeningConfig.ts';
import {
  DEFAULT_POSE,
  FighterRig,
  createArticulatedFighter,
  disposeFighterRig,
  poseFighter,
} from './fighterBuilder.ts';
import { detectSoftwareWebGL } from './mapBuilder.ts';

export type CutscenePortraitVariant = 'color' | 'bw-manga' | 'domain-face';

const PORTRAIT_CACHE = new Map<string, string>();
const SIZE = 480;

function applyPortraitPostProcess(
  glCanvas: HTMLCanvasElement,
  variant: CutscenePortraitVariant,
  accentCss: string
): string {
  const out = document.createElement('canvas');
  out.width = SIZE;
  out.height = SIZE;
  const ctx = out.getContext('2d');
  if (!ctx) return '';

  ctx.clearRect(0, 0, SIZE, SIZE);

  if (variant === 'bw-manga') {
    // Draw raw WebGL image first, then compute luminance & 3x3 Sobel gradients for manga ink lines
    ctx.drawImage(glCanvas, 0, 0, SIZE, SIZE);
    const img = ctx.getImageData(0, 0, SIZE, SIZE);
    const d = img.data;
    const totalPixels = SIZE * SIZE;
    const alphaSnapshot = new Uint8Array(totalPixels);
    const lumGrid = new Float32Array(totalPixels);

    for (let i = 0; i < totalPixels; i += 1) {
      const p = i * 4;
      alphaSnapshot[i] = d[p + 3];
      lumGrid[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
    }

    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const idx = y * SIZE + x;
        const p = idx * 4;
        const a = alphaSnapshot[idx];
        if (a < 28) {
          d[p + 3] = 0;
          continue;
        }

        // Outer silhouette contour check
        const leftA = x > 1 ? alphaSnapshot[idx - 2] : 0;
        const rightA = x < SIZE - 2 ? alphaSnapshot[idx + 2] : 0;
        const upA = y > 1 ? alphaSnapshot[idx - SIZE * 2] : 0;
        const downA = y < SIZE - 2 ? alphaSnapshot[idx + SIZE * 2] : 0;
        const isRim = leftA < 40 || rightA < 40 || upA < 40 || downA < 40;

        if (isRim) {
          d[p] = 9;
          d[p + 1] = 9;
          d[p + 2] = 11;
          d[p + 3] = 255;
          continue;
        }

        // 3x3 Sobel edge gradient across luminance for interior ink details (eyes, hair, armor seams)
        let grad = 0;
        if (x > 0 && x < SIZE - 1 && y > 0 && y < SIZE - 1) {
          const tl = lumGrid[idx - SIZE - 1];
          const tc = lumGrid[idx - SIZE];
          const tr = lumGrid[idx - SIZE + 1];
          const ml = lumGrid[idx - 1];
          const mr = lumGrid[idx + 1];
          const bl = lumGrid[idx + SIZE - 1];
          const bc = lumGrid[idx + SIZE];
          const br = lumGrid[idx + SIZE + 1];
          const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
          const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
          grad = Math.hypot(gx, gy) * 0.25;
        }

        if (grad > 19) {
          d[p] = 10;
          d[p + 1] = 10;
          d[p + 2] = 14;
          d[p + 3] = 255;
          continue;
        }

        const lum = lumGrid[idx];
        const diagA = (x + y) % 6 < 2;
        const diagB = (x - y + SIZE) % 7 < 2;
        const stipple = (x % 4 === 0 && y % 4 === 0) || (x % 4 === 2 && y % 4 === 2);

        let tone = 252;
        if (lum < 68) {
          tone = 12;
        } else if (lum < 112) {
          tone = diagA || diagB ? 20 : 120;
        } else if (lum < 156) {
          tone = diagA ? 42 : 212;
        } else if (lum < 194) {
          tone = stipple ? 132 : 244;
        } else {
          tone = 254;
        }

        d[p] = tone;
        d[p + 1] = tone;
        d[p + 2] = tone;
        d[p + 3] = a > 180 ? 255 : a;
      }
    }
    ctx.putImageData(img, 0, 0);
    return out.toDataURL('image/png');
  }

  // Colored anime panel pass: bold ink silhouette backing + vibrant 3D render
  ctx.save();
  ctx.filter = variant === 'domain-face' ? 'contrast(1.18) saturate(1.22)' : 'contrast(1.12) saturate(1.16)';
  ctx.shadowColor = '#020617';
  ctx.shadowBlur = 5;
  ctx.drawImage(glCanvas, 0, 0, SIZE, SIZE);
  ctx.restore();

  // Subtle rim star glint above eyebrow without obscuring the face or eyes
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const cx = Math.round(SIZE * (variant === 'domain-face' ? 0.56 : 0.52));
  const cy = Math.round(SIZE * (variant === 'domain-face' ? 0.34 : 0.27));
  const flare = ctx.createRadialGradient(cx, cy, 1, cx, cy, variant === 'domain-face' ? 30 : 24);
  flare.addColorStop(0, 'rgba(255, 255, 255, 0.72)');
  flare.addColorStop(0.45, accentCss);
  flare.addColorStop(1, 'rgba(56, 189, 248, 0)');
  ctx.fillStyle = flare;
  ctx.beginPath();
  ctx.arc(cx, cy, variant === 'domain-face' ? 30 : 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  return out.toDataURL('image/png');
}

export function renderCutscenePortrait(
  fighterId: FighterId,
  skinId: SkinId,
  variant: CutscenePortraitVariant
): string {
  if (typeof document === 'undefined') return '';
  const cacheKey = `${fighterId}:${skinId}:${variant}:v6`;
  const cached = PORTRAIT_CACHE.get(cacheKey);
  if (cached) return cached;

  let renderer: THREE.WebGLRenderer | null = null;
  let envTex: THREE.Texture | null = null;
  let rig: FighterRig | null = null;
  const scene = new THREE.Scene();

  try {
    const isSoftwareGl = detectSoftwareWebGL();
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: !isSoftwareGl,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = variant === 'bw-manga' ? 0.88 : variant === 'domain-face' ? 1.12 : 1.04;
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    renderer.setClearColor(0x000000, 0);

    const pmrem = new THREE.PMREMGenerator(renderer);
    envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(
      0xffffff,
      variant === 'bw-manga' ? 0x1e293b : 0x334155,
      variant === 'bw-manga' ? 0.48 : variant === 'domain-face' ? 0.95 : 0.85
    );
    scene.add(hemi);

    const kit = AWAKENING_CONFIG.AWAKENED_KITS[fighterId];
    const key = new THREE.DirectionalLight(
      0xfffbeb,
      variant === 'bw-manga' ? 1.18 : 1.42
    );
    key.position.set(variant === 'color' ? -2.2 : 2.0, 3.2, 2.4);
    scene.add(key);

    const rim = new THREE.DirectionalLight(
      variant === 'bw-manga' ? 0xe2e8f0 : kit.auraPrimaryHex,
      variant === 'bw-manga' ? 0.5 : variant === 'domain-face' ? 1.35 : 0.95
    );
    rim.position.set(variant === 'color' ? 3.2 : -2.6, 2.5, -1.8);
    scene.add(rim);

    rig = createArticulatedFighter(fighterId, scene, skinId, false);
    rig.overheadSprite.visible = false;
    rig.contactShadow.visible = false;
    rig.auraRing.visible = false;
    if (rig.heroInnerRing) rig.heroInnerRing.visible = false;
    rig.silencedRing.visible = false;
    rig.snareMarkRing.visible = false;

    const pose =
      variant === 'domain-face'
        ? {
            ...DEFAULT_POSE,
            y: 0,
            rotY: -0.1,
            torsoPitch: 0.04,
            torsoYaw: -0.04,
            headYaw: 0.06,
            headPitch: -0.06,
            armLAngle: [-0.95, 0.25, -0.2] as [number, number, number],
            elbowL: -0.8,
            armRAngle: [-0.95, -0.25, 0.2] as [number, number, number],
            elbowR: -0.8,
            eyeState: 'fierce' as const,
            auraOpacity: 0.9,
          }
        : variant === 'color'
        ? {
            ...DEFAULT_POSE,
            y: 0,
            rotY: -0.24,
            torsoPitch: 0.04,
            torsoYaw: -0.06,
            headYaw: 0.12,
            headPitch: -0.14,
            // Extended pointing / energy hand toward the viewer
            armLAngle: [-1.35, 0.2, -0.14] as [number, number, number],
            elbowL: -0.22,
            armRAngle: [-0.46, -0.2, 0.28] as [number, number, number],
            elbowR: -0.78,
            eyeState: 'fierce' as const,
            auraOpacity: 0.85,
          }
        : {
            ...DEFAULT_POSE,
            y: 0,
            rotY: 0.24,
            torsoPitch: 0.05,
            torsoYaw: 0.06,
            headYaw: -0.12,
            headPitch: -0.14,
            // Raised two-finger / fist stance on opposite side
            armRAngle: [-1.38, -0.22, 0.14] as [number, number, number],
            elbowR: -0.34,
            armLAngle: [-0.52, 0.2, -0.28] as [number, number, number],
            elbowL: -0.82,
            eyeState: 'fierce' as const,
            auraOpacity: 0.85,
          };

    poseFighter(rig, pose, null, 0.42);
    rig.overheadSprite.visible = false;
    rig.contactShadow.visible = false;
    rig.auraRing.visible = false;
    if (rig.heroInnerRing) rig.heroInnerRing.visible = false;

    // Keep awakened wings/halo/crown visible, hide mid-torso orbiter rings so bust framing stays clean
    for (const part of rig.awakenedParts) {
      part.visible = false;
    }
    if (rig.crownHalo) rig.crownHalo.visible = true;
    if (rig.wingL && rig.wingR && variant !== 'domain-face') {
      rig.wingL.visible = true;
      rig.wingR.visible = true;
    }

    // Restore base material colors/emissives so skin, hair, and outfits keep full contrast
    for (const entry of rig.standardMaterials) {
      entry.mat.emissive.setHex(entry.baseEmissive);
      entry.mat.emissiveIntensity = Math.min(entry.baseIntensity, 0.28);
    }
    rig.eyeTex.userData.drawState('fierce');
    rig.eyeTex.needsUpdate = true;

    const camera =
      variant === 'domain-face'
        ? new THREE.PerspectiveCamera(28, 1, 0.1, 20)
        : new THREE.PerspectiveCamera(34, 1, 0.1, 20);
    if (variant === 'domain-face') {
      camera.position.set(0.08, 1.68, 1.72);
      camera.lookAt(0, 1.66, 0);
    } else {
      camera.position.set(variant === 'color' ? -0.34 : 0.34, 1.32, 2.52);
      camera.lookAt(0, 1.52, 0);
    }
    camera.updateProjectionMatrix();

    renderer.render(scene, camera);

    const dataUrl = applyPortraitPostProcess(
      renderer.domElement,
      variant,
      kit.auraPrimaryCss
    );
    if (dataUrl) {
      PORTRAIT_CACHE.set(cacheKey, dataUrl);
    }
    return dataUrl;
  } catch {
    return '';
  } finally {
    if (rig) {
      disposeFighterRig(rig, scene);
    }
    if (envTex) {
      envTex.dispose();
    }
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss?.();
    }
  }
}

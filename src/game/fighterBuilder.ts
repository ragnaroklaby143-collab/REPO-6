import * as THREE from 'three';
import {
  ArenaActorState,
  FIGHTER_BY_ID,
  FighterId,
  MapId,
  SkinId,
  getFighterSkinMeta,
  getMapTerrainHeight,
} from '../shared/gameData.ts';
import { AWAKENING_CONFIG } from '../shared/awakeningConfig.ts';
import {
  computeContactShadowTransform,
  dampAngle,
  dampScalar,
} from './combatMath.ts';
import {
  VFXTextureAtlas,
  clampAdditiveOpacity,
  createFacetedRidgeGeometry,
  createSculptedFirearmGeometry,
  createVFXTextureAtlas,
} from './vfxAtlas.ts';

export type EyeState = 'normal' | 'fierce' | 'shock' | 'ko';

export interface FighterPose {
  x: number;
  y: number;
  z: number;
  rotY: number;
  leanX: number;
  leanZ: number;
  hipY: number;
  torsoPitch: number;
  torsoYaw: number;
  torsoRoll: number;
  headPitch: number;
  headYaw: number;
  armLAngle: [number, number, number];
  elbowL: number;
  armRAngle: [number, number, number];
  elbowR: number;
  legLAngle: [number, number, number];
  kneeL: number;
  legRAngle: [number, number, number];
  kneeR: number;
  squash: number;
  eyeState: EyeState;
  auraOpacity: number;
  bodyOpacity: number;
}

export const DEFAULT_POSE: FighterPose = {
  x: 0,
  y: 0,
  z: 0,
  rotY: 0,
  leanX: 0,
  leanZ: 0,
  hipY: 0,
  torsoPitch: 0,
  torsoYaw: 0,
  torsoRoll: 0,
  headPitch: 0,
  headYaw: 0,
  armLAngle: [-0.2, 0, -0.22],
  elbowL: -0.35,
  armRAngle: [-0.2, 0, 0.22],
  elbowR: -0.35,
  legLAngle: [0.04, 0, -0.05],
  kneeL: 0.08,
  legRAngle: [-0.04, 0, 0.05],
  kneeR: 0.08,
  squash: 1.0,
  eyeState: 'fierce',
  auraOpacity: 0.35,
  bodyOpacity: 1.0,
};

export interface FighterRig {
  id: FighterId;
  skinId: SkinId;
  isLocalPlayer: boolean;
  root: THREE.Group;
  leanPivot: THREE.Group;
  squashGroup: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  elbowL: THREE.Group;
  armR: THREE.Group;
  elbowR: THREE.Group;
  legL: THREE.Group;
  kneeL: THREE.Group;
  legR: THREE.Group;
  kneeR: THREE.Group;
  eyeTex: THREE.CanvasTexture & { userData: { drawState: (s: EyeState) => boolean } };
  auraRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  heroInnerRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> | null;
  outlineMaterial: THREE.MeshBasicMaterial | null;
  cowboyHat: THREE.Group | null;
  glassesGlint: THREE.Group | null;
  crownHalo: THREE.Group | null;
  wingL: THREE.Group | null;
  wingR: THREE.Group | null;
  extraArmL: THREE.Group | null;
  extraArmR: THREE.Group | null;
  extraElbowL: THREE.Group | null;
  extraElbowR: THREE.Group | null;
  rainCloud: THREE.Group | null;
  revolverHalo: THREE.Group | null;
  roninWindRing: THREE.Mesh | null;
  companionGroup: THREE.Group | null;
  companionArmL: THREE.Group | null;
  companionArmR: THREE.Group | null;
  companionTail: THREE.Mesh | null;
  teardrops: THREE.Mesh[] | null;
  goldenShield: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshBasicMaterial> | null;
  shieldShards: Array<{ mesh: THREE.Mesh; vx: number; vy: number; vz: number }> | null;
  dissolveCloud: THREE.Points | null;
  bodyMaterials: THREE.Material[];
  standardMaterials: Array<{
    mat: THREE.MeshStandardMaterial;
    baseEmissive: number;
    baseIntensity: number;
  }>;
  hairTufts: THREE.Mesh[] | null;
  hitFlashTimer: number;
  lastBodyOpacity: number;
  lastPoseTime: number;
  staffGroup: THREE.Group | null;
  sashRibbons: THREE.Mesh[] | null;
  coatTail: THREE.Mesh | null;
  idBadge: THREE.Mesh | null;
  tailwindRibbons: THREE.Mesh[] | null;
  tailwindExtraRibbons: THREE.Mesh[] | null;
  magmaVeins: THREE.Mesh[] | null;
  frenzyFlameShell: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshBasicMaterial> | null;
  deadeyeRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> | null;
  voidWisps: THREE.Mesh[] | null;
  jmHandGlows: THREE.Mesh[] | null;
  contactShadow: THREE.Mesh;
  overheadSprite: THREE.Sprite;
  overheadCanvas: HTMLCanvasElement;
  overheadCtx: CanvasRenderingContext2D;
  overheadTex: THREE.CanvasTexture;
  dummyBillboardSprite: THREE.Sprite;
  dummyBillboardCanvas: HTMLCanvasElement;
  dummyBillboardCtx: CanvasRenderingContext2D;
  dummyBillboardTex: THREE.CanvasTexture;
  lastDummyBoardKey: string;
  lastBarKey: string;
  smoothedPose: FighterPose | null;
  walkPhase: number;
  landingSquash: number;
  lastSpeed: number;
  awakenedParts: THREE.Object3D[];
  awakenedOrbiters: THREE.Object3D[];
  silencedRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  snareMarkRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  transformFlashTime: number;
  fxAtlas: VFXTextureAtlas;
}

export function triggerFighterHitFlash(rig: FighterRig, duration = 0.13): void {
  rig.hitFlashTimer = Math.max(rig.hitFlashTimer, duration);
}

function createPlaidTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#d97706';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(124, 45, 18, 0.55)';
  for (let i = 0; i < 128; i += 32) {
    ctx.fillRect(i, 0, 14, 128);
    ctx.fillRect(0, i, 128, 14);
  }
  ctx.fillStyle = 'rgba(254, 243, 199, 0.35)';
  for (let i = 20; i < 128; i += 32) {
    ctx.fillRect(i, 0, 4, 128);
    ctx.fillRect(0, i, 128, 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createBadgeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 96, 128);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(0, 0, 96, 26);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('JM', 48, 19);
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(48, 62, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(18, 92, 60, 8);
  ctx.fillRect(26, 106, 44, 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createAnimeEyeTexture(irisColor: string) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  let currentState: EyeState | '' = '';

  const drawState = (state: EyeState): boolean => {
    if (state === currentState) return false;
    currentState = state;
    ctx.clearRect(0, 0, 128, 128);

    if (state === 'ko') {
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(28, 34);
      ctx.lineTo(100, 94);
      ctx.moveTo(100, 34);
      ctx.lineTo(28, 94);
      ctx.stroke();
      return true;
    }

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(64, 64, 46, state === 'shock' ? 48 : 42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();

    const irisR = state === 'shock' ? 16 : 26;
    ctx.fillStyle = irisColor;
    ctx.beginPath();
    ctx.arc(64, 66, irisR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#090d16';
    ctx.beginPath();
    ctx.arc(64, 68, irisR * 0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(52, 52, state === 'shock' ? 6 : 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(76, 78, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(64, 58, 48, Math.PI * 1.05, Math.PI * 1.95);
    ctx.lineWidth = state === 'fierce' ? 12 : 8;
    ctx.stroke();
    return true;
  };

  drawState('fierce');
  const tex = new THREE.CanvasTexture(c) as THREE.CanvasTexture & {
    userData: { drawState: (s: EyeState) => boolean };
  };
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData = { drawState };
  return tex;
}

function createMiniNameSprite(label: string, bgColor: string, borderColor: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 48;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bgColor;
  ctx.fillRect(10, 6, 140, 34);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 6, 140, 34);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 80, 24);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
  );
  sp.scale.set(0.82, 0.25, 1);
  return sp;
}

export function createArticulatedFighter(
  id: FighterId,
  scene: THREE.Scene,
  skinId: SkinId = 'ascended',
  isLocalPlayer = false
): FighterRig {
  const cfg = FIGHTER_BY_ID[id];
  const skinMeta = getFighterSkinMeta(id, skinId);
  const skinAccentHex = new THREE.Color(skinMeta.accentColor).getHex();
  const fxAtlas = createVFXTextureAtlas();
  const root = new THREE.Group();
  scene.add(root);

  // Soft contact shadow grounded under fighter
  const contactShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.64, 20),
    new THREE.MeshBasicMaterial({
      color: 0x050814,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
    })
  );
  contactShadow.rotation.x = -Math.PI * 0.5;
  contactShadow.position.y = 0.03;
  contactShadow.renderOrder = 4;
  root.add(contactShadow);

  const leanPivot = new THREE.Group();
  root.add(leanPivot);

  const squashGroup = new THREE.Group();
  leanPivot.add(squashGroup);

  const isObsidianDamen = id === 'damen' && skinId === 'special';
  const isSadPrime = id === 'prime' && skinId === 'special';
  const isBeggarMarjohn = id === 'marjohn' && skinId === 'special';
  const isMonarchJm = id === 'jm' && skinId === 'special';
  const isSeraphJm = id === 'jm' && skinId === 'ascended';
  const isClassicJm = id === 'jm' && skinId === 'classic';
  const isClassicMarjohn = id === 'marjohn' && skinId === 'classic';
  const isDuoKhen = id === 'khen' && skinId === 'special';
  const isPhantomKhen = id === 'khen' && skinId === 'ascended';
  const isRoninMarjohn = id === 'marjohn' && skinId === 'ascended';
  const isOutlawDamen = id === 'damen' && skinId === 'ascended';
  const isJuggernautPrime = id === 'prime' && skinId === 'ascended';

  const skinMat = new THREE.MeshStandardMaterial({
    color: isObsidianDamen
      ? 0x0c0c10
      : isJuggernautPrime
      ? 0x271a18
      : isPhantomKhen
      ? 0x1e1b2e
      : isBeggarMarjohn
      ? 0xe2be98
      : 0xfde2c4,
    roughness: isObsidianDamen || isJuggernautPrime ? 0.48 : 0.58,
  });
  const blackRobeMat = new THREE.MeshStandardMaterial({
    color: isSeraphJm
      ? 0xf8fafc
      : isMonarchJm
      ? 0x111827
      : isClassicJm
      ? 0x1d4ed8
      : isSadPrime
      ? 0x181c24
      : isRoninMarjohn
      ? 0x0c2448
      : isBeggarMarjohn
      ? 0x57534e
      : isClassicMarjohn
      ? 0x1e293b
      : isDuoKhen
      ? 0x130d24
      : isPhantomKhen
      ? 0x0e0a1a
      : 0x111827,
    roughness: isSeraphJm ? 0.34 : 0.62,
    metalness: isSeraphJm ? 0.16 : isJuggernautPrime ? 0.38 : 0.08,
  });
  const goldTrimMat = new THREE.MeshStandardMaterial({
    color: isObsidianDamen ? 0xef4444 : isBeggarMarjohn ? 0x78716c : isMonarchJm ? 0xfbbf24 : 0xfacc15,
    emissive: isObsidianDamen ? 0x991b1b : isBeggarMarjohn ? 0x1c1917 : 0xb45309,
    emissiveIntensity: isBeggarMarjohn ? 0.05 : 0.38,
    metalness: isBeggarMarjohn ? 0.25 : 0.85,
    roughness: isBeggarMarjohn ? 0.72 : 0.22,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: skinAccentHex,
    emissive: skinAccentHex,
    emissiveIntensity: isBeggarMarjohn ? 0.08 : skinId === 'ascended' ? 0.55 : 0.4,
    roughness: 0.32,
    metalness: 0.35,
  });
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.85 });

  const hips = new THREE.Group();
  hips.position.y = 0.92;
  squashGroup.add(hips);

  const torso = new THREE.Group();
  hips.add(torso);

  let coatTail: THREE.Mesh | null = null;
  let idBadge: THREE.Mesh | null = null;
  let sashRibbons: THREE.Mesh[] | null = null;
  let wingL: THREE.Group | null = null;
  let wingR: THREE.Group | null = null;
  let extraArmL: THREE.Group | null = null;
  let extraArmR: THREE.Group | null = null;
  let extraElbowL: THREE.Group | null = null;
  let extraElbowR: THREE.Group | null = null;
  let rainCloud: THREE.Group | null = null;
  let revolverHalo: THREE.Group | null = null;
  let roninWindRing: THREE.Mesh | null = null;
  let companionGroup: THREE.Group | null = null;
  let companionArmL: THREE.Group | null = null;
  let companionArmR: THREE.Group | null = null;
  let companionTail: THREE.Mesh | null = null;
  let teardrops: THREE.Mesh[] | null = null;

  if (id === 'damen') {
    const shirtMat = isObsidianDamen
      ? new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.55 })
      : isOutlawDamen
      ? new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.62 })
      : new THREE.MeshStandardMaterial({ map: createPlaidTexture(), roughness: 0.78 });
    const shirt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.235, 0.2, 0.58, 12),
      shirtMat
    );
    shirt.position.y = 0.29;
    shirt.castShadow = false;
    torso.add(shirt);

    const leatherMat = new THREE.MeshStandardMaterial({
      color: isObsidianDamen ? 0x111116 : isOutlawDamen ? 0x78350f : 0x5c3317,
      roughness: isObsidianDamen ? 0.45 : 0.68,
    });
    const coatBack = new THREE.Mesh(
      new THREE.CylinderGeometry(0.268, 0.26, 0.62, 12, 1, false, Math.PI * 0.22, Math.PI * 1.56),
      leatherMat
    );
    coatBack.position.y = 0.3;
    coatBack.castShadow = true;
    torso.add(coatBack);

    if (isOutlawDamen) {
      // High collar duster silhouette
      const highCollar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.25, 0.16, 12, 1, true, Math.PI * 0.4, Math.PI * 1.2),
        goldTrimMat
      );
      highCollar.position.set(0, 0.6, -0.02);
      torso.add(highCollar);
    }

    if (isObsidianDamen) {
      // Streetwear silver chains across chest
      const chainMat = new THREE.MeshStandardMaterial({ color: 0xd4d4d8, metalness: 0.9, roughness: 0.2 });
      const chain1 = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.014, 6, 18, Math.PI), chainMat);
      chain1.position.set(0, 0.44, 0.15);
      chain1.rotation.z = Math.PI;
      torso.add(chain1);
    }

    [-0.12, 0.12].forEach((lx) => {
      const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.36, 0.045), leatherMat);
      lapel.position.set(lx, 0.38, 0.2);
      lapel.rotation.z = lx < 0 ? -0.18 : 0.18;
      torso.add(lapel);
    });
    const gunBelt = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.24, 0.08, 14), leatherMat);
    gunBelt.position.y = 0.03;
    torso.add(gunBelt);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.085, 0.05), goldTrimMat);
    buckle.position.set(0, 0.03, 0.225);
    torso.add(buckle);

    coatTail = new THREE.Mesh(new THREE.BoxGeometry(isOutlawDamen ? 0.54 : 0.46, isOutlawDamen ? 0.62 : 0.5, 0.06), leatherMat);
    coatTail.position.set(0, -0.19, -0.18);
    coatTail.rotation.x = 0.18;
    torso.add(coatTail);
  } else {
    const chestScale = isJuggernautPrime ? 1.24 : id === 'prime' ? 1.14 : isSadPrime ? 1.18 : 1.0;
    const robeChest = new THREE.Mesh(
      new THREE.CylinderGeometry(0.255 * chestScale, 0.21 * chestScale, 0.6, 12),
      blackRobeMat
    );
    robeChest.position.y = 0.3;
    robeChest.castShadow = true;
    torso.add(robeChest);

    if (isSadPrime) {
      // Oversized hoodie front pocket + white drawstrings
      const pocket = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.16, 0.08),
        new THREE.MeshStandardMaterial({ color: 0x262b38, roughness: 0.78 })
      );
      pocket.position.set(0, 0.15, 0.21);
      torso.add(pocket);
      const stringMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.5 });
      [-0.06, 0.06].forEach((dx) => {
        const ds = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.24, 6), stringMat);
        ds.position.set(dx, 0.43, 0.25);
        torso.add(ds);
      });

      // Overhead Dark Raincloud hovering above Sad Boy Prime
      rainCloud = new THREE.Group();
      rainCloud.position.set(0, 1.56, -0.02);
      const cloudMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        emissive: 0x0f172a,
        emissiveIntensity: 0.25,
        roughness: 0.88,
      });
      const cloudSpecs: Array<[number, number, number, number]> = [
        [0, 0.06, 0, 0.24],
        [-0.2, 0.01, 0.03, 0.18],
        [0.2, 0.02, -0.02, 0.19],
        [-0.09, -0.02, 0.14, 0.15],
        [0.11, -0.01, -0.14, 0.15],
      ];
      for (const [cx, cy, cz, cr] of cloudSpecs) {
        const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(cr, 1), cloudMat);
        puff.scale.set(1.18, 0.72, 1.05);
        puff.position.set(cx, cy, cz);
        rainCloud.add(puff);
      }
      torso.add(rainCloud);
    } else if (isBeggarMarjohn) {
      // Stitched patches over tattered shirt + rope sash
      const patchMatA = new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.92 });
      const patchMatB = new THREE.MeshStandardMaterial({ color: 0x4d7c0f, roughness: 0.9 });
      const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.025), patchMatA);
      p1.position.set(-0.1, 0.36, 0.24);
      p1.rotation.z = 0.18;
      const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.11, 0.025), patchMatB);
      p2.position.set(0.11, 0.2, 0.23);
      p2.rotation.z = -0.2;
      torso.add(p1, p2);
    } else if (isDuoKhen) {
      // Sleek Dark Violet-Black Khen Armor (Partner GM appears right beside him as glowing cyan-gold humanoid spirit)
      const armorChestMat = new THREE.MeshStandardMaterial({
        color: 0x2e1065,
        emissive: 0x4c1d95,
        emissiveIntensity: 0.32,
        roughness: 0.38,
        metalness: 0.45,
      });
      const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.32, 0.12), armorChestMat);
      chestPlate.position.set(0, 0.37, 0.16);
      chestPlate.castShadow = true;
      const trimCollar = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.024, 8, 20), accentMat);
      trimCollar.rotation.x = Math.PI * 0.42;
      trimCollar.position.set(0, 0.56, 0.03);
      torso.add(chestPlate, trimCollar);
    } else {
      // Sculpted chest plate / gi armor layer
      const chestPlateMat =
        id === 'prime'
          ? new THREE.MeshStandardMaterial({
              color: isJuggernautPrime ? 0x1c1917 : 0x7f1d1d,
              emissive: isJuggernautPrime ? 0x9a3412 : 0x450a0a,
              emissiveIntensity: isJuggernautPrime ? 0.52 : 0.3,
              roughness: 0.35,
              metalness: 0.55,
            })
          : isSeraphJm
          ? goldTrimMat
          : isClassicJm
          ? new THREE.MeshStandardMaterial({ color: 0x1e40af, roughness: 0.45, metalness: 0.2 })
          : isMonarchJm
          ? new THREE.MeshStandardMaterial({ color: 0x065f46, roughness: 0.38, metalness: 0.48 })
          : isRoninMarjohn
          ? new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.34, metalness: 0.62 })
          : isClassicMarjohn
          ? new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.52, metalness: 0.2 })
          : new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.35 });
      const chestPlate = new THREE.Mesh(
        new THREE.BoxGeometry(0.36 * chestScale, 0.32, 0.12),
        chestPlateMat
      );
      chestPlate.position.set(0, 0.37, 0.16);
      chestPlate.castShadow = true;
      torso.add(chestPlate);

      if (isRoninMarjohn) {
        // Segmented gold-and-storm-blue lamellar armor bands across chest
        for (let b = 0; b < 3; b++) {
          const lam = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.055, 0.28), goldTrimMat);
          lam.position.set(0, 0.21 + b * 0.11, 0.04);
          torso.add(lam);
        }
      }

      if (isJuggernautPrime) {
        // Obsidian Skull Chest Armor + Molten Core + Skull Belt Plates
        const skullBoneMat = new THREE.MeshStandardMaterial({
          color: 0xd6d3d1,
          roughness: 0.46,
          metalness: 0.18,
        });
        const eyeVoidMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });

        const addSkullMedallion = (x: number, y: number, z: number, scale: number) => {
          const skGroup = new THREE.Group();
          skGroup.position.set(x, y, z);
          skGroup.scale.setScalar(scale);
          const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), skullBoneMat);
          const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.075, 0.09), skullBoneMat);
          jaw.position.set(0, -0.075, 0.025);
          const sockL = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.026, 0.03), eyeVoidMat);
          sockL.position.set(-0.038, 0.01, 0.095);
          const sockR = sockL.clone();
          sockR.position.x = 0.038;
          skGroup.add(cranium, jaw, sockL, sockR);
          torso.add(skGroup);
        };
        addSkullMedallion(0, 0.39, 0.26, 1.15);
        addSkullMedallion(0, 0.03, 0.28, 0.88);
      }

      const trimCollar = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.024, 8, 20), goldTrimMat);
      trimCollar.rotation.x = Math.PI * 0.42;
      trimCollar.position.set(0, 0.56, 0.03);
      torso.add(trimCollar);
    }

    // Waist belt
    const belt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.232, 0.236, 0.085, 14),
      isBeggarMarjohn ? barkMat : isJuggernautPrime ? goldTrimMat : accentMat
    );
    belt.position.y = 0.03;
    torso.add(belt);
    if (!isSadPrime && !isBeggarMarjohn && !isJuggernautPrime) {
      const beltCore = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.05), goldTrimMat);
      beltCore.position.set(0, 0.03, 0.225);
      torso.add(beltCore);
    }

    if (!isSadPrime && !isBeggarMarjohn) {
      const skirtMat = isMonarchJm
        ? goldTrimMat
        : isClassicJm
        ? new THREE.MeshStandardMaterial({ color: 0x1e40af, roughness: 0.48 })
        : blackRobeMat;
      const robeSkirt = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.31, 0.44, 14), skirtMat);
      robeSkirt.position.y = -0.16;
      robeSkirt.castShadow = true;
      hips.add(robeSkirt);

      const skirtGoldHem = new THREE.Mesh(new THREE.TorusGeometry(0.305, 0.018, 8, 24), goldTrimMat);
      skirtGoldHem.rotation.x = Math.PI * 0.5;
      skirtGoldHem.position.y = -0.37;
      hips.add(skirtGoldHem);
    }

    if (id === 'jm') {
      if (isSeraphJm) {
        // 6 Large Flapping Solid Celestial Cyan-White Feathered Wings (3 distinct tiers per side!)
        const cyanFeatherMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x0284c7,
          emissiveIntensity: 0.55,
          roughness: 0.22,
          metalness: 0.2,
          side: THREE.DoubleSide,
        });
        const whiteWingMat = new THREE.MeshStandardMaterial({
          color: 0xf8fafc,
          emissive: 0xfef08a,
          emissiveIntensity: 0.38,
          roughness: 0.25,
          side: THREE.DoubleSide,
        });
        wingL = new THREE.Group();
        wingL.position.set(-0.14, 0.48, -0.22);
        wingR = new THREE.Group();
        wingR.position.set(0.14, 0.48, -0.22);

        const tierSpecs = [
          { y: 0.34, len: 1.05, angle: 0.72, zOff: -0.04 },
          { y: 0.08, len: 0.92, angle: 0.18, zOff: -0.09 },
          { y: -0.18, len: 0.78, angle: -0.34, zOff: -0.14 },
        ];
        tierSpecs.forEach((ts) => {
          const wingTierL = new THREE.Group();
          wingTierL.position.set(-0.08, ts.y, ts.zOff);
          wingTierL.rotation.z = ts.angle;
          for (let f = 0; f < 4; f++) {
            const blade = new THREE.Mesh(
              new THREE.BoxGeometry(ts.len - f * 0.14, 0.14 - f * 0.012, 0.038),
              f === 0 || f === 2 ? cyanFeatherMat : whiteWingMat
            );
            blade.position.set(-(ts.len * 0.5) + f * 0.05, -f * 0.085, 0);
            blade.rotation.z = -f * 0.11;
            wingTierL.add(blade);
          }
          wingL!.add(wingTierL);

          const wingTierR = new THREE.Group();
          wingTierR.position.set(0.08, ts.y, ts.zOff);
          wingTierR.rotation.z = -ts.angle;
          for (let f = 0; f < 4; f++) {
            const blade = new THREE.Mesh(
              new THREE.BoxGeometry(ts.len - f * 0.14, 0.14 - f * 0.012, 0.038),
              f === 0 || f === 2 ? cyanFeatherMat : whiteWingMat
            );
            blade.position.set(ts.len * 0.5 - f * 0.05, -f * 0.085, 0);
            blade.rotation.z = f * 0.11;
            wingTierR.add(blade);
          }
          wingR!.add(wingTierR);
        });
        torso.add(wingL, wingR);
      } else if (isMonarchJm) {
        // Golden Monarch Imperial Dragon Robes + Jade sash + high gold collar
        const monarchCollar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.24, 0.23, 0.16, 12, 1, true, Math.PI * 0.35, Math.PI * 1.3),
          goldTrimMat
        );
        monarchCollar.position.set(0, 0.59, -0.02);
        torso.add(monarchCollar);
        coatTail = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.68, 0.055), goldTrimMat);
        coatTail.position.set(0, -0.2, -0.2);
        coatTail.rotation.x = 0.2;
        torso.add(coatTail);
      } else {
        // Classic JM Seraphim Martial Gi Collar & Dragon Sash Emblem
        const innerCollar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.17, 0.12, 12),
          goldTrimMat
        );
        innerCollar.position.set(0, 0.58, 0.02);
        torso.add(innerCollar);
        const lanyardMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, metalness: 0.65, roughness: 0.28 });
        const strapL = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.34, 0.018), lanyardMat);
        strapL.position.set(-0.06, 0.41, 0.225);
        strapL.rotation.z = -0.22;
        const strapR = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.34, 0.018), lanyardMat);
        strapR.position.set(0.06, 0.41, 0.225);
        strapR.rotation.z = 0.22;
        torso.add(strapL, strapR);

        idBadge = new THREE.Mesh(
          new THREE.BoxGeometry(0.11, 0.16, 0.015),
          new THREE.MeshStandardMaterial({ map: createBadgeTexture(), roughness: 0.35 })
        );
        idBadge.position.set(0, 0.21, 0.245);
        torso.add(idBadge);
      }

      const ribbonL = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.66, 0.02), goldTrimMat);
      ribbonL.position.set(-0.14, -0.32, -0.22);
      const ribbonR = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.66, 0.02), goldTrimMat);
      ribbonR.position.set(0.14, -0.32, -0.22);
      torso.add(ribbonL, ribbonR);
      sashRibbons = [ribbonL, ribbonR];
    } else if (id === 'marjohn') {
      if (isRoninMarjohn) {
        const scarfL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.88, 0.024), accentMat);
        scarfL.position.set(-0.14, -0.22, -0.24);
        const scarfR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.88, 0.024), accentMat);
        scarfR.position.set(0.14, -0.22, -0.24);
        torso.add(scarfL, scarfR);
        sashRibbons = [scarfL, scarfR];

        roninWindRing = new THREE.Mesh(
          new THREE.TorusGeometry(0.58, 0.028, 8, 28, Math.PI * 1.55),
          new THREE.MeshBasicMaterial({
            color: 0xfacc15,
          })
        );
        roninWindRing.position.set(0, 0.34, 0);
        roninWindRing.rotation.x = Math.PI * 0.42;
        torso.add(roninWindRing);
      } else if (!isBeggarMarjohn) {
        // Billowing solid mist-white scarf for Calamity Wind Duelist
        const scarfMat = new THREE.MeshStandardMaterial({
          color: 0xf1f5f9,
          emissive: 0x99f6e4,
          emissiveIntensity: 0.16,
          roughness: 0.55,
        });
        const scarfNeck = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.045, 8, 20), scarfMat);
        scarfNeck.rotation.x = Math.PI * 0.48;
        scarfNeck.position.set(0, 0.56, 0.02);
        const scarfL = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.68, 0.022), scarfMat);
        scarfL.position.set(-0.11, -0.22, -0.24);
        const scarfR = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.68, 0.022), scarfMat);
        scarfR.position.set(0.11, -0.22, -0.24);
        torso.add(scarfNeck, scarfL, scarfR);
        sashRibbons = [scarfL, scarfR];
      }
    } else if (id === 'khen') {
      if (isPhantomKhen) {
        // Jagged Abyssal void shoulder mantle + Abyssal cape wings!
        const mantle = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.36, 6, 1, false), blackRobeMat);
        mantle.position.set(0, 0.48, 0);
        torso.add(mantle);

        const abyssWingMat = new THREE.MeshStandardMaterial({
          color: 0x3b0764,
          emissive: 0x7e22ce,
          emissiveIntensity: 0.42,
          roughness: 0.35,
          side: THREE.DoubleSide,
        });
        wingL = new THREE.Group();
        wingL.position.set(-0.16, 0.46, -0.22);
        wingR = new THREE.Group();
        wingR.position.set(0.16, 0.46, -0.22);
        for (let f = 0; f < 3; f++) {
          const bladeL = new THREE.Mesh(new THREE.BoxGeometry(0.68 - f * 0.1, 0.11, 0.03), abyssWingMat);
          bladeL.position.set(-0.34, 0.2 - f * 0.2, 0);
          bladeL.rotation.z = 0.52 - f * 0.32;
          wingL.add(bladeL);
          const bladeR = bladeL.clone();
          bladeR.position.x = -bladeL.position.x;
          bladeR.rotation.z = -bladeL.rotation.z;
          wingR.add(bladeR);
        }
        torso.add(wingL, wingR);
      }
      if (!isDuoKhen) {
        const scarfL = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.62, 0.018), accentMat);
        scarfL.position.set(-0.11, -0.26, -0.22);
        const scarfR = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.62, 0.018), accentMat);
        scarfR.position.set(0.11, -0.26, -0.22);
        torso.add(scarfL, scarfR);
        sashRibbons = [scarfL, scarfR];
      }
    }
  }

  // Head & Multi-Layered Sculpted Anime Hair
  const head = new THREE.Group();
  head.position.y = 0.78;
  torso.add(head);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 14), skinMat);
  skull.castShadow = true;
  head.add(skull);

  if (isSadPrime || isPhantomKhen) {
    // Hood pulled up cleanly framing face
    const hoodMat = isSadPrime
      ? new THREE.MeshStandardMaterial({ color: 0x181c24, roughness: 0.78, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ color: 0x1e1b4b, roughness: 0.48, side: THREE.DoubleSide });
    const hood = new THREE.Mesh(
      new THREE.SphereGeometry(0.285, 14, 12, Math.PI * 0.15, Math.PI * 1.7, 0, Math.PI * 0.72),
      hoodMat
    );
    hood.rotation.x = -0.18;
    hood.position.set(0, 0.02, -0.02);
    head.add(hood);
  }

  // Skin-specific headwear & crowns (Zero ghostly transparency!)
  if (isBeggarMarjohn) {
    // Crooked frayed straw hat
    const strawMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.92, side: THREE.DoubleSide });
    const darkStrawMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.95 });
    const beggarHat = new THREE.Group();
    beggarHat.position.set(0.02, 0.2, 0);
    beggarHat.rotation.z = -0.18;
    beggarHat.rotation.x = 0.08;
    const hatCone = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.22, 10), strawMat);
    const hatBand = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.024, 6, 14), darkStrawMat);
    hatBand.rotation.x = Math.PI * 0.5;
    hatBand.position.y = -0.05;
    beggarHat.add(hatCone, hatBand);
    for (let fr = 0; fr < 7; fr++) {
      const a = (fr / 7) * Math.PI * 2;
      const fray = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.14), fr % 2 === 0 ? strawMat : darkStrawMat);
      fray.position.set(Math.cos(a) * 0.44, -0.1, Math.sin(a) * 0.44);
      fray.rotation.y = -a;
      fray.rotation.z = 0.22 * (fr % 2 === 0 ? 1 : -1);
      beggarHat.add(fray);
    }
    head.add(beggarHat);
  } else if (isRoninMarjohn) {
    // Wide electrified storm-blue & gold bamboo/iron kasa hat
    const kasaMat = new THREE.MeshStandardMaterial({
      color: 0x0c4a6e,
      roughness: 0.42,
      metalness: 0.48,
      side: THREE.DoubleSide,
    });
    const kasaHat = new THREE.Group();
    kasaHat.position.set(0, 0.21, 0);
    const kasaCone = new THREE.Mesh(new THREE.ConeGeometry(0.56, 0.23, 18), kasaMat);
    const kasaRim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.026, 8, 28), goldTrimMat);
    kasaRim.rotation.x = Math.PI * 0.5;
    kasaRim.position.y = -0.11;
    const kasaFin = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), goldTrimMat);
    kasaFin.position.y = 0.13;
    kasaHat.add(kasaCone, kasaRim, kasaFin);
    head.add(kasaHat);
  } else if (isClassicMarjohn) {
    // Solid flowing ponytail mounted cleanly at back of head
    const ponyMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.48 });
    const ponyTie = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.018, 6, 12), accentMat);
    ponyTie.position.set(0, 0.1, -0.25);
    const ponyTail = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.46, 8), ponyMat);
    ponyTail.position.set(0, 0.04, -0.4);
    ponyTail.rotation.x = -2.05;
    head.add(ponyTie, ponyTail);
  } else if (isJuggernautPrime) {
    // Demon Horns + Glowing Asura Forehead Crest
    const hornMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.35,
      metalness: 0.45,
    });
    [-1, 1].forEach((side) => {
      const hornBase = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.36, 8), hornMat);
      hornBase.position.set(side * 0.17, 0.25, 0.05);
      hornBase.rotation.z = side * -0.48;
      hornBase.rotation.x = 0.24;
      const hornTip = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.22, 6), goldTrimMat);
      hornTip.position.set(side * 0.26, 0.42, 0.09);
      hornTip.rotation.z = side * -0.18;
      head.add(hornBase, hornTip);
    });
    const browGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), new THREE.MeshBasicMaterial({ color: 0xf97316 }));
    browGem.position.set(0, 0.13, 0.245);
    head.add(browGem);
  } else if (isPhantomKhen) {
    // Abyssal Monarch Tall Horned Void Crown
    const crownBase = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 6, 18), accentMat);
    crownBase.rotation.x = Math.PI * 0.5;
    crownBase.position.y = 0.17;
    head.add(crownBase);
    [-1, 1].forEach((side) => {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.36, 6), accentMat);
      horn.position.set(side * 0.16, 0.3, 0.04);
      horn.rotation.z = side * -0.3;
      head.add(horn);
    });
  } else if (isMonarchJm) {
    // Imperial Gold Dragon Crown Circlet
    const circlet = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.026, 8, 22), goldTrimMat);
    circlet.rotation.x = Math.PI * 0.5;
    circlet.position.y = 0.16;
    const jadeGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 0), accentMat);
    jadeGem.position.set(0, 0.2, 0.24);
    const spireL = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.2, 5), goldTrimMat);
    spireL.position.set(-0.14, 0.24, 0.16);
    const spireR = spireL.clone();
    spireR.position.x = 0.14;
    head.add(circlet, jadeGem, spireL, spireR);
  }

  const hairColor =
    isSeraphJm
      ? 0xfef08a
      : isMonarchJm
      ? 0x090d16
      : isSadPrime
      ? 0x090d16
      : isObsidianDamen
      ? 0x050507
      : isBeggarMarjohn
      ? 0x44403c
      : id === 'prime'
      ? 0x1f1218
      : id === 'khen'
      ? 0x1e1b4b
      : id === 'damen'
      ? 0x291d12
      : 0x0f172a;
  const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.5 });
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.256, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.64),
    hairMat
  );
  hairCap.rotation.x = -0.24;
  head.add(hairCap);

  const hairTufts: THREE.Mesh[] = [];
  for (let h = 0; h < 11; h++) {
    const isOuter = h >= 7;
    const spike = new THREE.Mesh(
      new THREE.ConeGeometry(isOuter ? 0.058 : 0.076, isOuter ? 0.29 : 0.25, 6),
      h % 3 === 1 && !isSadPrime && !isBeggarMarjohn ? accentMat : hairMat
    );
    const ang = (h / 11) * Math.PI * 2;
    const r = isOuter ? 0.19 : 0.16;
    spike.position.set(Math.cos(ang) * r, isOuter ? 0.14 : 0.18, Math.sin(ang) * r);
    spike.rotation.z = -Math.cos(ang) * (isOuter ? 0.85 : 0.62);
    spike.rotation.x = Math.sin(ang) * (isOuter ? 0.85 : 0.62);
    spike.userData = { baseRx: spike.rotation.x, baseRz: spike.rotation.z, idx: h };
    head.add(spike);
    hairTufts.push(spike);
  }
  [-0.08, 0, 0.08].forEach((bx, bi) => {
    const isEmoSweep = (isSadPrime || isObsidianDamen) && bi === 0;
    const bang = new THREE.Mesh(
      new THREE.ConeGeometry(isEmoSweep ? 0.095 : 0.052, isEmoSweep ? 0.3 : 0.18, 5),
      bi === 1 && !isSadPrime && !isObsidianDamen && !isBeggarMarjohn ? accentMat : hairMat
    );
    bang.position.set(isEmoSweep ? -0.078 : bx, isEmoSweep ? 0.1 : 0.14, 0.225);
    bang.rotation.x = isEmoSweep ? 2.68 : 2.45;
    bang.rotation.z = isEmoSweep ? -0.34 : bx * 1.4;
    bang.userData = { baseRx: bang.rotation.x, baseRz: bang.rotation.z, idx: bi + 12 };
    head.add(bang);
    hairTufts.push(bang);
  });

  const eyeIrisHex = isObsidianDamen
    ? '#ef4444'
    : isSadPrime
    ? '#60a5fa'
    : isRoninMarjohn
    ? '#38bdf8'
    : isMonarchJm
    ? '#fde047'
    : skinMeta.accentColor;
  const eyeTex = createAnimeEyeTexture(eyeIrisHex);
  const eyeMat = new THREE.MeshBasicMaterial({ map: eyeTex, alphaTest: 0.45, transparent: false });
  const eyeL = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.085), eyeMat);
  eyeL.position.set(-0.082, 0.01, 0.232);
  eyeL.rotation.y = -0.22;
  const eyeR = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.085), eyeMat);
  eyeR.position.set(0.082, 0.01, 0.232);
  eyeR.rotation.y = 0.22;
  head.add(eyeL, eyeR);

  if (isObsidianDamen || isMonarchJm || isRoninMarjohn) {
    // Bright solid glowing eye irises
    const glowMat = new THREE.MeshBasicMaterial({
      color: isObsidianDamen ? 0xef4444 : isRoninMarjohn ? 0x38bdf8 : 0xfef08a,
    });
    const egL = new THREE.Mesh(new THREE.CircleGeometry(0.032, 12), glowMat);
    egL.position.set(-0.082, 0.01, 0.242);
    const egR = new THREE.Mesh(new THREE.CircleGeometry(0.032, 12), glowMat);
    egR.position.set(0.082, 0.01, 0.242);
    head.add(egL, egR);
  }

  if (isSadPrime) {
    // Solid cyan-blue raindrops falling cleanly from his overhead cloud + cheek tear studs
    teardrops = [];
    const tearMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
    });
    for (let td = 0; td < 8; td++) {
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), tearMat);
      drop.scale.set(0.7, 1.85, 0.7);
      const col = -0.24 + (td / 7) * 0.48;
      const zOff = (td % 3 - 1) * 0.14;
      drop.position.set(col, 1.48, zOff);
      drop.userData = { x: col, z: zOff, phase: td * 0.22 };
      torso.add(drop);
      teardrops.push(drop);
    }
  }

  let cowboyHat: THREE.Group | null = null;
  if (id === 'damen') {
    cowboyHat = new THREE.Group();
    cowboyHat.position.set(0, 0.22, 0);
    const hatColor = isObsidianDamen ? 0x050507 : isOutlawDamen ? 0x92400e : 0x111827;
    const hatBlack = new THREE.MeshStandardMaterial({ color: hatColor, roughness: 0.65 });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(isOutlawDamen ? 0.5 : 0.46, isOutlawDamen ? 0.52 : 0.48, 0.025, 22), hatBlack);
    brim.scale.set(1.0, 1.0, 1.15);
    brim.castShadow = true;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.22, 0.2, 16), hatBlack);
    crown.position.y = 0.1;
    crown.castShadow = true;
    const hatBand = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.032, 16), goldTrimMat);
    hatBand.position.y = 0.025;
    cowboyHat.add(brim, crown, hatBand);
    head.add(cowboyHat);
  }

  let glassesGlint: THREE.Group | null = null;
  if (id === 'khen') {
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.3 });
    const lensMat = new THREE.MeshStandardMaterial({
      color: isPhantomKhen ? 0xe879f9 : isDuoKhen ? 0xa855f7 : 0xc084fc,
      emissive: isPhantomKhen ? 0xc026d3 : 0x9333ea,
      emissiveIntensity: isPhantomKhen ? 0.95 : 0.55,
      roughness: 0.2,
      metalness: 0.5,
    });
    if (isPhantomKhen || isDuoKhen) {
      // Sleek solid glowing Abyssal / Shadow visor across eyes
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.075, 0.06), lensMat);
      visor.position.set(0, 0.015, 0.24);
      head.add(visor);
    } else {
      [-0.084, 0.084].forEach((gx) => {
        const rim = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.065, 0.015), frameMat);
        rim.position.set(gx, 0.015, 0.246);
        const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.092, 0.048), lensMat);
        lens.position.set(gx, 0.015, 0.255);
        head.add(rim, lens);
      });
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.014, 0.015), frameMat);
      bridge.position.set(0, 0.022, 0.248);
      head.add(bridge);
    }

    glassesGlint = new THREE.Group();
    glassesGlint.position.set(0.085, 0.02, 0.265);
    glassesGlint.visible = false;
    const glintMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
    });
    glassesGlint.add(
      new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.035), glintMat),
      new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.5), glintMat)
    );
    head.add(glassesGlint);
  }

  function createLimb(isArm: boolean, side: number) {
    const rootPivot = new THREE.Group();
    const upperLen = isArm ? 0.27 : 0.4;
    const lowerLen = isArm ? 0.26 : 0.39;
    const limbBulk = isJuggernautPrime ? 1.16 : 1.0;
    const radTop = (isArm ? 0.074 : 0.105) * limbBulk;
    const radMid = (isArm ? 0.065 : 0.088) * limbBulk;
    const radBot = (isArm ? 0.056 : 0.076) * limbBulk;

    let limbMat = blackRobeMat;
    if (isBeggarMarjohn || (isRoninMarjohn && isArm)) {
      limbMat = skinMat;
    } else if (!isArm && id === 'damen') {
      limbMat = new THREE.MeshStandardMaterial({
        color: isObsidianDamen ? 0x09090b : isOutlawDamen ? 0x291508 : 0x1d4ed8,
        roughness: 0.75,
      });
    } else if (isArm && id === 'damen') {
      limbMat = new THREE.MeshStandardMaterial({
        color: isObsidianDamen ? 0x111116 : isOutlawDamen ? 0xb45309 : 0x5c3317,
        roughness: 0.62,
      });
    }

    const upperMesh = new THREE.Mesh(new THREE.CylinderGeometry(radTop, radMid, upperLen, 10), limbMat);
    upperMesh.position.y = -upperLen * 0.5;
    upperMesh.castShadow = true;
    rootPivot.add(upperMesh);

    if (isArm && !isSadPrime && !isBeggarMarjohn) {
      const pauldron = new THREE.Mesh(
        new THREE.BoxGeometry(id === 'prime' ? 0.22 : 0.16, 0.11, id === 'prime' ? 0.24 : 0.17),
        id === 'damen'
          ? new THREE.MeshStandardMaterial({ color: isObsidianDamen ? 0x18181b : isOutlawDamen ? 0xd97706 : 0x78350f, roughness: 0.5 })
          : accentMat
      );
      pauldron.position.set(side * 0.03, -0.02, 0);
      pauldron.rotation.z = side * -0.22;
      pauldron.castShadow = true;
      rootPivot.add(pauldron);
      if (isJuggernautPrime) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.18, 6), goldTrimMat);
        spike.position.set(side * 0.08, 0.07, 0);
        spike.rotation.z = side * -0.45;
        rootPivot.add(spike);
      }
    }

    if (!isBeggarMarjohn) {
      const jointGuard = new THREE.Mesh(
        new THREE.BoxGeometry(radMid * 2.15, radMid * 1.45, radMid * 2.2),
        id === 'damen' ? goldTrimMat : accentMat
      );
      jointGuard.position.set(0, -upperLen, isArm ? -0.02 : 0.03);
      rootPivot.add(jointGuard);
    }

    const midPivot = new THREE.Group();
    midPivot.position.y = -upperLen;
    rootPivot.add(midPivot);

    const lowerMesh = new THREE.Mesh(new THREE.CylinderGeometry(radMid, radBot, lowerLen, 10), limbMat);
    lowerMesh.position.y = -lowerLen * 0.5;
    lowerMesh.castShadow = true;
    midPivot.add(lowerMesh);

    if (!isArm && id === 'damen') {
      const chapMat = new THREE.MeshStandardMaterial({
        color: isObsidianDamen ? 0x18181b : isOutlawDamen ? 0x92400e : 0x78350f,
        roughness: 0.72,
      });
      const chapUpper = new THREE.Mesh(new THREE.BoxGeometry(0.045, upperLen * 0.9, 0.11), chapMat);
      chapUpper.position.set(side * 0.088, -upperLen * 0.5, 0);
      rootPivot.add(chapUpper);
      const chapLower = new THREE.Mesh(new THREE.BoxGeometry(0.045, lowerLen * 0.9, 0.1), chapMat);
      chapLower.position.set(side * 0.082, -lowerLen * 0.5, 0);
      midPivot.add(chapLower);
    }

    const endMount = new THREE.Group();
    endMount.position.y = -lowerLen;
    midPivot.add(endMount);

    if (isArm) {
      if (isSadPrime) {
        // Metallic forearm & fist chains for Sad Boy Emo Prime!
        const chainMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.88, roughness: 0.25 });
        for (let cl = 0; cl < 4; cl++) {
          const link = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.014, 6, 12), chainMat);
          link.position.y = 0.02 + cl * 0.055;
          link.rotation.x = Math.PI * 0.42 + (cl % 2 === 0 ? 0.35 : -0.35);
          endMount.add(link);
        }
        const hangingLink = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 10), chainMat);
        hangingLink.position.set(side * 0.03, -0.04, 0.04);
        hangingLink.rotation.y = Math.PI * 0.5;
        endMount.add(hangingLink);
        endMount.add(new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 10), skinMat));
      } else if (id === 'prime') {
        const gauntletSize = isJuggernautPrime ? 0.21 : 0.17;
        const gauntlet = new THREE.Mesh(
          new THREE.BoxGeometry(gauntletSize, gauntletSize * 1.25, gauntletSize * 1.05),
          accentMat
        );
        gauntlet.position.y = 0.02;
        gauntlet.castShadow = true;
        endMount.add(gauntlet);
      } else {
        if (!isBeggarMarjohn) {
          const bracer = new THREE.Mesh(new THREE.CylinderGeometry(radBot * 1.28, radBot * 1.18, 0.12, 8), accentMat);
          bracer.position.y = 0.07;
          endMount.add(bracer);
        }
        endMount.add(new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 10), skinMat));
      }
    } else if (id === 'jm') {
      const sneaker = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.11, 0.28),
        new THREE.MeshStandardMaterial({ color: isMonarchJm ? 0x090d16 : 0xffffff, roughness: 0.35 })
      );
      sneaker.position.set(0, -0.04, 0.05);
      sneaker.castShadow = true;
      const soleTrim = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.03, 0.29), goldTrimMat);
      soleTrim.position.set(0, -0.09, 0.05);
      endMount.add(sneaker, soleTrim);
    } else if (id === 'prime' && !isSadPrime) {
      const greave = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.26), accentMat);
      greave.position.set(0, 0.04, 0.03);
      greave.castShadow = true;
      endMount.add(greave);
    } else if (isBeggarMarjohn) {
      // Simple sandals
      const sandal = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.24), barkMat);
      sandal.position.set(0, -0.06, 0.04);
      endMount.add(sandal);
    } else {
      const boot = new THREE.Mesh(
        new THREE.BoxGeometry(0.155, 0.16, 0.27),
        new THREE.MeshStandardMaterial({ color: id === 'damen' && !isObsidianDamen ? 0x451a03 : 0x090d16, roughness: 0.55 })
      );
      boot.position.set(0, -0.03, 0.04);
      boot.castShadow = true;
      const bootTrim = new THREE.Mesh(new THREE.BoxGeometry(0.165, 0.035, 0.16), accentMat);
      bootTrim.position.set(0, 0.04, 0);
      endMount.add(boot, bootTrim);
    }

    return { rootPivot, midPivot, endMount };
  }

  const armLObj = createLimb(true, -1);
  armLObj.rootPivot.position.set(-0.31, 0.52, 0);
  torso.add(armLObj.rootPivot);

  const armRObj = createLimb(true, 1);
  armRObj.rootPivot.position.set(0.31, 0.52, 0);
  torso.add(armRObj.rootPivot);

  if (isJuggernautPrime) {
    // Two Extra Animated Magma Arms below main shoulders for Asura God Prime!
    const extraL = createLimb(true, -1);
    extraL.rootPivot.position.set(-0.35, 0.24, -0.08);
    extraL.rootPivot.scale.setScalar(0.92);
    torso.add(extraL.rootPivot);
    extraArmL = extraL.rootPivot;
    extraElbowL = extraL.midPivot;

    const extraR = createLimb(true, 1);
    extraR.rootPivot.position.set(0.35, 0.24, -0.08);
    extraR.rootPivot.scale.setScalar(0.92);
    torso.add(extraR.rootPivot);
    extraArmR = extraR.rootPivot;
    extraElbowR = extraR.midPivot;
  }

  const legLObj = createLimb(false, -1);
  legLObj.rootPivot.position.set(-0.13, -0.04, 0);
  hips.add(legLObj.rootPivot);

  const legRObj = createLimb(false, 1);
  legRObj.rootPivot.position.set(0.13, -0.04, 0);
  hips.add(legRObj.rootPivot);

  let staffGroup: THREE.Group | null = null;
  if (id === 'marjohn') {
    if (isBeggarMarjohn) {
      // Tin begging cup in left hand + makeshift scrap-metal & broomstick polearm in right!
      const tinMat = new THREE.MeshStandardMaterial({ color: 0xa3a3a3, metalness: 0.78, roughness: 0.35 });
      const tinCup = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.068, 0.14, 12, 1, false), tinMat);
      tinCup.position.set(0, -0.02, 0.1);
      armLObj.endMount.add(tinCup);
    }
    staffGroup = new THREE.Group();
    armRObj.endMount.add(staffGroup);
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.028, isBeggarMarjohn ? 1.85 : 2.25, 10),
      new THREE.MeshStandardMaterial({
        color: isBeggarMarjohn ? 0x78350f : 0x0f172a,
        metalness: isBeggarMarjohn ? 0.1 : 0.72,
        roughness: isBeggarMarjohn ? 0.85 : 0.3,
      })
    );
    shaft.rotation.x = Math.PI * 0.5;
    staffGroup.add(shaft);

    if (isBeggarMarjohn) {
      // Bound scrap-metal cleaver + broom bristle head on broomstick polearm
      const scrapMat = new THREE.MeshStandardMaterial({ color: 0x737373, metalness: 0.82, roughness: 0.45 });
      const bristleMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.95 });
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.015, 6, 12), scrapMat);
      collar.position.z = 0.88;
      const scrapBlade = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.28, 0.34), scrapMat);
      scrapBlade.position.set(0, 0.08, 1.02);
      const bristles = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.28, 8), bristleMat);
      bristles.rotation.x = -Math.PI * 0.5;
      bristles.position.set(0, -0.02, -0.96);
      staffGroup.add(collar, scrapBlade, bristles);
    } else if (isRoninMarjohn) {
      // Lightning-cracked Naginata glaive with gold collar & curved cyan/gold blade!
      const glaiveCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.04, 0.16, 10), goldTrimMat);
      glaiveCollar.rotation.x = Math.PI * 0.5;
      glaiveCollar.position.z = 1.05;
      const bladeMat = new THREE.MeshStandardMaterial({
        color: 0xe0f2fe,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.78,
        metalness: 0.75,
        roughness: 0.18,
      });
      const curvedBlade = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.16, 0.62), bladeMat);
      curvedBlade.position.set(0, 0.04, 1.38);
      curvedBlade.rotation.x = -0.14;
      const arcEdge = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.045, 0.56), goldTrimMat);
      arcEdge.position.set(0, 0.11, 1.38);
      arcEdge.rotation.x = -0.14;
      const endSpike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.22, 6), goldTrimMat);
      endSpike.rotation.x = -Math.PI * 0.5;
      endSpike.position.z = -1.16;
      staffGroup.add(glaiveCollar, curvedBlade, arcEdge, endSpike);
    } else {
      // Calamity Wind Duelist Storm Halberd (crescent halberd blade + spear tip + solid wind pennant)
      const bladeMat = new THREE.MeshStandardMaterial({
        color: 0x99f6e4,
        emissive: 0x0d9488,
        emissiveIntensity: 0.55,
        metalness: 0.72,
        roughness: 0.22,
      });
      const halberdHead = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.36, 6), bladeMat);
      halberdHead.rotation.x = Math.PI * 0.5;
      halberdHead.position.z = 1.24;
      const crescentAxe = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.032, 6, 16, Math.PI * 0.9), bladeMat);
      crescentAxe.rotation.y = Math.PI * 0.5;
      crescentAxe.position.set(0, 0.1, 1.02);
      const windRibbonMat = new THREE.MeshBasicMaterial({
        color: 0xf1f5f9,
        side: THREE.DoubleSide,
      });
      const ribbon1 = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.78), windRibbonMat);
      ribbon1.position.set(0, -0.38, 0.96);
      const ribbon2 = ribbon1.clone();
      ribbon2.position.set(0, -0.38, -1.04);
      staffGroup.add(halberdHead, crescentAxe, ribbon1, ribbon2);
    }
  } else if (id === 'damen') {
    [armLObj.endMount, armRObj.endMount].forEach((mount) => {
      const rev = new THREE.Group();
      const barrelMat = isObsidianDamen
        ? new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.85, roughness: 0.25 })
        : goldTrimMat;
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.065, 0.3), barrelMat);
      barrel.position.set(0, -0.02, 0.15);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.13, 0.06), barkMat);
      grip.position.set(0, -0.07, 0.02);
      grip.rotation.x = 0.25;
      rev.add(barrel, grip);
      if (isObsidianDamen) {
        const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.04), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
        sight.position.set(0, 0.02, 0.27);
        rev.add(sight);
      }
      mount.add(rev);
    });
  } else if (id === 'khen') {
    [armLObj.endMount, armRObj.endMount].forEach((mount) => {
      const dag = new THREE.Group();
      const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 8), goldTrimMat);
      hilt.rotation.x = Math.PI * 0.5;
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 0.025), goldTrimMat);
      guard.position.z = 0.08;
      const blade = new THREE.Mesh(
        new THREE.ConeGeometry(isPhantomKhen ? 0.048 : 0.038, isPhantomKhen ? 0.56 : 0.44, 4),
        accentMat
      );
      blade.rotation.x = Math.PI * 0.5;
      blade.position.z = isPhantomKhen ? 0.36 : 0.3;
      dag.add(hilt, guard, blade);
      mount.add(dag);
    });
  }

  // Khen "GM & Khen Duo" Special Skin: Armored dark violet Khen + Solid glowing cyan-gold GM humanoid spirit partner!
  if (isDuoKhen) {
    const khenTag = createMiniNameSprite('KHEN', 'rgba(88, 28, 135, 0.96)', '#e879f9');
    khenTag.position.set(0, 1.98, 0);
    squashGroup.add(khenTag);

    companionGroup = new THREE.Group();
    companionGroup.position.set(0.95, 0.12, -0.22);
    squashGroup.add(companionGroup);

    const spiritCyanMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.72,
      roughness: 0.26,
      metalness: 0.3,
    });
    const spiritGoldMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.65,
      roughness: 0.25,
      metalness: 0.55,
    });

    const gmTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.52, 10), spiritCyanMat);
    gmTorso.position.y = 0.88;
    const gmSash = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.19, 0.09, 10), spiritGoldMat);
    gmSash.position.y = 0.65;
    const gmHead = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), spiritCyanMat);
    gmHead.position.y = 1.3;
    for (let sp = 0; sp < 5; sp++) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.18, 5), sp % 2 === 0 ? spiritCyanMat : spiritGoldMat);
      const a = -0.8 + (sp / 4) * 1.6;
      tuft.position.set(Math.sin(a) * 0.11, 1.46, -Math.cos(a) * 0.06);
      tuft.rotation.z = -Math.sin(a) * 0.45;
      companionGroup.add(tuft);
    }

    const gmEyeL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.025, 0.02), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    gmEyeL.position.set(-0.06, 1.32, 0.17);
    const gmEyeR = gmEyeL.clone();
    gmEyeR.position.x = 0.06;

    companionArmL = new THREE.Group();
    companionArmL.position.set(-0.24, 1.06, 0);
    const cArmLM = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.048, 0.42, 8), spiritCyanMat);
    cArmLM.position.y = -0.18;
    const cFistL = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), spiritGoldMat);
    cFistL.position.y = -0.4;
    companionArmL.add(cArmLM, cFistL);

    companionArmR = new THREE.Group();
    companionArmR.position.set(0.24, 1.06, 0);
    const cArmRM = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.048, 0.42, 8), spiritCyanMat);
    cArmRM.position.y = -0.18;
    const cFistR = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), spiritGoldMat);
    cFistR.position.y = -0.4;
    companionArmR.add(cArmRM, cFistR);

    [-0.09, 0.09].forEach((lx) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.052, 0.44, 8), spiritCyanMat);
      leg.position.set(lx, 0.36, 0);
      companionGroup!.add(leg);
    });

    const gmTag = createMiniNameSprite('GM SPIRIT', 'rgba(8, 51, 68, 0.96)', '#22d3ee');
    gmTag.position.set(0, 1.72, 0);

    companionGroup.add(
      gmTorso,
      gmSash,
      gmHead,
      gmEyeL,
      gmEyeR,
      companionArmL,
      companionArmR,
      gmTag
    );
  }

  // Ground Hero / Aura Ring (Pinned flat to ground floor so leaning/walking never clips!)
  const auraRing = new THREE.Mesh(
    new THREE.RingGeometry(isLocalPlayer ? 0.64 : 0.45, isLocalPlayer ? 1.06 : 0.88, 36),
    new THREE.MeshBasicMaterial({
      color: skinAccentHex,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    })
  );
  auraRing.rotation.x = -Math.PI * 0.5;
  auraRing.position.y = 0.09;
  auraRing.renderOrder = 8;
  root.add(auraRing);

  let heroInnerRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> | null = null;
  if (isLocalPlayer) {
    heroInnerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.54, 36),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -5,
        polygonOffsetUnits: -5,
      })
    );
    heroInnerRing.rotation.x = -Math.PI * 0.5;
    heroInnerRing.position.y = 0.102;
    heroInnerRing.renderOrder = 9;
    root.add(heroInnerRing);
  }

  let crownHalo: THREE.Group | null = null;
  if (id === 'jm') {
    crownHalo = new THREE.Group();
    crownHalo.position.set(0, 1.98, -0.18);
    crownHalo.visible = isSeraphJm;
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      side: THREE.DoubleSide,
    });
    crownHalo.add(
      new THREE.Mesh(new THREE.RingGeometry(0.65, 0.76, 36), haloMat),
      new THREE.Mesh(new THREE.RingGeometry(0.42, 0.47, 28), haloMat)
    );
    for (let sp = 0; sp < 8; sp++) {
      const ray = new THREE.Mesh(new THREE.PlaneGeometry(0.055, 0.44), haloMat);
      const a = (sp / 8) * Math.PI * 2;
      ray.position.set(Math.cos(a) * 0.92, Math.sin(a) * 0.92, 0);
      ray.rotation.z = a - Math.PI * 0.5;
      crownHalo.add(ray);
    }
    leanPivot.add(crownHalo);
  }

  // Inverted-hull colored silhouette outline for local player (must happen BEFORE collecting bodyMaterials)
  let outlineMaterial: THREE.MeshBasicMaterial | null = null;
  if (isLocalPlayer) {
    outlineMaterial = new THREE.MeshBasicMaterial({
      color: skinAccentHex,
      side: THREE.BackSide,
    });
    const sourceMeshes: THREE.Mesh[] = [];
    squashGroup.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (
        m.isMesh &&
        m.geometry &&
        !(m.material instanceof THREE.MeshBasicMaterial) &&
        !(m instanceof THREE.Sprite)
      ) {
        sourceMeshes.push(m);
      }
    });
    for (const src of sourceMeshes) {
      const outlineMesh = new THREE.Mesh(src.geometry, outlineMaterial);
      outlineMesh.scale.setScalar(1.075);
      outlineMesh.castShadow = false;
      outlineMesh.receiveShadow = false;
      src.add(outlineMesh);
    }
  }

  const bodyMaterials: THREE.Material[] = [];
  const standardMaterials: Array<{
    mat: THREE.MeshStandardMaterial;
    baseEmissive: number;
    baseIntensity: number;
  }> = [];
  const seenStd = new Set<THREE.MeshStandardMaterial>();
  root.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (
      m.isMesh &&
      m.material &&
      m !== auraRing &&
      m !== heroInnerRing &&
      m !== contactShadow &&
      m.material !== outlineMaterial
    ) {
      const mat = m.material as THREE.Material;
      if (!bodyMaterials.includes(mat)) {
        // Keep all 3D character skins, weapons & accessories solid and opaque!
        mat.transparent = false;
        mat.opacity = 1.0;
        mat.depthWrite = true;
        bodyMaterials.push(mat);
      }
      if (mat instanceof THREE.MeshStandardMaterial && !seenStd.has(mat)) {
        seenStd.add(mat);
        standardMaterials.push({
          mat,
          baseEmissive: mat.emissive.getHex(),
          baseIntensity: mat.emissiveIntensity,
        });
      }
    }
  });
      if (mat instanceof THREE.MeshStandardMaterial && !seenStd.has(mat)) {
        seenStd.add(mat);
        standardMaterials.push({
          mat,
          baseEmissive: mat.emissive.getHex(),
          baseIntensity: mat.emissiveIntensity,
        });
      }
    }
  });

  // Crisp Solid Wireframe Shield / Parry cage + Solid Ground Counter Rings
  const goldenShield = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.16, 1),
    new THREE.MeshBasicMaterial({
      color: cfg.hex,
      wireframe: true,
    })
  );
  goldenShield.position.y = 1.05;
  goldenShield.visible = false;
  if (id === 'jm') {
    const outerCounterRing = new THREE.Mesh(
      new THREE.RingGeometry(1.12, 1.34, 36),
      new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        side: THREE.DoubleSide,
      })
    );
    outerCounterRing.rotation.x = -Math.PI * 0.5;
    outerCounterRing.position.y = -0.76;
    const innerCounterRing = new THREE.Mesh(
      new THREE.RingGeometry(0.74, 0.92, 32),
      new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        side: THREE.DoubleSide,
      })
    );
    innerCounterRing.rotation.x = -Math.PI * 0.5;
    innerCounterRing.position.y = -0.72;
    goldenShield.add(outerCounterRing, innerCounterRing);
  }
  leanPivot.add(goldenShield);

  let shieldShards: Array<{ mesh: THREE.Mesh; vx: number; vy: number; vz: number }> | null = null;
  if (id === 'damen') {
    shieldShards = [];
    for (let sh = 0; sh < 18; sh++) {
      const frag = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.15 + (sh % 3) * 0.05, 0),
        new THREE.MeshBasicMaterial({
          color: sh % 2 === 0 ? 0xf59e0b : 0xfef08a,
          transparent: true,
          opacity: 0.46,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      frag.visible = false;
      scene.add(frag);
      const phi = Math.acos(1 - 2 * ((sh + 0.5) / 18));
      const theta = Math.PI * (1 + Math.sqrt(5)) * sh;
      shieldShards.push({
        mesh: frag,
        vx: Math.sin(phi) * Math.cos(theta) * (4.0 + (sh % 3) * 1.4),
        vy: Math.abs(Math.cos(phi)) * 4.5 + 1.8,
        vz: Math.sin(phi) * Math.sin(theta) * (4.0 + (sh % 3) * 1.4),
      });
    }
  }

  let dissolveCloud: THREE.Points | null = null;
  if (id === 'khen') {
    const dGeo = new THREE.BufferGeometry();
    const dCount = 72;
    const dPos = new Float32Array(dCount * 3);
    const dSeeds = [];
    for (let i = 0; i < dCount; i++) {
      const ang = (i / dCount) * Math.PI * 6;
      const r = 0.15 + (i % 7) * 0.06;
      const sy = (i / dCount) * 1.85;
      dSeeds.push({
        x: Math.cos(ang) * r,
        y: sy,
        z: Math.sin(ang) * r,
        speed: 1.4 + (i % 5) * 0.45,
        drift: Math.cos(ang) * 0.65,
      });
    }
    dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    dissolveCloud = new THREE.Points(
      dGeo,
      new THREE.PointsMaterial({
        color: 0x1e1b4b,
        map: fxAtlas.smokePuffTex,
        size: 0.42,
        transparent: true,
        opacity: 0,
        blending: THREE.NormalBlending,
        depthWrite: false,
      })
    );
    dissolveCloud.userData = { seeds: dSeeds };
    dissolveCloud.visible = false;
    scene.add(dissolveCloud);
  }

  // Character-Specific Passive Rig Visuals
  let tailwindRibbons: THREE.Mesh[] | null = null;
  let tailwindExtraRibbons: THREE.Mesh[] | null = null;
  if (id === 'marjohn') {
    tailwindRibbons = [];
    tailwindExtraRibbons = [];
    const mounts: Array<{ parent: THREE.Object3D; y: number; r: number }> = [
      { parent: armLObj.midPivot, y: -0.14, r: 0.11 },
      { parent: armRObj.midPivot, y: -0.14, r: 0.11 },
      { parent: legLObj.midPivot, y: -0.18, r: 0.13 },
      { parent: legRObj.midPivot, y: -0.18, r: 0.13 },
      { parent: torso, y: 0.28, r: 0.34 },
    ];
    mounts.forEach((m) => {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(m.r, 0.018, 6, 32, Math.PI * 1.45),
        new THREE.MeshBasicMaterial({
          color: 0x0d9488,
          side: THREE.DoubleSide,
        })
      );
      band.position.y = m.y;
      band.rotation.x = Math.PI * 0.42;
      band.visible = false;
      m.parent.add(band);
      tailwindRibbons!.push(band);

      const extraBand = new THREE.Mesh(
        new THREE.TorusGeometry(m.r * 1.32, 0.016, 6, 32, Math.PI * 1.6),
        new THREE.MeshBasicMaterial({
          color: 0x99f6e4,
          side: THREE.DoubleSide,
        })
      );
      extraBand.position.y = m.y + 0.04;
      extraBand.rotation.x = -Math.PI * 0.38;
      extraBand.visible = false;
      m.parent.add(extraBand);
      tailwindExtraRibbons!.push(extraBand);
    });
  }

  let magmaVeins: THREE.Mesh[] | null = null;
  let frenzyFlameShell: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshBasicMaterial> | null = null;
  if (id === 'prime') {
    magmaVeins = [];
    const veinSpecs: Array<{ parent: THREE.Object3D; w: number; h: number; l: number; pos: [number, number, number]; rz: number; rx: number }> = [
      { parent: torso, w: 0.04, h: 0.035, l: 0.42, pos: [-0.1, 0.3, 0.22], rz: 0.28, rx: Math.PI * 0.5 },
      { parent: torso, w: 0.04, h: 0.035, l: 0.42, pos: [0.1, 0.3, 0.22], rz: -0.28, rx: Math.PI * 0.5 },
      { parent: torso, w: 0.04, h: 0.035, l: 0.36, pos: [0, 0.36, -0.22], rz: 1.42, rx: Math.PI * 0.5 },
      { parent: armLObj.endMount, w: 0.14, h: 0.04, l: 0.19, pos: [0, 0.04, 0], rz: 0, rx: 0 },
      { parent: armRObj.endMount, w: 0.14, h: 0.04, l: 0.19, pos: [0, 0.04, 0], rz: 0, rx: 0 },
    ];
    veinSpecs.forEach((vs) => {
      const vein = new THREE.Mesh(
        createFacetedRidgeGeometry(vs.w, vs.h, vs.l, 4),
        new THREE.MeshBasicMaterial({
          color: 0xea580c,
        })
      );
      vein.position.set(vs.pos[0], vs.pos[1], vs.pos[2]);
      vein.rotation.set(vs.rx, 0, vs.rz);
      vs.parent.add(vein);
      magmaVeins!.push(vein);
    });

    frenzyFlameShell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.95, 1),
      new THREE.MeshBasicMaterial({
        color: 0xdc2626,
        wireframe: true,
      })
    );
    frenzyFlameShell.position.y = 1.05;
    frenzyFlameShell.visible = false;
    leanPivot.add(frenzyFlameShell);
  }

  let deadeyeRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> | null = null;
  if (id === 'damen') {
    deadeyeRing = new THREE.Mesh(
      new THREE.RingGeometry(4.88, 5.02, 48),
      new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
    );
    deadeyeRing.rotation.x = -Math.PI * 0.5;
    deadeyeRing.position.y = 0.056;
    deadeyeRing.renderOrder = 5;
    root.add(deadeyeRing);
  }

  let voidWisps: THREE.Mesh[] | null = null;
  if (id === 'khen') {
    voidWisps = [];
    for (let w = 0; w < 4; w++) {
      const wisp = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.14, 0),
        new THREE.MeshBasicMaterial({
          color: w % 2 === 0 ? 0x1e1b4b : 0x9333ea,
        })
      );
      const a = (w / 4) * Math.PI * 2;
      wisp.position.set(Math.cos(a) * 0.42, 0.9, Math.sin(a) * 0.42);
      wisp.scale.set(0.8, 1.5, 0.8);
      root.add(wisp);
      voidWisps.push(wisp);
    }
  }

  let jmHandGlows: THREE.Mesh[] | null = null;
  if (id === 'jm') {
    jmHandGlows = [armLObj.endMount, armRObj.endMount].map((mount) => {
      const g = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.14, 0),
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
        })
      );
      g.visible = false;
      mount.add(g);
      return g;
    });
  }

  // Awakening Signature 3D Silhouettes & Orbiters (Solid Opaque!)
  const awakenedParts: THREE.Object3D[] = [];
  const awakenedOrbiters: THREE.Object3D[] = [];
  const awkHex =
    id === 'marjohn'
      ? 0x0d9488
      : id === 'prime'
      ? 0xdc2626
      : id === 'damen'
      ? 0xf59e0b
      : id === 'khen'
      ? 0x7c3aed
      : 0xfef08a;
  const awkSecHex =
    id === 'marjohn'
      ? 0x2dd4bf
      : id === 'prime'
      ? 0xfbbf24
      : id === 'damen'
      ? 0xeab308
      : id === 'khen'
      ? 0xddd6fe
      : 0x06b6d4;

  const awakenedHalo = new THREE.Mesh(
    new THREE.RingGeometry(0.95, 1.16, 48),
    new THREE.MeshBasicMaterial({
      color: awkHex,
      side: THREE.DoubleSide,
    })
  );
  awakenedHalo.rotation.x = -Math.PI * 0.5;
  awakenedHalo.position.y = 0.14;
  awakenedHalo.visible = false;
  root.add(awakenedHalo);
  awakenedParts.push(awakenedHalo);

  if (id === 'marjohn') {
    const orbRing = new THREE.Group();
    orbRing.position.y = 1.05;
    orbRing.visible = false;
    const cycloneHalo = new THREE.Mesh(
      new THREE.TorusGeometry(0.92, 0.036, 8, 36),
      new THREE.MeshBasicMaterial({ color: awkHex })
    );
    cycloneHalo.rotation.x = Math.PI * 0.44;
    orbRing.add(cycloneHalo);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const miniFunnel = new THREE.Mesh(
        new THREE.ConeGeometry(0.18, 0.56, 12, 1, false),
        new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? awkHex : awkSecHex,
          side: THREE.DoubleSide,
        })
      );
      miniFunnel.rotation.x = Math.PI;
      miniFunnel.position.set(Math.cos(a) * 0.92, (i - 1) * 0.16, Math.sin(a) * 0.92);
      orbRing.add(miniFunnel);
    }
    leanPivot.add(orbRing);
    awakenedParts.push(orbRing);
    awakenedOrbiters.push(orbRing);

    if (staffGroup) {
      const halberdTip = new THREE.Mesh(
        new THREE.ConeGeometry(0.1, 0.5, 8),
        new THREE.MeshBasicMaterial({ color: 0x2dd4bf })
      );
      halberdTip.position.set(0, 1.15, 0);
      halberdTip.visible = false;
      staffGroup.add(halberdTip);
      awakenedParts.push(halberdTip);
    }
  } else if (id === 'prime') {
    const spikeGroup = new THREE.Group();
    spikeGroup.position.set(0, 0.36, -0.22);
    spikeGroup.visible = false;
    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? -1 : 1;
      const idx = i % 3;
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.085, 0.48 + idx * 0.12, 8),
        new THREE.MeshBasicMaterial({
          color: idx === 1 ? awkSecHex : awkHex,
        })
      );
      spike.position.set(side * (0.2 + idx * 0.08), 0.14 + idx * 0.12, -0.05);
      spike.rotation.z = -side * (0.35 + idx * 0.22);
      spike.rotation.x = -0.35;
      spikeGroup.add(spike);
    }
    torso.add(spikeGroup);
    awakenedParts.push(spikeGroup);
    awakenedOrbiters.push(spikeGroup);
  } else if (id === 'damen') {
    // Solar Outlaw Ascended Skin: Always-visible orbiting halo of 8 solid golden firearms (or 6 on Awakened other skins)
    const halo = new THREE.Group();
    halo.position.set(0, 0.54, -0.36);
    halo.visible = isOutlawDamen;
    const gunGeo = createSculptedFirearmGeometry();
    const gunMat = new THREE.MeshStandardMaterial({
      color: isOutlawDamen ? 0xfacc15 : 0xeab308,
      emissive: isOutlawDamen ? 0xf59e0b : 0xb45309,
      emissiveIntensity: isOutlawDamen ? 0.65 : 0.42,
      metalness: 0.88,
      roughness: 0.2,
    });
    const gunCount = isOutlawDamen ? 8 : 6;
    for (let i = 0; i < gunCount; i++) {
      const a = isOutlawDamen
        ? (i / gunCount) * Math.PI * 2
        : -Math.PI * 0.42 + (i / 5) * Math.PI * 0.84;
      const gunMesh = new THREE.Mesh(gunGeo, gunMat);
      gunMesh.scale.setScalar(isOutlawDamen ? 0.4 : 0.36);
      gunMesh.position.set(Math.sin(a) * (isOutlawDamen ? 0.82 : 0.72), Math.cos(a) * (isOutlawDamen ? 0.68 : 0.56), 0);
      gunMesh.rotation.z = -a;
      halo.add(gunMesh);
    }
    torso.add(halo);
    revolverHalo = halo;
    if (!isOutlawDamen) {
      awakenedParts.push(halo);
      awakenedOrbiters.push(halo);
    }
  }
  } else if (id === 'khen') {
    const shadowSpikes = new THREE.Group();
    shadowSpikes.position.set(0, 1.0, 0);
    shadowSpikes.visible = false;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const blade = new THREE.Mesh(
        new THREE.ConeGeometry(0.07, 0.52, 6),
        new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? awkHex : awkSecHex,
        })
      );
      blade.position.set(Math.cos(a) * 0.84, (i % 2 === 0 ? 0.18 : -0.12), Math.sin(a) * 0.84);
      blade.rotation.z = Math.PI * 0.5;
      blade.rotation.y = -a;
      shadowSpikes.add(blade);
    }
    leanPivot.add(shadowSpikes);
    awakenedParts.push(shadowSpikes);
    awakenedOrbiters.push(shadowSpikes);
  } else if (id === 'jm') {
    const dragonCore = new THREE.Group();
    dragonCore.position.set(0, 0.34, 0.24);
    dragonCore.visible = false;
    const coreGem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.11, 0),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    const coreRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.024, 6, 32),
      new THREE.MeshBasicMaterial({ color: awkSecHex })
    );
    dragonCore.add(coreGem, coreRing);
    torso.add(dragonCore);
    awakenedParts.push(dragonCore);
    awakenedOrbiters.push(dragonCore);

    // Celestial Dragon double-helix orbiting ki-ribbon rings
    const dragonKiOrbit = new THREE.Group();
    dragonKiOrbit.position.set(0, 1.0, 0);
    dragonKiOrbit.visible = false;
    const kiRibbonA = new THREE.Mesh(
      new THREE.TorusGeometry(0.86, 0.028, 6, 36),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    kiRibbonA.rotation.x = Math.PI * 0.38;
    const kiRibbonB = new THREE.Mesh(
      new THREE.TorusGeometry(0.96, 0.028, 6, 36),
      new THREE.MeshBasicMaterial({ color: 0x06b6d4 })
    );
    kiRibbonB.rotation.x = -Math.PI * 0.38;
    kiRibbonB.rotation.y = Math.PI * 0.25;
    dragonKiOrbit.add(kiRibbonA, kiRibbonB);
    leanPivot.add(dragonKiOrbit);
    awakenedParts.push(dragonKiOrbit);
    awakenedOrbiters.push(dragonKiOrbit);
  }

  const silencedRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.68, 0.038, 6, 24),
    new THREE.MeshBasicMaterial({ color: 0xc084fc })
  );
  silencedRing.rotation.x = Math.PI * 0.5;
  silencedRing.position.y = 1.68;
  silencedRing.visible = false;
  root.add(silencedRing);

  const snareMarkRing = new THREE.Mesh(
    new THREE.RingGeometry(0.75, 0.92, 6),
    new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      side: THREE.DoubleSide,
    })
  );
  snareMarkRing.rotation.x = -Math.PI * 0.5;
  snareMarkRing.position.y = 0.13;
  snareMarkRing.visible = false;
  root.add(snareMarkRing);

  // Crisp 2x High-DPI 3D Overhead Health & Nameplate Sprite
  const barCanvas = document.createElement('canvas');
  barCanvas.width = 360;
  barCanvas.height = 96;
  const barCtx = barCanvas.getContext('2d')!;
  const barTex = new THREE.CanvasTexture(barCanvas);
  barTex.colorSpace = THREE.SRGBColorSpace;
  const barSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: barTex,
      transparent: true,
      depthTest: false,
    })
  );
  barSprite.position.set(0, 2.38, 0);
  barSprite.scale.set(1.92, 0.52, 1);
  root.add(barSprite);

  // Oversized high-contrast Training Dummy DPS & Total Damage Billboard
  const dummyCanvas = document.createElement('canvas');
  dummyCanvas.width = 512;
  dummyCanvas.height = 176;
  const dummyCtx = dummyCanvas.getContext('2d')!;
  const dummyTex = new THREE.CanvasTexture(dummyCanvas);
  dummyTex.colorSpace = THREE.SRGBColorSpace;
  const dummySprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: dummyTex,
      transparent: true,
      depthTest: false,
    })
  );
  dummySprite.position.set(0, 3.22, 0);
  dummySprite.scale.set(3.65, 1.26, 1);
  dummySprite.visible = false;
  dummySprite.renderOrder = 26;
  root.add(dummySprite);

  return {
    id,
    skinId,
    isLocalPlayer,
    root,
    leanPivot,
    squashGroup,
    hips,
    torso,
    head,
    armL: armLObj.rootPivot,
    elbowL: armLObj.midPivot,
    armR: armRObj.rootPivot,
    elbowR: armRObj.midPivot,
    legL: legLObj.rootPivot,
    kneeL: legLObj.midPivot,
    legR: legRObj.rootPivot,
    kneeR: legRObj.midPivot,
    eyeTex,
    auraRing,
    heroInnerRing,
    outlineMaterial,
    cowboyHat,
    glassesGlint,
    crownHalo,
    wingL,
    wingR,
    extraArmL,
    extraArmR,
    extraElbowL,
    extraElbowR,
    rainCloud,
    revolverHalo,
    roninWindRing,
    companionGroup,
    companionArmL,
    companionArmR,
    companionTail,
    teardrops,
    goldenShield,
    shieldShards,
    dissolveCloud,
    bodyMaterials,
    standardMaterials,
    hairTufts,
    hitFlashTimer: 0,
    lastBodyOpacity: 1,
    lastPoseTime: 0,
    staffGroup,
    sashRibbons,
    coatTail,
    idBadge,
    tailwindRibbons,
    tailwindExtraRibbons,
    magmaVeins,
    frenzyFlameShell,
    deadeyeRing,
    voidWisps,
    jmHandGlows,
    contactShadow,
    overheadSprite: barSprite,
    overheadCanvas: barCanvas,
    overheadCtx: barCtx,
    overheadTex: barTex,
    dummyBillboardSprite: dummySprite,
    dummyBillboardCanvas: dummyCanvas,
    dummyBillboardCtx: dummyCtx,
    dummyBillboardTex: dummyTex,
    lastDummyBoardKey: '',
    lastBarKey: '',
    smoothedPose: null,
    walkPhase: 0,
    landingSquash: 1.0,
    lastSpeed: 0,
    awakenedParts,
    awakenedOrbiters,
    silencedRing,
    snareMarkRing,
    transformFlashTime: 0,
    fxAtlas,
  };
}

export function disposeFighterRig(rig: FighterRig, scene: THREE.Scene): void {
  scene.remove(rig.root);
  if (rig.dissolveCloud) {
    scene.remove(rig.dissolveCloud);
    rig.dissolveCloud.geometry.dispose();
    (rig.dissolveCloud.material as THREE.Material).dispose();
  }
  if (rig.shieldShards) {
    for (const sh of rig.shieldShards) {
      scene.remove(sh.mesh);
      sh.mesh.geometry.dispose();
      (sh.mesh.material as THREE.Material).dispose();
    }
  }
  const seenMats = new Set<THREE.Material>();
  rig.root.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        if (!seenMats.has(mat)) {
          seenMats.add(mat);
          mat.dispose();
        }
      }
    }
  });
  rig.eyeTex.dispose();
  rig.overheadTex.dispose();
  rig.dummyBillboardTex.dispose();
  rig.fxAtlas.dispose();
}

export function poseFighter(
  rig: FighterRig,
  pose: FighterPose,
  mapId: MapId | null,
  time: number,
  poseLambda = 24
): void {
  const dt = rig.lastPoseTime > 0 ? Math.min(0.05, Math.max(0.001, time - rig.lastPoseTime)) : 0.016;
  rig.lastPoseTime = time;
  rig.fxAtlas.updateScrolling(dt);

  if (!rig.smoothedPose) {
    rig.smoothedPose = {
      ...pose,
      armLAngle: [...pose.armLAngle],
      armRAngle: [...pose.armRAngle],
      legLAngle: [...pose.legLAngle],
      legRAngle: [...pose.legRAngle],
    };
  } else {
    const sp = rig.smoothedPose;
    sp.x = pose.x;
    sp.y = pose.y;
    sp.z = pose.z;
    sp.rotY = dampAngle(sp.rotY, pose.rotY, poseLambda + 6, dt);
    sp.leanX = dampScalar(sp.leanX, pose.leanX, poseLambda, dt);
    sp.leanZ = dampScalar(sp.leanZ, pose.leanZ, poseLambda, dt);
    sp.hipY = dampScalar(sp.hipY, pose.hipY, poseLambda, dt);
    sp.torsoPitch = dampScalar(sp.torsoPitch, pose.torsoPitch, poseLambda, dt);
    sp.torsoYaw = dampScalar(sp.torsoYaw, pose.torsoYaw, poseLambda, dt);
    sp.torsoRoll = dampScalar(sp.torsoRoll, pose.torsoRoll, poseLambda, dt);
    sp.headPitch = dampScalar(sp.headPitch, pose.headPitch, poseLambda, dt);
    sp.headYaw = dampScalar(sp.headYaw, pose.headYaw, poseLambda, dt);
    for (let i = 0; i < 3; i++) {
      sp.armLAngle[i] = dampScalar(sp.armLAngle[i], pose.armLAngle[i], poseLambda + 4, dt);
      sp.armRAngle[i] = dampScalar(sp.armRAngle[i], pose.armRAngle[i], poseLambda + 4, dt);
      sp.legLAngle[i] = dampScalar(sp.legLAngle[i], pose.legLAngle[i], poseLambda, dt);
      sp.legRAngle[i] = dampScalar(sp.legRAngle[i], pose.legRAngle[i], poseLambda, dt);
    }
    sp.elbowL = dampScalar(sp.elbowL, pose.elbowL, poseLambda + 4, dt);
    sp.elbowR = dampScalar(sp.elbowR, pose.elbowR, poseLambda + 4, dt);
    sp.kneeL = dampScalar(sp.kneeL, pose.kneeL, poseLambda, dt);
    sp.kneeR = dampScalar(sp.kneeR, pose.kneeR, poseLambda, dt);
    sp.squash = dampScalar(sp.squash, pose.squash, 22, dt);
    sp.auraOpacity = dampScalar(sp.auraOpacity, pose.auraOpacity, 14, dt);
    sp.bodyOpacity = pose.bodyOpacity;
    sp.eyeState = pose.eyeState;
  }

  rig.landingSquash = dampScalar(rig.landingSquash, 1.0, 14, dt);
  const sp = rig.smoothedPose;

  const groundY = mapId ? getMapTerrainHeight(mapId, sp.x, sp.z) : 0;
  rig.root.position.set(sp.x, groundY + sp.y, sp.z);
  rig.root.rotation.set(0, sp.rotY, 0);
  rig.leanPivot.rotation.set(sp.leanX, 0, sp.leanZ);

  const sy = Math.max(0.55, Math.min(1.4, sp.squash * rig.landingSquash));
  const sxz = 1 / Math.sqrt(Math.max(0.45, sy));
  rig.squashGroup.scale.set(sxz, sy, sxz);

  rig.hips.position.y = 0.92 + sp.hipY;
  rig.torso.rotation.set(sp.torsoPitch, sp.torsoYaw, sp.torsoRoll);
  rig.head.rotation.set(
    sp.headPitch - sp.torsoPitch * 0.65,
    sp.headYaw - sp.torsoYaw * 0.75,
    -sp.torsoRoll * 0.5
  );

  rig.armL.rotation.set(sp.armLAngle[0], sp.armLAngle[1], sp.armLAngle[2]);
  rig.elbowL.rotation.x = sp.elbowL;
  rig.armR.rotation.set(sp.armRAngle[0], sp.armRAngle[1], sp.armRAngle[2]);
  rig.elbowR.rotation.x = sp.elbowR;

  rig.legL.rotation.set(sp.legLAngle[0], sp.legLAngle[1], sp.legLAngle[2]);
  rig.kneeL.rotation.x = sp.kneeL;
  rig.legR.rotation.set(sp.legRAngle[0], sp.legRAngle[1], sp.legRAngle[2]);
  rig.kneeR.rotation.x = sp.kneeR;

  if (rig.eyeTex.userData.drawState(sp.eyeState)) {
    rig.eyeTex.needsUpdate = true;
  }

  const vis = sp.bodyOpacity > 0.02;
  rig.auraRing.visible = vis;
  rig.auraRing.position.y = -sp.y + 0.09;
  rig.auraRing.material.opacity = rig.isLocalPlayer
    ? Math.max(0.84, sp.auraOpacity)
    : Math.max(0.32, sp.auraOpacity);
  rig.auraRing.scale.setScalar(1.0 + Math.sin(time * 9.0) * 0.06);
  if (rig.heroInnerRing) {
    rig.heroInnerRing.visible = vis;
    rig.heroInnerRing.position.y = -sp.y + 0.102;
    rig.heroInnerRing.material.opacity = vis ? 0.8 + Math.sin(time * 7.5) * 0.16 : 0;
    rig.heroInnerRing.scale.setScalar(1.0 + Math.cos(time * 9.0) * 0.04);
  }
  if (rig.deadeyeRing) {
    rig.deadeyeRing.position.y = -sp.y + 0.082;
  }
  if (rig.outlineMaterial) {
    rig.outlineMaterial.opacity = 1.0;
  }

  rig.squashGroup.visible = vis;
  rig.contactShadow.visible = vis;
  const shadowMeta = computeContactShadowTransform(sp.y);
  rig.contactShadow.position.y = -sp.y + 0.025;
  rig.contactShadow.scale.setScalar(shadowMeta.scale);
  (rig.contactShadow.material as THREE.MeshBasicMaterial).opacity = shadowMeta.opacity * sp.bodyOpacity;

  if (Math.abs(sp.bodyOpacity - rig.lastBodyOpacity) > 0.004) {
    rig.lastBodyOpacity = sp.bodyOpacity;
    const needFade = sp.bodyOpacity < 0.99;
    const mats = rig.bodyMaterials;
    for (let i = 0; i < mats.length; i++) {
      if (mats[i].transparent !== needFade) {
        mats[i].transparent = needFade;
        mats[i].depthWrite = !needFade;
        mats[i].needsUpdate = true;
      }
      mats[i].opacity = needFade ? sp.bodyOpacity : 1.0;
    }
  }

  if (rig.hitFlashTimer > 0) {
    rig.hitFlashTimer = Math.max(0, rig.hitFlashTimer - dt);
    const flash = Math.min(1, rig.hitFlashTimer / 0.11);
    for (const entry of rig.standardMaterials) {
      entry.mat.emissive.setHex(0xfef08a);
      entry.mat.emissiveIntensity = 0.34 * flash + entry.baseIntensity * (1 - flash);
    }
  } else if (rig.transformFlashTime > 0) {
    const tf = Math.min(1, rig.transformFlashTime / 0.8);
    const tfHex =
      rig.id === 'marjohn'
        ? 0x22d3ee
        : rig.id === 'prime'
        ? 0xdc2626
        : rig.id === 'damen'
        ? 0xf59e0b
        : rig.id === 'khen'
        ? 0xa855f7
        : 0xf59e0b;
    for (const entry of rig.standardMaterials) {
      entry.mat.emissive.setHex(tfHex);
      entry.mat.emissiveIntensity = entry.baseIntensity + 0.62 * tf;
    }
    const pulseScale = 1.0 + Math.sin(time * 32) * 0.12 * tf;
    rig.squashGroup.scale.multiplyScalar(pulseScale);
  } else if (rig.awakenedParts.length > 0 && rig.awakenedParts[0].visible) {
    const awHex =
      rig.id === 'marjohn'
        ? 0x22d3ee
        : rig.id === 'prime'
        ? 0xf43f5e
        : rig.id === 'damen'
        ? 0xfacc15
        : rig.id === 'khen'
        ? 0xa855f7
        : 0xfef08a;
    for (const entry of rig.standardMaterials) {
      entry.mat.emissive.setHex(awHex);
      entry.mat.emissiveIntensity = entry.baseIntensity + 0.16 + Math.sin(time * 6.5) * 0.05;
    }
  } else {
    for (const entry of rig.standardMaterials) {
      if (entry.mat.emissive.getHex() !== entry.baseEmissive) {
        entry.mat.emissive.setHex(entry.baseEmissive);
      }
      entry.mat.emissiveIntensity = entry.baseIntensity;
    }
  }

  for (const orb of rig.awakenedOrbiters) {
    if (!orb.visible) continue;
    if (rig.id === 'marjohn' || rig.id === 'khen') {
      orb.rotation.y = time * (rig.id === 'khen' ? 4.8 : 3.4);
    } else if (rig.id === 'damen') {
      orb.rotation.z = Math.sin(time * 2.2) * 0.12;
    } else if (rig.id === 'jm') {
      orb.rotation.z = time * 3.8;
      orb.rotation.y = time * 4.6;
    } else if (rig.id === 'prime') {
      const s = 1.0 + Math.sin(time * 14) * 0.08;
      orb.scale.set(s, s, s);
    }
  }

  if (rig.silencedRing.visible) {
    rig.silencedRing.rotation.z = time * 4.5;
  }
  if (rig.snareMarkRing.visible) {
    rig.snareMarkRing.rotation.z = -time * 3.6;
  }

  if (rig.hairTufts) {
    const sway = Math.sin(time * 9.5 + sp.x) * 0.08 + Math.min(0.22, Math.abs(sp.leanX) * 0.45);
    for (const tuft of rig.hairTufts) {
      const { baseRx, baseRz, idx } = tuft.userData as { baseRx: number; baseRz: number; idx: number };
      tuft.rotation.x = baseRx + sway * Math.cos(idx * 0.7);
      tuft.rotation.z = baseRz + Math.sin(time * 8 + idx) * 0.05;
    }
  }

  if (rig.wingL && rig.wingR) {
    const flapSpeed = rig.skinId === 'ascended' && rig.id === 'jm' ? 5.6 : 4.5;
    const flapAmp = rig.skinId === 'ascended' && rig.id === 'jm' ? 0.26 : 0.12;
    const flare = (sp.y > 0.3 ? 0.36 : 0.08) + Math.sin(time * flapSpeed) * flapAmp;
    rig.wingL.rotation.y = -0.22 - flare;
    rig.wingR.rotation.y = 0.22 + flare;
    rig.wingL.rotation.z = Math.sin(time * flapSpeed) * 0.14;
    rig.wingR.rotation.z = -Math.sin(time * flapSpeed) * 0.14;
  }

  if (rig.extraArmL && rig.extraArmR && rig.extraElbowL && rig.extraElbowR) {
    rig.extraArmL.rotation.set(
      sp.armLAngle[0] * 0.72 - 0.35 + Math.sin(time * 5.2) * 0.18,
      0.38,
      -0.62
    );
    rig.extraArmR.rotation.set(
      sp.armRAngle[0] * 0.72 - 0.35 + Math.cos(time * 5.2) * 0.18,
      -0.38,
      0.62
    );
    rig.extraElbowL.rotation.x = sp.elbowL - 0.25;
    rig.extraElbowR.rotation.x = sp.elbowR - 0.25;
  }

  if (rig.rainCloud) {
    rig.rainCloud.position.y = 1.56 + Math.sin(time * 2.8) * 0.04;
    rig.rainCloud.rotation.y = time * 0.35;
  }

  if (rig.revolverHalo && rig.skinId === 'ascended' && rig.id === 'damen') {
    rig.revolverHalo.visible = vis && sp.bodyOpacity > 0.5;
    rig.revolverHalo.rotation.z = time * 1.4;
  }

  if (rig.roninWindRing) {
    rig.roninWindRing.rotation.z = time * 4.2;
  }

  if (rig.teardrops) {
    for (const drop of rig.teardrops) {
      const { x, z, phase } = drop.userData as { x?: number; z?: number; side?: number; phase: number };
      const cycle = (time * 1.85 + phase) % 1.0;
      drop.position.set(x ?? 0, 1.48 - cycle * 1.05, z ?? 0);
      drop.visible = vis && sp.bodyOpacity > 0.4;
    }
  }

  if (rig.companionGroup) {
    rig.companionGroup.position.set(
      0.95 + Math.sin(time * 2.2) * 0.08,
      0.16 + Math.abs(Math.sin(time * 5.5)) * 0.09,
      -0.2 + Math.cos(time * 2.0) * 0.06
    );
    rig.companionGroup.rotation.x = sp.leanX * 0.55;
    if (rig.companionArmL && rig.companionArmR) {
      rig.companionArmL.rotation.x = sp.armLAngle[0] * 0.92;
      rig.companionArmR.rotation.x = sp.armRAngle[0] * 0.92;
    }
    if (rig.companionTail) {
      rig.companionTail.rotation.z = Math.sin(time * 16) * 0.45;
    }
  }

  if (rig.sashRibbons) {
    const flutter = Math.sin(time * 10 + sp.x) * 0.24;
    rig.sashRibbons[0].rotation.x = 0.28 + flutter + Math.max(0, sp.y * 0.12);
    rig.sashRibbons[1].rotation.x = 0.28 - flutter + Math.max(0, sp.y * 0.12);
  }
  if (rig.coatTail) {
    rig.coatTail.rotation.x = 0.24 + Math.sin(time * 9 + sp.z) * 0.18;
  }
  if (rig.idBadge) {
    rig.idBadge.rotation.x = -sp.leanX * 0.8 + Math.sin(time * 7) * 0.08;
  }
}

export function getStancePose(id: FighterId, time: number): FighterPose {
  const breathe = Math.sin(time * 3.4) * 0.025;
  if (id === 'marjohn') {
    return {
      ...DEFAULT_POSE,
      hipY: -0.1 + breathe,
      torsoPitch: 0.14,
      armLAngle: [-0.88, 0.48, -0.18],
      elbowL: -1.05,
      armRAngle: [-0.42, -0.35, 0.32],
      elbowR: -0.92,
      legLAngle: [-0.28, 0, -0.09],
      kneeL: 0.52,
      legRAngle: [0.32, 0, 0.09],
      kneeR: 0.42,
      auraOpacity: 0.42,
    };
  }
  if (id === 'prime') {
    return {
      ...DEFAULT_POSE,
      hipY: -0.18 + breathe,
      torsoPitch: 0.24,
      armLAngle: [-0.95, 0.35, -0.35],
      elbowL: -1.45,
      armRAngle: [-0.85, -0.35, 0.35],
      elbowR: -1.35,
      legLAngle: [-0.36, 0, -0.14],
      kneeL: 0.65,
      legRAngle: [0.4, 0, 0.14],
      kneeR: 0.52,
      auraOpacity: 0.48,
    };
  }
  if (id === 'damen') {
    return {
      ...DEFAULT_POSE,
      hipY: -0.08 + breathe,
      torsoPitch: 0.06,
      armLAngle: [-0.95, 0.15, -0.32],
      elbowL: -1.15,
      armRAngle: [-0.95, -0.15, 0.32],
      elbowR: -1.15,
      legLAngle: [-0.22, 0, -0.1],
      kneeL: 0.36,
      legRAngle: [0.24, 0, 0.1],
      kneeR: 0.32,
      auraOpacity: 0.38,
    };
  }
  if (id === 'khen') {
    return {
      ...DEFAULT_POSE,
      hipY: -0.12 + breathe,
      torsoPitch: 0.16,
      armLAngle: [-0.65, 0.32, -0.35],
      elbowL: -1.42,
      armRAngle: [-0.65, -0.32, 0.35],
      elbowR: -1.42,
      legLAngle: [-0.3, 0, -0.1],
      kneeL: 0.48,
      legRAngle: [0.34, 0, 0.1],
      kneeR: 0.44,
      auraOpacity: 0.45,
    };
  }
  return {
    ...DEFAULT_POSE,
    hipY: -0.11 + breathe,
    torsoPitch: 0.15,
    armLAngle: [-0.75, 0.25, -0.28],
    elbowL: -1.35,
    armRAngle: [-0.55, -0.25, 0.28],
    elbowR: -1.25,
    legLAngle: [-0.28, 0, -0.09],
    kneeL: 0.48,
    legRAngle: [0.32, 0, 0.09],
    kneeR: 0.38,
    auraOpacity: 0.48,
  };
}

function updateOverheadBar(rig: FighterRig, actor: ArenaActorState): void {
  if (actor.isKO) {
    rig.overheadSprite.visible = false;
    return;
  }
  rig.overheadSprite.visible = true;
  const isSilenced = (actor.silencedTimer ?? 0) > 0.05;
  const isMarked = (actor.snareMarkedTimer ?? 0) > 0.05;
  const dummyDps = actor.isDummy ? actor.dummyDps ?? 0 : 0;
  const dummyPeak = actor.isDummy ? actor.dummyPeakDps ?? 0 : 0;
  const dummyBurst = actor.isDummy ? actor.dummyBurstDamage ?? 0 : 0;
  const key = `${actor.name}|${Math.round(actor.hp)}|${Math.round(actor.stagger)}|${actor.shieldActive ? 1 : 0}|${actor.parryWindow ? 1 : 0}|${actor.isStunned ? 1 : 0}|${actor.actionState === 'whiff' ? 1 : 0}|${actor.isOverdrive ? 1 : 0}|${actor.awakened ? 1 : 0}|${isSilenced ? 1 : 0}|${isMarked ? 1 : 0}|${rig.isLocalPlayer ? 1 : 0}|${actor.isDummy ? `${dummyDps}|${dummyPeak}|${dummyBurst}` : ''}`;
  if (rig.lastBarKey === key) return;
  rig.lastBarKey = key;

  const ctx = rig.overheadCtx;
  ctx.save();
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.clearRect(0, 0, 180, 48);

  ctx.fillStyle = actor.awakened
    ? 'rgba(255, 251, 235, 0.98)'
    : rig.isLocalPlayer
    ? 'rgba(255, 255, 255, 0.96)'
    : 'rgba(248, 250, 252, 0.92)';
  ctx.fillRect(6, 2, 168, 42);
  ctx.strokeStyle = actor.isStunned
    ? '#e11d48'
    : actor.awakened
    ? '#f59e0b'
    : actor.actionState === 'whiff'
    ? '#ea580c'
    : actor.parryWindow
    ? '#d97706'
    : actor.isOverdrive
    ? '#ca8a04'
    : rig.isLocalPlayer
    ? FIGHTER_BY_ID[actor.fighterId].color
    : actor.shieldActive
    ? '#0284c7'
    : actor.isDummy
    ? '#0ea5e9'
    : 'rgba(100, 116, 139, 0.6)';
  ctx.lineWidth = actor.awakened || actor.parryWindow || actor.isStunned || actor.isOverdrive || rig.isLocalPlayer || actor.isDummy ? 2.5 : 1.5;
  ctx.strokeRect(6, 2, 168, 42);

  ctx.fillStyle = isSilenced
    ? '#7e22ce'
    : actor.isStunned
    ? '#be123c'
    : actor.actionState === 'whiff'
    ? '#c2410c'
    : '#0f172a';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  const label = isSilenced
    ? 'SILENCED!'
    : actor.isStunned
    ? 'STUNNED!'
    : actor.actionState === 'whiff'
    ? 'OPEN!'
    : `${actor.awakened ? '★ ' : ''}${actor.name.slice(0, 11)}`;
  ctx.fillText(label, 12, 16);
  ctx.textAlign = 'right';
  ctx.fillStyle = actor.awakened ? '#b45309' : '#334155';
  ctx.fillText(`${actor.hp}`, 168, 16);

  const hpPct = Math.max(0, Math.min(1, actor.hp / Math.max(1, actor.maxHp)));
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(12, 20, 156, 7);
  ctx.fillStyle = actor.awakened ? '#f59e0b' : hpPct > 0.55 ? '#16a34a' : hpPct > 0.28 ? '#d97706' : '#e11d48';
  ctx.fillRect(12, 20, Math.round(156 * hpPct), 7);

  if (actor.isDummy) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(12, 30, 156, 12);
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = dummyDps > 0 ? '#38bdf8' : '#94a3b8';
    ctx.fillText(`${dummyDps.toFixed(1)} DPS`, 15, 39);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(`PK ${dummyPeak.toFixed(0)} · ${dummyBurst}`, 165, 39);
  } else {
    // Stagger buildup bar (crimson/amber) on bottom strip
    const stagPct = Math.max(0, Math.min(1, actor.stagger / 100));
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(12, 33, 156, 5);
    ctx.fillStyle = actor.isStunned ? '#e11d48' : isMarked ? '#eab308' : '#f59e0b';
    ctx.fillRect(12, 33, Math.round(156 * stagPct), 5);
  }
  ctx.restore();

  rig.overheadTex.needsUpdate = true;

  if (actor.isDummy) {
    rig.dummyBillboardSprite.visible = true;
    const dKey = `${dummyDps.toFixed(1)}|${dummyBurst}|${dummyPeak.toFixed(0)}`;
    if (rig.lastDummyBoardKey !== dKey) {
      rig.lastDummyBoardKey = dKey;
      const dCtx = rig.dummyBillboardCtx;
      dCtx.save();
      dCtx.clearRect(0, 0, 512, 176);

      // High-contrast dark slate panel with crisp cyan/gold frame
      dCtx.fillStyle = 'rgba(7, 11, 24, 0.94)';
      dCtx.beginPath();
      dCtx.roundRect(10, 8, 492, 160, 18);
      dCtx.fill();
      dCtx.lineWidth = 5;
      dCtx.strokeStyle = dummyDps > 0 ? '#38bdf8' : '#64748b';
      dCtx.stroke();

      dCtx.fillStyle = '#94a3b8';
      dCtx.font = '900 20px sans-serif';
      dCtx.textAlign = 'left';
      dCtx.fillText('TRAINING DUMMY DPS', 28, 38);

      dCtx.textAlign = 'right';
      dCtx.fillStyle = '#fbbf24';
      dCtx.fillText(`PEAK ${dummyPeak.toFixed(0)}`, 484, 38);

      // Giant DPS readout
      dCtx.textAlign = 'left';
      dCtx.font = '900 66px monospace';
      dCtx.fillStyle = dummyDps > 0 ? '#38bdf8' : '#cbd5e1';
      dCtx.fillText(`${dummyDps.toFixed(1)}`, 28, 108);

      // Giant Total Damage readout
      dCtx.textAlign = 'right';
      dCtx.font = '900 52px monospace';
      dCtx.fillStyle = '#fef08a';
      dCtx.fillText(`${dummyBurst}`, 484, 104);

      dCtx.font = '800 18px sans-serif';
      dCtx.textAlign = 'left';
      dCtx.fillStyle = '#7dd3fc';
      dCtx.fillText('DAMAGE / SEC', 30, 146);
      dCtx.textAlign = 'right';
      dCtx.fillStyle = '#fde68a';
      dCtx.fillText('TOTAL DMG', 484, 146);

      dCtx.restore();
      rig.dummyBillboardTex.needsUpdate = true;
    }
  } else {
    rig.dummyBillboardSprite.visible = false;
  }
}

export function computeActorPose(
  actor: ArenaActorState,
  rig: FighterRig,
  time: number,
  matchTime: number
): FighterPose {
  updateOverheadBar(rig, actor);

  const isAwakened = Boolean(actor.awakened) && !actor.isKO;
  for (const part of rig.awakenedParts) {
    part.visible = isAwakened;
  }
  rig.silencedRing.visible = !actor.isKO && (actor.silencedTimer ?? 0) > 0.05;
  rig.snareMarkRing.visible = !actor.isKO && (actor.snareMarkedTimer ?? 0) > 0.05;
  rig.transformFlashTime = !actor.isKO ? (actor.awakeningTransformTimer ?? 0) : 0;

  const base = getStancePose(actor.fighterId, time);
  if (rig.skinId === 'special' && actor.fighterId === 'prime') {
    base.torsoPitch += 0.14;
    base.headPitch += 0.18;
  } else if (rig.skinId === 'special' && actor.fighterId === 'marjohn') {
    base.torsoPitch += 0.2;
    base.armLAngle = [-1.15, 0.2, -0.1];
    base.elbowL = -0.35;
  }
  const outlawHoverOffset =
    rig.skinId === 'ascended' && actor.fighterId === 'damen' && !actor.isKO
      ? 0.34 + Math.sin(time * 3.2) * 0.08
      : 0;
  base.x = actor.x;
  base.y = actor.y + outlawHoverOffset;
  base.z = actor.z;
  base.rotY = actor.rotY;

  if (actor.isKO) {
    const koAge = actor.koTime !== null ? Math.max(0, matchTime - actor.koTime) : 1.0;
    const style = actor.koStyle;
    const killerId = actor.koByFighterId;

    // Hide active passives on KO
    if (rig.tailwindRibbons) rig.tailwindRibbons.forEach((r) => (r.visible = false));
    if (rig.tailwindExtraRibbons) rig.tailwindExtraRibbons.forEach((r) => (r.visible = false));
    if (rig.frenzyFlameShell) rig.frenzyFlameShell.visible = false;
    if (rig.deadeyeRing) rig.deadeyeRing.visible = false;
    if (rig.voidWisps) rig.voidWisps.forEach((w) => (w.visible = false));
    if (rig.jmHandGlows) rig.jmHandGlows.forEach((g) => (g.visible = false));
    rig.awakenedParts.forEach((p) => (p.visible = false));
    rig.silencedRing.visible = false;
    rig.snareMarkRing.visible = false;

    if (style === 'launch') {
      // Prime Launch KO: punted skyward spinning & vanishing after apex
      const skyY = Math.max(0.1, koAge * 13.8 - 5.2 * koAge * koAge);
      const fade = koAge > 0.9 ? Math.max(0, 1 - (koAge - 0.9) / 0.35) : 1;
      return {
        ...base,
        y: actor.y + skyY,
        leanX: -koAge * 7.2,
        torsoRoll: koAge * 4.5,
        armLAngle: [-1.8, 0, -0.8],
        armRAngle: [-1.8, 0, 0.8],
        legLAngle: [0.4, 0, -0.25],
        legRAngle: [-0.3, 0, 0.25],
        eyeState: 'ko',
        auraOpacity: 0,
        bodyOpacity: fade,
      };
    }

    if (style === 'shatter') {
      // Damen Shatter KO: freeze mid-motion for 0.24s, then shatter into shards
      const frozen = koAge < 0.24;
      if (rig.shieldShards) {
        const shT = Math.max(0, koAge - 0.22);
        rig.shieldShards.forEach((sh) => {
          if (!frozen && shT < 1.45) {
            sh.mesh.visible = true;
            sh.mesh.position.set(
              actor.x + sh.vx * shT,
              Math.max(0.1, 1.1 + sh.vy * shT - 6.5 * shT * shT),
              actor.z + sh.vz * shT
            );
            sh.mesh.rotation.set(shT * 7, shT * 5, shT * 6);
            (sh.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - shT / 1.4);
          } else {
            sh.mesh.visible = false;
          }
        });
      }
      return {
        ...base,
        y: actor.y + (frozen ? 0.18 : 0.1),
        leanX: -0.22,
        torsoYaw: 0.35,
        armLAngle: [-0.9, 0.2, -0.5],
        armRAngle: [-0.9, -0.2, 0.5],
        eyeState: 'shock',
        auraOpacity: frozen ? 0.85 : 0,
        bodyOpacity: frozen ? 0.92 : 0,
      };
    }

    if (style === 'dissolve') {
      // Khen Dissolve KO: unravel into drifting violet smoke particles
      const dP = Math.min(1, koAge / 1.25);
      if (rig.dissolveCloud) {
        rig.dissolveCloud.visible = dP < 1;
        (rig.dissolveCloud.material as THREE.PointsMaterial).opacity = Math.sin(dP * Math.PI) * 0.95;
        const arr = rig.dissolveCloud.geometry.attributes.position.array as Float32Array;
        const seeds = rig.dissolveCloud.userData.seeds as Array<{
          x: number;
          y: number;
          z: number;
          speed: number;
          drift: number;
        }>;
        const groundY = rig.root.position.y - actor.y;
        for (let i = 0; i < seeds.length; i++) {
          const sd = seeds[i];
          arr[i * 3] = actor.x + sd.x + sd.drift * dP * 1.4;
          arr[i * 3 + 1] = groundY + sd.y + dP * sd.speed * 2.2;
          arr[i * 3 + 2] = actor.z + sd.z + Math.sin(i + dP * 6) * 0.45 * dP;
        }
        rig.dissolveCloud.geometry.attributes.position.needsUpdate = true;
      }
      return {
        ...base,
        y: actor.y + dP * 0.65,
        leanX: -0.3 - dP * 0.2,
        armLAngle: [-1.1, 0, -0.6],
        armRAngle: [-1.1, 0, 0.6],
        eyeState: 'ko',
        auraOpacity: 0,
        bodyOpacity: Math.max(0, 1 - dP),
      };
    }

    // Collapse KO (Marjohn wind-tatter inward crumple OR JM collapse under golden light pillar)
    const u = Math.min(1, koAge / 0.85);
    const fadeOut = koAge > 0.65 ? Math.max(0, 1 - (koAge - 0.65) / 0.45) : 1;
    const isJmCollapse = killerId === 'jm';
    return {
      ...base,
      y: isJmCollapse ? 0.1 : 0.14 * (1 - u * 0.3),
      leanX: isJmCollapse ? 0.55 * u : 0.35 + (1.38 - 0.35) * u,
      hipY: isJmCollapse ? -0.34 * u : -0.18 * u,
      squash: isJmCollapse ? 1 - u * 0.12 : 1 - u * 0.34,
      armLAngle: isJmCollapse ? [-0.35, 0.4, -0.4] : [-0.8 * u, 0.6 * u, -0.25],
      armRAngle: isJmCollapse ? [-0.35, -0.4, 0.4] : [-0.8 * u, -0.6 * u, 0.25],
      legLAngle: [0.35, 0, -0.14],
      kneeL: 1.25,
      legRAngle: [0.25, 0, 0.14],
      kneeR: 1.15,
      eyeState: 'ko',
      auraOpacity: 0,
      bodyOpacity: fadeOut,
    };
  }

  if (rig.dissolveCloud) rig.dissolveCloud.visible = false;
  if (rig.shieldShards) rig.shieldShards.forEach((s) => (s.mesh.visible = false));

  if (actor.damagePhase === 'DAMAGED') {
    base.torsoPitch += 0.07;
    base.auraOpacity *= 0.88;
  } else if (actor.damagePhase === 'SEVERELY DAMAGED') {
    base.torsoPitch += 0.15;
    base.hipY -= 0.04;
    base.torsoRoll += Math.sin(time * 6.5) * 0.05;
    base.auraOpacity *= Math.sin(time * 22) > -0.3 ? 0.72 : 0.22;
  } else if (actor.damagePhase === 'CRITICAL') {
    base.torsoPitch += 0.24;
    base.hipY -= 0.09;
    base.kneeL += 0.22;
    base.kneeR += 0.22;
    base.torsoRoll += Math.sin(time * 9.0) * 0.08;
    base.auraOpacity *= Math.sin(time * 32) > 0 ? 0.55 : 0.12;
  }

  if (actor.isOverdrive) {
    base.auraOpacity = Math.max(base.auraOpacity, 0.78 + Math.sin(time * 18) * 0.2);
  }

  // Character-Specific Passive Visuals + Frenzy Intensification
  const inFrenzy = Boolean(actor.frenzyInside);
  if (inFrenzy) {
    base.auraOpacity = Math.max(base.auraOpacity, 0.72 + Math.sin(time * 16) * 0.22);
    rig.auraRing.material.color.setHex(
      actor.fighterId === 'marjohn' ? 0x5eead4 : actor.fighterId === 'prime' ? 0xfb923c : FIGHTER_BY_ID[actor.fighterId].hex
    );
  } else {
    rig.auraRing.material.color.setHex(
      actor.fighterId === 'marjohn' ? 0x2dd4bf : FIGHTER_BY_ID[actor.fighterId].hex
    );
  }

  if (rig.tailwindRibbons && rig.tailwindExtraRibbons) {
    const stacks = actor.passiveStacks;
    for (let i = 0; i < rig.tailwindRibbons.length; i++) {
      const show = i < stacks;
      const rib = rig.tailwindRibbons[i];
      const ex = rig.tailwindExtraRibbons[i];
      rib.visible = show;
      ex.visible = show && inFrenzy;
      if (show) {
        rib.rotation.z = time * (5.5 + stacks * 1.6 + (inFrenzy ? 5 : 0)) + i * 1.1;
        const mat = rib.material as THREE.MeshBasicMaterial;
        mat.color.setHex(inFrenzy ? 0x2dd4bf : 0x0d9488);
      }
      if (ex.visible) {
        ex.rotation.z = -time * (9.0 + stacks * 1.8) + i * 0.8;
      }
    }
  }

  if (rig.magmaVeins) {
    const missing = Math.max(0, 1 - actor.hp / Math.max(1, actor.maxHp));
    const armoredSwing = actor.actionState === 'attack' || actor.actionState === 'skill';
    const domainHot = Boolean(actor.primeDomainBuff);
    const heat = domainHot ? 1.0 : Math.min(1, missing * 1.25 + (armoredSwing ? 0.35 : 0) + (inFrenzy ? 0.3 : 0));
    rig.magmaVeins.forEach((v, idx) => {
      const mat = v.material as THREE.MeshBasicMaterial;
      mat.color.setHex(domainHot ? 0xfbbf24 : heat > 0.65 ? 0xea580c : idx >= 3 ? 0xdc2626 : 0xea580c);
    });
    if (domainHot) {
      base.auraOpacity = Math.max(base.auraOpacity, 0.78);
      rig.auraRing.material.color.setHex(0xdc2626);
    }
    if (rig.frenzyFlameShell) {
      rig.frenzyFlameShell.visible = domainHot || inFrenzy || armoredSwing;
      if (rig.frenzyFlameShell.visible) {
        rig.frenzyFlameShell.rotation.y = time * (domainHot ? 6.8 : 4.5);
        rig.frenzyFlameShell.scale.setScalar((domainHot ? 1.12 : 1.0) + Math.sin(time * 16) * 0.07);
      }
    }
  }

  if (rig.deadeyeRing) {
    rig.deadeyeRing.visible = true;
    const pulse = 0.5 + 0.5 * Math.sin(time * (inFrenzy ? 10 : 4.5));
    rig.deadeyeRing.material.color.setHex(inFrenzy ? 0xeab308 : 0xf59e0b);
    rig.deadeyeRing.scale.setScalar(inFrenzy ? 1.02 + pulse * 0.04 : 1.0);
  }

  if (rig.voidWisps) {
    rig.voidWisps.forEach((w, i) => {
      w.visible = true;
      const spd = inFrenzy ? 8.5 : 3.6;
      const a = time * spd + (i / rig.voidWisps!.length) * Math.PI * 2;
      w.position.set(Math.cos(a) * (inFrenzy ? 0.56 : 0.42), 0.85 + Math.sin(time * 6 + i) * 0.15, Math.sin(a) * (inFrenzy ? 0.56 : 0.42));
      w.rotation.y = -a;
    });
  }

  if (rig.jmHandGlows) {
    const regenPulse = inFrenzy && actor.hp < actor.maxHp * 0.4 ? 0.45 + 0.55 * Math.max(0, Math.sin(time * Math.PI * 2)) : 0;
    const dashGlow = Boolean(actor.jmDashActive);
    const activeGlow = dashGlow || actor.counterFlowActive || regenPulse > 0.1;
    rig.jmHandGlows.forEach((g) => {
      g.visible = activeGlow;
      if (activeGlow) {
        g.scale.setScalar(
          dashGlow
            ? 1.24 + Math.sin(time * 22) * 0.14
            : actor.counterFlowActive
            ? 1.12 + Math.sin(time * 14) * 0.12
            : 0.9 + regenPulse * 0.25
        );
      }
    });
    if (regenPulse > 0.25 || dashGlow) {
      base.auraOpacity = Math.max(base.auraOpacity, dashGlow ? 0.78 : regenPulse * 0.72);
      rig.auraRing.material.color.setHex(dashGlow ? 0x06b6d4 : 0xfef08a);
    }
  }

  if (rig.goldenShield) {
    if (actor.shieldActive) {
      rig.goldenShield.visible = true;
      const parryHex =
        actor.fighterId === 'marjohn'
          ? 0x2dd4bf
          : actor.fighterId === 'khen'
          ? 0x7c3aed
          : 0xfef08a;
      const guardHex =
        actor.fighterId === 'marjohn' ? 0x0d9488 : FIGHTER_BY_ID[actor.fighterId].hex;
      rig.goldenShield.material.color.setHex(actor.parryWindow ? parryHex : guardHex);
      rig.goldenShield.scale.setScalar(actor.parryWindow ? 1.14 : 0.98);
      rig.goldenShield.rotation.y = time * (actor.parryWindow ? 9.0 : actor.fighterId === 'marjohn' ? 5.5 : 2.6);
    } else {
      rig.goldenShield.visible = false;
    }
  }

  if (isAwakened) {
    const awkHex = AWAKENING_CONFIG.AWAKENED_KITS[actor.fighterId].auraPrimaryHex;
    base.auraOpacity = Math.max(base.auraOpacity, 0.88 + Math.sin(time * 12) * 0.12);
    rig.auraRing.material.color.setHex(awkHex);
    if (rig.wingL && rig.wingR) {
      rig.wingL.visible = true;
      rig.wingR.visible = true;
    }
  }

  if (rig.crownHalo) {
    rig.crownHalo.visible =
      rig.skinId === 'ascended' ||
      isAwakened ||
      actor.actionState === 'ultimate' ||
      actor.isOverdrive ||
      actor.counterFlowActive;
    if (rig.crownHalo.visible) {
      const isSkyMeteor = actor.fighterId === 'jm' && actor.abilitySlot === 5;
      rig.crownHalo.rotation.z = time * (isSkyMeteor ? 7.5 : isAwakened ? 5.2 : actor.counterFlowActive || actor.isOverdrive ? 3.8 : 1.4);
      rig.crownHalo.scale.setScalar(isSkyMeteor ? 1.55 : isAwakened ? 1.28 : actor.counterFlowActive ? 1.16 : 0.92);
    }
  }
  if (rig.staffGroup) {
    rig.staffGroup.rotation.y =
      actor.actionState === 'guard' || actor.actionState === 'skill' || (actor.actionState === 'attack' && actor.comboStep === 3)
        ? time * 18
        : 0;
  }

  const speed = Math.hypot(actor.vx, actor.vz);
  const dtStep = rig.lastPoseTime > 0 ? Math.min(0.05, Math.max(0.001, time - rig.lastPoseTime)) : 0.016;
  rig.lastSpeed = dampScalar(rig.lastSpeed, speed, 16, dtStep);
  if (actor.actionState === 'move' && rig.lastSpeed > 0.45 && actor.grounded && !actor.isFlying) {
    rig.walkPhase += Math.max(2.5, rig.lastSpeed * 1.45) * dtStep;
  }

  if (actor.channelKind === 'jm_kamehameha_charge') {
    base.hipY -= 0.18;
    base.torsoPitch = 0.16;
    base.torsoYaw = -0.68;
    base.armLAngle = [-0.85, 0.55, -0.35];
    base.armRAngle = [-0.75, -0.45, 0.25];
    base.elbowL = -1.25;
    base.elbowR = -1.15;
    base.legLAngle = [-0.42, 0, -0.18];
    base.kneeL = 0.72;
    base.legRAngle = [0.32, 0, 0.18];
    base.kneeR = 0.54;
    base.auraOpacity = 1.0;
    return base;
  }

  if (actor.channelKind === 'jm_kamehameha') {
    base.hipY -= 0.08;
    base.torsoPitch = -0.08;
    base.leanX = -0.1;
    base.armLAngle = [-1.58, 0.22, -0.08];
    base.armRAngle = [-1.58, -0.22, 0.08];
    base.elbowL = -0.1;
    base.elbowR = -0.1;
    base.legLAngle = [-0.28, 0, -0.14];
    base.kneeL = 0.42;
    base.legRAngle = [0.22, 0, 0.14];
    base.kneeR = 0.28;
    base.auraOpacity = 1.0;
    return base;
  }

  if (actor.channelKind === 'jm_sky_uppercut') {
    base.leanX = -0.22;
    base.torsoPitch = -0.24;
    base.armRAngle = [-2.9, -0.15, 0.2];
    base.armLAngle = [0.45, 0.25, -0.35];
    base.elbowR = -0.1;
    base.legLAngle = [-0.45, 0, -0.1];
    base.kneeL = 0.85;
    base.auraOpacity = 1.0;
    return base;
  }

  if (actor.channelKind === 'jm_sky_peak') {
    base.hipY += Math.sin(time * 10) * 0.05;
    base.torsoPitch = 0.14;
    base.armLAngle = [-1.25, 0.35, -0.4];
    base.armRAngle = [-1.25, -0.35, 0.4];
    base.elbowL = -0.8;
    base.elbowR = -0.8;
    base.auraOpacity = 0.96;
    return base;
  }

  if (actor.channelKind === 'jm_sky_finisher') {
    const step = actor.skyComboStep ?? 1;
    if (step >= 4) {
      base.leanX = 0.36;
      base.torsoPitch = 0.52;
      base.armLAngle = [-1.15, 0.2, -0.15];
      base.armRAngle = [-1.15, -0.2, 0.15];
      base.elbowL = -0.2;
      base.elbowR = -0.2;
    } else if (step === 3) {
      base.armLAngle = [-1.58, 0.25, -0.06];
      base.armRAngle = [-1.58, -0.25, 0.06];
      base.elbowL = -0.08;
      base.elbowR = -0.08;
    } else if (step === 2) {
      base.torsoPitch = -0.25;
      base.legRAngle = [-1.35, 0, 0.22];
      base.kneeR = 0.15;
    } else {
      const punch = Math.sin(time * 28);
      base.torsoYaw = punch * 0.65;
      base.armLAngle = [-1.6 + punch * 0.5, 0.2, -0.2];
      base.armRAngle = [-1.6 - punch * 0.5, -0.2, 0.2];
    }
    base.auraOpacity = 1.0;
    return base;
  }

  if (actor.channelKind === 'jm_air_barrage') {
    const rapid = Math.sin(time * 34);
    base.hipY += Math.sin(time * 9) * 0.08;
    base.torsoPitch = 0.32;
    base.torsoYaw = rapid * 0.24;
    base.armLAngle = [-1.15 + rapid * 0.28, 0.25, -0.22];
    base.armRAngle = [-1.15 - rapid * 0.28, -0.25, 0.22];
    base.elbowL = -0.18;
    base.elbowR = -0.18;
    base.auraOpacity = 1.0;
    return base;
  }

  if (actor.channelKind === 'jm_nova_slam') {
    base.hipY += 0.36;
    base.torsoPitch = -0.16;
    base.armLAngle = [-2.55, 0.2, -0.35];
    base.armRAngle = [-2.55, -0.2, 0.35];
    base.elbowL = -0.22;
    base.elbowR = -0.22;
    base.auraOpacity = 1.0;
    return base;
  }

  if (actor.channelKind === 'khen_domain') {
    const flit = Math.sin(time * 28);
    base.leanX = 0.48;
    base.torsoPitch = 0.38;
    base.torsoYaw = flit * 0.85;
    base.armLAngle = [-1.4 + flit * 0.45, 0.4, -0.55];
    base.armRAngle = [-1.4 - flit * 0.45, -0.4, 0.55];
    base.elbowL = -0.25;
    base.elbowR = -0.25;
    base.auraOpacity = 1.0;
    return base;
  }

  if (actor.channelKind === 'damen_arsenal') {
    base.hipY -= 0.06;
    base.torsoPitch = -0.06;
    base.torsoYaw = Math.sin(time * 20) * 0.12;
    base.armLAngle = [-1.54, 0.32, -0.22];
    base.armRAngle = [-1.54, -0.32, 0.22];
    base.elbowL = -0.08;
    base.elbowR = -0.08;
    base.auraOpacity = 1.0;
    return base;
  }

  if (actor.channelKind === 'marjohn_typhoon') {
    base.hipY += Math.sin(time * 9) * 0.12;
    base.torsoPitch = -0.12;
    base.torsoYaw = time * 4.5;
    base.armLAngle = [-2.25, 0.35, -0.78];
    base.armRAngle = [-2.25, -0.35, 0.78];
    base.elbowL = -0.15;
    base.elbowR = -0.15;
    base.legLAngle = [-0.25, 0, -0.15];
    base.kneeL = 0.55;
    base.legRAngle = [0.2, 0, 0.15];
    base.kneeR = 0.4;
    base.auraOpacity = 1.0;
    return base;
  }

  if (actor.channelKind === 'prime_asura_slams') {
    const osc = Math.sin(time * 28);
    base.hipY -= 0.12;
    base.torsoPitch = 0.42;
    base.torsoYaw = osc * 0.58;
    base.armLAngle = [-1.7 + osc * 0.65, 0.2, -0.25];
    base.armRAngle = [-1.7 - osc * 0.65, -0.2, 0.25];
    base.elbowL = -0.15;
    base.elbowR = -0.15;
    base.auraOpacity = 1.0;
    return base;
  }

  if (actor.channelKind === 'jm_judgement_cast') {
    base.hipY += 0.22;
    base.torsoPitch = -0.2;
    base.armLAngle = [-2.75, 0.25, -0.3];
    base.armRAngle = [-2.75, -0.25, 0.3];
    base.elbowL = -0.12;
    base.elbowR = -0.12;
    base.auraOpacity = 1.0;
    return base;
  }

  if (actor.channelKind === 'prime_meteor') {
    const punchOsc = Math.sin(time * 26);
    base.hipY += Math.sin(time * 7.5) * 0.1;
    base.torsoPitch = 0.44;
    base.torsoYaw = punchOsc * 0.55;
    base.armLAngle = [-1.75 + punchOsc * 0.45, 0.18, -0.2];
    base.armRAngle = [-1.75 - punchOsc * 0.45, -0.18, 0.2];
    base.elbowL = -0.12;
    base.elbowR = -0.12;
    base.legLAngle = [-0.35, 0, -0.12];
    base.kneeL = 0.7;
    base.legRAngle = [0.3, 0, 0.12];
    base.kneeR = 0.45;
    base.auraOpacity = 1.0;
    return base;
  }

  if (actor.isFlying) {
    base.hipY += Math.sin(time * 6.5) * 0.07;
    base.leanX = Math.min(0.28, rig.lastSpeed * 0.032);
    if (actor.fighterId === 'marjohn') {
      base.torsoPitch = 0.12;
      base.torsoYaw = Math.sin(time * 4.5) * 0.14;
      base.armLAngle = [-0.95, 0.28, -0.68];
      base.armRAngle = [-0.95, -0.28, 0.68];
      base.legLAngle = [-0.22, 0, -0.16];
      base.kneeL = 0.48;
      base.legRAngle = [0.18, 0, 0.16];
      base.kneeR = 0.36;
      base.auraOpacity = Math.max(base.auraOpacity, 0.94);
    } else {
      base.torsoPitch = 0.18;
      base.armLAngle = [-0.65, 0.35, -0.48];
      base.armRAngle = [-0.65, -0.35, 0.48];
      base.legLAngle = [-0.32, 0, -0.1];
      base.kneeL = 0.68;
      base.legRAngle = [0.28, 0, 0.1];
      base.kneeR = 0.42;
      base.auraOpacity = Math.max(base.auraOpacity, 0.85);
    }
  } else if (!actor.grounded) {
    base.hipY += 0.05;
    base.torsoPitch += 0.18;
    base.armLAngle = [-1.15, 0.2, -0.45];
    base.armRAngle = [-1.15, -0.2, 0.45];
    base.legLAngle = [-0.55, 0, -0.08];
    base.kneeL = 0.95;
    base.legRAngle = [0.22, 0, 0.08];
    base.kneeR = 0.65;
  } else if (actor.actionState === 'move' && rig.lastSpeed > 0.5) {
    const stride = Math.min(1, rig.lastSpeed / 6.8);
    const ph = rig.walkPhase;
    const s = Math.sin(ph);
    base.hipY = -0.14 + Math.abs(Math.cos(ph)) * 0.07 * stride;
    base.torsoPitch += 0.26 * stride;
    base.leanX += 0.12 * stride;
    base.armLAngle = [s * 0.65 * stride - 0.35, 0, -0.22];
    base.armRAngle = [-s * 0.65 * stride - 0.35, 0, 0.22];
    base.legLAngle = [-s * 0.78 * stride, 0, -0.07];
    base.kneeL = Math.max(0.14, s * 0.85 * stride + 0.35);
    base.legRAngle = [s * 0.78 * stride, 0, 0.07];
    base.kneeR = Math.max(0.14, -s * 0.85 * stride + 0.35);
  }

  if (actor.jmDashActive) {
    // Low, forward-leaning anime speedster / dragon flash-step pose (no T-pose!)
    const dashStride = Math.sin(time * 26);
    base.hipY = -0.22 + Math.abs(Math.cos(time * 26)) * 0.05;
    base.leanX = 0.56;
    base.torsoPitch = 0.48;
    base.headPitch = -0.34;
    base.armLAngle = [0.88, 0.24, -0.36];
    base.armRAngle = [0.88, -0.24, 0.36];
    base.elbowL = -0.22;
    base.elbowR = -0.22;
    base.legLAngle = [-0.62 + dashStride * 0.42, 0, -0.09];
    base.kneeL = 0.92 + Math.max(0, dashStride) * 0.35;
    base.legRAngle = [0.55 - dashStride * 0.42, 0, 0.09];
    base.kneeR = 0.78 + Math.max(0, -dashStride) * 0.35;
    base.squash = 0.92;
    base.auraOpacity = 1.0;
  }

  const prog = actor.actionDuration > 0 ? 1 - actor.actionTimer / actor.actionDuration : 0;
  const swingEnv = Math.sin(Math.min(1, Math.max(0, prog)) * Math.PI);

  if (actor.actionState === 'attack') {
    const step = actor.comboStep || 1;
    if (actor.fighterId === 'damen') {
      base.armRAngle = [-1.54, -0.06, 0.1];
      base.elbowR = -0.08;
      base.armLAngle = [-0.85, 0.25, -0.35];
      base.torsoYaw = -0.28 * swingEnv;
      base.auraOpacity = 0.82;
    } else if (actor.fighterId === 'marjohn') {
      // Sweeping Wind-Staff Tornado Poke thrust!
      base.torsoYaw = (prog < 0.35 ? -0.55 : 0.82) * swingEnv;
      base.torsoPitch += 0.22 * swingEnv;
      base.armRAngle = [-1.62, -0.18, 0.24];
      base.elbowR = -0.15;
      base.armLAngle = [-1.25, 0.45, -0.2];
      base.auraOpacity = 0.88;
    } else if (actor.fighterId === 'jm' && actor.isFlying) {
      // Flying JM fires energy bolts rapidly forward/down!
      base.armLAngle = [-1.45, 0.2, -0.15];
      base.armRAngle = [-1.45, -0.2, 0.15];
      base.elbowL = -0.15;
      base.elbowR = -0.15;
      base.auraOpacity = 0.94;
    } else if (actor.fighterId === 'jm' && (step === 3 || (isAwakened && step !== 4))) {
      // JM Mini/Awakened Kamehameha twin-palm wave!
      base.torsoPitch = -0.12;
      base.armLAngle = [-1.58, 0.32, -0.06];
      base.armRAngle = [-1.58, -0.32, 0.06];
      base.elbowL = -0.08;
      base.elbowR = -0.08;
      base.auraOpacity = 0.98;
    } else if (actor.fighterId === 'jm' && step === 4) {
      // JM 4th Hit: High-Speed Super Dash Punch launcher!
      base.leanX = 0.42 * swingEnv;
      base.torsoYaw = -0.72 * swingEnv;
      base.armRAngle = [-1.65, -0.1, 0.15];
      base.elbowR = -0.05;
      base.armLAngle = [0.55, 0.2, -0.35];
      base.auraOpacity = 1.0;
    } else if (actor.fighterId === 'prime' && step === 4) {
      // Prime 4th Hit: Armored Ground Slam overhead wind-up -> floor smash!
      const isWindup = prog < 0.48;
      base.torsoPitch = isWindup ? -0.36 : 0.72;
      base.armLAngle = [isWindup ? -2.85 : -1.25, 0.25, -0.2];
      base.armRAngle = [isWindup ? -2.85 : -1.25, -0.25, 0.2];
      base.elbowL = -0.2;
      base.elbowR = -0.2;
      base.squash = isWindup ? 1.12 : 0.84;
      base.auraOpacity = 1.0;
    } else if (actor.fighterId === 'khen' && step === 4) {
      // Khen 4th Hit: Low Damaging Dash Lunge dual slice!
      base.leanX = 0.46;
      base.torsoPitch = 0.42;
      base.armLAngle = [0.65, 0.45, -0.75];
      base.armRAngle = [0.65, -0.45, 0.75];
      base.squash = 0.88;
      base.auraOpacity = 1.0;
    } else if (step === 1 || step === 3) {
      base.torsoYaw = (prog < 0.35 ? -0.4 : 0.75) * swingEnv;
      base.torsoPitch += 0.24 * swingEnv;
      base.armRAngle = [-1.75 * swingEnv - 0.3, -0.2, 0.35];
      base.elbowR = -0.2;
      base.armLAngle = [-0.7, 0.3, -0.35];
      base.auraOpacity = 0.82;
    } else {
      base.torsoYaw = (prog < 0.35 ? 0.5 : -0.85) * swingEnv;
      base.torsoPitch += 0.28 * swingEnv;
      base.armLAngle = [-1.85 * swingEnv - 0.2, 0.25, -0.35];
      base.elbowL = -0.18;
      base.armRAngle = [-0.75, -0.3, 0.35];
      base.auraOpacity = 0.88;
    }
  } else if (actor.actionState === 'headlock') {
    const shake = Math.sin(time * 28) * 0.14;
    base.hipY -= 0.12;
    base.torsoPitch = 0.35;
    base.torsoYaw = shake;
    base.armLAngle = [-1.52, 0.55, -0.25];
    base.armRAngle = [-1.52, -0.55, 0.25];
    base.elbowL = -0.95;
    base.elbowR = -0.95;
    base.eyeState = 'shock';
    base.auraOpacity = 0.92;
  } else if (actor.actionState === 'grab') {
    base.leanX = 0.32 * swingEnv;
    base.torsoPitch = 0.28;
    base.armLAngle = [-1.52, 0.35, -0.28];
    base.armRAngle = [-1.52, -0.35, 0.28];
    base.elbowL = -0.35;
    base.elbowR = -0.35;
    base.auraOpacity = 0.85;
  } else if (actor.actionState === 'whiff') {
    base.eyeState = 'shock';
    base.hipY -= 0.1;
    base.leanX = 0.26;
    base.torsoPitch = 0.42;
    base.torsoRoll = Math.sin(time * 22) * 0.12;
    base.armLAngle = [-0.3, 0, -0.75];
    base.armRAngle = [-0.3, 0, 0.75];
    base.auraOpacity = 0.35;
  } else if (actor.actionState === 'clash') {
    base.leanX = 0.22;
    base.hipY -= 0.14;
    base.armLAngle = [-1.55, 0.45, -0.2];
    base.armRAngle = [-1.55, -0.45, 0.2];
    base.elbowL = -0.8;
    base.elbowR = -0.8;
    base.auraOpacity = 1.0;
  } else if (actor.actionState === 'guard') {
    base.hipY -= 0.08;
    base.armLAngle = [-1.45, 0.55, -0.15];
    base.elbowL = -1.25;
    base.armRAngle = [-1.45, -0.55, 0.15];
    base.elbowR = -1.25;
    base.auraOpacity = actor.parryWindow ? 0.95 : 0.65;
  } else if (actor.actionState === 'dash') {
    base.leanX = 0.48;
    base.torsoPitch = 0.38;
    base.armLAngle = [0.68, 0, -0.32];
    base.armRAngle = [0.68, 0, 0.32];
    base.squash = 0.9;
    base.auraOpacity = 0.95;
  } else if (actor.actionState === 'skill') {
    base.torsoYaw = Math.sin(prog * Math.PI * 2) * 0.85;
    base.armLAngle = [-1.55, 0.4, -0.45];
    base.armRAngle = [-1.55, -0.4, 0.45];
    base.elbowL = -0.25;
    base.elbowR = -0.25;
    base.auraOpacity = 0.94;
  } else if (actor.actionState === 'ultimate') {
    if (actor.fighterId === 'jm' && actor.abilitySlot === 5) {
      // JM Secret Solar Meteor sky-charge: floating heroically with both arms cradling fireball overhead!
      base.hipY += 0.08 + Math.sin(time * 8) * 0.05;
      base.torsoPitch = -0.28;
      base.headPitch = -0.18;
      base.torsoYaw = Math.sin(time * 4) * 0.08;
      base.armLAngle = [-2.85, 0.25, -0.35];
      base.armRAngle = [-2.85, -0.25, 0.35];
      base.elbowL = -0.25;
      base.elbowR = -0.25;
      base.legLAngle = [-0.25, 0, -0.1];
      base.kneeL = 0.45;
      base.legRAngle = [0.35, 0, 0.1];
      base.kneeR = 0.65;
      base.auraOpacity = 1.0;
    } else {
      base.torsoPitch = actor.fighterId === 'jm' ? -0.12 : 0.28;
      base.torsoYaw = 0.55 * swingEnv;
      base.armLAngle = [-1.62, 0.1, -0.12];
      base.armRAngle = [-1.62, -0.1, 0.12];
      base.elbowL = -0.12;
      base.elbowR = -0.12;
      base.auraOpacity = 1.0;
    }
  } else if (actor.actionState === 'stagger') {
    base.eyeState = 'shock';
    if (actor.isStunned) {
      base.hipY -= 0.24;
      base.torsoPitch = 0.45;
      base.torsoRoll = Math.sin(time * 10) * 0.16;
      base.headPitch = 0.35;
      base.kneeL = 0.7;
      base.kneeR = 0.7;
      base.armLAngle = [-0.2, 0, -0.65];
      base.armRAngle = [-0.2, 0, 0.65];
    } else {
      base.leanX = -0.42 * swingEnv;
      base.torsoPitch = -0.35 * swingEnv;
      base.armLAngle = [-1.1 * swingEnv - 0.2, 0, -0.6];
      base.armRAngle = [-1.1 * swingEnv - 0.2, 0, 0.6];
      base.squash = 1.0 - 0.12 * swingEnv;
    }
  }

  return base;
}

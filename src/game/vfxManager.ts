import * as THREE from 'three';
import {
  AbilityAimKind,
  AbyssalCloneState,
  ArenaActorState,
  ArenaItemDrop,
  ArenaPickup,
  ArenaTurretState,
  ArenaZoneState,
  AwakeningCutsceneState,
  AwakeningOrbState,
  BattlefieldEventState,
  CombatEvent,
  DomainCastState,
  DomainExpansionState,
  FighterId,
  JudgementSpearState,
  KothZoneState,
  MAP_BY_ID,
  MapId,
  MapObstacle,
  ProjectileState,
  SkinId,
  TACTICAL_ITEMS,
  TACTICAL_ITEMS_BY_KIND,
  TacticalItemKind,
  TelegraphState,
  TempleNpcState,
  getMapTerrainHeight,
} from '../shared/gameData.ts';
import { AWAKENING_CONFIG } from '../shared/awakeningConfig.ts';
import { computeTerrainConformingAimPath, getSurfaceHeightAt } from './mapLogic.ts';
import {
  VFXTextureAtlas,
  buildLightningRibbonGeometry,
  clampAdditiveOpacity,
  createFacetedCrystalSpireGeometry,
  createFacetedRidgeGeometry,
  createFacetedRockGeometry,
  createSculptedFirearmGeometry,
  createShadowClonePartsGeo,
  createSpiralWindRibbonsGeometry,
  createTaperedConeShellGeometry,
  createTaperedCrescentGeometry,
  createTwistedVortexGeometry,
  createVFXTextureAtlas,
  updateLightningRibbonGeometry,
} from './vfxAtlas.ts';

export interface AimPreviewState {
  active: boolean;
  cancelled: boolean;
  aimKind: AbilityAimKind;
  originX: number;
  originY?: number;
  originZ: number;
  aimX: number;
  aimZ: number;
  radius: number;
  range: number;
  colorHex: number;
}

interface GlowHaloItem {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  life: number;
  maxLife: number;
  baseScale: number;
  peakOpacity: number;
}

interface ShockwaveItem {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  age: number;
  maxAge: number;
  startScale: number;
  maxRadius: number;
  reverse?: boolean;
}

interface SlashItem {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  life: number;
  maxLife: number;
  spinSpeed: number;
  growSpeed: number;
}

interface CoreFlashItem {
  mesh: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
  life: number;
  maxLife: number;
  peakScale: number;
}

interface FunnelItem {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  life: number;
  maxLife: number;
  spinSpeed: number;
  startScaleX: number;
  endScaleX: number;
  scaleY: number;
  baseY: number;
}

interface TracerItem {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  life: number;
  maxLife: number;
  startScaleX: number;
}

interface SparkItem {
  mesh: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  life: number;
  maxLife: number;
  orientToVel: boolean;
}

interface PuffItem {
  sprite: THREE.Sprite;
  vx: number;
  vy: number;
  vz: number;
  rotSpeed: number;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
  baseOpacity: number;
}

interface CrackItem {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  life: number;
  maxLife: number;
}

interface CasingItem {
  mesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  floorY: number;
}

interface VortexDebrisItem {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  centerX: number;
  centerY: number;
  centerZ: number;
  angle: number;
  radius: number;
  inwardSpeed: number;
  angularSpeed: number;
  heightOffset: number;
  life: number;
  maxLife: number;
}

interface GhostItem {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  baseOpacity: number;
}

interface BeamItem {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  coilA: THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial>;
  coilB: THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial>;
  life: number;
  maxLife: number;
}

interface PillarItem {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  life: number;
  maxLife: number;
  baseScale: number;
}

interface LightningSplineItem {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  life: number;
  maxLife: number;
  peakOpacity: number;
}

interface StormCloudItem {
  group: THREE.Group;
  life: number;
  maxLife: number;
}

interface GlyphItem {
  group: THREE.Group;
  life: number;
  maxLife: number;
}

interface TetherItem {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  life: number;
  maxLife: number;
}

interface SpellSigilItem {
  group: THREE.Group;
  life: number;
  maxLife: number;
  baseScale: number;
}

interface DelayedTask {
  delay: number;
  run: () => void;
}

interface PickupPoolSlot {
  id: string | null;
  group: THREE.Group;
  orb: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshStandardMaterial>;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  runeRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  beacon: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  moteA: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
  moteB: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
  badgeSprite: THREE.Sprite;
}

interface ItemDropPoolSlot {
  id: string | null;
  group: THREE.Group;
  crate: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshStandardMaterial>;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  runeRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  beacon: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  badgeSprite: THREE.Sprite;
}

interface FallingMeteorItem {
  group: THREE.Group;
  fist: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  aura: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  startY: number;
  targetY: number;
  radius: number;
  age: number;
  duration: number;
  exploded: boolean;
}

interface AwakeningOrbPoolSlot {
  id: string | null;
  group: THREE.Group;
  crystal: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshStandardMaterial>;
  ringA: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  ringB: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  column: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  groundRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  haloSprite: THREE.Sprite;
  labelSprite: THREE.Sprite;
  labelCanvas: HTMLCanvasElement;
  labelTex: THREE.CanvasTexture;
  lastLabelText: string;
  particles: Array<{ mesh: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>; phase: number; radius: number; speed: number }>;
}

interface ZonePoolSlot {
  id: string | null;
  group: THREE.Group;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  disc: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  extraRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  decoyMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  tripwireMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
}

interface TelegraphPoolSlot {
  id: string | null;
  group: THREE.Group;
  circleBorder: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  circleFill: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  circleRune: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  lineBorder: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  lineFill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  coneBorder: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  coneFill: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
}

interface ChargingFireballSlot {
  id: string | null;
  group: THREE.Group;
  core: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  aura: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  halo: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
}

interface ProjPoolSlot {
  id: string | null;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  coreMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  tether: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
}

interface KamehamehaRig {
  group: THREE.Group;
  chargeCore: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  chargeAura: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  chargeRingA: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  chargeRingB: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  innerBeam: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  outerBeam: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  coilA: THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial>;
  coilB: THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial>;
  scorchStrip: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  trenchLeft: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  trenchRight: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  rings: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>[];
}

interface CraterSlabItem {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  vx: number;
  vy: number;
  vz: number;
  rotVx: number;
  rotVy: number;
  rotVz: number;
  floatTimer: number;
  floorY: number;
  life: number;
  maxLife: number;
}

interface DarkCraterCrackItem {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  life: number;
  maxLife: number;
}

interface SpikeCrownItem {
  group: THREE.Group;
  spikes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[];
  life: number;
  maxLife: number;
  baseScale: number;
}

interface ShockTorusItem {
  mesh: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  age: number;
  maxAge: number;
  startScale: number;
  maxRadius: number;
}

interface CrescentRibbonItem {
  group: THREE.Group;
  outer: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  inner: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  life: number;
  maxLife: number;
  spinSpeed: number;
  growSpeed: number;
}

interface VTrenchRidgeItem {
  group: THREE.Group;
  leftSlab: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  rightSlab: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  glowStrip: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  life: number;
  maxLife: number;
}

interface IceNovaRig {
  zoneId: string | null;
  group: THREE.Group;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  dome: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  pillars: Array<{
    mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    core: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    angle: number;
    dist: number;
    heightScale: number;
  }>;
}

interface KhenDomainRig {
  group: THREE.Group;
  outerRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  innerRune: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  floorDisc: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  clones: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[];
  slashes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[];
}

interface DamenArsenalRig {
  group: THREE.Group;
  guns: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[];
  flashes: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>[];
  tracers: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[];
}

interface MarjohnTyphoonRig {
  group: THREE.Group;
  outerFunnel: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  innerFunnel: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  ribbons: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[];
  groundRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
}

interface PrimeMeteorRig {
  group: THREE.Group;
  auraSphere: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  targetGroup: THREE.Group;
  targetRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  targetDisc: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  meteors: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[];
}

const _tmpV1 = new THREE.Vector3();
const _tmpV2 = new THREE.Vector3();
const _tmpDir = new THREE.Vector3();
const _upVec = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();

function createHelixTubeGeometry(turns: number, radius: number, length: number): THREE.TubeGeometry {
  const pts: THREE.Vector3[] = [];
  const segs = 48;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const ang = t * Math.PI * 2 * turns;
    pts.push(new THREE.Vector3(Math.cos(ang) * radius, Math.sin(ang) * radius, t * length));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, 52, 0.14, 6, false);
}

export class VFXManager {
  private scene: THREE.Scene;
  private atlas: VFXTextureAtlas;
  private shockwaves: ShockwaveItem[] = [];
  private slashes: SlashItem[] = [];
  private coreFlashes: CoreFlashItem[] = [];
  private funnels: FunnelItem[] = [];
  private tracers: TracerItem[] = [];
  private sparks: SparkItem[] = [];
  private puffs: PuffItem[] = [];
  private cracks: CrackItem[] = [];
  private casings: CasingItem[] = [];
  private vortexDebris: VortexDebrisItem[] = [];
  private ghosts: GhostItem[] = [];
  private beams: BeamItem[] = [];
  private pillars: PillarItem[] = [];
  private lightningSplines: LightningSplineItem[] = [];
  private stormClouds: StormCloudItem[] = [];
  private markGlyphs: GlyphItem[] = [];
  private spellSigils: SpellSigilItem[] = [];
  private tethers: TetherItem[] = [];
  private glowHalos: GlowHaloItem[] = [];
  private craterSlabs: CraterSlabItem[] = [];
  private darkCracks: DarkCraterCrackItem[] = [];
  private spikeCrowns: SpikeCrownItem[] = [];
  private shockTori: ShockTorusItem[] = [];
  private crescentRibbons: CrescentRibbonItem[] = [];
  private vTrenchRidges: VTrenchRidgeItem[] = [];
  private delayedTasks: DelayedTask[] = [];
  private elapsedTime = 0;

  private projPool: ProjPoolSlot[] = [];
  private chargingFireballPool: ChargingFireballSlot[] = [];
  private actorPositions = new Map<string, { x: number; y: number; z: number }>();
  private actorSkins = new Map<string, SkinId>();
  private pickupPool: PickupPoolSlot[] = [];
  private itemDropPool: ItemDropPoolSlot[] = [];
  private awakeningOrbPool: AwakeningOrbPoolSlot[] = [];
  private zonePool: ZonePoolSlot[] = [];
  private telegraphPool: TelegraphPoolSlot[] = [];

  private kamehamehaRigs: KamehamehaRig[] = [];
  private iceNovaRigs: IceNovaRig[] = [];
  private khenDomainRigs: KhenDomainRig[] = [];
  private damenArsenalRigs: DamenArsenalRig[] = [];
  private marjohnTyphoonRigs: MarjohnTyphoonRig[] = [];
  private primeMeteorRigs: PrimeMeteorRig[] = [];
  private fallingMeteors: FallingMeteorItem[] = [];
  private meteorCursor = 0;
  private shatteredIceZoneIds = new Set<string>();

  // Ascended Key 5 & Skin VFX Pre-allocated Pools
  private garbageDebrisPool: Array<{
    mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    kind: 'can' | 'paper' | 'leaf';
  }> = [];
  private turretTornadoPool: Array<{
    group: THREE.Group;
    outer: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    inner: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    baseRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  }> = [];
  private turretVolcanoPool: Array<{
    group: THREE.Group;
    cone: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    lava: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    baseRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  }> = [];
  private turretSolarGunPool: Array<{
    group: THREE.Group;
    gun: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    halo: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  }> = [];
  private abyssalClonePool: Array<{
    group: THREE.Group;
    torso: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    head: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    visor: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    leftArm: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    rightArm: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    auraRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
    hpCanvas: HTMLCanvasElement;
    hpTex: THREE.CanvasTexture;
    hpSprite: THREE.Sprite;
    lastHpKey: string;
  }> = [];
  private judgementSpearPool: Array<{
    group: THREE.Group;
    shaft: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;
    guard: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
    tip: THREE.Mesh<THREE.ConeGeometry, THREE.MeshStandardMaterial>;
    halo: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
    waveSegments: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[];
    lastPulseCount: number;
  }> = [];

  private qualityScale = 1;
  private isMobileDevice =
    typeof window !== 'undefined' && (window.innerWidth <= 900 || navigator.maxTouchPoints > 0);

  // Cutscene 3D Clash Beams & Collision Core
  private cutsceneClashGroup: THREE.Group;
  private cutsceneP1Beam: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private cutsceneP2Beam: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private cutsceneCore: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private cutsceneCoreRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  private clashSparkTimer = 0;

  // Aiming preview reticle (Terrain-Conforming Hold-Drag + Ground Skill Range Ring + Wall Impact X)
  private aimGroup: THREE.Group;
  private aimPointRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private aimPointInner: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private aimPointDisc: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private aimLineStrip: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private aimLineArrow: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  private aimLineOriginRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private aimConeWedge: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private aimRibbonSegments: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private aimArcDots: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  private aimWallCrossGroup: THREE.Group;
  private aimWallCrossA: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private aimWallCrossB: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private aimWallCrossRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private aimDropLine: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private aimRangeRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;

  // Domain Expansion 3D Barrier, Pre-allocated Cast Circle/Dome, Khen AI Clones & JM Web Lines
  private domainCastGroup: THREE.Group;
  private domainCastRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private domainCastDisc: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private domainCastSealRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private domainCastDome: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private domainGroup: THREE.Group;
  private domainDome: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private domainBarrierRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private domainFloorDisc: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private domainInnerRune: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private domainPillars: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  private domainGuns: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
  private khenClonePool: Array<{
    group: THREE.Group;
    torso: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    head: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    visor: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    leftArm: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    rightArm: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    auraRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  }> = [];
  private jmWebLinePool: Array<{
    group: THREE.Group;
    outer: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    core: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  }> = [];

  // KOTH Moving Hill Capture Beacon
  private kothGroup: THREE.Group;
  private kothOuterRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private kothInnerDisc: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private kothBeacon: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

  // Battlefield Event 3D zone visual + Falling Meteor target warning circles
  private eventGroup: THREE.Group;
  private eventOuterRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private eventInnerDisc: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private eventMeteorRings: Array<{
    group: THREE.Group;
    ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
    disc: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  }> = [];

  // Temple NPC Guardian overhead prompt & aura ring
  private templeNpcGroup: THREE.Group;
  private templeNpcRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private templeNpcSprite: THREE.Sprite;
  private npcTalkTex: THREE.CanvasTexture | null = null;
  private npcBossTex: THREE.CanvasTexture | null = null;
  private orbBadgeTexs: Partial<Record<'health' | 'mana' | 'strength', THREE.CanvasTexture>> = {};
  private itemBadgeTexs: Partial<Record<TacticalItemKind, THREE.CanvasTexture>> = {};

  // 2-Minute Shrinking Storm Barrier visual
  private stormGroup: THREE.Group;
  private stormWall: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private stormRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;

  private shockCursor = 0;
  private slashCursor = 0;
  private flashCursor = 0;
  private funnelCursor = 0;
  private tracerCursor = 0;
  private sparkCursor = 0;
  private puffCursor = 0;
  private crackCursor = 0;
  private casingCursor = 0;
  private debrisCursor = 0;
  private ghostCursor = 0;
  private beamCursor = 0;
  private pillarCursor = 0;
  private lightningCursor = 0;
  private cloudCursor = 0;
  private glyphCursor = 0;
  private sigilCursor = 0;
  private tetherCursor = 0;
  private lightCursor = 0;
  private slabCursor = 0;
  private darkCrackCursor = 0;
  private spikeCrownCursor = 0;
  private shockTorusCursor = 0;
  private crescentCursor = 0;
  private trenchCursor = 0;

  // Shared Geometries (disposed cleanly on dispose())
  private sharedGeos: THREE.BufferGeometry[] = [];
  private bulletGeo: THREE.BufferGeometry;
  private magnumGeo: THREE.BufferGeometry;
  private lassoGeo: THREE.TorusGeometry;
  private crescentGeo: THREE.BufferGeometry;
  private tornadoGeo: THREE.BufferGeometry;
  private tornadoRibbonGeo: THREE.BufferGeometry;
  private jmBeamGeo: THREE.BufferGeometry;
  private jmBoltGeo: THREE.BufferGeometry;
  private solarFireballGeo: THREE.BufferGeometry;
  private solarAuraGeo: THREE.BufferGeometry;
  private solarHaloGeo: THREE.TorusGeometry;
  private pickupOrbGeo: THREE.OctahedronGeometry;
  private pickupRingGeo: THREE.RingGeometry;
  private tetherGeo: THREE.BufferGeometry;
  private zoneRingGeo: THREE.RingGeometry;
  private zoneDiscGeo: THREE.CircleGeometry;
  private runeOctGeo: THREE.RingGeometry;
  private decoySilhouetteGeo: THREE.BufferGeometry;
  private tripwireBarGeo: THREE.BufferGeometry;
  private unitPlaneGeo: THREE.PlaneGeometry;
  private coneWedgeGeo: THREE.CircleGeometry;
  private orbCrystalGeo: THREE.OctahedronGeometry;
  private orbRingGeo: THREE.TorusGeometry;
  private orbColumnGeo: THREE.BufferGeometry;
  private orbParticleGeo: THREE.OctahedronGeometry;
  private solarRailgunGeo: THREE.BufferGeometry;
  private windBladeGeo: THREE.BufferGeometry;
  private magmaBoulderGeo: THREE.BufferGeometry;
  private orbLabelTex: THREE.CanvasTexture | null = null;
  private orbGlowTex: THREE.CanvasTexture | null = null;

  constructor(scene: THREE.Scene, qualityScale = 1) {
    this.scene = scene;
    this.qualityScale = Math.max(0.45, Math.min(1, qualityScale));
    if (this.qualityScale <= 0.78) {
      this.isMobileDevice = true;
    }
    this.atlas = createVFXTextureAtlas();

    const cloneParts = createShadowClonePartsGeo();

    this.bulletGeo = new THREE.IcosahedronGeometry(0.15, 2);
    this.magnumGeo = createTaperedConeShellGeometry(0.055, 0.14, 1.8, 12, 4, 0.16);
    this.magnumGeo.rotateX(Math.PI * 0.5);
    this.lassoGeo = new THREE.TorusGeometry(0.58, 0.065, 8, 28);
    this.crescentGeo = createTaperedCrescentGeometry(0.68, 1.24, Math.PI * 0.96, 36);
    this.tornadoGeo = createTwistedVortexGeometry(1.18, 0.18, 2.35, 36, 22, 2.3);
    this.tornadoGeo.translate(0, 1.15, 0);
    this.tornadoRibbonGeo = createSpiralWindRibbonsGeometry(2.2, 0.24, 1.38, 2.4, 3, 36);
    this.jmBeamGeo = createTaperedConeShellGeometry(0.28, 0.42, 2.5, 16, 4, 0.08);
    this.jmBeamGeo.rotateX(Math.PI * 0.5);
    this.jmBoltGeo = new THREE.IcosahedronGeometry(0.26, 2);
    this.solarFireballGeo = new THREE.IcosahedronGeometry(1.62, 2);
    this.solarAuraGeo = new THREE.IcosahedronGeometry(2.12, 2);
    this.solarHaloGeo = new THREE.TorusGeometry(2.45, 0.11, 8, 36);
    this.pickupOrbGeo = new THREE.OctahedronGeometry(0.32, 0);
    this.pickupRingGeo = new THREE.RingGeometry(0.42, 0.55, 24);
    this.tetherGeo = createTaperedConeShellGeometry(0.032, 0.044, 1.0, 10, 2, 0);
    this.tetherGeo.rotateX(Math.PI * 0.5);
    this.zoneRingGeo = new THREE.RingGeometry(0.955, 1.0, 56);
    this.zoneDiscGeo = new THREE.CircleGeometry(0.955, 56);
    this.runeOctGeo = new THREE.RingGeometry(0.72, 0.80, 8);
    this.decoySilhouetteGeo = cloneParts.cloakTorsoGeo;
    this.tripwireBarGeo = createTaperedConeShellGeometry(0.045, 0.045, 1.0, 10, 2, 0);
    this.tripwireBarGeo.rotateX(Math.PI * 0.5);
    this.unitPlaneGeo = new THREE.PlaneGeometry(1.0, 1.0);
    this.unitPlaneGeo.rotateX(-Math.PI * 0.5);
    this.unitPlaneGeo.translate(0, 0, 0.5);
    this.coneWedgeGeo = new THREE.CircleGeometry(1.0, 28, -0.38, 0.76);
    this.coneWedgeGeo.rotateX(-Math.PI * 0.5);
    this.coneWedgeGeo.rotateY(-Math.PI * 0.5);

    const ringGeo = new THREE.PlaneGeometry(2.15, 2.15);
    const slashGeo = createTaperedCrescentGeometry(0.88, 1.46, Math.PI * 0.95, 36);
    const flashGeo = new THREE.OctahedronGeometry(0.42, 0);
    const funnelGeo = createTwistedVortexGeometry(1.22, 0.18, 2.35, 34, 20, 2.4);
    funnelGeo.translate(0, 1.17, 0);
    const tracerGeo = createTaperedConeShellGeometry(0.036, 0.052, 1.0, 10, 2, 0);
    tracerGeo.rotateX(Math.PI * 0.5);
    const sparkGeo = new THREE.ConeGeometry(0.055, 0.68, 6);
    sparkGeo.translate(0, 0.34, 0);
    const crackGeo = new THREE.PlaneGeometry(2.35, 2.35);
    crackGeo.rotateX(-Math.PI * 0.5);
    const casingGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.11, 8);
    const debrisGeo = createFacetedRockGeometry(0.15, 7);
    const ghostGeo = cloneParts.cloakTorsoGeo;
    const beamGeo = createTaperedConeShellGeometry(0.36, 0.48, 16.0, 22, 6, 0.05);
    beamGeo.rotateX(Math.PI * 0.5);
    beamGeo.translate(0, 0, 8.0);
    const coilGeoA = createHelixTubeGeometry(3.2, 0.85, 16.0);
    const coilGeoB = createHelixTubeGeometry(3.2, 0.85, 16.0);
    coilGeoB.rotateZ(Math.PI);
    const pillarGeo = createTaperedConeShellGeometry(0.4, 0.86, 8.5, 20, 6, 0.08);
    pillarGeo.translate(0, 4.25, 0);
    const glyphRingGeo = new THREE.RingGeometry(0.42, 0.54, 4);
    const aimArrowGeo = new THREE.ConeGeometry(0.75, 1.3, 4);
    aimArrowGeo.rotateX(Math.PI * 0.5);
    const glowHaloGeo = new THREE.IcosahedronGeometry(1.05, 2);

    this.orbCrystalGeo = new THREE.OctahedronGeometry(0.68, 0);
    this.orbRingGeo = new THREE.TorusGeometry(1.18, 0.055, 8, 32);
    this.orbColumnGeo = createTaperedConeShellGeometry(0.62, 1.06, 14.0, 20, 6, 0.06);
    this.orbColumnGeo.translate(0, 7.0, 0);
    this.orbParticleGeo = new THREE.OctahedronGeometry(0.11, 0);
    this.solarRailgunGeo = createTaperedConeShellGeometry(0.14, 0.24, 5.2, 14, 4, 0.08);
    this.solarRailgunGeo.rotateX(Math.PI * 0.5);
    this.windBladeGeo = createTaperedCrescentGeometry(1.02, 1.66, Math.PI * 0.92, 36);
    this.magmaBoulderGeo = createFacetedRockGeometry(0.72, 13);

    if (typeof document !== 'undefined') {
      const lblCanvas = document.createElement('canvas');
      lblCanvas.width = 512;
      lblCanvas.height = 128;
      const ctx = lblCanvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 512, 128);
        ctx.font = '900 58px "Bangers", "Impact", "Arial Black", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(56, 189, 248, 0.95)';
        ctx.shadowBlur = 18;
        ctx.strokeStyle = '#09090b';
        ctx.lineWidth = 10;
        ctx.strokeText('AWAKENING', 256, 66);
        const grad = ctx.createLinearGradient(0, 26, 0, 102);
        grad.addColorStop(0, '#fef08a');
        grad.addColorStop(0.5, '#ffffff');
        grad.addColorStop(1, '#38bdf8');
        ctx.fillStyle = grad;
        ctx.fillText('AWAKENING', 256, 66);
      }
      this.orbLabelTex = new THREE.CanvasTexture(lblCanvas);
      this.orbLabelTex.needsUpdate = true;

      const glowCanvas = document.createElement('canvas');
      glowCanvas.width = 128;
      glowCanvas.height = 128;
      const gCtx = glowCanvas.getContext('2d');
      if (gCtx) {
        const rad = gCtx.createRadialGradient(64, 64, 4, 64, 64, 62);
        rad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        rad.addColorStop(0.32, 'rgba(250, 204, 21, 0.65)');
        rad.addColorStop(0.68, 'rgba(56, 189, 248, 0.25)');
        rad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        gCtx.fillStyle = rad;
        gCtx.fillRect(0, 0, 128, 128);
      }
      this.orbGlowTex = new THREE.CanvasTexture(glowCanvas);
      this.orbGlowTex.needsUpdate = true;

      const makeBadgeTex = (text: string, bg: string, border: string, textColor = '#ffffff') => {
        const c = document.createElement('canvas');
        c.width = 384;
        c.height = 84;
        const bctx = c.getContext('2d');
        if (bctx) {
          bctx.clearRect(0, 0, 384, 84);
          bctx.fillStyle = bg;
          bctx.strokeStyle = border;
          bctx.lineWidth = 4;
          bctx.beginPath();
          bctx.roundRect(8, 8, 368, 68, 16);
          bctx.fill();
          bctx.stroke();
          bctx.font = '900 30px "Impact", "Arial Black", sans-serif';
          bctx.textAlign = 'center';
          bctx.textBaseline = 'middle';
          bctx.strokeStyle = '#09090b';
          bctx.lineWidth = 6;
          bctx.strokeText(text, 192, 43, 336);
          bctx.fillStyle = textColor;
          bctx.fillText(text, 192, 43, 336);
        }
        const tex = new THREE.CanvasTexture(c);
        tex.needsUpdate = true;
        return tex;
      };

      this.orbBadgeTexs.health = makeBadgeTex('+HP ORB', 'rgba(6, 78, 59, 0.92)', '#34d399', '#ecfdf5');
      this.orbBadgeTexs.mana = makeBadgeTex('+CHI ORB', 'rgba(8, 51, 68, 0.92)', '#22d3ee', '#ecfeff');
      this.orbBadgeTexs.strength = makeBadgeTex('+STR +20%', 'rgba(127, 29, 29, 0.94)', '#facc15', '#fef08a');
      this.npcTalkTex = makeBadgeTex('? · TALK [APPROACH]', 'rgba(15, 23, 42, 0.96)', '#facc15', '#fef08a');
      this.npcBossTex = makeBadgeTex('DUEL BOSS · 200 HP', 'rgba(127, 29, 29, 0.95)', '#f43f5e', '#fef08a');

      for (const spec of TACTICAL_ITEMS) {
        const label =
          spec.kind === 'shock_grenade'
            ? 'SHOCK [E]'
            : spec.kind === 'cryo_capsule'
            ? 'CRYO [E]'
            : spec.kind === 'gravity_vortex'
            ? 'VORTEX [E]'
            : spec.kind === 'crimson_elixir'
            ? '+12% DMG'
            : spec.kind === 'gale_boots'
            ? '+SPD/+DASH'
            : '+20% MAX HP';
        this.itemBadgeTexs[spec.kind] = makeBadgeTex(label, 'rgba(15, 23, 42, 0.94)', spec.color, '#ffffff');
      }
    }

    // Cutscene 3D Clash group (shown during 0:15 - 0:18 tug-of-war clash)
    this.cutsceneClashGroup = new THREE.Group();
    this.cutsceneClashGroup.visible = false;
    const clashBeamGeo = createTaperedConeShellGeometry(0.36, 0.56, 1.0, 18, 4, 0.08);
    clashBeamGeo.rotateZ(Math.PI * 0.5);
    this.cutsceneP1Beam = new THREE.Mesh(
      clashBeamGeo,
      new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        map: this.atlas.scrollingEnergyTex ?? null,
        transparent: false,
        opacity: 1.0,
        side: THREE.FrontSide,
        blending: THREE.NormalBlending,
        depthWrite: true,
      })
    );
    this.cutsceneP2Beam = new THREE.Mesh(
      clashBeamGeo,
      new THREE.MeshBasicMaterial({
        color: 0xdc2626,
        map: this.atlas.scrollingEnergyTex ?? null,
        transparent: false,
        opacity: 1.0,
        side: THREE.FrontSide,
        blending: THREE.NormalBlending,
        depthWrite: true,
      })
    );
    const clashCoreGeo = new THREE.IcosahedronGeometry(0.72, 2);
    this.cutsceneCore = new THREE.Mesh(
      clashCoreGeo,
      new THREE.MeshBasicMaterial({
        color: 0xfef9c3,
        map: this.atlas.coreGlowTex ?? null,
        transparent: false,
        opacity: 1.0,
        blending: THREE.NormalBlending,
        depthWrite: true,
      })
    );
    const clashRingGeo = new THREE.TorusGeometry(1.5, 0.14, 8, 32);
    this.cutsceneCoreRing = new THREE.Mesh(
      clashRingGeo,
      new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: false,
        opacity: 1.0,
        blending: THREE.NormalBlending,
        depthWrite: true,
      })
    );
    this.cutsceneClashGroup.add(this.cutsceneP1Beam, this.cutsceneP2Beam, this.cutsceneCore, this.cutsceneCoreRing);
    scene.add(this.cutsceneClashGroup);

    const innerSlashGeo = createTaperedCrescentGeometry(1.06, 1.24, Math.PI * 0.87, 36, 0.04);
    const kameCoreGeo = createTaperedConeShellGeometry(0.42, 0.42, AWAKENING_CONFIG.JM_KAMEHAMEHA_RANGE, 18, 6, 0.03);
    kameCoreGeo.rotateX(Math.PI * 0.5);
    kameCoreGeo.translate(0, 0, AWAKENING_CONFIG.JM_KAMEHAMEHA_RANGE * 0.5 + 0.85);
    const kameOuterGeo = createTaperedConeShellGeometry(1.74, 1.48, AWAKENING_CONFIG.JM_KAMEHAMEHA_RANGE, 24, 8, 0.06);
    kameOuterGeo.rotateX(Math.PI * 0.5);
    kameOuterGeo.translate(0, 0, AWAKENING_CONFIG.JM_KAMEHAMEHA_RANGE * 0.5 + 0.85);
    const kameRingGeo = new THREE.TorusGeometry(2.05, 0.13, 8, 32);
    const kameSphereGeo = new THREE.IcosahedronGeometry(0.65, 2);
    const icePillarGeo = createFacetedCrystalSpireGeometry(0.58, 5.2, 7, 19);
    const iceDomeGeo = createTaperedConeShellGeometry(0.18, 1.0, 0.92, 24, 6, 0.38);
    iceDomeGeo.translate(0, 0.46, 0);
    const gunBoxGeo = createSculptedFirearmGeometry();
    const meteorConeGeo = createTwistedVortexGeometry(0.96, 0.14, 2.35, 24, 12, 1.8);
    meteorConeGeo.rotateX(Math.PI);

    this.sharedGeos.push(
      cloneParts.hoodedHeadGeo,
      cloneParts.bladeArmGeo,
      cloneParts.visorCrescentGeo,
      this.bulletGeo,
      this.magnumGeo,
      this.lassoGeo,
      this.crescentGeo,
      this.tornadoGeo,
      this.tornadoRibbonGeo,
      this.jmBeamGeo,
      this.jmBoltGeo,
      this.solarFireballGeo,
      this.solarAuraGeo,
      this.solarHaloGeo,
      this.pickupOrbGeo,
      this.pickupRingGeo,
      this.tetherGeo,
      this.zoneRingGeo,
      this.zoneDiscGeo,
      this.runeOctGeo,
      this.decoySilhouetteGeo,
      this.tripwireBarGeo,
      this.unitPlaneGeo,
      this.coneWedgeGeo,
      this.orbCrystalGeo,
      this.orbRingGeo,
      this.orbColumnGeo,
      this.orbParticleGeo,
      this.solarRailgunGeo,
      this.windBladeGeo,
      this.magmaBoulderGeo,
      clashBeamGeo,
      clashCoreGeo,
      clashRingGeo,
      ringGeo,
      slashGeo,
      innerSlashGeo,
      flashGeo,
      funnelGeo,
      tracerGeo,
      sparkGeo,
      crackGeo,
      casingGeo,
      debrisGeo,
      beamGeo,
      coilGeoA,
      coilGeoB,
      pillarGeo,
      glyphRingGeo,
      aimArrowGeo,
      glowHaloGeo,
      kameCoreGeo,
      kameOuterGeo,
      kameRingGeo,
      kameSphereGeo,
      icePillarGeo,
      iceDomeGeo,
      gunBoxGeo,
      meteorConeGeo
    );

    // Reference-video CFX pre-allocated shared geometries & pools
    const slabRockGeo = createFacetedRockGeometry(0.42, 11);
    const darkCrackGeo = new THREE.PlaneGeometry(2.6, 2.6);
    darkCrackGeo.rotateX(-Math.PI * 0.5);
    const spikeConeGeo = createFacetedCrystalSpireGeometry(0.34, 3.6, 6, 31);
    const shockTorusGeo = new THREE.TorusGeometry(1.0, 0.042, 10, 36);
    shockTorusGeo.rotateX(Math.PI * 0.5);
    const crescentOuterGeo = createTaperedCrescentGeometry(0.84, 1.38, Math.PI * 1.12, 36, 0.21);
    const crescentInnerGeo = createTaperedCrescentGeometry(0.94, 1.22, Math.PI * 0.94, 36, 0.22);
    const trenchSlabGeo = createFacetedRidgeGeometry(0.58, 0.46, 3.2, 6);
    const kameCoilGeoA = createHelixTubeGeometry(4.5, 1.95, AWAKENING_CONFIG.JM_KAMEHAMEHA_RANGE);
    kameCoilGeoA.translate(0, 0, 0.85);
    const kameCoilGeoB = createHelixTubeGeometry(4.5, 1.95, AWAKENING_CONFIG.JM_KAMEHAMEHA_RANGE);
    kameCoilGeoB.rotateZ(Math.PI);
    kameCoilGeoB.translate(0, 0, 0.85);
    const kameTrenchRailGeo = createFacetedRidgeGeometry(0.68, 0.54, AWAKENING_CONFIG.JM_KAMEHAMEHA_RANGE, 16);
    this.sharedGeos.push(
      slabRockGeo,
      darkCrackGeo,
      spikeConeGeo,
      shockTorusGeo,
      crescentOuterGeo,
      crescentInnerGeo,
      trenchSlabGeo,
      kameCoilGeoA,
      kameCoilGeoB,
      kameTrenchRailGeo
    );

    for (let i = 0; i < 42; i++) {
      const mesh = new THREE.Mesh(
        slabRockGeo,
        new THREE.MeshStandardMaterial({
          color: i % 3 === 0 ? 0x0f172a : 0x1e293b,
          roughness: 0.86,
          metalness: 0.16,
          transparent: false,
          opacity: 1.0,
        })
      );
      mesh.visible = false;
      scene.add(mesh);
      this.craterSlabs.push({
        mesh,
        vx: 0,
        vy: 0,
        vz: 0,
        rotVx: 0,
        rotVy: 0,
        rotVz: 0,
        floatTimer: 0,
        floorY: 0,
        life: 0,
        maxLife: 1.15,
      });
    }

    for (let i = 0; i < 32; i++) {
      const mesh = new THREE.Mesh(
        darkCrackGeo,
        new THREE.MeshBasicMaterial({
          color: 0x1c1917,
          map: this.atlas.spiderwebCraterTex ?? null,
          transparent: false,
          alphaTest: 0.35,
          opacity: 1.0,
          side: THREE.DoubleSide,
          depthWrite: true,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        })
      );
      mesh.visible = false;
      scene.add(mesh);
      this.darkCracks.push({ mesh, life: 0, maxLife: 1.2 });
    }

    for (let i = 0; i < 6; i++) {
      const group = new THREE.Group();
      const spikes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
      for (let s = 0; s < 10; s++) {
        const ang = (s / 10) * Math.PI * 2;
        const sp = new THREE.Mesh(
          spikeConeGeo,
          new THREE.MeshBasicMaterial({
            color: s % 2 === 0 ? 0xfef08a : 0x06b6d4,
            map: this.atlas.scrollingEnergyTex ?? null,
            transparent: false,
            opacity: 1.0,
            side: THREE.DoubleSide,
            blending: THREE.NormalBlending,
            depthWrite: true,
          })
        );
        sp.position.set(Math.cos(ang) * 1.15, 0.25, Math.sin(ang) * 1.15);
        sp.rotation.y = -ang;
        sp.rotation.z = -0.56;
        group.add(sp);
        spikes.push(sp);
      }
      group.visible = false;
      scene.add(group);
      this.spikeCrowns.push({ group, spikes, life: 0, maxLife: 0.48, baseScale: 1.0 });
    }

    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(
        shockTorusGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: false,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      mesh.visible = false;
      scene.add(mesh);
      this.shockTori.push({ mesh, age: 0, maxAge: 0.42, startScale: 0.45, maxRadius: 4.6 });
    }

    for (let i = 0; i < 18; i++) {
      const group = new THREE.Group();
      const outer = new THREE.Mesh(
        crescentOuterGeo,
        new THREE.MeshBasicMaterial({
          color: 0x06b6d4,
          map: this.atlas.taperedSlashTex ?? null,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      const inner = new THREE.Mesh(
        crescentInnerGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfef9c3,
          map: this.atlas.taperedSlashTex ?? null,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      group.add(outer, inner);
      group.visible = false;
      scene.add(group);
      this.crescentRibbons.push({
        group,
        outer,
        inner,
        life: 0,
        maxLife: 0.28,
        spinSpeed: 18,
        growSpeed: 1.6,
      });
    }

    for (let i = 0; i < 24; i++) {
      const group = new THREE.Group();
      const leftSlab = new THREE.Mesh(
        trenchSlabGeo,
        new THREE.MeshStandardMaterial({
          color: 0x1c1917,
          roughness: 0.88,
          metalness: 0.14,
          transparent: false,
          opacity: 1.0,
          depthWrite: true,
        })
      );
      leftSlab.position.set(-1.35, 0.24, 0);
      leftSlab.rotation.z = 0.56;
      const rightSlab = new THREE.Mesh(
        trenchSlabGeo,
        new THREE.MeshStandardMaterial({
          color: 0x0f172a,
          roughness: 0.88,
          metalness: 0.14,
          transparent: false,
          opacity: 1.0,
          depthWrite: true,
        })
      );
      rightSlab.position.set(1.35, 0.24, 0);
      rightSlab.rotation.z = -0.56;
      const glowStrip = new THREE.Mesh(
        this.unitPlaneGeo,
        new THREE.MeshBasicMaterial({
          color: 0x06b6d4,
          map: this.atlas.scrollingEnergyTex ?? null,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      glowStrip.scale.set(2.1, 1, 3.2);
      glowStrip.position.set(0, 0.27, -1.6);
      group.add(leftSlab, rightSlab, glowStrip);
      group.visible = false;
      scene.add(group);
      this.vTrenchRidges.push({
        group,
        leftSlab,
        rightSlab,
        glowStrip,
        life: 0,
        maxLife: 1.0,
      });
    }

    for (let i = 0; i < 16; i++) {
      const mesh = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          map: this.atlas.shockRingTex ?? null,
          transparent: false,
          alphaTest: 0.38,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      mesh.rotation.x = -Math.PI * 0.5;
      mesh.visible = false;
      scene.add(mesh);
      this.shockwaves.push({ mesh, age: 0, maxAge: 0.5, startScale: 0.5, maxRadius: 5 });
    }

    for (let i = 0; i < 18; i++) {
      const mesh = new THREE.Mesh(
        slashGeo,
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          map: this.atlas.taperedSlashTex ?? null,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      const inner = new THREE.Mesh(
        innerSlashGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfef9c3,
          map: this.atlas.taperedSlashTex ?? null,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      mesh.add(inner);
      mesh.visible = false;
      scene.add(mesh);
      this.slashes.push({ mesh, life: 0, maxLife: 0.24, spinSpeed: 0, growSpeed: 0.8 });
    }

    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(
        flashGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfef9c3,
          transparent: false,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      mesh.visible = false;
      scene.add(mesh);
      this.coreFlashes.push({ mesh, life: 0, maxLife: 0.14, peakScale: 1.5 });
    }

    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(
        funnelGeo,
        new THREE.MeshBasicMaterial({
          color: 0x2dd4bf,
          map: this.atlas.scrollingWindTex ?? null,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      mesh.visible = false;
      scene.add(mesh);
      this.funnels.push({
        mesh,
        life: 0,
        maxLife: 0.5,
        spinSpeed: 14,
        startScaleX: 0.8,
        endScaleX: 2.2,
        scaleY: 1.4,
        baseY: 0,
      });
    }

    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(
        tracerGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          map: this.atlas.taperedSlashTex ?? null,
          transparent: false,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      mesh.visible = false;
      scene.add(mesh);
      this.tracers.push({ mesh, life: 0, maxLife: 0.2, startScaleX: 1.0 });
    }

    for (let i = 0; i < 26; i++) {
      const mesh = new THREE.Mesh(
        sparkGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: false,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      mesh.visible = false;
      scene.add(mesh);
      this.sparks.push({
        mesh,
        vx: 0,
        vy: 0,
        vz: 0,
        gravity: 14,
        life: 0,
        maxLife: 0.32,
        orientToVel: true,
      });
    }

    for (let i = 0; i < 20; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          color: 0x1c1917,
          map: this.atlas.smokePuffTex ?? null,
          transparent: false,
          alphaTest: 0.38,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      sprite.visible = false;
      scene.add(sprite);
      this.puffs.push({
        sprite,
        vx: 0,
        vy: 0,
        vz: 0,
        rotSpeed: 0,
        life: 0,
        maxLife: 0.55,
        startScale: 0.5,
        endScale: 1.6,
        baseOpacity: 1.0,
      });
    }

    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(
        crackGeo,
        new THREE.MeshBasicMaterial({
          color: 0xf97316,
          map: this.atlas.spiderwebCraterTex ?? null,
          transparent: false,
          alphaTest: 0.36,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        })
      );
      mesh.visible = false;
      scene.add(mesh);
      this.cracks.push({ mesh, life: 0, maxLife: 0.85 });
    }

    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      metalness: 0.9,
      roughness: 0.22,
      transparent: false,
      opacity: 1.0,
    });
    for (let i = 0; i < 10; i++) {
      const mesh = new THREE.Mesh(casingGeo, brassMat.clone());
      mesh.visible = false;
      scene.add(mesh);
      this.casings.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0.65, floorY: 0 });
    }
    brassMat.dispose();

    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(
        debrisGeo,
        new THREE.MeshStandardMaterial({
          color: 0x2dd4bf,
          roughness: 0.72,
          metalness: 0.15,
          transparent: false,
          opacity: 1.0,
        }) as unknown as THREE.MeshBasicMaterial
      );
      mesh.visible = false;
      scene.add(mesh);
      this.vortexDebris.push({
        mesh,
        centerX: 0,
        centerY: 0,
        centerZ: 0,
        angle: 0,
        radius: 3,
        inwardSpeed: 5,
        angularSpeed: 9,
        heightOffset: 0.5,
        life: 0,
        maxLife: 0.45,
      });
    }

    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(
        ghostGeo,
        new THREE.MeshBasicMaterial({
          color: 0x2dd4bf,
          map: this.atlas.scrollingEnergyTex ?? null,
          transparent: false,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      mesh.visible = false;
      scene.add(mesh);
      this.ghosts.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0.3, baseOpacity: 1.0 });
    }

    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(
        beamGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfef9c3,
          map: this.atlas.scrollingEnergyTex ?? null,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      const coilA = new THREE.Mesh(
        coilGeoA,
        new THREE.MeshBasicMaterial({
          color: 0xfacc15,
          transparent: false,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      const coilB = new THREE.Mesh(
        coilGeoB,
        new THREE.MeshBasicMaterial({
          color: 0x06b6d4,
          transparent: false,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      mesh.add(coilA, coilB);
      mesh.visible = false;
      scene.add(mesh);
      this.beams.push({ mesh, coilA, coilB, life: 0, maxLife: 0.65 });
    }

    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(
        pillarGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfacc15,
          map: this.atlas.scrollingTurbulenceTex ?? null,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      mesh.visible = false;
      scene.add(mesh);
      this.pillars.push({ mesh, life: 0, maxLife: 0.55, baseScale: 1.0 });
    }

    for (let i = 0; i < 16; i++) {
      const lGeo = buildLightningRibbonGeometry(16);
      const mesh = new THREE.Mesh(
        lGeo,
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          map: this.atlas.taperedSlashTex ?? null,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      mesh.frustumCulled = false;
      mesh.visible = false;
      scene.add(mesh);
      this.lightningSplines.push({ mesh, life: 0, maxLife: 0.24, peakOpacity: 1.0 });
    }

    for (let i = 0; i < 3; i++) {
      const group = new THREE.Group();
      for (let c = 0; c < 6; c++) {
        const ang = (c / 6) * Math.PI * 2;
        const puff = new THREE.Sprite(
          new THREE.SpriteMaterial({
            color: 0x1e293b,
            map: this.atlas.smokePuffTex ?? null,
            transparent: false,
            alphaTest: 0.36,
            opacity: 1.0,
            blending: THREE.NormalBlending,
            depthWrite: true,
          })
        );
        puff.position.set(Math.cos(ang) * 4.5, (c % 2) * 1.1, Math.sin(ang) * 4.5);
        puff.scale.set(6.2, 3.4, 1);
        group.add(puff);
      }
      group.visible = false;
      scene.add(group);
      this.stormClouds.push({ group, life: 0, maxLife: 1.6 });
    }

    for (let i = 0; i < 4; i++) {
      const group = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({
        color: 0xc084fc,
        transparent: false,
        opacity: 1.0,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: true,
      });
      const r1 = new THREE.Mesh(glyphRingGeo, mat);
      const r2 = new THREE.Mesh(glyphRingGeo, mat.clone());
      r2.rotation.z = Math.PI * 0.25;
      r2.scale.setScalar(0.68);
      group.add(r1, r2);
      group.visible = false;
      scene.add(group);
      this.markGlyphs.push({ group, life: 0, maxLife: 0.85 });
    }

    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(
        this.tetherGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfacc15,
          map: this.atlas.taperedSlashTex ?? null,
          transparent: false,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      mesh.visible = false;
      scene.add(mesh);
      this.tethers.push({ mesh, life: 0, maxLife: 0.35 });
    }

    for (let i = 0; i < 6; i++) {
      const group = new THREE.Group();
      const mat1 = new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: false,
        opacity: 1.0,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: true,
      });
      const outer = new THREE.Mesh(this.runeOctGeo, mat1);
      outer.rotation.x = -Math.PI * 0.5;
      const inner = new THREE.Mesh(glyphRingGeo, mat1.clone());
      inner.rotation.x = -Math.PI * 0.5;
      inner.scale.setScalar(0.92);
      group.add(outer, inner);
      group.visible = false;
      scene.add(group);
      this.spellSigils.push({ group, life: 0, maxLife: 0.55, baseScale: 2.2 });
    }

    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(
        glowHaloGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfacc15,
          map: this.atlas.coreGlowTex ?? null,
          transparent: false,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      mesh.visible = false;
      scene.add(mesh);
      this.glowHalos.push({ mesh, life: 0, maxLife: 0.25, baseScale: 1.5, peakOpacity: 1.0 });
    }

    this.eventGroup = new THREE.Group();
    this.eventOuterRing = new THREE.Mesh(
      new THREE.RingGeometry(0.88, 1.0, 48),
      new THREE.MeshBasicMaterial({
        color: 0xf43f5e,
        transparent: false,
        opacity: 1.0,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: true,
      })
    );
    this.eventOuterRing.rotation.x = -Math.PI * 0.5;
    this.eventInnerDisc = new THREE.Mesh(
      new THREE.CircleGeometry(0.88, 48),
      new THREE.MeshBasicMaterial({
        color: 0x7f1d1d,
        map: this.atlas.spiderwebCraterTex ?? null,
        transparent: false,
        alphaTest: 0.36,
        opacity: 1.0,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: true,
      })
    );
    this.eventInnerDisc.rotation.x = -Math.PI * 0.5;
    this.eventGroup.add(this.eventOuterRing, this.eventInnerDisc);
    this.eventGroup.visible = false;
    scene.add(this.eventGroup);

    // 2-Minute Shrinking Storm Barrier Wall & Perimeter Ring (solid opaque perimeter)
    this.stormGroup = new THREE.Group();
    this.stormWall = new THREE.Mesh(
      createTaperedConeShellGeometry(1, 1, 4.4, 56, 4, 0.02),
      new THREE.MeshBasicMaterial({
        color: 0xe11d48,
        map: this.atlas.scrollingTurbulenceTex ?? null,
        transparent: false,
        opacity: 1.0,
        side: THREE.BackSide,
        blending: THREE.NormalBlending,
        depthWrite: true,
      })
    );
    this.stormWall.position.y = 2.2;
    this.stormRing = new THREE.Mesh(
      new THREE.RingGeometry(0.94, 1.0, 64),
      new THREE.MeshBasicMaterial({
        color: 0xfb7185,
        transparent: false,
        opacity: 1.0,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: true,
      })
    );
    this.stormRing.rotation.x = -Math.PI * 0.5;
    this.stormRing.position.y = 0.28;
    this.stormGroup.add(this.stormWall, this.stormRing);
    this.stormGroup.visible = false;
    scene.add(this.stormGroup);

    // Pre-allocate dynamic gameplay object pools (ZERO runtime geometry/material alloc or dispose)
    for (let i = 0; i < 16; i++) {
      const group = new THREE.Group();
      const ring = new THREE.Mesh(
        this.zoneRingGeo,
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      ring.rotation.x = -Math.PI * 0.5;
      const disc = new THREE.Mesh(
        this.zoneDiscGeo,
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          map: this.atlas.scrollingTurbulenceTex ?? null,
          transparent: false,
          alphaTest: 0.36,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      disc.rotation.x = -Math.PI * 0.5;
      const extraRing = new THREE.Mesh(
        this.zoneRingGeo,
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      extraRing.rotation.x = -Math.PI * 0.5;
      const decoyMesh = new THREE.Mesh(
        this.decoySilhouetteGeo,
        new THREE.MeshBasicMaterial({
          color: 0x1e1b4b,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      const tripwireMesh = new THREE.Mesh(
        this.tripwireBarGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfacc15,
          map: this.atlas.scrollingEnergyTex ?? null,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      group.add(ring, disc, extraRing, decoyMesh, tripwireMesh);
      group.visible = false;
      scene.add(group);
      this.zonePool.push({ id: null, group, ring, disc, extraRing, decoyMesh, tripwireMesh });
    }

    for (let i = 0; i < 12; i++) {
      const group = new THREE.Group();
      const mkMat = (color: number, isFill = false) =>
        new THREE.MeshBasicMaterial({
          color,
          map: isFill ? (this.atlas.spiderwebCraterTex ?? null) : null,
          transparent: false,
          alphaTest: isFill ? 0.38 : 0,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        });
      const circleBorder = new THREE.Mesh(this.zoneRingGeo, mkMat(0xf43f5e));
      circleBorder.rotation.x = -Math.PI * 0.5;
      const circleFill = new THREE.Mesh(this.zoneDiscGeo, mkMat(0xf43f5e, true));
      circleFill.rotation.x = -Math.PI * 0.5;
      const circleRune = new THREE.Mesh(this.runeOctGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: false,
        opacity: 1.0,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: true,
      }));
      circleRune.rotation.x = -Math.PI * 0.5;
      const lineBorder = new THREE.Mesh(this.unitPlaneGeo, mkMat(0xf43f5e, true));
      const lineFill = new THREE.Mesh(this.unitPlaneGeo, mkMat(0xf43f5e));
      const coneBorder = new THREE.Mesh(this.coneWedgeGeo, mkMat(0xf43f5e, true));
      const coneFill = new THREE.Mesh(this.coneWedgeGeo, mkMat(0xf43f5e));
      group.add(circleBorder, circleFill, circleRune, lineBorder, lineFill, coneBorder, coneFill);
      group.visible = false;
      scene.add(group);
      this.telegraphPool.push({
        id: null,
        group,
        circleBorder,
        circleFill,
        circleRune,
        lineBorder,
        lineFill,
        coneBorder,
        coneFill,
      });
    }

    for (let i = 0; i < 4; i++) {
      const group = new THREE.Group();
      const core = new THREE.Mesh(
        this.solarFireballGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfef9c3,
          map: this.atlas.coreGlowTex ?? null,
          transparent: false,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      const aura = new THREE.Mesh(
        this.solarAuraGeo,
        new THREE.MeshBasicMaterial({
          color: 0xea580c,
          map: this.atlas.scrollingMagmaTex ?? null,
          transparent: false,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      const halo = new THREE.Mesh(
        this.solarHaloGeo,
        new THREE.MeshBasicMaterial({
          color: 0xf59e0b,
          transparent: false,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      group.add(core, aura, halo);
      group.visible = false;
      scene.add(group);
      this.chargingFireballPool.push({ id: null, group, core, aura, halo });
    }

    const pickupBeaconGeo = createTaperedConeShellGeometry(0.16, 0.44, 8.6, 16, 4, 0.06);
    pickupBeaconGeo.translate(0, 4.0, 0);
    const pickupMoteGeo = new THREE.OctahedronGeometry(0.13, 0);
    const itemDropCoreGeo = new THREE.OctahedronGeometry(0.42, 1);
    const meteorFistGeo = createFacetedRockGeometry(1.15, 23);
    const meteorAuraGeo = new THREE.IcosahedronGeometry(1.58, 2);
    this.sharedGeos.push(pickupBeaconGeo, pickupMoteGeo, itemDropCoreGeo, meteorFistGeo, meteorAuraGeo);

    for (let i = 0; i < 12; i++) {
      const group = new THREE.Group();
      const orb = new THREE.Mesh(
        this.pickupOrbGeo,
        new THREE.MeshStandardMaterial({
          color: 0x10b981,
          emissive: 0x10b981,
          emissiveIntensity: 1.15,
          roughness: 0.16,
          metalness: 0.4,
          transparent: false,
          opacity: 1.0,
        })
      );
      const ring = new THREE.Mesh(
        this.pickupRingGeo,
        new THREE.MeshBasicMaterial({
          color: 0x10b981,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      ring.rotation.x = -Math.PI * 0.5;
      ring.position.y = -0.34;
      const runeRing = new THREE.Mesh(
        this.runeOctGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      runeRing.rotation.x = -Math.PI * 0.5;
      runeRing.position.y = -0.31;
      runeRing.scale.setScalar(1.18);
      const beacon = new THREE.Mesh(
        pickupBeaconGeo,
        new THREE.MeshBasicMaterial({
          color: 0x10b981,
          map: this.atlas.scrollingEnergyTex ?? null,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      const moteA = new THREE.Mesh(
        pickupMoteGeo,
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: false,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      const moteB = new THREE.Mesh(
        pickupMoteGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: false,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      const badgeSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.orbBadgeTexs.health ?? null,
          transparent: false,
          alphaTest: 0.45,
          opacity: 1.0,
          depthWrite: false,
          depthTest: false,
        })
      );
      badgeSprite.position.set(0, 1.35, 0);
      badgeSprite.scale.set(2.4, 0.54, 1);
      group.add(orb, ring, runeRing, beacon, moteA, moteB, badgeSprite);
      group.visible = false;
      scene.add(group);
      this.pickupPool.push({ id: null, group, orb, ring, runeRing, beacon, moteA, moteB, badgeSprite });
    }

    for (let i = 0; i < 8; i++) {
      const group = new THREE.Group();
      const crate = new THREE.Mesh(
        itemDropCoreGeo,
        new THREE.MeshStandardMaterial({
          color: 0xf97316,
          emissive: 0xf97316,
          emissiveIntensity: 0.95,
          roughness: 0.2,
          metalness: 0.5,
          transparent: false,
          opacity: 1.0,
        })
      );
      const ring = new THREE.Mesh(
        this.pickupRingGeo,
        new THREE.MeshBasicMaterial({
          color: 0xf97316,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      ring.rotation.x = -Math.PI * 0.5;
      ring.position.y = -0.35;
      const runeRing = new THREE.Mesh(
        this.runeOctGeo,
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      runeRing.rotation.x = -Math.PI * 0.5;
      runeRing.position.y = -0.32;
      runeRing.scale.setScalar(1.22);
      const beacon = new THREE.Mesh(
        pickupBeaconGeo,
        new THREE.MeshBasicMaterial({
          color: 0xf97316,
          map: this.atlas.scrollingEnergyTex ?? null,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      const badgeSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.itemBadgeTexs.shock_grenade ?? null,
          transparent: false,
          alphaTest: 0.45,
          opacity: 1.0,
          depthWrite: false,
          depthTest: false,
        })
      );
      badgeSprite.position.set(0, 1.45, 0);
      badgeSprite.scale.set(2.25, 0.66, 1);
      group.add(crate, ring, runeRing, beacon, badgeSprite);
      group.visible = false;
      scene.add(group);
      this.itemDropPool.push({ id: null, group, crate, ring, runeRing, beacon, badgeSprite });
    }

    for (let i = 0; i < 8; i++) {
      const group = new THREE.Group();
      const fist = new THREE.Mesh(
        meteorFistGeo,
        new THREE.MeshStandardMaterial({
          color: 0xb91c1c,
          emissive: 0xea580c,
          emissiveIntensity: 0.95,
          roughness: 0.42,
          metalness: 0.25,
          transparent: false,
          opacity: 1.0,
        })
      );
      const aura = new THREE.Mesh(
        meteorAuraGeo,
        new THREE.MeshBasicMaterial({
          color: 0xf97316,
          map: this.atlas.scrollingMagmaTex ?? null,
          transparent: false,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      group.add(fist, aura);
      group.visible = false;
      scene.add(group);
      this.fallingMeteors.push({
        group,
        fist,
        aura,
        startY: 18,
        targetY: 0,
        radius: 3.3,
        age: 0,
        duration: 0.26,
        exploded: false,
      });
    }

    for (let i = 0; i < 64; i++) {
      const mesh = new THREE.Mesh(
        this.bulletGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          map: this.atlas.scrollingTurbulenceTex ?? null,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      const coreMesh = new THREE.Mesh(
        this.bulletGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfef9c3,
          map: this.atlas.coreGlowTex ?? null,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      coreMesh.scale.setScalar(0.38);
      coreMesh.visible = false;
      mesh.add(coreMesh);
      mesh.visible = false;
      scene.add(mesh);

      const tether = new THREE.Mesh(
        this.tetherGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfacc15,
          map: this.atlas.taperedSlashTex ?? null,
          transparent: false,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      tether.visible = false;
      scene.add(tether);
      this.projPool.push({ id: null, mesh, coreMesh, tether });
    }

    const maxOrbParticles = this.isMobileDevice
      ? AWAKENING_CONFIG.MAX_ORB_COLUMN_PARTICLES_MOBILE
      : AWAKENING_CONFIG.MAX_ORB_COLUMN_PARTICLES_DESKTOP;
    for (let k = 0; k < 4; k++) {
      const group = new THREE.Group();
      const crystal = new THREE.Mesh(
        this.orbCrystalGeo,
        new THREE.MeshStandardMaterial({
          color: 0xfef08a,
          emissive: 0x06b6d4,
          emissiveIntensity: 1.15,
          roughness: 0.16,
          metalness: 0.5,
          transparent: false,
          opacity: 1.0,
        })
      );
      const ringA = new THREE.Mesh(
        this.orbRingGeo,
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: false,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      const ringB = new THREE.Mesh(
        this.orbRingGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfacc15,
          transparent: false,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      ringB.rotation.x = Math.PI * 0.5;
      const column = new THREE.Mesh(
        this.orbColumnGeo,
        new THREE.MeshBasicMaterial({
          color: 0x06b6d4,
          map: this.atlas.scrollingEnergyTex ?? null,
          transparent: false,
          alphaTest: 0.42,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      column.position.y = -AWAKENING_CONFIG.ORB_HOVER_HEIGHT;
      const groundRing = new THREE.Mesh(
        new THREE.RingGeometry(1.15, 1.52, 32),
        new THREE.MeshBasicMaterial({
          color: 0xfacc15,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          depthWrite: true,
        })
      );
      groundRing.rotation.x = -Math.PI * 0.5;
      groundRing.position.y = -AWAKENING_CONFIG.ORB_HOVER_HEIGHT + 0.08;

      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 448;
      labelCanvas.height = 104;
      const labelTex = new THREE.CanvasTexture(labelCanvas);
      labelTex.colorSpace = THREE.SRGBColorSpace;
      labelTex.needsUpdate = true;

      const haloSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.atlas.coreGlowTex ?? this.orbGlowTex ?? undefined,
          color: 0xfef08a,
          transparent: false,
          alphaTest: 0.35,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      haloSprite.scale.set(2.9, 2.9, 1);
      const labelSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: labelTex,
          transparent: false,
          alphaTest: 0.4,
          opacity: 1.0,
          depthTest: false,
          depthWrite: false,
        })
      );
      labelSprite.position.set(0, 2.05, 0);
      labelSprite.scale.set(4.5, 1.05, 1);
      labelSprite.renderOrder = 25;

      const particles: AwakeningOrbPoolSlot['particles'] = [];
      for (let i = 0; i < maxOrbParticles; i++) {
        const pMesh = new THREE.Mesh(
          this.orbParticleGeo,
          new THREE.MeshBasicMaterial({
            color: i % 2 === 0 ? 0xfef08a : 0x38bdf8,
            transparent: false,
            opacity: 1.0,
            blending: THREE.NormalBlending,
            depthWrite: true,
          })
        );
        group.add(pMesh);
        particles.push({
          mesh: pMesh,
          phase: i / maxOrbParticles,
          radius: 0.45 + (i % 3) * 0.22,
          speed: 0.55 + (i % 4) * 0.14,
        });
      }
      group.add(column, groundRing, crystal, ringA, ringB, haloSprite, labelSprite);
      group.visible = false;
      scene.add(group);
      this.awakeningOrbPool.push({
        id: null,
        group,
        crystal,
        ringA,
        ringB,
        column,
        groundRing,
        haloSprite,
        labelSprite,
        labelCanvas,
        labelTex,
        lastLabelText: '',
        particles,
      });
    }

    // Persistent 3D Channel Rigs (JM 5s Super Kamehameha, JM Ice Pillars, Khen Domain, Damen Arsenal, Marjohn Typhoon, Prime Meteor)
    for (let i = 0; i < 2; i++) {
      // 1. JM 5s Super Kamehameha Rig (Solid Ivory-Gold Core + Solid Cyan Energy Ribbons + Twisting Spirals + Faceted V-Trench)
      const kameGroup = new THREE.Group();
      const chargeCore = new THREE.Mesh(
        kameSphereGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfef9c3,
          map: this.atlas.coreGlowTex ?? null,
          transparent: false,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      chargeCore.position.set(0, 0, 0.9);
      const chargeAura = new THREE.Mesh(
        kameSphereGeo,
        new THREE.MeshBasicMaterial({
          color: 0x06b6d4,
          map: this.atlas.scrollingEnergyTex ?? null,
          transparent: false,
          alphaTest: 0.42,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      chargeAura.position.set(0, 0, 0.9);
      chargeAura.scale.setScalar(1.48);
      const chargeRingA = new THREE.Mesh(
        kameRingGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfacc15,
          transparent: false,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      chargeRingA.position.set(0, 0, 0.9);
      const chargeRingB = new THREE.Mesh(
        kameRingGeo,
        new THREE.MeshBasicMaterial({
          color: 0x06b6d4,
          transparent: false,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      chargeRingB.position.set(0, 0, 0.9);
      const innerBeam = new THREE.Mesh(
        kameCoreGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfef9c3,
          map: this.atlas.taperedSlashTex ?? null,
          transparent: false,
          opacity: 1.0,
          side: THREE.FrontSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      const outerBeam = new THREE.Mesh(
        kameOuterGeo,
        new THREE.MeshBasicMaterial({
          color: 0x06b6d4,
          map: this.atlas.scrollingEnergyTex ?? null,
          transparent: false,
          alphaTest: 0.42,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      const kCoilA = new THREE.Mesh(
        kameCoilGeoA,
        new THREE.MeshBasicMaterial({
          color: 0x06b6d4,
          transparent: false,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      const kCoilB = new THREE.Mesh(
        kameCoilGeoB,
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: false,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      const scorchStrip = new THREE.Mesh(
        this.unitPlaneGeo,
        new THREE.MeshBasicMaterial({
          color: 0xf59e0b,
          map: this.atlas.scrollingEnergyTex ?? null,
          transparent: false,
          alphaTest: 0.35,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      scorchStrip.scale.set(AWAKENING_CONFIG.JM_KAMEHAMEHA_WIDTH * 1.05, 1, AWAKENING_CONFIG.JM_KAMEHAMEHA_RANGE);
      scorchStrip.position.set(0, -0.95, 0.85);
      const trenchLeft = new THREE.Mesh(
        kameTrenchRailGeo,
        new THREE.MeshStandardMaterial({
          color: 0x1c1917,
          roughness: 0.88,
          metalness: 0.15,
          transparent: false,
          opacity: 1.0,
          depthWrite: true,
        })
      );
      trenchLeft.position.set(-1.55, -0.82, AWAKENING_CONFIG.JM_KAMEHAMEHA_RANGE * 0.5 + 0.85);
      trenchLeft.rotation.z = 0.54;
      const trenchRight = new THREE.Mesh(
        kameTrenchRailGeo,
        new THREE.MeshStandardMaterial({
          color: 0x0f172a,
          roughness: 0.88,
          metalness: 0.15,
          transparent: false,
          opacity: 1.0,
          depthWrite: true,
        })
      );
      trenchRight.position.set(1.55, -0.82, AWAKENING_CONFIG.JM_KAMEHAMEHA_RANGE * 0.5 + 0.85);
      trenchRight.rotation.z = -0.54;

      const rings: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>[] = [];
      for (let r = 0; r < 5; r++) {
        const ring = new THREE.Mesh(
          kameRingGeo,
          new THREE.MeshBasicMaterial({
            color: r % 2 === 0 ? 0xfacc15 : 0x06b6d4,
            transparent: false,
            opacity: 1.0,
            blending: THREE.NormalBlending,
            depthWrite: true,
          })
        );
        kameGroup.add(ring);
        rings.push(ring);
      }
      kameGroup.add(
        chargeCore,
        chargeAura,
        chargeRingA,
        chargeRingB,
        innerBeam,
        outerBeam,
        kCoilA,
        kCoilB,
        scorchStrip,
        trenchLeft,
        trenchRight
      );
      kameGroup.visible = false;
      scene.add(kameGroup);
      this.kamehamehaRigs.push({
        group: kameGroup,
        chargeCore,
        chargeAura,
        chargeRingA,
        chargeRingB,
        innerBeam,
        outerBeam,
        coilA: kCoilA,
        coilB: kCoilB,
        scorchStrip,
        trenchLeft,
        trenchRight,
        rings,
      });

      // 2. JM Divine Sanctuary Nova (10 Solid Crystalline Pillars + Energy Cage + Shatter)
      const iceGroup = new THREE.Group();
      const iceRing = new THREE.Mesh(
        this.zoneRingGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfacc15,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      iceRing.rotation.x = -Math.PI * 0.5;
      iceRing.position.y = 0.28;
      const iceDome = new THREE.Mesh(
        iceDomeGeo,
        new THREE.MeshBasicMaterial({
          color: 0x06b6d4,
          map: this.atlas.scrollingEnergyTex ?? null,
          transparent: false,
          alphaTest: 0.44,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      iceDome.position.y = 0.25;
      const icePillars: IceNovaRig['pillars'] = [];
      for (let p = 0; p < 10; p++) {
        const angle = (p / 10) * Math.PI * 2;
        const dist = 3.2 + (p % 2) * 1.45;
        const heightScale = 1.42 + (p % 3) * 0.34;
        const pMesh = new THREE.Mesh(
          icePillarGeo,
          new THREE.MeshBasicMaterial({
            color: p % 2 === 0 ? 0x06b6d4 : 0xfacc15,
            map: this.atlas.scrollingEnergyTex ?? null,
            transparent: false,
            opacity: 1.0,
            side: THREE.DoubleSide,
            blending: THREE.NormalBlending,
            depthWrite: true,
          })
        );
        const pCore = new THREE.Mesh(
          icePillarGeo,
          new THREE.MeshBasicMaterial({
            color: 0xfef9c3,
            transparent: false,
            opacity: 1.0,
            blending: THREE.NormalBlending,
            depthWrite: true,
          })
        );
        pCore.scale.set(0.32, 0.92, 0.32);
        pMesh.add(pCore);
        pMesh.position.set(Math.cos(angle) * dist, 0.26, Math.sin(angle) * dist);
        pMesh.rotation.z = Math.cos(angle) * 0.14;
        pMesh.rotation.x = -Math.sin(angle) * 0.14;
        iceGroup.add(pMesh);
        icePillars.push({ mesh: pMesh, core: pCore, angle, dist, heightScale });
      }
      iceGroup.add(iceRing, iceDome);
      iceGroup.visible = false;
      scene.add(iceGroup);
      this.iceNovaRigs.push({ zoneId: null, group: iceGroup, ring: iceRing, dome: iceDome, pillars: icePillars });

      // 3. Khen Eclipse Domain (Solid Violet Rune Circle + 6 Sculpted Obsidian Shadow Clones + Slash Streaks)
      const khenGroup = new THREE.Group();
      const kOuter = new THREE.Mesh(
        this.zoneRingGeo,
        new THREE.MeshBasicMaterial({
          color: 0xa855f7,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      kOuter.rotation.x = -Math.PI * 0.5;
      const kRune = new THREE.Mesh(
        this.runeOctGeo,
        new THREE.MeshBasicMaterial({
          color: 0xd8b4fe,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      kRune.rotation.x = -Math.PI * 0.5;
      const kDisc = new THREE.Mesh(
        this.zoneDiscGeo,
        new THREE.MeshBasicMaterial({
          color: 0x09090b,
          map: this.atlas.smokePuffTex ?? null,
          transparent: false,
          alphaTest: 0.35,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      kDisc.rotation.x = -Math.PI * 0.5;
      const clones: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
      for (let c = 0; c < 6; c++) {
        const cl = new THREE.Mesh(
          this.decoySilhouetteGeo,
          new THREE.MeshBasicMaterial({
            color: c % 2 === 0 ? 0x09090b : 0x3b0764,
            transparent: false,
            opacity: 1.0,
            blending: THREE.NormalBlending,
            depthWrite: true,
          })
        );
        khenGroup.add(cl);
        clones.push(cl);
      }
      const kSlashes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
      for (let s = 0; s < 6; s++) {
        const sl = new THREE.Mesh(
          this.tetherGeo,
          new THREE.MeshBasicMaterial({
            color: s % 2 === 0 ? 0xddd6fe : 0xa855f7,
            map: this.atlas.taperedSlashTex ?? null,
            transparent: false,
            opacity: 1.0,
            blending: THREE.NormalBlending,
            depthWrite: true,
          })
        );
        khenGroup.add(sl);
        kSlashes.push(sl);
      }
      khenGroup.add(kOuter, kRune, kDisc);
      khenGroup.visible = false;
      scene.add(khenGroup);
      this.khenDomainRigs.push({
        group: khenGroup,
        outerRing: kOuter,
        innerRune: kRune,
        floorDisc: kDisc,
        clones,
        slashes: kSlashes,
      });

      // 4. Damen Spectral Arsenal (Semicircle of 7 Solid Metallic-Gold Guns + Muzzle Flashes + Tracers)
      const damenGroup = new THREE.Group();
      const guns: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
      const flashes: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>[] = [];
      const dTracers: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
      for (let g = 0; g < 7; g++) {
        const gun = new THREE.Mesh(
          gunBoxGeo,
          new THREE.MeshStandardMaterial({
            color: 0xeab308,
            emissive: 0xca8a04,
            emissiveIntensity: 0.45,
            metalness: 0.85,
            roughness: 0.24,
            transparent: false,
            opacity: 1.0,
          })
        );
        const flash = new THREE.Mesh(
          flashGeo,
          new THREE.MeshBasicMaterial({
            color: 0xfef08a,
            transparent: false,
            opacity: 1.0,
            blending: THREE.NormalBlending,
            depthWrite: true,
          })
        );
        const tr = new THREE.Mesh(
          this.tetherGeo,
          new THREE.MeshBasicMaterial({
            color: 0xf59e0b,
            map: this.atlas.taperedSlashTex ?? null,
            transparent: false,
            opacity: 1.0,
            blending: THREE.NormalBlending,
            depthWrite: true,
          })
        );
        damenGroup.add(gun, flash, tr);
        guns.push(gun);
        flashes.push(flash);
        dTracers.push(tr);
      }
      damenGroup.visible = false;
      scene.add(damenGroup);
      this.damenArsenalRigs.push({ group: damenGroup, guns, flashes, tracers: dTracers });

      // 5. Marjohn Colossal Typhoon Rig (Solid Multi-layered Twisted Vortex + 3D Spiral Wind Ribbons)
      const marjGroup = new THREE.Group();
      const outerFunnel = new THREE.Mesh(
        this.tornadoGeo,
        new THREE.MeshBasicMaterial({
          color: 0x0d9488,
          map: this.atlas.scrollingWindTex ?? null,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      const innerFunnel = new THREE.Mesh(
        this.tornadoGeo,
        new THREE.MeshBasicMaterial({
          color: 0x5eead4,
          map: this.atlas.scrollingWindTex ?? null,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      const ribbons: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
      for (let r = 0; r < 4; r++) {
        const rb = new THREE.Mesh(
          this.tornadoRibbonGeo,
          new THREE.MeshBasicMaterial({
            color: r % 2 === 0 ? 0x2dd4bf : 0xe2e8f0,
            map: this.atlas.taperedSlashTex ?? null,
            transparent: false,
            opacity: 1.0,
            side: THREE.DoubleSide,
            blending: THREE.NormalBlending,
            depthWrite: true,
          })
        );
        rb.rotation.y = (r / 4) * Math.PI * 2;
        marjGroup.add(rb);
        ribbons.push(rb);
      }
      const mRing = new THREE.Mesh(
        this.zoneRingGeo,
        new THREE.MeshBasicMaterial({
          color: 0x2dd4bf,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      mRing.rotation.x = -Math.PI * 0.5;
      mRing.position.y = 0.28;
      marjGroup.add(outerFunnel, innerFunnel, mRing);
      marjGroup.visible = false;
      scene.add(marjGroup);
      this.marjohnTyphoonRigs.push({ group: marjGroup, outerFunnel, innerFunnel, ribbons, groundRing: mRing });

      // 6. Prime Crimson Sky Meteor Rig (Solid Molten Meteor Cones)
      const primeGroup = new THREE.Group();
      const auraSphere = new THREE.Mesh(
        this.solarAuraGeo,
        new THREE.MeshBasicMaterial({
          color: 0xdc2626,
          map: this.atlas.scrollingMagmaTex ?? null,
          transparent: false,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      const targetGroup = new THREE.Group();
      const targetRing = new THREE.Mesh(
        this.zoneRingGeo,
        new THREE.MeshBasicMaterial({
          color: 0xdc2626,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      targetRing.rotation.x = -Math.PI * 0.5;
      const targetDisc = new THREE.Mesh(
        this.zoneDiscGeo,
        new THREE.MeshBasicMaterial({
          color: 0xea580c,
          map: this.atlas.scrollingMagmaTex ?? null,
          transparent: false,
          alphaTest: 0.35,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      targetDisc.rotation.x = -Math.PI * 0.5;
      targetGroup.add(targetRing, targetDisc);
      const meteors: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
      for (let m = 0; m < 4; m++) {
        const met = new THREE.Mesh(
          meteorConeGeo,
          new THREE.MeshBasicMaterial({
            color: m % 2 === 0 ? 0xea580c : 0xfbbf24,
            map: this.atlas.scrollingMagmaTex ?? null,
            transparent: false,
            opacity: 1.0,
            side: THREE.DoubleSide,
            blending: THREE.NormalBlending,
            depthWrite: true,
          })
        );
        targetGroup.add(met);
        meteors.push(met);
      }
      primeGroup.add(auraSphere, targetGroup);
      primeGroup.visible = false;
      scene.add(primeGroup);
      this.primeMeteorRigs.push({ group: primeGroup, auraSphere, targetGroup, targetRing, targetDisc, meteors });
    }

    // Pre-allocated Hold-Drag Ground Aim Reticle (Solid crisp border & terrain markers)
    this.aimGroup = new THREE.Group();
    this.aimPointRing = new THREE.Mesh(
      this.zoneRingGeo,
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: false,
        opacity: 1.0,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: true,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      })
    );
    this.aimPointRing.rotation.x = -Math.PI * 0.5;
    this.aimPointInner = new THREE.Mesh(
      this.runeOctGeo,
      new THREE.MeshBasicMaterial({
        color: 0xe0f2fe,
        transparent: false,
        opacity: 1.0,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: true,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      })
    );
    this.aimPointInner.rotation.x = -Math.PI * 0.5;
    this.aimPointDisc = new THREE.Mesh(
      this.zoneDiscGeo,
      new THREE.MeshBasicMaterial({
        color: 0x0c4a6e,
        map: this.atlas.scrollingEnergyTex ?? null,
        transparent: false,
        alphaTest: 0.45,
        opacity: 1.0,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: true,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
    );
    this.aimPointDisc.rotation.x = -Math.PI * 0.5;
    this.aimLineStrip = new THREE.Mesh(
      this.unitPlaneGeo,
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: false,
        opacity: 1.0,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: true,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
    );
    this.aimLineArrow = new THREE.Mesh(
      aimArrowGeo,
      new THREE.MeshBasicMaterial({
        color: 0xe0f2fe,
        transparent: false,
        opacity: 1.0,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: true,
      })
    );
    this.aimLineOriginRing = new THREE.Mesh(
      this.zoneRingGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: false,
        opacity: 1.0,
        side: THREE.DoubleSide,
        depthWrite: true,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
    );
    this.aimLineOriginRing.rotation.x = -Math.PI * 0.5;
    this.aimConeWedge = new THREE.Mesh(
      this.coneWedgeGeo,
      new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        map: this.atlas.scrollingEnergyTex ?? null,
        transparent: false,
        alphaTest: 0.42,
        opacity: 1.0,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: true,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
    );
    this.aimGroup.add(
      this.aimPointRing,
      this.aimPointInner,
      this.aimPointDisc,
      this.aimLineStrip,
      this.aimLineArrow,
      this.aimLineOriginRing,
      this.aimConeWedge
    );
    this.aimGroup.visible = false;
    scene.add(this.aimGroup);

    // Pre-allocated Terrain-Conforming Ribbon Segments, Arc Trajectory Dots & Wall Block Impact X
    for (let i = 0; i < 32; i++) {
      const seg = new THREE.Mesh(
        this.unitPlaneGeo,
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
          polygonOffset: true,
          polygonOffsetFactor: -3,
          polygonOffsetUnits: -3,
        })
      );
      seg.visible = false;
      scene.add(seg);
      this.aimRibbonSegments.push(seg);
    }

    const arcDotGeo = new THREE.IcosahedronGeometry(0.15, 1);
    const wallBarGeo = new THREE.PlaneGeometry(1.15, 0.22);
    this.sharedGeos.push(arcDotGeo, wallBarGeo);

    for (let i = 0; i < 14; i++) {
      const dot = new THREE.Mesh(
        arcDotGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfacc15,
          map: this.atlas.coreGlowTex ?? null,
          transparent: false,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      dot.visible = false;
      scene.add(dot);
      this.aimArcDots.push(dot);
    }

    this.aimWallCrossGroup = new THREE.Group();
    this.aimWallCrossA = new THREE.Mesh(
      wallBarGeo,
      new THREE.MeshBasicMaterial({
        color: 0xf43f5e,
        map: this.atlas.taperedSlashTex ?? null,
        transparent: false,
        opacity: 1.0,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: true,
      })
    );
    this.aimWallCrossA.rotation.z = Math.PI * 0.25;
    this.aimWallCrossB = new THREE.Mesh(
      wallBarGeo,
      new THREE.MeshBasicMaterial({
        color: 0xf43f5e,
        map: this.atlas.taperedSlashTex ?? null,
        transparent: false,
        opacity: 1.0,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: true,
      })
    );
    this.aimWallCrossB.rotation.z = -Math.PI * 0.25;
    this.aimWallCrossRing = new THREE.Mesh(
      this.zoneRingGeo,
      new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: false,
        opacity: 1.0,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: true,
      })
    );
    this.aimWallCrossRing.scale.setScalar(0.85);
    this.aimWallCrossGroup.add(this.aimWallCrossA, this.aimWallCrossB, this.aimWallCrossRing);
    this.aimWallCrossGroup.visible = false;
    scene.add(this.aimWallCrossGroup);

    // Pre-allocated Meteor Warning Rings (for Obsidian Falling Meteor Boulders)
    for (let i = 0; i < 4; i++) {
      const mGroup = new THREE.Group();
      const ring = new THREE.Mesh(
        this.zoneRingGeo,
        new THREE.MeshBasicMaterial({
          color: 0xf43f5e,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      ring.rotation.x = -Math.PI * 0.5;
      const disc = new THREE.Mesh(
        this.zoneDiscGeo,
        new THREE.MeshBasicMaterial({
          color: 0xf97316,
          map: this.atlas.scrollingMagmaTex ?? null,
          transparent: false,
          alphaTest: 0.42,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      disc.rotation.x = -Math.PI * 0.5;
      mGroup.add(ring, disc);
      mGroup.visible = false;
      scene.add(mGroup);
      this.eventMeteorRings.push({ group: mGroup, ring, disc });
    }

    // Temple NPC Guardian Aura Ring & Floating Overhead Prompt
    this.templeNpcGroup = new THREE.Group();
    this.templeNpcRing = new THREE.Mesh(
      this.zoneRingGeo,
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: false,
        opacity: 1.0,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: true,
      })
    );
    this.templeNpcRing.rotation.x = -Math.PI * 0.5;
    this.templeNpcRing.position.y = 0.25;
    this.templeNpcRing.scale.setScalar(1.75);
    this.templeNpcSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.npcTalkTex ?? null,
        transparent: false,
        alphaTest: 0.4,
        opacity: 1.0,
        depthWrite: false,
        depthTest: false,
      })
    );
    this.templeNpcSprite.position.set(0, 2.45, 0);
    this.templeNpcSprite.scale.set(3.4, 0.76, 1);
    this.templeNpcGroup.add(this.templeNpcRing, this.templeNpcSprite);
    this.templeNpcGroup.visible = false;
    scene.add(this.templeNpcGroup);

    this.aimDropLine = new THREE.Mesh(
      this.tetherGeo,
      new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        map: this.atlas.taperedSlashTex ?? null,
        transparent: false,
        opacity: 1.0,
        blending: THREE.NormalBlending,
        depthWrite: true,
      })
    );
    this.aimDropLine.visible = false;
    scene.add(this.aimDropLine);

    // Ground circular Skill Range Indicator (shows exact skill max reach around caster)
    const rangeRingGeo = new THREE.RingGeometry(0.955, 1.0, 64);
    this.sharedGeos.push(rangeRingGeo);
    this.aimRangeRing = new THREE.Mesh(
      rangeRingGeo,
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: false,
        opacity: 1.0,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: true,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      })
    );
    this.aimRangeRing.rotation.x = -Math.PI * 0.5;
    this.aimRangeRing.visible = false;
    scene.add(this.aimRangeRing);

    // Pre-allocated Domain Cast Stage Overlay (Solid BackSide Dome + Crisp Ground Rings)
    this.domainCastGroup = new THREE.Group();
    const domDomeGeo = createTaperedConeShellGeometry(0.18, 1.0, 0.94, 32, 8, 0.38);
    domDomeGeo.translate(0, 0.47, 0);
    const domPillarGeo = createTaperedConeShellGeometry(0.26, 0.46, 8.5, 14, 4, 0.06);
    domPillarGeo.translate(0, 4.25, 0);
    const webOuterGeo = createTaperedConeShellGeometry(0.12, 0.12, 1.0, 10, 2, 0);
    webOuterGeo.rotateX(Math.PI * 0.5);
    const webCoreGeo = createTaperedConeShellGeometry(0.044, 0.044, 1.0, 8, 2, 0);
    webCoreGeo.rotateX(Math.PI * 0.5);
    this.sharedGeos.push(
      domDomeGeo,
      domPillarGeo,
      webOuterGeo,
      webCoreGeo
    );

    this.domainCastRing = new THREE.Mesh(
      this.zoneRingGeo,
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: false,
        opacity: 1.0,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: true,
      })
    );
    this.domainCastRing.rotation.x = -Math.PI * 0.5;
    this.domainCastRing.position.y = 0.28;

    this.domainCastDisc = new THREE.Mesh(
      this.zoneDiscGeo,
      new THREE.MeshBasicMaterial({
        color: 0x0f172a,
        map: this.atlas.scrollingEnergyTex ?? null,
        transparent: false,
        alphaTest: 0.45,
        opacity: 1.0,
        side: THREE.DoubleSide,
        depthWrite: true,
      })
    );
    this.domainCastDisc.rotation.x = -Math.PI * 0.5;
    this.domainCastDisc.position.y = 0.24;

    this.domainCastSealRing = new THREE.Mesh(
      this.runeOctGeo,
      new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: false,
        opacity: 1.0,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: true,
      })
    );
    this.domainCastSealRing.rotation.x = -Math.PI * 0.5;
    this.domainCastSealRing.position.y = 0.31;

    this.domainCastDome = new THREE.Mesh(
      domDomeGeo,
      new THREE.MeshBasicMaterial({
        color: 0xa855f7,
        map: this.atlas.scrollingEnergyTex ?? null,
        transparent: false,
        alphaTest: 0.38,
        opacity: 1.0,
        side: THREE.BackSide,
        depthWrite: true,
      })
    );

    this.domainCastGroup.add(
      this.domainCastRing,
      this.domainCastDisc,
      this.domainCastSealRing,
      this.domainCastDome
    );
    this.domainCastGroup.visible = false;
    scene.add(this.domainCastGroup);

    // 3D Domain Expansion Environment Manifestation (Solid BackSide Dome + Solid Arena Floor Accents)
    this.domainGroup = new THREE.Group();
    this.domainDome = new THREE.Mesh(
      domDomeGeo,
      new THREE.MeshBasicMaterial({
        color: 0xa855f7,
        map: this.atlas.scrollingTurbulenceTex ?? null,
        transparent: false,
        opacity: 1.0,
        side: THREE.BackSide,
        depthWrite: true,
      })
    );
    const crispDomainRingGeo = new THREE.RingGeometry(0.964, 1.0, 64);
    const crispOctRuneGeo = new THREE.RingGeometry(0.945, 0.985, 8);
    this.sharedGeos.push(crispDomainRingGeo, crispOctRuneGeo);

    this.domainBarrierRing = new THREE.Mesh(
      crispDomainRingGeo,
      new THREE.MeshBasicMaterial({
        color: 0xe879f9,
        transparent: false,
        opacity: 1.0,
        side: THREE.DoubleSide,
        depthWrite: true,
      })
    );
    this.domainBarrierRing.rotation.x = -Math.PI * 0.5;
    this.domainBarrierRing.position.y = 0.28;
    this.domainFloorDisc = new THREE.Mesh(
      this.zoneDiscGeo,
      new THREE.MeshBasicMaterial({
        color: 0x1e1b4b,
        map: this.atlas.scrollingTurbulenceTex ?? null,
        transparent: false,
        alphaTest: 0.42,
        opacity: 1.0,
        side: THREE.DoubleSide,
        depthWrite: true,
      })
    );
    this.domainFloorDisc.rotation.x = -Math.PI * 0.5;
    this.domainFloorDisc.position.y = 0.22;
    this.domainInnerRune = new THREE.Mesh(
      crispOctRuneGeo,
      new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: false,
        opacity: 1.0,
        side: THREE.DoubleSide,
        depthWrite: true,
      })
    );
    this.domainInnerRune.rotation.x = -Math.PI * 0.5;
    this.domainInnerRune.position.y = 0.26;
    this.domainGroup.add(
      this.domainDome,
      this.domainBarrierRing,
      this.domainFloorDisc,
      this.domainInnerRune
    );
    for (let i = 0; i < 8; i++) {
      const pillar = new THREE.Mesh(
        domPillarGeo,
        new THREE.MeshBasicMaterial({
          color: 0xdc2626,
          map: this.atlas.scrollingTurbulenceTex ?? null,
          transparent: false,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      this.domainGroup.add(pillar);
      this.domainPillars.push(pillar);

      const dGun = new THREE.Mesh(
        gunBoxGeo,
        new THREE.MeshStandardMaterial({
          color: 0xeab308,
          emissive: 0xca8a04,
          emissiveIntensity: 0.45,
          metalness: 0.85,
          roughness: 0.24,
          transparent: false,
          opacity: 1.0,
        })
      );
      this.domainGroup.add(dGun);
      this.domainGuns.push(dGun);
    }

    // Pre-allocated Khen Autonomous AI Shadow Clones (3 solid cloaked warriors)
    for (let i = 0; i < 3; i++) {
      const cGroup = new THREE.Group();
      const bodyMat = new THREE.MeshBasicMaterial({
        color: 0x09090b,
        transparent: false,
        opacity: 1.0,
        blending: THREE.NormalBlending,
        depthWrite: true,
      });
      const visorMat = new THREE.MeshBasicMaterial({
        color: 0xddd6fe,
        map: this.atlas.taperedSlashTex ?? null,
        transparent: false,
        opacity: 1.0,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: true,
      });
      const armMat = new THREE.MeshBasicMaterial({
        color: 0x3b0764,
        transparent: false,
        opacity: 1.0,
        blending: THREE.NormalBlending,
        depthWrite: true,
      });
      const auraMat = new THREE.MeshBasicMaterial({
        color: 0x7e22ce,
        transparent: false,
        opacity: 1.0,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: true,
      });
      const torso = new THREE.Mesh(cloneParts.cloakTorsoGeo, bodyMat);
      torso.position.y = 0.92;
      const head = new THREE.Mesh(cloneParts.hoodedHeadGeo, bodyMat.clone());
      head.position.y = 1.62;
      const visor = new THREE.Mesh(cloneParts.visorCrescentGeo, visorMat);
      visor.position.set(0, 1.63, 0.08);
      visor.rotation.x = Math.PI * 0.5;
      const leftArm = new THREE.Mesh(cloneParts.bladeArmGeo, armMat);
      leftArm.position.set(-0.36, 1.05, 0.14);
      const rightArm = new THREE.Mesh(cloneParts.bladeArmGeo, armMat.clone());
      rightArm.position.set(0.36, 1.05, 0.14);
      const auraRing = new THREE.Mesh(this.zoneRingGeo, auraMat);
      auraRing.rotation.x = -Math.PI * 0.5;
      auraRing.position.y = 0.24;
      auraRing.scale.setScalar(0.9);
      cGroup.add(torso, head, visor, leftArm, rightArm, auraRing);
      cGroup.visible = false;
      scene.add(cGroup);
      this.khenClonePool.push({ group: cGroup, torso, head, visor, leftArm, rightArm, auraRing });
    }

    // Pre-allocated JM Edge-to-Edge Golden-Cyan Permanent Energy Web Lines (28 solid beams, y >= 0.25)
    for (let i = 0; i < 28; i++) {
      const wGroup = new THREE.Group();
      const outer = new THREE.Mesh(
        webOuterGeo,
        new THREE.MeshBasicMaterial({
          color: 0x06b6d4,
          map: this.atlas.scrollingEnergyTex ?? null,
          transparent: false,
          opacity: 1.0,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      const core = new THREE.Mesh(
        webCoreGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          map: this.atlas.taperedSlashTex ?? null,
          transparent: false,
          opacity: 1.0,
          blending: THREE.NormalBlending,
          depthWrite: true,
        })
      );
      wGroup.add(outer, core);
      wGroup.visible = false;
      scene.add(wGroup);
      this.jmWebLinePool.push({ group: wGroup, outer, core });
    }

    this.domainGroup.visible = false;
    scene.add(this.domainGroup);

    // KOTH Capture Beacon (Solid)
    this.kothGroup = new THREE.Group();
    const kothBeaconGeo = createTaperedConeShellGeometry(0.45, 0.85, 11.0, 18, 4, 0.05);
    kothBeaconGeo.translate(0, 5.5, 0);
    this.sharedGeos.push(kothBeaconGeo);
    this.kothOuterRing = new THREE.Mesh(
      this.zoneRingGeo,
      new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: false,
        opacity: 1.0,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: true,
      })
    );
    this.kothOuterRing.rotation.x = -Math.PI * 0.5;
    this.kothOuterRing.position.y = 0.28;
    this.kothInnerDisc = new THREE.Mesh(
      this.zoneDiscGeo,
      new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        map: this.atlas.scrollingEnergyTex ?? null,
        transparent: false,
        alphaTest: 0.45,
        opacity: 1.0,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: true,
      })
    );
    this.kothInnerDisc.rotation.x = -Math.PI * 0.5;
    this.kothInnerDisc.position.y = 0.25;
    this.kothBeacon = new THREE.Mesh(
      kothBeaconGeo,
      new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        map: this.atlas.scrollingEnergyTex ?? null,
        transparent: false,
        alphaTest: 0.45,
        opacity: 1.0,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: true,
      })
    );
    this.kothGroup.add(this.kothOuterRing, this.kothInnerDisc, this.kothBeacon);
    this.kothGroup.visible = false;
    scene.add(this.kothGroup);

    // ------------------------------------------------------------
    // PRE-ALLOCATED SKIN & ASCENDED KEY-5 POOLS (ZERO GC)
    // ------------------------------------------------------------
    const canGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.28, 8);
    const paperGeo = new THREE.IcosahedronGeometry(0.14, 0);
    const leafGeo = new THREE.BoxGeometry(0.24, 0.03, 0.14);
    const volcanoConeGeo = new THREE.CylinderGeometry(0.58, 1.38, 2.15, 10);
    volcanoConeGeo.translate(0, 1.07, 0);
    const volcanoLavaGeo = new THREE.CylinderGeometry(0.46, 0.55, 0.36, 10);
    volcanoLavaGeo.translate(0, 2.02, 0);
    const spearShaftGeo = new THREE.CylinderGeometry(0.12, 0.16, 6.2, 10);
    spearShaftGeo.translate(0, 3.1, 0);
    const spearGuardGeo = new THREE.BoxGeometry(1.45, 0.22, 0.32);
    const spearTipGeo = new THREE.ConeGeometry(0.32, 1.55, 8);
    spearTipGeo.translate(0, 6.95, 0);
    const spearHaloGeo = new THREE.TorusGeometry(1.1, 0.08, 8, 28);
    const waveSegGeo = new THREE.BoxGeometry(1.1, 0.38, 0.46);
    this.sharedGeos.push(
      canGeo,
      paperGeo,
      leafGeo,
      volcanoConeGeo,
      volcanoLavaGeo,
      spearShaftGeo,
      spearGuardGeo,
      spearTipGeo,
      spearHaloGeo,
      waveSegGeo
    );

    // 1. Marjohn Special (Street Beggar) Garbage Tornado Debris (36 solid tin cans, crumpled paper, leaves)
    for (let i = 0; i < 36; i++) {
      const mod = i % 3;
      const kind: 'can' | 'paper' | 'leaf' = mod === 0 ? 'can' : mod === 1 ? 'paper' : 'leaf';
      const geo = kind === 'can' ? canGeo : kind === 'paper' ? paperGeo : leafGeo;
      const color = kind === 'can' ? (i % 6 === 0 ? 0xdc2626 : 0x94a3b8) : kind === 'paper' ? 0xf5f5f4 : 0x65a30d;
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color,
          roughness: kind === 'can' ? 0.35 : 0.85,
          metalness: kind === 'can' ? 0.65 : 0.05,
          transparent: false,
          opacity: 1.0,
        })
      );
      mesh.visible = false;
      scene.add(mesh);
      this.garbageDebrisPool.push({ mesh, kind });
    }

    // 2. Marjohn Ascended (5) Stationary Storm Tornado Turrets (4)
    for (let i = 0; i < 4; i++) {
      const group = new THREE.Group();
      const outer = new THREE.Mesh(
        this.tornadoGeo,
        new THREE.MeshStandardMaterial({
          color: 0x0284c7,
          emissive: 0x0369a1,
          emissiveIntensity: 0.45,
          roughness: 0.35,
          metalness: 0.25,
          side: THREE.DoubleSide,
          transparent: false,
          opacity: 1.0,
        })
      );
      outer.scale.set(1.55, 1.85, 1.55);
      const inner = new THREE.Mesh(
        this.tornadoRibbonGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfacc15,
          side: THREE.DoubleSide,
          transparent: false,
          opacity: 1.0,
        })
      );
      inner.scale.set(1.5, 1.75, 1.5);
      const baseRing = new THREE.Mesh(
        this.zoneRingGeo,
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          side: THREE.DoubleSide,
          transparent: false,
          opacity: 1.0,
        })
      );
      baseRing.rotation.x = -Math.PI * 0.5;
      baseRing.position.y = 0.14;
      baseRing.scale.setScalar(2.4);
      group.add(outer, inner, baseRing);
      group.visible = false;
      scene.add(group);
      this.turretTornadoPool.push({ group, outer, inner, baseRing });
    }

    // 3. Prime Ascended (5) Asura Volcano Turrets (4)
    for (let i = 0; i < 4; i++) {
      const group = new THREE.Group();
      const cone = new THREE.Mesh(
        volcanoConeGeo,
        new THREE.MeshStandardMaterial({
          color: 0x1c1917,
          emissive: 0x7c2d12,
          emissiveIntensity: 0.4,
          roughness: 0.85,
          metalness: 0.15,
          transparent: false,
          opacity: 1.0,
        })
      );
      const lava = new THREE.Mesh(
        volcanoLavaGeo,
        new THREE.MeshStandardMaterial({
          color: 0xf97316,
          emissive: 0xdc2626,
          emissiveIntensity: 1.15,
          roughness: 0.25,
          metalness: 0.1,
          transparent: false,
          opacity: 1.0,
        })
      );
      const baseRing = new THREE.Mesh(
        this.zoneRingGeo,
        new THREE.MeshBasicMaterial({
          color: 0xf97316,
          side: THREE.DoubleSide,
          transparent: false,
          opacity: 1.0,
        })
      );
      baseRing.rotation.x = -Math.PI * 0.5;
      baseRing.position.y = 0.14;
      baseRing.scale.setScalar(2.2);
      group.add(cone, lava, baseRing);
      group.visible = false;
      scene.add(group);
      this.turretVolcanoPool.push({ group, cone, lava, baseRing });
    }

    // 4. Damen Ascended (5) Solar Gun Turrets (12: 3 per player)
    for (let i = 0; i < 12; i++) {
      const group = new THREE.Group();
      const gun = new THREE.Mesh(
        gunBoxGeo,
        new THREE.MeshStandardMaterial({
          color: 0xfacc15,
          emissive: 0xea580c,
          emissiveIntensity: 0.55,
          metalness: 0.88,
          roughness: 0.2,
          transparent: false,
          opacity: 1.0,
        })
      );
      gun.scale.setScalar(1.35);
      const halo = new THREE.Mesh(
        spearHaloGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: false,
          opacity: 1.0,
        })
      );
      halo.scale.setScalar(0.32);
      halo.position.z = -0.22;
      group.add(gun, halo);
      group.visible = false;
      scene.add(group);
      this.turretSolarGunPool.push({ group, gun, halo });
    }

    // 5. Khen Ascended (5) Persistent Abyssal Shadow Clones (4) with Solid Overhead HP Bar
    for (let i = 0; i < 4; i++) {
      const group = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x0f0720,
        emissive: 0x4c1d95,
        emissiveIntensity: 0.45,
        roughness: 0.42,
        metalness: 0.55,
        transparent: false,
        opacity: 1.0,
      });
      const armMat = new THREE.MeshStandardMaterial({
        color: 0x6d28d9,
        emissive: 0x7e22ce,
        emissiveIntensity: 0.65,
        roughness: 0.3,
        metalness: 0.6,
        transparent: false,
        opacity: 1.0,
      });
      const torso = new THREE.Mesh(cloneParts.cloakTorsoGeo, bodyMat);
      torso.position.y = 0.96;
      const head = new THREE.Mesh(cloneParts.hoodedHeadGeo, bodyMat.clone());
      head.position.y = 1.72;
      const visor = new THREE.Mesh(
        cloneParts.visorCrescentGeo,
        new THREE.MeshBasicMaterial({
          color: 0xe9d5ff,
          side: THREE.DoubleSide,
          transparent: false,
          opacity: 1.0,
        })
      );
      visor.position.set(0, 1.73, 0.09);
      visor.rotation.x = Math.PI * 0.5;
      const leftArm = new THREE.Mesh(cloneParts.bladeArmGeo, armMat);
      leftArm.position.set(-0.4, 1.1, 0.16);
      const rightArm = new THREE.Mesh(cloneParts.bladeArmGeo, armMat.clone());
      rightArm.position.set(0.4, 1.1, 0.16);
      const auraRing = new THREE.Mesh(
        this.zoneRingGeo,
        new THREE.MeshBasicMaterial({
          color: 0xa855f7,
          side: THREE.DoubleSide,
          transparent: false,
          opacity: 1.0,
        })
      );
      auraRing.rotation.x = -Math.PI * 0.5;
      auraRing.position.y = 0.14;
      auraRing.scale.setScalar(1.1);

      const hpCanvas = document.createElement('canvas');
      hpCanvas.width = 256;
      hpCanvas.height = 56;
      const hpTex = new THREE.CanvasTexture(hpCanvas);
      hpTex.colorSpace = THREE.SRGBColorSpace;
      hpTex.needsUpdate = true;
      const hpSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: hpTex,
          transparent: false,
          alphaTest: 0.4,
          opacity: 1.0,
          depthTest: false,
          depthWrite: false,
        })
      );
      hpSprite.position.set(0, 2.55, 0);
      hpSprite.scale.set(2.3, 0.5, 1);
      hpSprite.renderOrder = 26;

      group.add(torso, head, visor, leftArm, rightArm, auraRing, hpSprite);
      group.visible = false;
      scene.add(group);
      this.abyssalClonePool.push({
        group,
        torso,
        head,
        visor,
        leftArm,
        rightArm,
        auraRing,
        hpCanvas,
        hpTex,
        hpSprite,
        lastHpKey: '',
      });
    }

    // 6. JM Ascended (5) Celestial Judgement Spears + Terrain-Conforming Electric Ring Waves (4)
    for (let i = 0; i < 4; i++) {
      const group = new THREE.Group();
      const goldMat = new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xca8a04,
        emissiveIntensity: 0.6,
        metalness: 0.85,
        roughness: 0.2,
        transparent: false,
        opacity: 1.0,
      });
      const tipMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x06b6d4,
        emissiveIntensity: 0.9,
        metalness: 0.7,
        roughness: 0.16,
        transparent: false,
        opacity: 1.0,
      });
      const shaft = new THREE.Mesh(spearShaftGeo, goldMat);
      const guard = new THREE.Mesh(spearGuardGeo, goldMat.clone());
      guard.position.y = 6.1;
      const tip = new THREE.Mesh(spearTipGeo, tipMat);
      const halo = new THREE.Mesh(
        spearHaloGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: false,
          opacity: 1.0,
        })
      );
      halo.position.y = 4.6;
      const waveSegments: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[] = [];
      for (let w = 0; w < 48; w++) {
        const seg = new THREE.Mesh(
          waveSegGeo,
          new THREE.MeshBasicMaterial({
            color: w % 2 === 0 ? 0x38bdf8 : 0xfacc15,
            transparent: false,
            opacity: 1.0,
          })
        );
        seg.visible = false;
        scene.add(seg);
        waveSegments.push(seg);
      }
      group.add(shaft, guard, tip, halo);
      group.visible = false;
      scene.add(group);
      this.judgementSpearPool.push({
        group,
        shaft,
        guard,
        tip,
        halo,
        waveSegments,
        lastPulseCount: -1,
      });
    }
  }

  public spawnPointLightFlash(x: number, y: number, z: number, colorHex: number, intensity = 7.5, duration = 0.26, distance = 14): void {
    const halo = this.glowHalos[this.lightCursor % this.glowHalos.length];
    this.lightCursor++;
    const scale = THREE.MathUtils.clamp(distance * 0.12, 0.95, 2.8);
    const peakOpacity = clampAdditiveOpacity(intensity * 0.088);
    halo.mesh.position.set(x, y, z);
    halo.mesh.scale.setScalar(scale);
    halo.mesh.material.color.setHex(colorHex);
    halo.mesh.material.opacity = peakOpacity;
    halo.mesh.visible = true;
    halo.baseScale = scale;
    halo.peakOpacity = peakOpacity;
    halo.life = duration;
    halo.maxLife = duration;
  }

  public setActorPosition(playerId: string, x: number, y: number, z: number): void {
    this.actorPositions.set(playerId, { x, y, z });
  }

  public spawnLightningSpline(
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    colorHex = 0x38bdf8,
    width = 0.28,
    jitter = 0.55,
    duration = 0.22,
    peakOpacity = 0.80
  ): void {
    const item = this.lightningSplines[this.lightningCursor % this.lightningSplines.length];
    const seed = this.lightningCursor * 1.73 + 0.37;
    this.lightningCursor++;
    updateLightningRibbonGeometry(item.mesh.geometry, x1, y1, z1, x2, y2, z2, width, jitter, seed);
    const capped = clampAdditiveOpacity(peakOpacity);
    item.mesh.material.color.setHex(colorHex);
    item.mesh.material.opacity = capped;
    item.mesh.visible = true;
    item.peakOpacity = capped;
    item.life = duration;
    item.maxLife = duration;
  }

  // LAYER 1: CORE FLASH
  public spawnCoreFlash(x: number, y: number, z: number, colorHex: number, peakScale = 1.6, duration = 0.14): void {
    const fl = this.coreFlashes[this.flashCursor % this.coreFlashes.length];
    this.flashCursor++;
    fl.mesh.position.set(x, y, z);
    fl.mesh.rotation.set(Math.random() * 2, Math.random() * 2, Math.random() * 2);
    fl.mesh.scale.setScalar(0.28);
    fl.mesh.material.color.setHex(colorHex);
    fl.mesh.material.opacity = 0.82;
    fl.mesh.visible = true;
    fl.life = duration;
    fl.maxLife = duration;
    fl.peakScale = peakScale * 0.72;
  }

  // LAYER 2: SHAPE LAYER HELPERS
  public spawnShockwave(
    x: number,
    y: number,
    z: number,
    colorHex: number,
    maxRadius = 6.0,
    duration = 0.48,
    tiltX = -Math.PI * 0.5,
    reverse = false
  ): void {
    const sw = this.shockwaves[this.shockCursor % this.shockwaves.length];
    this.shockCursor++;
    sw.mesh.position.set(x, y + 0.26, z);
    sw.mesh.rotation.set(tiltX, 0, Math.random() * Math.PI);
    sw.mesh.material.color.setHex(colorHex);
    sw.mesh.material.opacity = 0.78;
    sw.startScale = reverse ? maxRadius : 0.45;
    sw.mesh.scale.setScalar(sw.startScale);
    sw.mesh.visible = true;
    sw.age = 0.001;
    sw.maxAge = duration;
    sw.maxRadius = maxRadius;
    sw.reverse = reverse;
  }

  public spawnSlash(
    x: number,
    y: number,
    z: number,
    rotY: number,
    colorHex: number,
    scale = 1.3,
    tilt = Math.PI * 0.42,
    spinSpeed = 0,
    rollZ = (Math.random() - 0.5) * 0.55,
    duration = 0.24
  ): void {
    const sl = this.slashes[this.slashCursor % this.slashes.length];
    this.slashCursor++;
    sl.mesh.position.set(x, y, z);
    sl.mesh.rotation.set(tilt, rotY, rollZ);
    sl.mesh.scale.setScalar(scale);
    sl.mesh.material.color.setHex(colorHex);
    sl.mesh.material.opacity = 0.78;
    if (sl.mesh.children[0]) {
      ((sl.mesh.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.84;
    }
    sl.mesh.visible = true;
    sl.life = duration;
    sl.maxLife = duration;
    sl.spinSpeed = spinSpeed;
    sl.growSpeed = scale * 0.85;
  }

  public spawnFunnel(
    x: number,
    y: number,
    z: number,
    colorHex: number,
    startScaleX: number,
    endScaleX: number,
    scaleY: number,
    duration = 0.48,
    spinSpeed = 16
  ): void {
    const fn = this.funnels[this.funnelCursor % this.funnels.length];
    this.funnelCursor++;
    fn.mesh.position.set(x, y, z);
    fn.mesh.scale.set(startScaleX, scaleY, startScaleX);
    fn.mesh.material.color.setHex(colorHex);
    fn.mesh.material.opacity = 0.74;
    fn.mesh.visible = true;
    fn.life = duration;
    fn.maxLife = duration;
    fn.spinSpeed = spinSpeed;
    fn.startScaleX = startScaleX;
    fn.endScaleX = endScaleX;
    fn.scaleY = scaleY;
    fn.baseY = y;
  }

  public spawnTracer(
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    colorHex: number,
    thickness = 1.0,
    duration = 0.22
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.08) return;
    const tr = this.tracers[this.tracerCursor % this.tracers.length];
    this.tracerCursor++;
    tr.mesh.position.set((x1 + x2) * 0.5, (y1 + y2) * 0.5, (z1 + z2) * 0.5);
    _tmpV1.set(x1, y1, z1);
    _tmpV2.set(x2, y2, z2);
    tr.mesh.lookAt(_tmpV2);
    tr.mesh.scale.set(thickness, thickness, len);
    tr.mesh.material.color.setHex(colorHex);
    tr.mesh.material.opacity = 0.80;
    tr.mesh.visible = true;
    tr.life = duration;
    tr.maxLife = duration;
    tr.startScaleX = thickness;
  }

  public spawnPillar(x: number, y: number, z: number, colorHex: number, scale = 1.0, duration = 0.45): void {
    const clampedScale = Math.min(scale, 1.4);
    const pl = this.pillars[this.pillarCursor % this.pillars.length];
    this.pillarCursor++;
    pl.mesh.position.set(x, y, z);
    pl.mesh.scale.set(clampedScale, 1.0, clampedScale);
    pl.mesh.material.color.setHex(colorHex);
    pl.mesh.material.opacity = 0.58;
    pl.mesh.visible = true;
    pl.life = duration;
    pl.maxLife = duration;
    pl.baseScale = clampedScale;
  }

  public spawnBeam(x: number, y: number, z: number, dirX: number, dirZ: number, colorHex: number): void {
    const b = this.beams[this.beamCursor % this.beams.length];
    this.beamCursor++;
    b.mesh.position.set(x, y, z);
    b.mesh.rotation.set(0, Math.atan2(dirX, dirZ), 0);
    b.mesh.material.color.setHex(0xfef9c3);
    b.mesh.material.opacity = 0.78;
    b.coilA.material.color.setHex(colorHex);
    b.coilB.material.color.setHex(0x06b6d4);
    b.coilA.material.opacity = 0.74;
    b.coilB.material.opacity = 0.72;
    b.mesh.scale.set(1.05, 1.05, 1.0);
    b.mesh.visible = true;
    b.life = 0.58;
    b.maxLife = 0.58;
  }

  public spawnGhost(
    x: number,
    y: number,
    z: number,
    colorHex: number,
    vx = 0,
    vy = 0,
    vz = 0,
    duration = 0.28,
    opacity = 0.58
  ): void {
    const g = this.ghosts[this.ghostCursor % this.ghosts.length];
    this.ghostCursor++;
    const capped = clampAdditiveOpacity(opacity);
    g.mesh.position.set(x, y + 0.85, z);
    g.mesh.material.color.setHex(colorHex);
    g.mesh.material.opacity = capped;
    g.mesh.scale.setScalar(1.0);
    g.mesh.visible = true;
    g.vx = vx;
    g.vy = vy;
    g.vz = vz;
    g.life = duration;
    g.maxLife = duration;
    g.baseOpacity = capped;
  }

  // LAYER 3: DISSIPATION HELPERS
  public spawnSparks(
    x: number,
    y: number,
    z: number,
    colorHex: number,
    count = 8,
    speedBoost = 1.0,
    gravity = 14,
    duration = 0.32
  ): void {
    const scaled = Math.max(1, Math.round(count * this.qualityScale));
    const clampedCount = this.isMobileDevice ? Math.min(scaled, 4) : Math.min(scaled, 8);
    for (let i = 0; i < clampedCount; i++) {
      const sp = this.sparks[this.sparkCursor % this.sparks.length];
      this.sparkCursor++;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const spd = (5 + Math.random() * 7.5) * speedBoost;
      sp.vx = Math.sin(phi) * Math.cos(theta) * spd;
      sp.vy = Math.abs(Math.cos(phi)) * spd + 1.4;
      sp.vz = Math.sin(phi) * Math.sin(theta) * spd;
      sp.gravity = gravity;
      sp.mesh.position.set(x, y, z);
      _tmpV1.set(sp.vx, sp.vy, sp.vz).normalize();
      sp.mesh.quaternion.setFromUnitVectors(_upVec, _tmpV1);
      sp.mesh.scale.setScalar(0.85 + Math.random() * 0.45);
      sp.mesh.material.color.setHex(colorHex);
      sp.mesh.material.opacity = 0.84;
      sp.mesh.visible = true;
      sp.life = duration;
      sp.maxLife = duration;
      sp.orientToVel = true;
    }
  }

  public spawnPuffs(
    x: number,
    y: number,
    z: number,
    colorHex: number,
    count = 6,
    spread = 0.8,
    riseSpeed = 1.8,
    startScale = 0.55,
    endScale = 1.65,
    duration = 0.55,
    opacity = 0.68
  ): void {
    const scaled = Math.max(1, Math.round(count * this.qualityScale));
    const clampedCount = this.isMobileDevice ? Math.min(scaled, 3) : Math.min(scaled, 5);
    const cappedOp = Math.min(0.86, Math.max(0.28, opacity));
    for (let i = 0; i < clampedCount; i++) {
      const pf = this.puffs[this.puffCursor % this.puffs.length];
      this.puffCursor++;
      const ang = Math.random() * Math.PI * 2;
      const spd = (0.5 + Math.random() * 1.4) * spread;
      pf.vx = Math.cos(ang) * spd;
      pf.vy = riseSpeed * (0.65 + Math.random() * 0.7);
      pf.vz = Math.sin(ang) * spd;
      pf.rotSpeed = (Math.random() - 0.5) * 2.4;
      pf.sprite.position.set(x + (Math.random() - 0.5) * 0.5, y + Math.random() * 0.35, z + (Math.random() - 0.5) * 0.5);
      pf.sprite.scale.setScalar(startScale * 1.45);
      pf.sprite.material.color.setHex(colorHex);
      pf.sprite.material.rotation = Math.random() * Math.PI * 2;
      pf.sprite.material.opacity = cappedOp;
      pf.sprite.visible = true;
      pf.life = duration;
      pf.maxLife = duration;
      pf.startScale = startScale * 1.45;
      pf.endScale = endScale * 1.45;
      pf.baseOpacity = cappedOp;
    }
  }

  public spawnCracks(x: number, groundY: number, z: number, colorHex: number, count = 3, lengthScale = 1.0, duration = 0.85): void {
    const effCount = Math.max(1, Math.min(3, Math.round(count * 0.5 * this.qualityScale)));
    for (let i = 0; i < effCount; i++) {
      const cr = this.cracks[this.crackCursor % this.cracks.length];
      this.crackCursor++;
      const jitter = i === 0 ? 0 : 0.35;
      cr.mesh.position.set(
        x + (Math.random() - 0.5) * jitter,
        groundY + 0.26,
        z + (Math.random() - 0.5) * jitter
      );
      cr.mesh.rotation.set(0, Math.random() * Math.PI * 2, 0);
      const sc = lengthScale * (0.95 + Math.random() * 0.35);
      cr.mesh.scale.set(sc, 1, sc);
      cr.mesh.material.color.setHex(colorHex);
      cr.mesh.material.opacity = 0.68;
      cr.mesh.visible = true;
      cr.life = duration;
      cr.maxLife = duration;
    }
  }

  public spawnCasings(x: number, y: number, z: number, floorY: number, rightX: number, rightZ: number, count = 2): void {
    for (let i = 0; i < count; i++) {
      const cs = this.casings[this.casingCursor % this.casings.length];
      this.casingCursor++;
      cs.mesh.position.set(x, y, z);
      cs.vx = rightX * (2.6 + Math.random() * 1.4) + (Math.random() - 0.5) * 1.2;
      cs.vy = 3.2 + Math.random() * 1.8;
      cs.vz = rightZ * (2.6 + Math.random() * 1.4) + (Math.random() - 0.5) * 1.2;
      cs.floorY = floorY + 0.05;
      cs.life = 0.68;
      cs.maxLife = 0.68;
      (cs.mesh.material as THREE.MeshStandardMaterial).opacity = 1;
      cs.mesh.visible = true;
    }
  }

  public spawnVortexDebris(x: number, y: number, z: number, radius: number, colorHex: number, count = 14): void {
    const effCount = Math.max(4, Math.round(count * this.qualityScale));
    for (let i = 0; i < effCount; i++) {
      const db = this.vortexDebris[this.debrisCursor % this.vortexDebris.length];
      this.debrisCursor++;
      db.centerX = x;
      db.centerY = y;
      db.centerZ = z;
      db.angle = (i / effCount) * Math.PI * 2 + Math.random() * 0.5;
      db.radius = radius * (0.65 + Math.random() * 0.45);
      db.inwardSpeed = (db.radius / 0.44) * 0.85;
      db.angularSpeed = 9 + Math.random() * 6;
      db.heightOffset = 0.25 + Math.random() * 1.65;
      db.life = 0.44;
      db.maxLife = 0.44;
      db.mesh.material.color.setHex(i % 2 === 0 ? colorHex : 0x78716c);
      db.mesh.material.opacity = 0.9;
      db.mesh.visible = true;
    }
  }

  private spawnStormClouds(x: number, y: number, z: number): void {
    const sc = this.stormClouds[this.cloudCursor % this.stormClouds.length];
    this.cloudCursor++;
    sc.group.position.set(x, y + 10.5, z);
    sc.group.scale.setScalar(1.2);
    sc.life = 1.6;
    sc.maxLife = 1.6;
    sc.group.visible = true;
  }

  private spawnMarkGlyph(x: number, y: number, z: number): void {
    const mg = this.markGlyphs[this.glyphCursor % this.markGlyphs.length];
    this.glyphCursor++;
    mg.group.position.set(x, y + 0.95, z);
    mg.group.scale.setScalar(0.5);
    mg.life = 0.85;
    mg.maxLife = 0.85;
    mg.group.visible = true;
  }

  public spawnRubbleBurst(x: number, groundY: number, z: number, radius = 3.0, colorHex = 0x94a3b8): void {
    this.spawnCoreFlash(x, groundY + 1.2, z, 0xfef08a, 2.0, 0.16);
    this.spawnShockwave(x, groundY + 0.08, z, colorHex, Math.max(4.5, radius * 2.2), 0.48);
    this.spawnShockwave(x, groundY + 0.14, z, 0xea580c, Math.max(3.2, radius * 1.5), 0.36);
    this.spawnDarkSpiderCracks(x, groundY, z, colorHex, 2, Math.max(1.2, radius * 0.65), 1.45);
    this.spawnPuffs(x, groundY + 0.65, z, 0x1c1917, 6, 2.0, 2.8, 0.7, 2.6, 0.72, 0.76);
    this.spawnSparks(x, groundY + 1.1, z, colorHex, 16, 1.45, 16, 0.45);
  }

  public spawnSpellSigil(x: number, groundY: number, z: number, colorHex: number, scale = 2.6, duration = 0.55): void {
    const sg = this.spellSigils[this.sigilCursor % this.spellSigils.length];
    this.sigilCursor++;
    sg.group.position.set(x, groundY + 0.28, z);
    sg.group.scale.setScalar(scale * 0.55);
    sg.baseScale = scale;
    sg.life = duration;
    sg.maxLife = duration;
    sg.group.children.forEach((c, idx) => {
      const mat = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.color.setHex(idx === 0 ? colorHex : 0xfef9c3);
      mat.opacity = 0.76;
    });
    sg.group.visible = true;
  }

  private spawnTether(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, colorHex: number, duration = 0.35): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.1) return;
    const th = this.tethers[this.tetherCursor % this.tethers.length];
    this.tetherCursor++;
    th.mesh.position.set((x1 + x2) * 0.5, (y1 + y2) * 0.5, (z1 + z2) * 0.5);
    th.mesh.lookAt(x2, y2, z2);
    th.mesh.scale.set(1.2, 1.2, len);
    th.mesh.material.color.setHex(colorHex);
    th.mesh.material.opacity = 0.78;
    th.mesh.visible = true;
    th.life = duration;
    th.maxLife = duration;
  }

  public spawnCrescentRibbon(
    x: number,
    y: number,
    z: number,
    yaw: number,
    rollZ: number,
    outerHex = 0x06b6d4,
    innerHex = 0xfef9c3,
    scale = 1.45,
    spinSpeed = 20,
    duration = 0.26,
    tiltX = Math.PI * 0.42
  ): void {
    const cr = this.crescentRibbons[this.crescentCursor % this.crescentRibbons.length];
    this.crescentCursor++;
    cr.group.position.set(x, Math.max(0.45, y), z);
    cr.group.rotation.set(tiltX, yaw, rollZ);
    cr.group.scale.setScalar(scale);
    cr.outer.material.color.setHex(outerHex);
    cr.outer.material.opacity = 0.76;
    cr.inner.material.color.setHex(innerHex);
    cr.inner.material.opacity = 0.84;
    cr.group.visible = true;
    cr.life = duration;
    cr.maxLife = duration;
    cr.spinSpeed = spinSpeed;
    cr.growSpeed = scale * 0.72;
  }

  public spawnShockTorus(
    x: number,
    y: number,
    z: number,
    colorHex = 0xfef08a,
    startScale = 0.45,
    maxRadius = 4.6,
    duration = 0.42
  ): void {
    const st = this.shockTori[this.shockTorusCursor % this.shockTori.length];
    this.shockTorusCursor++;
    st.mesh.position.set(x, Math.max(0.36, y), z);
    st.mesh.rotation.set(0, Math.random() * Math.PI, 0);
    st.mesh.scale.set(startScale, startScale, 1);
    st.mesh.material.color.setHex(colorHex);
    st.mesh.material.opacity = 0.78;
    st.mesh.visible = true;
    st.age = 0.001;
    st.maxAge = duration;
    st.startScale = startScale;
    st.maxRadius = maxRadius;
  }

  public spawnSpikeCrown(
    x: number,
    groundY: number,
    z: number,
    primaryHex = 0xfef08a,
    secondaryHex = 0x06b6d4,
    scale = 1.1,
    duration = 0.48
  ): void {
    const sc = this.spikeCrowns[this.spikeCrownCursor % this.spikeCrowns.length];
    this.spikeCrownCursor++;
    sc.group.position.set(x, groundY + 0.25, z);
    sc.group.rotation.y = Math.random() * Math.PI * 2;
    sc.group.scale.set(scale * 0.65, 0.2, scale * 0.65);
    sc.baseScale = scale;
    sc.life = duration;
    sc.maxLife = duration;
    for (let i = 0; i < sc.spikes.length; i++) {
      sc.spikes[i].material.color.setHex(i % 2 === 0 ? primaryHex : secondaryHex);
      sc.spikes[i].material.opacity = 0.78;
    }
    sc.group.visible = true;
  }

  public spawnDarkSpiderCracks(
    x: number,
    groundY: number,
    z: number,
    accentHex = 0xfacc15,
    count = 2,
    lengthScale = 1.35,
    duration = 1.25
  ): void {
    const eff = Math.max(1, Math.min(3, Math.round(count * 0.4 * this.qualityScale)));
    for (let i = 0; i < eff; i++) {
      const dc = this.darkCracks[this.darkCrackCursor % this.darkCracks.length];
      this.darkCrackCursor++;
      const jitter = i === 0 ? 0 : 0.4;
      dc.mesh.position.set(
        x + (Math.random() - 0.5) * jitter,
        groundY + 0.25,
        z + (Math.random() - 0.5) * jitter
      );
      dc.mesh.rotation.set(0, Math.random() * Math.PI * 2, 0);
      const sc = lengthScale * (1.05 + Math.random() * 0.25);
      dc.mesh.scale.set(sc, 1, sc);
      dc.mesh.material.color.setHex(i % 2 === 0 ? 0x09090b : 0x1c1917);
      dc.mesh.material.opacity = 0.86;
      dc.mesh.visible = true;
      dc.life = duration;
      dc.maxLife = duration;
    }
    this.spawnCracks(x, groundY, z, accentHex, 2, lengthScale * 0.92, duration * 0.82);
  }

  public spawnCraterSlabs(
    x: number,
    groundY: number,
    z: number,
    radius = 3.0,
    count = 10,
    zeroGravSec = 0.42
  ): void {
    const eff = Math.max(3, Math.round(count * this.qualityScale));
    const clamped = this.isMobileDevice ? Math.min(eff, 6) : Math.min(eff, 14);
    for (let i = 0; i < clamped; i++) {
      const sl = this.craterSlabs[this.slabCursor % this.craterSlabs.length];
      this.slabCursor++;
      const ang = (i / clamped) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const rOff = 0.45 + Math.random() * Math.max(0.8, radius * 0.55);
      sl.mesh.position.set(x + Math.cos(ang) * rOff, groundY + 0.32, z + Math.sin(ang) * rOff);
      const sx = 0.75 + Math.random() * 0.65;
      const sy = 0.42 + Math.random() * 0.3;
      const sz = 0.85 + Math.random() * 0.65;
      sl.mesh.scale.set(sx, sy, sz);
      sl.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      const outSpd = 1.8 + Math.random() * 3.4;
      sl.vx = Math.cos(ang) * outSpd;
      sl.vy = 5.4 + Math.random() * 3.8;
      sl.vz = Math.sin(ang) * outSpd;
      sl.rotVx = (Math.random() - 0.5) * 7.5;
      sl.rotVy = (Math.random() - 0.5) * 7.5;
      sl.rotVz = (Math.random() - 0.5) * 7.5;
      sl.floatTimer = zeroGravSec;
      sl.floorY = groundY + 0.26;
      sl.life = 1.15;
      sl.maxLife = 1.15;
      sl.mesh.material.opacity = 0.96;
      sl.mesh.visible = true;
    }
  }

  public spawnBeamVTrench(
    x: number,
    groundY: number,
    z: number,
    dirX: number,
    dirZ: number,
    length = 16,
    colorHex = 0x06b6d4
  ): void {
    const yaw = Math.atan2(dirX, dirZ);
    const steps = Math.min(6, Math.max(3, Math.floor(length / 3.0)));
    for (let i = 0; i < steps; i++) {
      const vt = this.vTrenchRidges[this.trenchCursor % this.vTrenchRidges.length];
      this.trenchCursor++;
      const dist = 1.6 + i * 3.1;
      vt.group.position.set(x + dirX * dist, groundY, z + dirZ * dist);
      vt.group.rotation.set(0, yaw, 0);
      vt.leftSlab.material.opacity = 0.92;
      vt.rightSlab.material.opacity = 0.92;
      vt.glowStrip.material.color.setHex(colorHex);
      vt.glowStrip.material.opacity = 0.34;
      vt.life = 1.05;
      vt.maxLife = 1.05;
      vt.group.visible = true;
    }
    const midX = x + dirX * Math.min(6.5, length * 0.35);
    const midZ = z + dirZ * Math.min(6.5, length * 0.35);
    this.spawnCraterSlabs(midX, groundY, midZ, 2.8, 8, 0.32);
  }

  public spawnCraterSlam(
    x: number,
    groundY: number,
    z: number,
    radius = 3.6,
    primaryHex = 0xfef08a,
    secondaryHex = 0x06b6d4,
    withCrown = false
  ): void {
    this.spawnPointLightFlash(x, groundY + 1.1, z, primaryHex, 7.8, 0.28, 13);
    this.spawnCoreFlash(x, groundY + 0.85, z, 0xfef9c3, 2.0, 0.16);
    this.spawnShockTorus(x, groundY + 0.38, z, primaryHex, 0.5, Math.max(3.6, radius * 1.15), 0.42);
    this.spawnShockwave(x, groundY + 0.04, z, secondaryHex, Math.max(4.2, radius * 1.35), 0.48);
    this.spawnDarkSpiderCracks(x, groundY, z, primaryHex, 2, Math.max(1.1, radius * 0.42), 1.35);
    this.spawnCraterSlabs(x, groundY, z, radius, 11, 0.44);
    this.spawnSparks(x, groundY + 0.9, z, primaryHex, 14, 1.45, 11, 0.38);
    if (withCrown) {
      this.spawnSpikeCrown(x, groundY, z, primaryHex, secondaryHex, Math.max(0.95, radius * 0.32), 0.48);
    }
  }

  private spawnComboLinkBridge(ev: CombatEvent, mapId: MapId): void {
    if (ev.originX === undefined || ev.originZ === undefined) return;
    const originGround = getMapTerrainHeight(mapId, ev.originX, ev.originZ);
    const destGround = getMapTerrainHeight(mapId, ev.x, ev.z);
    const ox = ev.originX;
    const oy = (ev.originY ?? 1.0) + originGround;
    const oz = ev.originZ;
    const dx = ev.x;
    const dy = ev.y + destGround;
    const dz = ev.z;
    const dist = Math.hypot(dx - ox, dz - oz);
    if (dist < 0.35) return;

    const fId = ev.fighterId;
    const bridgeColor =
      fId === 'marjohn'
        ? 0x2dd4bf
        : fId === 'prime'
        ? 0xea580c
        : fId === 'damen'
        ? 0xf59e0b
        : fId === 'khen'
        ? 0xa855f7
        : 0x06b6d4;

    // Continuous streaking bridge trail connecting origin -> destination
    this.spawnTracer(ox, oy, oz, dx, dy, dz, bridgeColor, 1.8, 0.32);
    const steps = Math.min(7, Math.max(3, Math.ceil(dist * 1.2)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const mx = THREE.MathUtils.lerp(ox, dx, t);
      const my = THREE.MathUtils.lerp(oy, dy, t);
      const mz = THREE.MathUtils.lerp(oz, dz, t);
      if (fId === 'prime') {
        this.spawnCracks(mx, destGround, mz, 0xea580c, 1, 0.65, 0.7);
        this.spawnSparks(mx, my, mz, 0xfbbf24, 2, 0.7, 8, 0.35);
      } else if (fId === 'khen') {
        this.spawnSparks(mx, my, mz, 0xa855f7, 3, 0.8, 4, 0.3);
        if (i % 2 === 0) this.spawnShockwave(mx, my - 0.6, mz, 0x7e22ce, 1.6, 0.28, Math.PI * 0.5);
      } else {
        this.spawnPuffs(mx, my, mz, 0x1c1917, 1, 0.4, 1.2, 0.35, 0.9, 0.38, 0.48);
        this.spawnSparks(mx, my, mz, bridgeColor, 2, 0.65, 6, 0.28);
      }
    }
  }

  private handleCastEvent(ev: CombatEvent, mapId: MapId): void {
    const groundY = getMapTerrainHeight(mapId, ev.x, ev.z);
    const wy = groundY + ev.y;
    const fx = ev.dirX ?? 0;
    const fz = ev.dirZ ?? 1;
    const yaw = Math.atan2(fx, fz);
    const rightX = -fz;
    const rightZ = fx;
    const fId = ev.fighterId;
    const slot = ev.abilitySlot ?? 0;

    if (ev.isComboLink) {
      this.spawnComboLinkBridge(ev, mapId);
    }

    // GUARD CASTS
    if (slot === 1) {
      if (fId === 'marjohn') {
        this.spawnCoreFlash(ev.x, wy, ev.z, 0x5eead4, 1.1, 0.14);
        this.spawnShockwave(ev.x, wy - 0.4, ev.z, 0x2dd4bf, 2.2, 0.32);
      } else if (fId === 'prime') {
        this.spawnCoreFlash(ev.x, wy, ev.z, 0xdc2626, 1.15, 0.12);
      } else if (fId === 'khen') {
        this.spawnSlash(ev.x + fx * 0.45, wy, ev.z + fz * 0.45, yaw, 0x7e22ce, 0.85, Math.PI * 0.12, 0, 0.78, 0.26);
        this.spawnSlash(ev.x + fx * 0.45, wy, ev.z + fz * 0.45, yaw, 0xddd6fe, 0.85, Math.PI * 0.12, 0, -0.78, 0.26);
      } else if (fId === 'jm') {
        this.spawnCoreFlash(ev.x, wy, ev.z, 0xfef9c3, 1.2, 0.14);
        this.spawnShockwave(ev.x, groundY + 0.04, ev.z, 0x06b6d4, 2.6, 0.32);
        this.spawnShockwave(ev.x, groundY + 0.08, ev.z, 0xfacc15, 2.0, 0.28);
        this.spawnCrescentRibbon(ev.x, wy + 0.1, ev.z, yaw, 0.15, 0x06b6d4, 0xfef9c3, 1.25, 22, 0.26, Math.PI * 0.48);
      } else {
        this.spawnCoreFlash(ev.x, wy, ev.z, ev.colorHex, 1.05, 0.12);
      }
      return;
    }

    // M1 CASTS (Unique per fighter & 4-hit combos!)
    if (slot === 0) {
      const step = ev.comboStep ?? 1;
      const hitX = ev.x + fx * 1.15;
      const hitZ = ev.z + fz * 1.15;

      if (fId === 'marjohn') {
        this.spawnCoreFlash(ev.x + fx * 0.75, wy, ev.z + fz * 0.75, 0x5eead4, 1.25, 0.14);
        this.spawnFunnel(ev.x + fx * 0.7, wy - 0.65, ev.z + fz * 0.7, 0x2dd4bf, 0.45, 0.85, 0.9, 0.28, 22);
        this.spawnSparks(hitX, wy, hitZ, 0x5eead4, 7, 1.0, 4, 0.28);
        this.spawnPuffs(hitX, wy - 0.2, hitZ, 0xcbd5e1, 3, 0.8, 1.2, 0.3, 1.0, 0.36, 0.46);
      } else if (fId === 'prime') {
        const fiery = step === 4 ? 0xfbbf24 : 0xea580c;
        this.spawnCoreFlash(ev.x + fx * 0.7, wy, ev.z + fz * 0.7, fiery, step === 4 ? 2.1 : 1.2, 0.14);
        this.spawnGhost(ev.x + fx * 0.4, groundY + ev.y - 0.9, ev.z + fz * 0.4, 0xdc2626, fx * 2, 0, fz * 2, 0.24, 0.34);
        this.spawnSparks(hitX, wy, hitZ, 0xea580c, step === 4 ? 16 : 7, 1.2, 10, 0.34);
        if (step >= 3) {
          this.spawnDarkSpiderCracks(hitX, groundY, hitZ, 0xea580c, step === 4 ? 2 : 1, step === 4 ? 1.4 : 0.7, 0.85);
        }
        if (step === 4) {
          this.spawnShockwave(ev.x, groundY, ev.z, 0xdc2626, 4.4, 0.38);
          this.spawnPuffs(hitX, groundY + 0.35, hitZ, 0x1c1917, 6, 1.4, 2.4, 0.5, 1.9, 0.65, 0.72);
          this.spawnPointLightFlash(ev.x, groundY + 1.0, ev.z, 0xea580c, 6.5, 0.24, 12);
        }
      } else if (fId === 'damen') {
        const barrelX = ev.x + fx * 0.85;
        const barrelZ = ev.z + fz * 0.85;
        const endX = ev.x + fx * 10.0;
        const endZ = ev.z + fz * 10.0;
        this.spawnCoreFlash(barrelX, wy, barrelZ, 0xfbbf24, 1.15, 0.09);
        this.spawnTracer(barrelX, wy, barrelZ, endX, wy, endZ, 0xf59e0b, 0.68, 0.15);
        this.spawnCasings(ev.x + rightX * 0.35, wy, ev.z + rightZ * 0.35, groundY, rightX, rightZ, 1);
        this.spawnPuffs(barrelX, wy, barrelZ, 0x475569, 2, 0.6, 1.4, 0.24, 0.85, 0.42, 0.55);
      } else if (fId === 'khen') {
        this.spawnCoreFlash(ev.x + fx * 0.7, wy, ev.z + fz * 0.7, step === 4 ? 0xddd6fe : 0xa855f7, step === 4 ? 1.8 : 1.1, 0.12);
        this.spawnSlash(hitX, wy, hitZ, yaw + 0.35, 0xa855f7, step === 4 ? 2.0 : 1.25, Math.PI * 0.28, -22, 0.65);
        this.spawnSlash(hitX, wy, hitZ, yaw - 0.35, 0x7e22ce, step === 4 ? 1.85 : 1.1, -Math.PI * 0.28, 22, -0.65);
        this.spawnGhost(ev.x, groundY + ev.y - 0.9, ev.z, 0x581c87, -fx * 1.6, 0, -fz * 1.6, 0.24, 0.36);
        if (step === 4) {
          this.spawnTracer(ev.x, wy, ev.z, ev.x + fx * 4.5, wy, ev.z + fz * 4.5, 0xddd6fe, 1.5, 0.24);
          this.spawnShockwave(hitX, wy - 0.45, hitZ, 0xa855f7, 4.4, 0.34);
          this.spawnPointLightFlash(hitX, wy, hitZ, 0x7e22ce, 6.0, 0.22, 11);
        }
        this.spawnPuffs(hitX, wy, hitZ, 0x09090b, step === 4 ? 5 : 2, 0.8, 1.2, 0.38, 1.25, 0.48, 0.72);
      } else {
        const isAirBolt = ev.y > 1.2 && step === 1;
        if (isAirBolt) {
          this.spawnCoreFlash(ev.x + fx * 0.7, wy, ev.z + fz * 0.7, 0xfef9c3, 1.25, 0.11);
          this.spawnShockTorus(ev.x + fx * 0.6, wy, ev.z + fz * 0.6, 0x06b6d4, 0.32, 1.35, 0.2);
          this.spawnSparks(ev.x + fx * 0.7, wy, ev.z + fz * 0.7, 0xfacc15, 6, 0.9, 2, 0.24);
        } else if (step === 4) {
          this.spawnCoreFlash(ev.x + fx * 0.7, wy, ev.z + fz * 0.7, 0xfef9c3, 2.0, 0.15);
          this.spawnGhost(ev.x, groundY + ev.y - 0.9, ev.z, 0x06b6d4, fx * 2.4, 0, fz * 2.4, 0.24, 0.38);
          this.spawnCrescentRibbon(hitX, wy, hitZ, yaw, 0.25, 0x06b6d4, 0xfef9c3, 1.85, 22, 0.28);
          this.spawnCraterSlam(hitX, groundY, hitZ, 3.6, 0xfacc15, 0x06b6d4, false);
        } else {
          const swingRoll = step === 1 ? 0.55 : step === 2 ? -0.62 : 0.15;
          const swingDir = step === 2 ? -22 : 22;
          this.spawnCoreFlash(ev.x + fx * 0.7, wy, ev.z + fz * 0.7, 0xfef9c3, 1.25, 0.12);
          this.spawnShockTorus(ev.x + fx * 0.55, wy, ev.z + fz * 0.55, 0xfacc15, 0.28, 1.4, 0.2);
          this.spawnCrescentRibbon(
            ev.x + fx * 0.55,
            wy + 0.05,
            ev.z + fz * 0.55,
            yaw,
            swingRoll,
            0x06b6d4,
            0xfef9c3,
            step === 3 ? 1.65 : 1.35,
            swingDir,
            0.25
          );
          this.spawnSparks(hitX, wy, hitZ, step % 2 === 0 ? 0x06b6d4 : 0xfef08a, 8, 1.1, 6, 0.28);
        }
      }
      return;
    }

    // RESTORED CHARACTER SKILL CAST (Slot 2)
    if (slot === 2) {
      this.spawnSpellSigil(ev.x, groundY, ev.z, ev.colorHex, 2.3, 0.42);
      this.spawnCoreFlash(ev.x, wy, ev.z, ev.colorHex, 1.45, 0.14);
      this.spawnSparks(ev.x, wy, ev.z, ev.colorHex, 10, 1.1, 6, 0.32);
      return;
    }

    // SKILL WINDUP / CAST (Slot 3)
    if (slot === 3) {
      this.spawnSpellSigil(ev.x, groundY, ev.z, ev.colorHex, 2.7, 0.52);
      if (fId === 'marjohn') {
        this.spawnCoreFlash(ev.x, wy, ev.z, 0x5eead4, 1.5, 0.16);
        this.spawnFunnel(ev.x, groundY + ev.y - 0.95, ev.z, ev.isComboLink ? 0x5eead4 : 0x14b8a6, 0.85, 3.2, 1.65, 0.48, 22);
        this.spawnVortexDebris(ev.x, groundY + ev.y - 0.9, ev.z, ev.isComboLink ? 5.2 : 4.2, 0x2dd4bf, ev.isComboLink ? 22 : 14);
        this.spawnPuffs(ev.x, wy - 0.4, ev.z, 0xcbd5e1, 5, 1.6, 1.2, 0.4, 1.4, 0.48, 0.48);
      } else if (fId === 'prime') {
        this.spawnCoreFlash(ev.x, wy, ev.z, 0xea580c, 1.5, 0.14);
        this.spawnTracer(ev.x, wy, ev.z, ev.x + fx * 3.0, wy + 1.8, ev.z + fz * 3.0, 0xdc2626, 1.5, 0.25);
        this.spawnSparks(ev.x, wy, ev.z, 0xfbbf24, 10, 1.2, 12, 0.35);
        this.spawnPuffs(ev.x, wy, ev.z, 0x1c1917, 3, 1.0, 1.6, 0.4, 1.3, 0.46, 0.65);
      } else if (fId === 'damen') {
        this.spawnCoreFlash(ev.x + fx * 0.7, wy, ev.z + fz * 0.7, 0xf59e0b, 1.25, 0.1);
        this.spawnPuffs(ev.x + fx * 0.7, wy, ev.z + fz * 0.7, 0x475569, 2, 0.7, 1.2, 0.26, 0.9, 0.4, 0.5);
      } else if (fId === 'khen') {
        this.spawnCoreFlash(ev.x + fx * 0.6, wy, ev.z + fz * 0.6, 0xa855f7, 1.35, 0.12);
        this.spawnPuffs(ev.x + fx * 0.6, wy, ev.z + fz * 0.6, 0x09090b, 3, 0.9, 1.0, 0.38, 1.2, 0.45, 0.72);
      } else if (fId === 'jm') {
        const bright = ev.counterFlow || ev.isComboLink;
        this.spawnCoreFlash(ev.x, wy, ev.z, 0xfef9c3, bright ? 1.85 : 1.4, 0.14);
        this.spawnCrescentRibbon(ev.x + fx * 0.5, wy + 0.3, ev.z + fz * 0.5, yaw, 0.65, 0x06b6d4, 0xfef9c3, 1.7, 22, 0.28);
        this.spawnTracer(ev.x, wy, ev.z, ev.x + fx * 2.8, wy + 2.2, ev.z + fz * 2.8, 0xfef08a, bright ? 1.8 : 1.3, 0.26);
      }
      return;
    }

    // ULTIMATE WINDUP / CAST (Slot 4)
    if (slot === 4) {
      this.spawnSpellSigil(ev.x, groundY, ev.z, ev.colorHex, 3.8, 0.72);
      if (fId === 'marjohn') {
        this.spawnStormClouds(ev.x, wy, ev.z);
        this.spawnCoreFlash(ev.x, wy, ev.z, 0x5eead4, 1.9, 0.2);
        this.spawnFunnel(ev.x, groundY, ev.z, 0x14b8a6, 0.9, 2.6, 2.8, 0.45, 24);
      } else if (fId === 'prime') {
        this.spawnCoreFlash(ev.x, wy, ev.z, 0xdc2626, 2.0, 0.22);
        this.spawnSparks(ev.x, wy, ev.z, 0xfbbf24, 14, 1.4, 10, 0.42);
        this.spawnPuffs(ev.x, groundY + 0.4, ev.z, 0x1c1917, 5, 1.6, 2.0, 0.55, 1.9, 0.58, 0.72);
      } else if (fId === 'damen') {
        this.spawnCoreFlash(ev.x, wy + 0.5, ev.z, 0xfbbf24, 1.8, 0.12);
        this.spawnShockwave(ev.x, groundY, ev.z, 0xf59e0b, 3.8, 0.38);
      } else if (fId === 'khen') {
        this.spawnCoreFlash(ev.x, wy, ev.z, 0xa855f7, 1.8, 0.2);
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2;
          const sx = ev.x + Math.cos(ang) * 4.5;
          const sz = ev.z + Math.sin(ang) * 4.5;
          this.spawnGhost(sx, groundY, sz, i % 2 === 0 ? 0x7e22ce : 0x3b0764, -Math.cos(ang) * 10, 0, -Math.sin(ang) * 10, 0.4, 0.42);
        }
      } else if (fId === 'jm') {
        this.spawnCoreFlash(ev.x + fx * 0.7, wy, ev.z + fz * 0.7, 0xfef9c3, 2.0, 0.28);
        this.spawnSparks(ev.x, wy, ev.z, 0xfef08a, 14, 1.2, -4, 0.4);
      }
      return;
    }

    // AWAKENING SKILL 4 CAST (Slot 6)
    if (slot === 6) {
      this.spawnSpellSigil(ev.x, groundY, ev.z, ev.colorHex, 4.4, 0.85);
      this.spawnPointLightFlash(ev.x, groundY + ev.y + 1.0, ev.z, ev.colorHex, 8.2, 0.32, 16);
      this.spawnCoreFlash(ev.x, wy, ev.z, 0xfef9c3, 2.2, 0.22);
      this.spawnShockwave(ev.x, groundY + 0.1, ev.z, ev.colorHex, 7.6, 0.55);
      if (fId === 'marjohn') {
        this.spawnStormClouds(ev.x, wy, ev.z);
        this.spawnFunnel(ev.x, groundY, ev.z, 0x2dd4bf, 1.3, 4.8, 3.6, 0.55, 28);
      } else if (fId === 'prime') {
        this.spawnDarkSpiderCracks(ev.x, groundY, ev.z, 0xdc2626, 3, 2.1, 1.15);
        this.spawnPuffs(ev.x, groundY + 0.5, ev.z, 0x1c1917, 6, 1.8, 2.4, 0.65, 2.2, 0.65, 0.74);
        this.spawnSparks(ev.x, wy, ev.z, 0xfbbf24, 14, 1.5, 10, 0.45);
      } else if (fId === 'damen') {
        for (let i = -3; i <= 3; i++) {
          const ang = yaw + i * 0.14;
          this.spawnCoreFlash(ev.x + Math.sin(ang) * 1.4, wy + 0.6, ev.z + Math.cos(ang) * 1.4, 0xfbbf24, 1.2, 0.11);
        }
        this.spawnPuffs(ev.x + fx * 1.2, wy + 0.5, ev.z + fz * 1.2, 0x475569, 4, 1.2, 1.4, 0.35, 1.2, 0.48, 0.58);
      } else if (fId === 'khen') {
        this.spawnPuffs(ev.x, wy, ev.z, 0x09090b, 6, 2.0, 1.8, 0.55, 2.1, 0.62, 0.75);
      } else if (fId === 'jm') {
        this.spawnPillar(ev.x, groundY, ev.z, 0x06b6d4, 1.35, 0.65);
      }
    }
  }

  private spawnFighterSignatureHit(
    fighterId: FighterId | undefined,
    x: number,
    y: number,
    z: number,
    yaw: number,
    colorHex: number,
    isHeavy: boolean,
    ev: CombatEvent
  ): void {
    // 1. RPS Counter: Strike Beats Grab -> sharp gold "clash spark" burst!
    if (ev.rpsOutcome === 'strike_beats_grab') {
      this.spawnCoreFlash(x, y, z, 0xfef08a, 1.9, 0.15);
      this.spawnSlash(x, y, z, yaw, 0xf59e0b, 1.5, Math.PI * 0.2, 24, 0.7);
      this.spawnSlash(x, y, z, yaw, 0xfef9c3, 1.5, Math.PI * 0.2, -24, -0.7);
      this.spawnSparks(x, y, z, 0xfef08a, 18, 1.5, 10, 0.35);
      return;
    }

    // Khen Predator's Mark glyph + stamina sparkle on backstab/stun!
    if (fighterId === 'khen' && ev.staminaRefund) {
      this.spawnMarkGlyph(x, y, z);
      this.spawnSparks(x, y, z, 0xddd6fe, 10, 1.1, -3, 0.38);
    }

    if (fighterId === 'marjohn') {
      this.spawnCoreFlash(x, y, z, 0x5eead4, isHeavy ? 1.65 : 1.05, 0.12);
      this.spawnSlash(x, y, z, yaw, 0x2dd4bf, isHeavy ? 1.9 : 1.35, Math.PI * 0.48, 16);
      this.spawnShockwave(x, Math.max(0, y - 0.9), z, 0x5eead4, isHeavy ? 4.8 : 2.6, 0.38);
      this.spawnSparks(x, y, z, 0x5eead4, isHeavy ? 12 : 7, 1.1, 6, 0.3);
      this.spawnPuffs(x, y, z, 0xcbd5e1, isHeavy ? 5 : 2, 0.9, 1.3, 0.32, 1.15, 0.38, 0.46);
      return;
    }
    if (fighterId === 'prime') {
      this.spawnCoreFlash(x, y, z, 0xfbbf24, isHeavy ? 1.85 : 1.2, 0.13);
      this.spawnShockwave(x, Math.max(0, y - 1.0), z, 0xdc2626, isHeavy ? 5.8 : 3.2, 0.42);
      this.spawnSparks(x, y, z, 0xea580c, isHeavy ? 16 : 9, 1.4, 14, 0.35);
      this.spawnPuffs(x, y, z, 0x1c1917, isHeavy ? 5 : 2, 1.0, 2.2, 0.45, 1.6, 0.58, 0.7);
      if (isHeavy) {
        this.spawnPillar(x, Math.max(0, y - 1.0), z, 0xdc2626, 1.1, 0.48);
        this.spawnDarkSpiderCracks(x, Math.max(0, y - 1.1), z, 0xea580c, 2, 1.15, 0.85);
      }
      return;
    }
    if (fighterId === 'damen') {
      this.spawnCoreFlash(x, y, z, 0xfbbf24, isHeavy ? 1.5 : 0.95, 0.09);
      this.spawnSlash(x, y, z, yaw, 0xf59e0b, isHeavy ? 1.5 : 0.9, Math.PI * 0.15, 22);
      this.spawnSparks(x, y, z, 0xfacc15, isHeavy ? 14 : 8, 1.35, 12, 0.3);
      this.spawnPuffs(x, y, z, 0x475569, isHeavy ? 3 : 2, 0.6, 1.4, 0.24, 0.95, 0.4, 0.54);
      return;
    }
    if (fighterId === 'khen') {
      this.spawnCoreFlash(x, y, z, 0xddd6fe, isHeavy ? 1.6 : 1.05, 0.11);
      this.spawnSlash(x, y, z, yaw + 0.5, 0xa855f7, isHeavy ? 1.75 : 1.25, Math.PI * 0.25, -20);
      this.spawnSlash(x, y, z, yaw - 0.5, 0x7e22ce, isHeavy ? 1.75 : 1.25, -Math.PI * 0.25, 20);
      this.spawnSparks(x, y, z, 0xa855f7, isHeavy ? 13 : 8, 1.2, 8, 0.32);
      this.spawnPuffs(x, y, z, 0x09090b, isHeavy ? 5 : 2, 0.8, 1.4, 0.35, 1.25, 0.48, 0.74);
      return;
    }
    // JM Solar Martial Arts
    this.spawnCoreFlash(x, y, z, 0xfef9c3, isHeavy ? 1.85 : 1.15, 0.12);
    this.spawnSlash(x, y, z, yaw, 0x06b6d4, isHeavy ? 1.85 : 1.3, Math.PI * 0.42, 14);
    this.spawnShockwave(x, Math.max(0, y - 0.9), z, 0xfacc15, isHeavy ? 5.0 : 2.5, 0.38);
    this.spawnSparks(x, y, z, colorHex, isHeavy ? 14 : 8, 1.2, 6, 0.32);
  }

  public handleEvent(ev: CombatEvent, mapId: MapId): void {
    const groundY = getMapTerrainHeight(mapId, ev.x, ev.z);
    const yaw = Math.atan2(ev.dirX ?? 0, ev.dirZ ?? 1);

    if (ev.kind === 'cast') {
      this.handleCastEvent(ev, mapId);
      return;
    }

    if (ev.kind === 'hit') {
      this.spawnFighterSignatureHit(ev.fighterId, ev.x, groundY + ev.y, ev.z, yaw, ev.colorHex, Boolean(ev.isCrit), ev);
      if (ev.isCrit || (ev.damage ?? 0) >= 18) {
        this.spawnPointLightFlash(ev.x, groundY + ev.y + 0.4, ev.z, ev.colorHex, 6.4, 0.22, 12);
      }
      return;
    }

    if (ev.kind === 'grab') {
      this.spawnPointLightFlash(ev.x, groundY + ev.y + 0.4, ev.z, ev.rpsOutcome === 'weak_to_grab' ? 0xdc2626 : 0xfacc15, 6.8, 0.24, 12);
      if (ev.rpsOutcome === 'weak_to_grab') {
        this.spawnCoreFlash(ev.x, groundY + ev.y, ev.z, 0xfef9c3, 2.0, 0.16);
        this.spawnShockwave(ev.x, groundY + ev.y, ev.z, 0xdc2626, 6.0, 0.42, Math.PI * 0.5);
        this.spawnSlash(ev.x, groundY + ev.y, ev.z, yaw, 0xfef08a, 1.6, Math.PI * 0.12, 20, 0.65);
        this.spawnSlash(ev.x, groundY + ev.y, ev.z, yaw, 0xdc2626, 1.6, Math.PI * 0.12, -20, -0.65);
      }
      this.spawnCoreFlash(ev.x, groundY + ev.y, ev.z, ev.isCrit ? 0xea580c : 0xfacc15, 1.55, 0.14);
      this.spawnShockwave(ev.x, groundY + Math.max(0, ev.y - 0.9), ev.z, ev.isCrit ? 0xdc2626 : 0xfacc15, ev.isCrit ? 5.6 : 3.2, 0.38);
      this.spawnDarkSpiderCracks(ev.x, groundY, ev.z, ev.isCrit ? 0xdc2626 : 0xf59e0b, ev.isCrit ? 2 : 1, 0.95, 0.7);
      this.spawnSparks(ev.x, groundY + ev.y, ev.z, 0xfef08a, 14, 1.3, 14, 0.32);
      return;
    }

    if (ev.kind === 'headlockBreak') {
      this.spawnCoreFlash(ev.x, groundY + ev.y, ev.z, 0x06b6d4, 1.8, 0.16);
      this.spawnShockwave(ev.x, groundY + Math.max(0, ev.y - 0.8), ev.z, 0x06b6d4, 5.2, 0.38);
      this.spawnShockwave(ev.x, groundY + ev.y, ev.z, 0xfef9c3, 3.4, 0.28, Math.PI * 0.5);
      this.spawnSparks(ev.x, groundY + ev.y, ev.z, 0x38bdf8, 16, 1.4, 8, 0.35);
      this.spawnPointLightFlash(ev.x, groundY + ev.y + 0.4, ev.z, 0x06b6d4, 6.4, 0.24, 12);
      return;
    }

    if (ev.kind === 'parry') {
      const parryColor =
        ev.fighterId === 'marjohn'
          ? 0x2dd4bf
          : ev.fighterId === 'khen'
          ? 0xa855f7
          : ev.fighterId === 'prime'
          ? 0xdc2626
          : ev.colorHex;
      this.spawnPointLightFlash(ev.x, groundY + ev.y + 0.5, ev.z, parryColor, 7.2, 0.24, 12);
      this.spawnCoreFlash(ev.x, groundY + ev.y, ev.z, 0xfef9c3, 1.85, 0.14);
      this.spawnShockwave(ev.x, groundY + Math.max(0, ev.y - 0.9), ev.z, parryColor, 5.8, 0.42);
      this.spawnShockwave(ev.x, groundY + ev.y, ev.z, 0xfef9c3, 3.6, 0.3, Math.PI * 0.5);
      this.spawnSparks(ev.x, groundY + ev.y, ev.z, parryColor, 16, 1.4, 8, 0.36);
      if (ev.fighterId === 'khen') {
        this.spawnSlash(ev.x, groundY + ev.y, ev.z, yaw, 0xa855f7, 1.45, Math.PI * 0.15, 0, 0.78);
        this.spawnSlash(ev.x, groundY + ev.y, ev.z, yaw, 0xddd6fe, 1.45, Math.PI * 0.15, 0, -0.78);
      } else if (ev.fighterId === 'jm' || ev.counterFlow) {
        this.spawnSpikeCrown(ev.x, groundY, ev.z, 0xfef08a, 0x06b6d4, 1.35, 0.52);
        this.spawnShockTorus(ev.x, groundY + 0.42, ev.z, 0x06b6d4, 0.6, 5.4, 0.42);
        this.spawnPillar(ev.x, groundY, ev.z, 0xfacc15, 0.95, 0.5);
        this.spawnCrescentRibbon(ev.x, groundY + 1.15, ev.z, yaw, 0.2, 0x06b6d4, 0xfef9c3, 1.8, 26, 0.3, Math.PI * 0.46);
        this.spawnLightningSpline(ev.x, groundY + 0.25, ev.z, ev.x + 1.6, groundY + 4.8, ev.z - 1.2, 0x38bdf8, 0.24, 0.55, 0.22, 0.48);
      }
      return;
    }

    if (ev.kind === 'evade') {
      this.spawnCoreFlash(ev.x, groundY + ev.y, ev.z, 0xfef9c3, 1.35, 0.12);
      this.spawnShockwave(ev.x, groundY + Math.max(0, ev.y - 0.8), ev.z, ev.colorHex, 4.4, 0.34);
      this.spawnShockwave(ev.x, groundY + ev.y, ev.z, 0x99f6e4, 2.7, 0.26, Math.PI * 0.5);
      this.spawnSparks(ev.x, groundY + ev.y, ev.z, ev.colorHex, 14, 1.3, 4, 0.32);
      this.spawnGhost(ev.x, groundY, ev.z, ev.colorHex, 0, 0.6, 0, 0.28, 0.55);
      return;
    }

    if (ev.kind === 'trap') {
      this.spawnCoreFlash(ev.x, groundY + ev.y, ev.z, ev.colorHex, 1.15, 0.12);
      this.spawnShockwave(ev.x, groundY + 0.1, ev.z, ev.colorHex, 3.2, 0.34, -Math.PI * 0.5, true);
      this.spawnSparks(ev.x, groundY + ev.y, ev.z, ev.colorHex, 10, 0.9, 8, 0.32);
      return;
    }

    if (ev.kind === 'trapTrigger') {
      this.spawnCoreFlash(ev.x, groundY + ev.y, ev.z, 0xfef9c3, 1.9, 0.15);
      this.spawnShockwave(ev.x, groundY + 0.12, ev.z, ev.colorHex, 6.2, 0.44);
      this.spawnPillar(ev.x, groundY, ev.z, ev.colorHex, 0.95, 0.42);
      this.spawnPuffs(ev.x, groundY + 0.4, ev.z, 0x334155, 6, 1.2, 1.6, 0.4, 1.4, 0.48, 0.55);
      this.spawnSparks(ev.x, groundY + ev.y, ev.z, ev.colorHex, 18, 1.4, 10, 0.38);
      return;
    }

    if (ev.kind === 'whiff') {
      // Whiff Telegraph Visuals
      if (ev.fighterId === 'marjohn' && ev.whiffSlot === 3) {
        this.spawnShockwave(ev.x, groundY + 0.5, ev.z, 0x94a3b8, 3.6, 0.45, -Math.PI * 0.5, true);
        this.spawnPuffs(ev.x, groundY + 0.7, ev.z, 0xcbd5e1, 6, 1.4, 0.6, 0.65, 0.15, 0.5, 0.45);
      } else if (ev.fighterId === 'damen' && ev.whiffSlot === 3) {
        this.spawnSparks(ev.x, groundY + ev.y, ev.z, 0xf59e0b, 8, 0.65, 16, 0.28);
        this.spawnPuffs(ev.x, groundY + ev.y, ev.z, 0x475569, 4, 0.55, 0.9, 0.35, 0.8, 0.42, 0.44);
      } else {
        this.spawnPuffs(ev.x, groundY + ev.y, ev.z, 0x334155, 4, 0.9, 1.1, 0.35, 0.9, 0.4, 0.42);
      }
      return;
    }

    if (ev.kind === 'dash') {
      const fId = ev.fighterId;
      if (ev.originX !== undefined && ev.originZ !== undefined) {
        const origGround = getMapTerrainHeight(mapId, ev.originX, ev.originZ);
        const oy = origGround + (ev.originY ?? 0.9);
        const dy = groundY + ev.y;
        const fx = ev.dirX ?? 0;
        const fz = ev.dirZ ?? 1;

        if (fId === 'marjohn') {
          this.spawnTracer(ev.originX, oy, ev.originZ, ev.x, dy, ev.z, 0x2dd4bf, 1.5, 0.26);
          this.spawnPuffs(ev.originX, oy, ev.originZ, 0xcbd5e1, 5, 0.9, 1.4, 0.4, 1.3, 0.48, 0.52);
          this.spawnGhost(ev.originX, origGround, ev.originZ, 0x2dd4bf, 0, 0, 0, 0.26, 0.5);
        } else if (fId === 'prime') {
          this.spawnCoreFlash(ev.originX, oy, ev.originZ, 0xfb923c, 1.25, 0.12);
          this.spawnCracks(ev.originX + fx * 1.4, origGround, ev.originZ + fz * 1.4, 0xea580c, 3, 1.25, 0.8);
          this.spawnPuffs(ev.originX, origGround + 0.35, ev.originZ, 0x1c1917, 5, 1.0, 1.3, 0.35, 1.2, 0.5, 0.55);
          this.spawnSparks(ev.x, dy, ev.z, 0xf97316, 12, 1.1, 10, 0.36);
        } else if (fId === 'damen') {
          this.spawnPuffs(ev.originX, origGround + 0.25, ev.originZ, 0x475569, 6, 1.0, 1.0, 0.3, 1.0, 0.44, 0.5);
          this.spawnTracer(ev.originX, oy - 0.3, ev.originZ, ev.x, dy - 0.3, ev.z, 0xd97706, 0.75, 0.16);
        } else if (fId === 'khen') {
          this.spawnCoreFlash(ev.originX, oy, ev.originZ, 0x7e22ce, 1.35, 0.14);
          this.spawnShockwave(ev.originX, oy, ev.originZ, 0xa855f7, 3.0, 0.34, Math.PI * 0.5);
          this.spawnPuffs(ev.originX, oy, ev.originZ, 0x09090b, 6, 1.1, 1.4, 0.45, 1.4, 0.55, 0.68);
          this.spawnCoreFlash(ev.x, dy, ev.z, 0xa855f7, 1.35, 0.14);
          this.spawnShockwave(ev.x, dy, ev.z, 0x7e22ce, 3.0, 0.34, Math.PI * 0.5);
          this.spawnPuffs(ev.x, dy, ev.z, 0x09090b, 6, 1.1, 1.4, 0.45, 1.4, 0.55, 0.68);
          this.spawnTracer(ev.originX, oy, ev.originZ, ev.x, dy, ev.z, 0x7e22ce, 1.2, 0.22);
          this.spawnGhost(ev.originX, origGround, ev.originZ, 0x581c87, 0, 0, 0, 0.26, 0.6);
        } else {
          this.spawnCoreFlash(ev.originX, oy, ev.originZ, 0xfef9c3, 1.4, 0.12);
          this.spawnShockTorus(ev.originX, oy, ev.originZ, 0xf59e0b, 0.35, 2.3, 0.26);
          this.spawnCrescentRibbon(ev.originX, oy, ev.originZ, yaw, 0.15, 0x06b6d4, 0xfef9c3, 1.3, 22, 0.22, Math.PI * 0.46);
          this.spawnLightningSpline(ev.originX, oy, ev.originZ, ev.x, dy, ev.z, 0x38bdf8, 0.2, 0.26, 0.42);
          this.spawnLightningSpline(ev.originX, oy + 0.3, ev.originZ, ev.x, dy + 0.3, ev.z, 0xfef08a, 0.14, 0.22, 0.38);
          this.spawnShockTorus(ev.x, dy, ev.z, 0x06b6d4, 0.35, 2.1, 0.24);
          this.spawnSparks(ev.originX, oy, ev.originZ, 0xfef9c3, 10, 1.2, 4, 0.28);
        }
      } else {
        this.spawnGhost(ev.x, groundY + Math.max(0, ev.y - 0.9), ev.z, ev.colorHex, 0, 0, 0, 0.25, 0.52);
      }
      return;
    }

    if (ev.kind === 'lasso') {
      if (ev.originX !== undefined && ev.originZ !== undefined) {
        const og = getMapTerrainHeight(mapId, ev.originX, ev.originZ);
        this.spawnTether(ev.originX, og + (ev.originY ?? 1.0), ev.originZ, ev.x, groundY + ev.y, ev.z, 0xf59e0b, 0.34);
      }
      this.spawnCoreFlash(ev.x, groundY + ev.y, ev.z, 0xfef08a, 1.25, 0.11);
      this.spawnShockwave(ev.x, groundY + ev.y, ev.z, 0xd97706, 2.7, 0.3, -Math.PI * 0.5, true);
      this.spawnPuffs(ev.x, groundY + ev.y, ev.z, 0x475569, 4, 0.8, 1.0, 0.35, 0.9, 0.4, 0.44);
      this.spawnSparks(ev.x, groundY + ev.y, ev.z, 0xf59e0b, 12, 1.0, 8, 0.32);
      return;
    }

    if (ev.kind === 'shockwave') {
      const fId = ev.fighterId;
      const slot = ev.abilitySlot;
      const fx = ev.dirX ?? 0;
      const fz = ev.dirZ ?? 1;

      if (ev.isComboLink) {
        this.spawnComboLinkBridge(ev, mapId);
      }

      if (fId === 'marjohn' && slot === 4) {
        this.spawnCoreFlash(ev.x, groundY + 1.4, ev.z, 0x99f6e4, 2.2, 0.2);
        this.spawnFunnel(ev.x, groundY, ev.z, 0x2dd4bf, 1.4, 5.8, 4.2, 0.65, 26);
        this.spawnShockwave(ev.x, groundY, ev.z, 0x14b8a6, 12.0, 0.62);
        this.spawnPuffs(ev.x, groundY + 1.0, ev.z, 0xcbd5e1, 10, 2.4, 2.8, 0.75, 2.4, 0.65, 0.54);
        for (let l = 0; l < 5; l++) {
          const ang = (l / 5) * Math.PI * 2 + Math.random() * 0.4;
          this.spawnLightningSpline(
            ev.x,
            groundY + 1.2,
            ev.z,
            ev.x + Math.cos(ang) * 9.5,
            groundY + 0.4 + Math.random() * 2.4,
            ev.z + Math.sin(ang) * 9.5,
            l % 2 === 0 ? 0x5eead4 : 0x38bdf8,
            0.22,
            0.28,
            0.42
          );
        }
        this.spawnVortexDebris(ev.x, groundY + 0.4, ev.z, 7.5, 0x78716c, 20);
      } else if (fId === 'prime' && slot === 3) {
        this.spawnCoreFlash(ev.x, groundY + 0.6, ev.z, 0xfbbf24, 1.85, 0.14);
        this.spawnShockwave(ev.x, groundY, ev.z, 0xdc2626, 6.4, 0.48);
        this.spawnDarkSpiderCracks(ev.x, groundY, ev.z, 0xea580c, 3, 2.2, 1.4);
        this.spawnCracks(ev.x, groundY, ev.z, 0xea580c, 6, 1.8, 0.95);
        for (let j = 0; j < 6; j++) {
          const a = (j / 6) * Math.PI * 2;
          this.spawnPillar(ev.x + Math.cos(a) * 2.2, groundY, ev.z + Math.sin(a) * 2.2, 0xea580c, 0.35, 0.38);
        }
        this.spawnPuffs(ev.x, groundY + 0.4, ev.z, 0x1c1917, 10, 1.9, 2.8, 0.55, 2.0, 0.68, 0.68);
      } else if (fId === 'prime' && slot === 4) {
        this.spawnCoreFlash(ev.x, groundY + 1.2, ev.z, 0xfbbf24, 2.4, 0.2);
        this.spawnPillar(ev.x, groundY, ev.z, 0xdc2626, 2.3, 0.68);
        this.spawnShockwave(ev.x, groundY, ev.z, 0xea580c, 11.2, 0.6);
        this.spawnDarkSpiderCracks(ev.x, groundY, ev.z, 0xdc2626, 4, 3.6, 1.8);
        this.spawnCracks(ev.x, groundY, ev.z, 0xea580c, 8, 2.8, 1.2);
        this.spawnSparks(ev.x, groundY + 4.5, ev.z, 0xf97316, 28, 1.4, 18, 0.72);
        this.spawnPuffs(ev.x, groundY + 0.6, ev.z, 0x1c1917, 12, 2.3, 3.4, 0.7, 2.4, 0.78, 0.72);
      } else if (fId === 'damen' && slot === 4) {
        this.spawnCoreFlash(ev.x, groundY + 1.2, ev.z, 0xfef08a, 1.7, 0.11);
        for (const sp of [-0.34, -0.17, 0, 0.17, 0.34]) {
          const ang = Math.atan2(fx, fz) + sp;
          this.spawnTracer(
            ev.x + Math.sin(ang) * 0.9,
            groundY + 1.15,
            ev.z + Math.cos(ang) * 0.9,
            ev.x + Math.sin(ang) * 14.5,
            groundY + 1.15,
            ev.z + Math.cos(ang) * 14.5,
            0xf59e0b,
            0.95,
            0.18
          );
        }
        this.spawnShockwave(ev.x, groundY, ev.z, 0xd97706, 5.8, 0.42);
        this.spawnPuffs(ev.x, groundY + 1.0, ev.z, 0x475569, 8, 1.6, 1.5, 0.4, 1.3, 0.48, 0.56);
      } else if (fId === 'khen' && slot === 4) {
        this.spawnCoreFlash(ev.x, groundY + 1.1, ev.z, 0xddd6fe, 1.25, 0.18);
        this.spawnShockwave(ev.x, groundY, ev.z, 0x7e22ce, 8.0, 0.52);
        this.spawnSlash(ev.x + fx * 1.5, groundY + 1.1, ev.z + fz * 1.5, yaw, 0xa855f7, 2.1, Math.PI * 0.15, 24, 0.75);
        this.spawnSlash(ev.x + fx * 1.5, groundY + 1.1, ev.z + fz * 1.5, yaw, 0x7e22ce, 2.1, Math.PI * 0.15, -24, -0.75);
        this.spawnPuffs(ev.x, groundY + 0.7, ev.z, 0x09090b, 10, 2.2, 2.2, 0.6, 2.2, 0.68, 0.74);
      } else if (fId === 'prime' && slot === 0) {
        this.spawnPointLightFlash(ev.x, groundY + 1.0, ev.z, 0xdc2626, 5.4, 0.22, 11);
        this.spawnCoreFlash(ev.x, groundY + 0.5, ev.z, 0xfbbf24, 1.75, 0.13);
        this.spawnShockwave(ev.x, groundY, ev.z, 0xdc2626, 4.6, 0.36);
        this.spawnShockwave(ev.x, groundY + 0.08, ev.z, 0xea580c, 3.2, 0.28);
        this.spawnDarkSpiderCracks(ev.x, groundY, ev.z, 0xea580c, 2, 1.75, 1.2);
        this.spawnCracks(ev.x, groundY, ev.z, 0xea580c, 6, 1.4, 0.85);
        this.spawnPuffs(ev.x, groundY + 0.35, ev.z, 0x1c1917, 7, 1.6, 2.2, 0.45, 1.7, 0.58, 0.64);
      } else if (fId === 'jm' && slot === 3) {
        this.spawnCraterSlam(ev.x, groundY, ev.z, ev.isComboLink ? 5.2 : 4.2, 0xf59e0b, 0x06b6d4, Boolean(ev.isComboLink));
      } else {
        this.spawnPointLightFlash(ev.x, groundY + Math.max(0.6, ev.y), ev.z, ev.colorHex, 5.4, 0.24, 12);
        this.spawnCoreFlash(ev.x, groundY + Math.max(0.4, ev.y), ev.z, ev.colorHex, 1.45, 0.14);
        this.spawnShockwave(ev.x, groundY + Math.max(0, ev.y - 0.1), ev.z, ev.colorHex, 6.6, 0.48);
        this.spawnShockwave(ev.x, groundY + Math.max(0, ev.y - 0.05), ev.z, 0xfef9c3, 4.2, 0.3);
      }
      return;
    }

    if (ev.kind === 'beam') {
      this.spawnPointLightFlash(ev.x, groundY + ev.y + 0.5, ev.z, 0xf59e0b, 6.8, 0.35, 15);
      this.spawnCoreFlash(ev.x, groundY + ev.y, ev.z, 0xfef9c3, 2.2, 0.22);
      this.spawnBeam(ev.x, groundY + ev.y, ev.z, ev.dirX ?? 0, ev.dirZ ?? 1, ev.colorHex);
      this.spawnBeamVTrench(ev.x, groundY, ev.z, ev.dirX ?? 0, ev.dirZ ?? 1, ev.radius ?? 16, ev.colorHex);
      this.spawnSpikeCrown(ev.x, groundY, ev.z, 0xfef08a, 0x06b6d4, 1.15, 0.45);
      this.spawnShockTorus(ev.x, groundY + 0.45, ev.z, 0x06b6d4, 0.6, 5.2, 0.45);
      this.spawnSparks(ev.x, groundY + ev.y, ev.z, 0xf59e0b, 22, 1.6, 4, 0.45);
      return;
    }

    if (ev.kind === 'craterSlam') {
      const rad = ev.radius ?? 3.8;
      this.spawnCraterSlam(
        ev.x,
        groundY,
        ev.z,
        rad,
        ev.colorHex === 0x38bdf8 ? 0x06b6d4 : 0xf59e0b,
        ev.colorHex === 0x38bdf8 ? 0xf59e0b : 0x06b6d4,
        Boolean(ev.isCounter)
      );
      return;
    }

    if (ev.kind === 'crescentSlash') {
      const rad = ev.radius ?? 2.0;
      const roll = ((ev.comboStep ?? 1) % 2 === 0 ? -0.58 : 0.58);
      const spin = ((ev.comboStep ?? 1) % 2 === 0 ? -24 : 24);
      this.spawnCoreFlash(ev.x, groundY + ev.y, ev.z, 0xfef9c3, 1.25, 0.11);
      this.spawnShockTorus(ev.x, groundY + ev.y, ev.z, 0xf59e0b, 0.3, 1.6, 0.22);
      this.spawnCrescentRibbon(ev.x, groundY + ev.y, ev.z, yaw, roll, 0x06b6d4, 0xfef9c3, Math.max(1.25, rad * 0.72), spin, 0.26);
      this.spawnSparks(ev.x, groundY + ev.y, ev.z, ev.colorHex, 9, 1.15, 6, 0.28);
      return;
    }

    if (ev.kind === 'pillarShatter') {
      const rad = ev.radius ?? 6.2;
      this.spawnCraterSlam(ev.x, groundY, ev.z, rad * 0.9, 0xf59e0b, 0x06b6d4, true);
      this.spawnPuffs(ev.x, groundY + 1.0, ev.z, 0x334155, 8, 2.2, 2.4, 0.65, 2.3, 0.55, 0.56);
      return;
    }

    if (ev.kind === 'trenchPulse') {
      const fx = ev.dirX ?? 0;
      const fz = ev.dirZ ?? 1;
      const len = Math.min(20, ev.radius ?? 16);
      this.spawnBeamVTrench(ev.x, groundY, ev.z, fx, fz, len, ev.colorHex);
      this.spawnShockTorus(ev.x, groundY + 0.45, ev.z, ev.colorHex, 0.55, 4.2, 0.35);
      return;
    }

    if (ev.kind === 'chargeAura') {
      const rad = ev.radius ?? 4.0;
      this.spawnCoreFlash(ev.x, groundY + ev.y, ev.z, 0xfef9c3, 1.8, 0.22);
      this.spawnShockTorus(ev.x, groundY + Math.max(0.4, ev.y), ev.z, ev.colorHex, 0.5, rad * 0.95, 0.38);
      this.spawnShockwave(ev.x, groundY + 0.08, ev.z, 0xf59e0b, rad * 1.1, 0.42, -Math.PI * 0.5, true);
      this.spawnCraterSlabs(ev.x, groundY, ev.z, rad * 0.7, 7, 0.55);
      return;
    }

    if (ev.kind === 'skyComboStep') {
      this.spawnCoreFlash(ev.x, groundY + ev.y, ev.z, 0xfef9c3, 1.75, 0.14);
      this.spawnCrescentRibbon(ev.x, groundY + ev.y, ev.z, yaw, 0.45, 0x06b6d4, 0xfef9c3, 1.85, 24, 0.28);
      this.spawnShockTorus(ev.x, groundY + ev.y, ev.z, 0xf59e0b, 0.4, 2.8, 0.28);
      this.spawnSparks(ev.x, groundY + ev.y, ev.z, 0xfef08a, 14, 1.4, 4, 0.32);
      return;
    }

    if (ev.kind === 'stun') {
      this.spawnCoreFlash(ev.x, groundY + ev.y, ev.z, 0xf59e0b, 1.55, 0.14);
      this.spawnPillar(ev.x, groundY, ev.z, 0xf59e0b, 0.85);
      this.spawnShockwave(ev.x, groundY, ev.z, 0xdc2626, 4.8);
      return;
    }

    if (ev.kind === 'comboLink' || ev.kind === 'overdrive') {
      this.spawnComboLinkBridge(ev, mapId);
      this.spawnCoreFlash(ev.x, groundY + ev.y, ev.z, 0xfef9c3, 1.55, 0.14);
      this.spawnPillar(ev.x, groundY, ev.z, ev.colorHex, 1.15);
      this.spawnShockwave(ev.x, groundY, ev.z, ev.colorHex, 5.8);
      return;
    }

    if (ev.kind === 'clashStart' || ev.kind === 'clashWin') {
      this.spawnCoreFlash(ev.x, groundY + ev.y, ev.z, 0xfef9c3, 2.2, 0.18);
      this.spawnShockwave(ev.x, groundY + Math.max(0, ev.y - 1.0), ev.z, 0xf59e0b, ev.kind === 'clashWin' ? 8.2 : 4.8);
      this.spawnSparks(ev.x, groundY + ev.y, ev.z, 0xfef08a, 24, 1.5);
      if (ev.kind === 'clashWin') {
        this.spawnPillar(ev.x, groundY, ev.z, ev.colorHex, 1.4);
      }
      return;
    }

    if (ev.kind === 'hazardHit') {
      this.spawnCoreFlash(ev.x, groundY + 1.0, ev.z, 0xfef9c3, 2.2, 0.18);
      this.spawnPillar(ev.x, groundY, ev.z, 0xf59e0b, 2.4);
      this.spawnShockwave(ev.x, groundY, ev.z, 0xf59e0b, 7.5);
      this.spawnSparks(ev.x, groundY + 1.0, ev.z, 0xf59e0b, 24, 1.5);
      this.spawnDarkSpiderCracks(ev.x, groundY, ev.z, 0xf59e0b, 3, 2.1, 1.2);
      this.spawnCracks(ev.x, groundY, ev.z, 0xf59e0b, 6, 1.8, 1.0);
      return;
    }

    if (ev.kind === 'block') {
      this.spawnCoreFlash(ev.x, groundY + ev.y, ev.z, ev.colorHex, 0.85, 0.1);
      this.spawnSparks(ev.x, groundY + ev.y, ev.z, ev.colorHex, 6, 0.8);
      return;
    }

    if (ev.kind === 'jump') {
      this.spawnShockwave(ev.x, groundY + Math.max(0, ev.y - 0.1), ev.z, ev.colorHex, 1.9, 0.3);
      this.spawnPuffs(ev.x, groundY + ev.y, ev.z, 0x94a3b8, 3, 0.6, 0.8, 0.25, 0.75, 0.35, 0.42);
      return;
    }

    if (ev.kind === 'pickup' || ev.kind === 'strengthBuff' || ev.kind === 'itemPickup') {
      const sy = groundY + ev.y;
      this.spawnCoreFlash(ev.x, sy, ev.z, ev.colorHex, ev.kind === 'strengthBuff' ? 1.5 : 1.15, 0.14);
      this.spawnSparks(ev.x, sy, ev.z, ev.colorHex, 14, 1.15, 4, 0.36);
      this.spawnShockwave(ev.x, Math.max(groundY + 0.25, sy - 0.5), ev.z, ev.colorHex, 3.4, 0.42);
      if (ev.kind === 'strengthBuff') {
        this.spawnPillar(ev.x, groundY, ev.z, 0xf59e0b, 0.85, 0.48);
      }
      return;
    }

    if (ev.kind === 'itemUse') {
      if (ev.originX !== undefined && ev.originZ !== undefined) {
        const oy = getMapTerrainHeight(mapId, ev.originX, ev.originZ) + (ev.originY ?? 1.2);
        this.spawnTracer(ev.originX, oy, ev.originZ, ev.x, groundY + ev.y, ev.z, ev.colorHex, 1.25, 0.25);
      }
      const r = ev.radius ?? 4.8;
      this.spawnPointLightFlash(ev.x, groundY + 1.0, ev.z, ev.colorHex, 6.2, 0.28, 12);
      this.spawnCoreFlash(ev.x, groundY + ev.y, ev.z, ev.colorHex, 1.95, 0.18);
      this.spawnShockwave(ev.x, groundY + 0.25, ev.z, ev.colorHex, r, 0.48);
      this.spawnSparks(ev.x, groundY + ev.y, ev.z, ev.colorHex, 20, 1.5, 8, 0.44);
      return;
    }

    if (ev.kind === 'cryoFreeze') {
      const r = ev.radius ?? 5.2;
      this.spawnCoreFlash(ev.x, groundY + 0.6, ev.z, 0x38bdf8, 1.85, 0.18);
      this.spawnShockwave(ev.x, groundY + 0.26, ev.z, 0x06b6d4, r, 0.55);
      this.spawnSparks(ev.x, groundY + 0.6, ev.z, 0xbae6fd, 18, 1.4, 4, 0.46);
      return;
    }

    if (ev.kind === 'npcProvoke' || ev.kind === 'npcDefeat') {
      this.spawnPointLightFlash(ev.x, groundY + 1.4, ev.z, ev.colorHex, 7.0, 0.36, 15);
      this.spawnPillar(ev.x, groundY, ev.z, ev.colorHex, 1.35, 0.65);
      this.spawnShockwave(ev.x, groundY + 0.25, ev.z, ev.colorHex, 7.2, 0.52);
      this.spawnSparks(ev.x, groundY + 1.1, ev.z, ev.colorHex, 22, 1.5, 8, 0.48);
      return;
    }

    if (ev.kind === 'fireballCharge') {
      this.spawnSpellSigil(ev.x, groundY, ev.z, 0xf59e0b, 4.2, 1.15);
      this.spawnCoreFlash(ev.x, groundY + 1.2, ev.z, 0xfef9c3, 2.2, 0.22);
      this.spawnPillar(ev.x, groundY, ev.z, 0xf59e0b, 1.35, 0.65);
      this.spawnShockwave(ev.x, groundY, ev.z, 0xf59e0b, 6.2, 0.55);
      this.spawnSparks(ev.x, groundY + 1.5, ev.z, 0xfef08a, 24, 1.4, -6, 0.55);
      return;
    }

    if (ev.kind === 'fireballLaunch') {
      this.spawnCoreFlash(ev.x, groundY + ev.y, ev.z, 0xfef9c3, 2.6, 0.2);
      this.spawnShockwave(ev.x, groundY + ev.y, ev.z, 0xf59e0b, 7.2, 0.42, Math.PI * 0.5);
      this.spawnSparks(ev.x, groundY + ev.y, ev.z, 0xfef08a, 28, 1.8, 8, 0.48);
      return;
    }

    if (ev.kind === 'fireballImpact') {
      const rad = ev.radius ?? 6.2;
      this.spawnPointLightFlash(ev.x, groundY + 1.5, ev.z, 0xf59e0b, 7.4, 0.4, 18);
      this.spawnCoreFlash(ev.x, groundY + 1.0, ev.z, 0xfef9c3, 3.2, 0.24);
      this.spawnPillar(ev.x, groundY, ev.z, 0xf59e0b, 2.4, 0.72);
      this.spawnShockwave(ev.x, groundY, ev.z, 0xfef08a, rad * 1.45, 0.62);
      this.spawnShockwave(ev.x, groundY + 0.3, ev.z, 0xea580c, rad * 2.0, 0.72);
      this.spawnDarkSpiderCracks(ev.x, groundY, ev.z, 0xea580c, 4, Math.max(2.2, rad * 0.52), 1.6);
      this.spawnCracks(ev.x, groundY, ev.z, 0xea580c, 10, 3.0, 1.35);
      this.spawnSparks(ev.x, groundY + 1.2, ev.z, 0xfef08a, 38, 1.9, 14, 0.68);
      this.spawnPuffs(ev.x, groundY + 0.8, ev.z, 0x1c1917, 12, 2.6, 3.2, 0.9, 3.2, 0.85, 0.68);
      return;
    }

    if (ev.kind === 'ko') {
      const killerId = ev.fighterId;
      this.spawnCoreFlash(ev.x, groundY + ev.y, ev.z, 0xfef9c3, 2.4, 0.2);
      if (killerId === 'prime' || ev.koStyle === 'launch') {
        this.spawnSparks(ev.x, groundY + ev.y, ev.z, 0xea580c, 22, 1.5, -6, 0.65);
        this.spawnShockwave(ev.x, groundY, ev.z, 0xdc2626, 7.5, 0.5);
        this.spawnPuffs(ev.x, groundY + 0.5, ev.z, 0x1c1917, 8, 1.6, 1.8, 0.6, 1.8, 0.6, 0.66);
        this.delayedTasks.push({
          delay: 0.88,
          run: () => {
            const apexY = groundY + 9.2;
            this.spawnCoreFlash(ev.x, apexY, ev.z, 0xfbbf24, 2.4, 0.2);
            this.spawnShockwave(ev.x, apexY, ev.z, 0xea580c, 6.5, 0.45, Math.PI * 0.5);
            this.spawnPuffs(ev.x, apexY, ev.z, 0x1c1917, 9, 1.8, 1.4, 0.7, 2.3, 0.65, 0.68);
            this.spawnSparks(ev.x, apexY, ev.z, 0xf97316, 20, 1.6, 12, 0.5);
          },
        });
      } else if (killerId === 'damen' || ev.koStyle === 'shatter') {
        this.spawnShockwave(ev.x, groundY + 1.0, ev.z, 0xfef08a, 4.5, 0.25, Math.PI * 0.5);
        this.delayedTasks.push({
          delay: 0.24,
          run: () => {
            this.spawnCoreFlash(ev.x, groundY + 1.1, ev.z, 0xfef08a, 2.1, 0.16);
            this.spawnShockwave(ev.x, groundY, ev.z, 0xf59e0b, 8.8, 0.52);
            this.spawnPuffs(ev.x, groundY + 0.9, ev.z, 0x475569, 8, 1.5, 1.6, 0.5, 1.5, 0.55, 0.58);
            this.spawnSparks(ev.x, groundY + 1.1, ev.z, 0xfef08a, 24, 1.5, 10, 0.45);
          },
        });
      } else if (killerId === 'khen' || ev.koStyle === 'dissolve') {
        this.spawnShockwave(ev.x, groundY, ev.z, 0x7e22ce, 8.2, 0.55);
        this.spawnPuffs(ev.x, groundY + 0.8, ev.z, 0x09090b, 14, 1.5, 2.2, 0.5, 1.9, 0.85, 0.74);
        this.spawnSparks(ev.x, groundY + 1.0, ev.z, 0xa855f7, 18, 1.2, -3, 0.55);
      } else if (killerId === 'jm') {
        this.spawnPillar(ev.x, groundY, ev.z, 0xfef08a, 1.85, 0.85);
        this.spawnShockwave(ev.x, groundY, ev.z, 0x06b6d4, 9.5, 0.58);
        this.spawnLightningSpline(ev.x, groundY + 0.6, ev.z, ev.x, groundY + 8.5, ev.z, 0x38bdf8, 0.32, 0.35, 0.45);
        this.spawnSparks(ev.x, groundY + 0.8, ev.z, 0xfef9c3, 24, 1.1, -5, 0.72);
      } else {
        this.spawnFunnel(ev.x, groundY, ev.z, 0x2dd4bf, 1.6, 0.4, 2.0, 0.55, 22);
        this.spawnShockwave(ev.x, groundY, ev.z, 0x5eead4, 8.2, 0.5);
        this.spawnPuffs(ev.x, groundY + 0.9, ev.z, 0xcbd5e1, 10, 1.6, 1.8, 0.45, 1.6, 0.65, 0.55);
        this.spawnSparks(ev.x, groundY + 1.0, ev.z, 0x2dd4bf, 18, 1.3, 4, 0.48);
      }
      return;
    }

    if (ev.kind === 'awakeningOrbsSpawn') {
      this.spawnPointLightFlash(ev.x, groundY + 2.5, ev.z, 0x38bdf8, 7.6, 0.45, 18);
      this.spawnShockwave(ev.x, groundY + 0.15, ev.z, 0xf59e0b, 10.5, 0.72);
      this.spawnShockwave(ev.x, groundY + 0.25, ev.z, 0x06b6d4, 7.2, 0.55);
      return;
    }

    if (ev.kind === 'awakeningPickup') {
      this.spawnCoreFlash(ev.x, groundY + 1.4, ev.z, 0xfef9c3, 2.3, 0.22);
      this.spawnShockwave(ev.x, groundY + 0.15, ev.z, ev.colorHex, 7.5, 0.52);
      this.spawnPillar(ev.x, groundY, ev.z, ev.colorHex, 1.5, 0.75);
      this.spawnSparks(ev.x, groundY + 1.4, ev.z, 0xfef08a, 16, 1.5, 4, 0.5);
      return;
    }

    if (ev.kind === 'awakeningTransform') {
      this.spawnPointLightFlash(ev.x, groundY + 2.2, ev.z, ev.colorHex, 6.8, 0.48, 16);
      this.spawnSpellSigil(ev.x, groundY, ev.z, ev.colorHex, 4.8, 1.05);
      this.spawnPillar(ev.x, groundY, ev.z, ev.colorHex, 0.82, 0.78);
      this.spawnShockwave(ev.x, groundY + 0.14, ev.z, ev.colorHex, 13.0, 0.82);
      this.spawnShockwave(ev.x, groundY + 0.22, ev.z, 0xfef08a, 8.8, 0.58);
      this.spawnShockwave(ev.x, groundY + 1.05, ev.z, ev.colorHex, 5.2, 0.42, -Math.PI * 0.5, true);
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + 0.15;
        const rInner = 1.05;
        const rOut = 3.8 + (i % 2) * 1.2;
        this.spawnLightningSpline(
          ev.x + Math.cos(ang) * rInner,
          groundY + 0.35,
          ev.z + Math.sin(ang) * rInner,
          ev.x + Math.cos(ang + 0.24) * rOut,
          groundY + 5.8 + (i % 3) * 1.8,
          ev.z + Math.sin(ang + 0.24) * rOut,
          i % 2 === 0 ? ev.colorHex : 0xfef08a,
          0.22,
          0.35,
          0.44
        );
      }
      this.spawnSparks(ev.x, groundY + 1.35, ev.z, ev.colorHex, 28, 2.2, 11, 0.75);
      this.spawnSparks(ev.x, groundY + 1.1, ev.z, 0xfef08a, 18, 1.7, 8, 0.58);
      this.spawnPuffs(ev.x, groundY + 0.2, ev.z, 0x1c1917, 6, 1.8, 1.3, 0.25, 1.7, 0.32, 0.52);
      this.spawnDarkSpiderCracks(ev.x, groundY, ev.z, ev.colorHex, 3, 2.3, 1.4);
      this.spawnCracks(ev.x, groundY, ev.z, ev.colorHex, 8, 2.8, 1.4);
      return;
    }

    if (ev.kind === 'awakeningCutsceneStart') {
      this.spawnShockwave(0, 0.2, 0, 0xfef08a, 13.0, 0.78);
      this.spawnPillar(0, 0, 0, 0xfef08a, 1.35, 0.85);
      return;
    }

    if (ev.kind === 'awakeningClashEnd') {
      this.spawnPointLightFlash(ev.x, groundY + 1.6, ev.z, 0xf59e0b, 7.2, 0.42, 18);
      this.spawnCoreFlash(ev.x, groundY + 1.4, ev.z, 0xfef08a, 2.0, 0.16);
      this.spawnShockwave(ev.x, groundY + 0.2, ev.z, 0xf59e0b, 15.0, 0.72);
      this.spawnShockwave(ev.x, groundY + 0.25, ev.z, ev.colorHex, 11.0, 0.6);
      this.spawnSparks(ev.x, groundY + 1.5, ev.z, 0xfef08a, 20, 1.8, 10, 0.62);
      this.spawnDarkSpiderCracks(ev.x, groundY, ev.z, 0xf59e0b, 4, 2.5, 1.3);
      this.spawnCracks(ev.x, groundY, ev.z, 0xf59e0b, 8, 2.8, 1.25);
      return;
    }

    if (ev.kind === 'lightning') {
      this.spawnPointLightFlash(ev.x, groundY + 1.4, ev.z, 0x38bdf8, 6.8, 0.28, 15);
      // Multi-segment jagged procedural lightning spline + secondary fork (zero straight sky cylinders)
      this.spawnLightningSpline(ev.x, groundY + 16.5, ev.z, ev.x, groundY + 0.15, ev.z, 0xe0f2fe, 0.62, 0.28, 0.50);
      this.spawnLightningSpline(
        ev.x + 1.2,
        groundY + 11.0,
        ev.z - 0.8,
        ev.x + (Math.random() - 0.5) * 3.8,
        groundY + 0.15,
        ev.z + (Math.random() - 0.5) * 3.8,
        0x38bdf8,
        0.34,
        0.24,
        0.38
      );
      this.spawnCoreFlash(ev.x, groundY + 0.8, ev.z, 0xfef9c3, 2.2, 0.18);
      this.spawnShockwave(ev.x, groundY + 0.1, ev.z, 0x22d3ee, ev.radius ?? 5.0, 0.45);
      this.spawnDarkSpiderCracks(ev.x, groundY, ev.z, 0x38bdf8, 2, 1.7, 1.0);
      this.spawnCracks(ev.x, groundY, ev.z, 0x38bdf8, 5, 1.5, 0.9);
      this.spawnPuffs(ev.x, groundY + 0.45, ev.z, 0x334155, 6, 1.2, 1.5, 0.4, 1.3, 0.48, 0.55);
      this.spawnSparks(ev.x, groundY + 0.8, ev.z, 0x7dd3fc, 14, 1.5, 12, 0.42);
      return;
    }

    if (ev.kind === 'silence') {
      this.spawnMarkGlyph(ev.x, groundY + 1.1, ev.z);
      this.spawnShockwave(ev.x, groundY + 0.8, ev.z, 0x7e22ce, 3.8, 0.36, -Math.PI * 0.5, true);
      this.spawnPuffs(ev.x, groundY + 0.9, ev.z, 0x09090b, 5, 1.0, 1.2, 0.35, 1.1, 0.45, 0.62);
      this.spawnSparks(ev.x, groundY + 1.1, ev.z, 0xddd6fe, 10, 1.1, 4, 0.4);
      return;
    }

    if (ev.kind === 'cometGrab') {
      this.spawnPointLightFlash(ev.x, groundY + 1.2, ev.z, 0xdc2626, 6.2, 0.28, 14);
      this.spawnCoreFlash(ev.x, groundY + 1.0, ev.z, 0xfbbf24, 2.4, 0.18);
      this.spawnPillar(ev.x, groundY, ev.z, 0xdc2626, 1.65, 0.55);
      this.spawnDarkSpiderCracks(ev.x, groundY, ev.z, 0xdc2626, 3, 2.0, 1.2);
      this.spawnCracks(ev.x, groundY, ev.z, 0xea580c, 6, 2.0, 1.0);
      this.spawnPuffs(ev.x, groundY + 0.45, ev.z, 0x1c1917, 9, 1.7, 2.2, 0.5, 1.8, 0.6, 0.68);
      this.spawnRubbleBurst(ev.x, groundY, ev.z, ev.radius ?? 3.6, 0xdc2626);
      return;
    }

    if (ev.kind === 'omnislash') {
      const r = ev.radius ?? 6.5;
      this.spawnPointLightFlash(ev.x, groundY + 1.4, ev.z, 0x7e22ce, 6.8, 0.35, 16);
      this.spawnPillar(ev.x, groundY, ev.z, 0x7e22ce, 1.7, 0.65);
      this.spawnShockwave(ev.x, groundY + 0.12, ev.z, 0xa855f7, r * 1.4, 0.58);
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 + 0.25;
        const ox = ev.x + Math.cos(ang) * (r * 0.35);
        const oz = ev.z + Math.sin(ang) * (r * 0.35);
        this.spawnSlash(ox, groundY + 1.1 + (i % 2) * 0.4, oz, ang, i % 2 === 0 ? 0xa855f7 : 0x7e22ce, 2.2, Math.PI * 0.15, (i % 2 === 0 ? 1 : -1) * 26, (i % 2 === 0 ? 0.8 : -0.8));
      }
      this.spawnPuffs(ev.x, groundY + 0.8, ev.z, 0x09090b, 10, 2.3, 2.2, 0.6, 2.2, 0.68, 0.74);
      return;
    }

    if (ev.kind === 'obstacleBreak') {
      this.spawnRubbleBurst(ev.x, groundY, ev.z, ev.radius ?? 2.8, ev.colorHex ?? 0x78716c);
      return;
    }

    if (ev.kind === 'domainCastStart') {
      const r = ev.radius ?? 14.0;
      this.spawnCoreFlash(ev.x, groundY + 1.0, ev.z, ev.colorHex, 2.1, 0.2);
      this.spawnShockwave(ev.x, groundY + 0.16, ev.z, ev.colorHex, r, 0.55);
      this.spawnSparks(ev.x, groundY + 1.0, ev.z, ev.colorHex, 16, 1.4, 8, 0.42);
      return;
    }

    if (ev.kind === 'domainCastCancel') {
      this.spawnCoreFlash(ev.x, groundY + 1.2, ev.z, 0xdc2626, 2.4, 0.2);
      this.spawnShockwave(ev.x, groundY + 0.2, ev.z, 0xdc2626, 7.2, 0.45);
      this.spawnSparks(ev.x, groundY + 1.2, ev.z, 0xdc2626, 20, 1.5, 10, 0.45);
      return;
    }

    if (ev.kind === 'jmMirrorTeleport') {
      if (ev.originX !== undefined && ev.originZ !== undefined) {
        const og = getMapTerrainHeight(mapId, ev.originX, ev.originZ);
        const dx = ev.x - ev.originX;
        const dz = ev.z - ev.originZ;
        const dist = Math.max(0.1, Math.hypot(dx, dz));
        const ux = dx / dist;
        const uz = dz / dist;
        this.spawnLightningSpline(ev.originX, og + 0.65, ev.originZ, ev.x, groundY + 0.65, ev.z, 0x06b6d4, 0.24, 0.28, 0.44);
        this.spawnLightningSpline(ev.originX, og + 1.05, ev.originZ, ev.x, groundY + 1.05, ev.z, 0xfef08a, 0.16, 0.24, 0.4);
        this.spawnCoreFlash(ev.originX, og + 0.85, ev.originZ, 0xfef08a, 1.45, 0.14);
        for (let g = 1; g <= 3; g++) {
          const frac = g / 4;
          const gx = ev.originX + dx * frac;
          const gz = ev.originZ + dz * frac;
          const gy = getMapTerrainHeight(mapId, gx, gz) + 0.85;
          this.spawnGhost(gx, gy, gz, g % 2 === 0 ? 0xf59e0b : 0x06b6d4, -ux * 1.4, 0.1, -uz * 1.4, 0.28 - g * 0.04, 0.5);
        }
      }
      this.spawnCoreFlash(ev.x, groundY + 0.9, ev.z, 0xfef08a, 1.85, 0.16);
      this.spawnShockTorus(ev.x, groundY + 0.55, ev.z, 0xf59e0b, 0.45, 3.4, 0.28);
      this.spawnShockwave(ev.x, groundY + 0.18, ev.z, 0xfef08a, 3.2, 0.28);
      this.spawnSparks(ev.x, groundY + 0.9, ev.z, 0x06b6d4, 8, 1.3, 6, 0.28);
      return;
    }

    if (ev.kind === 'jmLaserDetonate') {
      const r = ev.radius ?? 3.6;
      this.spawnPointLightFlash(ev.x, groundY + 1.2, ev.z, 0xf59e0b, 6.8, 0.3, 15);
      this.spawnCoreFlash(ev.x, groundY + 0.9, ev.z, 0xfef9c3, 2.1, 0.18);
      this.spawnShockwave(ev.x, groundY + 0.22, ev.z, 0x06b6d4, r * 1.35, 0.44);
      this.spawnShockwave(ev.x, groundY + 0.3, ev.z, 0xf59e0b, r, 0.34);
      this.spawnLightningSpline(ev.x, groundY + 0.4, ev.z, ev.x + (Math.random() - 0.5) * 2.4, groundY + 3.6, ev.z + (Math.random() - 0.5) * 2.4, 0x38bdf8, 0.22, 0.24, 0.42);
      this.spawnSparks(ev.x, groundY + 0.8, ev.z, 0xfef08a, 18, 1.6, 10, 0.42);
      this.spawnSparks(ev.x, groundY + 0.6, ev.z, 0x06b6d4, 14, 1.4, 8, 0.36);
      return;
    }

    if (ev.kind === 'meteorFist' || ev.kind === 'meteorBoulder') {
      const slot = this.fallingMeteors[this.meteorCursor % this.fallingMeteors.length];
      this.meteorCursor++;
      const r = ev.radius ?? 3.35;
      slot.startY = groundY + 18.0;
      slot.targetY = groundY + 0.35;
      slot.radius = r;
      slot.age = 0;
      slot.duration = 0.24;
      slot.exploded = false;
      slot.group.visible = true;
      slot.group.position.set(ev.x, slot.startY, ev.z);
      slot.group.scale.setScalar(Math.max(0.85, r * 0.36));
      slot.fist.material.opacity = 0.96;
      slot.aura.material.opacity = clampAdditiveOpacity(0.64);
      this.spawnTracer(ev.x, groundY + 20.0, ev.z, ev.x, groundY + 0.3, ev.z, 0xea580c, 1.85, 0.28);
      return;
    }

    if (ev.kind === 'domainStart' || ev.kind === 'domainClashWin') {
      const r = ev.radius ?? 14.0;
      this.spawnPointLightFlash(ev.x, groundY + 2.2, ev.z, ev.colorHex, 8.2, 0.46, 20);
      this.spawnCoreFlash(ev.x, groundY + 1.4, ev.z, 0xfef9c3, 2.7, 0.22);
      this.spawnShockwave(ev.x, groundY + 0.16, ev.z, ev.colorHex, r, 0.72);
      this.spawnShockwave(ev.x, groundY + 0.22, ev.z, 0xf59e0b, r * 0.65, 0.52);
      this.spawnPillar(ev.x, groundY, ev.z, ev.colorHex, 2.4, 0.78);
      this.spawnPuffs(ev.x, groundY + 0.8, ev.z, 0x1c1917, 8, 2.2, 2.4, 0.6, 2.0, 0.65, 0.62);
      this.spawnSparks(ev.x, groundY + 1.5, ev.z, ev.colorHex, 24, 1.8, 12, 0.65);
      return;
    }

    if (ev.kind === 'domainClashStart') {
      this.spawnPointLightFlash(ev.x, groundY + 1.8, ev.z, 0xf59e0b, 7.6, 0.38, 18);
      this.spawnShockwave(ev.x, groundY + 0.2, ev.z, 0xf59e0b, 11.0, 0.5);
      this.spawnSparks(ev.x, groundY + 1.4, ev.z, 0xfef08a, 18, 1.5, 10, 0.45);
      return;
    }

    if (ev.kind === 'domainJackpot') {
      this.spawnPointLightFlash(ev.x, groundY + 1.8, ev.z, 0xf59e0b, 7.2, 0.34, 15);
      this.spawnShockwave(ev.x, groundY + 0.2, ev.z, 0xf59e0b, 7.5, 0.48);
      this.spawnMarkGlyph(ev.x, groundY + 1.3, ev.z);
      this.spawnPuffs(ev.x, groundY + 0.9, ev.z, 0x475569, 6, 1.4, 1.5, 0.45, 1.4, 0.48, 0.52);
      this.spawnSparks(ev.x, groundY + 1.2, ev.z, 0xfef08a, 20, 1.4, 9, 0.52);
      return;
    }

    if (ev.kind === 'kothCapture') {
      this.spawnShockwave(ev.x, groundY + 0.2, ev.z, ev.colorHex, ev.radius ?? 5.5, 0.5);
      this.spawnSparks(ev.x, groundY + 1.0, ev.z, ev.colorHex, 12, 1.1, 6, 0.4);
    }
  }

  public syncBattleEvent(ev: BattlefieldEventState | null, mapId: MapId, elapsed: number): void {
    for (const mr of this.eventMeteorRings) {
      mr.group.visible = false;
    }
    if (!ev || ev.kind === 'surge') {
      this.eventGroup.visible = false;
      return;
    }
    this.eventGroup.visible = true;
    const groundY = getMapTerrainHeight(mapId, ev.x, ev.z);
    this.eventGroup.position.set(ev.x, groundY + 0.28, ev.z);
    const pulse = 1.0 + Math.sin(elapsed * 6.5) * 0.04;
    this.eventGroup.scale.setScalar(ev.radius * pulse);
    this.eventOuterRing.material.color.setHex(ev.colorHex);
    this.eventInnerDisc.material.color.setHex(ev.colorHex);

    if (ev.secondaryPoints && ev.secondaryPoints.length > 0) {
      const count = Math.min(ev.secondaryPoints.length, this.eventMeteorRings.length);
      for (let i = 0; i < count; i++) {
        const sp = ev.secondaryPoints[i];
        const mr = this.eventMeteorRings[i];
        const sGroundY = getMapTerrainHeight(mapId, sp.x, sp.z);
        mr.group.visible = true;
        mr.group.position.set(sp.x, sGroundY + 0.29, sp.z);
        mr.group.scale.setScalar(sp.radius * (1 + Math.sin(elapsed * 14 + i) * 0.05));
        mr.disc.material.opacity = clampAdditiveOpacity(0.24 + Math.sin(elapsed * 18 + i) * 0.08, true);
      }
    }

    if (ev.kind === 'hazard' || ev.kind === 'volcano_eruption' || ev.kind === 'train_rush' || ev.kind === 'thunder_squall') {
      this.eventOuterRing.material.opacity = 0.50;
      this.eventInnerDisc.material.opacity = clampAdditiveOpacity(
        ev.telegraphRemaining > 0 ? 0.22 + Math.sin(elapsed * 20) * 0.08 : 0.14,
        true
      );
    } else if (ev.kind === 'sandstorm_collapse') {
      this.eventOuterRing.material.opacity = 0.48;
      this.eventInnerDisc.material.opacity = clampAdditiveOpacity(0.18 + Math.sin(elapsed * 10) * 0.06, true);
    } else if (ev.kind === 'gravity') {
      this.eventOuterRing.material.opacity = 0.34;
      this.eventInnerDisc.material.opacity = 0.10;
    } else {
      this.eventOuterRing.material.opacity = 0.46;
      this.eventInnerDisc.material.opacity = 0.15;
    }
  }

  public syncZones(zones: ArenaZoneState[], mapId: MapId, elapsed: number): void {
    for (const slot of this.zonePool) {
      slot.group.visible = false;
      slot.id = null;
    }

    const maxZones = Math.min(zones.length, this.zonePool.length);
    for (let i = 0; i < maxZones; i++) {
      const z = zones[i];
      const vis = this.zonePool[i];
      vis.id = z.id;
      vis.group.visible = true;

      const groundY = getMapTerrainHeight(mapId, z.x, z.z);
      const fade = Math.min(1, z.remaining / 0.6);
      const pulse = 1 + Math.sin(elapsed * 7.5 + z.x) * 0.05;

      vis.ring.material.color.setHex(z.colorHex);
      vis.disc.material.color.setHex(z.colorHex);
      vis.extraRing.visible = false;
      vis.decoyMesh.visible = false;
      vis.tripwireMesh.visible = false;

      if (z.kind === 'solarTripwire' && z.endX !== undefined && z.endZ !== undefined) {
        const endGround = getMapTerrainHeight(mapId, z.endX, z.endZ);
        const mx = (z.x + z.endX) * 0.5;
        const mz = (z.z + z.endZ) * 0.5;
        const my = (groundY + endGround) * 0.5 + z.y + 0.45;
        const len = Math.max(0.2, Math.hypot(z.endX - z.x, z.endZ - z.z));
        vis.group.position.set(mx, my, mz);
        vis.ring.position.set(z.x - mx, -0.18, z.z - mz);
        vis.ring.scale.setScalar(0.45);
        vis.disc.position.set(z.endX - mx, -0.18, z.endZ - mz);
        vis.disc.scale.setScalar(0.45);
        vis.tripwireMesh.visible = true;
        vis.tripwireMesh.position.set(0, 0, 0);
        vis.tripwireMesh.lookAt(z.endX, my, z.endZ);
        vis.tripwireMesh.scale.set(1.5, 1.5, len);
        vis.tripwireMesh.material.color.setHex(z.colorHex);
        vis.tripwireMesh.material.opacity = clampAdditiveOpacity(0.74 + Math.sin(elapsed * 18) * 0.08) * fade;
        vis.ring.material.opacity = 0.76 * fade;
        vis.disc.material.opacity = 0.72 * fade;
      } else if (z.kind === 'voidDecoy') {
        vis.group.position.set(z.x, groundY + z.y + 0.28, z.z);
        vis.ring.position.set(0, 0, 0);
        vis.disc.position.set(0, 0, 0);
        vis.ring.scale.setScalar(z.radius * 0.5 * pulse);
        vis.disc.scale.setScalar(z.radius * 0.5);
        vis.decoyMesh.visible = true;
        vis.decoyMesh.position.set(0, 0.85 + Math.sin(elapsed * 8) * 0.1, 0);
        vis.decoyMesh.rotation.y = elapsed * 4.0;
        vis.decoyMesh.material.opacity = 0.82 * fade;
        vis.ring.material.opacity = 0.72 * fade;
        vis.disc.material.opacity = 0.28 * fade;
      } else {
        vis.group.position.set(z.x, groundY + z.y + 0.28, z.z);
        vis.ring.position.set(0, 0, 0);
        vis.disc.position.set(0, 0, 0);
        vis.ring.scale.setScalar(z.radius * pulse);
        vis.disc.scale.setScalar(z.radius);
        vis.extraRing.visible = true;
        vis.extraRing.material.color.setHex(0xfef9c3);
        const spinRate =
          z.kind === 'galeSnare'
            ? -5.0
            : z.kind === 'maelstromTornado' || z.kind === 'cat5Typhoon'
            ? -8.5
            : z.kind === 'shadowRift'
            ? 6.4
            : 3.2;
        vis.extraRing.rotation.z = elapsed * spinRate;
        vis.extraRing.scale.setScalar(z.radius * (0.48 + Math.sin(elapsed * 6) * 0.08));
        vis.ring.material.opacity = (z.kind === 'cat5Typhoon' ? 0.62 : 0.56) * fade;
        vis.disc.material.opacity =
          (z.kind === 'moltenFissure' || z.kind === 'magmaBranch'
            ? 0.34
            : z.kind === 'divineNova' || z.kind === 'icePillarNova'
            ? 0.28
            : z.kind === 'shadowRift' || z.kind === 'khenDomain'
            ? 0.28
            : 0.24) * fade;
        vis.extraRing.material.opacity =
          (z.kind === 'cat5Typhoon' || z.kind === 'maelstromTornado' ? 0.58 : 0.48) * fade;
      }
    }
  }

  public syncStormRing(
    active: boolean,
    radius: number,
    centerX: number,
    centerZ: number,
    _mapId: MapId,
    elapsed: number
  ): void {
    if (!active) {
      this.stormGroup.visible = false;
      return;
    }
    this.stormGroup.visible = true;
    this.stormGroup.position.set(centerX, 0, centerZ);
    this.stormGroup.scale.set(radius, 1, radius);
    this.stormWall.rotation.y = elapsed * 0.45;
    this.stormWall.material.opacity = 0.18 + Math.sin(elapsed * 7.5) * 0.04;
    this.stormRing.material.opacity = 0.44 + Math.sin(elapsed * 12.0) * 0.06;
  }

  public syncChargingFireballs(actors: ArenaActorState[], mapId: MapId, elapsed: number): void {
    for (const slot of this.chargingFireballPool) {
      slot.group.visible = false;
      slot.id = null;
    }

    let slotIdx = 0;
    for (const actor of actors) {
      const isCharging =
        actor.fighterId === 'jm' &&
        !actor.isKO &&
        actor.actionState === 'ultimate' &&
        actor.abilitySlot === 5 &&
        actor.y > 1.8;
      if (!isCharging || slotIdx >= this.chargingFireballPool.length) continue;

      const vis = this.chargingFireballPool[slotIdx++];
      vis.id = actor.playerId;
      vis.group.visible = true;

      const groundY = getMapTerrainHeight(mapId, actor.x, actor.z);
      vis.group.position.set(actor.x, groundY + actor.y + 2.55, actor.z);
      const prog = actor.actionDuration > 0 ? Math.min(1, (actor.actionDuration - actor.actionTimer) / 1.25) : 1;
      const sc = 0.35 + prog * 1.1 + Math.sin(elapsed * 22) * 0.06;
      vis.group.scale.setScalar(sc);
      vis.halo.rotation.x = elapsed * 6.5;
      vis.halo.rotation.y = elapsed * 4.5;
      if (Math.random() < 0.55) {
        this.spawnSparks(actor.x, groundY + actor.y + 2.55, actor.z, 0xfef08a, 1, 0.7, -4, 0.25);
      }
    }
  }

  public syncTelegraphs(telegraphs: TelegraphState[], mapId: MapId, elapsed: number): void {
    for (const slot of this.telegraphPool) {
      slot.group.visible = false;
      slot.id = null;
    }

    const maxTel = Math.min(telegraphs.length, this.telegraphPool.length);
    for (let i = 0; i < maxTel; i++) {
      const tel = telegraphs[i];
      const vis = this.telegraphPool[i];
      vis.id = tel.id;
      vis.group.visible = true;

      vis.circleBorder.visible = false;
      vis.circleFill.visible = false;
      vis.circleRune.visible = false;
      vis.lineBorder.visible = false;
      vis.lineFill.visible = false;
      vis.coneBorder.visible = false;
      vis.coneFill.visible = false;

      const groundY = getMapTerrainHeight(mapId, tel.x, tel.z);
      vis.group.position.set(tel.x, groundY + tel.y + 0.28, tel.z);
      const yaw = Math.atan2(tel.dirX, tel.dirZ);
      const pulse = 0.86 + Math.sin(elapsed * 26) * 0.14;
      const borderHex = tel.colorHex === 0xfacc15 ? 0xf59e0b : 0xf43f5e;

      if (tel.kind === 'circle') {
        vis.group.rotation.set(0, 0, 0);
        vis.circleBorder.visible = true;
        vis.circleFill.visible = true;
        vis.circleRune.visible = true;
        vis.circleBorder.material.color.setHex(borderHex);
        vis.circleFill.material.color.setHex(tel.colorHex);
        vis.circleBorder.scale.setScalar(tel.radius);
        vis.circleFill.scale.setScalar(Math.max(0.15, tel.radius * tel.progress));
        vis.circleRune.scale.setScalar(tel.radius * 0.88);
        vis.circleRune.rotation.z = elapsed * 2.8;
        vis.circleBorder.material.opacity = clampAdditiveOpacity(0.48 * pulse, true);
        vis.circleFill.material.opacity = clampAdditiveOpacity(0.18 + tel.progress * 0.18, true);
        vis.circleRune.material.opacity = clampAdditiveOpacity(0.32 + tel.progress * 0.18, true);
      } else if (tel.kind === 'line') {
        vis.group.rotation.set(0, yaw, 0);
        vis.lineBorder.visible = true;
        vis.lineFill.visible = true;
        vis.lineBorder.material.color.setHex(borderHex);
        vis.lineFill.material.color.setHex(tel.colorHex);
        const w = Math.max(1.2, tel.radius * 2);
        vis.lineBorder.scale.set(w, 1, tel.length);
        vis.lineFill.scale.set(w * 0.92, 1, Math.max(0.4, tel.length * tel.progress));
        vis.lineBorder.material.opacity = 0.30 * pulse;
        vis.lineFill.material.opacity = clampAdditiveOpacity(0.20 + tel.progress * 0.20, true);
      } else {
        vis.group.rotation.set(0, yaw, 0);
        vis.coneBorder.visible = true;
        vis.coneFill.visible = true;
        vis.coneBorder.material.color.setHex(borderHex);
        vis.coneFill.material.color.setHex(tel.colorHex);
        vis.coneBorder.scale.setScalar(tel.length);
        vis.coneFill.scale.setScalar(Math.max(0.4, tel.length * tel.progress));
        vis.coneBorder.material.opacity = 0.28 * pulse;
        vis.coneFill.material.opacity = clampAdditiveOpacity(0.18 + tel.progress * 0.18, true);
      }
    }
  }

  public syncAimPreview(
    aim: AimPreviewState | undefined,
    mapId: MapId,
    elapsed: number,
    obstacles?: Array<MapObstacle & { destroyed?: boolean }>
  ): void {
    for (let i = 0; i < this.aimRibbonSegments.length; i++) {
      this.aimRibbonSegments[i].visible = false;
    }
    for (let i = 0; i < this.aimArcDots.length; i++) {
      this.aimArcDots[i].visible = false;
    }
    this.aimWallCrossGroup.visible = false;

    if (!aim || !aim.active || aim.aimKind === 'none') {
      this.aimGroup.visible = false;
      this.aimDropLine.visible = false;
      this.aimRangeRing.visible = false;
      return;
    }

    this.aimGroup.visible = true;
    const color = aim.cancelled ? 0xf43f5e : aim.colorHex;
    const pulse = 1 + Math.sin(elapsed * 11) * 0.04;
    const arenaRadius = MAP_BY_ID[mapId].arenaRadius;

    this.aimPointRing.visible = false;
    this.aimPointInner.visible = false;
    this.aimPointDisc.visible = false;
    this.aimLineStrip.visible = false;
    this.aimLineArrow.visible = false;
    this.aimLineOriginRing.visible = false;
    this.aimConeWedge.visible = false;

    const originSurfaceY = getSurfaceHeightAt(mapId, aim.originX, aim.originZ, arenaRadius, obstacles, aim.originY ?? 0);
    const aimSurfaceY = getSurfaceHeightAt(mapId, aim.aimX, aim.aimZ, arenaRadius, obstacles, aim.originY ?? 0);

    // Subtle crisp terrain aim range hologram (~0.35 opacity)
    if (aim.range > 0.5) {
      this.aimRangeRing.visible = true;
      this.aimRangeRing.position.set(aim.originX, originSurfaceY + 0.25, aim.originZ);
      this.aimRangeRing.scale.setScalar(aim.range);
      this.aimRangeRing.material.color.setHex(color);
      this.aimRangeRing.material.opacity = aim.cancelled ? 0.24 : 0.35;
    } else {
      this.aimRangeRing.visible = false;
    }

    if ((aim.originY ?? 0) > 0.65 && aim.aimKind !== 'arc') {
      const ox = aim.originX;
      const oy = getMapTerrainHeight(mapId, aim.originX, aim.originZ) + (aim.originY ?? 0) + 0.6;
      const oz = aim.originZ;
      const tx = aim.aimX;
      const ty = aimSurfaceY + 0.28;
      const tz = aim.aimZ;
      const dist = Math.hypot(tx - ox, ty - oy, tz - oz);
      if (dist > 0.2) {
        this.aimDropLine.visible = true;
        this.aimDropLine.position.set((ox + tx) * 0.5, (oy + ty) * 0.5, (oz + tz) * 0.5);
        this.aimDropLine.lookAt(tx, ty, tz);
        this.aimDropLine.scale.set(1.2, 1.2, dist);
        this.aimDropLine.material.color.setHex(color);
      } else {
        this.aimDropLine.visible = false;
      }
    } else {
      this.aimDropLine.visible = false;
    }

    const drawRibbonPath = (
      startSegIdx: number,
      pts: Array<{ x: number; y: number; z: number }>,
      width: number,
      opacity: number
    ): number => {
      let idx = startSegIdx;
      for (let i = 0; i < pts.length - 1 && idx < this.aimRibbonSegments.length; i++) {
        const p0 = pts[i];
        const p1 = pts[i + 1];
        const len = Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
        if (len < 0.02) continue;
        const seg = this.aimRibbonSegments[idx++];
        seg.visible = true;
        seg.position.set(p0.x, p0.y, p0.z);
        seg.lookAt(p1.x, p1.y, p1.z);
        seg.scale.set(width, 1, len + 0.001);
        seg.material.color.setHex(color);
        seg.material.opacity = clampAdditiveOpacity(opacity, true);
      }
      return idx;
    };

    const dx = aim.aimX - aim.originX;
    const dz = aim.aimZ - aim.originZ;
    const dirLen = Math.hypot(dx, dz);
    const dirX = dirLen > 0.05 ? dx / dirLen : 0;
    const dirZ = dirLen > 0.05 ? dz / dirLen : 1;

    if (aim.aimKind === 'point' || aim.aimKind === 'arc') {
      const pathRes = computeTerrainConformingAimPath({
        mapId,
        arenaRadius,
        startX: aim.originX,
        startRelY: aim.originY ?? 0,
        startZ: aim.originZ,
        dirX,
        dirZ,
        endX: aim.aimX,
        endZ: aim.aimZ,
        kind: aim.aimKind === 'arc' ? 'arc' : 'line',
        range: aim.range,
        segments: 14,
        arcPeakHeight: aim.aimKind === 'arc' ? 2.6 : 0,
        obstacles,
        ignoreWallStop: true,
      });

      const landX = pathRes.impactX;
      const landZ = pathRes.impactZ;
      const landY = aimSurfaceY + 0.28;

      this.aimGroup.position.set(landX, landY, landZ);
      this.aimGroup.rotation.set(0, 0, 0);
      this.aimPointRing.visible = true;
      this.aimPointInner.visible = true;
      this.aimPointDisc.visible = true;
      this.aimPointRing.scale.setScalar(aim.radius * pulse);
      this.aimPointInner.scale.setScalar(aim.radius * 0.85);
      this.aimPointInner.rotation.z = elapsed * 2.4;
      this.aimPointDisc.scale.setScalar(aim.radius);
      this.aimPointRing.material.color.setHex(color);
      this.aimPointInner.material.color.setHex(aim.cancelled ? 0xfda4af : 0xfef9c3);
      this.aimPointDisc.material.color.setHex(color);
      this.aimPointRing.material.opacity = aim.cancelled ? 0.34 : 0.48;
      this.aimPointDisc.material.opacity = aim.cancelled ? 0.10 : 0.22;

      drawRibbonPath(0, pathRes.groundPoints, aim.aimKind === 'arc' ? 0.42 : 0.32, aim.cancelled ? 0.16 : 0.34);

      if (aim.aimKind === 'arc') {
        const dotCount = Math.min(pathRes.points.length, this.aimArcDots.length);
        for (let i = 0; i < dotCount; i++) {
          const pt = pathRes.points[i];
          const dot = this.aimArcDots[i];
          dot.visible = true;
          dot.position.set(pt.x, pt.y, pt.z);
          const dScale = 0.72 + Math.sin(elapsed * 8 + i * 0.6) * 0.16;
          dot.scale.setScalar(dScale);
          dot.material.color.setHex(i === dotCount - 1 ? 0xfef9c3 : color);
          dot.material.opacity = aim.cancelled ? 0.24 : 0.46;
        }
      }
    } else if (aim.aimKind === 'line') {
      const endX = aim.originX + dirX * aim.range;
      const endZ = aim.originZ + dirZ * aim.range;
      const pathRes = computeTerrainConformingAimPath({
        mapId,
        arenaRadius,
        startX: aim.originX,
        startRelY: aim.originY ?? 0,
        startZ: aim.originZ,
        dirX,
        dirZ,
        endX,
        endZ,
        kind: 'line',
        range: aim.range,
        segments: 16,
        obstacles,
      });

      this.aimGroup.position.set(aim.originX, originSurfaceY + 0.28, aim.originZ);
      this.aimGroup.rotation.set(0, Math.atan2(dirX, dirZ), 0);
      this.aimLineOriginRing.visible = true;
      this.aimLineOriginRing.scale.setScalar(1.35 * pulse);
      this.aimLineOriginRing.material.color.setHex(color);

      drawRibbonPath(0, pathRes.groundPoints, Math.max(0.65, aim.radius * 2), aim.cancelled ? 0.16 : 0.35);

      this.aimLineArrow.visible = true;
      const arrowDist = pathRes.blocked
        ? Math.max(0.5, Math.hypot(pathRes.impactX - aim.originX, pathRes.impactZ - aim.originZ))
        : aim.range;
      this.aimLineArrow.position.set(0, Math.max(0.25, pathRes.impactY - (originSurfaceY + 0.28) + 0.16), arrowDist);
      this.aimLineArrow.scale.set(aim.radius * 0.65, 0.4, 1.1);
      this.aimLineArrow.material.color.setHex(pathRes.blocked ? 0xf43f5e : color);

      if (pathRes.blocked) {
        this.aimWallCrossGroup.visible = true;
        this.aimWallCrossGroup.position.set(pathRes.impactX, pathRes.impactY + 0.72, pathRes.impactZ);
        this.aimWallCrossGroup.lookAt(aim.originX, pathRes.impactY + 0.72, aim.originZ);
        this.aimWallCrossGroup.scale.setScalar(1.0 + Math.sin(elapsed * 16) * 0.08);
      }
    } else if (aim.aimKind === 'cone') {
      const baseYaw = Math.atan2(dirX, dirZ);
      this.aimGroup.position.set(aim.originX, originSurfaceY + 0.28, aim.originZ);
      this.aimGroup.rotation.set(0, baseYaw, 0);

      let nextSeg = 0;
      const spokeAngles = [-0.36, 0, 0.36];
      for (let s = 0; s < spokeAngles.length; s++) {
        const ang = baseYaw + spokeAngles[s];
        const sDirX = Math.sin(ang);
        const sDirZ = Math.cos(ang);
        const sx = aim.originX + sDirX * aim.range;
        const sz = aim.originZ + sDirZ * aim.range;
        const pathRes = computeTerrainConformingAimPath({
          mapId,
          arenaRadius,
          startX: aim.originX,
          startRelY: aim.originY ?? 0,
          startZ: aim.originZ,
          dirX: sDirX,
          dirZ: sDirZ,
          endX: sx,
          endZ: sz,
          kind: 'line',
          range: aim.range,
          segments: 8,
          obstacles,
        });
        nextSeg = drawRibbonPath(nextSeg, pathRes.groundPoints, s === 1 ? 0.48 : 0.32, aim.cancelled ? 0.15 : 0.34);
      }
      const rimPts: Array<{ x: number; y: number; z: number }> = [];
      for (let r = 0; r <= 6; r++) {
        const a = baseYaw - 0.36 + (r / 6) * 0.72;
        const rx = aim.originX + Math.sin(a) * aim.range;
        const rz = aim.originZ + Math.cos(a) * aim.range;
        const ry = getSurfaceHeightAt(mapId, rx, rz, arenaRadius, obstacles, aim.originY ?? 0) + 0.28;
        rimPts.push({ x: rx, y: ry, z: rz });
      }
      drawRibbonPath(nextSeg, rimPts, 0.38, aim.cancelled ? 0.16 : 0.42);
    }
  }

  public syncDomainCast(cast: DomainCastState | null | undefined, mapId: MapId, elapsed: number): void {
    if (!cast) {
      this.domainCastGroup.visible = false;
      return;
    }
    this.domainCastGroup.visible = true;
    const groundY = getMapTerrainHeight(mapId, cast.centerX, cast.centerZ);
    this.domainCastGroup.position.set(cast.centerX, groundY, cast.centerZ);
    const prog = Math.max(0, Math.min(1, cast.elapsed / Math.max(0.1, cast.duration)));
    const r = cast.radius;
    const pulse = 1 + Math.sin(elapsed * 14) * 0.015;

    const ringHex =
      cast.phase === 'escape_window'
        ? 0x22d3ee
        : cast.phase === 'sealed_cancelable'
        ? 0xf43f5e
        : cast.primaryHex;

    this.domainCastRing.scale.setScalar(r * pulse);
    this.domainCastRing.material.color.setHex(ringHex);
    this.domainCastRing.material.opacity = cast.phase === 'escape_window' ? 0.44 : 0.50;

    this.domainCastDisc.scale.setScalar(r);
    this.domainCastDisc.material.color.setHex(cast.secondaryHex);
    this.domainCastDisc.material.opacity = cast.phase === 'building' ? 0.22 : 0.14;

    this.domainCastSealRing.visible = cast.phase !== 'escape_window';
    this.domainCastSealRing.scale.setScalar(r * (0.45 + prog * 0.52));
    this.domainCastSealRing.rotation.z = elapsed * 3.4;
    this.domainCastSealRing.material.color.setHex(cast.primaryHex);
    this.domainCastSealRing.material.opacity = cast.phase === 'building' ? 0.46 : 0.38;

    if (cast.phase === 'building') {
      const buildProg = Math.max(0.08, (prog - 0.6) / 0.4);
      this.domainCastDome.visible = true;
      this.domainCastDome.scale.set(r, r * buildProg, r);
      this.domainCastDome.material.color.setHex(cast.primaryHex);
      this.domainCastDome.material.opacity = Math.min(0.24, 0.09 + buildProg * 0.14);
    } else {
      this.domainCastDome.visible = false;
    }
  }

  public syncDomainExpansion(domain: DomainExpansionState | null | undefined, mapId: MapId, elapsed: number): void {
    // Always hide Khen shadow clones & JM web lines first before updating active domain visuals
    for (let i = 0; i < this.khenClonePool.length; i++) {
      this.khenClonePool[i].group.visible = false;
    }
    for (let i = 0; i < this.jmWebLinePool.length; i++) {
      this.jmWebLinePool[i].group.visible = false;
    }

    if (!domain) {
      this.domainGroup.visible = false;
      return;
    }
    this.domainGroup.visible = true;
    const groundY = getMapTerrainHeight(mapId, domain.centerX, domain.centerZ);
    this.domainGroup.position.set(domain.centerX, groundY, domain.centerZ);
    const fade = Math.min(1, domain.remaining / 0.8);
    const r = domain.radius;

    this.domainDome.visible = domain.fighterId !== 'prime' && domain.fighterId !== 'jm';
    this.domainDome.scale.setScalar(r);
    this.domainDome.material.color.setHex(
      domain.fighterId === 'khen'
        ? 0x090414
        : domain.fighterId === 'marjohn'
        ? 0x082f49
        : domain.fighterId === 'damen'
        ? 0x451a03
        : 0x0f172a
    );
    this.domainDome.material.opacity = (domain.fighterId === 'khen' ? 0.42 : 0.18) * fade;

    this.domainBarrierRing.scale.setScalar(r * (1 + Math.sin(elapsed * 6) * 0.01));
    this.domainBarrierRing.material.color.setHex(
      domain.fighterId === 'jm' ? 0xf59e0b : domain.primaryHex
    );
    this.domainBarrierRing.material.opacity = 0.48 * fade;

    this.domainFloorDisc.scale.setScalar(r);
    this.domainFloorDisc.material.color.setHex(
      domain.fighterId === 'khen'
        ? 0x090314
        : domain.fighterId === 'prime'
        ? 0x450a0a
        : domain.fighterId === 'damen'
        ? 0x291503
        : domain.fighterId === 'marjohn'
        ? 0x042f2e
        : 0x0b1224
    );
    this.domainFloorDisc.material.opacity =
      (domain.fighterId === 'khen' ? 0.56 : domain.fighterId === 'jm' ? 0.24 : 0.28) * fade;

    this.domainInnerRune.scale.setScalar(r * (domain.fighterId === 'damen' ? 0.78 : 0.58));
    this.domainInnerRune.rotation.z = elapsed * (domain.fighterId === 'damen' ? 2.8 : -1.8);
    this.domainInnerRune.material.color.setHex(
      domain.fighterId === 'damen' ? 0xf59e0b : domain.fighterId === 'jm' ? 0x06b6d4 : domain.primaryHex
    );
    this.domainInnerRune.material.opacity = (domain.fighterId === 'jm' ? 0.30 : 0.42) * fade;

    const showPillars = domain.fighterId === 'prime' || domain.fighterId === 'jm' || domain.fighterId === 'khen';
    for (let i = 0; i < this.domainPillars.length; i++) {
      const pl = this.domainPillars[i];
      pl.visible = showPillars;
      if (showPillars) {
        const ang = (i / this.domainPillars.length) * Math.PI * 2 + elapsed * (domain.fighterId === 'khen' ? 0.4 : 0.15);
        const dist = r * (domain.fighterId === 'prime' ? 0.85 : 0.78);
        pl.position.set(Math.cos(ang) * dist, 0, Math.sin(ang) * dist);
        pl.material.color.setHex(domain.fighterId === 'prime' ? 0xdc2626 : domain.fighterId === 'jm' ? 0xfef08a : 0x7e22ce);
        pl.material.opacity = 0.46 * fade;
      }

      const gun = this.domainGuns[i];
      gun.visible = domain.fighterId === 'damen';
      if (domain.fighterId === 'damen') {
        const ang = (i / this.domainGuns.length) * Math.PI * 2 + elapsed * 1.1;
        const dist = r * 0.66;
        gun.position.set(Math.cos(ang) * dist, 2.2 + Math.sin(elapsed * 5 + i) * 0.35, Math.sin(ang) * dist);
        gun.rotation.y = -ang + Math.PI * 0.5;
        gun.scale.setScalar(domain.jackpotActive ? 1.65 : 1.25);
        gun.material.color.setHex(domain.jackpotActive ? 0xfef08a : 0xd97706);
        gun.material.emissive.setHex(domain.jackpotActive ? 0xf59e0b : 0x92400e);
        gun.material.opacity = 0.94 * fade;
      }
    }

    // Khen 3 Autonomous AI Shadow Clones (sculpted cloaked figures)
    if (domain.fighterId === 'khen' && domain.khenClones && domain.khenClones.length > 0) {
      const maxClones = Math.min(domain.khenClones.length, this.khenClonePool.length);
      for (let i = 0; i < maxClones; i++) {
        const c = domain.khenClones[i];
        const slot = this.khenClonePool[i];
        slot.group.visible = true;
        const cy = getMapTerrainHeight(mapId, c.x, c.z) + c.y;
        slot.group.position.set(c.x, cy, c.z);
        slot.group.rotation.y = c.rotY;
        const isSkillPose = c.actionState === 'skill' || c.actionState === 'ultimate';
        const bob =
          c.actionState === 'move'
            ? Math.sin(elapsed * 16 + i * 2) * 0.08
            : isSkillPose
            ? Math.sin(elapsed * 22 + i) * 0.14
            : 0;
        slot.torso.position.y = 0.92 + bob;
        const swing =
          c.swingTimer > 0
            ? Math.sin((c.swingTimer / 0.36) * Math.PI) * (isSkillPose ? 1.55 : 1.15)
            : Math.sin(elapsed * 8 + i) * 0.22;
        if (c.actionState === 'ultimate') {
          slot.rightArm.rotation.x = -0.85 - swing;
          slot.leftArm.rotation.x = -0.85 - swing * 0.85;
          slot.auraRing.scale.setScalar(1.45);
        } else if (c.actionState === 'skill') {
          slot.rightArm.rotation.x = -0.65 - swing;
          slot.leftArm.rotation.x = -0.55 - swing * 0.7;
          slot.auraRing.scale.setScalar(1.25);
        } else {
          slot.rightArm.rotation.x = -0.35 - swing;
          slot.leftArm.rotation.x = -0.25 + swing * 0.6;
          slot.auraRing.scale.setScalar(1.0);
        }
        slot.auraRing.rotation.z = elapsed * (isSkillPose ? 8.5 : 4.5) + i;
      }
    }

    // JM Permanent Floor Golden-Cyan Energy Web Lines (balanced crisp visibility)
    if (domain.fighterId === 'jm' && domain.jmWebLines && domain.jmWebLines.length > 0) {
      const maxLines = Math.min(domain.jmWebLines.length, this.jmWebLinePool.length);
      for (let i = 0; i < maxLines; i++) {
        const line = domain.jmWebLines[i];
        const slot = this.jmWebLinePool[i];
        const len = Math.hypot(line.x2 - line.x1, line.z2 - line.z1);
        if (len < 0.25) continue;
        const mx = (line.x1 + line.x2) * 0.5;
        const mz = (line.z1 + line.z2) * 0.5;
        const g1 = getMapTerrainHeight(mapId, line.x1, line.z1);
        const g2 = getMapTerrainHeight(mapId, line.x2, line.z2);
        const my = Math.max(g1, g2, getMapTerrainHeight(mapId, mx, mz)) + 0.35 + (i % 3) * 0.08;
        const flicker = 0.92 + Math.sin(elapsed * 14 + i * 1.7) * 0.08;
        slot.group.visible = true;
        slot.group.position.set(mx, my, mz);
        slot.group.lookAt(line.x2, my, line.z2);
        slot.group.scale.set(1, 1, len);
        slot.outer.material.opacity = 0.30 * flicker * fade;
        slot.core.material.opacity = 0.50 * fade;
      }
    }
  }

  public syncKothZone(zone: KothZoneState | null | undefined, mapId: MapId, elapsed: number): void {
    if (!zone) {
      this.kothGroup.visible = false;
      return;
    }
    this.kothGroup.visible = true;
    const groundY = getMapTerrainHeight(mapId, zone.x, zone.z);
    this.kothGroup.position.set(zone.x, groundY, zone.z);
    const hex = zone.controllerTeam === 'alpha' ? 0x38bdf8 : zone.controllerTeam === 'beta' ? 0xf43f5e : 0xf59e0b;
    const pulse = 1 + Math.sin(elapsed * 5.5) * 0.03;
    this.kothOuterRing.scale.setScalar(zone.radius * pulse);
    this.kothOuterRing.material.color.setHex(hex);
    this.kothOuterRing.material.opacity = 0.46;
    this.kothInnerDisc.scale.setScalar(zone.radius);
    this.kothInnerDisc.material.color.setHex(hex);
    this.kothInnerDisc.material.opacity = 0.16 + Math.sin(elapsed * 4) * 0.04;
    this.kothBeacon.material.color.setHex(hex);
    this.kothBeacon.material.opacity = 0.20 + Math.sin(elapsed * 6) * 0.05;
  }

  public syncPickups(pickups: ArenaPickup[], mapId: MapId, elapsed: number): void {
    for (const slot of this.pickupPool) {
      slot.group.visible = false;
      slot.id = null;
    }

    const maxPk = Math.min(pickups.length, this.pickupPool.length);
    for (let i = 0; i < maxPk; i++) {
      const pk = pickups[i];
      const vis = this.pickupPool[i];
      vis.id = pk.id;
      vis.group.visible = true;

      const isHp = pk.kind === 'health';
      const isStr = pk.kind === 'strength';
      const hex = isHp ? 0x10b981 : isStr ? 0xdc2626 : 0x06b6d4;
      const runeHex = isHp ? 0x6ee7b7 : isStr ? 0xfbbf24 : 0x67e8f9;

      vis.orb.material.color.setHex(hex);
      vis.orb.material.emissive.setHex(isStr ? 0xea580c : hex);
      vis.ring.material.color.setHex(hex);
      vis.runeRing.material.color.setHex(runeHex);
      vis.beacon.material.color.setHex(isStr ? 0xf59e0b : hex);
      vis.moteA.material.color.setHex(runeHex);
      vis.moteB.material.color.setHex(hex);

      const badgeMat = vis.badgeSprite.material as THREE.SpriteMaterial;
      const targetTex = this.orbBadgeTexs[pk.kind] ?? null;
      if (badgeMat.map !== targetTex) {
        badgeMat.map = targetTex;
        badgeMat.needsUpdate = true;
      }

      const groundY = getMapTerrainHeight(mapId, pk.x, pk.z);
      vis.group.position.set(pk.x, groundY + pk.y, pk.z);
      vis.orb.visible = pk.active;
      vis.orb.rotation.y = elapsed * (isStr ? 3.4 : 2.6);
      vis.orb.rotation.x = Math.sin(elapsed * 2.2 + i) * 0.25;
      vis.orb.position.y = Math.sin(elapsed * 3.6 + pk.x) * 0.18;
      vis.orb.scale.setScalar((isStr ? 1.24 : 1.12) + Math.sin(elapsed * 5.2 + pk.z) * 0.1);

      vis.ring.material.opacity = pk.active ? 0.46 : 0.16;
      vis.ring.scale.setScalar(1.15 + Math.sin(elapsed * 5 + i) * 0.12);
      vis.runeRing.visible = pk.active;
      vis.runeRing.rotation.z = -elapsed * 2.8;
      vis.runeRing.material.opacity = 0.42;
      vis.beacon.visible = pk.active;
      vis.beacon.material.opacity = clampAdditiveOpacity(0.24 + Math.sin(elapsed * 6.0 + pk.x) * 0.04, true);

      vis.moteA.visible = pk.active;
      vis.moteB.visible = pk.active;
      const orbitAng = elapsed * 4.4 + i;
      vis.moteA.position.set(Math.cos(orbitAng) * 0.72, vis.orb.position.y + 0.18, Math.sin(orbitAng) * 0.72);
      vis.moteB.position.set(
        Math.cos(orbitAng + Math.PI) * 0.72,
        vis.orb.position.y - 0.18,
        Math.sin(orbitAng + Math.PI) * 0.72
      );

      vis.badgeSprite.visible = pk.active;
      vis.badgeSprite.position.y = 1.48 + vis.orb.position.y * 0.6;

      if (pk.active && pk.magnetTargetId && Math.random() < 0.45) {
        this.spawnSparks(pk.x, groundY + pk.y, pk.z, hex, 1, 0.45, -2, 0.2);
      }
    }
  }

  public syncItemDrops(drops: ArenaItemDrop[] | undefined, mapId: MapId, elapsed: number): void {
    for (const slot of this.itemDropPool) {
      slot.group.visible = false;
      slot.id = null;
    }
    if (!drops || drops.length === 0) return;

    const maxDrops = Math.min(drops.length, this.itemDropPool.length);
    for (let i = 0; i < maxDrops; i++) {
      const dr = drops[i];
      const vis = this.itemDropPool[i];
      vis.id = dr.id;
      vis.group.visible = true;

      const spec = TACTICAL_ITEMS_BY_KIND[dr.kind];
      const hex = spec?.colorHex ?? 0xf97316;
      vis.crate.material.color.setHex(hex);
      vis.crate.material.emissive.setHex(hex);
      vis.ring.material.color.setHex(hex);
      vis.beacon.material.color.setHex(hex);

      const badgeMat = vis.badgeSprite.material as THREE.SpriteMaterial;
      const targetTex = this.itemBadgeTexs[dr.kind] ?? null;
      if (badgeMat.map !== targetTex) {
        badgeMat.map = targetTex;
        badgeMat.needsUpdate = true;
      }

      const groundY = getMapTerrainHeight(mapId, dr.x, dr.z);
      vis.group.position.set(dr.x, groundY + dr.y, dr.z);
      vis.crate.visible = dr.active;
      vis.crate.rotation.y = elapsed * 2.2 + i;
      vis.crate.position.y = Math.sin(elapsed * 3.1 + dr.z) * 0.16;
      vis.ring.material.opacity = dr.active ? 0.46 : 0.16;
      vis.runeRing.visible = dr.active;
      vis.runeRing.rotation.z = elapsed * 2.4;
      vis.runeRing.material.opacity = 0.42;
      vis.beacon.visible = dr.active;
      vis.beacon.material.opacity = clampAdditiveOpacity(0.22 + Math.sin(elapsed * 4.5 + i) * 0.04, true);
      vis.badgeSprite.visible = dr.active;
      vis.badgeSprite.position.y = 1.52 + vis.crate.position.y * 0.5;
    }
  }

  public syncTempleNpc(npc: TempleNpcState | null | undefined, mapId: MapId, elapsed: number): void {
    if (!npc || !npc.active || npc.defeated) {
      this.templeNpcGroup.visible = false;
      return;
    }
    this.templeNpcGroup.visible = true;
    const groundY = getMapTerrainHeight(mapId, npc.x, npc.z);
    this.templeNpcGroup.position.set(npc.x, groundY + npc.y, npc.z);
    const hex = npc.hostile ? 0xf43f5e : 0x38bdf8;
    this.templeNpcRing.material.color.setHex(hex);
    this.templeNpcRing.scale.setScalar((npc.hostile ? 2.1 : 1.75) + Math.sin(elapsed * 4.8) * 0.08);
    const mat = this.templeNpcSprite.material as THREE.SpriteMaterial;
    const desiredTex = npc.hostile ? this.npcBossTex ?? null : this.npcTalkTex ?? null;
    if (mat.map !== desiredTex) {
      mat.map = desiredTex;
      mat.needsUpdate = true;
    }
    this.templeNpcSprite.position.y = 3.85 + Math.sin(elapsed * 3.0) * 0.08;
  }

  public syncProjectiles(projectiles: ProjectileState[], mapId: MapId, dt: number): void {
    for (const slot of this.projPool) {
      slot.mesh.visible = false;
      slot.coreMesh.visible = false;
      slot.tether.visible = false;
      slot.id = null;
    }

    const maxProj = Math.min(projectiles.length, this.projPool.length);
    for (let i = 0; i < maxProj; i++) {
      const p = projectiles[i];
      const slot = this.projPool[i];
      slot.id = p.id;
      const mesh = slot.mesh;
      const core = slot.coreMesh;
      mesh.visible = true;

      const geo =
        p.kind === 'solarFireball'
          ? this.solarFireballGeo
          : p.kind === 'tornado' || p.kind === 'tornadoVortex'
          ? this.tornadoGeo
          : p.kind === 'jmBeam'
          ? this.jmBeamGeo
          : p.kind === 'jmBolt'
          ? this.jmBoltGeo
          : p.kind === 'lasso'
          ? this.lassoGeo
          : p.kind === 'crescent'
          ? this.crescentGeo
          : p.kind === 'windBlade'
          ? this.windBladeGeo
          : p.kind === 'solarRailgun'
          ? this.solarRailgunGeo
          : p.kind === 'magnum'
          ? this.magnumGeo
          : this.bulletGeo;

      const isTornado = p.kind === 'tornado' || p.kind === 'tornadoVortex';
      const targetCoreGeo = isTornado ? this.tornadoRibbonGeo : geo;

      if (mesh.geometry !== geo) {
        mesh.geometry = geo;
      }
      if (core.geometry !== targetCoreGeo) {
        core.geometry = targetCoreGeo;
      }

      const targetMap = isTornado || p.kind === 'windBlade'
        ? this.atlas.scrollingWindTex ?? null
        : p.kind === 'solarFireball' || p.kind === 'solarRailgun'
        ? this.atlas.scrollingMagmaTex ?? null
        : p.kind === 'jmBeam' || p.kind === 'jmBolt'
        ? this.atlas.scrollingEnergyTex ?? null
        : p.kind === 'crescent'
        ? this.atlas.taperedSlashTex ?? null
        : this.atlas.scrollingTurbulenceTex ?? null;
      if (mesh.material.map !== targetMap) {
        mesh.material.map = targetMap;
        mesh.material.needsUpdate = true;
      }
      const targetCoreMap = isTornado
        ? this.atlas.taperedSlashTex ?? null
        : this.atlas.coreGlowTex ?? null;
      if (core.material.map !== targetCoreMap) {
        core.material.map = targetCoreMap;
        core.material.needsUpdate = true;
      }

      const boosted = Boolean(p.isComboLink || p.isOverdrive || p.isHoming);
      const resolvedColor =
        p.kind === 'crescent' && boosted
          ? 0xa855f7
          : p.kind === 'windBlade'
          ? 0x2dd4bf
          : p.kind === 'solarRailgun'
          ? 0xf59e0b
          : p.kind === 'tornadoVortex' || (p.kind === 'tornado' && p.isHoming)
          ? 0x38bdf8
          : p.kind === 'solarFireball'
          ? 0xea580c
          : p.kind === 'jmBeam'
          ? 0x06b6d4
          : p.colorHex;

      mesh.material.color.setHex(resolvedColor);
      mesh.material.opacity = clampAdditiveOpacity(isTornado ? 0.72 : 0.80);
      core.material.color.setHex(isTornado ? 0x5eead4 : 0xfef9c3);
      core.material.opacity = isTornado ? 0.82 : 0.84;

      mesh.rotation.set(0, 0, 0);
      mesh.scale.setScalar(1);
      core.visible = false;
      core.rotation.set(0, 0, 0);

      if (p.kind === 'lasso' || p.kind === 'crescent' || p.kind === 'windBlade') {
        mesh.rotation.x = Math.PI * 0.5;
      }

      const pGroundY = getMapTerrainHeight(mapId, p.x, p.z);
      const py = Math.max(0.28, p.y);
      mesh.position.set(p.x, p.kind === 'solarFireball' ? py : pGroundY + py - 0.05, p.z);

      if (p.kind === 'solarFireball') {
        mesh.scale.setScalar(1.25 + Math.sin(this.elapsedTime * 30) * 0.1);
        core.visible = true;
        core.scale.setScalar(0.32);
        if (Math.random() < 0.48) {
          this.spawnPuffs(p.x, py, p.z, 0x1c1917, 1, 0.9, 1.8, 0.65, 1.8, 0.34, 0.72);
          this.spawnSparks(p.x, py, p.z, 0xfbbf24, 1, 0.9, 6, 0.26);
        }
      } else if (isTornado) {
        const isCat5 = p.kind === 'tornadoVortex';
        const isHomingTorn = Boolean(p.isHoming);
        mesh.rotation.y = this.elapsedTime * (isCat5 ? 24 : isHomingTorn ? 20 : 16);
        const pulse = (isCat5 ? 2.25 : isHomingTorn ? 1.28 : 1.0) + Math.sin(this.elapsedTime * 25) * 0.14;
        mesh.scale.set(pulse, isCat5 ? 2.15 : isHomingTorn ? 1.35 : 1.08, pulse);
        core.visible = true;
        core.scale.set(1.06, 1.02, 1.06);
        core.rotation.y = -this.elapsedTime * 16;
        if (Math.random() < (isCat5 || isHomingTorn ? 0.55 : 0.35)) {
          this.spawnSparks(p.x, pGroundY + py + 0.55, p.z, isCat5 || isHomingTorn ? 0x38bdf8 : 0x5eead4, 1, 1.2, 2, 0.24);
        }
        if (Math.random() < 0.28) {
          this.spawnPuffs(p.x, pGroundY + 0.35, p.z, 0x475569, 1, 1.0, 1.5, 0.45, 1.45, 0.38, 0.56);
        }
      } else if (p.kind === 'jmBeam') {
        mesh.rotation.y = p.rotY;
        const pulse = 1.0 + Math.sin(this.elapsedTime * 40) * 0.15;
        mesh.scale.set(pulse, pulse, 1.2);
        core.visible = true;
        core.scale.set(0.32, 0.32, 1.02);
        if (Math.random() < 0.5) {
          this.spawnSparks(p.x, pGroundY + py, p.z, 0xfef08a, 1, 0.8, 4, 0.22);
        }
      } else if (p.kind === 'jmBolt') {
        mesh.scale.setScalar(1.05 + Math.sin(this.elapsedTime * 35) * 0.15);
        core.visible = true;
        core.scale.setScalar(0.34);
        if (Math.random() < 0.35) {
          this.spawnSparks(p.x, pGroundY + py, p.z, 0xf59e0b, 1, 0.6, 2, 0.18);
        }
      } else if (p.kind === 'crescent' || p.kind === 'windBlade') {
        if (p.kind === 'crescent' && boosted) {
          mesh.scale.set(1.85, 1.85, 1.5);
        } else if (p.kind === 'windBlade') {
          mesh.scale.set(1.35, 1.35, 1.35);
        }
        mesh.rotation.z = -p.rotY + Math.PI * 0.5;
        core.visible = true;
        core.scale.setScalar(0.45);
        if (Math.random() < 0.34) {
          this.spawnPuffs(p.x, pGroundY + py, p.z, p.kind === 'windBlade' ? 0xcbd5e1 : 0x09090b, 1, 0.3, 0.55, 0.25, 0.75, 0.24, 0.58);
        }
      } else if (p.kind === 'magnum' || p.kind === 'solarRailgun') {
        mesh.rotation.y = p.rotY;
        core.visible = true;
        core.scale.set(0.34, 0.34, 1.0);
        if (p.kind === 'solarRailgun' && Math.random() < 0.45) {
          this.spawnSparks(p.x, pGroundY + py, p.z, 0xf59e0b, 1, 0.8, 2, 0.18);
        }
      } else if (p.kind === 'lasso') {
        mesh.rotation.z = this.elapsedTime * 12;
        const ownerPos = this.actorPositions.get(p.ownerId);
        const ox = ownerPos?.x ?? p.originX ?? p.x;
        const oy = (ownerPos?.y ?? 0) + 1.05;
        const oz = ownerPos?.z ?? p.originZ ?? p.z;
        const dist = Math.hypot(p.x - ox, pGroundY + py - oy, p.z - oz);
        if (dist > 0.1) {
          slot.tether.visible = true;
          slot.tether.position.set((ox + p.x) * 0.5, (oy + pGroundY + py) * 0.5, (oz + p.z) * 0.5);
          slot.tether.lookAt(p.x, pGroundY + py, p.z);
          slot.tether.scale.set(1.0, 1.0, dist);
        }
      }
      void dt;
    }
  }

  public syncAwakeningOrbs(orbs: AwakeningOrbState[], mapId: MapId, elapsed: number): void {
    for (const slot of this.awakeningOrbPool) {
      slot.group.visible = false;
      slot.id = null;
    }

    let slotIdx = 0;
    for (const orb of orbs) {
      if (!orb.active && orb.fadeTimer <= 0) continue;
      if (slotIdx >= this.awakeningOrbPool.length) break;

      const vis = this.awakeningOrbPool[slotIdx++];
      vis.id = orb.id;
      vis.group.visible = true;

      const groundY = getMapTerrainHeight(mapId, orb.x, orb.z);
      const bob = Math.sin(elapsed * 2.8 + orb.x) * AWAKENING_CONFIG.ORB_BOB_AMPLITUDE;
      vis.group.position.set(orb.x, groundY + orb.y + bob, orb.z);

      const fade = orb.active
        ? 1
        : Math.max(0, Math.min(1, orb.fadeTimer / Math.max(0.01, AWAKENING_CONFIG.ORB_FADEOUT_SEC)));

      const rem = orb.remaining ?? AWAKENING_CONFIG.ORB_LIFESPAN_SEC;
      const maxDur = Math.max(0.1, orb.maxDuration ?? AWAKENING_CONFIG.ORB_LIFESPAN_SEC);
      const frac = Math.max(0.05, Math.min(1, rem / maxDur));
      const urgent = rem <= 5.0;

      vis.crystal.rotation.y = elapsed * AWAKENING_CONFIG.ORB_ROTATION_SPEED;
      vis.crystal.rotation.x = Math.sin(elapsed * 1.4) * 0.25;
      vis.crystal.material.opacity = 0.96 * fade;

      vis.ringA.rotation.x = elapsed * 1.6;
      vis.ringA.rotation.y = elapsed * 1.1;
      vis.ringA.material.opacity = 0.46 * fade;

      vis.ringB.rotation.y = -elapsed * 1.8;
      vis.ringB.rotation.z = elapsed * 1.2;
      vis.ringB.material.opacity = 0.46 * fade;

      vis.groundRing.visible = orb.active;
      vis.groundRing.position.y = -(AWAKENING_CONFIG.ORB_HOVER_HEIGHT + bob) + 0.08;
      vis.groundRing.scale.setScalar(0.35 + frac * 1.15);
      vis.groundRing.material.color.setHex(urgent ? 0xf43f5e : 0xf59e0b);
      vis.groundRing.material.opacity = clampAdditiveOpacity(0.38 + Math.sin(elapsed * (urgent ? 14 : 6)) * 0.08, true) * fade;

      const labelText = `AWAKENING — ${Math.max(0, rem).toFixed(1)}s`;
      if (vis.lastLabelText !== labelText) {
        vis.lastLabelText = labelText;
        const lctx = vis.labelCanvas.getContext('2d');
        if (lctx) {
          lctx.clearRect(0, 0, 448, 104);
          lctx.fillStyle = urgent ? 'rgba(127, 29, 29, 0.94)' : 'rgba(15, 23, 42, 0.92)';
          lctx.strokeStyle = urgent ? '#fb7185' : '#38bdf8';
          lctx.lineWidth = 4;
          lctx.beginPath();
          lctx.roundRect(8, 10, 432, 84, 18);
          lctx.fill();
          lctx.stroke();
          lctx.font = '900 34px "Impact", "Arial Black", sans-serif';
          lctx.textAlign = 'center';
          lctx.textBaseline = 'middle';
          lctx.strokeStyle = '#09090b';
          lctx.lineWidth = 6;
          lctx.strokeText(labelText, 224, 53, 404);
          lctx.fillStyle = urgent ? '#fda4af' : '#fef08a';
          lctx.fillText(labelText, 224, 53, 404);
          vis.labelTex.needsUpdate = true;
        }
      }

      const pulse = 1 + Math.sin(elapsed * 5.2) * 0.12;
      vis.column.material.opacity = clampAdditiveOpacity(0.20 + Math.sin(elapsed * 4.5) * 0.04, true) * fade;
      vis.column.scale.set(pulse, 1, pulse);

      (vis.haloSprite.material as THREE.SpriteMaterial).opacity = clampAdditiveOpacity(0.42 + Math.sin(elapsed * 6.0) * 0.06, true) * fade;
      vis.haloSprite.scale.setScalar((3.4 + Math.sin(elapsed * 4.5) * 0.35) * (0.7 + fade * 0.3));

      (vis.labelSprite.material as THREE.SpriteMaterial).opacity = fade;
      const labelPulse = 1 + Math.sin(elapsed * (urgent ? 10.5 : 4.2)) * (urgent ? 0.11 : 0.07);
      vis.labelSprite.scale.set(4.5 * labelPulse, 1.05 * labelPulse, 1);

      for (const pt of vis.particles) {
        const t = (elapsed * pt.speed + pt.phase) % 1;
        const ang = t * Math.PI * 4 + pt.phase * 12;
        pt.mesh.position.set(
          Math.cos(ang) * pt.radius,
          -AWAKENING_CONFIG.ORB_HOVER_HEIGHT + t * 8.5,
          Math.sin(ang) * pt.radius
        );
        pt.mesh.rotation.y = elapsed * 5;
        pt.mesh.scale.setScalar((1 - t * 0.45) * (0.8 + fade * 0.3));
        pt.mesh.material.opacity = Math.sin(t * Math.PI) * 0.46 * fade;
      }
    }
  }

  public syncChannels(
    actors: ArenaActorState[],
    zones: ArenaZoneState[],
    mapId: MapId,
    elapsed: number,
    _dt: number
  ): void {
    for (const rig of this.kamehamehaRigs) rig.group.visible = false;
    for (const rig of this.iceNovaRigs) rig.group.visible = false;
    for (const rig of this.khenDomainRigs) rig.group.visible = false;
    for (const rig of this.damenArsenalRigs) rig.group.visible = false;
    for (const rig of this.marjohnTyphoonRigs) rig.group.visible = false;
    for (const rig of this.primeMeteorRigs) rig.group.visible = false;

    let kameIdx = 0;
    let khenIdx = 0;
    let damenIdx = 0;
    let marjIdx = 0;
    let primeIdx = 0;

    for (const actor of actors) {
      if (actor.isKO || !actor.channelKind) continue;
      const groundY = getMapTerrainHeight(mapId, actor.x, actor.z);

      if (actor.channelKind === 'jm_kamehameha_charge' && kameIdx < this.kamehamehaRigs.length) {
        const rig = this.kamehamehaRigs[kameIdx++];
        rig.group.visible = true;
        rig.group.position.set(actor.x, groundY + actor.y + 1.25, actor.z);
        rig.group.rotation.set(0, actor.rotY, 0);

        const channelDur = actor.channelDuration ?? 0;
        const prog = channelDur > 0 ? Math.min(1, 1 - (actor.channelTimer ?? 0) / channelDur) : 1;
        rig.chargeCore.visible = true;
        rig.chargeAura.visible = true;
        rig.chargeRingA.visible = true;
        rig.chargeRingB.visible = true;
        rig.innerBeam.visible = false;
        rig.outerBeam.visible = false;
        rig.coilA.visible = false;
        rig.coilB.visible = false;
        rig.scorchStrip.visible = false;
        rig.trenchLeft.visible = false;
        rig.trenchRight.visible = false;
        for (const ring of rig.rings) ring.visible = false;

        rig.chargeCore.scale.setScalar(0.28 + prog * 0.45 + Math.sin(elapsed * 42) * 0.05);
        rig.chargeAura.scale.setScalar(0.65 + prog * 1.15 + Math.cos(elapsed * 34) * 0.12);
        rig.chargeRingA.scale.setScalar(0.45 + prog * 0.85);
        rig.chargeRingA.rotation.set(elapsed * 7, elapsed * 5, 0);
        rig.chargeRingB.scale.setScalar(0.65 + (1 - prog) * 0.75);
        rig.chargeRingB.rotation.set(-elapsed * 6, 0, elapsed * 8);
      } else if (actor.channelKind === 'jm_kamehameha' && kameIdx < this.kamehamehaRigs.length) {
        const rig = this.kamehamehaRigs[kameIdx++];
        rig.group.visible = true;
        rig.group.position.set(actor.x, groundY + actor.y + 1.25, actor.z);
        rig.group.rotation.set(0, actor.rotY, 0);

        const flicker = 0.94 + Math.sin(elapsed * 42) * 0.14;
        const fade = actor.channelTimer !== undefined && actor.channelTimer < 0.35 ? Math.max(0.1, actor.channelTimer / 0.35) : 1;
        rig.chargeCore.visible = true;
        rig.chargeAura.visible = true;
        rig.chargeRingA.visible = true;
        rig.chargeRingB.visible = true;
        rig.innerBeam.visible = true;
        rig.outerBeam.visible = true;
        rig.coilA.visible = true;
        rig.coilB.visible = true;
        rig.scorchStrip.visible = true;
        rig.trenchLeft.visible = true;
        rig.trenchRight.visible = true;

        rig.chargeCore.scale.setScalar((0.52 + Math.sin(elapsed * 32) * 0.08) * fade);
        rig.chargeAura.scale.setScalar((1.45 + Math.cos(elapsed * 28) * 0.16) * fade);
        rig.chargeRingA.scale.setScalar((1.05 + Math.sin(elapsed * 24) * 0.15) * fade);
        rig.chargeRingA.rotation.set(0, 0, elapsed * 14);
        rig.chargeRingB.scale.setScalar((1.28 + Math.cos(elapsed * 22) * 0.15) * fade);
        rig.chargeRingB.rotation.set(Math.PI * 0.25, elapsed * 10, -elapsed * 12);

        rig.innerBeam.scale.set(flicker * fade, flicker * fade, 1);
        rig.outerBeam.scale.set((1.1 + Math.cos(elapsed * 36) * 0.12) * fade, (1.1 + Math.cos(elapsed * 36) * 0.12) * fade, 1);
        rig.outerBeam.rotation.z = elapsed * 8;
        rig.innerBeam.material.opacity = 0.84 * fade;
        rig.outerBeam.material.opacity = 0.62 * fade;
        rig.coilA.rotation.z = elapsed * 15;
        rig.coilB.rotation.z = elapsed * 15;
        rig.coilA.material.opacity = 0.74 * fade;
        rig.coilB.material.opacity = 0.76 * fade;

        const floorOffY = -(actor.y + 1.25) + 0.28;
        rig.scorchStrip.position.set(0, floorOffY, 0.85);
        rig.scorchStrip.material.opacity = (0.56 + Math.sin(elapsed * 26) * 0.08) * fade;
        rig.trenchLeft.position.y = floorOffY + 0.08;
        rig.trenchRight.position.y = floorOffY + 0.08;
        rig.trenchLeft.material.opacity = 0.88 * fade;
        rig.trenchRight.material.opacity = 0.88 * fade;

        for (let r = 0; r < rig.rings.length; r++) {
          const ring = rig.rings[r];
          ring.visible = true;
          const slide = ((elapsed * 3.6 + r / rig.rings.length) % 1) * AWAKENING_CONFIG.JM_KAMEHAMEHA_RANGE;
          ring.position.set(0, 0, 1.2 + slide);
          ring.rotation.z = elapsed * (r % 2 === 0 ? 11 : -11);
          const sc = (0.85 + Math.sin(elapsed * 20 + r) * 0.18) * fade;
          ring.scale.setScalar(sc);
          ring.material.opacity = (1 - (slide / AWAKENING_CONFIG.JM_KAMEHAMEHA_RANGE) * 0.45) * 0.72 * fade;
        }
      } else if (actor.channelKind === 'khen_domain' && khenIdx < this.khenDomainRigs.length) {
        const rig = this.khenDomainRigs[khenIdx++];
        rig.group.visible = true;
        const cx = actor.channelTargetX ?? actor.x;
        const cz = actor.channelTargetZ ?? actor.z;
        const cGround = getMapTerrainHeight(mapId, cx, cz);
        const rad = AWAKENING_CONFIG.KHEN_OMNISLASH_RADIUS;
        rig.group.position.set(cx, cGround + 0.28, cz);
        rig.outerRing.scale.setScalar(rad * (1 + Math.sin(elapsed * 9) * 0.03));
        rig.innerRune.scale.setScalar(rad * 0.82);
        rig.innerRune.rotation.z = -elapsed * 3.8;
        rig.floorDisc.scale.setScalar(rad);

        for (let c = 0; c < rig.clones.length; c++) {
          const ang = (c / rig.clones.length) * Math.PI * 2 + elapsed * 1.45;
          const lunge = Math.sin(elapsed * 16 + c * 1.3) * 1.4;
          const d = rad * 0.72 - Math.max(0, lunge);
          rig.clones[c].position.set(Math.cos(ang) * d, 0.85, Math.sin(ang) * d);
          rig.clones[c].rotation.y = -ang + Math.PI * 0.5;
        }
        for (let s = 0; s < rig.slashes.length; s++) {
          const a1 = elapsed * 4.2 + s * 1.05;
          const a2 = a1 + 2.35;
          const x1 = Math.cos(a1) * (rad * 0.75);
          const z1 = Math.sin(a1) * (rad * 0.75);
          const x2 = Math.cos(a2) * (rad * 0.75);
          const z2 = Math.sin(a2) * (rad * 0.75);
          const h = 0.7 + (s % 3) * 0.45;
          rig.slashes[s].position.set((x1 + x2) * 0.5, h, (z1 + z2) * 0.5);
          rig.slashes[s].lookAt(cx + x2, cGround + 0.28 + h, cz + z2);
          const len = Math.hypot(x2 - x1, z2 - z1);
          rig.slashes[s].scale.set(1.3, 1.3, len);
        }
      } else if (actor.channelKind === 'damen_arsenal' && damenIdx < this.damenArsenalRigs.length) {
        const rig = this.damenArsenalRigs[damenIdx++];
        rig.group.visible = true;
        rig.group.position.set(actor.x, groundY + actor.y + 1.35, actor.z);
        rig.group.rotation.set(0, actor.rotY, 0);

        for (let g = 0; g < rig.guns.length; g++) {
          const arcFrac = (g / (rig.guns.length - 1)) - 0.5;
          const arcAng = arcFrac * 1.95;
          const recoil = Math.max(0, Math.sin(elapsed * 26 - g * 0.9)) * 0.42;
          const gx = Math.sin(arcAng) * 1.9;
          const gy = 0.25 + Math.cos(arcAng * 1.4) * 0.45;
          const gz = -Math.cos(arcAng) * 0.75 - recoil;

          rig.guns[g].position.set(gx, gy, gz);
          rig.guns[g].rotation.y = arcFrac * 0.42;
          rig.flashes[g].position.set(gx + Math.sin(arcFrac * 0.42) * 0.65, gy, gz + 0.65);
          rig.flashes[g].scale.setScalar(0.45 + recoil * 1.6);
          rig.flashes[g].material.opacity = clampAdditiveOpacity(0.52 + recoil * 0.75);

          const trDist = 11.5;
          rig.tracers[g].position.set(
            gx + Math.sin(arcFrac * 0.42) * (trDist * 0.5),
            gy,
            gz + Math.cos(arcFrac * 0.42) * (trDist * 0.5)
          );
          rig.tracers[g].rotation.set(0, arcFrac * 0.42, 0);
          rig.tracers[g].scale.set(0.85, 0.85, trDist);
          rig.tracers[g].material.opacity = clampAdditiveOpacity(0.46 + recoil * 0.78);
        }
      } else if (actor.channelKind === 'marjohn_typhoon' && marjIdx < this.marjohnTyphoonRigs.length) {
        const rig = this.marjohnTyphoonRigs[marjIdx++];
        rig.group.visible = true;
        rig.group.position.set(actor.x, groundY, actor.z);
        rig.outerFunnel.position.y = 0.2;
        rig.outerFunnel.rotation.y = elapsed * 10;
        rig.outerFunnel.scale.set(8.2, 5.2, 8.2);
        rig.innerFunnel.position.y = 0.2;
        rig.innerFunnel.rotation.y = -elapsed * 16;
        rig.innerFunnel.scale.set(4.5, 5.4, 4.5);
        rig.groundRing.scale.setScalar(AWAKENING_CONFIG.MARJOHN_TYPHOON_RADIUS * (1 + Math.sin(elapsed * 8) * 0.04));
        for (let r = 0; r < rig.ribbons.length; r++) {
          const rb = rig.ribbons[r];
          rb.position.y = 0.25 + (r % 2) * 0.35;
          const scXZ = 4.2 + r * 1.45;
          rb.scale.set(scXZ, 4.6 + r * 0.45, scXZ);
          rb.rotation.y = elapsed * (r % 2 === 0 ? 11 : -13) + (r / rig.ribbons.length) * Math.PI * 2;
        }
        if (Math.random() < 0.35) {
          this.spawnPuffs(actor.x, groundY + 0.5, actor.z, 0x475569, 1, 2.2, 1.8, 0.8, 2.5, 0.48, 0.58);
        }
        if (Math.random() < 0.25) {
          const a = Math.random() * Math.PI * 2;
          const rOut = 4.2 + Math.random() * 2.8;
          this.spawnLightningSpline(
            actor.x + Math.cos(a) * 1.5,
            groundY + 1.8 + Math.random() * 3.0,
            actor.z + Math.sin(a) * 1.5,
            actor.x + Math.cos(a + 0.5) * rOut,
            groundY + 0.4,
            actor.z + Math.sin(a + 0.5) * rOut,
            0x38bdf8,
            0.18,
            0.2,
            0.38
          );
        }
      } else if (actor.channelKind === 'prime_meteor' && primeIdx < this.primeMeteorRigs.length) {
        const rig = this.primeMeteorRigs[primeIdx++];
        rig.group.visible = true;
        rig.group.position.set(actor.x, groundY, actor.z);
        rig.auraSphere.position.set(0, actor.y + 1.1, 0);
        rig.auraSphere.scale.setScalar(1.35 + Math.sin(elapsed * 18) * 0.14);

        const tx = actor.channelTargetX ?? actor.x;
        const tz = actor.channelTargetZ ?? actor.z;
        const tGround = getMapTerrainHeight(mapId, tx, tz);
        rig.targetGroup.position.set(tx - actor.x, tGround - groundY + 0.28, tz - actor.z);
        const rad = AWAKENING_CONFIG.PRIME_METEOR_RADIUS;
        rig.targetRing.scale.setScalar(rad * (1 + Math.sin(elapsed * 14) * 0.05));
        rig.targetDisc.scale.setScalar(rad);

        for (let m = 0; m < rig.meteors.length; m++) {
          const fall = (elapsed * 2.8 + m * 0.25) % 1;
          const ang = m * 1.57 + elapsed * 2.2;
          const offR = (1 - fall) * 2.1;
          rig.meteors[m].position.set(Math.cos(ang) * offR, (1 - fall) * 9.5 + 0.6, Math.sin(ang) * offR);
          rig.meteors[m].scale.setScalar(0.85 + Math.sin(elapsed * 20 + m) * 0.15);
        }
      }
    }

    // JM Divine Sanctuary Nova (10 tall faceted crystal pillars -> 0.6s shatter burst)
    let iceIdx = 0;
    for (const z of zones) {
      if (z.kind !== 'icePillarNova' || iceIdx >= this.iceNovaRigs.length) continue;
      const rig = this.iceNovaRigs[iceIdx++];
      rig.zoneId = z.id;
      rig.group.visible = true;

      const groundY = getMapTerrainHeight(mapId, z.x, z.z);
      rig.group.position.set(z.x, groundY + z.y, z.z);

      const age = Math.max(0, z.maxDuration - z.remaining);
      const shatterAt = AWAKENING_CONFIG.JM_DIVINE_NOVA_SHATTER_DELAY;
      const fade = Math.min(1, z.remaining / 0.45);

      if (age >= shatterAt && !this.shatteredIceZoneIds.has(z.id)) {
        if (this.shatteredIceZoneIds.size > 16) this.shatteredIceZoneIds.clear();
        this.shatteredIceZoneIds.add(z.id);
        this.spawnCraterSlam(z.x, groundY, z.z, z.radius * 0.95, 0xf59e0b, 0x06b6d4, true);
      }

      rig.ring.scale.setScalar(z.radius * (1 + Math.sin(elapsed * 10) * 0.04));
      rig.ring.material.opacity = 0.76 * fade;

      if (age < shatterAt) {
        const rise = Math.min(1, age / 0.18);
        rig.dome.visible = true;
        rig.dome.scale.setScalar(z.radius * 0.85 * rise);
        rig.dome.material.opacity = 0.24 * rise;
        for (const p of rig.pillars) {
          p.mesh.visible = true;
          p.mesh.position.set(Math.cos(p.angle) * p.dist, 0.1, Math.sin(p.angle) * p.dist);
          p.mesh.scale.set(1.0, Math.max(0.08, rise * p.heightScale), 1.0);
          p.mesh.material.opacity = 0.74;
          p.core.material.opacity = 0.84;
        }
      } else {
        const afterShatter = Math.min(1, (age - shatterAt) / 0.55);
        rig.dome.visible = afterShatter < 0.85;
        rig.dome.scale.setScalar(z.radius * (0.85 + afterShatter * 0.65));
        rig.dome.material.opacity = Math.max(0, (1 - afterShatter) * 0.28);
        for (const p of rig.pillars) {
          const outDist = p.dist + afterShatter * 5.2;
          p.mesh.visible = afterShatter < 0.95;
          p.mesh.position.set(Math.cos(p.angle) * outDist, 0.25 + afterShatter * 2.2, Math.sin(p.angle) * outDist);
          p.mesh.rotation.x = afterShatter * 1.4;
          p.mesh.scale.setScalar(Math.max(0.1, 1 - afterShatter * 0.85));
          p.mesh.material.opacity = Math.max(0, (1 - afterShatter) * 0.74);
          p.core.material.opacity = Math.max(0, (1 - afterShatter) * 0.82);
        }
      }
    }
  }

  public syncCutsceneClashVfx(
    cutscene: AwakeningCutsceneState | null,
    p1: ArenaActorState | undefined,
    p2: ArenaActorState | undefined,
    mapId: MapId,
    elapsed: number,
    dt: number
  ): void {
    const showClash =
      Boolean(cutscene) &&
      cutscene!.clockSec >= AWAKENING_CONFIG.TIMELINE.CLASH_START_AT &&
      !cutscene!.resolved;

    if (!showClash || !cutscene) {
      this.cutsceneClashGroup.visible = false;
      return;
    }

    const kit1 = AWAKENING_CONFIG.AWAKENED_KITS[cutscene.p1FighterId];
    const kit2 = AWAKENING_CONFIG.AWAKENED_KITS[cutscene.p2FighterId];
    const p1Color = kit1.auraPrimaryHex;
    const p2Color =
      cutscene.p1FighterId === cutscene.p2FighterId ? kit2.auraSecondaryHex : kit2.auraPrimaryHex;

    const halfSep = AWAKENING_CONFIG.CLASH_SEPARATION_DISTANCE * 0.5;
    const p1X = p1?.x ?? -halfSep;
    const p2X = p2?.x ?? halfSep;
    const p1Z = p1?.z ?? 0;
    const p2Z = p2?.z ?? 0;
    const groundMid = getMapTerrainHeight(mapId, (p1X + p2X) * 0.5, (p1Z + p2Z) * 0.5);
    const beamY = groundMid + 1.25;

    const clashX = THREE.MathUtils.lerp(p1X, p2X, (cutscene.clashBalance + 1) * 0.5);
    const clashZ = THREE.MathUtils.lerp(p1Z, p2Z, (cutscene.clashBalance + 1) * 0.5);

    this.cutsceneClashGroup.visible = true;
    const len1 = Math.max(0.6, Math.hypot(clashX - p1X, clashZ - p1Z));
    const len2 = Math.max(0.6, Math.hypot(p2X - clashX, p2Z - clashZ));
    const yaw = Math.atan2(p2Z - p1Z, p2X - p1X);

    const pulse1 = 1.0 + Math.sin(elapsed * 32) * 0.14 + Math.min(0.45, cutscene.p1Overdrive * 0.3);
    const pulse2 = 1.0 + Math.cos(elapsed * 34) * 0.14 + Math.min(0.45, cutscene.p2Overdrive * 0.3);

    this.cutsceneP1Beam.material.color.setHex(p1Color);
    this.cutsceneP1Beam.position.set((p1X + clashX) * 0.5, beamY, (p1Z + clashZ) * 0.5);
    this.cutsceneP1Beam.rotation.set(0, -yaw, 0);
    this.cutsceneP1Beam.scale.set(len1, pulse1, pulse1);

    this.cutsceneP2Beam.material.color.setHex(p2Color);
    this.cutsceneP2Beam.position.set((p2X + clashX) * 0.5, beamY, (p2Z + clashZ) * 0.5);
    this.cutsceneP2Beam.rotation.set(0, -yaw, 0);
    this.cutsceneP2Beam.scale.set(len2, pulse2, pulse2);

    this.cutsceneCore.position.set(clashX, beamY, clashZ);
    const coreScale = 0.65 + Math.sin(elapsed * 28) * 0.14;
    this.cutsceneCore.scale.setScalar(coreScale);

    this.cutsceneCoreRing.position.set(clashX, beamY, clashZ);
    this.cutsceneCoreRing.rotation.y = yaw + Math.PI * 0.5;
    this.cutsceneCoreRing.rotation.z = elapsed * 12;
    this.cutsceneCoreRing.scale.setScalar(0.9 + Math.cos(elapsed * 24) * 0.15);

    this.clashSparkTimer -= dt;
    if (this.clashSparkTimer <= 0) {
      this.clashSparkTimer = 0.09;
      this.spawnSparks(clashX, beamY, clashZ, 0xfef08a, 4, 1.4, 8, 0.25);
    }
  }

  public emitAwakenedStatusParticles(x: number, y: number, z: number, colorHex: number, fighterId?: FighterId): void {
    const a = Math.random() * Math.PI * 2;
    const rad = 0.42 + Math.random() * 0.65;
    const px = x + Math.cos(a) * rad;
    const pz = z + Math.sin(a) * rad;
    this.spawnSparks(px, y + 0.55 + Math.random() * 0.8, pz, colorHex, 2, 0.55, -2.5, 0.36);
    this.spawnSparks(px, y + 0.4 + Math.random() * 0.6, pz, 0xfef9c3, 1, 0.45, -2.0, 0.28);
    const smokeHex =
      fighterId === 'prime'
        ? 0x1c1917
        : fighterId === 'khen'
        ? 0x09090b
        : fighterId === 'damen'
        ? 0x475569
        : fighterId === 'marjohn'
        ? 0xcbd5e1
        : colorHex;
    this.spawnPuffs(px, y + 0.26, pz, smokeHex, 1, 0.3, 0.65, 0.16, 0.48, 0.34, 0.46);

    if (fighterId === 'jm') {
      if (Math.random() < 0.45) {
        this.spawnCrescentRibbon(
          x,
          y + 0.65 + Math.random() * 0.7,
          z,
          a,
          0.12,
          0x06b6d4,
          0xfef9c3,
          1.25 + Math.random() * 0.35,
          16,
          0.26,
          Math.PI * 0.48
        );
      }
      if (Math.random() < 0.38) {
        const a2 = a + (Math.random() - 0.5) * 1.4;
        this.spawnLightningSpline(
          px,
          y + 0.35,
          pz,
          x + Math.cos(a2) * (rad + 0.85),
          y + 1.2 + Math.random() * 1.4,
          z + Math.sin(a2) * (rad + 0.85),
          Math.random() < 0.5 ? 0x38bdf8 : 0xfef08a,
          0.14,
          0.18,
          0.40
        );
      }
      if (Math.random() < 0.24) {
        this.spawnCraterSlabs(x, Math.max(0, y - 0.05), z, 2.1, 1, 0.52);
      }
    }
  }

  public update(dt: number): void {
    this.elapsedTime += dt;
    this.atlas.updateScrolling(dt);
    // Delayed choreographed bursts (Launch apex puff, Shatter burst)
    for (let i = this.delayedTasks.length - 1; i >= 0; i--) {
      const task = this.delayedTasks[i];
      task.delay -= dt;
      if (task.delay <= 0) {
        this.delayedTasks.splice(i, 1);
        task.run();
      }
    }

    for (const fl of this.coreFlashes) {
      if (!fl.mesh.visible) continue;
      fl.life -= dt;
      if (fl.life <= 0) fl.mesh.visible = false;
      else {
        const u = 1 - fl.life / fl.maxLife;
        const s = u < 0.35 ? THREE.MathUtils.lerp(0.4, fl.peakScale, u / 0.35) : THREE.MathUtils.lerp(fl.peakScale, 0.1, (u - 0.35) / 0.65);
        fl.mesh.scale.setScalar(s);
        fl.mesh.material.opacity = (1 - u) * 0.82;
      }
    }

    for (const sw of this.shockwaves) {
      if (!sw.mesh.visible) continue;
      sw.age += dt;
      if (sw.age >= sw.maxAge) {
        sw.mesh.visible = false;
      } else {
        const u = sw.age / sw.maxAge;
        const sc = sw.reverse ? sw.startScale * (1 - u * 0.88) : sw.startScale + u * sw.maxRadius;
        sw.mesh.scale.setScalar(sc);
        sw.mesh.material.opacity = (1 - u) * 0.78;
      }
    }

    for (const sl of this.slashes) {
      if (!sl.mesh.visible) continue;
      sl.life -= dt;
      if (sl.life <= 0) sl.mesh.visible = false;
      else {
        const u = sl.life / sl.maxLife;
        sl.mesh.rotation.z += sl.spinSpeed * dt;
        sl.mesh.scale.addScalar(sl.growSpeed * dt);
        sl.mesh.material.opacity = u * 0.78;
        if (sl.mesh.children[0]) {
          ((sl.mesh.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = u * 0.84;
        }
      }
    }

    for (const fn of this.funnels) {
      if (!fn.mesh.visible) continue;
      fn.life -= dt;
      if (fn.life <= 0) fn.mesh.visible = false;
      else {
        const u = 1 - fn.life / fn.maxLife;
        const sx = THREE.MathUtils.lerp(fn.startScaleX, fn.endScaleX, u);
        fn.mesh.scale.set(sx, fn.scaleY, sx);
        fn.mesh.rotation.y += fn.spinSpeed * dt;
        fn.mesh.material.opacity = (1 - u) * 0.74;
      }
    }

    for (const tr of this.tracers) {
      if (!tr.mesh.visible) continue;
      tr.life -= dt;
      if (tr.life <= 0) tr.mesh.visible = false;
      else {
        const u = tr.life / tr.maxLife;
        tr.mesh.scale.x = tr.startScaleX * u;
        tr.mesh.scale.y = tr.startScaleX * u;
        tr.mesh.material.opacity = u * 0.80;
      }
    }

    for (const sp of this.sparks) {
      if (!sp.mesh.visible) continue;
      sp.life -= dt;
      if (sp.life <= 0) {
        sp.mesh.visible = false;
      } else {
        sp.mesh.position.x += sp.vx * dt;
        sp.mesh.position.y += sp.vy * dt;
        sp.mesh.position.z += sp.vz * dt;
        sp.vy -= sp.gravity * dt;
        if (sp.orientToVel) {
          _tmpDir.set(sp.vx, sp.vy, sp.vz);
          if (_tmpDir.lengthSq() > 0.001) {
            _tmpDir.normalize();
            _quat.setFromUnitVectors(_upVec, _tmpDir);
            sp.mesh.quaternion.copy(_quat);
          }
        }
        sp.mesh.material.opacity = (sp.life / sp.maxLife) * 0.84;
      }
    }

    for (const pf of this.puffs) {
      if (!pf.sprite.visible) continue;
      pf.life -= dt;
      if (pf.life <= 0) {
        pf.sprite.visible = false;
      } else {
        const u = 1 - pf.life / pf.maxLife;
        pf.sprite.position.x += pf.vx * dt;
        pf.sprite.position.y += pf.vy * dt;
        pf.sprite.position.z += pf.vz * dt;
        pf.sprite.material.rotation += pf.rotSpeed * dt;
        pf.sprite.scale.setScalar(THREE.MathUtils.lerp(pf.startScale, pf.endScale, u));
        pf.sprite.material.opacity = (1 - u) * pf.baseOpacity;
      }
    }

    for (const cr of this.cracks) {
      if (!cr.mesh.visible) continue;
      cr.life -= dt;
      if (cr.life <= 0) cr.mesh.visible = false;
      else cr.mesh.material.opacity = (cr.life / cr.maxLife) * 0.68;
    }

    for (const cs of this.casings) {
      if (!cs.mesh.visible) continue;
      cs.life -= dt;
      if (cs.life <= 0) {
        cs.mesh.visible = false;
      } else {
        cs.mesh.position.x += cs.vx * dt;
        cs.mesh.position.y += cs.vy * dt;
        cs.mesh.position.z += cs.vz * dt;
        cs.vy -= 18 * dt;
        if (cs.mesh.position.y < cs.floorY) {
          cs.mesh.position.y = cs.floorY;
          cs.vy = Math.abs(cs.vy) * 0.4;
          cs.vx *= 0.65;
          cs.vz *= 0.65;
        }
        cs.mesh.rotation.x += dt * 16;
        cs.mesh.rotation.z += dt * 12;
        (cs.mesh.material as THREE.MeshStandardMaterial).opacity = Math.min(1, (cs.life / cs.maxLife) * 1.4);
      }
    }

    for (const db of this.vortexDebris) {
      if (!db.mesh.visible) continue;
      db.life -= dt;
      if (db.life <= 0) {
        db.mesh.visible = false;
      } else {
        db.angle += db.angularSpeed * dt;
        db.radius = Math.max(0.2, db.radius - db.inwardSpeed * dt);
        db.mesh.position.set(
          db.centerX + Math.cos(db.angle) * db.radius,
          db.centerY + db.heightOffset + (1 - db.life / db.maxLife) * 0.65,
          db.centerZ + Math.sin(db.angle) * db.radius
        );
        db.mesh.rotation.set(db.angle, db.angle * 0.7, 0);
        db.mesh.material.opacity = (db.life / db.maxLife) * 0.9;
      }
    }

    for (const g of this.ghosts) {
      if (!g.mesh.visible) continue;
      g.life -= dt;
      if (g.life <= 0) g.mesh.visible = false;
      else {
        g.mesh.position.x += g.vx * dt;
        g.mesh.position.y += g.vy * dt;
        g.mesh.position.z += g.vz * dt;
        g.mesh.material.opacity = (g.life / g.maxLife) * g.baseOpacity;
      }
    }

    for (const b of this.beams) {
      if (!b.mesh.visible) continue;
      b.life -= dt;
      if (b.life <= 0) b.mesh.visible = false;
      else {
        const u = b.life / b.maxLife;
        b.mesh.material.opacity = u * 0.78;
        b.mesh.scale.set(0.65 + u * 0.65, 0.65 + u * 0.65, 1);
        b.coilA.rotation.z += dt * 12;
        b.coilB.rotation.z += dt * 12;
        b.coilA.material.opacity = u * 0.74;
        b.coilB.material.opacity = u * 0.72;
      }
    }

    for (const pl of this.pillars) {
      if (!pl.mesh.visible) continue;
      pl.life -= dt;
      if (pl.life <= 0) pl.mesh.visible = false;
      else {
        const u = pl.life / pl.maxLife;
        pl.mesh.material.opacity = u * 0.58;
        pl.mesh.scale.x = pl.baseScale * (0.7 + u * 0.35);
        pl.mesh.scale.z = pl.baseScale * (0.7 + u * 0.35);
      }
    }

    for (const sc of this.stormClouds) {
      if (!sc.group.visible) continue;
      sc.life -= dt;
      if (sc.life <= 0) sc.group.visible = false;
      else {
        sc.group.rotation.y += dt * 0.85;
        const u = Math.sin((sc.life / sc.maxLife) * Math.PI);
        const scChildren = sc.group.children;
        for (let ci = 0; ci < scChildren.length; ci++) {
          ((scChildren[ci] as THREE.Sprite).material as THREE.SpriteMaterial).opacity = u * 0.78;
        }
      }
    }

    for (const mg of this.markGlyphs) {
      if (!mg.group.visible) continue;
      mg.life -= dt;
      if (mg.life <= 0) mg.group.visible = false;
      else {
        const u = 1 - mg.life / mg.maxLife;
        mg.group.rotation.z += dt * 5;
        mg.group.scale.setScalar(0.5 + u * 0.75);
        const mgChildren = mg.group.children;
        for (let ci = 0; ci < mgChildren.length; ci++) {
          ((mgChildren[ci] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.74;
        }
      }
    }

    for (const sg of this.spellSigils) {
      if (!sg.group.visible) continue;
      sg.life -= dt;
      if (sg.life <= 0) sg.group.visible = false;
      else {
        const u = 1 - sg.life / sg.maxLife;
        sg.group.rotation.y += dt * 3.4;
        sg.group.scale.setScalar(sg.baseScale * (0.55 + u * 0.55));
        const sgChildren = sg.group.children;
        for (let ci = 0; ci < sgChildren.length; ci++) {
          ((sgChildren[ci] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.76;
        }
      }
    }

    for (const th of this.tethers) {
      if (!th.mesh.visible) continue;
      th.life -= dt;
      if (th.life <= 0) th.mesh.visible = false;
      else {
        const u = th.life / th.maxLife;
        th.mesh.material.opacity = u * 0.78;
        th.mesh.scale.x = 0.6 + u * 0.8;
        th.mesh.scale.y = 0.6 + u * 0.8;
      }
    }

    for (const halo of this.glowHalos) {
      if (!halo.mesh.visible) continue;
      halo.life -= dt;
      if (halo.life <= 0) {
        halo.mesh.visible = false;
      } else {
        const u = halo.life / halo.maxLife;
        halo.mesh.scale.setScalar(halo.baseScale * (1.25 - u * 0.35));
        halo.mesh.material.opacity = u * halo.peakOpacity;
      }
    }

    for (const sl of this.craterSlabs) {
      if (!sl.mesh.visible) continue;
      sl.life -= dt;
      if (sl.life <= 0) {
        sl.mesh.visible = false;
      } else {
        if (sl.floatTimer > 0) {
          // Brief 0-G pop/hover & spin phase matching reference video
          sl.floatTimer -= dt;
          sl.mesh.position.x += sl.vx * 0.25 * dt;
          sl.mesh.position.y += sl.vy * 0.22 * dt;
          sl.mesh.position.z += sl.vz * 0.25 * dt;
          sl.vy *= Math.max(0, 1 - 4.2 * dt);
        } else {
          sl.mesh.position.x += sl.vx * dt;
          sl.mesh.position.y += sl.vy * dt;
          sl.mesh.position.z += sl.vz * dt;
          sl.vy -= 22.0 * dt;
          if (sl.mesh.position.y < sl.floorY) {
            sl.mesh.position.y = sl.floorY;
            sl.vy = Math.abs(sl.vy) * 0.25;
            sl.vx *= 0.6;
            sl.vz *= 0.6;
          }
        }
        sl.mesh.rotation.x += sl.rotVx * dt;
        sl.mesh.rotation.y += sl.rotVy * dt;
        sl.mesh.rotation.z += sl.rotVz * dt;
        sl.mesh.material.opacity = Math.min(0.96, (sl.life / sl.maxLife) * 1.45);
      }
    }

    for (const dc of this.darkCracks) {
      if (!dc.mesh.visible) continue;
      dc.life -= dt;
      if (dc.life <= 0) dc.mesh.visible = false;
      else dc.mesh.material.opacity = (dc.life / dc.maxLife) * 0.88;
    }

    for (const sc of this.spikeCrowns) {
      if (!sc.group.visible) continue;
      sc.life -= dt;
      if (sc.life <= 0) {
        sc.group.visible = false;
      } else {
        const u = 1 - sc.life / sc.maxLife;
        const rise = u < 0.22 ? THREE.MathUtils.lerp(0.18, 1.15, u / 0.22) : THREE.MathUtils.lerp(1.15, 0.85, (u - 0.22) / 0.78);
        const radial = sc.baseScale * (0.65 + u * 0.72);
        sc.group.scale.set(radial, rise * sc.baseScale, radial);
        const op = (1 - u) * 0.78;
        for (const sp of sc.spikes) sp.material.opacity = op;
      }
    }

    for (const st of this.shockTori) {
      if (!st.mesh.visible) continue;
      st.age += dt;
      if (st.age >= st.maxAge) {
        st.mesh.visible = false;
      } else {
        const u = st.age / st.maxAge;
        const rad = st.startScale + u * st.maxRadius;
        st.mesh.scale.set(rad, rad, Math.max(0.35, 1 - u * 0.65));
        st.mesh.material.opacity = (1 - u) * 0.78;
      }
    }

    for (const cr of this.crescentRibbons) {
      if (!cr.group.visible) continue;
      cr.life -= dt;
      if (cr.life <= 0) {
        cr.group.visible = false;
      } else {
        const u = cr.life / cr.maxLife;
        cr.group.rotation.z += cr.spinSpeed * dt;
        cr.group.scale.addScalar(cr.growSpeed * dt);
        cr.outer.material.opacity = u * 0.76;
        cr.inner.material.opacity = u * 0.84;
      }
    }

    for (const vt of this.vTrenchRidges) {
      if (!vt.group.visible) continue;
      vt.life -= dt;
      if (vt.life <= 0) {
        vt.group.visible = false;
      } else {
        const u = vt.life / vt.maxLife;
        const op = Math.min(0.92, u * 1.4);
        vt.leftSlab.material.opacity = op;
        vt.rightSlab.material.opacity = op;
        vt.glowStrip.material.opacity = u * 0.56;
      }
    }

    for (const ls of this.lightningSplines) {
      if (!ls.mesh.visible) continue;
      ls.life -= dt;
      if (ls.life <= 0) {
        ls.mesh.visible = false;
      } else {
        const u = ls.life / ls.maxLife;
        ls.mesh.material.opacity = u * ls.peakOpacity;
      }
    }

    for (const fm of this.fallingMeteors) {
      if (!fm.group.visible) continue;
      fm.age += dt;
      const t = Math.min(1, fm.age / Math.max(0.05, fm.duration));
      if (t < 1) {
        const eased = t * t;
        fm.group.position.y = THREE.MathUtils.lerp(fm.startY, fm.targetY, eased);
        fm.fist.rotation.y += dt * 9;
        fm.fist.rotation.x += dt * 7;
      } else if (!fm.exploded) {
        fm.exploded = true;
        const gx = fm.group.position.x;
        const gz = fm.group.position.z;
        const gy = fm.targetY - 0.35;
        this.spawnPointLightFlash(gx, gy + 1.4, gz, 0xea580c, 6.8, 0.3, 15);
        this.spawnCoreFlash(gx, gy + 0.8, gz, 0xfbbf24, 2.2, 0.16);
        this.spawnShockwave(gx, gy + 0.18, gz, 0xdc2626, fm.radius * 1.4, 0.46);
        this.spawnShockwave(gx, gy + 0.24, gz, 0xea580c, fm.radius, 0.36);
        this.spawnDarkSpiderCracks(gx, gy, gz, 0xea580c, 3, Math.max(1.4, fm.radius * 0.52), 1.3);
        this.spawnCracks(gx, gy, gz, 0xea580c, 6, 1.8, 1.1);
        this.spawnPuffs(gx, gy + 0.5, gz, 0x1c1917, 7, 1.6, 2.0, 0.5, 1.8, 0.55, 0.72);
        this.spawnSparks(gx, gy + 0.9, gz, 0xfbbf24, 18, 1.8, 12, 0.42);
      } else if (fm.age >= fm.duration + 0.18) {
        fm.group.visible = false;
      } else {
        const fadeOut = 1 - (fm.age - fm.duration) / 0.18;
        fm.fist.material.opacity = Math.max(0, fadeOut * 0.94);
        fm.aura.material.opacity = Math.max(0, fadeOut * 0.64);
      }
    }
  }

  public dispose(): void {
    this.delayedTasks = [];
    this.actorPositions.clear();

    const removeAndDisposeMats = (items: Array<{ mesh: THREE.Mesh }>) => {
      for (const item of items) {
        this.scene.remove(item.mesh);
        if (Array.isArray(item.mesh.material)) item.mesh.material.forEach((m) => m.dispose());
        else (item.mesh.material as THREE.Material).dispose();
      }
    };

    removeAndDisposeMats(this.shockwaves);
    for (const sl of this.slashes) {
      this.scene.remove(sl.mesh);
      sl.mesh.material.dispose();
      sl.mesh.children.forEach((c) => ((c as THREE.Mesh).material as THREE.Material).dispose());
    }
    removeAndDisposeMats(this.coreFlashes);
    removeAndDisposeMats(this.funnels);
    removeAndDisposeMats(this.tracers);
    removeAndDisposeMats(this.sparks);
    for (const pf of this.puffs) {
      this.scene.remove(pf.sprite);
      pf.sprite.material.dispose();
    }
    removeAndDisposeMats(this.cracks);
    removeAndDisposeMats(this.casings);
    removeAndDisposeMats(this.vortexDebris);
    removeAndDisposeMats(this.ghosts);
    removeAndDisposeMats(this.pillars);
    removeAndDisposeMats(this.tethers);

    for (const b of this.beams) {
      this.scene.remove(b.mesh);
      b.mesh.material.dispose();
      b.coilA.material.dispose();
      b.coilB.material.dispose();
    }
    for (const sc of this.stormClouds) {
      this.scene.remove(sc.group);
      sc.group.children.forEach((c) => ((c as THREE.Sprite).material as THREE.Material).dispose());
    }
    for (const mg of this.markGlyphs) {
      this.scene.remove(mg.group);
      mg.group.children.forEach((c) => ((c as THREE.Mesh).material as THREE.Material).dispose());
    }
    for (const sg of this.spellSigils) {
      this.scene.remove(sg.group);
      sg.group.children.forEach((c) => ((c as THREE.Mesh).material as THREE.Material).dispose());
    }
    for (const vis of this.chargingFireballPool) {
      this.scene.remove(vis.group);
      vis.core.material.dispose();
      vis.aura.material.dispose();
      vis.halo.material.dispose();
    }
    this.chargingFireballPool = [];

    this.scene.remove(this.eventGroup);
    this.eventOuterRing.geometry.dispose();
    this.eventOuterRing.material.dispose();
    this.eventInnerDisc.geometry.dispose();
    this.eventInnerDisc.material.dispose();

    this.scene.remove(this.stormGroup);
    this.stormWall.geometry.dispose();
    this.stormWall.material.dispose();
    this.stormRing.geometry.dispose();
    this.stormRing.material.dispose();

    this.scene.remove(this.aimGroup);
    this.aimPointRing.material.dispose();
    this.aimPointInner.material.dispose();
    this.aimPointDisc.material.dispose();
    this.aimLineStrip.material.dispose();
    this.aimLineArrow.material.dispose();
    this.aimLineOriginRing.material.dispose();
    this.aimConeWedge.material.dispose();

    for (const seg of this.aimRibbonSegments) {
      this.scene.remove(seg);
      seg.material.dispose();
    }
    this.aimRibbonSegments = [];

    for (const dot of this.aimArcDots) {
      this.scene.remove(dot);
      dot.material.dispose();
    }
    this.aimArcDots = [];

    this.scene.remove(this.aimWallCrossGroup);
    this.aimWallCrossA.material.dispose();
    this.aimWallCrossB.material.dispose();
    this.aimWallCrossRing.material.dispose();

    for (const mr of this.eventMeteorRings) {
      this.scene.remove(mr.group);
      mr.ring.material.dispose();
      mr.disc.material.dispose();
    }
    this.eventMeteorRings = [];

    this.scene.remove(this.templeNpcGroup);
    this.templeNpcRing.material.dispose();
    (this.templeNpcSprite.material as THREE.Material).dispose();
    this.npcTalkTex?.dispose();
    this.npcBossTex?.dispose();
    Object.values(this.orbBadgeTexs).forEach((t) => t?.dispose());
    Object.values(this.itemBadgeTexs).forEach((t) => t?.dispose());
    this.orbBadgeTexs = {};
    this.itemBadgeTexs = {};

    this.scene.remove(this.aimDropLine);
    this.aimDropLine.material.dispose();

    this.scene.remove(this.aimRangeRing);
    this.aimRangeRing.material.dispose();

    this.scene.remove(this.domainCastGroup);
    this.domainCastRing.material.dispose();
    this.domainCastDisc.material.dispose();
    this.domainCastSealRing.material.dispose();
    this.domainCastDome.material.dispose();

    this.scene.remove(this.domainGroup);
    this.domainDome.material.dispose();
    this.domainBarrierRing.material.dispose();
    this.domainFloorDisc.material.dispose();
    this.domainInnerRune.material.dispose();
    for (const pl of this.domainPillars) pl.material.dispose();
    for (const dg of this.domainGuns) dg.material.dispose();
    this.domainPillars = [];
    this.domainGuns = [];

    for (const c of this.khenClonePool) {
      this.scene.remove(c.group);
      c.torso.material.dispose();
      c.head.material.dispose();
      c.visor.material.dispose();
      c.leftArm.material.dispose();
      c.rightArm.material.dispose();
      c.auraRing.material.dispose();
    }
    this.khenClonePool = [];

    for (const w of this.jmWebLinePool) {
      this.scene.remove(w.group);
      w.outer.material.dispose();
      w.core.material.dispose();
    }
    this.jmWebLinePool = [];

    this.scene.remove(this.kothGroup);
    this.kothOuterRing.material.dispose();
    this.kothInnerDisc.material.dispose();
    this.kothBeacon.material.dispose();

    removeAndDisposeMats(this.glowHalos);
    this.glowHalos = [];

    removeAndDisposeMats(this.lightningSplines);
    this.lightningSplines = [];

    removeAndDisposeMats(this.craterSlabs);
    this.craterSlabs = [];
    removeAndDisposeMats(this.darkCracks);
    this.darkCracks = [];
    removeAndDisposeMats(this.shockTori);
    this.shockTori = [];
    for (const sc of this.spikeCrowns) {
      this.scene.remove(sc.group);
      for (const sp of sc.spikes) sp.material.dispose();
    }
    this.spikeCrowns = [];
    for (const cr of this.crescentRibbons) {
      this.scene.remove(cr.group);
      cr.outer.material.dispose();
      cr.inner.material.dispose();
    }
    this.crescentRibbons = [];
    for (const vt of this.vTrenchRidges) {
      this.scene.remove(vt.group);
      vt.leftSlab.material.dispose();
      vt.rightSlab.material.dispose();
      vt.glowStrip.material.dispose();
    }
    this.vTrenchRidges = [];

    for (const vis of this.zonePool) {
      this.scene.remove(vis.group);
      vis.ring.material.dispose();
      vis.disc.material.dispose();
      vis.extraRing.material.dispose();
      vis.decoyMesh.material.dispose();
      vis.tripwireMesh.material.dispose();
    }
    this.zonePool = [];

    for (const vis of this.telegraphPool) {
      this.scene.remove(vis.group);
      vis.circleBorder.material.dispose();
      vis.circleFill.material.dispose();
      vis.circleRune.material.dispose();
      vis.lineBorder.material.dispose();
      vis.lineFill.material.dispose();
      vis.coneBorder.material.dispose();
      vis.coneFill.material.dispose();
    }
    this.telegraphPool = [];

    for (const slot of this.projPool) {
      this.scene.remove(slot.mesh);
      this.scene.remove(slot.tether);
      slot.mesh.material.dispose();
      slot.coreMesh.material.dispose();
      slot.tether.material.dispose();
    }
    this.projPool = [];

    for (const vis of this.pickupPool) {
      this.scene.remove(vis.group);
      vis.orb.material.dispose();
      vis.ring.material.dispose();
      vis.runeRing.material.dispose();
      vis.beacon.material.dispose();
      vis.moteA.material.dispose();
      vis.moteB.material.dispose();
      (vis.badgeSprite.material as THREE.Material).dispose();
    }
    this.pickupPool = [];

    for (const vis of this.itemDropPool) {
      this.scene.remove(vis.group);
      vis.crate.material.dispose();
      vis.ring.material.dispose();
      vis.runeRing.material.dispose();
      vis.beacon.material.dispose();
      (vis.badgeSprite.material as THREE.Material).dispose();
    }
    this.itemDropPool = [];

    for (const fm of this.fallingMeteors) {
      this.scene.remove(fm.group);
      fm.fist.material.dispose();
      fm.aura.material.dispose();
    }
    this.fallingMeteors = [];

    for (const vis of this.awakeningOrbPool) {
      this.scene.remove(vis.group);
      vis.crystal.material.dispose();
      vis.ringA.material.dispose();
      vis.ringB.material.dispose();
      vis.column.material.dispose();
      vis.groundRing.geometry.dispose();
      vis.groundRing.material.dispose();
      vis.labelTex.dispose();
      (vis.haloSprite.material as THREE.Material).dispose();
      (vis.labelSprite.material as THREE.Material).dispose();
      for (const pt of vis.particles) pt.mesh.material.dispose();
    }
    this.awakeningOrbPool = [];

    for (const rig of this.kamehamehaRigs) {
      this.scene.remove(rig.group);
      rig.chargeCore.material.dispose();
      rig.chargeAura.material.dispose();
      rig.chargeRingA.material.dispose();
      rig.chargeRingB.material.dispose();
      rig.innerBeam.material.dispose();
      rig.outerBeam.material.dispose();
      rig.coilA.material.dispose();
      rig.coilB.material.dispose();
      rig.scorchStrip.material.dispose();
      rig.trenchLeft.material.dispose();
      rig.trenchRight.material.dispose();
      for (const r of rig.rings) r.material.dispose();
    }
    this.kamehamehaRigs = [];

    for (const rig of this.iceNovaRigs) {
      this.scene.remove(rig.group);
      rig.ring.material.dispose();
      rig.dome.material.dispose();
      for (const p of rig.pillars) {
        p.mesh.material.dispose();
        p.core.material.dispose();
      }
    }
    this.iceNovaRigs = [];
    this.shatteredIceZoneIds.clear();

    for (const rig of this.khenDomainRigs) {
      this.scene.remove(rig.group);
      rig.outerRing.material.dispose();
      rig.innerRune.material.dispose();
      rig.floorDisc.material.dispose();
      for (const c of rig.clones) c.material.dispose();
      for (const s of rig.slashes) s.material.dispose();
    }
    this.khenDomainRigs = [];

    for (const rig of this.damenArsenalRigs) {
      this.scene.remove(rig.group);
      for (const g of rig.guns) g.material.dispose();
      for (const f of rig.flashes) f.material.dispose();
      for (const t of rig.tracers) t.material.dispose();
    }
    this.damenArsenalRigs = [];

    for (const rig of this.marjohnTyphoonRigs) {
      this.scene.remove(rig.group);
      rig.outerFunnel.material.dispose();
      rig.innerFunnel.material.dispose();
      rig.groundRing.material.dispose();
      for (const rb of rig.ribbons) rb.material.dispose();
    }
    this.marjohnTyphoonRigs = [];

    for (const rig of this.primeMeteorRigs) {
      this.scene.remove(rig.group);
      rig.auraSphere.material.dispose();
      rig.targetRing.material.dispose();
      rig.targetDisc.material.dispose();
      for (const m of rig.meteors) m.material.dispose();
    }
    this.primeMeteorRigs = [];

    this.scene.remove(this.cutsceneClashGroup);
    this.cutsceneP1Beam.material.dispose();
    this.cutsceneP2Beam.material.dispose();
    this.cutsceneCore.material.dispose();
    this.cutsceneCoreRing.material.dispose();

    this.orbLabelTex?.dispose();
    this.orbLabelTex = null;
    this.orbGlowTex?.dispose();
    this.orbGlowTex = null;
    this.atlas.dispose();

    for (const geo of this.sharedGeos) {
      geo.dispose();
    }
    this.sharedGeos = [];
  }
}

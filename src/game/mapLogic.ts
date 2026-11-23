import type { GameModeId, MapId, MapObstacle, TeamId } from '../shared/gameData.ts';
import { areActorsAllied } from './domainLogic.ts';

export type TerrainZoneKind = 'water' | 'lava' | 'grass' | 'steam';

export interface TerrainZoneSpec {
  id: string;
  mapId: MapId;
  kind: TerrainZoneKind;
  shape: 'circle' | 'rect';
  x: number;
  z: number;
  radius?: number;
  halfW?: number;
  halfD?: number;
  floorOffsetY?: number;
}

export type BuildingStyle =
  | 'store'
  | 'ramen'
  | 'arcade'
  | 'subway'
  | 'forge'
  | 'volcano'
  | 'dojo'
  | 'pavilion'
  | 'shrine'
  | 'coliseum'
  | 'catacomb';

export interface EnterableBuildingSpec {
  id: string;
  mapId: MapId;
  name: string;
  style: BuildingStyle;
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  wallHeight: number;
  roofY: number;
  floorColorHex: number;
  wallColorHex: number;
  roofColorHex: number;
  accentColorHex: number;
  doorSides: Array<'n' | 's' | 'e' | 'w'>;
  maxHp?: number;
  isSubterranean?: boolean;
  subterraneanDepth?: number;
  hasSecondFloor?: boolean;
  secondFloorY?: number;
  upperRoofY?: number;
  balconySide?: 'n' | 's' | 'e' | 'w';
  balconyDepth?: number;
  stairSide?: 'n' | 's' | 'e' | 'w' | 'interior';
}

export type Static3DZoneType =
  | 'floor_slab'
  | 'second_floor'
  | 'balcony'
  | 'stairs'
  | 'skybridge'
  | 'parkour'
  | 'pedestal';

export interface Static3DAABBZone {
  id: string;
  mapId: MapId;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  bottomY: number;
  topY: number;
  zoneType: Static3DZoneType;
  passUnder?: boolean;
  rampAxis?: 'x' | 'z';
  /** Ramp surface Y at minX (if axis='x') or minZ (if axis='z') */
  rampStartY?: number;
  /** Ramp surface Y at maxX (if axis='x') or maxZ (if axis='z') */
  rampEndY?: number;
  /** Optional stairwell opening in a 2nd-floor slab */
  cutout?: { minX: number; maxX: number; minZ: number; maxZ: number };
  colorHex?: number;
  accentHex?: number;
}

export interface DynamicHazardPatch {
  id: string;
  kind: 'lava' | 'water';
  x: number;
  z: number;
  radius: number;
}

export interface FrozenWaterCircle {
  x: number;
  z: number;
  radius: number;
}

export const OPEN_CENTER_CLEAR_RADIUS = 11.5;

export const TEMPLE_NPC_SPAWN = {
  x: 0,
  z: -20.5,
  rotY: 0,
};

/**
 * 100% guaranteed spawn rate on Sunken Bamboo Temple.
 */
export function rollTempleNpcSpawn(_rng?: () => number): boolean {
  return true;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Smooth rectangular plateau/basin falloff: returns 1 inside [halfW, halfD], tapering smoothly
 * down to 0 over `rampWidth` meters so fighters can smoothly run up & down terrain ramps.
 */
function rectRampFactor(
  x: number,
  z: number,
  cx: number,
  cz: number,
  halfW: number,
  halfD: number,
  rampWidth: number
): number {
  const dx = Math.max(0, Math.abs(x - cx) - halfW);
  const dz = Math.max(0, Math.abs(z - cz) - halfD);
  const dist = Math.hypot(dx, dz);
  return 1 - smoothstep(0, rampWidth, dist);
}

function circleRampFactor(
  x: number,
  z: number,
  cx: number,
  cz: number,
  innerR: number,
  rampWidth: number
): number {
  const d = Math.hypot(x - cx, z - cz);
  return 1 - smoothstep(innerR, innerR + rampWidth, d);
}

/**
 * All terrain hazards, water basins, and tall stealth zones sit strictly outside
 * the 11.5m open central duel ring so center-stage combat remains unobstructed.
 */
export const MAP_TERRAIN_ZONES: Record<MapId, TerrainZoneSpec[]> = {
  shibuya: [
    {
      id: 'shib-water-west',
      mapId: 'shibuya',
      kind: 'water',
      shape: 'rect',
      x: -24.0,
      z: 9.0,
      halfW: 7.2,
      halfD: 2.8,
      floorOffsetY: -0.22,
    },
    {
      id: 'shib-water-east',
      mapId: 'shibuya',
      kind: 'water',
      shape: 'circle',
      x: 24.5,
      z: 9.5,
      radius: 4.8,
      floorOffsetY: -0.2,
    },
    {
      id: 'shib-steam-nw',
      mapId: 'shibuya',
      kind: 'steam',
      shape: 'circle',
      x: -11.0,
      z: -19.5,
      radius: 3.4,
    },
    {
      id: 'shib-steam-se',
      mapId: 'shibuya',
      kind: 'steam',
      shape: 'circle',
      x: 12.0,
      z: 19.5,
      radius: 3.4,
    },
    {
      id: 'shib-steam-w',
      mapId: 'shibuya',
      kind: 'steam',
      shape: 'circle',
      x: -33.5,
      z: -1.5,
      radius: 3.2,
    },
  ],
  obsidian: [
    // Inner Volcano Caldera Magma Pool inside the hollow corner mountain (crossed via obsidian bridges)
    {
      id: 'obs-caldera-magma',
      mapId: 'obsidian',
      kind: 'lava',
      shape: 'circle',
      x: -25.5,
      z: -24.5,
      radius: 5.5,
      floorOffsetY: -0.34,
    },
    // Outer magma rivers & pools (clear of center r < 11.5m)
    {
      id: 'obs-lava-ne',
      mapId: 'obsidian',
      kind: 'lava',
      shape: 'rect',
      x: 22.5,
      z: -18.5,
      halfW: 7.6,
      halfD: 3.0,
      floorOffsetY: -0.34,
    },
    {
      id: 'obs-lava-sw',
      mapId: 'obsidian',
      kind: 'lava',
      shape: 'rect',
      x: -22.5,
      z: 18.5,
      halfW: 7.6,
      halfD: 3.0,
      floorOffsetY: -0.34,
    },
    {
      id: 'obs-lava-east',
      mapId: 'obsidian',
      kind: 'lava',
      shape: 'circle',
      x: 34.0,
      z: 0,
      radius: 4.4,
      floorOffsetY: -0.32,
    },
    // Volcanic steam vents for stealth ambushes
    {
      id: 'obs-steam-w',
      mapId: 'obsidian',
      kind: 'steam',
      shape: 'circle',
      x: -31.5,
      z: 3.5,
      radius: 3.4,
    },
    {
      id: 'obs-steam-n',
      mapId: 'obsidian',
      kind: 'steam',
      shape: 'circle',
      x: 4.5,
      z: -30.5,
      radius: 3.3,
    },
  ],
  temple: [
    // Expanded tranquil koi ponds (spanned by wooden pagoda bridges)
    {
      id: 'temp-koi-west',
      mapId: 'temple',
      kind: 'water',
      shape: 'circle',
      x: -24.5,
      z: 8.5,
      radius: 7.0,
      floorOffsetY: -0.26,
    },
    {
      id: 'temp-koi-east',
      mapId: 'temple',
      kind: 'water',
      shape: 'circle',
      x: 24.5,
      z: -8.5,
      radius: 7.0,
      floorOffsetY: -0.26,
    },
    // Dense outer bamboo stealth thickets
    {
      id: 'temp-bamboo-nw',
      mapId: 'temple',
      kind: 'grass',
      shape: 'circle',
      x: -10.5,
      z: -21.5,
      radius: 3.6,
    },
    {
      id: 'temp-bamboo-se',
      mapId: 'temple',
      kind: 'grass',
      shape: 'circle',
      x: 10.5,
      z: 21.5,
      radius: 3.6,
    },
    {
      id: 'temp-bamboo-sw',
      mapId: 'temple',
      kind: 'grass',
      shape: 'circle',
      x: -26.5,
      z: 24.5,
      radius: 3.8,
    },
    {
      id: 'temp-bamboo-ne',
      mapId: 'temple',
      kind: 'grass',
      shape: 'circle',
      x: 26.5,
      z: -24.5,
      radius: 3.8,
    },
  ],
  meadow: [
    // Outer golden oasis pools (spanned by sandstone causeway bridges)
    {
      id: 'mead-oasis-w',
      mapId: 'meadow',
      kind: 'water',
      shape: 'circle',
      x: -24.5,
      z: 8.5,
      radius: 6.4,
      floorOffsetY: -0.28,
    },
    {
      id: 'mead-oasis-e',
      mapId: 'meadow',
      kind: 'water',
      shape: 'circle',
      x: 24.5,
      z: -8.5,
      radius: 6.4,
      floorOffsetY: -0.28,
    },
    // Underground Catacombs subterranean water channel crossed by crypt bridge
    {
      id: 'mead-catacomb-water',
      mapId: 'meadow',
      kind: 'water',
      shape: 'rect',
      x: 26.5,
      z: 23.0,
      halfW: 7.0,
      halfD: 1.75,
      floorOffsetY: -3.85,
    },
    // Tall oasis reed grass patches (stealth!)
    {
      id: 'mead-grass-n',
      mapId: 'meadow',
      kind: 'grass',
      shape: 'circle',
      x: -6.5,
      z: -24.0,
      radius: 3.5,
    },
    {
      id: 'mead-grass-s',
      mapId: 'meadow',
      kind: 'grass',
      shape: 'circle',
      x: 6.5,
      z: 24.0,
      radius: 3.5,
    },
    {
      id: 'mead-grass-sw',
      mapId: 'meadow',
      kind: 'grass',
      shape: 'circle',
      x: -28.0,
      z: 21.5,
      radius: 3.5,
    },
    {
      id: 'mead-grass-ne',
      mapId: 'meadow',
      kind: 'grass',
      shape: 'circle',
      x: 28.0,
      z: -21.5,
      radius: 3.5,
    },
  ],
};

export const MAP_ENTERABLE_BUILDINGS: Record<MapId, EnterableBuildingSpec[]> = {
  shibuya: [
    {
      id: 'shib-mart-nw',
      mapId: 'shibuya',
      name: '24H KONBINI · 2F',
      style: 'store',
      x: -22.5,
      z: -20.5,
      halfW: 5.5,
      halfD: 4.5,
      wallHeight: 3.7,
      roofY: 7.4,
      floorColorHex: 0xe2e8f0,
      wallColorHex: 0xf8fafc,
      roofColorHex: 0x0284c7,
      accentColorHex: 0x38bdf8,
      doorSides: ['s', 'e'],
      maxHp: 145,
      hasSecondFloor: true,
      secondFloorY: 3.7,
      upperRoofY: 7.4,
      balconySide: 's',
      balconyDepth: 2.3,
      stairSide: 'interior',
    },
    {
      id: 'shib-ramen-ne',
      mapId: 'shibuya',
      name: 'NEO RAMEN · 2F',
      style: 'ramen',
      x: 22.5,
      z: -20.5,
      halfW: 5.5,
      halfD: 4.5,
      wallHeight: 3.7,
      roofY: 7.4,
      floorColorHex: 0xfef3c7,
      wallColorHex: 0x334155,
      roofColorHex: 0xe11d48,
      accentColorHex: 0xfb7185,
      doorSides: ['s', 'w'],
      maxHp: 145,
      hasSecondFloor: true,
      secondFloorY: 3.7,
      upperRoofY: 7.4,
      balconySide: 's',
      balconyDepth: 2.3,
      stairSide: 'e',
    },
    {
      id: 'shib-arcade-sw',
      mapId: 'shibuya',
      name: 'SHIBUYA ARCADE · 2F',
      style: 'arcade',
      x: -22.5,
      z: 20.5,
      halfW: 5.5,
      halfD: 4.5,
      wallHeight: 3.7,
      roofY: 7.4,
      floorColorHex: 0x1e1b4b,
      wallColorHex: 0x312e81,
      roofColorHex: 0x7c3aed,
      accentColorHex: 0xe879f9,
      doorSides: ['n', 'e'],
      maxHp: 145,
      hasSecondFloor: true,
      secondFloorY: 3.7,
      upperRoofY: 7.4,
      balconySide: 'n',
      balconyDepth: 2.3,
      stairSide: 'w',
    },
    {
      id: 'shib-metro-s',
      mapId: 'shibuya',
      name: 'METRO CONCOURSE · 2F',
      style: 'subway',
      x: 0,
      z: 32.5,
      halfW: 6.8,
      halfD: 4.0,
      wallHeight: 3.7,
      roofY: 7.4,
      floorColorHex: 0xcbd5e1,
      wallColorHex: 0x475569,
      roofColorHex: 0x0f172a,
      accentColorHex: 0x22d3ee,
      doorSides: ['n', 'e', 'w'],
      maxHp: 165,
      hasSecondFloor: true,
      secondFloorY: 3.7,
      upperRoofY: 7.4,
      balconySide: 'n',
      balconyDepth: 2.1,
      stairSide: 'w',
    },
  ],
  obsidian: [
    {
      id: 'obs-volcano-nw',
      mapId: 'obsidian',
      name: 'HOLLOW VOLCANO CALDERA',
      style: 'volcano',
      x: -25.5,
      z: -24.5,
      halfW: 9.6,
      halfD: 9.2,
      wallHeight: 5.2,
      roofY: 5.5,
      floorColorHex: 0x1c1917,
      wallColorHex: 0x292524,
      roofColorHex: 0x0f172a,
      accentColorHex: 0xf97316,
      doorSides: ['s', 'e'],
      maxHp: 280,
    },
    {
      id: 'obs-forge-se',
      mapId: 'obsidian',
      name: 'BLACKSMITH FORGE · 2F',
      style: 'forge',
      x: 25.5,
      z: 24.5,
      halfW: 5.8,
      halfD: 5.0,
      wallHeight: 3.7,
      roofY: 7.4,
      floorColorHex: 0x1e293b,
      wallColorHex: 0x334155,
      roofColorHex: 0x0f172a,
      accentColorHex: 0xa855f7,
      doorSides: ['n', 'w'],
      maxHp: 165,
      hasSecondFloor: true,
      secondFloorY: 3.7,
      upperRoofY: 7.4,
      balconySide: 'n',
      balconyDepth: 2.2,
      stairSide: 'w',
    },
  ],
  temple: [
    {
      id: 'temp-dojo-nw',
      mapId: 'temple',
      name: 'BAMBOO DOJO · 2F',
      style: 'dojo',
      x: -25.0,
      z: -22.5,
      halfW: 5.5,
      halfD: 4.5,
      wallHeight: 3.7,
      roofY: 7.5,
      floorColorHex: 0x854d0e,
      wallColorHex: 0x7f1d1d,
      roofColorHex: 0x1e293b,
      accentColorHex: 0xfb923c,
      doorSides: ['s', 'e'],
      maxHp: 150,
      hasSecondFloor: true,
      secondFloorY: 3.7,
      upperRoofY: 7.5,
      balconySide: 's',
      balconyDepth: 2.3,
      stairSide: 'e',
    },
    {
      id: 'temp-sanctuary-n',
      mapId: 'temple',
      name: 'GRAND SHRINE HALL',
      style: 'shrine',
      x: 0,
      z: -33.5,
      halfW: 6.4,
      halfD: 4.2,
      wallHeight: 3.85,
      roofY: 4.2,
      floorColorHex: 0x57534e,
      wallColorHex: 0x991b1b,
      roofColorHex: 0x1e293b,
      accentColorHex: 0xfacc15,
      doorSides: ['s', 'e', 'w'],
      maxHp: 175,
    },
    {
      id: 'temp-pav-se',
      mapId: 'temple',
      name: 'LOTUS SANCTUARY · 2F',
      style: 'pavilion',
      x: 25.0,
      z: 22.5,
      halfW: 5.5,
      halfD: 4.5,
      wallHeight: 3.7,
      roofY: 7.5,
      floorColorHex: 0xa16207,
      wallColorHex: 0x991b1b,
      roofColorHex: 0x1e293b,
      accentColorHex: 0xfacc15,
      doorSides: ['n', 'w'],
      maxHp: 150,
      hasSecondFloor: true,
      secondFloorY: 3.7,
      upperRoofY: 7.5,
      balconySide: 'n',
      balconyDepth: 2.3,
      stairSide: 'w',
    },
  ],
  meadow: [
    {
      id: 'mead-coliseum-nw',
      mapId: 'meadow',
      name: 'GRAND COLISEUM · 2F',
      style: 'coliseum',
      x: -25.5,
      z: -24.5,
      halfW: 9.4,
      halfD: 9.0,
      wallHeight: 4.1,
      roofY: 7.8,
      floorColorHex: 0xe7d6b5,
      wallColorHex: 0xe7e5e4,
      roofColorHex: 0xd97706,
      accentColorHex: 0xfacc15,
      doorSides: ['s', 'e'],
      maxHp: 240,
      hasSecondFloor: true,
      secondFloorY: 4.1,
      upperRoofY: 7.8,
      balconySide: 'e',
      balconyDepth: 2.4,
      stairSide: 's',
    },
    {
      id: 'mead-catacomb-se',
      mapId: 'meadow',
      name: 'DEEP UNDERGROUND CATACOMBS',
      style: 'catacomb',
      x: 26.5,
      z: 25.5,
      halfW: 8.6,
      halfD: 8.0,
      wallHeight: 3.85,
      roofY: 3.85,
      floorColorHex: 0x475569,
      wallColorHex: 0x64748b,
      roofColorHex: 0xb45309,
      accentColorHex: 0x38bdf8,
      doorSides: ['n', 'w'],
      maxHp: 280,
      isSubterranean: true,
      subterraneanDepth: 3.6,
    },
  ],
};

function buildZonesForEnterableBuilding(b: EnterableBuildingSpec): Static3DAABBZone[] {
  const zones: Static3DAABBZone[] = [];
  if (!b.hasSecondFloor || !b.secondFloorY) return zones;

  const sy = b.secondFloorY;
  const isInteriorStairs = b.stairSide === 'interior';
  const cutout = isInteriorStairs
    ? { minX: b.x - b.halfW + 0.5, maxX: b.x - b.halfW + 2.7, minZ: b.z - 2.6, maxZ: b.z + 2.2 }
    : undefined;

  // Playable 2nd-floor ceiling slab (walk underneath at relY < sy - 0.35, walk atop at relY >= sy - 0.52)
  zones.push({
    id: `${b.id}-2f-slab`,
    mapId: b.mapId,
    minX: b.x - b.halfW + 0.15,
    maxX: b.x + b.halfW - 0.15,
    minZ: b.z - b.halfD + 0.15,
    maxZ: b.z + b.halfD - 0.15,
    bottomY: sy - 0.3,
    topY: sy,
    zoneType: 'second_floor',
    passUnder: true,
    cutout,
    colorHex: b.floorColorHex,
    accentHex: b.accentColorHex,
  });

  // Interior Staircase
  if (isInteriorStairs && cutout) {
    zones.push({
      id: `${b.id}-stairs-int`,
      mapId: b.mapId,
      minX: cutout.minX,
      maxX: cutout.maxX,
      minZ: cutout.minZ - 0.4,
      maxZ: cutout.maxZ + 0.4,
      bottomY: 0,
      topY: sy,
      zoneType: 'stairs',
      passUnder: true,
      rampAxis: 'z',
      rampStartY: sy,
      rampEndY: 0,
      colorHex: b.wallColorHex,
      accentHex: b.accentColorHex,
    });
  } else if (b.stairSide === 'e') {
    zones.push({
      id: `${b.id}-stairs-e`,
      mapId: b.mapId,
      minX: b.x + b.halfW + 0.05,
      maxX: b.x + b.halfW + 2.15,
      minZ: b.z - 2.9,
      maxZ: b.z + 2.9,
      bottomY: 0,
      topY: sy,
      zoneType: 'stairs',
      passUnder: true,
      rampAxis: 'z',
      rampStartY: sy,
      rampEndY: 0,
      colorHex: b.wallColorHex,
      accentHex: b.accentColorHex,
    });
  } else if (b.stairSide === 'w') {
    zones.push({
      id: `${b.id}-stairs-w`,
      mapId: b.mapId,
      minX: b.x - b.halfW - 2.15,
      maxX: b.x - b.halfW - 0.05,
      minZ: b.z - 2.9,
      maxZ: b.z + 2.9,
      bottomY: 0,
      topY: sy,
      zoneType: 'stairs',
      passUnder: true,
      rampAxis: 'z',
      rampStartY: 0,
      rampEndY: sy,
      colorHex: b.wallColorHex,
      accentHex: b.accentColorHex,
    });
  } else if (b.stairSide === 's') {
    zones.push({
      id: `${b.id}-stairs-s`,
      mapId: b.mapId,
      minX: b.x - 3.0,
      maxX: b.x + 3.0,
      minZ: b.z + b.halfD + 0.05,
      maxZ: b.z + b.halfD + 2.2,
      bottomY: 0,
      topY: sy,
      zoneType: 'stairs',
      passUnder: true,
      rampAxis: 'x',
      rampStartY: sy,
      rampEndY: 0,
      colorHex: b.wallColorHex,
      accentHex: b.accentColorHex,
    });
  }

  // Playable 2nd-floor Balcony overlooking street/courtyard
  if (b.balconySide && b.balconyDepth) {
    const bd = b.balconyDepth;
    if (b.balconySide === 's') {
      zones.push({
        id: `${b.id}-balcony-s`,
        mapId: b.mapId,
        minX: b.x - b.halfW + 0.3,
        maxX: b.x + b.halfW - 0.3,
        minZ: b.z + b.halfD - 0.1,
        maxZ: b.z + b.halfD + bd,
        bottomY: sy - 0.28,
        topY: sy,
        zoneType: 'balcony',
        passUnder: true,
        colorHex: b.roofColorHex,
        accentHex: b.accentColorHex,
      });
    } else if (b.balconySide === 'n') {
      zones.push({
        id: `${b.id}-balcony-n`,
        mapId: b.mapId,
        minX: b.x - b.halfW + 0.3,
        maxX: b.x + b.halfW - 0.3,
        minZ: b.z - b.halfD - bd,
        maxZ: b.z - b.halfD + 0.1,
        bottomY: sy - 0.28,
        topY: sy,
        zoneType: 'balcony',
        passUnder: true,
        colorHex: b.roofColorHex,
        accentHex: b.accentColorHex,
      });
    } else if (b.balconySide === 'e') {
      zones.push({
        id: `${b.id}-balcony-e`,
        mapId: b.mapId,
        minX: b.x + b.halfW - 0.1,
        maxX: b.x + b.halfW + bd,
        minZ: b.z - b.halfD + 0.5,
        maxZ: b.z + b.halfD - 0.5,
        bottomY: sy - 0.28,
        topY: sy,
        zoneType: 'balcony',
        passUnder: true,
        colorHex: b.roofColorHex,
        accentHex: b.accentColorHex,
      });
    }
  }

  return zones;
}

const HANDCRAFTED_3D_ZONES: Record<MapId, Static3DAABBZone[]> = {
  shibuya: [
    // Elevated Pedestrian Skybridge linking 24H Konbini 2F & Neo Ramen 2F over North Avenue
    {
      id: 'shib-skybridge-n',
      mapId: 'shibuya',
      minX: -17.0,
      maxX: 17.0,
      minZ: -22.2,
      maxZ: -18.8,
      bottomY: 3.35,
      topY: 3.7,
      zoneType: 'skybridge',
      passUnder: true,
      colorHex: 0x334155,
      accentHex: 0x38bdf8,
    },
    {
      id: 'shib-podium-sky',
      mapId: 'shibuya',
      minX: -1.1,
      maxX: 1.1,
      minZ: -21.6,
      maxZ: -19.4,
      bottomY: 3.7,
      topY: 4.35,
      zoneType: 'pedestal',
      passUnder: true,
      colorHex: 0x0f172a,
      accentHex: 0xfacc15,
    },
    // East Parkour Course: AC Box -> Neon Awning -> Scaffolding Tower -> East Rooftop Podium
    {
      id: 'shib-pk-e1',
      mapId: 'shibuya',
      minX: 29.0,
      maxX: 31.8,
      minZ: 12.0,
      maxZ: 14.8,
      bottomY: 0,
      topY: 1.35,
      zoneType: 'parkour',
      colorHex: 0x475569,
      accentHex: 0x38bdf8,
    },
    {
      id: 'shib-pk-e2',
      mapId: 'shibuya',
      minX: 31.2,
      maxX: 34.0,
      minZ: 16.2,
      maxZ: 19.0,
      bottomY: 1.9,
      topY: 2.65,
      zoneType: 'parkour',
      passUnder: true,
      colorHex: 0x1e293b,
      accentHex: 0xf43f5e,
    },
    {
      id: 'shib-pk-e3',
      mapId: 'shibuya',
      minX: 32.8,
      maxX: 35.8,
      minZ: 20.4,
      maxZ: 23.4,
      bottomY: 3.2,
      topY: 3.9,
      zoneType: 'parkour',
      passUnder: true,
      colorHex: 0x1e293b,
      accentHex: 0x22d3ee,
    },
    {
      id: 'shib-podium-e',
      mapId: 'shibuya',
      minX: 33.4,
      maxX: 36.6,
      minZ: 24.8,
      maxZ: 28.0,
      bottomY: 4.2,
      topY: 4.95,
      zoneType: 'pedestal',
      passUnder: true,
      colorHex: 0x0f172a,
      accentHex: 0xfacc15,
    },
    // West Avenue Crate/Awning Parkour to Konbini 2F Balcony
    {
      id: 'shib-pk-w1',
      mapId: 'shibuya',
      minX: -32.2,
      maxX: -29.6,
      minZ: -9.5,
      maxZ: -6.9,
      bottomY: 0,
      topY: 1.35,
      zoneType: 'parkour',
      colorHex: 0x475569,
      accentHex: 0x38bdf8,
    },
    {
      id: 'shib-pk-w2',
      mapId: 'shibuya',
      minX: -31.2,
      maxX: -28.4,
      minZ: -14.5,
      maxZ: -11.7,
      bottomY: 1.9,
      topY: 2.65,
      zoneType: 'parkour',
      passUnder: true,
      colorHex: 0x1e293b,
      accentHex: 0x38bdf8,
    },
  ],
  temple: [
    // Wide Stone Grand Staircase climbing up to North Grand Shrine Terrace
    {
      id: 'temp-stairs-shrine',
      mapId: 'temple',
      minX: -4.2,
      maxX: 4.2,
      minZ: -28.2,
      maxZ: -23.5,
      bottomY: 0,
      topY: 1.25,
      zoneType: 'stairs',
      rampAxis: 'z',
      rampStartY: 1.25,
      rampEndY: 0,
      colorHex: 0x57534e,
      accentHex: 0xfb923c,
    },
    // West & East Wooden Pagoda Bridges over Koi Ponds
    {
      id: 'temp-bridge-w',
      mapId: 'temple',
      minX: -31.8,
      maxX: -17.2,
      minZ: 7.0,
      maxZ: 10.0,
      bottomY: 0,
      topY: 0.48,
      zoneType: 'skybridge',
      colorHex: 0x991b1b,
      accentHex: 0xfacc15,
    },
    {
      id: 'temp-bridge-e',
      mapId: 'temple',
      minX: 17.2,
      maxX: 31.8,
      minZ: -10.0,
      maxZ: -7.0,
      bottomY: 0,
      topY: 0.48,
      zoneType: 'skybridge',
      colorHex: 0x991b1b,
      accentHex: 0xfacc15,
    },
    // NE Temple Rafter Parkour Course -> NE Rafter Podium
    {
      id: 'temp-pk-ne1',
      mapId: 'temple',
      minX: 20.0,
      maxX: 22.8,
      minZ: -24.5,
      maxZ: -21.7,
      bottomY: 0,
      topY: 1.35,
      zoneType: 'parkour',
      colorHex: 0x57534e,
      accentHex: 0xfb923c,
    },
    {
      id: 'temp-pk-ne2',
      mapId: 'temple',
      minX: 24.5,
      maxX: 27.3,
      minZ: -26.5,
      maxZ: -23.7,
      bottomY: 1.9,
      topY: 2.65,
      zoneType: 'parkour',
      passUnder: true,
      colorHex: 0x7f1d1d,
      accentHex: 0xfacc15,
    },
    {
      id: 'temp-pk-ne3',
      mapId: 'temple',
      minX: 28.8,
      maxX: 31.6,
      minZ: -28.0,
      maxZ: -25.2,
      bottomY: 3.2,
      topY: 3.9,
      zoneType: 'parkour',
      passUnder: true,
      colorHex: 0x7f1d1d,
      accentHex: 0xfacc15,
    },
    {
      id: 'temp-podium-ne',
      mapId: 'temple',
      minX: 32.8,
      maxX: 36.2,
      minZ: -29.8,
      maxZ: -26.4,
      bottomY: 4.15,
      topY: 4.9,
      zoneType: 'pedestal',
      passUnder: true,
      colorHex: 0x1e293b,
      accentHex: 0xfacc15,
    },
    // SW Bamboo Cliff Stepping Stones -> SW Podium
    {
      id: 'temp-pk-sw1',
      mapId: 'temple',
      minX: -27.5,
      maxX: -24.7,
      minZ: 20.5,
      maxZ: 23.3,
      bottomY: 0,
      topY: 1.35,
      zoneType: 'parkour',
      colorHex: 0x57534e,
      accentHex: 0x34d399,
    },
    {
      id: 'temp-pk-sw2',
      mapId: 'temple',
      minX: -31.5,
      maxX: -28.7,
      minZ: 24.0,
      maxZ: 26.8,
      bottomY: 1.9,
      topY: 2.75,
      zoneType: 'parkour',
      passUnder: true,
      colorHex: 0x57534e,
      accentHex: 0x34d399,
    },
    {
      id: 'temp-podium-sw',
      mapId: 'temple',
      minX: -35.6,
      maxX: -32.4,
      minZ: 27.4,
      maxZ: 30.6,
      bottomY: 3.4,
      topY: 4.15,
      zoneType: 'pedestal',
      passUnder: true,
      colorHex: 0x1e293b,
      accentHex: 0xfacc15,
    },
  ],
  obsidian: [
    // Inside Hollow Volcano Caldera: Central Obsidian Island + Cross-Bridges over Magma
    {
      id: 'obs-volcano-island',
      mapId: 'obsidian',
      minX: -28.2,
      maxX: -22.8,
      minZ: -27.2,
      maxZ: -21.8,
      bottomY: 0,
      topY: 0.55,
      zoneType: 'pedestal',
      colorHex: 0x1e293b,
      accentHex: 0xf97316,
    },
    {
      id: 'obs-volcano-bridge-s',
      mapId: 'obsidian',
      minX: -27.2,
      maxX: -23.8,
      minZ: -22.2,
      maxZ: -15.6,
      bottomY: 0,
      topY: 0.5,
      zoneType: 'skybridge',
      colorHex: 0x334155,
      accentHex: 0xf97316,
    },
    {
      id: 'obs-volcano-bridge-e',
      mapId: 'obsidian',
      minX: -23.2,
      maxX: -16.2,
      minZ: -26.2,
      maxZ: -22.8,
      bottomY: 0,
      topY: 0.5,
      zoneType: 'skybridge',
      colorHex: 0x334155,
      accentHex: 0xf97316,
    },
    // NE & SW Lava River Obsidian Bridges
    {
      id: 'obs-bridge-ne-slab',
      mapId: 'obsidian',
      minX: 20.6,
      maxX: 24.4,
      minZ: -22.6,
      maxZ: -14.4,
      bottomY: 0,
      topY: 0.52,
      zoneType: 'skybridge',
      colorHex: 0x334155,
      accentHex: 0xf97316,
    },
    {
      id: 'obs-bridge-sw-slab',
      mapId: 'obsidian',
      minX: -24.4,
      maxX: -20.6,
      minZ: 14.4,
      maxZ: 22.6,
      bottomY: 0,
      topY: 0.52,
      zoneType: 'skybridge',
      colorHex: 0x334155,
      accentHex: 0xa855f7,
    },
    // NE Cooling Basalt Spire Parkour -> Spire Podium
    {
      id: 'obs-pk-ne1',
      mapId: 'obsidian',
      minX: 23.0,
      maxX: 25.8,
      minZ: -27.2,
      maxZ: -24.4,
      bottomY: 0,
      topY: 1.35,
      zoneType: 'parkour',
      colorHex: 0x1e293b,
      accentHex: 0xc084fc,
    },
    {
      id: 'obs-pk-ne2',
      mapId: 'obsidian',
      minX: 27.2,
      maxX: 30.0,
      minZ: -29.2,
      maxZ: -26.4,
      bottomY: 1.9,
      topY: 2.7,
      zoneType: 'parkour',
      passUnder: true,
      colorHex: 0x1e293b,
      accentHex: 0xf97316,
    },
    {
      id: 'obs-podium-ne',
      mapId: 'obsidian',
      minX: 31.8,
      maxX: 35.2,
      minZ: -31.2,
      maxZ: -27.8,
      bottomY: 3.3,
      topY: 4.05,
      zoneType: 'pedestal',
      passUnder: true,
      colorHex: 0x0f172a,
      accentHex: 0xfacc15,
    },
    // SW Lava Chasm Stepping Pillars -> Ridge Podium
    {
      id: 'obs-pk-sw1',
      mapId: 'obsidian',
      minX: -29.0,
      maxX: -26.2,
      minZ: 23.8,
      maxZ: 26.6,
      bottomY: 0,
      topY: 1.35,
      zoneType: 'parkour',
      colorHex: 0x334155,
      accentHex: 0xa855f7,
    },
    {
      id: 'obs-podium-sw',
      mapId: 'obsidian',
      minX: -34.2,
      maxX: -30.8,
      minZ: 27.4,
      maxZ: 30.8,
      bottomY: 2.1,
      topY: 2.8,
      zoneType: 'pedestal',
      passUnder: true,
      colorHex: 0x0f172a,
      accentHex: 0x38bdf8,
    },
  ],
  meadow: [
    // Inside Coliseum: Champion Duel Pit Podium + Spectator Bleachers
    {
      id: 'mead-coliseum-podium',
      mapId: 'meadow',
      minX: -26.8,
      maxX: -24.2,
      minZ: -25.8,
      maxZ: -23.2,
      bottomY: 0,
      topY: 0.72,
      zoneType: 'pedestal',
      colorHex: 0xe7e5e4,
      accentHex: 0xfacc15,
    },
    // Inside Underground Catacombs: Stone Bridge crossing Subterranean Water Channel
    {
      id: 'mead-catacomb-bridge',
      mapId: 'meadow',
      minX: 24.8,
      maxX: 28.2,
      minZ: 20.8,
      maxZ: 25.2,
      bottomY: 0,
      topY: 0.45,
      zoneType: 'skybridge',
      colorHex: 0x64748b,
      accentHex: 0x38bdf8,
    },
    // Catacomb Hidden Relic Vault Raised Pedestal
    {
      id: 'mead-catacomb-relic-podium',
      mapId: 'meadow',
      minX: 30.0,
      maxX: 33.0,
      minZ: 29.0,
      maxZ: 32.0,
      bottomY: 0,
      topY: 0.85,
      zoneType: 'pedestal',
      colorHex: 0x475569,
      accentHex: 0x38bdf8,
    },
    // West & East Sandstone Oasis Causeway Bridges
    {
      id: 'mead-bridge-w',
      mapId: 'meadow',
      minX: -31.2,
      maxX: -17.8,
      minZ: 7.1,
      maxZ: 9.9,
      bottomY: 0,
      topY: 0.42,
      zoneType: 'skybridge',
      colorHex: 0xd6d3d1,
      accentHex: 0xfacc15,
    },
    {
      id: 'mead-bridge-e',
      mapId: 'meadow',
      minX: 17.8,
      maxX: 31.2,
      minZ: -9.9,
      maxZ: -7.1,
      bottomY: 0,
      topY: 0.42,
      zoneType: 'skybridge',
      colorHex: 0xd6d3d1,
      accentHex: 0xfacc15,
    },
    // NE Sandstone Ruin Pillar Parkour -> Aqueduct Podium
    {
      id: 'mead-pk-ne1',
      mapId: 'meadow',
      minX: 22.0,
      maxX: 24.8,
      minZ: -25.8,
      maxZ: -23.0,
      bottomY: 0,
      topY: 1.35,
      zoneType: 'parkour',
      colorHex: 0xd6d3d1,
      accentHex: 0xfacc15,
    },
    {
      id: 'mead-pk-ne2',
      mapId: 'meadow',
      minX: 26.8,
      maxX: 29.6,
      minZ: -27.8,
      maxZ: -25.0,
      bottomY: 1.9,
      topY: 2.7,
      zoneType: 'parkour',
      passUnder: true,
      colorHex: 0xd6d3d1,
      accentHex: 0xfacc15,
    },
    {
      id: 'mead-podium-ne',
      mapId: 'meadow',
      minX: 31.2,
      maxX: 34.4,
      minZ: -29.8,
      maxZ: -26.6,
      bottomY: 3.3,
      topY: 4.05,
      zoneType: 'pedestal',
      passUnder: true,
      colorHex: 0xf5f5f4,
      accentHex: 0xfacc15,
    },
    // SW Oasis Monolith Parkour -> SW Podium
    {
      id: 'mead-pk-sw1',
      mapId: 'meadow',
      minX: -28.0,
      maxX: -25.2,
      minZ: 24.5,
      maxZ: 27.3,
      bottomY: 0,
      topY: 1.35,
      zoneType: 'parkour',
      colorHex: 0xd6d3d1,
      accentHex: 0x84cc16,
    },
    {
      id: 'mead-podium-sw',
      mapId: 'meadow',
      minX: -33.0,
      maxX: -29.8,
      minZ: 28.2,
      maxZ: 31.4,
      bottomY: 2.0,
      topY: 2.75,
      zoneType: 'pedestal',
      passUnder: true,
      colorHex: 0xf5f5f4,
      accentHex: 0xfacc15,
    },
  ],
};

export const MAP_3D_AABB_ZONES: Record<MapId, Static3DAABBZone[]> = {
  shibuya: [
    ...MAP_ENTERABLE_BUILDINGS.shibuya.flatMap(buildZonesForEnterableBuilding),
    ...HANDCRAFTED_3D_ZONES.shibuya,
  ],
  temple: [
    ...MAP_ENTERABLE_BUILDINGS.temple.flatMap(buildZonesForEnterableBuilding),
    ...HANDCRAFTED_3D_ZONES.temple,
  ],
  obsidian: [
    ...MAP_ENTERABLE_BUILDINGS.obsidian.flatMap(buildZonesForEnterableBuilding),
    ...HANDCRAFTED_3D_ZONES.obsidian,
  ],
  meadow: [
    ...MAP_ENTERABLE_BUILDINGS.meadow.flatMap(buildZonesForEnterableBuilding),
    ...HANDCRAFTED_3D_ZONES.meadow,
  ],
};

export function getMapStatic3DZones(mapId: MapId): Static3DAABBZone[] {
  return MAP_3D_AABB_ZONES[mapId] ?? [];
}

export function getStatic3DZoneTopAt(zone: Static3DAABBZone, x: number, z: number): number {
  if (zone.zoneType === 'stairs' && zone.rampAxis && zone.rampStartY !== undefined && zone.rampEndY !== undefined) {
    if (zone.rampAxis === 'x') {
      const t = clamp((x - zone.minX) / Math.max(0.01, zone.maxX - zone.minX), 0, 1);
      return zone.rampStartY + (zone.rampEndY - zone.rampStartY) * t;
    } else {
      const t = clamp((z - zone.minZ) / Math.max(0.01, zone.maxZ - zone.minZ), 0, 1);
      return zone.rampStartY + (zone.rampEndY - zone.rampStartY) * t;
    }
  }
  return zone.topY;
}

export function computeStatic3DSupportY(
  mapId: MapId,
  x: number,
  currentRelY: number,
  z: number,
  actorRadius = 0.42
): number {
  const zones = getMapStatic3DZones(mapId);
  let maxTop = 0;
  const pad = actorRadius * 0.6;
  for (const zSpec of zones) {
    if (
      x >= zSpec.minX - pad &&
      x <= zSpec.maxX + pad &&
      z >= zSpec.minZ - pad &&
      z <= zSpec.maxZ + pad
    ) {
      if (
        zSpec.cutout &&
        x >= zSpec.cutout.minX &&
        x <= zSpec.cutout.maxX &&
        z >= zSpec.cutout.minZ &&
        z <= zSpec.cutout.maxZ
      ) {
        continue;
      }
      const topAtPos = getStatic3DZoneTopAt(zSpec, x, z);
      const tolerance = zSpec.zoneType === 'stairs' ? 1.05 : 0.55;
      if (currentRelY >= topAtPos - tolerance) {
        if (topAtPos > maxTop) maxTop = topAtPos;
      }
    }
  }
  return maxTop;
}

export function resolveStatic3DCollisions(
  mapId: MapId,
  x: number,
  relY: number,
  z: number,
  actorRadius = 0.32
): { x: number; z: number } {
  let nx = x;
  let nz = z;
  const tightRadius = Math.min(actorRadius, 0.34);
  const zones = getMapStatic3DZones(mapId);
  const actorTopY = relY + 1.55;
  for (const zSpec of zones) {
    if (zSpec.zoneType === 'stairs' || zSpec.zoneType === 'floor_slab') continue;
    // Low bridges, causeways, islands, and duel podiums are smoothly steppable (never block horizontally)
    if (zSpec.topY <= 0.75) continue;
    // Standing above this floor/balcony/podium -> no horizontal wall push
    if (relY >= zSpec.topY - 0.5) continue;
    // Walking or jumping underneath a 2nd-floor slab / skybridge / elevated ledge -> pass right under!
    if (zSpec.passUnder && relY < zSpec.bottomY - 0.1) continue;
    // Vertical overlap check against slab/pillar volume
    if (actorTopY <= zSpec.bottomY + 0.1) continue;
    // Stairwell cutouts remain open for climbing smoothly
    if (
      zSpec.cutout &&
      nx >= zSpec.cutout.minX &&
      nx <= zSpec.cutout.maxX &&
      nz >= zSpec.cutout.minZ &&
      nz <= zSpec.cutout.maxZ
    ) {
      continue;
    }

    const halfW = (zSpec.maxX - zSpec.minX) * 0.5;
    const halfD = (zSpec.maxZ - zSpec.minZ) * 0.5;
    const cx = (zSpec.minX + zSpec.maxX) * 0.5;
    const cz = (zSpec.minZ + zSpec.maxZ) * 0.5;
    const expandW = halfW + tightRadius;
    const expandD = halfD + tightRadius;
    const dx = nx - cx;
    const dz = nz - cz;
    if (Math.abs(dx) < expandW && Math.abs(dz) < expandD) {
      const penX = expandW - Math.abs(dx);
      const penZ = expandD - Math.abs(dz);
      if (penX < penZ) {
        nx += dx >= 0 ? penX : -penX;
      } else {
        nz += dz >= 0 ? penZ : -penZ;
      }
    }
  }
  return { x: nx, z: nz };
}

export function pointHitsStatic3D(
  mapId: MapId,
  x: number,
  relY: number,
  z: number
): boolean {
  const zones = getMapStatic3DZones(mapId);
  for (const zSpec of zones) {
    if (zSpec.zoneType === 'stairs' || zSpec.zoneType === 'floor_slab') continue;
    if (relY >= zSpec.bottomY && relY < zSpec.topY && x >= zSpec.minX && x <= zSpec.maxX && z >= zSpec.minZ && z <= zSpec.maxZ) {
      if (
        zSpec.cutout &&
        x >= zSpec.cutout.minX &&
        x <= zSpec.cutout.maxX &&
        z >= zSpec.cutout.minZ &&
        z <= zSpec.cutout.maxZ
      ) {
        continue;
      }
      return true;
    }
  }
  return false;
}

/**
 * Generates perimeter destructible walls for each enterable building while leaving
 * generous 3.0m+ open doorways on `doorSides` so fighters & bots walk straight inside.
 */
export function buildEnterableBuildingWallObstacles(mapId: MapId): MapObstacle[] {
  const buildings = MAP_ENTERABLE_BUILDINGS[mapId] ?? [];
  const walls: MapObstacle[] = [];
  const wallThick = 0.22;

  for (const b of buildings) {
    const maxHp = b.maxHp ?? 130;
    const h = b.wallHeight;
    const doorHalfGap = b.style === 'volcano' || b.style === 'coliseum' || b.isSubterranean ? 2.45 : 2.0;
    const indestructibleSub = Boolean(b.isSubterranean);

    const addHorizontalWall = (side: 'n' | 's', zCenter: number) => {
      const hasDoor = b.doorSides.includes(side);
      if (!hasDoor) {
        walls.push({
          id: `${b.id}-w-${side}`,
          kind: 'wall',
          variant: 'buildingWall',
          x: b.x,
          z: zCenter,
          halfW: b.halfW,
          halfD: wallThick,
          topY: h,
          colorHex: b.wallColorHex,
          roofColorHex: b.accentColorHex,
          destructible: !indestructibleSub,
          maxHp,
        });
      } else {
        const segW = Math.max(0.65, (b.halfW - doorHalfGap) * 0.5);
        const offset = doorHalfGap + segW;
        if (b.halfW - doorHalfGap > 0.65) {
          walls.push(
            {
              id: `${b.id}-w-${side}l`,
              kind: 'wall',
              variant: 'buildingWall',
              x: b.x - offset,
              z: zCenter,
              halfW: segW,
              halfD: wallThick,
              topY: h,
              colorHex: b.wallColorHex,
              roofColorHex: b.accentColorHex,
              destructible: !indestructibleSub,
              maxHp: Math.round(maxHp * 0.75),
            },
            {
              id: `${b.id}-w-${side}r`,
              kind: 'wall',
              variant: 'buildingWall',
              x: b.x + offset,
              z: zCenter,
              halfW: segW,
              halfD: wallThick,
              topY: h,
              colorHex: b.wallColorHex,
              roofColorHex: b.accentColorHex,
              destructible: !indestructibleSub,
              maxHp: Math.round(maxHp * 0.75),
            }
          );
        }
      }
    };

    const addVerticalWall = (side: 'w' | 'e', xCenter: number) => {
      const hasDoor = b.doorSides.includes(side);
      if (!hasDoor) {
        walls.push({
          id: `${b.id}-w-${side}`,
          kind: 'wall',
          variant: 'buildingWall',
          x: xCenter,
          z: b.z,
          halfW: wallThick,
          halfD: b.halfD - wallThick * 1.4,
          topY: h,
          colorHex: b.wallColorHex,
          roofColorHex: b.accentColorHex,
          destructible: !indestructibleSub,
          maxHp,
        });
      } else {
        const usableHalfD = Math.max(0.5, b.halfD - wallThick * 1.4);
        const segD = Math.max(0.45, (usableHalfD - doorHalfGap) * 0.5);
        const offset = doorHalfGap + segD;
        if (usableHalfD - doorHalfGap > 0.55) {
          walls.push(
            {
              id: `${b.id}-w-${side}t`,
              kind: 'wall',
              variant: 'buildingWall',
              x: xCenter,
              z: b.z - offset,
              halfW: wallThick,
              halfD: segD,
              topY: h,
              colorHex: b.wallColorHex,
              roofColorHex: b.accentColorHex,
              destructible: !indestructibleSub,
              maxHp: Math.round(maxHp * 0.75),
            },
            {
              id: `${b.id}-w-${side}b`,
              kind: 'wall',
              variant: 'buildingWall',
              x: xCenter,
              z: b.z + offset,
              halfW: wallThick,
              halfD: segD,
              topY: h,
              colorHex: b.wallColorHex,
              roofColorHex: b.accentColorHex,
              destructible: !indestructibleSub,
              maxHp: Math.round(maxHp * 0.75),
            }
          );
        }
      }
    };

    addHorizontalWall('n', b.z - b.halfD);
    addHorizontalWall('s', b.z + b.halfD);
    addVerticalWall('w', b.x - b.halfW);
    addVerticalWall('e', b.x + b.halfW);
  }

  return walls;
}

/**
 * Computes sculpted multi-layered terrain elevation across +50% expanded worlds
 * while keeping dead-center r < 11.5m completely clean level ground (y = 0).
 */
export function computeMapTerrainHeight(
  mapId: MapId,
  x: number,
  z: number,
  arenaRadius: number
): number {
  let y = 0;

  if (mapId === 'shibuya') {
    const northPlaza = rectRampFactor(x, z, 0, -29.0, 22, 4.4, 4.5) * 0.55;
    const southMetro = rectRampFactor(x, z, 0, 32.5, 16, 4.6, 4.2) * 0.45;
    const westDip = rectRampFactor(x, z, -24.0, 9.0, 6.2, 2.1, 2.2) * -0.22;
    const eastDip = circleRampFactor(x, z, 24.5, 9.5, 3.6, 2.0) * -0.2;
    y = Math.max(northPlaza, southMetro) + westDip + eastDip;
  } else if (mapId === 'obsidian') {
    const calderaFloorDip = circleRampFactor(x, z, -25.5, -24.5, 4.6, 2.0) * -0.34;
    const keepPad = rectRampFactor(x, z, 25.5, 24.5, 6.4, 5.6, 4.2) * 0.55;
    const northRidge = circleRampFactor(x, z, 4.5, -31.5, 5.4, 4.6) * 0.85;
    const southRidge = circleRampFactor(x, z, -4.5, 31.5, 5.4, 4.6) * 0.85;
    const lavaNeDip = rectRampFactor(x, z, 22.5, -18.5, 6.6, 2.1, 2.0) * -0.34;
    const lavaSwDip = rectRampFactor(x, z, -22.5, 18.5, 6.6, 2.1, 2.0) * -0.34;
    const lavaEastDip = circleRampFactor(x, z, 34.0, 0, 3.2, 1.9) * -0.32;
    const bridgeNe = rectRampFactor(x, z, 22.5, -18.5, 1.8, 3.8, 1.0) * 0.44;
    const bridgeSw = rectRampFactor(x, z, -22.5, 18.5, 1.8, 3.8, 1.0) * 0.44;
    y =
      Math.max(keepPad, northRidge, southRidge) +
      calderaFloorDip +
      lavaNeDip +
      lavaSwDip +
      lavaEastDip;
    y = Math.max(y, bridgeNe, bridgeSw);
  } else if (mapId === 'temple') {
    const northShrineTier = rectRampFactor(x, z, 0, -33.5, 14, 5.2, 4.5) * 1.25;
    const northCourtyardRamp = rectRampFactor(x, z, 0, -25.0, 12, 3.2, 4.0) * 0.55;
    const southTerrace = rectRampFactor(x, z, 0, 32.0, 16, 4.2, 4.5) * 0.65;
    const pondW = circleRampFactor(x, z, -24.5, 8.5, 5.6, 2.1) * -0.26;
    const pondE = circleRampFactor(x, z, 24.5, -8.5, 5.6, 2.1) * -0.26;
    const bridgeW = rectRampFactor(x, z, -24.5, 8.5, 7.2, 1.5, 0.9) * 0.5;
    const bridgeE = rectRampFactor(x, z, 24.5, -8.5, 7.2, 1.5, 0.9) * 0.5;
    y = Math.max(northShrineTier, northCourtyardRamp, southTerrace) + pondW + pondE;
    y = Math.max(y, bridgeW, bridgeE);
  } else {
    // meadow -> Corner Ancient Coliseum (NW) + Deep Underground Catacombs (SE, down to -3.6m) + Oasis pools
    const northBattlement = rectRampFactor(x, z, 0, -32.5, 16, 4.2, 4.5) * 0.88;
    const southBattlement = rectRampFactor(x, z, 0, 32.5, 16, 4.2, 4.5) * 0.88;
    const coliseumPad = rectRampFactor(x, z, -25.5, -24.5, 9.2, 8.8, 4.2) * 0.35;
    // Deep Underground Catacombs chamber & corridors (SE corner): descends smoothly to -3.6m!
    const catacombChamber = rectRampFactor(x, z, 26.5, 25.5, 8.4, 7.8, 4.4) * -3.6;
    const catacombRelicAlcove = rectRampFactor(x, z, 31.5, 30.5, 3.4, 3.4, 2.8) * -3.6;
    const catacombEntryRamp = rectRampFactor(x, z, 18.2, 17.5, 3.1, 3.1, 4.2) * -1.85;
    const catacombWaterDip = rectRampFactor(x, z, 26.5, 23.0, 6.2, 1.4, 0.8) * -0.25;
    const oasisW = circleRampFactor(x, z, -24.5, 8.5, 5.2, 2.0) * -0.28;
    const oasisE = circleRampFactor(x, z, 24.5, -8.5, 5.2, 2.0) * -0.28;
    const causewayW = rectRampFactor(x, z, -24.5, 8.5, 6.6, 1.4, 0.9) * 0.36;
    const causewayE = rectRampFactor(x, z, 24.5, -8.5, 6.6, 1.4, 0.9) * 0.36;

    const sunkenCatacomb = Math.min(catacombChamber, catacombRelicAlcove, catacombEntryRamp);
    const positiveRise = Math.max(northBattlement, southBattlement, coliseumPad);
    y =
      sunkenCatacomb < -0.15
        ? sunkenCatacomb + (sunkenCatacomb < -3.0 ? catacombWaterDip : 0)
        : Math.max(positiveRise + oasisW + oasisE, causewayW, causewayE);
  }

  const r = Math.hypot(x, z);
  if (r > arenaRadius + 2.2) {
    const outer = r - (arenaRadius + 2.2);
    if (mapId === 'shibuya') {
      y += outer * 0.055;
    } else if (mapId === 'meadow') {
      y += outer * 0.14 + Math.sin(x * 0.11) * Math.cos(z * 0.11) * 0.28;
    } else if (mapId === 'temple') {
      y += outer * 0.13;
    } else {
      y += outer * 0.18 + Math.sin(x * 0.12) * Math.cos(z * 0.12) * 0.22;
    }
  }

  return y;
}

export function pointInTerrainZone(zone: TerrainZoneSpec, x: number, z: number): boolean {
  if (zone.shape === 'circle') {
    const r = zone.radius ?? 3.0;
    const dx = x - zone.x;
    const dz = z - zone.z;
    return dx * dx + dz * dz <= r * r;
  }
  const hw = zone.halfW ?? 3.0;
  const hd = zone.halfD ?? 3.0;
  return Math.abs(x - zone.x) <= hw && Math.abs(z - zone.z) <= hd;
}

export function findEnterableBuildingAt(
  mapId: MapId,
  x: number,
  relY: number,
  z: number
): EnterableBuildingSpec | null {
  const buildings = MAP_ENTERABLE_BUILDINGS[mapId] ?? [];
  for (const b of buildings) {
    const ceilingLim = b.upperRoofY ? b.upperRoofY - 0.35 : b.roofY - 0.35;
    if (relY > ceilingLim) continue;
    if (Math.abs(x - b.x) <= b.halfW + 0.45 && Math.abs(z - b.z) <= b.halfD + 0.45) {
      return b;
    }
  }
  return null;
}

export interface EvaluatedTerrainState {
  inWater: boolean;
  onIce: boolean;
  inLava: boolean;
  inStealth: boolean;
  stealthPatchId: string | null;
  insideBuildingId: string | null;
  speedMultiplier: number;
  lightningBoost: number;
}

/**
 * Evaluates water, frozen-ice water, lava, tall-grass/steam stealth, and enterable building occupancy.
 */
export function evaluateTerrainZonesAt(
  mapId: MapId,
  x: number,
  relY: number,
  z: number,
  dynamicPatches?: DynamicHazardPatch[],
  frozenWaterZones?: FrozenWaterCircle[]
): EvaluatedTerrainState {
  const zones = MAP_TERRAIN_ZONES[mapId] ?? [];
  const nearGround = relY <= 0.85;
  let inWater = false;
  let onIce = false;
  let inLava = false;
  let inStealth = false;
  let stealthPatchId: string | null = null;

  const isFrozenAt = (px: number, pz: number): boolean => {
    if (!frozenWaterZones || frozenWaterZones.length === 0) return false;
    for (const fz of frozenWaterZones) {
      const dx = px - fz.x;
      const dz = pz - fz.z;
      if (dx * dx + dz * dz <= fz.radius * fz.radius) return true;
    }
    return false;
  };

  if (nearGround) {
    const onDryBridge =
      (mapId === 'temple' &&
        relY >= 0.32 &&
        (rectRampFactor(x, z, -24.5, 8.5, 7.2, 1.45, 0.3) > 0.5 ||
          rectRampFactor(x, z, 24.5, -8.5, 7.2, 1.45, 0.3) > 0.5)) ||
      (mapId === 'meadow' &&
        relY >= 0.3 &&
        (rectRampFactor(x, z, -24.5, 8.5, 6.6, 1.35, 0.3) > 0.5 ||
          rectRampFactor(x, z, 24.5, -8.5, 6.6, 1.35, 0.3) > 0.5 ||
          rectRampFactor(x, z, 26.5, 23.0, 1.6, 2.2, 0.3) > 0.5)) ||
      (mapId === 'obsidian' &&
        relY >= 0.35 &&
        (rectRampFactor(x, z, 22.5, -18.5, 1.8, 4.0, 0.3) > 0.5 ||
          rectRampFactor(x, z, -22.5, 18.5, 1.8, 4.0, 0.3) > 0.5 ||
          rectRampFactor(x, z, -25.5, -24.5, 2.6, 2.6, 0.3) > 0.5 ||
          rectRampFactor(x, z, -25.5, -18.9, 1.7, 3.3, 0.3) > 0.5 ||
          rectRampFactor(x, z, -19.7, -24.5, 3.5, 1.7, 0.3) > 0.5));

    for (const zone of zones) {
      if (!pointInTerrainZone(zone, x, z)) continue;
      if (zone.kind === 'water' && !onDryBridge) {
        if (isFrozenAt(x, z)) {
          onIce = true;
        } else {
          inWater = true;
        }
      } else if (zone.kind === 'lava' && !onDryBridge) {
        inLava = true;
      } else if (zone.kind === 'grass' || zone.kind === 'steam') {
        inStealth = true;
        stealthPatchId = zone.id;
      }
    }

    if (dynamicPatches) {
      for (const p of dynamicPatches) {
        const dx = x - p.x;
        const dz = z - p.z;
        if (dx * dx + dz * dz <= p.radius * p.radius) {
          if (p.kind === 'lava') inLava = true;
          if (p.kind === 'water') {
            if (isFrozenAt(x, z)) {
              onIce = true;
            } else {
              inWater = true;
            }
          }
        }
      }
    }
  }

  const building = findEnterableBuildingAt(mapId, x, relY, z);

  return {
    inWater,
    onIce,
    inLava,
    inStealth,
    stealthPatchId,
    insideBuildingId: building?.id ?? null,
    speedMultiplier: onIce ? 1.08 : inWater ? 0.7 : 1.0,
    lightningBoost: inWater ? 1.25 : 1.0,
  };
}

export interface StealthVisibilityActor {
  playerId: string;
  x: number;
  z: number;
  team?: TeamId;
  isKO: boolean;
  stealthed?: boolean;
  stealthPatchId?: string | null;
}

export function shouldViewerSeeActor(
  target: StealthVisibilityActor,
  viewer: StealthVisibilityActor | undefined,
  gameMode: GameModeId = 'classic'
): boolean {
  if (!target.stealthed || target.isKO) return true;
  if (!viewer || viewer.playerId === target.playerId) return true;
  if (areActorsAllied(viewer, target, gameMode)) return true;
  if (viewer.stealthPatchId && target.stealthPatchId && viewer.stealthPatchId === target.stealthPatchId) {
    return true;
  }
  const distSq = (viewer.x - target.x) * (viewer.x - target.x) + (viewer.z - target.z) * (viewer.z - target.z);
  return distSq <= 2.6 * 2.6;
}

export interface TacticalOrbCandidate {
  x: number;
  z: number;
  tag: 'building' | 'high_ground' | 'alley' | 'hazard_edge';
}

export const MAP_TACTICAL_ORB_CANDIDATES: Record<MapId, TacticalOrbCandidate[]> = {
  shibuya: [
    { x: -22.5, z: -20.5, tag: 'building' },
    { x: 22.5, z: -20.5, tag: 'building' },
    { x: 0, z: 32.5, tag: 'building' },
    { x: 0, z: -29.0, tag: 'high_ground' },
    { x: -33.5, z: 2.0, tag: 'alley' },
    { x: 33.5, z: -2.0, tag: 'alley' },
    { x: -24.0, z: 9.0, tag: 'hazard_edge' },
    { x: 24.5, z: 9.5, tag: 'hazard_edge' },
  ],
  obsidian: [
    { x: -25.5, z: -24.5, tag: 'building' },
    { x: 25.5, z: 24.5, tag: 'building' },
    { x: 4.5, z: -31.5, tag: 'high_ground' },
    { x: -4.5, z: 31.5, tag: 'high_ground' },
    { x: 22.5, z: -18.5, tag: 'high_ground' },
    { x: -22.5, z: 18.5, tag: 'high_ground' },
    { x: -31.5, z: 3.5, tag: 'alley' },
    { x: 34.0, z: -5.5, tag: 'hazard_edge' },
  ],
  temple: [
    { x: -25.0, z: -22.5, tag: 'building' },
    { x: 25.0, z: 22.5, tag: 'building' },
    { x: 0, z: -33.5, tag: 'high_ground' },
    { x: -24.5, z: 8.5, tag: 'high_ground' },
    { x: 24.5, z: -8.5, tag: 'high_ground' },
    { x: 26.5, z: -24.5, tag: 'alley' },
    { x: -26.5, z: 24.5, tag: 'alley' },
    { x: 0, z: 32.0, tag: 'alley' },
  ],
  meadow: [
    { x: -25.5, z: -24.5, tag: 'building' },
    { x: 26.5, z: 25.5, tag: 'building' },
    { x: 0, z: -32.5, tag: 'high_ground' },
    { x: 0, z: 32.5, tag: 'high_ground' },
    { x: -24.5, z: 8.5, tag: 'high_ground' },
    { x: 24.5, z: -8.5, tag: 'high_ground' },
    { x: 28.0, z: -21.5, tag: 'alley' },
    { x: -28.0, z: 21.5, tag: 'alley' },
  ],
};

/**
 * Computes exact surface height (terrain height + top surface of any walkable platform, stair, 2nd floor, or podium)
 * so aim holograms conform seamlessly over stairs, 2nd floors, skybridges, parkour podiums, and subterranean crypts.
 */
export function getSurfaceHeightAt(
  mapId: MapId,
  x: number,
  z: number,
  arenaRadius: number,
  obstacles?: Array<MapObstacle & { destroyed?: boolean }>,
  casterRelY = 0
): number {
  const terrainY = computeMapTerrainHeight(mapId, x, z, arenaRadius);
  let extraY = computeStatic3DSupportY(mapId, x, casterRelY, z, 0.35);
  if (obstacles && obstacles.length > 0) {
    const reachTop = Math.max(2.1, casterRelY + 1.8);
    for (const obs of obstacles) {
      if (obs.destroyed) continue;
      if (obs.topY > reachTop) continue;
      if (Math.abs(x - obs.x) <= obs.halfW && Math.abs(z - obs.z) <= obs.halfD) {
        if (obs.topY > extraY) extraY = obs.topY;
      }
    }
  }
  return terrainY + extraY;
}

export interface TerrainAimPoint {
  x: number;
  y: number;
  z: number;
}

export interface TerrainAimPathOptions {
  mapId: MapId;
  arenaRadius: number;
  startX: number;
  startRelY: number;
  startZ: number;
  dirX: number;
  dirZ: number;
  range: number;
  segments?: number;
  kind: 'line' | 'arc';
  arcPeakHeight?: number;
  endX?: number;
  endZ?: number;
  obstacles?: Array<MapObstacle & { destroyed?: boolean }>;
  ignoreWallStop?: boolean;
}

export interface TerrainAimPathResult {
  points: TerrainAimPoint[];
  groundPoints: TerrainAimPoint[];
  blocked: boolean;
  impactX: number;
  impactY: number;
  impactZ: number;
}

/**
 * Multi-segment terrain-conforming trajectory & ribbon solver:
 * - Samples terrain + 3D floor/stair/bridge elevation at every step so aim ribbons climb stairs,
 *   2nd floors, skybridges, and parkour podiums seamlessly while descending into underground catacombs.
 * - Terminates straight projectile/line holograms cleanly against blocking walls/pillars with impact markers.
 */
export function computeTerrainConformingAimPath(opts: TerrainAimPathOptions): TerrainAimPathResult {
  const segs = Math.max(4, Math.min(48, opts.segments ?? 28));
  const dirLen = Math.hypot(opts.dirX, opts.dirZ) || 1;
  const nx = opts.dirX / dirLen;
  const nz = opts.dirZ / dirLen;

  const targetX = opts.endX ?? opts.startX + nx * opts.range;
  const targetZ = opts.endZ ?? opts.startZ + nz * opts.range;
  const totalDist = Math.max(0.5, Math.hypot(targetX - opts.startX, targetZ - opts.startZ));

  const points: TerrainAimPoint[] = [];
  const groundPoints: TerrainAimPoint[] = [];

  const startTerrain = getSurfaceHeightAt(
    opts.mapId,
    opts.startX,
    opts.startZ,
    opts.arenaRadius,
    opts.obstacles,
    opts.startRelY
  );
  const endGroundY = getSurfaceHeightAt(
    opts.mapId,
    targetX,
    targetZ,
    opts.arenaRadius,
    opts.obstacles,
    opts.startRelY
  );

  const casterBodyTopRelY = Math.max(1.35, opts.startRelY + 1.35);
  let blocked = false;
  let impactX = targetX;
  let impactY = endGroundY + 0.28;
  let impactZ = targetZ;

  // Track current layer relY along path so stairs/ramps rise naturally without hitting 2nd floor ceilings from below
  let trackingRelY = opts.startRelY;

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const px = opts.startX + (targetX - opts.startX) * t;
    const pz = opts.startZ + (targetZ - opts.startZ) * t;

    const sampleLayerY =
      opts.kind === 'arc'
        ? trackingRelY + (opts.arcPeakHeight ?? 3.2) * 4 * t * (1 - t)
        : trackingRelY;
    const surfaceY = getSurfaceHeightAt(
      opts.mapId,
      px,
      pz,
      opts.arenaRadius,
      opts.obstacles,
      sampleLayerY
    );
    const stepRel = surfaceY - computeMapTerrainHeight(opts.mapId, px, pz, opts.arenaRadius);
    if (opts.kind === 'line') {
      trackingRelY = Math.max(stepRel, trackingRelY * 0.96);
    }

    if (!opts.ignoreWallStop && i > 0) {
      const sampleRelY =
        opts.kind === 'arc'
          ? opts.startRelY + 1.0 + (opts.arcPeakHeight ?? 3.2) * 4 * t * (1 - t)
          : Math.max(0.85, trackingRelY + 0.9);
      let hitObs: (MapObstacle & { destroyed?: boolean }) | null = null;
      if (opts.obstacles && opts.obstacles.length > 0) {
        for (const obs of opts.obstacles) {
          if (obs.destroyed) continue;
          if (obs.kind === 'bridge') continue;
          if (obs.topY <= casterBodyTopRelY && obs.kind === 'platform') continue;
          if (
            sampleRelY < obs.topY &&
            Math.abs(px - obs.x) <= obs.halfW + 0.14 &&
            Math.abs(pz - obs.z) <= obs.halfD + 0.14
          ) {
            hitObs = obs;
            break;
          }
        }
      }
      const hitStatic = !hitObs && pointHitsStatic3D(opts.mapId, px, sampleRelY, pz);
      if (hitObs || hitStatic) {
        blocked = true;
        const wallTerrain = computeMapTerrainHeight(opts.mapId, px, pz, opts.arenaRadius);
        const capY = hitObs ? hitObs.topY : sampleRelY + 0.6;
        const wallMarkY =
          opts.kind === 'arc'
            ? wallTerrain + Math.min(capY, Math.max(0.8, sampleRelY))
            : wallTerrain + Math.max(0.85, Math.min(capY * 0.65, casterBodyTopRelY));
        impactX = px;
        impactY = wallMarkY;
        impactZ = pz;
        points.push({ x: px, y: wallMarkY, z: pz });
        groundPoints.push({ x: px, y: surfaceY + 0.28, z: pz });
        break;
      }
    }

    if (opts.kind === 'arc') {
      const startH = startTerrain + opts.startRelY + 1.15;
      const endH = endGroundY + 0.28;
      const baseLinear = startH + (endH - startH) * t;
      const peak = opts.arcPeakHeight ?? Math.min(4.8, 1.4 + totalDist * 0.18);
      const parabola = 4 * peak * t * (1 - t);
      const arcY = Math.max(surfaceY + 0.28, baseLinear + parabola);
      points.push({ x: px, y: arcY, z: pz });
      groundPoints.push({ x: px, y: surfaceY + 0.28, z: pz });
      impactX = px;
      impactY = arcY;
      impactZ = pz;
    } else {
      const ribbonY = surfaceY + 0.28;
      points.push({ x: px, y: ribbonY, z: pz });
      groundPoints.push({ x: px, y: ribbonY, z: pz });
      impactX = px;
      impactY = ribbonY;
      impactZ = pz;
    }
  }

  return { points, groundPoints, blocked, impactX, impactY, impactZ };
}

export function computeTrainRushPosition(opts: {
  laneZ: number;
  dirX: number;
  telegraphRemaining: number;
  remaining: number;
  rushDuration?: number;
}): { active: boolean; trainX: number; trainZ: number; halfLen: number; halfWidth: number } {
  const rushDur = opts.rushDuration ?? 2.2;
  if (opts.telegraphRemaining > 0) {
    return {
      active: false,
      trainX: opts.dirX > 0 ? -62 : 62,
      trainZ: opts.laneZ,
      halfLen: 9.5,
      halfWidth: 2.35,
    };
  }
  const elapsedRush = clamp(rushDur - Math.max(0, opts.remaining - 0.5), 0, rushDur);
  const t = clamp(elapsedRush / rushDur, 0, 1);
  const startX = opts.dirX > 0 ? -64 : 64;
  const endX = opts.dirX > 0 ? 64 : -64;
  return {
    active: t < 1,
    trainX: startX + (endX - startX) * t,
    trainZ: opts.laneZ,
    halfLen: 9.5,
    halfWidth: 2.35,
  };
}

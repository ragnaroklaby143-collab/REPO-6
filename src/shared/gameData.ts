import {
  MAP_ENTERABLE_BUILDINGS,
  buildEnterableBuildingWallObstacles,
  computeMapTerrainHeight,
  computeStatic3DSupportY,
  findEnterableBuildingAt,
  getMapStatic3DZones,
  pointHitsStatic3D,
  resolveStatic3DCollisions,
} from '../game/mapLogic.ts';

export type FighterId = 'marjohn' | 'prime' | 'damen' | 'khen' | 'jm';
export type SkinId = 'classic' | 'special' | 'ascended';
export type MapId = 'shibuya' | 'meadow' | 'temple' | 'obsidian';
export type DamagePhase = 'NORMAL' | 'DAMAGED' | 'SEVERELY DAMAGED' | 'CRITICAL' | 'DEFEATED';
export type AbilitySlot = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type RoomPhase = 'lobby' | 'countdown' | 'combat' | 'roundEnd' | 'victory';
export type MatchAwakeningPhase = 'PRE_AWAKENING' | 'ORBS_ACTIVE' | 'CUTSCENE' | 'AWAKENED_DUEL';
export type CombatMoveType = 'strike' | 'grab' | 'parry';
export type ActorActionState =
  | 'idle'
  | 'move'
  | 'jump'
  | 'attack'
  | 'grab'
  | 'headlock'
  | 'guard'
  | 'dash'
  | 'skill'
  | 'ultimate'
  | 'whiff'
  | 'clash'
  | 'stagger'
  | 'ko';
export type EliminationStyle = 'collapse' | 'launch' | 'shatter' | 'dissolve';
export type KoCause =
  | 'normal'
  | 'parry'
  | 'combo'
  | 'ultimate'
  | 'clash'
  | 'grab'
  | 'ring'
  | 'lava'
  | 'train'
  | 'lightning'
  | 'collapse';
export type BattlefieldEventKind =
  | 'train_rush'
  | 'volcano_eruption'
  | 'thunder_squall'
  | 'sandstorm_collapse'
  | 'gravity'
  | 'hazard'
  | 'surge';
export type GameModeId = 'classic' | 'raid_boss' | 'koth' | 'squad_clash' | 'sudden_death';
export type TeamId = 'alpha' | 'beta' | 'boss' | 'raiders';

export interface GameModeSpec {
  id: GameModeId;
  name: string;
  shortLabel: string;
  badgeColor: string;
  description: string;
  playersHint: string;
}

export const GAME_MODES: GameModeSpec[] = [
  {
    id: 'classic',
    name: 'Classic Arena',
    shortLabel: 'CLASSIC FFA',
    badgeColor: '#38bdf8',
    description: 'Free-for-all showdown. First to 2 round wins claims victory; 1v1 duels unlock Awakening Orbs at 90s.',
    playersHint: '1v1 / FFA',
  },
  {
    id: 'raid_boss',
    name: 'Raid Boss (1v4)',
    shortLabel: '1v4 RAID BOSS',
    badgeColor: '#f43f5e',
    description: '1 Juggernaut Boss spawns permanently Awakened with 3.5x HP and rapid Domain charge against 4 united Raiders.',
    playersHint: '1v4 Co-op',
  },
  {
    id: 'koth',
    name: 'King of the Hill',
    shortLabel: 'KING OF HILL',
    badgeColor: '#facc15',
    description: 'Moving capture zone shifts every 30s! Standing inside scores points and doubles Domain & Chi charge for 3 minutes.',
    playersHint: '3m Respawn',
  },
  {
    id: 'squad_clash',
    name: 'Squad Clash',
    shortLabel: 'SQUAD 2v2',
    badgeColor: '#a855f7',
    description: 'Team Alpha vs Team Beta with friendly-fire disabled and instant respawns. First squad to 10 KOs wins!',
    playersHint: 'First to 10',
  },
  {
    id: 'sudden_death',
    name: 'Overdrive Sudden Death',
    shortLabel: 'OVERDRIVE',
    badgeColor: '#f97316',
    description: 'Spawn 100% Awakened with 100% Domain Gauge and halved cooldowns inside an active shrinking storm ring!',
    playersHint: 'Max Chaos',
  },
];

export const GAME_MODE_BY_ID: Record<GameModeId, GameModeSpec> = Object.fromEntries(
  GAME_MODES.map((m) => [m.id, m])
) as Record<GameModeId, GameModeSpec>;

export interface DomainCastState {
  id: string;
  casterId: string;
  ownerName: string;
  fighterId: FighterId;
  domainName: string;
  centerX: number;
  centerZ: number;
  radius: number;
  elapsed: number;
  duration: number;
  phase: 'escape_window' | 'sealed_cancelable' | 'building';
  primaryHex: number;
  secondaryHex: number;
}

export interface DomainKhenCloneState {
  id: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  actionState: 'idle' | 'move' | 'dash' | 'attack' | 'skill' | 'ultimate';
  swingTimer: number;
}

export interface DomainJmWebLineState {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  life: number;
  maxLife: number;
}

export interface DomainExpansionState {
  id: string;
  ownerId: string;
  ownerName: string;
  fighterId: FighterId;
  domainName: string;
  centerX: number;
  centerZ: number;
  radius: number;
  remaining: number;
  duration: number;
  sureHitTimer: number;
  primaryHex: number;
  secondaryHex: number;
  jackpotActive?: boolean;
  jackpotHits?: number;
  trappedIds?: string[];
  khenClones?: DomainKhenCloneState[];
  jmWebLines?: DomainJmWebLineState[];
}

export interface DomainClashState {
  id: string;
  p1Id: string;
  p2Id: string;
  p1Name: string;
  p2Name: string;
  p1FighterId: FighterId;
  p2FighterId: FighterId;
  p1DomainName: string;
  p2DomainName: string;
  balance: number; // -1 (P1 dominates) .. +1 (P2 dominates)
  p1Mashes: number;
  p2Mashes: number;
  p1Damage: number;
  p2Damage: number;
  centerX: number;
  centerZ: number;
  radius: number;
  remaining: number;
  duration: number;
}

export interface KothZoneState {
  x: number;
  z: number;
  radius: number;
  shiftRemaining: number;
  scores: Record<string, number>;
  controllerId?: string | null;
  controllerName?: string | null;
  controllerTeam?: TeamId | null;
  contested?: boolean;
}

export type AbilityAimKind = 'none' | 'point' | 'line' | 'cone' | 'arc';
export type AimKind = AbilityAimKind;
export type ArenaZoneKind =
  | 'galeSnare'
  | 'moltenFissure'
  | 'solarTripwire'
  | 'voidAnchor'
  | 'voidDecoy'
  | 'solarSanctuary'
  | 'maelstromTornado'
  | 'cat5Typhoon'
  | 'magmaBranch'
  | 'shadowRift'
  | 'divineNova'
  | 'icePillarNova'
  | 'khenDomain'
  | 'typhoonUltimate'
  | 'meteorCrater'
  | 'lavaPool'
  | 'sandRelic'
  | 'gravityVortex'
  | 'cryoMist';
export type TelegraphKind = 'circle' | 'line' | 'cone';
export type ChannelKind =
  | 'jm_kamehameha'
  | 'jm_kamehameha_charge'
  | 'jm_nova_slam'
  | 'jm_sky_uppercut'
  | 'jm_sky_peak'
  | 'jm_sky_finisher'
  | 'jm_air_barrage'
  | 'khen_domain'
  | 'damen_arsenal'
  | 'marjohn_typhoon'
  | 'prime_meteor'
  | 'prime_asura_slams'
  | 'jm_judgement_cast';

export interface AbilitySpec {
  slot: AbilitySlot;
  name: string;
  role: 'Attack' | 'Guard' | 'Dash' | 'Skill' | 'Ultimate' | 'Awakening';
  shortDesc: string;
  cooldown: number; // seconds
  manaCost: number; // Chi cost
  staminaCost: number; // Tactical Stamina cost
  duration: number; // seconds
  windup: number; // seconds before hit triggers
  whiffRecovery: number; // extra vulnerability duration if missed
  damage: number;
  staggerDamage: number;
  range: number;
  arcCos: number; // dot product threshold for directional hit (-1 = 360°)
  knockback: number;
  keyHint: string;
  aimKind?: AbilityAimKind;
  aimRange?: number;
  aimRadius?: number;
  stage2Label?: string;
  holdAimLabel?: string;
  actionTag?: string;
}

export interface PassiveSpec {
  name: string;
  shortDesc: string;
  frenzyBonus: string;
}

export interface M1ComboSpec {
  stepNames: string[];
  heavyFinisherName: string;
  aerialName?: string;
  rangeIdentity: 'Close Brawler' | 'Mid Duelist' | 'Long Marksman' | 'Blink Assassin' | 'Counter Striker';
}

export interface ComboLinkSpec {
  triggerName: string;
  hint: string;
  bonusDamage: number;
  bonusStagger: number;
}

export interface FighterSpec {
  id: FighterId;
  name: string;
  title: string;
  role: string;
  color: string;
  hex: number;
  moveSpeed: number;
  maxHp: number;
  maxMana: number;
  maxStamina: number;
  stats: {
    power: number; // 1-10
    speed: number; // 1-10
    defense: number; // 1-10
  };
  koStyle: EliminationStyle;
  passive: PassiveSpec;
  m1Combo: M1ComboSpec;
  comboLink: ComboLinkSpec;
  abilities: [AbilitySpec, AbilitySpec, AbilitySpec, AbilitySpec, AbilitySpec];
}

export type ObstacleVariant =
  | 'convenience'
  | 'subway'
  | 'vending'
  | 'bus'
  | 'overpass'
  | 'rooftop'
  | 'boulder'
  | 'spire'
  | 'stepPlatform'
  | 'woodBridge'
  | 'shrine'
  | 'column'
  | 'barricade'
  | 'monolith'
  | 'crate'
  | 'buildingWall'
  | 'sandBlock';

export interface MapObstacle {
  id: string;
  kind: 'building' | 'pillar' | 'bridge' | 'wall' | 'platform';
  variant?: ObstacleVariant;
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  topY: number;
  colorHex: number;
  roofColorHex: number;
  destructible?: boolean;
  maxHp?: number;
}

export interface ObstacleState extends MapObstacle {
  hp: number;
  maxHp: number;
  destroyed: boolean;
}

export type ArenaPickupKind = 'health' | 'mana' | 'strength';

export interface PickupSpawn {
  id: string;
  kind: ArenaPickupKind;
  x: number;
  z: number;
  y?: number;
  onPodium?: boolean;
}

export type TacticalItemKind =
  | 'shock_grenade'
  | 'cryo_capsule'
  | 'gravity_vortex'
  | 'crimson_elixir'
  | 'gale_boots'
  | 'aegis_shard';

export interface TacticalItemSpec {
  kind: TacticalItemKind;
  name: string;
  shortLabel: string;
  category: 'throwable' | 'buff';
  description: string;
  color: string;
  colorHex: number;
  range?: number;
  radius?: number;
}

export const TACTICAL_ITEMS: TacticalItemSpec[] = [
  {
    kind: 'shock_grenade',
    name: 'Seismic Shock Grenade',
    shortLabel: 'SHOCK GRENADE',
    category: 'throwable',
    description: 'Launches enemies away and shatters nearby destructible cover on impact.',
    color: '#f97316',
    colorHex: 0xf97316,
    range: 14.5,
    radius: 4.5,
  },
  {
    kind: 'cryo_capsule',
    name: 'Cryo Flash Capsule',
    shortLabel: 'CRYO CAPSULE',
    category: 'throwable',
    description: 'Slows enemies by 45% for 3s and freezes water tiles into slick ice.',
    color: '#38bdf8',
    colorHex: 0x38bdf8,
    range: 14.5,
    radius: 4.8,
  },
  {
    kind: 'gravity_vortex',
    name: 'Gravity Vortex Canister',
    shortLabel: 'VORTEX CANISTER',
    category: 'throwable',
    description: 'Pulls nearby enemies inward toward its center for 1.5s for combo setups.',
    color: '#a855f7',
    colorHex: 0xa855f7,
    range: 14.5,
    radius: 5.2,
  },
  {
    kind: 'crimson_elixir',
    name: 'Crimson Might Elixir',
    shortLabel: 'CRIMSON ELIXIR',
    category: 'buff',
    description: 'One-time consume: Permanent +12% Damage boost for the current match.',
    color: '#f43f5e',
    colorHex: 0xf43f5e,
  },
  {
    kind: 'gale_boots',
    name: 'Gale Stride Boots',
    shortLabel: 'GALE BOOTS',
    category: 'buff',
    description: 'One-time consume: Permanent +1.5 Move Speed & 15% faster Dash cooldown.',
    color: '#2dd4bf',
    colorHex: 0x2dd4bf,
  },
  {
    kind: 'aegis_shard',
    name: 'Aegis Core Shard',
    shortLabel: 'AEGIS SHARD',
    category: 'buff',
    description: 'One-time consume: Permanent +20% Max HP & instant 35% Max HP heal.',
    color: '#facc15',
    colorHex: 0xfacc15,
  },
];

export const TACTICAL_ITEMS_BY_KIND: Record<TacticalItemKind, TacticalItemSpec> = Object.fromEntries(
  TACTICAL_ITEMS.map((item) => [item.kind, item])
) as Record<TacticalItemKind, TacticalItemSpec>;

export interface ArenaItemDrop {
  id: string;
  kind: TacticalItemKind;
  x: number;
  y: number;
  z: number;
  active: boolean;
  magnetTargetId?: string | null;
}

export interface FrozenWaterZone {
  id: string;
  x: number;
  z: number;
  radius: number;
  remaining: number;
  maxDuration: number;
}

export interface TempleNpcState {
  active: boolean;
  hostile: boolean;
  defeated: boolean;
  awakeningDropped: boolean;
  x: number;
  y: number;
  z: number;
  rotY: number;
  hp: number;
  maxHp: number;
  fighterId: FighterId;
  skinId: SkinId;
  challengerId?: string | null;
  actorId?: string | null;
}

export interface MapSpec {
  id: MapId;
  name: string;
  subtitle: string;
  accentColor: string;
  skyHex: number;
  fogHex: number;
  arenaRadius: number;
  description: string;
}

export const FIGHTERS: FighterSpec[] = [
  {
    id: 'marjohn',
    name: 'MARJOHN',
    title: 'Azure Wind',
    role: 'Wind Staff Duelist',
    color: '#38bdf8',
    hex: 0x38bdf8,
    moveSpeed: 7,
    maxHp: 124,
    maxMana: 100,
    maxStamina: 100,
    stats: { power: 7, speed: 7, defense: 7 },
    koStyle: 'collapse',
    passive: {
      name: 'Gale Drift',
      shortDesc: 'Faster strafe speed, agile mid-air steering, and slower falling while spacing tornadoes.',
      frenzyBonus: 'Wind strikes arc wider and conduct lightning through Water zones.',
    },
    m1Combo: {
      stepNames: ['Tornado Poke'],
      heavyFinisherName: 'Tornado Poke',
      rangeIdentity: 'Mid Duelist',
    },
    comboLink: {
      triggerName: 'GALE TYPHOON LINK',
      hint: 'Cloud Vault (1) → Cyclone Vortex (2)',
      bonusDamage: 12,
      bonusStagger: 20,
    },
    abilities: [
      {
        slot: 0,
        name: 'Tornado Poke',
        role: 'Attack',
        shortDesc: 'Fires a high-velocity mid-range mini-tornado every 0.9s. Hold-Drag M1 to swipe-aim!',
        cooldown: 0.9,
        manaCost: 0,
        staminaCost: 8,
        duration: 0.24,
        windup: 0.08,
        whiffRecovery: 0.22,
        damage: 14,
        staggerDamage: 16,
        range: 8.6,
        arcCos: 0.5,
        knockback: 4.5,
        keyHint: 'M1',
      },
      {
        slot: 1,
        name: 'Zephyr Parry',
        role: 'Guard',
        shortDesc: 'Parry beats Strikes (0.26s window) for +28 Chi & Stamina. Weak to Grab!',
        cooldown: 1.2,
        manaCost: 0,
        staminaCost: 12,
        duration: 0.58,
        windup: 0.0,
        whiffRecovery: 0.2,
        damage: 0,
        staggerDamage: 0,
        range: 2.8,
        arcCos: -1,
        knockback: 7.5,
        keyHint: 'F',
      },
      {
        slot: 2,
        name: 'Cloud Vault',
        role: 'Skill',
        shortDesc: 'Vault skyward and slam down with a cyclone shockwave. Hold-Drag to aim landing!',
        cooldown: 5.0,
        manaCost: 20,
        staminaCost: 18,
        duration: 0.44,
        windup: 0.22,
        whiffRecovery: 0.36,
        damage: 23,
        staggerDamage: 26,
        range: 4.0,
        arcCos: -1,
        knockback: 8.5,
        keyHint: '1',
        aimKind: 'point',
        aimRange: 8.5,
        aimRadius: 3.4,
        holdAimLabel: 'Vault Slam',
        actionTag: 'Vault · Wind Slam',
      },
      {
        slot: 3,
        name: 'Cyclone Vortex',
        role: 'Skill',
        shortDesc: 'Tap: 360° vortex. Hold-Drag: Plant Gale Snare Trap -> Stage 2 Skyburst Launch!',
        cooldown: 5.4,
        manaCost: 26,
        staminaCost: 20,
        duration: 0.48,
        windup: 0.26,
        whiffRecovery: 0.44,
        damage: 26,
        staggerDamage: 30,
        range: 4.8,
        arcCos: -1,
        knockback: 9.0,
        keyHint: '2',
        aimKind: 'point',
        aimRange: 9.5,
        aimRadius: 3.4,
        stage2Label: 'SKYBURST',
        holdAimLabel: 'Gale Snare',
        actionTag: '360° Pull · Trap',
      },
      {
        slot: 4,
        name: 'Tempest Typhoon',
        role: 'Ultimate',
        shortDesc: 'Hold-Drag aims telegraphed storm funnel before wind-shear typhoon. Clash-able!',
        cooldown: 11.5,
        manaCost: 58,
        staminaCost: 28,
        duration: 0.74,
        windup: 0.42,
        whiffRecovery: 0.58,
        damage: 42,
        staggerDamage: 48,
        range: 5.8,
        arcCos: -1,
        knockback: 14.5,
        keyHint: '3',
        aimKind: 'point',
        aimRange: 8.5,
        aimRadius: 4.8,
        holdAimLabel: 'Storm Eye',
        actionTag: 'Storm Funnel · AoE',
      },
    ],
  },
  {
    id: 'prime',
    name: 'PRIME',
    title: 'Crimson Blaze',
    role: 'Heavy Brawler',
    color: '#f43f5e',
    hex: 0xf43f5e,
    moveSpeed: 10,
    maxHp: 138,
    maxMana: 100,
    maxStamina: 100,
    stats: { power: 10, speed: 10, defense: 9 },
    koStyle: 'launch',
    passive: {
      name: 'Juggernaut Armor',
      shortDesc: 'Super Armor during 4th-hit Ground Slam wind-up + 15% reduced knockback taken.',
      frenzyBonus: 'Molten hide resists 40% Lava burn and erupts steam bursts in Water.',
    },
    m1Combo: {
      stepNames: ['Heavy Punch', 'Heavy Cross', 'Magma Hook', 'Ground Slam'],
      heavyFinisherName: 'AoE Ground Slam',
      rangeIdentity: 'Close Brawler',
    },
    comboLink: {
      triggerName: 'METEOR DETONATION',
      hint: 'Crater Slam (2) → Meteor Charge (1)',
      bonusDamage: 12,
      bonusStagger: 22,
    },
    abilities: [
      {
        slot: 0,
        name: 'Juggernaut 4-Hit',
        role: 'Attack',
        shortDesc: 'Fast 0.42s melee rush: 3 Heavy Punches into an armored AoE Ground Slam shockwave.',
        cooldown: 0.42,
        manaCost: 0,
        staminaCost: 8,
        duration: 0.22,
        windup: 0.06,
        whiffRecovery: 0.22,
        damage: 11,
        staggerDamage: 15,
        range: 3.25,
        arcCos: 0.2,
        knockback: 4.8,
        keyHint: 'M1',
      },
      {
        slot: 1,
        name: 'Iron Guard',
        role: 'Guard',
        shortDesc: 'Braced crimson guard & 0.26s Parry counter. Weak to Grab!',
        cooldown: 1.3,
        manaCost: 0,
        staminaCost: 12,
        duration: 0.6,
        windup: 0.0,
        whiffRecovery: 0.22,
        damage: 0,
        staggerDamage: 0,
        range: 2.7,
        arcCos: -1,
        knockback: 6.8,
        keyHint: 'F',
      },
      {
        slot: 2,
        name: 'Meteor Charge',
        role: 'Skill',
        shortDesc: 'Blazing bull-rush shoulder tackle. Crossing Molten Fissure triggers Steam Blast!',
        cooldown: 5.5,
        manaCost: 20,
        staminaCost: 18,
        duration: 0.52,
        windup: 0.24,
        whiffRecovery: 0.4,
        damage: 20,
        staggerDamage: 28,
        range: 3.2,
        arcCos: 0.2,
        knockback: 10.8,
        keyHint: '1',
        aimKind: 'line',
        aimRange: 7.8,
        aimRadius: 2.2,
        holdAimLabel: 'Charge Lane',
        actionTag: 'Blaze · Bull Rush',
      },
      {
        slot: 3,
        name: 'Crater Slam',
        role: 'Skill',
        shortDesc: 'Stage 1: Magma Uppercut. Stage 2 / Hold-Drag: Aimed Slam leaving Molten Fissure!',
        cooldown: 6.0,
        manaCost: 24,
        staminaCost: 20,
        duration: 0.56,
        windup: 0.26,
        whiffRecovery: 0.6,
        damage: 21,
        staggerDamage: 28,
        range: 4.8,
        arcCos: -1,
        knockback: 10.2,
        keyHint: '2',
        aimKind: 'point',
        aimRange: 8.2,
        aimRadius: 3.8,
        stage2Label: 'SLAM',
        holdAimLabel: 'Molten Pool',
        actionTag: 'Leap · Lava Zone',
      },
      {
        slot: 4,
        name: 'Avalanche Blow',
        role: 'Ultimate',
        shortDesc: 'Hold-Drag aims telegraphed Meteor Impact circle before crushing down!',
        cooldown: 13.0,
        manaCost: 56,
        staminaCost: 28,
        duration: 0.82,
        windup: 0.46,
        whiffRecovery: 0.72,
        damage: 35,
        staggerDamage: 46,
        range: 4.8,
        arcCos: -1,
        knockback: 16.5,
        keyHint: '3',
        aimKind: 'point',
        aimRange: 7.8,
        aimRadius: 4.4,
        holdAimLabel: 'Meteor Zone',
        actionTag: 'Meteor · Impact',
      },
    ],
  },
  {
    id: 'damen',
    name: 'DAMEN',
    title: 'Golden Outlaw',
    role: 'Gunslinger & Shield',
    color: '#f59e0b',
    hex: 0xf59e0b,
    moveSpeed: 7,
    maxHp: 122,
    maxMana: 100,
    maxStamina: 100,
    stats: { power: 8, speed: 7, defense: 6 },
    koStyle: 'shatter',
    passive: {
      name: 'Quick-Draw Step',
      shortDesc: 'Gun hits grant 1.5s speed boost and reduce Dash cooldown by 0.35s.',
      frenzyBonus: 'Elevated plateaus and rooftops grant Deadeye crit range advantage.',
    },
    m1Combo: {
      stepNames: ['Quickdraw Shot'],
      heavyFinisherName: 'Quickdraw Shot',
      rangeIdentity: 'Mid Duelist',
    },
    comboLink: {
      triggerName: 'BOUNTY EXECUTE',
      hint: 'Solar Lasso (2) → Outlaw Roll (1)',
      bonusDamage: 14,
      bonusStagger: 22,
    },
    abilities: [
      {
        slot: 0,
        name: 'Outlaw Revolver',
        role: 'Attack',
        shortDesc: 'Measured mid-range revolver shot (max ~9.8m, 0.8s CD). Hold-Drag M1 to swipe-aim!',
        cooldown: 0.8,
        manaCost: 0,
        staminaCost: 8,
        duration: 0.26,
        windup: 0.08,
        whiffRecovery: 0.24,
        damage: 11,
        staggerDamage: 13,
        range: 9.8,
        arcCos: 0.85,
        knockback: 3.2,
        keyHint: 'M1',
      },
      {
        slot: 1,
        name: 'Golden Aegis',
        role: 'Guard',
        shortDesc: 'Hold golden shield or time 0.26s Parry. Weak to Grab!',
        cooldown: 1.2,
        manaCost: 0,
        staminaCost: 11,
        duration: 0.65,
        windup: 0.0,
        whiffRecovery: 0.2,
        damage: 0,
        staggerDamage: 0,
        range: 2.8,
        arcCos: -1,
        knockback: 7.2,
        keyHint: 'F',
      },
      {
        slot: 2,
        name: 'Outlaw Roll',
        role: 'Skill',
        shortDesc: 'Crisp evasive roll into a 3-round Deadeye Fan Shot (scaled multi-hit). Hold-Drag to aim!',
        cooldown: 5.4,
        manaCost: 20,
        staminaCost: 14,
        duration: 0.42,
        windup: 0.2,
        whiffRecovery: 0.3,
        damage: 16,
        staggerDamage: 20,
        range: 11.4,
        arcCos: 0.72,
        knockback: 6.4,
        keyHint: '1',
        aimKind: 'line',
        aimRange: 10.5,
        aimRadius: 2.1,
        holdAimLabel: 'Deadeye Shot',
        actionTag: 'Roll · Deadeye Shot',
      },
      {
        slot: 3,
        name: 'Solar Lasso',
        role: 'Skill',
        shortDesc: 'Tap: Fast wide-snare pull lasso. Hold-Drag: Plant wide electrified Solar Tripwire!',
        cooldown: 5.4,
        manaCost: 22,
        staminaCost: 16,
        duration: 0.42,
        windup: 0.18,
        whiffRecovery: 0.36,
        damage: 18,
        staggerDamage: 24,
        range: 13.5,
        arcCos: 0.78,
        knockback: -11.0,
        keyHint: '2',
        aimKind: 'point',
        aimRange: 11.5,
        aimRadius: 3.2,
        holdAimLabel: 'Tripwire',
        actionTag: 'Pull · Tripwire',
      },
      {
        slot: 4,
        name: 'High Noon Fan',
        role: 'Ultimate',
        shortDesc: 'Quick-lock wide 7-shot High Noon barrage cone (capped burst). Hold-Drag to sweep target zone!',
        cooldown: 12.0,
        manaCost: 56,
        staminaCost: 24,
        duration: 0.62,
        windup: 0.32,
        whiffRecovery: 0.48,
        damage: 16,
        staggerDamage: 16,
        range: 14.5,
        arcCos: 0.45,
        knockback: 8.0,
        keyHint: '3',
        aimKind: 'cone',
        aimRange: 14.0,
        aimRadius: 0.46,
        holdAimLabel: 'Noon Cone',
        actionTag: 'Cone Barrage · AoE',
      },
    ],
  },
  {
    id: 'khen',
    name: 'KHEN',
    title: 'Arcane Violet',
    role: 'Void Assassin',
    color: '#a855f7',
    hex: 0xa855f7,
    moveSpeed: 9,
    maxHp: 116,
    maxMana: 100,
    maxStamina: 100,
    stats: { power: 8, speed: 9, defense: 6 },
    koStyle: 'dissolve',
    passive: {
      name: 'Shadow Backstab',
      shortDesc: '+20% bonus damage from behind; 4th-hit Dash Lunge grants a burst of speed.',
      frenzyBonus: 'Ambush strikes out of tall grass & steam trigger instant backstab bonuses.',
    },
    m1Combo: {
      stepNames: ['Dagger Slash', 'Twin Rend', 'Rift Slice', 'Dash Lunge'],
      heavyFinisherName: 'Void Dash Lunge',
      rangeIdentity: 'Blink Assassin',
    },
    comboLink: {
      triggerName: 'VOID MIRAGE LINK',
      hint: 'Shadow Blink (1) → Crescent Wave (2)',
      bonusDamage: 13,
      bonusStagger: 22,
    },
    abilities: [
      {
        slot: 0,
        name: 'Void 4-Hit Daggers',
        role: 'Attack',
        shortDesc: 'Fast 0.42s per hit: 3 Dagger Slashes into a Damaging Dash Lunge that slices through.',
        cooldown: 0.42,
        manaCost: 0,
        staminaCost: 7,
        duration: 0.22,
        windup: 0.06,
        whiffRecovery: 0.2,
        damage: 9,
        staggerDamage: 13,
        range: 3.15,
        arcCos: 0.2,
        knockback: 3.6,
        keyHint: 'M1',
      },
      {
        slot: 1,
        name: 'Arcane X-Parry',
        role: 'Guard',
        shortDesc: 'Cross-dagger guard & 0.26s Parry counter. Weak to Grab!',
        cooldown: 1.2,
        manaCost: 0,
        staminaCost: 12,
        duration: 0.56,
        windup: 0.0,
        whiffRecovery: 0.2,
        damage: 0,
        staggerDamage: 0,
        range: 2.7,
        arcCos: -1,
        knockback: 8.5,
        keyHint: 'F',
      },
      {
        slot: 2,
        name: 'Shadow Blink',
        role: 'Skill',
        shortDesc: 'Void warp leaving an explosive Void Decoy and slicing arrival point. Hold-Drag aims!',
        cooldown: 5.5,
        manaCost: 20,
        staminaCost: 16,
        duration: 0.46,
        windup: 0.28,
        whiffRecovery: 0.36,
        damage: 16,
        staggerDamage: 22,
        range: 3.2,
        arcCos: -1,
        knockback: 7.0,
        keyHint: '1',
        aimKind: 'point',
        aimRange: 8.5,
        aimRadius: 2.8,
        holdAimLabel: 'Void Warp',
        actionTag: 'Warp · Void Decoy',
      },
      {
        slot: 3,
        name: 'Crescent Wave',
        role: 'Skill',
        shortDesc: 'Stage 1: Fires blade leaving Void Anchor. Stage 2: Shadow Swap! Hold-Drag: Silence Trap.',
        cooldown: 5.4,
        manaCost: 26,
        staminaCost: 18,
        duration: 0.48,
        windup: 0.28,
        whiffRecovery: 0.48,
        damage: 20,
        staggerDamage: 24,
        range: 13.5,
        arcCos: 0.8,
        knockback: 6.5,
        keyHint: '2',
        aimKind: 'point',
        aimRange: 11.5,
        aimRadius: 2.8,
        stage2Label: 'SWAP',
        holdAimLabel: 'Void Trap',
        actionTag: 'Blade · Void Swap',
      },
      {
        slot: 4,
        name: 'Phantom Blitz',
        role: 'Ultimate',
        shortDesc: 'Hold-Drag aims telegraphed Void X-Corridor before high-speed void flurry!',
        cooldown: 11.5,
        manaCost: 58,
        staminaCost: 28,
        duration: 0.78,
        windup: 0.42,
        whiffRecovery: 0.65,
        damage: 36,
        staggerDamage: 48,
        range: 9.5,
        arcCos: 0.1,
        knockback: 12.5,
        keyHint: '3',
        aimKind: 'line',
        aimRange: 9.5,
        aimRadius: 2.2,
        holdAimLabel: 'Void Lane',
        actionTag: 'Void Corridor · Slash',
      },
    ],
  },
  {
    id: 'jm',
    name: 'JM',
    title: 'Golden Sovereign',
    role: 'Solar Martial Artist',
    color: '#facc15',
    hex: 0xfacc15,
    moveSpeed: 9,
    maxHp: 126,
    maxMana: 100,
    maxStamina: 100,
    stats: { power: 9, speed: 9, defense: 7 },
    koStyle: 'collapse',
    passive: {
      name: 'Sky Flight',
      shortDesc: 'Press R to toggle Sky Flight up to 7s (10s CD). Aim skills down & fire golden bolts!',
      frenzyBonus: 'Solar aura grants bonus Chi surge atop temples, bridges, and high ground.',
    },
    m1Combo: {
      stepNames: ['Solar Strike', 'Cross Kick', 'Solar Crescent', 'Dash Finisher'],
      heavyFinisherName: 'Dash Punch Shockwave',
      aerialName: 'Solar Air Bolt',
      rangeIdentity: 'Counter Striker',
    },
    comboLink: {
      triggerName: 'SOVEREIGN METEOR',
      hint: 'Flash Step (1) → M1 x3 → Rising Kick (2) → Heel Drop (2)',
      bonusDamage: 14,
      bonusStagger: 28,
    },
    abilities: [
      {
        slot: 0,
        name: 'Sovereign 4-Hit',
        role: 'Attack',
        shortDesc: 'Hits 1–3 cancel cleanly into Flash Step (1), Skill 2 (2), or Dash (Q)! Hit 4 triggers crater Dash Punch.',
        cooldown: 0.42,
        manaCost: 0,
        staminaCost: 7,
        duration: 0.22,
        windup: 0.06,
        whiffRecovery: 0.22,
        damage: 10,
        staggerDamage: 14,
        range: 3.35,
        arcCos: 0.2,
        knockback: 4.2,
        keyHint: 'M1',
      },
      {
        slot: 1,
        name: 'Dragon Counter',
        role: 'Guard',
        shortDesc: '0.26s Parry blinks JM behind the attacker in slow-mo stun & resets Flash Step (1) cooldown!',
        cooldown: 1.2,
        manaCost: 0,
        staminaCost: 12,
        duration: 0.6,
        windup: 0.0,
        whiffRecovery: 0.2,
        damage: 12,
        staggerDamage: 24,
        range: 3.1,
        arcCos: -1,
        knockback: 1.5,
        keyHint: 'F',
      },
      {
        slot: 2,
        name: 'Flash Step',
        role: 'Skill',
        shortDesc: 'Stagger dash leaving hit foe right in front of JM for a full M1 combo. Hold-Drag aims corridor!',
        cooldown: 5.5,
        manaCost: 20,
        staminaCost: 18,
        duration: 0.44,
        windup: 0.22,
        whiffRecovery: 0.34,
        damage: 17,
        staggerDamage: 24,
        range: 7.5,
        arcCos: 0.2,
        knockback: 0.6,
        keyHint: '1',
        aimKind: 'line',
        aimRange: 7.5,
        aimRadius: 2.2,
        holdAimLabel: 'Flash Lane',
        actionTag: 'Blink · Stagger Palm',
      },
      {
        slot: 3,
        name: 'Rising Kick / Heel Drop',
        role: 'Skill',
        shortDesc: 'Stage 1: Rising Dragon Kick launches foe skyward. Recast / Air Tap: Meteor Heel Drop ground-bounce! Hold-Drag: Sanctuary.',
        cooldown: 5.5,
        manaCost: 26,
        staminaCost: 20,
        duration: 0.5,
        windup: 0.22,
        whiffRecovery: 0.48,
        damage: 23,
        staggerDamage: 30,
        range: 4.4,
        arcCos: -1,
        knockback: 5.5,
        keyHint: '2',
        aimKind: 'point',
        aimRange: 8.5,
        aimRadius: 3.5,
        stage2Label: 'HEEL DROP',
        holdAimLabel: 'Sanctuary',
        actionTag: 'Launch · Heel Bounce',
      },
      {
        slot: 4,
        name: 'Solar Dragon Beam',
        role: 'Ultimate',
        shortDesc: 'Twin-spiral golden-cyan beam wrapped in wind ribbons that carves a V-shaped ground trench!',
        cooldown: 12.5,
        manaCost: 58,
        staminaCost: 30,
        duration: 0.94,
        windup: 0.44,
        whiffRecovery: 0.72,
        damage: 38,
        staggerDamage: 46,
        range: 16.0,
        arcCos: 0.75,
        knockback: 15.5,
        keyHint: '3',
        aimKind: 'line',
        aimRange: 14.5,
        aimRadius: 2.3,
        holdAimLabel: 'Beam Lane',
        actionTag: 'V-Trench · Dragon Beam',
      },
    ],
  },
];

export const JM_SECRET_ABILITY: AbilitySpec = {
  slot: 5,
  name: 'Solar Meteor',
  role: 'Ultimate',
  shortDesc: 'Ascend into the sky, charge a giant yellow fireball, aim the blast zone & rain detonation!',
  cooldown: 16.0,
  manaCost: 48,
  staminaCost: 22,
  duration: 1.65,
  windup: 1.28,
  whiffRecovery: 0.6,
  damage: 44,
  staggerDamage: 58,
  range: 6.2,
  arcCos: -1,
  knockback: 17.5,
  keyHint: 'O / 6',
  aimKind: 'point',
  aimRange: 17.5,
  aimRadius: 6.2,
  holdAimLabel: 'Solar Meteor',
  actionTag: 'Sky Meteor · Aim',
};

export function isJtinsullenTag(name: string | undefined | null): boolean {
  return (name ?? '').trim().toLowerCase() === 'jtinsullen';
}

export const FIGHTER_BY_ID: Record<FighterId, FighterSpec> = Object.fromEntries(
  FIGHTERS.map((f) => [f.id, f])
) as Record<FighterId, FighterSpec>;

export interface FighterSkinMeta {
  id: SkinId;
  name: string;
  tierLabel: string;
  tagline: string;
  accentColor: string;
}

export const SKIN_ORDER: SkinId[] = ['classic', 'special', 'ascended'];

export const SKIN_LABELS: Record<SkinId, string> = {
  classic: 'DEFAULT',
  special: 'SPECIAL',
  ascended: '★ ASCENDED',
};

export const FIGHTER_SKINS: Record<FighterId, Record<SkinId, FighterSkinMeta>> = {
  marjohn: {
    classic: {
      id: 'classic',
      name: 'Calamity Wind Duelist',
      tierLabel: 'DEFAULT',
      tagline: 'Slate-and-seafoam wind-duelist haori coat, billowing mist-white scarf & Storm Halberd',
      accentColor: '#2dd4bf',
    },
    special: {
      id: 'special',
      name: 'Street Beggar',
      tierLabel: 'SPECIAL',
      tagline: 'Patched tattered rags, crooked frayed straw hat, scrap broom polearm & Garbage Tornadoes',
      accentColor: '#a3a3a3',
    },
    ascended: {
      id: 'ascended',
      name: 'Tempest Ronin',
      tierLabel: '★ ASCENDED',
      tagline: 'Storm-blue & gold thunder-god armor, electrified kasa hat, lightning Naginata & Storm Turret (5)',
      accentColor: '#38bdf8',
    },
  },
  prime: {
    classic: {
      id: 'classic',
      name: 'Crimson Juggernaut',
      tierLabel: 'DEFAULT',
      tagline: 'Crimson-dark armored brawler gauntlets, spiked pauldrons & furnace chest core',
      accentColor: '#f43f5e',
    },
    special: {
      id: 'special',
      name: 'Sad Boy Emo',
      tierLabel: 'SPECIAL',
      tagline: 'Oversized charcoal hoodie up, swept bangs over one eye, chained fists & personal raincloud',
      accentColor: '#60a5fa',
    },
    ascended: {
      id: 'ascended',
      name: 'Asura God',
      tierLabel: '★ ASCENDED',
      tagline: '4-armed obsidian & magma titan, skull plates, horned demon crown & Volcano Turret Slams (5)',
      accentColor: '#fb7185',
    },
  },
  damen: {
    classic: {
      id: 'classic',
      name: 'High Noon Outlaw',
      tierLabel: 'DEFAULT',
      tagline: 'Wide-brimmed hat, swaying crimson-amber duster trench & dual revolvers',
      accentColor: '#f59e0b',
    },
    special: {
      id: 'special',
      name: 'Obsidian Emo',
      tierLabel: 'SPECIAL',
      tagline: 'Pitch-black duster coat & hat, bandana mask, glowing silver-white eyes & jet-black ballistics',
      accentColor: '#94a3b8',
    },
    ascended: {
      id: 'ascended',
      name: 'Solar Outlaw',
      tierLabel: '★ ASCENDED',
      tagline: 'Continuously hovers in sun-gold armor with orbiting halo firearms & 3 Solar Gun Turrets (5)',
      accentColor: '#fbbf24',
    },
  },
  khen: {
    classic: {
      id: 'classic',
      name: 'Void Phantom',
      tierLabel: 'DEFAULT',
      tagline: 'Hooded violet cloak, neon visor, jagged mantle & dual shadow blades',
      accentColor: '#a855f7',
    },
    special: {
      id: 'special',
      name: 'GM & Khen Duo',
      tierLabel: 'SPECIAL',
      tagline: 'Violet-black armored Khen paired with a solid glowing cyan-gold GM spirit partner in tandem',
      accentColor: '#22d3ee',
    },
    ascended: {
      id: 'ascended',
      name: 'Abyssal Monarch',
      tierLabel: '★ ASCENDED',
      tagline: 'Jagged obsidian-void armor, horned crown, shadow wings, Crescent Blades & Abyssal Clone Swap (5)',
      accentColor: '#c084fc',
    },
  },
  jm: {
    classic: {
      id: 'classic',
      name: 'Seraphim Martial Gi',
      tierLabel: 'DEFAULT',
      tagline: 'Golden Sovereign martial arts gi with dragon sash & gilded wraps',
      accentColor: '#facc15',
    },
    special: {
      id: 'special',
      name: 'Golden Monarch',
      tierLabel: 'SPECIAL',
      tagline: 'Imperial gold & emerald-jade dragon robes, crown-circlet & metallic gold Ki bursts',
      accentColor: '#eab308',
    },
    ascended: {
      id: 'ascended',
      name: 'Celestial Archangel',
      tierLabel: '★ ASCENDED',
      tagline: 'Luminous white & gold robes, 6 animated feathered wings, rotating halo & Judgement Spear (5)',
      accentColor: '#fde047',
    },
  },
};

export const ASCENDED_ABILITIES: Record<FighterId, AbilitySpec> = {
  marjohn: {
    slot: 7,
    name: 'Storm Tornado Turret',
    role: 'Skill',
    shortDesc: 'Ascended (5): Plants a stationary Storm Turret for 10s that spits random-direction homing mini tornadoes.',
    cooldown: 18.0,
    manaCost: 28,
    staminaCost: 16,
    duration: 0.42,
    windup: 0.16,
    whiffRecovery: 0.25,
    damage: 14,
    staggerDamage: 16,
    range: 8.5,
    arcCos: -1,
    knockback: 6.5,
    keyHint: '5',
    aimKind: 'point',
    aimRange: 8.5,
    aimRadius: 2.2,
    holdAimLabel: 'Storm Turret',
    actionTag: '10s Turret · Homing Gales',
  },
  prime: {
    slot: 7,
    name: 'Asura Volcano Eruption',
    role: 'Skill',
    shortDesc: 'Ascended (5): Executes 3 rapid seismic ground slams; the 3rd erupts a Volcano Turret firing magma boulders for 10s.',
    cooldown: 19.0,
    manaCost: 30,
    staminaCost: 18,
    duration: 1.15,
    windup: 0.14,
    whiffRecovery: 0.3,
    damage: 12,
    staggerDamage: 20,
    range: 4.8,
    arcCos: -1,
    knockback: 9.0,
    keyHint: '5',
    aimKind: 'point',
    aimRange: 6.5,
    aimRadius: 4.6,
    holdAimLabel: 'Asura Slams',
    actionTag: '3 Slams · 10s Volcano',
  },
  damen: {
    slot: 7,
    name: 'Solar Halo Turrets',
    role: 'Skill',
    shortDesc: 'Ascended (5): Summons 3 golden gun turrets hovering above Damen for 10s that auto-track & rapid-fire nearest foe.',
    cooldown: 18.0,
    manaCost: 28,
    staminaCost: 16,
    duration: 0.38,
    windup: 0.12,
    whiffRecovery: 0.2,
    damage: 8,
    staggerDamage: 10,
    range: 16.0,
    arcCos: -1,
    knockback: 2.8,
    keyHint: '5',
    aimKind: 'none',
    holdAimLabel: 'Solar Halo',
    actionTag: '3 Head Turrets · 10s Auto',
  },
  khen: {
    slot: 7,
    name: 'Abyssal Clone & Swap',
    role: 'Skill',
    shortDesc: 'Ascended (5): Summons an Abyssal Clone (HP = Khen Max HP). Press 5 again to blink-swap! Cooldown starts on Clone death.',
    cooldown: 18.0,
    manaCost: 28,
    staminaCost: 16,
    duration: 0.34,
    windup: 0.1,
    whiffRecovery: 0.18,
    damage: 11,
    staggerDamage: 14,
    range: 12.0,
    arcCos: -1,
    knockback: 5.0,
    keyHint: '5',
    aimKind: 'point',
    aimRange: 9.0,
    aimRadius: 1.8,
    holdAimLabel: 'Shadow Clone',
    actionTag: 'Clone = MaxHP · Re-Press Swap',
  },
  jm: {
    slot: 7,
    name: 'Celestial Judgement Spear',
    role: 'Skill',
    shortDesc: 'Ascended (5): Ascend, aim anywhere across the arena & hurl a giant spear that pulses map-wide terrain shockwaves for 10s.',
    cooldown: 20.0,
    manaCost: 34,
    staminaCost: 20,
    duration: 0.9,
    windup: 0.42,
    whiffRecovery: 0.35,
    damage: 20,
    staggerDamage: 26,
    range: 55.0,
    arcCos: -1,
    knockback: 11.0,
    keyHint: '5',
    aimKind: 'point',
    aimRange: 55.0,
    aimRadius: 4.5,
    holdAimLabel: 'Judgement Aim',
    actionTag: 'Full-Map · 10s Shockwaves',
  },
};

export function hasAscendedAbility(skinId?: SkinId): boolean {
  return skinId === 'ascended';
}

export function getFighterSkinMeta(fighterId: FighterId, skinId?: SkinId): FighterSkinMeta {
  const safeSkin: SkinId = skinId && SKIN_ORDER.includes(skinId) ? skinId : 'classic';
  return FIGHTER_SKINS[fighterId][safeSkin];
}

export const MAPS: MapSpec[] = [
  {
    id: 'shibuya',
    name: 'Shibuya Crossing',
    subtitle: '2-Story Enterable Shops · Skybridges · Parkour & Bullet Train',
    accentColor: '#2563eb',
    skyHex: 0xdbeafe,
    fogHex: 0xe2e8f0,
    arenaRadius: 57.0,
    description: 'Expanded Shibuya scramble center ringed by multi-story 24H Konbini, Neo Ramen, Shibuya Arcade & Metro Concourse with 2nd-floor balconies, elevated skybridge, rooftop parkour podiums, and outer Bullet Train avenue.',
  },
  {
    id: 'meadow',
    name: 'Ancient Coliseum & Catacombs',
    subtitle: 'Corner Coliseum 2F · Deep Subterranean Crypt & Oasis Causeways',
    accentColor: '#facc15',
    skyHex: 0x7dd3fc,
    fogHex: 0xfef3c7,
    arenaRadius: 57.0,
    description: 'Expanded sandstone courtyard framed by a multi-tiered Corner Ancient Coliseum with 2nd-floor spectator promenade, Deep Underground Catacombs with Relic Vault, oasis causeway bridges, and ruin pillar parkour.',
  },
  {
    id: 'temple',
    name: 'Sunken Bamboo Temple',
    subtitle: 'Multi-Tier Temple Complex · Koi Bridges · 200 HP Guardian NPC',
    accentColor: '#fb923c',
    skyHex: 0x3b1d36,
    fogHex: 0x5c243a,
    arenaRadius: 57.0,
    description: 'Expanded temple sanctuary featuring a multi-tiered Grand Shrine complex, torii avenues, koi ponds with wooden bridges, 2-story dojos with balconies, temple rafter parkour, and a guaranteed 200-HP Guardian NPC.',
  },
  {
    id: 'obsidian',
    name: 'Obsidian Volcano Peak',
    subtitle: 'Hollow Corner Volcano · Basalt Bridges · Forge 2F & Meteors',
    accentColor: '#a855f7',
    skyHex: 0x0f172a,
    fogHex: 0x1e1b4b,
    arenaRadius: 55.5,
    description: 'Expanded basalt caldera anchored by a hollow Corner Volcano Mountain with twin cavern tunnels and central magma island bridge, 2-story Blacksmith Forge, cooling basalt parkour spires, and meteor boulders.',
  },
];

export const MAP_BY_ID: Record<MapId, MapSpec> = Object.fromEntries(
  MAPS.map((m) => [m.id, m])
) as Record<MapId, MapSpec>;

const MAP_OBSTACLES: Record<MapId, MapObstacle[]> = {
  shibuya: [
    ...buildEnterableBuildingWallObstacles('shibuya'),
    { id: 'shib-bus-w', kind: 'platform', variant: 'bus', x: -19.5, z: 4.5, halfW: 2.2, halfD: 1.0, topY: 1.5, colorHex: 0x0284c7, roofColorHex: 0xf8fafc, destructible: true, maxHp: 95 },
    { id: 'shib-bus-e', kind: 'platform', variant: 'bus', x: 19.5, z: -4.5, halfW: 2.2, halfD: 1.0, topY: 1.5, colorHex: 0x2563eb, roofColorHex: 0xfef08a, destructible: true, maxHp: 95 },
    { id: 'shib-pillar-w', kind: 'pillar', variant: 'subway', x: -34.5, z: 6.5, halfW: 1.4, halfD: 1.4, topY: 4.2, colorHex: 0x94a3b8, roofColorHex: 0x38bdf8, destructible: true, maxHp: 85 },
    { id: 'shib-pillar-e', kind: 'pillar', variant: 'subway', x: 34.5, z: -6.5, halfW: 1.4, halfD: 1.4, topY: 4.2, colorHex: 0x94a3b8, roofColorHex: 0xf43f5e, destructible: true, maxHp: 85 },
  ],
  meadow: [
    ...buildEnterableBuildingWallObstacles('meadow'),
    { id: 'mead-arch-ne', kind: 'pillar', variant: 'column', x: 20.5, z: -18.5, halfW: 1.45, halfD: 1.45, topY: 3.8, colorHex: 0xd6d3d1, roofColorHex: 0xfacc15, destructible: true, maxHp: 95 },
    { id: 'mead-arch-sw', kind: 'pillar', variant: 'column', x: -20.5, z: 18.5, halfW: 1.45, halfD: 1.45, topY: 3.8, colorHex: 0xd6d3d1, roofColorHex: 0x84cc16, destructible: true, maxHp: 95 },
    { id: 'mead-plat-n', kind: 'platform', variant: 'stepPlatform', x: 0, z: -32.5, halfW: 2.8, halfD: 1.6, topY: 1.4, colorHex: 0xd6d3d1, roofColorHex: 0xfacc15, destructible: true, maxHp: 115 },
    { id: 'mead-plat-s', kind: 'platform', variant: 'stepPlatform', x: 0, z: 32.5, halfW: 2.8, halfD: 1.6, topY: 1.4, colorHex: 0xd6d3d1, roofColorHex: 0xfacc15, destructible: true, maxHp: 115 },
  ],
  temple: [
    ...buildEnterableBuildingWallObstacles('temple'),
    { id: 'temp-shrine-ne', kind: 'pillar', variant: 'column', x: 18.5, z: -18.5, halfW: 1.45, halfD: 1.45, topY: 3.8, colorHex: 0x991b1b, roofColorHex: 0xfb923c, destructible: true, maxHp: 95 },
    { id: 'temp-shrine-sw', kind: 'pillar', variant: 'column', x: -18.5, z: 18.5, halfW: 1.45, halfD: 1.45, topY: 3.8, colorHex: 0x991b1b, roofColorHex: 0xfacc15, destructible: true, maxHp: 95 },
    { id: 'temp-dais-s', kind: 'platform', variant: 'stepPlatform', x: 0, z: 32.0, halfW: 2.8, halfD: 1.5, topY: 1.4, colorHex: 0x57534e, roofColorHex: 0xfb923c, destructible: true, maxHp: 115 },
  ],
  obsidian: [
    ...buildEnterableBuildingWallObstacles('obsidian'),
    { id: 'obs-mono-nw', kind: 'pillar', variant: 'monolith', x: -15.5, z: 12.5, halfW: 1.45, halfD: 1.45, topY: 4.1, colorHex: 0x334155, roofColorHex: 0xa855f7, destructible: true, maxHp: 100 },
    { id: 'obs-mono-se', kind: 'pillar', variant: 'monolith', x: 15.5, z: -12.5, halfW: 1.45, halfD: 1.45, topY: 4.1, colorHex: 0x334155, roofColorHex: 0x38bdf8, destructible: true, maxHp: 100 },
  ],
};

// Distributed across 1st-floor interiors, 2nd-floor balconies, parkour podiums, volcano island, coliseum pit, and catacombs vault (never dead center)
const MAP_PICKUPS: Record<MapId, PickupSpawn[]> = {
  shibuya: [
    { id: 'pk-hp-1', kind: 'health', x: -22.5, z: -20.5, y: 0 }, // Inside 24H Konbini 1F
    { id: 'pk-hp-2', kind: 'health', x: 0, z: 32.5, y: 0 }, // Inside Metro Concourse 1F
    { id: 'pk-hp-3', kind: 'health', x: -33.5, z: -1.5, y: 0 }, // West avenue steam vent
    { id: 'pk-hp-4', kind: 'health', x: 24.5, z: 9.5, y: 0 }, // East water puddle flank
    { id: 'pk-mp-1', kind: 'mana', x: 22.5, z: -20.5, y: 0 }, // Inside Neo Ramen 1F
    { id: 'pk-mp-2', kind: 'mana', x: -22.5, z: -14.8, y: 3.7, onPodium: true }, // Konbini 2F Balcony Podium
    { id: 'pk-mp-3', kind: 'mana', x: -19.5, z: 4.5, y: 1.5 }, // Atop West Scramble Bus
    { id: 'pk-mp-4', kind: 'mana', x: 35.0, z: 26.4, y: 4.95, onPodium: true }, // East Parkour Tower Podium
    { id: 'pk-str-1', kind: 'strength', x: 0, z: -20.5, y: 4.35, onPodium: true }, // Mid-Skybridge Podium
    { id: 'pk-str-2', kind: 'strength', x: -22.5, z: 14.8, y: 3.7, onPodium: true }, // Arcade 2F Balcony Podium
  ],
  meadow: [
    { id: 'pk-hp-1', kind: 'health', x: -25.5, z: -24.5, y: 0.72, onPodium: true }, // Ancient Coliseum Duel Pit Podium
    { id: 'pk-hp-2', kind: 'health', x: 0, z: 32.5, y: 0 }, // South raised battlement
    { id: 'pk-hp-3', kind: 'health', x: -24.5, z: 8.5, y: 0.42 }, // West oasis causeway bridge
    { id: 'pk-hp-4', kind: 'health', x: 32.8, z: -28.2, y: 4.05, onPodium: true }, // NE Ruin Aqueduct Parkour Podium
    { id: 'pk-mp-1', kind: 'mana', x: 26.5, z: 25.5, y: 0 }, // Underground Catacombs chamber
    { id: 'pk-mp-2', kind: 'mana', x: 0, z: -32.5, y: 0 }, // North raised battlement
    { id: 'pk-mp-3', kind: 'mana', x: 24.5, z: -8.5, y: 0.42 }, // East oasis causeway bridge
    { id: 'pk-mp-4', kind: 'mana', x: -31.4, z: 29.8, y: 2.75, onPodium: true }, // SW Monolith Parkour Podium
    { id: 'pk-str-1', kind: 'strength', x: 31.5, z: 30.5, y: 0.85, onPodium: true }, // Underground Catacombs Relic Vault Podium!
    { id: 'pk-str-2', kind: 'strength', x: -14.9, z: -24.5, y: 4.1, onPodium: true }, // Coliseum 2nd-Floor Promenade Balcony!
  ],
  temple: [
    { id: 'pk-hp-1', kind: 'health', x: -25.0, z: -22.5, y: 0 }, // Bamboo Dojo 1F
    { id: 'pk-hp-2', kind: 'health', x: -24.5, z: 8.5, y: 0.48 }, // West Pagoda Koi Bridge
    { id: 'pk-hp-3', kind: 'health', x: -34.0, z: 29.0, y: 4.15, onPodium: true }, // SW Bamboo Cliff Parkour Podium
    { id: 'pk-hp-4', kind: 'health', x: 0, z: 32.0, y: 0 }, // South terrace
    { id: 'pk-mp-1', kind: 'mana', x: 25.0, z: 22.5, y: 0 }, // Lotus Sanctuary 1F
    { id: 'pk-mp-2', kind: 'mana', x: 24.5, z: -8.5, y: 0.48 }, // East Pagoda Koi Bridge
    { id: 'pk-mp-3', kind: 'mana', x: 0, z: -33.5, y: 0, onPodium: true }, // Grand Shrine Hall Altar Podium
    { id: 'pk-mp-4', kind: 'mana', x: 25.0, z: 16.8, y: 3.7, onPodium: true }, // Lotus Sanctuary 2F Balcony Podium
    { id: 'pk-str-1', kind: 'strength', x: 34.5, z: -28.1, y: 4.9, onPodium: true }, // NE Temple Rafter Parkour Podium!
    { id: 'pk-str-2', kind: 'strength', x: -25.0, z: -16.8, y: 3.7, onPodium: true }, // Bamboo Dojo 2F Balcony Podium!
  ],
  obsidian: [
    { id: 'pk-hp-1', kind: 'health', x: -25.5, z: -24.5, y: 0.55, onPodium: true }, // Hollow Volcano Central Island Podium!
    { id: 'pk-hp-2', kind: 'health', x: 22.5, z: -18.5, y: 0.52 }, // NE lava bridge
    { id: 'pk-hp-3', kind: 'health', x: 4.5, z: -31.5, y: 0 }, // North basalt ridge
    { id: 'pk-hp-4', kind: 'health', x: -32.5, z: 29.1, y: 2.8, onPodium: true }, // SW Basalt Parkour Podium
    { id: 'pk-mp-1', kind: 'mana', x: 25.5, z: 24.5, y: 0 }, // Blacksmith Forge 1F
    { id: 'pk-mp-2', kind: 'mana', x: -22.5, z: 18.5, y: 0.52 }, // SW lava bridge
    { id: 'pk-mp-3', kind: 'mana', x: -4.5, z: 31.5, y: 0 }, // South basalt ridge
    { id: 'pk-mp-4', kind: 'mana', x: 25.5, z: 18.4, y: 3.7, onPodium: true }, // Blacksmith Forge 2F Balcony Podium
    { id: 'pk-str-1', kind: 'strength', x: 33.5, z: -29.5, y: 4.05, onPodium: true }, // NE Basalt Spire Parkour Podium!
    { id: 'pk-str-2', kind: 'strength', x: -25.5, z: -21.8, y: 0.55 }, // Caldera Island South Wing!
  ],
};

export interface ItemDropSpawn {
  id: string;
  kind: TacticalItemKind;
  x: number;
  z: number;
  y?: number;
  onPodium?: boolean;
}

const MAP_ITEM_DROPS: Record<MapId, ItemDropSpawn[]> = {
  shibuya: [
    { id: 'it-1', kind: 'shock_grenade', x: -22.5, z: -20.5, y: 3.7 }, // Inside 24H Konbini 2F
    { id: 'it-2', kind: 'cryo_capsule', x: 20.5, z: 9.0, y: 0 },        // East water flank
    { id: 'it-3', kind: 'gravity_vortex', x: 22.5, z: -14.8, y: 3.7, onPodium: true }, // Neo Ramen 2F Balcony Podium
    { id: 'it-4', kind: 'crimson_elixir', x: 0, z: -29.0, y: 0, onPodium: true },      // North promenade high ground
    { id: 'it-5', kind: 'gale_boots', x: -22.5, z: 20.5, y: 3.7 },     // Shibuya Arcade 2F
    { id: 'it-6', kind: 'aegis_shard', x: 0, z: 27.3, y: 3.7, onPodium: true },        // Metro Concourse 2F Balcony Podium
  ],
  meadow: [
    { id: 'it-1', kind: 'shock_grenade', x: -19.0, z: -18.0, y: 0 },    // Coliseum courtyard gate
    { id: 'it-2', kind: 'cryo_capsule', x: -18.5, z: 8.5, y: 0 },       // West oasis bridge approach
    { id: 'it-3', kind: 'gravity_vortex', x: 31.5, z: 28.8, y: 0 },     // Catacomb Relic Vault floor
    { id: 'it-4', kind: 'crimson_elixir', x: -25.5, z: -24.5, y: 4.1, onPodium: true }, // Coliseum 2nd Floor
    { id: 'it-5', kind: 'gale_boots', x: 18.5, z: -8.5, y: 0 },         // East oasis bridge approach
    { id: 'it-6', kind: 'aegis_shard', x: 0, z: 30.0, y: 0 },           // South battlement
  ],
  temple: [
    { id: 'it-1', kind: 'shock_grenade', x: -19.5, z: -18.5, y: 0 },    // Dojo courtyard steps
    { id: 'it-2', kind: 'cryo_capsule', x: -18.0, z: 8.5, y: 0 },       // West koi pond bank
    { id: 'it-3', kind: 'gravity_vortex', x: 25.0, z: 22.5, y: 3.7 },   // Lotus Sanctuary 2F
    { id: 'it-4', kind: 'crimson_elixir', x: -25.0, z: -22.5, y: 3.7 }, // Bamboo Dojo 2F
    { id: 'it-5', kind: 'gale_boots', x: 18.0, z: -8.5, y: 0 },         // East koi pond bank
    { id: 'it-6', kind: 'aegis_shard', x: 5.5, z: 30.5, y: 0 },         // South sanctuary path
  ],
  obsidian: [
    { id: 'it-1', kind: 'shock_grenade', x: -19.5, z: -16.5, y: 0 },    // Volcano south tunnel lip
    { id: 'it-2', kind: 'cryo_capsule', x: 22.5, z: -13.5, y: 0 },      // NE bridge entry
    { id: 'it-3', kind: 'gravity_vortex', x: 25.5, z: 24.5, y: 3.7 },   // Blacksmith Forge 2F
    { id: 'it-4', kind: 'crimson_elixir', x: -25.5, z: -27.0, y: 0.55 },// Volcano Island North Wing
    { id: 'it-5', kind: 'gale_boots', x: -22.5, z: 13.5, y: 0 },        // SW bridge entry
    { id: 'it-6', kind: 'aegis_shard', x: 0, z: 31.5, y: 0 },           // South basalt ridge
  ],
};

export function getMapItemDropSpawns(mapId: MapId): ItemDropSpawn[] {
  return MAP_ITEM_DROPS[mapId];
}

function createSeededRng(seed: number): () => number {
  let t = (seed >>> 0) || 1337;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const DEFAULT_MATCH_SEEDS: Record<MapId, number> = {
  shibuya: 104729,
  meadow: 224737,
  temple: 350377,
  obsidian: 479909,
};

export function createMatchObstacleStates(mapId: MapId, matchSeed?: number): ObstacleState[] {
  const seed = matchSeed ?? DEFAULT_MATCH_SEEDS[mapId];
  const rand = createSeededRng(seed);
  const spec = MAP_BY_ID[mapId];
  const maxR = spec.arenaRadius - 4.2;
  const pickups = MAP_PICKUPS[mapId];
  const staticZones = getMapStatic3DZones(mapId);
  const baseList = MAP_OBSTACLES[mapId];

  const out: ObstacleState[] = baseList.map((obs) => {
    const maxHp = obs.maxHp ?? 100;
    return {
      ...obs,
      variant:
        obs.variant ??
        (mapId === 'shibuya'
          ? obs.kind === 'pillar'
            ? 'subway'
            : 'convenience'
          : mapId === 'meadow'
          ? 'column'
          : mapId === 'temple'
          ? 'shrine'
          : 'monolith'),
      hp: maxHp,
      maxHp,
      destroyed: false,
    };
  });

  // Candidate clear check: keep center (r < 11.5m), catacomb entry ramp, Temple NPC spawn, pickups, buildings & 3D staircases clear!
  const isSpotValid = (x: number, z: number, halfW: number, halfD: number): boolean => {
    const pad = Math.max(halfW, halfD);
    const rad = Math.hypot(x, z);
    if (rad - pad < 12.2 || rad + pad > maxR) return false;
    if (mapId === 'temple' && Math.hypot(x, z + 20.5) < 5.2 + pad) return false;
    if (mapId === 'meadow' && x > 12.5 && z > 12.0) return false; // Keep Catacomb staircase & interior clear
    if (findEnterableBuildingAt(mapId, x, 0, z)) return false;
    const buildings = MAP_ENTERABLE_BUILDINGS[mapId] ?? [];
    for (const b of buildings) {
      for (const side of b.doorSides) {
        const dx = side === 'w' ? b.x - b.halfW - 1.5 : side === 'e' ? b.x + b.halfW + 1.5 : b.x;
        const dz = side === 'n' ? b.z - b.halfD - 1.5 : side === 's' ? b.z + b.halfD + 1.5 : b.z;
        if (Math.hypot(x - dx, z - dz) < pad + 2.6) return false;
      }
    }
    for (const sz of staticZones) {
      if (
        x + halfW + 1.2 > sz.minX &&
        x - halfW - 1.2 < sz.maxX &&
        z + halfD + 1.2 > sz.minZ &&
        z - halfD - 1.2 < sz.maxZ
      ) {
        return false;
      }
    }
    for (const pk of pickups) {
      if (Math.hypot(x - pk.x, z - pk.z) < pad + 2.4) return false;
    }
    for (const existing of out) {
      const gap = 1.6;
      if (
        Math.abs(x - existing.x) < halfW + existing.halfW + gap &&
        Math.abs(z - existing.z) < halfD + existing.halfD + gap
      ) {
        return false;
      }
    }
    return true;
  };

  const pushIfValid = (obs: MapObstacle) => {
    if (!isSpotValid(obs.x, obs.z, obs.halfW, obs.halfD)) return false;
    const maxHp = obs.maxHp ?? 85;
    out.push({
      ...obs,
      hp: maxHp,
      maxHp,
      destroyed: false,
    });
    return true;
  };

  const angleJitter = (rand() - 0.5) * 0.45;

  // 1. Add Jumpable Outer High-Ground Platforms across expanded mid-ring (r = 16..34)
  const targetPlatforms = 7;
  let placedPlatforms = 0;
  for (let i = 0; i < 16 && placedPlatforms < targetPlatforms; i++) {
    const baseAng = (i / 16) * Math.PI * 2 + angleJitter + (rand() - 0.5) * 0.22;
    const dist = 16.5 + rand() * 16.0;
    const px = Number((Math.cos(baseAng) * dist).toFixed(2));
    const pz = Number((Math.sin(baseAng) * dist).toFixed(2));
    let placedHere = false;

    if (mapId === 'shibuya') {
      const choices: Array<{ variant: ObstacleVariant; kind: MapObstacle['kind']; hw: number; hd: number; topY: number; col: number; roof: number; hp: number }> = [
        { variant: 'rooftop', kind: 'platform', hw: 1.7, hd: 1.6, topY: 1.5, col: 0xe2e8f0, roof: 0x38bdf8, hp: 105 },
        { variant: 'overpass', kind: 'bridge', hw: 2.1, hd: 1.1, topY: 1.35, col: 0x64748b, roof: 0xfacc15, hp: 115 },
        { variant: 'vending', kind: 'platform', hw: 1.25, hd: 0.9, topY: 1.25, col: 0xf1f5f9, roof: 0xf43f5e, hp: 65 },
      ];
      const pick = choices[i % choices.length];
      placedHere = pushIfValid({
        id: `shib-plat-${i}`,
        kind: pick.kind,
        variant: pick.variant,
        x: px,
        z: pz,
        halfW: pick.hw,
        halfD: pick.hd,
        topY: pick.topY,
        colorHex: pick.col,
        roofColorHex: pick.roof,
        destructible: true,
        maxHp: pick.hp,
      });
    } else if (mapId === 'meadow') {
      const choices: Array<{ variant: ObstacleVariant; kind: MapObstacle['kind']; hw: number; hd: number; topY: number; col: number; roof: number; hp: number }> = [
        { variant: 'boulder', kind: 'platform', hw: 1.6, hd: 1.5, topY: 1.35, col: 0xd6d3d1, roof: 0xfacc15, hp: 110 },
        { variant: 'stepPlatform', kind: 'platform', hw: 1.8, hd: 1.65, topY: 1.5, col: 0xe7e5e4, roof: 0xd97706, hp: 110 },
        { variant: 'crate', kind: 'platform', hw: 1.25, hd: 1.25, topY: 1.2, col: 0xb45309, roof: 0xfde047, hp: 60 },
      ];
      const pick = choices[i % choices.length];
      placedHere = pushIfValid({
        id: `mead-plat-${i}`,
        kind: pick.kind,
        variant: pick.variant,
        x: px,
        z: pz,
        halfW: pick.hw,
        halfD: pick.hd,
        topY: pick.topY,
        colorHex: pick.col,
        roofColorHex: pick.roof,
        destructible: true,
        maxHp: pick.hp,
      });
    } else if (mapId === 'temple') {
      const choices: Array<{ variant: ObstacleVariant; kind: MapObstacle['kind']; hw: number; hd: number; topY: number; col: number; roof: number; hp: number }> = [
        { variant: 'stepPlatform', kind: 'platform', hw: 1.85, hd: 1.65, topY: 1.45, col: 0x57534e, roof: 0xfb923c, hp: 110 },
        { variant: 'boulder', kind: 'platform', hw: 1.55, hd: 1.45, topY: 1.35, col: 0x64748b, roof: 0xf59e0b, hp: 105 },
        { variant: 'barricade', kind: 'platform', hw: 1.5, hd: 0.9, topY: 1.25, col: 0x991b1b, roof: 0xfde047, hp: 70 },
      ];
      const pick = choices[i % choices.length];
      placedHere = pushIfValid({
        id: `temp-plat-${i}`,
        kind: pick.kind,
        variant: pick.variant,
        x: px,
        z: pz,
        halfW: pick.hw,
        halfD: pick.hd,
        topY: pick.topY,
        colorHex: pick.col,
        roofColorHex: pick.roof,
        destructible: true,
        maxHp: pick.hp,
      });
    } else {
      const choices: Array<{ variant: ObstacleVariant; kind: MapObstacle['kind']; hw: number; hd: number; topY: number; col: number; roof: number; hp: number }> = [
        { variant: 'stepPlatform', kind: 'platform', hw: 1.8, hd: 1.7, topY: 1.5, col: 0x1e293b, roof: 0xa855f7, hp: 115 },
        { variant: 'boulder', kind: 'platform', hw: 1.6, hd: 1.5, topY: 1.38, col: 0x334155, roof: 0xf97316, hp: 110 },
        { variant: 'crate', kind: 'platform', hw: 1.3, hd: 1.3, topY: 1.25, col: 0x475569, roof: 0xc084fc, hp: 70 },
      ];
      const pick = choices[i % choices.length];
      placedHere = pushIfValid({
        id: `obs-plat-${i}`,
        kind: pick.kind,
        variant: pick.variant,
        x: px,
        z: pz,
        halfW: pick.hw,
        halfD: pick.hd,
        topY: pick.topY,
        colorHex: pick.col,
        roofColorHex: pick.roof,
        destructible: true,
        maxHp: pick.hp,
      });
    }
    if (placedHere) placedPlatforms++;
  }

  // 2. Outer Cover Clusters across expanded outer districts (r = 22..maxR)
  const extraCount = 12;
  for (let i = 0; i < extraCount; i++) {
    const ang = (i / extraCount) * Math.PI * 2 + angleJitter * 0.7 + (rand() - 0.5) * 0.25;
    const dist = 22.5 + rand() * (maxR - 24.5);
    const ox = Number((Math.cos(ang) * dist).toFixed(2));
    const oz = Number((Math.sin(ang) * dist).toFixed(2));

    if (mapId === 'shibuya') {
      const roll = rand();
      const specPick =
        roll < 0.45
          ? { variant: 'vending' as ObstacleVariant, kind: 'wall' as const, hw: 1.25, hd: 0.85, topY: 2.1, col: 0xf8fafc, roof: 0x22d3ee, hp: 60 }
          : { variant: 'rooftop' as ObstacleVariant, kind: 'platform' as const, hw: 1.7, hd: 1.5, topY: 1.6, col: 0xe2e8f0, roof: 0xec4899, hp: 90 };
      pushIfValid({
        id: `shib-dyn-${i}`,
        kind: specPick.kind,
        variant: specPick.variant,
        x: ox,
        z: oz,
        halfW: specPick.hw,
        halfD: specPick.hd,
        topY: specPick.topY,
        colorHex: specPick.col,
        roofColorHex: specPick.roof,
        destructible: true,
        maxHp: specPick.hp,
      });
    } else if (mapId === 'meadow') {
      const roll = rand();
      const specPick =
        roll < 0.5
          ? { variant: 'column' as ObstacleVariant, kind: 'pillar' as const, hw: 1.3, hd: 1.3, topY: 3.3, col: 0xd6d3d1, roof: 0xfacc15, hp: 85 }
          : { variant: 'barricade' as ObstacleVariant, kind: 'wall' as const, hw: 1.55, hd: 0.8, topY: 1.35, col: 0xd97706, roof: 0xfacc15, hp: 65 };
      pushIfValid({
        id: `mead-dyn-${i}`,
        kind: specPick.kind,
        variant: specPick.variant,
        x: ox,
        z: oz,
        halfW: specPick.hw,
        halfD: specPick.hd,
        topY: specPick.topY,
        colorHex: specPick.col,
        roofColorHex: specPick.roof,
        destructible: true,
        maxHp: specPick.hp,
      });
    } else if (mapId === 'temple') {
      const roll = rand();
      const specPick =
        roll < 0.5
          ? { variant: 'column' as ObstacleVariant, kind: 'pillar' as const, hw: 1.25, hd: 1.25, topY: 3.2, col: 0x991b1b, roof: 0xfacc15, hp: 85 }
          : { variant: 'barricade' as ObstacleVariant, kind: 'wall' as const, hw: 1.6, hd: 0.82, topY: 1.4, col: 0x78350f, roof: 0xfb923c, hp: 65 };
      pushIfValid({
        id: `temp-dyn-${i}`,
        kind: specPick.kind,
        variant: specPick.variant,
        x: ox,
        z: oz,
        halfW: specPick.hw,
        halfD: specPick.hd,
        topY: specPick.topY,
        colorHex: specPick.col,
        roofColorHex: specPick.roof,
        destructible: true,
        maxHp: specPick.hp,
      });
    } else {
      const roll = rand();
      const specPick =
        roll < 0.55
          ? { variant: 'spire' as ObstacleVariant, kind: 'pillar' as const, hw: 1.3, hd: 1.3, topY: 3.1, col: 0x334155, roof: 0xf97316, hp: 90 }
          : { variant: 'boulder' as ObstacleVariant, kind: 'platform' as const, hw: 1.6, hd: 1.5, topY: 1.5, col: 0x1e293b, roof: 0xc084fc, hp: 105 };
      pushIfValid({
        id: `obs-dyn-${i}`,
        kind: specPick.kind,
        variant: specPick.variant,
        x: ox,
        z: oz,
        halfW: specPick.hw,
        halfD: specPick.hd,
        topY: specPick.topY,
        colorHex: specPick.col,
        roofColorHex: specPick.roof,
        destructible: true,
        maxHp: specPick.hp,
      });
    }
  }

  return out;
}

export function getMapObstacles(mapId: MapId): MapObstacle[] {
  return createMatchObstacleStates(mapId);
}

export function createInitialObstacleStates(mapId: MapId, matchSeed?: number): ObstacleState[] {
  return createMatchObstacleStates(mapId, matchSeed);
}

export function computeObstacleLayoutSignature(
  obstacles?: Array<Pick<MapObstacle, 'id' | 'x' | 'z' | 'topY'>>
): string {
  if (!obstacles || obstacles.length === 0) return '';
  let hash = 2166136261;
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    const s = `${o.id}:${Math.round(o.x * 10)}:${Math.round(o.z * 10)}:${Math.round(o.topY * 10)}`;
    for (let j = 0; j < s.length; j++) {
      hash ^= s.charCodeAt(j);
      hash = Math.imul(hash, 16777619);
    }
  }
  return `${obstacles.length}:${hash >>> 0}`;
}

export function getMapPickupSpawns(mapId: MapId): PickupSpawn[] {
  return MAP_PICKUPS[mapId];
}

export function getDamagePhase(hp: number, maxHp: number, isKO: boolean): DamagePhase {
  if (isKO || hp <= 0) return 'DEFEATED';
  const pct = (hp / Math.max(1, maxHp)) * 100;
  if (pct <= 22) return 'CRITICAL';
  if (pct <= 48) return 'SEVERELY DAMAGED';
  if (pct <= 74) return 'DAMAGED';
  return 'NORMAL';
}

export function getMeadowStreamZ(x: number): number {
  return Math.sin(x * 0.11) * 3.8 - 1.2;
}

export function getMapTerrainHeight(mapId: MapId, x: number, z: number): number {
  const arenaR = MAP_BY_ID[mapId].arenaRadius;
  return computeMapTerrainHeight(mapId, x, z, arenaR);
}

export function getObstacleSupportY(
  mapId: MapId,
  x: number,
  currentRelY: number,
  z: number,
  actorRadius = 0.42,
  liveObstacles?: Array<MapObstacle & { destroyed?: boolean }>
): number {
  let maxTop = computeStatic3DSupportY(mapId, x, currentRelY, z, actorRadius);
  const obstacles: Array<MapObstacle & { destroyed?: boolean }> = liveObstacles ?? getMapObstacles(mapId);
  for (const obs of obstacles) {
    if (obs.destroyed) continue;
    if (
      Math.abs(x - obs.x) <= obs.halfW + actorRadius * 0.6 &&
      Math.abs(z - obs.z) <= obs.halfD + actorRadius * 0.6 &&
      currentRelY >= obs.topY - 0.42
    ) {
      if (obs.topY > maxTop) maxTop = obs.topY;
    }
  }
  return maxTop;
}

export function resolveObstacleCollisions(
  mapId: MapId,
  x: number,
  relY: number,
  z: number,
  actorRadius = 0.34,
  liveObstacles?: Array<MapObstacle & { destroyed?: boolean }>
): { x: number; z: number } {
  const tightRadius = Math.min(actorRadius, 0.34);
  const staticResolved = resolveStatic3DCollisions(mapId, x, relY, z, tightRadius);
  let nx = staticResolved.x;
  let nz = staticResolved.z;
  const obstacles: Array<MapObstacle & { destroyed?: boolean }> = liveObstacles ?? getMapObstacles(mapId);
  for (const obs of obstacles) {
    if (obs.destroyed) continue;
    if (obs.topY <= 0.75) continue;
    if (relY >= obs.topY - 0.42) continue;
    const expandW = obs.halfW + tightRadius;
    const expandD = obs.halfD + tightRadius;
    const dx = nx - obs.x;
    const dz = nz - obs.z;
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

export function findObstacleAtPoint<T extends MapObstacle & { destroyed?: boolean }>(
  mapId: MapId,
  x: number,
  relY: number,
  z: number,
  liveObstacles?: T[]
): T | null {
  const obstacles = (liveObstacles ?? getMapObstacles(mapId)) as T[];
  for (const obs of obstacles) {
    if (obs.destroyed) continue;
    if (
      relY < obs.topY &&
      Math.abs(x - obs.x) <= obs.halfW &&
      Math.abs(z - obs.z) <= obs.halfD
    ) {
      return obs;
    }
  }
  return null;
}

export function pointHitsObstacle(
  mapId: MapId,
  x: number,
  relY: number,
  z: number,
  liveObstacles?: Array<MapObstacle & { destroyed?: boolean }>
): boolean {
  return findObstacleAtPoint(mapId, x, relY, z, liveObstacles) !== null || pointHitsStatic3D(mapId, x, relY, z);
}

export interface RoomPlayer {
  playerId: string;
  slotIndex: number;
  name: string;
  fighterId: FighterId;
  skinId: SkinId;
  ready: boolean;
  connected: boolean;
  wins: number;
  isBot?: boolean;
  isDummy?: boolean;
  team?: TeamId;
}

export interface ArenaPickup {
  id: string;
  kind: ArenaPickupKind;
  x: number;
  y: number;
  z: number;
  active: boolean;
  magnetTargetId?: string | null;
}

export interface BattlefieldEventState {
  id: string;
  kind: BattlefieldEventKind;
  title: string;
  subtitle: string;
  x: number;
  z: number;
  radius: number;
  remaining: number;
  telegraphRemaining: number; // >0 before hazard detonates
  colorHex: number;
  dirX?: number;
  dirZ?: number;
  secondaryPoints?: Array<{ x: number; z: number; radius: number }>;
}

export interface ClashState {
  id: string;
  playerAId: string;
  playerBId: string;
  remaining: number; // QTE decision countdown
  maxTime: number;
  choiceA: CombatMoveType | null;
  choiceB: CombatMoveType | null;
  x: number;
  y: number;
  z: number;
}

export interface HeadlockState {
  id: string;
  grabberId: string;
  victimId: string;
  remaining: number;
  duration: number;
  grabberMashes: number;
  victimMashes: number;
  x: number;
  y: number;
  z: number;
}

export interface ArenaZoneState {
  id: string;
  ownerId: string;
  fighterId: FighterId;
  skinId?: SkinId;
  kind: ArenaZoneKind;
  x: number;
  y: number;
  z: number;
  endX?: number;
  endZ?: number;
  radius: number;
  remaining: number;
  maxDuration: number;
  colorHex: number;
  triggered?: boolean;
}

export interface TelegraphState {
  id: string;
  ownerId: string;
  fighterId: FighterId;
  kind: TelegraphKind;
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirZ: number;
  radius: number;
  length: number;
  angleHalf: number;
  progress: number;
  colorHex: number;
}

export interface ArenaActorState {
  playerId: string;
  slotIndex: number;
  name: string;
  fighterId: FighterId;
  skinId: SkinId;
  isBot?: boolean;
  isDummy?: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  yVel: number;
  vz: number;
  grounded: boolean;
  rotY: number;
  hp: number;
  maxHp: number;
  mana: number; // Chi / Energy
  maxMana: number;
  stamina: number; // Tactical stamina (slower regen, governs spam)
  maxStamina: number;
  stagger: number; // 0..100 -> 100 triggers STUNNED
  isStunned: boolean;
  isOverdrive: boolean; // Low-HP (<28%) comeback overdrive
  frenzyInside?: boolean; // Legacy optional field
  stealthed?: boolean; // Hidden inside tall grass / bamboo / steam vent
  stealthPatchId?: string | null;
  inWater?: boolean; // Standing in shallow water (-30% speed)
  inLava?: boolean; // Standing in molten lava (DoT hazard)
  insideBuildingId?: string | null; // Inside an enterable building
  passiveStacks: number; // Character passive counter / buff stack
  counterFlowActive: boolean; // JM Parry/Evade buff or general empowered skill buff
  stage2Slot?: AbilitySlot | null;
  stage2Timer?: number;
  stage2Label?: string;
  rushFatigue?: number;
  empoweredM1Ready?: boolean;
  jmDashActive?: boolean;
  primeDomainBuff?: boolean;
  perfectEvadeTimer?: number;
  comboCount: number; // Consecutive hits landed
  comboResetRemaining?: number; // Seconds remaining before combo resets (max 2.0s)
  comboStep: 0 | 1 | 2 | 3 | 4; // 4-hit M1 stage
  m1Variant: 'light' | 'heavy';
  grabCooldown: number;
  damagePhase: DamagePhase;
  actionState: ActorActionState;
  abilitySlot: AbilitySlot | null;
  actionTimer: number;
  actionDuration: number;
  whiffTimer: number; // >0 means missed big move -> extra vulnerability
  cooldowns: [number, number, number, number, number, number, number, number?];
  ascendedCloneAlive?: boolean;
  dashCooldown: number;
  dashMaxCooldown: number;
  dashCharges: number;
  dashMaxCharges: number;
  dashRechargeRemaining: number;
  isFlying?: boolean;
  flightRemaining?: number;
  flightMax?: number;
  flightCooldown?: number;
  speedBoostTimer?: number;
  superArmor?: boolean;
  shieldActive: boolean;
  parryWindow: boolean;
  blockHeld: boolean;
  awakened: boolean;
  awakeningTransformTimer?: number;
  silencedTimer?: number;
  snareMarkedTimer?: number;
  slowTimer?: number;
  channelKind?: ChannelKind | null;
  channelTimer?: number;
  channelDuration?: number;
  channelTargetX?: number;
  channelTargetZ?: number;
  skyComboPrompt?: boolean;
  skyComboStep?: number;
  skyComboMashes?: number;
  skyComboTargetId?: string | null;
  isKO: boolean;
  koTime: number | null;
  koStyle: EliminationStyle;
  koCause?: KoCause;
  koByFighterId?: FighterId;
  wins: number;
  kills: number;
  deaths?: number;
  parryCount: number;
  damageDealt: number;
  team?: TeamId;
  isRaidBoss?: boolean;
  domainGauge: number;
  stunImmunityTimer?: number;
  domainJackpotActive?: boolean;
  domainJackpotHits?: number;
  dummyDps?: number;
  dummyPeakDps?: number;
  dummyBurstDamage?: number;
  heldItem?: TacticalItemKind | null;
  strengthBuffTimer?: number;
  permanentDamageBonus?: number;
  permanentSpeedBonus?: number;
  dashCooldownMult?: number;
  permanentMaxHpStacks?: number;
  isNpcBoss?: boolean;
}

export interface AwakeningOrbState {
  id: string;
  x: number;
  y: number;
  z: number;
  active: boolean;
  fadeTimer: number;
  remaining?: number;
  maxDuration?: number;
}

export interface AwakeningBannerState {
  id: string;
  text: string;
  subtext?: string;
  colorHex: number;
  remaining: number;
}

export interface AwakeningCutsceneState {
  id: string;
  p1Id: string;
  p2Id: string;
  p1Name: string;
  p2Name: string;
  p1FighterId: FighterId;
  p2FighterId: FighterId;
  p1SkinId: SkinId;
  p2SkinId: SkinId;
  clockSec: number;
  clashBalance: number; // -1 (P1 dominates) .. +1 (P2 dominates)
  p1Taps: number;
  p2Taps: number;
  p1Overdrive: number;
  p2Overdrive: number;
  outcome: 'p1' | 'p2' | 'tie' | null;
  fadeMusicOut: boolean;
  resolved: boolean;
}

export type AwakeningDebugAction =
  | 'spawnOrbs'
  | 'awakenP1'
  | 'awakenP2'
  | 'triggerCutscene'
  | 'setTime89'
  | 'resetCooldowns'
  | 'fillDomain';

export interface ProjectileState {
  id: string;
  ownerId: string;
  fighterId: FighterId;
  skinId?: SkinId;
  kind:
    | 'bullet'
    | 'magnum'
    | 'magmaBoulder'
    | 'lasso'
    | 'crescent'
    | 'solarFireball'
    | 'tornado'
    | 'jmBeam'
    | 'jmBolt'
    | 'windBlade'
    | 'solarRailgun'
    | 'tornadoVortex';
  x: number;
  y: number;
  z: number;
  vx: number;
  vy?: number;
  vz: number;
  rotY: number;
  colorHex: number;
  originX?: number;
  originY?: number;
  originZ?: number;
  targetX?: number;
  targetY?: number;
  targetZ?: number;
  isComboLink?: boolean;
  isOverdrive?: boolean;
  isHoming?: boolean;
}

export type RpsOutcome =
  | 'strike_beats_grab'
  | 'grab_beats_parry'
  | 'parry_beats_strike'
  | 'weak_to_grab';

export interface CombatEvent {
  id: string;
  t: number;
  kind:
    | 'cast'
    | 'hit'
    | 'block'
    | 'parry'
    | 'evade'
    | 'trap'
    | 'trapTrigger'
    | 'grab'
    | 'headlockBreak'
    | 'whiff'
    | 'stun'
    | 'dash'
    | 'jump'
    | 'pickup'
    | 'shockwave'
    | 'beam'
    | 'lasso'
    | 'comboLink'
    | 'overdrive'
    | 'clashStart'
    | 'clashWin'
    | 'hazardHit'
    | 'fireballCharge'
    | 'fireballLaunch'
    | 'fireballImpact'
    | 'obstacleBreak'
    | 'awakeningOrbsSpawn'
    | 'awakeningPickup'
    | 'awakeningTransform'
    | 'awakeningCutsceneStart'
    | 'awakeningClashEnd'
    | 'lightning'
    | 'silence'
    | 'cometGrab'
    | 'omnislash'
    | 'domainStart'
    | 'domainCastStart'
    | 'domainCastCancel'
    | 'domainSureHit'
    | 'domainClashStart'
    | 'domainClashWin'
    | 'domainJackpot'
    | 'domainEnd'
    | 'jmMirrorTeleport'
    | 'jmLaserDetonate'
    | 'meteorFist'
    | 'kothCapture'
    | 'craterSlam'
    | 'crescentSlash'
    | 'pillarShatter'
    | 'trenchPulse'
    | 'chargeAura'
    | 'skyComboStep'
    | 'ko'
    | 'strengthBuff'
    | 'itemPickup'
    | 'itemUse'
    | 'cryoFreeze'
    | 'npcProvoke'
    | 'npcDefeat'
    | 'meteorBoulder'
    | 'turretPlant'
    | 'asuraSlam'
    | 'judgementSpearPulse'
    | 'cloneSwap'
    | 'cloneSpawn';
  attackerId?: string;
  targetId?: string;
  fighterId?: FighterId;
  skinId?: SkinId;
  x: number;
  y: number;
  z: number;
  dirX?: number;
  dirZ?: number;
  originX?: number;
  originY?: number;
  originZ?: number;
  colorHex: number;
  damage?: number;
  radius?: number;
  isCrit?: boolean;
  isBackstab?: boolean;
  isCounter?: boolean;
  comboHit?: number;
  hitStopMs?: number;
  callout?: string;
  koStyle?: EliminationStyle;
  koCause?: KoCause;
  abilitySlot?: AbilitySlot;
  comboStep?: 1 | 2 | 3 | 4;
  m1Variant?: 'light' | 'heavy';
  rpsOutcome?: RpsOutcome;
  frenzyInside?: boolean;
  counterFlow?: boolean;
  isComboLink?: boolean;
  staminaRefund?: number;
  whiffSlot?: AbilitySlot | null;
}

export interface TrainingConfig {
  dummyEnabled: boolean;
  zeroCooldowns: boolean;
}

export interface RoomState {
  roomCode: string;
  hostId: string;
  phase: RoomPhase;
  mapId: MapId;
  gameMode: GameModeId;
  isSoloPractice: boolean;
  isTrainingMode: boolean;
  trainingConfig?: TrainingConfig;
  countdown: number;
  matchTime: number;
  roundNumber: number;
  winsToWin: number;
  roundWinnerId: string | null;
  winnerId: string | null;
  players: RoomPlayer[];
}

export interface ArenaTurretState {
  id: string;
  ownerId: string;
  fighterId: FighterId;
  kind: 'storm_tornado' | 'asura_volcano' | 'solar_gun';
  x: number;
  y: number;
  z: number;
  rotY: number;
  remaining: number;
  maxDuration: number;
  headOffsetIndex?: number;
}

export interface AbyssalCloneState {
  id: string;
  ownerId: string;
  name: string;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  z: number;
  rotY: number;
  actionState: 'idle' | 'move' | 'attack' | 'dash';
  swingTimer: number;
}

export interface JudgementSpearState {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  z: number;
  remaining: number;
  maxDuration: number;
  waveRadius: number;
  maxRadius: number;
  pulseCount: number;
}

export interface ArenaSnapshot {
  serverTime: number;
  matchTime: number;
  gameMode: GameModeId;
  initialActorCount?: number;
  lastInputSeq: Record<string, number>;
  actors: ArenaActorState[];
  projectiles: ProjectileState[];
  zones: ArenaZoneState[];
  telegraphs: TelegraphState[];
  pickups: ArenaPickup[];
  obstacles?: ObstacleState[];
  battleEvent: BattlefieldEventState | null;
  activeClash: ClashState | null;
  activeHeadlock: HeadlockState | null;
  stormActive: boolean;
  stormRadius: number;
  stormMaxRadius: number;
  stormCenterX: number;
  stormCenterZ: number;
  awakeningPhase: MatchAwakeningPhase;
  awakeningCountdown?: number | null;
  awakeningOrbs: AwakeningOrbState[];
  awakeningCutscene: AwakeningCutsceneState | null;
  awakeningBanner: AwakeningBannerState | null;
  castingDomain?: DomainCastState | null;
  activeDomain?: DomainExpansionState | null;
  activeDomainClash?: DomainClashState | null;
  kothZone?: KothZoneState | null;
  teamScores?: { alpha: number; beta: number } | null;
  modeTimer?: number | null;
  raidBossId?: string | null;
  itemDrops?: ArenaItemDrop[];
  frozenWaterZones?: FrozenWaterZone[];
  templeNpc?: TempleNpcState | null;
  turrets?: ArenaTurretState[];
  abyssalClones?: AbyssalCloneState[];
  judgementSpears?: JudgementSpearState[];
}

export interface RoomChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  fighterId?: FighterId;
  text: string;
  timestamp: number;
}

export type ClientMessage =
  | { type: 'net:ping'; clientSendTime: number }
  | {
      type: 'room:create';
      playerName: string;
      isSoloPractice?: boolean;
      isTrainingMode?: boolean;
      gameMode?: GameModeId;
    }
  | { type: 'room:join'; roomCode: string; playerName: string; reconnectToken?: string }
  | { type: 'room:selectFighter'; fighterId: FighterId }
  | { type: 'room:selectSkin'; skinId: SkinId }
  | { type: 'room:selectMap'; mapId: MapId }
  | { type: 'room:selectMode'; gameMode: GameModeId }
  | { type: 'room:setReady'; ready: boolean }
  | { type: 'room:startNow' }
  | { type: 'room:rematch' }
  | { type: 'room:leave' }
  | { type: 'room:chat'; text: string }
  | {
      type: 'game:input';
      seq?: number;
      moveX: number;
      moveZ: number;
      aimYaw: number;
      aimPitch?: number;
      targetId?: string | null;
      blockHeld?: boolean;
      jumpHeld?: boolean;
    }
  | { type: 'game:jump'; seq?: number }
  | { type: 'game:toggleFlight'; seq?: number }
  | { type: 'game:dash'; seq?: number; moveX?: number; moveZ?: number; aimYaw?: number }
  | { type: 'game:grab'; seq?: number; aimYaw?: number; targetId?: string | null }
  | { type: 'game:clashPick'; clashId: string; choice: CombatMoveType }
  | { type: 'game:aimUpdate'; aimX: number; aimZ: number }
  | { type: 'game:trainingConfig'; dummyEnabled?: boolean; zeroCooldowns?: boolean; resetDummyDps?: boolean }
  | { type: 'game:awakeningMash'; side?: 'p1' | 'p2' }
  | { type: 'game:awakeningSkip' }
  | { type: 'game:cutsceneSync'; clockSec: number }
  | { type: 'game:domainActivate' }
  | { type: 'game:domainClashMash'; side?: 'p1' | 'p2' }
  | { type: 'game:debug'; action: AwakeningDebugAction }
  | { type: 'game:useItem'; seq?: number; aimX?: number; aimZ?: number }
  | { type: 'game:npcDialogue'; choice: 'fight' | 'bye' }
  | {
      type: 'game:ability';
      seq?: number;
      slot: AbilitySlot;
      holdHeavy?: boolean;
      aimYaw?: number;
      aimPitch?: number;
      targetId?: string | null;
      aimX?: number;
      aimZ?: number;
      isHoldVariant?: boolean;
    };

export type ServerMessage =
  | { type: 'net:pong'; clientSendTime: number; serverTime: number }
  | {
      type: 'room:joined';
      playerId: string;
      reconnectToken: string;
      room: RoomState;
      chatHistory?: RoomChatMessage[];
    }
  | { type: 'room:state'; room: RoomState }
  | { type: 'room:chat'; message: RoomChatMessage }
  | { type: 'room:error'; message: string }
  | { type: 'room:exited'; reason: string }
  | {
      type: 'domain:castStart';
      casterId: string;
      casterName: string;
      fighterId: FighterId;
      skinId?: SkinId;
      domainName: string;
      x: number;
      z: number;
      radius: number;
      castDuration: number;
      primaryHex: number;
      timestamp: number;
    }
  | { type: 'game:snapshot'; snapshot: ArenaSnapshot; events: CombatEvent[] };

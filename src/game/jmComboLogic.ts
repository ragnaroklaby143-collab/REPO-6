import type { AbilitySlot, ChannelKind, FighterId } from '../shared/gameData.ts';

export type JmSlot6Variant = 'super_kamehameha' | 'celestial_barrage';
export type JmSkill2Stage = 'rising_kick' | 'meteor_heel_drop';
export type JmSkyComboOutcome = 'aerial_finisher' | 'release_fall';

/**
 * JM Base & Awakened M1 Cancel Rule:
 * Any of the first 3 hits of JM's M1 chain (comboStep 1, 2, or 3)
 * immediately cancels into Skill 1 (slot 2), Skill 2 (slot 3), or Dash (Q)
 * with zero recovery delay.
 */
export function canJmCancelM1(
  fighterId: FighterId,
  actionState: string,
  comboStep: number,
  targetSlot: AbilitySlot | 'dash'
): boolean {
  if (fighterId !== 'jm' || actionState !== 'attack') return false;
  if (comboStep < 1 || comboStep > 3) return false;
  return targetSlot === 2 || targetSlot === 3 || targetSlot === 'dash';
}

/**
 * Computes JM's Dragon Counter (F) blink-behind transform relative to the attacker.
 */
export function computeParryBlinkBehind(
  attackerX: number,
  attackerZ: number,
  attackerRotY: number,
  offsetDist = 1.45
): { x: number; z: number; rotY: number } {
  const fwdX = Math.sin(attackerRotY);
  const fwdZ = Math.cos(attackerRotY);
  const x = attackerX - fwdX * offsetDist;
  const z = attackerZ - fwdZ * offsetDist;
  const rotY = Math.atan2(attackerX - x, attackerZ - z);
  return { x, z, rotY };
}

/**
 * Resolves JM Base Skill 2 (Slot 3) stage:
 * - Stage 1 (Grounded Tap): Rising Dragon Kick -> launches foe upward + opens Stage 2 window.
 * - Stage 2 (Recast OR Airborne Cast): Meteor Heel Drop -> slams foe into floor with ground bounce.
 */
export function resolveJmBaseSkill2Mode(params: {
  awakened: boolean;
  isFlying: boolean;
  grounded: boolean;
  stage2Slot: AbilitySlot | null;
  stage2Timer: number;
  nearbyAirborneTarget?: boolean;
}): JmSkill2Stage {
  if (params.stage2Slot === 3 && params.stage2Timer > 0) {
    return 'meteor_heel_drop';
  }
  if (!params.grounded || params.isFlying || params.nearbyAirborneTarget) {
    return 'meteor_heel_drop';
  }
  return 'rising_kick';
}

/**
 * Resolves Awakened JM Slot 6 (Key 4) between Ground Super Kamehameha
 * and Airborne Celestial Barrage (Energy-Ball Machine Gun).
 */
export function resolveJmAwakenedSlot6Variant(isFlying: boolean): JmSlot6Variant {
  return isFlying ? 'celestial_barrage' : 'super_kamehameha';
}

/**
 * Resolves whether Sky Flight stays active during an Awakened channel
 * (only JM's Airborne Celestial Barrage remains suspended in Sky Flight).
 */
export function shouldKeepFlightDuringChannel(channelKind: ChannelKind | null): boolean {
  return channelKind === 'jm_air_barrage';
}

/**
 * Determines whether the player mashed M1 enough at the peak of JM's Awakened
 * Solar Dragon Beam Sky Auto-Combo to trigger the 4-hit aerial downslam finisher.
 */
export function resolveSkyAutoComboOutcome(mashes: number, threshold = 2): JmSkyComboOutcome {
  return mashes >= threshold ? 'aerial_finisher' : 'release_fall';
}

/**
 * Computes left/right ridge sample points for the carved raised V-shaped
 * dark-stone ground trench along a colossal beam path.
 */
export function computeBeamVTrenchSegments(
  originX: number,
  originZ: number,
  dirX: number,
  dirZ: number,
  length: number,
  stepDist = 2.6,
  halfWidth = 1.65
): Array<{
  dist: number;
  cx: number;
  cz: number;
  leftX: number;
  leftZ: number;
  rightX: number;
  rightZ: number;
}> {
  const mag = Math.max(0.0001, Math.hypot(dirX, dirZ));
  const fx = dirX / mag;
  const fz = dirZ / mag;
  const rx = -fz;
  const rz = fx;
  const out: Array<{
    dist: number;
    cx: number;
    cz: number;
    leftX: number;
    leftZ: number;
    rightX: number;
    rightZ: number;
  }> = [];
  const count = Math.max(1, Math.floor(length / Math.max(0.5, stepDist)));
  for (let i = 1; i <= count; i++) {
    const dist = i * stepDist;
    const cx = originX + fx * dist;
    const cz = originZ + fz * dist;
    out.push({
      dist,
      cx,
      cz,
      leftX: cx + rx * halfWidth,
      leftZ: cz + rz * halfWidth,
      rightX: cx - rx * halfWidth,
      rightZ: cz - rz * halfWidth,
    });
  }
  return out;
}

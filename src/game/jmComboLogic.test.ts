import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canJmCancelM1,
  computeBeamVTrenchSegments,
  computeParryBlinkBehind,
  resolveJmAwakenedSlot6Variant,
  resolveJmBaseSkill2Mode,
  resolveSkyAutoComboOutcome,
  shouldKeepFlightDuringChannel,
} from './jmComboLogic.ts';

test('JM true M1 cancel windows allow hits 1-3 into Skill 1, Skill 2, and Dash', () => {
  assert.equal(canJmCancelM1('jm', 'attack', 1, 2), true);
  assert.equal(canJmCancelM1('jm', 'attack', 2, 3), true);
  assert.equal(canJmCancelM1('jm', 'attack', 3, 'dash'), true);
  // 4th hit finisher & non-JM / non-cancel slots should not use JM early cancel
  assert.equal(canJmCancelM1('jm', 'attack', 4, 2), false);
  assert.equal(canJmCancelM1('jm', 'attack', 2, 4), false);
  assert.equal(canJmCancelM1('prime', 'attack', 1, 2), false);
});

test('JM Dragon Counter parry blinks behind attacker and faces attacker', () => {
  // Attacker facing +Z (rotY = 0) at (2, 5)
  const res = computeParryBlinkBehind(2, 5, 0, 1.5);
  assert.ok(Math.abs(res.x - 2) < 1e-6);
  assert.ok(Math.abs(res.z - 3.5) < 1e-6);
  // Looking from (2, 3.5) toward (2, 5) is +Z => rotY ~ 0
  assert.ok(Math.abs(res.rotY) < 1e-6);
});

test('JM Base Skill 2 resolves Rising Kick on ground vs Meteor Heel Drop on recast/air', () => {
  assert.equal(
    resolveJmBaseSkill2Mode({
      awakened: false,
      isFlying: false,
      grounded: true,
      stage2Slot: null,
      stage2Timer: 0,
    }),
    'rising_kick'
  );
  assert.equal(
    resolveJmBaseSkill2Mode({
      awakened: false,
      isFlying: false,
      grounded: true,
      stage2Slot: 3,
      stage2Timer: 1.8,
    }),
    'meteor_heel_drop'
  );
  assert.equal(
    resolveJmBaseSkill2Mode({
      awakened: false,
      isFlying: true,
      grounded: false,
      stage2Slot: null,
      stage2Timer: 0,
    }),
    'meteor_heel_drop'
  );
});

test('JM Awakened Slot 6 dynamically switches between Super Kamehameha and Celestial Barrage', () => {
  assert.equal(resolveJmAwakenedSlot6Variant(false), 'super_kamehameha');
  assert.equal(resolveJmAwakenedSlot6Variant(true), 'celestial_barrage');
  assert.equal(shouldKeepFlightDuringChannel('jm_air_barrage'), true);
  assert.equal(shouldKeepFlightDuringChannel('jm_kamehameha'), false);
});

test('JM Sky Auto-Combo branches strictly on M1 spam at peak', () => {
  assert.equal(resolveSkyAutoComboOutcome(0), 'release_fall');
  assert.equal(resolveSkyAutoComboOutcome(1), 'release_fall');
  assert.equal(resolveSkyAutoComboOutcome(2), 'aerial_finisher');
  assert.equal(resolveSkyAutoComboOutcome(6), 'aerial_finisher');
});

test('Beam V-trench segments carve symmetrical left/right ridges along beam corridor', () => {
  const segs = computeBeamVTrenchSegments(0, 0, 0, 1, 10, 2.5, 1.5);
  assert.equal(segs.length, 4);
  assert.ok(Math.abs(segs[0].cz - 2.5) < 1e-6);
  assert.ok(Math.abs(segs[0].leftX - -1.5) < 1e-6);
  assert.ok(Math.abs(segs[0].rightX - 1.5) < 1e-6);
});

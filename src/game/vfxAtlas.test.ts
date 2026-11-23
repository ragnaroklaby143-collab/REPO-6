import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  ADDITIVE_OPACITY_MAX,
  ADDITIVE_OPACITY_MIN,
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

test('clampAdditiveOpacity enforces vibrant non-transparent bounds [0.36..0.86] and allowLower [0.18..0.86]', () => {
  assert.equal(ADDITIVE_OPACITY_MIN, 0.36);
  assert.equal(ADDITIVE_OPACITY_MAX, 0.86);

  assert.equal(clampAdditiveOpacity(0.95), 0.86);
  assert.equal(clampAdditiveOpacity(0.8), 0.8);
  assert.equal(clampAdditiveOpacity(0.58), 0.58);
  assert.equal(clampAdditiveOpacity(0.1), 0.36);
  assert.equal(clampAdditiveOpacity(0.24, true), 0.24);
  assert.equal(clampAdditiveOpacity(0.02, true), 0.18);
  assert.equal(clampAdditiveOpacity(0.9, true), 0.86);
  assert.equal(clampAdditiveOpacity(Number.NaN), 0.36);
});

test('createTaperedCrescentGeometry builds >= 32 segments that taper cleanly to sharp endpoints', () => {
  const geom = createTaperedCrescentGeometry(0.9, 1.8, Math.PI * 0.9, 12);
  const pos = geom.attributes.position as THREE.BufferAttribute;
  // Minimum 32 segments => (32 + 1) * 2 = 66 vertices
  assert.ok(pos.count >= 66, `Expected >= 66 vertices for >=32 segments, got ${pos.count}`);
  assert.ok(geom.attributes.uv, 'Crescent ribbon must have UVs for taperedSlashTex');

  // Endpoints (index 0/1 and last two vertices) should have zero radial width (tapered tip)
  const startW = Math.hypot(
    pos.getX(1) - pos.getX(0),
    pos.getY(1) - pos.getY(0)
  );
  const midIdx = Math.floor(pos.count / 4) * 2;
  const midW = Math.hypot(
    pos.getX(midIdx + 1) - pos.getX(midIdx),
    pos.getY(midIdx + 1) - pos.getY(midIdx)
  );
  const endIdx = pos.count - 2;
  const endW = Math.hypot(
    pos.getX(endIdx + 1) - pos.getX(endIdx),
    pos.getY(endIdx + 1) - pos.getY(endIdx)
  );
  assert.ok(startW < 0.05, `Expected tapered start tip near 0, got ${startW}`);
  assert.ok(endW < 0.05, `Expected tapered end tip near 0, got ${endW}`);
  assert.ok(midW > 0.7, `Expected full mid-arc width > 0.7, got ${midW}`);
  geom.dispose();
});

test('non-blocky procedural VFX geometries build valid BufferGeometries without errors', () => {
  const cone = createTaperedConeShellGeometry(1.1, 0.45, 3.0);
  const vortex = createTwistedVortexGeometry(1.18, 0.22, 2.5, 36, 20, 2.2);
  const ribbons = createSpiralWindRibbonsGeometry(2.2, 0.34, 1.32, 2.35, 3, 32);
  const spire = createFacetedCrystalSpireGeometry(0.56, 5.2, 7, 19);
  const rock = createFacetedRockGeometry(0.5, 7);
  const ridge = createFacetedRidgeGeometry(0.6, 0.5, 3.2, 6);
  const firearm = createSculptedFirearmGeometry();
  const cloneParts = createShadowClonePartsGeo();

  for (const g of [
    cone,
    vortex,
    ribbons,
    spire,
    rock,
    ridge,
    firearm,
    cloneParts.cloakTorsoGeo,
    cloneParts.hoodedHeadGeo,
    cloneParts.bladeArmGeo,
    cloneParts.visorCrescentGeo,
  ]) {
    assert.ok(g.attributes.position.count > 0);
    assert.ok(g.boundingSphere && Number.isFinite(g.boundingSphere.radius));
    g.dispose();
  }
});

test('buildLightningRibbonGeometry and updateLightningRibbonGeometry displace jagged midpoint vertices in-place', () => {
  const geom = buildLightningRibbonGeometry(16);
  const pos = geom.attributes.position as THREE.BufferAttribute;
  assert.equal(pos.count, 34);

  updateLightningRibbonGeometry(geom, 0, 12, 0, 0, 0, 0, 0.4, 0.35, 3.14);
  const midX = (pos.getX(16) + pos.getX(17)) * 0.5;
  const midZ = (pos.getZ(16) + pos.getZ(17)) * 0.5;
  const startMidY = (pos.getY(0) + pos.getY(1)) * 0.5;
  const endMidY = (pos.getY(32) + pos.getY(33)) * 0.5;

  assert.ok(Math.abs(startMidY - 12) < 0.25);
  assert.ok(Math.abs(endMidY - 0) < 0.25);
  assert.ok(Math.hypot(midX, midZ) > 0.01, 'Expected midpoint to have non-zero jagged lightning displacement');
  geom.dispose();
});

test('createVFXTextureAtlas safely handles headless Node environment', () => {
  const atlas = createVFXTextureAtlas();
  assert.equal(atlas.coreGlowTex, null);
  atlas.updateScrolling(0.016);
  atlas.dispose();
});

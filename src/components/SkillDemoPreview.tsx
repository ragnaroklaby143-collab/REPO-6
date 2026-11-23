import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ArenaActorState,
  CombatEvent,
  DomainExpansionState,
  FIGHTER_BY_ID,
  FighterId,
  SkinId,
} from '../shared/gameData.ts';
import { AWAKENING_CONFIG } from '../shared/awakeningConfig.ts';
import {
  FighterRig,
  computeActorPose,
  createArticulatedFighter,
  disposeFighterRig,
  poseFighter,
  triggerFighterHitFlash,
} from '../game/fighterBuilder.ts';
import { DOMAIN_CONFIGS } from '../game/domainLogic.ts';
import { VFXManager } from '../game/vfxManager.ts';
import { detectSoftwareWebGL } from '../game/mapBuilder.ts';
import { detectQualityTier, resolveRenderProfile } from '../game/perfConfig.ts';

export type SkillDemoTab =
  | 'passive'
  | 'm1'
  | 'skill1'
  | 'skill2'
  | 'ultimate'
  | 'awakening'
  | 'domain';

interface SkillDemoPreviewProps {
  fighterId: FighterId;
  skinId: SkinId;
  demoTab: SkillDemoTab;
}

function makeBaseDemoActor(playerId: string, fighterId: FighterId, skinId: SkinId): ArenaActorState {
  const spec = FIGHTER_BY_ID[fighterId];
  return {
    playerId,
    slotIndex: 0,
    name: spec.name,
    fighterId,
    skinId,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    yVel: 0,
    vz: 0,
    grounded: true,
    rotY: Math.PI * 0.5,
    hp: spec.maxHp,
    maxHp: spec.maxHp,
    mana: spec.maxMana,
    maxMana: spec.maxMana,
    stamina: spec.maxStamina,
    maxStamina: spec.maxStamina,
    stagger: 0,
    isStunned: false,
    isOverdrive: false,
    passiveStacks: 0,
    counterFlowActive: false,
    comboCount: 0,
    comboStep: 0,
    m1Variant: 'light',
    grabCooldown: 0,
    damagePhase: 'NORMAL',
    actionState: 'idle',
    abilitySlot: null,
    actionTimer: 0,
    actionDuration: 0,
    whiffTimer: 0,
    cooldowns: [0, 0, 0, 0, 0, 0, 0],
    dashCooldown: 0,
    dashMaxCooldown: 1.6,
    dashCharges: 2,
    dashMaxCharges: 2,
    dashRechargeRemaining: 0,
    shieldActive: false,
    parryWindow: false,
    blockHeld: false,
    awakened: false,
    isKO: false,
    koTime: null,
    koStyle: spec.koStyle,
    wins: 0,
    kills: 0,
    parryCount: 0,
    damageDealt: 0,
    domainGauge: 100,
  };
}

export const SkillDemoPreview: React.FC<SkillDemoPreviewProps> = React.memo(
  ({ fighterId, skinId, demoTab }) => {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const fighterRef = useRef<FighterId>(fighterId);
    const skinRef = useRef<SkinId>(skinId);
    const tabRef = useRef<SkillDemoTab>(demoTab);
    const simClockRef = useRef<number>(0);

    fighterRef.current = fighterId;
    skinRef.current = skinId;
    if (tabRef.current !== demoTab) {
      tabRef.current = demoTab;
      simClockRef.current = 0;
    }

    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      const isSoftwareGl = detectSoftwareWebGL();
      const hasCoarsePointer =
        typeof window !== 'undefined' &&
        (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
      const navWithMem = navigator as Navigator & { deviceMemory?: number };
      const tier = detectQualityTier({
        isSoftwareGl,
        viewportWidth: container.clientWidth || 560,
        viewportHeight: container.clientHeight || 300,
        devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
        hardwareConcurrency: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4,
        deviceMemoryGb: navWithMem?.deviceMemory,
        hasCoarsePointer,
      });
      const profile = resolveRenderProfile(
        tier,
        typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
      );

      const renderer = new THREE.WebGLRenderer({
        antialias: profile.antialias,
        powerPreference: 'high-performance',
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.02;
      renderer.setPixelRatio(profile.initialPixelRatio);
      renderer.shadowMap.enabled = false;
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0b1220);
      scene.fog = new THREE.FogExp2(0x0b1220, 0.022);

      const camera = new THREE.PerspectiveCamera(46, 1.6, 0.2, 80);
      camera.position.set(0, 6.2, 9.6);
      camera.lookAt(0, 0.9, 0);

      const pmrem = new THREE.PMREMGenerator(renderer);
      const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTex;
      pmrem.dispose();

      const hemi = new THREE.HemisphereLight(0xf8fafc, 0x1e293b, 1.05);
      scene.add(hemi);
      const key = new THREE.DirectionalLight(0xfff1d6, 1.55);
      key.position.set(6, 11, 8);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x38bdf8, 0.75);
      rim.position.set(-7, 5, -6);
      scene.add(rim);

      // Training dojo platform floor + neon grid rings
      const floorGeo = new THREE.CylinderGeometry(8.5, 9.2, 0.4, 48);
      floorGeo.translate(0, -0.2, 0);
      const floorMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.72,
        metalness: 0.18,
      });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      scene.add(floor);

      const ringOuterGeo = new THREE.RingGeometry(6.8, 7.05, 48);
      ringOuterGeo.rotateX(-Math.PI * 0.5);
      ringOuterGeo.translate(0, 0.018, 0);
      const ringOuterMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
      });
      const ringOuter = new THREE.Mesh(ringOuterGeo, ringOuterMat);
      scene.add(ringOuter);

      const ringInnerGeo = new THREE.RingGeometry(3.2, 3.35, 36);
      ringInnerGeo.rotateX(-Math.PI * 0.5);
      ringInnerGeo.translate(0, 0.015, 0);
      const ringInnerMat = new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.38,
        side: THREE.DoubleSide,
      });
      const ringInner = new THREE.Mesh(ringInnerGeo, ringInnerMat);
      scene.add(ringInner);

      const vfx = new VFXManager(scene, Math.min(1, profile.vfxQualityScale));

      let casterRig: FighterRig | null = null;
      let dummyRig: FighterRig | null = null;
      let builtFighter: FighterId | null = null;
      let builtSkin: SkinId | null = null;
      let orbitYaw = 0;
      let dragging = false;
      let lastPointerX = 0;

      const rebuildRigs = (fid: FighterId, sid: SkinId) => {
        if (casterRig && dummyRig && builtFighter === fid && builtSkin === sid) return;
        if (casterRig) disposeFighterRig(casterRig, scene);
        if (dummyRig) disposeFighterRig(dummyRig, scene);
        casterRig = createArticulatedFighter(fid, scene, sid, false);
        casterRig.overheadSprite.visible = false;
        const dummyId: FighterId = fid === 'prime' ? 'khen' : 'prime';
        dummyRig = createArticulatedFighter(dummyId, scene, 'classic', false);
        dummyRig.overheadSprite.visible = false;
        builtFighter = fid;
        builtSkin = sid;
        simClockRef.current = 0;
      };

      rebuildRigs(fighterRef.current, skinRef.current);

      const resize = () => {
        const w = Math.max(180, container.clientWidth);
        const h = Math.max(140, container.clientHeight);
        camera.aspect = w / h;
        camera.fov = camera.aspect < 1.2 ? 52 : 44;
        camera.updateProjectionMatrix();
        renderer.setPixelRatio(profile.initialPixelRatio);
        renderer.setSize(w, h, false);
      };

      container.innerHTML = '';
      container.appendChild(renderer.domElement);
      resize();

      const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
      ro?.observe(container);
      window.addEventListener('resize', resize);

      const onDown = (e: PointerEvent) => {
        dragging = true;
        lastPointerX = e.clientX;
      };
      const onMove = (e: PointerEvent) => {
        if (!dragging) return;
        orbitYaw += (e.clientX - lastPointerX) * 0.012;
        lastPointerX = e.clientX;
      };
      const onUp = () => {
        dragging = false;
      };
      renderer.domElement.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);

      let frameId = 0;
      let active = true;
      let prevMs = performance.now();
      let prevPhaseKey = '';
      let evCounter = 0;
      let auraTickTimer = 0;
      let jmLegIdx = 0;
      let meteorTimer = 0;

      const emitDemoEvent = (partial: Omit<CombatEvent, 'id' | 't'>) => {
        evCounter += 1;
        vfx.handleEvent(
          {
            id: `demo-ev-${evCounter}`,
            t: simClockRef.current,
            ...partial,
          },
          'shibuya'
        );
      };

      function afterDraw(cb: () => void) {
        if (!active) return;
        const gl = renderer.getContext() as WebGL2RenderingContext;
        if (typeof gl.fenceSync === 'function') {
          const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          gl.flush();
          let polls = 0;
          const poll = () => {
            if (!active) {
              if (sync) gl.deleteSync(sync);
              return;
            }
            polls += 1;
            const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
            if (state === gl.UNSIGNALED && polls < 32) {
              frameId = window.setTimeout(poll, 5);
            } else {
              if (sync) gl.deleteSync(sync);
              frameId = window.setTimeout(cb, 80);
            }
          };
          frameId = window.setTimeout(poll, 5);
        } else {
          frameId = window.setTimeout(cb, 80);
        }
      }

      const tick = () => {
        if (!active || document.hidden) return;
        const now = performance.now();
        const dt = Math.min((now - prevMs) / 1000, 0.05);
        prevMs = now;

        const fid = fighterRef.current;
        const sid = skinRef.current;
        const tab = tabRef.current;
        const spec = FIGHTER_BY_ID[fid];
        ringOuterMat.color.setHex(spec.hex);

        rebuildRigs(fid, sid);
        const cRig = casterRig!;
        const dRig = dummyRig!;

        const cycleDur = tab === 'domain' ? 4.4 : 3.2;
        const prevClock = simClockRef.current;
        simClockRef.current = (simClockRef.current + dt) % cycleDur;
        const cyc = simClockRef.current;
        if (cyc < prevClock) {
          prevPhaseKey = '';
          jmLegIdx = 0;
          meteorTimer = 0;
        }

        const caster = makeBaseDemoActor('demo-caster', fid, sid);
        const dummy = makeBaseDemoActor('demo-dummy', dRig.id, 'classic');
        caster.x = -1.9;
        caster.z = 0;
        caster.rotY = Math.PI * 0.5;
        dummy.x = 2.0;
        dummy.z = 0;
        dummy.rotY = -Math.PI * 0.5;

        let activeDomain: DomainExpansionState | null = null;
        const triggerOnce = (key: string, fn: () => void) => {
          const fullKey = `${fid}:${tab}:${key}`;
          if (prevPhaseKey === fullKey) return;
          prevPhaseKey = fullKey;
          fn();
        };

        if (tab === 'passive') {
          if (fid === 'jm') {
            caster.isFlying = true;
            caster.y = 1.65 + Math.sin(cyc * 3.5) * 0.18;
            caster.rotY = Math.PI * 0.5 + Math.sin(cyc * 2) * 0.4;
            if (cyc > 0.3 && cyc < 0.45) {
              triggerOnce('jm-pas', () => {
                vfx.spawnSparks(caster.x, caster.y + 0.6, caster.z, 0xfacc15, 6, 1.2, 6, 0.35);
              });
            }
          } else if (fid === 'marjohn') {
            caster.passiveStacks = 2;
            caster.y = Math.max(0, Math.sin((cyc / cycleDur) * Math.PI * 2) * 1.15);
            caster.grounded = caster.y < 0.05;
            caster.x = -1.9 + Math.sin(cyc * 2.4) * 0.85;
            caster.z = Math.cos(cyc * 2.4) * 0.85;
            if (cyc > 0.4 && cyc < 0.55) {
              triggerOnce('mar-pas', () => {
                vfx.spawnShockwave(caster.x, caster.y + 0.4, caster.z, 0x38bdf8, 0.4, 2.2, 0.45);
              });
            }
          } else if (fid === 'prime') {
            caster.superArmor = true;
            caster.x = -1.9 + Math.min(1.8, cyc * 1.2);
            if (cyc > 1.1 && cyc < 1.28) {
              triggerOnce('pri-pas', () => {
                vfx.spawnShockwave(caster.x, 0.25, caster.z, 0xf43f5e, 0.5, 3.0, 0.48);
                vfx.spawnCracks(caster.x, 0.05, caster.z, 0xf97316, 4, 1.0, 0.8);
              });
            }
          } else if (fid === 'damen') {
            caster.speedBoostTimer = 1.0;
            caster.z = Math.sin(cyc * 3.8) * 1.3;
            if (cyc > 0.7 && cyc < 0.85) {
              triggerOnce('dam-pas', () => {
                vfx.spawnTracer(caster.x + 0.5, 1.0, caster.z, dummy.x, 1.0, dummy.z, 0xfacc15, 0.22);
                triggerFighterHitFlash(dRig, 0.14);
              });
            }
          } else {
            caster.speedBoostTimer = 1.0;
            caster.x = cyc < 1.3 ? -1.9 : 3.2;
            caster.rotY = cyc < 1.3 ? Math.PI * 0.5 : -Math.PI * 0.5;
            if (cyc >= 1.3 && cyc < 1.45) {
              triggerOnce('khen-pas', () => {
                vfx.spawnGhost(-1.8, 0, 0, 0xa855f7, 2.8, 0, 0, 0.36, 0.65);
                emitDemoEvent({
                  kind: 'hit',
                  attackerId: caster.playerId,
                  targetId: dummy.playerId,
                  fighterId: fid,
                  x: dummy.x,
                  y: 1.0,
                  z: dummy.z,
                  colorHex: 0xa855f7,
                  damage: 18,
                  isBackstab: true,
                });
                triggerFighterHitFlash(dRig, 0.16);
              });
            }
          }
        } else if (tab === 'm1') {
          caster.x = 0.25;
          const step = Math.min(4, Math.floor(cyc / 0.65) + 1) as 1 | 2 | 3 | 4;
          const localT = cyc % 0.65;
          if (localT < 0.36) {
            caster.actionState = 'attack';
            caster.abilitySlot = 0;
            caster.comboStep = step;
            caster.actionTimer = 0.36 - localT;
            caster.actionDuration = 0.36;
          }
          if (fid === 'damen' || fid === 'marjohn') {
            caster.x = -1.8;
          }
          if (localT > 0.14 && localT < 0.26) {
            triggerOnce(`m1-${step}`, () => {
              if (fid === 'damen' || fid === 'marjohn') {
                vfx.spawnTracer(caster.x + 0.6, 1.0, 0, dummy.x, 1.0, 0, spec.hex, 0.22);
              }
              emitDemoEvent({
                kind: 'hit',
                attackerId: caster.playerId,
                targetId: dummy.playerId,
                fighterId: fid,
                x: dummy.x,
                y: 1.0,
                z: dummy.z,
                colorHex: spec.hex,
                abilitySlot: 0,
                damage: step === 4 ? 16 : 9,
                isCrit: step === 4,
              });
              triggerFighterHitFlash(dRig, 0.14);
            });
          }
          if (localT >= 0.16 && localT <= 0.42) {
            dummy.actionState = 'stagger';
            dummy.x = 2.0 + (localT - 0.16) * 1.4;
          }
        } else if (tab === 'skill1' || tab === 'skill2' || tab === 'ultimate' || tab === 'awakening') {
          const slot: 2 | 3 | 4 | 6 =
            tab === 'skill1' ? 2 : tab === 'skill2' ? 3 : tab === 'ultimate' ? 4 : 6;
          if (tab === 'awakening') {
            caster.awakened = true;
          }
          if (cyc < 1.15) {
            caster.actionState = slot === 4 || slot === 6 ? 'ultimate' : 'skill';
            caster.abilitySlot = slot;
            caster.actionDuration = 1.15;
            caster.actionTimer = 1.15 - cyc;
            if (fid === 'prime' && (slot === 2 || slot === 4)) {
              caster.x = THREE.MathUtils.lerp(-1.9, 0.65, Math.min(1, cyc / 0.55));
            }
          }
          if (cyc > 0.2 && cyc < 0.35) {
            triggerOnce(`cast-${slot}`, () => {
              emitDemoEvent({
                kind: 'cast',
                attackerId: caster.playerId,
                fighterId: fid,
                x: caster.x,
                y: caster.y,
                z: caster.z,
                dirX: 1,
                dirZ: 0,
                colorHex: spec.hex,
                abilitySlot: slot,
              });
              if (slot === 4 || slot === 6) {
                if (fid === 'jm') {
                  vfx.spawnBeam(caster.x + 0.6, 1.05, 0, 1, 0, 0x38bdf8);
                } else if (fid === 'prime') {
                  vfx.spawnCraterSlam(dummy.x, 0.04, 0, 3.6, 0xf43f5e);
                } else if (fid === 'marjohn') {
                  vfx.spawnVortexDebris(dummy.x, 0.4, 0, 3.2, 0x22d3ee, 12);
                } else if (fid === 'khen') {
                  vfx.spawnSlash(dummy.x, 1.05, 0, 0xa855f7, 2.2);
                } else {
                  vfx.spawnTracer(caster.x + 0.5, 1.0, 0, dummy.x, 1.0, 0, 0xfacc15, 0.3);
                }
              }
            });
          }
          if (cyc > 0.55 && cyc < 0.72) {
            triggerOnce(`hit-${slot}`, () => {
              emitDemoEvent({
                kind: 'hit',
                attackerId: caster.playerId,
                targetId: dummy.playerId,
                fighterId: fid,
                x: dummy.x,
                y: 1.05,
                z: dummy.z,
                colorHex: spec.hex,
                abilitySlot: slot,
                damage: slot >= 4 ? 34 : 22,
                isCrit: true,
              });
              triggerFighterHitFlash(dRig, 0.18);
            });
          }
          if (cyc >= 0.58 && cyc <= 1.25) {
            dummy.actionState = 'stagger';
            dummy.x = 2.0 + Math.sin(((cyc - 0.58) / 0.67) * Math.PI) * 0.9;
          }
        } else if (tab === 'domain') {
          const domCfg = DOMAIN_CONFIGS[fid];
          const domRadius = 5.4;
          const jmLines: NonNullable<DomainExpansionState['jmWebLines']> = [];
          const khenClones: NonNullable<DomainExpansionState['khenClones']> = [];

          if (fid === 'jm') {
            caster.jmDashActive = true;
            const anchors = [
              [-3.8, -2.4],
              [3.9, 1.8],
              [-3.2, 3.1],
              [3.6, -2.8],
              [-4.4, 0.2],
              [4.2, 0.4],
            ];
            const leg = Math.floor(cyc / 0.52);
            const legAlpha = (cyc % 0.52) / 0.52;
            const p0 = anchors[leg % anchors.length];
            const p1 = anchors[(leg + 1) % anchors.length];
            caster.x = THREE.MathUtils.lerp(p0[0], p1[0], legAlpha);
            caster.z = THREE.MathUtils.lerp(p0[1], p1[1], legAlpha);
            caster.rotY = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]);
            caster.actionState = 'dash';
            for (let li = 0; li <= Math.min(anchors.length - 1, leg); li++) {
              const a = anchors[li % anchors.length];
              const b = anchors[(li + 1) % anchors.length];
              jmLines.push({
                x1: a[0],
                z1: a[1],
                x2: li === leg ? caster.x : b[0],
                z2: li === leg ? caster.z : b[1],
                life: 999,
                maxLife: 999,
              });
            }
            if (leg !== jmLegIdx) {
              jmLegIdx = leg;
              vfx.spawnShockTorus(p0[0], 0.5, p0[1], 0xfacc15, 1.15);
            }
            dummy.x = 0.2;
            dummy.z = 0.1;
          } else if (fid === 'prime') {
            caster.primeDomainBuff = true;
            caster.x = -0.9;
            caster.actionState = cyc % 0.8 < 0.3 ? 'attack' : 'move';
            caster.actionTimer = 0.3;
            caster.actionDuration = 0.3;
            dummy.x = 1.6;
            meteorTimer -= dt;
            if (meteorTimer <= 0) {
              meteorTimer = 0.85;
              const mx = 0.6 + Math.cos(cyc * 2.7) * 1.9;
              const mz = Math.sin(cyc * 3.1) * 1.9;
              emitDemoEvent({
                kind: 'meteorFist',
                attackerId: caster.playerId,
                fighterId: 'prime',
                x: mx,
                y: 0,
                z: mz,
                colorHex: 0xf97316,
                radius: 2.2,
              });
            }
          } else if (fid === 'khen') {
            caster.x = -1.6;
            dummy.x = 1.4;
            for (let c = 0; c < 3; c++) {
              const ang = cyc * 1.8 + (c * Math.PI * 2) / 3;
              khenClones.push({
                id: `demo-kc-${c}`,
                x: Math.cos(ang) * 2.4,
                y: 0,
                z: Math.sin(ang) * 2.4,
                rotY: Math.atan2(dummy.x - Math.cos(ang) * 2.4, dummy.z - Math.sin(ang) * 2.4),
                actionState: cyc % 0.7 < 0.3 ? 'attack' : 'dash',
                swingTimer: 0.2,
              });
            }
          } else if (fid === 'damen') {
            caster.x = -2.0;
            dummy.x = 1.8;
            if (Math.floor(cyc * 2.5) > Math.floor((cyc - dt) * 2.5)) {
              vfx.spawnTracer(caster.x + 0.5, 1.0, Math.sin(cyc) * 0.4, dummy.x, 1.0, 0, 0xfacc15, 0.24);
              triggerFighterHitFlash(dRig, 0.1);
            }
          } else {
            caster.x = -1.4;
            dummy.x = 1.4;
            if (Math.floor(cyc * 1.6) > Math.floor((cyc - dt) * 1.6)) {
              vfx.spawnVortexDebris(0.5, 0.4, 0, 3.0, 0x22d3ee, 8);
            }
          }

          activeDomain = {
            id: `demo-dom-${fid}`,
            ownerId: caster.playerId,
            ownerName: spec.name,
            fighterId: fid,
            domainName: domCfg.domainName,
            centerX: 0,
            centerZ: 0,
            radius: domRadius,
            remaining: cycleDur - cyc,
            duration: cycleDur,
            sureHitTimer: 0,
            primaryHex: domCfg.primaryHex,
            secondaryHex: domCfg.secondaryHex,
            jackpotActive: fid === 'damen',
            khenClones,
            jmWebLines: jmLines,
          };
        }

        if (caster.awakened) {
          auraTickTimer -= dt;
          if (auraTickTimer <= 0) {
            auraTickTimer = 0.22;
            const auraHex = AWAKENING_CONFIG.AWAKENED_KITS[fid]?.auraPrimaryHex ?? spec.hex;
            vfx.emitAwakenedStatusParticles(caster.x, caster.y, caster.z, auraHex, fid);
          }
        }

        vfx.syncDomainExpansion(activeDomain, 'shibuya', now * 0.001);
        vfx.update(dt);

        const cPose = computeActorPose(caster, cRig, now * 0.001, now * 0.001);
        poseFighter(cRig, cPose, 'shibuya', now * 0.001);
        cRig.overheadSprite.visible = false;

        const dPose = computeActorPose(dummy, dRig, now * 0.001, now * 0.001);
        poseFighter(dRig, dPose, 'shibuya', now * 0.001);
        dRig.overheadSprite.visible = false;

        // Smooth camera angle: overhead for JM domain, isometric showcase otherwise
        const baseCamDist = tab === 'domain' ? 11.4 : 8.4;
        const camPitch = tab === 'domain' && fid === 'jm' ? 0.96 : 0.62;
        const yaw = tab === 'domain' && fid === 'jm' ? 0 : orbitYaw + Math.sin(now * 0.00035) * 0.16;
        camera.position.set(
          Math.sin(yaw) * Math.cos(camPitch) * baseCamDist,
          Math.sin(camPitch) * baseCamDist + 0.9,
          Math.cos(yaw) * Math.cos(camPitch) * baseCamDist
        );
        camera.lookAt(0, 0.85, 0);

        renderer.render(scene, camera);
        if (isSoftwareGl) {
          afterDraw(tick);
        } else {
          frameId = requestAnimationFrame(tick);
        }
      };

      const onVisibility = () => {
        if (!document.hidden && active) {
          cancelAnimationFrame(frameId);
          clearTimeout(frameId);
          prevMs = performance.now();
          tick();
        }
      };
      document.addEventListener('visibilitychange', onVisibility);
      tick();

      return () => {
        active = false;
        cancelAnimationFrame(frameId);
        clearTimeout(frameId);
        document.removeEventListener('visibilitychange', onVisibility);
        ro?.disconnect();
        window.removeEventListener('resize', resize);
        renderer.domElement.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        if (casterRig) disposeFighterRig(casterRig, scene);
        if (dummyRig) disposeFighterRig(dummyRig, scene);
        floorGeo.dispose();
        floorMat.dispose();
        ringOuterGeo.dispose();
        ringOuterMat.dispose();
        ringInnerGeo.dispose();
        ringInnerMat.dispose();
        envTex.dispose();
        vfx.dispose();
        renderer.dispose();
      };
    }, []);

    return (
      <div
        ref={mountRef}
        data-testid="skill-demo-canvas"
        className="w-full h-full min-h-[210px] rounded-xl overflow-hidden bg-slate-950 touch-none-select cursor-grab active:cursor-grabbing"
      />
    );
  }
);

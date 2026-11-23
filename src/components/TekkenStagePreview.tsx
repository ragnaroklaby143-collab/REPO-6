import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FIGHTER_BY_ID, FighterId, SkinId } from '../shared/gameData.ts';
import {
  FighterRig,
  createArticulatedFighter,
  disposeFighterRig,
  getStancePose,
  poseFighter,
} from '../game/fighterBuilder.ts';
import { detectSoftwareWebGL } from '../game/mapBuilder.ts';
import { detectQualityTier, resolveRenderProfile } from '../game/perfConfig.ts';

interface TekkenStagePreviewProps {
  fighterId: FighterId;
  skinId: SkinId;
}

export const TekkenStagePreview: React.FC<TekkenStagePreviewProps> = React.memo(({ fighterId, skinId }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const fighterIdRef = useRef<FighterId>(fighterId);
  const skinIdRef = useRef<SkinId>(skinId);
  const dragYawRef = useRef<number>(0);
  const swapPulseRef = useRef<number>(0);

  fighterIdRef.current = fighterId;
  skinIdRef.current = skinId;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const hasCoarsePointer =
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
    const navWithMem = navigator as Navigator & { deviceMemory?: number };
    const qualityTier = detectQualityTier({
      isSoftwareGl,
      viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1280,
      viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 720,
      devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      hardwareConcurrency: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4,
      deviceMemoryGb: navWithMem?.deviceMemory,
      hasCoarsePointer,
    });
    const profile = resolveRenderProfile(
      qualityTier,
      typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    );
    const renderer = new THREE.WebGLRenderer({
      antialias: profile.antialias,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.setPixelRatio(profile.initialPixelRatio);
    renderer.shadowMap.enabled = profile.shadowMapEnabled;

    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 40);
    camera.position.set(0, 1.45, 4.4);
    camera.lookAt(0, 1.0, 0);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 1.2);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff7e6, 1.65);
    key.position.set(3, 5, 4);
    key.castShadow = profile.shadowMapEnabled;
    scene.add(key);

    const rim = new THREE.DirectionalLight(0x38bdf8, 0.95);
    rim.position.set(-3.5, 3, -3.5);
    scene.add(rim);

    // Light Marble / Slate Pedestal Base
    const pedestalGeom = new THREE.CylinderGeometry(1.15, 1.38, 0.24, 6);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.25,
      roughness: 0.42,
    });
    const pedestal = new THREE.Mesh(pedestalGeom, pedestalMat);
    pedestal.position.y = -0.12;
    pedestal.receiveShadow = true;
    scene.add(pedestal);

    const ringGeom = new THREE.RingGeometry(1.06, 1.2, 6);
    const ringMat = new THREE.MeshBasicMaterial({
      color: FIGHTER_BY_ID[fighterId].hex,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.rotation.x = -Math.PI * 0.5;
    ring.position.y = 0.01;
    scene.add(ring);

    const pulseRingGeom = new THREE.RingGeometry(1.0, 1.15, 24);
    const pulseRingMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const pulseRing = new THREE.Mesh(pulseRingGeom, pulseRingMat);
    pulseRing.rotation.x = -Math.PI * 0.5;
    pulseRing.position.y = 0.03;
    scene.add(pulseRing);

    let activeRig: FighterRig | null = null;
    let builtFighter: FighterId | null = null;
    let builtSkin: SkinId | null = null;

    const ensureActiveRig = (fid: FighterId, sid: SkinId) => {
      if (activeRig && builtFighter === fid && builtSkin === sid) return activeRig;
      if (activeRig) {
        disposeFighterRig(activeRig, scene);
      }
      activeRig = createArticulatedFighter(fid, scene, sid, false);
      activeRig.overheadSprite.visible = false;
      builtFighter = fid;
      builtSkin = sid;
      swapPulseRef.current = 1.0;
      return activeRig;
    };

    ensureActiveRig(fighterIdRef.current, skinIdRef.current);

    const resize = () => {
      const w = Math.max(100, container.clientWidth);
      const h = Math.max(100, container.clientHeight);
      const aspect = w / h;
      camera.aspect = aspect;
      camera.fov = aspect < 1.0 ? 48 : 40;
      const dist = aspect < 1.0 ? 5.15 : 4.2;
      camera.position.set(0, 1.38, dist);
      camera.lookAt(0, 0.96, 0);
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
    window.addEventListener('orientationchange', resize);

    let dragging = false;
    let lastX = 0;
    let dragVel = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      dragVel = 0;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const delta = (e.clientX - lastX) * 0.012;
      dragYawRef.current += delta;
      dragVel = delta;
      lastX = e.clientX;
    };
    const onUp = () => {
      dragging = false;
    };
    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    let frameId = 0;
    let active = true;
    const startMs = performance.now();
    let prevMs = startMs;

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
          if (state === gl.UNSIGNALED && polls < 40) {
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
      const nowMs = performance.now();
      const dt = Math.min((nowMs - prevMs) / 1000, 0.05);
      prevMs = nowMs;
      const t = (nowMs - startMs) / 1000;
      const curId = fighterIdRef.current;
      const curSkin = skinIdRef.current;
      const spec = FIGHTER_BY_ID[curId];
      ringMat.color.setHex(spec.hex);
      rim.color.setHex(spec.hex);

      const rig = ensureActiveRig(curId, curSkin);

      if (swapPulseRef.current > 0.01) {
        swapPulseRef.current = Math.max(0, swapPulseRef.current - dt * 2.8);
        const p = 1 - swapPulseRef.current;
        pulseRing.scale.setScalar(1 + p * 0.9);
        pulseRingMat.color.setHex(spec.hex);
        pulseRingMat.opacity = swapPulseRef.current * 0.75;
      } else {
        pulseRingMat.opacity = 0;
      }

      if (!dragging) {
        dragYawRef.current += dragVel + 0.48 * dt;
        dragVel *= Math.exp(-6.5 * dt);
      }

      const pose = getStancePose(curId, t);
      pose.rotY = Math.sin(t * 0.6) * 0.3 + dragYawRef.current;
      poseFighter(rig, pose, null, t);
      rig.overheadSprite.visible = false;

      renderer.render(scene, camera);
      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };
    const onVisibilityChange = () => {
      if (!document.hidden && active) {
        cancelAnimationFrame(frameId);
        clearTimeout(frameId);
        prevMs = performance.now();
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    tick();

    return () => {
      active = false;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      ro?.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
      dom.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (activeRig) disposeFighterRig(activeRig, scene);
      pedestalGeom.dispose();
      pedestalMat.dispose();
      ringGeom.dispose();
      ringMat.dispose();
      pulseRingGeom.dispose();
      pulseRingMat.dispose();
      envTex.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      data-testid="stage-preview"
      className="w-full h-full min-h-[150px] overflow-hidden touch-none-select cursor-grab active:cursor-grabbing"
    />
  );
});

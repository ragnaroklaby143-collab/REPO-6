import type { FighterId } from '../shared/gameData.ts';
import { AWAKENING_CONFIG } from '../shared/awakeningConfig.ts';

export type SoundKind =
  | 'hit'
  | 'heavy'
  | 'parry'
  | 'evade'
  | 'trap'
  | 'trapTrigger'
  | 'block'
  | 'grab'
  | 'whiff'
  | 'stun'
  | 'clash'
  | 'overdrive'
  | 'comboLink'
  | 'hazard'
  | 'dash'
  | 'jump'
  | 'pickup'
  | 'gunshot'
  | 'whoosh'
  | 'shockwave'
  | 'beam'
  | 'ko'
  | 'tick'
  | 'victory'
  | 'uiClick'
  | 'uiSelect'
  | 'transitionWhoosh'
  | 'fightHorn'
  | 'chatPop'
  | 'grabMash'
  | 'loginSuccess'
  | 'lockedError'
  | 'orbSpawnRumble'
  | 'orbPickupChime'
  | 'awakeningTransform'
  | 'clashBoom'
  | 'mashTick'
  | 'knockbackImpact'
  | 'thunderStrike'
  | 'railgunShot'
  | 'silence'
  | 'domainExpand'
  | 'domainClash'
  | 'jackpot';

class SoundEngine {
  private ctx: AudioContext | null = null;
  public muted = false;
  private sfxDuckMult = 1.0;

  public getContext(): AudioContext | null {
    return this.ctx;
  }

  public setDucking(ducked: boolean): void {
    this.sfxDuckMult = ducked ? 0.34 : 1.0;
  }

  public unlock(): void {
    try {
      if (typeof window === 'undefined') return;
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
    } catch {
      // AudioContext unavailable
    }
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    janeCutsceneAudio.setMuted(this.muted);
    return this.muted;
  }

  private jitter(freq: number): number {
    return freq * (0.92 + Math.random() * 0.16);
  }

  public playCountdownTick(step: number): void {
    if (this.muted) return;
    this.unlock();
    const ctx = this.ctx;
    if (!ctx) return;

    const now = ctx.currentTime;
    const pitches: Record<number, number> = {
      5: 440,
      4: 493.88,
      3: 554.37,
      2: 622.25,
      1: 739.99,
    };
    const freq = pitches[step] ?? 520;
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    sub.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.06, now + 0.12);
    sub.frequency.setValueAtTime(freq * 0.5, now);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
    osc.connect(gain);
    sub.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    sub.start(now);
    osc.stop(now + 0.2);
    sub.stop(now + 0.2);
  }

  public playFighterHit(fighterId: FighterId | undefined, isCrit: boolean): void {
    if (this.muted) return;
    this.unlock();
    const ctx = this.ctx;
    if (!ctx) return;

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    if (fighterId === 'damen') {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(this.jitter(isCrit ? 880 : 680), now);
      osc.frequency.exponentialRampToValueAtTime(95, now + 0.11);
      gain.gain.setValueAtTime(isCrit ? 0.24 : 0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.13);
      return;
    }

    if (fighterId === 'marjohn') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(this.jitter(isCrit ? 620 : 480), now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.16);
      gain.gain.setValueAtTime(isCrit ? 0.22 : 0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.18);
      return;
    }

    if (fighterId === 'prime') {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(this.jitter(isCrit ? 150 : 190), now);
      osc.frequency.exponentialRampToValueAtTime(36, now + 0.22);
      gain.gain.setValueAtTime(isCrit ? 0.32 : 0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.25);
      return;
    }

    if (fighterId === 'khen') {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(this.jitter(isCrit ? 1120 : 860), now);
      osc.frequency.exponentialRampToValueAtTime(190, now + 0.1);
      gain.gain.setValueAtTime(isCrit ? 0.21 : 0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.12);
      return;
    }

    // JM / default crisp martial strike
    this.play(isCrit ? 'heavy' : 'hit');
  }

  public play(kind: SoundKind): void {
    if (this.muted) return;
    this.unlock();
    const ctx = this.ctx;
    if (!ctx) return;

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    const masterDuck = ctx.createGain();
    masterDuck.gain.setValueAtTime(this.sfxDuckMult, now);
    gain.connect(masterDuck);
    masterDuck.connect(ctx.destination);

    if (kind === 'uiClick') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(760, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.045);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.06);
      return;
    }

    if (kind === 'uiSelect') {
      [587.33, 880].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.035);
        g.gain.setValueAtTime(0.11, now + idx * 0.035);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.035 + 0.11);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now + idx * 0.035);
        osc.stop(now + idx * 0.035 + 0.12);
      });
      return;
    }

    if (kind === 'transitionWhoosh') {
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.type = 'sine';
      o2.type = 'triangle';
      o1.frequency.setValueAtTime(190, now);
      o1.frequency.exponentialRampToValueAtTime(620, now + 0.16);
      o1.frequency.exponentialRampToValueAtTime(240, now + 0.34);
      o2.frequency.setValueAtTime(340, now);
      o2.frequency.exponentialRampToValueAtTime(840, now + 0.18);
      gain.gain.setValueAtTime(0.005, now);
      gain.gain.linearRampToValueAtTime(0.14, now + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      o1.connect(gain);
      o2.connect(gain);
      o1.start(now);
      o2.start(now);
      o1.stop(now + 0.37);
      o2.stop(now + 0.37);
      return;
    }

    if (kind === 'fightHorn') {
      [261.63, 392.0, 523.25, 783.99].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = idx < 2 ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.03, now + 0.25);
        g.gain.setValueAtTime(idx === 0 ? 0.18 : 0.11, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.5);
      });
      return;
    }

    if (kind === 'chatPop') {
      [740, 1046.5].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.045);
        g.gain.setValueAtTime(0.08, now + idx * 0.045);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.045 + 0.08);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now + idx * 0.045);
        osc.stop(now + idx * 0.045 + 0.09);
      });
      return;
    }

    if (kind === 'grabMash') {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(this.jitter(360), now);
      osc.frequency.exponentialRampToValueAtTime(590, now + 0.065);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.085);
      return;
    }

    if (kind === 'loginSuccess') {
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.06);
        g.gain.setValueAtTime(0.13, now + idx * 0.06);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.2);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.22);
      });
      return;
    }

    if (kind === 'lockedError') {
      [210, 165].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        g.gain.setValueAtTime(0.11, now + idx * 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.09);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.1);
      });
      return;
    }

    if (kind === 'hit' || kind === 'heavy') {
      const osc = ctx.createOscillator();
      osc.type = kind === 'heavy' ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(this.jitter(kind === 'heavy' ? 210 : 300), now);
      osc.frequency.exponentialRampToValueAtTime(48, now + (kind === 'heavy' ? 0.22 : 0.13));
      gain.gain.setValueAtTime(kind === 'heavy' ? 0.28 : 0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (kind === 'heavy' ? 0.24 : 0.14));
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.25);
      return;
    }

    if (kind === 'parry' || kind === 'clash') {
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.type = 'sine';
      o2.type = 'triangle';
      o1.frequency.setValueAtTime(kind === 'clash' ? 760 : 980, now);
      o1.frequency.exponentialRampToValueAtTime(kind === 'clash' ? 1920 : 1640, now + 0.18);
      o2.frequency.setValueAtTime(1480, now);
      o2.frequency.exponentialRampToValueAtTime(2400, now + 0.2);
      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      o1.connect(gain);
      o2.connect(gain);
      o1.start(now);
      o2.start(now);
      o1.stop(now + 0.29);
      o2.stop(now + 0.29);
      return;
    }

    if (kind === 'evade') {
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.type = 'sine';
      o2.type = 'triangle';
      o1.frequency.setValueAtTime(640, now);
      o1.frequency.exponentialRampToValueAtTime(1480, now + 0.15);
      o2.frequency.setValueAtTime(1120, now);
      o2.frequency.exponentialRampToValueAtTime(1880, now + 0.14);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      o1.connect(gain);
      o2.connect(gain);
      o1.start(now);
      o2.start(now);
      o1.stop(now + 0.21);
      o2.stop(now + 0.21);
      return;
    }

    if (kind === 'trap' || kind === 'trapTrigger') {
      const osc = ctx.createOscillator();
      osc.type = kind === 'trap' ? 'triangle' : 'sawtooth';
      osc.frequency.setValueAtTime(kind === 'trap' ? 280 : 720, now);
      osc.frequency.exponentialRampToValueAtTime(kind === 'trap' ? 460 : 140, now + 0.16);
      gain.gain.setValueAtTime(kind === 'trap' ? 0.14 : 0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.19);
      return;
    }

    if (kind === 'grab') {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(this.jitter(240), now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.15);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.17);
      return;
    }

    if (kind === 'whiff') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(this.jitter(340), now);
      osc.frequency.exponentialRampToValueAtTime(130, now + 0.14);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.16);
      return;
    }

    if (kind === 'stun' || kind === 'overdrive' || kind === 'comboLink') {
      const freqs = kind === 'overdrive' ? [330, 495, 660, 990] : kind === 'comboLink' ? [520, 780] : [440, 310];
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + idx * 0.05);
        g.gain.setValueAtTime(0.16, now + idx * 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.22);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now + idx * 0.05);
        osc.stop(now + idx * 0.05 + 0.24);
      });
      return;
    }

    if (kind === 'block') {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(this.jitter(520), now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.09);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.11);
      return;
    }

    if (kind === 'jump') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(this.jitter(220), now);
      osc.frequency.exponentialRampToValueAtTime(480, now + 0.12);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.15);
      return;
    }

    if (kind === 'pickup') {
      [587.33, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.06);
        g.gain.setValueAtTime(0.14, now + i * 0.06);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.18);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now + i * 0.06);
        osc.stop(now + i * 0.06 + 0.19);
      });
      return;
    }

    if (kind === 'dash' || kind === 'whoosh') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(this.jitter(420), now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.16);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.18);
      return;
    }

    if (kind === 'gunshot') {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(this.jitter(640), now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.09);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.11);
      return;
    }

    if (kind === 'shockwave' || kind === 'beam' || kind === 'hazard') {
      const osc = ctx.createOscillator();
      osc.type = kind === 'beam' || kind === 'hazard' ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(kind === 'beam' ? 320 : kind === 'hazard' ? 240 : 140, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + (kind === 'beam' ? 0.55 : 0.34));
      gain.gain.setValueAtTime(0.26, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (kind === 'beam' ? 0.56 : 0.35));
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.58);
      return;
    }

    if (kind === 'ko') {
      [220, 165, 110].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + idx * 0.07);
        osc.frequency.exponentialRampToValueAtTime(45, now + idx * 0.07 + 0.35);
        g.gain.setValueAtTime(0.18, now + idx * 0.07);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.36);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now + idx * 0.07);
        osc.stop(now + idx * 0.07 + 0.38);
      });
      return;
    }

    if (kind === 'tick') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, now);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.1);
      return;
    }

    if (kind === 'victory') {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.09);
        g.gain.setValueAtTime(0.16, now + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.45);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now + i * 0.09);
        osc.stop(now + i * 0.09 + 0.48);
      });
      return;
    }

    if (kind === 'orbSpawnRumble') {
      const sub = ctx.createOscillator();
      const harm = ctx.createOscillator();
      sub.type = 'sawtooth';
      harm.type = 'triangle';
      sub.frequency.setValueAtTime(88, now);
      sub.frequency.exponentialRampToValueAtTime(34, now + 0.95);
      harm.frequency.setValueAtTime(176, now);
      harm.frequency.exponentialRampToValueAtTime(64, now + 0.85);
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.32, now + 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
      sub.connect(gain);
      harm.connect(gain);
      sub.start(now);
      harm.start(now);
      sub.stop(now + 1.02);
      harm.stop(now + 1.02);
      return;
    }

    if (kind === 'orbPickupChime' || kind === 'awakeningTransform') {
      if (kind === 'awakeningTransform') {
        // Deep sub-bass drop + rising resonant surge + celestial octave chord
        const sub = ctx.createOscillator();
        const subGain = ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(165, now);
        sub.frequency.exponentialRampToValueAtTime(34, now + 0.58);
        subGain.gain.setValueAtTime(0.42, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
        sub.connect(subGain);
        subGain.connect(masterDuck);
        sub.start(now);
        sub.stop(now + 0.68);

        const sweep = ctx.createOscillator();
        const sweepFilter = ctx.createBiquadFilter();
        const sweepGain = ctx.createGain();
        sweep.type = 'sawtooth';
        sweep.frequency.setValueAtTime(145, now);
        sweep.frequency.exponentialRampToValueAtTime(740, now + 0.34);
        sweepFilter.type = 'bandpass';
        sweepFilter.frequency.setValueAtTime(420, now);
        sweepFilter.frequency.exponentialRampToValueAtTime(2400, now + 0.34);
        sweepFilter.Q.value = 2.4;
        sweepGain.gain.setValueAtTime(0.24, now);
        sweepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
        sweep.connect(sweepFilter);
        sweepFilter.connect(sweepGain);
        sweepGain.connect(masterDuck);
        sweep.start(now);
        sweep.stop(now + 0.44);
      }
      const notes =
        kind === 'awakeningTransform' ? [392, 523.25, 659.25, 783.99, 1046.5, 1318.5] : [587.33, 880, 1174.66];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = i % 2 === 0 ? 'triangle' : 'sine';
        const offset = kind === 'awakeningTransform' ? i * 0.048 : i * 0.055;
        osc.frequency.setValueAtTime(freq, now + offset);
        g.gain.setValueAtTime(kind === 'awakeningTransform' ? 0.19 : 0.16, now + offset);
        g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.42);
        osc.connect(g);
        g.connect(masterDuck);
        osc.start(now + offset);
        osc.stop(now + offset + 0.44);
      });
      return;
    }

    if (kind === 'clashBoom' || kind === 'knockbackImpact') {
      const sub = ctx.createOscillator();
      const crack = ctx.createOscillator();
      sub.type = 'sine';
      crack.type = 'sawtooth';
      sub.frequency.setValueAtTime(140, now);
      sub.frequency.exponentialRampToValueAtTime(30, now + 0.52);
      crack.frequency.setValueAtTime(480, now);
      crack.frequency.exponentialRampToValueAtTime(75, now + 0.25);
      gain.gain.setValueAtTime(0.38, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.56);
      sub.connect(gain);
      crack.connect(gain);
      sub.start(now);
      crack.start(now);
      sub.stop(now + 0.58);
      crack.stop(now + 0.58);
      return;
    }

    if (kind === 'mashTick') {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(this.jitter(620), now);
      osc.frequency.exponentialRampToValueAtTime(980, now + 0.04);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.06);
      return;
    }

    if (kind === 'thunderStrike' || kind === 'railgunShot' || kind === 'silence') {
      const osc = ctx.createOscillator();
      osc.type = kind === 'silence' ? 'sine' : 'sawtooth';
      osc.frequency.setValueAtTime(kind === 'railgunShot' ? 1240 : kind === 'silence' ? 760 : 520, now);
      osc.frequency.exponentialRampToValueAtTime(kind === 'silence' ? 180 : 62, now + 0.24);
      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.28);
      return;
    }

    if (kind === 'domainExpand' || kind === 'domainClash') {
      const sub = ctx.createOscillator();
      const chime = ctx.createOscillator();
      const sweep = ctx.createOscillator();
      sub.type = 'sine';
      chime.type = 'triangle';
      sweep.type = 'sawtooth';
      sub.frequency.setValueAtTime(kind === 'domainExpand' ? 140 : 180, now);
      sub.frequency.exponentialRampToValueAtTime(32, now + 0.72);
      chime.frequency.setValueAtTime(kind === 'domainExpand' ? 440 : 587, now);
      chime.frequency.exponentialRampToValueAtTime(kind === 'domainExpand' ? 1320 : 1760, now + 0.45);
      sweep.frequency.setValueAtTime(110, now);
      sweep.frequency.exponentialRampToValueAtTime(660, now + 0.55);
      gain.gain.setValueAtTime(0.32, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.76);
      sub.connect(gain);
      chime.connect(gain);
      sweep.connect(gain);
      sub.start(now);
      chime.start(now);
      sweep.start(now);
      sub.stop(now + 0.78);
      chime.stop(now + 0.5);
      sweep.stop(now + 0.6);
      return;
    }

    if (kind === 'jackpot') {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        const t = now + i * 0.045;
        osc.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.18, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.26);
      });
    }
  }
}

class JaneCutsceneAudio {
  private audio: HTMLAudioElement | null = null;
  private gainNode: GainNode | null = null;
  private sourceConnected = false;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private targetVolume = 0.88;
  private fadingOut = false;

  private ensureAudio(): HTMLAudioElement | null {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
    if (!this.audio) {
      const el = new Audio(AWAKENING_CONFIG.AUDIO_PATH);
      el.preload = 'auto';
      el.loop = false;
      this.audio = el;
      try {
        soundEngine.unlock();
        const ctx = soundEngine.getContext();
        if (ctx && !this.sourceConnected) {
          const src = ctx.createMediaElementSource(el);
          const gain = ctx.createGain();
          gain.gain.value = soundEngine.muted ? 0 : this.targetVolume;
          src.connect(gain);
          gain.connect(ctx.destination);
          this.gainNode = gain;
          this.sourceConnected = true;
        }
      } catch {
        // Fallback to native HTMLAudioElement volume
      }
    }
    return this.audio;
  }

  public async start(): Promise<boolean> {
    this.clearFadeTimer();
    this.fadingOut = false;
    const el = this.ensureAudio();
    if (!el) return false;
    try {
      soundEngine.unlock();
      el.pause();
      el.currentTime = 0;
      const vol = soundEngine.muted ? 0 : this.targetVolume;
      if (this.gainNode) {
        this.gainNode.gain.value = vol;
      } else {
        el.volume = vol;
      }
      await el.play();
      return true;
    } catch {
      return false;
    }
  }

  public isPlaying(): boolean {
    return Boolean(this.audio && !this.audio.paused && !this.audio.ended);
  }

  public seekTo(clockSec: number): void {
    const el = this.ensureAudio();
    if (!el) return;
    try {
      soundEngine.unlock();
      el.currentTime = Math.max(0, clockSec);
      const vol = soundEngine.muted ? 0 : this.targetVolume;
      if (this.gainNode) {
        this.gainNode.gain.value = vol;
      } else {
        el.volume = vol;
      }
      if (el.paused) {
        void el.play().catch(() => {
          // Autoplay blocked
        });
      }
    } catch {
      // Ignore seek errors
    }
  }

  public getCurrentTime(): number | null {
    if (!this.audio || this.audio.paused || this.audio.ended) return null;
    return this.audio.currentTime;
  }

  public setMuted(muted: boolean): void {
    if (!this.audio || this.fadingOut) return;
    const vol = muted ? 0 : this.targetVolume;
    if (this.gainNode) {
      this.gainNode.gain.value = vol;
    } else {
      this.audio.volume = vol;
    }
  }

  public rampFadeOut(durationSec = 3.0): void {
    const el = this.audio;
    if (!el || el.paused) return;
    if (this.fadingOut) return;
    this.fadingOut = true;
    this.clearFadeTimer();

    const startVol = this.gainNode ? this.gainNode.gain.value : el.volume;
    if (startVol <= 0.005 || durationSec <= 0.05) {
      this.stop();
      return;
    }
    const startMs = Date.now();
    const durMs = durationSec * 1000;
    this.fadeTimer = setInterval(() => {
      const p = Math.min(1, (Date.now() - startMs) / durMs);
      const nextVol = startVol * (1 - p);
      if (this.gainNode) {
        this.gainNode.gain.value = Math.max(0, nextVol);
      } else {
        el.volume = Math.max(0, nextVol);
      }
      if (p >= 1) {
        this.stop();
      }
    }, 45);
  }

  public stop(): void {
    this.clearFadeTimer();
    this.fadingOut = false;
    if (this.audio) {
      try {
        this.audio.pause();
        this.audio.currentTime = 0;
      } catch {
        // Ignore pause error
      }
    }
  }

  private clearFadeTimer(): void {
    if (this.fadeTimer) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
  }
}

export const soundEngine = new SoundEngine();
export const janeCutsceneAudio = new JaneCutsceneAudio();


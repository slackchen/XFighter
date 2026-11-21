import type { AudioVolumes } from './types';

const STORAGE_KEY = 'cab_audio_volumes_v1';

const DEFAULT_VOLUMES: AudioVolumes = {
  master: 0.85,
  bgm: 0.65,
  sfx: 0.85,
  announcer: 0.9,
};

const SFX_KEYS = [
  'ui_move',
  'ui_confirm',
  'ui_cancel',
  'ui_select_lock',
  'vs_clash',
  'dash',
  'jump',
  'land',
  'slash_light',
  'slash_heavy',
  'spear_thrust',
  'proj_sakura',
  'proj_star',
  'rising_dragon',
  'spiral_drill',
  'hit_light',
  'hit_medium',
  'hit_heavy',
  'hit_counter',
  'guard_block',
  'knockdown',
  'footstep',
  'skid',
  'super_flash',
  'super_rin_slash',
  'super_lia_beam',
  'ko_finish',
  'ann_round1',
  'ann_round2',
  'ann_final',
  'ann_fight',
  'ann_counter',
  'ann_ko',
  'ann_perfect',
  'ann_winner',
];

const BGM_KEYS = ['bgm_menu', 'bgm_battle', 'bgm_victory'] as const;
export type BgmKey = (typeof BGM_KEYS)[number];

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private announcerBus: GainNode | null = null;

  private buffers = new Map<string, AudioBuffer>();
  private loadingPromises = new Map<string, Promise<AudioBuffer | null>>();

  private activeBgm: {
    key: BgmKey;
    source: AudioBufferSourceNode;
    gain: GainNode;
  } | null = null;

  private volumes: AudioVolumes;
  private unlocked = false;
  private preloaded = false;

  constructor() {
    this.volumes = this.loadVolumes();
  }

  private loadVolumes(): AudioVolumes {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AudioVolumes>;
        return {
          master: typeof parsed.master === 'number' ? parsed.master : DEFAULT_VOLUMES.master,
          bgm: typeof parsed.bgm === 'number' ? parsed.bgm : DEFAULT_VOLUMES.bgm,
          sfx: typeof parsed.sfx === 'number' ? parsed.sfx : DEFAULT_VOLUMES.sfx,
          announcer: typeof parsed.announcer === 'number' ? parsed.announcer : DEFAULT_VOLUMES.announcer,
        };
      }
    } catch {
      // ignore storage errors
    }
    return { ...DEFAULT_VOLUMES };
  }

  getVolumes(): AudioVolumes {
    return { ...this.volumes };
  }

  setVolumes(next: Partial<AudioVolumes>): void {
    this.volumes = { ...this.volumes, ...next };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.volumes));
    } catch {
      // ignore
    }
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.masterGain || !this.bgmBus || !this.sfxBus || !this.announcerBus) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.volumes.master, now, 0.03);
    this.bgmBus.gain.setTargetAtTime(this.volumes.bgm * 0.62, now, 0.04);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, now, 0.03);
    this.announcerBus.gain.setTargetAtTime(this.volumes.announcer, now, 0.03);
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.bgmBus = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      this.announcerBus = this.ctx.createGain();

      this.bgmBus.connect(this.masterGain);
      this.sfxBus.connect(this.masterGain);
      this.announcerBus.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.applyVolumes();
    }
    return this.ctx;
  }

  async unlock(): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // ignore autoplay rejections if triggered non-gesturally
      }
    }
    this.unlocked = ctx.state === 'running';
    if (!this.preloaded) {
      this.preloaded = true;
      void this.preloadAll();
    }
  }

  isUnlocked(): boolean {
    return this.unlocked && this.ctx?.state === 'running';
  }

  private async fetchAndDecode(key: string, url: string): Promise<AudioBuffer | null> {
    const existing = this.buffers.get(key);
    if (existing) return existing;

    const pending = this.loadingPromises.get(key);
    if (pending) return pending;

    const ctx = this.ensureContext();
    if (!ctx) return null;

    const p = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const arr = await res.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arr);
        this.buffers.set(key, decoded);
        return decoded;
      } catch {
        return null;
      }
    })();

    this.loadingPromises.set(key, p);
    return p;
  }

  async preloadAll(): Promise<void> {
    const jobs: Promise<AudioBuffer | null>[] = [];
    for (const bgm of BGM_KEYS) {
      jobs.push(this.fetchAndDecode(bgm, `/assets/audio/${bgm}.mp3`));
    }
    for (const sfx of SFX_KEYS) {
      jobs.push(this.fetchAndDecode(sfx, `/assets/audio/sfx/${sfx}.mp3`));
    }
    await Promise.all(jobs);
  }

  async playBgm(key: BgmKey, loop = true, fadeSec = 0.6): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx || !this.bgmBus) return;
    if (this.activeBgm?.key === key) return;

    const url = `/assets/audio/${key}.mp3`;
    const buf = await this.fetchAndDecode(key, url);
    if (!buf) return;

    // Verify another BGM request didn't supersede while decoding
    if (this.activeBgm?.key === key) return;

    const now = ctx.currentTime;
    if (this.activeBgm) {
      const prev = this.activeBgm;
      prev.gain.gain.cancelScheduledValues(now);
      prev.gain.gain.setValueAtTime(prev.gain.gain.value, now);
      prev.gain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
      setTimeout(() => {
        try {
          prev.source.stop();
          prev.source.disconnect();
          prev.gain.disconnect();
        } catch {
          // already stopped
        }
      }, fadeSec * 1000 + 80);
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(1.0, now + fadeSec);

    src.connect(gain);
    gain.connect(this.bgmBus);
    src.start(now);

    this.activeBgm = { key, source: src, gain };
  }

  stopBgm(fadeSec = 0.4): void {
    if (!this.ctx || !this.activeBgm) return;
    const now = this.ctx.currentTime;
    const prev = this.activeBgm;
    this.activeBgm = null;
    prev.gain.gain.cancelScheduledValues(now);
    prev.gain.gain.setValueAtTime(prev.gain.gain.value, now);
    prev.gain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
    setTimeout(() => {
      try {
        prev.source.stop();
        prev.source.disconnect();
        prev.gain.disconnect();
      } catch {
        // ignore
      }
    }, fadeSec * 1000 + 80);
  }

  duckBgm(duckScale: number, durationSec: number): void {
    if (!this.ctx || !this.bgmBus) return;
    const now = this.ctx.currentTime;
    const target = this.volumes.bgm * 0.62;
    this.bgmBus.gain.cancelScheduledValues(now);
    this.bgmBus.gain.setValueAtTime(this.bgmBus.gain.value, now);
    this.bgmBus.gain.linearRampToValueAtTime(target * duckScale, now + 0.06);
    this.bgmBus.gain.setValueAtTime(target * duckScale, now + Math.max(0.08, durationSec - 0.35));
    this.bgmBus.gain.linearRampToValueAtTime(target, now + durationSec);
  }

  playSfx(key: string, pan = 0, gainScale = 1.0, pitchJitter = 0.05): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxBus || !this.announcerBus) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const buf = this.buffers.get(key);
    if (!buf) {
      void this.fetchAndDecode(key, `/assets/audio/sfx/${key}.mp3`).then((loaded) => {
        if (loaded) this.playBuffer(loaded, key, pan, gainScale, pitchJitter);
      });
      return;
    }
    this.playBuffer(buf, key, pan, gainScale, pitchJitter);
  }

  private playBuffer(
    buf: AudioBuffer,
    key: string,
    pan: number,
    gainScale: number,
    pitchJitter: number
  ): void {
    if (!this.ctx || !this.sfxBus || !this.announcerBus) return;
    const isAnnouncer = key.startsWith('ann_');
    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    if (!isAnnouncer && pitchJitter > 0) {
      src.playbackRate.value = 1.0 + (Math.random() * 2 - 1) * pitchJitter;
    }

    const gain = this.ctx.createGain();
    gain.gain.value = gainScale;

    if (typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-0.85, Math.min(0.85, pan));
      src.connect(gain);
      gain.connect(panner);
      panner.connect(isAnnouncer ? this.announcerBus : this.sfxBus);
    } else {
      src.connect(gain);
      gain.connect(isAnnouncer ? this.announcerBus : this.sfxBus);
    }

    src.start();
  }
}

export const audioManager = new AudioManager();

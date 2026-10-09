// Zero-dependency procedural Web Audio synthesizer for tactile UI and turf-war feedback

class SoundEngine {
  private ctx: AudioContext | null = null;
  // Sound is optional and defaults to muted; the first localStorage
  // write happens when the user explicitly toggles.
  private isMuted: boolean = true;
  private isUnlocked: boolean = false;

  constructor() {
    // Defer localStorage read: this module is also evaluated during SSR prerender.
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('bumped_sound_muted');
        if (saved === 'false') {
          this.isMuted = false;
        }
      } catch {
        // ignore
      }

      // Browser Autoplay Policy: auto-unlock AudioContext on first user interaction
      const unlock = () => {
        if (!this.isUnlocked) {
          this.isUnlocked = true;
          this.ensureAudioContext();
        }
        if (this.ctx && this.ctx.state === 'running') {
          window.removeEventListener('pointerdown', unlock);
          window.removeEventListener('keydown', unlock);
          window.removeEventListener('touchstart', unlock);
        }
      };

      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('keydown', unlock, { passive: true });
      window.addEventListener('touchstart', unlock, { passive: true });
    }
  }

  private ensureAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    } catch {
      // AudioContext creation might fail in restricted environments
    }
    return this.ctx;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    try {
      localStorage.setItem('bumped_sound_muted', String(this.isMuted));
    } catch {
      // ignore
    }
    if (!this.isMuted) {
      this.ensureAudioContext();
    }
    return this.isMuted;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    try {
      localStorage.setItem('bumped_sound_muted', String(this.isMuted));
    } catch {
      // ignore
    }
    if (!this.isMuted) {
      this.ensureAudioContext();
    }
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Subtle high-frequency tactile UI click
   */
  public playClick() {
    if (this.isMuted) return;
    try {
      const ctx = this.ensureAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.05);

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.05);
    } catch {
      // Audio context might be restricted before first user interaction
    }
  }

  /**
   * Shove / Displacement whoosh sound
   */
  public playShove() {
    if (this.isMuted) return;
    try {
      const ctx = this.ensureAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.22);

      gain.gain.setValueAtTime(0.22, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.22);
    } catch {
      // Silently fail
    }
  }

  /**
   * King Coronation triumphant harmonic chord
   */
  public playCoronation() {
    if (this.isMuted) return;
    try {
      const ctx = this.ensureAudioContext();
      if (!ctx) return;

      const freqs = [523.25, 659.25, 783.99, 1046.5]; // C5 major arpeggio
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);

        gain.gain.setValueAtTime(0.16, ctx.currentTime + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.4);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + idx * 0.08);
        osc.stop(ctx.currentTime + idx * 0.08 + 0.4);
      });
    } catch {
      // Silently fail
    }
  }

  /**
   * Graveyard Drop alarm tone
   */
  public playDrop() {
    if (this.isMuted) return;
    try {
      const ctx = this.ensureAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(65, ctx.currentTime + 0.32);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.32);
    } catch {
      // Silently fail
    }
  }

  /**
   * Subtle positive chime for copy/success feedback
   */
  public playSuccess() {
    if (this.isMuted) return;
    try {
      const ctx = this.ensureAudioContext();
      if (!ctx) return;

      const freqs = [659.25, 880.0]; // E5 -> A5 pleasant chime
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);

        gain.gain.setValueAtTime(0.16, ctx.currentTime + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.22);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + idx * 0.08);
        osc.stop(ctx.currentTime + idx * 0.08 + 0.22);
      });
    } catch {
      // Silently fail
    }
  }

  /**
   * Distinct broadcast notification chime (when a bump banner appears)
   */
  public playAlert() {
    if (this.isMuted) return;
    try {
      const ctx = this.ensureAudioContext();
      if (!ctx) return;

      const freqs = [587.33, 880.0]; // D5 -> A5
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.09);

        gain.gain.setValueAtTime(0.18, ctx.currentTime + idx * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.09 + 0.24);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + idx * 0.09);
        osc.stop(ctx.currentTime + idx * 0.09 + 0.24);
      });
    } catch {
      // Silently fail
    }
  }
}

export const soundEngine = new SoundEngine();

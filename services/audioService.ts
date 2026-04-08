
/**
 * Audio Service for Kollektiv
 * Implements minimalist, high-end "tech" sound effects using Web Audio API.
 * Inspired by high-end studio interfaces (e.g., No Hero Studio).
 */

class AudioService {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isEnabled: boolean = true;

  constructor() {
    // Context is initialized on first user interaction to comply with browser policies
  }

  private initContext() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.gain.value = 0.3; // Default master volume
    } catch (e) {
      console.warn("AudioContext initialization failed:", e);
    }
  }

  private resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setVolume(value: number) {
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(value, this.ctx?.currentTime || 0, 0.1);
    }
  }

  setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
  }

  /**
   * Minimalist mechanical click (Joseph San style)
   */
  playClick() {
    if (!this.isEnabled) return;
    this.initContext();
    this.resume();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const noise = this.ctx.createBufferSource();
    const noiseGain = this.ctx.createGain();

    // Create a tiny bit of white noise for the transient
    const bufferSize = this.ctx.sampleRate * 0.01;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    noise.buffer = buffer;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(3000, now);
    osc.frequency.exponentialRampToValueAtTime(1000, now + 0.02);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

    noiseGain.gain.setValueAtTime(0.1, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.01);

    osc.connect(gain);
    noise.connect(noiseGain);
    gain.connect(this.masterGain);
    noiseGain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.02);
    noise.start(now);
    noise.stop(now + 0.01);
  }

  /**
   * High-pitched UI tick for hovers
   */
  playHover() {
    if (!this.isEnabled) return;
    this.initContext();
    this.resume();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(4000, now);
    
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.01);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.01);
  }

  /**
   * Harmonic digital chime for success/completion
   */
  playSuccess() {
    if (!this.isEnabled) return;
    this.initContext();
    this.resume();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    
    // Base impact
    this.playClick();

    // Harmonic layers
    const frequencies = [880, 1320, 1760]; // A5, E6, A6
    frequencies.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + (i * 0.05));
      
      gain.gain.setValueAtTime(0, now + (i * 0.05));
      gain.gain.linearRampToValueAtTime(0.2, now + (i * 0.05) + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (i * 0.05) + 0.8);
      
      osc.connect(gain);
      gain.connect(this.masterGain!);
      
      osc.start(now + (i * 0.05));
      osc.stop(now + (i * 0.05) + 0.8);
    });
  }

  /**
   * Subtle low-frequency whoosh for transitions
   */
  playTransition() {
    if (!this.isEnabled) return;
    this.initContext();
    this.resume();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.3);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.1);
    gain.gain.linearRampToValueAtTime(0, now + 0.3);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  /**
   * Resonant "pop" for modal opening
   */
  playModalOpen() {
    if (!this.isEnabled) return;
    this.initContext();
    this.resume();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  /**
   * Short descending tick for modal closing
   */
  playModalClose() {
    if (!this.isEnabled) return;
    this.initContext();
    this.resume();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.1);
  }
}

export const audioService = new AudioService();

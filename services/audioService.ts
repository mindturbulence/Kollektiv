/**
 * Audio Service for Kollektiv
 * High-tech, minimalist sound design inspired by briskgaurav.in
 * Features: Sharp digital transients, high-frequency pips, mechanical definition
 */

class AudioService {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private reverbWet: GainNode | null = null;
  private isEnabled: boolean = true;
  private isAmbientPlaying: boolean = false;
  private ambientOscillators: OscillatorNode[] = [];
  private lastHoverTime: number = 0;
  private initPromise: Promise<void> | null = null;
  private bufferCache: Map<string, AudioBuffer> = new Map();

  constructor() {
    if (typeof window !== 'undefined') {
      this.initContext().then(() => {
        this.preloadSounds();
      });
    }
  }

  private async preloadSounds() {
    try {
      const sounds = [
        { key: 'click', url: '/sfx/clicks.wav' },
        { key: 'transition', url: '/sfx/page_transition.wav' },
        { key: 'hover', url: '/sfx/hover.wav' },
        { key: 'slide', url: '/sfx/slide.mp3' }
      ];

      for (const sound of sounds) {
        const response = await fetch(sound.url);
        if (!response.ok) continue;
        const arrayBuffer = await response.arrayBuffer();
        if (this.ctx) {
          const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
          this.bufferCache.set(sound.key, audioBuffer);
        }
      }
    } catch (e) {
      console.warn("Failed to preload sounds:", e);
    }
  }

  private playBuffer(bufferKey: string, volume: number = 0.5): boolean {
    const buffer = this.bufferCache.get(bufferKey);
    if (!buffer || !this.ctx || !this.masterGain) return false;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    
    source.connect(gain);
    gain.connect(this.masterGain);
    
    source.start(this.ctx.currentTime);
    return true;
  }

  private async initContext(): Promise<void> {
    if (this.ctx) return;
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = this._initContextInternal();
    return this.initPromise;
  }

  private async _initContextInternal(): Promise<void> {
    try {
      if (this.ctx) return;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx({ latencyHint: 'interactive' });
      
      // Master gain - clinical and clean
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.45;
      
      // Compressor for tightness
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -12;
      this.compressor.knee.value = 6;
      this.compressor.ratio.value = 8; // Tighter ratio
      this.compressor.attack.value = 0.001; // Instant attack for transients
      this.compressor.release.value = 0.15;
      
      // Reverb wet/dry mix - very subtle for clinical feel
      this.reverbWet = this.ctx.createGain();
      this.reverbWet.gain.value = 0.15;
      
      // Create reverb
      this.reverbNode = this.ctx.createConvolver();
      this.createReverbImpulse();
      
      // Chain
      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);
      
      this.masterGain.connect(this.reverbNode);
      this.reverbNode.connect(this.reverbWet);
      this.reverbWet.connect(this.ctx.destination);
      
      // Ambient gain
      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.value = 0;
      this.ambientGain.connect(this.reverbNode);
      this.ambientGain.connect(this.reverbWet);
      
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
    } catch (e) {
      console.warn("AudioContext init failed:", e);
    } finally {
      this.initPromise = null;
    }
  }

  private createReverbImpulse(): void {
    if (!this.ctx || !this.reverbNode) return;
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * 0.8; // Shorter room for precise feel
    const impulse = this.ctx.createBuffer(2, length, sampleRate);
    
    for (let channel = 0; channel < 2; channel++) {
      const channelData = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const decay = Math.exp(-8 * i / length); // Faster decay
        channelData[i] = (Math.random() * 2 - 1) * decay * 0.35;
      }
    }
    this.reverbNode.buffer = impulse;
  }

  public resume(): void {
    if (!this.ctx) {
      this.initContext();
      return;
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  enable(): void {
    if (this.isEnabled) return;
    this.isEnabled = true;
    this.initContext().then(() => this.resume());
  }

  disable(): void {
    this.isEnabled = false;
    this.stopAmbient();
  }

  toggle(): boolean {
    this.isEnabled ? this.disable() : this.enable();
    return this.isEnabled;
  }

  getIsEnabled(): boolean {
    return this.isEnabled;
  }

  setVolume(value: number): void {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, value)), this.ctx.currentTime, 0.05);
    }
  }

  /**
   * Technical Digital Pip
   */
  private createDigitalOsc(freq: number, type: OscillatorType = 'sine'): OscillatorNode {
    if (!this.ctx) throw new Error("No context");
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    return osc;
  }

  /**
   * Minimal Click (Mechanical Shutter feel)
   */
  playClick(): void {
    if (!this.isEnabled || !this.ctx || !this.masterGain) return;
    this.resume();

    // Try to play the external click sound first
    if (this.playBuffer('click', 0.6)) return;
    
    const now = this.ctx.currentTime;
    
    // Low frequency definition
    const body = this.createDigitalOsc(600);
    const bodyGain = this.ctx.createGain();
    body.frequency.setValueAtTime(600, now);
    body.frequency.exponentialRampToValueAtTime(120, now + 0.03);
    
    bodyGain.gain.setValueAtTime(0, now);
    bodyGain.gain.linearRampToValueAtTime(0.25, now + 0.002);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    
    body.connect(bodyGain);
    bodyGain.connect(this.masterGain);
    
    // High transient noise
    const noise = this.ctx.createBufferSource();
    const noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.01, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.2));
    noise.buffer = noiseBuffer;
    
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.08, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.01);
    
    noise.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    
    body.start(now); body.stop(now + 0.05);
    noise.start(now); noise.stop(now + 0.015);
  }

  /**
   * Precise Hover Pip (Ultra-short, high frequency)
   */
  playHover(): void {
    if (!this.isEnabled || !this.ctx || !this.masterGain) return;
    const nowMs = Date.now();
    if (nowMs - this.lastHoverTime < 50) return;
    this.lastHoverTime = nowMs;
    
    this.resume();

    // Try to play the external hover sound first
    if (this.playBuffer('hover', 0.25)) return;

    const now = this.ctx.currentTime;
    
    const osc = this.createDigitalOsc(3200); // Higher freq for "Brisk" feel
    const gain = this.ctx.createGain();
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.04, now + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.008);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start(now);
    osc.stop(now + 0.01);
  }

  /**
   * Clinical Succession (Ascending digital notes)
   */
  playSuccess(): void {
    if (!this.isEnabled || !this.ctx || !this.masterGain) return;
    this.resume();
    const now = this.ctx.currentTime;
    const notes = [1200, 1600, 2400]; // Sharp upward movement
    
    notes.forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const delay = i * 0.04;
      const osc = this.createDigitalOsc(freq);
      const gain = this.ctx.createGain();
      
      if (gain) {
        gain.gain.setValueAtTime(0, now + delay);
        gain.gain.linearRampToValueAtTime(0.08, now + delay + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.08);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now + delay);
        osc.stop(now + delay + 0.1);
      }
    });
  }

  /**
   * Minimalist Transition (Digital shuffle/glitch)
   */
  playTransition(): void {
    if (!this.isEnabled || !this.ctx || !this.masterGain) return;
    this.resume();
    
    // Try to play the external transition sound first
    if (this.playBuffer('transition', 0.5)) return;

    const now = this.ctx.currentTime;
    
    // Quick noise bursts
    for (let i = 0; i < 4; i++) {
      const delay = i * 0.02;
      const noise = this.ctx.createBufferSource();
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.005, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let j = 0; j < d.length; j++) d[j] = Math.random() * 2 - 1;
      noise.buffer = buf;
      
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.04, now + delay);
      g.gain.linearRampToValueAtTime(0, now + delay + 0.005);
      
      noise.connect(g);
      g.connect(this.masterGain);
      noise.start(now + delay);
    }
  }

  /**
   * Modal Mechanics (Open)
   */
  playModalOpen(): void {
    if (!this.isEnabled || !this.ctx || !this.masterGain) return;
    this.resume();
    const now = this.ctx.currentTime;
    
    const osc = this.createDigitalOsc(400);
    const gain = this.ctx.createGain();
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.08);
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now); osc.stop(now + 0.25);
  }

  /**
   * Modal Mechanics (Close)
   */
  playModalClose(): void {
    if (!this.isEnabled || !this.ctx || !this.masterGain) return;
    this.resume();
    const now = this.ctx.currentTime;
    
    const osc = this.createDigitalOsc(1200);
    const gain = this.ctx.createGain();
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.08);
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now); osc.stop(now + 0.2);
  }

  playError(): void {
    if (!this.isEnabled || !this.ctx || !this.masterGain) return;
    this.resume();
    const now = this.ctx.currentTime;
    const osc = this.createDigitalOsc(220, 'square');
    const gain = this.ctx.createGain();
    
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0.05, now + 0.05);
    gain.gain.linearRampToValueAtTime(0, now + 0.06);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now); osc.stop(now + 0.1);
  }

  playToggle(): void {
    this.playClick();
  }

  /**
   * Sliding sound for parent menu expansion
   */
  playSlide(): void {
    if (!this.isEnabled || !this.ctx || !this.masterGain) return;
    this.resume();

    // Try to play the external slide sound first
    if (this.playBuffer('slide', 0.4)) return;

    // Fallback if buffer not loaded
    const now = this.ctx.currentTime;
    const osc = this.createDigitalOsc(400, 'sine');
    const gain = this.ctx.createGain();

    osc.frequency.setValueAtTime(400, now);
    osc.frequency.linearRampToValueAtTime(800, now + 0.3);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.05, now + 0.05);
    gain.gain.linearRampToValueAtTime(0, now + 0.3);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  startAmbient(intensity: number = 0.2): void {
    if (!this.isEnabled || this.isAmbientPlaying || !this.ctx || !this.ambientGain) return;
    this.resume();
    this.isAmbientPlaying = true;
    const now = this.ctx.currentTime;
    
    const drones = [
      { freq: 40, gain: 0.05 },
      { freq: 80, gain: 0.03 }
    ];
    
    drones.forEach(d => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = d.freq;
      const g = this.ctx!.createGain();
      g.gain.value = 0;
      osc.connect(g);
      g.connect(this.ambientGain!);
      osc.start(now);
      this.ambientOscillators.push(osc);
      g.gain.setTargetAtTime(d.gain * intensity, now, 2);
    });
    
    this.ambientGain.gain.setTargetAtTime(intensity, now, 1);
  }

  stopAmbient(): void {
    if (!this.ctx || !this.ambientGain) return;
    const now = this.ctx.currentTime;
    this.ambientGain.gain.setTargetAtTime(0, now, 0.5);
    setTimeout(() => {
      this.ambientOscillators.forEach(osc => { try { osc.stop(); } catch(e) {} });
      this.ambientOscillators = [];
      this.isAmbientPlaying = false;
    }, 1000);
  }
}

export const audioService = new AudioService();

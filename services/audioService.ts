/**
 * Audio Service for Kollektiv
 * Retro-futuristic sound design inspired by joseph-san.com
 * Features: warm analog tones, subtle saturation, cinematic reverb, lo-fi character
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

  constructor() {
    if (typeof window !== 'undefined') {
      this.initContext();
    }
  }

  private async initContext(): Promise<void> {
    if (this.ctx) return;
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = this._initContextInternal();
    return this.initPromise;
  }

  private async _initContextInternal(): Promise<void> {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      
      // Master gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.5;
      
      // Compressor for glue and warmth
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -18;
      this.compressor.knee.value = 12;
      this.compressor.ratio.value = 4;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.25;
      
      // Reverb wet/dry mix
      this.reverbWet = this.ctx.createGain();
      this.reverbWet.gain.value = 0.3;
      
      // Create reverb
      this.reverbNode = this.ctx.createConvolver();
      this.createReverbImpulse();
      
      // Chain: master -> compressor -> destination
      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);
      
      // Reverb chain: master -> reverb -> wet -> compressor -> destination
      this.masterGain.connect(this.reverbNode);
      this.reverbNode.connect(this.reverbWet);
      this.reverbWet.connect(this.ctx.destination);
      
      // Ambient gain (separate chain for ambient sounds)
      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.value = 0;
      this.ambientGain.connect(this.reverbNode);
      this.ambientGain.connect(this.reverbWet);
      
    } catch (e) {
      console.warn("AudioContext initialization failed:", e);
    } finally {
      this.initPromise = null;
    }
  }

  private createReverbImpulse(): void {
    if (!this.ctx || !this.reverbNode) return;
    
    // Create a cinematic reverb impulse response (shorter for performance)
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * 1.5; // 1.5 second reverb (reduced from 3s)
    const impulse = this.ctx.createBuffer(2, length, sampleRate);
    
    for (let channel = 0; channel < 2; channel++) {
      const channelData = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        // Exponential decay with slight randomness
        const decay = Math.exp(-3 * i / length);
        channelData[i] = (Math.random() * 2 - 1) * decay * 0.5;
      }
    }
    
    this.reverbNode.buffer = impulse;
  }

  private resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Enable audio service
   */
  enable(): void {
    if (this.isEnabled) return;
    this.isEnabled = true;
    // Initialize async in background, don't await
    this.initContext().then(() => {
      this.resume();
    });
  }

  /**
   * Disable audio service
   */
  disable(): void {
    this.isEnabled = false;
    this.stopAmbient();
  }

  /**
   * Toggle audio enabled state
   */
  toggle(): boolean {
    if (this.isEnabled) {
      this.disable();
    } else {
      this.enable();
    }
    return this.isEnabled;
  }

  /**
   * Check if audio is enabled
   */
  getIsEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Set master volume (0-1)
   */
  setVolume(value: number): void {
    const ctx = this.ctx;
    const masterGain = this.masterGain;
    if (masterGain) {
      masterGain.gain.setTargetAtTime(
        Math.max(0, Math.min(1, value)),
        ctx?.currentTime || 0,
        0.1
      );
    }
  }

  /**
   * Create a warm analog-style oscillator with slight detune
   */
  private createWarmOsc(freq: number, type: OscillatorType = 'sine', detuneAmount: number = 3): OscillatorNode[] {
    if (!this.ctx) return [];
    
    const oscs: OscillatorNode[] = [];
    
    // Main oscillator
    const osc1 = this.ctx.createOscillator();
    osc1.type = type;
    osc1.frequency.value = freq;
    oscs.push(osc1);
    
    // Detuned oscillator for chorus/width effect
    const osc2 = this.ctx.createOscillator();
    osc2.type = type;
    osc2.frequency.value = freq;
    osc2.detune.value = detuneAmount;
    oscs.push(osc2);
    
    // Third oscillator slightly lower for warmth
    const osc3 = this.ctx.createOscillator();
    osc3.type = 'triangle';
    osc3.frequency.value = freq * 0.998;
    osc3.detune.value = -detuneAmount * 0.5;
    oscs.push(osc3);
    
    return oscs;
  }

  /**
   * Add subtle tape saturation/overdrive
   */
  private createSaturation(amount: number = 0.5): WaveShaperNode | null {
    if (!this.ctx) return null;
    
    const waveshaper = this.ctx.createWaveShaper();
    const samples = 44100;
    const curve = new Float32Array(samples);
    
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      // Soft clipping curve
      curve[i] = Math.tanh(x * (1 + amount * 2)) / Math.tanh(1 + amount * 2);
    }
    
    waveshaper.curve = curve;
    waveshaper.oversample = '2x';
    return waveshaper;
  }

  /**
   * Premium click sound (retro-futuristic: warm, cinematic)
   */
  playClick(): void {
    const ctx = this.ctx;
    const masterGain = this.masterGain;
    if (!this.isEnabled || !ctx || !masterGain) return;
    this.resume();

    const now = ctx.currentTime;
    
    // Warm tonal component
    const oscs = this.createWarmOsc(800, 'sine', 5);
    const oscGain = ctx.createGain();
    
    // Frequency sweep down (like a satisfying mechanical switch)
    oscs.forEach(osc => {
      const param = osc.frequency;
      param.setValueAtTime(1200, now);
      param.exponentialRampToValueAtTime(400, now + 0.04);
      osc.connect(oscGain);
    });
    
    oscGain.gain.setValueAtTime(0, now);
    oscGain.gain.linearRampToValueAtTime(0.18, now + 0.005);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    
    // Add subtle saturation
    const sat = this.createSaturation(0.3);
    if (sat) {
      oscGain.connect(sat);
      sat.connect(masterGain);
    } else {
      oscGain.connect(masterGain);
    }
    
    // Low-end thump for weight
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(120, now);
    subOsc.frequency.exponentialRampToValueAtTime(50, now + 0.06);
    subGain.gain.setValueAtTime(0.12, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    subOsc.connect(subGain);
    subGain.connect(masterGain);
    
    // High-freq transient for definition
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.02, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
      // Shaped noise with fast decay
      noiseData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (noiseData.length * 0.15));
    }
    
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 3000;
    
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.06, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);
    
    // Start all
    oscs.forEach(osc => { osc.start(now); osc.stop(now + 0.15); });
    subOsc.start(now); subOsc.stop(now + 0.1);
    noise.start(now); noise.stop(now + 0.02);
  }

  /**
   * Subtle hover tick (retro: soft, warm)
   */
  playHover(): void {
    const ctx = this.ctx;
    const masterGain = this.masterGain;
    if (!this.isEnabled || !ctx || !masterGain) return;
    
    // Throttle hover sounds
    const now = Date.now();
    if (now - this.lastHoverTime < 80) return;
    this.lastHoverTime = now;
    
    this.resume();

    const t = ctx.currentTime;
    
    // Soft, warm tick
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2200, t);
    osc.frequency.exponentialRampToValueAtTime(1800, t + 0.008);
    
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.025, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
    
    // Gentle low-pass for warmth
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 4000;
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    
    osc.start(t);
    osc.stop(t + 0.02);
  }

  /**
   * Success chime (cinematic, warm harmonics)
   */
  playSuccess(): void {
    const ctx = this.ctx;
    const masterGain = this.masterGain;
    if (!this.isEnabled || !ctx || !masterGain) return;
    this.resume();

    const now = ctx.currentTime;
    
    // Initial click
    this.playClick();

    // Warm harmonic chord (C major 7 feel)
    const frequencies = [523.25, 659.25, 783.99, 987.77]; // C5, E5, G5, B5
    
    frequencies.forEach((freq, i) => {
      const oscs = this.createWarmOsc(freq, 'sine', 2);
      const gain = ctx.createGain();
      const delay = i * 0.06;
      
      oscs.forEach(osc => {
        osc.frequency.setValueAtTime(freq * 1.02, now + delay);
        osc.frequency.setTargetAtTime(freq, now + delay + 0.02, 0.1);
        osc.connect(gain);
      });
      
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.12, now + delay + 0.01);
      gain.gain.setTargetAtTime(0.08, now + delay + 0.15, 0.3);
      gain.gain.setTargetAtTime(0.001, now + delay + 0.8, 0.4);
      
      gain.connect(masterGain);
      
      oscs.forEach(osc => {
        osc.start(now + delay);
        osc.stop(now + delay + 1.5);
      });
    });
  }

  /**
   * Transition sweep (retro-futuristic: cosmic whoosh)
   */
  playTransition(): void {
    const ctx = this.ctx;
    const masterGain = this.masterGain;
    if (!this.isEnabled || !ctx || !masterGain) return;
    this.resume();

    const now = ctx.currentTime;
    
    // Cosmic sweep with multiple layers
    // Low rumble
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(60, now);
    subOsc.frequency.exponentialRampToValueAtTime(150, now + 0.4);
    subGain.gain.setValueAtTime(0, now);
    subGain.gain.linearRampToValueAtTime(0.1, now + 0.15);
    subGain.gain.linearRampToValueAtTime(0, now + 0.5);
    subOsc.connect(subGain);
    subGain.connect(masterGain);
    
    // Mid sweep
    const midOsc = ctx.createOscillator();
    const midGain = ctx.createGain();
    midOsc.type = 'sawtooth';
    midOsc.frequency.setValueAtTime(200, now);
    midOsc.frequency.exponentialRampToValueAtTime(800, now + 0.35);
    midOsc.detune.value = 10;
    
    const midFilter = ctx.createBiquadFilter();
    midFilter.type = 'bandpass';
    midFilter.frequency.setValueAtTime(300, now);
    midFilter.frequency.exponentialRampToValueAtTime(2000, now + 0.35);
    midFilter.Q.value = 3;
    
    midGain.gain.setValueAtTime(0, now);
    midGain.gain.linearRampToValueAtTime(0.06, now + 0.1);
    midGain.gain.linearRampToValueAtTime(0, now + 0.4);
    
    midOsc.connect(midFilter);
    midFilter.connect(midGain);
    midGain.connect(masterGain);
    
    // High shimmer
    const highOsc = ctx.createOscillator();
    const highGain = ctx.createGain();
    highOsc.type = 'sine';
    highOsc.frequency.setValueAtTime(1500, now);
    highOsc.frequency.exponentialRampToValueAtTime(3000, now + 0.3);
    
    highGain.gain.setValueAtTime(0, now);
    highGain.gain.linearRampToValueAtTime(0.04, now + 0.15);
    highGain.gain.linearRampToValueAtTime(0, now + 0.35);
    
    highOsc.connect(highGain);
    highGain.connect(masterGain);
    
    subOsc.start(now); subOsc.stop(now + 0.6);
    midOsc.start(now); midOsc.stop(now + 0.5);
    highOsc.start(now); highOsc.stop(now + 0.4);
  }

  /**
   * Modal open (retro-futuristic: cinematic reveal)
   */
  playModalOpen(): void {
    const ctx = this.ctx;
    const masterGain = this.masterGain;
    if (!this.isEnabled || !ctx || !masterGain) return;
    this.resume();

    const now = ctx.currentTime;
    
    // Main tonal sweep (upward)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
    osc.frequency.setTargetAtTime(500, now + 0.15, 0.1);
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
    gain.gain.setTargetAtTime(0.1, now + 0.1, 0.08);
    gain.gain.setTargetAtTime(0.001, now + 0.3, 0.15);
    
    // Warm filter
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1500;
    filter.Q.value = 2;
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    
    // Subtle shimmer on top
    const shimmer = ctx.createOscillator();
    const shimmerGain = ctx.createGain();
    shimmer.type = 'sine';
    shimmer.frequency.setValueAtTime(1200, now);
    shimmer.frequency.exponentialRampToValueAtTime(1800, now + 0.15);
    shimmerGain.gain.setValueAtTime(0, now);
    shimmerGain.gain.linearRampToValueAtTime(0.03, now + 0.05);
    shimmerGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    shimmer.connect(shimmerGain);
    shimmerGain.connect(masterGain);
    
    osc.start(now); osc.stop(now + 0.4);
    shimmer.start(now); shimmer.stop(now + 0.3);
  }

  /**
   * Modal close (retro: descending, fading)
   */
  playModalClose(): void {
    const ctx = this.ctx;
    const masterGain = this.masterGain;
    if (!this.isEnabled || !ctx || !masterGain) return;
    this.resume();

    const now = ctx.currentTime;
    
    const oscs = this.createWarmOsc(500, 'sine', 3);
    const gain = ctx.createGain();
    
    oscs.forEach(osc => {
      const param = osc.frequency;
      param.setValueAtTime(600, now);
      param.exponentialRampToValueAtTime(200, now + 0.15);
      osc.connect(gain);
    });
    
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    
    gain.connect(masterGain);
    
    oscs.forEach(osc => {
      osc.start(now);
      osc.stop(now + 0.2);
    });
  }

  /**
   * Error sound (retro warning: analog alarm)
   */
  playError(): void {
    const ctx = this.ctx;
    const masterGain = this.masterGain;
    if (!this.isEnabled || !ctx || !masterGain) return;
    this.resume();

    const now = ctx.currentTime;
    
    // Two oscillators creating beating/wah effect
    [180, 185].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = i * 5;
      
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(400, now);
      filter.frequency.setValueAtTime(600, now + 0.05);
      filter.frequency.setValueAtTime(400, now + 0.1);
      filter.Q.value = 5;
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.06, now + 0.01);
      gain.gain.setTargetAtTime(0.06, now + 0.05, 0.03);
      gain.gain.setTargetAtTime(0.001, now + 0.2, 0.05);
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      
      osc.start(now);
      osc.stop(now + 0.3);
    });
  }

  /**
   * Notification ping (retro-bling)
   */
  playPing(): void {
    const ctx = this.ctx;
    const masterGain = this.masterGain;
    if (!this.isEnabled || !ctx || !masterGain) return;
    this.resume();

    const now = ctx.currentTime;
    
    // Bright bell-like tone
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    // Quick pitch wobble for bell character
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1100, now + 0.03);
    osc.frequency.setValueAtTime(990, now + 0.06);
    osc.frequency.setValueAtTime(880, now + 0.09);
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.005);
    gain.gain.setTargetAtTime(0.1, now + 0.05, 0.05);
    gain.gain.setTargetAtTime(0.001, now + 0.4, 0.15);
    
    // Add subtle high harmonic
    const harmonic = ctx.createOscillator();
    const harmonicGain = ctx.createGain();
    harmonic.type = 'sine';
    harmonic.frequency.value = 1760;
    harmonicGain.gain.setValueAtTime(0, now);
    harmonicGain.gain.linearRampToValueAtTime(0.03, now + 0.005);
    harmonicGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    
    osc.connect(gain);
    gain.connect(masterGain);
    harmonic.connect(harmonicGain);
    harmonicGain.connect(masterGain);
    
    osc.start(now); osc.stop(now + 0.5);
    harmonic.start(now); harmonic.stop(now + 0.25);
  }

  /**
   * Toggle switch sound (retro click)
   */
  playToggle(): void {
    const ctx = this.ctx;
    const masterGain = this.masterGain;
    if (!this.isEnabled || !ctx || !masterGain) return;
    this.resume();

    const now = ctx.currentTime;
    
    // Sharp mechanical click
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(1000, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.015);
    
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
    
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2000;
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    
    osc.start(now);
    osc.stop(now + 0.03);
  }

  /**
   * Keyboard tick (retro typewriter)
   */
  playKeypress(): void {
    const ctx = this.ctx;
    const masterGain = this.masterGain;
    if (!this.isEnabled || !ctx || !masterGain) return;
    this.resume();

    const now = ctx.currentTime;
    const baseFreq = 1800 + Math.random() * 600;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.7, now + 0.015);
    
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    
    osc.connect(gain);
    gain.connect(masterGain);
    
    osc.start(now);
    osc.stop(now + 0.04);
  }

  /**
   * Ambient soundscape (retro-futuristic atmosphere)
   */
  startAmbient(intensity: number = 0.25): void {
    const ctx = this.ctx;
    const ambientGain = this.ambientGain;
    const masterGain = this.masterGain;
    if (!this.isEnabled || this.isAmbientPlaying) return;
    if (!ctx || !ambientGain || !masterGain) {
      this.initContext(); // Fire and forget
      return;
    }
    this.resume();

    this.isAmbientPlaying = true;
    const now = ctx.currentTime;
    
    // Layered ambient drones with warm analog character
    const droneConfigs = [
      { freq: 55, type: 'sine' as OscillatorType, gain: 0.08 },      // A1 sub
      { freq: 82.5, type: 'sine' as OscillatorType, gain: 0.06 },     // E2
      { freq: 110, type: 'triangle' as OscillatorType, gain: 0.04 },  // A2
      { freq: 165, type: 'sine' as OscillatorType, gain: 0.03 },     // E3
    ];
    
    droneConfigs.forEach((config, index) => {
      // Main oscillator
      const osc = ctx.createOscillator();
      osc.type = config.type;
      osc.frequency.value = config.freq;
      
      // Slightly detuned for width
      const osc2 = ctx.createOscillator();
      osc2.type = config.type;
      osc2.frequency.value = config.freq * 1.003;
      osc2.detune.value = 3;
      
      // Gain node for this layer
      const layerGain = ctx.createGain();
      layerGain.gain.value = 0;
      
      // Low-pass filter for warmth
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400 + index * 150;
      filter.Q.value = 0.5;
      
      // Connect
      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(layerGain);
      layerGain.connect(ambientGain);
      
      // Start
      osc.start(now);
      osc2.start(now);
      this.ambientOscillators.push(osc, osc2);
      
      // Fade in slowly
      layerGain.gain.setTargetAtTime(config.gain * intensity, now + index * 0.3, 1);
    });
    
    // Fade in ambient gain
    ambientGain.gain.setTargetAtTime(intensity * 0.4, now, 2);
  }

  /**
   * Stop ambient soundscape
   */
  stopAmbient(): void {
    const ctx = this.ctx;
    const ambientGain = this.ambientGain;
    if (!ctx || !ambientGain) return;
    
    const now = ctx.currentTime;
    
    // Fade out
    if (ambientGain.gain) {
      ambientGain.gain.setTargetAtTime(0, now, 0.5);
    }
    
    // Stop oscillators
    setTimeout(() => {
      this.ambientOscillators.forEach(osc => {
        try { osc.stop(); } catch (e) {}
      });
      this.ambientOscillators = [];
    }, 2000);
    
    this.isAmbientPlaying = false;
  }
}

export const audioService = new AudioService();

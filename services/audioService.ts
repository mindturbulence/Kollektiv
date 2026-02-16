class AudioService {
  private ctx: AudioContext | null = null;
  private isEnabled: boolean = true;

  private getCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    return this.ctx;
  }

  // Futuristic Digital Tick (Hover)
  public playHover() {
    if (!this.isEnabled) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(3200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1600, ctx.currentTime + 0.01);
    
    gain.gain.setValueAtTime(0.02, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.01);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
  }

  // Tactical FM Pop (Click)
  public playClick() {
    if (!this.isEnabled) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const carrier = ctx.createOscillator();
    const modulator = ctx.createOscillator();
    const modGain = ctx.createGain();
    const mainGain = ctx.createGain();

    carrier.type = 'sine';
    modulator.type = 'square';
    
    carrier.frequency.setValueAtTime(150, now);
    carrier.frequency.exponentialRampToValueAtTime(40, now + 0.08);
    
    modulator.frequency.setValueAtTime(400, now);
    modGain.gain.setValueAtTime(200, now);
    modGain.gain.exponentialRampToValueAtTime(1, now + 0.08);

    mainGain.gain.setValueAtTime(0.15, now);
    mainGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(mainGain);
    mainGain.connect(ctx.destination);

    modulator.start(now);
    carrier.start(now);
    modulator.stop(now + 0.1);
    carrier.stop(now + 0.1);
  }

  // Neural Wake (Modal Open)
  public playModalOpen() {
    if (!this.isEnabled) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const noise = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    // FM Arpeggio-like sweep
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(1760, now + 0.2);

    // Noise burst for texture
    const bufferSize = ctx.sampleRate * 0.2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buffer;

    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1000, now);
    filter.frequency.exponentialRampToValueAtTime(5000, now + 0.2);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gain);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    noise.start(now);
    osc.stop(now + 0.4);
    noise.stop(now + 0.4);
  }

  // Data Purge (Modal Close)
  public playModalClose() {
    if (!this.isEnabled) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.2);
    
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, now);
    filter.frequency.exponentialRampToValueAtTime(100, now + 0.2);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.25);
  }
}

export const audioService = new AudioService();
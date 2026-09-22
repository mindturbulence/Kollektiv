import React, { useEffect, useRef } from 'react';

/**
 * StormBackground — onlook.com-style storm background for the boot loader.
 *
 * Technique (studied from onlook.com's public scene file, /scenes/flow-background.json —
 * a Unicorn Studio export; implementation below is ORIGINAL, written from scratch,
 * since their repo is AGPL-3.0 and kollektiv is GPL-3.0 — see CLAUDE.md "License hygiene"):
 *
 * 1. Trail pass (ping-pong FBO, half resolution): a feedback buffer that each frame
 *    advects the previous frame along the stored movement direction (the trail *flows*),
 *    applies a time-varying swirl, decays exponentially, and strokes in a capsule
 *    distance field between the previous and current mouse position with a sharp
 *    pow(s, 6) core. This is what gives the "crackling lightning follows the cursor"
 *    look — persistence + flow, which a per-frame uniform can never reproduce.
 * 2. Composite pass: near-black base + fbm domain-warped clouds; the trail texture is
 *    SAMPLED THROUGH the cloud noise (uv + fbm offset) so the light smears and snakes
 *    through the smoke, then tinted with the theme's primary color.
 * 3. Optional ambient strike flashes (kollektiv twist, knob-gated, subtle).
 *
 * The twist (user request): trail/bolt color = current theme's `primary`, read live
 * from a hidden `.text-primary` probe and re-read on data-theme changes.
 *
 * Boot-safety guards (this renders while the app initializes):
 * - 30fps cap, composite at 0.75x scale, trail sim at 0.5x, DPR capped at 1.5
 * - paused while the tab is hidden; torn down with the loader
 * - context acquisition retried with backoff (contexts can be momentarily unavailable
 *   during early page boot); webglcontextlost/restored handled
 * - NO WEBGL_lose_context in cleanup — React StrictMode double-mounts this effect on
 *   the same canvas in dev, and a force-lost context would wedge the remount forever
 * - silent fallback: if anything fails to init, the plain loader remains
 *
 * Accessibility: honors prefers-reduced-motion (static clouds, no trail, no strikes,
 * no cursor tracking).
 */

const VERT = 'attribute vec2 p;varying vec2 vUv;void main(){vUv=p*0.5+0.5;gl_Position=vec4(p,0.,1.);}';

// ---- Pass 1: trail simulation (ping-pong) --------------------------------
// R  = intensity (0..1)
// GB = movement direction, encoded as dir*0.5+0.5
const TRAIL_FRAG = `precision highp float;
varying vec2 vUv;
uniform sampler2D uPrev;
uniform vec2 uPrevPos;
uniform vec2 uCurrPos;
uniform float uDt;
uniform float uAspect;
uniform float uDecay;
uniform float uBrush;
uniform float uRadius;
uniform float uAdvect;
uniform float uSwirl;
uniform float uTime;

vec2 asp(vec2 p){ return vec2(p.x*uAspect, p.y); }

float capsuleDist(vec2 p, vec2 a, vec2 b){
  vec2 pa=p-a, ba=b-a;
  float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-6),0.0,1.0);
  return length(pa-ba*h);
}

void main(){
  vec2 uv=vUv;
  vec3 prev=texture2D(uPrev,uv).rgb;
  float inten=prev.r;
  vec2 dir=(prev.gb*2.0-1.0);
  float dirLen=length(dir);
  dir=dirLen>1e-4?dir/dirLen:vec2(0.0,1.0);

  // Advection: pull intensity from upstream along its own flow direction,
  // plus a slow swirl so the trail curls like gas instead of fading in place.
  vec2 swirl=vec2(cos(uTime*0.7+uv.y*6.0),sin(uTime*0.6+uv.x*6.0))*uSwirl*(1.0-inten);
  vec2 su=clamp(uv-dir*uAdvect*inten+swirl,vec2(0.001),vec2(0.999));
  vec3 s=texture2D(uPrev,su).rgb;
  inten=s.r;
  vec2 sdir=s.gb*2.0-1.0;
  float sl=length(sdir);
  dir=sl>1e-4?sdir/sl:dir;

  inten*=exp(-uDt*uDecay);

  // New stroke: capsule between prev and current mouse position.
  if(uBrush>0.0){
    float d=capsuleDist(asp(uv),asp(uPrevPos),asp(uCurrPos));
    float core=(1.0+uRadius)/(d+uRadius)*uRadius;
    float add=pow(core,6.0)*uBrush;
    vec2 move=uCurrPos-uPrevPos;
    float ml=length(move);
    if(add>0.001&&ml>1e-5){
      vec2 nd=move/ml;
      dir=normalize(mix(dir,nd,clamp(add,0.0,1.0)));
      inten=min(1.0,inten+add);
    }
  }

  gl_FragColor=vec4(clamp(inten,0.0,1.0),dir*0.5+0.5,1.0);
}`;

// ---- Pass 2: composite (base + clouds + trail-through-smoke + strikes) ----
const COMP_FRAG = `precision highp float;
varying vec2 vUv;
uniform sampler2D uTrail;
uniform float uTime;
uniform vec2 uRes;
uniform vec3 uBolt;
uniform float uTrailGain;
uniform float uStrike;
uniform float uStrikeX;
uniform float uStrikeY;

float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);
  f=f*f*(3.0-2.0*f);
  float a=hash(i),b=hash(i+vec2(1.0,0.0)),c=hash(i+vec2(0.0,1.0)),d=hash(i+vec2(1.0,1.0));
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
float fbm(vec2 p){
  float v=0.0,a=0.5;
  mat2 r=mat2(0.8,0.6,-0.6,0.8);
  for(int i=0;i<5;i++){v+=a*noise(p);p=r*p*2.03;a*=0.5;}
  return v;
}
float bend(vec2 p,float t){return (fbm(p*1.6+t*0.35)-0.5)*0.55;}

float bolt(vec2 p,float t){
  if(uStrike<=0.001) return 0.0;
  float inCol=step(0.0,p.y)*step(p.y,uStrikeY);
  if(inCol<0.5) return 0.0;
  float x0=uStrikeX;
  float acc=0.0;
  for(int i=0;i<3;i++){
    float fi=float(i);
    float amp=(fi+1.0)*0.09;
    float off=bend(vec2(x0*2.4,p.y*0.9),t*1.6+fi*7.3)*amp;
    float d=abs(p.x-(x0+off));
    float w=(0.012-fi*0.003)*(0.8+0.6*sin(t*40.0+fi*2.0));
    acc+=smoothstep(w,0.0,d);
    acc+=exp(-d*34.0)*0.5;
  }
  vec2 cp=vec2(x0,uStrikeY*0.62);
  acc+=exp(-length((p-cp)*vec2(1.9,1.15))*2.6)*0.55;
  return acc*uStrike;
}

void main(){
  vec2 uv=vUv;
  float aspect=uRes.x/uRes.y;
  vec2 p=uv*vec2(aspect,1.0);
  float t=uTime;

  // Clouds (domain-warped fbm)
  float q=fbm(p*1.7+vec2(t*0.013,-t*0.008));
  float r=fbm(p*2.6+q*1.4+vec2(-t*0.02,t*0.014));
  float cloud=smoothstep(0.25,0.95,r*0.75+q*0.35);

  // The key move: sample the trail THROUGH the cloud noise so the light
  // smears and snakes through the smoke (onlook's fbm displacement layer).
  vec2 warp=vec2(
    fbm(p*3.0+vec2(t*0.05,0.0)),
    fbm(p*3.0+vec2(0.0,t*0.04)+7.3)
  )-0.5;
  float ti=texture2D(uTrail,uv+warp*0.045).r;

  // Base: near-black storm gradient + cloud shading
  vec3 dark=vec3(0.024,0.028,0.036);
  vec3 col=mix(dark*1.15,vec3(0.115,0.13,0.16),cloud);

  // Trail light: sharp theme-colored core + wide soft glow, wrapped by cloud density
  col+=uBolt*(pow(ti,1.6)*1.5+pow(ti,0.35)*0.22)*uTrailGain*(0.55+0.45*cloud);

  // Ambient strike flash (kollektiv twist, subtle)
  col+=uBolt*bolt(p,t)*0.8;

  col=mix(col,dark,0.25);

  float lum=dot(col,vec3(0.2126,0.7152,0.0722));
  col=mix(col,col/max(lum,0.001)*0.55,step(0.55,lum));

  gl_FragColor=vec4(col,1.0);
}`;

const StormBackground: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        let raf = 0;
        let disposed = false;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        let teardown: (() => void)[] = [];
        const runTeardown = () => {
            for (const fn of teardown) fn();
            teardown = [];
        };

        const boot = (): boolean => {
            if (disposed) return false;
            runTeardown();
            cancelAnimationFrame(raf);

            const gl = canvas.getContext('webgl', {
                alpha: false,
                antialias: false,
                powerPreference: 'low-power',
            });
            if (!gl) return false;

            const compile = (type: number, src: string, label: string): WebGLShader | null => {
                const s = gl.createShader(type);
                if (!s) {
                    if (import.meta.env.DEV) console.warn(`[StormBackground] createShader(${label}) returned null`);
                    return null;
                }
                gl.shaderSource(s, src);
                gl.compileShader(s);
                if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                    console.warn(`[StormBackground] shader error (${label}):`, gl.getShaderInfoLog(s),
                        'glErr:', gl.getError(), 'isConnected:', canvas.isConnected);
                    return null;
                }
                return s;
            };
            const makeProgram = (fsSrc: string, label: string): WebGLProgram | null => {
                const vs = compile(gl.VERTEX_SHADER, VERT, label + '/vert');
                const fs = compile(gl.FRAGMENT_SHADER, fsSrc, label + '/frag');
                if (!vs || !fs) return null;
                const prog = gl.createProgram();
                if (!prog) return null;
                gl.attachShader(prog, vs);
                gl.attachShader(prog, fs);
                gl.linkProgram(prog);
                if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
                    console.warn(`[StormBackground] link error (${label}):`, gl.getProgramInfoLog(prog));
                    return null;
                }
                return prog;
            };

            const trailProg = makeProgram(TRAIL_FRAG, 'trail');
            const compProg = makeProgram(COMP_FRAG, 'composite');
            if (!trailProg || !compProg) return false;

            const quad = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, quad);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
            const bindQuad = (prog: WebGLProgram) => {
                const loc = gl.getAttribLocation(prog, 'p');
                gl.bindBuffer(gl.ARRAY_BUFFER, quad);
                gl.enableVertexAttribArray(loc);
                gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
            };
            const uni = (prog: WebGLProgram, n: string) => gl.getUniformLocation(prog, n);

            // --- Ping-pong trail targets (half resolution, NPOT-safe params) ---
            const makeTarget = (w: number, h: number) => {
                const tex = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                const fbo = gl.createFramebuffer();
                gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                return { tex, fbo };
            };

            // Theme bolt color: probe .text-primary so DaisyUI's CSS vars resolve
            const probe = document.createElement('span');
            probe.className = 'text-primary';
            probe.style.cssText = 'position:fixed;top:-100px;left:-100px;pointer-events:none;opacity:0;';
            document.body.appendChild(probe);
            let boltColor: [number, number, number] = [0.75, 0.94, 0.3]; // Kollektiv lime fallback
            // DaisyUI v5 resolves to oklch() strings — computed color is NOT rgb.
            // Convert oklch -> oklab -> linear sRGB -> sRGB.
            const oklchToRgb = (L: number, C: number, Hdeg: number): [number, number, number] => {
                const h = (Hdeg * Math.PI) / 180;
                const a = C * Math.cos(h), b = C * Math.sin(h);
                const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
                const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
                const s_ = L - 0.0894841775 * a - 1.291485548 * b;
                const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
                const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
                const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
                const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
                const g = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(x, 0), 1 / 2.4) - 0.055);
                return [g(lr), g(lg), g(lb)];
            };
            const readBoltColor = () => {
                try {
                    const c = getComputedStyle(probe).color.trim();
                    let rgb: [number, number, number] | null = null;
                    if (c.startsWith('oklch')) {
                        const m = c.match(/[\d.]+/g);
                        if (m && m.length >= 3) {
                            const H = Number(m[2].replace('deg', ''));
                            rgb = oklchToRgb(Number(m[0]), Number(m[1]), isNaN(H) ? 0 : H);
                        }
                    } else if (c.startsWith('rgb')) {
                        const m = c.match(/\d+(\.\d+)?/g);
                        if (m && m.length >= 3) rgb = [Number(m[0]) / 255, Number(m[1]) / 255, Number(m[2]) / 255];
                    } else if (c.startsWith('#')) {
                        let hex = c.slice(1);
                        if (hex.length === 3) hex = hex.replace(/(.)/g, '$1$1');
                        const n = parseInt(hex.slice(0, 6), 16);
                        if (!isNaN(n)) rgb = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
                    }
                    if (rgb && rgb.every(v => isFinite(v) && v >= 0 && v <= 1)) boltColor = rgb;
                } catch { /* keep last color */ }
            };
            readBoltColor();
            const themeObserver = new MutationObserver(readBoltColor);
            themeObserver.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['data-theme'],
            });
            teardown.push(() => {
                themeObserver.disconnect();
                probe.remove();
            });

            // Live tuning knobs — the loop READS these every frame, so mutating
            // window.__STORM__.* in devtools applies instantly.
            const knobs = {
                fps: 30,
                brush: 0.55,        // stroke strength while the cursor moves
                radius: 0.055,      // stroke radius (uv units)
                trailDecay: 5.0,    // trail fade rate (/s) — lower = longer persistence
                advect: 0.02,       // how far the trail flows per unit intensity
                swirl: 0.004,       // curl in the flow
                trailGain: 1.0,     // composite brightness of the trail
                strikeGain: 0.8,    // ambient strike flash brightness
                ambientMin: 7,      // s between ambient strikes (min)
                ambientMax: 14,     // s between ambient strikes (max)
                firstStrike: 3,     // s until the first ambient strike
            };

            // Render sizes: composite at 0.75x (DPR-capped), trail at half of that.
            // needsRepaint must exist BEFORE resize() runs (reduced-motion repaint-once).
            let needsRepaint = true;
            const SCALE = 0.75;
            let W = 1, H = 1, TW = 1, TH = 1;
            let targets: { tex: WebGLTexture; fbo: WebGLFramebuffer }[] = [];
            let readIdx = 0;
            const destroyTargets = () => {
                for (const t of targets) {
                    gl.deleteTexture(t.tex);
                    gl.deleteFramebuffer(t.fbo);
                }
                targets = [];
            };
            const resize = () => {
                const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
                const w = Math.max(1, Math.round(canvas.clientWidth * dpr * SCALE));
                const h = Math.max(1, Math.round(canvas.clientHeight * dpr * SCALE));
                if (w === W && h === H && targets.length === 2) return;
                W = w; H = h;
                canvas.width = W;
                canvas.height = H;
                destroyTargets();
                TW = Math.max(1, W >> 1);
                TH = Math.max(1, H >> 1);
                targets = [makeTarget(TW, TH), makeTarget(TW, TH)];
                readIdx = 0;
                needsRepaint = true;
            };
            resize();
            window.addEventListener('resize', resize);
            teardown.push(() => {
                window.removeEventListener('resize', resize);
                destroyTargets();
                gl.deleteBuffer(quad);
            });

            // Pointer tracking (uv space, y up): stroke from lastStroke -> pointer
            const pointer = { x: 0.5, y: 0.4 };
            const lastStroke = { x: 0.5, y: 0.4 };
            let pointerMoved = false;
            const onMove = (e: PointerEvent) => {
                pointer.x = e.clientX / Math.max(1, window.innerWidth);
                pointer.y = 1 - e.clientY / Math.max(1, window.innerHeight);
                pointerMoved = true;
            };
            window.addEventListener('pointermove', onMove, { passive: true });
            teardown.push(() => window.removeEventListener('pointermove', onMove));

            // Ambient strikes (kollektiv twist, kept subtle)
            let strike = 0, strikeX = 0.5, strikeY = 0;
            const strikeQueue: { x: number; strength: number }[] = [];
            let nextAmbient = knobs.firstStrike;

            const trailUni = {
                prev: uni(trailProg, 'uPrev'), prevPos: uni(trailProg, 'uPrevPos'),
                currPos: uni(trailProg, 'uCurrPos'), dt: uni(trailProg, 'uDt'),
                aspect: uni(trailProg, 'uAspect'), decay: uni(trailProg, 'uDecay'),
                brush: uni(trailProg, 'uBrush'), radius: uni(trailProg, 'uRadius'),
                advect: uni(trailProg, 'uAdvect'), swirl: uni(trailProg, 'uSwirl'),
                time: uni(trailProg, 'uTime'),
            };
            const compUni = {
                trail: uni(compProg, 'uTrail'), time: uni(compProg, 'uTime'),
                res: uni(compProg, 'uRes'), bolt: uni(compProg, 'uBolt'),
                gain: uni(compProg, 'uTrailGain'), strike: uni(compProg, 'uStrike'),
                strikeX: uni(compProg, 'uStrikeX'), strikeY: uni(compProg, 'uStrikeY'),
            };

            let last = performance.now();
            let acc = 0;
            let simT = 0;

            const stepTrail = (dt: number) => {
                const write = targets[readIdx ^ 1];
                const read = targets[readIdx];
                gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
                gl.viewport(0, 0, TW, TH);
                gl.useProgram(trailProg);
                bindQuad(trailProg);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, read.tex);
                gl.uniform1i(trailUni.prev, 0);
                gl.uniform2f(trailUni.prevPos, lastStroke.x, lastStroke.y);
                gl.uniform2f(trailUni.currPos, pointer.x, pointer.y);
                gl.uniform1f(trailUni.dt, dt);
                gl.uniform1f(trailUni.aspect, W / H);
                gl.uniform1f(trailUni.decay, knobs.trailDecay);
                gl.uniform1f(trailUni.brush, pointerMoved ? knobs.brush : 0);
                gl.uniform1f(trailUni.radius, knobs.radius);
                gl.uniform1f(trailUni.advect, knobs.advect);
                gl.uniform1f(trailUni.swirl, knobs.swirl);
                gl.uniform1f(trailUni.time, simT);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                lastStroke.x = pointer.x;
                lastStroke.y = pointer.y;
                pointerMoved = false;
                readIdx ^= 1;
            };

            const composite = () => {
                gl.viewport(0, 0, W, H);
                gl.useProgram(compProg);
                bindQuad(compProg);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, targets[readIdx].tex);
                gl.uniform1i(compUni.trail, 0);
                gl.uniform1f(compUni.time, simT);
                gl.uniform2f(compUni.res, W, H);
                gl.uniform3f(compUni.bolt, boltColor[0], boltColor[1], boltColor[2]);
                gl.uniform1f(compUni.gain, knobs.trailGain);
                gl.uniform1f(compUni.strike, strike * knobs.strikeGain);
                gl.uniform1f(compUni.strikeX, strikeX);
                gl.uniform1f(compUni.strikeY, strikeY);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            };

            const loop = (now: number) => {
                raf = requestAnimationFrame(loop);
                if (document.hidden) { last = now; return; }
                if (gl.isContextLost()) { last = now; return; }
                if (reduced) {
                    if (!needsRepaint) return;
                    needsRepaint = false;
                    simT += 0.016; // gentle static cloud phase
                    composite();
                    return;
                }
                const dtRaw = (now - last) / 1000;
                last = now;
                const dt = Math.min(dtRaw, 0.1);
                const frameMs = 1000 / Math.max(5, knobs.fps);
                acc += dt * 1000;
                if (acc < frameMs) return;
                acc -= frameMs;

                simT += dt;

                // ambient strike scheduling
                nextAmbient -= dt;
                if (nextAmbient <= 0) {
                    strikeQueue.push({
                        x: 0.15 + Math.random() * 0.7,
                        strength: 0.55 + Math.random() * 0.45,
                    });
                    nextAmbient = knobs.ambientMin + Math.random() * Math.max(0, knobs.ambientMax - knobs.ambientMin);
                }
                if (strike <= 0.001 && strikeQueue.length > 0) {
                    const s = strikeQueue.shift();
                    if (s) {
                        strikeX = s.x;
                        strikeY = 0.3 + Math.random() * 0.55;
                        strike = s.strength;
                    }
                }
                strike *= Math.exp(-dt * 3.2);

                stepTrail(dt);
                composite();
            };

            resize();
            if (reduced) {
                composite(); // single static paint; loop handles resize repaints
            }
            raf = requestAnimationFrame(loop);

            // Dev-only tuning console (dead-code-eliminated from prod build).
            if (import.meta.env.DEV) {
                (window as unknown as { __STORM__?: object }).__STORM__ = Object.assign(knobs, {
                    strikeNow(x?: number, strength = 1) {
                        strikeQueue.push({ x: x ?? 0.5, strength });
                    },
                    clearQueue() { strikeQueue.length = 0; },
                    state() {
                        return {
                            trailSize: [TW, TH],
                            canvasSize: [W, H],
                            boltColor: boltColor.map(c => Number(c.toFixed(3))),
                            strike: Number(strike.toFixed(3)),
                            queued: strikeQueue.length,
                            pointer: [Number(pointer.x.toFixed(3)), Number(pointer.y.toFixed(3))],
                            moved: pointerMoved,
                        };
                    },
                });
            }

            return true;
        };

        const onLost = (e: Event) => {
            e.preventDefault(); // required so restoration is allowed
            cancelAnimationFrame(raf);
        };
        const onRestored = () => { boot(); };
        canvas.addEventListener('webglcontextlost', onLost);
        canvas.addEventListener('webglcontextrestored', onRestored);

        if (!boot() && !disposed) {
            // Contexts can be momentarily unavailable during early page boot.
            // Retry with backoff — chained, so each attempt only fires if the
            // previous one failed.
            const retryDelays = [250, 1000, 3000];
            let retryIdx = 0;
            const attemptBoot = () => {
                if (disposed || boot()) return;
                if (retryIdx < retryDelays.length) {
                    const delay = retryDelays[retryIdx];
                    retryIdx++;
                    retryTimer = setTimeout(attemptBoot, delay);
                }
            };
            attemptBoot();
        }

        return () => {
            disposed = true;
            if (retryTimer) clearTimeout(retryTimer);
            canvas.removeEventListener('webglcontextlost', onLost);
            canvas.removeEventListener('webglcontextrestored', onRestored);
            runTeardown();
            cancelAnimationFrame(raf);
            if (import.meta.env.DEV) delete (window as unknown as { __STORM__?: object }).__STORM__;
            // NOTE: deliberately NO WEBGL_lose_context here — see header comment.
        };
    }, []);

    return <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full pointer-events-none" />;
};

export default StormBackground;

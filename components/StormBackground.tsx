import React, { useEffect, useRef } from 'react';

/**
 * StormBackground — onlook.com-style storm background for the boot loader.
 *
 * COMPOSITION (parameter-exact to onlook.com's public Unicorn Studio scene,
 * /scenes/flow-background.json — mirrored from their dumped constants; the GLSL
 * below is ORIGINAL, written from scratch: their runtime is proprietary and
 * their repo AGPL-3.0 vs kollektiv GPL-3.0 — see CLAUDE.md "License hygiene"):
 *
 * 1. Base: rotated linear gradient #151515 -> black (their exact 0.0824 gray,
 *    rotation -2.649 rad, dither 0.005). NO cloud brightness — the "clouds" on
 *    onlook are just the wake being warped by noise.
 * 2. Trail pass (ping-pong FBO at 0.5x): feedback buffer, capsule distance
 *    stroke (pow(s,6)), advection along stored motion direction, liquify swirl
 *    on the dissipating wake (their exact mix 0.25 / amp 0.0025), decay
 *    0.87^60/s ≈ 6.0, read out at x2.5 strength and ADDED over the base.
 * 3. Displacement: whole image sampled at uv + (f*2 + r*0.31) where r,f are
 *    fbm fields (6 octaves, amp 0.25, gain 0.594, rotate-scale 2.5/octave,
 *    drift t*0.0072, center 0.569/0.651) — this is what makes the light snake
 *    through "clouds".
 *
 * Deviations from 1:1 (deliberate, user-approved twist + platform):
 * - Wake/bolt color = current theme's `primary` (oklch-probed, live) instead of
 *   onlook's crimson mix. Everything else is parameter-matched.
 * - Ambient strike flashes default OFF (onlook has none); knob `strikeGain`
 *   re-enables them.
 * - prefers-reduced-motion: single static paint, no trail, no tracking.
 *
 * Boot-safety guards: paused when tab hidden; context retry with backoff;
 * webglcontextlost/restored handled; NO WEBGL_lose_context in cleanup (React
 * StrictMode double-mounts on the same canvas in dev — a force-lost context
 * would wedge the remount forever).
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
uniform float uLiqMix;
uniform float uLiqAmp;

vec2 asp(vec2 p){ return vec2(p.x*uAspect, p.y); }

float capsuleDist(vec2 p, vec2 a, vec2 b){
  vec2 pa=p-a, ba=b-a;
  float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-6),0.0,1.0);
  return length(pa-ba*h);
}

// Liquify swirl (onlook idiom): 5 rotation/sine-perturbation octaves. Rotation
// steps sum to 3 full turns (net 0) so distortion stays local; ripple phase
// travels along dir (the stored motion direction) so the dying wake ripples
// the way it moved. Applied in proportion to DISSIPATED energy - the bright
// core stays coherent, the fading wake curls into ripples.
vec2 liquify(vec2 st, vec2 dir, float t){
  for(int i=1;i<=5;i++){
    float fi=float(i);
    float ang=fi*1.2566371; // i/5 * 2PI
    float ca=cos(ang), sa=sin(ang);
    st=vec2(st.x*ca-st.y*sa, st.x*sa+st.y*ca);
    st+=vec2(uLiqAmp*cos(fi*6.0*st.y+t*0.02*dir.x), uLiqAmp*sin(fi*6.0*st.x+t*0.02*dir.y));
  }
  return st;
}

void main(){
  vec2 uv=vUv;
  vec3 prev=texture2D(uPrev,uv).rgb;
  float inten=prev.r;
  vec2 dir=(prev.gb*2.0-1.0);
  float dirLen=length(dir);
  dir=dirLen>1e-4?dir/dirLen:vec2(0.0,1.0);

  // Advection: pull intensity from upstream along its own flow direction,
  // plus a slow swirl and the liquify curl on the dissipating wake.
  vec2 swirl=vec2(cos(uTime*0.7+uv.y*6.0),sin(uTime*0.6+uv.x*6.0))*uSwirl*(1.0-inten);
  vec2 baseUv=uv-dir*uAdvect*inten+swirl;
  vec2 liqUv=liquify(baseUv-dir*0.005,dir,uTime);
  vec2 su=clamp(mix(baseUv,liqUv,(1.0-inten)*uLiqMix),vec2(0.001),vec2(0.999));
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

// ---- Pass 2: composite (gradient base + trail additive + fbm displacement) --
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
uniform float uDebug;

const float PI = 3.14159265359;

float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float rand01(vec2 co){return fract(sin(dot(co.xy,vec2(12.9898,78.233)))*43758.5453);}

// Perlin-style gradient noise (public-domain idiom), signed output ~[-0.7,0.7]
vec2 gdir(vec2 p){
  float a=hash(p)*6.2831853;
  return vec2(cos(a),sin(a));
}
float pnoise(vec2 p){
  vec2 i=floor(p),f=fract(p);
  vec2 w=f*f*(3.0-2.0*f);
  float a=dot(gdir(i),f);
  float b=dot(gdir(i+vec2(1,0)),f-vec2(1,0));
  float c=dot(gdir(i+vec2(0,1)),f-vec2(0,1));
  float d=dot(gdir(i+vec2(1,1)),f-vec2(1,1));
  return mix(mix(a,b,w.x),mix(c,d,w.x),w.y);
}

// fbm — onlook's structure: 6 octaves, amp 0.25, gain 0.594, each octave
// rotate(1.25 rad) and scale 2.5, domain shifted by 100.
const mat2 OCT = mat2(cos(1.25),sin(1.25),-sin(1.25),cos(1.25))*2.5;
float fbm(vec2 st){
  float value=0.0;
  float amp=0.25;
  for(int i=0;i<6;i++){
    value+=amp*pnoise(st);
    st=OCT*st;
    st+=100.0;
    amp*=0.594;
  }
  return value;
}

// Base: onlook layer 0 — rotated linear gradient 0x151515 -> black + dither.
vec3 gradientBase(vec2 uv){
  vec2 c=uv-0.5;
  float ang=(0.0783-0.5)*2.0*PI;
  float ca=cos(ang), sa=sin(ang);
  c=vec2(c.x*ca-c.y*sa, c.x*sa+c.y*ca);
  float p=clamp(c.x+0.5,0.0,1.0);
  vec3 col=mix(vec3(0.08235294117647059),vec3(0.0),clamp(p/0.5,0.0,1.0));
  col+=rand01(gl_FragCoord.xy)*0.005;
  return col;
}

float bolt(vec2 p,float t){
  if(uStrike<=0.001) return 0.0;
  float inCol=step(0.0,p.y)*step(p.y,uStrikeY);
  if(inCol<0.5) return 0.0;
  float acc=0.0;
  vec2 cp=vec2(uStrikeX,uStrikeY*0.62);
  acc+=exp(-length((p-cp)*vec2(1.9,1.15))*2.6)*0.55;
  return acc*uStrike;
}

void main(){
  vec2 uv=vUv;
  float aspect=uRes.x/uRes.y;
  float t=uTime;

  // Displacement field — onlook layer 2, exact structure and constants.
  float multiplier=6.0*(0.15/((aspect+1.0)/2.0));
  vec2 pos=vec2(0.5685640362225097,0.6510996119016818);
  vec2 st=((uv-pos)*vec2(aspect,1.0))*multiplier*aspect;
  float rotA=0.135*-1.0*2.0*PI;
  float rc=cos(rotA), rs=sin(rotA);
  st=vec2(st.x*rc-st.y*rs, st.x*rs+st.y*rc);
  vec2 drift=vec2(t*0.005)*1.44;
  float tt=t*0.025;
  vec2 r=vec2(
    fbm(st-drift+vec2(1.7,9.2)+tt),
    fbm(st-drift+vec2(8.2,1.3)+tt)
  );
  float f=fbm(st+r-drift+tt)*0.31;
  vec2 offset=f*2.0+r*0.31;

  // Trail sampled through the displacement (onlook displaces the composite).
  float ti=texture2D(uTrail,uv+offset).r;

  // Debug: render the raw (displaced) trail buffer.
  if(uDebug>0.5){ gl_FragColor=vec4(ti,ti*0.6,0.0,1.0); return; }

  // Base, also displaced (onlook displaces everything below the fbm layer).
  vec3 col=gradientBase(uv+offset);

  // Trail added over base at their x2.5 readout strength (mix(bg, bg+c, s)
  // with additive blend == base + color*s). Color = theme primary (the twist).
  float strength=min(ti*2.5,1.0);
  col+=uBolt*strength*uTrailGain;

  // Optional ambient strike flash (off by default — onlook has none).
  col+=uBolt*bolt(uv*vec2(aspect,1.0),t)*uStrike*0.8;

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

            // --- Ping-pong trail targets (0.5x — onlook's userDownsample) ---
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

            // Live tuning knobs — the loop READS these every frame. Defaults are
            // parameter-matched to onlook's scene (see header); theme color and
            // optional strikes are the kollektiv twist.
            const knobs = {
                fps: 60,            // onlook runs 60
                brush: 1.0,         // stroke strength (saturates instantly)
                radius: 0.18,       // stroke radius (their effective ~0.32 in aspect space)
                trailDecay: 6.0,    // their 0.87^60/s
                advect: 0.03,       // flow per unit intensity
                swirl: 0.006,       // curl in the flow
                liquifyMix: 0.25,   // their exact value
                liquifyAmp: 0.0025, // their exact value
                trailGain: 1.0,     // composite brightness of the trail
                strikeGain: 0,      // ambient strikes OFF (onlook has none); 0.8 to enable
                ambientMin: 60,     // s between ambient strikes (min) — off unless enabled
                ambientMax: 120,    // s between ambient strikes (max)
                firstStrike: 60,    // s until the first ambient strike
                debug: 0,           // 1 = render raw trail buffer (dev diagnostics)
            };

            // Render sizes: composite at 1x CSS pixels (onlook dpi:1), trail at 0.5x.
            let needsRepaint = true;
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
                const w = Math.max(1, Math.round(canvas.clientWidth));
                const h = Math.max(1, Math.round(canvas.clientHeight));
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

            // Ambient strikes (kollektiv twist, off by default)
            let strike = 0, strikeX = 0.5, strikeY = 0;
            const strikeQueue: { x: number; strength: number }[] = [];
            let nextAmbient = knobs.firstStrike;

            const trailUni = {
                prev: uni(trailProg, 'uPrev'), prevPos: uni(trailProg, 'uPrevPos'),
                currPos: uni(trailProg, 'uCurrPos'), dt: uni(trailProg, 'uDt'),
                aspect: uni(trailProg, 'uAspect'), decay: uni(trailProg, 'uDecay'),
                brush: uni(trailProg, 'uBrush'), radius: uni(trailProg, 'uRadius'),
                advect: uni(trailProg, 'uAdvect'), swirl: uni(trailProg, 'uSwirl'),
                liqMix: uni(trailProg, 'uLiqMix'), liqAmp: uni(trailProg, 'uLiqAmp'),
                time: uni(trailProg, 'uTime'),
            };
            const compUni = {
                trail: uni(compProg, 'uTrail'), time: uni(compProg, 'uTime'),
                res: uni(compProg, 'uRes'), bolt: uni(compProg, 'uBolt'),
                gain: uni(compProg, 'uTrailGain'), strike: uni(compProg, 'uStrike'),
                strikeX: uni(compProg, 'uStrikeX'), strikeY: uni(compProg, 'uStrikeY'),
                debug: uni(compProg, 'uDebug'),
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
                gl.uniform1f(trailUni.liqMix, knobs.liquifyMix);
                gl.uniform1f(trailUni.liqAmp, knobs.liquifyAmp);
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
                gl.uniform1f(compUni.debug, knobs.debug);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            };

            const loop = (now: number) => {
                raf = requestAnimationFrame(loop);
                if (document.hidden) { last = now; return; }
                if (gl.isContextLost()) { last = now; return; }
                if (reduced) {
                    if (!needsRepaint) return;
                    needsRepaint = false;
                    simT += 0.016;
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

                if (knobs.strikeGain > 0) {
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
                }

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
                    debugTrail() {
                        if (targets.length !== 2) return { error: 'no targets' };
                        const px = new Uint8Array(TW * TH * 4);
                        gl.bindFramebuffer(gl.FRAMEBUFFER, targets[readIdx].fbo);
                        gl.readPixels(0, 0, TW, TH, gl.RGBA, gl.UNSIGNED_BYTE, px);
                        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                        let mx = 0, sum = 0, lit = 0;
                        for (let i = 0; i < px.length; i += 4) {
                            const v = px[i];
                            sum += v;
                            if (v > 0) lit++;
                            if (v > mx) mx = v;
                        }
                        return {
                            maxR: mx,
                            meanR: Number((sum / (TW * TH)).toFixed(2)),
                            litPixels: lit,
                            total: TW * TH,
                            fbStatus: gl.checkFramebufferStatus(gl.FRAMEBUFFER),
                        };
                    },
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

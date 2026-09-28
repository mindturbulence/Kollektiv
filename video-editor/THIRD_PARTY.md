# Third-party code in the video editor

Kollektiv is GPL-3.0. Parts of `video-editor/` are ported from two MIT-licensed
browser video editors (see docs/handbook/docs/07_VIDEO_EDITOR/VIDEO_EDITOR.md). Every
ported file starts with a `Ported from <repo>@<sha> <path>` header (or an
equivalent comment naming the source). MIT permits this; the notices below must
stay with the code. No code from VERT (AGPL-3.0) is used.

Runtime dependencies (not vendored): `mediabunny` 1.60.0 (MPL-2.0),
`@ffmpeg/ffmpeg` / `@ffmpeg/core` (existing), `@webgpu/types` (dev, BSD-3-Clause).

## Ported files

- freecut@4d62e80 src/features/timeline/utils/razor-snap.ts
- freecut@4d62e80 src/features/timeline/utils/slide-utils.ts
- freecut@4d62e80 src/features/timeline/utils/slip-utils.ts
- freecut@4d62e80 src/infrastructure/gpu-effects/common.ts
- freecut@4d62e80 src/infrastructure/gpu-effects/effects/blur.ts
- freecut@4d62e80 src/infrastructure/gpu-effects/effects/color.ts
- freecut@4d62e80 src/infrastructure/gpu-effects/effects/distort.ts
- freecut@4d62e80 src/infrastructure/gpu-effects/effects/keying.ts
- freecut@4d62e80 src/infrastructure/gpu-effects/effects/lut.ts
- freecut@4d62e80 src/infrastructure/gpu-effects/effects/stylize.ts
- freecut@4d62e80 src/infrastructure/gpu-effects/effects-pipeline.ts
- freecut@4d62e80 src/infrastructure/gpu-effects/index.ts
- freecut@4d62e80 src/infrastructure/gpu-effects/lut/cube-lut.ts
- freecut@4d62e80 src/infrastructure/gpu-effects/registry.ts
- freecut@4d62e80 src/infrastructure/gpu-effects/types.ts
- freecut@4d62e80 src/infrastructure/gpu-scopes/histogram-scope.ts
- freecut@4d62e80 src/infrastructure/gpu-scopes/scope-renderer.ts
- freecut@4d62e80 src/infrastructure/gpu-scopes/scope-render-pass.ts
- freecut@4d62e80 src/infrastructure/gpu-scopes/vectorscope-scope.ts
- freecut@4d62e80 src/infrastructure/gpu-scopes/waveform-scope.ts
- freecut@4d62e80 src/infrastructure/gpu-shared/fullscreen-canvas-pass.ts
- freecut@4d62e80 src/infrastructure/gpu-shared/fullscreen-quad.ts
- freecut@4d62e80 src/infrastructure/gpu-transitions/common.ts
- freecut@4d62e80 src/infrastructure/gpu-transitions/index.ts
- freecut@4d62e80 src/infrastructure/gpu-transitions/registry.ts
- freecut@4d62e80 src/infrastructure/gpu-transitions/transition-pipeline.ts
- freecut@4d62e80 src/infrastructure/gpu-transitions/transitions/chromatic.ts
- freecut@4d62e80 src/infrastructure/gpu-transitions/transitions/clock-wipe.ts
- freecut@4d62e80 src/infrastructure/gpu-transitions/transitions/dissolve.ts
- freecut@4d62e80 src/infrastructure/gpu-transitions/transitions/dissolve-variants.ts
- freecut@4d62e80 src/infrastructure/gpu-transitions/transitions/fade.ts
- freecut@4d62e80 src/infrastructure/gpu-transitions/transitions/film-gate-slip.ts
- freecut@4d62e80 src/infrastructure/gpu-transitions/transitions/flip.ts
- freecut@4d62e80 src/infrastructure/gpu-transitions/transitions/glitch.ts
- freecut@4d62e80 src/infrastructure/gpu-transitions/transitions/iris.ts
- freecut@4d62e80 src/infrastructure/gpu-transitions/transitions/lens-warp-zoom.ts
- freecut@4d62e80 src/infrastructure/gpu-transitions/transitions/light-leak-burn.ts
- freecut@4d62e80 src/infrastructure/gpu-transitions/transitions/liquid-distort.ts
- freecut@4d62e80 src/infrastructure/gpu-transitions/transitions/pixelate.ts
- freecut@4d62e80 src/infrastructure/gpu-transitions/transitions/radial-blur.ts
- freecut@4d62e80 src/infrastructure/gpu-transitions/transitions/slide.ts
- freecut@4d62e80 src/infrastructure/gpu-transitions/transitions/sparkles.ts
- freecut@4d62e80 src/infrastructure/gpu-transitions/transitions/wipe.ts
- freecut@4d62e80 src/infrastructure/gpu-transitions/types.ts
- freecut@4d62e80 src/shared/utils/curve-spline.ts
- freecut@4d62e80 src/shared/utils/gpu-curves.ts
- openreel@5f3c85e packages/core/src/export/webcodecs-limits.ts
- openreel@5f3c85e packages/core/src/media/mediabunny-engine.ts
- openreel@5f3c85e packages/core/src/video/chroma-key-engine.ts
- openreel@5f3c85e packages/core/src/video/color-grading-defaults.test.ts
- openreel@5f3c85e packages/core/src/video/color-grading-defaults.ts
- openreel@5f3c85e packages/core/src/video/color-grading-engine.test.ts
- openreel@5f3c85e packages/core/src/video/color-grading-engine.ts
- openreel@5f3c85e packages/core/src/video/frame-cache.ts
- openreel@5f3c85e packages/core/src/video/keyframe-engine.ts
- openreel@5f3c85e packages/core/src/video/speed-engine.test.ts
- openreel@5f3c85e packages/core/src/video/speed-engine.ts

Plus: `core/render/index.ts` (transition blend logic from openreel `packages/core/src/video/transition-engine.ts`).

## openreel-video — https://github.com/Augani/openreel-video (commit 5f3c85e)

```
MIT License

Copyright (c) 2024-2026 Augustus Otu and Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## FreeCut — https://github.com/walterlow/freecut (commit 4d62e80)

```
MIT License

Copyright (c) 2025 FreeCut

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

# webgpu-port branch notes

## STATUS

**Shelved 2026-08-21 by user decision** — HDR browser support judged too
poor and the edge cases too much work to carry for now. The branch is
complete and healthy, kept for later resumption; nothing was deployed and
master is untouched.

All five planned stages are done, committed, and verified:

| commit  | stage |
|---------|-------|
| 861ec51 | 0 — HDR spike: three r185 WebGPURenderer, rgba16float + display-p3 + extended tone mapping (`spike/`, self-contained npm project) |
| da9f931 | 1 — stack upgrade: three 0.185 / React 19 / r3f v9 / drei v10, still WebGL |
| 23b2503 | 2 — renderer swapped to WebGPURenderer; pole shader ported to TSL |
| 57b96f3 | 3 — labels off troika: offscreen-canvas textures on alpha quads |
| 64212e0 | 4 — equator lines on a node material; whole scene moved to the encoded domain |
| 568cb22 | 5 — HDR boost: rank corners ×2 on EDR displays, behind `?hdr=` |

State at shelving: `npm test`, `npm run kinds`, and the
`npm run verify -- <baseUrl>` sweep (headless, runs on the WebGPU backend
unchanged) all pass; `vite build` + `vite preview` verified, explorer
included. Visual parity against the pre-port WebGL build: 0.13% of pixels
differ on rest poses (desktop, 0.20% at 390×844) — all sub-pixel edge
antialiasing; measured with real-Chrome captures pixel-diffed against
pre-upgrade reference screenshots. The spike's decisive check passed: the
user eye-verified in Safari that the 2× plane genuinely glows brighter
than SDR white, and stage 5 was built on that verdict.

**Where a future session should pick up:**

- The user never gave the final eye-test feedback on the *app's* HDR look
  in Safari (glow quality, whether ×2 is the right scale) — the wind-down
  arrived mid-test. That tuning pass is the only unfinished intent.
- Decide whether `?hdr=` stays default-on when resuming; scale overrides
  (`?hdr=1.5` etc., capped at 4) exist for review.
- To eye-test again: `npx vite --port 3100` in the worktree, then
  `tailscale serve --bg --https=8446 http://127.0.0.1:3100` (spike:
  `python3 -m http.server 3200` in `spike/` after its own `npm install`,
  serve on 8445). Tear down with `tailscale serve --https=<port> off`.
- `docs/ARCHITECTURE.md` was kept current throughout — Rendering, Labels,
  and the HDR bullet under Open decisions describe the as-built system.
- Pre-existing limitation unchanged: `?blend=1`'s blend axis still does
  not track a rearranged lattice.

## What was learned

### Upgrade (three 0.160→0.185, r3f 8→9, React 18→19, drei 9→10)

- **No app source changes were needed** for the upgrade itself; all
  breakage came from tooling and renderer-swap work.
- Vite's dependency scanner crawls every `*.html` under the root. It found
  `spike/index.html` and resolved `three` to `spike/node_modules` — a
  second physical copy of three, which made fiber's `constructor`-equality
  checks fail (`Cannot assign to read only property 'position'`) and
  killed the canvas on mount. Fix: `optimizeDeps.entries: ['index.html']`
  in vite.config.js.
- The "Multiple instances of Three.js" console warning appears whenever
  both `three` and `three/webgpu` builds load; since r167+ they share
  `three.core.js`, so with a single physical package the classes are one
  registry and the warning is cosmetic. Check for real duplication by
  counting `Vector3 = class _Vector3` definitions across vite dep chunks.
- r3f v9: the `gl` prop accepts an async factory (`async (props) => { const
  r = new WebGPURenderer(props); await r.init(); return r; }`). `linear`
  now only sets `outputColorSpace` (color management is tied to `legacy`,
  so `THREE.Color(hex)` hex→linear conversion survives `linear`), and the
  flat/linear defaults are applied once at configuration, so post-init
  renderer settings stick.
- Planner numerics: the mirror|180|diagonal kind's eight candidates tie in
  composite motion to below 1e-9; three r185's math flips which one wins
  the tie under identical conditions (observed: ENTP→INTJ ySign −1 where
  r160 picked +1, also sensitive to viewport). Within contract — the
  favorites table deliberately leaves those directions to the motion
  scorer — but worth knowing when comparing captures across stacks.

### The encoded-domain insight (the load-bearing one)

The old GLSL materials (poles, troika text, Line2) wrote raw values into
the sRGB drawing buffer — no output transform anywhere. three's node
pipeline instead runs every fragment through an output pass (tone mapping
+ sRGB OETF). Pre-inverting the OETF per material makes opaque surfaces
match but is **wrong for everything translucent**: blending then happens
in the linear working buffer, and a 0.1-alpha white line over dark tones
reads far brighter than the same blend done on encoded values. The fix is
global: Canvas `flat linear` makes the output pass the identity, so the
whole scene renders in the encoded domain — raw values, encoded-space
alpha blending, encoded-space MSAA resolve, exactly like the WebGL
drawing buffer. Parity diffs halved when this landed (silhouette AA noise
vanished). Label textures must then be `NoColorSpace` so samplers pass
their bytes through.

### Label replacement (troika → canvas textures)

- The old build's troika (drei v9) fetched **Roboto** from
  `https://fonts.gstatic.com/s/roboto/v18/KFOmCnqEu92Fr1Mu4mxM.woff`; the
  replacement loads the same face via FontFace (drei v10's troika would
  have used Noto Sans via the unicode-font-resolver CDN — don't match
  against that).
- troika's `anchorY="middle"` centers on the **OS/2 typo**
  ascender/descender block (0.75/0.25em for Roboto). Canvas
  `fontBoundingBox` metrics report **hhea** (0.928/0.244em) — using them
  sits text ~3px low at this framing. Hardcoded typo metrics fixed it to
  sub-pixel.
- A texture outline rim loses its core to mip/bilinear filtering where
  troika's SDF rendered at display resolution: stroke gain 1.25 over the
  nominal outline widths matches, calibrated on scanline dark-pixel
  profiles (note the right gain depends on the mip-averaging domain — it
  was 1.6 before the encoded-domain switch).
- 256 texture px per world unit (~3× CSS density) beat 512: deeper mip
  chains washed the outline out.
- Composite centering (`main + gap + subscript` centered as a whole)
  reproduces the troika measured-width layout exactly; final rest-pose
  label diffs beat even drei-v10-troika-vs-drei-v9-troika (0.24% vs
  0.37%).

### Lines

Native 1px lines (THREE.Line, `LineBasicNodeMaterial`) and drei's Line2
screen-space quads rasterize with different effective coverage (MSAA
spreads native lines across ~2 device rows; Line2 under-covers its
nominal alpha nonlinearly). `?lines=` maps through a measured power fit
`alpha' = 0.6·v^1.25`, calibrated by integrated scanline bumps at v=0.1
and v=0.7 against identical frames — matches within ~4%.

### Spike / HDR findings

- three r185 supports the HDR canvas natively: `new WebGPURenderer({
  outputType: HalfFloatType })` → rgba16float + `toneMapping: { mode:
  'extended' }` in its canvas configure. Only `colorSpace: 'display-p3'`
  needs a manual `context.configure()` re-issue (read the existing config
  back and change just colorSpace — preserves usage/alphaMode/toneMapping).
- Software adapters (SwiftShader, headless CI) accept the configure call
  but fail float16 **texture creation** — probe with
  `pushErrorScope`/`getCurrentTexture`/`popErrorScope` on a scratch canvas
  *before* handing three the HalfFloatType output; three's pipelines all
  target the canvas format, so a post-hoc fallback breaks every pipeline.
- A browser may accept the tone-mapping option yet silently ignore it and
  clamp per-channel (hue distortion): require
  `getConfiguration().toneMapping.mode === 'extended'` on readback.
  Safari passes this; it's how /hdr.html's original findings were made.
- The node pipeline reaches EDR exactly as raw WebGPU does (Safari
  eye-verified on the spike's 2× TSL plane).
- macOS Chrome: mechanically supports the whole chain but reports the XDR
  display as SDR (`dynamic-range: high` false) — the boost's media-query
  gate keeps it bit-exact SDR there. `(dynamic-range: high)` cannot be
  emulated via CDP; `window.__hdrForce(n)` exists for headless
  verification of the boost math, `window.__hdr` exposes the gate state.
- sRGB OETF/EOTF in three's node builder extrapolate smoothly beyond 1.0
  (no clamp), so >1 encoded values survive the pipeline.

### Verification method (for redoing parity work)

Reference screenshots must come from the *pre-upgrade* build and the same
capture pipeline as the candidate: real Chrome, headed
(`chromium.launch({ channel: 'chrome', headless: false })` — headless
SwiftShader can't present float16), 1280×800 and 390×844 at
deviceScaleFactor 2, `?type=X&spin=0` rest poses (~3.5s font wait) and
`?type=ENTP&spin=0&to=INTP|INTJ&play=2500&dur=4` mid-dance frames at
25/50/75%. Diff with pixelmatch; investigate anything above ~0.2% or any
diff that clusters somewhere other than glyph/silhouette edges. Scanline
luminance profiles (not just diff percentages) are what actually located
the outline-weight, metric-offset, and line-blending mismatches.

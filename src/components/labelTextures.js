// Offscreen-2D-canvas label textures — the node-pipeline replacement for
// the troika Text labels (troika patches GLSL and cannot run on the node
// material system). Each label is drawn once into a canvas at LABEL_SCALE
// texture pixels per world unit (~3x the on-screen pixel density at the
// app's typical framing) and mapped onto an alpha quad; regeneration
// happens only when the drawn content changes (rank/type/selection), never
// per frame.
import * as THREE from 'three';

// The same Roboto face the troika labels fetched, loaded through the
// FontFace API; until it arrives (or if it never does) labels draw with
// the generic sans-serif fallback, mirroring troika's async font arrival.
const FONT_URL = 'https://fonts.gstatic.com/s/roboto/v18/KFOmCnqEu92Fr1Mu4mxM.woff';
const FONT_FAMILY = 'CubeLabel';
const fontStack = `${FONT_FAMILY}, sans-serif`;

let fontReady = false;
export const labelFontPromise = (
  typeof document !== 'undefined' && typeof FontFace !== 'undefined'
    ? new FontFace(FONT_FAMILY, `url(${FONT_URL})`).load()
      .then((face) => { document.fonts.add(face); })
      .catch(() => {})
    : Promise.resolve()
).then(() => { fontReady = true; });
export const isLabelFontReady = () => fontReady;

// Texture px per world unit — ~3x the CSS-pixel density of the cube at the
// app's typical framing. Higher looked strictly worse: the labels render
// minified, and deeper mip chains wash the thin dark outline out.
const LABEL_SCALE = 256;

// Vertical anchor parity with troika's anchorY="middle": the anchor sits at
// the middle of the font's typo-ascender..descender block (Roboto: 0.75em /
// 0.25em — verified against the troika build pixel-for-pixel), so the
// baseline lands (ascent − descent) / 2 below the anchor. Canvas font
// metrics can't be used here: fontBoundingBox reports the hhea metrics
// (0.928em / 0.244em for Roboto), which sit the text ~3px lower.
const TYPO_ASC = 0.75;
const TYPO_DESC = 0.25;
function measureBlock(ctx, text, sizePx) {
  return {
    width: ctx.measureText(text).width,
    drop: ((TYPO_ASC - TYPO_DESC) / 2) * sizePx, // baseline below the middle
    halfBlock: ((TYPO_ASC + TYPO_DESC) / 2) * sizePx, // block half-height
  };
}

// The stroke straddles the glyph edge, so lineWidth is twice the outward
// outline width. The extra factor compensates the texture pipeline: troika
// drew its SDF outline at display resolution and reached full black, while
// a texture rim loses its core to mip/bilinear filtering — measured against
// the troika reference on scanlines through glyph stems.
const OUTLINE_GAIN = 1.25;
function strokeAndFill(ctx, text, x, y, outlinePx, fill) {
  if (outlinePx > 0) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2 * outlinePx * OUTLINE_GAIN;
    ctx.strokeStyle = 'black';
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function toTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  // The scene renders in the encoded domain (the renderer's output pass is
  // the identity — see the Canvas setup), so the canvas pixels must pass
  // through the sampler untouched rather than being decoded to linear.
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// A function abbreviation with its rank as a trailing subscript — the same
// layout FnRankLabel computed from troika's measured widths: the composite
// (main + gap + subscript) is centered as a whole, the subscript's vertical
// center sits SUB_DY below the main text's.
const MAIN_SIZE = 0.36;
const SUB_SIZE = 0.2;
const SUB_GAP = 0.025;
const SUB_DY = -0.11;
const MAIN_OUTLINE = 0.02;
const SUB_OUTLINE = 0.015;
const FN_FILL = '#cccccc';

export function fnRankLabelTexture(fn, rank) {
  const px = (v) => v * LABEL_SCALE;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const mainFont = `${px(MAIN_SIZE)}px ${fontStack}`;
  const subFont = `${px(SUB_SIZE)}px ${fontStack}`;
  ctx.font = mainFont;
  const main = measureBlock(ctx, fn, px(MAIN_SIZE));
  ctx.font = subFont;
  const sub = measureBlock(ctx, String(rank), px(SUB_SIZE));

  // troika-measured layout, in texture px (composite centered by design);
  // canvas y grows downward, so the world-down SUB_DY becomes +px(-SUB_DY)
  const mainCenterX = -(px(SUB_GAP) + sub.width) / 2;
  const subLeftX = mainCenterX + main.width / 2 + px(SUB_GAP);
  const subCenterY = px(-SUB_DY);

  const pad = px(MAIN_OUTLINE) + 4;
  const halfW = (main.width + px(SUB_GAP) + sub.width) / 2 + pad;
  const halfH = Math.max(main.halfBlock, subCenterY + sub.halfBlock) + pad;
  canvas.width = Math.ceil(2 * halfW);
  canvas.height = Math.ceil(2 * halfH);

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  ctx.textAlign = 'center';
  ctx.font = mainFont;
  strokeAndFill(ctx, fn, cx + mainCenterX, cy + main.drop, px(MAIN_OUTLINE), FN_FILL);
  ctx.textAlign = 'left';
  ctx.font = subFont;
  strokeAndFill(ctx, String(rank), cx + subLeftX, cy + subCenterY + sub.drop, px(SUB_OUTLINE), FN_FILL);

  return {
    texture: toTexture(canvas),
    worldW: canvas.width / LABEL_SCALE,
    worldH: canvas.height / LABEL_SCALE,
  };
}

// The hover type badge: a single centered word.
const BADGE_SIZE = 0.15;
const BADGE_OUTLINE = 0.01;

export function typeBadgeTexture(type, selected) {
  const px = (v) => v * LABEL_SCALE;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = `${px(BADGE_SIZE)}px ${fontStack}`;
  ctx.font = font;
  const m = measureBlock(ctx, type, px(BADGE_SIZE));
  const pad = px(BADGE_OUTLINE) + 4;
  canvas.width = Math.ceil(m.width + 2 * pad);
  canvas.height = Math.ceil(2 * (m.halfBlock + pad));
  ctx.textAlign = 'center';
  ctx.font = font;
  strokeAndFill(
    ctx, type, canvas.width / 2, canvas.height / 2 + m.drop,
    px(BADGE_OUTLINE), selected ? 'white' : '#bbbbbb',
  );
  return {
    texture: toTexture(canvas),
    worldW: canvas.width / LABEL_SCALE,
    worldH: canvas.height / LABEL_SCALE,
  };
}

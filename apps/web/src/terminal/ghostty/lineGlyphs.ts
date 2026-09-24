// Synthesize Box Drawing (U+2500-U+257F) and Powerline separators
// (U+E0B0-U+E0B7) as geometry, for the same reason as blockGlyphs.ts: painting
// them from the font leaves hairline seams between cells, and Powerline pill
// separators in particular must abut the next cell's background with no gap.
// Native terminals draw these ranges themselves; this mirrors that.
//
// Box drawing is modelled as four arms (up/down/left/right), each light, heavy,
// or double. Arcs and diagonals are handled as special cases. Any code point not
// in the table falls back to the font (isLineGlyph returns false), so an
// unmapped glyph never renders wrong; it keeps the old behaviour.

const LIGHT = 1;
const HEAVY = 2;
const DOUBLE = 3;

type ArmWeight = 0 | typeof LIGHT | typeof HEAVY | typeof DOUBLE;
// [up, down, left, right]
type Arms = readonly [ArmWeight, ArmWeight, ArmWeight, ArmWeight];

// Arc corners U+256D-U+2570 and diagonals U+2571-U+2573 are drawn specially, not
// through the arm model.
const ARC = new Map<number, "dr" | "dl" | "ul" | "ur">([
  [0x256d, "dr"], // ╭
  [0x256e, "dl"], // ╮
  [0x256f, "ul"], // ╯
  [0x2570, "ur"], // ╰
]);
const DIAGONAL = new Map<number, "forward" | "back" | "cross">([
  [0x2571, "forward"], // ╱
  [0x2572, "back"], //    ╲
  [0x2573, "cross"], //   ╳
]);

// Box Drawing arm table. Dashed variants map to their solid equivalent (the dash
// pattern is not perceptible at cell sizes and a solid line tiles cleanly).
const BOX: Record<number, Arms> = {
  0x2500: [0, 0, LIGHT, LIGHT], //     ─
  0x2501: [0, 0, HEAVY, HEAVY], //     ━
  0x2502: [LIGHT, LIGHT, 0, 0], //     │
  0x2503: [HEAVY, HEAVY, 0, 0], //     ┃
  0x2504: [0, 0, LIGHT, LIGHT], //     ┄ (dashed → light)
  0x2505: [0, 0, HEAVY, HEAVY], //     ┅
  0x2506: [LIGHT, LIGHT, 0, 0], //     ┆
  0x2507: [HEAVY, HEAVY, 0, 0], //     ┇
  0x2508: [0, 0, LIGHT, LIGHT], //     ┈
  0x2509: [0, 0, HEAVY, HEAVY], //     ┉
  0x250a: [LIGHT, LIGHT, 0, 0], //     ┊
  0x250b: [HEAVY, HEAVY, 0, 0], //     ┋
  0x250c: [0, LIGHT, 0, LIGHT], //     ┌
  0x250d: [0, LIGHT, 0, HEAVY], //     ┍
  0x250e: [0, HEAVY, 0, LIGHT], //     ┎
  0x250f: [0, HEAVY, 0, HEAVY], //     ┏
  0x2510: [0, LIGHT, LIGHT, 0], //     ┐
  0x2511: [0, LIGHT, HEAVY, 0], //     ┑
  0x2512: [0, HEAVY, LIGHT, 0], //     ┒
  0x2513: [0, HEAVY, HEAVY, 0], //     ┓
  0x2514: [LIGHT, 0, 0, LIGHT], //     └
  0x2515: [LIGHT, 0, 0, HEAVY], //     ┕
  0x2516: [HEAVY, 0, 0, LIGHT], //     ┖
  0x2517: [HEAVY, 0, 0, HEAVY], //     ┗
  0x2518: [LIGHT, 0, LIGHT, 0], //     ┘
  0x2519: [LIGHT, 0, HEAVY, 0], //     ┙
  0x251a: [HEAVY, 0, LIGHT, 0], //     ┚
  0x251b: [HEAVY, 0, HEAVY, 0], //     ┛
  0x251c: [LIGHT, LIGHT, 0, LIGHT], // ├
  0x251d: [LIGHT, LIGHT, 0, HEAVY], // ┝
  0x251e: [HEAVY, LIGHT, 0, LIGHT], // ┞
  0x251f: [LIGHT, HEAVY, 0, LIGHT], // ┟
  0x2520: [HEAVY, HEAVY, 0, LIGHT], // ┠
  0x2521: [HEAVY, LIGHT, 0, HEAVY], // ┡
  0x2522: [LIGHT, HEAVY, 0, HEAVY], // ┢
  0x2523: [HEAVY, HEAVY, 0, HEAVY], // ┣
  0x2524: [LIGHT, LIGHT, LIGHT, 0], // ┤
  0x2525: [LIGHT, LIGHT, HEAVY, 0], // ┥
  0x2526: [HEAVY, LIGHT, LIGHT, 0], // ┦
  0x2527: [LIGHT, HEAVY, LIGHT, 0], // ┧
  0x2528: [HEAVY, HEAVY, LIGHT, 0], // ┨
  0x2529: [HEAVY, LIGHT, HEAVY, 0], // ┩
  0x252a: [LIGHT, HEAVY, HEAVY, 0], // ┪
  0x252b: [HEAVY, HEAVY, HEAVY, 0], // ┫
  0x252c: [0, LIGHT, LIGHT, LIGHT], // ┬
  0x252d: [0, LIGHT, HEAVY, LIGHT], // ┭
  0x252e: [0, LIGHT, LIGHT, HEAVY], // ┮
  0x252f: [0, LIGHT, HEAVY, HEAVY], // ┯
  0x2530: [0, HEAVY, LIGHT, LIGHT], // ┰
  0x2531: [0, HEAVY, HEAVY, LIGHT], // ┱
  0x2532: [0, HEAVY, LIGHT, HEAVY], // ┲
  0x2533: [0, HEAVY, HEAVY, HEAVY], // ┳
  0x2534: [LIGHT, 0, LIGHT, LIGHT], // ┴
  0x2535: [LIGHT, 0, HEAVY, LIGHT], // ┵
  0x2536: [LIGHT, 0, LIGHT, HEAVY], // ┶
  0x2537: [LIGHT, 0, HEAVY, HEAVY], // ┷
  0x2538: [HEAVY, 0, LIGHT, LIGHT], // ┸
  0x2539: [HEAVY, 0, HEAVY, LIGHT], // ┹
  0x253a: [HEAVY, 0, LIGHT, HEAVY], // ┺
  0x253b: [HEAVY, 0, HEAVY, HEAVY], // ┻
  0x253c: [LIGHT, LIGHT, LIGHT, LIGHT], // ┼
  0x253d: [LIGHT, LIGHT, HEAVY, LIGHT], // ┽
  0x253e: [LIGHT, LIGHT, LIGHT, HEAVY], // ┾
  0x253f: [LIGHT, LIGHT, HEAVY, HEAVY], // ┿
  0x2540: [HEAVY, LIGHT, LIGHT, LIGHT], // ╀
  0x2541: [LIGHT, HEAVY, LIGHT, LIGHT], // ╁
  0x2542: [HEAVY, HEAVY, LIGHT, LIGHT], // ╂
  0x2543: [HEAVY, LIGHT, HEAVY, LIGHT], // ╃
  0x2544: [HEAVY, LIGHT, LIGHT, HEAVY], // ╄
  0x2545: [LIGHT, HEAVY, HEAVY, LIGHT], // ╅
  0x2546: [LIGHT, HEAVY, LIGHT, HEAVY], // ╆
  0x2547: [HEAVY, LIGHT, HEAVY, HEAVY], // ╇
  0x2548: [LIGHT, HEAVY, HEAVY, HEAVY], // ╈
  0x2549: [HEAVY, HEAVY, HEAVY, LIGHT], // ╉
  0x254a: [HEAVY, HEAVY, LIGHT, HEAVY], // ╊
  0x254b: [HEAVY, HEAVY, HEAVY, HEAVY], // ╋
  0x254c: [0, 0, LIGHT, LIGHT], //     ╌
  0x254d: [0, 0, HEAVY, HEAVY], //     ╍
  0x254e: [LIGHT, LIGHT, 0, 0], //     ╎
  0x254f: [HEAVY, HEAVY, 0, 0], //     ╏
  0x2550: [0, 0, DOUBLE, DOUBLE], //   ═
  0x2551: [DOUBLE, DOUBLE, 0, 0], //   ║
  0x2552: [0, LIGHT, 0, DOUBLE], //    ╒
  0x2553: [0, DOUBLE, 0, LIGHT], //    ╓
  0x2554: [0, DOUBLE, 0, DOUBLE], //   ╔
  0x2555: [0, LIGHT, DOUBLE, 0], //    ╕
  0x2556: [0, DOUBLE, LIGHT, 0], //    ╖
  0x2557: [0, DOUBLE, DOUBLE, 0], //   ╗
  0x2558: [LIGHT, 0, 0, DOUBLE], //    ╘
  0x2559: [DOUBLE, 0, 0, LIGHT], //    ╙
  0x255a: [DOUBLE, 0, 0, DOUBLE], //   ╚
  0x255b: [LIGHT, 0, DOUBLE, 0], //    ╛
  0x255c: [DOUBLE, 0, LIGHT, 0], //    ╜
  0x255d: [DOUBLE, 0, DOUBLE, 0], //   ╝
  0x255e: [LIGHT, LIGHT, 0, DOUBLE], // ╞
  0x255f: [DOUBLE, DOUBLE, 0, LIGHT], // ╟
  0x2560: [DOUBLE, DOUBLE, 0, DOUBLE], // ╠
  0x2561: [LIGHT, LIGHT, DOUBLE, 0], // ╡
  0x2562: [DOUBLE, DOUBLE, LIGHT, 0], // ╢
  0x2563: [DOUBLE, DOUBLE, DOUBLE, 0], // ╣
  0x2564: [0, LIGHT, DOUBLE, DOUBLE], // ╤
  0x2565: [0, DOUBLE, LIGHT, LIGHT], // ╥
  0x2566: [0, DOUBLE, DOUBLE, DOUBLE], // ╦
  0x2567: [LIGHT, 0, DOUBLE, DOUBLE], // ╧
  0x2568: [DOUBLE, 0, LIGHT, LIGHT], // ╨
  0x2569: [DOUBLE, 0, DOUBLE, DOUBLE], // ╩
  0x256a: [LIGHT, LIGHT, DOUBLE, DOUBLE], // ╪
  0x256b: [DOUBLE, DOUBLE, LIGHT, LIGHT], // ╫
  0x256c: [DOUBLE, DOUBLE, DOUBLE, DOUBLE], // ╬
  0x2574: [0, 0, LIGHT, 0], //         ╴
  0x2575: [LIGHT, 0, 0, 0], //         ╵
  0x2576: [0, 0, 0, LIGHT], //         ╶
  0x2577: [0, LIGHT, 0, 0], //         ╷
  0x2578: [0, 0, HEAVY, 0], //         ╸
  0x2579: [HEAVY, 0, 0, 0], //         ╹
  0x257a: [0, 0, 0, HEAVY], //         ╺
  0x257b: [0, HEAVY, 0, 0], //         ╻
  0x257c: [0, 0, LIGHT, HEAVY], //     ╼
  0x257d: [LIGHT, HEAVY, 0, 0], //     ╽
  0x257e: [0, 0, HEAVY, LIGHT], //     ╾
  0x257f: [HEAVY, LIGHT, 0, 0], //     ╿
};

export function isBoxDrawing(codePoint: number): boolean {
  return BOX[codePoint] !== undefined || ARC.has(codePoint) || DIAGONAL.has(codePoint);
}

export function isPowerline(codePoint: number): boolean {
  return codePoint >= 0xe0b0 && codePoint <= 0xe0b7;
}

/** A one-cell string that this module can paint as geometry. */
export function isLineGlyphCell(text: string): boolean {
  if (text.length !== 1) return false;
  const cp = text.charCodeAt(0);
  return isBoxDrawing(cp) || isPowerline(cp);
}

function strokeWidthFor(weight: ArmWeight, cellHeight: number): number {
  const light = Math.max(1, Math.round(cellHeight / 9));
  if (weight === HEAVY) return Math.max(2, light * 2);
  return light; // light and each rail of a double line
}

/**
 * Paint a Box Drawing or Powerline code point. Callers must guarantee
 * isLineGlyphCell; unknown code points draw nothing (the caller should only
 * reach this for mapped glyphs).
 */
export function drawLineGlyph(
  context: CanvasRenderingContext2D,
  codePoint: number,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  round: (value: number) => number = Math.round,
): void {
  const left = round(x);
  const top = round(y);
  const right = round(x + width);
  const bottom = round(y + height);
  const midX = round(x + width / 2);
  const midY = round(y + height / 2);

  context.fillStyle = color;
  context.strokeStyle = color;

  if (isPowerline(codePoint)) {
    drawPowerline(context, codePoint, left, top, right, bottom, midY);
    return;
  }

  const arc = ARC.get(codePoint);
  if (arc) {
    drawArc(
      context,
      arc,
      left,
      top,
      right,
      bottom,
      midX,
      midY,
      Math.max(1, Math.round(height / 9)),
    );
    return;
  }
  const diagonal = DIAGONAL.get(codePoint);
  if (diagonal) {
    const t = Math.max(1, Math.round(height / 9));
    context.lineWidth = t;
    context.beginPath();
    if (diagonal === "forward" || diagonal === "cross") {
      context.moveTo(left, bottom);
      context.lineTo(right, top);
    }
    if (diagonal === "back" || diagonal === "cross") {
      context.moveTo(left, top);
      context.lineTo(right, bottom);
    }
    context.stroke();
    return;
  }

  const arms = BOX[codePoint];
  if (!arms) return;
  const [up, down, armLeft, armRight] = arms;
  // Draw each present arm from its edge to just past centre so junctions fill.
  const gap = Math.max(2, Math.round(height / 9) + 1); // double-line rail spacing
  drawArm(context, "up", up, left, top, right, bottom, midX, midY, gap, height);
  drawArm(context, "down", down, left, top, right, bottom, midX, midY, gap, height);
  drawArm(context, "left", armLeft, left, top, right, bottom, midX, midY, gap, height);
  drawArm(context, "right", armRight, left, top, right, bottom, midX, midY, gap, height);
}

function drawArm(
  context: CanvasRenderingContext2D,
  dir: "up" | "down" | "left" | "right",
  weight: ArmWeight,
  left: number,
  top: number,
  right: number,
  bottom: number,
  midX: number,
  midY: number,
  gap: number,
  cellHeight: number,
): void {
  if (weight === 0) return;
  const t = strokeWidthFor(weight, cellHeight);
  const half = Math.floor(t / 2);
  const rails = weight === DOUBLE ? [-gap, gap] : [0];
  for (const offset of rails) {
    if (dir === "left") context.fillRect(left, midY - half + offset, midX - left, t);
    else if (dir === "right") context.fillRect(midX, midY - half + offset, right - midX, t);
    else if (dir === "up") context.fillRect(midX - half + offset, top, t, midY - top);
    else context.fillRect(midX - half + offset, midY, t, bottom - midY);
  }
}

function drawArc(
  context: CanvasRenderingContext2D,
  arc: "dr" | "dl" | "ul" | "ur",
  left: number,
  top: number,
  right: number,
  bottom: number,
  midX: number,
  midY: number,
  thickness: number,
): void {
  context.lineWidth = thickness;
  const radius = Math.min(midX - left, midY - top);
  context.beginPath();
  // Each arc joins a vertical edge to a horizontal edge through a quarter circle
  // centred at the far corner of the two arms.
  switch (arc) {
    case "dr": // ╭ down + right
      context.moveTo(midX, bottom);
      context.lineTo(midX, midY + radius);
      context.arc(midX + radius, midY + radius, radius, Math.PI, Math.PI * 1.5);
      context.lineTo(right, midY);
      break;
    case "dl": // ╮ down + left
      context.moveTo(midX, bottom);
      context.lineTo(midX, midY + radius);
      context.arc(midX - radius, midY + radius, radius, Math.PI * 2, Math.PI * 1.5, true);
      context.lineTo(left, midY);
      break;
    case "ul": // ╯ up + left
      context.moveTo(midX, top);
      context.lineTo(midX, midY - radius);
      context.arc(midX - radius, midY - radius, radius, 0, Math.PI * 0.5);
      context.lineTo(left, midY);
      break;
    case "ur": // ╰ up + right
      context.moveTo(midX, top);
      context.lineTo(midX, midY - radius);
      context.arc(midX + radius, midY - radius, radius, Math.PI, Math.PI * 0.5, true);
      context.lineTo(right, midY);
      break;
  }
  context.stroke();
}

function drawPowerline(
  context: CanvasRenderingContext2D,
  codePoint: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
  midY: number,
): void {
  switch (codePoint) {
    case 0xe0b0: // right-pointing filled triangle
    case 0xe0b1: // right-pointing chevron (outline)
      context.beginPath();
      context.moveTo(left, top);
      context.lineTo(right, midY);
      context.lineTo(left, bottom);
      if (codePoint === 0xe0b0) {
        context.closePath();
        context.fill();
      } else {
        context.lineWidth = Math.max(1, Math.round((bottom - top) / 9));
        context.stroke();
      }
      return;
    case 0xe0b2: // left-pointing filled triangle
    case 0xe0b3: // left-pointing chevron (outline)
      context.beginPath();
      context.moveTo(right, top);
      context.lineTo(left, midY);
      context.lineTo(right, bottom);
      if (codePoint === 0xe0b2) {
        context.closePath();
        context.fill();
      } else {
        context.lineWidth = Math.max(1, Math.round((bottom - top) / 9));
        context.stroke();
      }
      return;
    case 0xe0b4: // right filled half ellipse
    case 0xe0b5: // right half ellipse (outline)
    case 0xe0b6: // left filled half ellipse
    case 0xe0b7: {
      // left half ellipse (outline). A half ellipse spanning the full cell
      // (flat edge against the neighbouring segment, bulge across the cell
      // width) matches the Nerd Font glyph and stays inside the cell; a circle
      // sized to the cell height would spill into the next column.
      const flatOnLeft = codePoint <= 0xe0b5;
      const cy = (top + bottom) / 2;
      context.beginPath();
      context.ellipse(
        flatOnLeft ? left : right,
        cy,
        right - left,
        (bottom - top) / 2,
        0,
        flatOnLeft ? -Math.PI / 2 : Math.PI / 2,
        flatOnLeft ? Math.PI / 2 : (Math.PI * 3) / 2,
      );
      if (codePoint === 0xe0b4 || codePoint === 0xe0b6) {
        context.closePath();
        context.fill();
      } else {
        context.lineWidth = Math.max(1, Math.round((bottom - top) / 9));
        context.stroke();
      }
      return;
    }
    default:
      return;
  }
}

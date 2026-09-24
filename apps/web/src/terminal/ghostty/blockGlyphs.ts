// Synthesize Unicode Block Elements (U+2580-U+259F) and the filled corner
// triangles as filled geometry rather than painting the font's glyph. Terminal
// fonts often ship a full block (U+2588) and its relatives that do not cover the
// whole cell, so tiling them through fillText leaves hairline seams between
// adjacent cells, most visible on progress bars and shaded fills. Native
// terminals (Ghostty, Kitty, WezTerm, iTerm2) draw these ranges as geometry for
// the same reason. Box drawing and Powerline separators live in lineGlyphs.ts.

export function isBlockElement(codePoint: number): boolean {
  return codePoint >= 0x2580 && codePoint <= 0x259f;
}

// The four filled corner triangles from Geometric Shapes. Progress bars and
// Powerline-style slants use these as a tapering leading edge; the font glyph is
// often drawn small and centred, so a bar's edge looks like a tiny triangle
// instead of a full-height slant. Synthesizing them fills the cell corner to
// corner. Keys map to the two cell corners the hypotenuse runs between.
const CORNER_TRIANGLE = new Set([0x25e2, 0x25e3, 0x25e4, 0x25e5]);

/**
 * True when a cell should be painted geometrically instead of via the font.
 * Covers block elements and the four filled corner triangles; all are single
 * BMP code points, so a one-unit string is enough to detect them without
 * decoding surrogate pairs.
 */
export function isBlockElementCell(text: string): boolean {
  if (text.length !== 1) return false;
  const cp = text.charCodeAt(0);
  return isBlockElement(cp) || CORNER_TRIANGLE.has(cp);
}

// Shade fills (░▒▓) approximate the checkerboard patterns with a flat alpha.
// A solid translucent fill tiles seamlessly, which is the whole point; the exact
// stipple is not perceptible at terminal cell sizes.
const SHADE_ALPHA: Record<number, number> = {
  0x2591: 0.25, // ░ light shade
  0x2592: 0.5, //  ▒ medium shade
  0x2593: 0.75, // ▓ dark shade
};

// Quadrant coverage as a 4-bit mask: 1=upper-left, 2=upper-right,
// 4=lower-left, 8=lower-right. Covers U+2596-U+259F.
const QUADRANTS: Record<number, number> = {
  0x2596: 0b0100, // ▖ lower left
  0x2597: 0b1000, // ▗ lower right
  0x2598: 0b0001, // ▘ upper left
  0x2599: 0b1101, // ▙ upper left + lower left + lower right
  0x259a: 0b1001, // ▚ upper left + lower right
  0x259b: 0b0111, // ▛ upper left + upper right + lower left
  0x259c: 0b1011, // ▜ upper left + upper right + lower right
  0x259d: 0b0010, // ▝ upper right
  0x259e: 0b0110, // ▞ upper right + lower left
  0x259f: 0b1110, // ▟ upper right + lower left + lower right
};

/**
 * Paint a Block Element code point into the cell rectangle. Edges are snapped to
 * whole pixels via `round` so neighbouring cells abut exactly with no seam;
 * pass a device-pixel snap on scaled contexts. `color` is any canvas fill
 * string; shade characters draw it at reduced alpha.
 *
 * Callers must guarantee `isBlockElement(codePoint)`; unknown code points draw a
 * full cell as a safe fallback.
 */
export function drawBlockElement(
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
  const cellWidth = right - left;
  const cellHeight = bottom - top;
  const midX = round(x + width / 2);
  const midY = round(y + height / 2);

  context.fillStyle = color;

  // Filled corner triangles ◢◣◤◥ (U+25E2-U+25E5): fill the cell corner-to-corner
  // so a bar's slanted edge is full height, not a small centred glyph.
  if (codePoint >= 0x25e2 && codePoint <= 0x25e5) {
    context.beginPath();
    switch (codePoint) {
      case 0x25e2: // ◢ lower right
        context.moveTo(right, top);
        context.lineTo(right, bottom);
        context.lineTo(left, bottom);
        break;
      case 0x25e3: // ◣ lower left
        context.moveTo(left, top);
        context.lineTo(left, bottom);
        context.lineTo(right, bottom);
        break;
      case 0x25e4: // ◤ upper left
        context.moveTo(left, top);
        context.lineTo(right, top);
        context.lineTo(left, bottom);
        break;
      case 0x25e5: // ◥ upper right
        context.moveTo(left, top);
        context.lineTo(right, top);
        context.lineTo(right, bottom);
        break;
    }
    context.closePath();
    context.fill();
    return;
  }

  // Lower eighths ▁▂▃▄▅▆▇█ (U+2581-U+2588): N eighths filled from the bottom.
  if (codePoint >= 0x2581 && codePoint <= 0x2588) {
    const eighths = codePoint - 0x2580; // 1..8
    const fillTop = round(y + (height * (8 - eighths)) / 8);
    context.fillRect(left, fillTop, cellWidth, bottom - fillTop);
    return;
  }
  // Left eighths ▉▊▋▌▍▎▏ (U+2589-U+258F): N eighths filled from the left.
  if (codePoint >= 0x2589 && codePoint <= 0x258f) {
    const eighths = 8 - (codePoint - 0x2588); // 7..1
    const fillRight = round(x + (width * eighths) / 8);
    context.fillRect(left, top, fillRight - left, cellHeight);
    return;
  }

  switch (codePoint) {
    case 0x2580: // ▀ upper half
      context.fillRect(left, top, cellWidth, midY - top);
      return;
    case 0x2590: // ▐ right half
      context.fillRect(midX, top, right - midX, cellHeight);
      return;
    case 0x2594: // ▔ upper one eighth
      context.fillRect(left, top, cellWidth, round(y + height / 8) - top);
      return;
    case 0x2595: {
      // ▕ right one eighth
      const eighthLeft = round(x + (width * 7) / 8);
      context.fillRect(eighthLeft, top, right - eighthLeft, cellHeight);
      return;
    }
    default:
      break;
  }

  const shade = SHADE_ALPHA[codePoint];
  if (shade !== undefined) {
    const previous = context.globalAlpha;
    context.globalAlpha = previous * shade;
    context.fillRect(left, top, cellWidth, cellHeight);
    context.globalAlpha = previous;
    return;
  }

  const mask = QUADRANTS[codePoint];
  if (mask !== undefined) {
    if (mask & 0b0001) context.fillRect(left, top, midX - left, midY - top);
    if (mask & 0b0010) context.fillRect(midX, top, right - midX, midY - top);
    if (mask & 0b0100) context.fillRect(left, midY, midX - left, bottom - midY);
    if (mask & 0b1000) context.fillRect(midX, midY, right - midX, bottom - midY);
    return;
  }

  // Unknown block code point: fill the cell so we never leave a hole.
  context.fillRect(left, top, cellWidth, cellHeight);
}

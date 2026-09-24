import { describe, expect, it } from "vite-plus/test";

import { drawLineGlyph, isBoxDrawing, isLineGlyphCell, isPowerline } from "./lineGlyphs";

describe("isLineGlyphCell", () => {
  it("detects box drawing and powerline, ignores text", () => {
    expect(isLineGlyphCell("│")).toBe(true); // U+2502
    expect(isLineGlyphCell("┼")).toBe(true); // U+253C
    expect(isLineGlyphCell("")).toBe(true); // powerline right triangle
    expect(isLineGlyphCell("a")).toBe(false);
    expect(isLineGlyphCell("█")).toBe(false); // block element is handled elsewhere
    expect(isLineGlyphCell("ab")).toBe(false);
  });

  it("classifies ranges", () => {
    expect(isBoxDrawing(0x2500)).toBe(true);
    expect(isBoxDrawing(0x257f)).toBe(true);
    expect(isBoxDrawing(0x2580)).toBe(false);
    expect(isPowerline(0xe0b0)).toBe(true);
    expect(isPowerline(0xe0b7)).toBe(true);
    expect(isPowerline(0xe0af)).toBe(false);
  });
});

function recordingContext() {
  const rects: number[][] = [];
  const path: string[] = [];
  const context = {
    set fillStyle(_v: string) {},
    set strokeStyle(_v: string) {},
    set lineWidth(_v: number) {},
    fillRect: (...a: number[]) => rects.push(a),
    beginPath: () => path.push("begin"),
    moveTo: (x: number, y: number) => path.push(`move ${x},${y}`),
    lineTo: (x: number, y: number) => path.push(`line ${x},${y}`),
    arc: () => path.push("arc"),
    closePath: () => path.push("close"),
    fill: () => path.push("fill"),
    stroke: () => path.push("stroke"),
  } as unknown as CanvasRenderingContext2D;
  return { context, rects, path };
}

describe("drawLineGlyph", () => {
  it("draws a light vertical line down the cell centre", () => {
    const { context, rects } = recordingContext();
    drawLineGlyph(context, 0x2502, 0, 0, 10, 20, "#fff"); // │
    // Two vertical arms (up + down) meet at the centre and together span the
    // full height in the centre column.
    expect(rects.length).toBe(2);
    for (const [x, , w] of rects) {
      expect(x).toBeLessThan(6);
      expect(w).toBeGreaterThanOrEqual(1);
    }
    const minY = Math.min(...rects.map((r) => r[1]!));
    const maxY = Math.max(...rects.map((r) => r[1]! + r[3]!));
    expect(minY).toBe(0);
    expect(maxY).toBe(20);
  });

  it("draws a light cross as four arms meeting at the centre", () => {
    const { context, rects } = recordingContext();
    drawLineGlyph(context, 0x253c, 0, 0, 10, 20, "#fff"); // ┼
    expect(rects.length).toBe(4);
  });

  it("fills the powerline right separator as a solid triangle", () => {
    const { context, path } = recordingContext();
    drawLineGlyph(context, 0xe0b0, 0, 0, 10, 20, "#fff");
    expect(path).toEqual(["begin", "move 0,0", "line 10,10", "line 0,20", "close", "fill"]);
  });

  it("strokes the powerline right chevron as an outline", () => {
    const { context, path } = recordingContext();
    drawLineGlyph(context, 0xe0b1, 0, 0, 10, 20, "#fff");
    expect(path).toEqual(["begin", "move 0,0", "line 10,10", "line 0,20", "stroke"]);
  });
});

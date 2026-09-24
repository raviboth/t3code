import { describe, expect, it } from "vite-plus/test";

import { drawBlockElement, isBlockElementCell } from "./blockGlyphs";
import { GHOSTTY_CELL_WIDE, type GhosttyCell, type GhosttySnapshot } from "./core";
import { drawLineGlyph, isLineGlyphCell } from "./lineGlyphs";
import { renderGhosttySnapshot } from "./renderer";

const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };

const cell = (text: string, overrides: Partial<GhosttyCell> = {}): GhosttyCell => ({
  text,
  wide: GHOSTTY_CELL_WIDE.narrow,
  foreground: WHITE,
  background: BLACK,
  bold: false,
  italic: false,
  invisible: false,
  strikethrough: false,
  overline: false,
  underline: false,
  selected: false,
  ...overrides,
});

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly style: string;
}

interface Recording {
  readonly context: CanvasRenderingContext2D;
  readonly rects: Rect[];
  readonly texts: string[];
  /** Every point a path visited, plus arc/ellipse bounding extents. */
  readonly pathPoints: [number, number][];
  readonly alpha: () => number;
}

function recordingContext(): Recording {
  const rects: Rect[] = [];
  const texts: string[] = [];
  const pathPoints: [number, number][] = [];
  let fillStyle = "";
  let globalAlpha = 1;
  const context = {
    canvas: { width: 2000, height: 2000 },
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value: string) {
      fillStyle = value;
    },
    set strokeStyle(_value: string) {},
    set lineWidth(_value: number) {},
    set font(_value: string) {},
    set textBaseline(_value: string) {},
    get globalAlpha() {
      return globalAlpha;
    },
    set globalAlpha(value: number) {
      globalAlpha = value;
    },
    fillRect: (x: number, y: number, w: number, h: number) =>
      rects.push({ x, y, w, h, style: fillStyle }),
    strokeRect: () => {},
    fillText: (text: string) => texts.push(text),
    beginPath: () => {},
    closePath: () => {},
    moveTo: (x: number, y: number) => pathPoints.push([x, y]),
    lineTo: (x: number, y: number) => pathPoints.push([x, y]),
    arc: (x: number, y: number, r: number, start: number, end: number, ccw = false) => {
      // Sample only the swept range; a quarter arc must not be judged by the
      // bounding box of its full circle.
      let sweep = end - start;
      if (!ccw && sweep < 0) sweep += Math.PI * 2;
      if (ccw && sweep > 0) sweep -= Math.PI * 2;
      for (let step = 0; step <= 32; step += 1) {
        const angle = start + (sweep * step) / 32;
        pathPoints.push([x + r * Math.cos(angle), y + r * Math.sin(angle)]);
      }
    },
    ellipse: (
      x: number,
      y: number,
      rx: number,
      ry: number,
      _rotation: number,
      start: number,
      end: number,
    ) => {
      // Sample the swept range so the bounds check sees the real extent of a
      // half ellipse rather than its full bounding box.
      for (let step = 0; step <= 32; step += 1) {
        const angle = start + ((end - start) * step) / 32;
        pathPoints.push([x + rx * Math.cos(angle), y + ry * Math.sin(angle)]);
      }
    },
    fill: () => {},
    stroke: () => {},
    save: () => {},
    restore: () => {},
    clip: () => {},
    rect: () => {},
    resetTransform: () => {},
  } as unknown as CanvasRenderingContext2D;
  return { context, rects, texts, pathPoints, alpha: () => globalAlpha };
}

function snapshotOf(rows: GhosttyCell[][], cols = Math.max(...rows.map((r) => r.length))) {
  const snapshot: GhosttySnapshot = {
    cols,
    rows: rows.length,
    foreground: WHITE,
    background: BLACK,
    cursor: WHITE,
    cursorX: -1,
    cursorY: -1,
    cursorVisible: false,
    cursorBlinking: false,
    cursorStyle: 1,
    dirtyRows: new Set(rows.map((_, index) => index)),
    rowData: rows.map((cells) => ({
      cells,
      text: cells.map((c) => c.text).join(""),
      isWrapContinuation: false,
      wrapsToNext: false,
    })),
  };
  return snapshot;
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);

const BLOCK_CODE_POINTS = [...range(0x2580, 0x259f), ...range(0x25e2, 0x25e5)];
const BOX_CODE_POINTS = range(0x2500, 0x257f).filter((cp) =>
  isLineGlyphCell(String.fromCharCode(cp)),
);
const POWERLINE_CODE_POINTS = range(0xe0b0, 0xe0b7);

// Characters that must keep rendering through the font, unchanged by synthesis.
const FONT_TEXT = [
  "a",
  "Z",
  "0",
  "~",
  "é", // precomposed Latin
  "e\u0301", // e + combining acute
  "Ω",
  "Ж",
  "→",
  "€",
  "∑",
  "⠂", // braille
  "■", // U+25A0, geometric shape outside the synthesized corner triangles
  "▲",
  "◆",
  "●",
  "😀", // astral emoji (surrogate pair)
  "👍🏽", // emoji + skin tone modifier
  "\u{1FB00}", // legacy computing sextant (astral)
  "\uE0A0", // Powerline branch symbol, outside E0B0-E0B7
  "\uE0B8", // Powerline extra separator, not synthesized
  "\uE0C0", // Powerline extra (flame), not synthesized
  "\uF418", // Nerd Font icon
];

describe("synthesized glyph coverage", () => {
  it("routes every block element and corner triangle to geometry", () => {
    for (const cp of BLOCK_CODE_POINTS) {
      expect(isBlockElementCell(String.fromCharCode(cp)), cp.toString(16)).toBe(true);
    }
  });

  it("maps the whole Box Drawing block", () => {
    // U+2500-U+257F is 128 code points; all of them have geometry.
    expect(BOX_CODE_POINTS).toHaveLength(128);
  });

  it("keeps other scripts, emoji, and symbols on the font path", () => {
    for (const text of FONT_TEXT) {
      expect(isBlockElementCell(text), JSON.stringify(text)).toBe(false);
      expect(isLineGlyphCell(text), JSON.stringify(text)).toBe(false);
    }
  });

  // An odd origin, fractional width, and fractional scale make rounding bugs
  // visible: every drawn point must stay inside the snapped cell.
  const dpr = 1.25;
  const snap = (value: number) => Math.round(value * dpr) / dpr;
  const x = 3.7;
  const y = 5.1;
  const width = 9.63;
  const height = 21;
  const left = snap(x);
  const top = snap(y);
  const right = snap(x + width);
  const bottom = snap(y + height);
  const epsilon = 1e-9;

  const expectInsideCell = (recording: Recording, label: string, slack = 0) => {
    for (const rect of recording.rects) {
      expect(rect.x, label).toBeGreaterThanOrEqual(left - epsilon);
      expect(rect.y, label).toBeGreaterThanOrEqual(top - epsilon);
      expect(rect.x + rect.w, label).toBeLessThanOrEqual(right + epsilon);
      expect(rect.y + rect.h, label).toBeLessThanOrEqual(bottom + epsilon);
      expect(rect.w, label).toBeGreaterThan(0);
      expect(rect.h, label).toBeGreaterThan(0);
    }
    for (const [px, py] of recording.pathPoints) {
      expect(px, label).toBeGreaterThanOrEqual(left - slack - epsilon);
      expect(px, label).toBeLessThanOrEqual(right + slack + epsilon);
      expect(py, label).toBeGreaterThanOrEqual(top - slack - epsilon);
      expect(py, label).toBeLessThanOrEqual(bottom + slack + epsilon);
    }
  };

  it("draws every block element inside its cell and on device pixels", () => {
    for (const cp of BLOCK_CODE_POINTS) {
      const recording = recordingContext();
      drawBlockElement(recording.context, cp, x, y, width, height, "#fff", snap);
      const label = `U+${cp.toString(16)}`;
      expect(recording.rects.length + recording.pathPoints.length, label).toBeGreaterThan(0);
      expectInsideCell(recording, label);
      for (const rect of recording.rects) {
        for (const edge of [rect.x, rect.y, rect.x + rect.w, rect.y + rect.h]) {
          expect(Math.abs(edge * dpr - Math.round(edge * dpr)), label).toBeLessThan(1e-6);
        }
      }
      expect(recording.alpha(), label).toBe(1);
    }
  });

  it("fills the full cell for the full block", () => {
    const recording = recordingContext();
    drawBlockElement(recording.context, 0x2588, x, y, width, height, "#fff", snap);
    expect(recording.rects).toEqual([
      { x: left, y: top, w: right - left, h: bottom - top, style: "#fff" },
    ]);
  });

  it("draws every box drawing glyph inside its cell", () => {
    for (const cp of BOX_CODE_POINTS) {
      const recording = recordingContext();
      drawLineGlyph(recording.context, cp, x, y, width, height, "#fff", snap);
      const label = `U+${cp.toString(16)}`;
      expect(recording.rects.length + recording.pathPoints.length, label).toBeGreaterThan(0);
      expectInsideCell(recording, label);
    }
  });

  it("draws every Powerline separator inside its cell", () => {
    for (const cp of POWERLINE_CODE_POINTS) {
      const recording = recordingContext();
      drawLineGlyph(recording.context, cp, x, y, width, height, "#fff", snap);
      const label = `U+${cp.toString(16)}`;
      expect(recording.pathPoints.length, label).toBeGreaterThan(0);
      expectInsideCell(recording, label);
    }
  });

  it("spans the full cell height with the Powerline half ellipses", () => {
    for (const cp of [0xe0b4, 0xe0b6]) {
      const recording = recordingContext();
      drawLineGlyph(recording.context, cp, x, y, width, height, "#fff", snap);
      const ys = recording.pathPoints.map(([, py]) => py);
      expect(Math.min(...ys)).toBeCloseTo(top, 9);
      expect(Math.max(...ys)).toBeCloseTo(bottom, 9);
    }
  });
});

describe("renderer routing", () => {
  it("sends every non-synthesized character to fillText and no synthesized one", () => {
    const synthesized = [...BLOCK_CODE_POINTS, ...BOX_CODE_POINTS, ...POWERLINE_CODE_POINTS].map(
      (cp) => String.fromCharCode(cp),
    );
    // One character per row so no text run merges neighbours.
    const rows = [...FONT_TEXT, ...synthesized].map((text) => [cell(text)]);
    const recording = recordingContext();
    renderGhosttySnapshot({
      context: recording.context,
      snapshot: snapshotOf(rows),
      metrics: { width: 9.63, height: 21, baseline: 15 },
      fontSize: 16,
      fontFamily: "monospace",
      padding: 4,
      devicePixelRatio: 1.25,
      forceFull: false,
      cursorOn: false,
    });
    expect(recording.texts).toEqual(FONT_TEXT);
  });

  it("places a block after a wide character in the column after its spacer", () => {
    const recording = recordingContext();
    renderGhosttySnapshot({
      context: recording.context,
      snapshot: snapshotOf([
        [
          cell("漢", { wide: GHOSTTY_CELL_WIDE.wide }),
          cell("", { wide: GHOSTTY_CELL_WIDE.spacerTail }),
          cell("█", { foreground: { r: 255, g: 0, b: 0 } }),
        ],
      ]),
      metrics: { width: 10, height: 20, baseline: 15 },
      fontSize: 16,
      fontFamily: "monospace",
      padding: 4,
      forceFull: false,
      cursorOn: false,
    });
    expect(recording.texts).toEqual(["漢"]);
    expect(recording.rects.filter((rect) => rect.style === "rgb(255, 0, 0)")).toEqual([
      { x: 24, y: 4, w: 10, h: 20, style: "rgb(255, 0, 0)" },
    ]);
  });

  it("does not draw invisible synthesized cells", () => {
    const recording = recordingContext();
    renderGhosttySnapshot({
      context: recording.context,
      snapshot: snapshotOf([[cell("█", { invisible: true, foreground: { r: 255, g: 0, b: 0 } })]]),
      metrics: { width: 10, height: 20, baseline: 15 },
      fontSize: 16,
      fontFamily: "monospace",
      padding: 4,
      forceFull: false,
      cursorOn: false,
    });
    expect(recording.rects.filter((rect) => rect.style === "rgb(255, 0, 0)")).toEqual([]);
  });
});

describe("device-pixel snapping", () => {
  const RED = { r: 255, g: 0, b: 0 };
  const BLUE = { r: 0, g: 0, b: 255 };
  const GREEN = { r: 0, g: 255, b: 0 };
  const onDevicePixel = (value: number, dpr: number) =>
    Math.abs(value * dpr - Math.round(value * dpr)) < 1e-6;

  // Common display scales and the cell widths real fonts measure to.
  const SCALES = [1, 1.25, 1.5, 1.75, 2, 2.25, 3];
  const WIDTHS = [7.2, 8.43, 9.63, 10, 12.5];

  const CASES = SCALES.flatMap((dpr) => WIDTHS.map((width) => ({ dpr, width })));

  it.each(CASES)(
    "leaves no seam between cells at $dpr x with $width px cells",
    ({ dpr, width }) => {
      const recording = recordingContext();
      const bar = Array.from({ length: 12 }, () => cell("█", { foreground: RED }));
      // Alternating background runs, and an underlined word, on the same grid.
      const backgrounds = Array.from({ length: 12 }, (_, index) =>
        cell(" ", { background: index % 3 === 0 ? BLUE : GREEN }),
      );
      const underlined = Array.from({ length: 12 }, () =>
        cell("x", { underline: true, foreground: RED }),
      );
      renderGhosttySnapshot({
        context: recording.context,
        snapshot: snapshotOf([bar, bar, backgrounds, underlined]),
        metrics: { width, height: 21, baseline: 15 },
        fontSize: 16,
        fontFamily: "monospace",
        padding: 4,
        devicePixelRatio: dpr,
        forceFull: false,
        cursorOn: false,
      });

      const blocks = recording.rects.filter((r) => r.style === "rgb(255, 0, 0)" && r.h > 1);
      expect(blocks).toHaveLength(24);
      for (const rect of blocks) {
        for (const edge of [rect.x, rect.y, rect.x + rect.w, rect.y + rect.h]) {
          expect(onDevicePixel(edge, dpr)).toBe(true);
        }
      }
      // Horizontal: each block ends where the next begins.
      for (const row of [blocks.slice(0, 12), blocks.slice(12)]) {
        for (let index = 1; index < row.length; index += 1) {
          expect(row[index]!.x).toBeCloseTo(row[index - 1]!.x + row[index - 1]!.w, 9);
        }
      }
      // Vertical: the second bar row starts where the first ends.
      expect(blocks[12]!.y).toBeCloseTo(blocks[0]!.y + blocks[0]!.h, 9);

      const fills = recording.rects.filter(
        (r) => r.style === "rgb(0, 0, 255)" || r.style === "rgb(0, 255, 0)",
      );
      for (let index = 1; index < fills.length; index += 1) {
        expect(fills[index]!.x).toBeCloseTo(fills[index - 1]!.x + fills[index - 1]!.w, 9);
        expect(onDevicePixel(fills[index]!.x, dpr)).toBe(true);
      }

      const underline = recording.rects.filter((r) => r.style === "rgb(255, 0, 0)" && r.h === 1);
      expect(underline).toHaveLength(12);
      for (let index = 1; index < underline.length; index += 1) {
        expect(underline[index]!.x).toBeCloseTo(
          underline[index - 1]!.x + underline[index - 1]!.w,
          9,
        );
      }
    },
  );

  it("covers a synthesized glyph edge to edge with the block cursor", () => {
    const dpr = 1.25;
    const recording = recordingContext();
    const snapshot = snapshotOf([[cell("a"), cell("█", { foreground: RED }), cell("b")]]);
    renderGhosttySnapshot({
      context: recording.context,
      snapshot: { ...snapshot, cursorX: 1, cursorY: 0, cursorVisible: true, cursorStyle: 1 },
      metrics: { width: 9.63, height: 21, baseline: 15 },
      fontSize: 16,
      fontFamily: "monospace",
      padding: 4,
      devicePixelRatio: dpr,
      forceFull: false,
      cursorOn: true,
    });
    const glyph = recording.rects.find((r) => r.style === "rgb(255, 0, 0)")!;
    const cursor = recording.rects.at(-1)!;
    expect(cursor.style).toBe("rgb(255, 255, 255)");
    expect({ x: cursor.x, y: cursor.y, w: cursor.w, h: cursor.h }).toEqual({
      x: glyph.x,
      y: glyph.y,
      w: glyph.w,
      h: glyph.h,
    });
  });
});

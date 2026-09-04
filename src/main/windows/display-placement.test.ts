import { describe, expect, it } from "vitest";
import {
  chooseDisplay,
  clampRectToWorkArea,
  moveRectWithinWorkArea,
  resolveBubbleWindowBounds,
  resolvePetWindowBounds,
  resolveSettingsWindowBounds,
  type DisplaySnapshot,
} from "./display-placement";
import { BUBBLE_DIALOGUE_WINDOW_HEIGHT, BUBBLE_REST_WINDOW_HEIGHT, BUBBLE_WINDOW_WIDTH } from "../../shared/contracts";

const displays: readonly DisplaySnapshot[] = [
  {
    id: "left",
    bounds: { x: -1920, y: 0, width: 1920, height: 1080 },
    workArea: { x: -1920, y: 0, width: 1920, height: 1040 },
    isPrimary: false,
  },
  {
    id: "primary",
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    isPrimary: true,
  },
];

describe("display placement", () => {
  it("uses the saved display when it still exists", () => {
    expect(chooseDisplay(displays, "left", { x: 120, y: 120 })).toEqual(displays[0]);
  });

  it("uses the display containing the saved point when the id changed", () => {
    expect(chooseDisplay(displays, "old-left-id", { x: -800, y: 400 })).toEqual(displays[0]);
  });

  it("falls back to the primary display when the saved display disappeared", () => {
    expect(chooseDisplay(displays, "missing", { x: 2600, y: 400 })).toEqual(displays[1]);
  });

  it("keeps every edge inside the work area with an 8 DIP margin", () => {
    expect(clampRectToWorkArea({ x: -2200, y: 1000, width: 320, height: 320 }, displays[0]!.workArea)).toEqual({
      x: -1912,
      y: 712,
      width: 320,
      height: 320,
    });
  });

  it("shortens pet movement at the edge of the visible work area", () => {
    expect(moveRectWithinWorkArea({ x: 1588, y: 712, width: 320, height: 320 }, displays[1]!.workArea, 12, 0)).toEqual({
      x: 1592,
      y: 712,
      width: 320,
      height: 320,
    });
  });

  it("places a missing position at the primary work-area bottom-right", () => {
    expect(resolvePetWindowBounds(displays, null, null, { width: 320, height: 320 })).toEqual({
      x: 1592,
      y: 712,
      width: 320,
      height: 320,
    });
  });

  it("keeps a nonzero visible rectangle when the work area cannot fit the normal margin", () => {
    expect(
      clampRectToWorkArea({ x: -100, y: -100, width: 320, height: 320 }, { x: 100, y: 200, width: 8, height: 0 })
    ).toEqual({ x: 103, y: 200, width: 2, height: 1 });
  });

  describe("settings window bounds resolution", () => {
    it("returns default 1000x720 when no saved bounds are provided", () => {
      expect(resolveSettingsWindowBounds(displays, null)).toEqual({
        width: 1000,
        height: 720,
      });
    });

    it("enforces minimum width and height", () => {
      expect(resolveSettingsWindowBounds(displays, { width: 400, height: 300 })).toEqual({
        width: 680,
        height: 520,
      });
    });

    it("clamps saved bounds to display work area if placed off-screen", () => {
      expect(
        resolveSettingsWindowBounds(displays, {
          width: 1200,
          height: 800,
          x: 1800,
          y: 900,
        })
      ).toEqual({
        x: 720,
        y: 240,
        width: 1200,
        height: 800,
      });
    });

    it("preserves valid custom bounds inside work area", () => {
      expect(
        resolveSettingsWindowBounds(displays, {
          width: 1100,
          height: 750,
          x: 200,
          y: 150,
        })
      ).toEqual({
        x: 200,
        y: 150,
        width: 1100,
        height: 750,
      });
    });
  });

  describe("resolveBubbleWindowBounds", () => {
    const workArea = { x: 0, y: 0, width: 1920, height: 1080 };
    const bubbleSize = { width: 320, height: 140 };

    it("places bubble above the pet with default zero gap (normal mid-screen)", () => {
      // Pet at x=500, y=500, size 220x240
      const petBounds = { x: 500, y: 500, width: 220, height: 240 };
      const result = resolveBubbleWindowBounds(petBounds, workArea, bubbleSize);

      expect(result.placement).toBe("top");
      expect(result.y).toBe(500 - 140 - 0); // 360
      // Pet center: 500 + 110 = 610. Bubble width 320 -> x = 610 - 160 = 450
      expect(result.x).toBe(450);
      expect(result.tailOffsetX).toBe(160); // Centered on bubble
    });

    it("supports custom gap when explicitly specified", () => {
      const petBounds = { x: 500, y: 500, width: 220, height: 240 };
      const result = resolveBubbleWindowBounds(petBounds, workArea, bubbleSize, 8, 8);

      expect(result.placement).toBe("top");
      expect(result.y).toBe(500 - 140 - 8); // 352
    });

    it("flips bubble to bottom when pet is near screen top (贴顶场景)", () => {
      // Pet at top edge: y=10
      const petBounds = { x: 500, y: 10, width: 220, height: 240 };
      const result = resolveBubbleWindowBounds(petBounds, workArea, bubbleSize);

      expect(result.placement).toBe("bottom");
      expect(result.y).toBe(10 + 240 + 0); // 250
      expect(result.x).toBe(450);
    });

    it("allows bubble on top for dialogue (80px) when headroom cannot fit rest prompt (140px)", () => {
      // Headroom above pet is 120px (workArea.y = 0, margin = 8).
      // Rest prompt requires 140 + 8 = 148px -> flips to bottom.
      // Dialogue requires 80 + 8 = 88px -> fits cleanly on top!
      const petBounds = { x: 500, y: 120, width: 220, height: 240 };
      const restBounds = resolveBubbleWindowBounds(petBounds, workArea, {
        width: BUBBLE_WINDOW_WIDTH,
        height: BUBBLE_REST_WINDOW_HEIGHT,
      });
      const dialogueBounds = resolveBubbleWindowBounds(petBounds, workArea, {
        width: BUBBLE_WINDOW_WIDTH,
        height: BUBBLE_DIALOGUE_WINDOW_HEIGHT,
      });

      expect(restBounds.placement).toBe("bottom");
      expect(restBounds.y).toBe(120 + 240); // 360
      expect(dialogueBounds.placement).toBe("top");
      expect(dialogueBounds.y).toBe(120 - 80); // 40
    });

    it("keeps bubble above when pet is near screen bottom (贴底场景)", () => {
      // Pet near bottom: y=800
      const petBounds = { x: 500, y: 800, width: 220, height: 240 };
      const result = resolveBubbleWindowBounds(petBounds, workArea, bubbleSize);

      expect(result.placement).toBe("top");
      expect(result.y).toBe(800 - 140 - 0); // 660
    });

    it("clamps bubble horizontally and shifts tail when pet is at left edge (贴左边缘)", () => {
      // Pet at left edge: x=8, center=118
      const petBounds = { x: 8, y: 500, width: 220, height: 240 };
      const result = resolveBubbleWindowBounds(petBounds, workArea, bubbleSize);

      // Ideal x = 118 - 160 = -42 -> clamped to workArea.x + margin = 8
      expect(result.x).toBe(8);
      // Tail points to pet center: 118 - 8 = 110 (clamped safely)
      expect(result.tailOffsetX).toBe(110);
    });

    it("clamps bubble horizontally and shifts tail when pet is at right edge (贴右边缘)", () => {
      // Pet at right edge: x = 1920 - 220 - 8 = 1692, center = 1802
      const petBounds = { x: 1692, y: 500, width: 220, height: 240 };
      const result = resolveBubbleWindowBounds(petBounds, workArea, bubbleSize);

      // Bubble max x = 1920 - 8 - 320 = 1592
      expect(result.x).toBe(1592);
      // Tail points to pet center: 1802 - 1592 = 210
      expect(result.tailOffsetX).toBe(210);
    });

    it("handles corner placement: top-left flips to bottom and clamps right", () => {
      const petBounds = { x: 8, y: 8, width: 220, height: 240 };
      const result = resolveBubbleWindowBounds(petBounds, workArea, bubbleSize);

      expect(result.placement).toBe("bottom");
      expect(result.y).toBe(8 + 240 + 0);
      expect(result.x).toBe(8);
      expect(result.tailOffsetX).toBe(110);
    });
  });
});

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSettingsWindowState, parseSettingsWindowState, saveSettingsWindowState } from "./settings-window-state";

describe("settings window state persistence and parsing", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "settings-window-state-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("parses valid bounds correctly", () => {
    expect(
      parseSettingsWindowState({
        width: 1024,
        height: 768,
        x: 100,
        y: 200,
      })
    ).toEqual({
      width: 1024,
      height: 768,
      x: 100,
      y: 200,
    });
  });

  it("parses bounds without position coordinates", () => {
    expect(
      parseSettingsWindowState({
        width: 900,
        height: 600,
      })
    ).toEqual({
      width: 900,
      height: 600,
    });
  });

  it("rejects bounds smaller than minWidth or minHeight", () => {
    expect(parseSettingsWindowState({ width: 500, height: 600 })).toBeNull();
    expect(parseSettingsWindowState({ width: 800, height: 400 })).toBeNull();
  });

  it("rejects invalid or corrupted inputs", () => {
    expect(parseSettingsWindowState(null)).toBeNull();
    expect(parseSettingsWindowState(undefined)).toBeNull();
    expect(parseSettingsWindowState("invalid")).toBeNull();
    expect(parseSettingsWindowState({ width: "1000", height: 700 })).toBeNull();
    expect(parseSettingsWindowState({ width: Number.NaN, height: 700 })).toBeNull();
  });

  it("saves and loads settings window bounds roundtrip", async () => {
    const original = { width: 1120, height: 760, x: 250, y: 180 };
    await saveSettingsWindowState(tempDir, original);

    const loaded = await loadSettingsWindowState(tempDir);
    expect(loaded).toEqual(original);
  });

  it("returns null when state file is missing or invalid", async () => {
    expect(await loadSettingsWindowState(tempDir)).toBeNull();
    expect(await loadSettingsWindowState(undefined)).toBeNull();
  });
});

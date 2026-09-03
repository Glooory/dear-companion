import { describe, expect, it } from "vitest";
import { createBubbleWindowOptions, createPetWindowOptions, createSettingsWindowOptions } from "./window-options";

describe("secure window options", () => {
  it("creates the transparent pet window with hardened renderer preferences", () => {
    const pet = createPetWindowOptions("/app/out/preload/index.js");

    expect(pet).toMatchObject({
      width: 220,
      height: 240,
      transparent: true,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      backgroundColor: "#00000000",
      autoHideMenuBar: true,
      focusable: true,
    });
    expect(pet.webPreferences).toMatchObject({
      preload: "/app/out/preload/index.js",
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    });
    expect(pet.webPreferences?.allowRunningInsecureContent).not.toBe(true);
    expect(pet.webPreferences?.experimentalFeatures).not.toBe(true);
  });

  it("creates the bubble window with 320x140 size and hardened renderer preferences", () => {
    const bubble = createBubbleWindowOptions("/app/out/preload/index.js");

    expect(bubble).toMatchObject({
      width: 320,
      height: 140,
      transparent: true,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      backgroundColor: "#00000000",
      autoHideMenuBar: true,
      focusable: true,
    });
    expect(bubble.webPreferences).toMatchObject({
      preload: "/app/out/preload/index.js",
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    });
  });

  it("creates the settings window with its default 1000x720 size, minimum size, and hardened preferences", () => {
    const settings = createSettingsWindowOptions("/app/out/preload/index.js");

    expect(settings).toMatchObject({
      width: 1000,
      height: 720,
      minWidth: 680,
      minHeight: 520,
      show: false,
    });
    expect(settings.webPreferences).toMatchObject({
      preload: "/app/out/preload/index.js",
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    });
    expect(settings.webPreferences?.allowRunningInsecureContent).not.toBe(true);
    expect(settings.webPreferences?.experimentalFeatures).not.toBe(true);
  });

  it("respects initial bounds when provided", () => {
    const settings = createSettingsWindowOptions("/app/out/preload/index.js", {
      width: 1100,
      height: 800,
      x: 100,
      y: 120,
    });

    expect(settings).toMatchObject({
      width: 1100,
      height: 800,
      minWidth: 680,
      minHeight: 520,
      x: 100,
      y: 120,
    });
  });

  it("returns fresh option and web-preference objects", () => {
    const first = createPetWindowOptions("/first/preload.js");
    const second = createPetWindowOptions("/second/preload.js");

    expect(first).not.toBe(second);
    expect(first.webPreferences).not.toBe(second.webPreferences);
    expect(first.webPreferences?.preload).toBe("/first/preload.js");
    expect(second.webPreferences?.preload).toBe("/second/preload.js");
  });
});

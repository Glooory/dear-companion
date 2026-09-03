import { describe, expect, it } from "vitest";
import { parseLaunchIntent } from "./launch-intent";

describe("parseLaunchIntent", () => {
  it("treats an ordinary launch as interactive", () => {
    expect(parseLaunchIntent(["Dear Companion"], {}, "win32")).toEqual({ autostart: false });
  });

  it("recognizes only the owned Windows autostart argument", () => {
    expect(parseLaunchIntent(["Dear Companion", "--autostart"], {}, "win32")).toEqual({
      autostart: true,
    });
    expect(parseLaunchIntent(["Dear Companion", "--autostart=true"], {}, "win32")).toEqual({
      autostart: false,
    });
  });

  it("accepts repeated owned flags without changing the intent", () => {
    expect(parseLaunchIntent(["Dear Companion", "--autostart", "--autostart"], {}, "win32")).toEqual({
      autostart: true,
    });
  });

  it("recognizes the macOS login-item signal", () => {
    expect(parseLaunchIntent(["Dear Companion"], { wasOpenedAtLogin: true }, "darwin")).toEqual({
      autostart: true,
    });
  });

  it("ignores unrelated arguments and platform-inappropriate signals", () => {
    expect(parseLaunchIntent(["Dear Companion", "--autostart"], {}, "darwin")).toEqual({
      autostart: false,
    });
    expect(parseLaunchIntent(["Dear Companion"], { wasOpenedAtLogin: true }, "win32")).toEqual({
      autostart: false,
    });
    expect(parseLaunchIntent(["Dear Companion", "--autostart"], { wasOpenedAtLogin: true }, "linux")).toEqual({
      autostart: false,
    });
  });
});

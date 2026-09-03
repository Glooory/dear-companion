import { describe, expect, it } from "vitest";
import { classifyApplicationUrl } from "./network-policy";

describe("classifyApplicationUrl", () => {
  it("allows only the owned application host", () => {
    expect(classifyApplicationUrl("app://renderer/index.html")).toBe("allow");
    expect(classifyApplicationUrl("app://renderer/pet-assets/pet-1/asset-1")).toBe("allow");
    expect(classifyApplicationUrl("app://rendererevil/index.html")).toBe("deny");
    expect(classifyApplicationUrl("app-lookalike://renderer/index.html")).toBe("deny");
  });

  it("allows an exact development origin only when explicitly configured", () => {
    const options = { developmentOrigin: "http://localhost:5173" };
    expect(classifyApplicationUrl("http://localhost:5173/index.html", options)).toBe("allow");
    expect(classifyApplicationUrl("ws://localhost:5173/socket", options)).toBe("allow");
    expect(classifyApplicationUrl("http://localhost:5173.evil.test/index.html", options)).toBe("deny");
    expect(classifyApplicationUrl("http://127.0.0.1:5173/index.html", options)).toBe("deny");
    expect(classifyApplicationUrl("http://localhost:5173/index.html")).toBe("deny");
  });

  it.each([
    "https://example.com/app.js",
    "http://example.com/",
    "ws://localhost:5173/socket",
    "wss://example.com/socket",
    "file:///tmp/private.png",
    "data:text/plain,hello",
    "not a url",
  ])("denies remote, file, data, or malformed URL %s", (url) => {
    expect(classifyApplicationUrl(url)).toBe("deny");
  });
});

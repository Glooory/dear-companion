import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { protocol } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerAppProtocol, registerAppScheme } from "./app-protocol";

const electronHarness = vi.hoisted(() => ({
  handler: undefined as ((request: Request) => Promise<Response>) | undefined,
  fetch: vi.fn<(url: string) => Promise<Response>>(),
  localFetch: vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(),
}));

vi.mock("electron", () => ({
  net: { fetch: electronHarness.fetch },
  session: {
    fromPartition: vi.fn(() => ({ fetch: electronHarness.localFetch })),
  },
  protocol: {
    handle: vi.fn((_scheme: string, handler: (request: Request) => Promise<Response>): void => {
      electronHarness.handler = handler;
    }),
    registerSchemesAsPrivileged: vi.fn(),
  },
}));

const temporaryDirectories: string[] = [];

async function createRendererRoot(): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), "dear-companion-protocol-"));
  const rendererRoot = join(parent, "renderer");
  temporaryDirectories.push(parent);
  await mkdir(rendererRoot);
  return rendererRoot;
}

async function requestRenderer(url: string, init?: RequestInit): Promise<Response> {
  const handler = electronHarness.handler;
  if (!handler) throw new Error("Application protocol handler was not registered");
  return handler(new Request(url, init));
}

beforeEach(() => {
  electronHarness.handler = undefined;
  electronHarness.fetch.mockImplementation(async (url) => {
    const contents = await readFile(fileURLToPath(url));
    return new Response(contents, { status: 200 });
  });
  electronHarness.localFetch.mockImplementation(async (url) => {
    const contents = await readFile(fileURLToPath(url));
    return new Response(contents, { status: 200 });
  });
});

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("application protocol", () => {
  it("registers with a missing renderer root and returns 404 when requested", async () => {
    const parent = await mkdtemp(join(tmpdir(), "dear-companion-protocol-missing-"));
    temporaryDirectories.push(parent);
    const missingRendererRoot = join(parent, "renderer");

    await expect(registerAppProtocol(missingRendererRoot)).resolves.toBeUndefined();

    const response = await requestRenderer("app://renderer/index.html");
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
  });

  it("serves a decoded file only from the renderer host", async () => {
    const rendererRoot = await createRendererRoot();
    await writeFile(join(rendererRoot, "pet shell.html"), "pet renderer");
    await registerAppProtocol(rendererRoot);

    const response = await requestRenderer("app://renderer/pet%20shell.html?window=pet");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("pet renderer");
  });

  it("serves authorized local files when the default session blocks file URLs", async () => {
    const rendererRoot = await createRendererRoot();
    await writeFile(join(rendererRoot, "index.html"), "isolated local renderer");
    electronHarness.fetch.mockRejectedValue(new Error("default session denied file URL"));
    await registerAppProtocol(rendererRoot);

    const response = await requestRenderer("app://renderer/index.html");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("isolated local renderer");
  });

  it("rejects a foreign host with 403 before reading a file", async () => {
    const rendererRoot = await createRendererRoot();
    await writeFile(join(rendererRoot, "index.html"), "renderer");
    await registerAppProtocol(rendererRoot);

    const response = await requestRenderer("app://attacker/index.html");

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Forbidden");
  });

  it("rejects decoded null bytes with 403", async () => {
    const rendererRoot = await createRendererRoot();
    await registerAppProtocol(rendererRoot);

    const response = await requestRenderer("app://renderer/index.html%00");

    expect(response.status).toBe(403);
  });

  it("rejects decoded traversal outside the renderer root with 403", async () => {
    const rendererRoot = await createRendererRoot();
    await writeFile(join(dirname(rendererRoot), "private.txt"), "private");
    await registerAppProtocol(rendererRoot);

    const response = await requestRenderer("app://renderer/..%2Fprivate.txt");

    expect(response.status).toBe(403);
  });

  it("rejects malformed percent encoding with 403", async () => {
    const rendererRoot = await createRendererRoot();
    await registerAppProtocol(rendererRoot);

    const response = await requestRenderer("app://renderer/%E0%A4%A");

    expect(response.status).toBe(403);
  });

  it("returns 404 when the contained file is absent", async () => {
    const rendererRoot = await createRendererRoot();
    await registerAppProtocol(rendererRoot);

    const response = await requestRenderer("app://renderer/missing.html");

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
  });

  it("rejects a contained symlink whose canonical target escapes the renderer root", async () => {
    const rendererRoot = await createRendererRoot();
    const privateDirectory = join(dirname(rendererRoot), "private");
    await mkdir(privateDirectory);
    await writeFile(join(privateDirectory, "secret.txt"), "private contents");
    await symlink(privateDirectory, join(rendererRoot, "escape"), process.platform === "win32" ? "junction" : "dir");
    await registerAppProtocol(rendererRoot);

    const response = await requestRenderer("app://renderer/escape/secret.txt");

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Forbidden");
  });

  it("serves only a controlled pet asset resolved from both owned IDs", async () => {
    const rendererRoot = await createRendererRoot();
    const assetPath = join(dirname(rendererRoot), "owned.png");
    await writeFile(assetPath, "pet pixels");
    await registerAppProtocol(rendererRoot, async (petId, assetId) =>
      petId === "pet-1" && assetId === "asset-1" ? assetPath : null
    );

    const response = await requestRenderer("app://renderer/pet-assets/pet-1/asset-1");
    const guessed = await requestRenderer("app://renderer/pet-assets/pet-2/asset-1");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("pet pixels");
    expect(guessed.status).toBe(404);
  });

  it("rejects malformed or traversing pet asset identifiers before resolution", async () => {
    const rendererRoot = await createRendererRoot();
    const resolver = vi.fn(async () => null);
    await registerAppProtocol(rendererRoot, resolver);

    expect((await requestRenderer("app://renderer/pet-assets/pet-1/..%2Fsecret")).status).toBe(403);
    expect((await requestRenderer("app://renderer/pet-assets/pet_1/asset-1")).status).toBe(403);
    expect((await requestRenderer("app://renderer/pet-assets/pet-1")).status).toBe(403);
    expect(resolver).not.toHaveBeenCalled();
  });

  it("serves only persisted audio asset identifiers through the audio resolver", async () => {
    const rendererRoot = await createRendererRoot();
    const assetPath = join(dirname(rendererRoot), "owned.ogg");
    await writeFile(assetPath, "audio bytes");
    const audioResolver = vi.fn(async (assetId: string) => (assetId === "sound-1" ? assetPath : null));
    await registerAppProtocol(rendererRoot, undefined, audioResolver);
    expect((await requestRenderer("app://renderer/audio-assets/sound-1")).status).toBe(200);
    expect((await requestRenderer("app://renderer/audio-assets/missing")).status).toBe(404);
    expect((await requestRenderer("app://renderer/audio-assets/..%2Fsecret")).status).toBe(403);
    expect((await requestRenderer("app://renderer/audio-assets/sound_1")).status).toBe(403);
  });

  it("serves only persisted pet voice asset identifiers through the pet voice resolver", async () => {
    const rendererRoot = await createRendererRoot();
    const voicePath = join(dirname(rendererRoot), "voice.wav");
    await writeFile(voicePath, "voice audio bytes");
    const voiceResolver = vi.fn(async (petId: string, voiceId: string) =>
      petId === "pet-1" && voiceId === "voice-1" ? voicePath : null
    );
    await registerAppProtocol(rendererRoot, undefined, undefined, voiceResolver);
    expect((await requestRenderer("app://renderer/pet-voices/pet-1/voice-1")).status).toBe(200);
    expect((await requestRenderer("app://renderer/pet-voices/pet-1/missing")).status).toBe(404);
    expect((await requestRenderer("app://renderer/pet-voices/pet-1/..%2Fsecret")).status).toBe(403);
    expect((await requestRenderer("app://renderer/pet-voices/pet_1/voice-1")).status).toBe(403);
  });

  it("registers app scheme with standard, secure, stream, and fetch privileges", () => {
    registerAppScheme();
    expect(protocol.registerSchemesAsPrivileged).toHaveBeenCalledWith([
      {
        scheme: "app",
        privileges: {
          standard: true,
          secure: true,
          stream: true,
          supportFetchAPI: true,
        },
      },
    ]);
  });

  it("forwards request headers including range when serving pet voice assets", async () => {
    const rendererRoot = await createRendererRoot();
    const voicePath = join(dirname(rendererRoot), "voice.wav");
    await writeFile(voicePath, "voice audio bytes");
    const voiceResolver = vi.fn(async (petId: string, voiceId: string) =>
      petId === "pet-1" && voiceId === "voice-1" ? voicePath : null
    );
    await registerAppProtocol(rendererRoot, undefined, undefined, voiceResolver);
    const response = await requestRenderer("app://renderer/pet-voices/pet-1/voice-1", {
      headers: { range: "bytes=0-10" },
    });
    expect(response.status).toBe(200);
    expect(electronHarness.localFetch).toHaveBeenCalledWith(
      expect.stringContaining("voice.wav"),
      expect.objectContaining({
        headers: expect.objectContaining({ range: "bytes=0-10" }),
      })
    );
  });

  it("serves reminder voice assets with safe identifier validation and forwards headers", async () => {
    const rendererRoot = await createRendererRoot();
    const voicePath = join(dirname(rendererRoot), "reminder-voice.wav");
    await writeFile(voicePath, "reminder voice audio");
    const reminderVoiceResolver = vi.fn(async (voiceId: string) => (voiceId === "voice-1" ? voicePath : null));
    await registerAppProtocol(rendererRoot, undefined, undefined, undefined, reminderVoiceResolver);

    expect((await requestRenderer("app://renderer/reminder-voices/voice-1")).status).toBe(200);
    expect((await requestRenderer("app://renderer/reminder-voices/missing")).status).toBe(404);
    expect((await requestRenderer("app://renderer/reminder-voices/..%2Fsecret")).status).toBe(403);
    expect((await requestRenderer("app://renderer/reminder-voices/voice_1")).status).toBe(403);
  });
});

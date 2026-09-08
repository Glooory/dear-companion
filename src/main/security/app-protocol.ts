import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { protocol, session } from "electron";
import { isSafeIdentifier } from "../../shared/contracts";

const APP_SCHEME = "app";
const RENDERER_HOST = "renderer";

export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        stream: true,
        supportFetchAPI: true,
      },
    },
  ]);
}

export type PetAssetResolver = (petId: string, assetId: string) => Promise<string | null>;
export type AudioAssetResolver = (assetId: string) => Promise<string | null>;
export type PetVoiceResolver = (petId: string, voiceId: string) => Promise<string | null>;
export type ReminderVoiceResolver = (voiceId: string) => Promise<string | null>;
type LocalFileFetcher = (canonicalPath: string, request?: Request) => Promise<Response>;

export async function registerAppProtocol(
  rendererRoot: string,
  resolvePetAsset?: PetAssetResolver,
  resolveAudioAsset?: AudioAssetResolver,
  resolvePetVoice?: PetVoiceResolver,
  resolveReminderVoice?: ReminderVoiceResolver
): Promise<void> {
  const resolvedRendererRoot = resolve(rendererRoot);
  const localFileSession = session.fromPartition("app-local-resources", { cache: false });
  const fetchLocalFile: LocalFileFetcher = (canonicalPath, request) => {
    const headers = request?.headers ? Object.fromEntries(request.headers.entries()) : undefined;
    return localFileSession.fetch(pathToFileURL(canonicalPath).toString(), {
      headers,
    });
  };

  await protocol.handle(APP_SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      if (url.host !== RENDERER_HOST) return forbiddenResponse();

      const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
      if (relativePath.startsWith("pet-assets/")) {
        return servePetAsset(relativePath, resolvePetAsset, fetchLocalFile, request);
      }
      if (relativePath.startsWith("pet-voices/")) {
        return servePetVoice(relativePath, resolvePetVoice, fetchLocalFile, request);
      }
      if (relativePath.startsWith("reminder-voices/")) {
        return serveReminderVoice(relativePath, resolveReminderVoice, fetchLocalFile, request);
      }
      if (relativePath.startsWith("audio-assets/")) {
        return serveAudioAsset(relativePath, resolveAudioAsset, fetchLocalFile, request);
      }
      const resolvedPath = resolve(resolvedRendererRoot, relativePath);

      if (relativePath.includes("\0") || !isPathInside(resolvedRendererRoot, resolvedPath)) {
        return forbiddenResponse();
      }

      let canonicalRendererRoot: string;
      let canonicalPath: string;
      try {
        canonicalRendererRoot = await realpath(resolvedRendererRoot);
        canonicalPath = await realpath(resolvedPath);
      } catch {
        return notFoundResponse();
      }

      if (!isPathInside(canonicalRendererRoot, canonicalPath)) return forbiddenResponse();

      try {
        return await fetchLocalFile(canonicalPath, request);
      } catch {
        return notFoundResponse();
      }
    } catch {
      return forbiddenResponse();
    }
  });
}

async function serveAudioAsset(
  relativePath: string,
  resolveAudioAsset: AudioAssetResolver | undefined,
  fetchLocalFile: LocalFileFetcher,
  request?: Request
): Promise<Response> {
  const segments = relativePath.split("/");
  if (segments.length !== 2 || segments[0] !== "audio-assets" || !isSafeIdentifier(segments[1])) {
    return forbiddenResponse();
  }
  if (!resolveAudioAsset) return notFoundResponse();
  try {
    const path = await resolveAudioAsset(segments[1]);
    if (!path) return notFoundResponse();
    const canonicalPath = await realpath(path);
    return await fetchLocalFile(canonicalPath, request);
  } catch {
    return notFoundResponse();
  }
}

async function servePetAsset(
  relativePath: string,
  resolvePetAsset: PetAssetResolver | undefined,
  fetchLocalFile: LocalFileFetcher,
  request?: Request
): Promise<Response> {
  const segments = relativePath.split("/");
  if (
    segments.length !== 3 ||
    segments[0] !== "pet-assets" ||
    !isSafeIdentifier(segments[1]) ||
    !isSafeIdentifier(segments[2])
  ) {
    return forbiddenResponse();
  }
  if (!resolvePetAsset) return notFoundResponse();

  try {
    const path = await resolvePetAsset(segments[1], segments[2]);
    if (!path) return notFoundResponse();
    const canonicalPath = await realpath(path);
    return await fetchLocalFile(canonicalPath, request);
  } catch {
    return notFoundResponse();
  }
}

async function servePetVoice(
  relativePath: string,
  resolvePetVoice: PetVoiceResolver | undefined,
  fetchLocalFile: LocalFileFetcher,
  request?: Request
): Promise<Response> {
  const segments = relativePath.split("/");
  if (
    segments.length !== 3 ||
    segments[0] !== "pet-voices" ||
    !isSafeIdentifier(segments[1]) ||
    !isSafeIdentifier(segments[2])
  ) {
    return forbiddenResponse();
  }
  if (!resolvePetVoice) return notFoundResponse();

  try {
    const path = await resolvePetVoice(segments[1], segments[2]);
    if (!path) return notFoundResponse();
    const canonicalPath = await realpath(path);
    return await fetchLocalFile(canonicalPath, request);
  } catch {
    return notFoundResponse();
  }
}

async function serveReminderVoice(
  relativePath: string,
  resolveReminderVoice: ReminderVoiceResolver | undefined,
  fetchLocalFile: LocalFileFetcher,
  request?: Request
): Promise<Response> {
  const segments = relativePath.split("/");
  if (segments.length !== 2 || segments[0] !== "reminder-voices" || !isSafeIdentifier(segments[1])) {
    return forbiddenResponse();
  }
  if (!resolveReminderVoice) return notFoundResponse();

  try {
    const path = await resolveReminderVoice(segments[1]);
    if (!path) return notFoundResponse();
    const canonicalPath = await realpath(path);
    return await fetchLocalFile(canonicalPath, request);
  } catch {
    return notFoundResponse();
  }
}

function isPathInside(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === "" || (pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot))
  );
}

function forbiddenResponse(): Response {
  return new Response("Forbidden", { status: 403 });
}

function notFoundResponse(): Response {
  return new Response("Not found", { status: 404 });
}

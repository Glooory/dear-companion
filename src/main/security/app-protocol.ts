import { protocol, session } from 'electron'
import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isSafeIdentifier } from '../../shared/contracts'

const APP_SCHEME = 'app'
const RENDERER_HOST = 'renderer'

export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true }
    }
  ])
}

export type PetAssetResolver = (petId: string, assetId: string) => Promise<string | null>
export type AudioAssetResolver = (assetId: string) => Promise<string | null>
type LocalFileFetcher = (canonicalPath: string) => Promise<Response>

export async function registerAppProtocol(
  rendererRoot: string,
  resolvePetAsset?: PetAssetResolver,
  resolveAudioAsset?: AudioAssetResolver
): Promise<void> {
  const resolvedRendererRoot = resolve(rendererRoot)
  const localFileSession = session.fromPartition('app-local-resources', { cache: false })
  const fetchLocalFile: LocalFileFetcher = (canonicalPath) =>
    localFileSession.fetch(pathToFileURL(canonicalPath).toString())

  await protocol.handle(APP_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      if (url.host !== RENDERER_HOST) return forbiddenResponse()

      const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
      if (relativePath.startsWith('pet-assets/')) {
        return servePetAsset(relativePath, resolvePetAsset, fetchLocalFile)
      }
      if (relativePath.startsWith('audio-assets/')) {
        return serveAudioAsset(relativePath, resolveAudioAsset, fetchLocalFile)
      }
      const resolvedPath = resolve(resolvedRendererRoot, relativePath)

      if (
        relativePath.includes('\0') ||
        !isPathInside(resolvedRendererRoot, resolvedPath)
      ) {
        return forbiddenResponse()
      }

      let canonicalRendererRoot: string
      let canonicalPath: string
      try {
        canonicalRendererRoot = await realpath(resolvedRendererRoot)
        canonicalPath = await realpath(resolvedPath)
      } catch {
        return notFoundResponse()
      }

      if (!isPathInside(canonicalRendererRoot, canonicalPath)) return forbiddenResponse()

      try {
        return await fetchLocalFile(canonicalPath)
      } catch {
        return notFoundResponse()
      }
    } catch {
      return forbiddenResponse()
    }
  })
}

async function serveAudioAsset(
  relativePath: string,
  resolveAudioAsset: AudioAssetResolver | undefined,
  fetchLocalFile: LocalFileFetcher
): Promise<Response> {
  const segments = relativePath.split('/')
  if (segments.length !== 2 || segments[0] !== 'audio-assets' || !isSafeIdentifier(segments[1])) {
    return forbiddenResponse()
  }
  if (!resolveAudioAsset) return notFoundResponse()
  try {
    const path = await resolveAudioAsset(segments[1])
    if (!path) return notFoundResponse()
    const canonicalPath = await realpath(path)
    return await fetchLocalFile(canonicalPath)
  } catch {
    return notFoundResponse()
  }
}

async function servePetAsset(
  relativePath: string,
  resolvePetAsset: PetAssetResolver | undefined,
  fetchLocalFile: LocalFileFetcher
): Promise<Response> {
  const segments = relativePath.split('/')
  if (
    segments.length !== 3 ||
    segments[0] !== 'pet-assets' ||
    !isSafeIdentifier(segments[1]) ||
    !isSafeIdentifier(segments[2])
  ) {
    return forbiddenResponse()
  }
  if (!resolvePetAsset) return notFoundResponse()

  try {
    const path = await resolvePetAsset(segments[1], segments[2])
    if (!path) return notFoundResponse()
    const canonicalPath = await realpath(path)
    return await fetchLocalFile(canonicalPath)
  } catch {
    return notFoundResponse()
  }
}

function isPathInside(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate)
  return (
    pathFromRoot === '' ||
    (pathFromRoot !== '..' &&
      !pathFromRoot.startsWith(`..${sep}`) &&
      !isAbsolute(pathFromRoot))
  )
}

function forbiddenResponse(): Response {
  return new Response('Forbidden', { status: 403 })
}

function notFoundResponse(): Response {
  return new Response('Not found', { status: 404 })
}

import { net, protocol } from 'electron'
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

export async function registerAppProtocol(
  rendererRoot: string,
  resolvePetAsset?: PetAssetResolver
): Promise<void> {
  const resolvedRendererRoot = resolve(rendererRoot)

  await protocol.handle(APP_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      if (url.host !== RENDERER_HOST) return forbiddenResponse()

      const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
      if (relativePath.startsWith('pet-assets/')) {
        return servePetAsset(relativePath, resolvePetAsset)
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
        return await net.fetch(pathToFileURL(canonicalPath).toString())
      } catch {
        return notFoundResponse()
      }
    } catch {
      return forbiddenResponse()
    }
  })
}

async function servePetAsset(
  relativePath: string,
  resolvePetAsset: PetAssetResolver | undefined
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
    return await net.fetch(pathToFileURL(canonicalPath).toString())
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

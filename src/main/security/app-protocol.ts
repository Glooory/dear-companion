import { net, protocol } from 'electron'
import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

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

export async function registerAppProtocol(rendererRoot: string): Promise<void> {
  const resolvedRendererRoot = resolve(rendererRoot)
  const canonicalRendererRoot = await realpath(resolvedRendererRoot)

  await protocol.handle(APP_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      if (url.host !== RENDERER_HOST) return forbiddenResponse()

      const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
      const resolvedPath = resolve(resolvedRendererRoot, relativePath)

      if (
        relativePath.includes('\0') ||
        !isPathInside(resolvedRendererRoot, resolvedPath)
      ) {
        return forbiddenResponse()
      }

      let canonicalPath: string
      try {
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

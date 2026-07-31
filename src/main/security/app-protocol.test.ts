import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerAppProtocol } from './app-protocol'

const electronHarness = vi.hoisted(() => ({
  handler: undefined as ((request: Request) => Promise<Response>) | undefined,
  fetch: vi.fn<(url: string) => Promise<Response>>()
}))

vi.mock('electron', () => ({
  net: { fetch: electronHarness.fetch },
  protocol: {
    handle: vi.fn(
      (_scheme: string, handler: (request: Request) => Promise<Response>): void => {
        electronHarness.handler = handler
      }
    ),
    registerSchemesAsPrivileged: vi.fn()
  }
}))

const temporaryDirectories: string[] = []

async function createRendererRoot(): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), 'dear-companion-protocol-'))
  const rendererRoot = join(parent, 'renderer')
  temporaryDirectories.push(parent)
  await mkdir(rendererRoot)
  return rendererRoot
}

async function requestRenderer(url: string): Promise<Response> {
  const handler = electronHarness.handler
  if (!handler) throw new Error('Application protocol handler was not registered')
  return handler(new Request(url))
}

beforeEach(() => {
  electronHarness.handler = undefined
  electronHarness.fetch.mockImplementation(async (url) => {
    const contents = await readFile(fileURLToPath(url))
    return new Response(contents, { status: 200 })
  })
})

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  )
})

describe('application protocol', () => {
  it('registers with a missing renderer root and returns 404 when requested', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'dear-companion-protocol-missing-'))
    temporaryDirectories.push(parent)
    const missingRendererRoot = join(parent, 'renderer')

    await expect(registerAppProtocol(missingRendererRoot)).resolves.toBeUndefined()

    const response = await requestRenderer('app://renderer/index.html')
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Not found')
  })

  it('serves a decoded file only from the renderer host', async () => {
    const rendererRoot = await createRendererRoot()
    await writeFile(join(rendererRoot, 'pet shell.html'), 'pet renderer')
    await registerAppProtocol(rendererRoot)

    const response = await requestRenderer('app://renderer/pet%20shell.html?window=pet')

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('pet renderer')
  })

  it('rejects a foreign host with 403 before reading a file', async () => {
    const rendererRoot = await createRendererRoot()
    await writeFile(join(rendererRoot, 'index.html'), 'renderer')
    await registerAppProtocol(rendererRoot)

    const response = await requestRenderer('app://attacker/index.html')

    expect(response.status).toBe(403)
    expect(await response.text()).toBe('Forbidden')
  })

  it('rejects decoded null bytes with 403', async () => {
    const rendererRoot = await createRendererRoot()
    await registerAppProtocol(rendererRoot)

    const response = await requestRenderer('app://renderer/index.html%00')

    expect(response.status).toBe(403)
  })

  it('rejects decoded traversal outside the renderer root with 403', async () => {
    const rendererRoot = await createRendererRoot()
    await writeFile(join(dirname(rendererRoot), 'private.txt'), 'private')
    await registerAppProtocol(rendererRoot)

    const response = await requestRenderer('app://renderer/..%2Fprivate.txt')

    expect(response.status).toBe(403)
  })

  it('rejects malformed percent encoding with 403', async () => {
    const rendererRoot = await createRendererRoot()
    await registerAppProtocol(rendererRoot)

    const response = await requestRenderer('app://renderer/%E0%A4%A')

    expect(response.status).toBe(403)
  })

  it('returns 404 when the contained file is absent', async () => {
    const rendererRoot = await createRendererRoot()
    await registerAppProtocol(rendererRoot)

    const response = await requestRenderer('app://renderer/missing.html')

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Not found')
  })

  it('rejects a contained symlink whose canonical target escapes the renderer root', async () => {
    const rendererRoot = await createRendererRoot()
    const privateDirectory = join(dirname(rendererRoot), 'private')
    await mkdir(privateDirectory)
    await writeFile(join(privateDirectory, 'secret.txt'), 'private contents')
    await symlink(
      privateDirectory,
      join(rendererRoot, 'escape'),
      process.platform === 'win32' ? 'junction' : 'dir'
    )
    await registerAppProtocol(rendererRoot)

    const response = await requestRenderer('app://renderer/escape/secret.txt')

    expect(response.status).toBe(403)
    expect(await response.text()).toBe('Forbidden')
  })
})

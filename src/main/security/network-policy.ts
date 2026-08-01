import type { CallbackResponse, OnBeforeRequestListenerDetails, Session } from 'electron'

export type ApplicationUrlDecision = 'allow' | 'deny'

interface NetworkPolicyOptions {
  developmentOrigin?: string
}

const REQUEST_FILTER = {
  urls: ['app://*/*', 'file://*/*', 'http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*']
}

export function classifyApplicationUrl(
  rawUrl: string,
  { developmentOrigin }: NetworkPolicyOptions = {}
): ApplicationUrlDecision {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return 'deny'
  }

  if (url.protocol === 'app:' && url.hostname === 'renderer') return 'allow'

  if (developmentOrigin) {
    try {
      if (url.origin === new URL(developmentOrigin).origin) return 'allow'
    } catch {
      return 'deny'
    }
  }

  return 'deny'
}

export function registerNetworkPolicy(
  targetSession: Session,
  options: NetworkPolicyOptions = {}
): () => void {
  const onBeforeRequest = (
    details: OnBeforeRequestListenerDetails,
    callback: (response: CallbackResponse) => void
  ): void => {
    callback({ cancel: classifyApplicationUrl(details.url, options) === 'deny' })
  }

  targetSession.webRequest.onBeforeRequest(REQUEST_FILTER, onBeforeRequest)
  targetSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
  targetSession.setPermissionCheckHandler(() => false)

  let active = true
  return () => {
    if (!active) return
    active = false
    targetSession.webRequest.onBeforeRequest(REQUEST_FILTER, null)
    targetSession.setPermissionRequestHandler(null)
    targetSession.setPermissionCheckHandler(null)
  }
}

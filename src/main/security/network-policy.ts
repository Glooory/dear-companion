import type { CallbackResponse, OnBeforeRequestListenerDetails, Session } from "electron";
import type { WindowKind } from "../../shared/contracts";

export type ApplicationUrlDecision = "allow" | "deny";

interface NetworkPolicyOptions {
  developmentOrigin?: string;
  getWindowKind?: (webContentsId: number) => WindowKind | null;
}

interface MicrophonePermissionInput {
  permission: string;
  requestingOrigin: string;
  isMainFrame: boolean;
  mediaTypes: readonly string[];
  windowKind: WindowKind | null;
  developmentOrigin?: string;
}

const REQUEST_FILTER = {
  urls: ["app://*/*", "file://*/*", "http://*/*", "https://*/*", "ws://*/*", "wss://*/*"],
};

export function classifyApplicationUrl(
  rawUrl: string,
  { developmentOrigin }: NetworkPolicyOptions = {}
): ApplicationUrlDecision {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return "deny";
  }

  if (url.protocol === "app:" && url.hostname === "renderer") return "allow";

  if (developmentOrigin) {
    try {
      const developmentUrl = new URL(developmentOrigin);
      const socketProtocol = developmentUrl.protocol === "https:" ? "wss:" : "ws:";
      if (
        url.hostname === developmentUrl.hostname &&
        url.port === developmentUrl.port &&
        (url.protocol === developmentUrl.protocol || url.protocol === socketProtocol)
      )
        return "allow";
    } catch {
      return "deny";
    }
  }

  return "deny";
}

export function classifyMicrophonePermission(input: MicrophonePermissionInput): ApplicationUrlDecision {
  if (
    input.permission !== "media" ||
    input.windowKind !== "settings" ||
    !input.isMainFrame ||
    input.mediaTypes.length !== 1 ||
    input.mediaTypes[0] !== "audio"
  ) {
    return "deny";
  }

  if (input.requestingOrigin === "app://renderer") return "allow";
  if (!input.developmentOrigin) return "deny";
  try {
    return new URL(input.requestingOrigin).origin === new URL(input.developmentOrigin).origin ? "allow" : "deny";
  } catch {
    return "deny";
  }
}

export function registerNetworkPolicy(targetSession: Session, options: NetworkPolicyOptions = {}): () => void {
  const onBeforeRequest = (
    details: OnBeforeRequestListenerDetails,
    callback: (response: CallbackResponse) => void
  ): void => {
    callback({ cancel: classifyApplicationUrl(details.url, options) === "deny" });
  };

  targetSession.webRequest.onBeforeRequest(REQUEST_FILTER, onBeforeRequest);
  targetSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const mediaTypes = "mediaTypes" in details ? (details.mediaTypes ?? []) : [];
    callback(
      classifyMicrophonePermission({
        permission,
        requestingOrigin: normalizePermissionOrigin(details.requestingUrl),
        isMainFrame: details.isMainFrame,
        mediaTypes,
        windowKind: options.getWindowKind?.(webContents.id) ?? null,
        ...(options.developmentOrigin ? { developmentOrigin: options.developmentOrigin } : {}),
      }) === "allow"
    );
  });
  targetSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    return (
      classifyMicrophonePermission({
        permission,
        requestingOrigin: normalizePermissionOrigin(requestingOrigin),
        isMainFrame: details.isMainFrame,
        mediaTypes: details.mediaType ? [details.mediaType] : [],
        windowKind: webContents ? (options.getWindowKind?.(webContents.id) ?? null) : null,
        ...(options.developmentOrigin ? { developmentOrigin: options.developmentOrigin } : {}),
      }) === "allow"
    );
  });

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    targetSession.webRequest.onBeforeRequest(REQUEST_FILTER, null);
    targetSession.setPermissionRequestHandler(null);
    targetSession.setPermissionCheckHandler(null);
  };
}

export function normalizePermissionOrigin(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    if (url.origin && url.origin !== "null") {
      return url.origin;
    }
    if (url.protocol === "app:" && url.host) {
      return `${url.protocol}//${url.host}`;
    }
    return "";
  } catch {
    return "";
  }
}

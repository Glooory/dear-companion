import {
  Menu,
  Tray,
  nativeImage,
  type MenuItemConstructorOptions,
  type NativeImage
} from 'electron'
import { join } from 'node:path'
import type { AppSettings } from '../../shared/contracts'
import type { SettingsStore } from '../settings/settings-store'
import type { WindowManager } from '../windows/window-manager'

const traySvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 32 32"><path fill="black" fill-rule="evenodd" d="M16 3.5C8.5 3.5 2.5 8.8 2.5 15.5C2.5 19 4.2 22.2 7 24.2L5.5 28.8C5.3 29.5 6 30.1 6.8 29.8L12.3 26.7C13.5 27.2 14.7 27.5 16 27.5C23.5 27.5 29.5 22.2 29.5 15.5C29.5 8.8 23.5 3.5 16 3.5ZM16 23.5C15.2 23.5 14.2 22.8 13.5 22C10.5 18.8 8 16.2 8 13.8C8 11.2 10 9.5 12.5 9.5C14.1 9.5 15.3 10.4 16 11.8C16.7 10.4 17.9 9.5 19.5 9.5C22 9.5 24 11.2 24 13.8C24 16.2 21.5 18.8 18.5 22C17.8 22.8 16.8 23.5 16 23.5Z"/></svg>'

interface TrayControllerOptions {
  settingsStore: Pick<SettingsStore, 'update'>
  windowManager: Pick<WindowManager, 'hidePet' | 'showPet' | 'openSettings'>
  requestQuit: () => void
  onSettingsChanged?: (settings: AppSettings) => void
  endRestSession?: () => void
  platform?: NodeJS.Platform
  isPackaged?: boolean
  resourcesPath?: string
  projectRoot?: string
}

export class TrayController {
  private active = false
  private tray: Tray | null = null
  private settings: AppSettings | null = null
  private readonly settingsStore: TrayControllerOptions['settingsStore']
  private readonly windowManager: TrayControllerOptions['windowManager']
  private readonly requestQuit: () => void
  private readonly onSettingsChanged: (settings: AppSettings) => void
  private readonly platform: NodeJS.Platform
  private readonly isPackaged: boolean
  private readonly resourcesPath: string
  private readonly projectRoot: string
  private readonly endRestSession: () => void
  private restSessionActive = false

  constructor({
    settingsStore,
    windowManager,
    requestQuit,
    onSettingsChanged = () => undefined,
    platform = process.platform,
    isPackaged = false,
    resourcesPath = process.resourcesPath,
    projectRoot = process.cwd(),
    endRestSession = () => undefined
  }: TrayControllerOptions) {
    this.settingsStore = settingsStore
    this.windowManager = windowManager
    this.requestQuit = requestQuit
    this.onSettingsChanged = onSettingsChanged
    this.platform = platform
    this.isPackaged = isPackaged
    this.resourcesPath = resourcesPath
    this.projectRoot = projectRoot
    this.endRestSession = endRestSession
  }

  create(): void {
    if (this.tray && !this.tray.isDestroyed()) return

    const trayIcon = createTrayIcon({
      platform: this.platform,
      isPackaged: this.isPackaged,
      resourcesPath: this.resourcesPath,
      projectRoot: this.projectRoot
    })
    if (this.platform === 'darwin') trayIcon.setTemplateImage(true)

    this.tray = new Tray(trayIcon)
    this.active = true
    this.tray.setToolTip('Dear Companion')
    if (this.platform === 'win32') this.tray.on('click', this.handleClick)
    if (this.settings) this.refresh(this.settings)
  }

  refresh(settings: AppSettings): void {
    this.settings = settings
    if (!this.tray || this.tray.isDestroyed()) return

    const menuTemplate: MenuItemConstructorOptions[] = [
      {
        label: settings.petWindow.visible ? '隐藏伙伴' : '显示伙伴',
        click: () => {
          void this.setVisibility(!settings.petWindow.visible).catch(() => undefined)
        }
      },
      {
        label: '添加休息提醒…',
        click: () => {
          void this.windowManager.openSettings({ tab: 'rest', action: 'new-reminder' }).catch(() => undefined)
        }
      },
      {
        label: '设置…',
        click: () => {
          void this.windowManager.openSettings().catch(() => undefined)
        }
      },
      ...(this.restSessionActive ? [{
        label: '结束休息',
        click: this.endRestSession
      } satisfies MenuItemConstructorOptions] : []),
      { type: 'separator' },
      { label: '退出 Dear Companion', click: this.requestQuit }
    ]

    // Electron opens an assigned context menu on primary click on macOS.
    this.tray.setContextMenu(Menu.buildFromTemplate(menuTemplate))
  }

  setRestSessionActive(active: boolean): void {
    if (this.restSessionActive === active) return
    this.restSessionActive = active
    if (this.settings) this.refresh(this.settings)
  }

  dispose(): void {
    this.active = false
    const tray = this.tray
    this.tray = null
    this.settings = null
    this.restSessionActive = false
    if (!tray) return

    if (this.platform === 'win32') tray.removeListener('click', this.handleClick)
    if (!tray.isDestroyed()) tray.destroy()
  }

  private readonly handleClick = (): void => {
    const tray = this.tray
    if (!tray || tray.isDestroyed()) return
    void this.setVisibility(true).catch(() => undefined)
  }

  private async setVisibility(visible: boolean): Promise<void> {
    const settings = await this.settingsStore.update((current) => ({
      ...current,
      petWindow: { ...current.petWindow, visible }
    }))
    if (!this.active) return

    this.onSettingsChanged(settings)
    if (visible) await this.windowManager.showPet()
    else this.windowManager.hidePet()
  }
}

interface TrayIconOptions {
  platform: NodeJS.Platform
  isPackaged: boolean
  resourcesPath: string
  projectRoot: string
}

function createTrayIcon(options: TrayIconOptions): NativeImage {
  const fileName = options.platform === 'darwin' ? 'trayTemplate.png' : 'tray-win.png'
  const trayPath = options.isPackaged
    ? join(options.resourcesPath, 'tray', fileName)
    : join(options.projectRoot, 'resources', 'tray', fileName)
  const image = nativeImage.createFromPath(trayPath)
  if (!image.isEmpty()) return image

  return nativeImage.createFromDataURL(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(traySvg)}`
  )
}

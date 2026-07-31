import {
  Menu,
  Tray,
  nativeImage,
  type MenuItemConstructorOptions,
  type NativeImage
} from 'electron'
import type { AppSettings } from '../../shared/contracts'
import type { SettingsStore } from '../settings/settings-store'
import type { WindowManager } from '../windows/window-manager'

const traySvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="black"/><circle cx="6" cy="7" r="1" fill="white"/><circle cx="10" cy="7" r="1" fill="white"/></svg>'

interface TrayControllerOptions {
  settingsStore: Pick<SettingsStore, 'update'>
  windowManager: Pick<WindowManager, 'hidePet' | 'showPet' | 'openSettings'>
  requestQuit: () => void
  platform?: NodeJS.Platform
}

export class TrayController {
  private active = false
  private tray: Tray | null = null
  private settings: AppSettings | null = null
  private readonly settingsStore: TrayControllerOptions['settingsStore']
  private readonly windowManager: TrayControllerOptions['windowManager']
  private readonly requestQuit: () => void
  private readonly platform: NodeJS.Platform

  constructor({
    settingsStore,
    windowManager,
    requestQuit,
    platform = process.platform
  }: TrayControllerOptions) {
    this.settingsStore = settingsStore
    this.windowManager = windowManager
    this.requestQuit = requestQuit
    this.platform = platform
  }

  create(): void {
    if (this.tray && !this.tray.isDestroyed()) return

    const trayIcon = createTrayIcon()
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
        label: settings.petWindow.visible ? '隐藏宠物' : '显示宠物',
        click: () => {
          void this.setVisibility(!settings.petWindow.visible).catch(() => undefined)
        }
      },
      {
        label: '设置…',
        click: () => {
          void this.windowManager.openSettings().catch(() => undefined)
        }
      },
      { type: 'separator' },
      { label: '退出 Dear Companion', click: this.requestQuit }
    ]

    // Electron opens an assigned context menu on primary click on macOS.
    this.tray.setContextMenu(Menu.buildFromTemplate(menuTemplate))
  }

  dispose(): void {
    this.active = false
    const tray = this.tray
    this.tray = null
    this.settings = null
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

    this.refresh(settings)
    if (visible) await this.windowManager.showPet()
    else this.windowManager.hidePet()
  }
}

function createTrayIcon(): NativeImage {
  return nativeImage.createFromDataURL(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(traySvg)}`
  )
}

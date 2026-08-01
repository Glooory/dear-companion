export interface LaunchIntent {
  autostart: boolean
}

export interface LoginLaunchSettings {
  wasOpenedAtLogin?: boolean
}

export function parseLaunchIntent(
  argv: readonly string[],
  loginItemSettings: LoginLaunchSettings,
  platform: NodeJS.Platform = process.platform
): LaunchIntent {
  if (platform === 'win32') {
    return { autostart: argv.some((argument) => argument === '--autostart') }
  }
  if (platform === 'darwin') {
    return { autostart: loginItemSettings.wasOpenedAtLogin === true }
  }
  return { autostart: false }
}

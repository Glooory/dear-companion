import { app } from 'electron'

void app.whenReady().then(() => {
  if (process.env.DEAR_COMPANION_BUILD_SMOKE === '1') app.quit()
})

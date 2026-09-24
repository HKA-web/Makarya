import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

function getSplashHtmlPath(): string {
  const candidatePaths = [
    join(__dirname, '../../src/main/splash/splash.html'),
    join(__dirname, 'splash.html'),
    join(process.resourcesPath, 'out/main/splash.html'),
    join(process.resourcesPath, 'splash.html'),
    join(process.resourcesPath, 'app.asar/src/main/splash/splash.html')
  ]

  for (const p of candidatePaths) {
    if (existsSync(p)) {
      return p
    }
  }
  return join(__dirname, '../../src/main/splash/splash.html')
}

export function createSplashScreen(durationMs = 10000, onComplete?: () => void): BrowserWindow {
  const iconPath = existsSync(join(__dirname, '../../build/icon.png'))
    ? join(__dirname, '../../build/icon.png')
    : join(__dirname, '../../build/icon.ico')

  const splash = new BrowserWindow({
    width: 640,
    height: 360,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: false,
    backgroundColor: '#00000000',
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  })

  const splashHtml = getSplashHtmlPath()
  splash.loadFile(splashHtml)

  splash.once('ready-to-show', () => {
    splash.show()
  })

  // Timer: close splash and call onComplete after durationMs
  setTimeout(() => {
    if (!splash.isDestroyed()) {
      splash.close()
    }
    if (onComplete) {
      onComplete()
    }
  }, durationMs)

  return splash
}

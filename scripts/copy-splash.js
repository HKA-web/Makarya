const fs = require('fs')
const path = require('path')

const srcDir = path.join(__dirname, '../src/main/splash')
const outDir = path.join(__dirname, '../out/main')

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true })
}

// Copy splash.html
const splashHtml = path.join(srcDir, 'splash.html')
if (fs.existsSync(splashHtml)) {
  fs.copyFileSync(splashHtml, path.join(outDir, 'splash.html'))
  console.log('Copied splash.html to out/main')
}

// Copy splash.gif
const gifSources = [
  path.join(__dirname, '../build/splash.gif'),
  path.join(__dirname, '../src/renderer/src/assets/splash.gif')
]
for (const gif of gifSources) {
  if (fs.existsSync(gif)) {
    fs.copyFileSync(gif, path.join(outDir, 'splash.gif'))
    console.log('Copied splash.gif to out/main')
    break
  }
}

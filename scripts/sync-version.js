const fs = require('fs')
const path = require('path')

const now = new Date()
const year = now.getFullYear()
const month = String(now.getMonth() + 1).padStart(2, '0')
const day = String(now.getDate()).padStart(2, '0')
const hours = String(now.getHours()).padStart(2, '0')
const minutes = String(now.getMinutes()).padStart(2, '0')

const versionStr = `${year}.${month}.${day}.${hours}.${minutes}`

// Update package.json
const pkgPath = path.join(__dirname, '../package.json')
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  pkg.version = versionStr
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  console.log(`[Version Sync] package.json version -> ${versionStr}`)
}

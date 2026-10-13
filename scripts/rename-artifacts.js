const fs = require('fs')
const path = require('path')

function normalizeArtifactName(filename) {
  let clean = filename.replace(/\s+/g, '.')
  // Menggabungkan pecahan tanggal semver electron-builder: '.1-2.' -> '.12.', '.0-9.' -> '.09.'
  clean = clean.replace(/\.(\d)-(\d)\./g, (m, a, b) => `.${a}${b}.`)
  return clean
}

function processDist(distDir) {
  if (!fs.existsSync(distDir)) return []

  const files = fs.readdirSync(distDir)
  const renamedFiles = []

  for (const file of files) {
    if (!file.endsWith('.exe') && !file.endsWith('.blockmap') && !file.endsWith('.zip')) {
      continue
    }

    const newName = normalizeArtifactName(file)
    if (newName !== file) {
      const oldPath = path.join(distDir, file)
      const newPath = path.join(distDir, newName)
      fs.renameSync(oldPath, newPath)
      console.log(`[Artifact Rename] ${file} -> ${newName}`)
      renamedFiles.push(newPath)
    }
  }

  // Update latest.yml jika ada
  const latestYmlPath = path.join(distDir, 'latest.yml')
  if (fs.existsSync(latestYmlPath)) {
    try {
      let content = fs.readFileSync(latestYmlPath, 'utf8')
      content = content.replace(/(\d{4}\.\d{2}\.)(\d)-(\d)(\.\d{2}\.\d{2})/g, '$1$2$3$4')
      content = content.replace(/Makarya[-.\s]IDE[-.\s]Setup[-.\s]v?(\d{4}\.\d{2}\.\d{2}\.\d{2}\.\d{2})\.exe/gi, 'Makarya.IDE.Setup.v$1.exe')
      content = content.replace(/Makarya[-.\s]IDE[-.\s]v?(\d{4}\.\d{2}\.\d{2}\.\d{2}\.\d{2})\.exe/gi, 'Makarya.IDE.v$1.exe')
      fs.writeFileSync(latestYmlPath, content, 'utf8')
      console.log('[Artifact Rename] dist/latest.yml berhasil diperbarui')
    } catch (e) {
      console.warn('[Artifact Rename] Gagal memperbarui latest.yml:', e)
    }
  }

  return renamedFiles
}

async function afterAllArtifactBuild(buildResult) {
  const distDir = path.resolve(__dirname, '../dist')
  return processDist(distDir)
}

module.exports = afterAllArtifactBuild
module.exports.default = afterAllArtifactBuild

if (require.main === module) {
  const distDir = path.resolve(__dirname, '../dist')
  processDist(distDir)
}

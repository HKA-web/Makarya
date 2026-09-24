const fs = require('fs')
const path = require('path')

async function main() {
  const mod = require('png-to-ico')
  const pngToIco = mod.default || mod
  const inputPng = path.join(__dirname, '../build/icon.png')
  const outputIco = path.join(__dirname, '../build/icon.ico')

  const buf = await pngToIco(inputPng)
  fs.writeFileSync(outputIco, buf)
  console.log(`Successfully generated binary ICO: ${outputIco} (${buf.length} bytes)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

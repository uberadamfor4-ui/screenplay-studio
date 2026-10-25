const fs = require('node:fs/promises')
const path = require('node:path')
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom')
const { createCanvas, loadImage } = require('@napi-rs/canvas')

async function rasterizeMasIcon(svg) {
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml')
  if (document.documentElement.tagName !== 'svg') throw new Error('Expected the existing SVG brand icon.')
  document.documentElement.setAttribute('width', '1024')
  document.documentElement.setAttribute('height', '1024')
  const image = await loadImage(Buffer.from(new XMLSerializer().serializeToString(document)))
  const canvas = createCanvas(1024, 1024)
  canvas.getContext('2d').drawImage(image, 0, 0, 1024, 1024)
  return canvas.encode('png')
}

async function main() {
  const brand = path.resolve(__dirname, '../assets/brand')
  const png = await rasterizeMasIcon(await fs.readFile(path.join(brand, 'screenplay-studio-icon.svg'), 'utf8'))
  await fs.writeFile(path.join(brand, 'app-icon-1024.png'), png)
  console.log('Generated the MAS 1024px icon from the unchanged vector brand asset.')
}

module.exports = { rasterizeMasIcon }
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1 })

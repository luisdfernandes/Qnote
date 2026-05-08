// Generates build/icon.png (1024x1024) from assets/icon.svg.
// electron-builder uses build/icon.png to produce platform icons (.ico, .icns).
const fs = require('fs')
const path = require('path')
const { Resvg } = require('@resvg/resvg-js')

const root = path.resolve(__dirname, '..')
const svgPath = path.join(root, 'assets', 'icon.svg')
const outDir = path.join(root, 'build')
const outPath = path.join(outDir, 'icon.png')

const svg = fs.readFileSync(svgPath)
const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1024 } }).render().asPng()

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(outPath, png)
console.log(`wrote ${outPath} (${png.length} bytes)`)

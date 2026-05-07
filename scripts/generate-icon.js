const { Resvg } = require('@resvg/resvg-js')
const fs = require('fs')
const path = require('path')

const svg = fs.readFileSync(path.join(__dirname, '../assets/icon.svg'))

for (const size of [16, 32, 64, 128, 256]) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
  const png = resvg.render().asPng()
  fs.writeFileSync(path.join(__dirname, `../assets/icon-${size}.png`), png)
  console.log(`Generated icon-${size}.png`)
}

// Main icon at 256
const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 256 } })
const png = resvg.render().asPng()
fs.writeFileSync(path.join(__dirname, '../assets/icon.png'), png)
console.log('Generated icon.png')

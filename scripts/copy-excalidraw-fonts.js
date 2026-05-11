const { cpSync, mkdirSync, existsSync } = require('fs')
const { resolve } = require('path')

const src = resolve(__dirname, '../node_modules/@excalidraw/excalidraw/dist/prod/fonts')
const dest = resolve(__dirname, '../public/fonts')

if (!existsSync(src)) {
  console.warn('copy-excalidraw-fonts: source not found, skipping')
  process.exit(0)
}

mkdirSync(dest, { recursive: true })
cpSync(src, dest, { recursive: true })
console.log('copy-excalidraw-fonts: fonts copied to public/fonts/')

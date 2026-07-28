#!/usr/bin/env node
// Generates the PWA manifest icons as real PNG files using only Node's
// built-in `zlib` — no image library/native dependency needed. The design
// mirrors the app's existing "Target" logo mark (an accent-indigo square
// with a white bullseye) used everywhere else (Sidebar, Login).
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.resolve(__dirname, '../public/icons')

const BG = [91, 108, 240] // #5b6cf0 — the app's default accent indigo
const WHITE = [255, 255, 255]

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

/** Renders a simple bullseye (white ring + white center dot on an accent
 * background) at `size`x`size`, encoded as a standard RGBA PNG. */
function generatePng(size) {
  const cx = size / 2
  const cy = size / 2
  const outerR = size * 0.34
  const innerR = size * 0.24
  const dotR = size * 0.12

  const raw = Buffer.alloc((size * 4 + 1) * size)
  let offset = 0
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0 // filter type: none
    for (let x = 0; x < size; x++) {
      const dx = x - cx
      const dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      const isMark = dist <= dotR || (dist >= innerR && dist <= outerR)
      const [r, g, b] = isMark ? WHITE : BG
      raw[offset++] = r
      raw[offset++] = g
      raw[offset++] = b
      raw[offset++] = 255
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const idat = deflateSync(raw)

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(OUT_DIR, { recursive: true })

const sizes = [152, 180, 192, 384, 512]
for (const size of sizes) {
  const png = generatePng(size)
  writeFileSync(path.join(OUT_DIR, `icon-${size}.png`), png)
  console.log(`wrote icons/icon-${size}.png (${png.length} bytes)`)
}
// Separate maskable file (same art — the background already fills edge-to-edge,
// which satisfies the maskable "safe zone" convention) so it can be declared
// with purpose: "maskable" in the manifest without affecting the plain icons.
writeFileSync(path.join(OUT_DIR, 'icon-512-maskable.png'), generatePng(512))
console.log('wrote icons/icon-512-maskable.png')

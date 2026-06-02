const PNG = require('pngjs').PNG
const fs = require('fs')
const path = require('path')

// FinPath color palette
const BG = { r: 15, g: 17, b: 23 }       // #0f1117
const GREEN = { r: 34, g: 197, b: 94 }    // #22C55E
const DARK_GREEN = { r: 21, g: 128, b: 61 } // #15803d

function lerp(a, b, t) { return a + (b - a) * t }

function setPixel(data, width, x, y, r, g, b, a = 255) {
  if (x < 0 || x >= width || y < 0 || y >= width) return
  const i = (y * width + x) * 4
  data[i] = r; data[i+1] = g; data[i+2] = b; data[i+3] = a
}

function blendPixel(data, width, x, y, r, g, b, alpha) {
  if (x < 0 || x >= width || y < 0 || y >= width) return
  const i = (y * width + x) * 4
  const a = alpha / 255
  data[i] = Math.round(data[i] * (1-a) + r * a)
  data[i+1] = Math.round(data[i+1] * (1-a) + g * a)
  data[i+2] = Math.round(data[i+2] * (1-a) + b * a)
  data[i+3] = 255
}

// Draw a thick anti-aliased line
function drawLine(data, width, x0, y0, x1, y1, r, g, b, thickness) {
  const steps = Math.max(Math.abs(x1-x0), Math.abs(y1-y0)) * 4
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const cx = lerp(x0, x1, t)
    const cy = lerp(y0, y1, t)
    // Draw a small circle at each point for thickness
    const rad = thickness / 2
    for (let dx = -Math.ceil(rad)-1; dx <= Math.ceil(rad)+1; dx++) {
      for (let dy = -Math.ceil(rad)-1; dy <= Math.ceil(rad)+1; dy++) {
        const dist = Math.sqrt(dx*dx + dy*dy)
        if (dist <= rad + 0.5) {
          const alpha = Math.min(255, Math.round(255 * Math.max(0, 1 - Math.max(0, dist - rad + 0.5))))
          blendPixel(data, width, Math.round(cx + dx), Math.round(cy + dy), r, g, b, alpha)
        }
      }
    }
  }
}

// Draw a filled rounded rectangle for background
function drawRoundedRect(data, width, rx, ry, rw, rh, radius, r, g, b) {
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      // Check corners
      let inside = false
      const cx = Math.min(Math.max(x, rx + radius), rx + rw - radius)
      const cy = Math.min(Math.max(y, ry + radius), ry + rh - radius)
      const dist = Math.sqrt((x-cx)**2 + (y-cy)**2)
      if (dist <= radius) inside = true
      else if (x >= rx+radius && x < rx+rw-radius) inside = true
      else if (y >= ry+radius && y < ry+rh-radius) inside = true
      if (inside) setPixel(data, width, x, y, r, g, b)
    }
  }
}

function generateIcon(size, outputPath) {
  const png = new PNG({ width: size, height: size })
  // Initialize transparent
  png.data.fill(0)
  
  const pad = Math.round(size * 0.08)
  const cornerRadius = Math.round(size * 0.188) // ~96/512 of size
  
  // Draw background rounded rect
  drawRoundedRect(png.data, size, pad, pad, size - 2*pad, size - 2*pad, cornerRadius, BG.r, BG.g, BG.b)
  
  // Chart points (scaled from 512 viewBox: "64,360 160,280 240,320 320,200 400,240 448,160")
  const rawPts = [[64,360],[160,280],[240,320],[320,200],[400,240],[448,160]]
  const scaleX = (x) => (x / 512) * size
  const scaleY = (y) => (y / 512) * size
  
  const pts = rawPts.map(([x,y]) => [scaleX(x), scaleY(y)])
  
  const thickness = Math.max(3, Math.round(size * 0.07)) // ~36/512 * size
  
  // Draw chart line segments
  for (let i = 0; i < pts.length - 1; i++) {
    drawLine(png.data, size, pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1], GREEN.r, GREEN.g, GREEN.b, thickness)
  }
  
  // Draw dots at each waypoint
  const dotRadius = thickness * 0.7
  pts.forEach(([x, y]) => {
    for (let dx = -Math.ceil(dotRadius)-1; dx <= Math.ceil(dotRadius)+1; dx++) {
      for (let dy = -Math.ceil(dotRadius)-1; dy <= Math.ceil(dotRadius)+1; dy++) {
        const dist = Math.sqrt(dx*dx + dy*dy)
        if (dist <= dotRadius + 0.5) {
          const alpha = Math.min(255, Math.round(255 * Math.max(0, 1 - Math.max(0, dist - dotRadius + 0.5))))
          blendPixel(png.data, size, Math.round(x + dx), Math.round(y + dy), GREEN.r, GREEN.g, GREEN.b, alpha)
        }
      }
    }
  })
  
  // Set alpha for background area (already set by drawRoundedRect + remaining 0 alpha outside)
  // Actually let's make outside transparent already done (fill 0)
  
  const buffer = PNG.sync.write(png)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, buffer)
  console.log(`Generated ${outputPath} (${size}x${size})`)
}

// Generate all needed sizes
generateIcon(192, 'public/icons/icon-192.png')
generateIcon(512, 'public/icons/icon-512.png')
generateIcon(512, 'public/icons/maskable-512.png') // same design, background is safe for maskable
generateIcon(180, 'public/icons/apple-touch-icon.png')

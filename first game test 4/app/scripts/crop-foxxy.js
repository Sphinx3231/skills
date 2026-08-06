const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SRC = path.join(__dirname, '..', 'assets', 'images', 'foxxy-sheet.png');

function loadSheet() {
  return PNG.sync.read(fs.readFileSync(SRC));
}

function crop(sheet, xFrac, yFrac, wFrac, hFrac, outPath) {
  const x = Math.round(xFrac * sheet.width);
  const y = Math.round(yFrac * sheet.height);
  const w = Math.round(wFrac * sheet.width);
  const h = Math.round(hFrac * sheet.height);
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(sheet, out, x, y, w, h, 0, 0);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, PNG.sync.write(out));
  console.log('wrote', outPath, w, 'x', h, 'from', x, y);
}

module.exports = { loadSheet, crop, SRC };

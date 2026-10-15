const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
(async () => {
  const source = path.join(root, '../assets/brand/app-icon-512.png');
  for (const [density, size] of Object.entries({ mdpi:48, hdpi:72, xhdpi:96, xxhdpi:144, xxxhdpi:192 })) {
    const folder = path.join(root, 'android/app/src/main/res', `mipmap-${density}`);
    await fs.mkdir(folder, { recursive:true });
    for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) await sharp(source).resize(size, size).png().toFile(path.join(folder, name));
    const foreground = Math.round(size * 108 / 48), icon = Math.round(foreground * 0.58);
    const buffer = await sharp(source).resize(icon, icon).png().toBuffer();
    await sharp({ create:{ width:foreground, height:foreground, channels:4, background:'#f8faf7' } }).composite([{ input:buffer, gravity:'center' }]).png().toFile(path.join(folder, 'ic_launcher_foreground.png'));
  }
  console.log('Android launcher assets generated from the existing app icon.');
})().catch(error => { console.error(error); process.exitCode=1; });

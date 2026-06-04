const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ASSETS = path.join(__dirname, '..', 'public', 'assets');

const images = [
  {
    src: path.join(ASSETS, 'ai', 'avatars', 'apex-avatar.png'),
    width: 128,
    height: 128,
  },
  {
    src: path.join(ASSETS, 'avatars', 'male.png'),
    width: 128,
    height: 128,
  },
  {
    src: path.join(ASSETS, 'avatars', 'female.png'),
    width: 128,
    height: 128,
  },
  {
    src: path.join(ASSETS, 'avatars', 'unknown.png'),
    width: 128,
    height: 128,
  },
];

async function compress() {
  for (const img of images) {
    const ext = path.extname(img.src);
    const dest = img.src.replace(ext, '.webp');

    const inputStats = fs.statSync(img.src);
    console.log(`\nProcessing: ${path.relative(ASSETS, img.src)}`);
    console.log(`  Original: ${(inputStats.size / 1024).toFixed(1)} KB (${img.width}x${img.height})`);

    await sharp(img.src)
      .resize(img.width, img.height, { fit: 'cover', position: 'center' })
      .webp({ quality: 80, effort: 6 })
      .toFile(dest);

    const outputStats = fs.statSync(dest);
    const savings = ((1 - outputStats.size / inputStats.size) * 100).toFixed(1);
    console.log(`  WebP:     ${(outputStats.size / 1024).toFixed(1)} KB (${savings}% savings)`);
  }

  console.log('\nDone! All images compressed.');
}

compress().catch((err) => {
  console.error('Compression failed:', err);
  process.exit(1);
});

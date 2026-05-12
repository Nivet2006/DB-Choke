
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const MAX_SIZE_BYTES = 1_000_000;

async function compressImage(inputPath, outputPath) {
  const targetPath = outputPath || inputPath;

  const stats = fs.statSync(inputPath);
  if (stats.size <= MAX_SIZE_BYTES) {
    console.log(`[COMPRESS] Image already under 1 MB (${(stats.size / 1024).toFixed(1)} KB)`);
    if (outputPath && outputPath !== inputPath) {
      fs.copyFileSync(inputPath, outputPath);
    }
    return targetPath;
  }

  console.log(`[COMPRESS] Original size: ${(stats.size / 1024).toFixed(1)} KB — compressing...`);

  let quality = 85;
  let buffer;

  while (quality >= 10) {
    buffer = await sharp(inputPath)
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    if (buffer.length <= MAX_SIZE_BYTES) {
      fs.writeFileSync(targetPath, buffer);
      console.log(
        `[COMPRESS] Compressed to ${(buffer.length / 1024).toFixed(1)} KB (quality: ${quality})`
      );
      return targetPath;
    }

    quality -= 10;
  }

  const metadata = await sharp(inputPath).metadata();
  let width = metadata.width || 800;

  while (width >= 200) {
    width = Math.floor(width * 0.75);
    buffer = await sharp(inputPath)
      .resize({ width })
      .jpeg({ quality: 50, mozjpeg: true })
      .toBuffer();

    if (buffer.length <= MAX_SIZE_BYTES) {
      fs.writeFileSync(targetPath, buffer);
      console.log(
        `[COMPRESS] Resized to ${width}px width, ${(buffer.length / 1024).toFixed(1)} KB`
      );
      return targetPath;
    }
  }

  if (buffer) {
    fs.writeFileSync(targetPath, buffer);
    console.log(`[COMPRESS] Final size: ${(buffer.length / 1024).toFixed(1)} KB`);
  } else {
    console.log(`[COMPRESS] Could not compress below 1 MB — copying original`);
    if (outputPath && outputPath !== inputPath) fs.copyFileSync(inputPath, outputPath);
  }
  return targetPath;
}

async function compressBuffer(pngBuffer, outputPath) {

  let quality = 90;
  let buffer;

  while (quality >= 10) {
    buffer = await sharp(pngBuffer)
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    if (buffer.length <= MAX_SIZE_BYTES) {
      fs.writeFileSync(outputPath, buffer);
      console.log(
        `[COMPRESS] Buffer compressed to ${(buffer.length / 1024).toFixed(1)} KB (quality: ${quality})`
      );
      return outputPath;
    }

    quality -= 10;
  }

  let width = 800;
  while (width >= 200) {
    buffer = await sharp(pngBuffer)
      .resize({ width })
      .jpeg({ quality: 50, mozjpeg: true })
      .toBuffer();

    if (buffer.length <= MAX_SIZE_BYTES) {
      fs.writeFileSync(outputPath, buffer);
      console.log(
        `[COMPRESS] Buffer resized to ${width}px, ${(buffer.length / 1024).toFixed(1)} KB`
      );
      return outputPath;
    }

    width = Math.floor(width * 0.75);
  }

  if (buffer) {
    fs.writeFileSync(outputPath, buffer);
    console.log(`[COMPRESS] Final buffer size: ${(buffer.length / 1024).toFixed(1)} KB`);
  } else {
    console.log(`[COMPRESS] Could not compress buffer below 1 MB — saving as-is`);
    fs.writeFileSync(outputPath, pngBuffer);
  }
  return outputPath;
}

module.exports = { compressImage, compressBuffer, MAX_SIZE_BYTES };

import sharp from 'sharp';
import { Logger } from '@nestjs/common';

const logger = new Logger('ImageOptimizer');

/**
 * Compress and resize an image before sending to Gemini API.
 * Reduces token consumption by 50-70% without losing meaningful detail.
 *
 * - Resizes to max 1024px on longest side (Gemini doesn't need more for understanding)
 * - Converts to JPEG at quality 80 (good balance of quality vs size)
 * - Strips metadata (EXIF, ICC profiles) to reduce payload
 *
 * @param input - Buffer or base64 string of the image
 * @param mimeType - Original MIME type (used for format detection)
 * @returns Optimized { buffer, base64, mimeType }
 */
export async function optimizeImageForAI(
  input: Buffer | string,
  mimeType?: string,
  maxResolution = 1024,
): Promise<{ buffer: Buffer; base64: string; mimeType: string }> {
  try {
    const inputBuffer = typeof input === 'string'
      ? Buffer.from(input, 'base64')
      : input;

    // Get original dimensions
    const metadata = await sharp(inputBuffer).metadata();
    const origWidth = metadata.width || 0;
    const origHeight = metadata.height || 0;
    const origSize = inputBuffer.byteLength;

    // Skip optimization if already small enough
    if (origSize < 100_000 && origWidth <= maxResolution && origHeight <= maxResolution) {
      const base64 = inputBuffer.toString('base64');
      return { buffer: inputBuffer, base64, mimeType: mimeType || 'image/jpeg' };
    }

    // Resize to max resolution on longest side, then compress as JPEG
    const quality = maxResolution > 1024 ? 90 : 80;
    const optimized = await sharp(inputBuffer)
      .resize(maxResolution, maxResolution, {
        fit: 'inside',
        withoutEnlargement: true, // Don't upscale small images
      })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    const ratio = ((1 - optimized.byteLength / origSize) * 100).toFixed(0);
    logger.log(
      `Image optimized: ${(origSize / 1024).toFixed(0)}KB → ${(optimized.byteLength / 1024).toFixed(0)}KB (-${ratio}%) ` +
      `[${origWidth}x${origHeight} → max ${maxResolution}px]`,
    );

    return {
      buffer: optimized,
      base64: optimized.toString('base64'),
      mimeType: 'image/jpeg',
    };
  } catch (err) {
    logger.warn('Image optimization failed, using original:', err);
    // Fallback: return original
    const buf = typeof input === 'string' ? Buffer.from(input, 'base64') : input;
    return {
      buffer: buf,
      base64: buf.toString('base64'),
      mimeType: mimeType || 'image/jpeg',
    };
  }
}

/**
 * Optimize multiple images (e.g. from PDF extraction).
 * Also limits to maxCount images to prevent token explosion.
 */
export async function optimizeImagesForAI(
  images: { buffer: Buffer; mimeType: string; url?: string }[],
  maxCount = 5,
): Promise<{ buffer: Buffer; mimeType: string; url?: string }[]> {
  const limited = images.slice(0, maxCount);
  if (images.length > maxCount) {
    logger.log(`Limiting images from ${images.length} to ${maxCount} for AI processing`);
  }

  const results: { buffer: Buffer; mimeType: string; url?: string }[] = [];
  for (const img of limited) {
    const optimized = await optimizeImageForAI(img.buffer, img.mimeType);
    results.push({
      buffer: optimized.buffer,
      mimeType: optimized.mimeType,
      url: img.url,
    });
  }
  return results;
}

/**
 * Avatar file upload validation utility.
 *
 * Accepts a file if and only if:
 * - size ≤ 2MB (2,097,152 bytes)
 * - MIME type is one of: image/jpeg, image/png, image/webp
 */

/** Allowed MIME types for avatar upload */
export const ALLOWED_AVATAR_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

/** Max avatar file size in bytes: 2MB */
export const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024; // 2,097,152

/**
 * Validates avatar file metadata.
 *
 * @param size - File size in bytes
 * @param mimeType - File MIME type string
 * @returns true if the file is valid for avatar upload, false otherwise
 */
export function validateAvatarFile(size: number, mimeType: string): boolean {
  return size <= MAX_AVATAR_SIZE_BYTES && ALLOWED_AVATAR_MIME_TYPES.includes(mimeType);
}

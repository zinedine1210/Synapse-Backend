/**
 * Property 2: File Upload Validation
 *
 * For any file metadata (size in bytes, MIME type), the avatar upload validator
 * shall accept the file if and only if size ≤ 2MB (2,097,152 bytes) AND MIME type
 * is one of image/jpeg, image/png, image/webp.
 *
 * Feature: synapse-ux-revamp, Property 2: File Upload Validation
 * Validates: Requirements 5.1
 */
import * as fc from 'fast-check';
import {
  validateAvatarFile,
  ALLOWED_AVATAR_MIME_TYPES,
  MAX_AVATAR_SIZE_BYTES,
} from './validate-avatar-file';

describe('Property 2: File Upload Validation', () => {
  const VALID_MIMES = [...ALLOWED_AVATAR_MIME_TYPES]; // image/jpeg, image/png, image/webp
  const INVALID_MIMES = [
    'image/gif',
    'image/svg+xml',
    'image/bmp',
    'image/tiff',
    'application/pdf',
    'text/plain',
    'video/mp4',
    'application/octet-stream',
  ];

  /**
   * Validates: Requirements 5.1
   *
   * Property: For any file with valid MIME type AND size ≤ 2,097,152 bytes,
   * validateAvatarFile returns true.
   */
  it('should ACCEPT any file with valid MIME and size ≤ 2MB', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_AVATAR_SIZE_BYTES }),
        fc.constantFrom(...VALID_MIMES),
        (size, mime) => {
          expect(validateAvatarFile(size, mime)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.1
   *
   * Property: For any file with invalid MIME type (regardless of size),
   * validateAvatarFile returns false.
   */
  it('should REJECT any file with invalid MIME type regardless of size', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 * 1024 * 1024 }), // any size up to 10MB
        fc.constantFrom(...INVALID_MIMES),
        (size, mime) => {
          expect(validateAvatarFile(size, mime)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.1
   *
   * Property: For any file with size > 2,097,152 bytes (regardless of MIME),
   * validateAvatarFile returns false.
   */
  it('should REJECT any file with size > 2MB regardless of MIME type', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MAX_AVATAR_SIZE_BYTES + 1, max: 100 * 1024 * 1024 }),
        fc.constantFrom(...VALID_MIMES, ...INVALID_MIMES),
        (size, mime) => {
          expect(validateAvatarFile(size, mime)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.1
   *
   * Property (biconditional): For any file metadata, the validator accepts
   * if and only if size ≤ 2,097,152 bytes AND MIME ∈ {image/jpeg, image/png, image/webp}.
   */
  it('should accept iff size ≤ 2MB AND MIME is allowed (biconditional)', () => {
    const allMimes = [...VALID_MIMES, ...INVALID_MIMES];

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 * 1024 * 1024 }),
        fc.constantFrom(...allMimes),
        (size, mime) => {
          const expected =
            size <= MAX_AVATAR_SIZE_BYTES && VALID_MIMES.includes(mime);
          expect(validateAvatarFile(size, mime)).toBe(expected);
        },
      ),
      { numRuns: 200 },
    );
  });
});

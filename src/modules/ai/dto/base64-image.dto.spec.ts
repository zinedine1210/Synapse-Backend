import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { Base64ImageDto } from './base64-image.dto';

describe('Base64ImageDto validation', () => {
  function toDto(data: Record<string, any>): Base64ImageDto {
    return plainToInstance(Base64ImageDto, data);
  }

  it('should pass with valid data', async () => {
    const dto = toDto({ base64: 'aGVsbG8=', mimeType: 'image/png' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject empty base64', async () => {
    const dto = toDto({ base64: '', mimeType: 'image/png' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject base64 over 5MB', async () => {
    const dto = toDto({ base64: 'x'.repeat(5 * 1024 * 1024 + 1), mimeType: 'image/png' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'base64')).toBe(true);
  });

  it('should reject invalid mimeType', async () => {
    const invalid = ['text/html', 'application/pdf', 'image/svg+xml', 'application/javascript', '../../../etc/passwd'];
    for (const mime of invalid) {
      const dto = toDto({ base64: 'aGVsbG8=', mimeType: mime });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'mimeType')).toBe(true);
    }
  });

  it('should accept all valid image mimeTypes', async () => {
    const valid = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
    for (const mime of valid) {
      const dto = toDto({ base64: 'aGVsbG8=', mimeType: mime });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    }
  });

  it('should reject missing mimeType', async () => {
    const dto = toDto({ base64: 'aGVsbG8=' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'mimeType')).toBe(true);
  });
});

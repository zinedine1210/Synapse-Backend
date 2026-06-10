/**
 * Security tests for SSRF protection, file path sanitization, 
 * and password hashing in the application.
 */
import * as bcrypt from 'bcrypt';

describe('Security: SSRF URL validation', () => {
  // Extracted URL validation logic from task.service.ts for testability
  function validateImageUrl(imageUrl: string): { valid: boolean; reason?: string } {
    try {
      const url = new URL(imageUrl);
      if (url.protocol !== 'https:') {
        return { valid: false, reason: 'not https' };
      }
      const hostname = url.hostname.toLowerCase();
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.') ||
        hostname.endsWith('.internal') ||
        hostname === '0.0.0.0' ||
        hostname === '169.254.169.254'
      ) {
        return { valid: false, reason: 'internal ip' };
      }
      return { valid: true };
    } catch {
      return { valid: false, reason: 'invalid url' };
    }
  }

  it('should allow valid HTTPS URLs', () => {
    expect(validateImageUrl('https://example.com/image.png').valid).toBe(true);
    expect(validateImageUrl('https://storage.googleapis.com/bucket/img.jpg').valid).toBe(true);
  });

  it('should block HTTP URLs', () => {
    expect(validateImageUrl('http://example.com/image.png').valid).toBe(false);
  });

  it('should block localhost', () => {
    expect(validateImageUrl('https://localhost/admin').valid).toBe(false);
    expect(validateImageUrl('https://127.0.0.1/secret').valid).toBe(false);
    expect(validateImageUrl('https://0.0.0.0/data').valid).toBe(false);
  });

  it('should block private network IPs', () => {
    expect(validateImageUrl('https://192.168.1.1/data').valid).toBe(false);
    expect(validateImageUrl('https://10.0.0.1/internal').valid).toBe(false);
    expect(validateImageUrl('https://172.16.0.1/secret').valid).toBe(false);
  });

  it('should block AWS metadata endpoint', () => {
    expect(validateImageUrl('https://169.254.169.254/latest/meta-data/').valid).toBe(false);
  });

  it('should block .internal domains', () => {
    expect(validateImageUrl('https://api.internal/secrets').valid).toBe(false);
  });

  it('should reject malformed URLs', () => {
    expect(validateImageUrl('not-a-url').valid).toBe(false);
    expect(validateImageUrl('').valid).toBe(false);
    expect(validateImageUrl('javascript:alert(1)').valid).toBe(false);
    expect(validateImageUrl('file:///etc/passwd').valid).toBe(false);
  });
});

describe('Security: File path sanitization', () => {
  function sanitizeFilename(original: string): string {
    return original
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.{2,}/g, '.');
  }

  it('should keep safe filenames unchanged', () => {
    expect(sanitizeFilename('document.pdf')).toBe('document.pdf');
    expect(sanitizeFilename('my-file_2024.png')).toBe('my-file_2024.png');
  });

  it('should sanitize path traversal attempts', () => {
    const result = sanitizeFilename('../../../etc/passwd');
    expect(result).not.toContain('..');
    expect(result).not.toContain('/');
  });

  it('should sanitize special characters', () => {
    const result = sanitizeFilename('file<script>.exe');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });

  it('should handle unicode and spaces', () => {
    const result = sanitizeFilename('my file (한국어).pdf');
    expect(result).not.toContain(' ');
    expect(result).not.toContain('(');
    expect(result).not.toContain(')');
  });

  it('should collapse multiple dots', () => {
    const result = sanitizeFilename('file....name.txt');
    expect(result).not.toContain('..');
  });
});

describe('Security: Password hashing with bcrypt', () => {
  it('should hash passwords correctly', async () => {
    const password = 'MySecurePass123';
    const hash = await bcrypt.hash(password, 10);

    expect(hash).not.toBe(password);
    expect(hash.startsWith('$2b$')).toBe(true);
    expect(await bcrypt.compare(password, hash)).toBe(true);
  });

  it('should reject wrong passwords', async () => {
    const hash = await bcrypt.hash('correct-password', 10);
    expect(await bcrypt.compare('wrong-password', hash)).toBe(false);
  });

  it('should generate different hashes for same password', async () => {
    const password = 'SamePassword';
    const hash1 = await bcrypt.hash(password, 10);
    const hash2 = await bcrypt.hash(password, 10);
    expect(hash1).not.toBe(hash2); // different salts
    // Both should verify
    expect(await bcrypt.compare(password, hash1)).toBe(true);
    expect(await bcrypt.compare(password, hash2)).toBe(true);
  });

  it('should handle empty password in comparison', async () => {
    const hash = await bcrypt.hash('real-password', 10);
    expect(await bcrypt.compare('', hash)).toBe(false);
  });
});

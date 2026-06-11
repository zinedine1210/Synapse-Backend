import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    // Create a minimal instance to test the pure checkQuietHours logic
    service = Object.create(NotificationService.prototype);
  });

  describe('checkQuietHours', () => {
    it('should return true when time is within same-day quiet hours', () => {
      // Quiet hours: 08:00 - 17:00, current time: 12:00
      const now = new Date('2024-01-15T12:00:00');
      expect(service.checkQuietHours('08:00', '17:00', now)).toBe(true);
    });

    it('should return false when time is outside same-day quiet hours', () => {
      // Quiet hours: 08:00 - 17:00, current time: 19:00
      const now = new Date('2024-01-15T19:00:00');
      expect(service.checkQuietHours('08:00', '17:00', now)).toBe(false);
    });

    it('should return true when time is within overnight quiet hours (after start)', () => {
      // Quiet hours: 22:00 - 07:00, current time: 23:30
      const now = new Date('2024-01-15T23:30:00');
      expect(service.checkQuietHours('22:00', '07:00', now)).toBe(true);
    });

    it('should return true when time is within overnight quiet hours (before end)', () => {
      // Quiet hours: 22:00 - 07:00, current time: 05:00
      const now = new Date('2024-01-15T05:00:00');
      expect(service.checkQuietHours('22:00', '07:00', now)).toBe(true);
    });

    it('should return false when time is outside overnight quiet hours', () => {
      // Quiet hours: 22:00 - 07:00, current time: 12:00
      const now = new Date('2024-01-15T12:00:00');
      expect(service.checkQuietHours('22:00', '07:00', now)).toBe(false);
    });

    it('should return true at exact start time for same-day window', () => {
      // Quiet hours: 22:00 - 07:00, current time: 22:00
      const now = new Date('2024-01-15T22:00:00');
      expect(service.checkQuietHours('22:00', '07:00', now)).toBe(true);
    });

    it('should return false at exact end time for same-day window', () => {
      // Quiet hours: 08:00 - 17:00, current time: 17:00 (exclusive end)
      const now = new Date('2024-01-15T17:00:00');
      expect(service.checkQuietHours('08:00', '17:00', now)).toBe(false);
    });

    it('should return false at exact end time for overnight window', () => {
      // Quiet hours: 22:00 - 07:00, current time: 07:00 (exclusive end)
      const now = new Date('2024-01-15T07:00:00');
      expect(service.checkQuietHours('22:00', '07:00', now)).toBe(false);
    });

    it('should handle midnight correctly in overnight window', () => {
      // Quiet hours: 23:00 - 06:00, current time: 00:00
      const now = new Date('2024-01-15T00:00:00');
      expect(service.checkQuietHours('23:00', '06:00', now)).toBe(true);
    });

    it('should handle times with minutes', () => {
      // Quiet hours: 22:30 - 06:30, current time: 22:45
      const now = new Date('2024-01-15T22:45:00');
      expect(service.checkQuietHours('22:30', '06:30', now)).toBe(true);
    });

    it('should return false just before start of overnight window', () => {
      // Quiet hours: 22:00 - 07:00, current time: 21:59
      const now = new Date('2024-01-15T21:59:00');
      expect(service.checkQuietHours('22:00', '07:00', now)).toBe(false);
    });
  });
});

import { SettingsService } from './settings.service';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('SettingsService', () => {
  let service: SettingsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        update: jest.fn(),
      },
      userSettings: {
        upsert: jest.fn(),
        update: jest.fn(),
      },
      notificationPreference: {
        upsert: jest.fn(),
      },
      transaction: {
        findMany: jest.fn(),
      },
      personalTodo: {
        findMany: jest.fn(),
      },
    };
    service = new SettingsService(mockPrisma);
  });

  describe('updateProfile', () => {
    it('should update fullName and avatarUrl', async () => {
      mockPrisma.user.update.mockResolvedValue({
        id: 'user-1',
        fullName: 'New Name',
        avatarUrl: 'https://example.com/avatar.png',
        email: 'test@test.com',
      });

      const result = await service.updateProfile('user-1', {
        fullName: 'New Name',
        avatarUrl: 'https://example.com/avatar.png',
      });

      expect(result.message).toBe('Profil berhasil diperbarui.');
      expect(result.user.fullName).toBe('New Name');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { fullName: 'New Name', avatarUrl: 'https://example.com/avatar.png' },
        select: { id: true, fullName: true, avatarUrl: true, email: true },
      });
    });

    it('should only update provided fields', async () => {
      mockPrisma.user.update.mockResolvedValue({
        id: 'user-1',
        fullName: 'Only Name',
        avatarUrl: null,
        email: 'test@test.com',
      });

      await service.updateProfile('user-1', { fullName: 'Only Name' });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { fullName: 'Only Name' },
        select: { id: true, fullName: true, avatarUrl: true, email: true },
      });
    });
  });

  describe('getPreferences', () => {
    it('should return combined settings and notification preferences', async () => {
      mockPrisma.userSettings.upsert.mockResolvedValue({
        userId: 'user-1',
        theme: 'dark',
        language: 'en',
        accountStatus: 'ACTIVE',
      });
      mockPrisma.notificationPreference.upsert.mockResolvedValue({
        userId: 'user-1',
        deadlineReminder: true,
        budgetAlert: false,
        streakReminder: true,
        idleReminder: true,
        weeklyRecap: true,
        forumReply: true,
        qnaAnswer: true,
        achievementAlert: true,
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
      });

      const result = await service.getPreferences('user-1');

      expect(result.theme).toBe('dark');
      expect(result.language).toBe('en');
      expect(result.notifications.budgetAlert).toBe(false);
      expect(result.notifications.quietHoursStart).toBe('22:00');
    });
  });

  describe('updatePreferences', () => {
    it('should update notification toggles and settings separately', async () => {
      mockPrisma.notificationPreference.upsert.mockResolvedValue({});
      mockPrisma.userSettings.upsert.mockResolvedValue({});

      const result = await service.updatePreferences('user-1', {
        budgetAlert: false,
        theme: 'dark',
      });

      expect(result.message).toBe('Preferensi berhasil diperbarui.');
      expect(mockPrisma.notificationPreference.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        update: { budgetAlert: false },
        create: { userId: 'user-1', budgetAlert: false },
      });
      expect(mockPrisma.userSettings.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        update: { theme: 'dark' },
        create: { userId: 'user-1', theme: 'dark' },
      });
    });
  });

  describe('updateQuietHours', () => {
    it('should update quiet hours start and end', async () => {
      mockPrisma.notificationPreference.upsert.mockResolvedValue({});

      const result = await service.updateQuietHours('user-1', {
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
      });

      expect(result.message).toBe('Quiet hours berhasil diperbarui.');
      expect(mockPrisma.notificationPreference.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        update: { quietHoursStart: '22:00', quietHoursEnd: '07:00' },
        create: { userId: 'user-1', quietHoursStart: '22:00', quietHoursEnd: '07:00' },
      });
    });
  });

  describe('exportData', () => {
    it('should generate CSV with transactions and todos', async () => {
      mockPrisma.userSettings.upsert.mockResolvedValue({
        userId: 'user-1',
        exportRequested: null,
      });
      mockPrisma.userSettings.update.mockResolvedValue({});
      mockPrisma.transaction.findMany.mockResolvedValue([
        {
          date: new Date('2024-01-15'),
          type: 'expense',
          category: 'food',
          label: 'Makan siang',
          amount: 25000,
          note: '',
        },
      ]);
      mockPrisma.personalTodo.findMany.mockResolvedValue([
        {
          title: 'Belajar NestJS',
          status: 'completed',
          priority: 'high',
          category: 'study',
          dueDate: new Date('2024-01-20'),
          createdAt: new Date('2024-01-10'),
        },
      ]);

      const result = await service.exportData('user-1');

      expect(result.message).toBe('Data berhasil diekspor.');
      expect(result.csv).toContain('=== TRANSACTIONS ===');
      expect(result.csv).toContain('=== TODOS ===');
      expect(result.csv).toContain('Makan siang');
      expect(result.csv).toContain('Belajar NestJS');
      expect(result.filename).toMatch(/^synapse-export-\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it('should throw 429 if export requested within the last hour', async () => {
      mockPrisma.userSettings.upsert.mockResolvedValue({
        userId: 'user-1',
        exportRequested: new Date(), // just now
      });

      await expect(service.exportData('user-1')).rejects.toThrow(HttpException);
      try {
        await service.exportData('user-1');
      } catch (err) {
        expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      }
    });

    it('should allow export if last request was over 1 hour ago', async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      mockPrisma.userSettings.upsert.mockResolvedValue({
        userId: 'user-1',
        exportRequested: twoHoursAgo,
      });
      mockPrisma.userSettings.update.mockResolvedValue({});
      mockPrisma.transaction.findMany.mockResolvedValue([]);
      mockPrisma.personalTodo.findMany.mockResolvedValue([]);

      const result = await service.exportData('user-1');
      expect(result.message).toBe('Data berhasil diekspor.');
    });
  });

  describe('deleteAccount', () => {
    it('should soft-delete account when confirmation text matches', async () => {
      mockPrisma.userSettings.upsert.mockResolvedValue({});

      const result = await service.deleteAccount('user-1', {
        confirmationText: 'HAPUS AKUN',
      });

      expect(result.message).toContain('Akun berhasil dihapus');
      expect(mockPrisma.userSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          update: expect.objectContaining({
            accountStatus: 'DELETED',
          }),
        }),
      );
    });

    it('should reject if confirmation text does not match', async () => {
      await expect(
        service.deleteAccount('user-1', { confirmationText: 'wrong' }),
      ).rejects.toThrow('Untuk menghapus akun, ketik "HAPUS AKUN" sebagai konfirmasi.');
    });
  });
});

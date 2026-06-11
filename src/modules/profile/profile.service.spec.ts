import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { PrismaService } from '../../database/prisma.service';

// Mock Supabase client
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: {
      listBuckets: jest.fn().mockResolvedValue({ data: [{ name: 'avatars' }], error: null }),
      from: () => ({
        list: jest.fn().mockResolvedValue({ data: [], error: null }),
        upload: jest.fn().mockResolvedValue({ data: { path: 'test' }, error: null }),
        remove: jest.fn().mockResolvedValue({ data: [], error: null }),
        getPublicUrl: jest.fn().mockReturnValue({
          data: { publicUrl: 'https://storage.example.com/avatars/test.jpg' },
        }),
      }),
    },
  }),
}));

describe('ProfileService', () => {
  let service: ProfileService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      userProfile: {
        upsert: jest.fn().mockResolvedValue({
          userId: 'user-1',
          university: null,
          hobbies: [],
          job: null,
          reason: null,
          avatarUrl: null,
          dailyHabits: null,
          lifeGoals: null,
          studySchedule: null,
          personalNotes: null,
        }),
      },
      user: {
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'SUPABASE_URL') return 'https://test.supabase.co';
              if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'test-key';
              return null;
            },
          },
        },
      ],
    }).compile();

    service = module.get<ProfileService>(ProfileService);
  });

  describe('uploadAvatar', () => {
    it('should reject files with invalid MIME type', async () => {
      const file = {
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('test'),
        originalname: 'doc.pdf',
      } as Express.Multer.File;

      await expect(service.uploadAvatar('user-1', file)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.uploadAvatar('user-1', file)).rejects.toThrow(
        'Format file tidak didukung',
      );
    });

    it('should reject files larger than 2MB with 413 status', async () => {
      const file = {
        mimetype: 'image/jpeg',
        size: 3 * 1024 * 1024, // 3MB
        buffer: Buffer.alloc(3 * 1024 * 1024),
        originalname: 'big.jpg',
      } as Express.Multer.File;

      try {
        await service.uploadAvatar('user-1', file);
        fail('Expected HttpException');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
      }
    });

    it('should accept valid JPG file under 2MB', async () => {
      const file = {
        mimetype: 'image/jpeg',
        size: 1024 * 500, // 500KB
        buffer: Buffer.alloc(500),
        originalname: 'photo.jpg',
      } as Express.Multer.File;

      const result = await service.uploadAvatar('user-1', file);
      expect(result).toHaveProperty('avatarUrl');
      expect(result.avatarUrl).toContain('https://');
    });

    it('should accept valid PNG file', async () => {
      const file = {
        mimetype: 'image/png',
        size: 1024 * 100, // 100KB
        buffer: Buffer.alloc(100),
        originalname: 'photo.png',
      } as Express.Multer.File;

      const result = await service.uploadAvatar('user-1', file);
      expect(result).toHaveProperty('avatarUrl');
    });

    it('should accept valid WebP file', async () => {
      const file = {
        mimetype: 'image/webp',
        size: 1024 * 200, // 200KB
        buffer: Buffer.alloc(200),
        originalname: 'photo.webp',
      } as Express.Multer.File;

      const result = await service.uploadAvatar('user-1', file);
      expect(result).toHaveProperty('avatarUrl');
    });

    it('should reject file exactly at boundary (2MB + 1 byte)', async () => {
      const file = {
        mimetype: 'image/jpeg',
        size: 2 * 1024 * 1024 + 1, // 2MB + 1 byte
        buffer: Buffer.alloc(10),
        originalname: 'boundary.jpg',
      } as Express.Multer.File;

      try {
        await service.uploadAvatar('user-1', file);
        fail('Expected HttpException');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
      }
    });

    it('should accept file exactly at 2MB', async () => {
      const file = {
        mimetype: 'image/jpeg',
        size: 2 * 1024 * 1024, // exactly 2MB
        buffer: Buffer.alloc(10),
        originalname: 'exact.jpg',
      } as Express.Multer.File;

      const result = await service.uploadAvatar('user-1', file);
      expect(result).toHaveProperty('avatarUrl');
    });

    it('should throw BadRequestException when file is missing', async () => {
      await expect(
        service.uploadAvatar('user-1', undefined as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject GIF files', async () => {
      const file = {
        mimetype: 'image/gif',
        size: 1024,
        buffer: Buffer.from('test'),
        originalname: 'animation.gif',
      } as Express.Multer.File;

      await expect(service.uploadAvatar('user-1', file)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      const result = await service.getProfile('user-1');
      expect(result).toHaveProperty('userId', 'user-1');
      expect(prisma.userProfile.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        update: {},
        create: { userId: 'user-1' },
      });
    });
  });

  describe('updateProfile', () => {
    it('should update profile with provided fields', async () => {
      await service.updateProfile('user-1', {
        university: 'Universitas Indonesia',
        hobbies: ['coding', 'reading'],
      });

      expect(prisma.userProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          update: expect.objectContaining({
            university: 'Universitas Indonesia',
            hobbies: ['coding', 'reading'],
          }),
        }),
      );
    });
  });

  describe('deleteAvatar', () => {
    it('should clear avatar URL from both tables', async () => {
      await service.deleteAvatar('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { avatarUrl: null },
      });
      expect(prisma.userProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { avatarUrl: null },
        }),
      );
    });
  });
});

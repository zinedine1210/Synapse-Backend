import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SearchService } from './search.service';
import { PrismaService } from '../../database/prisma.service';

describe('SearchService', () => {
  let service: SearchService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      classMember: { findMany: jest.fn() },
      task: { findMany: jest.fn() },
      personalTodo: { findMany: jest.fn() },
      transaction: { findMany: jest.fn() },
      qnaQuestion: { findMany: jest.fn() },
      session: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  describe('search validation', () => {
    it('should throw BadRequestException when query is empty', async () => {
      await expect(service.search('user-1', '', 20)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when query is less than 2 characters', async () => {
      await expect(service.search('user-1', 'a', 20)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException with correct message', async () => {
      await expect(service.search('user-1', 'x', 20)).rejects.toThrow('Minimum 2 karakter');
    });

    it('should throw when query is only whitespace', async () => {
      await expect(service.search('user-1', '   ', 20)).rejects.toThrow(BadRequestException);
    });
  });

  describe('search results', () => {
    beforeEach(() => {
      prisma.classMember.findMany.mockResolvedValue([
        { classId: 'class-1' },
        { classId: 'class-2' },
      ]);
    });

    it('should return grouped results from all categories', async () => {
      prisma.task.findMany.mockResolvedValue([
        { id: 't1', title: 'Kalkulus UTS', deadline: new Date('2025-06-15'), class: { name: 'Kalkulus I' } },
      ]);
      prisma.personalTodo.findMany.mockResolvedValue([
        { id: 'td1', title: 'Belajar Kalkulus', dueDate: new Date('2025-06-10') },
      ]);
      prisma.transaction.findMany.mockResolvedValue([
        { id: 'tx1', label: 'Buku Kalkulus', amount: 75000, type: 'expense' },
      ]);
      prisma.qnaQuestion.findMany.mockResolvedValue([
        { id: 'q1', title: 'Cara integral kalkulus?', slug: 'cara-integral-kalkulus' },
      ]);
      prisma.session.findMany.mockResolvedValue([
        { id: 's1', title: 'Pertemuan 3', sequence: 3, class: { name: 'Kalkulus I' } },
      ]);

      const result = await service.search('user-1', 'kalkulus', 20);

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0]).toEqual({
        id: 't1',
        title: 'Kalkulus UTS',
        className: 'Kalkulus I',
        deadline: new Date('2025-06-15').toISOString(),
      });

      expect(result.todos).toHaveLength(1);
      expect(result.todos[0]).toEqual({
        id: 'td1',
        title: 'Belajar Kalkulus',
        dueDate: new Date('2025-06-10').toISOString(),
      });

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toEqual({
        id: 'tx1',
        label: 'Buku Kalkulus',
        amount: 75000,
        type: 'expense',
      });

      expect(result.qna).toHaveLength(1);
      expect(result.qna[0]).toEqual({
        id: 'q1',
        title: 'Cara integral kalkulus?',
        slug: 'cara-integral-kalkulus',
      });

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0]).toEqual({
        id: 's1',
        title: 'Pertemuan 3',
        className: 'Kalkulus I',
        sequence: 3,
      });
    });

    it('should return empty arrays when no results match', async () => {
      prisma.task.findMany.mockResolvedValue([]);
      prisma.personalTodo.findMany.mockResolvedValue([]);
      prisma.transaction.findMany.mockResolvedValue([]);
      prisma.qnaQuestion.findMany.mockResolvedValue([]);
      prisma.session.findMany.mockResolvedValue([]);

      const result = await service.search('user-1', 'nonexistent', 20);

      expect(result.tasks).toEqual([]);
      expect(result.todos).toEqual([]);
      expect(result.transactions).toEqual([]);
      expect(result.qna).toEqual([]);
      expect(result.sessions).toEqual([]);
    });

    it('should return empty tasks and sessions when user has no classes', async () => {
      prisma.classMember.findMany.mockResolvedValue([]);
      prisma.personalTodo.findMany.mockResolvedValue([]);
      prisma.transaction.findMany.mockResolvedValue([]);
      prisma.qnaQuestion.findMany.mockResolvedValue([]);

      const result = await service.search('user-1', 'test query', 20);

      expect(result.tasks).toEqual([]);
      expect(result.sessions).toEqual([]);
      // task and session findMany should not be called
      expect(prisma.task.findMany).not.toHaveBeenCalled();
      expect(prisma.session.findMany).not.toHaveBeenCalled();
    });

    it('should omit deadline and dueDate fields when null', async () => {
      prisma.task.findMany.mockResolvedValue([
        { id: 't1', title: 'Test Task', deadline: null, class: { name: 'Class A' } },
      ]);
      prisma.personalTodo.findMany.mockResolvedValue([
        { id: 'td1', title: 'Test Todo', dueDate: null },
      ]);
      prisma.transaction.findMany.mockResolvedValue([]);
      prisma.qnaQuestion.findMany.mockResolvedValue([]);
      prisma.session.findMany.mockResolvedValue([]);

      const result = await service.search('user-1', 'test', 20);

      expect(result.tasks[0]).toEqual({ id: 't1', title: 'Test Task', className: 'Class A' });
      expect(result.tasks[0]).not.toHaveProperty('deadline');
      expect(result.todos[0]).toEqual({ id: 'td1', title: 'Test Todo' });
      expect(result.todos[0]).not.toHaveProperty('dueDate');
    });
  });
});

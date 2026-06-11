import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SearchService, SearchResponse } from './search.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';

@Controller('search')
@UseGuards(AuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(
    @GetUser() user: User,
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ): Promise<SearchResponse> {
    const parsedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100) : 20;
    return this.searchService.search(user.id, query, parsedLimit);
  }
}

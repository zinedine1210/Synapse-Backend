import { Controller, Get, Post, Delete, Body, Param, UseGuards, ParseUUIDPipe, Patch } from '@nestjs/common';
import { KolektifService } from './kolektif.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';
import { CreateKolektifDto, SetTargetDto, AddTransactionDto } from './dto/kolektif.dto';

@Controller('kolektif')
@UseGuards(AuthGuard)
export class KolektifController {
  constructor(private readonly svc: KolektifService) {}

  @Get('class/:classId')
  getAll(@Param('classId', ParseUUIDPipe) classId: string, @GetUser() user: User) {
    return this.svc.getAll(classId, user.id);
  }

  @Post('class/:classId')
  create(
    @Param('classId', ParseUUIDPipe) classId: string,
    @GetUser() user: User,
    @Body() body: CreateKolektifDto,
  ) {
    return this.svc.create(classId, user.id, body);
  }

  @Get(':kolektifId/summary-by-user')
  getSummaryByUser(
    @Param('kolektifId', ParseUUIDPipe) kolektifId: string,
    @GetUser() user: User,
  ) {
    return this.svc.getSummaryByUser(kolektifId, user.id);
  }

  @Patch(':kolektifId/target')
  setTargetPerPerson(
    @Param('kolektifId', ParseUUIDPipe) kolektifId: string,
    @GetUser() user: User,
    @Body() body: SetTargetDto,
  ) {
    return this.svc.setTargetPerPerson(kolektifId, user.id, body);
  }

  @Post(':kolektifId/transaction')
  addTransaction(
    @Param('kolektifId', ParseUUIDPipe) kolektifId: string,
    @GetUser() user: User,
    @Body() body: AddTransactionDto,
  ) {
    return this.svc.addTransaction(kolektifId, user.id, body);
  }

  @Delete('transaction/:txId')
  deleteTransaction(@Param('txId', ParseUUIDPipe) txId: string, @GetUser() user: User) {
    return this.svc.deleteTransaction(txId, user.id);
  }

  @Delete(':kolektifId')
  deleteFund(@Param('kolektifId', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.svc.deleteFund(id, user.id);
  }
}

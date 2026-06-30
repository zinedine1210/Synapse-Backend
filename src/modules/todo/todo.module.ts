import { Module } from '@nestjs/common';
import { TodoController } from './todo.controller';
import { TodoService } from './todo.service';
import { DatabaseModule } from '../../database/database.module';
import { AiModule } from '../ai/ai.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [DatabaseModule, AiModule, NotificationModule],
  controllers: [TodoController],
  providers: [TodoService],
})
export class TodoModule {}

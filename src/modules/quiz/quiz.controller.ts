import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { QuizService } from './quiz.service';
import { GenerateQuizDto } from './dto/generate-quiz.dto';
import { AttemptQuizDto } from './dto/attempt-quiz.dto';
import { AuthGuard } from '../../common/guards/auth.guard';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';

@Controller('quizzes')
@UseGuards(AuthGuard, FeatureGuard)
@RequireFeature('quiz')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  /** POST /api/v1/quizzes/generate */
  @Post('generate')
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  generateQuiz(@GetUser() user: User, @Body() dto: GenerateQuizDto) {
    return this.quizService.generateQuiz(user, dto);
  }

  /** POST /api/v1/quizzes/attempt */
  @Post('attempt')
  submitAttempt(@GetUser() user: User, @Body() dto: AttemptQuizDto) {
    return this.quizService.submitAttempt(user.id, dto);
  }
}

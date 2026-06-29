import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ExamPredictionService } from './exam-prediction.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { FileSizeGuard } from '../../common/guards/file-size.guard';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';
import { CreatePredictionDto } from './dto/create-prediction.dto';
import { GeneratePredictionDto } from './dto/generate-prediction.dto';

@Controller('exam-prediction')
@UseGuards(AuthGuard, FeatureGuard, FileSizeGuard)
@RequireFeature('exam_prediction')
export class ExamPredictionController {
  constructor(private readonly predictionService: ExamPredictionService) {}

  @Get('class/:classId')
  getClassPredictions(
    @Param('classId', ParseUUIDPipe) classId: string,
    @GetUser() user: User,
  ) {
    return this.predictionService.getClassPredictions(classId, user.id);
  }

  @Get(':id')
  getPredictionById(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
  ) {
    return this.predictionService.getPredictionById(id, user.id);
  }

  @Post('class/:classId')
  createManual(
    @Param('classId', ParseUUIDPipe) classId: string,
    @GetUser() user: User,
    @Body() dto: CreatePredictionDto,
  ) {
    return this.predictionService.createManualPrediction(classId, user.id, dto);
  }

  @Post('class/:classId/generate')
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  generate(
    @Param('classId', ParseUUIDPipe) classId: string,
    @GetUser() user: User,
    @Body() dto: GeneratePredictionDto,
  ) {
    return this.predictionService.generatePrediction(classId, user.id, dto);
  }

  @Post('class/:classId/upload-image')
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  uploadImage(
    @Param('classId', ParseUUIDPipe) classId: string,
    @GetUser() user: User,
    @Body() dto: { title: string; description?: string; base64: string; mimeType: string },
  ) {
    return this.predictionService.uploadPredictionImage(classId, user.id, dto);
  }

  @Delete(':id')
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
  ) {
    return this.predictionService.deletePrediction(id, user.id);
  }
}

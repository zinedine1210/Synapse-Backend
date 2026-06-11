import { Controller, Get, Post, Patch, Body, UseGuards, Query } from '@nestjs/common';
import { FoodRecommendService } from './food-recommend.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';

@Controller('food')
@UseGuards(AuthGuard, FeatureGuard)
@RequireFeature('food_recommend')
export class FoodRecommendController {
  constructor(private readonly svc: FoodRecommendService) {}

  @Get('preference')
  getPreference(@GetUser() user: User) {
    return this.svc.getPreference(user.id);
  }

  @Patch('preference')
  updatePreference(@GetUser() user: User, @Body() body: {
    dislikedIngredients?: string[];
    preferredCuisines?: string[];
    spicyLevel?: number;
    dietType?: string;
    avgMealBudget?: number;
  }) {
    return this.svc.updatePreference(user.id, body);
  }

  @Post('from-fridge')
  fromFridge(@GetUser() user: User, @Body() body: { imageBase64: string; mimeType: string }) {
    return this.svc.recommendFromFridge(user.id, body.imageBase64, body.mimeType);
  }

  @Post('from-menu')
  fromMenu(@GetUser() user: User, @Body() body: { imageBase64: string; mimeType: string; filter?: string }) {
    return this.svc.recommendFromMenu(user.id, body.imageBase64, body.mimeType, body.filter);
  }
}

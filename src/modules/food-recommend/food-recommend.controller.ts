import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Query } from '@nestjs/common';
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

  // === Budget Integration ===
  @Get('remaining-budget')
  getRemainingBudget(@GetUser() user: User) {
    return this.svc.getRemainingFoodBudget(user.id);
  }

  // === Favorites ===
  @Get('favorites')
  getFavorites(@GetUser() user: User) {
    return this.svc.getFavorites(user.id);
  }

  @Post('favorites')
  addFavorite(@GetUser() user: User, @Body() body: { recipeName: string; recipeData: string }) {
    return this.svc.addFavorite(user.id, body.recipeName, body.recipeData);
  }

  @Delete('favorites/:id')
  removeFavorite(@GetUser() user: User, @Param('id') id: string) {
    return this.svc.removeFavorite(user.id, id);
  }

  // === Recommendation History ===
  @Get('history')
  getHistory(@GetUser() user: User, @Query('limit') limit?: string) {
    return this.svc.getHistory(user.id, limit ? parseInt(limit, 10) : 20);
  }

  // === Text-based ingredient mode ===
  @Post('from-text')
  fromText(@GetUser() user: User, @Body() body: { ingredients: string[] }) {
    return this.svc.recommendFromText(user.id, body.ingredients);
  }

  // === Rating ===
  @Post('rate')
  rateRecipe(@GetUser() user: User, @Body() body: { historyId: string; rating: number; feedback?: string }) {
    return this.svc.rateRecipe(user.id, body.historyId, body.rating, body.feedback);
  }

  @Get('ratings')
  getMyRatings(@GetUser() user: User) {
    return this.svc.getMyRatings(user.id);
  }

  // === Weekly Meal Plan ===
  @Post('meal-plan')
  generateMealPlan(@GetUser() user: User, @Body() body: { days?: number }) {
    return this.svc.generateMealPlan(user.id, body.days || 7);
  }
}

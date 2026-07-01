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

  @Get('meal-plan/active')
  getActiveMealPlan(@GetUser() user: User) {
    return this.svc.getActiveMealPlan(user.id);
  }

  @Post('meal-plan/save')
  saveMealPlan(@GetUser() user: User, @Body() body: { planData: string; weekStart: string }) {
    return this.svc.saveMealPlan(user.id, body.planData, body.weekStart);
  }

  @Patch('meal-plan/entry')
  updateMealEntry(@GetUser() user: User, @Body() body: { planId: string; day: number; mealType: string; completed?: boolean; skipped?: boolean; actualCost?: number }) {
    return this.svc.updateMealEntry(user.id, body);
  }

  // === Meal Catalog (user's known meals) ===
  @Get('meal-catalog')
  getMealCatalog(@GetUser() user: User) {
    return this.svc.getMealCatalog(user.id);
  }

  @Post('meal-catalog')
  addMealToCatalog(@GetUser() user: User, @Body() body: { name: string; mealType: string; price: number; calories?: number; protein?: number; tags?: string[]; source?: string }) {
    return this.svc.addMealToCatalog(user.id, body);
  }

  @Patch('meal-catalog/:id')
  updateCatalogMeal(@GetUser() user: User, @Param('id') id: string, @Body() body: { name?: string; mealType?: string; price?: number; calories?: number; protein?: number; tags?: string[]; source?: string; frequency?: number }) {
    return this.svc.updateCatalogMeal(user.id, id, body);
  }

  @Delete('meal-catalog/:id')
  deleteCatalogMeal(@GetUser() user: User, @Param('id') id: string) {
    return this.svc.deleteCatalogMeal(user.id, id);
  }
}

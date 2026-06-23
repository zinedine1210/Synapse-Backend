import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { AiJobService } from '../ai-job/ai-job.service';

@Injectable()
export class FoodRecommendService {
  private readonly logger = new Logger(FoodRecommendService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly aiJob: AiJobService,
  ) {}

  async getPreference(userId: string) {
    let pref = await this.prisma.foodPreference.findUnique({ where: { userId } });
    if (!pref) {
      pref = await this.prisma.foodPreference.create({
        data: { userId },
      });
    }
    return pref;
  }

  async updatePreference(userId: string, data: {
    dislikedIngredients?: string[];
    preferredCuisines?: string[];
    spicyLevel?: number;
    dietType?: string;
    avgMealBudget?: number;
  }) {
    return this.prisma.foodPreference.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  }

  /**
   * Get remaining food budget for the current month
   */
  async getRemainingFoodBudget(userId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const FOOD_CATEGORIES = ['Makanan', 'Food', 'Makan', 'makanan', 'food'];
    const [foodBudgets, foodTx] = await Promise.all([
      this.prisma.categoryBudget.findMany({
        where: { userId, category: { in: FOOD_CATEGORIES }, month: now.getMonth() + 1, year: now.getFullYear() },
      }),
      this.prisma.transaction.aggregate({
        where: { userId, type: 'expense', category: { in: FOOD_CATEGORIES }, date: { gte: monthStart } },
        _sum: { amount: true },
      }),
    ]);
    const budget = foodBudgets.reduce((sum, b) => sum + b.amount, 0);
    const spent = foodTx._sum.amount ?? 0;
    const remaining = budget > 0 ? budget - spent : null;
    return { budget, spent, remaining };
  }

  /**
   * Mode A: Foto kulkas — extract bahan, generate resep
   */
  async recommendFromFridge(userId: string, imageBase64: string, mimeType: string) {
    return this.aiJob.runAsync(userId, 'food_from_fridge', async () => {
    const pref = await this.getPreference(userId);

    // Get remaining food budget
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const FOOD_CATEGORIES = ['Makanan', 'Food', 'Makan', 'makanan', 'food'];
    const [foodBudgets, foodTx] = await Promise.all([
      this.prisma.categoryBudget.findMany({
        where: { userId, category: { in: FOOD_CATEGORIES }, month: now.getMonth() + 1, year: now.getFullYear() },
      }),
      this.prisma.transaction.aggregate({
        where: { userId, type: 'expense', category: { in: FOOD_CATEGORIES }, date: { gte: monthStart } },
        _sum: { amount: true },
      }),
    ]);
    const foodBudget = foodBudgets.reduce((sum, b) => sum + b.amount, 0);
    const foodSpent = foodTx._sum.amount ?? 0;
    const remaining = foodBudget > 0 ? foodBudget - foodSpent : null;

    const prompt = `Kamu adalah asisten masak untuk anak muda Indonesia.

Dari foto kulkas/bahan makanan ini, identifikasi semua bahan yang terlihat.
Lalu berikan 3 resep sederhana yang bisa dibuat anak muda.

Preferensi user:
- Bahan tidak disukai: ${pref.dislikedIngredients.join(', ') || 'tidak ada'}
- Masakan favorit: ${pref.preferredCuisines.join(', ') || 'semua'}
- Level pedas: ${pref.spicyLevel}/3
- Diet: ${pref.dietType}
${remaining !== null ? `- Sisa budget makan bulan ini: Rp ${remaining.toLocaleString('id-ID')}` : ''}
${pref.avgMealBudget ? `- Budget per makan: Rp ${pref.avgMealBudget.toLocaleString('id-ID')}` : ''}

Response dalam JSON:
{
  "detectedIngredients": ["bahan1", "bahan2"],
  "recipes": [
    {
      "name": "Nama Resep",
      "cookTime": "15 menit",
      "difficulty": "Mudah",
      "estimatedCost": 15000,
      "calories": 350,
      "protein": 15,
      "carbs": 45,
      "fat": 10,
      "ingredients": ["bahan1 - jumlah", "bahan2 - jumlah"],
      "steps": ["Langkah 1", "Langkah 2"],
      "tags": ["hemat", "cepat"]
    }
  ]
}`;

    let result: string;
    try {
      result = await this.ai.generateText(prompt, {
        imageBase64,
        mimeType,
        responseMimeType: 'application/json',
      });
    } catch {
      return { detectedIngredients: [], recipes: [], error: 'AI tidak tersedia saat ini' };
    }

    let parsed: any;
    try {
      const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return { detectedIngredients: [], recipes: [], rawResponse: result };
    }

    // Save recommendation history (don't fail the response if this errors)
    try {
      if (parsed.recipes?.length) {
        await Promise.all(
          parsed.recipes.map((recipe: any) =>
            this.prisma.foodRecommendationHistory.create({
              data: {
                userId,
                recipeName: recipe.name,
                recipeData: JSON.stringify(recipe),
                sourceType: 'fridge',
                budget: remaining,
              },
            }),
          ),
        );
      }
    } catch (e) {
      this.logger.warn('Failed to save fridge history', e);
    }

    return parsed;
    }); // end aiJob.run
  }

  /**
   * Mode B: Foto menu restoran — parse item + filter
   */
  async recommendFromMenu(userId: string, imageBase64: string, mimeType: string, filter?: string) {
    return this.aiJob.runAsync(userId, 'food_from_menu', async () => {
    const pref = await this.getPreference(userId);

    const prompt = `Lihat foto menu ini. Pilih 3-5 menu TERBAIK sesuai filter "${filter || 'hemat'}".

User: pedas ${pref.spicyLevel}/3, diet ${pref.dietType}${pref.avgMealBudget ? `, budget Rp${pref.avgMealBudget.toLocaleString('id-ID')}` : ''}
Bahan tidak disukai: ${pref.dislikedIngredients.join(', ') || 'tidak ada'}

JSON response:
{ "recommendations": [{ "name": "...", "price": number, "reason": "alasan singkat", "calories": number, "tags": ["hemat"] }] }`;

    let result: string;
    try {
      result = await this.ai.generateText(prompt, {
        imageBase64,
        mimeType,
        responseMimeType: 'application/json',
      });
    } catch {
      return { menuItems: [], recommendations: [], error: 'AI tidak tersedia saat ini' };
    }

    let parsed: any;
    try {
      const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return { menuItems: [], recommendations: [], rawResponse: result };
    }

    // Normalize: ensure arrays exist even if AI skipped them
    if (!Array.isArray(parsed.menuItems)) parsed.menuItems = [];
    if (!Array.isArray(parsed.recommendations)) parsed.recommendations = [];

    // Ensure each recommendation has required fields
    parsed.recommendations = parsed.recommendations
      .filter((r: any) => r && r.name)
      .map((r: any) => ({
        name: r.name,
        price: r.price ?? 0,
        reason: r.reason || 'Rekomendasi AI',
        tags: Array.isArray(r.tags) ? r.tags : [],
      }));

    // Ensure each menuItem has required fields
    parsed.menuItems = parsed.menuItems
      .filter((m: any) => m && m.name)
      .map((m: any) => ({
        name: m.name,
        price: m.price ?? 0,
        description: m.description || '',
      }));

    // Save recommendation history (don't fail the response if this errors)
    try {
      if (parsed.recommendations?.length) {
        await Promise.all(
          parsed.recommendations.map((rec: any) =>
            this.prisma.foodRecommendationHistory.create({
              data: {
                userId,
                recipeName: rec.name,
                recipeData: JSON.stringify(rec),
                sourceType: 'menu',
                budget: rec.price ?? null,
              },
            }),
          ),
        );
      }
    } catch (e) {
      this.logger.warn('Failed to save menu history', e);
    }

    return parsed;
    }); // end aiJob.run
  }

  // === Favorites ===

  async getFavorites(userId: string) {
    return this.prisma.foodFavorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addFavorite(userId: string, recipeName: string, recipeData: string) {
    return this.prisma.foodFavorite.create({
      data: { userId, recipeName, recipeData },
    });
  }

  async removeFavorite(userId: string, id: string) {
    const fav = await this.prisma.foodFavorite.findFirst({ where: { id, userId } });
    if (!fav) throw new NotFoundException('Favorite tidak ditemukan');
    await this.prisma.foodFavorite.delete({ where: { id } });
    return { success: true };
  }

  // === History ===

  async getHistory(userId: string, limit = 10) {
    return this.prisma.foodRecommendationHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // === Text-based ingredient mode ===

  async recommendFromText(userId: string, ingredients: string[]) {
    return this.aiJob.runAsync(userId, 'food_from_text', async () => {
      const pref = await this.getPreference(userId);
      const budgetInfo = await this.getRemainingFoodBudget(userId);
      const remaining = budgetInfo.remaining;

      const prompt = `Kamu adalah asisten masak untuk anak muda Indonesia.

User punya bahan-bahan berikut: ${ingredients.join(', ')}

Berikan 3 resep sederhana yang bisa dibuat dari bahan tersebut (boleh tambah bumbu dasar).

Preferensi user:
- Bahan tidak disukai: ${pref.dislikedIngredients.join(', ') || 'tidak ada'}
- Masakan favorit: ${pref.preferredCuisines.join(', ') || 'semua'}
- Level pedas: ${pref.spicyLevel}/3
- Diet: ${pref.dietType}
${remaining !== null ? `- Sisa budget makan bulan ini: Rp ${remaining.toLocaleString('id-ID')}` : ''}
${pref.avgMealBudget ? `- Budget per makan: Rp ${pref.avgMealBudget.toLocaleString('id-ID')}` : ''}

Response dalam JSON:
{
  "detectedIngredients": [${ingredients.map(i => `"${i}"`).join(', ')}],
  "recipes": [
    {
      "name": "Nama Resep",
      "cookTime": "15 menit",
      "difficulty": "Mudah",
      "estimatedCost": 15000,
      "calories": 350,
      "protein": 15,
      "carbs": 45,
      "fat": 10,
      "ingredients": ["bahan1 - jumlah", "bahan2 - jumlah"],
      "steps": ["Langkah 1", "Langkah 2"],
      "tags": ["hemat", "cepat"]
    }
  ]
}`;

      let result: string;
      try {
        result = await this.ai.generateText(prompt, { responseMimeType: 'application/json' });
      } catch {
        return { detectedIngredients: ingredients, recipes: [], error: 'AI tidak tersedia saat ini' };
      }

      let parsed: any;
      try {
        const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        return { detectedIngredients: ingredients, recipes: [], rawResponse: result };
      }

      // Save history
      try {
        if (parsed.recipes?.length) {
          await Promise.all(
            parsed.recipes.map((recipe: any) =>
              this.prisma.foodRecommendationHistory.create({
                data: {
                  userId,
                  recipeName: recipe.name,
                  recipeData: JSON.stringify(recipe),
                  sourceType: 'text',
                  budget: remaining,
                },
              }),
            ),
          );
        }
      } catch (e) {
        this.logger.warn('Failed to save text history', e);
      }

      return parsed;
    });
  }

  // === Rating ===

  async rateRecipe(userId: string, historyId: string, rating: number, feedback?: string) {
    const history = await this.prisma.foodRecommendationHistory.findFirst({
      where: { id: historyId, userId },
    });
    if (!history) throw new NotFoundException('Riwayat tidak ditemukan');

    return this.prisma.foodRating.upsert({
      where: { userId_historyId: { userId, historyId } },
      update: { rating, feedback },
      create: { userId, historyId, rating, feedback },
    });
  }

  async getMyRatings(userId: string) {
    return this.prisma.foodRating.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // === Weekly Meal Plan ===

  async generateMealPlan(userId: string, days = 7) {
    return this.aiJob.runAsync(userId, 'food_meal_plan', async () => {
      const pref = await this.getPreference(userId);
      const budgetInfo = await this.getRemainingFoodBudget(userId);
      const remaining = budgetInfo.remaining;
      const dailyBudget = pref.avgMealBudget || (remaining ? Math.round(remaining / days) : 25000);

      const prompt = `Kamu adalah perencana meal plan untuk anak muda Indonesia (mahasiswa/anak kos).

Buatkan meal plan ${days} hari (makan siang & makan malam). Setiap hari ada 2 meal.

Preferensi:
- Budget per hari: Rp ${dailyBudget.toLocaleString('id-ID')}
- Bahan tidak disukai: ${pref.dislikedIngredients.join(', ') || 'tidak ada'}
- Masakan favorit: ${pref.preferredCuisines.join(', ') || 'semua'}
- Level pedas: ${pref.spicyLevel}/3
- Diet: ${pref.dietType}
${remaining !== null ? `- Total sisa budget: Rp ${remaining.toLocaleString('id-ID')}` : ''}

PENTING: Variasikan menu (jangan ulang), perhatikan nutrisi seimbang, dan sesuaikan budget.

JSON response:
{
  "dailyBudget": ${dailyBudget},
  "totalEstimatedCost": number,
  "days": [
    {
      "day": 1,
      "meals": [
        {
          "type": "lunch",
          "name": "Nama Makanan",
          "estimatedCost": 12000,
          "calories": 400,
          "protein": 20,
          "carbs": 50,
          "fat": 12,
          "tags": ["homecook"],
          "note": "Tips singkat"
        },
        {
          "type": "dinner",
          "name": "Nama Makanan",
          "estimatedCost": 15000,
          "calories": 450,
          "protein": 25,
          "carbs": 40,
          "fat": 15,
          "tags": ["beli"],
          "note": "Tips singkat"
        }
      ]
    }
  ]
}`;

      let result: string;
      try {
        result = await this.ai.generateText(prompt, { responseMimeType: 'application/json' });
      } catch {
        return { days: [], error: 'AI tidak tersedia saat ini' };
      }

      let parsed: any;
      try {
        const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        return { days: [], rawResponse: result };
      }

      // Save to history
      try {
        await this.prisma.foodRecommendationHistory.create({
          data: {
            userId,
            recipeName: `Meal Plan ${days} Hari`,
            recipeData: JSON.stringify(parsed),
            sourceType: 'meal_plan',
            budget: remaining,
          },
        });
      } catch (e) {
        this.logger.warn('Failed to save meal plan history', e);
      }

      return parsed;
    });
  }
}

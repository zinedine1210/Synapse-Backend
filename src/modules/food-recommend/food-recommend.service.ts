import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { AiJobService } from '../ai-job/ai-job.service';
import { AiUsageService } from '../../common/services/ai-usage.service';

@Injectable()
export class FoodRecommendService {
  private readonly logger = new Logger(FoodRecommendService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly aiJob: AiJobService,
    private readonly aiUsage: AiUsageService,
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
    calorieLimit?: number;
    proteinTarget?: number;
    healthGoals?: string[];
    allergies?: string[];
    breakfastHabit?: string;
    lunchHabit?: string;
    dinnerHabit?: string;
    snackHabit?: string;
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
   * Build a compact preference context string for AI prompts
   */
  private buildPrefContext(pref: any, remaining: number | null): string {
    const lines: string[] = [];
    if (pref.dislikedIngredients?.length) lines.push(`Bahan tidak disukai: ${pref.dislikedIngredients.join(', ')}`);
    if (pref.allergies?.length) lines.push(`ALERGI (WAJIB dihindari): ${pref.allergies.join(', ')}`);
    if (pref.preferredCuisines?.length) lines.push(`Masakan favorit: ${pref.preferredCuisines.join(', ')}`);
    lines.push(`Level pedas: ${pref.spicyLevel}/3`);
    lines.push(`Diet: ${pref.dietType}`);
    if (pref.calorieLimit) lines.push(`Batas kalori harian: ${pref.calorieLimit} kkal`);
    if (pref.proteinTarget) lines.push(`Target protein harian: ${pref.proteinTarget}g`);
    if (pref.healthGoals?.length) lines.push(`Tujuan kesehatan: ${pref.healthGoals.join(', ')}`);
    if (remaining !== null) lines.push(`Sisa budget makan bulan ini: Rp ${remaining.toLocaleString('id-ID')}`);
    if (pref.avgMealBudget) lines.push(`Budget per makan: Rp ${pref.avgMealBudget.toLocaleString('id-ID')}`);
    return lines.join('\n- ');
  }

  /**
   * Build eating habits context for meal plan AI prompts
   */
  private buildHabitsContext(pref: any): string {
    const habits: string[] = [];
    if (pref.breakfastHabit) habits.push(`Sarapan biasa: ${pref.breakfastHabit}`);
    if (pref.lunchHabit) habits.push(`Makan siang biasa: ${pref.lunchHabit}`);
    if (pref.dinnerHabit) habits.push(`Makan malam biasa: ${pref.dinnerHabit}`);
    if (pref.snackHabit) habits.push(`Camilan biasa: ${pref.snackHabit}`);
    return habits.length > 0 ? habits.join('\n- ') : '';
  }

  /**
   * Mode A: Foto kulkas — extract bahan, generate resep
   */
  async recommendFromFridge(userId: string, imageBase64: string, mimeType: string) {
    await this.aiUsage.checkAndRecord(userId, 'food_recommend');
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

    const prompt = `Kamu adalah asisten masak & nutrisi untuk anak muda Indonesia.

Dari foto kulkas/bahan makanan ini, identifikasi semua bahan yang terlihat.
Lalu berikan 3 resep sederhana yang bisa dibuat anak muda.

Preferensi user:
- ${this.buildPrefContext(pref, remaining)}

PENTING:
- Perhatikan alergi dan bahan yang tidak disukai
- Jika user punya batas kalori, pastikan resep sesuai target
- Seimbangkan nutrisi (protein, karbo, lemak)

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
    await this.aiUsage.checkAndRecord(userId, 'food_recommend');
    return this.aiJob.runAsync(userId, 'food_from_menu', async () => {
    const pref = await this.getPreference(userId);

    const prompt = `Lihat foto menu ini. Pilih 3-5 menu TERBAIK sesuai filter "${filter || 'hemat'}".

User: pedas ${pref.spicyLevel}/3, diet ${pref.dietType}${pref.avgMealBudget ? `, budget Rp${pref.avgMealBudget.toLocaleString('id-ID')}` : ''}
Bahan tidak disukai: ${pref.dislikedIngredients.join(', ') || 'tidak ada'}
${pref.allergies?.length ? `ALERGI (WAJIB hindari): ${pref.allergies.join(', ')}` : ''}
${pref.calorieLimit ? `Batas kalori per makan: ~${Math.round(pref.calorieLimit / 3)} kkal` : ''}

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
    await this.aiUsage.checkAndRecord(userId, 'food_recommend');
    return this.aiJob.runAsync(userId, 'food_from_text', async () => {
      const pref = await this.getPreference(userId);
      const budgetInfo = await this.getRemainingFoodBudget(userId);
      const remaining = budgetInfo.remaining;

      const prompt = `Kamu adalah asisten masak & nutrisi untuk anak muda Indonesia.

User punya bahan-bahan berikut: ${ingredients.join(', ')}

Berikan 3 resep sederhana yang bisa dibuat dari bahan tersebut (boleh tambah bumbu dasar).

Preferensi user:
- ${this.buildPrefContext(pref, remaining)}

PENTING:
- Perhatikan alergi dan bahan yang tidak disukai
- Jika user punya batas kalori, pastikan resep sesuai target
- Seimbangkan nutrisi (protein, karbo, lemak)

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
    await this.aiUsage.checkAndRecord(userId, 'food_recommend');
    return this.aiJob.runAsync(userId, 'food_meal_plan', async () => {
      const pref = await this.getPreference(userId);
      const budgetInfo = await this.getRemainingFoodBudget(userId);
      const remaining = budgetInfo.remaining;
      const dailyBudget = pref.avgMealBudget || (remaining ? Math.round(remaining / days) : 25000);
      const habitsContext = this.buildHabitsContext(pref);

      const prompt = `Kamu adalah perencana meal plan & ahli nutrisi untuk anak muda Indonesia (mahasiswa/anak kos).

Buatkan meal plan ${days} hari (sarapan, makan siang, & makan malam). Setiap hari ada 3 meal.

PREFERENSI USER:
- Budget per hari: Rp ${dailyBudget.toLocaleString('id-ID')}
- ${this.buildPrefContext(pref, remaining)}
${habitsContext ? `\nKEBIASAAN MAKAN USER:\n- ${habitsContext}` : ''}

PANDUAN PENTING:
1. PAHAMI kebiasaan makan user sebelum merekomendasikan:
   - Jika user biasa makan nasi goreng tiap pagi, jangan langsung ganti semua — transisi perlahan
   - Berikan variasi dari makanan yang mirip tapi lebih sehat jika kebiasaannya kurang baik
   - Misal biasa makan mie instan → sarankan mie ayam homemade atau nasi + telur
2. Jika user punya BATAS KALORI, pastikan total harian tidak melebihi target
3. Jika user punya TARGET PROTEIN, pastikan setiap meal punya protein yang cukup
4. VARIASIKAN menu (jangan ulang), perhatikan nutrisi seimbang
5. Sertakan "healthNote" di setiap meal: tips singkat kenapa makanan ini baik atau alternatif yang lebih sehat
6. Jika kebiasaan makan user tidak sehat, berikan transisi bertahap, bukan perubahan drastis
7. Perhatikan alergi — WAJIB dihindari

JSON response:
{
  "dailyBudget": ${dailyBudget},
  "totalEstimatedCost": number,
  "dailyCalorieTarget": ${pref.calorieLimit || 2000},
  "days": [
    {
      "day": 1,
      "totalCalories": number,
      "meals": [
        {
          "type": "breakfast" | "lunch" | "dinner",
          "name": "Nama Makanan",
          "estimatedCost": 12000,
          "calories": 400,
          "protein": 20,
          "carbs": 50,
          "fat": 12,
          "tags": ["homecook", "high-protein"],
          "note": "Tips singkat",
          "healthNote": "Kenapa makanan ini baik / alternatif lebih sehat"
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

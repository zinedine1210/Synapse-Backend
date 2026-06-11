import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class FoodRecommendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
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
   * Mode A: Foto kulkas — extract bahan, generate resep
   */
  async recommendFromFridge(userId: string, imageBase64: string, mimeType: string) {
    const pref = await this.getPreference(userId);

    // Get remaining food budget
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [foodBudgets, foodTx] = await Promise.all([
      this.prisma.categoryBudget.findMany({
        where: { userId, category: 'Makanan', month: now.getMonth() + 1, year: now.getFullYear() },
      }),
      this.prisma.transaction.aggregate({
        where: { userId, type: 'expense', category: 'Makanan', date: { gte: monthStart } },
        _sum: { amount: true },
      }),
    ]);
    const foodBudget = foodBudgets[0]?.amount ?? 0;
    const foodSpent = foodTx._sum.amount ?? 0;
    const remaining = foodBudget > 0 ? foodBudget - foodSpent : null;

    const prompt = `Kamu adalah asisten masak untuk mahasiswa Indonesia.

Dari foto kulkas/bahan makanan ini, identifikasi semua bahan yang terlihat.
Lalu berikan 3 resep sederhana yang bisa dibuat mahasiswa.

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
      "ingredients": ["bahan1 - jumlah", "bahan2 - jumlah"],
      "steps": ["Langkah 1", "Langkah 2"],
      "tags": ["hemat", "cepat"]
    }
  ]
}`;

    const result = await this.ai.generateText(prompt, {
      imageBase64,
      mimeType,
    });

    try {
      const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return { detectedIngredients: [], recipes: [], rawResponse: result };
    }
  }

  /**
   * Mode B: Foto menu restoran — parse item + filter
   */
  async recommendFromMenu(userId: string, imageBase64: string, mimeType: string, filter?: string) {
    const pref = await this.getPreference(userId);

    const prompt = `Kamu adalah asisten makan hemat untuk mahasiswa Indonesia.

Dari foto menu restoran ini, baca semua item menu dan harganya.
Lalu rekomendasikan 3-5 pilihan terbaik berdasarkan filter.

Filter: ${filter || 'hemat'}
Preferensi user:
- Level pedas: ${pref.spicyLevel}/3
- Diet: ${pref.dietType}
${pref.avgMealBudget ? `- Budget per makan: Rp ${pref.avgMealBudget.toLocaleString('id-ID')}` : ''}

Response dalam JSON:
{
  "menuItems": [
    { "name": "Nasi Goreng", "price": 25000, "description": "..." }
  ],
  "recommendations": [
    {
      "name": "Nasi Goreng",
      "price": 25000,
      "reason": "Porsi besar, harga terjangkau",
      "tags": ["hemat", "mengenyangkan"]
    }
  ]
}`;

    const result = await this.ai.generateText(prompt, {
      imageBase64,
      mimeType,
    });

    try {
      const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return { menuItems: [], recommendations: [], rawResponse: result };
    }
  }
}

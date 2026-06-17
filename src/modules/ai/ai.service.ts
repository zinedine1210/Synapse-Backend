import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { optimizeImageForAI, optimizeImagesForAI } from '../../common/image-optimizer';

/**
 * AiService – Integrasi Google Gemini via REST API.
 * Menyediakan metode untuk merangkum materi, membuat kuis, dan menyelesaikan soal.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly apiKey: string;
  private readonly modelName: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GEMINI_API_KEY')!;
    this.modelName = this.configService.get<string>('GEMINI_MODEL') ?? 'gemini-1.5-flash';
  }

  private async callGemini(parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>, maxOutputTokens?: number, responseMimeType?: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent`;
    const body: any = {
      contents: [{ parts }],
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
      ],
    };
    if (maxOutputTokens || responseMimeType) {
      body.generationConfig = {};
      if (maxOutputTokens) body.generationConfig.maxOutputTokens = maxOutputTokens;
      if (responseMimeType) body.generationConfig.responseMimeType = responseMimeType;
    }

    const MAX_RETRIES = 1;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': this.apiKey,
          },
          body: JSON.stringify(body),
        });

        if (response.ok) {
          const data = await response.json();
          return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        }

        const errorBody = await response.text();
        this.logger.error(`Gemini API error ${response.status}: ${errorBody}`);

        // Retry on transient errors (429, 500, 503)
        if ([429, 500, 503].includes(response.status) && attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }

        throw new ServiceUnavailableException('Layanan AI sedang tidak tersedia. Coba lagi nanti.');
      } catch (error) {
        if (error instanceof ServiceUnavailableException) throw error;
        // Network error — retry once
        lastError = error as Error;
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
      }
    }

    this.logger.error(`Gemini API call failed after retries: ${lastError?.message}`);
    throw new ServiceUnavailableException('Layanan AI sedang tidak tersedia. Coba lagi nanti.');
  }

  /**
   * General-purpose text generation. Used by Phase 1 features (Si Bawel, Briefing, etc.)
   */
  async generateText(prompt: string, options?: { imageBase64?: string; mimeType?: string; maxResolution?: number; responseMimeType?: string }): Promise<string> {
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
    if (options?.imageBase64 && options?.mimeType) {
      const optimized = await optimizeImageForAI(options.imageBase64, options.mimeType, options.maxResolution);
      parts.push({ inlineData: { mimeType: optimized.mimeType, data: optimized.base64 } });
    }
    parts.push({ text: prompt });
    return this.callGemini(parts, undefined, options?.responseMimeType);
  }

  /**
   * Mendigitalisasi konten materi menjadi format Markdown yang terstruktur dan lengkap.
   * Tidak merangkum – mempertahankan semua informasi dari dokumen asli.
   * @param rawText – Teks yang diekstrak dari PDF/dokumen
   * @param images – Gambar-gambar yang diekstrak dari PDF
   */
  async summarizeMaterial(
    rawText: string,
    images?: { buffer: Buffer; mimeType: string; url: string }[],
  ): Promise<string> {
    this.logger.log('Memproses digitalisasi materi dengan Gemini...');

    let prompt = `
Kamu adalah asisten akademik yang membantu pengguna mendigitalisasi materi kuliah.
Ubah teks berikut menjadi dokumen digital dalam format Markdown yang terstruktur, lengkap, dan mudah diolah.

ATURAN PENTING:
- JANGAN merangkum atau menyingkat. Pertahankan SEMUA informasi yang ada di dokumen asli.
- Digitalisasi = susun ulang format agar lebih rapi dan mudah dibaca, bukan merangkum.
- HANYA gunakan informasi yang ADA di dalam teks. JANGAN menambahkan penjelasan dari luar.
- Pertahankan semua contoh, rumus, definisi, dan penjelasan detail dari dokumen asli.
`;

    const parts: any[] = [];

    if (images && images.length > 0) {
      // Optimize: compress + limit to 5 images max for token savings
      const optimizedImages = await optimizeImagesForAI(images, 5);
      
      prompt += `
- KAMI TELAH MENGEKSTRAK GAMBAR-GAMBAR DARI DOKUMEN INI.
- Di bawah ini adalah daftar Gambar yang diekstrak (diurutkan sesuai urutan kemunculannya):
${optimizedImages.map((img, idx) => `- Gambar ${idx + 1}: ${(img as any).url || `image-${idx + 1}`}`).join('\n')}

- TUGAS ANDA UNTUK GAMBAR:
  1. Lihat dan ANALISIS SECARA DETAIL setiap gambar yang disertakan dalam request ini.
  2. Untuk setiap gambar: DESKRIPSIKAN konten gambar secara lengkap dan detail (diagram, grafik, tabel, rumus, contoh soal, dll).
  3. Jika gambar berisi TABEL, transkripsi seluruh isi tabel ke format Markdown table.
  4. Jika gambar berisi DIAGRAM/GRAFIK, jelaskan komponen, alur, label, dan hubungan antar elemen secara lengkap.
  5. Jika gambar berisi RUMUS/FORMULA, tulis ulang rumus tersebut dalam format teks.
  6. Jika gambar berisi KODE PROGRAM, transkripsi kode tersebut ke dalam code block Markdown.
  7. Sisipkan gambar menggunakan tag: \`![Deskripsi singkat gambar](URL_GAMBAR)\`.
  8. Letakkan tag gambar DAN transkripsi/deskripsi detailnya di tempat yang paling relevan dalam dokumen.
  9. JANGAN pernah mengabaikan informasi dari gambar - semua konten visual HARUS dideskripsikan/ditranskripsikan.
`;
      
      // Add text part first
      parts.push({ text: '' }); // we'll populate this later
      
      // Add each optimized image part
      for (const img of optimizedImages) {
        parts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.buffer.toString('base64'),
          },
        });
      }
    } else {
      parts.push({ text: '' });
    }

    prompt += `
Format yang wajib digunakan:
- **Topik Utama**: heading H2 (##) untuk setiap topik/bab besar
- **Sub-topik**: heading H3 (###) untuk pembahasan di dalam topik
- **Konten lengkap**: paragraf penjelasan lengkap, bukan ringkasan
- **Daftar & poin**: gunakan bullet/numbered list untuk enumerasi
- **Istilah penting**: cetak tebal (**istilah**) untuk definisi dan konsep kunci
- **Rumus/formula**: tampilkan persis seperti aslinya
- **Contoh soal**: pertahankan lengkap dengan penyelesaiannya

Teks materi:
---
${rawText.slice(0, 30000)} 
---

Hasilkan dalam Bahasa Indonesia. Digitalkan SELURUH konten, jangan disingkat.
`;

    // Set the prompt text as the first part
    parts[0].text = prompt;

    try {
      const summary = await this.callGemini(parts);
      this.logger.log('Digitalisasi materi berhasil');
      return summary;
    } catch (error) {
      this.logger.error('Gagal mendigitalisasi materi:', error);
      throw new ServiceUnavailableException('Gagal memproses digitalisasi AI. Coba lagi nanti.');
    }
  }

  /**
   * Membuat soal kuis pilihan ganda dari rangkuman materi.
   * @param summary – Teks rangkuman materi
   * @param count – Jumlah soal yang dibuat (default: 10)
   * @returns Array soal dalam format JSON string
   */
  async generateQuizQuestions(summary: string, count: number = 10): Promise<string> {
    this.logger.log(`Membuat ${count} soal kuis dengan Gemini...`);

    const prompt = `
Berdasarkan rangkuman materi berikut, buatlah ${count} soal kuis pilihan ganda.

Kembalikan HANYA array JSON valid (tanpa markdown code block) dengan format berikut:
[
  {
    "question": "Pertanyaan di sini?",
    "options": ["A. Pilihan A", "B. Pilihan B", "C. Pilihan C", "D. Pilihan D"],
    "answerKey": "A",
    "explanation": "Penjelasan singkat mengapa A benar."
  }
]

Materi:
---
${summary.slice(0, 15000)}
---
    `.trim();

    try {
      const jsonText = await this.callGemini([{ text: prompt }]);
      const cleanedJson = this.extractJson(jsonText);
      // Validasi bahwa output adalah JSON yang valid
      JSON.parse(cleanedJson);
      return cleanedJson;
    } catch (error) {
      this.logger.error('Gagal membuat soal kuis:', error);
      throw new ServiceUnavailableException('Gagal membuat soal kuis AI. Coba lagi nanti.');
    }
  }

  /**
   * Menyelesaikan/menjawab pertanyaan ujian berdasarkan konteks materi.
   * Two-pass: cek materi dulu, jika tidak cukup gunakan pengetahuan global.
   * @param question – Pertanyaan yang ingin dijawab
   * @param context – Konteks materi yang relevan
   */
  async solveQuestion(question: string, context?: string): Promise<string> {
    this.logger.log('Menyelesaikan soal dengan Gemini...');

    const prompt = `
Kamu adalah asisten belajar cerdas untuk anak muda.

${context ? `LANGKAH 1: Cari jawaban dari materi kuliah berikut:\n---\n${context.slice(0, 6000)}\n---\n\nLANGKAH 2: Jika jawabannya TIDAK ditemukan atau TIDAK lengkap dari materi di atas, gunakan pengetahuan umummu untuk melengkapi dan menjawab dengan lengkap. Jangan pernah bilang "tidak ada dalam materi" tanpa tetap memberikan jawaban.` : 'Gunakan pengetahuan umummu untuk menjawab pertanyaan berikut dengan lengkap.'}

Pertanyaan:
<user_input>
${question}
</user_input>

ATURAN:
- SELALU berikan jawaban, jangan pernah bilang "tidak bisa menjawab"
- Jika pilihan ganda: tentukan jawaban yang benar beserta penjelasan
- Jika essay: berikan jawaban lengkap dan terstruktur
- Format jawaban dalam Markdown yang rapi (gunakan ##, ###, -, **bold**)
- Gunakan Bahasa Indonesia
    `.trim();

    try {
      return await this.callGemini([{ text: prompt }]);
    } catch (error) {
      this.logger.error('Gagal menjawab pertanyaan:', error);
      throw new ServiceUnavailableException('Gagal memproses pertanyaan AI. Coba lagi nanti.');
    }
  }

  /**
   * Mengurai gambar jadwal kuliah menggunakan Gemini 1.5 Flash multimodal.
   */
  async parseSchedule(file: Express.Multer.File): Promise<any> {
    this.logger.log('Mengurai gambar jadwal kuliah dengan Gemini...');

    const prompt = `
Analisis gambar jadwal kuliah berikut. Ekstrak seluruh mata kuliah yang tertera ke dalam format JSON array. 
Pastikan mengembalikan HANYA array JSON valid (tanpa markdown code block, tanpa teks pembuka/penutup) dengan struktur objek seperti berikut:
[
  {
    "courseName": "Nama Matakuliah",
    "day": "Hari",
    "time": "Jam (contoh: 19:00 - 21:30)",
    "room": "Ruangan (jika ada)",
    "lecturer": "Nama Dosen (jika ada)"
  }
]

Jika ada kolom/hari yang kosong atau bukan jadwal kuliah, abaikan.
    `.trim();

    try {
      const optimized = await optimizeImageForAI(file.buffer, file.mimetype);
      const imagePart = {
        inlineData: {
          data: optimized.base64,
          mimeType: optimized.mimeType,
        }, 
      };

      const jsonText = await this.callGemini([{ text: prompt }, imagePart], 2048);
      const cleanedJson = this.extractJson(jsonText);
      return JSON.parse(cleanedJson);
    } catch (error) {
      this.logger.error('Gagal mengurai jadwal kuliah:', error);
      throw new ServiceUnavailableException('Gagal memproses gambar jadwal AI. Pastikan format gambar jelas.');
    }
  }

  /** Helper untuk mengekstrak JSON valid dari output teks Gemini */
  private extractJson(text: string): string {
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      return text.substring(firstBracket, lastBracket + 1);
    }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return text.substring(firstBrace, lastBrace + 1);
    }
    return text.trim();
  }

  /**
   * Menghasilkan soal prediksi ujian berdasarkan konteks materi.
   */
  async generateExamPrediction(
    materialsContext: string,
    type: 'ESSAY' | 'MULTIPLE_CHOICE' | 'MIXED',
    countPG: number,
    countEssay: number,
  ): Promise<any[]> {
    this.logger.log('Generating exam prediction from materials...');
    const prompt = `
Berdasarkan materi kuliah berikut, buatlah soal prediksi ujian.
Tipe ujian yang diinginkan: ${type}
Jumlah soal Pilihan Ganda (PG) yang diinginkan: ${countPG}
Jumlah soal Essay yang diinginkan: ${countEssay}

Kembalikan HANYA array JSON valid (tanpa markdown code block) dengan format berikut:
[
  {
    "type": "MULTIPLE_CHOICE" atau "ESSAY",
    "question": "Teks soal...",
    "options": ["A. ...", "B. ...", "C. ...", "D. ..."] (null jika tipe ESSAY),
    "answerKey": "Kunci jawaban / Jawaban acuan...",
    "explanation": "Penjelasan detail kenapa jawaban tersebut benar"
  }
]

Materi:
---
${materialsContext.slice(0, 20000)}
---
    `.trim();

    try {
      const jsonText = await this.callGemini([{ text: prompt }]);
      const cleanedJson = this.extractJson(jsonText);
      return JSON.parse(cleanedJson);
    } catch (error) {
      this.logger.error('Gagal generate prediksi ujian:', error);
      throw new ServiceUnavailableException('Gagal generate prediksi ujian AI.');
    }
  }

  /**
   * Ekstrak soal-soal ujian dari foto kisi-kisi atau lembar soal.
   */
  async extractExamFromImage(base64: string, mimeType: string): Promise<any[]> {
    this.logger.log('Extracting exam questions from image...');
    const prompt = `
Analisis gambar kisi-kisi atau soal ujian berikut. Ekstrak semua pertanyaan yang ada ke dalam format JSON array.
Kembalikan HANYA array JSON valid (tanpa markdown code block) dengan format berikut:
[
  {
    "type": "MULTIPLE_CHOICE" atau "ESSAY",
    "question": "Teks soal...",
    "options": ["A. ...", "B. ..."] (null jika tipe ESSAY),
    "answerKey": "Kunci jawaban / jawaban acuan (jika tertera di gambar atau simpulkan sendiri)",
    "explanation": "Penjelasan/pembahasan soal"
  }
]
    `.trim();

    const optimized = await optimizeImageForAI(base64, mimeType);
    const imagePart = {
      inlineData: {
        data: optimized.base64,
        mimeType: optimized.mimeType,
      },
    };

    try {
      const jsonText = await this.callGemini([{ text: prompt }, imagePart]);
      const cleanedJson = this.extractJson(jsonText);
      return JSON.parse(cleanedJson);
    } catch (error) {
      this.logger.error('Gagal ekstrak soal dari gambar:', error);
      throw new ServiceUnavailableException('Gagal mengekstrak soal dari gambar.');
    }
  }

  /**
   * Menyelesaikan soal secara terpisah per section.
   * Dibatasi maksimal 10 soal per request untuk mencegah abuse token AI.
   */
  async solveMultiSection(questions: string[], context?: string): Promise<any[]> {
    const MAX_QUESTIONS = 10;
    const limitedQuestions = questions.slice(0, MAX_QUESTIONS);
    this.logger.log(`Solving ${limitedQuestions.length} of ${questions.length} questions in multi-section (max ${MAX_QUESTIONS})...`);
    const results: any[] = [];

    // Kita panggil satu per satu agar hasilnya maksimal dan terfokus
    for (const q of limitedQuestions) {
      if (!q.trim()) continue;
      const answer = await this.solveQuestion(q, context);
      results.push({
        question: q,
        answer,
      });
    }

    return results;
  }

  /**
   * Mengekstrak dan memisahkan nomor-nomor soal dari foto lembar soal.
   */
  async extractQuestionsFromImage(base64: string, mimeType: string): Promise<string[]> {
    this.logger.log('Extracting and splitting questions from image...');
    const prompt = `
Analisis gambar berikut yang berisi satu atau beberapa pertanyaan tugas/ujian.
Ekstrak semua pertanyaan yang tertulis di gambar dan pisahkan per nomor soal.
Kembalikan HANYA array JSON berupa string pertanyaan:
[
  "Pertanyaan nomor 1...",
  "Pertanyaan nomor 2..."
]
    `.trim();

    const optimized = await optimizeImageForAI(base64, mimeType);
    const imagePart = {
      inlineData: {
        data: optimized.base64,
        mimeType: optimized.mimeType,
      },
    };

    try {
      const jsonText = await this.callGemini([{ text: prompt }, imagePart], 2048);
      const cleanedJson = this.extractJson(jsonText);
      return JSON.parse(cleanedJson);
    } catch (error) {
      this.logger.error('Gagal mengekstrak nomor soal dari gambar:', error);
      throw new ServiceUnavailableException('Gagal memproses gambar soal.');
    }
  }

  /**
   * Ekstrak data kelas/matakuliah dari foto KRS.
   */
  async extractClassFromKRSImage(base64: string, mimeType: string): Promise<any> {
    this.logger.log('Extracting class info from KRS image...');
    const prompt = `
Analisis gambar KRS / Jadwal Kuliah berikut. Cari salah satu mata kuliah (atau jika ada banyak, ambil yang paling utama/pertama) dan ekstrak informasinya.
Kembalikan HANYA objek JSON valid dengan struktur berikut:
{
  "name": "Nama Mata Kuliah",
  "description": "Deskripsi singkat matakuliah (buat sendiri secara akademis jika tidak tertulis)",
  "lecturer": "Nama Dosen Pengajar",
  "day": "Hari (Senin/Selasa/Rabu/Kamis/Jumat/Sabtu/Minggu)",
  "time": "Jam Kuliah (contoh: 08:00 - 10:30)",
  "room": "Nama Ruangan Kelas"
}
    `.trim();

    const imagePart = {
      inlineData: {
        data: base64,
        mimeType: mimeType,
      },
    };

    try {
      const jsonText = await this.callGemini([{ text: prompt }, imagePart]);
      const cleanedJson = this.extractJson(jsonText);
      return JSON.parse(cleanedJson);
    } catch (error) {
      this.logger.error('Gagal ekstrak KRS:', error);
      throw new ServiceUnavailableException('Gagal mengekstrak KRS/jadwal dari gambar.');
    }
  }

  /**
   * Parse schedule from base64 string
   */
  async parseScheduleBase64(base64: string, mimeType: string): Promise<any[]> {
    this.logger.log('Parsing schedule from base64 image...');
    const prompt = `
Analisis gambar jadwal kuliah berikut. Ekstrak seluruh mata kuliah yang tertera ke dalam format JSON array. 
Pastikan mengembalikan HANYA array JSON valid dengan struktur objek seperti berikut:
[
  {
    "courseName": "Nama Matakuliah",
    "day": "Hari",
    "time": "Jam (contoh: 19:00 - 21:30)",
    "room": "Ruangan (jika ada)",
    "lecturer": "Nama Dosen (jika ada)"
  }
]
    `.trim();

    const imagePart = {
      inlineData: {
        data: base64,
        mimeType: mimeType,
      },
    };

    try {
      const jsonText = await this.callGemini([{ text: prompt }, imagePart]);
      const cleanedJson = this.extractJson(jsonText);
      return JSON.parse(cleanedJson);
    } catch (error) {
      this.logger.error('Gagal parse schedule base64:', error);
      throw new ServiceUnavailableException('Gagal memproses gambar jadwal.');
    }
  }

  /**
   * OCR Umum untuk mengekstrak teks dari gambar apa pun.
   */
  async ocrImage(base64: string, mimeType: string): Promise<string> {
    this.logger.log('Performing general OCR on image...');
    const prompt = `
Analisis gambar berikut dan lakukan OCR. Ekstrak seluruh teks penting yang ada dalam gambar dan susun kembali ke dalam format Markdown yang rapi dan mudah dibaca.
Jangan tambahkan komentar pembuka/penutup, kembalikan langsung teks hasil ekstraksi.
    `.trim();

    const imagePart = {
      inlineData: {
        data: base64,
        mimeType: mimeType,
      },
    };

    try {
      return await this.callGemini([{ text: prompt }, imagePart]);
    } catch (error) {
      this.logger.error('Gagal OCR gambar:', error);
      throw new ServiceUnavailableException('Gagal mengekstrak teks dari gambar.');
    }
  }
}

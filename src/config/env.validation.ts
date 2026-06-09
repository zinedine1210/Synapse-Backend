import { z } from 'zod';

/**
 * Skema validasi environment variables menggunakan Zod.
 * Jika ada variabel yang kosong/tidak valid, NestJS akan CRASH LOUDLY
 * saat startup dengan pesan error yang jelas di terminal.
 */
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL wajib diisi!'),

  // Supabase
  SUPABASE_URL: z.string().url('SUPABASE_URL harus berupa URL yang valid!'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY wajib diisi!'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY wajib diisi!'),
  SUPABASE_JWT_SECRET: z.string().min(1, 'SUPABASE_JWT_SECRET wajib diisi!'),

  // Gemini AI
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY wajib diisi!'),
  GEMINI_MODEL: z.string().default('gemini-1.5-flash'),

  // Midtrans
  MIDTRANS_SERVER_KEY: z.string().min(1, 'MIDTRANS_SERVER_KEY wajib diisi!'),
  MIDTRANS_CLIENT_KEY: z.string().min(1, 'MIDTRANS_CLIENT_KEY wajib diisi!'),
  MIDTRANS_IS_PRODUCTION: z.enum(['true', 'false']).default('false'),

  // App
  APP_PORT: z.string().default('3001'),
  APP_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // Rate Limiting
  THROTTLE_TTL: z.string().default('60'),
  THROTTLE_LIMIT: z.string().default('30'),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Fungsi validasi ini dipanggil oleh ConfigModule saat NestJS startup.
 * Jika gagal, server tidak akan menyala dan menampilkan error yang jelas.
 */
export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  ❌ ${e.path.join('.')}: ${e.message}`)
      .join('\n');

    console.error('\n');
    console.error('╔══════════════════════════════════════════════════════════╗');
    console.error('║      FATAL ERROR: Environment Variables Invalid!         ║');
    console.error('╠══════════════════════════════════════════════════════════╣');
    console.error('║  Server Synapse tidak dapat menyala karena konfigurasi   ║');
    console.error('║  .env tidak lengkap. Salin .env.example menjadi .env     ║');
    console.error('║  dan isi semua nilai yang diperlukan.                    ║');
    console.error('╚══════════════════════════════════════════════════════════╝');
    console.error('\nVariabel yang bermasalah:');
    console.error(errors);
    console.error('\n');

    process.exit(1);
  }

  return result.data;
}

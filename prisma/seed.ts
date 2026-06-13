import { PrismaClient, Role, ForumCategory } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// Helper to generate UUIDs with pattern
const uid = (prefix: string, n: number) => `${prefix}-0000-0000-0000-${String(n).padStart(12, '0')}`;

async function main() {
  console.log('🌱 Seeding database Synapse...');

  // ─── 1. Konfigurasi Kuota Plan ───────────────────────────────────────────
  const FREE_FEATURES = [
    // Akademik & Kelas (basic)
    'class', 'class_sessions', 'forum', 'forum_discussion', 'task', 'unread_tracking',
    // AI & Dokumen (basic)
    'pdf_export',
    // Keuangan (basic)
    'duit_tracker',
    // Produktivitas (basic)
    'todo_list', 'todo_categories', 'qna_public',
    // Gamifikasi & UX (basic)
    'gamification', 'notification', 'quick_action',
  ];

  const PRO_FEATURES = [
    // Akademik & Kelas (full)
    'class', 'class_settings', 'class_sessions', 'class_custom_tabs',
    'forum', 'forum_announcement', 'forum_poll', 'forum_reminder', 'forum_file_upload', 'forum_discussion',
    'quiz', 'task', 'task_ai_solver', 'task_image_ocr',
    'kolektif', 'group',
    'exam_prediction', 'exam_manual', 'exam_kisi_kisi',
    'canvas', 'unread_tracking',
    // AI & Dokumen (full)
    'ai_digitalization', 'schedule_parser', 'pdf_export', 'ai_insight', 'daily_briefing', 'ai_briefing_tips',
    // Keuangan (full)
    'duit_tracker', 'duit_tracker_budget', 'duit_tracker_saving_tree', 'duit_tracker_summary', 'duit_tracker_quick_input',
    'si_bawel', 'split_bill', 'receipt_scanner',
    // Produktivitas (full)
    'todo_list', 'todo_calendar', 'todo_timeline', 'todo_categories', 'todo_subtasks', 'todo_recurring',
    'qna_public', 'qna_voting', 'qna_ai_answer',
    'food_recommend',
    // Gamifikasi & UX (full)
    'gamification', 'gamification_streak', 'gamification_leaderboard',
    'notification', 'command_palette', 'quick_action',
    // Profil & Personalisasi
    'profile_ai_context', 'profile_avatar',
    'dashboard_class_comparison', 'dashboard_trending_qna',
  ];

  await prisma.pricingPlan.upsert({
    where: { name: 'FREE' },
    update: { features: FREE_FEATURES },
    create: {
      name: 'FREE',
      description: 'Paket gratis untuk mencoba asisten AI kuliah',
      maxUploadPerMonth: 5,
      maxFileSizeMb: 10,
      aiRequestLimit: 10,
      aiBriefingLimit: 1,
      aiWeeklyRoastLimit: 1,
      features: FREE_FEATURES,
      price: 0,
    },
  });

  await prisma.pricingPlan.upsert({
    where: { name: 'PRO' },
    update: { features: PRO_FEATURES },
    create: {
      name: 'PRO',
      description: 'Paket lengkap untuk produktivitas belajar maksimal',
      maxUploadPerMonth: 50,
      maxFileSizeMb: 25,
      aiRequestLimit: 200,
      aiBriefingLimit: 5,
      aiWeeklyRoastLimit: 3,
      features: PRO_FEATURES,
      price: 49000,
    },
  });

  console.log('✅  PricingPlan seeded (FREE & PRO)');

  // ─── 2. Akun SUPERADMIN Awal ─────────────────────────────────────────────
  await prisma.user.deleteMany({
    where: { email: 'zinedine.superadmin@gmail.com' },
  });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let superadminId = '00000000-0000-0000-0000-000000000001';

  if (supabaseUrl && supabaseServiceKey) {
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    console.log('🔄 Menghubungkan ke Supabase Auth untuk membuat akun superadmin...');
    
    const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) {
      console.warn('⚠️ Gagal mengambil list user dari Supabase:', listError.message);
    } else {
      const existingUser = listData.users.find((u: any) => u.email === 'zinedine.superadmin@gmail.com');
      if (existingUser) {
        console.log('✅ Akun superadmin sudah ada di Supabase Auth.');
        superadminId = existingUser.id;
      } else {
        const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: 'zinedine.superadmin@gmail.com',
          password: 'Admin123##',
          email_confirm: true,
          user_metadata: { full_name: 'Zinedine Superadmin' }
        });

        if (createError) {
          console.error('❌ Gagal membuat user superadmin di Supabase:', createError.message);
        } else if (createData.user) {
          console.log('✅ Akun superadmin berhasil dibuat di Supabase Auth!');
          superadminId = createData.user.id;
        }
      }
    }
  } else {
    console.warn('⚠️ SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY kosong di .env. Seeding superadmin menggunakan ID default.');
  }

  await prisma.user.upsert({
    where: { id: superadminId },
    update: {
      email: 'zinedine.superadmin@gmail.com',
      fullName: 'Zinedine Superadmin',
      role: Role.SUPERADMIN,
      plan: 'PRO',
    },
    create: {
      id: superadminId,
      email: 'zinedine.superadmin@gmail.com',
      fullName: 'Zinedine Superadmin',
      role: Role.SUPERADMIN,
      plan: 'PRO',
    },
  });

  console.log('✅  Superadmin user seeded');

  // ─── 3. Dummy Data ──────────────────────────────────────────────────────
  if (process.env.APP_ENV === 'development') {
    console.log('🔧 Seeding dummy data for development...');

    // ── USERS ──
    const userDefs = [
      { id: uid('user0001', 1), email: 'budi@demo.com', fullName: 'Budi Santoso', plan: 'PRO' },
      { id: uid('user0002', 2), email: 'siti@demo.com', fullName: 'Siti Nurhaliza', plan: 'PRO' },
      { id: uid('user0003', 3), email: 'ahmad@demo.com', fullName: 'Ahmad Fauzi', plan: 'FREE' },
      { id: uid('user0004', 4), email: 'dewi@demo.com', fullName: 'Dewi Lestari', plan: 'PRO' },
      { id: uid('user0005', 5), email: 'rudi@demo.com', fullName: 'Rudi Hartono', plan: 'FREE' },
      { id: uid('user0006', 6), email: 'nina@demo.com', fullName: 'Nina Agustina', plan: 'PRO' },
      { id: uid('user0007', 7), email: 'eko@demo.com', fullName: 'Eko Prasetyo', plan: 'FREE' },
      { id: uid('user0008', 8), email: 'maya@demo.com', fullName: 'Maya Sari', plan: 'PRO' },
      { id: uid('user0009', 9), email: 'doni@demo.com', fullName: 'Doni Wijaya', plan: 'FREE' },
      { id: uid('user0010', 10), email: 'ratna@demo.com', fullName: 'Ratna Dewi', plan: 'PRO' },
    ];

    for (const u of userDefs) {
      await prisma.user.upsert({
        where: { id: u.id },
        update: {},
        create: { ...u, role: Role.USER },
      });
    }
    console.log(`  ✅ ${userDefs.length} demo users seeded`);

    // ── CLASSES ──
    const classDefs = [
      { id: uid('class001', 1), name: 'Pemrograman Web Lanjut', description: 'Belajar Next.js, React, dan NestJS', ownerId: userDefs[0].id, lecturer: 'Prof. Dr. Andi Wijaya, M.T.', day: 'Senin', time: '08:00 - 10:30', room: 'Lab Komputer 301', code: 'PWL2025' },
      { id: uid('class002', 2), name: 'Basis Data Terdistribusi', description: 'PostgreSQL, MongoDB, dan sistem terdistribusi', ownerId: userDefs[1].id, lecturer: 'Dr. Maria Tan, M.Cs.', day: 'Selasa', time: '10:00 - 12:30', room: 'R. 202', code: 'BDT2025' },
      { id: uid('class003', 3), name: 'Kecerdasan Buatan', description: 'Machine Learning, Deep Learning, dan NLP', ownerId: userDefs[0].id, lecturer: 'Prof. Surya Atmaja, Ph.D.', day: 'Rabu', time: '13:00 - 15:30', room: 'R. 405', code: 'AI2025', joinMode: 'APPROVAL' },
      { id: uid('class004', 4), name: 'Jaringan Komputer', description: 'TCP/IP, routing, switching, dan network security', ownerId: userDefs[3].id, lecturer: 'Ir. Bambang Sutrisno, M.Kom.', day: 'Kamis', time: '08:00 - 10:30', room: 'Lab Jaringan 102', code: 'JK2025' },
      { id: uid('class005', 5), name: 'Rekayasa Perangkat Lunak', description: 'Agile, Scrum, design patterns, dan CI/CD', ownerId: userDefs[1].id, lecturer: 'Dr. Lina Setiawan, M.T.', day: 'Jumat', time: '10:00 - 12:30', room: 'R. 303', code: 'RPL2025', autoRoleAssign: true },
    ];

    for (const c of classDefs) {
      await prisma.class.upsert({
        where: { id: c.id },
        update: {},
        create: c,
      });
    }
    console.log(`  ✅ ${classDefs.length} classes seeded`);

    // ── ALL_PERMISSIONS (for admin role) ──
    const ALL_PERMISSIONS = [
      'MANAGE_CLASS', 'MANAGE_MEMBERS', 'MANAGE_ROLES', 'MANAGE_SESSIONS',
      'MATERIAL_UPLOAD', 'MATERIAL_DELETE', 'TASK_CREATE', 'TASK_EDIT',
      'FORUM_DISCUSSION', 'FORUM_ANNOUNCEMENT', 'FORUM_REMINDER', 'FORUM_POLL',
      'FORUM_PIN', 'FORUM_DELETE', 'KAS_CREATE', 'KAS_TRANSACTION',
      'GROUP_MANAGE', 'QUIZ_MANAGE', 'PREDICTION_MANAGE',
    ];

    // ── CLASS ROLES ──
    for (const c of classDefs) {
      const adminRole = await prisma.classRole.upsert({
        where: { classId_name: { classId: c.id, name: 'Admin' } },
        update: {},
        create: { classId: c.id, name: 'Admin', permissions: ALL_PERMISSIONS, isDefault: true },
      });

      // Assign owner as member + admin role
      await prisma.classMember.upsert({
        where: { classId_userId: { classId: c.id, userId: c.ownerId } },
        update: { classRoleId: adminRole.id },
        create: { classId: c.id, userId: c.ownerId, role: 'OWNER', classRoleId: adminRole.id },
      });

      // Additional roles for first class
      if (c.id === classDefs[0].id) {
        await prisma.classRole.upsert({
          where: { classId_name: { classId: c.id, name: 'Sekretaris' } },
          update: {},
          create: { classId: c.id, name: 'Sekretaris', permissions: ['MANAGE_SESSIONS', 'MATERIAL_UPLOAD', 'FORUM_ANNOUNCEMENT'] },
        });
        await prisma.classRole.upsert({
          where: { classId_name: { classId: c.id, name: 'Bendahara' } },
          update: {},
          create: { classId: c.id, name: 'Bendahara', permissions: ['KAS_CREATE', 'KAS_TRANSACTION'] },
        });
      }
    }
    console.log('  ✅ Class roles seeded');

    // ── CLASS MEMBERS (spread users across classes) ──
    const memberAssignments: { classId: string; userId: string; role: string }[] = [
      // Class 1: Pemrograman Web (owner: budi) — 8 members
      { classId: classDefs[0].id, userId: userDefs[1].id, role: 'MEMBER' },
      { classId: classDefs[0].id, userId: userDefs[2].id, role: 'MEMBER' },
      { classId: classDefs[0].id, userId: userDefs[3].id, role: 'MEMBER' },
      { classId: classDefs[0].id, userId: userDefs[4].id, role: 'MEMBER' },
      { classId: classDefs[0].id, userId: userDefs[5].id, role: 'MEMBER' },
      { classId: classDefs[0].id, userId: userDefs[6].id, role: 'MEMBER' },
      { classId: classDefs[0].id, userId: userDefs[7].id, role: 'MEMBER' },
      // Class 2: Basis Data (owner: siti) — 6 members
      { classId: classDefs[1].id, userId: userDefs[0].id, role: 'MEMBER' },
      { classId: classDefs[1].id, userId: userDefs[2].id, role: 'MEMBER' },
      { classId: classDefs[1].id, userId: userDefs[4].id, role: 'MEMBER' },
      { classId: classDefs[1].id, userId: userDefs[6].id, role: 'MEMBER' },
      { classId: classDefs[1].id, userId: userDefs[8].id, role: 'MEMBER' },
      // Class 3: AI (owner: budi) — 5 members
      { classId: classDefs[2].id, userId: userDefs[1].id, role: 'MEMBER' },
      { classId: classDefs[2].id, userId: userDefs[3].id, role: 'MEMBER' },
      { classId: classDefs[2].id, userId: userDefs[5].id, role: 'MEMBER' },
      { classId: classDefs[2].id, userId: userDefs[7].id, role: 'MEMBER' },
      // Class 3: pending members (APPROVAL mode)
      { classId: classDefs[2].id, userId: userDefs[8].id, role: 'MEMBER' }, // will be set PENDING
      { classId: classDefs[2].id, userId: userDefs[9].id, role: 'MEMBER' }, // will be set PENDING
      // Class 4: Jaringan (owner: dewi) — 7 members
      { classId: classDefs[3].id, userId: userDefs[0].id, role: 'MEMBER' },
      { classId: classDefs[3].id, userId: userDefs[1].id, role: 'MEMBER' },
      { classId: classDefs[3].id, userId: userDefs[2].id, role: 'MEMBER' },
      { classId: classDefs[3].id, userId: userDefs[4].id, role: 'MEMBER' },
      { classId: classDefs[3].id, userId: userDefs[6].id, role: 'MEMBER' },
      { classId: classDefs[3].id, userId: userDefs[8].id, role: 'MEMBER' },
      // Class 5: RPL (owner: siti) — 5 members
      { classId: classDefs[4].id, userId: userDefs[0].id, role: 'MEMBER' },
      { classId: classDefs[4].id, userId: userDefs[3].id, role: 'MEMBER' },
      { classId: classDefs[4].id, userId: userDefs[5].id, role: 'MEMBER' },
      { classId: classDefs[4].id, userId: userDefs[7].id, role: 'MEMBER' },
    ];

    for (const m of memberAssignments) {
      const isPending = classDefs[2].id === m.classId && [userDefs[8].id, userDefs[9].id].includes(m.userId);
      await prisma.classMember.upsert({
        where: { classId_userId: { classId: m.classId, userId: m.userId } },
        update: {},
        create: { ...m, status: isPending ? 'PENDING' : 'ACTIVE' },
      });
    }
    console.log(`  ✅ ${memberAssignments.length} class memberships seeded`);

    // ── SESSIONS (each class gets 8 sessions with proper titles) ──
    const sessionTitles: Record<string, string[]> = {
      [classDefs[0].id]: [
        'Pengenalan Full-Stack Development', 'React Fundamentals & JSX', 'State Management & Hooks',
        'Next.js App Router', 'API Routes & Data Fetching', 'Authentication & Authorization',
        'Database & Prisma ORM', 'Deployment & CI/CD',
      ],
      [classDefs[1].id]: [
        'Pengantar Basis Data Terdistribusi', 'PostgreSQL Advanced Queries', 'Indexing & Query Optimization',
        'Replication & Sharding', 'NoSQL: MongoDB Basics', 'CAP Theorem & Consistency',
        'Transaction Management', 'Distributed Query Processing',
      ],
      [classDefs[2].id]: [
        'Pengantar Kecerdasan Buatan', 'Supervised Learning', 'Unsupervised Learning & Clustering',
        'Neural Networks & Deep Learning', 'Convolutional Neural Networks (CNN)',
        'Natural Language Processing', 'Reinforcement Learning', 'AI Ethics & Applications',
      ],
      [classDefs[3].id]: [
        'Pengantar Jaringan Komputer', 'Model OSI & TCP/IP', 'Subnetting & IP Addressing',
        'Routing Protocols', 'Switching & VLANs', 'Network Security Fundamentals',
        'Wireless & Mobile Networks', 'Cloud Networking',
      ],
      [classDefs[4].id]: [
        'Pengantar RPL & SDLC', 'Requirements Engineering', 'UML & System Design',
        'Agile & Scrum Framework', 'Design Patterns', 'Testing & QA',
        'CI/CD & DevOps', 'Software Project Management',
      ],
    };

    const sessionIds: Record<string, string[]> = {};
    for (const c of classDefs) {
      sessionIds[c.id] = [];
      const titles = sessionTitles[c.id] || [];
      for (let i = 0; i < titles.length; i++) {
        const sId = uid(`ses${c.id.slice(-3)}`, i + 1);
        await prisma.session.upsert({
          where: { id: sId },
          update: {},
          create: { id: sId, classId: c.id, title: titles[i], sequence: i + 1 },
        });
        sessionIds[c.id].push(sId);
      }
    }
    console.log('  ✅ Sessions seeded (8 per class)');

    // ── TASKS ──
    const c1 = classDefs[0].id;
    const c1Sessions = sessionIds[c1];
    const taskDefs = [
      // Class 1 tasks
      { id: uid('task0001', 1), classId: c1, title: 'Buat Landing Page dengan React', description: 'Buatlah sebuah landing page responsif menggunakan React dan Tailwind CSS. Halaman harus memiliki navbar, hero section, features, dan footer.', sessionId: c1Sessions[1], createdById: userDefs[0].id, deadline: new Date('2026-06-15T23:59:00Z'), assignType: 'ALL' },
      { id: uid('task0002', 2), classId: c1, title: 'Implementasi CRUD dengan Next.js', description: 'Buat aplikasi CRUD sederhana menggunakan Next.js App Router dengan fitur:\n1. Tambah data\n2. Edit data\n3. Hapus data\n4. Tampilkan list data\n\nGunakan server actions untuk handle form.', sessionId: c1Sessions[3], createdById: userDefs[0].id, deadline: new Date('2026-06-20T23:59:00Z'), assignType: 'ALL' },
      { id: uid('task0003', 3), classId: c1, title: 'Quiz React Hooks', description: 'Jawab pertanyaan berikut tentang React Hooks:\n\n1. Jelaskan perbedaan useState dan useReducer\n2. Kapan sebaiknya menggunakan useMemo vs useCallback?\n3. Apa itu custom hooks dan berikan contoh implementasinya', sessionId: c1Sessions[2], createdById: userDefs[0].id, deadline: new Date('2026-06-12T23:59:00Z'), assignType: 'ALL' },
      { id: uid('task0004', 4), classId: c1, title: 'Tugas Individu: Authentication', description: 'Implementasikan sistem login dan register menggunakan JWT atau session-based auth. Sertakan fitur forgot password.', sessionId: c1Sessions[5], createdById: userDefs[0].id, deadline: new Date('2026-06-25T23:59:00Z'), assignType: 'INDIVIDUAL', assignedUserIds: [userDefs[1].id, userDefs[2].id, userDefs[3].id] },
      { id: uid('task0005', 5), classId: c1, title: 'Project Kelompok: E-Commerce Mini', description: 'Buat aplikasi e-commerce sederhana dengan fitur:\n- Catalog produk\n- Keranjang belanja\n- Checkout\n- Dashboard admin\n\nGunakan Next.js + Prisma + PostgreSQL', createdById: userDefs[0].id, deadline: new Date('2026-07-10T23:59:00Z'), assignType: 'GROUP' },
      // Class 2 tasks
      { id: uid('task0006', 6), classId: classDefs[1].id, title: 'Query Optimization Challenge', description: 'Optimalkan query berikut agar execution time < 100ms:\n\n```sql\nSELECT * FROM orders o\nJOIN products p ON o.product_id = p.id\nJOIN users u ON o.user_id = u.id\nWHERE o.created_at > NOW() - INTERVAL \'30 days\'\nORDER BY o.total DESC;\n```\n\nJelaskan index yang perlu ditambahkan dan alasannya.', sessionId: sessionIds[classDefs[1].id][2], createdById: userDefs[1].id, deadline: new Date('2026-06-18T23:59:00Z'), assignType: 'ALL' },
      { id: uid('task0007', 7), classId: classDefs[1].id, title: 'Desain Skema MongoDB', description: 'Desain skema MongoDB untuk aplikasi social media dengan fitur posts, comments, likes, dan followers. Bandingkan pendekatan embedded vs referenced.', sessionId: sessionIds[classDefs[1].id][4], createdById: userDefs[1].id, deadline: new Date('2026-06-22T23:59:00Z'), assignType: 'ALL' },
      // Class 3 tasks
      { id: uid('task0008', 8), classId: classDefs[2].id, title: 'Implementasi Linear Regression', description: 'Implementasikan algoritma linear regression dari scratch menggunakan Python (tanpa scikit-learn). Gunakan dataset housing prices.', sessionId: sessionIds[classDefs[2].id][1], createdById: userDefs[0].id, deadline: new Date('2026-06-20T23:59:00Z'), assignType: 'ALL' },
      { id: uid('task0009', 9), classId: classDefs[2].id, title: 'Tugas CNN Image Classification', description: 'Bangun model CNN untuk klasifikasi gambar CIFAR-10. Target akurasi > 80%. Dokumentasikan arsitektur model dan hyperparameter tuning.', sessionId: sessionIds[classDefs[2].id][4], createdById: userDefs[0].id, deadline: new Date('2026-07-01T23:59:00Z'), assignType: 'ALL' },
      // Class 4 tasks
      { id: uid('task0010', 10), classId: classDefs[3].id, title: 'Subnetting Practice', description: 'Hitung subnet berikut:\n1. 192.168.1.0/26 — berapa host per subnet?\n2. 10.0.0.0/20 — berapa subnet yang terbentuk?\n3. 172.16.0.0/22 — tentukan range IP untuk setiap subnet', sessionId: sessionIds[classDefs[3].id][2], createdById: userDefs[3].id, deadline: new Date('2026-06-16T23:59:00Z'), assignType: 'ALL' },
      // Class 5 tasks
      { id: uid('task0011', 11), classId: classDefs[4].id, title: 'Buat Use Case Diagram', description: 'Buatlah Use Case Diagram untuk sistem e-learning. Identifikasi minimal 5 aktor dan 15 use case. Gunakan PlantUML atau draw.io.', sessionId: sessionIds[classDefs[4].id][2], createdById: userDefs[1].id, deadline: new Date('2026-06-19T23:59:00Z'), assignType: 'ALL' },
      { id: uid('task0012', 12), classId: classDefs[4].id, title: 'Sprint Planning Exercise', description: 'Berdasarkan product backlog yang diberikan, lakukan sprint planning:\n- Estimasi story points\n- Prioritaskan user stories\n- Buat sprint backlog untuk Sprint 1 (2 minggu)', sessionId: sessionIds[classDefs[4].id][3], createdById: userDefs[1].id, deadline: new Date('2026-06-23T23:59:00Z'), assignType: 'ALL' },
    ];

    for (const t of taskDefs) {
      await prisma.task.upsert({
        where: { id: t.id },
        update: {},
        create: {
          id: t.id,
          classId: t.classId,
          title: t.title,
          description: t.description,
          sessionId: t.sessionId || null,
          createdById: t.createdById,
          deadline: t.deadline,
          assignType: t.assignType || 'ALL',
          assignedUserIds: (t as any).assignedUserIds || [],
        },
      });
    }
    console.log(`  ✅ ${taskDefs.length} tasks seeded`);

    // ── TASK SUBMISSIONS (answers to tasks) ──
    const submissionDefs = [
      { id: uid('tsub001', 1), taskId: taskDefs[0].id, userId: userDefs[1].id, content: 'Sudah saya buat landing page-nya menggunakan React + Tailwind. Link repo: github.com/siti/landing-page', aiAnswer: '## Review Landing Page\n\nLanding page sudah cukup baik dengan struktur:\n- ✅ Navbar responsif\n- ✅ Hero section dengan CTA\n- ✅ Feature cards\n- ⚠️ Footer perlu ditambahkan social links\n\n**Skor: 85/100**' },
      { id: uid('tsub002', 2), taskId: taskDefs[0].id, userId: userDefs[2].id, content: 'Landing page selesai, menggunakan komponen reusable', aiAnswer: '## Review\n\nStruktur komponen sudah modular:\n- Hero, Features, Footer terpisah\n- Props typing dengan TypeScript\n- Responsive design OK\n\n**Skor: 90/100**' },
      { id: uid('tsub003', 3), taskId: taskDefs[2].id, userId: userDefs[1].id, content: '1. useState untuk state sederhana, useReducer untuk state kompleks dengan banyak aksi\n2. useMemo untuk memoize nilai, useCallback untuk memoize fungsi\n3. Custom hooks mengenkapsulasi logic reusable, contoh: useLocalStorage', aiAnswer: '## Jawaban Lengkap\n\n### 1. useState vs useReducer\n- **useState**: cocok untuk state primitif (boolean, string, number)\n- **useReducer**: cocok untuk state object kompleks dengan multiple sub-values\n\n### 2. useMemo vs useCallback\n- **useMemo**: memoize **nilai** komputasi berat\n- **useCallback**: memoize **referensi fungsi** untuk child components\n\n### 3. Custom Hooks\nContoh `useLocalStorage`:\n```tsx\nfunction useLocalStorage(key, initial) {\n  const [value, setValue] = useState(() => {\n    const stored = localStorage.getItem(key);\n    return stored ? JSON.parse(stored) : initial;\n  });\n  useEffect(() => localStorage.setItem(key, JSON.stringify(value)), [key, value]);\n  return [value, setValue];\n}\n```' },
      { id: uid('tsub004', 4), taskId: taskDefs[5].id, userId: userDefs[0].id, content: 'Perlu ditambahkan composite index pada (user_id, created_at) dan (product_id) untuk mempercepat JOIN', aiAnswer: '## Optimasi Query\n\n### Index yang Diperlukan:\n```sql\nCREATE INDEX idx_orders_user_created ON orders(user_id, created_at DESC);\nCREATE INDEX idx_orders_product ON orders(product_id);\nCREATE INDEX idx_orders_total ON orders(total DESC);\n```\n\n### Penjelasan:\n1. **Composite index** `(user_id, created_at)` — mempercepat JOIN + WHERE\n2. **Product index** — mempercepat JOIN dengan products\n3. **Total index** — mempercepat ORDER BY\n\nEstimasi: execution time turun dari ~500ms → <50ms' },
    ];

    for (const s of submissionDefs) {
      await prisma.taskSubmission.upsert({
        where: { id: s.id },
        update: {},
        create: { ...s, visibility: 'PUBLIC' },
      });
    }
    console.log(`  ✅ ${submissionDefs.length} task submissions seeded`);

    // ── TASK GROUPS ──
    const group1Id = uid('tgrp001', 1);
    const group2Id = uid('tgrp002', 2);
    const group3Id = uid('tgrp003', 3);
    await prisma.taskGroup.upsert({ where: { id: group1Id }, update: {}, create: { id: group1Id, classId: c1, name: 'Kelompok 1 - Frontend' } });
    await prisma.taskGroup.upsert({ where: { id: group2Id }, update: {}, create: { id: group2Id, classId: c1, name: 'Kelompok 2 - Backend' } });
    await prisma.taskGroup.upsert({ where: { id: group3Id }, update: {}, create: { id: group3Id, classId: c1, name: 'Kelompok 3 - Fullstack' } });

    // Group members
    const groupMembers = [
      { groupId: group1Id, userId: userDefs[0].id },
      { groupId: group1Id, userId: userDefs[1].id },
      { groupId: group1Id, userId: userDefs[2].id },
      { groupId: group2Id, userId: userDefs[3].id },
      { groupId: group2Id, userId: userDefs[4].id },
      { groupId: group2Id, userId: userDefs[5].id },
      { groupId: group3Id, userId: userDefs[6].id },
      { groupId: group3Id, userId: userDefs[7].id },
    ];
    for (const gm of groupMembers) {
      await prisma.taskGroupMember.upsert({
        where: { groupId_userId: gm },
        update: {},
        create: gm,
      });
    }
    // Link group task
    await prisma.task.update({ where: { id: taskDefs[4].id }, data: { taskGroupId: group1Id } });
    console.log('  ✅ Task groups seeded');

    // ── FORUM DISCUSSIONS ──
    const discDefs = [
      { id: uid('disc001', 1), classId: c1, authorId: userDefs[0].id, title: 'Tanya Jawab React Hooks', description: 'Diskusi seputar React Hooks dan best practices' },
      { id: uid('disc002', 2), classId: c1, authorId: userDefs[1].id, title: 'Tips & Trik CSS/Tailwind', description: 'Share tips styling yang efektif' },
      { id: uid('disc003', 3), classId: c1, authorId: userDefs[0].id, title: 'Sharing Project Akhir', description: 'Diskusi dan konsultasi project akhir semester' },
      { id: uid('disc004', 4), classId: classDefs[1].id, authorId: userDefs[1].id, title: 'SQL vs NoSQL', description: 'Kapan pakai SQL dan kapan pakai NoSQL?' },
      { id: uid('disc005', 5), classId: classDefs[2].id, authorId: userDefs[0].id, title: 'Dataset & Resources', description: 'Share dataset dan resources belajar ML' },
    ];

    for (const d of discDefs) {
      await prisma.forumDiscussion.upsert({
        where: { id: d.id },
        update: {},
        create: d,
      });
    }
    console.log(`  ✅ ${discDefs.length} forum discussions seeded`);

    // ── FORUM POSTS ──
    const postDefs = [
      // Umum discussion (null) - Class 1
      { id: uid('post0001', 1), classId: c1, authorId: userDefs[0].id, discussionId: null, title: '📢 Jadwal UTS Pemrograman Web', content: 'Halo semua! UTS akan dilaksanakan pada:\n\n**Tanggal:** 25 Juni 2026\n**Waktu:** 08:00 - 10:00 WIB\n**Ruang:** Lab Komputer 301\n\nMateri yang diujikan: Pertemuan 1-8\n\nSilakan persiapkan diri dengan baik! 💪', category: ForumCategory.ANNOUNCEMENT },
      { id: uid('post0002', 2), classId: c1, authorId: userDefs[1].id, discussionId: null, title: 'Ada yang mau belajar bareng?', content: 'Halo teman-teman, ada yang mau belajar bareng untuk persiapan UTS? Bisa di perpustakaan atau via Zoom.', category: ForumCategory.DISCUSSION },
      { id: uid('post0003', 3), classId: c1, authorId: userDefs[2].id, discussionId: null, title: 'Tanya: Perbedaan SSR dan SSG di Next.js', content: 'Saya masih bingung kapan harus pakai SSR (getServerSideProps) dan kapan pakai SSG (getStaticProps). Ada yang bisa jelaskan?', category: ForumCategory.QUESTION },
      { id: uid('post0004', 4), classId: c1, authorId: userDefs[0].id, discussionId: null, title: '⏰ Deadline Tugas Minggu Ini', content: 'Reminder untuk semua:\n\n1. **Tugas React Hooks** — Deadline Jumat, 12 Juni\n2. **Landing Page** — Deadline Senin, 15 Juni\n\nJangan lupa submit tepat waktu!', category: ForumCategory.REMINDER },
      // Discussion-specific posts
      { id: uid('post0005', 5), classId: c1, authorId: userDefs[3].id, discussionId: discDefs[0].id, title: 'useEffect cleanup function', content: 'Apakah setiap useEffect perlu cleanup function? Atau hanya untuk yang subscribe ke event tertentu?', category: ForumCategory.QUESTION },
      { id: uid('post0006', 6), classId: c1, authorId: userDefs[4].id, discussionId: discDefs[0].id, title: 'useState vs useRef', content: 'Kapan sebaiknya pakai useRef dibanding useState? Saya sering bingung keduanya.', category: ForumCategory.QUESTION },
      { id: uid('post0007', 7), classId: c1, authorId: userDefs[1].id, discussionId: discDefs[1].id, title: 'Tailwind: Dark Mode Setup', content: 'Untuk setup dark mode di Tailwind:\n\n```js\n// tailwind.config.js\nmodule.exports = {\n  darkMode: \'class\',\n  // ...\n}\n```\n\nLalu tinggal tambahkan class `dark` di `<html>` tag.', category: ForumCategory.DISCUSSION },
      { id: uid('post0008', 8), classId: c1, authorId: userDefs[5].id, discussionId: discDefs[1].id, title: 'CSS Grid vs Flexbox', content: 'Menurut kalian, untuk layout yang kompleks lebih baik pakai Grid atau Flexbox? Atau kombinasi keduanya?', category: ForumCategory.DISCUSSION },
      // Class 2 posts
      { id: uid('post0009', 9), classId: classDefs[1].id, authorId: userDefs[1].id, discussionId: null, title: '📢 Pengumuman: Lab Database Dibuka', content: 'Lab database sudah bisa diakses untuk praktikum. Silakan login dengan kredensial yang sudah dikirim via email.', category: ForumCategory.ANNOUNCEMENT },
      { id: uid('post0010', 10), classId: classDefs[1].id, authorId: userDefs[0].id, discussionId: discDefs[3].id, title: 'MongoDB untuk real-time analytics', content: 'Apakah MongoDB cocok untuk real-time analytics? Atau lebih baik pakai ClickHouse/TimescaleDB?', category: ForumCategory.QUESTION },
      // Class 3 posts
      { id: uid('post0011', 11), classId: classDefs[2].id, authorId: userDefs[0].id, discussionId: null, title: 'Polling: Framework ML Favorit', content: 'Framework ML mana yang paling sering kalian pakai?', category: ForumCategory.POLL },
      { id: uid('post0012', 12), classId: classDefs[2].id, authorId: userDefs[1].id, discussionId: discDefs[4].id, title: 'Free Dataset Collections', content: 'Beberapa sumber dataset gratis:\n\n- **Kaggle**: kaggle.com/datasets\n- **UCI ML Repo**: archive.ics.uci.edu/ml\n- **Google Dataset Search**: datasetsearch.research.google.com\n- **HuggingFace Datasets**: huggingface.co/datasets', category: ForumCategory.DISCUSSION },
    ];

    for (const p of postDefs) {
      await prisma.forumPost.upsert({
        where: { id: p.id },
        update: {},
        create: p,
      });
    }
    console.log(`  ✅ ${postDefs.length} forum posts seeded`);

    // ── FORUM REPLIES ──
    const replyDefs = [
      { id: uid('repl001', 1), postId: postDefs[1].id, authorId: userDefs[3].id, content: 'Aku mau! Kapan dan di mana? Bisa Sabtu sore?' },
      { id: uid('repl002', 2), postId: postDefs[1].id, authorId: userDefs[5].id, content: 'Saya juga mau ikut. Via Zoom aja biar fleksibel 👍' },
      { id: uid('repl003', 3), postId: postDefs[1].id, authorId: userDefs[0].id, content: 'Bisa, kita bikin group WhatsApp dulu buat koordinasi. Nanti saya share link Zoom-nya.' },
      { id: uid('repl004', 4), postId: postDefs[2].id, authorId: userDefs[0].id, content: 'SSR = render setiap request (real-time data). SSG = render saat build time (static, lebih cepat). Pakai SSG kalau data jarang berubah, SSR kalau data sering update.' },
      { id: uid('repl005', 5), postId: postDefs[2].id, authorId: userDefs[1].id, content: 'Tambahan: di Next.js 14 pakai App Router, ada juga ISR (Incremental Static Regeneration) yang bisa revalidate otomatis setiap N detik.' },
      { id: uid('repl006', 6), postId: postDefs[4].id, authorId: userDefs[0].id, content: 'Cleanup diperlukan untuk:\n- Event listeners\n- setTimeout/setInterval\n- Subscriptions (WebSocket, etc)\n- AbortController untuk fetch\n\nKalau effect cuma set state dari API, biasanya tidak perlu cleanup.' },
      { id: uid('repl007', 7), postId: postDefs[5].id, authorId: userDefs[1].id, content: 'useRef tidak trigger re-render saat nilainya berubah. Cocok untuk:\n- Menyimpan reference DOM element\n- Menyimpan value yang tidak perlu trigger UI update\n- Previous value tracking' },
      { id: uid('repl008', 8), postId: postDefs[7].id, authorId: userDefs[3].id, content: 'Kombinasi! Grid untuk layout utama (rows/columns), Flexbox untuk alignment item dalam container. Keduanya saling melengkapi.' },
      { id: uid('repl009', 9), postId: postDefs[9].id, authorId: userDefs[1].id, content: 'Untuk real-time analytics sebaiknya pakai ClickHouse atau Apache Druid. MongoDB kurang optimal untuk aggregation besar.' },
    ];

    for (const r of replyDefs) {
      await prisma.forumReply.upsert({
        where: { id: r.id },
        update: {},
        create: r,
      });
    }
    console.log(`  ✅ ${replyDefs.length} forum replies seeded`);

    // ── FORUM VOTES ──
    const voteDefs = [
      { id: uid('vote001', 1), userId: userDefs[1].id, postId: postDefs[0].id, value: 1 },
      { id: uid('vote002', 2), userId: userDefs[2].id, postId: postDefs[0].id, value: 1 },
      { id: uid('vote003', 3), userId: userDefs[3].id, postId: postDefs[2].id, value: 1 },
      { id: uid('vote004', 4), userId: userDefs[0].id, postId: postDefs[6].id, value: 1 },
      { id: uid('vote005', 5), userId: userDefs[5].id, postId: postDefs[6].id, value: 1 },
      { id: uid('vote006', 6), userId: userDefs[0].id, replyId: replyDefs[3].id, value: 1 },
      { id: uid('vote007', 7), userId: userDefs[2].id, replyId: replyDefs[3].id, value: 1 },
    ];

    for (const v of voteDefs) {
      await prisma.forumVote.upsert({
        where: { id: v.id },
        update: {},
        create: { id: v.id, userId: v.userId, postId: v.postId || null, replyId: (v as any).replyId || null, value: v.value },
      });
    }
    console.log(`  ✅ ${voteDefs.length} forum votes seeded`);

    // ── FORUM POLL (for the ML framework poll post) ──
    const pollId = uid('poll001', 1);
    await prisma.forumPoll.upsert({
      where: { id: pollId },
      update: {},
      create: { id: pollId, postId: postDefs[10].id, question: 'Framework ML favorit kalian?', multiple: false },
    });
    const pollOpts = [
      { id: uid('popt001', 1), pollId, label: 'TensorFlow / Keras', order: 0 },
      { id: uid('popt002', 2), pollId, label: 'PyTorch', order: 1 },
      { id: uid('popt003', 3), pollId, label: 'Scikit-learn', order: 2 },
      { id: uid('popt004', 4), pollId, label: 'JAX / Flax', order: 3 },
    ];
    for (const o of pollOpts) {
      await prisma.forumPollOption.upsert({ where: { id: o.id }, update: {}, create: o });
    }
    // Some votes on poll
    await prisma.forumPollVote.upsert({ where: { optionId_userId: { optionId: pollOpts[1].id, userId: userDefs[0].id } }, update: {}, create: { optionId: pollOpts[1].id, userId: userDefs[0].id } });
    await prisma.forumPollVote.upsert({ where: { optionId_userId: { optionId: pollOpts[0].id, userId: userDefs[1].id } }, update: {}, create: { optionId: pollOpts[0].id, userId: userDefs[1].id } });
    await prisma.forumPollVote.upsert({ where: { optionId_userId: { optionId: pollOpts[1].id, userId: userDefs[3].id } }, update: {}, create: { optionId: pollOpts[1].id, userId: userDefs[3].id } });
    await prisma.forumPollVote.upsert({ where: { optionId_userId: { optionId: pollOpts[2].id, userId: userDefs[5].id } }, update: {}, create: { optionId: pollOpts[2].id, userId: userDefs[5].id } });
    console.log('  ✅ Forum poll seeded');

    // ── KOLEKTIF (Treasury) ──
    const kasId = uid('kas00001', 1);
    const kas2Id = uid('kas00002', 2);
    await prisma.kolektif.upsert({
      where: { id: kasId },
      update: {},
      create: { id: kasId, classId: c1, name: 'Kas Semester 6', description: 'Iuran kas kelas semester 6 — Rp 20.000/orang', targetAmount: 160000, targetPerPerson: 20000 },
    });
    await prisma.kolektif.upsert({
      where: { id: kas2Id },
      update: {},
      create: { id: kas2Id, classId: c1, name: 'Patungan Modul React', description: 'Patungan beli modul belajar React Advanced', targetAmount: 250000, targetPerPerson: 35000 },
    });

    // Kas transactions
    const txDefs = [
      { id: uid('ktx00001', 1), kolektifId: kasId, userId: userDefs[0].id, amount: 20000, type: 'IN', description: 'Iuran Budi' },
      { id: uid('ktx00002', 2), kolektifId: kasId, userId: userDefs[1].id, amount: 20000, type: 'IN', description: 'Iuran Siti' },
      { id: uid('ktx00003', 3), kolektifId: kasId, userId: userDefs[2].id, amount: 20000, type: 'IN', description: 'Iuran Ahmad' },
      { id: uid('ktx00004', 4), kolektifId: kasId, userId: userDefs[3].id, amount: 20000, type: 'IN', description: 'Iuran Dewi' },
      { id: uid('ktx00005', 5), kolektifId: kasId, userId: userDefs[4].id, amount: 20000, type: 'IN', description: 'Iuran Rudi' },
      { id: uid('ktx00006', 6), kolektifId: kasId, userId: userDefs[0].id, amount: 15000, type: 'OUT', description: 'Beli snack rapat kelas' },
      { id: uid('ktx00007', 7), kolektifId: kas2Id, userId: userDefs[0].id, amount: 35000, type: 'IN', description: 'Iuran Budi' },
      { id: uid('ktx00008', 8), kolektifId: kas2Id, userId: userDefs[1].id, amount: 35000, type: 'IN', description: 'Iuran Siti' },
      { id: uid('ktx00009', 9), kolektifId: kas2Id, userId: userDefs[3].id, amount: 35000, type: 'IN', description: 'Iuran Dewi' },
    ];

    for (const tx of txDefs) {
      await prisma.kolektifTransaction.upsert({
        where: { id: tx.id },
        update: {},
        create: tx,
      });
    }
    console.log(`  ✅ ${txDefs.length} kolektif transactions seeded`);

    // ── NOTIFICATIONS ──
    const notifDefs = [
      { id: uid('notif01', 1), userId: userDefs[0].id, title: 'Tugas Baru', message: 'Tugas baru "Buat Landing Page dengan React" telah ditambahkan di kelas Pemrograman Web Lanjut.' },
      { id: uid('notif02', 2), userId: userDefs[1].id, title: 'Pengumuman Kelas', message: 'Jadwal UTS Pemrograman Web telah diumumkan. Cek forum untuk detail.' },
      { id: uid('notif03', 3), userId: userDefs[0].id, title: 'Jawaban Baru', message: 'Siti Nurhaliza menjawab tugas "Buat Landing Page dengan React".' },
      { id: uid('notif04', 4), userId: userDefs[2].id, title: 'Deadline Mendekati', message: 'Tugas "Quiz React Hooks" deadline besok! Segera submit jawabanmu.' },
      { id: uid('notif05', 5), userId: userDefs[0].id, title: 'Anggota Baru', message: 'Doni Wijaya meminta bergabung ke kelas Kecerdasan Buatan.' },
    ];

    for (const n of notifDefs) {
      await prisma.notification.upsert({
        where: { id: n.id },
        update: {},
        create: n,
      });
    }
    console.log(`  ✅ ${notifDefs.length} notifications seeded`);

    // ── EXAM PREDICTIONS ──
    const predId = uid('pred001', 1);
    await prisma.examPrediction.upsert({
      where: { id: predId },
      update: {},
      create: {
        id: predId,
        classId: c1,
        title: 'Prediksi UTS Pemrograman Web 2026',
        description: 'Prediksi soal UTS berdasarkan materi pertemuan 1-8',
        createdById: userDefs[0].id,
        sessionIds: c1Sessions.slice(0, 4),
        source: 'AI_GENERATED',
      },
    });

    const predQuestions = [
      { id: uid('pq000001', 1), predictionId: predId, question: 'Jelaskan perbedaan antara Client Component dan Server Component di Next.js 14!', type: 'ESSAY', answerKey: 'Server Component render di server, Client Component render di browser. Server Component tidak bisa pakai hooks/state.', explanation: 'Server Component adalah default di App Router. Untuk membuat Client Component, tambahkan "use client" di baris pertama file.', order: 1 },
      { id: uid('pq000002', 2), predictionId: predId, question: 'Manakah hook yang digunakan untuk menyimpan state di React?', type: 'MULTIPLE_CHOICE', options: JSON.stringify(['A. useEffect', 'B. useState', 'C. useRef', 'D. useMemo']), answerKey: 'B', explanation: 'useState adalah hook untuk deklarasi state variable. useEffect untuk side effects, useRef untuk mutable reference, useMemo untuk memoization.', order: 2 },
      { id: uid('pq000003', 3), predictionId: predId, question: 'Apa yang dimaksud dengan Virtual DOM dan bagaimana React menggunakannya?', type: 'ESSAY', answerKey: 'Virtual DOM adalah representasi ringan dari DOM asli. React membandingkan Virtual DOM lama dan baru (diffing) lalu hanya update bagian yang berubah (reconciliation).', explanation: 'Virtual DOM membuat rendering lebih efisien karena manipulasi DOM asli itu mahal (expensive operation).', order: 3 },
      { id: uid('pq000004', 4), predictionId: predId, question: 'Berikut yang BUKAN merupakan HTTP method standar adalah:', type: 'MULTIPLE_CHOICE', options: JSON.stringify(['A. GET', 'B. POST', 'C. FETCH', 'D. DELETE']), answerKey: 'C', explanation: 'FETCH bukan HTTP method. HTTP methods standar: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS.', order: 4 },
      { id: uid('pq000005', 5), predictionId: predId, question: 'Jelaskan konsep "lifting state up" di React dan berikan contoh penggunaannya!', type: 'ESSAY', answerKey: 'Lifting state up adalah memindahkan state ke parent component agar bisa di-share antar sibling components.', explanation: 'Contoh: dua input yang perlu sinkron nilainya. State disimpan di parent, lalu dikirim via props ke kedua child.', order: 5 },
    ];

    for (const pq of predQuestions) {
      await prisma.examPredictionQuestion.upsert({
        where: { id: pq.id },
        update: {},
        create: pq,
      });
    }
    console.log('  ✅ Exam prediction with 5 questions seeded');

    // ── CLASS CUSTOM TABS ──
    const tabDefs = [
      { id: uid('ctab001', 1), classId: c1, name: 'Catatan Penting', content: '## Catatan Penting Kelas\n\n### Link Penting\n- **Slide Kuliah**: [Google Drive](https://drive.google.com)\n- **GitHub Org**: [github.com/pwl-2025](https://github.com)\n- **Discord Server**: [Join](https://discord.gg)\n\n### Aturan Kelas\n1. Hadir tepat waktu\n2. Submit tugas sebelum deadline\n3. Aktif di forum diskusi\n4. Wajib push code ke GitHub' },
      { id: uid('ctab002', 2), classId: c1, name: 'Referensi Belajar', content: '## Referensi Belajar\n\n### Books\n- **Learning React** - Alex Banks\n- **Full Stack Development** - Frank Zammetti\n\n### Online Resources\n- React Docs: react.dev\n- Next.js Docs: nextjs.org/docs\n- MDN Web Docs: developer.mozilla.org\n\n### YouTube Channels\n- Fireship\n- Traversy Media\n- Web Dev Simplified' },
    ];

    for (const tab of tabDefs) {
      await prisma.classCustomTab.upsert({
        where: { id: tab.id },
        update: {},
        create: tab,
      });
    }
    console.log('  ✅ Custom tabs seeded');

    console.log('\n🎉 Dummy data seeding selesai!');
    console.log('📊 Summary:');
    console.log(`   - ${userDefs.length} users`);
    console.log(`   - ${classDefs.length} classes`);
    console.log(`   - ${Object.values(sessionIds).flat().length} sessions`);
    console.log(`   - ${taskDefs.length} tasks`);
    console.log(`   - ${submissionDefs.length} task submissions`);
    console.log(`   - 3 task groups`);
    console.log(`   - ${discDefs.length} discussions`);
    console.log(`   - ${postDefs.length} forum posts`);
    console.log(`   - ${replyDefs.length} forum replies`);
    console.log(`   - 1 poll with 4 options`);
    console.log(`   - 2 kolektif funds, ${txDefs.length} transactions`);
    console.log(`   - 1 exam prediction with 5 questions`);
    console.log(`   - 2 custom tabs`);
    console.log(`   - ${notifDefs.length} notifications`);
  }

  console.log('\n🎉 Seeding selesai!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding gagal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

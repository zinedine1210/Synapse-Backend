-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "label" TEXT NOT NULL,
    "note" TEXT,
    "inputMethod" TEXT NOT NULL DEFAULT 'text',
    "receiptImageUrl" TEXT,
    "bawelComment" TEXT,
    "bawelLevel" TEXT NOT NULL DEFAULT 'info',
    "linkedTreeId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryBudget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingTree" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetAmount" DOUBLE PRECISION NOT NULL,
    "currentAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deadline" TIMESTAMP(3),
    "treeType" TEXT NOT NULL DEFAULT 'oak',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavingTree_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreeTransaction" (
    "id" TEXT NOT NULL,
    "treeId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreeTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BawelSetting" (
    "userId" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'NORMAL',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BawelSetting_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "PersonalTodo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "dueTime" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "category" TEXT,
    "tags" TEXT[],
    "inputMethod" TEXT NOT NULL DEFAULT 'text',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalTodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TodoReminder" (
    "id" TEXT NOT NULL,
    "todoId" TEXT NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TodoReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QnaQuestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "category" TEXT[],
    "tags" TEXT[],
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QnaQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QnaAnswer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isApprovedByAsker" BOOLEAN NOT NULL DEFAULT false,
    "isAIFiltered" BOOLEAN NOT NULL DEFAULT false,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QnaAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserReputation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "answersApproved" INTEGER NOT NULL DEFAULT 0,
    "questionsAsked" INTEGER NOT NULL DEFAULT 0,
    "reportCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UserReputation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyBriefing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyBriefing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");

-- CreateIndex
CREATE INDEX "Transaction_userId_date_idx" ON "Transaction"("userId", "date");

-- CreateIndex
CREATE INDEX "Transaction_userId_category_idx" ON "Transaction"("userId", "category");

-- CreateIndex
CREATE INDEX "CategoryBudget_userId_idx" ON "CategoryBudget"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryBudget_userId_category_month_year_key" ON "CategoryBudget"("userId", "category", "month", "year");

-- CreateIndex
CREATE INDEX "SavingTree_userId_idx" ON "SavingTree"("userId");

-- CreateIndex
CREATE INDEX "TreeTransaction_treeId_idx" ON "TreeTransaction"("treeId");

-- CreateIndex
CREATE INDEX "PersonalTodo_userId_idx" ON "PersonalTodo"("userId");

-- CreateIndex
CREATE INDEX "PersonalTodo_userId_status_idx" ON "PersonalTodo"("userId", "status");

-- CreateIndex
CREATE INDEX "PersonalTodo_userId_dueDate_idx" ON "PersonalTodo"("userId", "dueDate");

-- CreateIndex
CREATE INDEX "TodoReminder_todoId_idx" ON "TodoReminder"("todoId");

-- CreateIndex
CREATE INDEX "TodoReminder_remindAt_sent_idx" ON "TodoReminder"("remindAt", "sent");

-- CreateIndex
CREATE UNIQUE INDEX "QnaQuestion_slug_key" ON "QnaQuestion"("slug");

-- CreateIndex
CREATE INDEX "QnaQuestion_userId_idx" ON "QnaQuestion"("userId");

-- CreateIndex
CREATE INDEX "QnaQuestion_slug_idx" ON "QnaQuestion"("slug");

-- CreateIndex
CREATE INDEX "QnaQuestion_status_idx" ON "QnaQuestion"("status");

-- CreateIndex
CREATE INDEX "QnaAnswer_questionId_idx" ON "QnaAnswer"("questionId");

-- CreateIndex
CREATE INDEX "QnaAnswer_userId_idx" ON "QnaAnswer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserReputation_userId_key" ON "UserReputation"("userId");

-- CreateIndex
CREATE INDEX "DailyBriefing_userId_idx" ON "DailyBriefing"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyBriefing_userId_date_key" ON "DailyBriefing"("userId", "date");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryBudget" ADD CONSTRAINT "CategoryBudget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingTree" ADD CONSTRAINT "SavingTree_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreeTransaction" ADD CONSTRAINT "TreeTransaction_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "SavingTree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BawelSetting" ADD CONSTRAINT "BawelSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalTodo" ADD CONSTRAINT "PersonalTodo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TodoReminder" ADD CONSTRAINT "TodoReminder_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "PersonalTodo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QnaQuestion" ADD CONSTRAINT "QnaQuestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QnaAnswer" ADD CONSTRAINT "QnaAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QnaQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QnaAnswer" ADD CONSTRAINT "QnaAnswer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserReputation" ADD CONSTRAINT "UserReputation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyBriefing" ADD CONSTRAINT "DailyBriefing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

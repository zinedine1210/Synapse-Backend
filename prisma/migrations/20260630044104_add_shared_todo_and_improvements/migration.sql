-- CreateTable
CREATE TABLE "SharedTodo" (
    "id" TEXT NOT NULL,
    "todoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sharedBy" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedTodo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SharedTodo_userId_accepted_idx" ON "SharedTodo"("userId", "accepted");

-- CreateIndex
CREATE INDEX "SharedTodo_todoId_idx" ON "SharedTodo"("todoId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedTodo_todoId_userId_key" ON "SharedTodo"("todoId", "userId");

-- AddForeignKey
ALTER TABLE "SharedTodo" ADD CONSTRAINT "SharedTodo_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "PersonalTodo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedTodo" ADD CONSTRAINT "SharedTodo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedTodo" ADD CONSTRAINT "SharedTodo_sharedBy_fkey" FOREIGN KEY ("sharedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ClassMember" ADD COLUMN     "classRoleId" TEXT;

-- CreateTable
CREATE TABLE "ClassRole" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" TEXT[],
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClassRole_classId_name_key" ON "ClassRole"("classId", "name");

-- AddForeignKey
ALTER TABLE "ClassMember" ADD CONSTRAINT "ClassMember_classRoleId_fkey" FOREIGN KEY ("classRoleId") REFERENCES "ClassRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassRole" ADD CONSTRAINT "ClassRole_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

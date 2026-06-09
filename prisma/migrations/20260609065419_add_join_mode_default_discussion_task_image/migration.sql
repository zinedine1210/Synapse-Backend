-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "autoRoleAssign" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "joinMode" TEXT NOT NULL DEFAULT 'PUBLIC';

-- AlterTable
ALTER TABLE "ClassMember" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "ForumDiscussion" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "descriptionImageUrl" TEXT;

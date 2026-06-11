-- CreateTable
CREATE TABLE "UserProfile" (
    "userId" TEXT NOT NULL,
    "university" TEXT,
    "hobbies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "job" TEXT,
    "reason" TEXT,
    "avatarUrl" TEXT,
    "dailyHabits" VARCHAR(300),
    "lifeGoals" VARCHAR(300),
    "studySchedule" VARCHAR(200),
    "personalNotes" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

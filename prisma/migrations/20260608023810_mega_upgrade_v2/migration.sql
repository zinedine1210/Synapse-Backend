-- AlterTable
ALTER TABLE "Kolektif" ADD COLUMN     "targetPerPerson" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "assignType" TEXT NOT NULL DEFAULT 'ALL',
ADD COLUMN     "assignedUserIds" TEXT[];

-- CreateTable
CREATE TABLE "ExamPrediction" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "sessionIds" TEXT[],
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamPrediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamPredictionQuestion" (
    "id" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" TEXT,
    "answerKey" TEXT,
    "explanation" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamPredictionQuestion_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ExamPrediction" ADD CONSTRAINT "ExamPrediction_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPredictionQuestion" ADD CONSTRAINT "ExamPredictionQuestion_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "ExamPrediction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

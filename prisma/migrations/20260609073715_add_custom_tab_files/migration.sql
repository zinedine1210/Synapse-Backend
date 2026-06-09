-- CreateTable
CREATE TABLE "ClassCustomTabFile" (
    "id" TEXT NOT NULL,
    "tabId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassCustomTabFile_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ClassCustomTabFile" ADD CONSTRAINT "ClassCustomTabFile_tabId_fkey" FOREIGN KEY ("tabId") REFERENCES "ClassCustomTab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

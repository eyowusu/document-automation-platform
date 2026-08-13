-- Adds login sessions and moves generated documents out of the web-served
-- public/ directory into private storage reachable only through an
-- authenticated download route.

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- AlterTable
ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'officer';

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- RedefineTables: Contract.fileUrl -> storagePath + fileName, and record who
-- generated each document. Existing rows keep their file by stripping the
-- leading slash off the old public URL ("/contracts/x.docx" -> "contracts/x.docx").
CREATE TABLE "new_Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "generatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Contract_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Contract_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Contract" ("id", "templateId", "data", "storagePath", "fileName", "format", "status", "createdAt", "updatedAt")
SELECT
    "id",
    "templateId",
    "data",
    ltrim("fileUrl", '/'),
    replace("fileUrl", '/contracts/', ''),
    "format",
    "status",
    "createdAt",
    "updatedAt"
FROM "Contract";
DROP TABLE "Contract";
ALTER TABLE "new_Contract" RENAME TO "Contract";
CREATE INDEX "Contract_templateId_idx" ON "Contract"("templateId");

-- RedefineTables: Template.fileUrl -> storagePath, same path rewrite.
CREATE TABLE "new_Template" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "storagePath" TEXT,
    "placeholders" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Template" ("id", "name", "description", "content", "storagePath", "placeholders", "createdAt", "updatedAt")
SELECT
    "id",
    "name",
    "description",
    "content",
    CASE WHEN "fileUrl" IS NULL THEN NULL ELSE ltrim("fileUrl", '/') END,
    "placeholders",
    "createdAt",
    "updatedAt"
FROM "Template";
DROP TABLE "Template";
ALTER TABLE "new_Template" RENAME TO "Template";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

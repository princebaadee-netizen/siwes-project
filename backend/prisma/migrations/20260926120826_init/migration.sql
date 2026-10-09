-- CreateEnum
CREATE TYPE "ModuleChoice" AS ENUM ('LOGBOOK', 'PROJECT', 'BOTH');

-- CreateEnum
CREATE TYPE "LogbookEntrySource" AS ENUM ('MANUAL', 'AI_SINGLE_DAY', 'AI_BULK');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('DRAFT', 'REVIEWED', 'FINALIZED');

-- CreateEnum
CREATE TYPE "ChapterMode" AS ENUM ('MANUAL', 'AI_BULK');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ReferenceSourceType" AS ENUM ('JOURNAL_ARTICLE', 'CONFERENCE_PAPER', 'BOOK', 'DATASET', 'THESIS', 'REPORT', 'STANDARD', 'WEBSITE');

-- CreateEnum
CREATE TYPE "VerificationTier" AS ENUM ('API_VERIFIED', 'LINK_CHECKED', 'STUDENT_CONFIRMED');

-- CreateEnum
CREATE TYPE "PurchaseProductType" AS ENUM ('IT_SIWES_PASS', 'PROJECT_PASS', 'BUNDLE');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'SUCCESSFUL', 'FAILED');

-- CreateEnum
CREATE TYPE "GenerationType" AS ENUM ('EXTRACTION', 'BULK_LOGBOOK', 'CHAPTER_DRAFT', 'SINGLE_DAY_POLISH');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "school" TEXT,
    "department" TEXT,
    "moduleChoice" "ModuleChoice",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productType" "PurchaseProductType" NOT NULL,
    "amountKobo" INTEGER NOT NULL,
    "paymentRef" TEXT NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "it_placements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "companyAddress" TEXT,
    "industrySector" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "daysPerWeek" INTEGER,
    "attendancePattern" TEXT[],
    "trialWeekUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "it_placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_holidays" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,

    CONSTRAINT "public_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_calendar_days" (
    "id" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "isAttendanceDay" BOOLEAN NOT NULL,
    "isPublicHoliday" BOOLEAN NOT NULL DEFAULT false,
    "holidayName" TEXT,
    "confirmedAttended" BOOLEAN,
    "hasLogbookEntry" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "attendance_calendar_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulk_fillup_requests" (
    "id" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "rawInputText" TEXT NOT NULL,
    "extractedSchool" TEXT,
    "extractedStartDate" TIMESTAMP(3),
    "extractedEndDate" TIMESTAMP(3),
    "extractedSkills" TEXT[],
    "regenerationsUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bulk_fillup_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logbook_entries" (
    "id" TEXT NOT NULL,
    "calendarDayId" TEXT NOT NULL,
    "activity" TEXT NOT NULL,
    "evidenceUrl" TEXT,
    "source" "LogbookEntrySource" NOT NULL DEFAULT 'MANUAL',
    "status" "EntryStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "logbook_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "supervisorName" TEXT,
    "topicSource" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_chapters" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chapterNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "mode" "ChapterMode" NOT NULL DEFAULT 'MANUAL',
    "rawInputText" TEXT,
    "content" TEXT,
    "status" "EntryStatus" NOT NULL DEFAULT 'DRAFT',
    "isFreeUnlocked" BOOLEAN NOT NULL DEFAULT false,
    "regenerationsUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_references" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "citationText" TEXT NOT NULL,
    "sourceType" "ReferenceSourceType" NOT NULL,
    "doiOrIsbnOrLink" TEXT,
    "formattedCitation" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationTier" "VerificationTier" NOT NULL DEFAULT 'STUDENT_CONFIRMED',
    "verifiedVia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "GenerationType" NOT NULL,
    "estimatedTokens" INTEGER,
    "estimatedCostKobo" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_paymentRef_key" ON "purchases"("paymentRef");

-- CreateIndex
CREATE UNIQUE INDEX "it_placements_userId_key" ON "it_placements"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "public_holidays_date_name_key" ON "public_holidays"("date", "name");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_calendar_days_placementId_date_key" ON "attendance_calendar_days"("placementId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "logbook_entries_calendarDayId_key" ON "logbook_entries"("calendarDayId");

-- CreateIndex
CREATE UNIQUE INDEX "project_chapters_projectId_chapterNumber_key" ON "project_chapters"("projectId", "chapterNumber");

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "it_placements" ADD CONSTRAINT "it_placements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_calendar_days" ADD CONSTRAINT "attendance_calendar_days_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "it_placements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_fillup_requests" ADD CONSTRAINT "bulk_fillup_requests_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "it_placements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logbook_entries" ADD CONSTRAINT "logbook_entries_calendarDayId_fkey" FOREIGN KEY ("calendarDayId") REFERENCES "attendance_calendar_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_chapters" ADD CONSTRAINT "project_chapters_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_references" ADD CONSTRAINT "project_references_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_logs" ADD CONSTRAINT "generation_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

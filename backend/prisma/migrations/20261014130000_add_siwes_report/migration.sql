-- The IT/SIWES report: one per student, summarising the whole placement. The
-- cover/title pages come from structured columns on siwes_reports; the prose
-- sections live in siwes_report_sections. Each AI-written section is its own
-- paid model call, so it gets its own GENERATION type.
ALTER TYPE "GenerationType" ADD VALUE 'REPORT_SECTION';

CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'COMPLETED');
CREATE TYPE "ReportSectionKind" AS ENUM (
  'ABSTRACT',
  'DEDICATION',
  'ACKNOWLEDGMENT',
  'INTRODUCTION',
  'INDUSTRIAL_EXPERIENCE',
  'SKILLS_ACQUIRED',
  'DISCUSSION_CONCLUSION'
);

CREATE TABLE "siwes_reports" (
  "id"                 TEXT NOT NULL,
  "userId"             TEXT NOT NULL,
  "institutionName"    TEXT,
  "institutionAddress" TEXT,
  "faculty"            TEXT,
  "department"         TEXT,
  "programme"          TEXT,
  "level"              TEXT,
  "matricNumber"       TEXT,
  "schoolSupervisor"   TEXT,
  "companySupervisor"  TEXT,
  "durationLabel"      TEXT,
  "submissionDate"     TIMESTAMP(3),
  "logoUrl"            TEXT,
  "coverImageUrl"      TEXT,
  "dedicationNames"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status"             "ReportStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "siwes_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "siwes_reports_userId_key" ON "siwes_reports"("userId");

CREATE TABLE "siwes_report_sections" (
  "id"                TEXT NOT NULL,
  "reportId"          TEXT NOT NULL,
  "kind"              "ReportSectionKind" NOT NULL,
  "content"           TEXT,
  "status"            "EntryStatus" NOT NULL DEFAULT 'DRAFT',
  "regenerationsUsed" INTEGER NOT NULL DEFAULT 0,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "siwes_report_sections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "siwes_report_sections_reportId_kind_key"
  ON "siwes_report_sections"("reportId", "kind");

ALTER TABLE "siwes_reports"
  ADD CONSTRAINT "siwes_reports_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "siwes_report_sections"
  ADD CONSTRAINT "siwes_report_sections_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "siwes_reports"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

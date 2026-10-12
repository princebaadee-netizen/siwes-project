-- Two fields were carried from the original schema but never written or read:
-- BulkFillupRequest.regenerationsUsed and ProjectChapter.mode (the whole
-- ChapterMode enum is unused). Drop them so the model matches reality.
ALTER TABLE "bulk_fillup_requests" DROP COLUMN "regenerationsUsed";
ALTER TABLE "project_chapters" DROP COLUMN "mode";
DROP TYPE "ChapterMode";

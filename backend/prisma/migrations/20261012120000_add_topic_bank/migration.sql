-- CreateEnum
CREATE TYPE "TopicSource" AS ENUM ('MANUAL', 'BANK', 'AI_SUGGESTED');

-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "topicSource" TYPE "TopicSource" USING "topicSource"::"TopicSource";

-- CreateTable
CREATE TABLE "project_topics" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_topics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_topics_title_key" ON "project_topics"("title");

-- CreateIndex
CREATE INDEX "project_topics_field_idx" ON "project_topics"("field");

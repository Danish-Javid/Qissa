-- CreateTable
CREATE TABLE "parents" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "consentGivenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "csrfToken" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "children" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "worldSeed" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "children_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learner_models" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "state" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learner_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stories" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "targetGrapheme" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "provenance" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_sessions" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "storyId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "cappedByServer" BOOLEAN NOT NULL DEFAULT false,
    "planRitualDone" BOOLEAN NOT NULL DEFAULT false,
    "narrativeCloseDone" BOOLEAN NOT NULL DEFAULT false,
    "wordsRead" INTEGER NOT NULL DEFAULT 0,
    "wordsCorrect" INTEGER NOT NULL DEFAULT 0,
    "wordsPerMinute" DOUBLE PRECISION,
    "costMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "providerMode" TEXT NOT NULL DEFAULT 'mock',

    CONSTRAINT "reading_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "miscues" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "expected" TEXT NOT NULL,
    "spoken" TEXT,
    "miscueType" TEXT NOT NULL,
    "grapheme" TEXT NOT NULL,
    "ladderStep" INTEGER NOT NULL DEFAULT 0,
    "accentApplied" BOOLEAN NOT NULL DEFAULT false,
    "accentNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "miscues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "choice_events" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "storyId" TEXT,
    "prompt" TEXT NOT NULL,
    "chosenIndex" INTEGER NOT NULL,
    "rationale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "choice_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audio_clips" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audio_clips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distress_alerts" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "sessionId" TEXT,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distress_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "childId" TEXT,
    "sessionId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parents_email_key" ON "parents"("email");

-- CreateIndex
CREATE INDEX "auth_sessions_parentId_idx" ON "auth_sessions"("parentId");

-- CreateIndex
CREATE INDEX "children_parentId_idx" ON "children"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "learner_models_childId_key" ON "learner_models"("childId");

-- CreateIndex
CREATE INDEX "stories_childId_idx" ON "stories"("childId");

-- CreateIndex
CREATE INDEX "reading_sessions_childId_idx" ON "reading_sessions"("childId");

-- CreateIndex
CREATE INDEX "miscues_sessionId_idx" ON "miscues"("sessionId");

-- CreateIndex
CREATE INDEX "choice_events_sessionId_idx" ON "choice_events"("sessionId");

-- CreateIndex
CREATE INDEX "audio_clips_createdAt_idx" ON "audio_clips"("createdAt");

-- CreateIndex
CREATE INDEX "distress_alerts_childId_idx" ON "distress_alerts"("childId");

-- CreateIndex
CREATE INDEX "audit_log_event_idx" ON "audit_log"("event");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_models" ADD CONSTRAINT "learner_models_childId_fkey" FOREIGN KEY ("childId") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_childId_fkey" FOREIGN KEY ("childId") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_childId_fkey" FOREIGN KEY ("childId") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "stories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miscues" ADD CONSTRAINT "miscues_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "reading_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "choice_events" ADD CONSTRAINT "choice_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "reading_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_clips" ADD CONSTRAINT "audio_clips_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "reading_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distress_alerts" ADD CONSTRAINT "distress_alerts_childId_fkey" FOREIGN KEY ("childId") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

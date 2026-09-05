-- Parent-layer language (FR-J). Defaults to 'en' so every existing row keeps
-- the behaviour it has today; the column is on the parent because it is the
-- adult who reads the dashboard and digest.
ALTER TABLE "parents" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en';

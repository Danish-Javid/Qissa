-- AlterTable: per-child parental controls over the three modes.
-- Nullable JSONB so every existing child keeps working with age defaults
-- (@qissa/core ChildSettings); no data backfill, no index, fully reversible.
ALTER TABLE "children" ADD COLUMN "settings" JSONB;

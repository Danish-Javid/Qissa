-- Demo-seeded children (FR-K). Defaults false so every existing row is
-- treated as real data and can never be removed by the demo reset.
ALTER TABLE "children" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;

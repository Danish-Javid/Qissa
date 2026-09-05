-- Grown-up details collected at registration.
--
-- All nullable: accounts created before this migration (including the demo
-- seed) predate the fields and must keep working. New registrations require
-- them at the route level, which is where the age gate lives.
ALTER TABLE "parents" ADD COLUMN "displayName" TEXT;
ALTER TABLE "parents" ADD COLUMN "birthDate" TIMESTAMP(3);
ALTER TABLE "parents" ADD COLUMN "guardianConfirmedAt" TIMESTAMP(3);

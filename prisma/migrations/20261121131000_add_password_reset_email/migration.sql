ALTER TABLE "users" ADD COLUMN "resetTokenHash" TEXT;
ALTER TABLE "users" ADD COLUMN "resetTokenExpires" DATETIME;

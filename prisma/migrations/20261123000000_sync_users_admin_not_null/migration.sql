PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_users" (
    "username" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "hash" TEXT NOT NULL,
    "admin" INTEGER NOT NULL DEFAULT 0,
    "mustChange" BOOLEAN NOT NULL DEFAULT false,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "resetTokenHash" TEXT,
    "resetTokenExpires" DATETIME,
    "first_name" TEXT,
    "last_name" TEXT,
    "email" TEXT,
    "avatar" TEXT NOT NULL DEFAULT 'santa'
);

INSERT INTO "new_users" (
    "username",
    "name",
    "hash",
    "admin",
    "mustChange",
    "tokenVersion",
    "resetTokenHash",
    "resetTokenExpires",
    "first_name",
    "last_name",
    "email",
    "avatar"
)
SELECT
    "username",
    "name",
    "hash",
    COALESCE("admin", 0),
    "mustChange",
    "tokenVersion",
    "resetTokenHash",
    "resetTokenExpires",
    "first_name",
    "last_name",
    "email",
    "avatar"
FROM "users";

DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";

CREATE UNIQUE INDEX "users_email_unique" ON "users"("email");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS "users" (
  "username" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT,
  "hash" TEXT NOT NULL,
  "admin" INTEGER NOT NULL DEFAULT 0,
  "first_name" TEXT,
  "last_name" TEXT,
  "email" TEXT,
  "avatar" TEXT NOT NULL DEFAULT 'santa'
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users"("email");

CREATE TABLE IF NOT EXISTS "doors" (
  "door" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "unlock_at" TEXT,
  "title" TEXT,
  "year" TEXT,
  "runtime" TEXT,
  "genre" TEXT,
  "synopsis" TEXT,
  "watch" TEXT,
  "poster" TEXT,
  "trailer" TEXT,
  "vote_enabled" INTEGER NOT NULL DEFAULT 0,
  "vote_open_at" TEXT,
  "vote_candidates" TEXT NOT NULL DEFAULT '[]',
  "vote_winner" INTEGER
);

CREATE TABLE IF NOT EXISTS "watched_movies" (
  "username" TEXT NOT NULL,
  "door" INTEGER NOT NULL,
  "watched_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("username", "door"),
  CONSTRAINT "watched_movies_username_fkey"
    FOREIGN KEY ("username") REFERENCES "users"("username") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "watched_movies_door_fkey"
    FOREIGN KEY ("door") REFERENCES "doors"("door") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS "movie_ratings" (
  "username" TEXT NOT NULL,
  "door" INTEGER NOT NULL,
  "stars_half" INTEGER NOT NULL,
  PRIMARY KEY ("username", "door"),
  CONSTRAINT "movie_ratings_username_fkey"
    FOREIGN KEY ("username") REFERENCES "users"("username") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "movie_ratings_door_fkey"
    FOREIGN KEY ("door") REFERENCES "doors"("door") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS "movie_reactions" (
  "username" TEXT NOT NULL,
  "door" INTEGER NOT NULL,
  "emoji" TEXT NOT NULL,
  PRIMARY KEY ("username", "door", "emoji"),
  CONSTRAINT "movie_reactions_username_fkey"
    FOREIGN KEY ("username") REFERENCES "users"("username") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "movie_reactions_door_fkey"
    FOREIGN KEY ("door") REFERENCES "doors"("door") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS "movie_comments" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "username" TEXT NOT NULL,
  "door" INTEGER NOT NULL,
  "comment" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "movie_comments_username_fkey"
    FOREIGN KEY ("username") REFERENCES "users"("username") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "movie_comments_door_fkey"
    FOREIGN KEY ("door") REFERENCES "doors"("door") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS "movie_votes" (
  "username" TEXT NOT NULL,
  "door" INTEGER NOT NULL,
  "candidate" INTEGER NOT NULL,
  PRIMARY KEY ("username", "door"),
  CONSTRAINT "movie_votes_username_fkey"
    FOREIGN KEY ("username") REFERENCES "users"("username") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "movie_votes_door_fkey"
    FOREIGN KEY ("door") REFERENCES "doors"("door") ON DELETE CASCADE ON UPDATE NO ACTION
);

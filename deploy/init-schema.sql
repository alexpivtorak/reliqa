-- Fresh auth-era schema for production bootstrap
DROP TABLE IF EXISTS "test_steps" CASCADE;
DROP TABLE IF EXISTS "issues" CASCADE;
DROP TABLE IF EXISTS "test_runs" CASCADE;
DROP TABLE IF EXISTS "session" CASCADE;
DROP TABLE IF EXISTS "account" CASCADE;
DROP TABLE IF EXISTS "verification" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;

CREATE TABLE "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "email_verified" boolean DEFAULT false NOT NULL,
  "image" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "users_email_unique" UNIQUE("email")
);

CREATE TABLE "session" (
  "id" text PRIMARY KEY NOT NULL,
  "expires_at" timestamp NOT NULL,
  "token" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "session_token_unique" UNIQUE("token")
);
CREATE INDEX "session_userId_idx" ON "session" ("user_id");

CREATE TABLE "account" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamp,
  "refresh_token_expires_at" timestamp,
  "scope" text,
  "password" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "account_userId_idx" ON "account" ("user_id");

CREATE TABLE "verification" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");

CREATE TABLE "test_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "url" text NOT NULL,
  "goal" text NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "result" text,
  "logs" jsonb,
  "video_url" text,
  "browser_connect_url" text,
  "start_time" timestamp,
  "end_time" timestamp,
  "model" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE "test_steps" (
  "id" serial PRIMARY KEY NOT NULL,
  "run_id" integer NOT NULL REFERENCES "test_runs"("id"),
  "step_number" integer NOT NULL,
  "action_type" text NOT NULL,
  "thought" text,
  "selector" text,
  "screenshot_url" text,
  "dom_snapshot" jsonb,
  "timestamp" timestamp DEFAULT now()
);

CREATE TABLE "issues" (
  "id" serial PRIMARY KEY NOT NULL,
  "test_run_id" integer REFERENCES "test_runs"("id"),
  "description" text NOT NULL,
  "severity" text DEFAULT 'medium',
  "timestamp" text,
  "created_at" timestamp DEFAULT now()
);

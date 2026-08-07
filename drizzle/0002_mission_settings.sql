ALTER TABLE "test_runs" ADD COLUMN "mode" text DEFAULT 'standard';--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "chaos_profile" jsonb;--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "headless" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "disable_cache" boolean DEFAULT false;

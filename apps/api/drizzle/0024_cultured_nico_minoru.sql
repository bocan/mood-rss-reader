ALTER TABLE "profiles" ADD COLUMN "website_url" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "photo_url" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "me_links" text[] DEFAULT '{}'::text[] NOT NULL;
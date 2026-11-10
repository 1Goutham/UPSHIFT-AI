CREATE TABLE "token_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"method" text NOT NULL,
	"platform" text DEFAULT 'other' NOT NULL,
	"source" text DEFAULT 'web' NOT NULL,
	"tokens_before" integer NOT NULL,
	"tokens_after" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "token_events" ADD CONSTRAINT "token_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "token_events_user_idx" ON "token_events" USING btree ("user_id","created_at");
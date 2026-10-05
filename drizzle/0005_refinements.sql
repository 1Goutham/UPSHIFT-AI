CREATE TABLE "ext_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"label" text DEFAULT 'Browser extension' NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refinements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"mode" text NOT NULL,
	"source" text DEFAULT 'web' NOT NULL,
	"original" text NOT NULL,
	"refined" text NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ext_tokens" ADD CONSTRAINT "ext_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refinements" ADD CONSTRAINT "refinements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ext_tokens_hash_idx" ON "ext_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "ext_tokens_user_idx" ON "ext_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refinements_user_idx" ON "refinements" USING btree ("user_id","created_at");
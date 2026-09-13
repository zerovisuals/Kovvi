DROP INDEX "service_profile_workspace_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "service_profile_workspace_unique" ON "service_profile" USING btree ("workspace_id");
CREATE TYPE "public"."access_method" AS ENUM('public_http', 'search_api', 'manual_import', 'provider_api');--> statement-breakpoint
CREATE TYPE "public"."alias_kind" AS ENUM('former_name', 'trading_name', 'handle', 'legal_name', 'former_domain');--> statement-breakpoint
CREATE TYPE "public"."assessment_status" AS ENUM('complete', 'partial', 'inconclusive_blocked', 'inconclusive_timeout', 'failed');--> statement-breakpoint
CREATE TYPE "public"."blob_backend" AS ENUM('fs', 's3');--> statement-breakpoint
CREATE TYPE "public"."block_reason" AS ENUM('identity_conflict', 'no_contact', 'evidence_expired', 'suppressed', 'subscription_inactive', 'sample_workspace');--> statement-breakpoint
CREATE TYPE "public"."brand_status" AS ENUM('active', 'retired', 'renamed');--> statement-breakpoint
CREATE TYPE "public"."business_maturity" AS ENUM('unknown', 'new', 'established', 'scaling');--> statement-breakpoint
CREATE TYPE "public"."campaign_pause_reason" AS ENUM('user_paused', 'reply_received', 'token_expired', 'capability_absent', 'evidence_expired', 'subscription_inactive');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'pending_approval', 'approved', 'scheduled', 'sending', 'paused', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."capacity_state" AS ENUM('open', 'booked');--> statement-breakpoint
CREATE TYPE "public"."capture_kind" AS ENUM('screenshot', 'dom_snapshot');--> statement-breakpoint
CREATE TYPE "public"."circuit_state" AS ENUM('closed', 'open', 'half_open');--> statement-breakpoint
CREATE TYPE "public"."claim_class" AS ENUM('objective_defect', 'subjective_observation', 'commercial_hypothesis');--> statement-breakpoint
CREATE TYPE "public"."confidence" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."conflict_status" AS ENUM('open', 'resolved_distinct', 'resolved_same');--> statement-breakpoint
CREATE TYPE "public"."contact_channel" AS ENUM('email', 'contact_form', 'phone', 'discord', 'instagram', 'linkedin', 'x', 'website', 'other');--> statement-breakpoint
CREATE TYPE "public"."contact_verification" AS ENUM('verified', 'probable', 'unverified');--> statement-breakpoint
CREATE TYPE "public"."data_origin" AS ENUM('real', 'sample');--> statement-breakpoint
CREATE TYPE "public"."date_precision" AS ENUM('day', 'month', 'quarter', 'year', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."drafter" AS ENUM('template', 'llm');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('collection_launch', 'opening', 'rebrand', 'funding', 'product_launch', 'expansion', 'roster_change', 'merch_drop', 'sponsorship', 'hiring', 'other');--> statement-breakpoint
CREATE TYPE "public"."evidence_origin" AS ENUM('extractor', 'adapter', 'user');--> statement-breakpoint
CREATE TYPE "public"."fact_reason" AS ENUM('not_searched', 'search_failed', 'blocked', 'no_evidence', 'ambiguous');--> statement-breakpoint
CREATE TYPE "public"."fact_state" AS ENUM('known', 'unknown', 'conflicting');--> statement-breakpoint
CREATE TYPE "public"."failure_behaviour" AS ENUM('partial_coverage', 'retry_then_partial', 'fail_run');--> statement-breakpoint
CREATE TYPE "public"."identity_status" AS ENUM('confirmed_official', 'probable', 'conflicting', 'inaccessible', 'none_found_after_search');--> statement-breakpoint
CREATE TYPE "public"."inconclusive_reason" AS ENUM('blocked', 'timeout', 'no_data', 'source_unavailable', 'ambiguous');--> statement-breakpoint
CREATE TYPE "public"."job_state" AS ENUM('queued', 'claimed', 'running', 'succeeded', 'inconclusive', 'failed', 'cancelled_budget', 'dead');--> statement-breakpoint
CREATE TYPE "public"."ledger_kind" AS ENUM('reserve', 'finalise', 'refund', 'grant', 'expire');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound', 'manual_log');--> statement-breakpoint
CREATE TYPE "public"."module_id" AS ENUM('fashion', 'creators', 'hospitality', 'local_services', 'professional', 'software', 'esports', 'custom');--> statement-breakpoint
CREATE TYPE "public"."outcome_kind" AS ENUM('won', 'lost', 'quoted', 'qualified', 'stalled');--> statement-breakpoint
CREATE TYPE "public"."pipeline_stage" AS ENUM('discovered', 'shortlisted', 'prepared', 'approved', 'contacted', 'replied', 'qualified', 'quoted', 'won', 'lost', 'suppressed');--> statement-breakpoint
CREATE TYPE "public"."relationship_kind" AS ENUM('parent_of', 'brand_of', 'branch_of', 'roster_of', 'competes_in');--> statement-breakpoint
CREATE TYPE "public"."reply_intent" AS ENUM('unclassified', 'interested', 'not_now', 'not_interested', 'opt_out', 'auto_reply');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'completed', 'completed_partial', 'capped', 'cancelled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."search_cadence" AS ENUM('manual', 'daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."send_status" AS ENUM('pending', 'sent', 'delivered', 'bounced', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."stage_id" AS ENUM('discover', 'normalize', 'resolve_identity', 'collect_evidence', 'inspect_site', 'find_contacts', 'rank', 'draft', 'send');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('absent', 'trialing', 'active', 'past_due', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."suppression_reason" AS ENUM('opt_out', 'bounce', 'manual', 'complaint');--> statement-breakpoint
CREATE TYPE "public"."suppression_scope" AS ENUM('email', 'domain', 'business', 'handle');--> statement-breakpoint
CREATE TYPE "public"."trust_level" AS ENUM('untrusted_web', 'user_supplied', 'internal');--> statement-breakpoint
CREATE TYPE "public"."unit_type" AS ENUM('deep_assessment', 'llm_draft', 'search_query');--> statement-breakpoint
CREATE TYPE "public"."viewport" AS ENUM('desktop', 'mobile');--> statement-breakpoint
CREATE TYPE "public"."workspace_kind" AS ENUM('real', 'sample');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"account_id" text NOT NULL,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_provider_unique" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" text,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "workspace_kind" DEFAULT 'real' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workspace_preference" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"capacity" "capacity_state" DEFAULT 'open' NOT NULL,
	"reduced_motion" boolean DEFAULT false NOT NULL,
	"default_run_cap" integer DEFAULT 25 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_project" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"role" text,
	"summary" text,
	"industry_tags" "module_id"[] DEFAULT '{}' NOT NULL,
	"is_representative" boolean DEFAULT false NOT NULL,
	"captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_claim" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"portfolio_project_id" text NOT NULL,
	"claim_type" text NOT NULL,
	"value" text NOT NULL,
	"extraction_confidence" "confidence" DEFAULT 'medium' NOT NULL,
	"extractor_version" text,
	"confirmed_by_user" boolean DEFAULT false NOT NULL,
	"confirmed_at" timestamp with time zone,
	"edited_by_user" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"headline" text,
	"services" text[] DEFAULT '{}' NOT NULL,
	"min_project_price_cents" integer,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"regions" text[] DEFAULT '{}' NOT NULL,
	"languages" text[] DEFAULT '{}' NOT NULL,
	"exclusions" text[] DEFAULT '{}' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"status" "brand_status" DEFAULT 'active' NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business" (
	"id" text PRIMARY KEY NOT NULL,
	"canonical_name" text NOT NULL,
	"name_key" text NOT NULL,
	"country" text,
	"region" text,
	"industry_module_ids" "module_id"[] DEFAULT '{}' NOT NULL,
	"maturity" "business_maturity" DEFAULT 'unknown' NOT NULL,
	"canonical_domain_state" "fact_state" DEFAULT 'unknown' NOT NULL,
	"canonical_domain" text,
	"canonical_domain_reason" "fact_reason",
	"data_origin" "data_origin" DEFAULT 'real' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dissolved_at" timestamp with time zone,
	CONSTRAINT "canonical_domain_state_matches_value" CHECK (((canonical_domain_state = 'known') = (canonical_domain IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "business_alias" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"alias" text NOT NULL,
	"alias_key" text NOT NULL,
	"kind" "alias_kind" NOT NULL,
	"evidence_id" text,
	"observed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_link" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"from_url" text NOT NULL,
	"to_url" text NOT NULL,
	"reciprocal" boolean DEFAULT false NOT NULL,
	"source_record_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_relationship" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text NOT NULL,
	"child_id" text NOT NULL,
	"kind" "relationship_kind" NOT NULL,
	"confidence" "confidence" DEFAULT 'medium' NOT NULL,
	"evidence_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_conflict" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"other_business_id" text NOT NULL,
	"reason" text NOT NULL,
	"status" "conflict_status" DEFAULT 'open' NOT NULL,
	"resolved_by_user_id" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"label" text,
	"country_code" text,
	"region" text,
	"city" text,
	"postal_code" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"rule_key" text NOT NULL,
	"module_id" "module_id" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"label" text NOT NULL,
	"classification" "claim_class" NOT NULL,
	"severity" integer DEFAULT 3 NOT NULL,
	"predicate" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_benchmark_case" (
	"id" text PRIMARY KEY NOT NULL,
	"module_id" "module_id" NOT NULL,
	"name" text NOT NULL,
	"fixture_path" text NOT NULL,
	"expectation" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "niche_module" (
	"id" text PRIMARY KEY NOT NULL,
	"module_id" "module_id" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"filter_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"discovery_available" boolean DEFAULT false NOT NULL,
	"coverage_note" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_adapter" (
	"id" text PRIMARY KEY NOT NULL,
	"adapter_key" text NOT NULL,
	"label" text NOT NULL,
	"module_ids" "module_id"[] DEFAULT '{}' NOT NULL,
	"access_method" "access_method" NOT NULL,
	"capability_id" text NOT NULL,
	"freshness_days" integer DEFAULT 30 NOT NULL,
	"rate_limit_per_min" integer DEFAULT 30 NOT NULL,
	"pagination_kind" text,
	"failure_behaviour" "failure_behaviour" DEFAULT 'partial_coverage' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"event_type" "event_type" NOT NULL,
	"title" text,
	"event_date" timestamp with time zone,
	"event_date_precision" date_precision DEFAULT 'unknown' NOT NULL,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evidence_id" text NOT NULL,
	"data_origin" "data_origin" DEFAULT 'real' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"source_record_id" text NOT NULL,
	"claim_key" text NOT NULL,
	"claim_value" jsonb,
	"excerpt" text,
	"excerpt_start" integer,
	"excerpt_end" integer,
	"classification" "claim_class" NOT NULL,
	"confidence" "confidence" DEFAULT 'medium' NOT NULL,
	"origin" "evidence_origin" DEFAULT 'extractor' NOT NULL,
	"extractor_version" text,
	"observed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"superseded_by_id" text,
	"data_origin" "data_origin" DEFAULT 'real' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_record" (
	"id" text PRIMARY KEY NOT NULL,
	"adapter_id" text,
	"url" text NOT NULL,
	"url_hash" text NOT NULL,
	"http_status" integer,
	"final_url" text,
	"redirect_chain" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_type" text,
	"content_hash" text,
	"byte_length" integer,
	"blob_ref" text,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trust_level" "trust_level" DEFAULT 'untrusted_web' NOT NULL,
	"injection_flagged" boolean DEFAULT false NOT NULL,
	"injection_detail" text,
	"data_origin" "data_origin" DEFAULT 'real' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment" (
	"id" text PRIMARY KEY NOT NULL,
	"website_candidate_id" text NOT NULL,
	"workspace_id" text,
	"status" "assessment_status" NOT NULL,
	"inconclusive_reason" "inconclusive_reason",
	"blocked_detail" text,
	"ruleset_version" text NOT NULL,
	"engine_version" text NOT NULL,
	"pages_visited" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"data_origin" "data_origin" DEFAULT 'real' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capture" (
	"id" text PRIMARY KEY NOT NULL,
	"assessment_id" text NOT NULL,
	"kind" "capture_kind" DEFAULT 'screenshot' NOT NULL,
	"viewport" "viewport" NOT NULL,
	"url" text NOT NULL,
	"blob_ref" text NOT NULL,
	"width" integer,
	"height" integer,
	"bytes" integer,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finding" (
	"id" text PRIMARY KEY NOT NULL,
	"assessment_id" text NOT NULL,
	"rule_key" text NOT NULL,
	"classification" "claim_class" NOT NULL,
	"severity" integer DEFAULT 3 NOT NULL,
	"summary" text NOT NULL,
	"detail" jsonb,
	"observed_url" text,
	"capture_id" text,
	"evidence_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "website_candidate" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"url" text,
	"normalised_host" text,
	"identity_status" "identity_status" DEFAULT 'probable' NOT NULL,
	"identity_confidence" "confidence" DEFAULT 'low' NOT NULL,
	"signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"searched_via" text[] DEFAULT '{}' NOT NULL,
	"searched_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"data_origin" "data_origin" DEFAULT 'real' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"role" text,
	"role_evidence_id" text,
	"channel" "contact_channel" NOT NULL,
	"value" text NOT NULL,
	"value_hash" text NOT NULL,
	"verification" "contact_verification" DEFAULT 'unverified' NOT NULL,
	"source_record_id" text NOT NULL,
	"last_checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data_origin" "data_origin" DEFAULT 'real' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"business_id" text NOT NULL,
	"module_id" "module_id" NOT NULL,
	"dedupe_key" text NOT NULL,
	"fit_score" integer DEFAULT 0 NOT NULL,
	"evidence_score" integer DEFAULT 0 NOT NULL,
	"timing_score" integer DEFAULT 0 NOT NULL,
	"activity_score" integer DEFAULT 0 NOT NULL,
	"contactability_score" integer DEFAULT 0 NOT NULL,
	"total_score" integer DEFAULT 0 NOT NULL,
	"confidence_band" "confidence" DEFAULT 'low' NOT NULL,
	"stage" "pipeline_stage" DEFAULT 'discovered' NOT NULL,
	"blocked_reason" "block_reason",
	"excluded" boolean DEFAULT false NOT NULL,
	"excluded_reason" text,
	"portfolio_project_id" text,
	"match_explanation" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"data_origin" "data_origin" DEFAULT 'real' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_module_hit" (
	"id" text PRIMARY KEY NOT NULL,
	"opportunity_id" text NOT NULL,
	"module_id" "module_id" NOT NULL,
	"run_id" text,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_score_input" (
	"id" text PRIMARY KEY NOT NULL,
	"opportunity_id" text NOT NULL,
	"component" text NOT NULL,
	"label" text NOT NULL,
	"contribution" integer NOT NULL,
	"evidence_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text,
	"workspace_id" text NOT NULL,
	"stage" "stage_id" NOT NULL,
	"state" "job_state" DEFAULT 'queued' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"inconclusive_reason" "inconclusive_reason",
	"inconclusive_detail" text,
	"attempt" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"idempotency_key" text NOT NULL,
	"cost_units" integer DEFAULT 0 NOT NULL,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_by" text,
	"claimed_at" timestamp with time zone,
	"lease_until" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_call" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text,
	"provider" text NOT NULL,
	"capability_id" text NOT NULL,
	"request_hash" text,
	"http_status" integer,
	"latency_ms" integer,
	"cost_units" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_circuit" (
	"provider" text PRIMARY KEY NOT NULL,
	"state" "circuit_state" DEFAULT 'closed' NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"opened_at" timestamp with time zone,
	"cooldown_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_run" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"saved_search_id" text,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"module_ids" "module_id"[] DEFAULT '{}' NOT NULL,
	"unit_cap" integer NOT NULL,
	"units_reserved" integer DEFAULT 0 NOT NULL,
	"units_finalised" integer DEFAULT 0 NOT NULL,
	"units_refunded" integer DEFAULT 0 NOT NULL,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"coverage" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_search" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"module_ids" "module_id"[] DEFAULT '{}' NOT NULL,
	"cadence" "search_cadence" DEFAULT 'manual' NOT NULL,
	"last_run_at" timestamp with time zone,
	"paused" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"message_id" text NOT NULL,
	"approved_body_hash" text NOT NULL,
	"approved_by_user_id" text,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"channel" "contact_channel" NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"pause_reason" "campaign_pause_reason",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"opportunity_id" text NOT NULL,
	"channel" "contact_channel" NOT NULL,
	"external_thread_id" text,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_message" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"direction" "message_direction" NOT NULL,
	"body" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_message_id" text,
	"intent" "reply_intent" DEFAULT 'unclassified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow_up_schedule" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"message_id" text NOT NULL,
	"step_number" integer DEFAULT 1 NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"opportunity_id" text NOT NULL,
	"contact_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"body_hash" text NOT NULL,
	"portfolio_project_id" text,
	"grounding_evidence_ids" text[] NOT NULL,
	"generated_by" "drafter" DEFAULT 'template' NOT NULL,
	"drafter_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_must_be_grounded" CHECK (array_length(grounding_evidence_ids, 1) >= 1)
);
--> statement-breakpoint
CREATE TABLE "outcome" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"opportunity_id" text NOT NULL,
	"kind" "outcome_kind" NOT NULL,
	"loss_reason" text,
	"deal_value_cents" integer,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"note" text,
	"recorded_by_user_id" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "send_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"message_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider_message_id" text,
	"status" "send_status" DEFAULT 'pending' NOT NULL,
	"failure_code" text,
	"failure_detail" text,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"manual" text
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"actor_user_id" text,
	"action" text NOT NULL,
	"subject_type" text,
	"subject_id" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blob_object" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"backend" "blob_backend" DEFAULT 'fs' NOT NULL,
	"key" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" bigint DEFAULT 0 NOT NULL,
	"sha256" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"provider" text,
	"external_id" text,
	"status" "subscription_status" DEFAULT 'absent' NOT NULL,
	"plan_key" text DEFAULT 'pro' NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"cancel_at_period_end" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppression" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"scope" "suppression_scope" NOT NULL,
	"value_hash" text NOT NULL,
	"reason" "suppression_reason" NOT NULL,
	"note" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" "ledger_kind" NOT NULL,
	"unit_type" "unit_type" NOT NULL,
	"units" integer NOT NULL,
	"run_id" text,
	"job_id" text,
	"idempotency_key" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_preference" ADD CONSTRAINT "workspace_preference_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_project" ADD CONSTRAINT "portfolio_project_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_claim" ADD CONSTRAINT "profile_claim_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_claim" ADD CONSTRAINT "profile_claim_portfolio_project_id_portfolio_project_id_fk" FOREIGN KEY ("portfolio_project_id") REFERENCES "public"."portfolio_project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_profile" ADD CONSTRAINT "service_profile_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand" ADD CONSTRAINT "brand_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_alias" ADD CONSTRAINT "business_alias_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_link" ADD CONSTRAINT "business_link_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_relationship" ADD CONSTRAINT "business_relationship_parent_id_business_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_relationship" ADD CONSTRAINT "business_relationship_child_id_business_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_conflict" ADD CONSTRAINT "identity_conflict_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_conflict" ADD CONSTRAINT "identity_conflict_other_business_id_business_id_fk" FOREIGN KEY ("other_business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_conflict" ADD CONSTRAINT "identity_conflict_resolved_by_user_id_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location" ADD CONSTRAINT "location_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_source_record_id_source_record_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."source_record"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_website_candidate_id_website_candidate_id_fk" FOREIGN KEY ("website_candidate_id") REFERENCES "public"."website_candidate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture" ADD CONSTRAINT "capture_assessment_id_assessment_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding" ADD CONSTRAINT "finding_assessment_id_assessment_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding" ADD CONSTRAINT "finding_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_candidate" ADD CONSTRAINT "website_candidate_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_source_record_id_source_record_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."source_record"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_portfolio_project_id_portfolio_project_id_fk" FOREIGN KEY ("portfolio_project_id") REFERENCES "public"."portfolio_project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_module_hit" ADD CONSTRAINT "opportunity_module_hit_opportunity_id_opportunity_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_score_input" ADD CONSTRAINT "opportunity_score_input_opportunity_id_opportunity_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_run_id_research_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."research_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_call" ADD CONSTRAINT "provider_call_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_run" ADD CONSTRAINT "research_run_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_search" ADD CONSTRAINT "saved_search_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_opportunity_id_opportunity_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_message" ADD CONSTRAINT "conversation_message_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_message" ADD CONSTRAINT "conversation_message_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_message" ADD CONSTRAINT "conversation_message_source_message_id_message_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."message"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_schedule" ADD CONSTRAINT "follow_up_schedule_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_schedule" ADD CONSTRAINT "follow_up_schedule_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_opportunity_id_opportunity_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_portfolio_project_id_portfolio_project_id_fk" FOREIGN KEY ("portfolio_project_id") REFERENCES "public"."portfolio_project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcome" ADD CONSTRAINT "outcome_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcome" ADD CONSTRAINT "outcome_opportunity_id_opportunity_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcome" ADD CONSTRAINT "outcome_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send_attempt" ADD CONSTRAINT "send_attempt_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send_attempt" ADD CONSTRAINT "send_attempt_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blob_object" ADD CONSTRAINT "blob_object_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression" ADD CONSTRAINT "suppression_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "membership_user_idx" ON "membership" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_expires_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "workspace_kind_idx" ON "workspace" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "portfolio_project_workspace_idx" ON "portfolio_project" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "portfolio_project_representative_idx" ON "portfolio_project" USING btree ("workspace_id","is_representative");--> statement-breakpoint
CREATE INDEX "profile_claim_project_idx" ON "profile_claim" USING btree ("portfolio_project_id");--> statement-breakpoint
CREATE INDEX "profile_claim_confirmed_idx" ON "profile_claim" USING btree ("workspace_id","confirmed_by_user");--> statement-breakpoint
CREATE INDEX "service_profile_workspace_idx" ON "service_profile" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "brand_business_idx" ON "brand" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "brand_name_key_idx" ON "brand" USING btree ("name_key");--> statement-breakpoint
CREATE INDEX "business_name_key_idx" ON "business" USING btree ("name_key");--> statement-breakpoint
CREATE INDEX "business_origin_idx" ON "business" USING btree ("data_origin");--> statement-breakpoint
CREATE UNIQUE INDEX "business_domain_unique" ON "business" USING btree ("canonical_domain") WHERE canonical_domain IS NOT NULL AND data_origin = 'real';--> statement-breakpoint
CREATE INDEX "business_alias_business_idx" ON "business_alias" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "business_alias_key_idx" ON "business_alias" USING btree ("alias_key");--> statement-breakpoint
CREATE INDEX "business_link_business_idx" ON "business_link" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_relationship_unique" ON "business_relationship" USING btree ("parent_id","child_id","kind");--> statement-breakpoint
CREATE INDEX "business_relationship_child_idx" ON "business_relationship" USING btree ("child_id");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_conflict_pair_unique" ON "identity_conflict" USING btree ("business_id","other_business_id");--> statement-breakpoint
CREATE INDEX "identity_conflict_open_idx" ON "identity_conflict" USING btree ("business_id") WHERE status = 'open';--> statement-breakpoint
CREATE INDEX "identity_conflict_other_open_idx" ON "identity_conflict" USING btree ("other_business_id") WHERE status = 'open';--> statement-breakpoint
CREATE INDEX "location_business_idx" ON "location" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_rule_unique" ON "assessment_rule" USING btree ("rule_key","module_id","version");--> statement-breakpoint
CREATE INDEX "assessment_rule_module_idx" ON "assessment_rule" USING btree ("module_id");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_case_unique" ON "module_benchmark_case" USING btree ("module_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "niche_module_version_unique" ON "niche_module" USING btree ("module_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "source_adapter_key_unique" ON "source_adapter" USING btree ("adapter_key");--> statement-breakpoint
CREATE INDEX "event_business_idx" ON "event" USING btree ("business_id","event_date");--> statement-breakpoint
CREATE INDEX "event_type_idx" ON "event" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "event_evidence_idx" ON "event" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "evidence_business_idx" ON "evidence" USING btree ("business_id","observed_at");--> statement-breakpoint
CREATE INDEX "evidence_source_idx" ON "evidence" USING btree ("source_record_id");--> statement-breakpoint
CREATE INDEX "evidence_claim_idx" ON "evidence" USING btree ("business_id","claim_key");--> statement-breakpoint
CREATE INDEX "evidence_expiry_idx" ON "evidence" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "source_record_url_content_unique" ON "source_record" USING btree ("url_hash","content_hash");--> statement-breakpoint
CREATE INDEX "source_record_retrieved_idx" ON "source_record" USING btree ("retrieved_at");--> statement-breakpoint
CREATE INDEX "source_record_url_idx" ON "source_record" USING btree ("url_hash");--> statement-breakpoint
CREATE INDEX "assessment_candidate_idx" ON "assessment" USING btree ("website_candidate_id","started_at");--> statement-breakpoint
CREATE INDEX "assessment_workspace_idx" ON "assessment" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "assessment_status_idx" ON "assessment" USING btree ("status");--> statement-breakpoint
CREATE INDEX "capture_assessment_idx" ON "capture" USING btree ("assessment_id","viewport");--> statement-breakpoint
CREATE INDEX "finding_assessment_idx" ON "finding" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "finding_rule_idx" ON "finding" USING btree ("rule_key");--> statement-breakpoint
CREATE INDEX "website_candidate_business_idx" ON "website_candidate" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "website_candidate_host_idx" ON "website_candidate" USING btree ("normalised_host");--> statement-breakpoint
CREATE INDEX "website_candidate_status_idx" ON "website_candidate" USING btree ("identity_status");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_unique" ON "contact" USING btree ("business_id","channel","value_hash");--> statement-breakpoint
CREATE INDEX "contact_business_idx" ON "contact" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "contact_value_hash_idx" ON "contact" USING btree ("value_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_dedupe_unique" ON "opportunity" USING btree ("workspace_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "opportunity_workspace_stage_idx" ON "opportunity" USING btree ("workspace_id","stage");--> statement-breakpoint
CREATE INDEX "opportunity_workspace_score_idx" ON "opportunity" USING btree ("workspace_id","total_score");--> statement-breakpoint
CREATE INDEX "opportunity_business_idx" ON "opportunity" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "opportunity_origin_idx" ON "opportunity" USING btree ("workspace_id","data_origin");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_module_hit_unique" ON "opportunity_module_hit" USING btree ("opportunity_id","module_id");--> statement-breakpoint
CREATE INDEX "opportunity_module_hit_run_idx" ON "opportunity_module_hit" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "opportunity_score_input_idx" ON "opportunity_score_input" USING btree ("opportunity_id","component");--> statement-breakpoint
CREATE UNIQUE INDEX "job_idempotency_unique" ON "job" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "job_claimable_idx" ON "job" USING btree ("scheduled_at") WHERE state = 'queued';--> statement-breakpoint
CREATE INDEX "job_run_stage_idx" ON "job" USING btree ("run_id","stage");--> statement-breakpoint
CREATE INDEX "job_lease_idx" ON "job" USING btree ("lease_until") WHERE state in ('claimed','running');--> statement-breakpoint
CREATE INDEX "job_workspace_idx" ON "job" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "provider_call_job_idx" ON "provider_call" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "provider_call_provider_idx" ON "provider_call" USING btree ("provider","created_at");--> statement-breakpoint
CREATE INDEX "research_run_workspace_idx" ON "research_run" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "research_run_status_idx" ON "research_run" USING btree ("status");--> statement-breakpoint
CREATE INDEX "saved_search_workspace_idx" ON "saved_search" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "approval_message_idx" ON "approval" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "campaign_workspace_idx" ON "campaign" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "conversation_workspace_idx" ON "conversation" USING btree ("workspace_id","last_message_at");--> statement-breakpoint
CREATE INDEX "conversation_opportunity_idx" ON "conversation" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "conversation_message_thread_idx" ON "conversation_message" USING btree ("conversation_id","occurred_at");--> statement-breakpoint
CREATE INDEX "follow_up_due_idx" ON "follow_up_schedule" USING btree ("scheduled_at") WHERE cancelled_at IS NULL AND sent_at IS NULL;--> statement-breakpoint
CREATE INDEX "follow_up_message_idx" ON "follow_up_schedule" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_campaign_idx" ON "message" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "message_opportunity_idx" ON "message" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "outcome_opportunity_idx" ON "outcome" USING btree ("opportunity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "send_attempt_idempotency_unique" ON "send_attempt" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "send_attempt_message_idx" ON "send_attempt" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "audit_event_workspace_idx" ON "audit_event" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_event_action_idx" ON "audit_event" USING btree ("action");--> statement-breakpoint
CREATE UNIQUE INDEX "blob_object_key_unique" ON "blob_object" USING btree ("backend","key");--> statement-breakpoint
CREATE INDEX "blob_object_workspace_idx" ON "blob_object" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "blob_object_expiry_idx" ON "blob_object" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "subscription_status_idx" ON "subscription" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "suppression_unique" ON "suppression" USING btree ("workspace_id","scope","value_hash");--> statement-breakpoint
CREATE INDEX "suppression_lookup_idx" ON "suppression" USING btree ("scope","value_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_ledger_idempotency_unique" ON "usage_ledger" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "usage_ledger_workspace_idx" ON "usage_ledger" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_ledger_run_idx" ON "usage_ledger" USING btree ("run_id");
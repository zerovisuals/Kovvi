/**
 * Shared inspection vocabulary.
 *
 * `ClaimClass` mirrors the `claim_class` database enum. It lives here as well
 * so the inspection engine — which runs in a plain Node worker and should not
 * need to import the schema to name a classification — can use it directly.
 */
export type ClaimClass = 'objective_defect' | 'subjective_observation' | 'commercial_hypothesis';

import { eraseStage, type AnyStage, type Stage, type StageId, type UnitType } from './stage';
import { inspectSiteStage } from './stages/inspect-site';

/**
 * The pipeline, assembled.
 *
 * Stages are registered here rather than discovered dynamically so that the set
 * of things the product can do is a list you can read, and so a stage that has
 * not been built is a loud error rather than a silently missing step.
 */

const STAGES = new Map<StageId, AnyStage>();

function register<I, O>(stage: Stage<I, O>): void {
  STAGES.set(stage.id, eraseStage(stage));
}

register(inspectSiteStage);

export function getStage(id: StageId): AnyStage {
  const stage = STAGES.get(id);
  if (!stage) {
    throw new Error(
      `Pipeline stage "${id}" is not implemented. It is declared in the stage vocabulary but ` +
        `has no registration in src/server/pipeline/registry.ts.`,
    );
  }
  return stage;
}

export function hasStage(id: StageId): boolean {
  return STAGES.has(id);
}

export function registeredStages(): readonly StageId[] {
  return [...STAGES.keys()];
}

/** Which unit type a stage spends. Used when refunding, where the input is gone. */
export function stageCost(id: StageId): UnitType {
  switch (id) {
    case 'inspect_site':
      return 'deep_assessment';
    case 'draft':
      return 'llm_draft';
    case 'discover':
      return 'search_query';
    default:
      return 'deep_assessment';
  }
}

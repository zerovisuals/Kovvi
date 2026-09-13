import { StatePanel, type StatePanelProps } from './StatePanel';
import { getState, type StateKey } from './states';

/**
 * Renders one of the fifteen required states by key.
 *
 * Call sites use this rather than `StatePanel` directly, so the copy lives in
 * one place and cannot drift between the product and the `/states` gallery.
 * Overrides exist for the parts only the caller knows — which sources failed,
 * which contact opted out — never for the framing.
 */
export function ProductState({
  state,
  variant,
  ...overrides
}: {
  readonly state: StateKey;
  readonly variant?: StatePanelProps['variant'];
} & Partial<Pick<StatePanelProps, 'explanation' | 'whatWeKnow' | 'preserved' | 'actions' | 'title'>>) {
  const definition = getState(state);

  return (
    <StatePanel
      tone={definition.tone}
      glyph={definition.glyph}
      title={overrides.title ?? definition.title}
      explanation={overrides.explanation ?? definition.explanation}
      whatWeKnow={overrides.whatWeKnow ?? definition.whatWeKnow}
      preserved={overrides.preserved ?? definition.preserved}
      actions={overrides.actions ?? definition.actions}
      variant={variant}
    />
  );
}

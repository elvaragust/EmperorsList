import type { CSSProperties } from 'react';
import type { RuleKind } from '@/engine/types';

const NAMES: Record<RuleKind, string> = {
  core: 'Core rule',
  datasheet: 'Datasheet',
  stratagem: 'Stratagem',
  enhancement: 'Enhancement',
  detachment: 'Detachment rule',
  army: 'Army rule',
  ability: 'Ability',
  keyword: 'Keyword',
  weaponAbility: 'Weapon ability',
};

/** Change this one value once a label style is picked on the design canvas. */
export const LABEL_VARIANT: 'dotted' | 'bold' | 'underline' = 'dotted';

export function RuleLabel({ kind, children }: { kind: RuleKind; children?: React.ReactNode }) {
  const style = { '--rule-color': `var(--rule-${kind})` } as CSSProperties;
  return (
    <span className="rule-label" data-variant={LABEL_VARIANT} style={style}>
      {children ?? NAMES[kind]}
    </span>
  );
}

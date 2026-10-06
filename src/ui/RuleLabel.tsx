import type { CSSProperties } from 'react';
import type { RuleKind } from '@/engine/types';
import { useAppearance } from '@/theme/appearance';

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


export function RuleLabel({ kind, children }: { kind: RuleKind; children?: React.ReactNode }) {
  const { labelStyle } = useAppearance();
  const style = { '--rule-color': `var(--rule-${kind})` } as CSSProperties;
  return (
    <span className="rule-label" data-variant={labelStyle} style={style}>
      {children ?? NAMES[kind]}
    </span>
  );
}

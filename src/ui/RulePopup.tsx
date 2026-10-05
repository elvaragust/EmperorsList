import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { DataIndex } from '@/engine/bsdata/index';
import { lookupRule, type RuleDef } from '@/engine/rules/glossary';
import { RuleLabel } from './RuleLabel';
import { Sheet } from './Sheet';
import { RulesText } from './RulesText';

interface PopupState {
  def?: RuleDef;
  term?: string;
  index?: DataIndex;
  extra?: ReactNode;
}
interface PopupApi {
  /** Look up a word in the data and show its definition. */
  openTerm: (term: string, index?: DataIndex) => void;
  /** Show a definition you already have (e.g. a stratagem). */
  openDef: (def: RuleDef, index?: DataIndex, extra?: ReactNode) => void;
}

const Ctx = createContext<PopupApi>({ openTerm: () => undefined, openDef: () => undefined });
export const useRulePopup = () => useContext(Ctx);

export function RulePopupProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PopupState | null>(null);
  const openTerm = useCallback((term: string, index?: DataIndex) => {
    const def = index ? lookupRule(index, term) : undefined;
    setState({ def, term, index });
  }, []);
  const openDef = useCallback((def: RuleDef, index?: DataIndex, extra?: ReactNode) => setState({ def, index, extra }), []);
  const api = useMemo(() => ({ openTerm, openDef }), [openTerm, openDef]);
  const close = useCallback(() => setState(null), []);
  const def = state?.def;
  return (
    <Ctx.Provider value={api}>
      {children}
      <Sheet open={Boolean(state)} onClose={close} title={def?.name ?? state?.term}>
        {def ? (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <RuleLabel kind={def.kind} />
              {def.source && <span className="muted small">{def.source}</span>}
            </div>
            {state?.extra}
            {def.text ? <RulesText text={def.text} index={state?.index} /> : <p className="muted">This keyword has no rules text of its own in the data.</p>}
          </>
        ) : (
          <p className="muted">No definition for this in the downloaded data. It may be a unit keyword, or a rule only found in the core rules book.</p>
        )}
      </Sheet>
    </Ctx.Provider>
  );
}

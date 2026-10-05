import type { DataIndex } from '../bsdata/index';
import type { RawCondition, RawConditionGroup, RawConstraint, RawLocalConditionGroup, RawRepeat } from '../bsdata/raw';
import { descendants, forceOf, rosterOf, unitRootOf, type Inst } from './instance';
import type { FlatModifier, OptNode } from './nodes';

export const PTS = '51b2-306e-1021-d207';

type Measured = { field: string; scope: string; childId?: string; includeChildSelections?: boolean; includeChildForces?: boolean };

/**
 * Evaluates BattleScribe conditions, repeats and modifiers against a roster
 * instance tree. Results are memoised per instance, so build a new Evaluator
 * after the roster changes.
 *
 * Supported: conditions on selections / forces / costs / associations with
 * every scope the 11th edition data uses; instanceOf; nested condition groups;
 * New Recruit modifierGroups and localConditionGroups; repeats; modifiers on
 * hidden, name, costs, constraint values, categories and defaultAmount.
 * Not yet applied: modifiers that change other entries' profiles ("affects").
 */
export class Evaluator {
  private hiddenMemo = new WeakMap<Inst, boolean>();
  private costMemo = new WeakMap<Inst, Map<string, number>>();
  private catMemo = new WeakMap<Inst, Set<string>>();
  private catBusy = new WeakSet<Inst>();

  constructor(readonly index: DataIndex) {}

  // ---------- matching ----------

  categories(inst: Inst): Set<string> {
    const hit = this.catMemo.get(inst);
    if (hit) return hit;
    const base = new Set(inst.node?.categoryIds ?? []);
    if (!inst.node || this.catBusy.has(inst)) return base;
    this.catBusy.add(inst);
    for (const fm of inst.node.modifiers) {
      if (fm.mod.field !== 'category') continue;
      const times = this.timesApplies(fm, inst);
      if (!times) continue;
      const v = String(fm.mod.value);
      if (fm.mod.type === 'add' || fm.mod.type === 'set-primary') base.add(v);
      else if (fm.mod.type === 'remove' || fm.mod.type === 'unset-primary') base.delete(v);
    }
    this.catBusy.delete(inst);
    this.catMemo.set(inst, base);
    return base;
  }

  matches(inst: Inst, childId: string | undefined, ownerIds?: string[]): boolean {
    if (!childId) return ownerIds ? ownerIds.some((id) => inst.ids.has(id)) : true;
    if (childId === 'any') return inst.kind === 'selection';
    if (inst.kind !== 'selection') return inst.ids.has(childId);
    if (childId === 'model' || childId === 'unit' || childId === 'upgrade') return inst.node?.type === childId;
    return inst.ids.has(childId) || this.categories(inst).has(childId);
  }

  // ---------- scopes ----------

  scopeInsts(scope: string, self: Inst): Inst[] {
    switch (scope) {
      case 'self':
        return [self];
      case 'parent':
        return self.parent ? [self.parent] : [];
      case 'force': {
        const f = forceOf(self);
        return f ? [f] : [];
      }
      case 'roster':
        return [rosterOf(self)];
      case 'primary-catalogue': {
        const f = forceOf(self);
        return f ? [f] : [];
      }
      case 'ancestor': {
        const out: Inst[] = [];
        let cur = self.parent;
        while (cur) {
          out.push(cur);
          cur = cur.parent;
        }
        return out;
      }
      case 'root-entry': {
        const r = unitRootOf(self);
        return r ? [r] : [];
      }
      case 'unit':
      case 'unit-self':
      case 'model':
      case 'upgrade':
      case 'model-or-unit': {
        const types = scope === 'model-or-unit' ? ['model', 'unit'] : [scope === 'unit-self' ? 'unit' : scope];
        let cur: Inst | undefined = self;
        while (cur && cur.kind === 'selection') {
          if (cur.node?.type && types.includes(cur.node.type)) return [cur];
          cur = cur.parent;
        }
        return [];
      }
      default: {
        let cur: Inst | undefined = self;
        while (cur) {
          if (cur.ids.has(scope)) return [cur];
          cur = cur.parent;
        }
        return [];
      }
    }
  }

  // ---------- measuring ----------

  /** Number of matching selections (weighted by counts) or summed cost under a scope instance. */
  measure(m: Measured, scopeInst: Inst, ownerIds?: string[]): number {
    const { field } = m;
    if (field === 'forces') {
      const roster = rosterOf(scopeInst);
      return roster.children.filter((f) => !m.childId || f.ids.has(m.childId)).length;
    }
    if (field === 'associations') {
      const unit = unitRootOf(scopeInst) ?? scopeInst;
      const attached = (unit.attached ?? []).filter((a) => this.matches(a, m.childId)).length;
      // Without a childId the count is from the character's side: is it attached to a unit?
      return m.childId ? attached : attached + (unit.unit?.leaderOf ? 1 : 0);
    }
    const isCost = field !== 'selections';
    const recursive = isCost || Boolean(m.includeChildSelections);
    let total = 0;
    const visit = (inst: Inst, weight: number, depth: number) => {
      for (const c of inst.children) {
        if (c.kind !== 'selection') {
          visit(c, weight, depth); // forces are transparent
          continue;
        }
        const w = weight * c.count;
        if (w > 0) {
          if (isCost) {
            if (!m.childId || m.childId === 'any' || this.matches(c, m.childId)) total += this.cost(c, field) * w;
          } else if (this.matches(c, m.childId, ownerIds)) total += w;
        }
        if (recursive) visit(c, w, depth + 1);
      }
    };
    if (isCost && scopeInst.kind === 'selection' && (!m.childId || m.childId === 'any')) total += this.cost(scopeInst, field) * Math.max(scopeInst.count, 0);
    visit(scopeInst, 1, 0);
    return total;
  }

  // ---------- conditions ----------

  condition(c: RawCondition, self: Inst, origin: Inst = self): boolean {
    if (c.type === 'instanceOf' || c.type === 'notInstanceOf') {
      const targets = this.scopeInsts(c.scope, self);
      const hit = targets.some((t) => this.matches(t, c.childId));
      return c.type === 'instanceOf' ? hit : !hit;
    }
    if (c.type === 'before') return self.order <= origin.order;
    if (c.type === 'after') return self.order > origin.order;
    const scopes = this.scopeInsts(c.scope, self);
    const n = scopes.length ? this.measure(c, scopes[0]!) : 0;
    return compare(c.type, n, c.value);
  }

  group(g: RawConditionGroup, self: Inst, origin: Inst = self): boolean {
    const results: boolean[] = [];
    g.conditions?.forEach((c) => results.push(this.condition(c, self, origin)));
    g.conditionGroups?.forEach((cg) => results.push(this.group(cg, self, origin)));
    g.localConditionGroups?.forEach((l) => results.push(this.local(l, self)));
    if (!results.length) return true;
    return g.type === 'or' ? results.some(Boolean) : results.every(Boolean);
  }

  /** Count instances in scope that pass every inner condition, then compare. */
  local(l: RawLocalConditionGroup, self: Inst): boolean {
    const scopes = this.scopeInsts(l.scope, self);
    if (!scopes.length) return compare(l.type, 0, l.value);
    let n = 0;
    for (const cand of descendants(scopes[0]!)) {
      if (cand.kind !== 'selection') continue;
      if (!l.includeChildSelections && cand.parent !== scopes[0] && cand.parent?.kind === 'selection') continue;
      const ok = (l.conditions ?? []).every((c) => this.condition(c, cand, self)) && (l.conditionGroups ?? []).every((g) => this.group(g, cand, self));
      if (ok) n += Math.max(cand.count, 1);
    }
    return compare(l.type, n, l.value);
  }

  allPass(x: { conditions?: RawCondition[]; conditionGroups?: RawConditionGroup[] }, self: Inst): boolean {
    return (x.conditions ?? []).every((c) => this.condition(c, self)) && (x.conditionGroups ?? []).every((g) => this.group(g, self));
  }

  repeatTimes(repeats: RawRepeat[] | undefined, self: Inst): number {
    if (!repeats?.length) return 1;
    let times = 0;
    for (const r of repeats) {
      const scopes = this.scopeInsts(r.scope, self);
      const n = scopes.length ? this.measure(r, scopes[0]!) : 0;
      if (!r.value) continue;
      const q = r.roundUp ? Math.ceil(n / r.value) : Math.floor(n / r.value);
      times += q * (r.repeats || 1);
    }
    return times;
  }

  /** How many times a modifier applies to `self` (0 = not at all). */
  timesApplies(fm: FlatModifier, self: Inst): number {
    for (const o of fm.outer) if (!this.allPass(o, self)) return 0;
    if (!this.allPass(fm.mod, self)) return 0;
    let times = this.repeatTimes(fm.mod.repeats, self);
    for (const o of fm.outer) if (o.repeats?.length) times *= this.repeatTimes(o.repeats, self);
    return times;
  }

  // ---------- effective values ----------

  numeric(node: OptNode | undefined, field: string, base: number, self: Inst, mods = node?.modifiers ?? []): number {
    let v = base;
    for (const fm of mods) {
      if (fm.mod.field !== field) continue;
      const times = this.timesApplies(fm, self);
      if (!times) continue;
      const x = Number(fm.mod.value);
      switch (fm.mod.type) {
        case 'set':
          v = x;
          break;
        case 'increment':
          v += x * times;
          break;
        case 'decrement':
          v -= x * times;
          break;
        case 'multiply':
          v *= x;
          break;
        case 'divide':
          if (x) v /= x;
          break;
        case 'floor':
          v = Math.floor(v);
          break;
        default:
      }
    }
    return v;
  }

  hidden(inst: Inst): boolean {
    const hit = this.hiddenMemo.get(inst);
    if (hit !== undefined) return hit;
    const node = inst.node;
    let h = Boolean(node?.hidden);
    if (node) {
      for (const fm of node.modifiers) {
        if (fm.mod.field !== 'hidden') continue;
        if (this.timesApplies(fm, inst)) h = fm.mod.value === true || fm.mod.value === 'true';
      }
    }
    this.hiddenMemo.set(inst, h);
    return h;
  }

  cost(inst: Inst, typeId: string): number {
    let m = this.costMemo.get(inst);
    if (!m) {
      m = new Map();
      this.costMemo.set(inst, m);
    }
    const hit = m.get(typeId);
    if (hit !== undefined) return hit;
    m.set(typeId, 0); // guard against cycles
    const base = inst.node?.costs.find((c) => c.typeId === typeId)?.value ?? 0;
    const v = this.numeric(inst.node, typeId, base, inst);
    m.set(typeId, v);
    return v;
  }

  name(inst: Inst): string {
    const node = inst.node;
    if (!node) return '';
    let n = node.name;
    for (const fm of node.modifiers) {
      if (fm.mod.field !== 'name' || !this.timesApplies(fm, inst)) continue;
      const v = String(fm.mod.value);
      if (fm.mod.type === 'set') n = v;
      else if (fm.mod.type === 'append') n = `${n}${fm.mod.join ?? ' '}${v}`;
    }
    return n;
  }

  /** Effective value of a constraint (modifiers target constraints by id). -1 means no limit. */
  constraintValue(c: RawConstraint, owner: Inst, mods: FlatModifier[] = owner.node?.modifiers ?? []): number {
    return this.numeric(owner.node, c.id, c.value, owner, mods);
  }
}

export function compare(type: string, n: number, v: number): boolean {
  switch (type) {
    case 'atLeast':
      return n >= v;
    case 'atMost':
      return n <= v;
    case 'greaterThan':
      return n > v;
    case 'lessThan':
      return n < v;
    case 'equalTo':
      return n === v;
    case 'notEqualTo':
      return n !== v;
    default:
      return false;
  }
}

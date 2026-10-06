import { rootLinks, type DataIndex } from '../bsdata/index';
import type { RawConstraint } from '../bsdata/raw';
import type { Issue, Roster, RosterUnit } from '../types';
import { Evaluator, PTS } from './evaluate';
import { buildRosterTree, virtualChild, type Inst, type RosterTree } from './instance';
import { childNodes, flattenModifiers, groupsUnder, nodeFor, offeredEntries, type FlatModifier, type OptNode } from './nodes';

export const DP = '82ae-1066-5107-6ae0';
export const ENH = 'f759-1bc4-cb3a-f0d2';
export const CONFIG_CATEGORY = '4ac9-fd30-1e3d-b249';
export const WARLORD_CATEGORY = '5c0e-4c31-d51b-e470';
export const LEADER_CATEGORY = '1556-9b56-fba6-4370';
export const SUPPORT_CATEGORY = '7dcd-7f61-69a7-0294';
export const EPIC_HERO_CATEGORY = '4f3a-f0f7-6647-348d';
const CHECKED_COSTS = new Set([PTS, DP, ENH]);

export interface RootOption {
  key: string;
  node: OptNode;
  catalogueId: string;
  config: boolean;
}

/** Every root option of a faction: its units plus army configuration from the catalogue and game system. */
export function rootOptions(index: DataIndex, catalogueId: string): RootOption[] {
  const out: RootOption[] = [];
  const seen = new Set<string>();
  const configNames = new Set<string>();
  const add = (key: string, node: OptNode | undefined, cat: string) => {
    if (!node || seen.has(node.targetId)) return;
    seen.add(node.targetId);
    const config = node.categoryIds.includes(CONFIG_CATEGORY);
    // Imported catalogues repeat army options (e.g. their own "Detachment"); the nearest one wins.
    if (config) {
      if (configNames.has(node.name.toLowerCase())) return;
      configNames.add(node.name.toLowerCase());
    }
    out.push({ key, node, catalogueId: cat, config });
  };
  index.gameSystem?.entryLinks?.forEach((l) => add(l.id, nodeFor(index, l), index.gameSystem!.id));
  for (const r of rootLinks(index, catalogueId)) add(r.key, nodeFor(index, r.link ?? r.entry), r.catalogueId);
  return out;
}

export interface OptionView {
  node: OptNode;
  kind: 'entry' | 'group';
  name: string;
  hidden: boolean;
  min: number;
  /** -1 = no limit */
  max: number;
  /** Total selected under the parent (sum of counts). */
  selected: number;
  /** Indices of the parent's children that hold this option. */
  indices: number[];
  /** Points for one (entries only). */
  points: number;
  defaultKey?: string;
  children: OptionView[];
}

const isSelLimit = (c: RawConstraint) => c.field === 'selections' && c.scope === 'parent' && !c.percentValue;

/**
 * Everything the screens need about one roster, computed from the data.
 * Create a new engine whenever the roster changes (it memoises).
 */
export class RosterEngine {
  readonly ev: Evaluator;
  readonly tree: RosterTree;
  readonly roots: Map<string, RootOption>;

  constructor(
    readonly index: DataIndex,
    readonly roster: Roster,
    roots?: RootOption[],
  ) {
    this.ev = new Evaluator(index);
    const list = roots ?? rootOptions(index, roster.catalogueId);
    this.roots = new Map(list.map((r) => [r.key, r]));
    this.tree = buildRosterTree(index, roster, (k) => this.roots.get(k)?.node);
  }

  // ---------- root choices ----------

  configRoots(): RootOption[] {
    return [...this.roots.values()].filter((r) => r.config);
  }

  /** Units you can add, with hidden ones (e.g. Legends unless shown) removed. */
  unitChoices(): { root: RootOption; points: number; category?: string; name: string }[] {
    const out: { root: RootOption; points: number; category?: string; name: string }[] = [];
    for (const r of this.roots.values()) {
      if (r.config) continue;
      if (r.node.type !== 'unit' && r.node.type !== 'model') continue;
      const v = virtualChild(this.tree.force, r.node, [], 1);
      if (this.ev.hidden(v)) continue;
      out.push({ root: r, points: this.ev.cost(v, PTS), category: r.node.primaryCategory, name: this.ev.name(v) });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  // ---------- units ----------

  unitInst(unitId: string): Inst | undefined {
    return this.tree.units.get(unitId);
  }

  unitPoints(unitId: string): number {
    const u = this.unitInst(unitId);
    return u ? this.subtreeCost(u, PTS) : 0;
  }

  subtreeCost(inst: Inst, typeId: string): number {
    let total = 0;
    const visit = (i: Inst, weight: number) => {
      total += this.ev.cost(i, typeId) * weight;
      i.children.forEach((c) => visit(c, weight * c.count));
    };
    visit(inst, Math.max(inst.count, 1));
    return total;
  }

  unitName(unitId: string): string {
    const u = this.unitInst(unitId);
    return u ? this.ev.name(u) : '';
  }

  totalPoints(): number {
    let t = 0;
    for (const id of this.tree.units.keys()) t += this.unitPoints(id);
    for (const c of this.tree.force.children) if (!c.unit) t += this.subtreeCost(c, PTS);
    return t;
  }

  /** Points limit from the battle size (via the data), unless the list uses a custom limit. */
  pointsLimit(): number {
    if (this.roster.battleSize === 'custom') return this.roster.pointsLimit;
    const v = this.forceLimit(PTS);
    return v && v > 0 ? v : this.roster.pointsLimit;
  }

  forceLimit(field: string): number | undefined {
    const fe = this.tree.force.forceEntry;
    if (!fe) return undefined;
    const c = fe.constraints?.find((k) => k.field === field && k.type === 'max');
    if (!c) return undefined;
    return this.ev.constraintValue(c, this.tree.force, flattenModifiers(fe.modifiers));
  }

  detachmentPoints(): { used: number; max?: number } {
    return { used: this.ev.measure({ field: DP, scope: 'roster' }, this.tree.root), max: this.forceLimit(DP) };
  }

  enhancements(): { used: number; max?: number } {
    return { used: this.ev.measure({ field: ENH, scope: 'force' }, this.tree.force), max: this.forceLimit(ENH) };
  }

  categoriesOf(unitId: string): Set<string> {
    const u = this.unitInst(unitId);
    return u ? this.ev.categories(u) : new Set();
  }

  isCharacter(unitId: string): boolean {
    return this.categoriesOf(unitId).has('9cfd-1c32-585f-7d5c');
  }

  /** Selections under a unit that have the Warlord category. */
  isWarlord(unitId: string): boolean {
    const u = this.unitInst(unitId);
    if (!u) return false;
    const walk = (i: Inst): boolean => i.children.some((c) => c.count > 0 && (this.ev.categories(c).has(WARLORD_CATEGORY) || walk(c)));
    return walk(u);
  }

  /** The enhancement selected on a unit, if any (an option that costs an Enhancement). */
  enhancementOf(unitId: string): Inst | undefined {
    const u = this.unitInst(unitId);
    if (!u) return undefined;
    const walk = (i: Inst): Inst | undefined => {
      for (const c of i.children) {
        if (c.count > 0 && this.ev.cost(c, ENH) > 0) return c;
        const d = walk(c);
        if (d) return d;
      }
      return undefined;
    };
    return walk(u);
  }

  // ---------- leaders ----------

  /** Units this character may join, per its Leader/Support associations. */
  attachTargets(leaderId: string): string[] {
    const leader = this.unitInst(leaderId);
    const assoc = leader?.node?.associations ?? [];
    if (!leader || !assoc.length) return [];
    const out: string[] = [];
    for (const [id, inst] of this.tree.units) {
      if (id === leaderId) continue;
      const ok = assoc.some((a) => this.ev.allPass(a, inst));
      if (ok) out.push(id);
    }
    return out;
  }

  canLead(unitId: string): boolean {
    return Boolean(this.unitInst(unitId)?.node?.associations.length);
  }

  attachedTo(bodyguardId: string): RosterUnit[] {
    return this.roster.units.filter((u) => u.leaderOf === bodyguardId);
  }

  // ---------- options (unit editor) ----------

  /** Option tree under a selection instance, with limits and counts evaluated. */
  optionsUnder(parent: Inst): OptionView[] {
    const node = parent.node;
    if (!node) return [];
    const build = (container: OptNode, groups: OptNode[]): OptionView[] => {
      const out: OptionView[] = [];
      for (const c of childNodes(this.index, container)) {
        if (c.kind === 'group') {
          const v = virtualChild(parent, c, groups);
          const { min, max } = this.limits(c, v);
          const children = build(c, [...groups, c]);
          const selected = children.reduce((s, x) => s + x.selected, 0);
          const view: OptionView = {
            node: c,
            kind: 'group',
            name: c.name,
            hidden: this.ev.hidden(v) || children.every((x) => x.hidden),
            min,
            max,
            selected,
            indices: [],
            points: 0,
            defaultKey: c.defaultSelectionEntryId,
            children,
          };
          out.push(view);
        } else {
          const indices: number[] = [];
          let selected = 0;
          parent.children.forEach((ch, i) => {
            if (ch.node?.key === c.key) {
              indices.push(i);
              selected += ch.count;
            }
          });
          const sample = indices.length ? parent.children[indices[0]!]! : virtualChild(parent, c, groups, 1);
          const { min, max } = this.limits(c, sample);
          out.push({
            node: c,
            kind: 'entry',
            name: this.ev.name(sample),
            hidden: this.ev.hidden(sample),
            min,
            max,
            selected,
            indices,
            points: this.ev.cost(sample, PTS),
            children: [],
          });
        }
      }
      return out;
    };
    return build(node, []);
  }

  limits(node: OptNode, owner: Inst): { min: number; max: number } {
    let min = 0;
    let max = -1;
    for (const c of node.constraints) {
      if (!isSelLimit(c)) continue;
      const v = this.ev.constraintValue(c, owner);
      if (c.type === 'min') min = Math.max(min, v);
      else if (v >= 0) max = max < 0 ? v : Math.min(max, v);
    }
    return { min, max };
  }

  // ---------- validation ----------

  issues(): Issue[] {
    const issues: Issue[] = [];
    const seen = new Set<string>();
    const push = (key: string, issue: Issue) => {
      if (seen.has(key)) return;
      seen.add(key);
      issues.push(issue);
    };
    const ev = this.ev;
    const unitIdOf = (i: Inst): string | undefined => {
      let cur: Inst | undefined = i;
      while (cur && !cur.unit) cur = cur.parent;
      return cur?.unit?.id;
    };

    // Points
    const total = this.totalPoints();
    const limit = this.pointsLimit();
    if (limit > 0 && total > limit) {
      push('pts', {
        severity: 'error',
        title: `${(total - limit).toLocaleString('en')} pts over the limit`,
        why: `The army is ${total.toLocaleString('en')} pts and the battle size allows ${limit.toLocaleString('en')} pts.`,
        fix: 'Remove or shrink a unit',
      });
    }

    // Army-level limits from the force entry (Detachment Points, Enhancements, ...)
    const fe = this.tree.force.forceEntry;
    if (fe) {
      const mods = flattenModifiers(fe.modifiers);
      for (const c of fe.constraints ?? []) {
        if (c.field === PTS || !CHECKED_COSTS.has(c.field)) continue;
        const scope = c.scope === 'parent' ? this.tree.root : this.tree.force;
        const n = ev.measure(c, scope);
        const v = ev.constraintValue(c, this.tree.force, mods);
        if (c.type === 'max' && v >= 0 && n > v) {
          const what = c.field === DP ? 'Detachment Points' : 'Enhancements';
          push(`force:${c.id}`, {
            severity: 'error',
            title: c.field === DP ? `Detachments cost ${n} DP, the limit is ${v}` : `${n} Enhancements, the limit is ${v}`,
            why: c.message?.replace('{value}', String(v)) ?? `This battle size allows ${v} ${what}.`,
            fix: c.field === DP ? 'Change detachments' : 'Remove an Enhancement',
          });
        }
      }
    }

    // Every selection's options, plus the roots under the force
    const check = (parent: Inst) => {
      const offered =
        parent.kind === 'force'
          ? [...this.roots.values()].map((r) => ({ node: r.node, groups: [] as OptNode[] }))
          : parent.node
            ? offeredEntries(this.index, parent.node)
            : [];
      const present = new Map<string, Inst[]>();
      parent.children.forEach((c) => {
        if (!c.node) return;
        const list = present.get(c.node.key) ?? [];
        list.push(c);
        present.set(c.node.key, list);
      });
      for (const { node, groups } of offered) {
        const insts = present.get(node.key) ?? [];
        const isRoot = parent.kind === 'force';
        const owner = insts[0] ?? virtualChild(parent, node, groups, 1);
        const hidden = ev.hidden(owner);
        if (insts.length && hidden && insts.some((i) => i.count > 0)) {
          push(`hidden:${insts[0]!.order}`, {
            severity: 'error',
            title: `${ev.name(owner)} is not allowed here`,
            why: isRoot ? 'The current army settings hide this unit (for example a detachment restriction or Legends turned off).' : 'The rules hide this option with the current choices.',
            fix: 'Remove it',
            unitId: unitIdOf(insts[0]!),
          });
        }
        if (!insts.length) {
          // Options not taken can only fail a minimum; unit roots never have one.
          if (hidden) continue;
          if (isRoot && !this.roots.get(node.key)?.config) continue;
        }
        for (const c of node.constraints) {
          if (c.percentValue) continue;
          if (c.field !== 'selections' && !CHECKED_COSTS.has(c.field) && c.field !== 'associations') continue;
          if (c.type === 'min' && hidden) continue;
          if (!insts.length && c.type === 'max') continue;
          if (c.field === 'associations') {
            for (const i of insts) this.checkOne(c, i, i, node, push, unitIdOf(i));
            continue;
          }
          if (c.scope === 'self') {
            for (const i of insts) this.checkOne(c, i, i, node, push, unitIdOf(i));
            continue;
          }
          const scopes = c.scope === 'parent' ? [parent] : ev.scopeInsts(c.scope, owner);
          if (!scopes.length) continue;
          this.checkOne(c, owner, scopes[0]!, node, push, isRoot ? undefined : unitIdOf(parent));
        }
      }
      // Group limits (e.g. "Crusaders: 10-20 models", "Pistol: choose 1")
      if (parent.kind === 'selection' && parent.node) {
        for (const { group, path } of groupsUnder(this.index, parent.node)) {
          const v = virtualChild(parent, group, path.slice(0, -1));
          if (ev.hidden(v)) continue;
          for (const c of group.constraints) {
            if (!isSelLimit(c)) continue;
            this.checkOne(c, v, parent, group, push, unitIdOf(parent));
          }
        }
      }
      parent.children.forEach((c) => c.kind === 'selection' && check(c));
    };
    check(this.tree.force);

    // Errors and warnings the data attaches to selections (e.g. "You cannot mix weapons in this squad").
    const walkMsgs = (i: Inst) => {
      for (const c of i.children) {
        if (c.count > 0 && c.node) {
          for (const fm of c.node.modifiers) {
            if (fm.mod.field !== 'error' && fm.mod.field !== 'warning') continue;
            if (!ev.timesApplies(fm, c)) continue;
            const uid = unitIdOf(c);
            const unit = this.roster.units.find((u) => u.id === uid);
            push(`msg:${uid}:${fm.mod.value}`, {
              severity: fm.mod.field === 'error' ? 'error' : 'advice',
              title: `${unit ? `${unit.name}: ` : ''}${String(fm.mod.value)}`,
              why: 'A rule in the data for this unit.',
              fix: 'Open the unit',
              unitId: uid,
            });
          }
        }
        walkMsgs(c);
      }
    };
    walkMsgs(this.tree.force);

    // Leaders
    for (const u of this.roster.units) {
      if (!u.leaderOf) continue;
      const leader = this.unitInst(u.id);
      if (!leader) continue;
      if (!this.tree.units.has(u.leaderOf)) {
        push(`lead-missing:${u.id}`, { severity: 'error', title: `${u.name} is attached to a unit that is gone`, why: 'The unit it was leading was removed.', fix: 'Detach', unitId: u.id });
      } else if (!this.attachTargets(u.id).includes(u.leaderOf)) {
        const body = this.roster.units.find((x) => x.id === u.leaderOf);
        push(`lead-bad:${u.id}`, {
          severity: 'error',
          title: `${u.name} can't lead ${body?.name ?? 'that unit'}`,
          why: `${u.name}'s Leader ability does not list that unit.`,
          fix: 'Detach',
          unitId: u.id,
        });
      }
    }

    // Warlord
    const warlords = this.roster.units.filter((u) => this.isWarlord(u.id));
    if (this.roster.units.length && warlords.length === 0) {
      push('warlord-none', { severity: 'error', title: 'No Warlord', why: 'Every army needs one Character as its Warlord.', fix: 'Pick a Warlord' });
    } else if (warlords.length > 1) {
      push('warlord-many', { severity: 'error', title: `${warlords.length} Warlords`, why: 'An army has exactly one Warlord.', fix: 'Keep one Warlord' });
    }

    if (this.tree.missing.length) {
      push('missing', {
        severity: 'error',
        title: `${this.tree.missing.length} ${this.tree.missing.length === 1 ? 'unit is' : 'units are'} not in the data`,
        why: `${this.tree.missing.map((m) => m.name).join(', ')} could not be found in the downloaded data. The data may have changed since this list was built.`,
        fix: 'Remove or replace',
      });
    }
    if (this.tree.orphans.length) {
      push('orphans', {
        severity: 'advice',
        title: `${this.tree.orphans.length} saved ${this.tree.orphans.length === 1 ? 'choice' : 'choices'} no longer match the data`,
        why: 'Some wargear or options were renamed or removed in a data update. They are ignored until you edit the unit.',
      });
    }
    return issues;
  }

  private checkOne(c: RawConstraint, owner: Inst, scope: Inst, node: OptNode, push: (k: string, i: Issue) => void, unitId?: string) {
    const ev = this.ev;
    const ownerIds = [node.key, node.targetId];
    const n = c.field === 'associations' ? ev.measure(c, owner) : ev.measure(c, scope, c.childId ? undefined : ownerIds);
    const v = ev.constraintValue(c, owner);
    if (v < 0) return;
    const bad = c.type === 'max' ? n > v : n < v;
    if (!bad) return;
    const name = node.kind === 'group' ? node.name : ev.name(owner);
    const where = scopeWords(c.scope);
    const unit = unitId ? this.roster.units.find((u) => u.id === unitId) : undefined;
    const prefix = unit && unit.name !== name ? `${unit.name}: ` : '';
    let title: string;
    let why: string;
    let fix: string | undefined;
    if (c.field === 'associations' && c.type === 'min') {
      title = `${name} must join a unit`;
      why = (c.message ?? '{this} must be attached to a Bodyguard unit.').replace('{this}', name);
      fix = 'Attach it';
    } else if (c.field === 'associations') {
      title = `${prefix}too many attached characters`;
      why = `This unit can have ${v} ${c.childId === SUPPORT_CATEGORY ? 'Support' : 'Leader'} character${v === 1 ? '' : 's'} attached, it has ${n}.`;
      fix = 'Detach one';
    } else if (c.field === ENH) {
      title = `${prefix}too many Enhancements`;
      why = c.message?.replace('{value}', String(v)) ?? `At most ${v} here, there are ${n}.`;
      fix = 'Remove an Enhancement';
    } else if (c.type === 'max') {
      if (c.scope === 'force' || c.scope === 'roster') {
        title = `Too many ${name}`;
        why = `You can include ${name} at most ${v} time${v === 1 ? '' : 's'} in this army, you have ${n}.`;
        fix = 'Remove one';
      } else {
        title = `${prefix}${name}: at most ${v}`;
        why = `${name} is limited to ${v} ${where}; you have ${n}.`;
        fix = 'Reduce it';
      }
    } else {
      title = node.kind === 'group' ? `${prefix}${name}: needs at least ${v}` : `${prefix}needs ${name}`;
      why = node.kind === 'group' ? `Pick at least ${v} from ${name} ${where}; you have ${n}.` : `At least ${v} ${name} required ${where}; you have ${n}.`;
      fix = node.kind === 'group' ? 'Add more' : `Add ${name}`;
    }
    if (c.message && c.field !== ENH) why = c.message.replace('{value}', String(v)).replace('{this}', name);
    push(`${c.id}:${unitId ?? ''}:${scope.order}`, { severity: 'error', title, why, fix, unitId });
  }
}

function scopeWords(scope: string): string {
  switch (scope) {
    case 'parent':
      return 'in this unit';
    case 'force':
    case 'roster':
      return 'in the army';
    case 'root-entry':
      return 'in this unit';
    default:
      return 'here';
  }
}

export type { FlatModifier };

import { buildDefault, instAt, newUnit, setOptionCount, updateChildren, type SelPath } from './rules/edit';
import { modelTypes, setModelsWithOption } from './rules/modelTypes';
import { PTS } from './rules/evaluate';
import type { Inst } from './rules/instance';
import { offeredEntries } from './rules/nodes';
import type { RosterEngine } from './rules/rosterEngine';
import type { Roster, RosterUnit } from './types';

const SECTION: Record<string, string> = {
  Characters: 'CHARACTERS',
  Battleline: 'BATTLELINE',
  'Dedicated Transports': 'DEDICATED TRANSPORTS',
  'Other datasheets': 'OTHER DATASHEETS',
};

function roleOf(engine: RosterEngine, unitId: string): string {
  const cats = [...engine.categoriesOf(unitId)].map((c) => engine.index.categories.get(c)?.name ?? '');
  const primary = engine.index.categories.get(engine.unitInst(unitId)?.node?.primaryCategory ?? '')?.name ?? '';
  if (/character|epic hero/i.test(primary) || cats.includes('Character')) return 'Characters';
  if (/battleline/i.test(primary)) return 'Battleline';
  if (/dedicated transport/i.test(primary)) return 'Dedicated Transports';
  return 'Other datasheets';
}

/**
 * Plain-text list in the same shape as the official app's export, so it pastes
 * into tournament tools and chats. Only names and counts, no rules text.
 */
export function exportText(engine: RosterEngine, roster: Roster): string {
  const ev = engine.ev;
  const lines: string[] = [];
  const total = engine.totalPoints();
  lines.push(`${roster.name} (${total} points)`, '');
  lines.push(roster.factionName);
  const size = roster.battleSize === 'incursion' ? 'Incursion' : roster.battleSize === 'onslaught' ? 'Onslaught' : roster.battleSize === 'custom' ? 'Custom' : 'Strike Force';
  lines.push(`${size} (${engine.pointsLimit()} points)`);
  if (roster.detachmentNames?.length) lines.push(roster.detachmentNames.join(' + '));
  if (roster.forceDisposition) lines.push(`Force Disposition: ${roster.forceDisposition}`);
  lines.push('');

  const byRole = new Map<string, RosterUnit[]>();
  for (const u of roster.units) {
    const r = roleOf(engine, u.id);
    byRole.set(r, [...(byRole.get(r) ?? []), u]);
  }
  for (const role of Object.keys(SECTION)) {
    const units = byRole.get(role);
    if (!units?.length) continue;
    lines.push(SECTION[role]!, '');
    for (const u of units) {
      const inst = engine.unitInst(u.id);
      if (!inst) continue;
      lines.push(`${ev.name(inst)} (${engine.unitPoints(u.id)} points)`);
      const body = u.leaderOf ? roster.units.find((x) => x.id === u.leaderOf) : undefined;
      for (const c of inst.children) {
        if (c.count <= 0) continue;
        lines.push(...selectionLines(engine, c, 1));
      }
      if (body) lines.push(`  • Attached to: ${body.name}`);
      lines.push('');
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function selectionLines(engine: RosterEngine, inst: Inst, depth: number): string[] {
  const ev = engine.ev;
  const name = ev.name(inst);
  const pad = depth === 1 ? '  • ' : `${'  '.repeat(depth)}◦ `;
  const out: string[] = [];
  if (ev.categories(inst).has('5c0e-4c31-d51b-e470')) out.push(`${pad}Warlord`);
  else if (ev.cost(inst, 'f759-1bc4-cb3a-f0d2') > 0) out.push(`${pad}Enhancement: ${name}`);
  else out.push(`${pad}${inst.count}x ${name}`);
  for (const c of inst.children) if (c.count > 0) out.push(...selectionLines(engine, c, depth + 1));
  return out;
}

// ---------- import ----------

export interface ParsedLine {
  depth: number;
  count: number;
  name: string;
  kind: 'item' | 'warlord' | 'enhancement' | 'attached';
}
export interface ParsedUnit {
  name: string;
  points?: number;
  lines: ParsedLine[];
  /** "Attached Unit 2" block this unit is listed in, and its part in it. */
  attachedGroup?: number;
  attachedRole?: 'leader' | 'bodyguard';
}

/** One line under a unit before depths are worked out. */
interface RawLine {
  indent: number;
  text: string;
  symbol?: string;
}
export interface ParsedList {
  title?: string;
  faction?: string;
  battleSize?: 'incursion' | 'strikeForce' | 'onslaught';
  points?: number;
  detachments: string[];
  disposition?: string;
  units: ParsedUnit[];
  headerLines: string[];
}

const SECTIONS = /^(CHARACTERS?|EPIC HER(O|OES)|BATTLELINE|DEDICATED TRANSPORTS?|OTHER DATASHEETS|ALLIED UNITS|INFANTRY|VEHICLES?|MONSTERS?|FORTIFICATIONS?)$/i;
const UNIT_RE = /^(.+?)\s*[([]\s*(\d[\d,.\s]*)\s*(?:points|pts|pt)\s*[)\]]\s*$/i;
const num = (s: string) => Number(s.replace(/[,.\s]/g, ''));

/** Parse the official app's text export (and close variants). */
export function parseListText(text: string): ParsedList {
  const out: ParsedList = { detachments: [], units: [], headerLines: [] };
  const lines = text.replace(/\r/g, '').split('\n');
  let cur: ParsedUnit | undefined;
  let inHeader = true;
  let group: number | undefined;
  const raws = new Map<ParsedUnit, RawLine[]>();
  let lastBulletIndent = 0;
  const startUnit = (name: string, points?: number) => {
    cur = { name, points, lines: [], attachedGroup: group };
    out.units.push(cur);
    raws.set(cur, []);
    lastBulletIndent = 0;
  };
  for (const raw of lines) {
    const line = raw.replace(/\t/g, '  ').replace(/\u00a0/g, ' ');
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^exported with/i.test(trimmed)) continue;
    const indent = line.length - line.trimStart().length;
    // "Attached Units" / "Attached Unit 2": a leader and its bodyguard follow.
    const att = trimmed.match(/^attached units?(?:\s+(\d+))?$/i);
    if (att) {
      inHeader = false;
      cur = undefined;
      group = att[1] ? Number(att[1]) : group;
      continue;
    }
    if (SECTIONS.test(trimmed)) {
      inHeader = false;
      cur = undefined;
      group = undefined;
      continue;
    }
    const bullet = trimmed.match(/^([•◦\-*+▪●○·])\s*(.*)$/);
    // A list that starts straight with a unit: what looked like the title was the first unit.
    if (bullet && !cur && out.title && !out.headerLines.length && !out.units.length) {
      const t = out.title;
      const p = out.points;
      out.title = undefined;
      out.points = undefined;
      inHeader = false;
      startUnit(t, p);
    }
    if (bullet && cur) {
      raws.get(cur)!.push({ indent, text: bullet[2]!.trim(), symbol: bullet[1] });
      lastBulletIndent = indent;
      continue;
    }
    // "    1x Bolt Pistol" under a bullet: more of the same list (the app puts one bullet per group).
    if (cur && !inHeader && (indent > 0 || /^\d+\s*x\s+/i.test(trimmed)) && !UNIT_RE.test(trimmed)) {
      raws.get(cur)!.push({ indent: lastBulletIndent, text: trimmed });
      continue;
    }
    const u = trimmed.match(UNIT_RE);
    if (u && inHeader && !out.title) {
      out.title = u[1]!.trim();
      out.points = num(u[2]!);
      continue;
    }
    const sizeLine = /incursion|strike force|onslaught/i.test(trimmed);
    if (inHeader && (!u || sizeLine)) {
      out.headerLines.push(trimmed);
      if (/incursion/i.test(trimmed)) out.battleSize = 'incursion';
      else if (/strike force/i.test(trimmed)) out.battleSize = 'strikeForce';
      else if (/onslaught/i.test(trimmed)) out.battleSize = 'onslaught';
      else if (/^(force )?disposition:/i.test(trimmed)) out.disposition = trimmed.replace(/^(force )?disposition:\s*/i, '');
      else if (!out.faction) out.faction = trimmed;
      else out.detachments.push(...headerParts(trimmed));
      continue;
    }
    if (u) {
      inHeader = false;
      startUnit(u[1]!.trim(), num(u[2]!));
    } else if (!bullet && indent === 0) {
      inHeader = false;
      startUnit(trimmed);
    }
  }
  for (const unit of out.units) unit.lines = toLines(unit, raws.get(unit) ?? []);
  return out;
}

/** Depth from indentation: the shallowest list level is 1 (models / wargear), the next 2 (a model's wargear). */
function toLines(unit: ParsedUnit, raws: RawLine[]): ParsedLine[] {
  const items: RawLine[] = [];
  for (const r of raws) {
    const role = r.text.match(/^attached as:\s*(leader|bodyguard)/i);
    if (role) {
      unit.attachedRole = role[1]!.toLowerCase() as 'leader' | 'bodyguard';
      continue;
    }
    if (/^attached as:/i.test(r.text)) continue;
    items.push(r);
  }
  const levels = [...new Set(items.map((r) => r.indent))].sort((a, b) => a - b);
  const strip = (t: string) => t.replace(UNIT_RE, '$1').replace(/\s*\((?:upgrade|enhancement)\)\s*$/i, '').trim();
  return items.map((r) => {
    let depth = Math.min(2, levels.indexOf(r.indent) + 1);
    if (r.symbol === '◦' || r.symbol === '○') depth = 2;
    const body = r.text;
    if (/^warlord$/i.test(body)) return { depth, count: 1, name: 'Warlord', kind: 'warlord' as const };
    if (/^enhancements?:/i.test(body)) return { depth: 1, count: 1, name: strip(body.replace(/^enhancements?:\s*/i, '')), kind: 'enhancement' as const };
    if (/^attached to:/i.test(body)) return { depth, count: 1, name: body.replace(/^attached to:\s*/i, ''), kind: 'attached' as const };
    const m = body.match(/^(\d+)\s*x\s+(.+)$/i);
    return { depth, count: m ? Number(m[1]) : 1, name: (m ? m[2]! : body).trim(), kind: 'item' as const };
  });
}

/** "Detachment: Gladius Task Force (2 DP) + Anvil Siege Force" -> the names. */
export function headerParts(line: string): string[] {
  return line
    .replace(/^(detachments?|faction|army|chapter)\s*:\s*/i, '')
    .replace(/\s*[([][^)\]]*(?:detachment points?|dp)[^)\]]*[)\]]\s*$/i, '')
    .split(/\s*(?:\+|,|\/|&|\band\b)\s*/)
    .map((p) => p.replace(/\s*[([][^)\]]*[)\]]\s*$/, '').trim())
    .filter(Boolean);
}

export const normName = (s: string) =>
  s
    .toLowerCase()
    .replace(/\[legends\]/g, '')
    .replace(/[’']/g, "'")
    .replace(/w\/\s*/g, 'w/ ')
    .replace(/[^a-z0-9/' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export interface ImportReport {
  matched: string[];
  unmatched: string[];
  /** Differences that come from the game data rather than the text (points, missing new options). */
  notes?: string[];
}

function findOption(engine: RosterEngine, parent: Inst, name: string) {
  if (!parent.node) return undefined;
  const want = normName(name);
  const offered = offeredEntries(engine.index, parent.node);
  return (
    offered.find((o) => normName(o.node.name) === want) ??
    offered.find((o) => normName(o.node.name).replace(/s$/, '') === want.replace(/s$/, '')) ??
    offered.find((o) => normName(o.node.name).includes(want) || want.includes(normName(o.node.name)))
  );
}

/**
 * Turn one parsed unit into a roster unit using the data: match the datasheet
 * by name, rebuild models line by line, then apply wargear, Warlord and
 * Enhancement. `rebuild` must return an engine for the roster with this unit in it.
 */
export function importUnit(engineFor: (units: RosterUnit[]) => RosterEngine, others: RosterUnit[], parsed: ParsedUnit, report: ImportReport): RosterUnit | undefined {
  let engine = engineFor(others);
  const want = normName(parsed.name);
  const choices = engine.unitChoices();
  const choice =
    choices.find((c) => normName(c.name) === want) ??
    choices.find((c) => normName(c.root.node.name) === want) ??
    choices.find((c) => normName(c.name).startsWith(want) || want.startsWith(normName(c.name)));
  if (!choice) {
    report.unmatched.push(`Unit: ${parsed.name}`);
    return undefined;
  }
  let unit = newUnit(engine, choice.root.key);
  const refresh = () => (engine = engineFor([...others, unit]));
  const one = (u: RosterUnit) => engineFor([...others, u]);
  refresh();

  // 1. Models: replace the default models with the ones listed. The app lists
  // "5x Initiate" where the data has kinds by weapon ("Initiate w/Chainsword…"):
  // those are split by the weapon counts underneath.
  const lines = parsed.lines;
  const modelOf = new Map<number, string>();
  const handled = new Set<number>();
  {
    const root = engine.unitInst(unit.id)!;
    const models = offeredEntries(engine.index, root.node!).filter((o) => o.node.type === 'model');
    const plan: { i: number; parts: { o: (typeof models)[number]; n: number }[] }[] = [];
    lines.forEach((l, i) => {
      if (l.depth !== 1 || l.kind !== 'item') return;
      const o = findOption(engine, root, l.name);
      if (o?.node.type !== 'model') return;
      const w = normName(l.name).replace(/s$/, '');
      const kinds = models.filter((m) => normName(m.node.name).replace(/s$/, '') === w || new RegExp(`^${w}s? w/`).test(normName(m.node.name)));
      if (kinds.length < 2 || kinds.some((k) => normName(k.node.name).replace(/s$/, '') === w)) {
        plan.push({ i, parts: [{ o, n: l.count }] });
        return;
      }
      // Weapons under this line that only some kinds carry decide how many of each.
      const sub: number[] = [];
      for (let k = i + 1; k < lines.length && lines[k]!.depth === 2; k++) sub.push(k);
      const tokens = (s: string) => new Set(normName(s).replace(/s\b/g, '').split(/[^a-z0-9']+/).filter((t) => t && t !== w && t !== 'w'));
      const suffix = (m: (typeof models)[number]) => tokens(normName(m.node.name).split(' w/ ')[1] ?? '');
      const counts = new Map<(typeof models)[number], number>();
      let left = l.count;
      for (const k of sub) {
        const g = lines[k]!;
        const want = [...tokens(g.name)];
        if (!want.length) continue;
        const fits = kinds.filter((m) => want.every((t) => suffix(m).has(t)));
        if (fits.length !== 1 || g.count >= l.count + 1) continue;
        const n = Math.min(left, g.count);
        if (n <= 0) continue;
        counts.set(fits[0]!, (counts.get(fits[0]!) ?? 0) + n);
        left -= n;
        handled.add(k);
      }
      if (left > 0) {
        const def = kinds.find((m) => !counts.has(m)) ?? kinds[0]!;
        counts.set(def, (counts.get(def) ?? 0) + left);
      }
      plan.push({ i, parts: [...counts.entries()].map(([o2, n]) => ({ o: o2, n })) });
    });
    if (plan.length) {
      unit = updateChildren(unit, [], (children) => children.filter((s) => root.children.find((c) => c.sel === s)?.node?.type !== 'model'));
      refresh();
      for (const { i, parts } of plan) {
        for (const { o, n } of parts) {
          const r = engine.unitInst(unit.id)!;
          unit = { ...unit, selections: [...unit.selections, buildDefault(engine, r, o.node, o.groups, n)] };
          refresh();
          report.matched.push(`${parsed.name}: ${n}x ${o.node.name}`);
        }
        // Wargear lines go to the (first) kind; lines used to split kinds are already done.
        modelOf.set(i, parts[0]!.o.node.key);
      }
    }
  }

  // 2. Warlord and Enhancement.
  for (const line of lines) {
    if (line.kind !== 'warlord' && line.kind !== 'enhancement') continue;
    const root = engine.unitInst(unit.id)!;
    if (line.kind === 'warlord') {
      const o = findOption(engine, root, 'Warlord');
      if (o) {
        unit = setOptionCount(engine, unit, [], o.node.key, 1);
        refresh();
        report.matched.push(`${parsed.name}: Warlord`);
      } else report.unmatched.push(`${parsed.name}: Warlord`);
    } else {
      const ok = setDeep(engine, unit, [], line.name, 1);
      if (ok) {
        unit = ok;
        refresh();
        report.matched.push(`${parsed.name}: ${line.name}`);
      } else report.unmatched.push(`${parsed.name}: Enhancement ${line.name}`);
    }
  }

  // 3. Wargear: each model's lines say how many of those models carry each weapon.
  const gear: { modelKey?: string; line: ParsedLine }[] = [];
  let currentModel: string | undefined;
  lines.forEach((l, i) => {
    if (handled.has(i)) return;
    if (modelOf.has(i)) {
      currentModel = modelOf.get(i);
      return;
    }
    if (l.kind !== 'item') return;
    if (l.depth === 1) currentModel = undefined;
    gear.push({ modelKey: l.depth === 2 ? currentModel : undefined, line: l });
  });
  const applied = new Map<string, Set<string>>();
  for (const { modelKey, line } of gear) {
    const types = modelTypes(engine, unit.id);
    const t = modelKey !== undefined ? types.find((x) => x.key === modelKey) : types.length === 1 ? types[0] : types.find((x) => !x.key);
    const label = `${parsed.name}: ${line.count}x ${line.name}`;
    if (t) {
      if (matchName(line.name, t.fixed.map((f) => f.name))) {
        report.matched.push(label);
        continue;
      }
      const opts = [...t.groups.flatMap((g) => g.options.map((o) => ({ o, g }))), ...t.extras.map((o) => ({ o, g: undefined }))];
      const hit = matchName(line.name, opts.map((x) => x.o.name));
      if (hit) {
        const { o, g } = opts.find((x) => x.o.name === hit)!;
        // Only choices in the same group compete for a model (all of them carry the same pistol).
        const slot = `${t.key}|${g?.key ?? o.key}`;
        const avoid = applied.get(slot) ?? new Set<string>();
        if (t.count <= 1 && line.count > 1) {
          // One model carrying several (e.g. 2x Flamestorm Cannon on a tank).
          const mi = t.key ? unit.selections.findIndex((x) => x.entryId === t.key) : -1;
          unit = setOptionCount(engine, unit, mi >= 0 ? [mi] : [], o.key, line.count);
        } else unit = setModelsWithOption(one, unit, t.key, o.key, line.count, g, avoid);
        avoid.add(o.key);
        applied.set(slot, avoid);
        refresh();
        report.matched.push(label);
        continue;
      }
    }
    // Not a plain choice (e.g. inside a bundle like "Pistol and Melee Weapon"): look deeper.
    const mi = modelKey ? unit.selections.findIndex((x) => x.entryId === modelKey) : -1;
    const path: SelPath = mi >= 0 ? [mi] : [];
    const perModel = mi >= 0 ? Math.max(1, Math.round(line.count / Math.max(1, unit.selections[mi]!.count))) : line.count;
    const ok = setDeep(engine, unit, path, line.name, perModel);
    if (ok) {
      unit = ok;
      refresh();
      report.matched.push(label);
    } else report.unmatched.push(label);
  }
  report.matched.push(`Unit: ${choice.name}`);
  return unit;
}

/** Best match for a wargear name among the data's names ("Chainsword" ↔ "Astartes Chainsword"). */
export function matchName(want: string, names: string[]): string | undefined {
  const w = normName(want);
  const n = names.map((x) => ({ x, k: normName(x) }));
  const sing = (s: string) => s.replace(/s\b/g, '');
  return (
    n.find((e) => e.k === w)?.x ??
    n.find((e) => sing(e.k) === sing(w))?.x ??
    n.find((e) => e.k.endsWith(` ${w}`) || w.endsWith(` ${e.k}`))?.x ??
    n.find((e) => e.k.includes(w) || w.includes(e.k))?.x ??
    n.find((e) => {
      const a = sing(w).split(' ');
      const b = new Set(sing(e.k).split(' '));
      return a.length > 1 && a.every((t) => b.has(t));
    })?.x
  );
}

/** Find an option by name under a selection or any of its selected children, and set its count. */
function setDeep(engine: RosterEngine, unit: RosterUnit, path: SelPath, name: string, count: number): RosterUnit | undefined {
  const inst = instAt(engine, unit.id, path);
  if (!inst) return undefined;
  const o = findOption(engine, inst, name);
  if (o) return setOptionCount(engine, unit, path, o.node.key, count);
  for (let i = 0; i < (inst.sel?.children.length ?? 0); i++) {
    const r = setDeep(engine, unit, [...path, i], name, count);
    if (r) return r;
  }
  return undefined;
}

export { PTS };

/** Header lines split into name-like pieces, one array per line. */
function headerPieces(parsed: ParsedList): string[][] {
  const out: string[][] = [];
  for (const l of parsed.headerLines) {
    if (/incursion|strike force|onslaught/i.test(l)) continue;
    if (parsed.title && l.startsWith(parsed.title)) continue;
    out.push(headerParts(l.replace(/^(force )?disposition:\s*/i, '')));
  }
  if (parsed.disposition) out.push([parsed.disposition]);
  return out;
}

/** Every name-like piece of the list's header (faction, sub-faction, detachments, disposition). */
export function headerCandidates(parsed: ParsedList): string[] {
  return [...new Set(headerPieces(parsed).flat())];
}

/** The faction file the header names; the most specific match wins ("Black Templars" over "Space Marines"). */
export function matchFaction<T extends { name: string }>(parsed: ParsedList, factions: T[]): T | undefined {
  const cands = headerCandidates(parsed).map(normName);
  if (parsed.title) cands.push(normName(parsed.title));
  const exact = factions.filter((f) => cands.includes(normName(f.name)));
  if (exact.length) return exact.sort((a, b) => b.name.length - a.name.length)[0];
  const loose = factions.filter((f) => cands.some((c) => c.length > 3 && (c.includes(normName(f.name)) || normName(f.name).includes(c))));
  return loose.sort((a, b) => b.name.length - a.name.length)[0];
}

/**
 * Detachments and Force Disposition named anywhere in the header, matched
 * against the data. Pieces split on "and" are joined back when a name has
 * "and" in it ("Legends of Saga and Song").
 */
export function matchConfig(parsed: ParsedList, choices: { detachments: { key: string; name: string }[]; dispositions: { key: string; name: string }[] }) {
  const detachments: { key: string; name: string }[] = [];
  let disposition: { key: string; name: string } | undefined;
  const unused: string[] = [];
  const find = <T extends { name: string }>(list: T[], name: string) => list.find((x) => normName(x.name) === normName(name));
  for (const parts of headerPieces(parsed)) {
    for (let i = 0; i < parts.length; ) {
      let took = 0;
      for (let n = Math.min(3, parts.length - i); n >= 1 && !took; n--) {
        const name = parts.slice(i, i + n).join(' and ');
        const d = find(choices.detachments, name);
        if (d) {
          if (!detachments.includes(d)) detachments.push(d);
          took = n;
          continue;
        }
        const p = find(choices.dispositions, name);
        if (p) {
          disposition = p;
          took = n;
        }
      }
      if (!took) {
        unused.push(parts[i]!);
        took = 1;
      }
      i += took;
    }
  }
  return { detachments, disposition, unused: [...new Set(unused)] };
}

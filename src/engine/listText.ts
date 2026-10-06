import { buildDefault, instAt, newUnit, setOptionCount, updateChildren, type SelPath } from './rules/edit';
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
  for (const raw of lines) {
    const line = raw.replace(/\t/g, '  ');
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^exported with/i.test(trimmed)) continue;
    if (SECTIONS.test(trimmed)) {
      inHeader = false;
      cur = undefined;
      continue;
    }
    const bullet = trimmed.match(/^([•◦\-*+▪●○·])\s*(.*)$/);
    if (bullet && cur) {
      const indent = line.length - line.trimStart().length;
      const depth = bullet[1] === '◦' || bullet[1] === '○' || indent >= 4 ? 2 : 1;
      const body = bullet[2]!.trim();
      if (/^warlord$/i.test(body)) cur.lines.push({ depth, count: 1, name: 'Warlord', kind: 'warlord' });
      else if (/^enhancements?:/i.test(body)) cur.lines.push({ depth, count: 1, name: body.replace(/^enhancements?:\s*/i, '').replace(UNIT_RE, '$1').trim(), kind: 'enhancement' });
      else if (/^attached to:/i.test(body)) cur.lines.push({ depth, count: 1, name: body.replace(/^attached to:\s*/i, ''), kind: 'attached' });
      else {
        const m = body.match(/^(\d+)\s*x\s+(.+)$/i);
        cur.lines.push({ depth, count: m ? Number(m[1]) : 1, name: (m ? m[2]! : body).trim(), kind: 'item' });
      }
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
      cur = { name: u[1]!.trim(), points: num(u[2]!), lines: [] };
      out.units.push(cur);
    } else if (!bullet) {
      cur = { name: trimmed, lines: [] };
      out.units.push(cur);
    }
  }
  return out;
}

/** "Detachment: Gladius Task Force (2 DP) + Anvil Siege Force" -> the names. */
export function headerParts(line: string): string[] {
  return line
    .replace(/^(detachments?|faction|army|chapter)\s*:\s*/i, '')
    .split(/\s*(?:\+|,|\/|&)\s*/)
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
  refresh();

  const top = parsed.lines.filter((l) => l.depth === 1);
  const modelLines = top.filter((l) => {
    const root = engine.unitInst(unit.id);
    const o = root && l.kind === 'item' ? findOption(engine, root, l.name) : undefined;
    return o?.node.type === 'model';
  });

  if (modelLines.length) {
    // Clear default models, then add each listed model as its own selection.
    const root = engine.unitInst(unit.id)!;
    unit = updateChildren(unit, [], (children) => children.filter((s) => root.children.find((c) => c.sel === s)?.node?.type !== 'model'));
    refresh();
  }

  let lineIdx = 0;
  for (const line of parsed.lines) {
    lineIdx++;
    if (line.depth !== 1) continue;
    const root = engine.unitInst(unit.id);
    if (!root) break;
    if (line.kind === 'attached') continue;
    if (line.kind === 'warlord') {
      const o = findOption(engine, root, 'Warlord');
      if (o) {
        unit = setOptionCount(engine, unit, [], o.node.key, 1);
        refresh();
        report.matched.push(`${parsed.name}: Warlord`);
      } else report.unmatched.push(`${parsed.name}: Warlord`);
      continue;
    }
    if (line.kind === 'enhancement') {
      const ok = setDeep(engine, unit, [], line.name, 1);
      if (ok) {
        unit = ok;
        refresh();
        report.matched.push(`${parsed.name}: ${line.name}`);
      } else report.unmatched.push(`${parsed.name}: Enhancement ${line.name}`);
      continue;
    }
    const o = findOption(engine, root, line.name);
    if (!o) {
      // Single-model units list wargear at the first level.
      const ok = setDeep(engine, unit, [], line.name, line.count);
      if (ok) {
        unit = ok;
        refresh();
        report.matched.push(`${parsed.name}: ${line.name}`);
      } else report.unmatched.push(`${parsed.name}: ${line.name}`);
      continue;
    }
    if (o.node.type === 'model') {
      const sel = buildDefault(engine, root, o.node, o.groups, line.count);
      unit = { ...unit, selections: [...unit.selections, sel] };
      refresh();
      const path: SelPath = [unit.selections.length - 1];
      // Its wargear lines follow at depth 2.
      for (let k = lineIdx; k < parsed.lines.length && parsed.lines[k]!.depth === 2; k++) {
        const w = parsed.lines[k]!;
        const ok = setDeep(engine, unit, path, w.name, Math.max(1, Math.round(w.count / Math.max(line.count, 1))));
        if (ok) {
          unit = ok;
          refresh();
        } else report.unmatched.push(`${parsed.name}: ${o.node.name} → ${w.name}`);
      }
      report.matched.push(`${parsed.name}: ${line.count}x ${o.node.name}`);
    } else {
      unit = setOptionCount(engine, unit, [], o.node.key, line.count);
      refresh();
      report.matched.push(`${parsed.name}: ${line.name}`);
    }
  }
  report.matched.push(`Unit: ${choice.name}`);
  return unit;
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

/** Every name-like piece of the list's header (faction, sub-faction, detachments, disposition). */
export function headerCandidates(parsed: ParsedList): string[] {
  const out: string[] = [];
  for (const l of parsed.headerLines) {
    if (/incursion|strike force|onslaught/i.test(l)) continue;
    if (parsed.title && l.startsWith(parsed.title)) continue;
    out.push(...headerParts(l.replace(/^(force )?disposition:\s*/i, '')));
  }
  if (parsed.disposition) out.push(parsed.disposition);
  return [...new Set(out)];
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

/** Detachments and Force Disposition named anywhere in the header, matched against the data. */
export function matchConfig(parsed: ParsedList, choices: { detachments: { key: string; name: string }[]; dispositions: { key: string; name: string }[] }) {
  const cands = headerCandidates(parsed);
  const detachments: { key: string; name: string }[] = [];
  let disposition: { key: string; name: string } | undefined;
  const used = new Set<string>();
  for (const c of cands) {
    const n = normName(c);
    const d = choices.detachments.find((x) => normName(x.name) === n);
    if (d && !detachments.includes(d)) {
      detachments.push(d);
      used.add(c);
      continue;
    }
    const p = choices.dispositions.find((x) => normName(x.name) === n);
    if (p) {
      disposition = p;
      used.add(c);
    }
  }
  return { detachments, disposition, unused: cands.filter((c) => !used.has(c)) };
}

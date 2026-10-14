import { ensureFaction, type FactionFile } from './dataPacks';
import { loadIndex, rootsFor } from './gameData';
import { uid } from './rosters';
import { importUnit, matchConfig, normName, parseListText, type ImportReport, type ParsedList } from '@/engine/listText';
import { configChoices, setBattleSize, setDetachments, setDisposition, setShowOptions, showOptions } from '@/engine/rules/config';
import { autoFill } from '@/engine/rules/edit';
import { fillMinimumModels } from '@/engine/rules/modelTypes';
import { RosterEngine } from '@/engine/rules/rosterEngine';
import type { Roster, RosterUnit } from '@/engine/types';

/**
 * Turn pasted list text into a roster using the downloaded data: faction,
 * detachments, disposition, units, wargear, Warlord, enhancements, leaders,
 * plus any models the datasheets require that the text left out.
 */
export async function importListText(parsedOrText: ParsedList | string, faction: FactionFile, onProgress?: (msg: string) => void): Promise<{ roster: Roster; report: ImportReport }> {
  const parsed = typeof parsedOrText === 'string' ? parseListText(parsedOrText) : parsedOrText;
  const rec = await ensureFaction(faction.path, onProgress);
  const catalogueId = rec.catalogueId ?? '';
  const index = await loadIndex(catalogueId);
  const roots = rootsFor(index, catalogueId);
  const now = Date.now();
  let roster: Roster = {
    id: uid(),
    name: parsed.title || `${faction.name} list`,
    gameSystemId: '',
    catalogueId,
    factionName: faction.name,
    dataCommit: rec.commit,
    battleSize: parsed.battleSize ?? 'strikeForce',
    pointsLimit: 2000,
    config: [],
    detachmentIds: [],
    units: [],
    createdAt: now,
    updatedAt: now,
  };
  const eng = () => new RosterEngine(index, roster, roots);
  roster = setBattleSize(eng(), roster, roster.battleSize);
  const choices = configChoices(eng());
  const cfg = matchConfig(parsed, { detachments: choices.detachments.filter((d) => !d.hidden), dispositions: choices.dispositions });
  // Units only show up once a detachment is chosen: with none named, use the first so they can be matched.
  const fallback = cfg.detachments.length ? undefined : choices.detachments.find((d) => !d.hidden);
  if (cfg.detachments.length) roster = setDetachments(eng(), roster, cfg.detachments.map((d) => d.key));
  else if (fallback) roster = setDetachments(eng(), roster, [fallback.key]);
  // No disposition line: take the one the (first) detachment belongs to.
  const dispName = cfg.disposition?.name ?? choices.detachments.find((d) => d.key === (cfg.detachments[0] ?? fallback)?.key)?.dispositions[0];
  const disp = choices.dispositions.find((d) => d.name === dispName);
  if (disp) roster = setDisposition(eng(), roster, disp.key);

  const rep: ImportReport = { matched: [], unmatched: [] };
  cfg.detachments.forEach((d) => rep.matched.push(`Detachment: ${d.name}`));
  if (disp) rep.matched.push(`Force Disposition: ${disp.name}${cfg.disposition ? '' : ' (from the detachment)'}`);
  if (!cfg.detachments.length) rep.unmatched.push(fallback ? `No detachment found in the header — set to ${fallback.name}; change it in the list menu` : 'No detachment found in the header — pick one in the list menu');
  const fName = normName(faction.name);
  rep.notes = [];
  // Header names that aren't the faction: most likely a detachment the game data doesn't have yet.
  const factionWords = new Set([fName, ...rec.name ? [normName(rec.name.split(' - ').pop() ?? '')] : []]);
  cfg.unused
    .filter((u) => !factionWords.has(normName(u)) && !/space marines|adeptus astartes|^attached units?/i.test(u) && !/\d/.test(u))
    .forEach((u) => rep.unmatched.push(`Detachment not in the game data yet: ${u}`));

  // Legends datasheets are behind the data's "Show Legends" switch: turn it on when the list has any.
  const legendsSwitch = () => showOptions(eng()).find((o) => /^show legends$/i.test(o.name));
  const legendsOn = () => {
    const o = legendsSwitch();
    if (o && !o.on) roster = setShowOptions(eng(), roster, { [o.key]: true });
  };
  if (parsed.legends || parsed.units.some((u) => u.legends)) legendsOn();

  const units: RosterUnit[] = [];
  const attach: { unit: RosterUnit; to: string }[] = [];
  const groups = new Map<number, { leaders: RosterUnit[]; body?: RosterUnit }>();
  const pairs: { pu: (typeof parsed.units)[number]; u: RosterUnit }[] = [];
  for (const pu of parsed.units) {
    onProgress?.(`Matching ${pu.name}…`);
    const engineFor = (us: RosterUnit[]) => new RosterEngine(index, { ...roster, units: us }, roots);
    let u = importUnit(engineFor, units, pu, rep);
    // Not found: it may be a Legends datasheet the list didn't mark. Try again with Legends shown.
    if (!u && legendsSwitch() && !legendsSwitch()!.on) {
      const before = roster;
      legendsOn();
      const probe: ImportReport = { matched: [], unmatched: [] };
      u = importUnit((us) => new RosterEngine(index, { ...roster, units: us }, roots), units, pu, probe);
      if (u) {
        rep.unmatched = rep.unmatched.filter((x) => x !== `Unit: ${pu.name}`);
        rep.matched.push(...probe.matched);
        rep.unmatched.push(...probe.unmatched);
      } else roster = before;
    }
    if (!u) continue;
    // Fill in anything the datasheet requires that the text left out (e.g. the Sergeant).
    const one = (x: RosterUnit) => engineFor([...units, x]);
    const filled = fillMinimumModels(one, u);
    filled.added.forEach((a) => rep.unmatched.push(`${pu.name}: added missing ${a} — check its wargear`));
    u = autoFill(one, filled.unit);
    units.push(u);
    pairs.push({ pu, u });
    const a = pu.lines.find((l) => l.kind === 'attached');
    if (a) attach.push({ unit: u, to: a.name });
    if (pu.attachedGroup !== undefined) {
      const g = groups.get(pu.attachedGroup) ?? { leaders: [] };
      if (pu.attachedRole === 'bodyguard') g.body = u;
      else g.leaders.push(u);
      groups.set(pu.attachedGroup, g);
    }
  }
  // "Attached Unit N" blocks: each leader joins that block's bodyguard unit.
  for (const g of groups.values()) {
    if (!g.body) continue;
    for (const l of g.leaders) {
      l.leaderOf = g.body.id;
      rep.matched.push(`${l.name} leads ${g.body.name}`);
    }
  }
  for (const { unit, to } of attach) {
    const body = units.find((x) => x !== unit && normName(x.name) === normName(to));
    if (body) unit.leaderOf = body.id;
  }
  roster = { ...roster, units };
  // The official app allowed these attachments; where the game data doesn't list them yet, keep them as by-hand ones.
  {
    const e = new RosterEngine(index, roster, roots);
    for (const u of units) if (u.leaderOf && !e.attachTargets(u.id).includes(u.leaderOf)) u.leaderForced = true;
  }
  // Points that differ from the list come from the game data version, not the import.
  const final = new RosterEngine(index, roster, roots);
  pairs.forEach(({ pu, u }) => {
    if (pu.points === undefined) return;
    const here = final.unitPoints(u.id);
    if (here !== pu.points) rep.notes!.push(`${pu.name}: ${here} pts here, ${pu.points} in your list`);
  });
  if (rep.notes.length) rep.notes.unshift('Points differ because the community game data (BSData) is on an older points list than the official app:');
  return { roster, report: rep };
}

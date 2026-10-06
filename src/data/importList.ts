import { ensureFaction, type FactionFile } from './dataPacks';
import { loadIndex, rootsFor } from './gameData';
import { uid } from './rosters';
import { importUnit, matchConfig, normName, parseListText, type ImportReport, type ParsedList } from '@/engine/listText';
import { configChoices, setBattleSize, setDetachments, setDisposition } from '@/engine/rules/config';
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
  cfg.unused.filter((u) => normName(u) !== fName && !/space marines|adeptus astartes/i.test(u) && !/\d/.test(u)).forEach((u) => rep.unmatched.push(`Header line not matched: ${u}`));

  const units: RosterUnit[] = [];
  const attach: { unit: RosterUnit; to: string }[] = [];
  for (const pu of parsed.units) {
    onProgress?.(`Matching ${pu.name}…`);
    const engineFor = (us: RosterUnit[]) => new RosterEngine(index, { ...roster, units: us }, roots);
    let u = importUnit(engineFor, units, pu, rep);
    if (!u) continue;
    // Fill in anything the datasheet requires that the text left out (e.g. the Sergeant).
    const one = (x: RosterUnit) => engineFor([...units, x]);
    const filled = fillMinimumModels(one, u);
    filled.added.forEach((a) => rep.unmatched.push(`${pu.name}: added missing ${a} — check its wargear`));
    u = autoFill(one, filled.unit);
    units.push(u);
    const a = pu.lines.find((l) => l.kind === 'attached');
    if (a) attach.push({ unit: u, to: a.name });
  }
  for (const { unit, to } of attach) {
    const body = units.find((x) => x !== unit && normName(x.name) === normName(to));
    if (body) unit.leaderOf = body.id;
  }
  roster = { ...roster, units };
  return { roster, report: rep };
}

import type { Roster, RosterUnit, Selection } from './types';

/**
 * A list as ids and counts only, small enough for a link or QR code.
 * No rules text, names only where the user typed them.
 */
export interface SharePayload {
  v: 1;
  /** catalogue id */
  c: string;
  /** data file path, so the receiver can download the faction */
  f?: string;
  n: string;
  fn: string;
  b: Roster['battleSize'];
  p: number;
  d?: string;
  g: CompactSel[];
  u: [string, CompactSel[], string?, string?][]; // entryId, selections, leaderOf index, nickname
  dn?: string[];
  fd?: string;
}
type CompactSel = [string, number, CompactSel[]?];

const pack = (s: Selection): CompactSel => (s.children.length ? [s.entryId, s.count, s.children.map(pack)] : [s.entryId, s.count]);
const unpack = (c: CompactSel): Selection => ({ entryId: c[0], count: c[1], children: (c[2] ?? []).map(unpack) });

export function toPayload(roster: Roster, path?: string): SharePayload {
  const idx = new Map(roster.units.map((u, i) => [u.id, String(i)]));
  return {
    v: 1,
    c: roster.catalogueId,
    f: path,
    n: roster.name,
    fn: roster.factionName,
    b: roster.battleSize,
    p: roster.pointsLimit,
    d: roster.dataCommit,
    g: roster.config.map(pack),
    u: roster.units.map((u) => [u.entryId, u.selections.map(pack), u.leaderOf ? idx.get(u.leaderOf) : undefined, u.nickname]),
    dn: roster.detachmentNames,
    fd: roster.forceDisposition,
  };
}

export function fromPayload(p: SharePayload, newId: () => string): Roster {
  if (p.v !== 1) throw new Error('This link is from a newer version of the app.');
  const ids = p.u.map(() => newId());
  const units: RosterUnit[] = p.u.map(([entryId, sels, leader, nickname], i) => ({
    id: ids[i]!,
    entryId,
    name: '',
    points: 0,
    primaryCategory: '',
    selections: sels.map(unpack),
    leaderOf: leader !== undefined && leader !== null ? ids[Number(leader)] : undefined,
    nickname: nickname || undefined,
  }));
  const now = Date.now();
  return {
    id: newId(),
    name: p.n,
    gameSystemId: '',
    catalogueId: p.c,
    factionName: p.fn,
    dataCommit: p.d,
    battleSize: p.b,
    pointsLimit: p.p,
    config: p.g.map(unpack),
    detachmentIds: [],
    detachmentNames: p.dn,
    forceDisposition: p.fd,
    units,
    createdAt: now,
    updatedAt: now,
  };
}

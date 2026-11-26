import { applyRestore, exportBackup, previewRestore } from './backup';
import { summaryText, type RestoreSummary } from './backupMerge';
import { db, metaOf, type CachedDataFile, type DataSourceState } from './db';
import { fileKey, realPath } from './fileKeys';

/**
 * Moving to a new web address. Browsers keep a site's data per address, so
 * the app at a new address starts empty — and the army data can't be
 * downloaded again while its source is offline. This packs everything on
 * this device (lists, games, collection, layouts, pins, the downloaded army
 * data and imported rules), encrypts it with a fresh random key and leaves
 * it at the new address's server for a short while. The key is only in the
 * link's #fragment, which browsers never send to a server, so the server
 * holds a parcel it can't read.
 *
 * Receiving merges: anything already at the new address is kept, lists and
 * games are only taken where the parcel's copy is newer, and data files only
 * where the new address has none.
 */

const MAGIC = 0x45; // 'E'
const FLAG_GZIP = 1;

export interface Parcel {
  app: 'emperorslist';
  kind: 'move';
  version: 1;
  madeAt: string;
  /** The ordinary backup file text. */
  backup: string;
  dataFiles: CachedDataFile[];
  dataSources: DataSourceState[];
  imported: unknown[];
}

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** Unpacked parcels larger than this are refused (a real one is a few tens of MB). */
const MAX_UNPACKED = 400 * 1024 * 1024;

async function pipe(bytes: Uint8Array, stream: TransformStream<Uint8Array, Uint8Array>, max = Infinity): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new TransferError('This parcel is too large to unpack.');
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Encrypt a parcel. Returns the bytes to upload and the key (base64url) for the link. */
export async function seal(parcel: Parcel): Promise<{ bytes: Uint8Array; key: string }> {
  let body: Uint8Array = new TextEncoder().encode(JSON.stringify(parcel));
  let flags = 0;
  if (typeof CompressionStream !== 'undefined') {
    body = await pipe(body, new CompressionStream('gzip'));
    flags |= FLAG_GZIP;
  }
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, body));
  const out = new Uint8Array(2 + 12 + ct.length);
  out[0] = MAGIC;
  out[1] = flags;
  out.set(iv, 2);
  out.set(ct, 14);
  return { bytes: out, key: b64url(raw) };
}

export class TransferError extends Error {}

/** Decrypt and check a parcel. Throws a TransferError with a message for the player. */
export async function open(bytes: Uint8Array, keyText: string): Promise<Parcel> {
  if (bytes.length < 30 || bytes[0] !== MAGIC) throw new TransferError('This isn’t an EmperorsList move parcel.');
  let raw: Uint8Array;
  try {
    raw = unb64url(keyText);
  } catch {
    throw new TransferError('The code is incomplete. Copy the whole link or code again.');
  }
  if (raw.length !== 32) throw new TransferError('The code is incomplete. Copy the whole link or code again.');
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  let body: Uint8Array;
  try {
    body = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(2, 14) }, key, bytes.slice(14)));
  } catch {
    throw new TransferError('The code doesn’t match this parcel. Copy the whole link or code again.');
  }
  if (bytes[1]! & FLAG_GZIP) {
    if (typeof DecompressionStream === 'undefined') throw new TransferError('This browser is too old to unpack the parcel. Update it and try again.');
    body = await pipe(body, new DecompressionStream('gzip'), MAX_UNPACKED);
  }
  const p = JSON.parse(new TextDecoder().decode(body)) as Parcel;
  if (p?.app !== 'emperorslist' || p.kind !== 'move') throw new TransferError('This isn’t an EmperorsList move parcel.');
  if (p.version > 1) throw new TransferError('This parcel was made by a newer version of the app. Reload the app to update it, then try again.');
  return p;
}

/** Everything on this device, ready to seal. */
export async function packThisDevice(): Promise<Parcel> {
  const [backup, dataFiles, dataSources, imported] = await Promise.all([exportBackup(), db.dataFiles.toArray(), db.dataSources.toArray(), db.imported.toArray()]);
  return { app: 'emperorslist', kind: 'move', version: 1, madeAt: new Date().toISOString(), backup, dataFiles, dataSources, imported };
}

/** A move code is "<parcel id>.<key>"; a link carries it after #. */
export const moveCode = (id: string, key: string) => `${id}.${key}`;
export function parseMoveCode(text: string): { id: string; key: string } | undefined {
  const m = /([a-f0-9]{16})\.([A-Za-z0-9_-]{43})/.exec(text.trim());
  return m ? { id: m[1]!, key: m[2]! } : undefined;
}

/** Old address: pack, seal and leave the parcel at the new address. Returns the link to open there. */
export async function sendTo(newHome: string, onStep?: (s: string) => void): Promise<{ link: string; code: string; expiresAt: number }> {
  const home = newHome.replace(/\/+$/, '');
  onStep?.('Packing your lists, games and army data…');
  const parcel = await packThisDevice();
  onStep?.('Encrypting…');
  const { bytes, key } = await seal(parcel);
  onStep?.(`Sending ${(bytes.length / 1024 / 1024).toFixed(1)} MB…`);
  const res = await fetch(`${home}/api/transfer`, { method: 'POST', body: bytes as BodyInit, headers: { 'Content-Type': 'application/octet-stream' } });
  if (!res.ok) throw new TransferError(res.status === 413 ? 'Too much data to send in one go.' : res.status === 429 ? 'Too many tries — wait a while and try again.' : `The new address didn’t accept the parcel (${res.status}).`);
  const { id, expiresAt } = (await res.json()) as { id: string; expiresAt: number };
  const code = moveCode(id, key);
  return { link: `${home}/move#${code}`, code, expiresAt };
}

export interface MoveResult {
  summary: RestoreSummary | undefined;
  dataFiles: number;
  imported: number;
}

/** New address: fetch the parcel from this server and merge it in. */
export async function receive(code: string, onStep?: (s: string) => void): Promise<MoveResult> {
  const c = parseMoveCode(code);
  if (!c) throw new TransferError('That isn’t a move code. Copy the whole link or code again.');
  onStep?.('Fetching the parcel…');
  const res = await fetch(`${import.meta.env.BASE_URL}api/transfer/${c.id}`, { cache: 'no-store' });
  if (res.status === 404) throw new TransferError('This parcel has expired or was never sent. Send it again from the old address.');
  if (!res.ok) throw new TransferError(`Couldn’t fetch the parcel (${res.status}). Try again.`);
  onStep?.('Unpacking…');
  const parcel = await open(new Uint8Array(await res.arrayBuffer()), c.key);
  onStep?.('Adding it to this device…');
  return mergeParcel(parcel);
}

/** Merge a parcel into this device without replacing anything newer that is already here. */
export async function mergeParcel(p: Parcel): Promise<MoveResult> {
  let summary: RestoreSummary | undefined;
  try {
    summary = await applyRestore(await previewRestore(p.backup), 'newer');
  } catch (e) {
    // An empty backup (nothing made yet) is fine: the army data may still be worth having.
    if (!(e instanceof Error && /empty/i.test(e.message))) throw e;
  }
  const { files, imported } = await mergeDataCache(p);
  return { summary, dataFiles: files, imported };
}

/**
 * Army data and imported rules: only fill gaps. A file already here stays as
 * it is (it may be from a newer download); a source's record is taken only
 * when this device has none.
 */
async function mergeDataCache(p: Parcel): Promise<{ files: number; imported: number }> {
  let files = 0;
  let imported = 0;
  await db.transaction('rw', [db.dataFiles, db.dataMeta, db.dataSources], async () => {
    for (const f of p.dataFiles ?? []) {
      if (!f?.path || !f.source) continue;
      // Stored the way a download from that source would be: its own key when another source holds the path.
      const path = realPath(f);
      const key = fileKey(path, f.source, await db.dataMeta.get(path));
      if (await db.dataFiles.get(key)) continue;
      const rec = { ...f, path: key };
      await db.dataFiles.put(rec);
      await db.dataMeta.put(metaOf(rec, p.dataSources?.find((s) => s.source === f.source)?.shas?.[path]));
      files++;
    }
    for (const s of p.dataSources ?? []) {
      // Never replace a record here: its file list and versions describe the files here.
      if (!(await db.dataSources.get(s.source))) await db.dataSources.put(s);
    }
  });
  const rows = (p.imported ?? []) as { id: string; kind: string }[];
  if (rows.length) {
    await db.transaction('rw', db.imported, async () => {
      for (const kind of new Set(rows.map((r) => r.kind))) {
        if ((await db.imported.where('kind').equals(kind).count()) > 0) continue;
        const add = rows.filter((r) => r.kind === kind);
        await db.imported.bulkPut(add as never[]);
        imported += add.length;
      }
    });
  }
  return { files, imported };
}

export const resultText = (r: MoveResult) =>
  [r.summary ? summaryText(r.summary) : '', r.dataFiles ? `${r.dataFiles} army data files added.` : '', r.imported ? `${r.imported} imported rules added.` : ''].filter(Boolean).join(' ') || 'Nothing new to add — this device already had everything.';

import { fromPayload, toPayload, type SharePayload } from '@/engine/share';
import type { Roster } from '@/engine/types';
import { db } from './db';
import { uid } from './rosters';

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** "z" prefix = deflate-raw compressed, "j" = plain JSON (older browsers). */
export async function encodeRoster(roster: Roster): Promise<string> {
  const file = await db.dataMeta.where('catalogueId').equals(roster.catalogueId).first();
  const json = new TextEncoder().encode(JSON.stringify(toPayload(roster, file?.path)));
  if (typeof CompressionStream !== 'undefined') {
    try {
      return `z${b64url(await pipe(json, new CompressionStream('deflate-raw')))}`;
    } catch {
      /* fall through */
    }
  }
  return `j${b64url(json)}`;
}

export async function decodePayload(code: string): Promise<SharePayload> {
  const kind = code[0];
  const bytes = fromB64url(code.slice(1));
  const json = kind === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
  return JSON.parse(new TextDecoder().decode(json)) as SharePayload;
}

export function payloadToRoster(p: SharePayload): Roster {
  return fromPayload(p, uid);
}

export function shareUrl(code: string): string {
  return `${location.origin}${import.meta.env.BASE_URL}import#l=${code}`;
}

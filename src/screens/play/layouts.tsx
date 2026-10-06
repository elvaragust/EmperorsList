import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { db, type Layout } from '@/data/db';
import { uid } from '@/data/rosters';
import { Screen } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';

/** Shrink a photo so layouts stay small on the device. */
async function downscale(file: File, max = 1400): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Your own table layouts: photos or drawings of terrain and deployment you reuse in games. */
export function LayoutsScreen() {
  const layouts = useLiveQuery(() => db.layouts.orderBy('createdAt').reverse().toArray(), []);
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [view, setView] = useState<Layout | null>(null);
  const add = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    const image = await downscale(f);
    await db.layouts.put({ id: uid(), name: name.trim() || f.name.replace(/\.\w+$/, ''), image, createdAt: Date.now() });
    setName('');
  };
  return (
    <Screen title="Table layouts" back>
      <p className="small muted">Save a photo or screenshot of a terrain layout or deployment map you use. Pick it when setting up a game. Layouts stay on this device.</p>
      <div className="btn-row">
        <input className="input" placeholder="Name (e.g. Layout 3 · Crucible)" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => add(e.target.files)} />
        <button className="btn btn-sm" onClick={() => input.current?.click()}>
          Add photo
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {layouts?.map((l) => (
          <button key={l.id} className="card" style={{ padding: 6, textAlign: 'left' }} onClick={() => setView(l)}>
            <img src={l.image} alt={l.name} style={{ width: '100%', borderRadius: 8, display: 'block' }} />
            <div className="small" style={{ marginTop: 4 }}>
              {l.name}
            </div>
          </button>
        ))}
      </div>
      {layouts?.length === 0 && <p className="muted">No layouts yet.</p>}
      <Sheet open={Boolean(view)} onClose={() => setView(null)} title={view?.name}>
        {view && (
          <>
            <img src={view.image} alt={view.name} style={{ width: '100%', borderRadius: 10 }} />
            <button className="btn btn-ghost btn-danger btn-block" onClick={() => (db.layouts.delete(view.id), setView(null))}>
              Delete layout
            </button>
          </>
        )}
      </Sheet>
    </Screen>
  );
}

export function LayoutPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (name: string, layout: Layout) => void }) {
  const layouts = useLiveQuery(() => db.layouts.orderBy('createdAt').reverse().toArray(), []);
  return (
    <Sheet open={open} onClose={onClose} title="Saved layouts">
      {layouts?.length === 0 && <p className="muted">No saved layouts. Add them in Play → Table layouts.</p>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {layouts?.map((l) => (
          <button
            key={l.id}
            className="card"
            style={{ padding: 6, textAlign: 'left' }}
            onClick={() => {
              onPick(l.name, l);
              onClose();
            }}
          >
            <img src={l.image} alt={l.name} style={{ width: '100%', borderRadius: 8, display: 'block' }} />
            <div className="small" style={{ marginTop: 4 }}>
              {l.name}
            </div>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** Shows the saved layout whose name matches the game's deployment field, if any. */
export function LayoutPreview({ name }: { name?: string }) {
  const layout = useLiveQuery(() => (name ? db.layouts.where('name').equals(name).first() : undefined), [name]);
  if (!layout) return null;
  return <img src={layout.image} alt={layout.name} style={{ width: '100%', borderRadius: 10, marginTop: 8 }} />;
}

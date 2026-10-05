import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '@/data/db';
import { DEFAULT_SOURCE, syncSource } from '@/data/dataPacks';
import { Screen } from '@/ui/Screen';

export function SettingsScreen() {
  const sources = useLiveQuery(() => db.dataSources.toArray(), []);
  const [status, setStatus] = useState('');

  const download = async () => {
    try {
      setStatus('Checking for the latest data…');
      // Phase 1 downloads the game system and two factions; phase 2 lets you pick.
      const wanted = (p: string) => /Black Templars|Space Marines\.json|Custodes|^Warhammer 40,000/i.test(p);
      const s = await syncSource(wanted, (done, total, path) => setStatus(`Downloading ${done + 1}/${total}: ${path}`));
      setStatus(`Done · commit ${s.commit.slice(0, 7)}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Download failed');
    }
  };

  return (
    <Screen title="Settings">
      <div className="section-label">Data sources</div>
      <div className="card">
        <div className="row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
          <div style={{ fontWeight: 600 }}>Units, rules and points</div>
          <div className="muted small">
            {DEFAULT_SOURCE.owner}/{DEFAULT_SOURCE.repo}
            {sources?.[0] ? ` · commit ${sources[0].commit.slice(0, 7)}` : ' · not downloaded yet'}
          </div>
          <button className="btn" onClick={download}>
            Download / update
          </button>
          {status && <div className="small">{status}</div>}
        </div>
      </div>
      <div className="section-label">About</div>
      <p className="small muted">
        EmperorsList is an unofficial fan project, not affiliated with or endorsed by Games Workshop. No rules text ships with the
        app; game data is downloaded to this device from community sources.
      </p>
    </Screen>
  );
}

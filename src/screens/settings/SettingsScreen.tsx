import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { db } from '@/data/db';
import { currentSource, DEFAULT_SOURCE, setSource, sourceName, updateAll } from '@/data/dataPacks';
import { clearIndexCache } from '@/data/gameData';
import { downloadText, exportBackup, restoreBackup } from '@/data/backup';
import { detectFile, importWahapedia, type WahapediaFiles } from '@/engine/wahapedia';
import { Screen } from '@/ui/Screen';

export function SettingsScreen() {
  const source = currentSource();
  const state = useLiveQuery(() => db.dataSources.get(sourceName(source)), []);
  const files = useLiveQuery(() => db.dataFiles.toArray(), []);
  const importedCount = useLiveQuery(() => db.imported.count(), []);
  const [status, setStatus] = useState('');
  const [wpStatus, setWpStatus] = useState('');
  const [backupStatus, setBackupStatus] = useState('');
  const [repo, setRepo] = useState(`${source.owner}/${source.repo}@${source.branch}`);
  const wpInput = useRef<HTMLInputElement>(null);
  const restoreInput = useRef<HTMLInputElement>(null);

  const update = async () => {
    try {
      setStatus('Checking for new data…');
      const s = await updateAll((done, total, path) => setStatus(`Updating ${done + 1}/${total}: ${path}`));
      clearIndexCache();
      setStatus(`Up to date · ${s.commit.slice(0, 7)}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const saveRepo = () => {
    const m = repo.trim().match(/^([\w.-]+)\/([\w.-]+)(?:@([\w./-]+))?$/);
    if (!m) return setStatus('Use the form owner/repo@branch, for example BSData/wh40k-11e@main');
    setSource({ owner: m[1]!, repo: m[2]!, branch: m[3] ?? 'main' });
    clearIndexCache();
    setStatus('Source saved. New downloads come from there.');
  };

  const importWp = async (list: FileList | null) => {
    if (!list?.length) return;
    const parts: WahapediaFiles = {};
    for (const f of [...list]) {
      const text = await f.text();
      const kind = detectFile(f.name, text);
      if (kind) parts[kind] = text;
    }
    if (parts.stratagems || parts.enhancements || parts.detachmentAbilities) {
      const rules = importWahapedia(parts);
      await db.imported.bulkPut(rules);
      setWpStatus(`Imported ${rules.length} rules (${rules.filter((r) => r.kind === 'stratagem').length} stratagems).`);
    } else setWpStatus('No Wahapedia Stratagems/Enhancements/Detachment_abilities CSV found in those files.');
  };

  const backup = async () => {
    downloadText(`emperorslist-backup-${new Date().toISOString().slice(0, 10)}.json`, await exportBackup());
    setBackupStatus('Backup downloaded.');
  };
  const restore = async (list: FileList | null) => {
    const file = list?.[0];
    if (!file) return;
    try {
      const r = await restoreBackup(await file.text());
      setBackupStatus(`Restored ${r.rosters} lists, ${r.games} games, ${r.collection} collection entries.`);
    } catch (e) {
      setBackupStatus(e instanceof Error ? e.message : 'Restore failed');
    }
  };

  const size = files?.reduce((s, f) => s + JSON.stringify(f.json).length, 0) ?? 0;

  return (
    <Screen title="Settings">
      <div className="section-label">Data</div>
      <div className="card">
        <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, padding: 14 }}>
          <div style={{ fontWeight: 600 }}>Units, rules and points</div>
          <div className="muted small">
            {sourceName(source)} · {state ? `version ${state.commit.slice(0, 7)}, checked ${new Date(state.fetchedAt).toLocaleDateString()}` : 'not checked yet'}
          </div>
          <div className="muted small">
            {files?.length ?? 0} files on this device · {(size / 1e6).toFixed(1)} MB. Factions download when you start a list with them.
          </div>
          <button className="btn" onClick={update}>
            Check for updates
          </button>
          {status && <div className="small">{status}</div>}
        </div>
        <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, padding: 14 }}>
          <label className="field" style={{ margin: 0 }}>
            <span>Source repository (for forks)</span>
            <input className="input" value={repo} onChange={(e) => setRepo(e.target.value)} />
          </label>
          <div className="btn-row" style={{ margin: 0 }}>
            <button className="btn btn-sm" onClick={saveRepo}>
              Save source
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setRepo(`${DEFAULT_SOURCE.owner}/${DEFAULT_SOURCE.repo}@${DEFAULT_SOURCE.branch}`)}>
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="section-label">Extra rules (Wahapedia)</div>
      <div className="card">
        <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, padding: 14 }}>
          <div className="small">
            The community data has no Stratagems. Download <b>Stratagems.csv</b> and <b>Factions.csv</b> (optionally Enhancements.csv and Detachment_abilities.csv) from Wahapedia's export page, or run{' '}
            <code>node scripts/wahapedia.mjs</code>, then pick the files here. They stay on this device.
          </div>
          <div className="muted small">{importedCount ?? 0} imported rules</div>
          <input ref={wpInput} type="file" accept=".csv,text/csv,text/plain" multiple hidden onChange={(e) => importWp(e.target.files)} />
          <div className="btn-row" style={{ margin: 0 }}>
            <button className="btn btn-sm" onClick={() => wpInput.current?.click()}>
              Import CSV files
            </button>
            {(importedCount ?? 0) > 0 && (
              <button className="btn btn-sm btn-ghost btn-danger" onClick={() => db.imported.clear().then(() => setWpStatus('Cleared.'))}>
                Clear imported
              </button>
            )}
          </div>
          {wpStatus && <div className="small">{wpStatus}</div>}
          <div className="credit">Powered by Wahapedia (wahapedia.ru).</div>
        </div>
      </div>

      <div className="section-label">Backup</div>
      <div className="card">
        <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, padding: 14 }}>
          <div className="small">Save all your lists, games and collection to a file, or load them on another device. Game data is not included.</div>
          <input ref={restoreInput} type="file" accept=".json,application/json" hidden onChange={(e) => restore(e.target.files)} />
          <div className="btn-row" style={{ margin: 0 }}>
            <button className="btn btn-sm" onClick={backup}>
              Download backup
            </button>
            <button className="btn btn-sm" onClick={() => restoreInput.current?.click()}>
              Restore from file
            </button>
          </div>
          {backupStatus && <div className="small">{backupStatus}</div>}
        </div>
      </div>

      <div className="section-label">About</div>
      <p className="small muted">
        EmperorsList is an unofficial fan project, not affiliated with or endorsed by Games Workshop. Warhammer 40,000 and related names are trademarks of Games Workshop Limited. No rules text
        ships with the app; game data is downloaded to this device from the BSData community repository, and optional extras from Wahapedia.
      </p>
    </Screen>
  );
}

import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { db } from '@/data/db';
import { currentSource, DEFAULT_SOURCE, setSource, sourceName } from '@/data/dataPacks';
import { clearIndexCache } from '@/data/gameData';
import { applyRestore, lastBackupAt, previewRestore, saveBackupFile } from '@/data/backup';
import { BACKUP_KINDS, BackupError, summaryText, type BackupKind, type Compare, type RestoreMode, type RestorePlan } from '@/data/backupMerge';
import { storagePlatform } from '@/data/platform';
import { coreSectionsToRules, detectFile, importWahapedia, type WahapediaFiles } from '@/engine/wahapedia';
import { parseCoreRules } from '@/engine/coreRules';
import { loadCoreRules, syncAllFactions, syncWahapedia, useSyncStatus } from '@/data/bootstrap';
import { peerServer, setPeerServer } from '@/sync/room';
import { Screen } from '@/ui/Screen';
import { showToast } from '@/ui/Toast';
import { keepStorage, useStorageInfo } from '@/data/storage';
import { setAppearance, useAppearance, type Appearance } from '@/theme/appearance';
import { THEME_CHOICES } from '@/theme/themes';
import { RuleLabel } from '@/ui/RuleLabel';
import { Collapse } from '@/ui/Collapse';
import { Sheet } from '@/ui/Sheet';

const KIND_LABEL: Record<BackupKind, string> = { rosters: 'Lists', games: 'Games', collection: 'Collection', layouts: 'Layouts', pins: 'Pins' };
const COMPARE_LABEL: [Compare, string][] = [
  ['new', 'new'],
  ['newer', 'newer than this device'],
  ['older', 'older than this device'],
  ['differs', 'different on this device'],
  ['same', 'already here'],
];

/** What restoring a backup would do, before anything changes. */
function RestoreSheet({ pending, onClose, onDone }: { pending: { name: string; plan: RestorePlan } | null; onClose: () => void; onDone: (text: string) => void }) {
  const [mode, setMode] = useState<RestoreMode>('newer');
  const [busy, setBusy] = useState(false);
  const plan = pending?.plan;
  const saved = plan?.data.exportedAt ? new Date(plan.data.exportedAt) : undefined;
  const run = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      onDone(`Restored. ${summaryText(await applyRestore(plan, mode))}`);
    } catch (e) {
      onDone(`Restore failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      setMode('newer');
    }
  };
  return (
    <Sheet open={Boolean(pending)} onClose={onClose} title="Restore this backup?">
      {pending && plan && (
        <div className="confirm-message">
          <div>
            <strong>{pending.name}</strong>
            {saved && !Number.isNaN(saved.getTime()) ? `, saved ${saved.toLocaleDateString()}` : ''}
          </div>
          {BACKUP_KINDS.filter((k) => plan.data[k].length > 0).map((k) => (
            <div key={k} className="small" style={{ marginTop: 6 }}>
              <strong>{KIND_LABEL[k]}:</strong>{' '}
              {COMPARE_LABEL.filter(([c]) => plan.counts[k][c] > 0)
                .map(([c, label]) => `${plan.counts[k][c]} ${label}`)
                .join(' · ')}
            </div>
          ))}
          <div className="filters" style={{ flexWrap: 'wrap', marginTop: 12 }}>
            <button className={`filter ${mode === 'newer' ? 'on' : ''}`} onClick={() => setMode('newer')}>
              Keep the newer copy
            </button>
            <button className={`filter ${mode === 'replace' ? 'on' : ''}`} onClick={() => setMode('replace')}>
              Use the backup for everything
            </button>
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>
            {mode === 'newer'
              ? "Adds what's missing. Where both have a copy, the newer one stays (for pins, layouts and collection, this device's copy stays)."
              : "Adds what's missing and puts the backup's copy over this device's, even where this device's is newer."}{' '}
            Nothing else on this device is deleted.
            {plan.data.skipped ? ` ${plan.data.skipped} damaged ${plan.data.skipped === 1 ? 'entry' : 'entries'} in the file will be left out.` : ''}
          </div>
        </div>
      )}
      <div className="confirm-actions">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={run}>
          {busy ? 'Restoring…' : 'Restore'}
        </button>
      </div>
    </Sheet>
  );
}

function Choice<K extends keyof Appearance>({ k, options, value }: { k: K; options: [Appearance[K], string][]; value: Appearance[K] }) {
  return (
    <div className="filters" style={{ flexWrap: 'wrap' }}>
      {options.map(([v, label]) => (
        <button key={String(v)} className={`filter ${value === v ? 'on' : ''}`} onClick={() => setAppearance({ [k]: v } as Partial<Appearance>)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function SettingsScreen() {
  const source = currentSource();
  const state = useLiveQuery(() => db.dataSources.get(sourceName(source)), []);
  const files = useLiveQuery(() => db.dataMeta.toArray(), []);
  const importedCount = useLiveQuery(() => db.imported.count(), []);
  const [status, setStatus] = useState('');
  const [wpStatus, setWpStatus] = useState('');
  const [backupStatus, setBackupStatus] = useState('');
  const [repo, setRepo] = useState(`${source.owner}/${source.repo}@${source.branch}`);
  const wpInput = useRef<HTMLInputElement>(null);
  const sync = useSyncStatus();
  const look = useAppearance();
  const [peerHost, setPeerHost] = useState(peerServer());
  const updateStrats = async () => {
    setWpStatus('Checking…');
    const r = await syncWahapedia(true);
    setWpStatus(r ? `Updated: ${r.imported} rules.` : 'No Wahapedia files on this site (they are added when the app is built on GitHub). You can import CSV files by hand below.');
  };

  const restoreInput = useRef<HTMLInputElement>(null);

  const update = async () => {
    setStatus('');
    await syncAllFactions(true);
    void syncWahapedia();
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
    let core = 0;
    for (const f of [...list]) {
      const text = await f.text();
      if (/\.html?$/i.test(f.name) || /^\s*</.test(text)) {
        // A saved Core Rules page.
        const rules = coreSectionsToRules(parseCoreRules(text));
        if (rules.length) {
          await db.imported.where('kind').equals('coreRule').delete();
          await db.imported.bulkPut(rules);
          await loadCoreRules();
          core = rules.length;
        }
        continue;
      }
      const kind = detectFile(f.name, text);
      if (kind) parts[kind] = text;
    }
    if (core && !(parts.stratagems || parts.enhancements || parts.detachmentAbilities)) return setWpStatus(`Imported ${core} Core Rules sections.`);
    if (parts.stratagems || parts.enhancements || parts.detachmentAbilities) {
      const rules = importWahapedia(parts);
      await db.imported.bulkPut(rules);
      setWpStatus(`Imported ${rules.length} rules (${rules.filter((r) => r.kind === 'stratagem').length} stratagems).`);
    } else setWpStatus('No Wahapedia Stratagems/Enhancements/Detachment_abilities CSV found in those files.');
  };

  const backup = async () => {
    const how = await saveBackupFile();
    if (how) setBackupStatus(how === 'shared' ? 'Backup saved.' : 'Backup downloaded.');
  };
  const [pendingRestore, setPendingRestore] = useState<{ name: string; plan: RestorePlan } | null>(null);
  const restore = async (list: FileList | null) => {
    const file = list?.[0];
    if (restoreInput.current) restoreInput.current.value = '';
    if (!file) return;
    setBackupStatus('');
    try {
      setPendingRestore({ name: file.name, plan: await previewRestore(await file.text()) });
    } catch (e) {
      setBackupStatus(e instanceof BackupError ? e.message : `Couldn't read this backup: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const store = useStorageInfo();
  const platform = storagePlatform();

  return (
    <Screen title="Settings">
      <div className="section-label">Appearance</div>
      <div className="card">
        <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6, padding: 14 }}>
          <div className="small muted">Colour theme</div>
          <Choice k="themeMode" value={look.themeMode} options={[['faction', 'Follow my army (the last one I opened)'], ['fixed', 'Always one theme']]} />
          {look.themeMode === 'fixed' && (
            <select className="input" value={look.fixedTheme} onChange={(e) => setAppearance({ fixedTheme: e.target.value })} aria-label="Theme">
              {THEME_CHOICES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          )}
          <div className="small muted" style={{ marginTop: 8 }}>
            Text size
          </div>
          <Choice k="textSize" value={look.textSize} options={[['normal', 'Normal'], ['large', 'Large'], ['xlarge', 'Extra large']]} />
          <div className="small muted" style={{ marginTop: 8 }}>
            Colours
          </div>
          <Choice k="mode" value={look.mode} options={[['dark', 'Dark'], ['light', 'Light'], ['system', 'Match phone']]} />
          <div className="small muted" style={{ marginTop: 8 }}>
            Title font
          </div>
          <Choice k="titleFont" value={look.titleFont} options={[['gothic', 'Gothic'], ['serif', 'Engraved'], ['plain', 'Plain']]} />
          <div className="small muted" style={{ marginTop: 8 }}>
            Legends units in Add unit (imported lists keep theirs)
          </div>
          <Choice k="legends" value={look.legends} options={[['hidden', 'Hidden'], ['shown', 'Shown']]} />
          <div className="small muted" style={{ marginTop: 8 }}>
            Layout on laptops and tablets
          </div>
          <Choice k="layout" value={look.layout} options={[['auto', 'Fit the screen'], ['phone', 'Phone column']]} />
        </div>
      </div>

      <div className="section-label">Your data on this device</div>
      <div className="card">
        <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6, padding: 14 }}>
          <div className="small">
            {store ? `${store.lists} lists · ${store.games} games · ${store.pins} pins` : 'Counting…'}
            {store?.usage ? ` · ${(store.usage / 1e6).toFixed(0)} MB used` : ''}
          </div>
          {platform === 'ios-browser' ? (
            <div className="small muted">
              Everything is stored only in Safari on this device (nothing is uploaded). <strong>Safari deletes it if you don't open the app here for 7 days.</strong> Install the app instead: Share → Add to Home Screen. The installed app keeps its own data, separate from Safari's, so lists made here don't move to it — save a backup here and restore it in the installed app. A backup file is the only copy that survives everything.
            </div>
          ) : platform === 'ios-app' ? (
            <div className="small muted">
              Everything is stored only in this installed app on this device (nothing is uploaded), so Safari's 7-day clean-up doesn't apply. Its data is separate from Safari's: to move lists between them, use a backup file. Deleting the app from the Home Screen deletes its data. A backup file is the only copy that survives everything.
            </div>
          ) : (
            <div className="small muted">
              Everything is stored only in this browser on this phone (nothing is uploaded). It is not the browser's cache: clearing <em>cached images and files</em> leaves it alone, but clearing <em>site data / cookies and site data</em> for this site, or uninstalling the app, deletes it.{' '}
              {store?.persisted ? 'The browser has agreed to keep it even when the phone runs low on space.' : 'Right now the browser may also clear it when the phone runs low on space — installing the app (Add to Home screen) usually fixes that.'} A backup file is the only copy that survives everything.
            </div>
          )}
          {store && !store.persisted && platform !== 'ios-browser' && (
            <button className="btn btn-sm" onClick={async () => showToast((await keepStorage()) ? 'Storage will be kept' : 'The browser declined — install the app and keep a backup')}>
              Ask the browser to keep my data
            </button>
          )}
        </div>
      </div>

      <div className="section-label">Data</div>
      <div className="card">
        <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, padding: 14 }}>
          <div style={{ fontWeight: 600 }}>Units, rules and points</div>
          <div className="muted small">
            {sourceName(source)} · {state ? `version ${state.commit.slice(0, 7)}, checked ${new Date(state.fetchedAt).toLocaleDateString()}` : 'not checked yet'}
          </div>
          <div className="muted small">
            {files?.length ?? 0} files on this device. All factions load automatically; after that only changed files are downloaded.
          </div>
          <button className="btn" onClick={update}>
            Check for updates
          </button>
          {sync.running && <div className="small">Loading factions {sync.done}/{sync.total}…</div>}
          {sync.error && <div className="small issue-title">{sync.error}</div>}
          {status && <div className="small">{status}</div>}
        </div>
      </div>

      <div className="section-label">Backup</div>
      <div className="card">
        <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, padding: 14 }}>
          <div className="small">Save all your lists, games, collection, pins and table layouts to a file — on a phone you can send it straight to Google Drive, iCloud Files or email — and load it on any device. Game data is not included (it downloads again by itself).</div>
          <div className="small muted">{lastBackupAt() ? `Last backup from this phone: ${new Date(lastBackupAt()).toLocaleDateString()}` : 'No backup saved from this phone yet.'}</div>
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

      <div className="section-label">Advanced</div>
      <Collapse title="For troubleshooting and forks">
        <div className="card">
          <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6, padding: 14 }}>
          <div className="small muted" style={{ marginTop: 0 }}>
            Rule labels <RuleLabel kind="stratagem" />
          </div>
          <Choice k="labelStyle" value={look.labelStyle} options={[['dotted', 'Dotted box'], ['bold', 'Bold'], ['underline', 'Underline']]} />
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
      <div className="section-label" style={{ marginTop: 14 }}>Extra rules (Wahapedia)</div>
      <div className="card">
        <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, padding: 14 }}>
          <div className="small">Stratagems, enhancements and detachment rules from Wahapedia are built into the app and load by themselves. The Core Rules are included too, so tapping a rule shows its text. If they're missing (for example when running the app locally), import the CSV files or a saved Core Rules web page by hand.</div>
          <button className="btn" onClick={updateStrats}>
            Update from Wahapedia
          </button>
          <div className="muted small">{importedCount ?? 0} imported rules</div>
          <input ref={wpInput} type="file" accept=".csv,text/csv,text/plain,.html,.htm,text/html" multiple hidden onChange={(e) => importWp(e.target.files)} />
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

      <div className="section-label" style={{ marginTop: 14 }}>Live games</div>
      <div className="card">
        <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, padding: 14 }}>
          <div className="small">
            Phones in a live game talk to each other directly. A free public PeerJS server only introduces them. If it's ever down, you can run your own and enter it here (every player needs the same setting).
          </div>
          <label className="field" style={{ margin: 0 }}>
            <span>Own PeerJS server (optional)</span>
            <input className="input" value={peerHost} placeholder="Public server" onChange={(e) => setPeerHost(e.target.value)} onBlur={() => setPeerServer(peerHost)} inputMode="url" />
          </label>
        </div>
      </div>

      </Collapse>

      <RestoreSheet
        pending={pendingRestore}
        onClose={() => setPendingRestore(null)}
        onDone={(text) => {
          setPendingRestore(null);
          setBackupStatus(text);
        }}
      />

      <div className="section-label">About</div>
      <p className="small muted">
        EmperorsList is an unofficial fan project, not affiliated with or endorsed by Games Workshop. Warhammer 40,000 and related names are trademarks of Games Workshop Limited. No rules text
        ships with the app; game data is downloaded to this device from the BSData community repository, and optional extras from Wahapedia.
      </p>
    </Screen>
  );
}

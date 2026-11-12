import { useRef, useState, type ChangeEvent } from "react";
import { createBackup, downloadBackup, parseBackup, restoreBackup, useCore, useItems, type Backup } from "../core";

/** Settings → Your data: backup to a file, restore from one. */
export function DataSettings() {
  const { store } = useCore();
  const count = useItems().length;
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ backup: Backup; skipped: number; fileName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const exportNow = () => downloadBackup(createBackup(store));

  const pickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (!file) return;
    setError(null);
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) {
      setPending(null);
      setError(parsed.error);
      return;
    }
    setPending({ backup: parsed.backup, skipped: parsed.skipped, fileName: file.name });
  };

  const confirmRestore = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      // Safety net: keep a copy of what's here now before replacing it.
      if (count > 0) downloadBackup(createBackup(store));
      await restoreBackup(store, pending.backup);
      // Start fresh so every module picks up the restored data.
      window.location.reload();
    } catch (err) {
      setBusy(false);
      setError(`Restore failed: ${err instanceof Error ? err.message : String(err)}. Your data was not changed.`);
    }
  };

  const exportedOn = pending?.backup.exportedAt
    ? new Date(pending.backup.exportedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "an unknown date";

  return (
    <div className="card data-settings">
      <p className="muted">
        {count.toLocaleString()} item{count === 1 ? "" : "s"} saved in your account. A backup file is an extra copy you control; restoring one
        replaces your account's data.
      </p>

      <div className="data-actions">
        <button className="btn-primary" onClick={exportNow}>
          Export backup
        </button>
        <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
          Restore from backup…
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={pickFile} aria-label="Backup file" />
      </div>

      {error && (
        <p className="hint hint-error" role="alert">
          {error}
        </p>
      )}

      {pending && (
        <div className="restore-confirm" role="alertdialog" aria-labelledby="restore-title">
          <p id="restore-title">
            <strong>Replace all your data with this backup?</strong>
          </p>
          <p className="muted">
            {pending.fileName}: {pending.backup.items.length.toLocaleString()} items, saved {exportedOn}.
            {pending.skipped > 0 && ` ${pending.skipped} unreadable ${pending.skipped === 1 ? "entry" : "entries"} will be skipped.`}{" "}
            {count > 0 && `Your current ${count.toLocaleString()} items will be downloaded as a backup first, then replaced.`}
          </p>
          <div className="form-actions">
            <span className="spacer" />
            <button className="btn-ghost" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn-danger-solid" onClick={confirmRestore} disabled={busy}>
              {busy ? "Restoring…" : "Replace my data"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

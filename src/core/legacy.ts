/**
 * Cronos used to keep data on the device (IndexedDB) and sync it. Data now lives only in the
 * signed-in account in Supabase, so remove what earlier versions left behind. Keeps the
 * Pokédex cache ("cronos-dex"): that's public PokéAPI data, not yours.
 */
const OLD_DATABASES = ["cronos", "cronos-sync"];
const OLD_PREFIXES = ["cronos-account-", "cronos-sync-account-"];
// Includes a Supabase project once entered on the device: the app now only uses the one it was built with.
const OLD_KEYS = ["cronos.cloud.freshStart", "cronos.syncNudge.dismissed", "cronos.cloud.config"];

export async function clearOldLocalData(): Promise<void> {
  try {
    OLD_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage unavailable: nothing to clear */
  }
  if (typeof indexedDB === "undefined") return;
  let names = [...OLD_DATABASES];
  try {
    const all = (await indexedDB.databases?.()) ?? [];
    names = [...new Set([...names, ...all.map((d) => d.name ?? "").filter((n) => OLD_PREFIXES.some((p) => n.startsWith(p)))])];
  } catch {
    /* can't list databases (older browsers): remove the known ones */
  }
  await Promise.all(
    names.map(
      (name) =>
        new Promise<void>((resolve) => {
          try {
            const req = indexedDB.deleteDatabase(name);
            req.onsuccess = req.onerror = req.onblocked = () => resolve();
          } catch {
            resolve();
          }
        }),
    ),
  );
}

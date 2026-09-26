import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * Saved localities, persisted on-device with AsyncStorage. A small context so any
 * screen can read the set and toggle membership, and the Saved tab and the
 * bookmark button stay in sync without prop-drilling.
 */
const STORAGE_KEY = "nt_saved";

type Ctx = {
  saved: string[];
  isSaved: (slug: string) => boolean;
  toggle: (slug: string) => void;
  ready: boolean;
};

const SavedContext = createContext<Ctx | null>(null);

export function SavedProvider({ children }: { children: React.ReactNode }) {
  const [saved, setSaved] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) setSaved(parsed.filter((s) => typeof s === "string"));
          } catch {
            // Corrupt value — start clean rather than crash.
          }
        }
      })
      .finally(() => setReady(true));
  }, []);

  const persist = useCallback((next: string[]) => {
    setSaved(next);
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const toggle = useCallback(
    (slug: string) => {
      persist(saved.includes(slug) ? saved.filter((s) => s !== slug) : [slug, ...saved]);
    },
    [saved, persist],
  );

  const value = useMemo<Ctx>(
    () => ({ saved, isSaved: (slug) => saved.includes(slug), toggle, ready }),
    [saved, toggle, ready],
  );

  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>;
}

export function useSaved(): Ctx {
  const ctx = useContext(SavedContext);
  if (!ctx) throw new Error("useSaved must be used within SavedProvider");
  return ctx;
}

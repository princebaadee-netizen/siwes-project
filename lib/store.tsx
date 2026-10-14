"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { AppState, emptyState } from "./types";

const STORAGE_KEY = "siwes-app-state-v1";

interface StoreValue {
  state: AppState;
  setState: (updater: (prev: AppState) => AppState) => void;
  hydrated: boolean;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setStateRaw] = useState<AppState>(emptyState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setStateRaw(JSON.parse(raw));
    } catch {
      // ignore corrupted storage, fall back to empty state
    }
    setHydrated(true);
  }, []);

  // `setState` and the context value must keep a stable identity, otherwise
  // every consumer's `load` callback (which depends on setState) is recreated
  // on each render and its effect re-runs forever.
  const setState = useCallback((updater: (prev: AppState) => AppState) => {
    setStateRaw((prev) => {
      const next = updater(prev);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // storage may be unavailable (private browsing etc.) — state still works in-memory
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ state, setState, hydrated }),
    [state, setState, hydrated]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useAppStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useAppStore must be used within StoreProvider");
  return ctx;
}

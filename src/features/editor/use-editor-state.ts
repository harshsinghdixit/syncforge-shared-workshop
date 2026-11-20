import { useEffect, useReducer, useState } from "react";

import {
  editorCacheKey,
  editorReducer,
  initialEditorState,
  snapshotFromUnknown,
} from "./editor-model";

export function useEditorState() {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(editorCacheKey);
      if (stored) {
        const snapshot = snapshotFromUnknown(JSON.parse(stored) as unknown);
        if (snapshot) dispatch({ type: "restore", snapshot });
      }
    } catch {
      // The editor remains usable if storage is unavailable or contains invalid data.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        editorCacheKey,
        JSON.stringify({ files: state.files, activeFileId: state.activeFileId }),
      );
    } catch {
      // A full or blocked cache should not prevent editing.
    }
  }, [hydrated, state.activeFileId, state.files]);

  const clearLocalCache = () => {
    try {
      window.localStorage.removeItem(editorCacheKey);
    } catch {
      // Reset the in-memory workspace even when storage cannot be cleared.
    }
    dispatch({ type: "clear" });
  };

  return {
    state,
    dispatch,
    hydrated,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    clearLocalCache,
  };
}
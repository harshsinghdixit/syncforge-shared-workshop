import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";

export interface RemoteUser {
  id: string;
  name: string;
  color: string;
  colorLight: string;
}

export interface JoinRequest {
  id: string;
  name: string;
  timestamp: number;
}

export interface ApprovedUser {
  id: string;
  name: string;
  approvedAt: number;
}

const USER_COLORS = [
  { color: "#38bdf8", colorLight: "#38bdf833" },
  { color: "#4ade80", colorLight: "#4ade8033" },
  { color: "#f472b6", colorLight: "#f472b633" },
  { color: "#fbbf24", colorLight: "#fbbf2433" },
  { color: "#a78bfa", colorLight: "#a78bfa33" },
  { color: "#fb923c", colorLight: "#fb923c33" },
  { color: "#2dd4bf", colorLight: "#2dd4bf33" },
];

const ADJECTIVES = ["Swift", "Cosmic", "Neon", "Silent", "Quantum", "Hyper", "Solar", "Vivid"];
const NOUNS = ["Coder", "Forge", "Hacker", "Pioneer", "Voyager", "Architect", "Dev", "Spark"];

export function getOrCreateLocalUser(): RemoteUser {
  const storedId = window.sessionStorage.getItem("syncforge_user_id");
  const storedName = window.sessionStorage.getItem("syncforge_user_name");
  const storedColor = window.sessionStorage.getItem("syncforge_user_color");
  const storedColorLight = window.sessionStorage.getItem("syncforge_user_color_light");

  if (storedId && storedName && storedColor && storedColorLight) {
    return {
      id: storedId,
      name: storedName,
      color: storedColor,
      colorLight: storedColorLight,
    };
  }

  const id = `user-${Math.random().toString(36).substring(2, 9)}`;
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const name = `${adj} ${noun}`;
  const colorObj = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];

  window.sessionStorage.setItem("syncforge_user_id", id);
  window.sessionStorage.setItem("syncforge_user_name", name);
  window.sessionStorage.setItem("syncforge_user_color", colorObj.color);
  window.sessionStorage.setItem("syncforge_user_color_light", colorObj.colorLight);

  return {
    id,
    name,
    color: colorObj.color,
    colorLight: colorObj.colorLight,
  };
}

export const STARTER_FILES: Record<string, string> = {
  "main.js": `import { greet } from "./utils.js";\n\nconst room = "syncforge";\n\nfunction startSession() {\n  const message = greet("world");\n  console.log(\`\${message} — connected to \${room}\`);\n}\n\nstartSession();\n`,
  "utils.py": `from datetime import datetime\n\ndef greet(name: str) -> str:\n    """Return a friendly message with the current time."""\n    current_time = datetime.now().strftime("%H:%M")\n    return f"Hello, {name}! It is {current_time}."\n\n\nif __name__ == "__main__":\n    print(greet("world"))\n`,
  "README.md": `# SyncForge\n\nA little room for great ideas.\n\n## Getting started\n\n1. Open a file from the explorer.\n2. Make a change and invite your team.\n3. Build something together.\n\n> Good code is a team sport.\n`,
};

export function useYjsCollaboration(roomId: string) {
  const [localUser, setLocalUser] = useState<RemoteUser>(getOrCreateLocalUser);
  const [activeUsers, setActiveUsers] = useState<RemoteUser[]>([]);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [filesVersion, setFilesVersion] = useState(0);
  const [activeFileName, setActiveFileName] = useState<string>("main.js");
  const [isOffline, setIsOffline] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [hostId, setHostId] = useState<string | null>(null);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<Record<string, ApprovedUser>>({});
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // References to keep persistent Yjs instances
  const ydocRef = useRef<Y.Doc | null>(null);
  const wsProviderRef = useRef<WebsocketProvider | null>(null);
  const persistenceRef = useRef<IndexeddbPersistence | null>(null);
  const undoManagersRef = useRef<WeakMap<Y.Text, Y.UndoManager>>(new WeakMap());

  // Initialize or re-initialize Yjs instance on roomId change
  useEffect(() => {
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const wsUrl = import.meta.env.VITE_WS_URL || "ws://localhost:1234";
    const wsProvider = new WebsocketProvider(wsUrl, roomId, ydoc, { connect: true });
    wsProviderRef.current = wsProvider;

    const persistence = new IndexeddbPersistence(roomId, ydoc);
    persistenceRef.current = persistence;

    const currentUser = getOrCreateLocalUser();
    setLocalUser(currentUser);

    // Set local awareness state
    wsProvider.awareness.setLocalStateField("user", {
      id: currentUser.id,
      name: currentUser.name,
      color: currentUser.color,
      colorLight: currentUser.colorLight,
    });

    const filesMap = ydoc.getMap<Y.Text>("files");
    const roomMeta = ydoc.getMap<string>("roomMeta");
    const joinRequestsMap = ydoc.getMap<JoinRequest>("joinRequests");
    const approvedUsersMap = ydoc.getMap<ApprovedUser>("approvedUsers");

    const updateFilesList = () => {
      const keys = Array.from(filesMap.keys());
      setFileNames(keys);
      setFilesVersion((v) => v + 1);
      setActiveFileName((current) => {
        if (keys.length === 0) return "";
        if (keys.includes(current)) return current;
        return keys[0] ?? "";
      });
    };

    const updateActiveUsers = () => {
      const states = wsProvider.awareness.getStates();
      const users: RemoteUser[] = [];
      states.forEach((state) => {
        if (state.user && state.user.id && state.user.name) {
          users.push({
            id: state.user.id,
            name: state.user.name,
            color: state.user.color || "#38bdf8",
            colorLight: state.user.colorLight || "#38bdf833",
          });
        }
      });
      const unique = Array.from(new Map(users.map((u) => [u.id, u])).values());
      setActiveUsers(unique);
    };

    const updateRoomMeta = () => {
      const host = roomMeta.get("hostId") ?? null;
      setHostId(host);
    };

    const updateJoinRequests = () => {
      const requests: JoinRequest[] = [];
      joinRequestsMap.forEach((val) => {
        if (val && val.id) requests.push(val);
      });
      setJoinRequests(requests);
    };

    const updateApprovedUsers = () => {
      const map: Record<string, ApprovedUser> = {};
      approvedUsersMap.forEach((val, key) => {
        if (val) map[key] = val;
      });
      setApprovedUsers(map);
    };

    // Observers
    filesMap.observe(updateFilesList);
    roomMeta.observe(updateRoomMeta);
    joinRequestsMap.observe(updateJoinRequests);
    approvedUsersMap.observe(updateApprovedUsers);
    wsProvider.awareness.on("change", updateActiveUsers);

    // Seed files ONLY after remote sync completes (or offline fallback)
    const checkAndSeed = () => {
      if (filesMap.size === 0) {
        ydoc.transact(() => {
          for (const [name, content] of Object.entries(STARTER_FILES)) {
            if (!filesMap.has(name)) {
              filesMap.set(name, new Y.Text(content));
            }
          }
        });
        updateFilesList();
      }

      if (!roomMeta.get("hostId")) {
        ydoc.transact(() => {
          roomMeta.set("hostId", currentUser.id);
          roomMeta.set("hostName", currentUser.name);
          approvedUsersMap.set(currentUser.id, {
            id: currentUser.id,
            name: currentUser.name,
            approvedAt: Date.now(),
          });
        });
      }
    };

    let wsHasSynced = false;

    // Load cached IndexedDB state without prematurely seeding
    persistence.whenSynced.then(() => {
      updateFilesList();
      updateRoomMeta();
      updateJoinRequests();
      updateApprovedUsers();
    });

    // Wait for WebSocket server sync before deciding whether to seed
    const onWsSync = (synced: boolean) => {
      if (synced) {
        wsHasSynced = true;
        setIsSynced(true);
        checkAndSeed();
        updateFilesList();
        updateRoomMeta();
        updateJoinRequests();
        updateApprovedUsers();
      }
    };
    wsProvider.on("sync", onWsSync);

    // Offline fallback: if WS cannot connect within 3s, seed locally if empty
    const offlineFallbackTimer = window.setTimeout(() => {
      if (!wsHasSynced) {
        setIsSynced(true);
        checkAndSeed();
      }
    }, 3000);

    const onStatus = ({ status }: { status: string }) => {
      setIsOffline(status === "disconnected");
    };
    wsProvider.on("status", onStatus);

    return () => {
      window.clearTimeout(offlineFallbackTimer);
      wsProvider.off("sync", onWsSync);
      wsProvider.off("status", onStatus);
      wsProvider.awareness.off("change", updateActiveUsers);
      filesMap.unobserve(updateFilesList);
      roomMeta.unobserve(updateRoomMeta);
      joinRequestsMap.unobserve(updateJoinRequests);
      approvedUsersMap.unobserve(updateApprovedUsers);

      wsProvider.destroy();
      persistence.destroy();
      ydoc.destroy();
    };
  }, [roomId]);

  // Always read the live Y.Text from filesMap (never mutate inside useMemo)
  const activeYText = useMemo(() => {
    if (!ydocRef.current || !activeFileName) return null;
    const filesMap = ydocRef.current.getMap<Y.Text>("files");
    return filesMap.get(activeFileName) ?? null;
  }, [activeFileName, filesVersion]);

  // Get or create UndoManager keyed by the exact Y.Text instance
  const activeUndoManager = useMemo(() => {
    if (!activeYText) return null;
    let um = undoManagersRef.current.get(activeYText);
    if (!um) {
      um = new Y.UndoManager(activeYText, {
        trackedOrigins: new Set([null]),
      });
      undoManagersRef.current.set(activeYText, um);
    }
    return um;
  }, [activeYText]);

  // Track canUndo / canRedo for active UndoManager
  useEffect(() => {
    if (!activeUndoManager) {
      setCanUndo(false);
      setCanRedo(false);
      return;
    }

    const updateUndoState = () => {
      setCanUndo(activeUndoManager.canUndo());
      setCanRedo(activeUndoManager.canRedo());
    };

    updateUndoState();
    activeUndoManager.on("stack-item-added", updateUndoState);
    activeUndoManager.on("stack-item-popped", updateUndoState);

    return () => {
      activeUndoManager.off("stack-item-added", updateUndoState);
      activeUndoManager.off("stack-item-popped", updateUndoState);
    };
  }, [activeUndoManager]);

  // Operations
  const createFile = useCallback((name: string, content = "") => {
    const trimmed = name.trim();
    if (!trimmed || !ydocRef.current) return false;
    const filesMap = ydocRef.current.getMap<Y.Text>("files");
    if (filesMap.has(trimmed)) return false;

    ydocRef.current.transact(() => {
      filesMap.set(trimmed, new Y.Text(content));
    });
    setActiveFileName(trimmed);
    return true;
  }, []);

  const renameFile = useCallback((oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName || !ydocRef.current) return false;
    const filesMap = ydocRef.current.getMap<Y.Text>("files");
    if (filesMap.has(trimmed)) return false;

    const oldText = filesMap.get(oldName);
    const content = oldText ? oldText.toString() : "";

    ydocRef.current.transact(() => {
      filesMap.delete(oldName);
      filesMap.set(trimmed, new Y.Text(content));
    });

    setActiveFileName((current) => (current === oldName ? trimmed : current));
    return true;
  }, []);

  const deleteFile = useCallback((name: string) => {
    if (!ydocRef.current) return;
    const filesMap = ydocRef.current.getMap<Y.Text>("files");
    ydocRef.current.transact(() => {
      filesMap.delete(name);
    });

    setActiveFileName((current) => {
      if (current === name) {
        const remaining = Array.from(filesMap.keys()).filter((k) => k !== name);
        return remaining[0] ?? "";
      }
      return current;
    });
  }, []);

  const importFiles = useCallback(
    (files: { name: string; content: string }[]) => {
      if (!ydocRef.current || files.length === 0) return 0;
      const filesMap = ydocRef.current.getMap<Y.Text>("files");
      let count = 0;
      ydocRef.current.transact(() => {
        for (const file of files) {
          if (!filesMap.has(file.name)) {
            filesMap.set(file.name, new Y.Text(file.content));
            count++;
          }
        }
      });
      if (files[0] && !filesMap.has(activeFileName)) {
        setActiveFileName(files[0].name);
      }
      return count;
    },
    [activeFileName]
  );

  const toggleOffline = useCallback(() => {
    const ws = wsProviderRef.current;
    if (!ws) return;
    if (ws.wsconnected) {
      ws.disconnect();
      setIsOffline(true);
    } else {
      ws.connect();
      setIsOffline(false);
    }
  }, []);

  const clearLocalCache = useCallback(async () => {
    if (persistenceRef.current) {
      await persistenceRef.current.clearData();
    }
  }, []);

  const undo = useCallback(() => {
    if (activeUndoManager && activeUndoManager.canUndo()) {
      activeUndoManager.undo();
    }
  }, [activeUndoManager]);

  const redo = useCallback(() => {
    if (activeUndoManager && activeUndoManager.canRedo()) {
      activeUndoManager.redo();
    }
  }, [activeUndoManager]);

  // Host Approval Waiting Room Actions
  const isHost = Boolean(hostId && hostId === localUser.id);
  const isApproved = Boolean(isHost || approvedUsers[localUser.id]);
  const hasRequestedJoin = Boolean(joinRequests.some((r) => r.id === localUser.id));

  const requestJoin = useCallback(
    (customName?: string) => {
      if (!ydocRef.current) return;
      const name = customName?.trim() || localUser.name;
      const updatedUser = { ...localUser, name };
      setLocalUser(updatedUser);
      window.sessionStorage.setItem("syncforge_user_name", name);

      if (wsProviderRef.current) {
        wsProviderRef.current.awareness.setLocalStateField("user", updatedUser);
      }

      const joinRequestsMap = ydocRef.current.getMap<JoinRequest>("joinRequests");
      joinRequestsMap.set(localUser.id, {
        id: localUser.id,
        name,
        timestamp: Date.now(),
      });
    },
    [localUser]
  );

  const acceptJoinRequest = useCallback((userId: string) => {
    if (!ydocRef.current) return;
    const joinRequestsMap = ydocRef.current.getMap<JoinRequest>("joinRequests");
    const approvedUsersMap = ydocRef.current.getMap<ApprovedUser>("approvedUsers");

    const req = joinRequestsMap.get(userId);
    if (!req) return;

    ydocRef.current.transact(() => {
      approvedUsersMap.set(userId, {
        id: userId,
        name: req.name,
        approvedAt: Date.now(),
      });
      joinRequestsMap.delete(userId);
    });
  }, []);

  const declineJoinRequest = useCallback((userId: string) => {
    if (!ydocRef.current) return;
    const joinRequestsMap = ydocRef.current.getMap<JoinRequest>("joinRequests");
    joinRequestsMap.delete(userId);
  }, []);

  return {
    localUser,
    activeUsers,
    fileNames,
    activeFileName,
    setActiveFileName,
    activeYText,
    activeUndoManager,
    canUndo,
    canRedo,
    undo,
    redo,
    isOffline,
    isSynced,
    toggleOffline,
    clearLocalCache,
    createFile,
    renameFile,
    deleteFile,
    importFiles,
    ydoc: ydocRef.current,
    wsProvider: wsProviderRef.current,
    // Waiting room
    isHost,
    isApproved,
    hasRequestedJoin,
    joinRequests,
    requestJoin,
    acceptJoinRequest,
    declineJoinRequest,
  };
}
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";
import { toast } from "sonner";

export interface MousePosition {
  x: number; // percentage 0 - 100
  y: number; // percentage 0 - 100
}

export interface RemoteUser {
  id: string;
  name: string;
  color: string;
  colorLight: string;
  mouse?: MousePosition | null;
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

export interface UserColor {
  name: string;
  color: string;
  colorLight: string;
}

export const AMONG_US_COLORS: UserColor[] = [
  { name: "Red", color: "#ef4444", colorLight: "#ef444433" },
  { name: "Cyan", color: "#06b6d4", colorLight: "#06b6d433" },
  { name: "Lime", color: "#84cc16", colorLight: "#84cc1633" },
  { name: "Yellow", color: "#eab308", colorLight: "#eab30833" },
  { name: "Orange", color: "#f97316", colorLight: "#f9731633" },
  { name: "Pink", color: "#ec4899", colorLight: "#ec489933" },
  { name: "Purple", color: "#a855f7", colorLight: "#a855f733" },
  { name: "Blue", color: "#3b82f6", colorLight: "#3b82f633" },
  { name: "Teal", color: "#14b8a6", colorLight: "#14b8a633" },
  { name: "Coral", color: "#f43f5e", colorLight: "#f43f5e33" },
];

export const USER_COLORS: UserColor[] = AMONG_US_COLORS;

const ADJECTIVES = ["Swift", "Cosmic", "Neon", "Silent", "Quantum", "Hyper", "Solar", "Vivid"];
const NOUNS = ["Coder", "Forge", "Hacker", "Pioneer", "Voyager", "Architect", "Dev", "Spark"];

export function persistLocalUser(user: RemoteUser) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("syncforge_user_id", user.id);
  window.localStorage.setItem("syncforge_user_name", user.name);
  window.localStorage.setItem("syncforge_user_color", user.color);
  window.localStorage.setItem("syncforge_user_color_light", user.colorLight);
}

export function getOrCreateLocalUser(): RemoteUser {
  if (typeof window === "undefined") {
    return {
      id: "user-server",
      name: "Swift Dev",
      color: USER_COLORS[0].color,
      colorLight: USER_COLORS[0].colorLight,
    };
  }

  const storedId =
    window.localStorage.getItem("syncforge_user_id") ??
    window.sessionStorage.getItem("syncforge_user_id");
  const storedName =
    window.localStorage.getItem("syncforge_user_name") ??
    window.sessionStorage.getItem("syncforge_user_name");
  const storedColor =
    window.localStorage.getItem("syncforge_user_color") ??
    window.sessionStorage.getItem("syncforge_user_color");
  const storedColorLight =
    window.localStorage.getItem("syncforge_user_color_light") ??
    window.sessionStorage.getItem("syncforge_user_color_light");

  if (storedId && storedName && storedColor && storedColorLight) {
    const user = {
      id: storedId,
      name: storedName,
      color: storedColor,
      colorLight: storedColorLight,
    };
    persistLocalUser(user);
    return user;
  }

  const id = `user-${Math.random().toString(36).substring(2, 9)}`;
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const name = `${adj} ${noun}`;
  const colorObj = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];

  const user = {
    id,
    name,
    color: colorObj.color,
    colorLight: colorObj.colorLight,
  };
  persistLocalUser(user);

  return user;
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

  const isCreatorInitial = typeof window !== "undefined" && (
    sessionStorage.getItem(`syncforge_creator_${roomId}`) === "true" ||
    sessionStorage.getItem(`syncforge_host_room_${roomId}`) === getOrCreateLocalUser().id
  );

  const [hostId, setHostId] = useState<string | null>(() => isCreatorInitial ? getOrCreateLocalUser().id : null);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<Record<string, ApprovedUser>>(() => {
    if (isCreatorInitial) {
      const u = getOrCreateLocalUser();
      return { [u.id]: { id: u.id, name: u.name, approvedAt: Date.now() } };
    }
    return {};
  });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const prevUsersRef = useRef<Map<string, string>>(new Map());

  // References to keep persistent Yjs instances
  const ydocRef = useRef<Y.Doc | null>(null);
  const wsProviderRef = useRef<WebsocketProvider | null>(null);
  const persistenceRef = useRef<IndexeddbPersistence | null>(null);
  const undoManagersRef = useRef<WeakMap<Y.Text, Y.UndoManager>>(new WeakMap());
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [wsProvider, setWsProvider] = useState<WebsocketProvider | null>(null);

  // Initialize or re-initialize Yjs instance on roomId change
  useEffect(() => {
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    setYdoc(ydoc);

    const wsUrl = import.meta.env.VITE_WS_URL || "ws://localhost:1234";
    const wsProvider = new WebsocketProvider(wsUrl, roomId, ydoc, { connect: true });
    wsProviderRef.current = wsProvider;
    setWsProvider(wsProvider);

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

    const isCreatorSession = typeof window !== "undefined" && (
      sessionStorage.getItem(`syncforge_creator_${roomId}`) === "true" ||
      sessionStorage.getItem(`syncforge_host_room_${roomId}`) === currentUser.id
    );

    // If client is creator, immediately ensure host status and approval in the maps
    if (isCreatorSession) {
      ydoc.transact(() => {
        if (!roomMeta.get("hostId")) {
          roomMeta.set("hostId", currentUser.id);
          roomMeta.set("hostName", currentUser.name);
        }
        approvedUsersMap.set(currentUser.id, {
          id: currentUser.id,
          name: currentUser.name,
          approvedAt: Date.now(),
        });
      });
      setHostId(currentUser.id);
      setApprovedUsers((prev) => ({
        ...prev,
        [currentUser.id]: {
          id: currentUser.id,
          name: currentUser.name,
          approvedAt: Date.now(),
        },
      }));
    }

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
            mouse: state.mouse !== undefined ? state.mouse : (state.user.mouse || null),
          });
        }
      });
      const unique = Array.from(new Map(users.map((u) => [u.id, u])).values());
      setActiveUsers(unique);

      // Subtle join/leave notifications
      const prevMap = prevUsersRef.current;
      const currentMap = new Map<string, string>();
      unique.forEach((u) => currentMap.set(u.id, u.name));

      if (prevMap.size > 0) {
        unique.forEach((u) => {
          if (u.id !== currentUser.id && !prevMap.has(u.id)) {
            toast.info(`${u.name} joined the room`, {
              duration: 3000,
            });
          }
        });
        prevMap.forEach((name, id) => {
          if (id !== currentUser.id && !currentMap.has(id)) {
            toast(`${name} left the room`, {
              duration: 2500,
            });
          }
        });
      }
      prevUsersRef.current = currentMap;
    };

    const updateRoomMeta = () => {
      const host = roomMeta.get("hostId") ?? (isCreatorSession ? currentUser.id : null);
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
      if (isCreatorSession && !map[currentUser.id]) {
        map[currentUser.id] = {
          id: currentUser.id,
          name: currentUser.name,
          approvedAt: Date.now(),
        };
      }
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

      if (isCreatorSession || !roomMeta.get("hostId")) {
        ydoc.transact(() => {
          if (!roomMeta.get("hostId")) {
            roomMeta.set("hostId", currentUser.id);
            roomMeta.set("hostName", currentUser.name);
          }
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

    // Offline fallback: seed locally only if the socket never connected
    const offlineFallbackTimer = window.setTimeout(() => {
      if (!wsHasSynced && !wsProvider.wsconnected) {
        setIsSynced(true);
        checkAndSeed();
      }
    }, 4000);

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

      setWsProvider((current) => (current === wsProvider ? null : current));
      setYdoc((current) => (current === ydoc ? null : current));
      wsProvider.destroy();
      persistence.destroy();
      ydoc.destroy();
    };
  }, [roomId]);

  // Always read the live Y.Text from filesMap (never mutate inside useMemo)
  const activeYText = useMemo(() => {
    if (!ydoc || !activeFileName) return null;
    const filesMap = ydoc.getMap<Y.Text>("files");
    return filesMap.get(activeFileName) ?? null;
  }, [ydoc, activeFileName, filesVersion]);

  // Get or create UndoManager keyed by the exact Y.Text instance
  const activeUndoManager = useMemo(() => {
    if (!activeYText) return null;
    let um = undoManagersRef.current.get(activeYText);
    if (!um) {
      um = new Y.UndoManager(activeYText);
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
  const isCreator = typeof window !== "undefined" && (
    sessionStorage.getItem(`syncforge_creator_${roomId}`) === "true" ||
    sessionStorage.getItem(`syncforge_host_room_${roomId}`) === localUser.id
  );
  const isHost = Boolean((hostId && hostId === localUser.id) || isCreator);
  const isApproved = Boolean(isHost || approvedUsers[localUser.id]);
  const hasRequestedJoin = Boolean(joinRequests.some((r) => r.id === localUser.id));

  const requestJoin = useCallback(
    (customName?: string) => {
      if (!ydocRef.current) return;
      const name = customName?.trim() || localUser.name;
      const updatedUser = { ...localUser, name };
      setLocalUser(updatedUser);
      persistLocalUser(updatedUser);

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

  const updateUserProfile = useCallback(
    (updates: { name?: string; color?: string; colorLight?: string }) => {
      setLocalUser((prev) => {
        const next: RemoteUser = {
          ...prev,
          name: updates.name !== undefined ? (updates.name.trim() || prev.name) : prev.name,
          color: updates.color !== undefined ? updates.color : prev.color,
          colorLight: updates.colorLight !== undefined ? updates.colorLight : (updates.color ? `${updates.color}33` : prev.colorLight),
        };
        persistLocalUser(next);
        if (wsProviderRef.current) {
          wsProviderRef.current.awareness.setLocalStateField("user", next);
        }
        return next;
      });
    },
    []
  );

  const lastMouseEmitRef = useRef<number>(0);
  const updateMousePosition = useCallback(
    (pos: MousePosition | null) => {
      if (!wsProviderRef.current) return;
      const now = Date.now();
      if (pos === null) {
        lastMouseEmitRef.current = now;
        wsProviderRef.current.awareness.setLocalStateField("mouse", null);
        return;
      }
      if (now - lastMouseEmitRef.current >= 40) {
        lastMouseEmitRef.current = now;
        wsProviderRef.current.awareness.setLocalStateField("mouse", pos);
      }
    },
    []
  );

  const declineJoinRequest = useCallback((userId: string) => {
    if (!ydocRef.current) return;
    const joinRequestsMap = ydocRef.current.getMap<JoinRequest>("joinRequests");
    joinRequestsMap.delete(userId);
  }, []);

  return {
    localUser,
    activeUsers,
    updateUserProfile,
    updateMousePosition,
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
    ydoc,
    wsProvider,
    // Waiting room
    isHost,
    hostId,
    isApproved,
    hasRequestedJoin,
    joinRequests,
    requestJoin,
    acceptJoinRequest,
    declineJoinRequest,
  };
}
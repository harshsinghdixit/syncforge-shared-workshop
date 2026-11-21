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

export interface EmojiReaction {
  id: string;
  emoji: string;
  senderName: string;
  senderColor: string;
  xPercent: number;
  timestamp: number;
}

export interface RoomRoles {
  hostId: string | null;
  subLeaderIds: string[];
  mutedIds: string[];
  camBlockedIds: string[];
  kickedIds: string[];
}

export interface ModerationReport {
  id: string;
  reporterId: string;
  reporterName: string;
  targetId: string;
  targetName: string;
  reason: string;
  note?: string | undefined;
  timestamp: number;
  status: "pending" | "resolved";
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
  const defaultColor = USER_COLORS[0] ?? { color: "#ef4444", colorLight: "#ef444433" };

  if (typeof window === "undefined") {
    return {
      id: "user-server",
      name: "Swift Dev",
      color: defaultColor.color,
      colorLight: defaultColor.colorLight,
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
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)] ?? "Swift";
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)] ?? "Dev";
  const name = `${adj} ${noun}`;
  const colorObj = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)] ?? defaultColor;

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
  "README.md": `# Same Code\n\nA little room for great ideas.\n\n## Getting started\n\n1. Open a file from the explorer.\n2. Make a change and invite your team.\n3. Build something together.\n\n> Good code is a team sport.\n`,
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
  const [subLeaderIds, setSubLeaderIds] = useState<string[]>([]);
  const [mutedIds, setMutedIds] = useState<string[]>([]);
  const [camBlockedIds, setCamBlockedIds] = useState<string[]>([]);
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [kickedIds, setKickedIds] = useState<string[]>([]);
  const [wasKicked, setWasKicked] = useState(false);
  const [reactions, setReactions] = useState<EmojiReaction[]>([]);
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

    const envWsUrl = (import.meta.env as Record<string, string | undefined>)["VITE_WS_URL"];
    const wsUrl = envWsUrl || "ws://localhost:1234";
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
    const roomRolesMap = ydoc.getMap<any>("room-roles");
    const moderationReportsArray = ydoc.getArray<ModerationReport>("moderation-reports");

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
        if (!roomRolesMap.get("hostId")) {
          roomRolesMap.set("hostId", currentUser.id);
          roomRolesMap.set("subLeaderIds", []);
          roomRolesMap.set("mutedIds", []);
          roomRolesMap.set("kickedIds", []);
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
      const incomingReactions: EmojiReaction[] = [];

      states.forEach((state: Record<string, any>) => {
        const u = state["user"];
        if (u && u["id"] && u["name"]) {
          users.push({
            id: u["id"],
            name: u["name"],
            color: u["color"] || "#38bdf8",
            colorLight: u["colorLight"] || "#38bdf833",
            mouse: state["mouse"] !== undefined ? state["mouse"] : (u["mouse"] || null),
          });
        }
        const r = state["reaction"];
        if (r && r["id"] && r["emoji"] && r["timestamp"] && Date.now() - r["timestamp"] < 3500) {
          incomingReactions.push({
            id: r["id"],
            emoji: r["emoji"],
            senderName: r["senderName"] || (u ? u["name"] : "Anonymous"),
            senderColor: r["senderColor"] || (u ? u["color"] : "#38bdf8"),
            xPercent: r["xPercent"] || 50,
            timestamp: r["timestamp"],
          });
        }
      });

      if (incomingReactions.length > 0) {
        setReactions((prev) => {
          const map = new Map<string, EmojiReaction>();
          prev.forEach((item) => {
            if (Date.now() - item.timestamp < 3500) map.set(item.id, item);
          });
          incomingReactions.forEach((item) => map.set(item.id, item));
          return Array.from(map.values());
        });
      }

      const unique = Array.from(new Map(users.map((u) => [u.id, u])).values());
      setActiveUsers(unique);

      // Auto-assign host if no host currently exists or previous host left
      const currentHost = roomRolesMap.get("hostId") || roomMeta.get("hostId");
      if (!currentHost || !unique.some((u) => u.id === currentHost)) {
        if (unique.length > 0) {
          const firstUser = unique[0];
          if (firstUser && firstUser.id === currentUser.id) {
            ydoc.transact(() => {
              roomRolesMap.set("hostId", currentUser.id);
              roomMeta.set("hostId", currentUser.id);
              roomMeta.set("hostName", currentUser.name);
            });
            setHostId(currentUser.id);
          }
        }
      }

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
      const host = (roomRolesMap.get("hostId") as string) || (roomMeta.get("hostId") as string) || (isCreatorSession ? currentUser.id : null);
      setHostId(host);
    };

    const updateRoomRoles = () => {
      const host = (roomRolesMap.get("hostId") as string) || (roomMeta.get("hostId") as string) || null;
      const subLeaders = (roomRolesMap.get("subLeaderIds") as string[]) || [];
      const muted = (roomRolesMap.get("mutedIds") as string[]) || [];
      const camBlocked = (roomRolesMap.get("camBlockedIds") as string[]) || [];
      const kicked = (roomRolesMap.get("kickedIds") as string[]) || [];

      setHostId(host);
      setSubLeaderIds(Array.isArray(subLeaders) ? subLeaders : []);
      setMutedIds(Array.isArray(muted) ? muted : []);
      setCamBlockedIds(Array.isArray(camBlocked) ? camBlocked : []);
      setKickedIds(Array.isArray(kicked) ? kicked : []);

      if (Array.isArray(kicked) && kicked.includes(currentUser.id)) {
        setWasKicked(true);
        wsProvider.disconnect();
      }
    };

    const prevPendingReportIdsRef = new Set<string>();

    const updateModerationReports = () => {
      const allReports = moderationReportsArray.toArray();
      setReports(allReports);

      // Check if new pending reports arrived for host or sub-leaders
      const isMeHostOrMod =
        currentUser.id === hostId ||
        (Array.isArray(roomRolesMap.get("subLeaderIds")) &&
          (roomRolesMap.get("subLeaderIds") as string[]).includes(currentUser.id));

      if (isMeHostOrMod) {
        allReports.forEach((rep) => {
          if (rep.status === "pending" && !prevPendingReportIdsRef.has(rep.id)) {
            prevPendingReportIdsRef.add(rep.id);
            toast.warning(`New report: ${rep.reporterName} reported ${rep.targetName}`, {
              description: rep.reason,
              duration: 4000,
            });
          }
        });
      }
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
    roomRolesMap.observe(updateRoomRoles);
    joinRequestsMap.observe(updateJoinRequests);
    approvedUsersMap.observe(updateApprovedUsers);
    moderationReportsArray.observe(updateModerationReports);
    wsProvider.awareness.on("change", updateActiveUsers);

    // Clean up expired floating reactions periodically
    const reactionCleanupInterval = window.setInterval(() => {
      setReactions((prev) => prev.filter((r) => Date.now() - r.timestamp < 3500));
    }, 1000);

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

      if (isCreatorSession || !roomMeta.get("hostId") || !roomRolesMap.get("hostId")) {
        ydoc.transact(() => {
          if (!roomMeta.get("hostId")) {
            roomMeta.set("hostId", currentUser.id);
            roomMeta.set("hostName", currentUser.name);
          }
          if (!roomRolesMap.get("hostId")) {
            roomRolesMap.set("hostId", currentUser.id);
            roomRolesMap.set("subLeaderIds", []);
            roomRolesMap.set("mutedIds", []);
            roomRolesMap.set("kickedIds", []);
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
      updateRoomRoles();
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
        updateRoomRoles();
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
      window.clearInterval(reactionCleanupInterval);
      window.clearTimeout(offlineFallbackTimer);
      wsProvider.off("sync", onWsSync);
      wsProvider.off("status", onStatus);
      wsProvider.awareness.off("change", updateActiveUsers);
      filesMap.unobserve(updateFilesList);
      roomMeta.unobserve(updateRoomMeta);
      roomRolesMap.unobserve(updateRoomRoles);
      joinRequestsMap.unobserve(updateJoinRequests);
      approvedUsersMap.unobserve(updateApprovedUsers);
      moderationReportsArray.unobserve(updateModerationReports);

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

  const sendReaction = useCallback((emoji: string) => {
    if (!wsProviderRef.current) return;
    const reaction: EmojiReaction = {
      id: `rx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      emoji,
      senderName: localUser.name,
      senderColor: localUser.color,
      xPercent: Math.floor(20 + Math.random() * 60),
      timestamp: Date.now(),
    };
    wsProviderRef.current.awareness.setLocalStateField("reaction", reaction);
  }, [localUser]);

  const kickUser = useCallback((targetUserId: string) => {
    if (!ydocRef.current) return;
    const roomRolesMap = ydocRef.current.getMap<any>("room-roles");
    const currentKicked = (roomRolesMap.get("kickedIds") as string[]) || [];
    if (!currentKicked.includes(targetUserId)) {
      ydocRef.current.transact(() => {
        roomRolesMap.set("kickedIds", [...currentKicked, targetUserId]);
      });
    }
  }, []);

  const muteUser = useCallback((targetUserId: string) => {
    if (!ydocRef.current) return;
    const roomRolesMap = ydocRef.current.getMap<any>("room-roles");
    const currentMuted = (roomRolesMap.get("mutedIds") as string[]) || [];
    if (!currentMuted.includes(targetUserId)) {
      ydocRef.current.transact(() => {
        roomRolesMap.set("mutedIds", [...currentMuted, targetUserId]);
      });
    }
  }, []);

  const unmuteUser = useCallback((targetUserId: string) => {
    if (!ydocRef.current) return;
    const roomRolesMap = ydocRef.current.getMap<any>("room-roles");
    const currentMuted = (roomRolesMap.get("mutedIds") as string[]) || [];
    ydocRef.current.transact(() => {
      roomRolesMap.set("mutedIds", currentMuted.filter((id) => id !== targetUserId));
    });
  }, []);

  const setSubLeader = useCallback((targetUserId: string, isSubLeader: boolean) => {
    if (!ydocRef.current) return;
    const roomRolesMap = ydocRef.current.getMap<any>("room-roles");
    const currentSubLeaders = (roomRolesMap.get("subLeaderIds") as string[]) || [];
    ydocRef.current.transact(() => {
      if (isSubLeader) {
        if (!currentSubLeaders.includes(targetUserId)) {
          roomRolesMap.set("subLeaderIds", [...currentSubLeaders, targetUserId]);
        }
      } else {
        roomRolesMap.set("subLeaderIds", currentSubLeaders.filter((id) => id !== targetUserId));
      }
    });
  }, []);

  const transferHost = useCallback((targetUserId: string) => {
    if (!ydocRef.current) return;
    const roomRolesMap = ydocRef.current.getMap<any>("room-roles");
    const roomMeta = ydocRef.current.getMap<string>("roomMeta");
    ydocRef.current.transact(() => {
      roomRolesMap.set("hostId", targetUserId);
      roomMeta.set("hostId", targetUserId);
      const currentSubLeaders = (roomRolesMap.get("subLeaderIds") as string[]) || [];
      roomRolesMap.set("subLeaderIds", currentSubLeaders.filter((id) => id !== targetUserId));
    });
  }, []);

  const blockCamera = useCallback((targetUserId: string) => {
    if (!ydocRef.current) return;
    const roomRolesMap = ydocRef.current.getMap<any>("room-roles");
    const current = (roomRolesMap.get("camBlockedIds") as string[]) || [];
    if (!current.includes(targetUserId)) {
      ydocRef.current.transact(() => {
        roomRolesMap.set("camBlockedIds", [...current, targetUserId]);
      });
    }
  }, []);

  const unblockCamera = useCallback((targetUserId: string) => {
    if (!ydocRef.current) return;
    const roomRolesMap = ydocRef.current.getMap<any>("room-roles");
    const current = (roomRolesMap.get("camBlockedIds") as string[]) || [];
    ydocRef.current.transact(() => {
      roomRolesMap.set("camBlockedIds", current.filter((id) => id !== targetUserId));
    });
  }, []);

  const muteAllPeers = useCallback(() => {
    if (!ydocRef.current) return;
    const roomRolesMap = ydocRef.current.getMap<any>("room-roles");
    const peerIds = activeUsers.filter((u) => u.id !== localUser.id).map((u) => u.id);
    const currentMuted = (roomRolesMap.get("mutedIds") as string[]) || [];
    const merged = Array.from(new Set([...currentMuted, ...peerIds]));
    ydocRef.current.transact(() => {
      roomRolesMap.set("mutedIds", merged);
    });
    toast.info("All peers muted");
  }, [activeUsers, localUser.id]);

  const blockAllPeerCameras = useCallback(() => {
    if (!ydocRef.current) return;
    const roomRolesMap = ydocRef.current.getMap<any>("room-roles");
    const peerIds = activeUsers.filter((u) => u.id !== localUser.id).map((u) => u.id);
    const currentBlocked = (roomRolesMap.get("camBlockedIds") as string[]) || [];
    const merged = Array.from(new Set([...currentBlocked, ...peerIds]));
    ydocRef.current.transact(() => {
      roomRolesMap.set("camBlockedIds", merged);
    });
    toast.info("All peer cameras disabled");
  }, [activeUsers, localUser.id]);

  const unmuteAndAllowAll = useCallback(() => {
    if (!ydocRef.current) return;
    const roomRolesMap = ydocRef.current.getMap<any>("room-roles");
    ydocRef.current.transact(() => {
      roomRolesMap.set("mutedIds", []);
      roomRolesMap.set("camBlockedIds", []);
    });
    toast.success("All peers unmuted and cameras allowed");
  }, []);

  const submitReport = useCallback(
    (targetId: string, targetName: string, reason: string, note?: string) => {
      if (!ydocRef.current) return;
      const moderationReportsArray = ydocRef.current.getArray<ModerationReport>("moderation-reports");
      const report: ModerationReport = {
        id: `rep-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        reporterId: localUser.id,
        reporterName: localUser.name,
        targetId,
        targetName,
        reason,
        note,
        timestamp: Date.now(),
        status: "pending",
      };
      ydocRef.current.transact(() => {
        moderationReportsArray.push([report]);
      });
      toast.success("Report sent to Host");
    },
    [localUser]
  );

  const resolveReport = useCallback((reportId: string, action?: "mute" | "camOff" | "kick" | "dismiss") => {
    if (!ydocRef.current) return;
    const moderationReportsArray = ydocRef.current.getArray<ModerationReport>("moderation-reports");
    const list = moderationReportsArray.toArray();
    const repIndex = list.findIndex((r) => r.id === reportId);
    if (repIndex === -1) return;

    const rep = list[repIndex];
    if (!rep) return;

    ydocRef.current.transact(() => {
      moderationReportsArray.delete(repIndex, 1);
      moderationReportsArray.insert(repIndex, [{ ...rep, status: "resolved" }]);

      if (action === "mute") {
        const roomRolesMap = ydocRef.current!.getMap<any>("room-roles");
        const currentMuted = (roomRolesMap.get("mutedIds") as string[]) || [];
        if (!currentMuted.includes(rep.targetId)) {
          roomRolesMap.set("mutedIds", [...currentMuted, rep.targetId]);
        }
      } else if (action === "camOff") {
        const roomRolesMap = ydocRef.current!.getMap<any>("room-roles");
        const current = (roomRolesMap.get("camBlockedIds") as string[]) || [];
        if (!current.includes(rep.targetId)) {
          roomRolesMap.set("camBlockedIds", [...current, rep.targetId]);
        }
      } else if (action === "kick") {
        const roomRolesMap = ydocRef.current!.getMap<any>("room-roles");
        const current = (roomRolesMap.get("kickedIds") as string[]) || [];
        if (!current.includes(rep.targetId)) {
          roomRolesMap.set("kickedIds", [...current, rep.targetId]);
        }
      }
    });

    if (action === "mute") toast.success(`Muted ${rep.targetName} and resolved report`);
    else if (action === "camOff") toast.success(`Turned off ${rep.targetName}'s camera and resolved report`);
    else if (action === "kick") toast.success(`Kicked ${rep.targetName} and resolved report`);
    else toast.info("Report dismissed");
  }, []);

  const isSubLeader = subLeaderIds.includes(localUser.id);
  const isMuted = mutedIds.includes(localUser.id);
  const isCamBlocked = camBlockedIds.includes(localUser.id);

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
    // Moderation & Roles
    subLeaderIds,
    mutedIds,
    camBlockedIds,
    kickedIds,
    wasKicked,
    isSubLeader,
    isMuted,
    isCamBlocked,
    kickUser,
    muteUser,
    unmuteUser,
    blockCamera,
    unblockCamera,
    muteAllPeers,
    blockAllPeerCameras,
    unmuteAndAllowAll,
    setSubLeader,
    transferHost,
    // Reports queue
    reports,
    submitReport,
    resolveReport,
    // Reactions
    reactions,
    sendReaction,
  };
}
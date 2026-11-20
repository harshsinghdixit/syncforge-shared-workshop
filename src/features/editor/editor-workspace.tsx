import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  Circle,
  Code2,
  FilePlus2,
  FileText,
  FolderOpen,
  FolderUp,
  Github,
  Layers3,
  MoreHorizontal,
  Redo2,
  RotateCcw,
  Share2,
  Trash2,
  Undo2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useYjsCollaboration, type RemoteUser } from "./use-yjs-collaboration";
import { CodeMirrorEditor } from "./codemirror-editor";
import { GitHubModal } from "./github-modal";
import { WaitingRoomModal, HostRequestBanner } from "./waiting-room";

function FileGlyph({ name }: { name: string }) {
  if (name.endsWith(".md")) return <FileText aria-hidden="true" className="size-4" />;
  return <Code2 aria-hidden="true" className="size-4" />;
}

function TopBar({
  roomId,
  setRoomId,
  isOffline,
  toggleOffline,
  activeUsers,
  localUser,
  onOpenGitHub,
}: {
  roomId: string;
  setRoomId: (roomId: string) => void;
  isOffline: boolean;
  toggleOffline: () => void;
  activeUsers: RemoteUser[];
  localUser: RemoteUser;
  onOpenGitHub: () => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const copyInviteLink = async () => {
    const inviteUrl = new URL(window.location.href);
    inviteUrl.searchParams.set("room", roomId);
    try {
      await window.navigator.clipboard.writeText(inviteUrl.toString());
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("failed");
      window.setTimeout(() => setCopyState("idle"), 1800);
    }
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <header className="topbar">
      <div className="brand-lockup">
        <div className="brand-mark" aria-hidden="true">
          <Layers3 className="size-5" strokeWidth={2.4} />
        </div>
        <span className="brand-name">SyncForge</span>
        <span className="brand-version">BETA</span>
      </div>

      <div className="room-tools">
        <span className="room-label">ROOM</span>
        <label className="sr-only" htmlFor="room-id">
          Room ID
        </label>
        <Input
          id="room-id"
          className="room-input font-mono"
          value={roomId}
          onChange={(event) => setRoomId(event.target.value)}
          spellCheck={false}
          aria-label="Room ID"
        />
        <Button className="invite-button" variant="outline" size="sm" onClick={copyInviteLink}>
          {copyState === "copied" ? <Check /> : <Share2 />}
          <span>{copyState === "copied" ? "Link copied" : "Copy invite link"}</span>
        </Button>
        {copyState === "failed" && <span className="copy-error">Clipboard unavailable</span>}
      </div>

      <div className="room-presence">
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground border-border"
          onClick={onOpenGitHub}
          title="Connect GitHub repository"
        >
          <Github className="size-3.5" />
          <span>GitHub</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className={`connection-badge ${isOffline ? "connection-offline" : "connection-online"}`}
          onClick={toggleOffline}
          aria-label={isOffline ? "Connection offline" : "Connection online"}
        >
          <span className="connection-dot" />
          <span>{isOffline ? "Offline" : "Online"}</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="simulate-button"
          onClick={toggleOffline}
          title={isOffline ? "Restore online status" : "Simulate offline status"}
        >
          {isOffline ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
          <span className="simulate-label">{isOffline ? "Reconnect" : "Simulate offline"}</span>
        </Button>

        <div className="member-stack" aria-label={`${activeUsers.length} active users`}>
          {activeUsers.slice(0, 4).map((member) => (
            <div
              key={member.id}
              className="member-avatar flex items-center justify-center font-bold text-[10px] text-white border border-white/20 shadow-sm transition-transform hover:scale-110"
              style={{ backgroundColor: member.color }}
              title={member.id === localUser.id ? `${member.name} (You)` : member.name}
              aria-label={member.name}
            >
              {getInitials(member.name)}
            </div>
          ))}
          {activeUsers.length > 4 && (
            <div className="member-count" title={`${activeUsers.length} active users`}>
              +{activeUsers.length - 4}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function FileRow({
  fileName,
  active,
  editing,
  onSelect,
  onRenameStart,
  onRename,
  onRenameCancel,
  onDelete,
}: {
  fileName: string;
  active: boolean;
  editing: boolean;
  onSelect: () => void;
  onRenameStart: () => void;
  onRename: (name: string) => void;
  onRenameCancel: () => void;
  onDelete: () => void;
}) {
  const [draftName, setDraftName] = useState(fileName);

  if (editing) {
    return (
      <div className="file-row-edit">
        <Input
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          aria-label={`Rename ${fileName}`}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter") onRename(draftName);
            if (event.key === "Escape") onRenameCancel();
          }}
        />
        <Button size="icon" variant="ghost" aria-label="Save file name" onClick={() => onRename(draftName)}>
          <Check />
        </Button>
        <Button size="icon" variant="ghost" aria-label="Cancel rename" onClick={onRenameCancel}>
          <X />
        </Button>
      </div>
    );
  }

  return (
    <div className={`file-row ${active ? "file-row-active" : ""}`}>
      <Button
        variant="ghost"
        size="sm"
        className="file-select"
        onClick={onSelect}
        aria-current={active ? "page" : undefined}
      >
        <span className="file-glyph">
          <FileGlyph name={fileName} />
        </span>
        <span className="file-name" title={fileName}>{fileName}</span>
      </Button>
      <div className="file-actions">
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Rename ${fileName}`}
          title="Rename file"
          onClick={onRenameStart}
        >
          <span className="rename-glyph">Aa</span>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Delete ${fileName}`}
          title="Delete file"
          onClick={onDelete}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}

function FileExplorer({
  fileNames,
  activeFileName,
  onSelectFile,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
  onImportFolder,
}: {
  fileNames: string[];
  activeFileName: string;
  onSelectFile: (name: string) => void;
  onCreateFile: (name: string) => void;
  onRenameFile: (oldName: string, newName: string) => void;
  onDeleteFile: (name: string) => void;
  onImportFolder: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [renamingName, setRenamingName] = useState<string | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleCreate = () => {
    const trimmed = newFileName.trim();
    if (!trimmed || fileNames.includes(trimmed)) return;
    onCreateFile(trimmed);
    setNewFileName("");
    setCreating(false);
  };

  return (
    <aside className="explorer" aria-label="File explorer">
      <div className="explorer-heading">
        <div className="explorer-title">
          <FolderOpen className="size-4" /> Explorer
        </div>
        <div className="flex items-center gap-1">
          <input
            ref={folderInputRef}
            type="file"
            // @ts-expect-error webkitdirectory is standard in browser engines
            webkitdirectory=""
            directory=""
            multiple
            className="hidden"
            onChange={onImportFolder}
          />
          <Button
            variant="ghost"
            size="icon"
            className="explorer-add"
            aria-label="Import folder"
            title="Import local folder"
            onClick={() => folderInputRef.current?.click()}
          >
            <FolderUp className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="explorer-add"
            aria-label="Create new file"
            title="Create new file"
            onClick={() => {
              setCreating(true);
              setRenamingName(null);
            }}
          >
            <FilePlus2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="workspace-caption">
        <span>WORKSPACE</span>
        <ChevronDown className="size-3.5" />
      </div>

      <div className="file-list">
        {creating && (
          <div className="new-file-entry">
            <Input
              value={newFileName}
              onChange={(event) => setNewFileName(event.target.value)}
              aria-label="New file name"
              placeholder="filename.js"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter") handleCreate();
                if (event.key === "Escape") setCreating(false);
              }}
            />
            <Button size="icon" variant="ghost" aria-label="Add file" onClick={handleCreate}>
              <Check />
            </Button>
            <Button size="icon" variant="ghost" aria-label="Cancel new file" onClick={() => setCreating(false)}>
              <X />
            </Button>
          </div>
        )}

        {fileNames.map((name) => (
          <FileRow
            key={name}
            fileName={name}
            active={name === activeFileName}
            editing={renamingName === name}
            onSelect={() => onSelectFile(name)}
            onRenameStart={() => {
              setRenamingName(name);
              setCreating(false);
            }}
            onRename={(newName) => {
              onRenameFile(name, newName);
              setRenamingName(null);
            }}
            onRenameCancel={() => setRenamingName(null)}
            onDelete={() => {
              onDeleteFile(name);
              setRenamingName(null);
            }}
          />
        ))}

        {fileNames.length === 0 && !creating && <p className="empty-files">No files yet</p>}
      </div>

      <div className="explorer-footer">
        <div className="workspace-status-dot" />
        <span>Yjs CRDT Workspace</span>
      </div>
    </aside>
  );
}

function EditorPane({
  fileName,
  yText,
  wsProvider,
  undoManager,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  fileName: string;
  yText: ReturnType<typeof useYjsCollaboration>["activeYText"];
  wsProvider: ReturnType<typeof useYjsCollaboration>["wsProvider"];
  undoManager: ReturnType<typeof useYjsCollaboration>["activeUndoManager"];
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const [cursor, setCursor] = useState({ line: 1, column: 1 });

  const handleCursorChange = useCallback((line: number, column: number) => {
    setCursor({ line, column });
  }, []);

  const downloadFile = () => {
    if (!fileName || !yText) return;
    const blob = new Blob([yText.toString()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName.split("/").pop() || fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const fileLanguage = fileName ? (fileName.split(".").pop()?.toUpperCase() ?? "TEXT") : "NONE";

  return (
    <section className="editor-pane" aria-label="Code editor">
      <div className="editor-toolbar">
        <div className="editor-location">
          <span className="crumb-muted">SyncForge</span>
          <span className="crumb-divider">/</span>
          <span className="crumb-file">{fileName || "No file selected"}</span>
          <span className="language-chip">{fileLanguage}</span>
          <Circle className="modified-indicator" fill="currentColor" aria-label="Realtime CRDT active" />
        </div>
        <div className="editor-actions">
          <div className="history-actions" aria-label="Edit history">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Undo"
              title="Undo (Ctrl+Z)"
              disabled={!canUndo}
              onClick={onUndo}
            >
              <Undo2 />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Redo"
              title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
              disabled={!canRedo}
              onClick={onRedo}
            >
              <Redo2 />
            </Button>
          </div>
          <span className="toolbar-divider" />
          <Button
            variant="outline"
            size="sm"
            className="download-button"
            onClick={downloadFile}
            disabled={!fileName}
          >
            <ArrowDownToLine /> <span>Download file</span>
          </Button>
        </div>
      </div>

      <div className="editor-canvas">
        {fileName && yText ? (
          <CodeMirrorEditor
            key={fileName}
            fileName={fileName}
            yText={yText}
            wsProvider={wsProvider}
            undoManager={undoManager}
            onCursorChange={handleCursorChange}
          />
        ) : (
          <div className="no-file-state">
            <div className="no-file-icon">
              <FileText />
            </div>
            <p>Your workspace is clear.</p>
            <span>Create or import a file to start writing.</span>
          </div>
        )}
      </div>

      <div className="editor-bottomline">
        <span>{fileName ? `Ln ${cursor.line}, Col ${cursor.column}` : "No cursor"}</span>
        <span className="bottomline-divider">·</span>
        <span>{fileName || "Workspace"}</span>
        <span className="bottomline-spacer" />
        <span>UTF-8</span>
        <span className="bottomline-divider">·</span>
        <span>{fileLanguage}</span>
      </div>
    </section>
  );
}

function StatusBar({
  fileName,
  isOffline,
  onClear,
}: {
  fileName: string;
  isOffline: boolean;
  onClear: () => void;
}) {
  return (
    <footer className="statusbar">
      <div className="status-left">
        <span className="status-room">
          <span className="status-dot" /> {isOffline ? "Saved locally offline" : "Synced"}
        </span>
        <span className="status-separator">|</span>
        <span className="status-file">{fileName || "No active file"}</span>
      </div>
      <Button variant="ghost" size="sm" className="clear-cache-button" onClick={onClear}>
        <RotateCcw /> <span>Clear local cache</span>
      </Button>
    </footer>
  );
}

export function EditorWorkspace() {
  // Read room from URL query parameter ?room=<id>
  const [roomId, setRoomId] = useState(() => {
    if (typeof window !== "undefined") {
      const searchRoom = new URLSearchParams(window.location.search).get("room");
      if (searchRoom && searchRoom.trim()) return searchRoom.trim();
    }
    return "juniper-lab";
  });

  const [githubModalOpen, setGithubModalOpen] = useState(false);

  // Sync room ID changes back to browser URL
  useEffect(() => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.get("room") !== roomId) {
        url.searchParams.set("room", roomId);
        window.history.replaceState(null, "", url.toString());
      }
    }
  }, [roomId]);

  const {
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
    toggleOffline,
    clearLocalCache,
    createFile,
    renameFile,
    deleteFile,
    importFiles,
    ydoc,
    wsProvider,
    isApproved,
    hasRequestedJoin,
    joinRequests,
    requestJoin,
    acceptJoinRequest,
    declineJoinRequest,
  } = useYjsCollaboration(roomId);

  // Keyboard shortcut listener for global Ctrl+Z / Ctrl+Y
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  // Handle local folder import
  const handleImportFolder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const importedList: { name: string; content: string }[] = [];
    const binaryExts = [
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".ico",
      ".pdf",
      ".zip",
      ".tar",
      ".gz",
      ".exe",
      ".woff",
      ".woff2",
      ".mp4",
      ".mp3",
    ];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const relPath = file.webkitRelativePath || file.name;
      const lower = relPath.toLowerCase();

      if (lower.includes("/.") || lower.includes("node_modules/")) continue;
      if (binaryExts.some((ext) => lower.endsWith(ext))) continue;
      if (file.size > 1024 * 500) continue; // limit 500KB

      try {
        const text = await file.text();
        importedList.push({ name: relPath, content: text });
      } catch {
        // Skip unreadable files
      }
    }

    if (importedList.length > 0) {
      importFiles(importedList);
    }
    e.target.value = "";
  };

  // Helper for GitHub modal to get current files
  const getAllFiles = useCallback(() => {
    if (!ydoc) return [];
    const filesMap = ydoc.getMap<import("yjs").Text>("files");
    const list: { name: string; content: string }[] = [];
    filesMap.forEach((yText, name) => {
      list.push({ name, content: yText.toString() });
    });
    return list;
  }, [ydoc, fileNames]);

  return (
    <main className="syncforge-app relative">
      <TopBar
        roomId={roomId}
        setRoomId={setRoomId}
        isOffline={isOffline}
        toggleOffline={toggleOffline}
        activeUsers={activeUsers}
        localUser={localUser}
        onOpenGitHub={() => setGithubModalOpen(true)}
      />

      <div className="workspace-body">
        <FileExplorer
          fileNames={fileNames}
          activeFileName={activeFileName}
          onSelectFile={setActiveFileName}
          onCreateFile={createFile}
          onRenameFile={renameFile}
          onDeleteFile={deleteFile}
          onImportFolder={handleImportFolder}
        />
        <EditorPane
          fileName={activeFileName}
          yText={activeYText}
          wsProvider={wsProvider}
          undoManager={activeUndoManager}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
        />
      </div>

      <StatusBar
        fileName={activeFileName}
        isOffline={isOffline}
        onClear={clearLocalCache}
      />

      {/* Host Live Join Request Notifications */}
      <HostRequestBanner
        requests={joinRequests}
        onAccept={acceptJoinRequest}
        onDecline={declineJoinRequest}
      />

      {/* Waiting Room Modal for unapproved guests */}
      {!isApproved && (
        <WaitingRoomModal
          roomId={roomId}
          defaultName={localUser.name}
          hasRequested={hasRequestedJoin}
          onRequestJoin={requestJoin}
        />
      )}

      {/* GitHub Sync Modal */}
      <GitHubModal
        open={githubModalOpen}
        onOpenChange={setGithubModalOpen}
        onImportFiles={importFiles}
        getAllFiles={getAllFiles}
      />
    </main>
  );
}
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  Circle,
  Code2,
  Copy,
  FileCode,
  FilePlus2,
  FileText,
  FolderOpen,
  FolderUp,
  Github,
  Layers3,
  LogOut,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useYjsCollaboration, type RemoteUser } from "./use-yjs-collaboration";
import { CodeMirrorEditor } from "./codemirror-editor";
import { GitHubModal } from "./github-modal";
import { WaitingRoomModal, HostRequestBanner } from "./waiting-room";
import { LobbyScreen } from "./lobby-screen";

function FileGlyph({ name }: { name: string }) {
  if (name.endsWith(".md")) return <FileText aria-hidden="true" className="size-4" />;
  return <Code2 aria-hidden="true" className="size-4" />;
}

function InviteFriendsPopover({ roomId }: { roomId: string }) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 2000);
    } catch {}
  };

  const copyLink = async () => {
    try {
      const inviteUrl = new URL(window.location.href);
      inviteUrl.searchParams.set("room", roomId);
      await navigator.clipboard.writeText(inviteUrl.toString());
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {}
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="invite-button h-8 gap-2 border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary font-semibold shadow-sm"
        >
          <Share2 className="size-3.5" />
          <span>Invite Friends</span>
          <span className="font-mono text-[11px] bg-background/80 px-1.5 py-0.5 rounded border border-primary/30 text-foreground">
            {roomId}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4 bg-card border-border shadow-2xl rounded-xl space-y-4" align="center">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Share2 className="size-4 text-primary" />
            <h4 className="font-bold text-sm text-foreground">Invite to Room</h4>
          </div>
          <p className="text-xs text-muted-foreground">
            Share this room code or direct invite link with your collaborators to code together live.
          </p>
        </div>

        {/* Room Code */}
        <div className="space-y-1.5 bg-background/60 p-3 rounded-lg border border-border">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-muted-foreground">ROOM CODE</span>
            <span className="font-mono font-bold text-primary tracking-widest text-sm">{roomId}</span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="w-full gap-2 text-xs font-semibold h-8"
            onClick={copyCode}
          >
            {copiedCode ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
            <span>{copiedCode ? "Copied Code!" : "Copy Code"}</span>
          </Button>
        </div>

        {/* Invite Link */}
        <div className="space-y-1.5 bg-background/60 p-3 rounded-lg border border-border">
          <span className="text-xs font-semibold text-muted-foreground block">INVITE LINK</span>
          <div className="text-[11px] font-mono text-muted-foreground truncate select-all bg-card/60 p-1.5 rounded border border-border/80">
            {typeof window !== "undefined" ? `${window.location.origin}/?room=${roomId}` : `/?room=${roomId}`}
          </div>
          <Button
            size="sm"
            className="w-full gap-2 text-xs font-semibold h-8 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={copyLink}
          >
            {copiedLink ? <Check className="size-3.5 text-emerald-300" /> : <Share2 className="size-3.5" />}
            <span>{copiedLink ? "Copied Invite Link!" : "Copy Invite Link"}</span>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TopBar({
  roomId,
  setRoomId,
  isOffline,
  toggleOffline,
  activeUsers,
  localUser,
  hostId,
  onOpenGitHub,
  onLeaveRoom,
}: {
  roomId: string;
  setRoomId: (roomId: string) => void;
  isOffline: boolean;
  toggleOffline: () => void;
  activeUsers: RemoteUser[];
  localUser: RemoteUser;
  hostId: string | null;
  onOpenGitHub: () => void;
  onLeaveRoom: () => void;
}) {
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <div className="brand-mark cursor-pointer" aria-hidden="true" onClick={onLeaveRoom} title="Return to Game Lobby">
          <Layers3 className="size-5" strokeWidth={2.4} />
        </div>
        <span className="brand-name cursor-pointer" onClick={onLeaveRoom} title="Return to Game Lobby">
          SyncForge
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onLeaveRoom}
          className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground gap-1 border border-border/60"
          title="Leave room and return to Lobby"
        >
          <LogOut className="size-3" />
          <span>Lobby</span>
        </Button>
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
        <InviteFriendsPopover roomId={roomId} />
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

        {/* Colored Player Avatar Pills with Host Badge */}
        <div className="flex items-center gap-1.5 flex-wrap" aria-label={`${activeUsers.length} active users`}>
          {activeUsers.map((member) => {
            const isMemberHost = member.id === hostId;
            const isMe = member.id === localUser.id;
            return (
              <div
                key={member.id}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-transform hover:scale-105 shadow-sm"
                style={{
                  backgroundColor: `${member.color}18`,
                  borderColor: `${member.color}60`,
                }}
                title={isMe ? `${member.name} (You)` : member.name}
              >
                <span
                  className="size-2 rounded-full animate-pulse shrink-0"
                  style={{ backgroundColor: member.color }}
                />
                <span className="font-bold text-[11px] truncate max-w-[85px]" style={{ color: member.color }}>
                  {member.name}
                </span>
                {isMemberHost && (
                  <span className="px-1.5 py-0.2 text-[9px] font-extrabold rounded bg-amber-500/20 text-amber-400 border border-amber-500/40 tracking-wider">
                    👑 HOST
                  </span>
                )}
                {isMe && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    (You)
                  </span>
                )}
              </div>
            );
          })}
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
  onImportFiles,
  onOpenGitHub,
}: {
  fileNames: string[];
  activeFileName: string;
  onSelectFile: (name: string) => void;
  onCreateFile: (name: string) => void;
  onRenameFile: (oldName: string, newName: string) => void;
  onDeleteFile: (name: string) => void;
  onImportFolder: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onImportFiles: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenGitHub: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [renamingName, setRenamingName] = useState<string | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      {/* Prominent File Import Actions */}
      <div className="p-2 border-b border-border space-y-1.5 bg-background/30">
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
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={onImportFiles}
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 h-8 text-xs font-semibold border-border/80 bg-card hover:bg-accent hover:text-accent-foreground text-foreground shadow-xs"
            >
              <FolderUp className="size-3.5 text-primary" />
              <span className="truncate">Open Local File/Folder (PC)</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="gap-2 cursor-pointer text-xs">
              <FileCode className="size-3.5 text-primary" />
              <span>Open Local File(s) (PC)...</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => folderInputRef.current?.click()} className="gap-2 cursor-pointer text-xs">
              <FolderOpen className="size-3.5 text-primary" />
              <span>Open Local Folder (PC)...</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 h-8 text-xs font-semibold border-border/80 bg-card hover:bg-accent hover:text-accent-foreground text-foreground shadow-xs"
          onClick={onOpenGitHub}
        >
          <Github className="size-3.5" />
          <span className="truncate">Import from GitHub</span>
        </Button>
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
  onOpenFolderPicker,
  onOpenGitHub,
}: {
  fileName: string;
  yText: ReturnType<typeof useYjsCollaboration>["activeYText"];
  wsProvider: ReturnType<typeof useYjsCollaboration>["wsProvider"];
  undoManager: ReturnType<typeof useYjsCollaboration>["activeUndoManager"];
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenFolderPicker: () => void;
  onOpenGitHub: () => void;
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
            className="h-8 gap-1.5 text-xs font-medium border-border"
            onClick={onOpenFolderPicker}
            title="Open local files or folders"
          >
            <FolderUp className="size-3.5" />
            <span className="hidden sm:inline">Open Local</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs font-medium border-border"
            onClick={onOpenGitHub}
            title="Import from GitHub repository"
          >
            <Github className="size-3.5" />
            <span className="hidden sm:inline">GitHub</span>
          </Button>

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

function ActiveRoomWorkspace({
  roomId,
  setRoomId,
  onLeaveRoom,
}: {
  roomId: string;
  setRoomId: (roomId: string) => void;
  onLeaveRoom: () => void;
}) {
  const [githubModalOpen, setGithubModalOpen] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);

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
    isHost,
    hostId,
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

  // Handle individual local files import
  const handleImportFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const importedList: { name: string; content: string }[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 1024 * 500) continue;
      try {
        const text = await file.text();
        importedList.push({ name: file.name, content: text });
      } catch {}
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
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error webkitdirectory is standard in browser engines
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
        onChange={handleImportFolder}
      />

      <TopBar
        roomId={roomId}
        setRoomId={setRoomId}
        isOffline={isOffline}
        toggleOffline={toggleOffline}
        activeUsers={activeUsers}
        localUser={localUser}
        hostId={hostId}
        onOpenGitHub={() => setGithubModalOpen(true)}
        onLeaveRoom={onLeaveRoom}
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
          onImportFiles={handleImportFiles}
          onOpenGitHub={() => setGithubModalOpen(true)}
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
          onOpenFolderPicker={() => folderInputRef.current?.click()}
          onOpenGitHub={() => setGithubModalOpen(true)}
        />
      </div>

      <StatusBar
        fileName={activeFileName}
        isOffline={isOffline}
        onClear={clearLocalCache}
      />

      {/* Host Live Join Request Notifications */}
      {isHost && (
        <HostRequestBanner
          requests={joinRequests}
          onAccept={acceptJoinRequest}
          onDecline={declineJoinRequest}
        />
      )}

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

export function EditorWorkspace() {
  // Read room from URL query parameter ?room=<id>
  const [roomId, setRoomId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const searchRoom = new URLSearchParams(window.location.search).get("room");
      if (searchRoom && searchRoom.trim()) return searchRoom.trim();
    }
    return null;
  });

  // Sync room ID changes back to browser URL
  useEffect(() => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (roomId) {
        if (url.searchParams.get("room") !== roomId) {
          url.searchParams.set("room", roomId);
          window.history.pushState(null, "", url.toString());
        }
      } else {
        if (url.searchParams.has("room")) {
          url.searchParams.delete("room");
          window.history.pushState(null, "", url.pathname);
        }
      }
    }
  }, [roomId]);

  // If no room is specified in URL, show Game Lobby Start Screen
  if (!roomId) {
    return (
      <LobbyScreen
        onEnterRoom={(code) => {
          setRoomId(code);
        }}
      />
    );
  }

  return (
    <ActiveRoomWorkspace
      roomId={roomId}
      setRoomId={setRoomId}
      onLeaveRoom={() => setRoomId(null)}
    />
  );
}
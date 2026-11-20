import { useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  Circle,
  Code2,
  FilePlus2,
  FileText,
  FolderOpen,
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

import { createEditorFile, type EditorFile, type EditorState } from "./editor-model";
import { useEditorState } from "./use-editor-state";

const roomMembers = [
  { initials: "JD", name: "Jordan Davis", color: "avatar-coral" },
  { initials: "MK", name: "Mika Kim", color: "avatar-mint" },
  { initials: "AL", name: "Alex Liu", color: "avatar-gold" },
];

function FileGlyph({ name }: { name: string }) {
  if (name.endsWith(".md")) return <FileText aria-hidden="true" className="size-4" />;
  return <Code2 aria-hidden="true" className="size-4" />;
}

function TopBar({
  roomId,
  setRoomId,
  isOffline,
  toggleOffline,
}: {
  roomId: string;
  setRoomId: (roomId: string) => void;
  isOffline: boolean;
  toggleOffline: () => void;
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
        <label className="sr-only" htmlFor="room-id">Room ID</label>
        <Input
          id="room-id"
          className="room-input"
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
        <div className="member-stack" aria-label="3 active users">
          {roomMembers.map((member) => (
            <div
              key={member.initials}
              className={`member-avatar ${member.color}`}
              title={member.name}
              aria-label={member.name}
            >
              {member.initials}
            </div>
          ))}
          <div className="member-count" title="3 active users">+1</div>
        </div>
        <Button variant="ghost" size="icon" className="more-button" aria-label="Room options" title="Room options">
          <MoreHorizontal />
        </Button>
      </div>
    </header>
  );
}

function FileRow({
  file,
  active,
  editing,
  onSelect,
  onRenameStart,
  onRename,
  onRenameCancel,
  onDelete,
}: {
  file: EditorFile;
  active: boolean;
  editing: boolean;
  onSelect: () => void;
  onRenameStart: () => void;
  onRename: (name: string) => void;
  onRenameCancel: () => void;
  onDelete: () => void;
}) {
  const [draftName, setDraftName] = useState(file.name);

  if (editing) {
    return (
      <div className="file-row-edit">
        <Input
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          aria-label={`Rename ${file.name}`}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter") onRename(draftName);
            if (event.key === "Escape") onRenameCancel();
          }}
        />
        <Button size="icon" variant="ghost" aria-label="Save file name" onClick={() => onRename(draftName)}><Check /></Button>
        <Button size="icon" variant="ghost" aria-label="Cancel rename" onClick={onRenameCancel}><X /></Button>
      </div>
    );
  }

  return (
    <div className={`file-row ${active ? "file-row-active" : ""}`}>
      <Button variant="ghost" size="sm" className="file-select" onClick={onSelect} aria-current={active ? "page" : undefined}>
        <span className="file-glyph"><FileGlyph name={file.name} /></span>
        <span className="file-name">{file.name}</span>
      </Button>
      <div className="file-actions">
        <Button size="icon" variant="ghost" aria-label={`Rename ${file.name}`} title="Rename file" onClick={onRenameStart}>
          <span className="rename-glyph">Aa</span>
        </Button>
        <Button size="icon" variant="ghost" aria-label={`Delete ${file.name}`} title="Delete file" onClick={onDelete}>
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}

function FileExplorer({
  state,
  dispatch,
}: {
  state: EditorState;
  dispatch: ReturnType<typeof useEditorState>["dispatch"];
}) {
  const [creating, setCreating] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const createFile = () => {
    const name = newFileName.trim();
    if (!name || state.files.some((file) => file.name === name)) return;
    dispatch({ type: "create", file: createEditorFile(name) });
    setNewFileName("");
    setCreating(false);
  };

  return (
    <aside className="explorer" aria-label="File explorer">
      <div className="explorer-heading">
        <div className="explorer-title"><FolderOpen className="size-4" /> Explorer</div>
        <Button
          variant="ghost"
          size="icon"
          className="explorer-add"
          aria-label="Create new file"
          title="Create new file"
          onClick={() => {
            setCreating(true);
            setRenamingId(null);
          }}
        >
          <FilePlus2 />
        </Button>
      </div>
      <div className="workspace-caption"><span>WORKSPACE</span><ChevronDown className="size-3.5" /></div>
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
                if (event.key === "Enter") createFile();
                if (event.key === "Escape") setCreating(false);
              }}
            />
            <Button size="icon" variant="ghost" aria-label="Add file" onClick={createFile}><Check /></Button>
            <Button size="icon" variant="ghost" aria-label="Cancel new file" onClick={() => setCreating(false)}><X /></Button>
          </div>
        )}
        {state.files.map((file) => (
          <FileRow
            key={`${file.id}-${renamingId === file.id ? "editing" : "view"}`}
            file={file}
            active={file.id === state.activeFileId}
            editing={renamingId === file.id}
            onSelect={() => dispatch({ type: "select", id: file.id })}
            onRenameStart={() => {
              setRenamingId(file.id);
              setCreating(false);
            }}
            onRename={(name) => {
              dispatch({ type: "rename", id: file.id, name });
              setRenamingId(null);
            }}
            onRenameCancel={() => setRenamingId(null)}
            onDelete={() => {
              dispatch({ type: "delete", id: file.id });
              setRenamingId(null);
            }}
          />
        ))}
        {state.files.length === 0 && !creating && <p className="empty-files">No files yet</p>}
      </div>
      <div className="explorer-footer"><div className="workspace-status-dot" /><span>Local workspace</span></div>
    </aside>
  );
}

function EditorPane({
  file,
  dispatch,
  canUndo,
  canRedo,
}: {
  file: EditorFile | undefined;
  dispatch: ReturnType<typeof useEditorState>["dispatch"];
  canUndo: boolean;
  canRedo: boolean;
}) {
  const [cursor, setCursor] = useState({ line: 1, column: 1, scrollTop: 0 });
  const lines = useMemo(() => Math.max(file?.content.split("\n").length ?? 1, 20), [file?.content]);
  const lineNumbers = Array.from({ length: lines }, (_, index) => index + 1);

  const updateCursor = (element: HTMLTextAreaElement) => {
    const beforeCursor = element.value.slice(0, element.selectionStart);
    const rows = beforeCursor.split("\n");
    setCursor((previous) => ({ ...previous, line: rows.length, column: (rows.at(-1)?.length ?? 0) + 1 }));
  };

  const downloadFile = () => {
    if (!file) return;
    const blob = new Blob([file.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const fileLanguage = file?.name.split(".").pop()?.toUpperCase() ?? "TEXT";

  return (
    <section className="editor-pane" aria-label="Code editor">
      <div className="editor-toolbar">
        <div className="editor-location">
          <span className="crumb-muted">SyncForge</span>
          <span className="crumb-divider">/</span>
          <span className="crumb-file">{file?.name ?? "No file selected"}</span>
          <span className="language-chip">{fileLanguage}</span>
          <Circle className="modified-indicator" fill="currentColor" aria-label="Local changes saved" />
        </div>
        <div className="editor-actions">
          <div className="history-actions" aria-label="Edit history">
            <Button variant="ghost" size="icon" aria-label="Undo" title="Undo" disabled={!canUndo} onClick={() => dispatch({ type: "undo" })}><Undo2 /></Button>
            <Button variant="ghost" size="icon" aria-label="Redo" title="Redo" disabled={!canRedo} onClick={() => dispatch({ type: "redo" })}><Redo2 /></Button>
          </div>
          <span className="toolbar-divider" />
          <Button variant="outline" size="sm" className="download-button" onClick={downloadFile} disabled={!file}>
            <ArrowDownToLine /> <span>Download file</span>
          </Button>
        </div>
      </div>
      <div className="editor-canvas">
        {file ? (
          <div className="code-scroll-area">
            <div className="line-gutter" aria-hidden="true">
              <div className="line-number-stack" style={{ transform: `translateY(-${cursor.scrollTop}px)` }}>
                {lineNumbers.map((line) => (
                  <span key={line} className={`line-number ${line === cursor.line ? "line-number-active" : ""}`}>
                    {String(line).padStart(2, "0")}
                  </span>
                ))}
              </div>
            </div>
            <textarea
              className="editor-textarea"
              value={file.content}
              onChange={(event) => {
                dispatch({ type: "edit", content: event.target.value });
                updateCursor(event.target);
              }}
              onClick={(event) => updateCursor(event.currentTarget)}
              onKeyUp={(event) => updateCursor(event.currentTarget)}
              onScroll={(event) => {
                setCursor((previous) => ({ ...previous, scrollTop: event.currentTarget.scrollTop }));
              }}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
                  event.preventDefault();
                  dispatch({ type: event.shiftKey ? "redo" : "undo" });
                  return;
                }
                if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
                  event.preventDefault();
                  dispatch({ type: "redo" });
                  return;
                }
                if (event.key === "Tab") {
                  event.preventDefault();
                  const element = event.currentTarget;
                  const start = element.selectionStart;
                  const end = element.selectionEnd;
                  const updated = `${element.value.slice(0, start)}  ${element.value.slice(end)}`;
                  dispatch({ type: "edit", content: updated });
                  requestAnimationFrame(() => {
                    element.setSelectionRange(start + 2, start + 2);
                    updateCursor(element);
                  });
                }
              }}
              aria-label={`Edit ${file.name}`}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              wrap="off"
            />
          </div>
        ) : (
          <div className="no-file-state">
            <div className="no-file-icon"><FileText /></div>
            <p>Your workspace is clear.</p>
            <span>Create a file to start writing.</span>
          </div>
        )}
      </div>
      <div className="editor-bottomline">
        <span>{file ? `Ln ${cursor.line}, Col ${cursor.column}` : "No cursor"}</span>
        <span className="bottomline-divider">·</span>
        <span>{file?.name ?? "Workspace"}</span>
        <span className="bottomline-spacer" />
        <span>UTF-8</span>
        <span className="bottomline-divider">·</span>
        <span>{fileLanguage}</span>
      </div>
    </section>
  );
}

function StatusBar({ file, isOffline, onClear }: { file: EditorFile | undefined; isOffline: boolean; onClear: () => void }) {
  return (
    <footer className="statusbar">
      <div className="status-left">
        <span className="status-room"><span className="status-dot" /> {isOffline ? "Saved locally offline" : "Synced"}</span>
        <span className="status-separator">|</span>
        <span className="status-file">{file?.name ?? "No active file"}</span>
      </div>
      <Button variant="ghost" size="sm" className="clear-cache-button" onClick={onClear}>
        <RotateCcw /> <span>Clear local cache</span>
      </Button>
    </footer>
  );
}

export function EditorWorkspace() {
  const { state, dispatch, canUndo, canRedo, clearLocalCache } = useEditorState();
  const [roomId, setRoomId] = useState("juniper-lab");
  const [isOffline, setIsOffline] = useState(false);
  const activeFile = state.files.find((file) => file.id === state.activeFileId);

  return (
    <main className="syncforge-app">
      <TopBar roomId={roomId} setRoomId={setRoomId} isOffline={isOffline} toggleOffline={() => setIsOffline((current) => !current)} />
      <div className="workspace-body">
        <FileExplorer state={state} dispatch={dispatch} />
        <EditorPane file={activeFile} dispatch={dispatch} canUndo={canUndo} canRedo={canRedo} />
      </div>
      <StatusBar file={activeFile} isOffline={isOffline} onClear={clearLocalCache} />
    </main>
  );
}
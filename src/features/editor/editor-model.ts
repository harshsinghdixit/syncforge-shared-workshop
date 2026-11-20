export type EditorFile = {
  id: string;
  name: string;
  content: string;
};

export type EditorSnapshot = {
  files: EditorFile[];
  activeFileId: string | null;
};

export type EditorState = EditorSnapshot & {
  past: EditorSnapshot[];
  future: EditorSnapshot[];
};

export type EditorAction =
  | { type: "edit"; content: string }
  | { type: "select"; id: string }
  | { type: "create"; file: EditorFile }
  | { type: "rename"; id: string; name: string }
  | { type: "delete"; id: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "restore"; snapshot: EditorSnapshot }
  | { type: "clear" };

const starterFiles: EditorFile[] = [
  {
    id: "main-js",
    name: "main.js",
    content: `import { greet } from "./utils.js";\n\nconst room = "syncforge";\n\nfunction startSession() {\n  const message = greet("world");\n  console.log(\`${"${message}"} — connected to ${"${room}"}\`);\n}\n\nstartSession();\n`,
  },
  {
    id: "utils-py",
    name: "utils.py",
    content: `from datetime import datetime\n\ndef greet(name: str) -> str:\n    """Return a friendly message with the current time."""\n    current_time = datetime.now().strftime("%H:%M")\n    return f"Hello, {name}! It is {current_time}."\n\n\nif __name__ == "__main__":\n    print(greet("world"))\n`,
  },
  {
    id: "readme-md",
    name: "README.md",
    content: `# SyncForge\n\nA little room for great ideas.\n\n## Getting started\n\n1. Open a file from the explorer.\n2. Make a change and invite your team.\n3. Build something together.\n\n> Good code is a team sport.\n`,
  },
];

export const initialEditorState: EditorState = {
  files: starterFiles,
  activeFileId: starterFiles[0]?.id ?? null,
  past: [],
  future: [],
};

export const editorCacheKey = "syncforge.editor.cache.v1";

function snapshot(state: EditorState): EditorSnapshot {
  return { files: state.files, activeFileId: state.activeFileId };
}

function withHistory(state: EditorState, next: EditorSnapshot): EditorState {
  return {
    ...next,
    past: [...state.past, snapshot(state)].slice(-100),
    future: [],
  };
}

export function createEditorFile(name: string, id = `file-${Date.now()}`): EditorFile {
  return { id, name: name.trim(), content: "" };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "edit": {
      const activeFile = state.files.find((file) => file.id === state.activeFileId);
      if (!activeFile || activeFile.content === action.content) return state;
      return withHistory(state, {
        ...snapshot(state),
        files: state.files.map((file) =>
          file.id === activeFile.id ? { ...file, content: action.content } : file,
        ),
      });
    }
    case "select":
      return state.files.some((file) => file.id === action.id)
        ? { ...state, activeFileId: action.id }
        : state;
    case "create":
      if (!action.file.name || state.files.some((file) => file.name === action.file.name)) return state;
      return withHistory(state, {
        files: [...state.files, action.file],
        activeFileId: action.file.id,
      });
    case "rename": {
      const name = action.name.trim();
      if (!name || state.files.some((file) => file.id !== action.id && file.name === name)) return state;
      return withHistory(state, {
        ...snapshot(state),
        files: state.files.map((file) => (file.id === action.id ? { ...file, name } : file)),
      });
    }
    case "delete": {
      const files = state.files.filter((file) => file.id !== action.id);
      if (files.length === state.files.length) return state;
      const activeFileId = state.activeFileId === action.id ? (files[0]?.id ?? null) : state.activeFileId;
      return withHistory(state, { files, activeFileId });
    }
    case "undo": {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        ...previous,
        past: state.past.slice(0, -1),
        future: [...state.future, snapshot(state)],
      };
    }
    case "redo": {
      const next = state.future.at(-1);
      if (!next) return state;
      return {
        ...next,
        past: [...state.past, snapshot(state)],
        future: state.future.slice(0, -1),
      };
    }
    case "restore":
      return { ...action.snapshot, past: [], future: [] };
    case "clear":
      return { ...initialEditorState, files: initialEditorState.files.map((file) => ({ ...file })) };
  }
}

export function snapshotFromUnknown(value: unknown): EditorSnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<EditorSnapshot>;
  if (!Array.isArray(candidate.files)) return null;
  const files = candidate.files.filter(
    (file): file is EditorFile =>
      typeof file === "object" &&
      file !== null &&
      typeof file.id === "string" &&
      typeof file.name === "string" &&
      typeof file.content === "string",
  );
  const activeFileId =
    typeof candidate.activeFileId === "string" && files.some((file) => file.id === candidate.activeFileId)
      ? candidate.activeFileId
      : (files[0]?.id ?? null);
  return { files, activeFileId };
}
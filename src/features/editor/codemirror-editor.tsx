import { useEffect, useRef } from "react";
import { basicSetup, EditorView } from "codemirror";
import { EditorState, type Extension } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { markdown } from "@codemirror/lang-markdown";
import { yCollab } from "y-codemirror.next";
import type * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";

interface CodeMirrorEditorProps {
  fileName: string;
  yText: Y.Text | null;
  wsProvider: WebsocketProvider | null;
  undoManager: Y.UndoManager | null;
  onCursorChange?: (line: number, column: number) => void;
}

function getLanguageExtension(fileName: string): Extension[] {
  const lower = fileName.toLowerCase();
  if (
    lower.endsWith(".js") ||
    lower.endsWith(".jsx") ||
    lower.endsWith(".ts") ||
    lower.endsWith(".tsx") ||
    lower.endsWith(".mjs") ||
    lower.endsWith(".cjs")
  ) {
    return [javascript({ jsx: true, typescript: true })];
  }
  if (lower.endsWith(".py")) {
    return [python()];
  }
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
    return [markdown()];
  }
  return [];
}

const customEditorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--color-editor-surface, #1e1e24)",
    color: "var(--color-editor-foreground, #abb2bf)",
    fontSize: "13px",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-code, Consolas, Monaco, 'Courier New', monospace)",
    lineHeight: "1.6",
    overflow: "auto",
  },
  ".cm-gutters": {
    backgroundColor: "var(--color-panel, #18181c) !important",
    color: "var(--color-editor-gutter, #5c6370) !important",
    borderRight: "1px solid var(--color-border, #2d3139) !important",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    color: "var(--color-brand, #38bdf8) !important",
  },
  ".cm-ySelection": {
    opacity: "0.85 !important",
    borderRadius: "2px",
  },
  ".cm-ySelectionCaret": {
    position: "relative !important",
    borderLeft: "2.5px solid !important",
    marginRight: "-1px",
    display: "inline-block",
    filter: "drop-shadow(0 0 5px currentColor)",
    zIndex: "40",
  },
  ".cm-ySelectionInfo": {
    position: "absolute !important",
    top: "-1.55em !important",
    left: "-2px !important",
    fontSize: "10px !important",
    fontFamily: "var(--font-code)",
    fontWeight: "700 !important",
    color: "#ffffff !important",
    padding: "1px 6px !important",
    borderRadius: "4px !important",
    zIndex: "50 !important",
    whiteSpace: "nowrap !important",
    pointerEvents: "none !important",
    opacity: "1 !important",
    visibility: "visible !important",
    display: "inline-flex !important",
    lineHeight: "1.3 !important",
    boxShadow: "0 2px 6px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.2)",
    textShadow: "0 1px 2px rgba(0, 0, 0, 0.8)",
  },
});


export function CodeMirrorEditor({
  fileName,
  yText,
  wsProvider,
  undoManager,
  onCursorChange,
}: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current || !yText || !wsProvider) return;

    const extensions: Extension[] = [
      basicSetup,
      oneDark,
      customEditorTheme,
      ...getLanguageExtension(fileName),
      EditorView.lineWrapping,
    ];

    // Connect yCollab with yText, awareness, and UndoManager
    if (undoManager) {
      extensions.push(
        yCollab(yText, wsProvider.awareness, {
          undoManager,
        })
      );
    } else {
      extensions.push(
        yCollab(yText, wsProvider.awareness)
      );
    }

    // Cursor position listener
    if (onCursorChange) {
      extensions.push(
        EditorView.updateListener.of((update) => {
          if (update.selectionSet || update.docChanged) {
            const head = update.state.selection.main.head;
            const line = update.state.doc.lineAt(head);
            const col = head - line.from + 1;
            onCursorChange(line.number, col);
          }
        })
      );
    }

    const state = EditorState.create({
      doc: yText.toString(),
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    editorViewRef.current = view;

    // Report initial cursor position
    if (onCursorChange) {
      onCursorChange(1, 1);
    }

    return () => {
      view.destroy();
      editorViewRef.current = null;
    };
  }, [fileName, yText, wsProvider, undoManager, onCursorChange]);

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
}

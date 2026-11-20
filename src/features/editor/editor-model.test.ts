import { describe, expect, it } from "vitest";

import { createEditorFile, editorReducer, initialEditorState } from "./editor-model";

describe("editor workspace state", () => {
  it("starts with the requested three files", () => {
    expect(initialEditorState.files.map((file) => file.name)).toEqual([
      "main.js",
      "utils.py",
      "README.md",
    ]);
  });

  it("creates, renames, and deletes files while keeping a valid active selection", () => {
    const created = editorReducer(initialEditorState, {
      type: "create",
      file: createEditorFile("notes.md", "notes"),
    });
    expect(created.activeFileId).toBe("notes");

    const renamed = editorReducer(created, { type: "rename", id: "notes", name: "ideas.md" });
    expect(renamed.files.find((file) => file.id === "notes")?.name).toBe("ideas.md");

    const deleted = editorReducer(renamed, { type: "delete", id: "notes" });
    expect(deleted.files.some((file) => file.id === "notes")).toBe(false);
    expect(deleted.activeFileId).toBe("main-js");
  });

  it("rejects duplicate file names", () => {
    const next = editorReducer(initialEditorState, {
      type: "create",
      file: createEditorFile("main.js", "duplicate"),
    });
    expect(next.files).toHaveLength(3);
  });

  it("restores edited content through undo and redo", () => {
    const edited = editorReducer(initialEditorState, { type: "edit", content: "console.log('hi')" });
    expect(edited.files[0]?.content).toBe("console.log('hi')");

    const undone = editorReducer(edited, { type: "undo" });
    expect(undone.files[0]?.content).toBe(initialEditorState.files[0]?.content);

    const redone = editorReducer(undone, { type: "redo" });
    expect(redone.files[0]?.content).toBe("console.log('hi')");
  });
});
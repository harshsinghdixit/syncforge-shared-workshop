# SyncForge collaborative editor

Build a polished dark browser editor at `/` with the requested room controls, file explorer, editor toolbar, editor pane, and status bar.

## Implementation
- Replace the starter page with a responsive SyncForge workspace and app-specific page metadata.
- Keep editor state and file operations in a dedicated hook/module; keep navigation, file list, editor, and status controls in focused UI pieces.
- Seed `main.js`, `utils.py`, and `README.md` in browser state. Support file create, rename, delete, switching, undo/redo, downloads, editable room IDs, copying invite links, simulated offline status, and cache clearing.
- Use semantic design tokens in `src/styles.css` for the dark IDE palette, status colors, and typography. Keep everything client-local; do not add network sync or persistence beyond the requested local cache behavior.
- Record the modular state/UI boundary in `AGENTS.md`.

## Verification
- Add focused tests for file operations and local editing state.
- Run the relevant tests, inspect the preview in desktop and mobile sizes, and check the latest build log.

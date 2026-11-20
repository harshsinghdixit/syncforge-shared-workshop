# Syncforge Shared Workshop

Build a dark-mode browser-based multiplayer code editor UI using React, Vite, TypeScript, and Tailwind CSS. Include:

A top navbar with the app logo ("SyncForge"), an editable Room ID input with a "Copy Invite Link" button, an Online/Offline connection status badge (green/red) plus a manual "Simulate Offline" toggle button for testing, and coloured avatar pills showing active users in the room.

A left sidebar (file explorer) where users can create new files, rename files, delete files, and switch between files (pre-populated with main.js, utils.py, and README.md).

A main central code editor pane with line numbers, dark IDE theme, and a small toolbar above it containing Undo, Redo, and Download File buttons.

A small bottom status bar showing cursor position, active file name, sync status ("Synced" / "Saved locally offline"), and a "Clear Local Cache" button. Keep the code modular with clean separation between UI components and editor state so we can plug in Yjs CRDT syncing next.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/bb064e94-9e38-43fb-8629-db226ef8bab2).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

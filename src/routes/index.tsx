import { createFileRoute } from "@tanstack/react-router";

import { EditorWorkspace } from "@/features/editor/editor-workspace";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SyncForge — Collaborative Code Editor" },
      {
        name: "description",
        content: "A focused shared coding room with a local-first editor and file workspace.",
      },
      { property: "og:title", content: "SyncForge — Collaborative Code Editor" },
      {
        property: "og:description",
        content: "A focused shared coding room with a local-first editor and file workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return <EditorWorkspace />;
}

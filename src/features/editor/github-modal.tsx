import { useState } from "react";
import { Github, Download, Upload, AlertCircle, CheckCircle2, Loader2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface GitHubModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportFiles: (files: { name: string; content: string }[]) => number;
  getAllFiles: () => { name: string; content: string }[];
}

export function GitHubModal({
  open,
  onOpenChange,
  onImportFiles,
  getAllFiles,
}: GitHubModalProps) {
  const [repo, setRepo] = useState(() => window.sessionStorage.getItem("syncforge_github_repo") || "");
  const [branch, setBranch] = useState(() => window.sessionStorage.getItem("syncforge_github_branch") || "main");
  const [token, setToken] = useState(() => window.sessionStorage.getItem("syncforge_github_token") || "");
  const [commitMessage, setCommitMessage] = useState("Update from Same Code");
  const [loadingAction, setLoadingAction] = useState<"pull" | "push" | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const saveSettings = (newRepo: string, newBranch: string, newToken: string) => {
    window.sessionStorage.setItem("syncforge_github_repo", newRepo);
    window.sessionStorage.setItem("syncforge_github_branch", newBranch);
    window.sessionStorage.setItem("syncforge_github_token", newToken);
  };

  const handlePull = async () => {
    setStatusMessage(null);
    const trimmedRepo = repo.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
    const trimmedBranch = branch.trim() || "main";
    const trimmedToken = token.trim();

    if (!trimmedRepo || !trimmedRepo.includes("/")) {
      setStatusMessage({ type: "error", text: "Please enter a valid repository in owner/repo format." });
      return;
    }

    saveSettings(trimmedRepo, trimmedBranch, trimmedToken);
    setLoadingAction("pull");

    try {
      const headers: Record<string, string> = {
        Accept: "application/vnd.github.v3+json",
      };
      if (trimmedToken) {
        headers["Authorization"] = `Bearer ${trimmedToken}`;
      }

      // Fetch git tree
      const treeRes = await fetch(
        `https://api.github.com/repos/${trimmedRepo}/git/trees/${trimmedBranch}?recursive=1`,
        { headers }
      );

      if (!treeRes.ok) {
        const errorData = await treeRes.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to fetch repo tree (Status ${treeRes.status})`);
      }

      const treeData = await treeRes.json();
      if (!Array.isArray(treeData.tree)) {
        throw new Error("Repository tree is empty or invalid.");
      }

      // Filter blobs, excluding media and node_modules
      const filesToFetch = treeData.tree.filter((item: any) => {
        if (item.type !== "blob") return false;
        const p = item.path.toLowerCase();
        if (p.startsWith(".git/") || p.includes("node_modules/")) return false;
        // Skip common binary extensions
        const binaryExts = [".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf", ".zip", ".tar", ".gz", ".exe", ".woff", ".woff2"];
        return !binaryExts.some((ext) => p.endsWith(ext));
      }).slice(0, 50); // limit to first 50 files for responsiveness

      if (filesToFetch.length === 0) {
        throw new Error("No suitable code/text files found in this repository branch.");
      }

      const imported: { name: string; content: string }[] = [];

      for (const item of filesToFetch) {
        const fileRes = await fetch(
          `https://api.github.com/repos/${trimmedRepo}/contents/${encodeURIComponent(item.path)}?ref=${trimmedBranch}`,
          { headers }
        );
        if (fileRes.ok) {
          const fileData = await fileRes.json();
          if (fileData.content) {
            try {
              const decoded = decodeURIComponent(
                escape(atob(fileData.content.replace(/\n/g, "")))
              );
              imported.push({ name: item.path, content: decoded });
            } catch {
              // fallback raw base64 decode
              imported.push({ name: item.path, content: atob(fileData.content.replace(/\n/g, "")) });
            }
          }
        }
      }

      if (imported.length > 0) {
        const count = onImportFiles(imported);
        setStatusMessage({
          type: "success",
          text: `Successfully imported ${count} files from ${trimmedRepo} (${trimmedBranch})!`,
        });
      } else {
        throw new Error("Could not download file contents. Check permissions or branch name.");
      }
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "An error occurred while pulling." });
    } finally {
      setLoadingAction(null);
    }
  };

  const handlePush = async () => {
    setStatusMessage(null);
    const trimmedRepo = repo.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
    const trimmedBranch = branch.trim() || "main";
    const trimmedToken = token.trim();

    if (!trimmedRepo || !trimmedRepo.includes("/")) {
      setStatusMessage({ type: "error", text: "Please enter a valid repository in owner/repo format." });
      return;
    }
    if (!trimmedToken) {
      setStatusMessage({ type: "error", text: "A GitHub Personal Access Token is required to push changes." });
      return;
    }

    saveSettings(trimmedRepo, trimmedBranch, trimmedToken);
    setLoadingAction("push");

    try {
      const files = getAllFiles();
      if (files.length === 0) {
        throw new Error("No files in workspace to push.");
      }

      const headers = {
        Authorization: `Bearer ${trimmedToken}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      };

      let pushedCount = 0;

      for (const file of files) {
        // Fetch existing file sha if it exists
        let sha: string | undefined;
        try {
          const getRes = await fetch(
            `https://api.github.com/repos/${trimmedRepo}/contents/${encodeURIComponent(file.name)}?ref=${trimmedBranch}`,
            {
              headers: {
                Authorization: `Bearer ${trimmedToken}`,
                Accept: "application/vnd.github.v3+json",
              },
            }
          );
          if (getRes.ok) {
            const getData = await getRes.json();
            sha = getData.sha;
          }
        } catch {
          // New file
        }

        // Base64 encode file content
        const encoded = btoa(unescape(encodeURIComponent(file.content)));

        const putRes = await fetch(
          `https://api.github.com/repos/${trimmedRepo}/contents/${encodeURIComponent(file.name)}`,
          {
            method: "PUT",
            headers,
            body: JSON.stringify({
              message: commitMessage.trim() || "Update from Same Code",
              content: encoded,
              branch: trimmedBranch,
              ...(sha ? { sha } : {}),
            }),
          }
        );

        if (!putRes.ok) {
          const err = await putRes.json().catch(() => ({}));
          throw new Error(err.message || `Failed to commit ${file.name} (Status ${putRes.status})`);
        }
        pushedCount++;
      }

      setStatusMessage({
        type: "success",
        text: `Successfully pushed ${pushedCount} file(s) to ${trimmedRepo} on branch ${trimmedBranch}!`,
      });
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "An error occurred while pushing." });
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border text-foreground">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <Github className="size-5" />
            <DialogTitle>GitHub Synchronization</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Pull repository files into your shared CRDT workspace or commit changes back to GitHub.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Repository (<span className="font-mono">owner/repo</span>)
            </label>
            <Input
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="e.g. facebook/react or octocat/Hello-World"
              className="bg-background/50 text-xs font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Branch</label>
              <Input
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="main"
                className="bg-background/50 text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <KeyRound className="size-3" />
                <span>Personal Access Token</span>
              </label>
              <Input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxx"
                className="bg-background/50 text-xs font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Commit Message (for Push)</label>
            <Input
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Update from Same Code"
              className="bg-background/50 text-xs"
            />
          </div>

          {statusMessage && (
            <div
              className={`flex items-start gap-2 p-3 rounded-md text-xs ${
                statusMessage.type === "success"
                  ? "bg-emerald-950/40 text-emerald-300 border border-emerald-800/50"
                  : "bg-destructive/15 text-destructive border border-destructive/30"
              }`}
            >
              {statusMessage.type === "success" ? (
                <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-2"
              onClick={handlePull}
              disabled={loadingAction !== null}
            >
              {loadingAction === "pull" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              <span>Pull Repo</span>
            </Button>
            <Button
              size="sm"
              className="flex-1 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handlePush}
              disabled={loadingAction !== null}
            >
              {loadingAction === "push" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              <span>Push Changes</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

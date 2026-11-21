import { useState, useEffect } from "react";
import {
  Github,
  Download,
  Upload,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ExternalLink,
  LogOut,
  ChevronDown,
  FolderGit2,
} from "lucide-react";
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

interface GitHubUser {
  login: string;
  avatar_url?: string;
  name?: string;
}

interface GitHubRepoItem {
  name: string;
  full_name: string;
  default_branch: string;
  private: boolean;
}

export function GitHubModal({
  open,
  onOpenChange,
  onImportFiles,
  getAllFiles,
}: GitHubModalProps) {
  // Saved repo & branch in sessionStorage
  const [repo, setRepo] = useState(() => {
    if (typeof window !== "undefined") {
      return window.sessionStorage.getItem("syncforge_github_repo") || "";
    }
    return "";
  });
  const [branch, setBranch] = useState(() => {
    if (typeof window !== "undefined") {
      return window.sessionStorage.getItem("syncforge_github_branch") || "main";
    }
    return "main";
  });

  // Persistent GitHub token in localStorage
  const [token, setToken] = useState(() => {
    if (typeof window !== "undefined") {
      return (
        window.localStorage.getItem("samecode_gh_token") ||
        window.sessionStorage.getItem("syncforge_github_token") ||
        ""
      );
    }
    return "";
  });

  // Temporary token draft for the connect input
  const [tokenDraft, setTokenDraft] = useState("");
  const [isConnectingToken, setIsConnectingToken] = useState(false);

  // Authenticated GitHub user & repositories list
  const [ghUser, setGhUser] = useState<GitHubUser | null>(null);
  const [userRepos, setUserRepos] = useState<GitHubRepoItem[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);

  const [commitMessage, setCommitMessage] = useState("Update from Same Code");
  const [loadingAction, setLoadingAction] = useState<"pull" | "push" | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Helper to persist credentials and room parameters
  const saveSettings = (newRepo: string, newBranch: string) => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem("syncforge_github_repo", newRepo);
    window.sessionStorage.setItem("syncforge_github_branch", newBranch);
  };

  // Validate token against GET https://api.github.com/user and fetch repos
  const validateAndLoadUser = async (pat: string) => {
    if (!pat.trim()) {
      setGhUser(null);
      setUserRepos([]);
      return;
    }

    try {
      const res = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${pat.trim()}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (!res.ok) {
        throw new Error("Invalid or expired GitHub token.");
      }

      const userData: GitHubUser = await res.json();
      setGhUser(userData);

      // Fetch user's recent repositories
      setIsLoadingRepos(true);
      const reposRes = await fetch("https://api.github.com/user/repos?sort=updated&per_page=20", {
        headers: {
          Authorization: `Bearer ${pat.trim()}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (reposRes.ok) {
        const reposData = await reposRes.json();
        if (Array.isArray(reposData)) {
          setUserRepos(
            reposData.map((r: any) => ({
              name: r.name,
              full_name: r.full_name,
              default_branch: r.default_branch || "main",
              private: Boolean(r.private),
            }))
          );
        }
      }
    } catch (err: any) {
      setGhUser(null);
      setUserRepos([]);
      setStatusMessage({ type: "error", text: err.message || "Could not authenticate with GitHub." });
    } finally {
      setIsLoadingRepos(false);
    }
  };

  // Validate stored token when modal opens or token changes
  useEffect(() => {
    if (open && token) {
      validateAndLoadUser(token);
    }
  }, [open, token]);

  const handleConnectToken = async () => {
    setStatusMessage(null);
    const trimmed = tokenDraft.trim();
    if (!trimmed) {
      setStatusMessage({ type: "error", text: "Please enter a GitHub Personal Access Token." });
      return;
    }

    setIsConnectingToken(true);
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${trimmed}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Invalid or expired GitHub token.");
      }

      const userData: GitHubUser = await res.json();
      setGhUser(userData);
      setToken(trimmed);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("samecode_gh_token", trimmed);
        window.sessionStorage.setItem("syncforge_github_token", trimmed);
      }
      setTokenDraft("");
      setStatusMessage({
        type: "success",
        text: `Connected as @${userData.login}! Token saved.`,
      });

      // Load recent repos
      validateAndLoadUser(trimmed);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Failed to connect token." });
    } finally {
      setIsConnectingToken(false);
    }
  };

  const handleDisconnect = () => {
    setToken("");
    setGhUser(null);
    setUserRepos([]);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("samecode_gh_token");
      window.sessionStorage.removeItem("syncforge_github_token");
    }
    setStatusMessage({ type: "success", text: "Disconnected from GitHub." });
  };

  const handleSelectRepo = (selectedFullName: string) => {
    if (!selectedFullName) return;
    const found = userRepos.find((r) => r.full_name === selectedFullName);
    setRepo(selectedFullName);
    if (found && found.default_branch) {
      setBranch(found.default_branch);
    }
    saveSettings(selectedFullName, found?.default_branch || branch);
  };

  // Zero-Auth Public Pull: Only attach Authorization header if token exists
  const handlePull = async () => {
    setStatusMessage(null);
    const trimmedRepo = repo.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
    const trimmedBranch = branch.trim() || "main";
    const trimmedToken = token.trim();

    if (!trimmedRepo || !trimmedRepo.includes("/")) {
      setStatusMessage({ type: "error", text: "Please enter a valid repository in owner/repo format." });
      return;
    }

    saveSettings(trimmedRepo, trimmedBranch);
    setLoadingAction("pull");

    try {
      const headers: Record<string, string> = {
        Accept: "application/vnd.github.v3+json",
      };
      // Zero-Auth Public Pull: only send Authorization if token is provided
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
        ];
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
      setStatusMessage({
        type: "error",
        text: "A connected GitHub Personal Access Token with repo scope is required to push changes.",
      });
      return;
    }

    saveSettings(trimmedRepo, trimmedBranch);
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
      <DialogContent className="sm:max-w-lg bg-card border-border text-foreground">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <Github className="size-5" />
            <DialogTitle>GitHub Synchronization</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Pull repository files into your shared CRDT workspace or commit changes back to GitHub.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* 1-Click Connect & Account Status */}
          {token && ghUser ? (
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-xs">
              <div className="flex items-center gap-2">
                {ghUser.avatar_url ? (
                  <img
                    src={ghUser.avatar_url}
                    alt={ghUser.login}
                    className="size-6 rounded-full border border-emerald-500/50"
                  />
                ) : (
                  <div className="size-6 rounded-full bg-emerald-700 flex items-center justify-center font-bold text-white text-[10px]">
                    {ghUser.login.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
                    <span>@{ghUser.login}</span>
                    <span className="text-[10px] font-normal px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 rounded-full border border-emerald-500/30">
                      Connected
                    </span>
                  </div>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleDisconnect}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-1 cursor-pointer"
                title="Disconnect GitHub token"
              >
                <LogOut className="size-3" />
                <span>Disconnect</span>
              </Button>
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-muted/40 border border-border/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Github className="size-3.5 text-primary" />
                  <span>Connect GitHub (1-Click)</span>
                </span>
                <a
                  href="https://github.com/settings/tokens/new?description=Same%20Code&scopes=repo"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                >
                  <span>Generate Pre-Filled Token</span>
                  <ExternalLink className="size-2.5" />
                </a>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Public repositories can be pulled without authentication. Connect your token once to access private repos and push commits.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  value={tokenDraft}
                  onChange={(e) => setTokenDraft(e.target.value)}
                  placeholder="Paste ghp_... token"
                  className="bg-background text-xs font-mono h-8"
                  spellCheck={false}
                />
                <Button
                  size="sm"
                  onClick={handleConnectToken}
                  disabled={isConnectingToken || !tokenDraft.trim()}
                  className="h-8 px-3 text-xs bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shrink-0"
                >
                  {isConnectingToken ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <span>Connect</span>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Quick Repo Selector (When Connected) */}
          {token && userRepos.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <FolderGit2 className="size-3" />
                  <span>Your Recent Repositories</span>
                </label>
                {isLoadingRepos && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                    <Loader2 className="size-2.5 animate-spin" /> Loading...
                  </span>
                )}
              </div>
              <div className="relative">
                <select
                  className="w-full h-8 px-2.5 py-1 text-xs rounded-md bg-background border border-input text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary appearance-none cursor-pointer pr-8 font-mono"
                  value={userRepos.some((r) => r.full_name === repo) ? repo : ""}
                  onChange={(e) => handleSelectRepo(e.target.value)}
                >
                  <option value="">-- Choose from your repositories --</option>
                  {userRepos.map((r) => (
                    <option key={r.full_name} value={r.full_name}>
                      {r.full_name} {r.private ? "🔒" : ""} ({r.default_branch})
                    </option>
                  ))}
                </select>
                <ChevronDown className="size-3.5 absolute right-2.5 top-2.5 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          )}

          {/* Repository & Branch Input */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Repository (<span className="font-mono">owner/repo</span>)
              </label>
              <Input
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="e.g. facebook/react or octocat/Hello-World"
                className="bg-background text-xs font-mono h-8"
                spellCheck={false}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Branch</label>
              <Input
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="main"
                className="bg-background text-xs font-mono h-8"
                spellCheck={false}
              />
            </div>
          </div>

          {/* Commit Message */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Commit Message (for Push)</label>
            <Input
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Update from Same Code"
              className="bg-background text-xs h-8"
            />
          </div>

          {/* Inline Feedback Banner */}
          {statusMessage && (
            <div
              className={`flex items-start gap-2 p-2.5 rounded-md text-xs transition-all ${
                statusMessage.type === "success"
                  ? "bg-emerald-950/40 text-emerald-300 border border-emerald-800/50"
                  : "bg-destructive/15 text-destructive border border-destructive/30"
              }`}
            >
              {statusMessage.type === "success" ? (
                <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-emerald-400" />
              ) : (
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed">{statusMessage.text}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-2 cursor-pointer h-9 text-xs"
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
              className="flex-1 gap-2 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer h-9 text-xs"
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

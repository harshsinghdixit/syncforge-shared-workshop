import { useState } from "react";
import {
  Layers3,
  Sparkles,
  Users,
  LogIn,
  Dice5,
  ShieldCheck,
  Zap,
  FolderGit2,
  ArrowRight,
  Crown,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getOrCreateLocalUser,
  persistLocalUser,
  USER_COLORS,
  type RemoteUser,
} from "./use-yjs-collaboration";

interface LobbyScreenProps {
  onEnterRoom: (roomId: string, isCreator: boolean) => void;
}

export function LobbyScreen({ onEnterRoom }: LobbyScreenProps) {
  const [localUser, setLocalUser] = useState<RemoteUser>(getOrCreateLocalUser);
  const [userName, setUserName] = useState(localUser.name);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");

  const handleUpdateName = (newName: string) => {
    setUserName(newName);
    const updated = { ...localUser, name: newName.trim() || localUser.name };
    setLocalUser(updated);
    persistLocalUser(updated);
  };

  const handleSelectColor = (colorHex: string, colorLightHex: string) => {
    const updated = {
      ...localUser,
      name: userName.trim() || localUser.name,
      color: colorHex,
      colorLight: colorLightHex,
    };
    setLocalUser(updated);
    persistLocalUser(updated);
  };

  const handleRandomizeName = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("syncforge_user_name");
      window.sessionStorage.removeItem("syncforge_user_name");
    }
    const newUser = getOrCreateLocalUser();
    setLocalUser(newUser);
    setUserName(newUser.name);
  };

  const handleCreateServer = () => {
    const code = `SYNC-${Math.floor(1000 + Math.random() * 9000)}`;
    const finalName = userName.trim() || localUser.name;
    const updatedUser = { ...localUser, name: finalName };
    setLocalUser(updatedUser);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("syncforge_user_name", finalName);
      sessionStorage.setItem(`syncforge_creator_${code}`, "true");
      sessionStorage.setItem(`syncforge_host_room_${code}`, updatedUser.id);
      const url = new URL(window.location.href);
      url.searchParams.set("room", code);
      window.history.pushState(null, "", url.toString());
    }
    onEnterRoom(code, true);
  };

  const handleJoinServer = (e: React.FormEvent) => {
    e.preventDefault();
    let cleanCode = joinCode.trim().toUpperCase();
    if (!cleanCode) {
      setJoinError("Please enter a room code (e.g. 1633 or SYNC-1633)");
      return;
    }
    if (/^\d+$/.test(cleanCode)) {
      cleanCode = `SYNC-${cleanCode}`;
    }
    const finalName = userName.trim() || localUser.name;
    const updatedUser = { ...localUser, name: finalName };
    setLocalUser(updatedUser);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("syncforge_user_name", finalName);
      const url = new URL(window.location.href);
      url.searchParams.set("room", cleanCode);
      window.history.pushState(null, "", url.toString());
    }
    onEnterRoom(cleanCode, false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 relative overflow-x-hidden overflow-y-auto select-none">
      {/* Background glowing ambient effects */}
      <div className="absolute -top-40 -left-40 size-96 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 size-96 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(56,189,248,0.10),rgba(255,255,255,0))] pointer-events-none" />

      <main className="w-full max-w-3xl flex flex-col items-center z-10 space-y-6 sm:space-y-8 animate-in fade-in duration-500 py-6 sm:py-8">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shadow-lg shadow-primary/10">
              <Layers3 className="size-6" strokeWidth={2.4} />
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
              SyncForge
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 tracking-wider">
                MULTIPLAYER IDE
              </span>
            </h1>
          </div>
          <p className="text-sm sm:text-base text-muted-foreground max-w-lg font-normal leading-relaxed">
            Realtime collaborative code arena powered by Yjs CRDTs. Launch a new server or join an active room.
          </p>
        </div>

        {/* Player Profile Setup Pill Card */}
        <div className="w-full max-w-md bg-card/85 backdrop-blur-md border border-border rounded-2xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ backgroundColor: localUser.color }} />
              Player Identity
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRandomizeName}
              className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1.5 px-2"
              title="Randomize display name"
            >
              <Dice5 className="size-3.5" />
              <span>Randomize</span>
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <div
              className="size-11 rounded-xl flex items-center justify-center font-bold text-white text-sm shadow-md shrink-0 border border-white/20 transition-colors duration-200"
              style={{ backgroundColor: localUser.color }}
            >
              {localUser.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 space-y-1">
              <label htmlFor="player-name" className="sr-only">Display Name</label>
              <Input
                id="player-name"
                value={userName}
                onChange={(e) => handleUpdateName(e.target.value)}
                placeholder="Enter your display name..."
                className="bg-background/70 border-input h-10 font-medium text-foreground"
                maxLength={25}
              />
            </div>
          </div>

          {/* Among Us Color Palette Row */}
          <div className="pt-1.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Suit Color
              </span>
              <span className="text-[10px] font-medium text-muted-foreground">
                {USER_COLORS.find((c) => c.color === localUser.color)?.name || "Custom"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-1 sm:gap-1.5 flex-wrap pt-0.5">
              {USER_COLORS.map((swatch) => {
                const isSelected = swatch.color === localUser.color;
                return (
                  <button
                    key={swatch.name}
                    type="button"
                    onClick={() => handleSelectColor(swatch.color, swatch.colorLight)}
                    className={`relative size-7 rounded-full transition-all duration-150 flex items-center justify-center shrink-0 shadow-sm ${
                      isSelected
                        ? "ring-2 ring-primary ring-offset-2 ring-offset-card scale-110 z-10"
                        : "hover:scale-105 opacity-85 hover:opacity-100"
                    }`}
                    style={{ backgroundColor: swatch.color }}
                    title={`Suit: ${swatch.name}`}
                  >
                    {isSelected && (
                      <Check className="size-3.5 text-white stroke-[3] drop-shadow-md" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Server Actions Grid */}
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
          {/* Create Server Card */}
          <div className="group relative bg-card/75 hover:bg-card/95 backdrop-blur-md border border-border hover:border-primary/50 rounded-2xl p-6 sm:p-7 shadow-xl transition-all duration-300 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="size-11 rounded-xl bg-primary/15 text-primary border border-primary/30 flex items-center justify-center shadow-inner">
                  <Sparkles className="size-5" />
                </div>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <Crown className="size-3" />
                  <span>HOST MODE</span>
                </span>
              </div>
              <div className="space-y-1.5">
                <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">
                  Create Server
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Generate a dedicated room code. You'll enter immediately as Host with full moderation and approval controls.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <Button
                size="lg"
                className="w-full gap-2 font-semibold shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 text-primary-foreground h-11"
                onClick={handleCreateServer}
              >
                <Sparkles className="size-4" />
                <span>Launch New Server</span>
                <ArrowRight className="size-4 ml-auto" />
              </Button>
            </div>
          </div>

          {/* Join Server Card */}
          <div className="bg-card/75 backdrop-blur-md border border-border rounded-2xl p-6 sm:p-7 shadow-xl flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="size-11 rounded-xl bg-secondary text-secondary-foreground border border-border flex items-center justify-center shadow-inner">
                  <Users className="size-5" />
                </div>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                  DIRECT ACCESS
                </span>
              </div>
              <div className="space-y-1.5">
                <h3 className="text-xl font-bold text-foreground">Join Server</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Enter a room code or 4-digit number to connect directly to the shared workspace.
                </p>
              </div>
            </div>

            <form onSubmit={handleJoinServer} className="space-y-3 pt-2">
              <div className="space-y-1">
                <Input
                  value={joinCode}
                  onChange={(e) => {
                    setJoinCode(e.target.value.toUpperCase());
                    setJoinError("");
                  }}
                  placeholder="e.g. 1633 or SYNC-1633"
                  className="font-mono text-center text-sm font-bold tracking-wider uppercase bg-background/70 border-input h-11"
                  maxLength={20}
                  aria-label="Room code"
                />
                {joinError && <p className="text-[11px] text-destructive font-medium">{joinError}</p>}
              </div>

              <Button
                type="submit"
                variant="secondary"
                size="lg"
                className="w-full gap-2 font-semibold border border-border hover:bg-secondary/80 h-11"
              >
                <LogIn className="size-4" />
                <span>Connect to Server</span>
                <ArrowRight className="size-4 ml-auto" />
              </Button>
            </form>
          </div>
        </div>

        {/* Feature Badges Footer */}
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 text-xs text-muted-foreground pt-3 border-t border-border/40 w-full">
          <div className="flex items-center gap-1.5 bg-muted/30 px-2.5 py-1 rounded-full border border-border/50">
            <Zap className="size-3.5 text-primary" />
            <span>Zero-latency CRDT Sync</span>
          </div>
          <div className="flex items-center gap-1.5 bg-muted/30 px-2.5 py-1 rounded-full border border-border/50">
            <Users className="size-3.5 text-primary" />
            <span>Multiplayer Cursors</span>
          </div>
          <div className="flex items-center gap-1.5 bg-muted/30 px-2.5 py-1 rounded-full border border-border/50">
            <FolderGit2 className="size-3.5 text-primary" />
            <span>Local & GitHub Import</span>
          </div>
          <div className="flex items-center gap-1.5 bg-muted/30 px-2.5 py-1 rounded-full border border-border/50">
            <ShieldCheck className="size-3.5 text-primary" />
            <span>Host Guard Approval</span>
          </div>
        </div>
      </main>
    </div>
  );
}

import { useState } from "react";
import { Clock, ShieldAlert, UserCheck, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface WaitingRoomModalProps {
  roomId: string;
  defaultName: string;
  hasRequested: boolean;
  onRequestJoin: (name: string) => void;
}

export function WaitingRoomModal({
  roomId,
  defaultName,
  hasRequested,
  onRequestJoin,
}: WaitingRoomModalProps) {
  const [name, setName] = useState(defaultName);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onRequestJoin(name.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-xl border border-border/80 bg-card p-6 shadow-2xl space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20">
            {hasRequested ? (
              <Loader2 className="size-6 animate-spin" />
            ) : (
              <ShieldAlert className="size-6" />
            )}
          </div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {hasRequested ? "Waiting for Host Approval" : "Request Room Access"}
          </h2>
          <p className="text-xs text-muted-foreground">
            Room: <span className="font-mono text-primary font-semibold">{roomId}</span>
          </p>
        </div>

        {hasRequested ? (
          <div className="flex flex-col items-center justify-center py-6 space-y-4 text-center">
            <div className="flex items-center gap-2 rounded-full border border-border bg-muted/40 px-4 py-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5 text-primary animate-pulse" />
              <span>Host has been notified of your request</span>
            </div>
            <p className="text-sm text-muted-foreground max-w-xs">
              Hang tight! Once the room host clicks <span className="text-foreground font-medium">Accept</span>, your collaborative IDE workspace will unlock automatically in real time.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="join-name" className="text-xs font-medium text-muted-foreground">
                Your Display Name
              </label>
              <Input
                id="join-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex Liu"
                autoFocus
                required
                className="bg-background/50 border-input"
              />
            </div>

            <Button type="submit" className="w-full gap-2 font-medium">
              <UserCheck className="size-4" />
              <span>Request to Join</span>
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

interface HostRequestNotificationProps {
  requests: Array<{ id: string; name: string; timestamp: number }>;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
}

export function HostRequestBanner({
  requests,
  onAccept,
  onDecline,
}: HostRequestNotificationProps) {
  if (requests.length === 0) return null;

  return (
    <div className="fixed top-16 right-6 z-50 flex flex-col gap-2 max-w-sm w-full animate-in slide-in-from-top duration-300">
      {requests.map((req) => (
        <div
          key={req.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-card/95 p-3.5 shadow-xl backdrop-blur-md"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-bold">
              {req.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-foreground">
                {req.name}
              </p>
              <p className="text-[10px] text-muted-foreground">wants to join this room</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="default"
              className="h-7 px-2.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => onAccept(req.id)}
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
              onClick={() => onDecline(req.id)}
            >
              Decline
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

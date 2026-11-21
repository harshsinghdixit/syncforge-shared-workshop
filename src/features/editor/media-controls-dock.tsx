import React from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Sparkles,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface MediaControlsDockProps {
  isMicOn: boolean;
  isCameraOn: boolean;
  isPushToTalkActive: boolean;
  cleanBg: boolean;
  isMutedByHost: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onSetPushToTalk: (active: boolean) => void;
  onToggleCleanBg: () => void;
}

export function MediaControlsDock({
  isMicOn,
  isCameraOn,
  isPushToTalkActive,
  cleanBg,
  isMutedByHost,
  onToggleMic,
  onToggleCamera,
  onSetPushToTalk,
  onToggleCleanBg,
}: MediaControlsDockProps) {
  return (
    <div className="fixed bottom-4 left-4 z-40 flex items-center gap-1.5 p-1.5 rounded-full bg-card/90 backdrop-blur-md border border-border shadow-2xl transition-all select-none">
      {/* Microphone Button */}
      <button
        type="button"
        disabled={isMutedByHost}
        onClick={onToggleMic}
        className={`relative size-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
          isMutedByHost
            ? "bg-destructive/15 text-destructive/50 border border-destructive/30 cursor-not-allowed"
            : isMicOn
            ? "bg-primary text-primary-foreground shadow-md hover:scale-105"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
        }`}
        title={
          isMutedByHost
            ? "Muted by Host"
            : isMicOn
            ? "Mute Microphone"
            : "Unmute Microphone"
        }
      >
        {isMicOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
        {isMutedByHost && (
          <span className="absolute -top-1 -right-1 size-2 rounded-full bg-destructive" />
        )}
      </button>

      {/* Push-to-Talk Button (Hold or press 'V') */}
      <button
        type="button"
        disabled={isMutedByHost}
        onPointerDown={() => onSetPushToTalk(true)}
        onPointerUp={() => onSetPushToTalk(false)}
        onPointerCancel={() => onSetPushToTalk(false)}
        className={`h-9 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer touch-none ${
          isMutedByHost
            ? "bg-muted text-muted-foreground/40 cursor-not-allowed"
            : isPushToTalkActive
            ? "bg-emerald-600 text-white shadow-lg scale-105"
            : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
        title="Hold to Talk (or hold 'V' key outside text inputs)"
      >
        <span
          className={`size-2 rounded-full ${
            isPushToTalkActive ? "bg-white animate-ping" : "bg-muted-foreground/60"
          }`}
        />
        <span>PTT [V]</span>
      </button>

      {/* Camera Button */}
      <button
        type="button"
        onClick={onToggleCamera}
        className={`size-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
          isCameraOn
            ? "bg-primary text-primary-foreground shadow-md hover:scale-105"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
        }`}
        title={isCameraOn ? "Turn Off Camera" : "Turn On Camera"}
      >
        {isCameraOn ? <Video className="size-4" /> : <VideoOff className="size-4" />}
      </button>

      <div className="h-4 w-px bg-border/80 mx-0.5" />

      {/* Clean Background Toggle (Local Only) */}
      <button
        type="button"
        onClick={onToggleCleanBg}
        className={`h-9 px-2.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
          cleanBg
            ? "bg-sky-500/20 text-sky-400 border border-sky-500/40 shadow-xs"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
        }`}
        title="Clean BG (Local): Toggles portrait framing and vignette mask locally without lag"
      >
        <Sparkles className="size-3.5" />
        <span className="hidden sm:inline">Clean BG</span>
      </button>

      {/* Host Muted Notification Pill */}
      {isMutedByHost && (
        <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-destructive/15 border border-destructive/30 text-destructive text-[10px] font-bold">
          <VolumeX className="size-3" />
          <span>Muted by Host</span>
        </div>
      )}
    </div>
  );
}

import React, { useState } from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Sparkles,
  VolumeX,
  SlidersHorizontal,
} from "lucide-react";
import { TestMediaPopover } from "./test-media-popover";

interface MediaControlsDockProps {
  isMicOn: boolean;
  isCameraOn: boolean;
  isPushToTalkActive: boolean;
  cleanBg: boolean;
  isMutedByHost: boolean;
  micLevel: number; // 0 - 100
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
  micLevel = 0,
  onToggleMic,
  onToggleCamera,
  onSetPushToTalk,
  onToggleCleanBg,
}: MediaControlsDockProps) {
  const [testPopoverOpen, setTestPopoverOpen] = useState(false);

  // Equalizer bar heights based on live micLevel (0-100)
  const barCount = 5;

  return (
    <>
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

        {/* 5-Bar Animated Voice Equalizer (Visible when mic is live) */}
        {isMicOn && !isMutedByHost && (
          <div
            className="flex items-center gap-0.5 px-1.5 h-6 bg-slate-900/80 rounded-md border border-border/60"
            title={`Mic Input: ${micLevel}%`}
          >
            {Array.from({ length: barCount }).map((_, i) => {
              const threshold = (i + 1) * 18;
              const isActive = micLevel >= threshold;
              const heightPercent = isActive
                ? Math.min(100, Math.max(30, (micLevel / 100) * 100))
                : 20;

              return (
                <div
                  key={i}
                  className="w-1 rounded-full transition-all duration-75"
                  style={{
                    height: `${heightPercent}%`,
                    backgroundColor: isActive
                      ? i >= 3
                        ? "#ef4444"
                        : "#22c55e"
                      : "#64748b66",
                  }}
                />
              );
            })}
          </div>
        )}

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

        {/* Test Mic & Cam Button */}
        <button
          type="button"
          onClick={() => setTestPopoverOpen((o) => !o)}
          className={`size-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
            testPopoverOpen
              ? "bg-secondary text-secondary-foreground shadow"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          }`}
          title="Test Mic & Cam: Open Audio/Video preview and diagnostics"
        >
          <SlidersHorizontal className="size-4" />
        </button>

        {/* Host Muted Notification Pill */}
        {isMutedByHost && (
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-destructive/15 border border-destructive/30 text-destructive text-[10px] font-bold">
            <VolumeX className="size-3" />
            <span>Muted by Host</span>
          </div>
        )}
      </div>

      {/* Floating Device Diagnostics Popover */}
      <TestMediaPopover
        open={testPopoverOpen}
        onClose={() => setTestPopoverOpen(false)}
        cleanBg={cleanBg}
        onToggleCleanBg={onToggleCleanBg}
      />
    </>
  );
}

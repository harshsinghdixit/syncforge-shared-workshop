import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

export interface EmojiReaction {
  id: string;
  emoji: string;
  senderName: string;
  senderColor: string;
  xPercent: number; // random offset 20% - 80%
  timestamp: number;
}

interface FloatingReactionsProps {
  reactions: EmojiReaction[];
  onSendReaction: (emoji: string) => void;
  disabled?: boolean;
}

const EMOJI_OPTIONS = ["🔥", "👏", "😂", "❤️", "🚀", "👀"];

export function FloatingReactions({
  reactions,
  onSendReaction,
  disabled = false,
}: FloatingReactionsProps) {
  return (
    <>
      {/* Floating Canvas / Overlays */}
      <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
        {reactions.map((reaction) => {
          return (
            <div
              key={reaction.id}
              className="absolute pointer-events-none flex flex-col items-center animate-float-fade"
              style={{
                left: `${reaction.xPercent}%`,
                bottom: "75px",
              }}
            >
              <span className="text-3xl select-none drop-shadow-lg filter">
                {reaction.emoji}
              </span>
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-background/80 shadow border border-border/60"
                style={{ color: reaction.senderColor }}
              >
                {reaction.senderName}
              </span>
            </div>
          );
        })}
      </div>

      {/* Floating Bottom Quick Reaction Bar */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card/85 backdrop-blur-md border border-border shadow-2xl transition-all hover:scale-105">
        <span className="text-[11px] font-semibold text-muted-foreground mr-1 hidden sm:inline">
          React:
        </span>
        {EMOJI_OPTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            disabled={disabled}
            onClick={() => onSendReaction(emoji)}
            className="size-8 rounded-full flex items-center justify-center text-lg transition-transform hover:scale-125 active:scale-95 disabled:opacity-40 disabled:pointer-events-none hover:bg-muted/50 cursor-pointer"
            title={`Send ${emoji} reaction`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  );
}

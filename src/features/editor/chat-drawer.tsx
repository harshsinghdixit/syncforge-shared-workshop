import React, { useState, useEffect, useRef } from "react";
import * as Y from "yjs";
import {
  Send,
  Lock,
  Globe,
  MessageSquare,
  Users,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { RemoteUser } from "./use-yjs-collaboration";

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  targetId: string; // 'all' for public, or specific peer ID for private DM
  text: string;
  timestamp: number;
}

interface ChatDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ydoc: Y.Doc | null;
  localUser: RemoteUser;
  activeUsers: RemoteUser[];
  isMuted?: boolean;
}

export function ChatDrawer({
  open,
  onOpenChange,
  ydoc,
  localUser,
  activeUsers,
  isMuted = false,
}: ChatDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [targetId, setTargetId] = useState<string>("all");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Sync Y.Array
  useEffect(() => {
    if (!ydoc) return;
    const chatArray = ydoc.getArray<ChatMessage>("chat-messages");

    const updateMessages = () => {
      setMessages(chatArray.toArray());
    };

    updateMessages();
    chatArray.observe(updateMessages);

    return () => {
      chatArray.unobserve(updateMessages);
    };
  }, [ydoc]);

  // Scroll to bottom on new message
  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  // Filter messages visible to this user
  const visibleMessages = messages.filter((msg) => {
    if (msg.targetId === "all") return true;
    return msg.senderId === localUser.id || msg.targetId === localUser.id;
  });

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isMuted) return;
    const text = inputVal.trim();
    if (!text || !ydoc) return;

    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      senderId: localUser.id,
      senderName: localUser.name,
      senderColor: localUser.color,
      targetId,
      text,
      timestamp: Date.now(),
    };

    const chatArray = ydoc.getArray<ChatMessage>("chat-messages");
    ydoc.transact(() => {
      chatArray.push([newMsg]);
    });

    setInputVal("");
  };

  const peers = activeUsers.filter((u) => u.id !== localUser.id);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 flex flex-col bg-card border-l border-border shadow-2xl z-50 select-text"
      >
        <SheetHeader className="p-4 border-b border-border bg-card/60">
          <div className="flex items-center justify-between pr-6">
            <div className="flex items-center gap-2">
              <MessageSquare className="size-4 text-primary" />
              <SheetTitle className="text-sm font-bold text-foreground">
                Room Chat
              </SheetTitle>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="size-3.5" />
              <span>{activeUsers.length} online</span>
            </div>
          </div>
          <SheetDescription className="text-xs text-muted-foreground text-left">
            Public channels and end-to-peer direct messages.
          </SheetDescription>
        </SheetHeader>

        {/* Channel Selector */}
        <div className="px-4 py-2 border-b border-border/80 bg-background/50 flex items-center gap-2">
          <span className="text-[11px] font-semibold text-muted-foreground">Send to:</span>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="flex-1 h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">🌐 Everyone (Public)</option>
            {peers.map((peer) => (
              <option key={peer.id} value={peer.id}>
                🔒 {peer.name} (Direct Message)
              </option>
            ))}
          </select>
        </div>

        {/* Message Log */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3">
          {visibleMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
              <MessageSquare className="size-8 mb-2 opacity-40 text-primary" />
              <p className="text-xs font-semibold">No messages yet</p>
              <p className="text-[11px] opacity-75">
                Say hi to the team or initiate a private discussion.
              </p>
            </div>
          ) : (
            visibleMessages.map((msg) => {
              const isMe = msg.senderId === localUser.id;
              const isPrivate = msg.targetId !== "all";
              const targetUser = activeUsers.find((u) => u.id === msg.targetId);

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                >
                  <div className="flex items-center gap-1.5 mb-1 text-[11px]">
                    <span
                      className="font-bold cursor-default"
                      style={{ color: msg.senderColor }}
                    >
                      {msg.senderName}
                    </span>
                    {isPrivate && (
                      <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-amber-500/10 text-amber-400 text-[9px] font-medium border border-amber-500/20">
                        <Lock className="size-2.5" />
                        {isMe ? `DM to ${targetUser?.name || "Peer"}` : "Private DM"}
                      </span>
                    )}
                    <span className="text-[9px] text-muted-foreground/60 font-mono">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  <div
                    className={`px-3 py-2 rounded-xl text-xs max-w-[85%] break-words shadow-xs ${
                      isMe
                        ? isPrivate
                          ? "bg-amber-600/20 text-foreground border border-amber-500/40"
                          : "bg-primary text-primary-foreground"
                        : isPrivate
                        ? "bg-amber-500/10 text-foreground border border-amber-500/30"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-border bg-card/60">
          {isMuted ? (
            <div className="flex items-center justify-center gap-2 p-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs font-semibold">
              <VolumeX className="size-3.5" />
              <span>You have been muted by a room moderator</span>
            </div>
          ) : (
            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <Input
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder={
                  targetId === "all"
                    ? "Message everyone..."
                    : `Direct message...`
                }
                className="h-9 text-xs bg-background"
                maxLength={300}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!inputVal.trim()}
                className="h-9 w-9 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Send className="size-4" />
              </Button>
            </form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

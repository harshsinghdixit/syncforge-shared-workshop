import React, { useRef, useState, useEffect } from "react";
import {
  RotateCcw,
  Minimize2,
  Maximize2,
  Mic,
  MicOff,
  VideoOff,
} from "lucide-react";
import type { RemoteUser } from "./use-yjs-collaboration";
import type { PeerStream } from "./use-webrtc-media";

interface DraggableVideoBubblesProps {
  localUser: RemoteUser;
  activeUsers: RemoteUser[];
  localStream: MediaStream | null;
  peerStreams: PeerStream[];
  isCameraOn: boolean;
  isMicOn: boolean;
  speakingUserIds: Set<string>;
  cleanBg: boolean;
}

interface BubblePosition {
  x: number;
  y: number;
}

function VideoTile({
  stream,
  isLocal = false,
  userName,
  userColor,
  isSpeaking,
  cleanBg,
  hasVideo = true,
}: {
  stream: MediaStream | null;
  isLocal?: boolean;
  userName: string;
  userColor: string;
  isSpeaking: boolean;
  cleanBg: boolean;
  hasVideo?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div
      className={`relative size-28 sm:size-32 rounded-full overflow-hidden transition-all duration-150 select-none shadow-2xl flex items-center justify-center ${
        cleanBg
          ? "bg-slate-950/95 ring-2 ring-primary/40 backdrop-blur-md"
          : "bg-slate-900 border border-border"
      }`}
      style={{
        boxShadow: isSpeaking
          ? `0 0 0 3px ${userColor}, 0 0 20px ${userColor}88`
          : `0 0 0 2px ${userColor}88, 0 4px 14px rgba(0,0,0,0.5)`,
      }}
    >
      {hasVideo && stream && stream.getVideoTracks().some((t) => t.enabled) ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={`w-full h-full object-cover pointer-events-none transition-transform duration-300 ${
            isLocal ? "scale-x-[-1]" : ""
          } ${
            cleanBg
              ? "scale-110 contrast-105 saturate-110 [mask-image:radial-gradient(circle_at_center,black_60%,transparent_100%)]"
              : ""
          }`}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900/90 text-center p-2">
          <div
            className="size-10 rounded-full flex items-center justify-center text-sm font-bold shadow-md mb-1"
            style={{ backgroundColor: userColor, color: "#ffffff" }}
          >
            {userName.slice(0, 2).toUpperCase()}
          </div>
          <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
            <VideoOff className="size-2.5" /> Off
          </span>
        </div>
      )}

      {/* Name and mic status tag on hover */}
      <div className="absolute bottom-1 inset-x-0 flex items-center justify-center opacity-85 hover:opacity-100 transition-opacity pointer-events-none">
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-black/75 backdrop-blur-xs text-white shadow truncate max-w-[85%]"
          style={{ borderLeft: `2.5px solid ${userColor}` }}
        >
          {userName} {isLocal && "(You)"}
        </span>
      </div>

      {/* Speaking badge indicator */}
      {isSpeaking && (
        <div
          className="absolute top-1.5 right-1.5 size-3 rounded-full animate-ping pointer-events-none"
          style={{ backgroundColor: userColor }}
        />
      )}
    </div>
  );
}

export function DraggableVideoBubbles({
  localUser,
  activeUsers,
  localStream,
  peerStreams,
  isCameraOn,
  isMicOn,
  speakingUserIds,
  cleanBg,
}: DraggableVideoBubblesProps) {
  // Store custom drag position for each bubble ID
  const [positions, setPositions] = useState<Record<string, BubblePosition>>({});
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Dragging state
  const dragInfoRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  // Compute feed list: Local user + remote peers with streams or camera/mic active
  const feeds = [
    {
      id: localUser.id,
      name: localUser.name,
      color: localUser.color,
      isLocal: true,
      stream: localStream,
      hasVideo: isCameraOn,
      isSpeaking: isMicOn && speakingUserIds.has(localUser.id),
    },
    ...peerStreams.map((ps) => {
      const user = activeUsers.find((u) => u.id === ps.userId);
      const name = user ? user.name : "Peer";
      const color = user ? user.color : "#38bdf8";
      const hasVideo = ps.stream.getVideoTracks().some((t) => t.enabled);
      const isSpeaking = speakingUserIds.has(ps.userId);

      return {
        id: ps.userId,
        name,
        color,
        isLocal: false,
        stream: ps.stream,
        hasVideo,
        isSpeaking,
      };
    }),
  ];

  // Default initial grid placement
  const getDefaultPosition = (index: number): BubblePosition => {
    if (typeof window === "undefined") return { x: 20, y: 70 };
    return {
      x: window.innerWidth - 150,
      y: 70 + index * 140,
    };
  };

  const handlePointerDown = (id: string, e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    const curPos = positions[id] ?? getDefaultPosition(feeds.findIndex((f) => f.id === id));
    dragInfoRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX: curPos.x,
      origY: curPos.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragInfoRef.current) return;
    const { id, startX, startY, origX, origY } = dragInfoRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    const maxX = typeof window !== "undefined" ? window.innerWidth - 130 : 800;
    const maxY = typeof window !== "undefined" ? window.innerHeight - 130 : 600;

    const newX = Math.max(10, Math.min(maxX, origX + dx));
    const newY = Math.max(10, Math.min(maxY, origY + dy));

    setPositions((prev) => ({
      ...prev,
      [id]: { x: newX, y: newY },
    }));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragInfoRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    dragInfoRef.current = null;
  };

  const resetPositions = () => {
    setPositions({});
  };

  if (feeds.length === 0) return null;

  return (
    <>
      {/* Floating Toolbar to reset or collapse video bubbles */}
      <div className="fixed top-14 right-4 z-50 flex items-center gap-1.5 p-1 rounded-full bg-card/85 backdrop-blur-md border border-border shadow-lg">
        <button
          type="button"
          onClick={() => setIsCollapsed((c) => !c)}
          className="size-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer"
          title={isCollapsed ? "Expand Video Bubbles" : "Collapse Video Bubbles"}
        >
          {isCollapsed ? <Maximize2 className="size-3.5" /> : <Minimize2 className="size-3.5" />}
        </button>
        <button
          type="button"
          onClick={resetPositions}
          className="size-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer"
          title="Reset Bubble Positions"
        >
          <RotateCcw className="size-3.5" />
        </button>
      </div>

      {!isCollapsed &&
        feeds.map((feed, idx) => {
          const pos = positions[feed.id] ?? getDefaultPosition(idx);

          return (
            <div
              key={feed.id}
              onPointerDown={(e) => handlePointerDown(feed.id, e)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="fixed z-50 touch-none cursor-grab active:cursor-grabbing will-change-transform transition-shadow"
              style={{
                left: `${pos.x}px`,
                top: `${pos.y}px`,
              }}
            >
              <VideoTile
                stream={feed.stream}
                isLocal={feed.isLocal}
                userName={feed.name}
                userColor={feed.color}
                isSpeaking={feed.isSpeaking}
                cleanBg={cleanBg}
                hasVideo={feed.hasVideo}
              />
            </div>
          );
        })}
    </>
  );
}

import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  RotateCcw,
  Minimize2,
  Maximize2,
  VideoOff,
  Sparkles,
} from "lucide-react";
import type { RemoteUser } from "./use-yjs-collaboration";
import type { PeerStream } from "./use-webrtc-media";
import { getOrInitSegmenter, segmentPersonFrame } from "./bg-remover";

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
  width,
}: {
  stream: MediaStream | null;
  isLocal?: boolean;
  userName: string;
  userColor: string;
  isSpeaking: boolean;
  cleanBg: boolean;
  width: number;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const segmenterRef = useRef<any>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastProcessTimeRef = useRef<number>(0);

  const [hasLiveVideo, setHasLiveVideo] = useState(false);
  const [isAiLoaded, setIsAiLoaded] = useState(false);

  // Reliable attachment and play of video streams
  const attachVideo = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;

    if (stream) {
      const videoTracks = stream.getVideoTracks();
      const liveTrack = videoTracks.find((t) => t.readyState === "live" && t.enabled);

      if (liveTrack) {
        if (el.srcObject !== stream) {
          el.srcObject = stream;
        }
        el.play().catch(() => {});
        setHasLiveVideo(true);
        return;
      }
    }

    if (el.srcObject) {
      el.srcObject = null;
    }
    setHasLiveVideo(false);
  }, [stream]);

  useEffect(() => {
    attachVideo();
  }, [attachVideo]);

  // Listen to track unmuted/muted events
  useEffect(() => {
    if (!stream) {
      setHasLiveVideo(false);
      return;
    }

    const checkTracks = () => {
      const videoTracks = stream.getVideoTracks();
      const live = videoTracks.some((t) => t.readyState === "live" && t.enabled);
      setHasLiveVideo(live);
    };

    checkTracks();
    stream.getVideoTracks().forEach((track) => {
      track.addEventListener("mute", checkTracks);
      track.addEventListener("unmute", checkTracks);
      track.addEventListener("ended", checkTracks);
    });

    return () => {
      stream.getVideoTracks().forEach((track) => {
        track.removeEventListener("mute", checkTracks);
        track.removeEventListener("unmute", checkTracks);
        track.removeEventListener("ended", checkTracks);
      });
    };
  }, [stream]);

  // Lazy-load MediaPipe segmenter when cleanBg (Remove BG) is enabled
  useEffect(() => {
    if (!cleanBg || typeof window === "undefined") {
      setIsAiLoaded(false);
      return;
    }

    let isCancelled = false;
    getOrInitSegmenter()
      .then((seg) => {
        if (!isCancelled) {
          segmenterRef.current = seg;
          setIsAiLoaded(true);
        }
      })
      .catch((err) => {
        console.error("Failed to initialize MediaPipe segmenter:", err);
      });

    return () => {
      isCancelled = true;
    };
  }, [cleanBg]);

  // Transparent Canvas Cutout Rendering Loop (OBS-Style)
  useEffect(() => {
    // Only run canvas segmentation when Remove BG is active, video is live, and AI model is loaded
    if (!cleanBg || !hasLiveVideo || !isAiLoaded) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    const videoEl = videoRef.current;
    const canvasEl = canvasRef.current;
    if (!videoEl || !canvasEl) return;

    // Create or reuse offscreen mask canvas
    if (!maskCanvasRef.current) {
      maskCanvasRef.current = document.createElement("canvas");
    }
    const maskCanvas = maskCanvasRef.current;

    let isRunning = true;

    const renderLoop = (time: number) => {
      if (!isRunning) return;

      // Throttle segmentation to ~20 FPS (~50ms) to ensure lightweight CPU/GPU usage
      if (time - lastProcessTimeRef.current >= 48) {
        lastProcessTimeRef.current = time;

        const vWidth = videoEl.videoWidth || 320;
        const vHeight = videoEl.videoHeight || 240;

        if (videoEl.readyState >= 2 && vWidth > 0 && vHeight > 0) {
          if (canvasEl.width !== vWidth || canvasEl.height !== vHeight) {
            canvasEl.width = vWidth;
            canvasEl.height = vHeight;
          }

          const ctx = canvasEl.getContext("2d");
          const segResult = segmentPersonFrame(segmenterRef.current, videoEl);

          if (ctx && segResult) {
            const { maskWidth, maskHeight, maskValues, isPersonInverted } = segResult;

            if (maskCanvas.width !== maskWidth || maskCanvas.height !== maskHeight) {
              maskCanvas.width = maskWidth;
              maskCanvas.height = maskHeight;
            }

            const maskCtx = maskCanvas.getContext("2d");
            if (maskCtx) {
              const maskImgData = maskCtx.createImageData(maskWidth, maskHeight);
              const data = maskImgData.data;
              const totalPixels = maskWidth * maskHeight;

              for (let i = 0; i < totalPixels; i++) {
                const conf = maskValues[i] ?? 0;
                // Person is 1, background is 0. Guard polarity if inverted.
                const personScore: number = isPersonInverted ? 1 - conf : conf;
                const alpha = Math.min(255, Math.max(0, Math.round(personScore * 255)));

                const pIdx = i * 4;
                data[pIdx] = 0; // R
                data[pIdx + 1] = 0; // G
                data[pIdx + 2] = 0; // B
                data[pIdx + 3] = alpha; // Alpha
              }

              maskCtx.putImageData(maskImgData, 0, 0);

              // Clear destination canvas completely (100% transparent)
              ctx.clearRect(0, 0, vWidth, vHeight);

              // 1. Draw raw video frame onto main canvas
              ctx.save();
              ctx.globalCompositeOperation = "source-over";
              ctx.drawImage(videoEl, 0, 0, vWidth, vHeight);

              // 2. Composite alpha mask with destination-in and light blur for smooth hair/edges
              ctx.globalCompositeOperation = "destination-in";
              ctx.filter = "blur(1.5px)";
              ctx.drawImage(maskCanvas, 0, 0, vWidth, vHeight);
              ctx.restore();
            }
          } else if (ctx) {
            // Fallback: draw video frame if segmenter is waiting or failed
            ctx.clearRect(0, 0, vWidth, vHeight);
            ctx.drawImage(videoEl, 0, 0, vWidth, vHeight);
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      isRunning = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [cleanBg, hasLiveVideo, isAiLoaded]);

  // Is OBS-style cutout active?
  const isCutoutMode = cleanBg && hasLiveVideo;

  return (
    <div
      className={`group relative select-none transition-shadow ${
        isCutoutMode
          ? "bg-transparent border-0 shadow-none overflow-visible flex items-center justify-center"
          : "size-28 sm:size-32 rounded-full overflow-hidden shadow-2xl flex items-center justify-center bg-slate-900 border border-border"
      }`}
      style={{
        width: isCutoutMode ? `${width}px` : undefined,
        height: isCutoutMode ? "auto" : undefined,
        boxShadow: !isCutoutMode
          ? isSpeaking
            ? `0 0 0 3px ${userColor}, 0 0 20px ${userColor}88`
            : `0 0 0 2px ${userColor}88, 0 4px 14px rgba(0,0,0,0.5)`
          : undefined,
      }}
    >
      {/* Underlying Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`object-cover pointer-events-none ${
          isCutoutMode
            ? "sr-only opacity-0 absolute pointer-events-none"
            : `w-full h-full transition-transform duration-300 ${
                hasLiveVideo ? "block" : "hidden"
              } ${isLocal ? "scale-x-[-1]" : ""}`
        }`}
      />

      {/* OBS-Style Transparent Cutout Canvas */}
      {isCutoutMode && (
        <canvas
          ref={canvasRef}
          className={`w-full h-auto pointer-events-none filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.4)] ${
            isLocal ? "scale-x-[-1]" : ""
          }`}
        />
      )}

      {/* Camera Off Avatar (When video is not active) */}
      {!hasLiveVideo && (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900/90 text-center p-2 rounded-full">
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

      {/* Name and mic status tag: always visible on circular tile, visible only on hover in cutout mode */}
      <div
        className={`absolute bottom-1 inset-x-0 flex items-center justify-center pointer-events-none transition-opacity duration-150 ${
          isCutoutMode ? "opacity-0 group-hover:opacity-100" : "opacity-85 hover:opacity-100"
        }`}
      >
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-black/80 backdrop-blur-xs text-white shadow truncate max-w-[85%]"
          style={{ borderLeft: `2.5px solid ${userColor}` }}
        >
          {userName} {isLocal && "(You)"}
        </span>
      </div>

      {/* Speaking glow indicator: ring on circular tile, subtle badge on hover in cutout mode */}
      {isSpeaking && (
        <div
          className={`pointer-events-none ${
            isCutoutMode
              ? "absolute top-1 right-1 size-2.5 rounded-full animate-ping opacity-0 group-hover:opacity-100 transition-opacity"
              : "absolute top-1.5 right-1.5 size-3 rounded-full animate-ping"
          }`}
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
  // Store custom width for each bubble ID in cutout mode (default: 200px)
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Dragging state
  const dragInfoRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  // Resizing state
  const resizeInfoRef = useRef<{
    id: string;
    startX: number;
    origWidth: number;
  } | null>(null);

  // Compute feed list: Local user + remote peers with streams or camera/mic active
  const feeds = [
    {
      id: localUser.id,
      name: localUser.name,
      color: localUser.color,
      isLocal: true,
      stream: localStream,
      isSpeaking: isMicOn && speakingUserIds.has(localUser.id),
    },
    ...peerStreams.map((ps) => {
      const user = activeUsers.find((u) => u.id === ps.userId);
      const name = user ? user.name : "Peer";
      const color = user ? user.color : "#38bdf8";
      const isSpeaking = speakingUserIds.has(ps.userId);

      return {
        id: ps.userId,
        name,
        color,
        isLocal: false,
        stream: ps.stream,
        isSpeaking,
      };
    }),
  ];

  // Default initial grid placement
  const getDefaultPosition = (index: number): BubblePosition => {
    if (typeof window === "undefined") return { x: 20, y: 70 };
    return {
      x: window.innerWidth - 180,
      y: 70 + index * 160,
    };
  };

  const handlePointerDown = (id: string, e: React.PointerEvent<HTMLDivElement>) => {
    // If clicking on resize handle or control buttons, don't drag
    if ((e.target as HTMLElement).closest("[data-resize-handle]")) return;

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

    const width = sizes[id] ?? 200;
    const maxX = typeof window !== "undefined" ? window.innerWidth - (cleanBg ? width : 130) : 800;
    const maxY = typeof window !== "undefined" ? window.innerHeight - 100 : 600;

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

  // Resize Handle Handlers
  const handleResizeDown = (id: string, e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    resizeInfoRef.current = {
      id,
      startX: e.clientX,
      origWidth: sizes[id] ?? 200,
    };
  };

  const handleResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeInfoRef.current) return;
    const { id, startX, origWidth } = resizeInfoRef.current;
    const dx = e.clientX - startX;

    // Constrain width between 110px and 420px
    const newWidth = Math.max(110, Math.min(420, origWidth + dx));
    setSizes((prev) => ({
      ...prev,
      [id]: newWidth,
    }));
  };

  const handleResizeUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeInfoRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    resizeInfoRef.current = null;
  };

  const resetPositions = () => {
    setPositions({});
    setSizes({});
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
          title={isCollapsed ? "Expand Video Feeds" : "Collapse Video Feeds"}
        >
          {isCollapsed ? <Maximize2 className="size-3.5" /> : <Minimize2 className="size-3.5" />}
        </button>
        <button
          type="button"
          onClick={resetPositions}
          className="size-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer"
          title="Reset Tile Positions & Sizes"
        >
          <RotateCcw className="size-3.5" />
        </button>
      </div>

      {!isCollapsed &&
        feeds.map((feed, idx) => {
          const pos = positions[feed.id] ?? getDefaultPosition(idx);
          const width = sizes[feed.id] ?? 200;
          const hasStream = Boolean(feed.stream);

          return (
            <div
              key={feed.id}
              onPointerDown={(e) => handlePointerDown(feed.id, e)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="group fixed z-50 touch-none cursor-grab active:cursor-grabbing will-change-transform"
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
                width={width}
              />

              {/* Bottom-Right Corner Resize Handle (OBS Cutout Mode: Visible on Hover) */}
              {cleanBg && hasStream && (
                <div
                  data-resize-handle="true"
                  onPointerDown={(e) => handleResizeDown(feed.id, e)}
                  onPointerMove={handleResizeMove}
                  onPointerUp={handleResizeUp}
                  onPointerCancel={handleResizeUp}
                  className="absolute -bottom-1 -right-1 size-5 rounded-bl-sm cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white/70 hover:text-white bg-black/60 rounded-full shadow-xs touch-none"
                  title="Drag to resize cutout"
                >
                  <svg
                    className="size-3"
                    viewBox="0 0 10 10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <line x1="8" y1="2" x2="2" y2="8" />
                    <line x1="8" y1="5" x2="5" y2="8" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
    </>
  );
}

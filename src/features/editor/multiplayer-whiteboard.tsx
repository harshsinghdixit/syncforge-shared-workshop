import React, { useEffect, useRef, useState, useCallback } from "react";
import * as Y from "yjs";
import {
  Paintbrush,
  Eraser,
  Undo2,
  Trash2,
  Minus,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { USER_COLORS } from "./use-yjs-collaboration";

export interface WhiteboardStroke {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  width: number;
  authorId: string;
}

interface MultiplayerWhiteboardProps {
  ydoc: Y.Doc | null;
  authorId: string;
  defaultColor?: string;
  isMuted?: boolean;
}

export function MultiplayerWhiteboard({
  ydoc,
  authorId,
  defaultColor = "#ef4444",
  isMuted = false,
}: MultiplayerWhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Whiteboard drawing tools
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState<string>(defaultColor);
  const [brushWidth, setBrushWidth] = useState<number>(4);
  const [strokes, setStrokes] = useState<WhiteboardStroke[]>([]);

  // Current drawing path
  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<{ x: number; y: number }[]>([]);

  // Sync Y.Array
  useEffect(() => {
    if (!ydoc) return;
    const strokesArray = ydoc.getArray<WhiteboardStroke>("whiteboard-strokes");

    const updateStrokes = () => {
      setStrokes(strokesArray.toArray());
    };

    updateStrokes();
    strokesArray.observe(updateStrokes);

    return () => {
      strokesArray.unobserve(updateStrokes);
    };
  }, [ydoc]);

  // Redraw canvas whenever strokes change or canvas resizes
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all strokes
    strokes.forEach((stroke) => {
      if (stroke.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const firstPoint = stroke.points[0];
      if (!firstPoint) return;
      ctx.moveTo(firstPoint.x * canvas.width, firstPoint.y * canvas.height);

      for (let i = 1; i < stroke.points.length; i++) {
        const pt = stroke.points[i];
        if (pt) {
          ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height);
        }
      }
      ctx.stroke();
    });
  }, [strokes]);

  // Keep canvas resolution synced to container
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      // Adjust pixel density for crisp lines
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
      renderCanvas();
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [renderCanvas]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Coordinate normalizer (0 to 1)
  const getNormalizedPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isMuted) return;
    if (e.button !== 0) return; // Primary button only
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    isDrawingRef.current = true;
    const pt = getNormalizedPoint(e);
    currentPointsRef.current = [pt];

    // Immediate preview on canvas
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.strokeStyle = tool === "eraser" ? "#0f172a" : color;
      ctx.lineWidth = tool === "eraser" ? brushWidth * 3 : brushWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(pt.x * canvas.width, pt.y * canvas.height);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pt = getNormalizedPoint(e);
    currentPointsRef.current.push(pt);

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height);
      ctx.stroke();
    }
  };

  const finishDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    const pts = currentPointsRef.current;
    if (pts.length < 2 || !ydoc) {
      renderCanvas();
      return;
    }

    const strokeColor = tool === "eraser" ? "#0f172a" : color;
    const strokeWidth = tool === "eraser" ? brushWidth * 3 : brushWidth;

    const newStroke: WhiteboardStroke = {
      id: `stroke-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      points: pts,
      color: strokeColor,
      width: strokeWidth,
      authorId,
    };

    const strokesArray = ydoc.getArray<WhiteboardStroke>("whiteboard-strokes");
    ydoc.transact(() => {
      strokesArray.push([newStroke]);
    });
  };

  const handleUndo = () => {
    if (!ydoc) return;
    const strokesArray = ydoc.getArray<WhiteboardStroke>("whiteboard-strokes");
    const arr = strokesArray.toArray();
    // Find last stroke by current user or last stroke overall
    let removeIndex = -1;
    for (let i = arr.length - 1; i >= 0; i--) {
      const s = arr[i];
      if (s && s.authorId === authorId) {
        removeIndex = i;
        break;
      }
    }
    if (removeIndex === -1 && arr.length > 0) {
      removeIndex = arr.length - 1;
    }

    if (removeIndex >= 0) {
      ydoc.transact(() => {
        strokesArray.delete(removeIndex, 1);
      });
    }
  };

  const handleClear = () => {
    if (!ydoc) return;
    const strokesArray = ydoc.getArray<WhiteboardStroke>("whiteboard-strokes");
    if (strokesArray.length === 0) return;
    ydoc.transact(() => {
      strokesArray.delete(0, strokesArray.length);
    });
  };

  return (
    <div className="relative flex flex-col w-full h-full bg-[#0a0f1d] overflow-hidden select-none">
      {/* Floating Toolbar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 p-1.5 rounded-xl bg-card/90 backdrop-blur-md border border-border shadow-2xl">
        {/* Tool selector */}
        <Button
          size="sm"
          variant={tool === "pen" ? "default" : "ghost"}
          className="h-8 px-2.5 gap-1.5 text-xs font-semibold"
          onClick={() => setTool("pen")}
          title="Pen tool"
        >
          <Paintbrush className="size-3.5" />
          <span className="hidden sm:inline">Pen</span>
        </Button>
        <Button
          size="sm"
          variant={tool === "eraser" ? "default" : "ghost"}
          className="h-8 px-2.5 gap-1.5 text-xs font-semibold"
          onClick={() => setTool("eraser")}
          title="Eraser tool"
        >
          <Eraser className="size-3.5" />
          <span className="hidden sm:inline">Eraser</span>
        </Button>

        <div className="h-4 w-px bg-border/80 mx-1" />

        {/* Color Palette (Among Us swatches) */}
        <div className="flex items-center gap-1">
          {USER_COLORS.map((c) => {
            const isSelected = tool === "pen" && color === c.color;
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => {
                  setColor(c.color);
                  setTool("pen");
                }}
                className={`relative size-5 rounded-full transition-transform cursor-pointer ${
                  isSelected ? "scale-125 ring-2 ring-primary ring-offset-1 ring-offset-card" : "hover:scale-110 opacity-80 hover:opacity-100"
                }`}
                style={{ backgroundColor: c.color }}
                title={c.name}
              />
            );
          })}
        </div>

        <div className="h-4 w-px bg-border/80 mx-1" />

        {/* Brush Size */}
        <div className="flex items-center gap-1 px-1">
          <button
            type="button"
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            onClick={() => setBrushWidth((w) => Math.max(2, w - 2))}
            title="Decrease stroke width"
          >
            <Minus className="size-3" />
          </button>
          <span className="text-[11px] font-mono w-4 text-center text-foreground font-semibold">
            {brushWidth}
          </span>
          <button
            type="button"
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            onClick={() => setBrushWidth((w) => Math.min(24, w + 2))}
            title="Increase stroke width"
          >
            <Plus className="size-3" />
          </button>
        </div>

        <div className="h-4 w-px bg-border/80 mx-1" />

        {/* Undo and Clear */}
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
          onClick={handleUndo}
          title="Undo last stroke"
        >
          <Undo2 className="size-3.5" />
          <span className="hidden md:inline">Undo</span>
        </Button>

        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-xs gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={handleClear}
          title="Clear whiteboard"
        >
          <Trash2 className="size-3.5" />
          <span className="hidden md:inline">Clear</span>
        </Button>
      </div>

      {isMuted && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-destructive/20 border border-destructive/40 text-destructive text-xs font-semibold">
          You are muted by room moderation — drawing is disabled
        </div>
      )}

      {/* Grid Pattern Background */}
      <div
        ref={containerRef}
        className="w-full h-full flex-1 relative cursor-crosshair overflow-hidden touch-none"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)`,
          backgroundSize: "24px 24px",
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrawing}
          onPointerCancel={finishDrawing}
          className="w-full h-full block"
        />
      </div>
    </div>
  );
}

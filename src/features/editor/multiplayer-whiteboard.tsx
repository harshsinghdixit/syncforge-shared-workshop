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
  // Keep the canvas transparent and draw eraser strokes with destination-out for zero color streak
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Clear entire canvas to transparent
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // Draw all synchronized strokes
    strokes.forEach((stroke) => {
      if (stroke.points.length < 2) return;
      const firstPoint = stroke.points[0];
      if (!firstPoint) return;

      ctx.save();
      ctx.beginPath();
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (stroke.color === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = stroke.color;
      }

      ctx.moveTo(firstPoint.x * width, firstPoint.y * height);

      for (let i = 1; i < stroke.points.length; i++) {
        const pt = stroke.points[i];
        if (pt) {
          ctx.lineTo(pt.x * width, pt.y * height);
        }
      }
      ctx.stroke();
      ctx.restore();
    });
  }, [strokes]);

  // Keep canvas resolution synced to container using ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dpr = window.devicePixelRatio || 1;

      // Sync backing buffer pixels
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);

      // Set scale transform
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      renderCanvas();
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [renderCanvas]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Coordinate normalizer (0 to 1) based on container's bounding client rect
  const getNormalizedPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isMuted) return;
    if (e.button !== 0) return; // Primary button only
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    canvas.setPointerCapture(e.pointerId);

    isDrawingRef.current = true;
    const pt = getNormalizedPoint(e);
    currentPointsRef.current = [pt];

    // Immediate preview line start
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const rect = container.getBoundingClientRect();
      ctx.save();
      ctx.beginPath();
      ctx.lineWidth = tool === "eraser" ? brushWidth * 3 : brushWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (tool === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = color;
      }

      ctx.moveTo(pt.x * rect.width, pt.y * rect.height);
      ctx.restore();
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const pt = getNormalizedPoint(e);
    currentPointsRef.current.push(pt);

    const ctx = canvas.getContext("2d");
    if (ctx) {
      const rect = container.getBoundingClientRect();
      ctx.save();
      ctx.beginPath();
      ctx.lineWidth = tool === "eraser" ? brushWidth * 3 : brushWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (tool === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = color;
      }

      const prev = currentPointsRef.current[currentPointsRef.current.length - 2];
      if (prev) {
        ctx.moveTo(prev.x * rect.width, prev.y * rect.height);
        ctx.lineTo(pt.x * rect.width, pt.y * rect.height);
        ctx.stroke();
      }
      ctx.restore();
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

    const strokeColor = tool === "eraser" ? "eraser" : color;
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
      renderCanvas();
    }
  };

  const handleClear = () => {
    if (!ydoc) return;
    const strokesArray = ydoc.getArray<WhiteboardStroke>("whiteboard-strokes");
    if (strokesArray.length === 0) return;
    currentPointsRef.current = [];
    isDrawingRef.current = false;
    ydoc.transact(() => {
      strokesArray.delete(0, strokesArray.length);
    });
    renderCanvas();
  };

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col w-full h-full bg-[#0a0f1d] overflow-hidden select-none"
    >
      {/* Floating Toolbar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 p-1.5 rounded-xl bg-card/90 backdrop-blur-md border border-border shadow-2xl">
        {/* Tool selector */}
        <Button
          size="sm"
          variant={tool === "pen" ? "default" : "ghost"}
          className="h-8 px-2.5 gap-1.5 text-xs font-semibold cursor-pointer"
          onClick={() => setTool("pen")}
          title="Pen tool"
        >
          <Paintbrush className="size-3.5" />
          <span className="hidden sm:inline">Pen</span>
        </Button>
        <Button
          size="sm"
          variant={tool === "eraser" ? "default" : "ghost"}
          className="h-8 px-2.5 gap-1.5 text-xs font-semibold cursor-pointer"
          onClick={() => setTool("eraser")}
          title="Eraser tool (Clean transparent removal)"
        >
          <Eraser className="size-3.5" />
          <span className="hidden sm:inline">Eraser</span>
        </Button>

        <div className="h-4 w-px bg-border/80 mx-0.5" />

        {/* Color Palette (Active when tool === 'pen') */}
        {tool === "pen" && (
          <div className="flex items-center gap-1 px-1">
            {USER_COLORS.slice(0, 6).map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => setColor(c.color)}
                className={`size-5 rounded-full transition-transform cursor-pointer ${
                  color === c.color
                    ? "ring-2 ring-primary ring-offset-1 ring-offset-card scale-110"
                    : "hover:scale-110 opacity-80 hover:opacity-100"
                }`}
                style={{ backgroundColor: c.color }}
                title={c.name}
              />
            ))}
          </div>
        )}

        <div className="h-4 w-px bg-border/80 mx-0.5" />

        {/* Brush Size Controls */}
        <div className="flex items-center gap-1 px-1">
          <button
            type="button"
            disabled={brushWidth <= 2}
            onClick={() => setBrushWidth((w) => Math.max(2, w - 2))}
            className="size-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-30 cursor-pointer"
            title="Decrease size"
          >
            <Minus className="size-3" />
          </button>
          <span className="text-[10px] font-mono w-4 text-center text-muted-foreground">
            {brushWidth}
          </span>
          <button
            type="button"
            disabled={brushWidth >= 20}
            onClick={() => setBrushWidth((w) => Math.min(20, w + 2))}
            className="size-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-30 cursor-pointer"
            title="Increase size"
          >
            <Plus className="size-3" />
          </button>
        </div>

        <div className="h-4 w-px bg-border/80 mx-0.5" />

        {/* Undo Button */}
        <Button
          size="sm"
          variant="ghost"
          className="size-8 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
          onClick={handleUndo}
          title="Undo your last stroke"
        >
          <Undo2 className="size-3.5" />
        </Button>

        {/* Clear Button */}
        <Button
          size="sm"
          variant="ghost"
          className="size-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
          onClick={handleClear}
          title="Clear entire whiteboard"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {/* Transparent Canvas Surface with Dark Background on Parent Div */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrawing}
        onPointerCancel={finishDrawing}
        className="w-full h-full touch-none cursor-crosshair block"
      />
    </div>
  );
}

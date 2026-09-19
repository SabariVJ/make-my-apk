import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Minus, Plus, RotateCcw, X } from "lucide-react";

const FRAME_SIZE = 280;
const OUTPUT_SIZE = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

type Point = { x: number; y: number };

interface AvatarCropEditorProps {
  file: File;
  onCancel: () => void;
  onUsePhoto: (photo: Blob) => Promise<void> | void;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Fixed-frame avatar cropper. The image moves behind the circular guide, so the
 * resulting canvas crop exactly matches the preview instead of relying on a
 * non-portable object-position value after upload.
 */
export const AvatarCropEditor: React.FC<AvatarCropEditorProps> = ({
  file,
  onCancel,
  onUsePhoto,
}) => {
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const dragStart = useRef<{ pointer: Point; offset: Point } | null>(null);
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    setNaturalSize(null);
    setZoom(MIN_ZOOM);
    setOffset({ x: 0, y: 0 });
    setError(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const geometry = useMemo(() => {
    if (!naturalSize) return null;
    const baseScale = Math.max(FRAME_SIZE / naturalSize.width, FRAME_SIZE / naturalSize.height);
    const width = naturalSize.width * baseScale * zoom;
    const height = naturalSize.height * baseScale * zoom;
    return { baseScale, width, height, scale: baseScale * zoom };
  }, [naturalSize, zoom]);

  const clampOffset = (candidate: Point, currentGeometry = geometry): Point => {
    if (!currentGeometry) return { x: 0, y: 0 };
    const maxX = Math.max(0, (currentGeometry.width - FRAME_SIZE) / 2);
    const maxY = Math.max(0, (currentGeometry.height - FRAME_SIZE) / 2);
    return {
      x: clamp(candidate.x, -maxX, maxX),
      y: clamp(candidate.y, -maxY, maxY),
    };
  };

  const setSafeZoom = (nextZoom: number) => {
    const next = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    setZoom(next);
    if (!naturalSize) return;
    const baseScale = Math.max(FRAME_SIZE / naturalSize.width, FRAME_SIZE / naturalSize.height);
    const nextGeometry = {
      baseScale,
      width: naturalSize.width * baseScale * next,
      height: naturalSize.height * baseScale * next,
      scale: baseScale * next,
    };
    setOffset((current) => clampOffset(current, nextGeometry));
  };

  const currentStyle = geometry
    ? {
        width: `${geometry.width}px`,
        height: `${geometry.height}px`,
        left: `${(FRAME_SIZE - geometry.width) / 2 + offset.x}px`,
        top: `${(FRAME_SIZE - geometry.height) / 2 + offset.y}px`,
      }
    : undefined;

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (processing) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const active = [...pointers.current.values()];
    if (active.length === 1) {
      dragStart.current = { pointer: active[0], offset };
      pinchStart.current = null;
    } else if (active.length === 2) {
      const [a, b] = active;
      pinchStart.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        zoom,
      };
      dragStart.current = null;
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId) || processing) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const active = [...pointers.current.values()];
    if (active.length === 2 && pinchStart.current) {
      const [a, b] = active;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart.current.distance > 0) {
        setSafeZoom(pinchStart.current.zoom * (distance / pinchStart.current.distance));
      }
      return;
    }
    if (active.length === 1 && dragStart.current) {
      const point = active[0];
      const delta = {
        x: point.x - dragStart.current.pointer.x,
        y: point.y - dragStart.current.pointer.y,
      };
      setOffset(
        clampOffset({
          x: dragStart.current.offset.x + delta.x,
          y: dragStart.current.offset.y + delta.y,
        }),
      );
    }
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    const active = [...pointers.current.values()];
    if (active.length === 1) {
      dragStart.current = { pointer: active[0], offset };
      pinchStart.current = null;
    } else {
      dragStart.current = null;
      pinchStart.current = null;
    }
  };

  const handleUsePhoto = async () => {
    if (!geometry || !naturalSize || !imageRef.current) return;
    setProcessing(true);
    setError(null);
    try {
      const sourceSide = FRAME_SIZE / geometry.scale;
      const sourceX = (naturalSize.width - sourceSide) / 2 - offset.x / geometry.scale;
      const sourceY = (naturalSize.height - sourceSide) / 2 - offset.y / geometry.scale;
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser could not prepare this image.");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(
        imageRef.current,
        sourceX,
        sourceY,
        sourceSide,
        sourceSide,
        0,
        0,
        OUTPUT_SIZE,
        OUTPUT_SIZE,
      );
      const result = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Could not create the cropped image."));
          },
          "image/webp",
          0.86,
        );
      });
      await onUsePhoto(result);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not use this photo. Try another image.",
      );
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#17171A] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="font-anton text-lg uppercase tracking-wide text-white">
              Edit Profile Photo
            </p>
            <p className="text-[11px] font-mono text-[#8C8C90]">
              Drag to reposition • pinch or use zoom
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={processing}
            className="rounded-full bg-white/5 p-2 text-[#8C8C90] transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
            aria-label="Cancel avatar edit"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mx-auto h-[280px] w-[280px] overflow-hidden rounded-3xl bg-[#0B0B0C] shadow-inner">
          <div
            className="relative h-full w-full touch-none select-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
          >
            {sourceUrl && (
              <img
                ref={imageRef}
                src={sourceUrl}
                alt="Avatar crop preview"
                draggable={false}
                onLoad={(event) => {
                  setNaturalSize({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  });
                }}
                className="absolute max-w-none select-none pointer-events-none"
                style={currentStyle}
              />
            )}
            <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.42)]" />
            <div className="pointer-events-none absolute inset-3 rounded-full border border-dashed border-white/35" />
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSafeZoom(zoom - 0.1)}
              disabled={!naturalSize || processing || zoom <= MIN_ZOOM}
              className="rounded-xl border border-white/10 bg-[#0B0B0C] p-2 text-white disabled:opacity-40"
              aria-label="Zoom out"
            >
              <Minus className="h-4 w-4" />
            </button>
            <input
              aria-label="Photo zoom"
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step="0.01"
              value={zoom}
              onChange={(event) => setSafeZoom(Number(event.target.value))}
              disabled={!naturalSize || processing}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-[#C81E3A]"
            />
            <button
              type="button"
              onClick={() => setSafeZoom(zoom + 0.1)}
              disabled={!naturalSize || processing || zoom >= MAX_ZOOM}
              className="rounded-xl border border-white/10 bg-[#0B0B0C] p-2 text-white disabled:opacity-40"
              aria-label="Zoom in"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setSafeZoom(MIN_ZOOM);
                setOffset({ x: 0, y: 0 });
              }}
              disabled={processing}
              className="rounded-xl border border-white/10 bg-[#0B0B0C] p-2 text-[#8C8C90] hover:text-white disabled:opacity-40"
              aria-label="Reset crop"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-[#8C8C90]">
            <span>LIVE SQUARE OUTPUT</span>
            <span>{Math.round(zoom * 100)}%</span>
          </div>
          {error && (
            <p role="alert" className="text-xs font-mono text-rose-400">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleUsePhoto()}
            disabled={!naturalSize || processing}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#C81E3A] py-3 font-anton uppercase tracking-wider text-white transition-colors hover:bg-[#A0182E] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {processing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {processing ? "Preparing Photo…" : "Use Photo"}
          </button>
        </div>
      </div>
    </div>
  );
};

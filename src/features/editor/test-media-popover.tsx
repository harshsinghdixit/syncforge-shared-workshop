import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Camera,
  Mic,
  Volume2,
  VolumeX,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface TestMediaPopoverProps {
  open: boolean;
  onClose: () => void;
  cleanBg: boolean;
  onToggleCleanBg: () => void;
}

export function TestMediaPopover({
  open,
  onClose,
  cleanBg,
  onToggleCleanBg,
}: TestMediaPopoverProps) {
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string>("");
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");

  const [testCamActive, setTestCamActive] = useState(true);
  const [testMicLevel, setTestMicLevel] = useState(0);
  const [camStatus, setCamStatus] = useState<"live" | "off" | "error">("off");
  const [camErrorMessage, setCamErrorMessage] = useState("");
  const [hearYourself, setHearYourself] = useState(false);

  const testVideoRef = useRef<HTMLVideoElement | null>(null);
  const testStreamRef = useRef<MediaStream | null>(null);
  const testAudioCtxRef = useRef<AudioContext | null>(null);
  const loopbackGainRef = useRef<GainNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Enumerate input devices
  const refreshDevices = useCallback(async () => {
    if (typeof window === "undefined" || !navigator?.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audios = devices.filter((d) => d.kind === "audioinput");
      const videos = devices.filter((d) => d.kind === "videoinput");
      setAudioDevices(audios);
      setVideoDevices(videos);
      if (audios[0] && !selectedAudioId) setSelectedAudioId(audios[0].deviceId);
      if (videos[0] && !selectedVideoId) setSelectedVideoId(videos[0].deviceId);
    } catch {
      // Ignore enumeration issues
    }
  }, [selectedAudioId, selectedVideoId]);

  // Start test stream
  const startTestMedia = useCallback(async () => {
    if (typeof window === "undefined" || !navigator?.mediaDevices) return;

    // Stop previous test stream
    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach((t) => t.stop());
      testStreamRef.current = null;
    }

    try {
      const audioConstraints: boolean | MediaTrackConstraints = selectedAudioId
        ? { deviceId: { exact: selectedAudioId } }
        : true;
      const videoConstraints: boolean | MediaTrackConstraints = testCamActive
        ? selectedVideoId
          ? { deviceId: { exact: selectedVideoId }, width: { ideal: 480 }, height: { ideal: 480 } }
          : { width: { ideal: 480 }, height: { ideal: 480 } }
        : false;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: videoConstraints,
      });

      testStreamRef.current = stream;

      // Video attachment
      if (testCamActive && stream.getVideoTracks().length > 0) {
        if (testVideoRef.current) {
          testVideoRef.current.srcObject = stream;
          testVideoRef.current.play().catch(() => {});
        }
        setCamStatus("live");
        setCamErrorMessage("");
      } else {
        setCamStatus("off");
      }

      // Mic analysis & Loopback setup
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          if (!testAudioCtxRef.current || testAudioCtxRef.current.state === "closed") {
            testAudioCtxRef.current = new AudioContextClass();
          }
          const ctx = testAudioCtxRef.current;
          if (ctx.state === "suspended") {
            ctx.resume().catch(() => {});
          }

          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 128;
          source.connect(analyser);

          // Loopback node (Hear Yourself)
          const loopbackGain = ctx.createGain();
          loopbackGain.gain.value = hearYourself ? 1.0 : 0.0;
          loopbackGainRef.current = loopbackGain;
          source.connect(loopbackGain);
          loopbackGain.connect(ctx.destination);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateLevel = () => {
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i] ?? 0;
            }
            const avg = sum / dataArray.length;
            const normalized = Math.min(100, Math.round((avg / 128) * 100));
            setTestMicLevel(normalized);
            animFrameRef.current = window.requestAnimationFrame(updateLevel);
          };
          updateLevel();
        }
      }

      refreshDevices();
    } catch (err: any) {
      console.warn("Test media initialization error:", err);
      setCamStatus("error");
      setCamErrorMessage(err?.message || "Camera or mic access denied / busy");
    }
  }, [testCamActive, selectedAudioId, selectedVideoId, hearYourself, refreshDevices]);

  // Adjust hear-yourself loopback volume dynamically
  useEffect(() => {
    if (loopbackGainRef.current && testAudioCtxRef.current) {
      loopbackGainRef.current.gain.setValueAtTime(
        hearYourself ? 1.0 : 0.0,
        testAudioCtxRef.current.currentTime
      );
    }
  }, [hearYourself]);

  useEffect(() => {
    if (open) {
      startTestMedia();
    } else {
      // Teardown test stream when popover closes
      if (testStreamRef.current) {
        testStreamRef.current.getTracks().forEach((t) => t.stop());
        testStreamRef.current = null;
      }
      if (animFrameRef.current) {
        window.cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (testAudioCtxRef.current && testAudioCtxRef.current.state !== "closed") {
        testAudioCtxRef.current.close().catch(() => {});
        testAudioCtxRef.current = null;
      }
      setTestMicLevel(0);
    }
  }, [open, startTestMedia]);

  if (!open) return null;

  return (
    <div className="fixed bottom-16 left-4 z-50 w-80 sm:w-96 rounded-2xl bg-card/95 backdrop-blur-xl border border-border shadow-2xl p-4 space-y-4 animate-in fade-in slide-in-from-bottom-3 select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-border/80">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
            Audio & Video Device Test
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Camera Test Preview Box */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-muted-foreground flex items-center gap-1.5">
            <Camera className="size-3.5 text-primary" /> Camera Test
          </span>
          <div className="flex items-center gap-1.5">
            {camStatus === "live" ? (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                <CheckCircle2 className="size-2.5" /> Camera Live
              </span>
            ) : camStatus === "error" ? (
              <span className="flex items-center gap-1 text-[10px] text-destructive font-bold bg-destructive/10 px-2 py-0.5 rounded-full border border-destructive/20">
                <AlertCircle className="size-2.5" /> Error
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                Off
              </span>
            )}
          </div>
        </div>

        {/* Live Preview Container */}
        <div
          className={`relative aspect-video w-full rounded-xl overflow-hidden flex items-center justify-center border border-border ${
            cleanBg
              ? "bg-slate-950 [mask-image:radial-gradient(circle_at_center,black_75%,transparent_100%)] ring-2 ring-primary/40"
              : "bg-slate-900"
          }`}
        >
          {testCamActive && camStatus === "live" ? (
            <video
              ref={testVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover scale-x-[-1] ${
                cleanBg ? "scale-105 contrast-105 saturate-110" : ""
              }`}
            />
          ) : (
            <div className="text-center p-3 text-muted-foreground text-xs space-y-1">
              {camStatus === "error" ? (
                <p className="text-destructive font-medium text-[11px]">
                  {camErrorMessage || "Camera permission denied or camera currently in use."}
                </p>
              ) : (
                <p className="text-xs">Camera preview turned off</p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          {videoDevices.length > 0 && (
            <select
              value={selectedVideoId}
              onChange={(e) => setSelectedVideoId(e.target.value)}
              className="flex-1 h-7 rounded-md border border-input bg-background px-2 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary truncate"
            >
              {videoDevices.map((d, idx) => (
                <option key={d.deviceId || idx} value={d.deviceId}>
                  {d.label || `Camera ${idx + 1}`}
                </option>
              ))}
            </select>
          )}

          <Button
            size="sm"
            variant={testCamActive ? "default" : "outline"}
            className="h-7 text-xs px-2.5 font-semibold"
            onClick={() => setTestCamActive((v) => !v)}
          >
            {testCamActive ? "Turn Off" : "Test Camera"}
          </Button>
        </div>
      </div>

      {/* Mic Test & Real-time Volume Bar */}
      <div className="space-y-2 pt-2 border-t border-border/70">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-muted-foreground flex items-center gap-1.5">
            <Mic className="size-3.5 text-primary" /> Microphone Test
          </span>
          <span className="text-[10px] font-mono text-muted-foreground">
            Level: {testMicLevel}%
          </span>
        </div>

        {/* Real-time Voice Bar */}
        <div className="w-full h-3 rounded-full bg-slate-900 border border-border/80 overflow-hidden p-0.5">
          <div
            className="h-full rounded-full transition-all duration-75"
            style={{
              width: `${Math.max(4, testMicLevel)}%`,
              backgroundColor:
                testMicLevel > 70
                  ? "#ef4444"
                  : testMicLevel > 20
                  ? "#22c55e"
                  : "#38bdf8",
              boxShadow: testMicLevel > 20 ? "0 0 10px rgba(34,197,94,0.6)" : "none",
            }}
          />
        </div>

        <p className="text-[10px] text-muted-foreground italic">
          Speak into your microphone to verify the audio input is responsive.
        </p>

        <div className="flex items-center justify-between gap-2 pt-1">
          {audioDevices.length > 0 && (
            <select
              value={selectedAudioId}
              onChange={(e) => setSelectedAudioId(e.target.value)}
              className="flex-1 h-7 rounded-md border border-input bg-background px-2 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary truncate"
            >
              {audioDevices.map((d, idx) => (
                <option key={d.deviceId || idx} value={d.deviceId}>
                  {d.label || `Microphone ${idx + 1}`}
                </option>
              ))}
            </select>
          )}

          {/* Hear Yourself Loopback Toggle */}
          <Button
            size="sm"
            variant={hearYourself ? "default" : "outline"}
            className="h-7 text-xs px-2.5 font-semibold gap-1"
            onClick={() => setHearYourself((h) => !h)}
            title="Loopback microphone output to speakers/headphones to verify sound quality"
          >
            {hearYourself ? <Volume2 className="size-3 text-emerald-300" /> : <VolumeX className="size-3" />}
            <span>Hear Yourself</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

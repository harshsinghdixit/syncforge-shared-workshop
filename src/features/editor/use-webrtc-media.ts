import { useEffect, useRef, useState, useCallback } from "react";
import * as Y from "yjs";
import { toast } from "sonner";
import type { RemoteUser } from "./use-yjs-collaboration";

export interface RTCSignalMessage {
  id: string;
  from: string;
  to: string;
  type: "offer" | "answer" | "candidate";
  payload: any;
  timestamp: number;
}

export interface PeerStream {
  userId: string;
  stream: MediaStream;
}

interface UseWebRTCMediaOptions {
  ydoc: Y.Doc | null;
  localUser: RemoteUser;
  activeUsers: RemoteUser[];
  isMutedByHost?: boolean;
}

export function useWebRTCMedia({
  ydoc,
  localUser,
  activeUsers,
  isMutedByHost = false,
}: UseWebRTCMediaOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isPushToTalkActive, setIsPushToTalkActive] = useState(false);
  const [cleanBg, setCleanBg] = useState(false);
  const [peerStreams, setPeerStreams] = useState<PeerStream[]>([]);
  const [speakingUserIds, setSpeakingUserIds] = useState<Set<string>>(new Set());
  const [localMicLevel, setLocalMicLevel] = useState<number>(0);

  // References to preserve track lifecycles across renders without closing
  const localStreamRef = useRef<MediaStream | null>(null);
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const camTrackRef = useRef<MediaStreamTrack | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const processedSignalsRef = useRef<Set<string>>(new Set());

  // Web Audio analyser for local mic meter & remote speaking detectors
  const audioContextRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const localAnimFrameRef = useRef<number | null>(null);
  const analysersRef = useRef<Map<string, { analyser: AnalyserNode; animId: number }>>(new Map());

  // WebRTC ICE configuration with Google STUN
  const rtcConfig: RTCConfiguration = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };

  // Helper to safely send signals over Yjs Map
  const sendSignal = useCallback(
    (to: string, type: "offer" | "answer" | "candidate", payload: any) => {
      if (!ydoc) return;
      const signalsMap = ydoc.getMap<RTCSignalMessage>("rtc-signals");
      const signalId = `${localUser.id}_${to}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const msg: RTCSignalMessage = {
        id: signalId,
        from: localUser.id,
        to,
        type,
        payload,
        timestamp: Date.now(),
      };
      processedSignalsRef.current.add(signalId);
      ydoc.transact(() => {
        signalsMap.set(signalId, msg);
      });
    },
    [ydoc, localUser.id]
  );

  // Monitor speaking levels for remote audio streams
  const monitorRemoteSpeaking = useCallback((userId: string, stream: MediaStream) => {
    if (typeof window === "undefined") return;
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    try {
      if (!audioContextRef.current || audioContextRef.current.state === "closed") {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          audioContextRef.current = new AudioContextClass();
        }
      }
      const ctx = audioContextRef.current;
      if (!ctx) return;
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }

      const existing = analysersRef.current.get(userId);
      if (existing) {
        window.cancelAnimationFrame(existing.animId);
      }

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);

      const checkVolume = () => {
        if (!stream.active) return;
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i] ?? 0;
        }
        const avg = sum / buffer.length;
        const isSpeaking = avg > 14;

        setSpeakingUserIds((prev) => {
          const has = prev.has(userId);
          if (isSpeaking && !has) {
            const next = new Set(prev);
            next.add(userId);
            return next;
          } else if (!isSpeaking && has) {
            const next = new Set(prev);
            next.delete(userId);
            return next;
          }
          return prev;
        });

        const animId = window.requestAnimationFrame(checkVolume);
        analysersRef.current.set(userId, { analyser, animId });
      };

      const animId = window.requestAnimationFrame(checkVolume);
      analysersRef.current.set(userId, { analyser, animId });
    } catch {
      // AudioContext fallback
    }
  }, []);

  // Monitor local mic volume level (0 - 100)
  const startLocalAudioAnalysis = useCallback((track: MediaStreamTrack) => {
    if (typeof window === "undefined") return;
    try {
      if (!audioContextRef.current || audioContextRef.current.state === "closed") {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          audioContextRef.current = new AudioContextClass();
        }
      }
      const ctx = audioContextRef.current;
      if (!ctx) return;
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }

      const singleStream = new MediaStream([track]);
      const source = ctx.createMediaStreamSource(singleStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      localAnalyserRef.current = analyser;

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const readLevel = () => {
        if (!track.enabled || track.readyState !== "live") {
          setLocalMicLevel(0);
          return;
        }
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i] ?? 0;
        }
        const avg = sum / buffer.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setLocalMicLevel(normalized);

        const isSpeaking = normalized > 12;
        setSpeakingUserIds((prev) => {
          const has = prev.has(localUser.id);
          if (isSpeaking && !has) {
            const next = new Set(prev);
            next.add(localUser.id);
            return next;
          } else if (!isSpeaking && has) {
            const next = new Set(prev);
            next.delete(localUser.id);
            return next;
          }
          return prev;
        });

        localAnimFrameRef.current = window.requestAnimationFrame(readLevel);
      };

      readLevel();
    } catch (e) {
      console.warn("Unable to start local audio analyser:", e);
    }
  }, [localUser.id]);

  // Synchronize composite stream with localStream state
  const syncLocalStream = useCallback(() => {
    const tracks: MediaStreamTrack[] = [];
    if (micTrackRef.current && micTrackRef.current.readyState === "live") {
      tracks.push(micTrackRef.current);
    }
    if (camTrackRef.current && camTrackRef.current.readyState === "live") {
      tracks.push(camTrackRef.current);
    }

    if (tracks.length > 0) {
      const stream = new MediaStream(tracks);
      localStreamRef.current = stream;
      setLocalStream(stream);

      // Add/replace tracks on all peers
      peersRef.current.forEach((pc) => {
        const senders = pc.getSenders();
        tracks.forEach((track) => {
          const sender = senders.find((s) => s.track?.kind === track.kind);
          if (sender) {
            sender.replaceTrack(track).catch(() => {});
          } else {
            pc.addTrack(track, stream);
          }
        });
      });
    } else {
      localStreamRef.current = null;
      setLocalStream(null);
    }
  }, []);

  // Initialize or update RTCPeerConnection for a remote peer
  const getOrCreatePeer = useCallback(
    (peerId: string) => {
      let pc = peersRef.current.get(peerId);
      if (pc) return pc;

      if (typeof window === "undefined" || !window.RTCPeerConnection) return null;

      pc = new RTCPeerConnection(rtcConfig);
      peersRef.current.set(peerId, pc);

      // Add current local tracks to new peer connection
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          if (localStreamRef.current && pc) {
            pc.addTrack(track, localStreamRef.current);
          }
        });
      }

      // ICE candidate handler
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal(peerId, "candidate", event.candidate.toJSON());
        }
      };

      // Remote stream handler
      pc.ontrack = (event) => {
        const stream = event.streams[0];
        if (stream) {
          setPeerStreams((prev) => {
            const filtered = prev.filter((p) => p.userId !== peerId);
            return [...filtered, { userId: peerId, stream }];
          });
          monitorRemoteSpeaking(peerId, stream);
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc && (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed")) {
          setPeerStreams((prev) => prev.filter((p) => p.userId !== peerId));
          setSpeakingUserIds((prev) => {
            if (prev.has(peerId)) {
              const next = new Set(prev);
              next.delete(peerId);
              return next;
            }
            return prev;
          });
        }
      };

      return pc;
    },
    [sendSignal, monitorRemoteSpeaking]
  );

  // Call peers when active users change (deterministic offerer by higher ID)
  useEffect(() => {
    if (!localStream) return;

    activeUsers.forEach((user) => {
      if (user.id === localUser.id) return;

      if (localUser.id > user.id) {
        const pc = getOrCreatePeer(user.id);
        if (!pc) return;

        if (pc.signalingState === "stable") {
          pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
            .then((offer) => pc.setLocalDescription(offer))
            .then(() => {
              if (pc.localDescription) {
                sendSignal(user.id, "offer", pc.localDescription);
              }
            })
            .catch(() => {});
        }
      }
    });
  }, [activeUsers, localUser.id, localStream, getOrCreatePeer, sendSignal]);

  // Clean up departed peers
  useEffect(() => {
    const activeIds = new Set(activeUsers.map((u) => u.id));
    peersRef.current.forEach((pc, peerId) => {
      if (!activeIds.has(peerId)) {
        try {
          pc.close();
        } catch {}
        peersRef.current.delete(peerId);
        setPeerStreams((prev) => prev.filter((p) => p.userId !== peerId));
      }
    });
  }, [activeUsers]);

  // Listen to Yjs Map signals
  useEffect(() => {
    if (!ydoc) return;
    const signalsMap = ydoc.getMap<RTCSignalMessage>("rtc-signals");

    const handleSignals = () => {
      signalsMap.forEach(async (signal, key) => {
        if (!signal || signal.to !== localUser.id || processedSignalsRef.current.has(signal.id)) {
          return;
        }

        // Clean up signals older than 25 seconds
        if (Date.now() - signal.timestamp > 25000) {
          try {
            signalsMap.delete(key);
          } catch {}
          return;
        }

        processedSignalsRef.current.add(signal.id);
        const { from, type, payload } = signal;
        const pc = getOrCreatePeer(from);
        if (!pc) return;

        try {
          if (type === "offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(payload));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendSignal(from, "answer", answer);
          } else if (type === "answer") {
            if (pc.signalingState === "have-local-offer") {
              await pc.setRemoteDescription(new RTCSessionDescription(payload));
            }
          } else if (type === "candidate") {
            if (pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(payload));
            }
          }
        } catch {
          // Handled gracefully
        }
      });
    };

    signalsMap.observe(handleSignals);
    handleSignals();

    return () => {
      signalsMap.unobserve(handleSignals);
    };
  }, [ydoc, localUser.id, getOrCreatePeer, sendSignal]);

  // Turn Mic ON or OFF independently
  const setMicActive = useCallback(
    async (active: boolean) => {
      if (typeof window === "undefined" || !navigator?.mediaDevices) return;

      if (active) {
        if (isMutedByHost) {
          toast.error("You are muted by the room host");
          return;
        }

        try {
          if (!micTrackRef.current || micTrackRef.current.readyState !== "live") {
            const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const track = audioStream.getAudioTracks()[0];
            if (track) {
              micTrackRef.current = track;
              track.enabled = true;
              startLocalAudioAnalysis(track);
            }
          } else {
            micTrackRef.current.enabled = true;
          }
          setIsMicOn(true);
          syncLocalStream();
        } catch (err: any) {
          console.warn("Unable to access microphone:", err);
          toast.error("Microphone access failed. Check permissions.");
          setIsMicOn(false);
        }
      } else {
        // Mute mic track (keep ready or stop)
        if (micTrackRef.current) {
          micTrackRef.current.enabled = false;
        }
        setIsMicOn(false);
        setLocalMicLevel(0);
        setSpeakingUserIds((prev) => {
          if (prev.has(localUser.id)) {
            const next = new Set(prev);
            next.delete(localUser.id);
            return next;
          }
          return prev;
        });
      }
    },
    [isMutedByHost, localUser.id, startLocalAudioAnalysis, syncLocalStream]
  );

  // Turn Camera ON or OFF independently
  const setCamActive = useCallback(
    async (active: boolean) => {
      if (typeof window === "undefined" || !navigator?.mediaDevices) return;

      if (active) {
        try {
          if (!camTrackRef.current || camTrackRef.current.readyState !== "live") {
            const videoStream = await navigator.mediaDevices.getUserMedia({
              video: { width: { ideal: 480 }, height: { ideal: 480 } },
            });
            const track = videoStream.getVideoTracks()[0];
            if (track) {
              camTrackRef.current = track;
              track.enabled = true;
            }
          } else {
            camTrackRef.current.enabled = true;
          }
          setIsCameraOn(true);
          syncLocalStream();
        } catch (err: any) {
          console.warn("Unable to access camera:", err);
          toast.error("Camera access failed. Check permissions or device in use.");
          setIsCameraOn(false);
        }
      } else {
        // Explicitly stop camera track to turn off camera hardware LED cleanly
        if (camTrackRef.current) {
          camTrackRef.current.stop();
          camTrackRef.current = null;
        }
        setIsCameraOn(false);
        syncLocalStream();
      }
    },
    [syncLocalStream]
  );

  const toggleMic = useCallback(() => {
    if (isMutedByHost) return;
    setMicActive(!isMicOn);
  }, [isMutedByHost, isMicOn, setMicActive]);

  const toggleCamera = useCallback(() => {
    setCamActive(!isCameraOn);
  }, [isCameraOn, setCamActive]);

  // Push to talk state changes
  const setPushToTalk = useCallback(
    (active: boolean) => {
      if (isMutedByHost) return;
      setIsPushToTalkActive(active);
      if (active) {
        setMicActive(true);
      } else if (!isMicOn) {
        setMicActive(false);
      }
    },
    [isMutedByHost, isMicOn, setMicActive]
  );

  // Force disable mic if muted by host
  useEffect(() => {
    if (isMutedByHost) {
      if (micTrackRef.current) {
        micTrackRef.current.enabled = false;
      }
      setIsMicOn(false);
      setIsPushToTalkActive(false);
      setLocalMicLevel(0);
    }
  }, [isMutedByHost]);

  // Keyboard shortcut listener: Hold 'V' key for Push-to-Talk
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isMutedByHost) return;
      if (e.key.toLowerCase() !== "v") return;
      if (e.repeat) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || target.isContentEditable || target.closest(".cm-editor")) {
        return;
      }

      setPushToTalk(true);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "v") {
        setPushToTalk(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isMutedByHost, setPushToTalk]);

  // Clean background toggle
  const toggleCleanBg = useCallback(() => {
    setCleanBg((prev) => !prev);
  }, []);

  // Cleanup on true component unmount ONLY
  useEffect(() => {
    return () => {
      if (micTrackRef.current) {
        micTrackRef.current.stop();
        micTrackRef.current = null;
      }
      if (camTrackRef.current) {
        camTrackRef.current.stop();
        camTrackRef.current = null;
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }
      peersRef.current.forEach((pc) => {
        try {
          pc.close();
        } catch {}
      });
      peersRef.current.clear();

      analysersRef.current.forEach(({ animId }) => {
        window.cancelAnimationFrame(animId);
      });
      analysersRef.current.clear();

      if (localAnimFrameRef.current) {
        window.cancelAnimationFrame(localAnimFrameRef.current);
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  return {
    localStream,
    peerStreams,
    isMicOn: isMicOn || isPushToTalkActive,
    isCameraOn,
    isPushToTalkActive,
    cleanBg,
    speakingUserIds,
    localMicLevel,
    toggleMic,
    toggleCamera,
    setPushToTalk,
    toggleCleanBg,
  };
}

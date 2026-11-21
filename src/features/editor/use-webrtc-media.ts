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
  isCamBlockedByHost?: boolean;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

export function useWebRTCMedia({
  ydoc,
  localUser,
  activeUsers,
  isMutedByHost = false,
  isCamBlockedByHost = false,
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

  // Per-peer connection management and perfect negotiation flags
  const peersRef = useRef<
    Map<
      string,
      {
        pc: RTCPeerConnection;
        makingOffer: boolean;
        ignoreOffer: boolean;
        isSettingRemoteAnswerPending: boolean;
      }
    >
  >(new Map());

  const processedSignalsRef = useRef<Set<string>>(new Set());
  const signalSeqRef = useRef<number>(0);

  // Web Audio analyser for local mic meter & remote speaking detectors
  const audioContextRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const localAnimFrameRef = useRef<number | null>(null);
  const analysersRef = useRef<Map<string, { analyser: AnalyserNode; animId: number }>>(new Map());

  // Helper to safely send signals over Yjs Map with unique non-colliding keys
  const sendSignal = useCallback(
    (to: string, type: "offer" | "answer" | "candidate", payload: any) => {
      if (!ydoc) return;
      const signalsMap = ydoc.getMap<RTCSignalMessage>("rtc-signals");
      const seq = ++signalSeqRef.current;
      const signalId = `${localUser.id}:${to}:${Date.now()}:${seq}`;
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
  const startLocalAudioAnalysis = useCallback(
    (track: MediaStreamTrack) => {
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
    },
    [localUser.id]
  );

  // Sync active local tracks to composite local stream and renegotiate on all peer connections
  const syncLocalStreamAndRenegotiate = useCallback(() => {
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
    } else {
      localStreamRef.current = null;
      setLocalStream(null);
    }

    // Attach, replace, or remove tracks on all peer connections
    peersRef.current.forEach(({ pc }) => {
      const currentSenders = pc.getSenders();

      // Check audio track
      const audioSender = currentSenders.find((s) => s.track?.kind === "audio");
      if (micTrackRef.current && micTrackRef.current.readyState === "live") {
        if (audioSender) {
          audioSender.replaceTrack(micTrackRef.current).catch(() => {});
        } else if (localStreamRef.current) {
          try {
            pc.addTrack(micTrackRef.current, localStreamRef.current);
          } catch {}
        }
      } else if (audioSender && audioSender.track) {
        try {
          pc.removeTrack(audioSender);
        } catch {}
      }

      // Check video track
      const videoSender = currentSenders.find((s) => s.track?.kind === "video");
      if (camTrackRef.current && camTrackRef.current.readyState === "live") {
        if (videoSender) {
          videoSender.replaceTrack(camTrackRef.current).catch(() => {});
        } else if (localStreamRef.current) {
          try {
            pc.addTrack(camTrackRef.current, localStreamRef.current);
          } catch {}
        }
      } else if (videoSender && videoSender.track) {
        try {
          pc.removeTrack(videoSender);
        } catch {}
      }
    });
  }, []);

  // Update remote streams state from a PC's received tracks
  const updateRemotePeerStream = useCallback(
    (peerId: string, pc: RTCPeerConnection) => {
      const receivers = pc.getReceivers();
      const liveTracks = receivers
        .map((r) => r.track)
        .filter((t): t is MediaStreamTrack => Boolean(t) && t.readyState === "live");

      if (liveTracks.length > 0) {
        const stream = new MediaStream(liveTracks);
        setPeerStreams((prev) => {
          const filtered = prev.filter((p) => p.userId !== peerId);
          return [...filtered, { userId: peerId, stream }];
        });
        monitorRemoteSpeaking(peerId, stream);
      } else {
        setPeerStreams((prev) => prev.filter((p) => p.userId !== peerId));
      }
    },
    [monitorRemoteSpeaking]
  );

  // Initialize or get RTCPeerConnection with Perfect Negotiation per peer
  const getOrCreatePeer = useCallback(
    (peerId: string) => {
      let entry = peersRef.current.get(peerId);
      if (entry) return entry.pc;

      if (typeof window === "undefined" || !window.RTCPeerConnection) return null;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      // Polite peer is deterministic: the one with alphabetically smaller ID
      const isPolite = localUser.id < peerId;

      const peerState = {
        pc,
        makingOffer: false,
        ignoreOffer: false,
        isSettingRemoteAnswerPending: false,
      };
      peersRef.current.set(peerId, peerState);

      // Add current active local tracks to new peer connection
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          if (localStreamRef.current) {
            try {
              pc.addTrack(track, localStreamRef.current);
            } catch {}
          }
        });
      }

      // ICE candidate handler
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          sendSignal(peerId, "candidate", candidate.toJSON());
        }
      };

      // Negotiation needed event (Perfect Negotiation)
      pc.onnegotiationneeded = async () => {
        try {
          peerState.makingOffer = true;
          await pc.setLocalDescription();
          if (pc.localDescription) {
            sendSignal(peerId, "offer", pc.localDescription);
          }
        } catch (err) {
          console.error("Negotiation offer error for", peerId, err);
        } finally {
          peerState.makingOffer = false;
        }
      };

      // Remote track handler
      pc.ontrack = (event) => {
        updateRemotePeerStream(peerId, pc);
        event.track.onunmute = () => updateRemotePeerStream(peerId, pc);
        event.track.onended = () => updateRemotePeerStream(peerId, pc);
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "disconnected" ||
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
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
    [localUser.id, sendSignal, updateRemotePeerStream]
  );

  // Sync peer connections with active users in the room
  useEffect(() => {
    activeUsers.forEach((user) => {
      if (user.id !== localUser.id) {
        getOrCreatePeer(user.id);
      }
    });

    // Clean up peers who left
    const activeIds = new Set(activeUsers.map((u) => u.id));
    peersRef.current.forEach(({ pc }, peerId) => {
      if (!activeIds.has(peerId)) {
        try {
          pc.close();
        } catch {}
        peersRef.current.delete(peerId);
        setPeerStreams((prev) => prev.filter((p) => p.userId !== peerId));
      }
    });
  }, [activeUsers, localUser.id, getOrCreatePeer]);

  // Listen to Yjs Map signals with Perfect Negotiation
  useEffect(() => {
    if (!ydoc) return;
    const signalsMap = ydoc.getMap<RTCSignalMessage>("rtc-signals");

    const handleSignals = () => {
      signalsMap.forEach(async (signal, key) => {
        if (!signal || signal.to !== localUser.id || processedSignalsRef.current.has(signal.id)) {
          return;
        }

        // Clean up stale signals older than 30 seconds
        if (Date.now() - signal.timestamp > 30000) {
          try {
            signalsMap.delete(key);
          } catch {}
          return;
        }

        processedSignalsRef.current.add(signal.id);
        const { from, type, payload } = signal;

        let peerState = peersRef.current.get(from);
        if (!peerState) {
          getOrCreatePeer(from);
          peerState = peersRef.current.get(from);
        }
        if (!peerState) return;

        const { pc } = peerState;
        const isPolite = localUser.id < from;

        try {
          if (type === "offer") {
            const offerCollision =
              peerState.makingOffer || pc.signalingState !== "stable";
            peerState.ignoreOffer = !isPolite && offerCollision;

            if (peerState.ignoreOffer) {
              return;
            }

            await pc.setRemoteDescription(new RTCSessionDescription(payload));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendSignal(from, "answer", answer);
          } else if (type === "answer") {
            if (pc.signalingState === "have-local-offer") {
              await pc.setRemoteDescription(new RTCSessionDescription(payload));
            }
          } else if (type === "candidate") {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(payload));
            } catch (err) {
              if (!peerState.ignoreOffer) {
                console.warn("Error adding ICE candidate:", err);
              }
            }
          }
        } catch (err) {
          console.warn("Signaling process error:", err);
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
          syncLocalStreamAndRenegotiate();
        } catch (err: any) {
          console.warn("Unable to access microphone:", err);
          toast.error("Microphone access failed. Check permissions.");
          setIsMicOn(false);
        }
      } else {
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
        syncLocalStreamAndRenegotiate();
      }
    },
    [isMutedByHost, localUser.id, startLocalAudioAnalysis, syncLocalStreamAndRenegotiate]
  );

  // Turn Camera ON or OFF independently
  const setCamActive = useCallback(
    async (active: boolean) => {
      if (typeof window === "undefined" || !navigator?.mediaDevices) return;

      if (active) {
        if (isCamBlockedByHost) {
          toast.error("Camera is disabled by the room host");
          return;
        }

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
          syncLocalStreamAndRenegotiate();
        } catch (err: any) {
          console.warn("Unable to access camera:", err);
          toast.error("Camera access failed. Check permissions or device in use.");
          setIsCameraOn(false);
        }
      } else {
        // Explicitly stop camera track to release device hardware
        if (camTrackRef.current) {
          camTrackRef.current.stop();
          camTrackRef.current = null;
        }
        setIsCameraOn(false);
        syncLocalStreamAndRenegotiate();
      }
    },
    [isCamBlockedByHost, syncLocalStreamAndRenegotiate]
  );

  const toggleMic = useCallback(() => {
    if (isMutedByHost) {
      toast.error("You are muted by the room host");
      return;
    }
    setMicActive(!isMicOn);
  }, [isMutedByHost, isMicOn, setMicActive]);

  const toggleCamera = useCallback(() => {
    if (isCamBlockedByHost) {
      toast.error("Camera is disabled by the room host");
      return;
    }
    setCamActive(!isCameraOn);
  }, [isCamBlockedByHost, isCameraOn, setCamActive]);

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
      syncLocalStreamAndRenegotiate();
    }
  }, [isMutedByHost, syncLocalStreamAndRenegotiate]);

  // Force disable camera if blocked by host
  useEffect(() => {
    if (isCamBlockedByHost) {
      if (camTrackRef.current) {
        camTrackRef.current.stop();
        camTrackRef.current = null;
      }
      setIsCameraOn(false);
      syncLocalStreamAndRenegotiate();
    }
  }, [isCamBlockedByHost, syncLocalStreamAndRenegotiate]);

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
      if (
        tag === "input" ||
        tag === "textarea" ||
        target.isContentEditable ||
        target.closest(".cm-editor")
      ) {
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
      peersRef.current.forEach(({ pc }) => {
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

import { useEffect, useRef, useState, useCallback } from "react";
import * as Y from "yjs";
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

  // References
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const processedSignalsRef = useRef<Set<string>>(new Set());
  const audioContextRef = useRef<AudioContext | null>(null);
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

  // Monitor speaking levels for audio streams
  const monitorSpeaking = useCallback((userId: string, stream: MediaStream) => {
    if (typeof window === "undefined") return;
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    try {
      if (!audioContextRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          audioContextRef.current = new AudioContextClass();
        }
      }
      const ctx = audioContextRef.current;
      if (!ctx || ctx.state === "closed") return;
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }

      // Disconnect existing analyser for this user if any
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
        const isSpeaking = avg > 12;

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

  // Initialize or update RTCPeerConnection for a remote peer
  const getOrCreatePeer = useCallback(
    (peerId: string) => {
      let pc = peersRef.current.get(peerId);
      if (pc) return pc;

      if (typeof window === "undefined" || !window.RTCPeerConnection) return null;

      pc = new RTCPeerConnection(rtcConfig);
      peersRef.current.set(peerId, pc);

      // Add local tracks to new peer connection
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
          monitorSpeaking(peerId, stream);
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
    [sendSignal, monitorSpeaking]
  );

  // Call peers when active users change (deterministic offerer by ID)
  useEffect(() => {
    if (!localStream) return;

    activeUsers.forEach((user) => {
      if (user.id === localUser.id) return;

      // Higher ID creates the offer to avoid duplicate collisions
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
        // Only process signals destined for localUser that haven't been processed yet
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
          // Handle SDP negotiation edge cases gracefully
        }
      });
    };

    signalsMap.observe(handleSignals);
    handleSignals();

    return () => {
      signalsMap.unobserve(handleSignals);
    };
  }, [ydoc, localUser.id, getOrCreatePeer, sendSignal]);

  // Handle media hardware track enablement
  const updateTracks = useCallback(async (wantMic: boolean, wantCam: boolean) => {
    if (typeof window === "undefined" || !navigator?.mediaDevices) return;

    let current = localStreamRef.current;

    // If we don't have a stream and user wants either mic or camera, request media
    if (!current && (wantMic || wantCam)) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: wantCam ? { width: { ideal: 480 }, height: { ideal: 480 } } : true,
        });

        localStreamRef.current = stream;
        setLocalStream(stream);

        // Apply enabled states
        stream.getAudioTracks().forEach((track) => {
          track.enabled = wantMic && !isMutedByHost;
        });
        stream.getVideoTracks().forEach((track) => {
          track.enabled = wantCam;
        });

        // Add to all active peer connections
        peersRef.current.forEach((pc) => {
          stream.getTracks().forEach((track) => {
            pc.addTrack(track, stream);
          });
        });

        monitorSpeaking(localUser.id, stream);
      } catch (err) {
        console.warn("Unable to access user media devices:", err);
        return;
      }
    } else if (current) {
      // Stream already exists, toggle track states
      current.getAudioTracks().forEach((track) => {
        track.enabled = wantMic && !isMutedByHost;
      });
      current.getVideoTracks().forEach((track) => {
        track.enabled = wantCam;
      });
    }
  }, [isMutedByHost, localUser.id, monitorSpeaking]);

  // Toggle Microphone
  const toggleMic = useCallback(() => {
    if (isMutedByHost) return;
    setIsMicOn((prev) => {
      const next = !prev;
      updateTracks(next || isPushToTalkActive, isCameraOn);
      return next;
    });
  }, [isMutedByHost, isPushToTalkActive, isCameraOn, updateTracks]);

  // Toggle Camera
  const toggleCamera = useCallback(() => {
    setIsCameraOn((prev) => {
      const next = !prev;
      updateTracks(isMicOn || isPushToTalkActive, next);
      return next;
    });
  }, [isMicOn, isPushToTalkActive, updateTracks]);

  // Force disable mic if muted by host
  useEffect(() => {
    if (isMutedByHost) {
      setIsMicOn(false);
      setIsPushToTalkActive(false);
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
      }
    }
  }, [isMutedByHost]);

  // Push to talk state changes
  const setPushToTalk = useCallback(
    (active: boolean) => {
      if (isMutedByHost) return;
      setIsPushToTalkActive(active);
      updateTracks(active || isMicOn, isCameraOn);
    },
    [isMutedByHost, isMicOn, isCameraOn, updateTracks]
  );

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
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
    toggleMic,
    toggleCamera,
    setPushToTalk,
    toggleCleanBg,
  };
}

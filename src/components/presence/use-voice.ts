"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voice pipeline (client side) — REAL microphone + Web Speech API.
 *
 * LISTEN  : SpeechRecognition (continuous) with wake word "ultron" + PTT
 * VU      : getUserMedia → AnalyserNode → amplitude ref (drives the core)
 * SPEAK   : speechSynthesis with a chosen natural voice + speaking envelope
 * BARGE-IN: interim transcripts containing "stop" cancel speech immediately
 *
 * Nothing is simulated: when an API is missing (Firefox STT etc.) the hook
 * reports capability=false and the UI degrades to typed text honestly.
 */

type SRConstructor = new () => SpeechRecognitionLike;

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
}

interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

export interface VoiceState {
  sttSupported: boolean;
  ttsSupported: boolean;
  micEnabled: boolean;
  listening: boolean;
  awake: boolean; // wake word consumed, awaiting/acting on a command
  speaking: boolean;
  speechError: string | null;
  transcript: string;
  interim: string;
}

interface VoiceHandlers {
  onCommand: (text: string) => void;
  onSayEvent: (type: string) => void;
}

export function useVoice(
  amplitudeRef: React.RefObject<number>,
  handlers: VoiceHandlers,
) {
  const [state, setState] = useState<VoiceState>({
    sttSupported: false,
    ttsSupported: typeof window !== "undefined" && "speechSynthesis" in window,
    micEnabled: false,
    listening: false,
    awake: false,
    speaking: false,
    speechError: null,
    transcript: "",
    interim: "",
  });

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wantListeningRef = useRef(false);
  const awakeRef = useRef(false);
  const speakingRef = useRef(false);
  const envelopeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const emit = useCallback((type: string) => {
    handlersRef.current.onSayEvent(type);
  }, []);

  /* ------------------------------- TTS ----------------------------------- */

  const stopEnvelope = useCallback(() => {
    if (envelopeRef.current) clearInterval(envelopeRef.current);
    envelopeRef.current = null;
    speakingRef.current = false;
    setState((s) => ({ ...s, speaking: false }));
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      stopEnvelope();

      const chunks = text.match(/[^.!?]+[.!?]?/g) ?? [text];
      let index = 0;

      const voice = pickVoice(synth.getVoices());
      const sayNext = () => {
        if (index >= chunks.length) {
          emit("speaking_finished");
          stopEnvelope();
          return;
        }
        const utter = new SpeechSynthesisUtterance(chunks[index].trim());
        utter.rate = 1.04;
        utter.pitch = 0.86;
        if (voice) utter.voice = voice;
        if (index === 0) emit("speaking_started");
        speakingRef.current = true;
        setState((s) => ({ ...s, speaking: true }));
        // voice envelope drives the visual while speaking
        if (!envelopeRef.current) {
          envelopeRef.current = setInterval(() => {
            if (amplitudeRef.current !== null) {
              amplitudeRef.current = 0.35 + Math.random() * 0.55;
            }
          }, 90);
        }
        utter.onend = () => {
          index += 1;
          sayNext();
        };
        utter.onerror = () => {
          index += 1;
          sayNext();
        };
        synth.speak(utter);
      };
      sayNext();
    },
    [amplitudeRef, emit, stopEnvelope],
  );

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    emit("speaking_finished");
    stopEnvelope();
  }, [emit, stopEnvelope]);

  /* ------------------------------- STT ----------------------------------- */

  const buildRecognition = useCallback((): SpeechRecognitionLike | null => {
    if (typeof window === "undefined") return null;
    const w = window as unknown as {
      SpeechRecognition?: SRConstructor;
      webkitSpeechRecognition?: SRConstructor;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    return rec;
  }, []);

  const handleResult = useCallback(
    (event: SpeechResultEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        if (!result.isFinal) {
          interim += transcript;
          // barge-in: interrupt ULTRON mid-speech
          if (speakingRef.current && /\bstop\b/i.test(transcript)) {
            stopSpeaking();
          }
          continue;
        }
        const finalText = transcript.trim();
        if (!finalText) continue;
        emit("speech_detected");
        emit("transcription_ready");

        const wakeMatch = /^(?:hey\s+)?ultron[,.\s]*(.*)$/i.exec(finalText);
        if (!awakeRef.current) {
          if (wakeMatch) {
            awakeRef.current = true;
            setState((s) => ({ ...s, awake: true }));
            emit("wake_detected");
            const rest = (wakeMatch[1] ?? "").trim();
            if (!rest) {
              handlersRef.current.onCommand("ultron"); // bare wake → affirmation
            } else {
              handlersRef.current.onCommand(rest);
            }
            setTimeout(() => {
              awakeRef.current = false;
              setState((s) => ({ ...s, awake: false }));
            }, 9000);
          }
          // not awake + no wake word → ignore (privacy: nothing sent)
        } else {
          handlersRef.current.onCommand(finalText);
          awakeRef.current = false;
          setState((s) => ({ ...s, awake: false }));
        }
      }
      setState((s) => ({ ...s, interim }));
    },
    [emit, stopSpeaking],
  );

  const startListening = useCallback(async () => {
    const rec = recognitionRef.current ?? buildRecognition();
    if (!rec) {
      setState((s) => ({
        ...s,
        speechError:
          "Speech recognition isn't available in this browser. Text input still works.",
      }));
      return false;
    }
    recognitionRef.current = rec;
    wantListeningRef.current = true;

    // VU amplitude capture (permission-gated)
    try {
      if (!streamRef.current) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
      }
      audioCtxRef.current ??= new AudioContext();
      const ctxAudio = audioCtxRef.current;
      if (ctxAudio.state === "suspended") await ctxAudio.resume();
      const source = ctxAudio.createMediaStreamSource(streamRef.current);
      const analyser = ctxAudio.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!wantListeningRef.current) return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          sum += Math.abs(data[i] - 128);
        }
        if (amplitudeRef.current !== null && !speakingRef.current) {
          amplitudeRef.current = Math.min(1, (sum / data.length / 128) * 4);
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      setState((s) => ({ ...s, micEnabled: true }));
    } catch {
      setState((s) => ({
        ...s,
        speechError:
          "Microphone permission was denied. Voice reactivity is off; text still works.",
      }));
    }

    rec.onresult = handleResult;
    rec.onerror = (e) => {
      const code = e.error ?? "";
      if (!code || code === "no-speech" || code === "aborted") return;
      const friendly: Record<string, string> = {
        "not-allowed":
          "Microphone is blocked. Click the lock icon in the address bar and allow the microphone.",
        "service-not-allowed":
          "Speech service is blocked for this browser or profile.",
        network:
          "Speech recognition needs internet: the browser's speech service is unreachable right now.",
        "audio-capture":
          "No microphone found. Check Windows Settings → System → Sound → Input.",
        "language-not-supported":
          "en-US recognition isn't supported by this browser.",
      };
      setState((s) => ({
        ...s,
        speechError: friendly[code] ?? `speech recognition error: ${code}`,
      }));
    };
    rec.onend = () => {
      setState((s) => ({ ...s, listening: false }));
      if (wantListeningRef.current) {
        try {
          rec.start();
        } catch {
          /* already started */
        }
      }
    };
    try {
      rec.start();
      setState((s) => ({ ...s, listening: true }));
      emit("listening_started");
      return true;
    } catch {
      return false;
    }
  }, [amplitudeRef, buildRecognition, emit, handleResult]);

  const stopListening = useCallback(() => {
    wantListeningRef.current = false;
    recognitionRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setState((s) => ({ ...s, listening: false, micEnabled: false, awake: false }));
  }, []);

  /** Push-to-talk: force-awake for one command. */
  const pushToTalk = useCallback(() => {
    awakeRef.current = true;
    setState((s) => ({ ...s, awake: true }));
    emit("wake_detected");
    setTimeout(() => {
      awakeRef.current = false;
      setState((s) => ({ ...s, awake: false }));
    }, 9000);
    void startListening();
  }, [emit, startListening]);

  useEffect(() => {
    const supported = Boolean(
      typeof window !== "undefined" &&
        ((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
          (window as unknown as { webkitSpeechRecognition?: unknown })
            .webkitSpeechRecognition),
    );
    setState((s) => ({ ...s, sttSupported: supported }));
    return () => {
      wantListeningRef.current = false;
      recognitionRef.current?.abort();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (envelopeRef.current) clearInterval(envelopeRef.current);
    };
  }, []);

  return {
    ...state,
    startListening,
    stopListening,
    pushToTalk,
    speak,
    stopSpeaking,
  };
}

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const score = (v: SpeechSynthesisVoice): number => {
    let s = 0;
    const name = v.name.toLowerCase();
    if (v.lang.toLowerCase().startsWith("en")) s += 3;
    if (/male|daniel|david|alex|fred|george|guy|ryan/.test(name)) s += 2;
    if (/google uk english male|microsoft (guy|christopher|eric)/.test(name)) s += 3;
    if (/natural|neural|premium|enhanced/.test(name)) s += 1;
    return s;
  };
  return [...voices].sort((a, b) => score(b) - score(a))[0];
}

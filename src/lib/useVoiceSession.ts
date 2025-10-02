// src/hooks/useVoiceAssistant.ts
// Hook robusto para voz (Reconocimiento + TTS) con manejo completo de estados y limpieza.
//
// Uso:
// const va = useVoiceAssistant(async (text) => "respuesta");
// va.startListening(); va.stop();
//
// Estados internos: 'idle' | 'listening' | 'thinking' | 'speaking'
// Garantiza volver a 'idle' en onend/onerror/cancel y en timeouts de seguridad.

import { useCallback, useEffect, useRef, useState } from "react";

export type VoicePhase = "idle" | "listening" | "thinking" | "speaking";
type OnAsk = (text: string) => Promise<string> | string;

type Options = {
    lang?: string;            // e.g. 'es-MX' | 'es-ES'
    voiceName?: string;       // nombre exacto de la voz TTS si la quieres fijar
    minSpeechChars?: number;  // mínimo de caracteres para considerar que hubo entrada (default 2)
    speakTimeoutMs?: number;  // timeout de seguridad para TTS (default 45000)
};

declare global {
    interface Window {
        webkitSpeechRecognition?: any;
        SpeechRecognition?: any;
    }
}

function getRecognitionCtor(): any | null {
    return (
        (typeof window !== "undefined" && (window as any).SpeechRecognition) ||
        (typeof window !== "undefined" && (window as any).webkitSpeechRecognition) ||
        null
    );
}

function pickVoice(lang: string, desiredName?: string): SpeechSynthesisVoice | null {
    const list = window.speechSynthesis?.getVoices?.() ?? [];
    if (desiredName) {
        const exact = list.find((v) => v.name === desiredName);
        if (exact) return exact;
    }
    // Prioriza por lang
    const byLang = list.find((v) => (v.lang || "").toLowerCase().startsWith(lang.toLowerCase()));
    return byLang || list[0] || null;
}

export function useVoiceAssistant(onAsk: OnAsk, opts?: Options) {
    const lang = opts?.lang ?? "es-MX";
    const voiceName = opts?.voiceName;
    const minSpeechChars = typeof opts?.minSpeechChars === "number" ? opts!.minSpeechChars! : 2;
    const speakTimeoutMs = typeof opts?.speakTimeoutMs === "number" ? opts!.speakTimeoutMs! : 45000;

    const [phase, setPhase] = useState<VoicePhase>("idle");
    const [lastUserText, setLastUserText] = useState<string>("");
    const [lastReply, setLastReply] = useState<string>("");

    const recogRef = useRef<any>(null);
    const listeningRef = useRef<boolean>(false);
    const ttsEndTimerRef = useRef<number | null>(null);

    // Cancela cualquier síntesis activa
    const cancelSpeaking = useCallback(() => {
        try {
            window.speechSynthesis?.cancel();
        } catch { }
        if (ttsEndTimerRef.current) {
            window.clearTimeout(ttsEndTimerRef.current);
            ttsEndTimerRef.current = null;
        }
    }, []);

    // Limpia reconocimiento
    const teardownRecognition = useCallback(() => {
        try {
            if (recogRef.current) {
                recogRef.current.onresult = null;
                recogRef.current.onerror = null;
                recogRef.current.onend = null;
                try { recogRef.current.stop(); } catch { }
            }
        } catch { }
        recogRef.current = null;
        listeningRef.current = false;
    }, []);

    // Detener todo y volver a idle
    const stop = useCallback(() => {
        cancelSpeaking();
        teardownRecognition();
        setPhase("idle");
    }, [cancelSpeaking, teardownRecognition]);

    // Inicia reconocimiento -> procesa -> TTS
    const startListening = useCallback(() => {
        // Si estaba hablando, cancela y espera un poco antes de escuchar
        cancelSpeaking();

        const Ctor = getRecognitionCtor();
        if (!Ctor) {
            setPhase("idle");
            console.warn("[Voice] SpeechRecognition no disponible en este navegador.");
            return;
        }

        // Evita doble start
        if (listeningRef.current) return;

        // Nueva instancia cada inicio (evita handlers zombies)
        const recog = new Ctor();
        recogRef.current = recog;

        recog.lang = lang;
        recog.interimResults = false;
        recog.continuous = false;
        recog.maxAlternatives = 1;

        listeningRef.current = true;
        setPhase("listening");

        recog.onresult = async (ev: any) => {
            try {
                const transcript: string = (ev?.results?.[0]?.[0]?.transcript ?? "").trim();
                listeningRef.current = false;
                setLastUserText(transcript);
                setPhase("thinking");

                if (transcript.length < minSpeechChars) {
                    setPhase("idle");
                    return;
                }

                // Procesar con onAsk
                let reply: string = "";
                try {
                    const r = await onAsk(transcript);
                    reply = (r ?? "").toString();
                } catch (e) {
                    console.error("[Voice] onAsk error:", e);
                    reply = "Ocurrió un error al generar la respuesta.";
                }
                setLastReply(reply);

                // TTS
                if (reply && typeof window !== "undefined" && window.speechSynthesis) {
                    setPhase("speaking");
                    const utter = new SpeechSynthesisUtterance(reply);
                    utter.lang = lang;
                    const v = pickVoice(lang, voiceName);
                    if (v) utter.voice = v;

                    // Asegura volver a idle
                    utter.onend = () => {
                        if (ttsEndTimerRef.current) {
                            window.clearTimeout(ttsEndTimerRef.current);
                            ttsEndTimerRef.current = null;
                        }
                        setPhase("idle");
                    };
                    utter.onerror = () => {
                        if (ttsEndTimerRef.current) {
                            window.clearTimeout(ttsEndTimerRef.current);
                            ttsEndTimerRef.current = null;
                        }
                        setPhase("idle");
                    };

                    // Timeout de seguridad por si onend no dispara (algunos browsers)
                    const estMs = Math.min(speakTimeoutMs, Math.max(5000, reply.length * 55));
                    ttsEndTimerRef.current = window.setTimeout(() => {
                        try { window.speechSynthesis?.cancel(); } catch { }
                        setPhase("idle");
                    }, estMs);

                    try {
                        window.speechSynthesis.cancel(); // limpio antes de hablar
                        window.speechSynthesis.speak(utter);
                    } catch {
                        setPhase("idle");
                    }
                } else {
                    setPhase("idle");
                }
            } finally {
                try { recog.stop(); } catch { }
            }
        };

        recog.onerror = (_e: any) => {
            listeningRef.current = false;
            setPhase("idle");
        };

        recog.onend = () => {
            // Si terminó sin resultado, vuelve a idle
            if (phase === "listening") setPhase("idle");
            listeningRef.current = false;
        };

        try {
            recog.start();
        } catch (e) {
            console.warn("[Voice] recog.start() error:", e);
            listeningRef.current = false;
            setPhase("idle");
        }
    }, [cancelSpeaking, lang, minSpeechChars, onAsk, phase, speakTimeoutMs, voiceName]);

    // Limpieza al desmontar
    useEffect(() => {
        return () => {
            stop();
        };
    }, [stop]);

    return {
        phase,
        lastUserText,
        lastReply,
        startListening,
        stop,            // cancela TTS + recognition y vuelve a idle
        cancelSpeaking,  // solo TTS
    };
}

export type VoiceStatus = VoicePhase;

type SessionOptions = {
    lang?: string;
    voiceName?: string;
    speakTimeoutMs?: number;
};

export function useVoiceSession(onAsk?: OnAsk, options?: SessionOptions) {
    const [status, setStatus] = useState<VoiceStatus>("idle");
    const [lastUserText, setLastUserText] = useState<string | null>(null);
    const [lastAnswer, setLastAnswer] = useState<string | null>(null);

    const assistant = useVoiceAssistant(
        async (userText: string) => {
            setLastUserText(userText);
            setStatus("thinking");
            try {
                const reply = onAsk ? await onAsk(userText) : "";
                const text = typeof reply === "string" ? reply : String(reply ?? "");
                setLastAnswer(text);
                return text; // el hook base pasa a "speaking" y luego a "idle"
            } catch (err) {
                console.error("VoiceSession onAsk error:", err);
                const msg = "⚠️ Error generando la respuesta.";
                setLastAnswer(msg);
                return msg;
            }
        },
        {
            lang: options?.lang ?? "es-MX",
            voiceName: options?.voiceName,
            speakTimeoutMs: options?.speakTimeoutMs ?? 45000,
        }
    );

    useEffect(() => {
        setStatus(assistant.phase);
    }, [assistant.phase]);

    const startListening = useCallback(() => assistant.startListening(), [assistant]);
    const stopListening = useCallback(() => assistant.stop(), [assistant]);
    const reset = useCallback(() => {
        assistant.stop();
        setLastUserText(null);
        setLastAnswer(null);
        setStatus("idle");
    }, [assistant]);

    return { status, lastUserText, lastAnswer, startListening, stopListening, reset };
}

// ✅ también export default, por si prefieres importar sin llaves
export default useVoiceSession;

// src/hooks/useVoiceAssistant.ts
import { useEffect, useRef, useState } from "react";

export type VoiceAssistantStatus = "idle" | "listening" | "thinking" | "speaking";

// Ajusta si prefieres "es-MX" / "es-CO"
const STT_LANG = "es-ES";
const TTS_LANG = "es-ES";

export function useVoiceAssistant() {
    const [status, setStatus] = useState<VoiceAssistantStatus>("idle");
    const [transcript, setTranscript] = useState("");
    const recognitionRef = useRef<any>(null);
    const spanishVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
    const silenceTimerRef = useRef<number | null>(null);

    // Elegir voz española para TTS
    useEffect(() => {
        function pickSpanishVoice() {
            if (!("speechSynthesis" in window)) return;
            const voices = window.speechSynthesis.getVoices();
            spanishVoiceRef.current =
                voices.find(v => v.lang?.toLowerCase().startsWith("es")) || null;
        }
        pickSpanishVoice();
        if ("speechSynthesis" in window) {
            window.speechSynthesis.onvoiceschanged = pickSpanishVoice;
        }
    }, []);

    function clearSilenceTimer() {
        if (silenceTimerRef.current) {
            window.clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
        }
    }

    /** Pre-chequeo del micrófono para forzar permiso y detectar errores tempranos */
    async function ensureMicPermission(): Promise<boolean> {
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
            return true;
        } catch (e: any) {
            console.error("[Voice] getUserMedia error:", e?.name || e);
            alert(
                "No se pudo acceder al micrófono.\n" +
                "Revisa permisos del navegador para este sitio (Microphone: Allow)."
            );
            return false;
        }
    }

    /** Comienza a escuchar y llama onResult(text) cuando haya transcripción */
    const startListening = async (onResult?: (text: string) => void) => {
        const SpeechRecognitionClass =
            (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

        if (!SpeechRecognitionClass) {
            console.warn("[Voice] SpeechRecognition no soportado en este navegador.");
            alert("Tu navegador no soporta reconocimiento de voz (prueba Chrome).");
            return;
        }

        // Pide permiso explícito antes de crear/arrancar el recognizer
        const ok = await ensureMicPermission();
        if (!ok) return;

        // Si hay una sesión previa, deténla
        try {
            recognitionRef.current?.abort?.();
            recognitionRef.current?.stop?.();
        } catch { }
        clearSilenceTimer();

        // Crear nueva instancia
        const recognition = new SpeechRecognitionClass();
        recognition.lang = STT_LANG;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.continuous = false;

        // Handlers con logging detallado
        recognition.onstart = () => {
            console.log("[Voice] onstart");
            setStatus("listening");
            // Timeout anti-silencio (p. ej., 8s sin resultado)
            clearSilenceTimer();
            silenceTimerRef.current = window.setTimeout(() => {
                console.warn("[Voice] Timeout sin resultado (no-speech)");
                try { recognition.stop(); } catch { }
            }, 8000);
        };
        recognition.onaudiostart = () => console.log("[Voice] onaudiostart");
        recognition.onsoundstart = () => console.log("[Voice] onsoundstart");
        recognition.onspeechstart = () => console.log("[Voice] onspeechstart");

        recognition.onresult = (event: any) => {
            // Limpia el timeout
            clearSilenceTimer();

            console.log("[Voice] onresult:", event);
            const alt = event?.results?.[0]?.[0];
            const text = (alt?.transcript ?? "").trim();
            console.log("[Voice] transcript:", text);
            setTranscript(text);
            setStatus("idle");
            if (text) onResult?.(text);
        };

        recognition.onerror = (event: any) => {
            clearSilenceTimer();
            console.error("[Voice] onerror:", event?.error, event);
            setStatus("idle");
            // Errores típicos:
            // - "not-allowed" / "service-not-allowed": permiso denegado
            // - "no-speech": no se detectó voz
            // - "audio-capture": no hay micrófono disponible
            if (event?.error === "not-allowed" || event?.error === "service-not-allowed") {
                alert("Permiso de micrófono denegado. Habilítalo en la barra de direcciones.");
            }
        };

        recognition.onend = () => {
            console.log("[Voice] onend");
            clearSilenceTimer();
            if (status === "listening") setStatus("idle");
        };

        recognitionRef.current = recognition;

        try {
            console.log("[Voice] recognition.start()");
            recognition.start();
        } catch (err) {
            console.error("[Voice] Error al iniciar reconocimiento:", err);
            setStatus("idle");
        }
    };

    const stopListening = () => {
        console.log("[Voice] stopListening()");
        clearSilenceTimer();
        try {
            recognitionRef.current?.stop?.();
            recognitionRef.current?.abort?.();
        } catch (e) {
            console.warn("[Voice] stopListening error", e);
        }
        setStatus("idle");
    };

    /** Síntesis de voz (TTS) en español */
    const speak = (text: string) => {
        if (!("speechSynthesis" in window)) {
            console.warn("[Voice] speechSynthesis no soportado.");
            return;
        }
        setStatus("speaking");
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = TTS_LANG;
        if (spanishVoiceRef.current) {
            utter.voice = spanishVoiceRef.current;
        }
        utter.onend = () => setStatus("idle");
        console.log("[Voice] speak()", { text, voice: utter.voice?.name, lang: utter.lang });
        window.speechSynthesis.speak(utter);
    };

    return {
        status,
        transcript,
        startListening,
        stopListening,
        speak,
    };
}

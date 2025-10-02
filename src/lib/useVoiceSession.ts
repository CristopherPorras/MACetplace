// src/lib/useVoiceSession.ts
import { useCallback, useState } from "react";
import { useVoiceAssistant } from "@/hooks/useVoiceAssistant";

export type VoiceStatus = "idle" | "listening" | "thinking" | "speaking";

/** Tu callback de IA: recibe el texto del usuario y debe devolver la respuesta */
type OnAsk = (text: string) => Promise<string>;

/** Mensajes para historial simple (útil en VoicePanel) */
export type VoiceMsg = { role: "user" | "assistant"; content: string };

export function useVoiceSession(onAsk?: OnAsk) {
    // Estado público de la sesión
    const [status, setStatus] = useState<VoiceStatus>("idle");
    const [lastUserText, setLastUserText] = useState<string>("");
    const [lastAnswer, setLastAnswer] = useState<string>("");
    const [messages, setMessages] = useState<VoiceMsg[]>([]);

    // Hook base de voz (STT/TTS)
    const assistant = useVoiceAssistant();

    /** Inicia la escucha y resuelve el turno completo: escuchar → pensar → responder → (hablar) */
    const startListening = useCallback(() => {
        setStatus("listening");

        // Le pasamos un handler a la instancia cuando llegue la transcripción
        assistant.startListening?.(async (raw: string) => {
            const userText = (raw ?? "").trim();
            if (!userText) {
                setStatus("idle");
                return;
            }

            setLastUserText(userText);
            setMessages((m) => [...m, { role: "user", content: userText }]);
            setStatus("thinking");

            let reply = "";
            if (onAsk) {
                try {
                    const out = await onAsk(userText);
                    reply = (out ?? "").trim();
                } catch (err) {
                    console.error("[useVoiceSession] onAsk error:", err);
                    reply = ""; // dejar que caiga en fallback visual (no hablar)
                }
            }

            if (reply) {
                setLastAnswer(reply);
                setMessages((m) => [...m, { role: "assistant", content: reply }]);

                // Intentar hablar la respuesta
                try {
                    setStatus("speaking");
                    assistant.speak?.(reply);
                } catch {
                    setStatus("idle");
                }
            } else {
                // Sin respuesta del modelo
                setLastAnswer("");
                setStatus("idle");
            }
        });
    }, [assistant, onAsk]);

    /** Detiene la escucha si está soportado y resetea status a idle */
    const stopListening = useCallback(() => {
        try {
            assistant.stopListening?.();
        } finally {
            setStatus("idle");
        }
    }, [assistant]);

    /** Limpia historial y estados de último turno */
    const reset = useCallback(() => {
        setLastUserText("");
        setLastAnswer("");
        setMessages([]);
        setStatus("idle");
    }, []);

    return {
        // Estado principal
        status,
        lastUserText,
        lastAnswer,
        messages,

        // Métodos
        startListening,
        stopListening,
        reset,

        // Aliases para compatibilidad con tu UI
        start: startListening,
        stop: stopListening,
        userText: lastUserText,
        answer: lastAnswer,

        // Extras útiles
        transcript: (assistant as any)?.transcript as string | undefined,
        speak: assistant.speak?.bind(assistant),
    };
}

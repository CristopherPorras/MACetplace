// src/lib/useVoiceAssistant.ts
import { useState } from "react";

type VoiceStatus = "idle" | "listening" | "thinking" | "speaking";

export function useVoiceAssistant(onUserText: (text: string) => Promise<string>) {
    const [status, setStatus] = useState<VoiceStatus>("idle");
    const [lastUserText, setLastUserText] = useState("");
    const [lastAnswer, setLastAnswer] = useState("");

    function speak(text: string) {
        const utter = new SpeechSynthesisUtterance(text);
        utter.onend = () => setStatus("idle");
        setStatus("speaking");
        speechSynthesis.speak(utter);
    }

    function startListening() {
        const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
        if (!SR) {
            alert("Tu navegador no soporta SpeechRecognition (prueba Chrome).");
            return;
        }

        const rec = new SR();
        rec.lang = "en-US";          // puedes cambiar a "es-CO" si quieres
        rec.interimResults = false;
        rec.maxAlternatives = 1;

        rec.onstart = () => setStatus("listening");
        rec.onerror = () => setStatus("idle");
        rec.onresult = async (e: any) => {
            const text = e.results[0][0].transcript as string;
            setLastUserText(text);
            setStatus("thinking");
            const answer = await onUserText(text);
            setLastAnswer(answer);
            speak(answer);
        };

        rec.start();
    }

    return { status, lastUserText, lastAnswer, startListening };
}

// src/types/speech-recognition.d.ts
export { };

declare global {
    interface Window {
        webkitSpeechRecognition?: any;
        SpeechRecognition?: any;
    }

    // Tipos mínimos para lo que usas en onresult
    interface SpeechRecognitionAlternative {
        transcript: string;
        confidence?: number;
    }

    interface SpeechRecognitionResult {
        [index: number]: SpeechRecognitionAlternative;
        length: number;
        isFinal?: boolean;
    }

    interface SpeechRecognitionResultList {
        [index: number]: SpeechRecognitionResult;
        length: number;
    }

    interface SpeechRecognitionEvent extends Event {
        results: SpeechRecognitionResultList;
        resultIndex?: number;
    }
}

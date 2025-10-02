// src/lib/embeddings.ts
// Genera embeddings con Gemini text-embedding-004

export type EmbeddingType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
const MODEL = "text-embedding-004"; // 768 dims
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

if (!API_KEY) {
    console.warn("[Embeddings] Falta VITE_GEMINI_API_KEY; no podrás indexar ni buscar contexto.");
}

/** Devuelve un vector (number[]) para un texto dado */
export async function embedText(text: string, type: EmbeddingType): Promise<number[]> {
    if (!API_KEY) throw new Error("Falta VITE_GEMINI_API_KEY");

    const url = `${API_BASE}/models/${MODEL}:embedContent?key=${API_KEY}`;

    const body = {
        model: MODEL,
        taskType: type, // "RETRIEVAL_DOCUMENT" o "RETRIEVAL_QUERY"
        content: { parts: [{ text }] },
    };

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    const raw = await res.text();
    let data: any = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { }

    if (!res.ok) {
        const msg = data?.error?.message || `HTTP ${res.status} ${res.statusText}`;
        throw new Error(`[Embeddings] ${msg}`);
    }

    // Respuesta: { embedding: { values: number[] } }
    const vec =
        data?.embedding?.values ||
        (Array.isArray(data?.embeddings) && data.embeddings[0]?.values) ||
        null;

    if (!Array.isArray(vec)) {
        throw new Error("[Embeddings] No se recibió 'values' en la respuesta");
    }

    return vec as number[];
}

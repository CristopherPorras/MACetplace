// src/lib/llm.ts
// Cliente robusto para Gemini API (REST)
// - Fuerza español
// - Usa endpoint v1beta (oficial para REST)
// - Modelos actuales: gemini-2.0-flash / gemini-2.5-flash / gemini-2.5-pro

type GenConfig = {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
};

const DEFAULT_GEN_CONFIG: GenConfig = {
    temperature: 0.2,
    topP: 0.9,
    topK: 40,
    maxOutputTokens: 300,
};

const SYSTEM_PREFIX = `
Eres un asistente útil y SIEMPRE respondes en español claro y conciso.
No inventes datos. Si faltan, dilo y ofrece alternativas.
`.trim();

// Modelos candidatos (orden sugerido: rápido → potente)
const CANDIDATE_MODELS = [
    (import.meta.env.VITE_GEMINI_MODEL as string | undefined)?.trim(),
    "gemini-2.0-flash",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
].filter(Boolean) as string[];

// Endpoint REST correcto (v1beta)
const API_VERSION = "v1beta";

async function callOnce(
    apiKey: string,
    model: string,
    prompt: string,
    genConfig: GenConfig
) {
    const url = `https://generativelanguage.googleapis.com/${API_VERSION}/models/${model}:generateContent?key=${apiKey}`;

    const body = {
        contents: [{ role: "user", parts: [{ text: `${SYSTEM_PREFIX}\n\n${prompt || ""}` }] }],
        generationConfig: genConfig,
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
        const msg = data?.error?.message || `HTTP ${res.status} ${res.statusText} (${model})`;
        throw new Error(msg);
    }

    const candidates = data?.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) {
        return { text: "", meta: { model, reason: "no-candidates", data } };
    }

    const parts = candidates[0]?.content?.parts;
    const text = Array.isArray(parts)
        ? parts.map((p: any) => p?.text ?? "").join("").trim()
        : (candidates[0]?.content?.parts?.[0]?.text ?? "").trim();

    const finish = candidates[0]?.finishReason || data?.promptFeedback?.blockReason || null;
    return { text, meta: { model, finish, data } };
}

/** Llama a Gemini intentando varios modelos actuales hasta conseguir texto. */
export async function askGemini(
    prompt: string,
    genConfig: GenConfig = DEFAULT_GEN_CONFIG
): Promise<string> {
    const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
    if (!API_KEY) {
        console.error("[Gemini] Falta VITE_GEMINI_API_KEY en .env");
        throw new Error("Falta VITE_GEMINI_API_KEY");
    }

    let lastErr: unknown = null;

    for (const model of CANDIDATE_MODELS) {
        try {
            console.debug(`[Gemini] Intentando ${API_VERSION}/${model}…`);
            const { text, meta } = await callOnce(API_KEY, model, prompt, genConfig);
            if (text) {
                console.info(`[Gemini] OK con ${API_VERSION}/${meta.model} (finish=${meta.finish ?? "?"})`);
                return text;
            } else {
                console.warn(`[Gemini] Respuesta vacía en ${API_VERSION}/${model}`, meta);
            }
        } catch (err) {
            lastErr = err;
            console.warn(`[Gemini] Falló ${API_VERSION}/${model}:`, err);
        }
    }

    console.error("[Gemini] Todos los intentos fallaron.", lastErr);
    return ""; // tu UI mostrará el fallback
}

// Debug manual desde consola (opcional)
// @ts-ignore
window.__testGemini = async (q: string) => {
    const r = await askGemini(`Responde en español a: "${q}"`);
    console.log("[__testGemini]", r);
    return r;
};

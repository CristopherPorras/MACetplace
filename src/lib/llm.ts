export async function askGemini(prompt: string): Promise<string> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string;
    if (!apiKey) throw new Error("Falta VITE_GEMINI_API_KEY en .env");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;


    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini error: ${res.status} ${err}`);
    }

    const json = await res.json();
    return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "No answer from Gemini.";
}

export async function listModels(): Promise<string[]> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string;
    if (!apiKey) throw new Error("Falta VITE_GEMINI_API_KEY en .env");
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    if (!res.ok) throw new Error(`ListModels error: ${res.status}`);
    const json = await res.json();
    return (json?.models ?? []).map((m: any) => m.name);
}

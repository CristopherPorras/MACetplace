// src/lib/prompt.ts
// Prompt robusto en español, sin placeholders ni "precio $0"

export type Chunk = { text: string };

const BAD_NAMES = new Set(["Product Name", "Producto", "Product", "ProductName"]);
const BAD_DESCS = new Set(["Product description", "Descripción del producto", "Description"]);

function clean(s: any): string {
  if (s == null) return "";
  return String(s).trim();
}

function normalizePrice(v: any): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined; // ❌ oculta 0 o NaN
}

function normalizeRating(v: any): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Number(n.toFixed(1)) : undefined;
}

function sanitizeProduct(p: any) {
  const name = clean(p?.name);
  const desc = clean(p?.description);

  return {
    id: clean(p?.id),
    name: name && !BAD_NAMES.has(name) ? name : "",
    description: desc && !BAD_DESCS.has(desc) ? desc : "",
    category: clean(p?.category),
    price: normalizePrice(p?.price),
    rating: normalizeRating(p?.rating),
    specs: p?.specs && typeof p.specs === "object" ? p.specs : null,
  };
}

function specsToLines(specs: Record<string, any> | null | undefined, max = 8): string[] {
  if (!specs) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(specs)) {
    const key = clean(k).replace(/_/g, " ");
    const val = clean(v);
    if (!key || !val) continue;
    out.push(`- ${key}: ${val}`);
    if (out.length >= max) break;
  }
  return out;
}

function buildFacts(p: ReturnType<typeof sanitizeProduct>): string[] {
  const facts: string[] = [];
  if (p.name) facts.push(`- Nombre: ${p.name}`);
  if (p.category) facts.push(`- Categoría: ${p.category}`);
  if (typeof p.price === "number") facts.push(`- Precio aprox.: $${p.price}`);
  if (typeof p.rating === "number") facts.push(`- Valoración: ${p.rating}`);
  if (p.description) facts.push(`- Descripción: ${p.description}`);
  return facts;
}

export function buildPrompt({
  product,
  chunks,
  userQuery,
}: {
  product: any;
  chunks: Array<Chunk>;
  userQuery: string;
}) {
  const p = sanitizeProduct(product);

  // Hechos confiables (solo lo que realmente existe)
  const facts = buildFacts(p);
  const factsBlock = facts.length ? facts.join("\n") : "(sin hechos adicionales)";

  // Especificaciones resumidas (si hay)
  const specLines = specsToLines(p.specs);
  const specsBlock = specLines.length ? specLines.join("\n") : "";

  // Contexto adicional (RAG)
  const ctx =
    (chunks ?? [])
      .slice(0, 6)
      .map((c, i) => `[#${i + 1}] ${clean(c?.text)}`)
      .filter(Boolean)
      .join("\n\n") || "(sin contexto adicional)";

  return `
ERES: Un asistente de compras. Responde SIEMPRE en español, claro y conciso.

REGLAS IMPORTANTES:
- Usa SOLO la información de "DATOS CONFIABLES", "ESPECIFICACIONES" y "CONTEXTO".
- No inventes datos. Si falta info para confirmar algo, dilo explícitamente al final.
- No menciones valores vacíos ni "no disponible" salvo que el usuario lo pida.
- No muestres precios de $0; si no hay precio, omítelo.
- Responde en 3–6 líneas. Si procede, sugiere 1–3 filtros/pasos concretos.

DATOS CONFIABLES:
${factsBlock}

${specsBlock ? `ESPECIFICACIONES:\n${specsBlock}\n` : ""}CONTEXTO:
${ctx}

CONSULTA DEL USUARIO:
"${userQuery}"

TAREA:
1) Responde de forma útil con los datos presentes.
2) Si el usuario pregunta si es p. ej. "smart fitness watch" y NO hay evidencia en especificaciones/contexto, responde: "No hay información suficiente para confirmarlo" y sugiere 1–3 filtros (p.ej., "GPS", "monitor de ritmo cardíaco", "resistencia al agua").
3) Evita mencionar campos ausentes. Enfócate en lo que sí sabemos.
`;
}

// src/lib/rag.ts
// RAG con Supabase + pgvector (indexación y recuperación)

import { supabase, type Product, type Database, type Json } from "@/lib/supabaseClient";
import { embedText } from "@/lib/embeddings";

// Trocea un texto largo en bloques ~600-800 caracteres
function chunkText(text: string, targetLen = 700): string[] {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const out: string[] = [];
  for (let i = 0; i < clean.length; i += targetLen) out.push(clean.slice(i, i + targetLen));
  return out;
}

// Convierte un producto a texto indexable
function productToIndexText(p: Product): string {
  const lines: string[] = [];
  if (p.name) lines.push(`Nombre: ${p.name}`);
  if (p.category) lines.push(`Categoría: ${p.category}`);
  if (p.description) lines.push(`Descripción: ${p.description}`);

  if (p.specs && typeof p.specs === "object") {
    const specs = Object.entries(p.specs)
      .filter(([_, v]) => v != null && String(v).trim() !== "")
      .map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v)}`);
    if (specs.length) {
      lines.push("Especificaciones:");
      specs.forEach((s) => lines.push(`- ${s}`));
    }
  }
  return lines.join("\n");
}

// Alias de tipos para insertar docs
type ProductDocInsert = Database["public"]["Tables"]["product_docs"]["Insert"];

/** Elimina los docs existentes de un producto y (re)indexa sus trozos */
export async function indexProduct(p: Product): Promise<{ inserted: number }> {
  // 1) Borrar docs previos de este producto
  await supabase.from("product_docs").delete().eq("product_id", p.id);

  // 2) Crear texto → trozos → embeddings (document)
  const baseText = productToIndexText(p);
  const chunks = chunkText(baseText);
  if (chunks.length === 0) return { inserted: 0 };

  const rows: ProductDocInsert[] = [];
  for (const content of chunks) {
    const vector = await embedText(content, "RETRIEVAL_DOCUMENT");
    rows.push({
      product_id: p.id,
      content,
      metadata: { name: p.name, category: p.category } as Json,
      embedding: vector, // number[] está OK por nuestro tipo Insert
    });
  }

  // 3) Insertar
  const { error: insertErr } = await supabase.from("product_docs").insert(rows);
  if (insertErr) {
    console.error("[RAG] Error insertando docs:", insertErr);
    throw insertErr;
  }
  return { inserted: rows.length };
}

/** Indexa N productos (útil como backfill) */
export async function indexProducts(products: Product[]): Promise<void> {
  for (const p of products) {
    try {
      const { inserted } = await indexProduct(p);
      console.log(`[RAG] ${p.id} (${p.name}) → ${inserted} chunks`);
    } catch (e) {
      console.warn(`[RAG] Falló indexar ${p.id}:`, e);
    }
  }
}

/** Recupera contexto para una pregunta (opcionalmente filtrado por productId) */
export async function fetchRagContext(opts: {
  userQuery: string;
  productId?: string;
  topK?: number;
}): Promise<{
  product_info?: Record<string, any>;
  context_chunks: Array<{ text: string; similarity: number }>;
}> {
  const { userQuery, productId, topK = 6 } = opts;
  const q = (userQuery || "").trim();
  if (!q) return { context_chunks: [] };

  // 1) Embedding de la consulta
  const queryVec = await embedText(q, "RETRIEVAL_QUERY");

  // 2) RPC match_product_docs
  const { data, error: rpcErr } = await supabase.rpc("match_product_docs", {
    query_embedding: queryVec as unknown, // número[]
    match_count: topK,
    filter_product_id: productId ?? null,
  });

  if (rpcErr) {
    console.error("[RAG] RPC error:", rpcErr);
    return { context_chunks: [] };
  }

  // 3) Normalizar salida como [{ text, similarity }]
  const chunks = (data ?? []).map((row) => ({
    text: String(row.content || ""),
    similarity: Number(row.similarity ?? 0),
  }));

  return {
    product_info: {},
    context_chunks: chunks,
  };
}

// ===== Helpers de debug para correr desde la consola =====

// Indexar TODOS los productos actuales (top 200)
// Uso: await window.__ragIndexAll?.()
export async function __ragIndexAll() {
  const { data: rows, error: listErr } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (listErr) {
    console.error("[RAG] No se pudieron leer productos:", listErr);
    return;
  }
  await indexProducts(rows ?? []);
  console.log("[RAG] Indexación masiva completada.");
}

// Probar búsqueda sin LLM
// Uso: await window.__ragSearch?.("teclado mecánico", "<id-producto-opcional>")
export async function __ragSearch(q: string, productId?: string) {
  const res = await fetchRagContext({ userQuery: q, productId, topK: 5 });
  console.log("[RAG] Chunks:", res.context_chunks);
  return res;
}

// Exponer en window para uso dev
// @ts-ignore
if (typeof window !== "undefined") {
  // @ts-ignore
  window.__ragIndexAll = __ragIndexAll;
  // @ts-ignore
  window.__ragSearch = __ragSearch;
}

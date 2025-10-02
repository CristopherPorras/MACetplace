// src/lib/supabaseClient.ts
// -------------------------------------------------------------
// Cliente Supabase + helpers (100% tipado):
// - Tablas: products, product_docs
// - RPC: match_product_docs
// - Exports: supabase (cliente), tipos Product, Database, Json, y helpers
// -------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";

// ===== Tipos base del esquema =====
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

// Fila de la tabla products
export type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  specs: Record<string, any> | null;
  category: string;
  rating: number | null;
  created_at: string;
};

// Fila de la tabla product_docs (para RAG)
export type ProductDocRow = {
  id: string;
  product_id: string;
  content: string;
  metadata: Json | null;
  // En pgvector es "vector(768)". En TS lo tipamos como unknown/number[] para insertar.
  embedding: unknown;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      products: {
        Row: Product;
        Insert: Omit<Product, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Product>;
        Relationships: [];
      };
      product_docs: {
        Row: ProductDocRow;
        Insert: {
          id?: string;
          product_id: string;
          content: string;
          metadata?: Json | null;
          embedding: unknown; // number[] OK; supabase-js lo serializa
          created_at?: string;
        };
        Update: Partial<{
          product_id: string;
          content: string;
          metadata: Json | null;
          embedding: unknown;
          created_at: string;
        }>;
        Relationships: [];
      };
    };
    Views: {};
    Functions: {
      // RPC que devuelve los mejores chunks por similitud coseno
      match_product_docs: {
        Args: {
          query_embedding: unknown; // number[]
          match_count: number;
          filter_product_id?: string | null;
        };
        Returns: Array<{
          id: string;
          product_id: string;
          content: string;
          metadata: Json | null;
          similarity: number;
        }>;
      };
    };
    Enums: {};
    CompositeTypes: {};
  };
};

// Filtros opcionales para listados
export type ProductFilters = {
  q?: string;
  category?: string;
  priceMin?: number;
  priceMax?: number;
  limit?: number;
  offset?: number;
};

// ===== Cliente Supabase =====
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "❌ Faltan variables de entorno de Supabase. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en tu .env(.local)."
  );
}

// ✅ Cliente tipado con nuestro Database
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
export default supabase;

// ===== Helpers de datos =====

/** Listar productos con filtros */
export async function getProducts(filters: ProductFilters = {}): Promise<Product[]> {
  const limit = typeof filters.limit === "number" ? filters.limit : 12;
  const offset = typeof filters.offset === "number" ? filters.offset : 0;

  let q = supabase.from("products").select("*").order("created_at", { ascending: false });

  if (filters.q && filters.q.trim() !== "") {
    const text = filters.q.trim();
    q = q.or(`name.ilike.%${text}%,description.ilike.%${text}%`);
  }

  if (filters.category && filters.category !== "all") {
    q = q.eq("category", filters.category);
  }

  if (typeof filters.priceMin === "number") q = q.gte("price", filters.priceMin);
  if (typeof filters.priceMax === "number") q = q.lte("price", filters.priceMax);

  const { data, error } = await q.range(offset, offset + limit - 1);
  if (error) {
    console.error("Error fetching products:", error);
    throw error;
  }
  return data ?? [];
}

/** Obtener un producto por ID */
export async function getProductById(id: string): Promise<Product | null> {
  const { data, error } = await supabase.from("products").select("*").eq("id", id).single();
  if (error) {
    console.error("Error fetching product:", error);
    throw error;
  }
  return data ?? null;
}

/** Productos similares por categoría */
export async function getSimilarProductsByCategory(
  category: string,
  excludeId?: string,
  limit = 6
): Promise<Product[]> {
  let q = supabase
    .from("products")
    .select("*")
    .eq("category", category)
    .order("rating", { ascending: false })
    .limit(limit);

  if (excludeId) q = q.neq("id", excludeId);

  const { data, error } = await q;
  if (error) {
    console.error("Error fetching similar products:", error);
    return [];
  }
  return data ?? [];
}

/** Listar categorías únicas */
export async function getCategories(): Promise<string[]> {
  const { data, error } = await supabase.from("products").select("category").order("category");
  if (error) {
    console.error("Error fetching categories:", error);
    return [];
  }
  const set = new Set<string>();
  (data ?? []).forEach((r) => r?.category && set.add(r.category as string));
  return Array.from(set);
}

/** 🔎 Búsqueda "smart": tokeniza, añade sinónimos y arma un OR de ILIKE sobre name+description */
export async function searchProducts(
  queryText: string,
  opts?: { limit?: number }
): Promise<Product[]> {
  const raw = (queryText ?? "").trim().toLowerCase();
  if (!raw) return [];

  // 1) Tokens de 3+ letras
  const baseTokens = Array.from(
    new Set(raw.split(/[\s,.;:!?()]+/).filter((t) => t.length >= 3))
  ).slice(0, 12);

  // 2) Sinónimos (ajusta a tu catálogo)
  const SYNS: Record<string, string[]> = {
    headphones: [
      "headphone",
      "headphones",
      "audifono",
      "audífono",
      "audifonos",
      "audífonos",
      "auricular",
      "auriculares",
      "cascos",
      "noise",
      "cancelación",
      "cancelacion",
      "noise-cancelling",
      "over-ear",
      "bluetooth",
    ],
    smartwatch: [
      "smartwatch",
      "watch",
      "reloj",
      "reloj inteligente",
      "fitness",
      "deportivo",
      "tracker",
      "pulsera",
      "gps",
    ],
    chair: [
      "chair",
      "silla",
      "silla de oficina",
      "oficina",
      "ergonómica",
      "ergonomica",
      "respaldo",
      "lumbar",
      "escritorio",
    ],
    bottle: ["bottle", "botella", "termo", "acero", "inoxidable", "stainless", "steel", "reusable", "deportiva"],
    keyboard: ["keyboard", "teclado", "mecánico", "mecanico", "gamer", "gaming", "switch", "switches", "rgb", "retroiluminado"],
    yogamat: ["yoga", "yoga mat", "tapete", "colchoneta", "mat", "antideslizante"],
    coffeemaker: ["coffee", "coffe maker", "coffee maker", "cafetera", "espresso", "goteo", "filtro"],
    laptopbag: ["laptop", "notebook", "maletin", "maletín", "maleta", "mochila", "bolso", "bag", "funda", "cuero", "case"],
    smartspeaker: ["smart speaker", "bocina", "altavoz", "altavoz inteligente", "bocina inteligente", "asistente", "hogar", "smart home"],
    runningshoes: ["running", "shoes", "tenis", "zapatillas", "correr", "deportivos"],
    btspeaker: ["bluetooth", "speaker", "parlante", "bocina", "portatil", "portátil", "portable"],
    standingdesk: ["standing", "desk", "converter", "convertidor", "escritorio de pie", "elevador", "soporte", "ajustable"],
  };

  const expanded = new Set(baseTokens);
  for (const t of baseTokens) {
    for (const words of Object.values(SYNS)) if (words.includes(t)) words.forEach((w) => expanded.add(w));
  }
  const tokens = Array.from(expanded).slice(0, 12);
  if (tokens.length === 0) return [];

  // 3) OR de ILIKE (name/description) — aplicar ANTES de order/limit
  const orFilter = tokens
    .flatMap((tok) => [`name.ilike.%${tok}%`, `description.ilike.%${tok}%`])
    .join(",");

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .or(orFilter)
    .order("rating", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 12);

  if (error) {
    console.error("Supabase smart search error:", error);
    return [];
  }

  if (!data || data.length === 0) {
    const catAliases: Record<string, string[]> = {
      Electronics: [
        ...SYNS.headphones,
        ...SYNS.smartwatch,
        ...SYNS.keyboard,
        ...SYNS.smartspeaker,
        ...SYNS.btspeaker,
      ],
      Furniture: [...SYNS.chair, ...SYNS.standingdesk],
      "Home & Kitchen": [...SYNS.coffeemaker, ...SYNS.bottle],
      Sports: [...SYNS.yogamat, ...SYNS.runningshoes],
      Accessories: [...SYNS.laptopbag],
    };

    let bestCat: string | null = null;
    for (const [cat, words] of Object.entries(catAliases)) {
      if (words.some((w) => tokens.includes(w))) {
        bestCat = cat;
        break;
      }
    }

    if (bestCat) {
      const { data: byCat, error: catErr } = await supabase
        .from("products")
        .select("*")
        .eq("category", bestCat)
        .order("rating", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(opts?.limit ?? 12);

      if (catErr) {
        console.error("Supabase category fallback error:", catErr);
        return [];
      }
      return byCat ?? [];
    }
  }

  return data ?? [];
}

// src/lib/supabaseClient.ts
// -------------------------------------------------------------
// Cliente Supabase + helpers de productos
// - NO depende de "@/integrations/supabase/client"
// - Usa VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (Vite)
// - Exporta: export const supabase  y  export default supabase
// - Helpers: getProducts, getProductById, getSimilarProductsByCategory,
//            getCategories, searchProducts
// -------------------------------------------------------------

import { createClient, type PostgrestSingleResponse } from '@supabase/supabase-js';

// 1) Crear cliente con variables de entorno
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    '❌ Faltan variables de entorno de Supabase. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en tu .env(.local).'
  );
}

// ✅ Cliente exportado con nombre y por defecto
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export default supabase;

// 2) Tipos
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

export type ProductFilters = {
  q?: string;
  category?: string;
  priceMin?: number;
  priceMax?: number;
  limit?: number;
  offset?: number;
};

// 3) Helpers de datos

/** Buscar productos con filtros (texto, categoría, rango de precios y paginación) */
export async function getProducts(filters: ProductFilters = {}): Promise<Product[]> {
  let query = supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });

  // Texto en name o description
  if (filters.q && filters.q.trim() !== '') {
    const q = filters.q.trim();
    query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
  }

  // Categoría (si no es "all")
  if (filters.category && filters.category !== 'all') {
    query = query.eq('category', filters.category);
  }

  // Rango de precios
  if (typeof filters.priceMin === 'number') {
    query = query.gte('price', filters.priceMin);
  }
  if (typeof filters.priceMax === 'number') {
    query = query.lte('price', filters.priceMax);
  }

  // Paginación
  const limit = typeof filters.limit === 'number' ? filters.limit : 12;
  const offset = typeof filters.offset === 'number' ? filters.offset : 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error }: PostgrestSingleResponse<Product[]> = await query;

  if (error) {
    console.error('Error fetching products:', error);
    throw error;
  }

  return data ?? [];
}

/** Obtener un producto por ID */
export async function getProductById(id: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching product:', error);
    throw error;
  }

  return (data as Product) ?? null;
}

/** Productos similares por categoría (opcionalmente excluye uno por ID) */
export async function getSimilarProductsByCategory(
  category: string,
  excludeId?: string,
  limit: number = 6
): Promise<Product[]> {
  let query = supabase
    .from('products')
    .select('*')
    .eq('category', category)
    .order('rating', { ascending: false })
    .limit(limit);

  if (excludeId) {
    query = query.neq('id', excludeId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching similar products:', error);
    return [];
  }

  return (data as Product[]) ?? [];
}

/** Listar categorías únicas */
export async function getCategories(): Promise<string[]> {
  const { data, error } = await supabase
    .from('products')
    .select('category')
    .order('category', { ascending: true });

  if (error) {
    console.error('Error fetching categories:', error);
    return [];
  }

  const unique = new Set<string>();
  (data ?? []).forEach((row: any) => {
    if (row?.category) unique.add(row.category);
  });

  return Array.from(unique);
}

/** 🔎 Búsqueda simple por texto (para IA/voz): name/description ILIKE + orden por rating y recientes */
export async function searchProducts(queryText: string, opts?: { limit?: number }): Promise<Product[]> {
  const q = (queryText ?? '').trim();
  if (!q) return [];

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .or(`name.ilike.%${q}%,description.ilike.%${q}%`)
    .order('rating', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 12);

  if (error) {
    console.error('Supabase search error:', error);
    return [];
  }

  return (data as Product[]) ?? [];
}

// === Diagnóstico rápido desde el navegador (solo DEV) ===
export async function __dbPing() {
  console.log("[DB] URL:", SUPABASE_URL);
  // 1) ¿Existe la tabla y tenemos permiso de SELECT?
  const head = await supabase
    .from("products")
    .select("id", { count: "exact", head: true });

  console.log("[DB] HEAD products ->", {
    status: (head as any)?.status,
    count: (head as any)?.count,
    error: head?.error ?? null,
  });

  // 2) Muestra 3 filas de ejemplo (id, name, category, price, rating)
  const list = await supabase
    .from("products")
    .select("id, name, category, price, rating")
    .order("created_at", { ascending: false })
    .limit(3);

  console.log("[DB] SAMPLE products ->", {
    data: list.data,
    error: list.error ?? null,
  });

  // 3) Prueba de búsqueda por texto
  const q = "test"; // cambia por una palabra que sepas que existe
  const search = await supabase
    .from("products")
    .select("*")
    .or(`name.ilike.%${q}%,description.ilike.%${q}%`)
    .order("rating", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5);

  console.log("[DB] SEARCH products ->", {
    query: q,
    rows: search.data?.length ?? 0,
    error: search.error ?? null,
  });
}

// Exponer helpers de diagnóstico en window para usarlos desde DevTools
// @ts-ignore
if (typeof window !== "undefined") {
  // @ts-ignore
  window.__dbPing = __dbPing;
}

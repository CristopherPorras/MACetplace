import { supabase } from "@/integrations/supabase/client";

export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  specs: Record<string, any>;
  category: string;
  rating: number;
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

export async function getProducts(filters: ProductFilters = {}): Promise<Product[]> {
  let query = supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters.q) {
    query = query.or(`name.ilike.%${filters.q}%,description.ilike.%${filters.q}%`);
  }

  if (filters.category && filters.category !== 'all') {
    query = query.eq('category', filters.category);
  }

  if (filters.priceMin !== undefined) {
    query = query.gte('price', filters.priceMin);
  }

  if (filters.priceMax !== undefined) {
    query = query.lte('price', filters.priceMax);
  }

  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  if (filters.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 12) - 1);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching products:', error);
    throw error;
  }

  return (data || []) as Product[];
}

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

  return data as Product;
}

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

  return (data || []) as Product[];
}

export async function getCategories(): Promise<string[]> {
  const { data, error } = await supabase
    .from('products')
    .select('category')
    .order('category');

  if (error) {
    console.error('Error fetching categories:', error);
    return [];
  }

  const uniqueCategories = [...new Set(data.map((p) => p.category))];
  return uniqueCategories;
}

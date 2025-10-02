import { useState, useEffect, useCallback } from 'react';
import { SearchBar } from '@/components/SearchBar';
import { ProductGrid } from '@/components/ProductGrid';
import { ProductFilters } from '@/components/ProductFilters';
import { SectionTitle } from '@/components/SectionTitle';
import { EmptyState } from '@/components/EmptyState';
import { ProductGridSkeleton } from '@/components/Skeleton';
import { getProducts, getCategories, searchProducts, type Product } from '@/lib/supabaseClient';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from '@/hooks/useDebounce';
// IA / Voz
import { useVoiceSession } from '@/lib/useVoiceSession';
import { askGemini } from '@/lib/llm';
import { fetchRagContext } from '@/lib/rag';
import { buildPrompt } from '@/lib/prompt';

const PRODUCTS_PER_PAGE = 12;

// =============================================================================
// === HELPER FUNCTIONS & TYPES (Fuera del componente para evitar re-creación) ===
// =============================================================================

/** Tipo para los mensajes de la conversación de voz/texto */
type Msg = { role: 'user' | 'assistant'; content: string };

/** Normaliza el formato de los "chunks" de RAG a { text: string }[] */
function normalizeChunks(raw: unknown): Array<{ text: string }> {
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return arr.map((c) => {
    if (!c) return { text: '' };
    if (typeof c === 'string') return { text: c };
    if (typeof (c as any).text === 'string') return { text: (c as any).text };
    return { text: String(c) };
  });
}

/** Formatea un número a precio con signo de dólar y separador de miles */
function fmtPrice(v: any): string {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? `$${n.toLocaleString()}` : '—';
}

/** Asigna un puntaje a un producto basado en una consulta de búsqueda */
function scoreProduct(p: Product, q: string): number {
  const name = String(p?.name ?? '').toLowerCase();
  const desc = String(p?.description ?? '').toLowerCase();
  const STOP = new Set(['de', 'del', 'la', 'el', 'the', 'and', 'or', 'para', 'con', 'sin', 'por', 'en']);
  const WEAK = new Set(['bluetooth', 'noise', 'portable', 'portatil', 'inalambrico', 'wireless', 'smart']);
  const toks = q.toLowerCase().split(/[\s,.;:!?()]+/).filter(t => t.length >= 3 && !STOP.has(t));
  let score = 0;

  for (const t of toks) {
    const w = WEAK.has(t) ? 1 : 4;
    if (name.includes(t)) score += 2 * w;
    if (desc.includes(t)) score += 1 * w;
  }

  const rating = typeof p?.rating === 'number' ? p.rating : 0;
  return score * 10 + rating;
}

/** Elige el mejor producto de una lista basado en la consulta usando el score */
function pickBestProduct(list: Product[], q: string): Product | null {
  return [...list].sort((a, b) => scoreProduct(b, q) - scoreProduct(a, q))[0] ?? null;
}

// =============================================================================
// === COMPONENTE PRINCIPAL ===
// =============================================================================

export default function Home() {
  // --- ESTADO PRINCIPAL DE PRODUCTOS/FILTROS ---
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [priceMin, setPriceMin] = useState(0);
  const [priceMax, setPriceMax] = useState(1000);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const { toast } = useToast();
  const debouncedSearch = useDebounce(searchQuery, 300);

  // --- ESTADO DE VOZ/IA ---
  const [showVoicePanel, setShowVoicePanel] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);

  // === LÓGICA DE ASISTENTE DE VOZ/TEXTO (RAG + GEMINI) ===

  /** Función unificada para manejar la consulta a la IA (desde voz o texto) */
  const handleVoiceOrTextQuery = useCallback(async (q: string, contextProduct: Product | undefined): Promise<string> => {
    const userQuery = (q || '').trim();
    if (!userQuery) return 'No se detectó una consulta válida.';

    // 1. Añadir el mensaje de usuario
    setMessages((m) => [...m, { role: 'user', content: userQuery }]);

    try {
      // 2. Buscar coincidencias iniciales en Supabase
      const found = await searchProducts(userQuery, { limit: 12 });
      const product = found.length ? pickBestProduct(found, userQuery) : contextProduct || null;

      let replyText: string;

      if (!product) {
        // Opción A: No hay producto claro.
        if (found.length) {
          // Si hay resultados, se sugiere elegir uno.
          const bullets = found.slice(0, 3).map((p, i) =>
            `${i + 1}. ${p.name} — ${fmtPrice(p.price)} — ⭐ ${p.rating ?? 'N/A'} (${p.category})`
          ).join('\n');
          replyText = `Encontré ${found.length} coincidencias:\n${bullets}\n\nDi el número o nombre para ver detalles.`;
        } else {
          // Si no hay resultados, se pide ayuda a Gemini con sugerencias.
          const tip = await askGemini(
            `No encontré productos en la base para: "${userQuery}".
Responde en español con 2–4 líneas de sugerencias de palabras clave y filtros concretos.`
          );
          replyText = tip || 'No encontré coincidencias. Prueba con palabras más concretas o una categoría.';
        }
      } else {
        // Opción B: Se ha seleccionado un producto (RAG + Prompt robusto).
        try {
          const rag: any = await fetchRagContext({ productId: product.id, userQuery, topK: 6 });

          const rawChunks = (rag?.context_chunks ?? rag?.chunks) ?? [];
          const chunks = normalizeChunks(rawChunks)
            .filter((c: any) => Number(c.similarity ?? 0) >= 0.55); // Filtrar por similitud si está disponible

          const prompt = buildPrompt({
            product,
            chunks,
            userQuery,
          });

          replyText = await askGemini(prompt) || 'Ahora mismo no pude obtener respuesta.';
        } catch (ragError) {
          console.error('Error RAG/Prompt:', ragError);
          // Fallback simple si el RAG falla
          const fallbackPrompt = `Eres un asistente de compras y debes responder SIEMPRE en español.
Usuario: "${userQuery}".
Producto: ${product.name}.
Sé breve (3–5 líneas) y útil, basándote solo en el nombre del producto.`;
          replyText = await askGemini(fallbackPrompt) || 'Hubo un error al buscar información detallada. Intenta nuevamente.';
        }
      }

      // 3. Añadir la respuesta del asistente
      setMessages((m) => [...m, { role: 'assistant', content: replyText }]);

      return replyText;

    } catch (err) {
      console.error('Error en handleVoiceOrTextQuery:', err);
      const fallback = 'Ocurrió un problema grave. Intenta nuevamente.';
      setMessages((m) => [...m, { role: 'assistant', content: fallback }]);
      return fallback;
    }
  }, []); // Dependencias vacías, ya que 'setMessages' y 'toast' son estables.

  // --- HOOK DE VOZ ---
  const voice = useVoiceSession(async (userQuery: string) => {
    // Buscar productos que coincidan con la consulta del usuario
    const found = await searchProducts(userQuery, { limit: 12 });

    if (!found.length) {
      // No hubo match: ofrece alternativas (top 3 recientes/bien valorados)
      const alternatives = await getProducts({ limit: 3 });

      const msg = alternatives.length
        ? `No encontré productos con esa especificación. Pero puedo sugerirte estas opciones:\n` +
        alternatives
          .map(p => `• ${p.name} — ${Number.isFinite(p.price) && p.price! > 0 ? `$${p.price!.toLocaleString()}` : '—'} — ⭐ ${p.rating ?? 'N/A'} (${p.category})`)
          .join('\n') +
        `\n\n¿Te interesa alguno o prefieres ajustar los filtros (categoría/precio/características)?`
        : `No encontré productos con esa especificación. ¿Quieres que pruebe en otra categoría o con otras palabras clave?`;

      // Devuelve el mensaje (si esto está dentro de un callback de voz, retorna el string)
      return msg;
    }

    // Sí hubo resultados: usa el mejor como contexto (o el primero)
    const contextProduct = found[0]; // o pickBestProduct(found, userQuery) si ya tienes esa función
    const reply = await handleVoiceOrTextQuery(userQuery, contextProduct);
    return reply;


    // Reproducir en voz alta (TTS) - La lógica se mueve aquí, fuera de handleVoiceOrTextQuery,
    // ya que el callback de useVoiceSession es el punto de entrada para la voz.
    try {
      if (reply) {
        const utter = new SpeechSynthesisUtterance(reply);
        utter.lang = 'es-ES';
        window.speechSynthesis?.speak(utter);
      }
    } catch { /* Fallo silencioso */ }

    return reply;
  });

  // --- MANEJO DE CONSULTA DE TEXTO MANUAL ---

  /** Permite enviar texto manual al flujo de IA (útil para el reintento o follow-up) */
  const voiceFromText = useCallback(async (q: string) => {
    const contextProduct = products?.[0];
    // Ejecuta la lógica de consulta (que incluye añadir a 'messages')
    await handleVoiceOrTextQuery(q, contextProduct);
  }, [handleVoiceOrTextQuery, products]);

  // --- UTILIDADES DEL PANEL DE VOZ ---

  /** Cierra y limpia el panel de voz, deteniendo cualquier TTS */
  function closeVoicePanel() {
    setShowVoicePanel(false);
    setMessages([]);
    try {
      window.speechSynthesis?.cancel();
    } catch { /* Fallo silencioso */ }
  }

  /** Reintenta la última consulta de usuario (de texto o voz) */
  async function retryLast() {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUser) {
      await voiceFromText(lastUser.content);
    }
  }

  // =============================================================================
  // === EFECTOS: CARGA DE DATOS ===
  // =============================================================================

  // === CARGAR CATEGORÍAS AL MONTAR ===
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const cats = await getCategories();
        setCategories(cats);
      } catch (error) {
        console.error('Error loading categories:', error);
      }
    };
    loadCategories();
  }, []);

  // === CARGAR PRODUCTOS AL CAMBIAR FILTROS (Debounced) ===
  useEffect(() => {
    const loadProductsFx = async () => {
      setIsLoading(true);
      setOffset(0);

      try {
        const data = await getProducts({
          q: debouncedSearch,
          category: category === 'all' ? undefined : category,
          priceMin: priceMin || undefined,
          priceMax: priceMax || undefined,
          limit: PRODUCTS_PER_PAGE,
          offset: 0,
        });

        setProducts(data);
        setHasMore(data.length === PRODUCTS_PER_PAGE);
      } catch (error) {
        console.error('Error loading products:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to load products. Please try again.',
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadProductsFx();
  }, [debouncedSearch, category, priceMin, priceMax, toast]);

  // === PAGINACIÓN: LOAD MORE ===

  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    const newOffset = offset + PRODUCTS_PER_PAGE;

    try {
      const data = await getProducts({
        q: debouncedSearch,
        category: category === 'all' ? undefined : category,
        priceMin: priceMin || undefined,
        priceMax: priceMax || undefined,
        limit: PRODUCTS_PER_PAGE,
        offset: newOffset,
      });

      setProducts((prev) => [...prev, ...data]);
      setOffset(newOffset);
      setHasMore(data.length === PRODUCTS_PER_PAGE);
    } catch (error) {
      console.error('Error loading more products:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load more products.',
      });
    } finally {
      setIsLoadingMore(false);
    }
  };

  // =============================================================================
  // === RENDERIZADO ===
  // =============================================================================

  return (
    <div className="min-h-screen bg-background">
      {/* --- HEADER Y BARRA DE BÚSQUEDA --- */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col gap-6">
            <SectionTitle subtitle="Discover amazing products with AI-powered assistance">
              Marketplace
            </SectionTitle>

            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="flex-1 w-full">
                <SearchBar
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onClear={() => setSearchQuery('')}
                />
              </div>

              {/* Botón para iniciar la voz */}
              <button
                onClick={() => {
                  setShowVoicePanel(true);
                  voice.startListening();
                }}
                className="px-4 py-2 rounded bg-emerald-600 text-white"
                disabled={voice.status !== 'idle'}
                title="Talk with AI"
              >
                {voice.status === 'listening'
                  ? 'Listening…'
                  : voice.status === 'thinking'
                    ? 'Thinking…'
                    : voice.status === 'speaking'
                      ? 'Speaking…'
                      : 'Talk'}
              </button>

              {/* Botón Stop (detener TTS) */}
              <button
                onClick={() => {
                  try { speechSynthesis.cancel(); } catch { /* Fallo silencioso */ }
                }}
                className="px-3 py-2 rounded border"
                title="Stop speaking"
                disabled={voice.status !== 'speaking'}
              >
                Stop
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* --- CONTENIDO PRINCIPAL Y FILTROS --- */}
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Aside: Filtros */}
          <aside className="lg:w-64 shrink-0">
            <div className="sticky top-32">
              <ProductFilters
                category={category}
                onCategoryChange={setCategory}
                priceMin={priceMin}
                priceMax={priceMax}
                onPriceChange={(min, max) => {
                  setPriceMin(min);
                  setPriceMax(max);
                }}
                categories={categories}
              />
            </div>
          </aside>

          {/* Sección de Productos */}
          <div className="flex-1">
            {isLoading ? (
              <ProductGridSkeleton />
            ) : products.length === 0 ? (
              <EmptyState
                title="No products found"
                description="Try adjusting your search or filters to find what you're looking for."
                action={{
                  label: 'Clear Filters',
                  onClick: () => {
                    setSearchQuery('');
                    setCategory('all');
                    setPriceMin(0);
                    setPriceMax(1000);
                  },
                }}
              />
            ) : (
              <ProductGrid
                products={products}
                onLoadMore={handleLoadMore}
                hasMore={hasMore}
                isLoading={isLoadingMore}
              />
            )}
          </div>
        </div>
      </main>

      {/* --- PANEL DE CONVERSACIÓN DE VOZ/IA --- */}
      {showVoicePanel && (
        <div className="fixed bottom-4 right-4 w-full max-w-md bg-white border rounded-xl shadow-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Voice Assistant</h3>
            <div className="flex gap-2">
              <button
                onClick={retryLast}
                className="px-3 py-1 rounded border"
                title="Retry last user message"
              >
                Retry
              </button>
              <button
                onClick={closeVoicePanel}
                className="px-3 py-1 rounded bg-gray-900 text-white"
              >
                Close
              </button>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto space-y-2">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`px-3 py-2 rounded ${m.role === 'user' ? 'bg-emerald-50 text-emerald-900' : 'bg-gray-100'}`}
              >
                <b>{m.role === 'user' ? 'You' : 'AI'}:</b> {m.content}
              </div>
            ))}
          </div>

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const q = String(fd.get('q') || '').trim();
              if (!q) return;
              (e.currentTarget as HTMLFormElement).reset();
              voiceFromText(q);
            }}
          >
            <input
              name="q"
              placeholder="Type a follow-up and press Enter…"
              className="flex-1 border rounded px-3 py-2"
            />
            <button className="px-3 py-2 rounded bg-emerald-600 text-white" type="submit">Send</button>
          </form>

          <div className="text-xs text-muted-foreground">
            Status: {voice.status}
          </div>
        </div>
      )}
    </div>
  );
}
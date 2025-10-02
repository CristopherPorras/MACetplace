import { useState, useEffect } from 'react';
import { SearchBar } from '@/components/SearchBar';
import { ProductGrid } from '@/components/ProductGrid';
import { ProductFilters } from '@/components/ProductFilters';
import { SectionTitle } from '@/components/SectionTitle';
import { EmptyState } from '@/components/EmptyState';
import { ProductGridSkeleton } from '@/components/Skeleton';
import { getProducts, getCategories, type Product } from '@/lib/supabaseClient';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from '@/hooks/useDebounce';

// IA / Voz
import { useVoiceSession } from '@/lib/useVoiceSession';
import { askGemini } from '@/lib/llm';
import { fetchRagContext } from '@/lib/rag';
import { buildPrompt } from '@/lib/prompt';

const PRODUCTS_PER_PAGE = 12;

type Msg = { role: 'user' | 'assistant'; content: string };

export default function Home() {
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

  // ---------- Tipos y helpers (defínelos una sola vez, fuera del componente) ----------
  type Msg = { role: 'user' | 'assistant'; content: string };

  /** Normaliza cualquier forma de chunks a { text: string }[] */
  function normalizeChunks(raw: unknown): Array<{ text: string }> {
    const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return arr.map((c) => {
      if (!c) return { text: '' };
      if (typeof c === 'string') return { text: c };
      if (typeof (c as any).text === 'string') return { text: (c as any).text };
      return { text: String(c) };
    });
  }

  // ---------- Dentro del componente (una sola vez) ----------
  const [showVoicePanel, setShowVoicePanel] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);


  // === VOZ + RAG + GEMINI (usa el hook existente) ===
  const voice = useVoiceSession(async (userQuery: string) => {
    try {
      const q = (userQuery || '').trim();
      if (!q) return 'No te entendí. ¿Puedes repetirlo?';

      setMessages((m) => [...m, { role: 'user', content: q }]);

      const product = products?.[0]; // producto en foco: el primero listado
      let prompt: string;

      if (product) {
        try {
          const rag: any = await fetchRagContext({
            productId: product.id,
            userQuery: q,
          });

          // Acepta snake_case o camelCase
          const productInfo = (rag?.product_info ?? rag?.productInfo) ?? {};
          const rawChunks = (rag?.context_chunks ?? rag?.contextChunks ?? rag?.chunks) ?? [];
          const chunks = normalizeChunks(rawChunks);

          prompt = buildPrompt({
            product: { ...(product || {}), ...(productInfo || {}) },
            chunks,
            userQuery: q,
          });
        } catch (ragErr) {
          console.warn('RAG falló; usando prompt simple:', ragErr);
          prompt = `Eres un asistente de compras y debes responder SIEMPRE en español.
Usuario: "${q}".
Sé breve (3–5 líneas) y útil. Si faltan datos, dilo.`;
        }
      } else {
        prompt = `Eres un asistente de compras y debes responder SIEMPRE en español.
Usuario: "${q}".
No hay productos cargados. Responde con orientación general en 3–5 líneas, sin inventar precios ni stock.`;
      }

      try {
        const reply = await askGemini(prompt);
        const text = reply || 'Ahora mismo no pude obtener respuesta.';
        setMessages((m) => [...m, { role: 'assistant', content: text }]);
        return text;
      } catch (llmErr) {
        console.error('Error al llamar a Gemini:', llmErr);
        const fallback = 'Ahora mismo no pude obtener respuesta.';
        setMessages((m) => [...m, { role: 'assistant', content: fallback }]);
        return fallback;
      }
    } catch (err) {
      console.error('Error en callback de voz:', err);
      const fallback = 'Ocurrió un problema. Intenta nuevamente.';
      setMessages((m) => [...m, { role: 'assistant', content: fallback }]);
      return fallback;
    }
  });

  // Cerrar/purgar el panel
  function closeVoicePanel() {
    setShowVoicePanel(false);
    setMessages([]);
    try {
      window.speechSynthesis?.cancel();
    } catch { }
  }

  // Reintentar: vuelve a preguntar con el último mensaje de usuario
  async function retryLast() {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUser) {
      await voiceFromText(lastUser.content);
    }
  }

  // Permitir enviar texto manual al flujo de IA (útil para retry)
  async function voiceFromText(q: string) {
    try {
      const question = (q || '').trim();
      if (!question) return;

      setMessages((m) => [...m, { role: 'user', content: question }]);

      const product = products?.[0];
      let prompt: string;

      if (product) {
        try {
          const rag: any = await fetchRagContext({
            productId: product.id,
            userQuery: question,
          });

          const productInfo = (rag?.product_info ?? rag?.productInfo) ?? {};
          const rawChunks = (rag?.context_chunks ?? rag?.contextChunks ?? rag?.chunks) ?? [];
          const chunks = normalizeChunks(rawChunks);

          prompt = buildPrompt({
            product: { ...(product || {}), ...(productInfo || {}) },
            chunks,
            userQuery: question,
          });
        } catch {
          prompt = `Eres un asistente de compras y debes responder SIEMPRE en español.
Usuario: "${question}".
Sé breve (3–5 líneas) y útil.`;
        }
      } else {
        prompt = `Eres un asistente de compras y debes responder SIEMPRE en español.
Usuario: "${question}".
No hay productos cargados. Da una respuesta general breve (3–5 líneas).`;
      }

      const reply = await askGemini(prompt);
      const text = reply || 'Sin respuesta.';
      setMessages((m) => [...m, { role: 'assistant', content: text }]);

      // Además lo leemos en voz alta (ES)
      try {
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'es-ES';
        window.speechSynthesis?.speak(utter);
      } catch { }
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'No se pudo reintentar.' }]);
    }
  }


  // === CATEGORÍAS AL MONTAR ===
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

  // === LISTAR PRODUCTOS CUANDO CAMBIAN FILTROS ===
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

  return (
    <div className="min-h-screen bg-background">
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

              {/* Botón de voz minimalista (sustituye VoiceButton externo) */}
              <button
                onClick={() => {
                  setShowVoicePanel(true);
                  voice.startListening();
                }}
                className="px-4 py-2 rounded bg-emerald-600 text-white"
                disabled={voice.status === 'listening' || voice.status === 'speaking'}
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

              {/* Botón Stop (detener TTS si está hablando) */}
              <button
                onClick={() => {
                  try { speechSynthesis.cancel(); } catch { }
                }}
                className="px-3 py-2 rounded border"
              >
                Stop
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
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

      {/* Panel simple de conversación (sustituye VoicePanel externo) */}
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
            <button className="px-3 py-2 rounded bg-emerald-600 text-white">Send</button>
          </form>

          <div className="text-xs text-muted-foreground">
            Status: {voice.status}
          </div>
        </div>
      )}
    </div>
  );
}

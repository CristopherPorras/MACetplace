// src/pages/ProductDetail.tsx
// -------------------------------------------------------------
// FIX: Todos los hooks (incluido useMemo) van antes de cualquier return.
// Usa useVoiceSession (español) y detiene/limpia bien el flujo de voz.
// -------------------------------------------------------------

import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { askGemini } from '@/lib/llm';
import { fetchRagContext } from '@/lib/rag';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { SectionTitle } from '@/components/SectionTitle';
import { ProductCard } from '@/components/ProductCard';
import { PriceTag } from '@/components/PriceTag';
import { RatingBadge } from '@/components/RatingBadge';
import { VoiceButton } from '@/components/VoiceButton';
import { VoicePanel } from '@/components/VoicePanel';

import {
  getProductById,
  getSimilarProductsByCategory,
  type Product,
} from '@/lib/supabaseClient';

import { useVoiceSession } from '@/lib/useVoiceSession'; // ✅ correcto
import { useToast } from '@/hooks/use-toast';

// Si quieres IA real, descomenta e integra:
// import { askGemini } from '@/lib/llm';
// import { fetchRagContext } from '@/lib/rag';
// import { buildPrompt } from '@/lib/prompt';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';





function fmtPrice(v: any) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? `$${n.toLocaleString()}` : '';
}

function topFeatures(specs?: Record<string, any> | null, max = 4): string[] {
  if (!specs) return [];
  const pairs = Object.entries(specs)
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .slice(0, max);
  return pairs.map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v)}`);
}

function makeDeterministicPitch(p: any) {
  const lines: string[] = [];
  const precio = fmtPrice(p.price);
  lines.push(`Este ${p.category?.toLowerCase() ?? 'producto'} **${p.name ?? ''}** está pensado para quienes buscan calidad y valor.`);

  const feats = topFeatures(p.specs, 4);
  if (feats.length) {
    lines.push(`Características clave: ${feats.join(' · ')}.`);
  }
  if (typeof p.rating === 'number') {
    lines.push(`Valoración: ⭐ ${p.rating}/5.`);
  }
  if (precio) {
    lines.push(`Precio: ${precio}.`);
  }
  if (p.description) {
    const d = String(p.description).trim();
    if (d) lines.push(d.length > 220 ? d.slice(0, 220) + '…' : d);
  }
  lines.push(`Si te interesa, puedo comparar con opciones similares o verificar disponibilidad. ¿Quieres que avancemos?`);
  return lines.join(' ');
}

function buildSalesPrompt(p: any, q: string, chunks: Array<{ text: string }>) {
  const precio = fmtPrice(p.price);
  const feats = topFeatures(p.specs, 6);
  const contexto = [
    p.description ? `Descripción: ${String(p.description).slice(0, 400)}` : '',
    ...chunks.map(c => c.text).slice(0, 5),
  ].filter(Boolean).join('\n');

  return `
Eres un asesor de ventas experto. Habla SIEMPRE en español (tono cercano y persuasivo, sin exagerar).
Responde en 4–6 líneas, con 1 frase inicial atractiva, 2–3 ventajas concretas y una llamada a la acción.
Usa SOLO la información proporcionada del producto y el contexto. Si falta un dato, no lo inventes.

[Consulta del usuario]
${q}

[Producto]
Nombre: ${p.name ?? ''}
Categoría: ${p.category ?? ''}
${precio ? `Precio: ${precio}` : ''}
${typeof p.rating === 'number' ? `Valoración: ${p.rating}/5` : ''}

[Características]
${feats.length ? '- ' + feats.join('\n- ') : '(sin datos de características)'}

[Contexto (opcional)]
${contexto || '(sin contexto adicional)'}
`;
}


export default function ProductDetail() {
  // 1) Parámetro /:id
  const params = useParams<{ id: string }>();
  const id = params.id;

  // 2) Estado local
  const [product, setProduct] = useState<Product | null>(null);
  const [similarProducts, setSimilarProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showVoicePanel, setShowVoicePanel] = useState(false);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);

  const { toast } = useToast();

  // 3) Voz en español con sesión que expone status/start/stop/reset
  const voice = useVoiceSession(
    async (userQuery: string) => {
      const q = (userQuery || '').trim();
      if (!q) return 'No te entendí. ¿Puedes repetirlo?';

      if (!product) {
        return 'Estoy cargando el producto, inténtalo en unos segundos.';
      }

      // 1) RAG (si está disponible)
      let chunks: Array<{ text: string }> = [];
      try {
        const rag = await fetchRagContext({ userQuery: q, productId: product.id, topK: 6 });
        const raw = rag?.context_chunks ?? [];
        chunks = raw
          .filter((c: any) => Number(c.similarity ?? 0) >= 0.55)
          .map((c: any) => ({ text: String(c.text ?? '') }));
      } catch {
        // sin RAG, seguimos solo con datos del producto
      }

      // 2) Prompt de VENTAS en español
      const prompt = buildSalesPrompt(product, q, chunks);

      // 3) LLM con fallback determinista
      try {
        const reply = await askGemini(prompt);
        return reply || makeDeterministicPitch(product);
      } catch {
        return makeDeterministicPitch(product);
      }
    },
    {
      lang: 'es-MX',       // Reconocimiento y TTS en español
      speakTimeoutMs: 40000,
      // voiceName: 'Microsoft Raul - Spanish (Mexico)', // opcional
    }
  );

  // 4) Cargar producto + similares (EFECTO)
  useEffect(() => {
    let alive = true;

    const load = async () => {
      if (!id) return;
      setIsLoading(true);
      try {
        const data = await getProductById(id);
        if (!alive) return;

        setProduct(data);

        if (data) {
          const similar = await getSimilarProductsByCategory(data.category, id);
          if (!alive) return;
          setSimilarProducts(similar);
        } else {
          setSimilarProducts([]);
        }
      } catch (error: any) {
        console.error('Error loading product:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'No se pudo cargar el detalle del producto.',
        });
      } finally {
        if (alive) setIsLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
      // ✅ al salir de la página, cancelar voz
      voice.stopListening?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 5) Historial para el panel (antes de cualquier return)
  const history = useMemo(() => {
    const items: { role: 'user' | 'assistant'; content: string }[] = [];
    if (voice.lastUserText) items.push({ role: 'user', content: voice.lastUserText });
    if (voice.lastAnswer) items.push({ role: 'assistant', content: voice.lastAnswer });
    return items;
  }, [voice.lastUserText, voice.lastAnswer]);

  // 6) Early return
  if (isLoading || !product) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Cargando…</div>
      </div>
    );
  }

  // 7) Render principal
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver al marketplace
            </Button>
          </Link>
        </div>
      </header>

      {/* Main */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-12 mb-16">
          {/* Product Image */}
          <div className="aspect-square rounded-2xl overflow-hidden shadow-card">
            <img
              src={product.image_url || undefined}
              alt={product.name || 'Producto'}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>

          {/* Product Info */}
          <div className="flex flex-col gap-6">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <h1 className="text-4xl font-bold tracking-tight">{product.name}</h1>
                {typeof product.rating === 'number' && product.rating > 0 && (
                  <RatingBadge value={product.rating} />
                )}
              </div>

              <PriceTag amount={product.price} className="text-3xl" />

              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-secondary rounded-full text-sm font-medium">
                  {product.category}
                </span>
              </div>
            </div>

            {/* Key Specs */}
            {product.specs && Object.keys(product.specs).length > 0 && (
              <Card className="p-6">
                <h3 className="font-semibold mb-4">Características</h3>
                <ul className="space-y-2">
                  {Object.entries(product.specs).map(([key, value]) => (
                    <li key={key} className="flex items-start gap-2">
                      <ChevronRight className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm">
                        <span className="font-medium capitalize">
                          {key.replace(/_/g, ' ')}:
                        </span>{' '}
                        {String(value)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Description */}
            <Collapsible
              open={isDescriptionOpen}
              onOpenChange={setIsDescriptionOpen}
            >
              <Card className="p-6">
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-between p-0 hover:bg-transparent"
                  >
                    <h3 className="font-semibold">Descripción completa</h3>
                    <ChevronRight
                      className={`h-5 w-5 transition-transform ${isDescriptionOpen ? 'rotate-90' : ''}`}
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-4">
                  <p className="text-muted-foreground leading-relaxed">
                    {product.description || 'Sin descripción disponible.'}
                  </p>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* Voice AI CTA */}
            <div className="pt-4">
              <VoiceButton
                onStart={() => { setShowVoicePanel(true); voice.startListening(); }}
                onStop={() => { voice.stopListening(); }}
                status={voice.status} // 'idle' | 'listening' | 'thinking' | 'speaking'
              />
              <p className="text-sm text-muted-foreground mt-2">
                Haz preguntas sobre este producto con tu voz
              </p>
            </div>
          </div>
        </div>

        {/* Similar Products */}
        {similarProducts.length > 0 && (
          <section className="space-y-6">
            <SectionTitle>Productos similares</SectionTitle>
            <ScrollArea className="w-full">
              <div className="flex gap-6 pb-4">
                {similarProducts.map((similar) => (
                  <div key={similar.id} className="w-[300px] shrink-0">
                    <ProductCard product={similar} />
                  </div>
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </section>
        )}
      </main>

      {/* Voice Panel */}
      {showVoicePanel && (
        <VoicePanel
          history={history}
          status={voice.status}
          onClose={() => {
            setShowVoicePanel(false);
            voice.stopListening();
            voice.reset();
          }}
          onRetry={() => voice.startListening()}
        />
      )}
    </div>
  );
}

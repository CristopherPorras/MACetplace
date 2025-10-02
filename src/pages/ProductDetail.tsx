// src/pages/ProductDetail.tsx
// -------------------------------------------------------------
// FIX: No declarar hooks después de returns condicionales.
// Movimos useMemo (history) arriba, antes del early return.
// -------------------------------------------------------------

import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ChevronRight } from 'lucide-react';

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

import { useVoiceSession } from '@/lib/useVoiceSession';
import { useToast } from '@/hooks/use-toast';

// (Opcional) Integra LLM si quieres respuestas del modelo:
// import { askGemini } from '@/lib/llm';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

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

  // 3) Hook de voz (si tu hook acepta callback: onAsk)
  const voiceSession = useVoiceSession(async (userQuery: string) => {
    const q = (userQuery || '').trim();
    if (!q) return "I didn't catch that. Please try again.";

    if (product) {
      const details =
        product.description?.trim() ||
        'No description available for this item yet.';
      return `You asked about "${product.name}". Here's what I know: ${details}`;
    }

    return 'Sorry, I could not find information about this product.';
  });

  // 4) Helpers tolerantes a diferencias de API del hook de voz
  const startVoice = () =>
    (voiceSession as any).startListening?.() ??
    (voiceSession as any).start?.();

  const stopVoice = () =>
    (voiceSession as any).stopListening?.() ??
    (voiceSession as any).stop?.();

  const resetVoice = () => (voiceSession as any).reset?.();

  // 5) Cargar producto + similares (EFECTO)
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
          const similar = await getSimilarProductsByCategory(
            data.category,
            id
          );
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
          description: 'Failed to load product details.',
        });
      } finally {
        if (alive) setIsLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, [id, toast]);

  // 6) ✅ useMemo ANTES de cualquier return condicional
  const history = useMemo(() => {
    const items: { role: 'user' | 'assistant'; content: string }[] = [];
    const userText = (voiceSession as any).lastUserText ?? (voiceSession as any).userText;
    const answer = (voiceSession as any).lastAnswer ?? (voiceSession as any).answer;

    if (userText) items.push({ role: 'user', content: userText });
    if (answer) items.push({ role: 'assistant', content: answer });
    return items;
  }, [
    (voiceSession as any).lastUserText,
    (voiceSession as any).userText,
    (voiceSession as any).lastAnswer,
    (voiceSession as any).answer,
  ]);

  // 7) Early return (después de TODOS los hooks)
  if (isLoading || !product) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // 8) A partir de aquí TS a veces “olvida” el narrowing; fijamos 'p'
  const p = product as Product;

  // 9) Render principal
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Marketplace
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
              src={p.image_url || undefined}
              alt={p.name || 'Product'}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>

          {/* Product Info */}
          <div className="flex flex-col gap-6">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <h1 className="text-4xl font-bold tracking-tight">{p.name}</h1>
                {typeof p.rating === 'number' && p.rating > 0 && (
                  <RatingBadge value={p.rating} />
                )}
              </div>

              <PriceTag amount={p.price} className="text-3xl" />

              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-secondary rounded-full text-sm font-medium">
                  {p.category}
                </span>
              </div>
            </div>

            {/* Key Specs */}
            {p.specs && Object.keys(p.specs).length > 0 && (
              <Card className="p-6">
                <h3 className="font-semibold mb-4">Key Features</h3>
                <ul className="space-y-2">
                  {Object.entries(p.specs).map(([key, value]) => (
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
                    <h3 className="font-semibold">Full Description</h3>
                    <ChevronRight
                      className={`h-5 w-5 transition-transform ${isDescriptionOpen ? 'rotate-90' : ''
                        }`}
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-4">
                  <p className="text-muted-foreground leading-relaxed">
                    {p.description || 'No description available.'}
                  </p>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* Voice AI CTA */}
            <div className="pt-4">
              <VoiceButton
                onStart={() => { setShowVoicePanel(true); startVoice(); }}
                onStop={() => { stopVoice(); }}
                status={(voiceSession as any).status}
              />
              <p className="text-sm text-muted-foreground mt-2">
                Ask questions about this product using voice
              </p>
            </div>
          </div>
        </div>

        {/* Similar Products */}
        {similarProducts.length > 0 && (
          <section className="space-y-6">
            <SectionTitle>Similar Products</SectionTitle>
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
          status={(voiceSession as any).status}
          onClose={() => { setShowVoicePanel(false); resetVoice(); }}
          onRetry={() => startVoice()}
        />
      )}
    </div>
  );
}

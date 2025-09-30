import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PriceTag } from '@/components/PriceTag';
import { RatingBadge } from '@/components/RatingBadge';
import { VoiceButton } from '@/components/VoiceButton';
import { VoicePanel } from '@/components/VoicePanel';
import { ProductCard } from '@/components/ProductCard';
import { SectionTitle } from '@/components/SectionTitle';
import { getProductById, getSimilarProductsByCategory, type Product } from '@/lib/supabaseClient';
import { useVoiceSession } from '@/lib/useVoiceSession';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [similarProducts, setSimilarProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showVoicePanel, setShowVoicePanel] = useState(false);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const { toast } = useToast();

  const voiceSession = useVoiceSession({
    product: product!,
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Voice Error',
        description: error.message,
      });
    },
  });

  useEffect(() => {
    const loadProduct = async () => {
      if (!id) return;
      
      setIsLoading(true);
      try {
        const data = await getProductById(id);
        setProduct(data);

        if (data) {
          const similar = await getSimilarProductsByCategory(data.category, id);
          setSimilarProducts(similar);
        }
      } catch (error) {
        console.error('Error loading product:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to load product details.',
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadProduct();
  }, [id, toast]);

  const handleVoiceStart = () => {
    setShowVoicePanel(true);
    voiceSession.startListening();
  };

  const handleVoiceStop = () => {
    voiceSession.stopListening();
  };

  const handleClosePanel = () => {
    setShowVoicePanel(false);
    voiceSession.reset();
  };

  if (isLoading || !product) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
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

      <main className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-12 mb-16">
          {/* Product Image */}
          <div className="aspect-square rounded-2xl overflow-hidden shadow-card">
            <img
              src={product.image_url}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Product Info */}
          <div className="flex flex-col gap-6">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <h1 className="text-4xl font-bold tracking-tight">{product.name}</h1>
                {product.rating > 0 && <RatingBadge value={product.rating} />}
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
                <h3 className="font-semibold mb-4">Key Features</h3>
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
            <Collapsible open={isDescriptionOpen} onOpenChange={setIsDescriptionOpen}>
              <Card className="p-6">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-0 hover:bg-transparent">
                    <h3 className="font-semibold">Full Description</h3>
                    <ChevronRight className={`h-5 w-5 transition-transform ${isDescriptionOpen ? 'rotate-90' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-4">
                  <p className="text-muted-foreground leading-relaxed">{product.description}</p>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* Voice AI CTA */}
            <div className="pt-4">
              <VoiceButton
                onStart={handleVoiceStart}
                onStop={handleVoiceStop}
                status={voiceSession.status}
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

      {showVoicePanel && (
        <VoicePanel
          history={voiceSession.messages}
          status={voiceSession.status}
          onClose={handleClosePanel}
          onRetry={() => voiceSession.startListening()}
        />
      )}
    </div>
  );
}

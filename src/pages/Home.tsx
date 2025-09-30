import { useState, useEffect, useMemo } from 'react';
import { SearchBar } from '@/components/SearchBar';
import { ProductGrid } from '@/components/ProductGrid';
import { ProductFilters } from '@/components/ProductFilters';
import { SectionTitle } from '@/components/SectionTitle';
import { EmptyState } from '@/components/EmptyState';
import { ProductGridSkeleton } from '@/components/Skeleton';
import { getProducts, getCategories, type Product } from '@/lib/supabaseClient';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from '@/hooks/useDebounce';

const PRODUCTS_PER_PAGE = 12;

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

  // Load categories on mount
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

  // Load products when filters change
  useEffect(() => {
    const loadProducts = async () => {
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

    loadProducts();
  }, [debouncedSearch, category, priceMin, priceMax, toast]);

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
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              onClear={() => setSearchQuery('')}
            />
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
    </div>
  );
}

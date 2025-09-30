import { Product } from '@/lib/supabaseClient';
import { ProductCard } from './ProductCard';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

type ProductGridProps = {
  products: Product[];
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoading?: boolean;
};

export function ProductGrid({ products, onLoadMore, hasMore = false, isLoading = false }: ProductGridProps) {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      
      {hasMore && onLoadMore && (
        <div className="flex justify-center">
          <Button
            onClick={onLoadMore}
            disabled={isLoading}
            variant="outline"
            size="lg"
            className="min-w-[200px]"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              'Load More'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

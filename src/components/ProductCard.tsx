import { Link } from 'react-router-dom';
import { Product } from '@/lib/supabaseClient';
import { PriceTag } from './PriceTag';
import { RatingBadge } from './RatingBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type ProductCardProps = {
  product: Product;
};

export function ProductCard({ product }: ProductCardProps) {
  return (
    <Card className="group overflow-hidden transition-all hover:shadow-hover">
      <Link to={`/product/${product.id}`} className="block">
        <div className="aspect-square overflow-hidden bg-muted">
          <img
            src={product.image_url}
            alt={product.name}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-lg line-clamp-2 flex-1">
              {product.name}
            </h3>
            {product.rating > 0 && <RatingBadge value={product.rating} />}
          </div>
          
          <p className="text-sm text-muted-foreground line-clamp-2">
            {product.description}
          </p>
          
          <div className="flex items-center justify-between pt-2">
            <PriceTag amount={product.price} />
            <Button 
              variant="outline" 
              size="sm"
              className="group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
            >
              View Details
            </Button>
          </div>
        </div>
      </Link>
    </Card>
  );
}

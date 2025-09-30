import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

type ProductFiltersProps = {
  category: string;
  onCategoryChange: (category: string) => void;
  priceMin: number;
  priceMax: number;
  onPriceChange: (min: number, max: number) => void;
  categories: string[];
};

export function ProductFilters({
  category,
  onCategoryChange,
  priceMin,
  priceMax,
  onPriceChange,
  categories,
}: ProductFiltersProps) {
  return (
    <Card className="p-6 space-y-6">
      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        <Select value={category} onValueChange={onCategoryChange}>
          <SelectTrigger id="category" className="w-full">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent className="z-50 bg-popover">
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <Label>Price Range</Label>
        <div className="flex gap-3">
          <div className="flex-1 space-y-1">
            <Label htmlFor="price-min" className="text-xs text-muted-foreground">
              Min
            </Label>
            <Input
              id="price-min"
              type="number"
              min="0"
              value={priceMin}
              onChange={(e) => onPriceChange(Number(e.target.value), priceMax)}
              placeholder="$0"
            />
          </div>
          <div className="flex-1 space-y-1">
            <Label htmlFor="price-max" className="text-xs text-muted-foreground">
              Max
            </Label>
            <Input
              id="price-max"
              type="number"
              min="0"
              value={priceMax}
              onChange={(e) => onPriceChange(priceMin, Number(e.target.value))}
              placeholder="$999+"
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

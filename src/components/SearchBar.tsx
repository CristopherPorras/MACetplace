import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder?: string;
};

export function SearchBar({ value, onChange, onClear, placeholder = 'Search products...' }: SearchBarProps) {
  return (
    <div className="relative w-full max-w-2xl">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
      <Input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-12 pr-12 h-12 text-base rounded-xl shadow-card focus-visible:shadow-hover transition-all"
        aria-label="Search products"
      />
      {value && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

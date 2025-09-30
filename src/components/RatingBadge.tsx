import { Star } from 'lucide-react';

type RatingBadgeProps = {
  value: number;
  className?: string;
};

export function RatingBadge({ value, className = '' }: RatingBadgeProps) {
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-1 bg-success/10 rounded-lg ${className}`}>
      <Star className="h-4 w-4 fill-success text-success" />
      <span className="text-sm font-semibold text-success">{value.toFixed(1)}</span>
    </div>
  );
}

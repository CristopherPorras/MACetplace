type PriceTagProps = {
  amount: number;
  currency?: string;
  className?: string;
};

export function PriceTag({ amount, currency = 'USD', className = '' }: PriceTagProps) {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);

  return (
    <span className={`text-2xl font-bold bg-gradient-accent bg-clip-text text-transparent ${className}`}>
      {formatted}
    </span>
  );
}

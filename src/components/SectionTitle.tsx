type SectionTitleProps = {
  children: React.ReactNode;
  subtitle?: string;
  className?: string;
};

export function SectionTitle({ children, subtitle, className = '' }: SectionTitleProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      <h2 className="text-3xl font-bold tracking-tight">{children}</h2>
      {subtitle && (
        <p className="text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

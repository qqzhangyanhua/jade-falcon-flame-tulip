export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-baseline gap-2 ${className}`}>
      <span className="font-display text-xl tracking-tight text-fg">Keystone</span>
      <span className="text-xs uppercase tracking-kicker text-subtle">定调</span>
    </div>
  );
}

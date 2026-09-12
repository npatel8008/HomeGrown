export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-ink-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-sage-deep border-t-forest" />
      {label ? <span>{label}</span> : null}
    </div>
  );
}

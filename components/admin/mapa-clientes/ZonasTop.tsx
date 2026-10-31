export function ZonasTop({ zonas, total }: { zonas: Array<{ zona: string; clientes: number }>; total: number }) {
  if (zonas.length === 0) return <p className="py-6 text-center text-sm text-[var(--text-secondary)]">Aún no hay zonas que mostrar.</p>;
  return (
    <ul className="space-y-2 py-1">
      {zonas.map((z) => {
        const pct = total > 0 ? Math.round((z.clientes / total) * 100) : 0;
        return (
          <li key={z.zona} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-sm text-[var(--text-secondary)]" title={z.zona}>{z.zona}</span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(pct, 3)}%` }} />
            </div>
            <span className="w-16 shrink-0 text-right text-sm tabular-nums text-[var(--text-secondary)]">{z.clientes} ({pct}%)</span>
          </li>
        );
      })}
    </ul>
  );
}

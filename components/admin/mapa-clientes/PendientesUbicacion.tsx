import { MapPin } from "@buleje/design-system/icons";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { enlacePedirUbicacion, type ClienteSinUbicacion } from "./shared";

/** Clientes que aún no tienen GPS: cada fila abre WhatsApp con el pedido de ubicación ya escrito. */
export function PendientesUbicacion({ clientes }: { clientes: ClienteSinUbicacion[] }) {
  if (clientes.length === 0) {
    return <p className="py-6 text-center text-sm text-[var(--text-secondary)]">Todos tus clientes ya tienen ubicación.</p>;
  }
  return (
    <ul className="divide-y divide-[var(--rule-soft)]">
      {clientes.map((c) => {
        const url = enlacePedirUbicacion(c);
        return (
          <li key={c.phone || c.name} className="flex min-h-12 items-center gap-2 py-1">
            <div className="min-w-0 flex-1">
              <EnlacePanel cosa="cliente" id={c.phone} apariencia="heredada" className="block truncate text-sm font-semibold text-[var(--text-primary)]">{c.name}</EnlacePanel>
              <p className="truncate text-sm text-[var(--text-secondary)]">{c.location || c.phone || "sin número"}</p>
            </div>
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[var(--accent-ink)] hover:bg-primary/10 dark:text-[var(--accent)]">
                <MapPin className="h-4 w-4" aria-hidden /> Pedir ubicación
                <span className="sr-only"> a {c.name} por WhatsApp</span>
              </a>
            ) : (
              <span className="shrink-0 px-3 text-sm text-[var(--data-warning-ink)]">Sin número</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

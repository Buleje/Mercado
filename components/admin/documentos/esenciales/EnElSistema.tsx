"use client";

import { ArrowRight } from "@buleje/design-system/icons";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import type { BloqueEnElSistema, TonoBloque } from "@/lib/documentos/tercero-en-el-sistema";
import { useTerceroEnElSistema } from "./use-tercero-en-el-sistema";

const TONO: Record<TonoBloque, string> = {
  bien: "text-[var(--data-success-ink)]",
  atencion: "text-[var(--data-warning-ink)]",
  neutro: "text-[var(--text-primary)]",
};

/**
 * Lo que el tercero ligado ya tiene en los otros módulos (cuenta, permisos,
 * guías, compras, fiado, papeles): una tarjeta por módulo con la cifra y el
 * enlace. Se monta al abrir el plegable: cerrado no pide nada.
 */
export default function EnElSistema({ carpetaId, clave }: { carpetaId: string; clave: string }) {
  const { dato, cargando, fallo, reintentar } = useTerceroEnElSistema(carpetaId, clave);

  if (cargando) {
    return (
      <ul className="grid gap-2" aria-busy="true" aria-label="Cargando lo que tiene en el sistema">
        {[0, 1].map((i) => <li key={i} className="h-16 animate-pulse rounded-xl bg-[var(--surface-sunken)]" />)}
      </ul>
    );
  }
  if (fallo || !dato) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
        No se pudo cargar.
        <button type="button" onClick={reintentar} className={button({ variant: "ghost", size: "sm" })}>Prueba de nuevo</button>
      </p>
    );
  }

  return (
    <div className="space-y-2" data-qa="esencial-en-el-sistema">
      {dato.bloques.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">Todavía no tiene nada en otros módulos.</p>
      ) : (
        <ul className="grid gap-2">
          {dato.bloques.map((b) => <li key={b.id}><Bloque b={b} /></li>)}
        </ul>
      )}
      {dato.sinPermiso.length > 0 && (
        <p className="text-xs text-[var(--text-tertiary)]">Tu rol no ve {dato.sinPermiso.join(" ni ")}.</p>
      )}
      {dato.ficha && (
        <EnlacePanel href={dato.ficha.href} apariencia="heredada" className={cn(button({ variant: "secondary" }), "w-full gap-2 hover:no-underline")}>
          {dato.ficha.texto} <ArrowRight className="h-4 w-4" />
        </EnlacePanel>
      )}
    </div>
  );
}

function Bloque({ b }: { b: BloqueEnElSistema }) {
  return (
    <div className="rounded-xl border border-[var(--rule-base)] px-3 py-2">
      <p className="text-xs text-[var(--text-tertiary)]">{b.titulo}</p>
      <p className={cn("text-sm font-bold tabular-nums", TONO[b.tono ?? "neutro"])}>{b.cifra}</p>
      {b.detalle && <p className="text-xs tabular-nums text-[var(--text-secondary)]">{b.detalle}</p>}
      {b.href && (
        <EnlacePanel href={b.href} className="mt-1 inline-flex min-h-8 items-center gap-1 text-sm">
          {b.enlace ?? "Ver"} <ArrowRight className="h-4 w-4" />
        </EnlacePanel>
      )}
    </div>
  );
}

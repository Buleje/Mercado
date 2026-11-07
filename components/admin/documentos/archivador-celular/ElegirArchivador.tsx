"use client";

import { useState } from "react";
import { ChevronDown, FolderArchive, QrCode } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { textoDestino, type Destino, type GrupoArchivador } from "@/lib/documentos/archivador-celular";

const destinoDe = (g: GrupoArchivador, s?: GrupoArchivador["separadores"][number]): Destino => ({
  clave: g.clave,
  archivador: g.archivador,
  separador: s?.separador ?? null,
  claveSeparador: s?.claveSeparador ?? null,
});

/** Paso 1: «¿En qué archivador vas a guardar?» — el archivador entero o uno de sus separadores. */
export default function ElegirArchivador({
  grupos,
  sinLugar,
  ultimo,
  onElegir,
}: {
  grupos: readonly GrupoArchivador[];
  sinLugar: number;
  ultimo: Destino | null;
  onElegir: (d: Destino) => void;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const ultimoVigente = ultimo && grupos.some((g) => g.clave === ultimo.clave) ? ultimo : null;

  if (grupos.length === 0) {
    return (
      <p className="text-sm text-[var(--text-secondary)]" data-qa="archivador-vacio">
        Ninguna carpeta dice todavía en qué archivador va. Anótalo en cada carpeta («¿Dónde guardas estos papeles?») y vuelve aquí.
      </p>
    );
  }

  return (
    <div className="space-y-3" data-qa="elegir-archivador">
      <p className="text-sm font-semibold text-[var(--text-primary)]">¿En qué archivador vas a guardar?</p>
      {ultimoVigente && (
        <button type="button" onClick={() => onElegir(ultimoVigente)} className={button({ variant: "primary", className: "w-full justify-start gap-2" })}>
          <QrCode className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">Seguir con {textoDestino(ultimoVigente)}</span>
        </button>
      )}
      <ul className="space-y-2">
        {grupos.map((g) => {
          const abiertoAqui = abierto === g.clave;
          return (
            <li key={g.clave} className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
              <div className="flex items-stretch">
                <button
                  type="button"
                  onClick={() => onElegir(destinoDe(g))}
                  className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left hover:bg-[var(--surface-sunken)]"
                  data-qa="archivador-opcion"
                >
                  <FolderArchive className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-[var(--text-primary)]">{g.archivador}</span>
                    <span className="block text-sm tabular-nums text-[var(--text-secondary)]">
                      {g.registrados} de {g.total} en su sitio
                    </span>
                  </span>
                </button>
                {g.separadores.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setAbierto(abiertoAqui ? null : g.clave)}
                    aria-expanded={abiertoAqui}
                    aria-label={`Separadores de ${g.archivador}`}
                    title="Elegir un separador"
                    className="flex w-12 shrink-0 items-center justify-center border-l border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                  >
                    <ChevronDown className={cn("h-5 w-5 transition-transform", abiertoAqui && "rotate-180")} aria-hidden />
                  </button>
                )}
              </div>
              {abiertoAqui && (
                <div className="flex flex-wrap gap-2 border-t border-[var(--rule-base)] px-3 py-2">
                  {g.separadores.map((s) => (
                    <button
                      key={s.claveSeparador}
                      type="button"
                      onClick={() => onElegir(destinoDe(g, s))}
                      className={button({ variant: "secondary", className: "gap-2" })}
                      data-qa="separador-opcion"
                    >
                      <span className="truncate">{s.separador}</span>
                      <span className="tabular-nums text-[var(--text-secondary)]">{s.registrados}/{s.total}</span>
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {sinLugar > 0 && (
        <p className="text-sm text-[var(--text-secondary)]">
          {sinLugar === 1 ? "1 papel con código no tiene" : `${sinLugar} papeles con código no tienen`} archivador (su carpeta no lo dice).
        </p>
      )}
    </div>
  );
}

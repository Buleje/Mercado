/**
 * «Papeles que llegaron» — los seis casilleros de documentos de la guía
 * (ADR-438: factura, guías de remisión, lista de trozas, GTF y otros), como
 * una grilla de casillas: llena con su cuenta de archivos o vacía punteada.
 * Sólo mira; subir y quitar se hace en «Documentos».
 */

import { CheckCircle2, FolderOpen } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { DocumentosDeGuia } from "@/hooks/use-documentos-guia";
import { CASILLEROS_GUIA, TOTAL_CASILLEROS } from "@/lib/forestal/documentos-guia";
import { BOTON_BLOQUE, BloqueCargando, BloqueFicha } from "./comun";

export default function BloquePapeles({
  datos,
  cargando,
  error,
  onAbrir,
  ocupado,
  indice,
}: {
  datos: DocumentosDeGuia | null;
  cargando: boolean;
  error: string | null;
  onAbrir?: () => void;
  ocupado: boolean;
  indice: number;
}) {
  const porClave = new Map((datos?.casilleros ?? []).map((c) => [c.clave, c.docs.length]));
  return (
    <BloqueFicha
      titulo="Papeles que llegaron"
      plegable
      icono={FolderOpen}
      indice={indice}
      info={
        <InfoTip
          title="Documentos de la guía"
          what="Un casillero por papel que viaja con el camión: factura, guía de remisión del remitente, guía del transportista, lista de trozas, GTF y otros."
          affects="Quedan en el Drive con el N° de guía: el expediente de una fiscalización ya está armado."
        />
      }
      extra={
        datos ? (
          <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
            {datos.llenos}/{TOTAL_CASILLEROS}
          </span>
        ) : undefined
      }
      pie={
        onAbrir ? (
          <button type="button" onClick={onAbrir} disabled={ocupado} className={BOTON_BLOQUE}>
            <FolderOpen className="h-4 w-4" aria-hidden /> Documentos
          </button>
        ) : undefined
      }
    >
      {cargando && !datos ? (
        <BloqueCargando filas={3} />
      ) : error && !datos ? (
        <p className="text-sm text-[var(--text-secondary)]">{error}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2">
          {CASILLEROS_GUIA.map((c) => {
            const n = porClave.get(c.clave) ?? 0;
            return (
              <li
                key={c.clave}
                title={c.hint}
                className={`flex min-h-14 items-start gap-2 rounded-xl p-2 text-sm ${
                  n > 0
                    ? "bg-[var(--data-success-500)]/10 text-[var(--text-primary)]"
                    : "border border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)]"
                }`}
              >
                {n > 0 ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-success-ink)]" aria-hidden />
                ) : (
                  <span aria-hidden className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 border-dashed border-[var(--text-tertiary)]" />
                )}
                <span className="min-w-0 leading-snug">
                  <span className="line-clamp-2 font-semibold">{c.label}</span>
                  <span className="text-xs tabular-nums">{n > 0 ? `${n} archivo${n === 1 ? "" : "s"}` : "vacío"}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </BloqueFicha>
  );
}

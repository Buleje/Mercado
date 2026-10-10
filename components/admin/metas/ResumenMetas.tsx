"use client";

/**
 * ResumenMetas — cuántas metas van cumplidas, en camino, atrasadas o pasadas
 * del tope. Plegable y recordado en este navegador (patrón de
 * `LothSeccionKpis`): plegado sigue diciendo las cifras en una línea, porque
 * plegar no es esconder el dato.
 */
import { BarChart3, ChevronDown } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { EstadoMeta } from "@/lib/admin/metas-periodo";
import type { AvanceMetaDTO } from "@/lib/admin/metas-catalogo";
import type { MetaDTO } from "@/lib/admin/metas-tareas";
import { NOMBRE_ESTADO, TEXTO_TONO, TONO_ESTADO } from "./clases-meta";

export const CLAVE_RESUMEN_METAS = "metas:resumen-abierto";
const ORDEN: readonly EstadoMeta[] = ["cumplida", "en_camino", "atrasada", "pasada_del_tope", "no_cumplida", "sin_dato"];
const PANEL_ID = "metas-resumen-panel";

export function ResumenMetas({ metas, avances }: { metas: MetaDTO[]; avances: Map<string, AvanceMetaDTO> }) {
  const [abierto, setAbierto] = useLocalStorage<boolean>(CLAVE_RESUMEN_METAS, false);
  const cuenta: Record<EstadoMeta, number> = { cumplida: 0, en_camino: 0, atrasada: 0, pasada_del_tope: 0, no_cumplida: 0, sin_dato: 0 };
  for (const m of metas) cuenta[avances.get(m.id)?.estado ?? "sin_dato"]++;
  const conCifra = ORDEN.filter((e) => cuenta[e] > 0);

  return (
    <section aria-label="Resumen de tus metas" className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={() => setAbierto(!abierto)}
          aria-expanded={abierto}
          aria-controls={PANEL_ID}
          title={abierto ? "Oculta el resumen. Se recuerda en este navegador." : "Muestra el resumen por estado"}
          className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${
            abierto
              ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)] dark:text-[var(--accent)]"
              : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
          }`}
        >
          <BarChart3 className="h-4 w-4" aria-hidden="true" />
          Resumen
          <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        {!abierto && (
          <p className="flex flex-wrap items-center gap-x-2 text-sm tabular-nums text-[var(--text-secondary)]">
            {conCifra.map((e, i) => (
              <span key={e} className="inline-flex items-center gap-2">
                {i > 0 && <span aria-hidden="true">·</span>}
                <span className={e === "cumplida" || e === "en_camino" || e === "sin_dato" ? undefined : `font-bold ${TEXTO_TONO[TONO_ESTADO[e]]}`}>
                  {cuenta[e]} {NOMBRE_ESTADO[e][cuenta[e] === 1 ? 0 : 1]}
                </span>
              </span>
            ))}
          </p>
        )}
      </div>

      <div id={PANEL_ID} hidden={!abierto} className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cuadro titulo="Cumplidas" valor={cuenta.cumplida} de={metas.length} tono="exito" />
        <Cuadro titulo="En camino" valor={cuenta.en_camino} de={metas.length} tono="exito" />
        <Cuadro titulo="Atrasadas" valor={cuenta.atrasada} de={metas.length} tono="aviso" />
        <Cuadro
          titulo="Fuera de la meta"
          valor={cuenta.pasada_del_tope + cuenta.no_cumplida}
          de={metas.length}
          tono="error"
          nota={cuenta.sin_dato > 0 ? `${cuenta.sin_dato} sin dato` : undefined}
        />
      </div>
    </section>
  );
}

function Cuadro({
  titulo,
  valor,
  de,
  tono,
  nota,
}: {
  titulo: string;
  valor: number;
  de: number;
  tono: keyof typeof TEXTO_TONO;
  nota?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2.5">
      <span className="block text-xs font-semibold text-[var(--text-secondary)]">{titulo}</span>
      <span className={`block text-2xl font-extrabold tabular-nums ${valor > 0 ? TEXTO_TONO[tono] : "text-[var(--text-tertiary)]"}`}>{valor}</span>
      <span className="block text-xs tabular-nums text-[var(--text-tertiary)]">
        de {de} meta{de === 1 ? "" : "s"}
        {nota && ` · ${nota}`}
      </span>
    </div>
  );
}

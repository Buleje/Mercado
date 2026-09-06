"use client";

/**
 * reparto-opciones — la alerta de descuadre y el panel de "Opciones" (firma
 * del PDF + filtro de especies) de ResumenReparto.
 *
 * Salió de ahí por la misma razón que `reparto-vistas`: el componente volvió a
 * pasar las ~300 líneas al sumar estos dos bloques, que además son puro render
 * sobre estado que ya vive en el padre (nada de lógica propia acá).
 */

import { useState, type Dispatch, type SetStateAction } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Lightbulb } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { DiagnosticoReparto, HuecoBloque } from "@/lib/forestal/cubicacion-reparto-diagnostico";

/**
 * Rolliza libre por debajo de esto es normal (redondeo del % aprovechable, no
 * madera real sin usar) — un aserradero mide con cinta, así que la alerta
 * arranca donde ya se nota: 50 litros.
 */
export const LIBRE_ALERTA_M3 = 0.05;

/** Cuántas medidas de la sugerencia se listan antes de resumir el resto. */
const MEDIDAS_VISIBLES = 6;

/** Rótulo corto de cada causa, para la chapita de la izquierda. */
const ROTULO_CAUSA: Record<HuecoBloque["causa"], string> = {
  "otra-especie": "No cruza la especie",
  "filtro-grupo": "Filtro de grupos",
  "filtro-largo": "Filtro de largos",
  "tope-piezas": "Tope de piezas",
  "no-entra": "No entra otra pieza",
  "sin-faltante": "Sobra capacidad",
  "piezas-de-mas": "Sobran piezas declaradas",
  pasado: "Ampara de más",
};

/** Un hueco explicado: qué pasa, qué hacer y con qué medidas se cierra. */
function HuecoFila({ h }: { h: HuecoBloque }) {
  const cerrable = h.sugeridoM3 > 0;
  return (
    <li className="rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/10 dark:text-[var(--data-warning-500)]">
          {ROTULO_CAUSA[h.causa]}
        </span>
        <b className="text-sm text-[var(--text-primary)]">{h.etiqueta}</b>
        <span className="text-sm text-[var(--text-tertiary)]">· {h.especie}</span>
        <span className="ml-auto font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
          {h.libreM3 > 0 && <>{fmtM3(h.libreM3)} m³ libres</>}
          {/* Negativo = el bloque se pasó unos litros para no dejar una pieza
              real sin amparar. Se dice con todas las letras, no con un menos. */}
          {h.libreM3 < 0 && <>{fmtM3(-h.libreM3)} m³ de más</>}
          {/* Volumen y conteo son dos cierres distintos: el bloque queda bien
              cuando no le sobra ninguno de los dos. */}
          {h.libreM3 !== 0 && (h.piezasLibres ?? 0) > 0 && " · "}
          {(h.piezasLibres ?? 0) > 0 && <>{h.piezasLibres} {h.piezasLibres === 1 ? "pieza" : "piezas"} sin ubicar</>}
        </span>
      </div>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">{h.detalle}</p>
      {h.accion && (
        <p className="mt-1 flex items-start gap-1.5 text-sm font-semibold text-[var(--accent)]">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {h.accion}
        </p>
      )}
      {cerrable && (
        <div className="mt-1.5 rounded-md bg-primary/10 px-2 py-1.5">
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            Con esto se cierra {fmtM3(h.sugeridoM3)} m³
          </span>
          {/* Con muchas medidas la línea se vuelve ilegible: se muestran las
              que más cierran (ya vienen ordenadas por m³) y el resto se cuenta. */}
          <p className="mt-0.5 font-mono text-sm tabular-nums text-[var(--text-primary)]">
            {h.sugerencia.slice(0, MEDIDAS_VISIBLES).map((m) => `${m.piezas}× ${m.medida}`).join("  ·  ")}
            {h.sugerencia.length > MEDIDAS_VISIBLES && ` · +${h.sugerencia.length - MEDIDAS_VISIBLES} medidas más`}
          </p>
        </div>
      )}
    </li>
  );
}

/**
 * Lo que conviene revisar ANTES de exportar: capacidad libre y aserrada sin
 * respaldo — y, desde 2026-09-02, **por qué** quedó así.
 *
 * Antes la alerta sólo daba los dos números. Cuando los dos eran IGUALES
 * («5.232 libres · 5.232 sin amparar») el motivo casi siempre era que el bloque
 * y la madera no se cruzaban —otra especie, un filtro puesto—, pero eso había
 * que adivinarlo. Ahora cada hueco se explica y trae las medidas concretas que
 * lo cerrarían, calculadas con el mismo motor del reparto.
 */
export function AlertaDescuadre({
  libreM3, faltanteM3, diagnostico,
}: {
  libreM3: number;
  faltanteM3: number;
  diagnostico?: DiagnosticoReparto | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const huecos = diagnostico?.huecos ?? [];
  /* Un bloque que se pasó unos litros para no dejar una pieza sin amparar no
     deja faltante ni capacidad libre —los dos números que disparaban la alerta—
     pero es justamente lo que hay que ver antes de firmar (Brandon: «sólo un
     aviso que falta o sobra»). */
  const pasados = huecos.filter((h) => h.causa === "pasado");
  const excesoM3 = pasados.reduce((a, h) => a - h.libreM3, 0);
  if (libreM3 <= LIBRE_ALERTA_M3 && faltanteM3 <= 0 && pasados.length === 0) return null;
  const recuperable = diagnostico?.recuperableM3 ?? 0;
  return (
    <div className="mb-4 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] p-3 text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/10 dark:text-[var(--data-warning-500)]">
      <div className="flex flex-wrap items-start gap-2 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          <b>Antes de exportar, revisá:</b>{" "}
          {/* «De capacidad», no «de rolliza»: un bloque de aserrada directa
              también puede quedar con volumen sin usar, y ahí no hay troza. */}
          {libreM3 > LIBRE_ALERTA_M3 && <>{fmtM3(libreM3)} m³ de capacidad quedaron libres (sin usar) en los bloques cargados.</>}
          {libreM3 > LIBRE_ALERTA_M3 && faltanteM3 > 0 && " · "}
          {faltanteM3 > 0 && <>{fmtM3(faltanteM3)} m³ de lo aserrado no tienen bloque que los ampare (abajo, en «Falta por distribuir»).</>}
          {recuperable > 0 && (
            <>
              {" "}
              <b>{fmtM3(recuperable)} m³ de eso se pueden acomodar</b> con los bloques que ya cargaste.
            </>
          )}
          {excesoM3 > 0 && (
            <>
              {libreM3 > LIBRE_ALERTA_M3 || faltanteM3 > 0 ? " · " : ""}
              {pasados.length === 1 ? "El bloque " : "Los bloques "}
              <b>{pasados.map((h) => h.etiqueta).join(", ")}</b> {pasados.length === 1 ? "ampara" : "amparan"}{" "}
              <b>{fmtM3(excesoM3)} m³ de más</b> que lo declarado: era eso o dejar madera real sin ningún bloque que la ampare.
            </>
          )}
        </span>
        {huecos.length > 0 && (
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border-2 border-[var(--data-warning-500)]/50 px-2.5 py-1 text-sm font-bold transition-colors hover:bg-[var(--data-warning-500)]/15"
          >
            {abierto ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
            {abierto ? "Ocultar el detalle" : `Por qué (${huecos.length})`}
          </button>
        )}
      </div>
      {abierto && huecos.length > 0 && (
        <ul className="mt-2.5 grid gap-2">
          {huecos.map((h) => <HuecoFila key={h.bloqueId} h={h} />)}
        </ul>
      )}
    </div>
  );
}

/** Firma del PDF + filtro de especies para los tres exports (PDF/Excel/CSV). */
export function OpcionesExportacion({
  firmaNombre, onFirmaNombre, firmaCargo, onFirmaCargo, especies, soloEspecies, setSoloEspecies,
}: {
  firmaNombre: string;
  onFirmaNombre: (v: string) => void;
  firmaCargo: string;
  onFirmaCargo: (v: string) => void;
  /** Especies presentes en la distribución actual, para armar los chips. */
  especies: readonly string[];
  soloEspecies: Set<string>;
  setSoloEspecies: Dispatch<SetStateAction<Set<string>>>;
}) {
  return (
    <div className="mb-4 grid gap-3 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3 sm:grid-cols-2 print:hidden">
      <div>
        <span className="mb-1.5 block text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
          Responsable de la distribución (firma del PDF)
        </span>
        <div className="flex flex-wrap gap-2">
          <input
            value={firmaNombre}
            onChange={(e) => onFirmaNombre(e.target.value)}
            placeholder="Nombre y apellido"
            aria-label="Nombre del responsable, va impreso sobre la línea de firma del PDF"
            className="h-9 flex-1 min-w-[140px] rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          <input
            value={firmaCargo}
            onChange={(e) => onFirmaCargo(e.target.value)}
            placeholder="Cargo (opcional)"
            aria-label="Cargo del responsable"
            className="h-9 w-40 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>
      {especies.length > 0 && (
        <div>
          <span className="mb-1.5 block text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            Especies a exportar {soloEspecies.size === 0 ? "(todas)" : `(${soloEspecies.size})`}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {especies.map((esp) => {
              const activa = soloEspecies.size === 0 || soloEspecies.has(esp);
              return (
                <button
                  key={esp}
                  type="button"
                  onClick={() => setSoloEspecies((prev) => {
                    // Con "todas" activo (set vacío) TODOS los chips se ven
                    // prendidos: el primer click tiene que AISLAR a ese chip
                    // (dejar sólo ése), no excluirlo — armar el set con el
                    // resto hacía justo lo contrario de lo que el chip mostraba
                    // (auditoría 2026-08-17, verificado con Playwright).
                    if (prev.size === 0) return new Set([esp]);
                    const next = new Set(prev);
                    if (next.has(esp)) next.delete(esp); else next.add(esp);
                    // Volver a marcar TODAS una por una colapsa al sentinel
                    // vacío: mismo estado que "todas", pero la etiqueta lo dice.
                    return next.size === especies.length ? new Set() : next;
                  })}
                  aria-pressed={activa}
                  className={`rounded-full border-2 px-2.5 py-1 text-xs font-bold transition-colors ${activa
                    ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                    : "border-[var(--rule-base)] text-[var(--text-tertiary)]"}`}
                >
                  {esp}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

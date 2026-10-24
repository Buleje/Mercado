"use client";

/**
 * Las partes de «Soltar trozas» (ADR-447 §6): el antes y después, los avisos,
 * qué corridas quedan listas y la lista de piezas con casillas. Sólo pintan:
 * las cuentas llegan hechas (`vistaPreviaDeSoltar` y la simulación del
 * servidor).
 */
import type { ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, CheckCircle2, Info, Loader2, Wand2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import {
  TOPE_RENDIMIENTO_PCT,
  type CorridaParaSoltar,
  type CorridaQueEspera,
  type LoteDeLaVista,
  type PiezaDeLaCorrida,
  type QueDestraba,
  type VistaPreviaDeSoltar,
} from "@/lib/forestal/soltar-trozas";
import { Btn } from "./ctp-shared";
import { ddmm, enLista } from "./ctp-sin-origen-comun";

const pct = (n: number | null) => (n == null ? "—" : `${formatNumber(n, 1)} %`);
const m3o = (n: number | null) => (n == null ? "sin origen" : `${fmtM3(n)} m³`);
const nro = (c: Pick<CorridaQueEspera, "lineNo" | "fecha">) => `N.º ${c.lineNo ?? "—"} del ${ddmm(c.fecha)}`;

const TONO = {
  error: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  aviso: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  info: "text-[var(--text-secondary)]",
} as const;

function Celda({ etiqueta, antes, despues, tono }: { etiqueta: string; antes: string; despues: string; tono?: "aviso" | "error" }) {
  return (
    /* En celular, una línea por cifra (etiqueta a la izquierda): tres cajas
       apiladas ocupaban media pantalla. */
    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-1.5 sm:block sm:py-2">
      <p className="text-xs font-semibold text-[var(--text-tertiary)]">{etiqueta}</p>
      <p className="font-mono text-sm tabular-nums text-[var(--text-secondary)] sm:mt-0.5">
        {antes}
        <span aria-hidden> → </span>
        <span className="sr-only"> pasa a </span>
        <b className={`text-base ${tono ? TONO[tono] : "text-[var(--text-primary)]"}`}>{despues}</b>
      </p>
    </div>
  );
}

/** Trozas, madera que entró y rendimiento: antes → después. */
export function AntesYDespues({ previa }: { previa: VistaPreviaDeSoltar }) {
  const { antes, despues } = previa;
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <Celda etiqueta="Trozas" antes={String(antes.piezas)} despues={String(despues.piezas)} />
      <Celda etiqueta="Madera que entró" antes={m3o(antes.m3)} despues={m3o(despues.m3)} tono={previa.imposible ? "error" : undefined} />
      <Celda
        etiqueta="Rinde"
        antes={pct(antes.rendimientoPct)}
        despues={pct(despues.rendimientoPct)}
        tono={previa.imposible ? "error" : previa.sobreElTope ? "aviso" : undefined}
      />
    </div>
  );
}

function Linea({ tono, children }: { tono: keyof typeof TONO; children: ReactNode }) {
  const Icono = tono === "info" ? Info : AlertTriangle;
  return (
    <p role={tono === "error" ? "alert" : undefined} className={`flex items-start gap-1.5 text-sm ${TONO[tono]}`}>
      <Icono aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

function textoDeLote(l: LoteDeLaVista): string {
  const salen = l.piezas === 1 ? "1 troza sale suelta" : `${l.piezas} trozas salen sueltas`;
  if (l.destino === "reabrir") return `El lote ${l.code} vuelve a quedar abierto con ${l.piezas === 1 ? "su troza" : `sus ${l.piezas} trozas`}.`;
  if (l.destino === "queda") return `El lote ${l.code} está abierto: se queda con ${l.piezas === 1 ? "ella" : "ellas"} para la próxima corrida.`;
  return l.quedan > 0
    ? `El lote ${l.code} sigue con ${l.quedan === 1 ? "1 troza" : `${l.quedan} trozas`} de la corrida; ${salen} al patio.`
    : `${salen} del lote ${l.code} al patio.`;
}

/** Lo que frena, lo que avisa y qué pasa con cada lote. */
export function AvisosDeSoltar({ corrida, previa, nombre }: { corrida: CorridaParaSoltar; previa: VistaPreviaDeSoltar; nombre: string }) {
  const out: ReactNode[] = [];
  if (corrida.mesCerrado) out.push(<Linea key="cierre" tono="error">{corrida.mesCerrado} está cerrado: la madera de la {nombre} no se toca.</Linea>);
  if (corrida.congelado) out.push(<Linea key="congelado" tono="error">La {nombre} tiene el costo congelado: su madera ya no se cambia.</Linea>);
  if (previa.imposible) {
    out.push(
      <Linea key="imposible" tono="error">
        {previa.despues.piezas === 0
          ? `Aun sin trozas, la ${nombre} declara ${fmtM3(previa.despues.m3 ?? 0)} m³ de madera para ${fmtM3(corrida.producido ?? 0)} m³ producidos. Corrige su materia prima en la ficha.`
          : `Le quedarían ${fmtM3(previa.despues.m3 ?? 0)} m³ de trozas para ${fmtM3(corrida.producido ?? 0)} m³ producidos. Deja más trozas, o suéltalas todas.`}
      </Linea>,
    );
  }
  if (previa.sobreAtribuido) {
    out.push(<Linea key="atribucion" tono="error">Sus guías quedarían con más m³ que la madera. Corrige primero la atribución en la ficha de la corrida.</Linea>);
  }
  if (previa.sobreElTope) {
    out.push(
      <Linea key="tope" tono="aviso">
        Rendiría {pct(previa.despues.rendimientoPct)}, más que el {TOPE_RENDIMIENTO_PCT} % de la plaza.{" "}
        <InfoTip
          title="Por qué se guarda igual"
          what={`El ${TOPE_RENDIMIENTO_PCT} % es el tope para declarar producto. Aquí no declaras producto: dices qué madera no entró. Se guarda el rendimiento real y queda en el rastro con tu motivo.`}
          example={`La ${nombre} pasa de ${pct(previa.antes.rendimientoPct)} a ${pct(previa.despues.rendimientoPct)}.`}
        />
      </Linea>,
    );
  }
  if (previa.quedaSinOrigen) out.push(<Linea key="sin-origen" tono="info">La {nombre} queda sin origen. Lo producido no cambia.</Linea>);
  for (const l of previa.lotes) out.push(<Linea key={l.loteId} tono="info">{textoDeLote(l)}</Linea>);
  return out.length > 0 ? <div className="space-y-1">{out}</div> : null;
}

/** Qué corridas quedan listas para vincular con esta selección (lo mide el servidor). */
export function QueQuedaListo({
  destraba,
  midiendo,
  marcadas,
  esperan,
}: {
  destraba: QueDestraba | null;
  midiendo: boolean;
  marcadas: number;
  esperan: readonly CorridaQueEspera[];
}) {
  if (marcadas === 0) {
    return esperan.length > 0 ? (
      <p className="text-sm text-[var(--text-secondary)]">
        Esperan esta madera: {enLista([...esperan].sort((a, b) => a.fecha.localeCompare(b.fecha)).map(nro))}.
      </p>
    ) : null;
  }
  if (midiendo) {
    return (
      <p aria-live="polite" className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
        <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Viendo qué corridas quedan listas…
      </p>
    );
  }
  if (!destraba) return null;
  const { nuevas, siguen, conLlegada } = destraba;
  return (
    <div aria-live="polite" className="space-y-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm">
      {nuevas.length > 0 ? (
        <p className="flex items-start gap-1.5 text-[var(--text-primary)]">
          <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" />
          <span>
            <b>Quedan listas para vincular:</b> {enLista(nuevas.map(nro))}.
          </span>
        </p>
      ) : (
        <p className="text-[var(--text-secondary)]">Con estas trozas no queda lista ninguna corrida más.</p>
      )}
      {siguen.length > 0 && (
        <p className="text-[var(--text-secondary)]">
          Siguen sin poder vincularse: {enLista(siguen.map(nro))}.{" "}
          <InfoTip title="Por qué siguen" what={siguen.slice(0, 4).map((s) => `N.º ${s.lineNo ?? "—"}: ${s.detalle}`).join(" · ")} />
        </p>
      )}
      {conLlegada && (
        <p className="text-[var(--text-secondary)]">
          Si además corriges la llegada de {conLlegada.guias.length === 1 ? "la guía" : `${conLlegada.guias.length} guías`} en Ingresos, entran{" "}
          {enLista(conLlegada.enTanda.map(nro))}.{" "}
          <InfoTip
            title="Con la llegada corregida"
            what={`Guías: ${enLista([...conLlegada.guias])}. Se propone la fecha de su guía y se confirma con motivo en Ingresos.`}
            example="Si la madera de verdad llegó después, esas corridas no salieron de ella."
          />
        </p>
      )}
    </div>
  );
}

/** Las trozas de la corrida, con su casilla. La sugerida lo dice. */
export function ListaDePiezas({
  piezas,
  marcadas,
  sugerencia,
  deshabilitado,
  onAlternar,
  onMarcar,
}: {
  piezas: readonly PiezaDeLaCorrida[];
  marcadas: ReadonlySet<string>;
  /** `ya`: lo que las que esperan tomarían hoy; `conLlegada`: si además se corrige la llegada de `guias`. `null` = se calcula. */
  sugerencia: { ya: readonly string[]; conLlegada: readonly string[]; guias: readonly string[] } | null;
  deshabilitado: boolean;
  onAlternar: (id: string) => void;
  onMarcar: (ids: readonly string[]) => void;
}) {
  const sugeridas = sugerencia?.ya ?? [];
  const conLlegada = sugerencia?.conLlegada ?? [];
  const sugerida = new Set([...sugeridas, ...conLlegada]);
  const ordenadas = [...piezas].sort(
    (a, b) =>
      a.gtfNumber.localeCompare(b.gtfNumber, "es-PE", { numeric: true }) ||
      (a.codigo ?? "").localeCompare(b.codigo ?? "", "es-PE", { numeric: true }),
  );
  return (
    <section aria-label="Trozas de la corrida" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto inline-flex items-center gap-1">
          <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
            Trozas de la corrida
          </CardTitle>
          <InfoTip
            title="Qué pasa con las que marcas"
            what="Vuelven al patio: dejan de ser de esta corrida y otra puede tomarlas. Lo producido no cambia. Baja la madera que entró y se recalcula lo que rinde."
            example="La N.º 61 devuelve 5 trozas y las corridas del 7 al 21/09 quedan para vincular."
          />
        </span>
        {sugeridas.length > 0 && (
          <Btn size="sm" variant="secondary" disabled={deshabilitado} onClick={() => onMarcar(sugeridas)} className="max-sm:h-11">
            <Wand2 aria-hidden className="h-4 w-4" />
            {sugeridas.length === 1 ? "Marcar la 1 que necesitan" : `Marcar las ${sugeridas.length} que necesitan`}
          </Btn>
        )}
        {conLlegada.length > 0 && sugerencia && (
          <span className="inline-flex items-center gap-1">
            <Btn size="sm" variant="secondary" disabled={deshabilitado} onClick={() => onMarcar(conLlegada)} className="max-sm:h-11">
              <Wand2 aria-hidden className="h-4 w-4" />
              Marcar {conLlegada.length} con la llegada corregida
            </Btn>
            <InfoTip
              title="Con la llegada corregida"
              what={`Las corridas que esperan son de antes de que llegara esta madera. Si en realidad llegó el día de su guía, corrige la llegada de ${enLista([...sugerencia.guias])} en Ingresos y estas trozas les sirven.`}
              example="Si la madera sí llegó después, esas corridas no salieron de ella: no las marques."
            />
          </span>
        )}
        {/* Un botón que alterna: dos («Todas» y «Ninguna») dejaban uno solo en su fila a 400 px. */}
        <Btn
          size="sm"
          variant="ghost"
          disabled={deshabilitado}
          onClick={() => onMarcar(marcadas.size === piezas.length ? [] : piezas.map((p) => p.id))}
          className="max-sm:h-11"
        >
          {marcadas.size === piezas.length ? "Ninguna" : "Todas"}
        </Btn>
      </div>
      <ul className="max-h-[40vh] space-y-1 overflow-y-auto">
        {ordenadas.map((p) => {
          const si = marcadas.has(p.id);
          return (
            <li key={p.id}>
              <label
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-1.5 ${
                  si ? "border-[var(--accent)] bg-primary/5" : "border-[var(--rule-base)]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={si}
                  disabled={deshabilitado}
                  onChange={() => onAlternar(p.id)}
                  aria-label={`Soltar la troza ${p.codigo ?? "sin código"} de la guía ${p.gtfNumber}`}
                  className="h-5 w-5 shrink-0 accent-[var(--brand-ink)]"
                />
                <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <span className="font-mono font-bold text-[var(--text-primary)]">{p.codigo ?? "sin código"}</span>
                  <span className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">{fmtM3(p.m3)} m³</span>
                  <span className="text-xs text-[var(--text-tertiary)]">
                    guía {p.gtfNumber}
                    {p.lote ? ` · ${p.lote.code}` : ""}
                  </span>
                  {sugerida.has(p.id) && (
                    <span className="rounded-full border border-[var(--accent)]/40 px-2 py-0.5 text-xs font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                      {sugeridas.includes(p.id) ? "la necesita otra corrida" : "con la llegada corregida"}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

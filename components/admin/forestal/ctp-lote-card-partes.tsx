/**
 * Las partes de la tarjeta del lote (`CtpLoteCard`) — «tarjetas fáciles de
 * leer» (Brandon, 2026-09-27).
 *
 * Antes cada tarjeta decía «Cupo amplio · 25.6 % · 0.516 m³» y «41.7 % de 56 %
 * · En rango de aserrío»: dos porcentajes de cosas distintas, en jerga del
 * libro. Ahora dice lo que se pregunta en el patio, en una línea grande:
 * «Quedan 3.75 m³ por aserrar» (abierto) o «Rinde 42 % · bien» (aserrado). Lo
 * que explicaba la cifra —el tope del 56 % del SERFOR, de dónde sale el cupo,
 * la nota del lote, la programación del SNIFFS— se mudó a un ⓘ: nada se borró,
 * sólo dejó de estar a la vista (ley de Brandon, regla 8).
 *
 * Las cifras con el formato canónico (`lib/format`): dos decimales y el mismo
 * separador en todo. «3.750» al lado de «1,590» se leía como tres mil.
 */

import type { ReactNode } from "react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import {
  RENDIMIENTO_PLAUSIBLE_MAX,
  RENDIMIENTO_PLAUSIBLE_MIN,
} from "@/lib/forestal/loctp-catalogos";
import {
  esLoteDeInventario,
  etiquetaDeSobra,
  juzgarRendimientoLote,
  margenLote,
  pieTablarDe,
  piezasLibres,
  producidoDelLote,
  rendimientoLote,
  sobraDeLote,
  volumenLibre,
  type LoteAserrio,
  type NivelDeSobra,
} from "@/lib/forestal/lotes-aserrio";
import { TOPE_RENDIMIENTO_PCT } from "@/lib/forestal/vincular-produccion";

/** m³ para leer de un vistazo: dos decimales, separador del panel («3.75»). */
export const m3Card = (v: number): string => formatNumber(v, 2);
/** m³ fino para cuadres: la tolerancia es 0.001, dos decimales darían «0.00». */
export const m3Fino = (v: number): string => formatNumber(v, { min: 2, max: 3 });

/** El libro escribe la unidad «m3»; en pantalla se lee «m³» como en todo el resto. */
export const unidadLegible = (u: string | null | undefined): string => (u === "m3" ? "m³" : (u ?? ""));

type Tono = "ok" | "info" | "aviso" | "neutro";

/* El tono va en el borde y en la palabra del veredicto, no en el número: el
   número queda en `--text-primary` (contraste AA en los dos temas) y el color
   dice el nivel de una pasada. El texto de color chico usa `-ink`. */
const BORDE: Record<Tono, string> = {
  ok: "border-[var(--data-success-500)]",
  info: "border-[var(--data-info-500)]",
  aviso: "border-[var(--data-warning-500)]",
  neutro: "border-[var(--rule-base)]",
};
const TINTA: Record<Tono, string> = {
  ok: "text-[var(--data-success-ink)]",
  info: "text-[var(--data-info-ink)]",
  aviso: "text-[var(--data-warning-ink)]",
  neutro: "text-[var(--text-secondary)]",
};
const TONO_POR_NIVEL: Record<NivelDeSobra, Tono> = {
  casi_entero: "ok",
  bastante: "info",
  poco: "aviso",
  sin_sobra: "neutro",
};
/** «En rango de aserrío» → «bien»: el veredicto en una palabra; el rango va al ⓘ. */
const VEREDICTO: Record<ReturnType<typeof juzgarRendimientoLote>["tono"], { palabra: string | null; tono: Tono }> = {
  ok: { palabra: "bien", tono: "ok" },
  aviso: { palabra: "bajo", tono: "aviso" },
  malo: { palabra: "muy alto, revisa", tono: "aviso" },
  neutro: { palabra: null, tono: "neutro" },
};

const Linea = ({ children }: { children: ReactNode }) => <span className="block">{children}</span>;

/** Un renglón con su ⓘ a la derecha: el ícono nunca queda solo en otra línea. */
export function ConTip({ className, tip, children }: { className: string; tip: ReactNode; children: ReactNode }) {
  return (
    <p className={`flex justify-between gap-1 ${className}`}>
      <span className="min-w-0">{children}</span>
      <span className="shrink-0">{tip}</span>
    </p>
  );
}

/* El número grande y las palabras normales: «Quedan **3.75 m³** por aserrar»
   entra en una línea en la tarjeta de 3 columnas a 1280 (medido 27-09). */
const RENGLON = "items-center text-sm font-semibold text-[var(--text-primary)]";
const GRANDE = "text-xl font-bold tabular-nums";

/**
 * Lo que importa del lote, en una línea grande.
 *
 * Abierto → cuánta madera le queda por aserrar. Aserrado → cuánto rindió, y
 * debajo, cuánto más se le puede declarar bajo el tope del 56 %.
 */
export function LoteLineaPrincipal({ lote }: { lote: LoteAserrio }) {
  const sobra = sobraDeLote(lote);
  if (lote.status === "abierto") {
    const tono = TONO_POR_NIVEL[sobra.nivel];
    return (
      <div className={`rounded-xl border-l-4 bg-[var(--surface-sunken)] px-2.5 py-2 ${BORDE[tono]}`}>
        <ConTip
          className={RENGLON}
          tip={
            <InfoTip
              title="Madera por aserrar"
              body={
                sobra.nivel === "sin_sobra" ? (
                  etiquetaDeSobra(sobra).ayuda
                ) : (
                  <>
                    <Linea>
                      Le quedan {m3Card(sobra.m3)} m³ sin aserrar: el {formatNumber(sobra.pct, 0)} % del lote.
                    </Linea>
                    <Linea>Con «Producir» esa madera entra a la sierra.</Linea>
                  </>
                )
              }
            />
          }
        >
          {sobra.nivel === "sin_sobra" ? (
            <span className="text-base font-bold">Sin madera por aserrar</span>
          ) : (
            <>
              Quedan <span className={GRANDE}>{m3Card(sobra.m3)} m³</span> por aserrar
            </>
          )}
        </ConTip>
      </div>
    );
  }

  const rend = rendimientoLote(lote);
  const veredicto = VEREDICTO[juzgarRendimientoLote(rend).tono];
  const producido = producidoDelLote(lote);
  const corrida = lote.produccion;
  const margen = margenLote(lote);
  const salioEnOtraUnidad = rend == null && corrida?.viva === true && corrida.quantity != null;
  return (
    <div className={`rounded-xl border-l-4 bg-[var(--surface-sunken)] px-2.5 py-2 ${BORDE[rend != null ? veredicto.tono : "neutro"]}`}>
      <ConTip
        className={RENGLON}
        tip={
          <InfoTip
            title="Rendimiento"
            body={
              rend != null ? (
                <>
                  <Linea>
                    Salieron {m3Card(producido ?? 0)} m³ de los {m3Card(lote.volumenM3)} m³ que entraron (
                    {formatNumber(rend, 1)} %).
                  </Linea>
                  <Linea>
                    Lo normal en aserrío: entre {RENDIMIENTO_PLAUSIBLE_MIN} % y {RENDIMIENTO_PLAUSIBLE_MAX} %.
                  </Linea>
                  <Linea>El SERFOR admite declarar hasta el {TOPE_RENDIMIENTO_PCT} %.</Linea>
                </>
              ) : salioEnOtraUnidad ? (
                "El rendimiento sólo se calcula si todo se declaró en m³."
              ) : (
                "Todavía no se declaró lo que salió de este lote."
              )
            }
          />
        }
      >
        {rend != null ? (
          <>
            Rinde <span className={GRANDE}>{formatNumber(rend, 0)} %</span>
            {veredicto.palabra && (
              <>
                {" · "}
                <span className={`font-bold ${TINTA[veredicto.tono]}`}>{veredicto.palabra}</span>
              </>
            )}
          </>
        ) : salioEnOtraUnidad && corrida?.quantity != null ? (
          <>
            Salió{" "}
            <span className={GRANDE}>
              {formatNumber(corrida.quantity, 2)} {unidadLegible(corrida.unit)}
            </span>
          </>
        ) : (
          <span className="text-base font-bold">Sin producción declarada</span>
        )}
      </ConTip>
      {/* Cuánto más se puede declarar de esta misma materia prima (ADR-358):
          antes «Cupo amplio · 25.6 %», ahora en m³ y con palabras. */}
      {rend != null && (
        <ConTip
          className="mt-0.5 items-center text-sm text-[var(--text-secondary)]"
          tip={
            <InfoTip
              title="Por declarar"
              body={
                margen ? (
                  <>
                    <Linea>
                      Con {m3Card(margen.entradaM3)} m³ que entraron, el tope del {TOPE_RENDIMIENTO_PCT} % permite{" "}
                      {m3Card(margen.topeM3)} m³.
                    </Linea>
                    <Linea>Ya declaraste {m3Card(margen.declaradoM3)} m³. El resto se declara en Producción.</Linea>
                  </>
                ) : (
                  etiquetaDeSobra(sobra).ayuda
                )
              }
            />
          }
        >
          {sobra.nivel === "sin_sobra" ? (
            "Nada más por declarar"
          ) : (
            <>
              Quedan <b className="font-bold tabular-nums text-[var(--text-primary)]">{m3Card(sobra.m3)} m³</b> por
              declarar
            </>
          )}
        </ConTip>
      )}
    </div>
  );
}

/**
 * «1,590 pt · 3.75 m³ · 3 piezas» — pie tablar primero, como se habla en el
 * patio.
 *
 * En un lote ABIERTO estas cifras son lo que TODAVÍA se puede aserrar (lo
 * libre), no el total del lote: un lote reabierto con madera ya aserrada
 * mostraba el total apartado como si estuviera todo disponible (mismo criterio
 * que `LoteLineaPrincipal` y que `CtpLoteCard` antes de las «tarjetas fáciles
 * de leer», ver `git show HEAD~1:components/admin/forestal/CtpLoteCard.tsx`).
 */
export function LoteCifras({ lote }: { lote: LoteAserrio }) {
  const abierto = lote.status === "abierto";
  const volumen = abierto ? volumenLibre(lote) : lote.volumenM3;
  const piezas = abierto ? piezasLibres(lote).length : lote.piezas;
  /* «0 piezas» con 35 m³ al lado se lee como un lote vacío: en un lote
     declarado por volumen la cuenta de piezas no existe, no es cero. */
  const porVolumen = piezas === 0 && esLoteDeInventario(lote);
  /* Un lote vacío ya lo dice su aviso («Lote vacío: agrégale piezas o
     deshazlo»): «0 pt · 0.00 m³ · 0 piezas» debajo era ruido. */
  if (piezas === 0 && !(volumen > 0)) return null;
  const num = "font-bold tabular-nums text-[var(--text-primary)]";
  return (
    <p className="text-sm text-[var(--text-secondary)]">
      <b className={num}>{formatNumber(pieTablarDe(volumen), 0)}</b> pt · <b className={num}>{m3Card(volumen)}</b>{" "}
      m³ ·{" "}
      {porVolumen ? (
        "por volumen"
      ) : (
        <>
          <b className={num}>{formatNumber(piezas, 0)}</b> pieza{piezas === 1 ? "" : "s"}
        </>
      )}
    </p>
  );
}

"use client";

/**
 * La ficha lateral del trozado (Brandon 28-09: «pon ese lateral de detalles
 * igual como en talado, y que esté el detalle del talado»): lo que el censo
 * sabe del árbol, su línea de tala (fecha, medidas, volumen, quién y a qué
 * hora, de dónde salió el GPS), lo que queda por trozar con su referencia en
 * pt —arriba: es lo que se mira mientras se mide— y las trozas que ya
 * salieron de él con la que se está midiendo.
 *
 * Pasarse de lo talado no se frena acá —lo rechaza T4 al guardar, con su
 * mensaje—: se avisa en ámbar mientras se mide, que es cuando se corrige.
 */

import { AlertTriangle, Loader2, RefreshCw, TreePine } from "@buleje/design-system/icons";
import { diaDelLibro, type ArbolParaElegir } from "@/lib/forestal/loth-censo-uso";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { restanteTrozado, siguienteCodigoDeTroza, type TalaDelArbol } from "@/lib/forestal/loth-restante";
import type { ArbolEnElLibroEstado } from "./hooks/use-arbol-en-el-libro";
import LothRestante from "./LothRestante";
import { AMBAR, CabeceraArbol, CAJA, Dato, dec, KICKER } from "./loth-ficha-ui";

interface Props {
  /** El árbol en el censo del plan (null si no está o no cargó). */
  arbol: ArbolParaElegir | null;
  cargandoCenso: boolean;
  /** El código del árbol de la ficha (el tipeado o el que sale de la troza). */
  codigo: string;
  libro: ArbolEnElLibroEstado;
  /** La troza que se está midiendo. */
  troza: { codigo: string; volumenM3: number | null };
  onUsarCodigo: (codigo: string) => void;
}

const GPS_ORIGEN: Record<string, string> = {
  telefono: "tomado en el tocón",
  censo: "copiado del censo",
  utm: "UTM escrita a mano",
};

function TalaDelArbolCaja({ tala }: { tala: TalaDelArbol }) {
  return (
    <div className={CAJA} data-tala-linea={tala.lineNo}>
      <div className="flex items-baseline justify-between gap-2">
        <p className={KICKER}>Tala del árbol</p>
        <p className="font-mono text-xs font-bold tabular-nums text-[var(--text-secondary)]">Línea N° {tala.lineNo}</p>
      </div>
      <p className="mt-0.5 text-sm font-semibold text-[var(--text-primary)]">
        {diaDelLibro(tala.fecha) || "—"}
        {tala.horaTala && <span className="font-mono tabular-nums text-[var(--text-secondary)]"> · {tala.horaTala}</span>}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-2">
        <Dato label="Ø mayor / menor">
          {dec(tala.diamMayorM, 3, 3)} / {dec(tala.diamMenorM, 3, 3)} m
        </Dato>
        <Dato label="Largo">{dec(tala.lengthM, 2, 2)} m</Dato>
        <Dato label="Volumen talado">{tala.volumeM3 == null ? "—" : fmtM3(tala.volumeM3)} m³</Dato>
        <Dato label="GPS">
          <span className="font-sans text-xs font-semibold">{tala.gpsOrigen ? (GPS_ORIGEN[tala.gpsOrigen] ?? tala.gpsOrigen) : "sin GPS"}</span>
        </Dato>
      </dl>
      <p className="mt-2 text-xs text-[var(--text-secondary)]">
        Motosierrista: <span className="font-semibold text-[var(--text-primary)]">{tala.motosierrista ?? "sin anotar"}</span>
      </p>
    </div>
  );
}

export default function LothFichaTrozado({ arbol, cargandoCenso, codigo, libro, troza, onUsarCodigo }: Props) {
  const code = codigo.trim();
  if (!code) {
    return (
      <div className={`${CAJA} flex flex-col items-center gap-2 py-5 text-center`}>
        <TreePine className="h-7 w-7 text-[var(--text-tertiary)] opacity-60" aria-hidden="true" />
        <p className="text-sm text-[var(--text-secondary)]">Elige la tala de la lista o del censo para ver su ficha.</p>
      </div>
    );
  }

  const d = libro.datos;
  const r = d ? restanteTrozado(d, { trozaCode: troza.codigo, volumeM3: troza.volumenM3 }) : null;
  const siguiente = d && r?.repetida ? siguienteCodigoDeTroza(code, d.trozas) : null;
  const enCurso = troza.codigo.trim();

  return (
    <div className="space-y-3" data-ficha-trozado={code}>
      {arbol ? (
        <CabeceraArbol arbol={arbol} />
      ) : (
        <div className={CAJA}>
          <p className={KICKER}>Ficha del árbol</p>
          <p className="font-mono text-xl font-bold tabular-nums text-[var(--text-primary)]">{code}</p>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">{cargandoCenso ? "Cargando el censo…" : "No está en el censo de este plan."}</p>
        </div>
      )}

      {libro.error ? (
        <div role="alert" className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${AMBAR}`}>
          <span className="min-w-0">{libro.error}</span>
          <button type="button" onClick={libro.recargar} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 font-semibold underline-offset-2 hover:underline">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reintentar
          </button>
        </div>
      ) : !d ? (
        <div className={`${CAJA} flex items-center gap-2 text-sm text-[var(--text-tertiary)]`}>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Leyendo el libro…
        </div>
      ) : d.tala ? (
        <TalaDelArbolCaja tala={d.tala} />
      ) : (
        <p role="alert" className={`flex items-start gap-2 rounded-xl border-2 px-3 py-2 text-sm ${AMBAR}`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0">
            <b>{code} no tiene tala en el libro.</b> Regístrala primero en la Sección 1: sin ella, la troza no tiene de qué árbol salió.
          </span>
        </p>
      )}

      {d?.tala && r && (
        <>
          <LothRestante
            titulo="Lo que queda por trozar"
            grupos={[
              {
                filas: [
                  { label: "Talado", m3: r.taladoM3 },
                  { label: `Trozado (${r.trozas})`, m3: r.trozadoM3, resta: true },
                  { label: r.excede ? "Se pasa" : "Queda", m3: r.restanteM3, total: true, aviso: r.excede },
                ],
              },
            ]}
            what="Lo talado − lo que ya se trozó de este árbol, con la troza que estás midiendo."
          />
          {r.excede && r.restanteM3 != null && (
            <p className={`flex items-start gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold ${AMBAR}`}>
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Pasa lo talado por {fmtM3(-r.restanteM3)} m³: el libro no lo acepta. Revisa las medidas de la troza.
            </p>
          )}
          {r.taladoM3 == null && (
            <p className="text-xs text-[var(--text-tertiary)]">La tala no registró volumen: no hay contra qué restar.</p>
          )}
        </>
      )}

      {d && (
        <div className={CAJA}>
          <p className="text-sm font-bold text-[var(--text-primary)]">
            Trozas de este árbol <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{d.trozas.length}</span>
          </p>
          <ul className="mt-1 divide-y divide-[var(--rule-soft)]">
            {d.trozas.map((t) => (
              <li key={t.id} className={`flex items-baseline justify-between gap-2 py-0.5 text-xs ${t.trozaCode === enCurso ? "font-bold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-secondary)]"}`}>
                <span className="font-mono tabular-nums">{t.trozaCode}</span>
                <span className="font-mono tabular-nums">{t.volumeM3 == null ? "—" : fmtM3(t.volumeM3)} m³</span>
              </li>
            ))}
            {enCurso && !r?.repetida && (
              <li className="flex items-baseline justify-between gap-2 py-0.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                <span className="font-mono tabular-nums">{enCurso} <span className="font-sans font-semibold">(esta)</span></span>
                <span className="font-mono tabular-nums">{troza.volumenM3 == null ? "midiendo…" : `${fmtM3(troza.volumenM3)} m³`}</span>
              </li>
            )}
          </ul>
          {d.trozas.length === 0 && !enCurso && <p className="text-xs text-[var(--text-tertiary)]">Todavía no salió ninguna troza.</p>}
          {r?.repetida && siguiente && (
            <div role="alert" className={`mt-2 flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5 text-xs font-semibold ${AMBAR}`}>
              <span className="min-w-0 flex-1">{enCurso} ya está en la línea N° {r.repetida.lineNo}.</span>
              <button type="button" onClick={() => onUsarCodigo(siguiente)} className="inline-flex h-8 shrink-0 items-center rounded-lg border-2 border-current px-2 font-bold">
                Usar {siguiente}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

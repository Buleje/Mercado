"use client";

/**
 * La ficha del árbol elegido, al lado del formulario de tala: lo que el censo
 * dice de él (DAP, altura, volumen, condición, nombre nativo, coordenada,
 * categoría POA), lo que el libro ya hizo con él, y lo medido contra lo
 * censado mientras se mide.
 *
 * NO es la «vista previa del registro» que se quitó el 28-09 (repetía lo que
 * ya estaba escrito a la izquierda): acá no hay un solo dato del formulario,
 * salvo la comparación y lo que queda, que es lo que el formulario no dice.
 *
 * En una plantación (ADR-459) el árbol casi nunca está censado: la ficha
 * muestra la especie del registro y su saldo —registrado − talado − esta tala—
 * mientras se mide. Si además hay árbol marcado, el saldo del registro va como
 * un grupo más de «Lo que queda».
 */

import { useMemo } from "react";
import { AlertTriangle, MapPin, ShieldAlert, TreePine } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  compararConCenso,
  DIFERENCIA_ALERTA_PCT,
  DISTANCIA_ALERTA_M,
  distanciaAlArbol,
  type ArbolParaElegir,
  type Comparacion,
} from "@/lib/forestal/loth-censo-uso";
import { restanteDeEspecie, restanteDelArbol } from "@/lib/forestal/loth-restante";
import { formatDistance } from "@/lib/forestal/loth-utm";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import type { EspecieDelRegistro, SaldoDeTala } from "@/lib/forestal/loth-tala-plantacion";
import type { GpsOrigen } from "./LothGpsField";
import LothRestante, { type FilaRestante, type GrupoRestante } from "./LothRestante";
import { AMBAR, CabeceraArbol, CAJA, Dato, dec as m, KICKER, ROJO } from "./loth-ficha-ui";
import { CitesPill } from "./loth-plan-ui";

interface Props {
  arbol: ArbolParaElegir | null;
  cargando: boolean;
  /** Lo tipeado en «Código del árbol», para decir «no está en el censo». */
  codigo: string;
  medido: { diamMayorM: number | null; longitudM: number | null; volumenM3: number | null };
  /** Las medidas todavía son las del censo (nadie midió el tocón). */
  medidasDelCenso: boolean;
  gps: { lat: number; lng: number; origen: GpsOrigen | null } | null;
  /** El censo del plan cruzado con el libro: para lo que queda de la especie. */
  censo: readonly ArbolParaElegir[];
  /** Plantación: la especie elegida en el registro y su saldo con lo que se mide. */
  registro?: { especie: EspecieDelRegistro; saldo: SaldoDeTala } | null;
  /** Lo que dice la caja vacía, en vez de «no está en el censo» (la plantación sin censo). */
  textoVacio?: string;
}

/** Registrado − talado − esta tala = queda, en filas de «Lo que queda». */
function filasDelRegistro(s: SaldoDeTala): FilaRestante[] {
  const pasa = s.excesoM3 > 0;
  return [
    { label: "Registrado", m3: s.registradoM3 },
    { label: "Talado", m3: s.taladoM3, resta: true },
    { label: "Esta tala", m3: s.estaTalaM3, resta: true },
    { label: pasa ? "Se pasa" : "Queda en pie", m3: s.quedaM3, total: true, aviso: pasa },
  ];
}

const QUE_ES_EL_SALDO =
  "Lo registrado de la especie − lo que el libro ya taló en este plan − lo que estás midiendo = lo que queda en pie.";

/**
 * Pasarse de lo registrado en la tala: aviso, no bloqueo. Se mide con cinta y
 * el registro es una estimación; lo que no se deja es DESPACHAR de más.
 */
export function AvisoExcesoRegistro({ saldo }: { saldo: SaldoDeTala }) {
  return (
    <div role="status" className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${AMBAR}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        <b>
          Esta tala pasa lo registrado de {saldo.especie} en {fmtM3(saldo.excesoM3)} m³
        </b>
        : al despachar, lo que exceda lo frena la ARFFS.
      </span>
      <InfoTip
        title="Tala sobre lo registrado"
        what="La tala igual se guarda: se mide con cinta y el registro es una estimación."
        affects="Lo que el libro no deja es despachar más de lo registrado de la especie (control T6): la guía de lo que exceda se rechaza."
        example={`Registrado ${fmtM3(saldo.registradoM3)} m³, talado ${fmtM3(saldo.taladoM3)}${saldo.estaTalaM3 != null ? ` + esta ${fmtM3(saldo.estaTalaM3)}` : ""}.`}
      />
    </div>
  );
}

/** La plantación sin árbol censado: la especie del registro y su saldo. */
function FichaEspecieRegistro({ especie, saldo, codigo }: { especie: EspecieDelRegistro; saldo: SaldoDeTala; codigo: string }) {
  return (
    <div className="space-y-3" data-ficha-registro={especie.especie}>
      <div className={CAJA}>
        <p className={KICKER}>Especie del registro</p>
        <p className="text-lg font-bold text-[var(--text-primary)]">
          {especie.especie}
          {especie.cites && <> <CitesPill /></>}
        </p>
        {especie.cientifico && <p className="text-xs italic text-[var(--text-secondary)]">{especie.cientifico}</p>}
        <dl className="mt-2.5 grid grid-cols-3 gap-2">
          <Dato label="Árbol">{codigo.trim() || "—"}</Dato>
          <Dato label="Instalada">{especie.anioInstalacion ?? "—"}</Dato>
          <Dato label="Superficie">{especie.superficieHa == null ? "—" : `${m(especie.superficieHa, 0, 2)} ha`}</Dato>
        </dl>
      </div>
      <LothRestante titulo={`Saldo de ${especie.especie}`} grupos={[{ filas: filasDelRegistro(saldo) }]} what={QUE_ES_EL_SALDO} />
    </div>
  );
}

function FilaComparacion({ label, c, unidad, formato }: { label: string; c: Comparacion; unidad: string; formato: (v: number) => string }) {
  const lejos = c.difPct != null && Math.abs(c.difPct) >= DIFERENCIA_ALERTA_PCT;
  return (
    <tr className="border-t border-[var(--rule-soft)] first:border-t-0">
      <th scope="row" className="py-1 pr-2 text-left text-xs font-medium text-[var(--text-secondary)]">{label}</th>
      <td className="py-1 text-right font-mono text-xs tabular-nums text-[var(--text-secondary)]">{c.censo == null ? "—" : formato(c.censo)}</td>
      <td className="py-1 pl-2 text-right font-mono text-xs font-bold tabular-nums text-[var(--text-primary)]">{c.medido == null ? "—" : `${formato(c.medido)} ${unidad}`}</td>
      <td className={`py-1 pl-2 text-right font-mono text-xs font-bold tabular-nums ${lejos ? "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-tertiary)]"}`}>
        {c.difPct == null ? "" : `${c.difPct > 0 ? "+" : ""}${formatNumber(c.difPct, { min: 0, max: 1 })} %`}
      </td>
    </tr>
  );
}

/** La resta del árbol y la de su especie en el plan, en una caja. */
function gruposRestante(r: ReturnType<typeof restanteDelArbol>, esp: ReturnType<typeof restanteDeEspecie>): GrupoRestante[] {
  const pasa = r.restanteM3 != null && r.restanteM3 < 0;
  const grupos: GrupoRestante[] = [
    {
      titulo: "Este árbol",
      filas: [
        { label: "Censo (estimado)", m3: r.censoM3 },
        { label: "Talado (medido)", m3: r.taladoM3, resta: true },
        { label: pasa ? "Pasa al censo" : "Restante", m3: r.restanteM3, total: true, aviso: pasa },
      ],
    },
  ];
  if (esp) {
    grupos.push({
      titulo: `${esp.especie} en el plan · ${esp.arboles} ${esp.arboles === 1 ? "árbol" : "árboles"}`,
      filas: [
        { label: "Censado", m3: esp.censadoM3 },
        { label: `Talado (${esp.talados})`, m3: esp.taladoM3, resta: true },
        { label: "Restante", m3: esp.restanteM3, total: true, aviso: esp.restanteM3 < 0 },
      ],
    });
  }
  return grupos;
}

export default function LothFichaArbol({ arbol, cargando, codigo, medido, medidasDelCenso, gps, censo, registro, textoVacio }: Props) {
  const especie = useMemo(
    () => (arbol ? restanteDeEspecie(censo, arbol.speciesCommon, arbol.treeCode, medidasDelCenso ? null : medido.volumenM3) : null),
    [arbol, censo, medido.volumenM3, medidasDelCenso],
  );

  if (!arbol && registro) return <FichaEspecieRegistro especie={registro.especie} saldo={registro.saldo} codigo={codigo} />;
  if (!arbol) {
    const tipeado = codigo.trim();
    return (
      <div className={`${CAJA} flex flex-col items-center gap-2 py-5 text-center`}>
        <TreePine className="h-7 w-7 text-[var(--text-tertiary)] opacity-60" aria-hidden="true" />
        {/* Sin un segundo «Ver censo»: el botón está al lado del buscador,
            y en el celular esta caja cae justo debajo. */}
        <p className="text-sm text-[var(--text-secondary)]">
          {cargando
            ? "Cargando el censo…"
            : (textoVacio ?? (tipeado ? `«${tipeado}» no está en el censo de este plan.` : "Elige un árbol de la lista o del censo para ver su ficha."))}
        </p>
      </div>
    );
  }

  const comp = compararConCenso(arbol, medido);
  const midio = !medidasDelCenso && (medido.volumenM3 != null || medido.longitudM != null || medido.diamMayorM != null);
  const distancia = gps && gps.origen === "telefono" ? distanciaAlArbol(arbol, gps.lat, gps.lng) : null;
  const tieneUtm = arbol.utmX != null && arbol.utmY != null;
  const u = arbol.uso;

  return (
    <div className="space-y-3" data-ficha-arbol={arbol.treeCode}>
      <CabeceraArbol arbol={arbol} />

      {arbol.disponibilidad !== "disponible" && (
        <div role="alert" className={`flex items-start gap-2 rounded-xl border-2 px-3 py-2 text-sm ${ROJO}`}>
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <b>{arbol.motivoNoDisponible}.</b>{" "}
            {u && (u.trozas > 0 || u.despachadas > 0) && (
              <>Salieron {u.trozas} {u.trozas === 1 ? "troza" : "trozas"}{u.despachadas > 0 ? `, ${u.despachadas} despachada${u.despachadas === 1 ? "" : "s"}` : ""}. </>
            )}
            {arbol.disponibilidad === "talado" ? "Un árbol se tala una sola vez: el libro no acepta otra línea." : "Elige otro árbol del censo."}
          </div>
        </div>
      )}
      {arbol.reparo && (
        <div role="alert" className={`flex items-start gap-2 rounded-xl border-2 px-3 py-2 text-sm ${arbol.reparo.nivel === "infraccion" ? ROJO : AMBAR}`}>
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0"><b>{arbol.reparo.titulo}.</b> {arbol.reparo.detalle}</div>
        </div>
      )}

      <div className={CAJA}>
        <div className="flex items-center gap-1">
          <p className="text-sm font-bold text-[var(--text-primary)]">Medido vs censo</p>
          <InfoTip
            title="Medido vs censo"
            what="El censo estima el volumen con el DAP, la altura comercial y un factor de forma; la tala mide el fuste tumbado."
            affects={`A partir de ${DIFERENCIA_ALERTA_PCT} % de diferencia en el volumen se marca: revisa las medidas o anota el motivo.`}
            example="Censo 9.675 m³, medido 10.370 m³: +7 %, dentro de lo normal."
          />
        </div>
        {!midio ? (
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            {medidasDelCenso ? "Todavía son los números del censo: mide el fuste para comparar." : "Mide el fuste para compararlo con el censo."}
          </p>
        ) : (
          <>
            <table className="mt-1 w-full">
              <thead>
                <tr className="text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  <th scope="col" className="text-left font-bold"><span className="sr-only">Medida</span></th>
                  <th scope="col" className="text-right font-bold">Censo</th>
                  <th scope="col" className="text-right font-bold">Medido</th>
                  <th scope="col" className="text-right font-bold">Dif.</th>
                </tr>
              </thead>
              <tbody>
                <FilaComparacion label="Ø mayor / DAP" c={comp.dap} unidad="m" formato={(v) => m(v, 2, 3)} />
                <FilaComparacion label="Largo / Hc" c={comp.largo} unidad="m" formato={(v) => m(v, 0, 2)} />
                <FilaComparacion label="Volumen" c={comp.volumen} unidad="m³" formato={(v) => fmtM3(v)} />
              </tbody>
            </table>
            {comp.muyDistinto && (
              <p className={`mt-2 flex items-start gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold ${AMBAR}`}>
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Muy distinto al censo: revisa las medidas o anota por qué en observaciones.
              </p>
            )}
          </>
        )}
      </div>

      <LothRestante
        titulo="Lo que queda"
        grupos={[
          ...gruposRestante(restanteDelArbol(arbol.volM3, midio ? medido.volumenM3 : null), especie),
          ...(registro ? [{ titulo: `${registro.especie.especie} en el registro`, filas: filasDelRegistro(registro.saldo) }] : []),
        ]}
        what={`Censo − lo medido al tumbarlo = lo que queda del árbol. En la especie: lo censado − lo que el libro ya taló${midio ? ", con este árbol" : ""}.${especie?.talasSinVolumen ? ` ${especie.talasSinVolumen} ${especie.talasSinVolumen === 1 ? "tala sin volumen no suma" : "talas sin volumen no suman"}.` : ""}`}
      />

      <div className={CAJA}>
        <div className="flex items-center gap-1.5">
          <MapPin className="h-4 w-4 text-[var(--data-success-600)]" aria-hidden="true" />
          <p className="text-sm font-bold text-[var(--text-primary)]">Ubicación</p>
        </div>
        {tieneUtm ? (
          <p className="mt-1 font-mono text-xs tabular-nums text-[var(--text-secondary)]">
            E {Math.round(arbol.utmX as number)} · N {Math.round(arbol.utmY as number)}
            {arbol.utmZona && <> · {arbol.utmZona}</>}
          </p>
        ) : (
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">El censo no trae su coordenada.</p>
        )}
        {distancia != null ? (
          distancia > DISTANCIA_ALERTA_M ? (
            <p className={`mt-2 flex items-start gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold ${AMBAR}`}>
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Estás a {formatDistance(distancia)} del árbol censado. ¿Es el árbol correcto?
            </p>
          ) : (
            <p className="mt-1 text-xs font-semibold text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]">
              Estás a {formatDistance(distancia)} del árbol censado.
            </p>
          )
        ) : gps?.origen === "censo" ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-[var(--text-secondary)]">
            El GPS de la línea es el del censo.
            <InfoTip
              title="GPS copiado del censo"
              what="La línea lleva la coordenada que levantó el regente, no una tomada en el tocón."
              affects="Captura el GPS parado en el tocón: la ficha te dice a cuántos metros estás del árbol censado."
            />
          </p>
        ) : tieneUtm && !gps ? (
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">Captura el GPS en el tocón para comprobar que es este árbol.</p>
        ) : null}
      </div>
    </div>
  );
}

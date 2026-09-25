"use client";

/**
 * «Esto que sobra, reprocesalo en lo que falta» — el apartado de reprocesos
 * sugeridos de la distribución (ADR-404).
 *
 * Va por su tercera forma y la razón está en el pedido de Brandon (2026-09-09):
 * *«quiero el producto original con su m³ y su cantidad, y lo que se produce de
 * él: de 1.200 de comercial, paquetería larga 1.100 y paquetería corta
 * 0.050»*. Una línea por par origen→destino no dejaba ver eso: el mismo
 * producto aparecía cuatro veces y había que sumar a ojo.
 *
 * Ahora es **una tabla por producto original**: arriba lo que hay (tipo, m³,
 * piezas) y abajo en qué se convierte, con el total y lo que queda. Así se lee
 * de una la regla del reproceso —al recortar suben las piezas y baja el
 * volumen— y también cuando el respaldo cierra unos litros por encima del
 * bloque, que es el cierre por diferencia de medición del reparto (hasta 3
 * piezas, 50 litros y 1 %) y no un reproceso que fabrique madera.
 *
 * Las salidas van en dos grupos porque no se comportan igual:
 *  · **Ya está amparando** — se suman: el bloque respalda todo eso a la vez, y
 *    es lo que hay que declarar en el Libro.
 *  · **Podés cubrir con lo libre** — se suman si entran juntas en la capacidad
 *    libre («comercial 2.500 → paquetería larga 1.500 + larga angosta 0.800»,
 *    Brandon 2026-09-09) y compiten sólo cuando la suma se pasa: ahí sí hay que
 *    elegir una, porque usarían el mismo m³ dos veces.
 *
 * Y sólo se ofrecen las conversiones que la sierra puede hacer (ADR-407): de
 * comercial sale paquetería, larga angosta y corta; de paquetería larga sale
 * paquetería corta. Lo que un bloque ampara sin poder darlo no se ofrece
 * declarar — se avisa arriba, en rojo: no es un reproceso pendiente, es un
 * respaldo que hay que corregir antes del papel.
 *
 * Es una SUGERENCIA, no un movimiento: acá no se registra nada en el Libro.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronRight, ExternalLink, Info, RefreshCw } from "@buleje/design-system/icons";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { ptDesdeM3 } from "@/lib/forestal/cubicacion";
import { AdminTooltip } from "@/components/admin/shared/AdminTooltip";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { productoDelTipoComercial } from "@/lib/forestal/loctp-catalogos";
import { declararColaEnElLibro, declararEnElLibro } from "@/lib/forestal/reproceso-borrador";
import { FRASE_REGLA } from "@/lib/forestal/reproceso-reglas";
import { claveDeConversion, estadoDeclarado, type DeclaradoDelPar } from "@/lib/forestal/reproceso-cruce";
import { useReprocesosDeclarados } from "@/hooks/use-reprocesos-declarados";
import { useCorridasParaReproceso, type CorridaParaReproceso } from "@/hooks/use-corridas-para-reproceso";
import DeclararReprocesoPicker from "./reparto-declarar-reproceso";
import CtpReprocesoModal from "./CtpReprocesoModal";
import type {
  AmparoImposible,
  CuadreDeDistribucion,
  DestinoDeReproceso,
  GrupoDeReproceso,
} from "@/lib/forestal/reproceso-sugerido";

/**
 * Una fila de la tabla de salidas. `mismoTipo` marca la conversión del producto
 * **en sí mismo** (comercial que ampara comercial): no pasa por la sierra, no se
 * declara — pero sin ella la tabla no suma lo que el bloque ampara y la sección
 * parece incoherente con la fila de arriba (Brandon, 2026-09-09).
 */
type FilaSalida = DestinoDeReproceso & { mismoTipo?: boolean };

/** Clave por tenant: lo marcado en un negocio no es lo marcado en el hermano. */
const claveMarcas = () => {
  let slug = "main";
  try { slug = localStorage.getItem("active-tenant-slug") ?? "main"; } catch { /* SSR / privado */ }
  return `buleje-ctp-reprocesos-marcados-${slug}`;
};

/**
 * Lo que ya se repasó, con un tilde por fila (Brandon, 2026-09-09).
 *
 * Se guarda en el equipo porque el repaso dura lo que dura declarar: se abre el
 * Libro, se registra el reproceso, se vuelve — y si al volver la lista está
 * limpia otra vez, no se sabe por dónde se iba. No es un estado del Libro: no
 * viaja al servidor ni afecta al papel.
 */
function useMarcas() {
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(claveMarcas());
      if (raw) setMarcadas(new Set(JSON.parse(raw) as string[]));
    } catch { /* json corrupto → sin marcas */ }
  }, []);
  const alternar = useCallback((clave: string) => {
    setMarcadas((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) next.delete(clave);
      else next.add(clave);
      try { localStorage.setItem(claveMarcas(), JSON.stringify([...next])); } catch { /* quota */ }
      return next;
    });
  }, []);
  const limpiar = useCallback(() => {
    setMarcadas(new Set());
    try { localStorage.removeItem(claveMarcas()); } catch { /* quota */ }
  }, []);
  return { marcadas, alternar, limpiar };
}

/** «09/09» — date-only en UTC: sin `timeZone` se corre un día en Lima. */
const fechaCorta = (iso: string): string =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("es-PE", {
    timeZone: "UTC", day: "2-digit", month: "2-digit",
  });

/** Milésimas: la unidad del papel. Sumar dos m³ ya redondeados deja colas. */
const r3 = (n: number) => Math.round(n * 1000) / 1000;
/**
 * Debajo de esto no hay madera: es el redondeo de repartir piezas ENTERAS
 * contra una capacidad decimal. Un bloque lleno que dice «quedan 0.001 m³ de
 * capacidad» enseña a ignorar el renglón — la lección de los siete rojos falsos
 * del importador CTP. 10 litros es lo más fino que mide una cinta en el patio.
 */
const RUIDO_M3 = 0.01;

const CHIP =
  "inline-flex items-center rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide";
const TH =
  "px-2 py-1 text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";
const TD = "px-2 py-1.5 text-sm text-[var(--text-secondary)]";
const NUM = `${TD} text-right font-mono tabular-nums`;

/**
 * Las filas de un grupo de salidas, con su subtotal.
 *
 * Cada fila dice la conversión ENTERA —«comercial → paquetería larga»— y no
 * sólo el destino: en una sección que junta varios productos, un chip suelto
 * que dice «paquetería larga» no deja ver de qué salió (Brandon, 2026-09-09).
 * La primera columna es un tilde para ir marcando lo ya repasado: al marcarla,
 * la fila queda subrayada.
 */
function TablaSalidas({
  titulo,
  ayuda,
  destinos,
  totalM3,
  totalPiezas,
  totalLabel = "Total que sale",
  tono,
  grupo,
  marcadas,
  onMarcar,
  declarados,
  diasDeclarados,
  onDeclarar,
  sugeridoPorPar,
}: {
  titulo: string;
  ayuda: string;
  destinos: FilaSalida[];
  /** `null` = este grupo NO se suma (las opciones no entran juntas: compiten). */
  totalM3: number | null;
  totalPiezas: number | null;
  totalLabel?: string;
  tono: "amparado" | "opcion";
  /** El producto original: de ahí salen la especie, la etiqueta y el permiso del pase. */
  grupo: GrupoDeReproceso;
  /** Filas ya repasadas (clave completa `grupo|tipo|motivo`). */
  marcadas: ReadonlySet<string>;
  onMarcar: (clave: string) => void;
  /** Lo que el Libro ya declaró, por par especie·origen→destino. */
  declarados: ReadonlyMap<string, DeclaradoDelPar>;
  /** Ventana de esa búsqueda, para poder decir «en los últimos N días». */
  diasDeclarados: number;
  /** Abre el «¿de qué corrida sale?» — declarar sin salir de la distribución. */
  onDeclarar: (destino: FilaSalida) => void;
  /**
   * Cuánto ampara la distribución ENTERA de cada par (clave de conversión).
   *
   * El Libro no sabe de qué bloque del cubicador salió un reproceso —no hay
   * vínculo entre un asiento y una troza de esta pantalla— así que el cruce es
   * por PAR. Comparar lo declarado contra UNA fila marcaba «declarado de MÁS»
   * en el bloque chico por un reproceso que era del grande (visto en pantalla,
   * 2026-09-09). El denominador honesto es el par completo.
   */
  sugeridoPorPar: ReadonlyMap<string, number>;
}) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const alternar = (clave: string) =>
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) next.delete(clave);
      else next.add(clave);
      return next;
    });
  if (destinos.length === 0) return null;
  return (
    <div className="mt-2">
      {/* La explicación va detrás del ⓘ y no colgando del título: son dos
          renglones por tabla × dos tablas × N productos, y eso es la mitad de
          la pantalla en texto que se lee una vez (Brandon, 2026-09-09). */}
      <p className="flex items-center gap-1 px-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        {titulo}
        <AdminTooltip
          content={ayuda}
          className="max-w-[300px] text-sm font-normal normal-case leading-relaxed tracking-normal"
        >
          <button
            type="button"
            aria-label={`Qué es «${titulo}»`}
            className="shrink-0 rounded-full text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] print:hidden"
          >
            <Info className="h-3.5 w-3.5" aria-hidden />
          </button>
        </AdminTooltip>
      </p>
      <table className="mt-1 w-full">
        <thead>
          <tr className="border-b border-[var(--rule-soft)]">
            <th className={`${TH} w-8 text-center`} title="Marca lo que ya repasaste: la fila queda subrayada">
              <Check className="inline h-4 w-4" aria-hidden />
              <span className="sr-only">Marcar como repasado</span>
            </th>
            <th className={TH}>Reproceso · tipo</th>
            {/* Siempre en este orden (Brandon, 2026-09-09): PIEZAS · m³ · PT.
                El pie tablar es como se compra y se vende la madera, así que
                ninguna tabla de volumen puede no tenerlo. */}
            <th className={`${TH} text-right`}>Piezas</th>
            <th className={`${TH} text-right`}>Volumen m³</th>
            <th className={`${TH} text-right`}>PT</th>
            <th className={`${TH} text-right`}>Falta</th>
            <th className={TH}>
              <span className="sr-only">Declarar en el Libro</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {destinos.map((d) => {
            const clave = `${d.mismoTipo ? "=" : ""}${d.tipo}|${d.motivo}`;
            const claveMarca = `${grupo.clave}|${clave}`;
            const marcada = marcadas.has(claveMarca);
            const abierto = abiertos.has(clave);
            /* Lo mismo, ¿ya está en el Libro? El mismo tipo no se declara nunca,
               así que ahí no se pregunta. */
            const clavePar = claveDeConversion(grupo.especie, grupo.desdeTipo, d.tipo);
            const yaDeclarado = d.mismoTipo ? undefined : declarados.get(clavePar);
            /* Contra lo que ampara TODA la distribución de ese par, nunca contra
               esta sola fila. */
            const amparaElPar = Math.max(sugeridoPorPar.get(clavePar) ?? 0, d.m3);
            const estado = estadoDeclarado(amparaElPar, yaDeclarado?.m3 ?? 0);
            return [
              <tr
                key={clave}
                /* El subrayado del repaso: una línea de acento bajo la fila
                   entera. No la tacha ni la esconde — lo marcado se sigue
                   leyendo, que es de lo que se trata al repasar un papel. */
                className={
                  marcada
                    ? "border-b-2 border-[var(--accent)] bg-[var(--accent)]/8"
                    : "border-b border-[var(--rule-soft)]"
                }
              >
                <td className={`${TD} text-center`}>
                  <input
                    type="checkbox"
                    checked={marcada}
                    onChange={() => onMarcar(claveMarca)}
                    aria-label={`Marcar como repasado: ${grupo.desdeTipo} a ${d.tipo}`}
                    title={marcada ? "Repasado — desmarcar" : "Marcar como repasado"}
                    className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                  />
                </td>
                <td className={TD}>
                  {/* El desglose de MEDIDAS va plegado, igual que en los bloques
                      distribuidos: desplegado son 4× las filas y se pierde la
                      lectura de cuánto ampara cada tipo. */}
                  <button
                    type="button"
                    onClick={() => alternar(clave)}
                    disabled={d.medidas.length === 0}
                    aria-expanded={abierto}
                    className={`inline-flex flex-wrap items-center gap-1 disabled:cursor-default ${marcada ? "underline decoration-[var(--accent)] decoration-2 underline-offset-4" : ""}`}
                    title={d.medidas.length > 0 ? "Ver las medidas" : "Sin medidas declaradas"}
                  >
                    {d.medidas.length > 0 && (
                      <ChevronRight
                        className={`h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)] transition-transform ${abierto ? "rotate-90" : ""}`}
                        aria-hidden
                      />
                    )}
                    {/* De qué sale → en qué se convierte. La conversión completa
                        en la misma celda: es lo que se declara en el Libro. */}
                    <span className={`${CHIP} bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]`}>
                      {grupo.desdeTipo}
                    </span>
                    <span role="img" className="text-[var(--text-tertiary)]" aria-label="se convierte en">→</span>
                    <span
                      className={`${CHIP} ${
                        d.mismoTipo
                          ? "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                          : tono === "amparado"
                            ? "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                            : "bg-[var(--data-info-500)]/15 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]"
                      }`}
                    >
                      {d.tipo}
                    </span>
                    {d.mismoTipo && (
                      <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                        el mismo tipo · no pasa por la sierra
                      </span>
                    )}
                  </button>
                  {/* Lo que el Libro YA tiene de esta conversión. No esconde la
                      fila ni la da por hecha: un par declarado hace semanas
                      puede no ser el de hoy, así que se muestra con su fecha y
                      su m³ y decide el operario (2026-09-09). */}
                  {yaDeclarado && (
                    <span
                      title={[
                        `El Libro declara que SALIERON ${fmtM3(yaDeclarado.m3)} m³ de ${grupo.desdeTipo} → ${d.tipo} (${grupo.especie}) en ${yaDeclarado.veces} ${yaDeclarado.veces === 1 ? "asiento" : "asientos"} de los últimos ${diasDeclarados} días; volvieron a la sierra ${fmtM3(yaDeclarado.entroM3)} m³.`,
                        `Toda la distribución ampara ${fmtM3(amparaElPar)} m³ de esta conversión (esta fila, ${fmtM3(d.m3)}).`,
                        yaDeclarado.repartido
                          ? "Algún asiento mezcla varias conversiones: lo que salió se repartió entre ellas en proporción a lo que entró (es un derivado, no un número del Libro)."
                          : "",
                        estado === "de-mas"
                          ? "Puede ser madera de otro lote del mes — o el mismo asiento cargado dos veces. Miralo antes de declarar otro."
                          : "",
                      ].filter(Boolean).join(" ")}
                      className={`ml-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold ${
                        estado === "cubierto"
                          ? "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                          : estado === "de-mas"
                            ? "bg-[var(--data-error-500)]/15 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                            : "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                      }`}
                    >
                      {estado === "cubierto" && <Check className="h-3 w-3" aria-hidden />}
                      {estado === "de-mas" && <AlertTriangle className="h-3 w-3" aria-hidden />}
                      {estado === "cubierto"
                        ? "ya declarado"
                        : estado === "de-mas"
                          ? "declarado de MÁS"
                          : "declarado en parte"}{" "}
                      <span className="font-mono tabular-nums">{fmtM3(yaDeclarado.m3)} m³</span>
                      {estado === "de-mas" && (
                        <span className="font-normal opacity-80">
                          contra {fmtM3(amparaElPar)} que ampara la distribución
                        </span>
                      )}
                      {yaDeclarado.ultimaFecha && (
                        <span className="font-normal opacity-80">
                          · {fechaCorta(yaDeclarado.ultimaFecha)}
                        </span>
                      )}
                    </span>
                  )}
                </td>
                <td className={NUM}>{fmtPiezas(d.piezas)}</td>
                <td className={`${NUM} font-bold text-[var(--text-primary)]`}>{fmtM3(d.m3)}</td>
                <td className={NUM} title={`${fmtM3(d.m3)} m³ × 424`}>{fmtPt(ptDesdeM3(d.m3))}</td>
                <td className={`${NUM} text-[var(--text-tertiary)]`}>
                  {d.motivo === "amparado"
                    ? "—"
                    : d.cubreTodo
                      ? "cubre todo"
                      : `${fmtM3(d.restaM3)} m³`}
                </td>
                <td className={`${TD} text-right`}>
                  {d.mismoTipo ? (
                    /* Nada que declarar: el bloque ampara su propio tipo tal
                       como está. Ofrecer «Declarar» acá sería pedir que se
                       registre un reproceso que no ocurrió. */
                    <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                      sin reproceso
                    </span>
                  ) : (
                    /* Del sugerido al declarado sin retipear: el Libro abre con
                       el producto y el volumen puestos, y el operario sólo
                       elige de qué corrida sale (eso no se adivina). */
                    <button
                      type="button"
                      onClick={() => onDeclarar(d)}
                      className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-[var(--rule-base)] px-2 py-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                      title={`Declarar este reproceso sin salir de acá: ${fmtM3(d.m3)} m³ de ${grupo.desdeTipo} a ${d.tipo}. Se elige de qué corrida sale y se registra en el Libro.`}
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Declarar
                    </button>
                  )}
                </td>
              </tr>,
              abierto ? (
                <tr key={`${clave}:medidas`} className="border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
                  <td colSpan={7} className="px-2 py-1.5">
                    <table className="w-full">
                      <tbody>
                        {d.medidas.map((m) => (
                          <tr key={m.clave}>
                            <td className="py-0.5 pl-6 text-xs text-[var(--text-secondary)]">{m.medida}</td>
                            <td className="py-0.5 text-right font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                              {fmtPiezas(m.piezas)} pzas
                            </td>
                            <td className="py-0.5 text-right font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                              {fmtM3(m.m3)} m³
                            </td>
                            {/* Acá el PT es el MEDIDO de la escuadría, no el
                                derivado: el m³ salió de él. */}
                            <td className="py-0.5 pr-2 text-right font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                              {fmtPt(m.pieTablar)} PT
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              ) : null,
            ];
          })}
        </tbody>
        {totalM3 != null && (
          <tfoot>
            <tr className="border-t-2 border-[var(--rule-base)]">
              <td />
              <td className={`${TD} font-bold text-[var(--text-primary)]`}>{totalLabel}</td>
              <td className={`${NUM} font-bold text-[var(--text-primary)]`}>
                {totalPiezas != null ? fmtPiezas(totalPiezas) : "—"}
              </td>
              <td className={`${NUM} font-bold text-[var(--text-primary)]`}>{fmtM3(totalM3)}</td>
              <td className={`${NUM} font-bold text-[var(--text-primary)]`}>{fmtPt(ptDesdeM3(totalM3))}</td>
              <td />
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/**
 * Lo que un bloque ampara y de él NO puede salir (ADR-407).
 *
 * Va arriba de todo y en rojo porque no se arregla firmando: un reproceso sin
 * declarar se declara, pero «de paquetería salió comercial» no se declara de
 * ninguna forma — hay que corregir el respaldo o el tipo de las piezas antes
 * de que el papel lo afirme.
 */
function RespaldosImposibles({ imposibles }: { imposibles: AmparoImposible[] }) {
  if (imposibles.length === 0) return null;
  const totalM3 = imposibles.reduce((a, i) => a + i.m3, 0);
  return (
    <div className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 p-3">
      <p className="flex items-start gap-1.5 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          {imposibles.length}{" "}
          {imposibles.length === 1 ? "respaldo que la sierra no puede dar" : "respaldos que la sierra no puede dar"}
          {" · "}
          <span className="font-mono tabular-nums">{fmtM3(totalM3)} m³</span>
        </span>
        <InfoTip
          title="Cómo se arregla"
          what="Marca el bloque con «Lleva sólo» para que no ampare ese tipo."
          affects="O trae un producto de origen del que sí salga esa conversión, o corrige el tipo de esas piezas si la medida está mal cargada."
        />
      </p>
      <ul className="mt-2 space-y-1.5">
        {imposibles.map((i) => (
          <li
            key={`${i.bloqueId}|${i.haciaTipo}`}
            className="rounded-lg bg-[var(--surface-canvas)] px-2 py-1.5"
          >
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm text-[var(--text-secondary)]">
              <span className={`${CHIP} bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]`}>
                {i.desdeTipo}
              </span>
              <span role="img" className="text-[var(--text-tertiary)]" aria-label="ampara">
                →
              </span>
              <span className={`${CHIP} bg-[var(--data-error-500)]/15 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]`}>
                {i.haciaTipo}
              </span>
              <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
                {fmtM3(i.m3)} m³
              </span>
              <span className="text-xs text-[var(--text-tertiary)]">
                {fmtPiezas(i.piezas)} pzas · {i.especie}
              </span>
              <span className="ml-auto truncate text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                {i.etiqueta}
              </span>
            </p>
            <p className="mt-0.5 text-[length:var(--ts-2xs)] leading-snug text-[var(--text-tertiary)]">
              {i.porque}
              {i.medidas.length > 0 && (
                <>
                  {" · "}
                  {i.medidas.slice(0, 4).map((m) => m.medida).join(" · ")}
                  {i.medidas.length > 4 && ` +${i.medidas.length - 4}`}
                </>
              )}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ReprocesosSugeridos({
  grupos,
  cuadre,
  imposibles = [],
}: {
  grupos: GrupoDeReproceso[];
  cuadre: CuadreDeDistribucion;
  imposibles?: AmparoImposible[];
}) {
  const { marcadas, alternar, limpiar } = useMarcas();
  /* Lo que el Libro ya declaró en el último mes: marca las filas que ya están
     registradas para no declararlas dos veces. Falla en silencio si el Libro
     está apagado — esta sección es del cubicador. */
  const { porPar, dias, recargar: recargarDeclarados } = useReprocesosDeclarados();
  /* Las corridas con saldo, para poder declarar acá mismo. */
  const { corridas, cargando: cargandoCorridas, disponible: libroDisponible, recargar: recargarCorridas } =
    useCorridasParaReproceso();
  /** La conversión que se está declarando: primero se elige la corrida. */
  const [declarando, setDeclarando] = useState<{ grupo: GrupoDeReproceso; destino: FilaSalida } | null>(null);
  /** La corrida elegida: con ella se abre el modal de reproceso del Libro. */
  const [origenElegido, setOrigenElegido] = useState<CorridaParaReproceso | null>(null);
  /** Lo que pasó al declarar — se dice acá y no en un toast que se va solo. */
  const [nota, setNota] = useState<string | null>(null);
  /**
   * Los tildados que SÍ se declaran, en el orden en que se leen.
   *
   * Las filas del mismo tipo quedan afuera por construcción: su clave lleva el
   * prefijo `=` y acá se arma sin él. Declarar «comercial → comercial» sería
   * registrar un reproceso que no ocurrió.
   */
  /**
   * Cuánto ampara la distribución de cada conversión, sumando TODOS los bloques.
   * Sólo lo ya amparado: las opciones compiten por la misma capacidad y sumarlas
   * inflaría el denominador contra el que se juzga lo declarado.
   */
  const sugeridoPorPar = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of grupos) {
      for (const d of g.amparados) {
        const k = claveDeConversion(g.especie, g.desdeTipo, d.tipo);
        m.set(k, r3((m.get(k) ?? 0) + d.m3));
      }
    }
    return m;
  }, [grupos]);

  const marcadosParaDeclarar = useMemo(() => {
    const out: Parameters<typeof declararColaEnElLibro>[0][number][] = [];
    for (const g of grupos) {
      for (const d of [...g.amparados, ...g.opciones]) {
        if (!marcadas.has(`${g.clave}|${d.tipo}|${d.motivo}`)) continue;
        out.push({
          desdeTipo: g.desdeTipo,
          haciaTipo: d.tipo,
          productoDestino: productoDelTipoComercial(d.tipo),
          m3: d.m3,
          especie: g.especie,
          etiqueta: g.etiquetas.join(" · "),
          permiso: g.permiso,
        });
      }
    }
    return out;
  }, [grupos, marcadas]);

  if (grupos.length === 0 && imposibles.length === 0) return null;

  return (
    <div className="space-y-3">
      <RespaldosImposibles imposibles={imposibles} />
      {nota && (
        <p className="flex items-start gap-1.5 rounded-xl border border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 px-3 py-2 text-sm text-[var(--text-secondary)]">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" aria-hidden />
          <span>{nota}</span>
          <button
            type="button"
            onClick={() => setNota(null)}
            className="ml-auto text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] underline hover:text-[var(--text-primary)]"
          >
            Cerrar
          </button>
        </p>
      )}
      {marcadas.size > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
          {/* Declarar la TANDA: el Libro los ofrece uno tras otro y al terminar
              cada uno aparece el siguiente, sin volver acá a buscar la fila. */}
          {marcadosParaDeclarar.length > 0 && (
            <button
              type="button"
              onClick={() => declararColaEnElLibro(marcadosParaDeclarar)}
              title={`Abre el Libro con ${marcadosParaDeclarar.length} reproceso(s) en fila: ${marcadosParaDeclarar
                .map((b) => `${b.desdeTipo} → ${b.haciaTipo} ${fmtM3(b.m3)} m³`)
                .join(" · ")}`}
              className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--accent)] bg-primary/10 px-2.5 py-1 text-xs font-bold text-[var(--accent-ink)] transition hover:brightness-95 dark:text-[var(--accent)]"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Declarar {marcadosParaDeclarar.length === 1 ? "el marcado" : `los ${marcadosParaDeclarar.length} marcados`}
              <span className="font-mono font-normal opacity-80">
                {fmtM3(marcadosParaDeclarar.reduce((a, b) => a + b.m3, 0))} m³
              </span>
            </button>
          )}
          <span>
            {marcadas.size} {marcadas.size === 1 ? "fila repasada" : "filas repasadas"}
          </span>
          <button
            type="button"
            onClick={limpiar}
            className="font-bold text-[var(--text-secondary)] underline hover:text-[var(--text-primary)]"
          >
            Desmarcar todo
          </button>
        </div>
      )}
      {/* La cuenta de cierre: qué falta, con qué se tapa, qué queda. Con todo
          respaldado, cuatro ceros no dicen nada: se dice en una línea. */}
      {cuadre.faltaM3 <= 0 ? (
        <p className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          <b className="text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
            Todo lo cubicado tiene respaldo.
          </b>{" "}
          Abajo, lo que ese respaldo <b>da por hecho</b>.
          {cuadre.libreM3 > 0 && (
            <span className="text-[var(--text-tertiary)]">
              {" "}
              · Quedan <span className="font-mono tabular-nums">{fmtM3(cuadre.libreM3)}</span> m³ de
              capacidad sin usar.
            </span>
          )}
        </p>
      ) : (
        <div className="grid gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3 sm:grid-cols-4">
          {[
            {
              label: "Falta respaldar",
              v: cuadre.faltaM3,
              extra: `${fmtPiezas(cuadre.faltaPiezas)} pzas`,
            },
            { label: "Tapan los reprocesos", v: cuadre.cubreReprocesoM3, tono: "ok" as const },
            { label: "Capacidad libre", v: cuadre.libreM3 },
            {
              label: "Queda sin respaldo",
              v: cuadre.quedaM3,
              tono: cuadre.quedaM3 > 0 ? ("falta" as const) : ("ok" as const),
            },
          ].map((c) => (
            <div key={c.label}>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                {c.label}
              </p>
              <p
                className={`font-mono text-base font-bold tabular-nums ${
                  c.tono === "ok"
                    ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                    : c.tono === "falta"
                      ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                      : "text-[var(--text-primary)]"
                }`}
              >
                {fmtM3(c.v)} <span className="text-xs font-normal">m³</span>
              </p>
              {c.extra && (
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{c.extra}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {grupos.map((g) => (
        <div
          key={g.clave}
          className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)]"
        >
          {/* El producto ORIGINAL: lo que hay, con su tipo, m³ y piezas. */}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2">
            <span
              className={`${CHIP} bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]`}
            >
              {g.desdeTipo}
            </span>
            <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
              {fmtM3(g.origenM3)} m³{g.esRolliza ? " (R)" : ""}
            </span>
            {g.clave.startsWith("t:") && g.etiquetas.length > 1 && (
              <span className="rounded-md bg-[var(--surface-canvas)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                {g.etiquetas.length} bloques juntos
              </span>
            )}
            {g.origenPiezas != null && (
              <span className="text-xs text-[var(--text-secondary)]">
                {fmtPiezas(g.origenPiezas)} pzas
              </span>
            )}
            {/* En rolliza el m³ del bloque NO es lo que ampara: son m³ (R) de
                troza y hay que pasarlos por el % aprovechable. Decir sólo el
                primero hacía leer la tabla de abajo como si le faltara la mitad
                de la madera (Brandon, 2026-09-09). */}
            {g.esRolliza && (
              <span className="rounded-md bg-[var(--data-info-500)]/12 px-1.5 py-0.5 text-xs font-bold text-[var(--data-info-700)] dark:text-[var(--data-info-500)]">
                ampara <span className="font-mono tabular-nums">{fmtM3(g.capacidadM3)}</span> m³ (A)
                {g.aprovechablePct != null && <span className="font-normal"> · al {g.aprovechablePct}%</span>}
              </span>
            )}
            <span className="text-xs text-[var(--text-tertiary)]">· {g.especie}</span>
            {/* El N° de permiso del producto, tal como lo declara el bloque —
                UNO solo. Con bloques de permisos distintos no se muestra
                ninguno: elegir uno diría que la madera salió de un título que
                no se sabe cuál es (Brandon, 2026-09-09). */}
            {g.permiso && (
              <span className="rounded-md bg-[var(--surface-canvas)] px-1.5 py-0.5 text-xs font-bold text-[var(--text-secondary)]">
                N° de permiso <span className="font-mono">{g.permiso}</span>
              </span>
            )}
            <span className="ml-auto truncate text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
              {g.etiquetas.join(" · ")}
            </span>
          </div>

          <div className="px-3 pb-3">
            {/* Todo lo que ESTE bloque ampara, en una sola tabla: los tipos que
                salen por la sierra Y el suyo propio. Sin la fila del mismo tipo,
                el total de acá no llegaba al m³ que la tabla de bloques declara
                y la sección se leía incoherente con el bloque determinado
                (Brandon, 2026-09-09). */}
            <TablaSalidas
              titulo="Lo que este bloque ampara"
              ayuda={
                g.mismoTipoM3 > 0
                  ? "se suman · lo que cambia de tipo hay que declararlo en el Libro"
                  : "se suman · falta declararlo en el Libro"
              }
              destinos={[
                ...g.amparados,
                ...(g.mismoTipoM3 > 0
                  ? [{
                      tipo: g.desdeTipo,
                      m3: g.mismoTipoM3,
                      piezas: g.mismoTipoPiezas,
                      motivo: "amparado" as const,
                      cubreTodo: true,
                      restaM3: 0,
                      medidas: g.mismoTipoMedidas,
                      mismoTipo: true,
                    }]
                  : []),
              ]}
              totalM3={r3(g.saleM3 + g.mismoTipoM3)}
              totalPiezas={g.salePiezas + g.mismoTipoPiezas}
              totalLabel="Total que ampara"
              tono="amparado"
              grupo={g}
              marcadas={marcadas}
              onMarcar={alternar}
              declarados={porPar}
              diasDeclarados={dias}
              onDeclarar={(destino) => setDeclarando({ grupo: g, destino })}
              sugeridoPorPar={sugeridoPorPar}
            />
            {/* Las opciones se suman cuando ENTRAN JUNTAS en lo libre: de
                2.500 salen paquetería larga 1.500 y larga angosta 0.800 a la
                vez. Compiten sólo si la suma se pasa — ahí sí, elegir una. */}
            <TablaSalidas
              titulo="Puedes cubrir con lo libre"
              ayuda={
                g.opcionesCabenJuntas
                  ? `entran juntas: ${fmtM3(g.opcionesM3)} de los ${fmtM3(g.libreM3)} m³ libres`
                  : `no entran juntas (${fmtM3(g.opcionesM3)} de ${fmtM3(g.libreM3)} m³ libres) · elige una`
              }
              destinos={g.opciones}
              totalM3={g.opcionesCabenJuntas ? g.opcionesM3 : null}
              totalPiezas={g.opcionesCabenJuntas ? g.opcionesPiezas : null}
              totalLabel="Total si las haces todas"
              tono="opcion"
              grupo={g}
              marcadas={marcadas}
              onMarcar={alternar}
              declarados={porPar}
              diasDeclarados={dias}
              onDeclarar={(destino) => setDeclarando({ grupo: g, destino })}
              sugeridoPorPar={sugeridoPorPar}
            />

            {/* La cuenta completa del producto, para que cierre contra la tabla
                de bloques: lo que ampara de OTRO tipo (el reproceso), lo que
                ampara de su MISMO tipo (no hace falta reproceso) y lo que
                queda sin amparar. Las tres suman lo que el bloque ampara.

                ⚠️ Sólo cierra cuando la tarjeta es UN bloque. Cuando junta
                varios (clave `t:`, una capacidad compartida para tapar el mismo
                faltante), lo que cada uno ampara se detalla en SU tarjeta y
                sumarlo acá dejaba un «ampara 0.879» con filas por 0.378 —una
                resta que el operario no puede reconstruir— (2026-09-09). */}
            {g.clave.startsWith("t:") ? (
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-[var(--rule-soft)] pt-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                <span>
                  Capacidad de{" "}
                  <b className="text-[var(--text-secondary)]">{g.etiquetas.length} bloques</b> juntos:{" "}
                  <b className="font-mono tabular-nums text-[var(--text-secondary)]">
                    {fmtM3(g.libreM3)} m³
                  </b>{" "}
                  libres de {fmtM3(g.capacidadM3)} m³.
                </span>
                <span>
                  Lo que cada uno ya ampara —y el reproceso que eso da por hecho— va en{" "}
                  <b>su propia tarjeta</b>.
                </span>
              </p>
            ) : (
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-[var(--rule-soft)] pt-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
              <span>
                De{" "}
                <b className="font-mono tabular-nums text-[var(--text-secondary)]">
                  {fmtM3(g.capacidadM3)} m³
                </b>{" "}
                {g.esRolliza ? "que puede amparar" : ""} ampara{" "}
                <b className="font-mono tabular-nums text-[var(--text-secondary)]">
                  {fmtM3(g.amparadoM3)} m³
                </b>
                :
              </span>
              {/* Sólo si hay algo que declarar: «0.000 m³ de otro tipo» en un
                  producto que todavía no ampara nada es un renglón que ocupa
                  lugar y no dice nada. */}
              {g.saleM3 > 0 && (
                <span>
                  <b className="font-mono tabular-nums text-[var(--text-secondary)]">
                    {fmtM3(g.saleM3)} m³
                  </b>{" "}
                  de otro tipo{g.salePiezas > 0 && ` (${fmtPiezas(g.salePiezas)} pzas)`} —{" "}
                  <b>reproceso a declarar</b>
                </span>
              )}
              {g.mismoTipoM3 > 0 && (
                <span>
                  ·{" "}
                  <b className="font-mono tabular-nums text-[var(--text-secondary)]">
                    {fmtM3(g.mismoTipoM3)} m³
                  </b>{" "}
                  de su mismo tipo
                  {g.mismoTipoPiezas > 0 && ` (${fmtPiezas(g.mismoTipoPiezas)} pzas)`} —{" "}
                  <b>no hace falta reprocesar</b>
                </span>
              )}
              {g.imposibleM3 > 0 && (
                /* Sin este renglón, «reproceso + mismo tipo» no llega a lo que
                   ampara el bloque y la resta parece un descuadre inventado. */
                <span className="text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                  ·{" "}
                  <b className="font-mono tabular-nums">{fmtM3(g.imposibleM3)} m³</b>
                  {g.imposiblePiezas > 0 && ` (${fmtPiezas(g.imposiblePiezas)} pzas)`} que de acá{" "}
                  <b>no pueden salir</b> — mira el aviso de arriba
                </span>
              )}
              {g.excedeM3 > RUIDO_M3 ? (
                /* El reparto cierra hasta 3 piezas / 50 litros / 1 % por encima
                   del bloque para que las últimas tablas no queden huérfanas.
                   Decirlo es más honesto que mostrar «quedan 0.000». */
                <span className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                  · <b className="font-mono tabular-nums">{fmtM3(g.excedeM3)} m³</b> por encima:
                  cierre por diferencia de medición
                </span>
              ) : g.quedaM3 > RUIDO_M3 ? (
                <span>
                  · quedan{" "}
                  <b className="font-mono tabular-nums text-[var(--text-secondary)]">
                    {fmtM3(g.quedaM3)} m³
                  </b>{" "}
                  de capacidad sin usar
                </span>
              ) : null}
            </p>
            )}
          </div>
        </div>
      ))}

      {/* Declarar sin salir: primero de qué corrida sale (eso no se adivina) y
          después el MISMO modal de reproceso del Libro, con el producto y el
          volumen puestos. Lo registrado es idéntico se entre por acá o allá. */}
      {declarando && !origenElegido && (
        <DeclararReprocesoPicker
          desdeTipo={declarando.grupo.desdeTipo}
          haciaTipo={declarando.destino.tipo}
          m3={declarando.destino.m3}
          especie={declarando.grupo.especie}
          etiqueta={declarando.grupo.etiquetas.join(" · ")}
          corridas={corridas}
          cargando={cargandoCorridas}
          disponible={libroDisponible}
          onElegir={setOrigenElegido}
          onIrAlLibro={() =>
            declararEnElLibro({
              desdeTipo: declarando.grupo.desdeTipo,
              haciaTipo: declarando.destino.tipo,
              productoDestino: productoDelTipoComercial(declarando.destino.tipo),
              m3: declarando.destino.m3,
              especie: declarando.grupo.especie,
              etiqueta: declarando.grupo.etiquetas.join(" · "),
              permiso: declarando.grupo.permiso,
            })
          }
          onCerrar={() => setDeclarando(null)}
        />
      )}
      {declarando && origenElegido && (
        <CtpReprocesoModal
          origen={{
            id: origenElegido.id,
            lineNo: origenElegido.lineNo,
            especie: origenElegido.especie,
            producto: origenElegido.producto,
            unidad: origenElegido.unidad,
            disponible: origenElegido.disponible,
          }}
          sugerencia={{
            producto: productoDelTipoComercial(declarando.destino.tipo),
            m3: declarando.destino.m3,
            desdeTipo: declarando.grupo.desdeTipo,
          }}
          onClose={() => setOrigenElegido(null)}
          onListo={(msg, detalle) => {
            setNota(`${msg} — ${detalle}`);
            setOrigenElegido(null);
            setDeclarando(null);
            /* La fila tiene que decir «ya declarado» en el acto, y la corrida
               quedó con menos saldo: se releen las dos cosas. */
            recargarDeclarados();
            recargarCorridas();
          }}
        />
      )}

</div>
  );
}

/** El ícono del apartado: el MISMO que «Reprocesar» en Productos disponibles —
 *  la misma acción no puede tener dos símbolos en el mismo módulo. */
export const ICONO_REPROCESOS = RefreshCw;

/**
 * Cómo se lee esta sección — vive detrás del ⓘ del título, no en la pantalla.
 *
 * Era un párrafo de seis renglones al pie que se lee UNA vez y después estorba
 * todos los días (Brandon, 2026-09-09: «es muy tedioso ver mucha información
 * suelta»). Lo que cambia dato a dato se queda a la vista; la regla, no.
 */
export const AYUDA_REPROCESOS = (
  <>
    <b>Al recortar suben las piezas y baja el volumen:</b> el reproceso nunca convierte más de lo
    que hay.
    <br />
    <b className="mt-1 inline-block">Qué se puede reprocesar:</b> {FRASE_REGLA}
    <br />
    <b className="mt-1 inline-block">Columnas:</b> piezas, m³ y PT (el pie tablar sale de m³ × 424;
    en el desglose de medidas es el medido de cada escuadría).
    <br />
    <b className="mt-1 inline-block">Si el respaldo cierra unos litros por encima</b> del bloque, es
    el cierre por diferencia de medición del reparto (hasta 3 piezas y 1 % del bloque).
    <br />
    <b className="mt-1 inline-block">Declarar</b> registra el reproceso en el Libro —hay que decir de
    qué corrida sale—; mientras no lo hagas, acá no se mueve nada.
  </>
);

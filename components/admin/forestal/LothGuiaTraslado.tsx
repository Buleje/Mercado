"use client";

/**
 * Traslado y detalle de la guía del bosque — la ruta; (35) la lista de trozas,
 * (36) la GTF de origen y (38) las observaciones.
 *
 * Brandon 29-09-2026:
 *   · el N° de la lista de trozas automático: su propio correlativo, uno por
 *     hoja (`loth-lista-numero`);
 *   · el (36) automático: «No aplica · sale del bosque» puesto, o el N° de una
 *     guía del sistema elegido, sin tipear.
 *
 * 15-10-2026: la partida se mudó a su bloque (`LothGuiaPartida.tsx`, casilleros
 * (17)-(20) del formato 2024) y la llegada dejó de ser un bloque aparte: es la
 * dirección del destinatario, como en el formato (casillero (24)).
 *
 * 16-10-2026, con la cara del talonario: «DETALLE DEL PRODUCTO» en el orden
 * del papel —(32) GTF de origen, (33) N° de la lista, (34) el cuadro por
 * especie (de sólo lectura: sale de las trozas elegidas) y (34h) el total
 * movilizado—; la ruta y el CITES, que no tienen casillero, al final; y (35)
 * Observaciones abajo, sin franja, como en el papel.
 */

import { casilleroGtf2024 } from "@/lib/forestal/ctp-gtf-formato";
import { useMemo, useState } from "react";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { mismoNumeroGtf } from "@/lib/forestal/gtf-talonario";
import { detallePorEspecie, totalM3, type GuiaParaOrigen, type LineaDetalle } from "@/lib/forestal/loth-guia-despacho";
import { FILAS_POR_LISTA } from "@/lib/forestal/loth-lista-numero";
import type { DespachoGuiaLoth } from "./hooks/use-despacho-guia-loth";
import { Bloque } from "./ctp-guia-bloques";
import { CLASE_NO_APLICA, SubBloque } from "./ctp-guia-piezas";
import { claseFalta } from "./TramiteRelacionGuiaFila";
import { Field, I } from "./ctp-shared";
import { parcheDe } from "./LothGuiaBloques";
import { RenglonGtf, TABLA_GTF, TD_GTF, TD_NUM_GTF, TH_GTF } from "./gtf-papel";
import { rotuloGtf2024 } from "./loth-guia-papel-piezas";

/** El número y el rótulo del papel 2024 del campo de clave interna `clave`. */
const n = (clave: string) => casilleroGtf2024(clave);
const R = (clave: string) => rotuloGtf2024(n(clave) ?? "");
/** El (34) del cuadro: el número de sus columnas sin la letra («34a» → «34»). */
const N_CUADRO = (n("37a") ?? "").replace(/[a-z]$/, "");

const vacio = (v: string | null | undefined) => !v?.trim();
/* El ámbar de «falta» con `claseFalta()` (08-10): en oscuro, el `CLASE_FALTA`
   pegado al lado de `border-[var(--rule-base)]` lo pisaba `globals.css` y no se veía. */
const conFalta = (v: string | null | undefined, base: string) => (vacio(v) ? claseFalta(base) : base);

const TEXTAREA =
  "w-full rounded-xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] placeholder:text-[var(--text-tertiary)]";

/** (34) El cuadro del papel, una fila por especie. De sólo lectura: sale de las trozas elegidas. */
function CuadroDetalle({ detalle }: { detalle: readonly LineaDetalle[] }) {
  const th = (k: string, extra = "") => (
    <>
      ({n(k)}) {R(k)}
      {extra}
    </>
  );
  return (
    <div className="min-w-0 overflow-x-auto sm:col-span-12">
      <table className={`${TABLA_GTF} min-w-[40rem]`}>
        <caption className="sr-only">(34) Cuadro detalle de productos</caption>
        <thead>
          <tr>
            <th rowSpan={2} className={TH_GTF}>{th("37a")}</th>
            <th rowSpan={2} className={TH_GTF}>{th("37b")}</th>
            <th rowSpan={2} className={TH_GTF}>{th("37c")}</th>
            <th colSpan={2} className={TH_GTF}>Forma de embalaje o presentación del producto</th>
            <th colSpan={2} className={TH_GTF}>Cantidad</th>
          </tr>
          <tr>
            <th className={TH_GTF}>{th("37d")}</th>
            <th className={TH_GTF}>{th("37e")}</th>
            <th className={TH_GTF}>{th("37f")}</th>
            <th className={TH_GTF}>{th("37g")}</th>
          </tr>
        </thead>
        <tbody>
          {detalle.length === 0 ? (
            <tr>
              <td colSpan={7} className={`${TD_GTF} text-center text-[var(--text-secondary)]`}>
                Todavía no hay trozas: elígelas en «Lista de trozas».
              </td>
            </tr>
          ) : (
            detalle.map((l) => (
              <tr key={`${l.comun}·${l.cientifico}`}>
                <td className={`${TD_GTF} italic`}>{l.cientifico || "—"}</td>
                <td className={TD_GTF}>{l.comun || "—"}</td>
                <td className={TD_GTF}>{l.tipoProducto}</td>
                <td className={TD_GTF}>{l.presentacion}</td>
                <td className={TD_NUM_GTF}>{l.cantidad}</td>
                <td className={TD_GTF}>{l.unidad}</td>
                <td className={`${TD_NUM_GTF} font-bold`}>{fmtM3(l.total)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** (32)–(34h) del papel; la ruta y el CITES (sin casillero) al final; (35) abajo. */
export function BloqueTrasladoLoth({
  g,
  faltan,
  cientificoDe,
}: {
  g: DespachoGuiaLoth;
  faltan: string[];
  cientificoDe?: (comun: string) => string | null | undefined;
}) {
  const { datos, setDatos } = g;
  const set = parcheDe(setDatos);
  const setGuia = (v: Partial<GtfDatos["guia"]>) => setDatos((p) => ({ ...p, guia: { ...p.guia, ...v } }));
  const llevaCites = g.piezas.some((p) => p.cites);
  const detalle = useMemo(() => detallePorEspecie(g.piezas, cientificoDe), [g.piezas, cientificoDe]);
  const ultimaLista = g.propuestaListas?.ultimo ?? null;
  const ayudaLista = `Cada hoja de la lista lleva hasta ${FILAS_POR_LISTA} trozas y su propio N°, como el talonario (49 trozas: lista 5 con 30 y lista 6 con 19; la guía siguiente empieza en la 7). ${
    ultimaLista != null
      ? `Sigue a la lista ${ultimaLista}, la última de este titular.`
      : "No hay listas anteriores de este titular: escribe el N° de la primera hoja y las siguientes se numeran solas."
  }`;
  return (
    <>
      <Bloque
        titulo="Detalle del producto"
        tituloPapel="Detalle del producto"
        hint="Los casilleros (32) a (34h): la guía de origen, el N° de la lista y el cuadro por especie, que sale solo de las trozas elegidas."
        nota="Sale en original y dos copias, como manda la RDE D000014-2024-MIDAGRI-SERFOR-DE (art. 5), con la lista de trozas como anexo."
        faltan={faltan}
      >
        <OrigenDeLaGuia
          valor={datos.guia.gtfOrigenNro}
          opciones={g.guiasOrigen}
          onChange={(v) => setGuia({ gtfOrigenNro: v })}
        />
        <Field span={6} label={R("35")} casillero={n("35")} required hint={ayudaLista}>
          <div className="grid gap-1">
            <input
              type="text"
              aria-label={`N° de la lista de trozas (${n("35")})`}
              className={g.piezas.length > 0 ? conFalta(datos.guia.listaTrozasNro, `${I} font-mono tabular-nums`) : `${I} font-mono tabular-nums`}
              placeholder={g.hojas > 1 ? "N° de la 1.ª hoja" : "N° de la lista"}
              value={datos.guia.listaTrozasNro}
              onChange={(e) => g.setListaTexto(e.target.value)}
            />
            {(g.hojas > 1 || g.listas.aviso) && (
              <span className={`text-xs ${g.listas.aviso ? "font-semibold text-[var(--data-warning-ink)]" : "text-[var(--text-secondary)]"}`}>
                {g.listas.aviso ??
                  `${g.hojas} hojas${g.listas.numeros.length ? `: N° ${g.listas.numeros.join(" y ")}` : ""}`}
              </span>
            )}
          </div>
        </Field>
        <p className="text-sm font-bold uppercase text-[var(--gtf-tinta)] sm:col-span-12">
          ({N_CUADRO}) {rotuloGtf2024(N_CUADRO)}
        </p>
        <CuadroDetalle detalle={detalle} />
        <RenglonGtf
          n={n("volumenTotal")}
          rotulo={<span className="uppercase">{R("volumenTotal")}</span>}
          className="sm:col-span-6 sm:col-start-7"
        >
          {g.piezas.length > 0 ? <b className="font-mono tabular-nums">{fmtM3(totalM3(g.piezas))} m³</b> : null}
        </RenglonGtf>
        <SubBloque etiqueta="Sin casillero en el papel">
          <Field span={8} label="Ruta declarada" hint="Del punto de partida a la dirección del destinatario. Los puestos de control la cotejan.">
            <input type="text" className={I} value={datos.traslado.ruta} onChange={(e) => set("traslado", { ruta: e.target.value })} />
          </Field>
          <Field span={4} label="Permiso CITES" hint={llevaCites ? "Una troza es de especie protegida: va el N° de permiso CITES." : "No aplica: ninguna troza de esta guía es de especie protegida."}>
            <input
              type="text"
              className={llevaCites ? conFalta(datos.citesPermiso, I) : `${I} ${CLASE_NO_APLICA}`}
              placeholder={llevaCites ? undefined : "no aplica"}
              value={datos.citesPermiso}
              onChange={(e) => setDatos((p) => ({ ...p, citesPermiso: e.target.value }))}
            />
          </Field>
        </SubBloque>
      </Bloque>
      {/* (35) Observaciones: un renglón del papel, sin franja. */}
      <div className="border-t border-[var(--gtf-tinta)] px-3 py-3">
        <Field label={R("38")} casillero={n("38")}>
          <textarea
            rows={2}
            className={TEXTAREA}
            value={datos.observaciones}
            onChange={(e) => setDatos((p) => ({ ...p, observaciones: e.target.value }))}
          />
        </Field>
      </div>
    </>
  );
}

const ORIGEN_OTRA = "__otra";

/**
 * (36) GTF de origen. En el bosque no hay guía anterior: «No aplica» es el
 * valor puesto (y el papel imprime NO APLICA, `ORIGEN_NO_APLICA`). Si la
 * madera sí viene amparada por otra guía, se ELIGE de las que el sistema ya
 * conoce —del Libro TH o de SERFOR guardadas— para no tipear el N°; «Otra»
 * deja escribirlo.
 */
function OrigenDeLaGuia({
  valor,
  opciones,
  onChange,
}: {
  valor: string;
  opciones: readonly GuiaParaOrigen[];
  onChange: (v: string) => void;
}) {
  const [escribir, setEscribir] = useState(false);
  const elegida = opciones.find((o) => mismoNumeroGtf(o.numero, valor));
  const seleccion = !valor.trim() && !escribir ? "" : elegida ? elegida.numero : ORIGEN_OTRA;
  return (
    <Field
      span={6}
      label={R("36")}
      casillero={n("36")}
      hint="La madera que sale del bosque no la ampara ninguna guía anterior: «No aplica», y el papel lo imprime así (un casillero en blanco se puede llenar después). Si viene con otra guía, elígela de las que ya están en el sistema."
    >
      <div className="grid gap-1.5">
        <select
          aria-label={`GTF de origen (${n("36")})`}
          className={I}
          value={seleccion}
          onChange={(e) => {
            const v = e.target.value;
            setEscribir(v === ORIGEN_OTRA);
            onChange(v === ORIGEN_OTRA ? (elegida ? "" : valor) : v);
          }}
        >
          <option value="">No aplica · sale del bosque</option>
          {opciones.length > 0 && (
            <optgroup label="Viene con una guía del sistema">
              {opciones.map((o) => (
                <option key={o.numero} value={o.numero}>
                  {o.etiqueta}
                </option>
              ))}
            </optgroup>
          )}
          <option value={ORIGEN_OTRA}>Otra guía: escribir el N°</option>
        </select>
        {seleccion === ORIGEN_OTRA && (
          <input
            type="text"
            aria-label="N° de la GTF de origen"
            className={conFalta(valor, `${I} font-mono tabular-nums`)}
            placeholder="019-001-0000064"
            value={valor}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </div>
    </Field>
  );
}

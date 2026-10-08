"use client";

/**
 * Traslado y detalle de la guía del bosque — partida, llegada y ruta; (35) la
 * lista de trozas, (36) la GTF de origen y (38) las observaciones.
 *
 * Brandon 29-09-2026:
 *   · la partida con dirección + departamento + provincia + distrito (el
 *     formato de SERFOR: «JR. X, Constitución, OXAPAMPA, PASCO»); se siembra
 *     del plan, y la llegada, del destinatario;
 *   · el N° de la lista de trozas automático: su propio correlativo, uno por
 *     hoja (`loth-lista-numero`);
 *   · el (36) automático: «No aplica · sale del bosque» puesto, o el N° de una
 *     guía del sistema elegido, sin tipear.
 */

import { useState } from "react";
import { componerPunto, type GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { mismoNumeroGtf } from "@/lib/forestal/gtf-talonario";
import { llegadaDelDestinatario, mismaUbicacion, type GuiaParaOrigen } from "@/lib/forestal/loth-guia-despacho";
import { FILAS_POR_LISTA } from "@/lib/forestal/loth-lista-numero";
import type { DespachoGuiaLoth } from "./hooks/use-despacho-guia-loth";
import { Bloque } from "./ctp-guia-bloques";
import { CLASE_NO_APLICA } from "./ctp-guia-piezas";
import { claseFalta } from "./TramiteRelacionGuiaFila";
import PuntoTraslado from "./PuntoTraslado";
import { Btn, Field, I } from "./ctp-shared";
import { parcheDe } from "./LothGuiaBloques";

const vacio = (v: string | null | undefined) => !v?.trim();
/* El ámbar de «falta» con `claseFalta()` (08-10): en oscuro, el `CLASE_FALTA`
   pegado al lado de `border-[var(--rule-base)]` lo pisaba `globals.css` y no se veía. */
const conFalta = (v: string | null | undefined, base: string) => (vacio(v) ? claseFalta(base) : base);

const TEXTAREA =
  "w-full rounded-xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] placeholder:text-[var(--text-tertiary)]";

/** Partida, llegada y ruta; (35) lista de trozas, (36) GTF de origen y (38) observaciones. */
export function BloqueTrasladoLoth({ g, faltan, className }: { g: DespachoGuiaLoth; faltan: string[]; className?: string }) {
  const { datos, setDatos } = g;
  const set = parcheDe(setDatos);
  const setGuia = (v: Partial<GtfDatos["guia"]>) => setDatos((p) => ({ ...p, guia: { ...p.guia, ...v } }));
  const llevaCites = g.piezas.some((p) => p.cites);
  const destino = llegadaDelDestinatario(datos);
  const hayDestino = Boolean(componerPunto(destino));
  const ultimaLista = g.propuestaListas?.ultimo ?? null;
  const ayudaLista = `Cada hoja de la lista lleva hasta ${FILAS_POR_LISTA} trozas y su propio N°, como las de SERFOR (34 trozas: listas 5 y 6; la guía siguiente, 7 y 8). ${
    ultimaLista != null
      ? `Sigue a la lista ${ultimaLista}, la última de este titular.`
      : "No hay listas anteriores de este titular: escribe el N° de la primera hoja y las siguientes se numeran solas."
  }`;
  return (
    <Bloque
      titulo="Traslado y detalle"
      hint="La ruta que se autoriza y los casilleros (35), (36) y (38)."
      nota="Sale en original y dos copias, como manda la RDE 122-2015 (art. 5), con la lista de trozas como anexo."
      faltan={faltan}
      className={className}
    >
      <PuntoTraslado
        titulo="Punto de partida"
        requerido
        ayuda="La parcela de corta y el sector del plan de manejo, con el ubigeo del plan. Así lo publica SERFOR: dirección, distrito, provincia, departamento."
        valor={datos.traslado.partida}
        onChange={(v) => g.setPunto("partida", v)}
      />
      <PuntoTraslado
        titulo="Punto de llegada"
        requerido
        ayuda="Sale de la dirección y el ubigeo del destinatario, y lo sigue mientras no lo cambies a mano."
        valor={datos.traslado.llegada}
        onChange={(v) => g.setPunto("llegada", v)}
        acciones={
          hayDestino && !mismaUbicacion(destino, datos.traslado.llegada) ? (
            <Btn size="sm" variant="ghost" onClick={g.usarLlegadaDelDestinatario}>
              Usar la del destinatario
            </Btn>
          ) : null
        }
      />
      <Field span={12} label="Ruta declarada" hint="Los puestos de control la cotejan">
        <input type="text" className={I} value={datos.traslado.ruta} onChange={(e) => set("traslado", { ruta: e.target.value })} />
      </Field>
      <Field span={6} label="N° de la lista de trozas" casillero={35} required hint={ayudaLista}>
        <div className="grid gap-1">
          <input
            type="text"
            aria-label="N° de la lista de trozas (35)"
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
      <OrigenDeLaGuia
        valor={datos.guia.gtfOrigenNro}
        opciones={g.guiasOrigen}
        onChange={(v) => setGuia({ gtfOrigenNro: v })}
      />
      <Field span={4} label="Permiso CITES" hint={llevaCites ? "Una troza es de especie protegida: va el N° de permiso CITES." : "No aplica: ninguna troza de esta guía es de especie protegida."}>
        <input
          type="text"
          className={llevaCites ? conFalta(datos.citesPermiso, I) : `${I} ${CLASE_NO_APLICA}`}
          placeholder={llevaCites ? undefined : "no aplica"}
          value={datos.citesPermiso}
          onChange={(e) => setDatos((p) => ({ ...p, citesPermiso: e.target.value }))}
        />
      </Field>
      <Field span={8} label="Observaciones" casillero={38}>
        <textarea
          rows={2}
          className={TEXTAREA}
          value={datos.observaciones}
          onChange={(e) => setDatos((p) => ({ ...p, observaciones: e.target.value }))}
        />
      </Field>
    </Bloque>
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
      label="GTF de origen"
      casillero={36}
      hint="La madera que sale del bosque no la ampara ninguna guía anterior: «No aplica», y el papel lo imprime así (un casillero en blanco se puede llenar después). Si viene con otra guía, elígela de las que ya están en el sistema."
    >
      <div className="grid gap-1.5">
        <select
          aria-label="GTF de origen (36)"
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

"use client";

/**
 * «Datos de la guía» del despacho con guía del Libro TH — los casilleros de la
 * GTF en el orden del papel, con los MISMOS bloques que la guía del CTP.
 *
 * Izquierda: el documento (1)(2)(3)(4), el título habilitante (5)–(12) y el
 * propietario (13)–(21). Derecha: el destinatario (22)–(28), el transporte
 * (29)–(34) y el traslado con (35)(36)(38). Casi todo llega ya escrito: el
 * título sale del plan de las trozas, el propietario es el titular y el
 * transporte se hereda de la guía anterior. Lo que el libro no sabe queda
 * vacío con «Falta» — nunca se rellena por rellenar.
 */

import type { GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { ORIGENES } from "@/lib/forestal/ctp-gtf-formato";
import { avisoDeOtroTitular, guiaEsDePlantacion, huecosDelTitulo, rotuloDelTitulo, type TalonarioDelPlan } from "@/lib/forestal/loth-guia-despacho";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import type { DespachoGuiaLoth } from "./hooks/use-despacho-guia-loth";
import CtpUbigeoSelects from "./CtpUbigeoSelects";
import { Bloque } from "./ctp-guia-bloques";
import { BloqueDestinatario, BloqueTransporte } from "./ctp-guia-bloques-partes";
import { CLASE_FALTA, ResumenDatos } from "./ctp-guia-piezas";
import { Btn, Field, FormularioClaro, I } from "./ctp-shared";
import { BloquePropietarioLoth, parcheDe, type PropsGuiaLoth } from "./LothGuiaBloques";
import { BloqueTrasladoLoth } from "./LothGuiaTraslado";
import LothDestinoCtp from "./LothDestinoCtp";

const vacio = (v: string | null | undefined) => !v?.trim();
const falta = (v: string | null | undefined) => (vacio(v) ? CLASE_FALTA : "");
const AVISO_NUMERO =
  "rounded-lg border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-50)] px-2.5 py-1.5 text-xs font-semibold text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/10";


export default function LothGuiaDatos(props: PropsGuiaLoth) {
  const { g, directorio, onAnotarParte, onAnotarVehiculo, onGuardarEnLibreta } = props;
  const { datos, setDatos } = g;
  const set = parcheDe(setDatos);
  /* Lo que falta por bloque sale de la MISMA regla que frena el registro
     (`faltantesDespachoLoth`): la del CTP más el N°, la lista y la partida
     casillero por casillero. */
  const de = (...s: string[]) => g.faltan.filter((f) => s.includes(f.seccion)).map((f) => f.campo);

  return (
    <FormularioClaro>
      <div data-guia-datos className="grid gap-3 xl:grid-cols-2 xl:items-start">
        <div className="grid gap-3">
          <BloqueDocumento g={g} />
          <BloqueTitulo g={g} faltaTitulo={de("titulos")} />
          <BloquePropietarioLoth {...props} faltan={de("propietario")} />
        </div>
        <div className="grid gap-3">
          <BloqueDestinatario
            datos={datos}
            set={set}
            directorio={directorio}
            onAnotarParte={onAnotarParte}
            onGuardarEnLibreta={onGuardarEnLibreta}
            faltan={de("destinatario")}
          />
          <LothDestinoCtp g={g} />
          <BloqueTransporte
            datos={datos}
            set={set}
            setDatos={setDatos}
            directorio={directorio}
            onAnotarParte={onAnotarParte}
            onAnotarVehiculo={onAnotarVehiculo}
            onGuardarEnLibreta={onGuardarEnLibreta}
            faltan={de("transportista", "vehiculo")}
          />
        </div>
        {/* A lo ancho: la partida y la llegada lado a lado. En la columna
            derecha medía 832 px y dejaba la izquierda vacía (1944 vs 1001). */}
        <BloqueTrasladoLoth g={g} faltan={de("traslado")} className="xl:col-span-2" />
      </div>
    </FormularioClaro>
  );
}

/** Qué se sabe del talonario, en una línea para el ⓘ del N°. */
function ayudaDelNumero(t: TalonarioDelPlan | null): string {
  if (!t?.serie) {
    return "El plan de estas trozas no dice su departamento: escribe el N° entero de tu talonario (019-001-0000065). Carga la región en el plan y la serie sale sola.";
  }
  const donde = t.region
    ? ` es la de ${t.region.departamento} (${t.region.codigo}, el ubigeo del departamento${t.region.deducidoDe ? `, que se sacó del ${t.region.deducidoDe} que dice el plan` : ""})`
    : " sale de tu última guía";
  const ultimo = t.propuesta?.ultimo;
  if (ultimo) {
    return `La serie ${t.serie}${donde}. Sigue a la ${ultimo.numero}${ultimo.fecha ? ` del ${etiquetaLarga(ultimo.fecha)}` : ""}, la última de este titular. Confírmalo con el talonario que tienes en la mano.`;
  }
  const fuera = t.fueraDeSerie ? ` Su última guía en el sistema, la ${t.fueraDeSerie.numero}, es de otra serie.` : "";
  return `La serie ${t.serie}${donde}. Es la primera guía de este titular en esa serie: escribe sólo el N° impreso en tu talonario (65 queda ${t.serie}-0000065). Las siguientes se proponen solas.${fuera}`;
}

/** (1)(2)(3)(4): el número del talonario, las fechas y la autoridad. */
function BloqueDocumento({ g }: { g: DespachoGuiaLoth }) {
  const { datos, setDatos, numero: n, talonario: t } = g;
  const propuesta = t?.propuesta?.gtf ?? null;
  const otraRegion = n.revision?.otraRegion ?? null;
  const faltan = [
    vacio(g.gtfNumber) ? (n.invalido ? "N° de GTF válido" : "N° de GTF") : n.revision?.repetida ? "N° de GTF sin usar" : "",
    vacio(g.emision) ? "Fecha de expedición" : "",
  ].filter(Boolean);
  return (
    <Bloque
      titulo="Documento"
      hint="El número del talonario del titular, las fechas y la autoridad que ampara la guía."
      faltan={faltan}
      acciones={
        propuesta && propuesta !== g.gtfNumber.trim() ? (
          <Btn size="sm" variant="ghost" onClick={() => g.setGtfNumber(propuesta)}>
            Usar el que sigue: <b className="font-mono tabular-nums">{propuesta}</b>
          </Btn>
        ) : null
      }
    >
      <Field span={6} label="N° de GTF" required hint={ayudaDelNumero(t)}>
        <div className="grid gap-1">
          {n.libre ? (
            <input
              type="text"
              aria-label="N° de GTF, entero"
              className={`${I} font-mono tabular-nums ${falta(g.gtfNumber)}`}
              value={n.texto}
              onChange={(e) => n.escribir(e.target.value)}
              placeholder={n.serie ? `${n.serie}-0000001` : "019-001-0000001"}
            />
          ) : (
            <div
              className={`flex h-11 items-stretch overflow-hidden rounded-xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-muted)] ${falta(g.gtfNumber)}`}
            >
              <span
                title={t?.region ? `Serie de ${t.region.departamento} (${t.region.codigo})` : undefined}
                className="flex items-center border-r border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2.5 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]"
              >
                {n.serie}-
              </span>
              <input
                type="text"
                inputMode="numeric"
                aria-label={`N° de GTF: correlativo del talonario, serie ${n.serie}`}
                className="min-w-0 flex-1 bg-transparent px-2.5 font-mono text-sm tabular-nums text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
                value={n.texto}
                onChange={(e) => n.escribir(e.target.value)}
                placeholder="N° impreso"
              />
            </div>
          )}
          <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-secondary)]">
            {!n.libre && g.gtfNumber && (
              <span>
                Sale <b className="font-mono tabular-nums text-[var(--text-primary)]">{g.gtfNumber}</b>
              </span>
            )}
            {n.invalido && <span className="font-semibold text-[var(--data-warning-ink)]">Escribe sólo el N° impreso (65)</span>}
            {n.serie && (
              <Btn size="sm" variant="ghost" className="ml-auto h-7 px-1.5 text-xs" onClick={() => n.cambiarSerie(!n.libre)}>
                {n.libre ? `Usar la serie ${n.serie}` : "Otra serie"}
              </Btn>
            )}
          </div>
          {otraRegion && t?.region && (
            <p role="status" className={AVISO_NUMERO}>
              Es de {otraRegion.departamento ?? "otra región"} ({otraRegion.codigo}) y el plan está en {t.region.departamento} ({t.region.codigo}). Al registrar se te pide confirmarlo.
            </p>
          )}
          {n.revision?.repetida && (
            <p role="alert" className="rounded-lg border border-[var(--data-error-500)]/50 bg-[var(--data-error-50)] px-2.5 py-1.5 text-xs font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
              Ya usaste este N° en la guía {n.revision.repetida.numero}
              {n.revision.repetida.fuente === "despacho_anulado" ? " (anulada)" : ""}: un N° del talonario va una sola vez.
            </p>
          )}
          {!n.revision?.repetida && n.revision?.deOtroTitular && (
            <p role="status" className={AVISO_NUMERO}>
              {avisoDeOtroTitular(n.revision.deOtroTitular)}
            </p>
          )}
          {!n.revision?.repetida && n.revision?.deSerfor && (
            <p role="status" className="text-xs text-[var(--text-secondary)]">
              Ese N° ya figura como guía de SERFOR de este titular ({n.revision.deSerfor.fuente === "ingreso" ? "ingresada al Libro CTP" : "guardada"}): si es esa misma guía, adelante.
            </p>
          )}
        </div>
      </Field>
      <Field span={6} label="Fecha de expedición" casillero={3} required>
        <input type="date" className={`${I} ${falta(g.emision)}`} value={g.emision} onChange={(e) => g.setEmision(e.target.value)} />
      </Field>
      <Field span={6} label="Vencimiento" casillero={4} hint="La fija la ARFFS por ruta y distancia. Se propone la de siempre y se corrige acá.">
        <input
          type="date"
          className={I}
          value={datos.traslado.fechaFin}
          onChange={(e) => setDatos((p) => ({ ...p, traslado: { ...p.traslado, fechaFin: e.target.value } }))}
        />
      </Field>
      <Field span={6} label="Autoridad forestal" casillero={2} hint="La ARFFS competente. Sale del plan de manejo de las trozas.">
        <input
          type="text"
          className={`${I} ${falta(datos.guia.autoridad)}`}
          value={datos.guia.autoridad}
          onChange={(e) => setDatos((p) => ({ ...p, guia: { ...p.guia, autoridad: e.target.value } }))}
          placeholder="ATFFS Selva Central"
        />
      </Field>
    </Bloque>
  );
}

/** (5)–(12): el título habilitante, tal como sale del plan y la carátula. */
function BloqueTitulo({ g, faltaTitulo }: { g: DespachoGuiaLoth; faltaTitulo: string[] }) {
  const { datos, setDatos } = g;
  const guia = datos.guia;
  const setGuia = (v: Partial<GtfDatos["guia"]>) => setDatos((p) => ({ ...p, guia: { ...p.guia, ...v } }));
  const huecos = huecosDelTitulo(datos);
  /* Una plantación se ampara con su REGISTRO y su constancia (ADR-459): el
     bloque lo dice con esas palabras. Los casilleros oficiales (6) y (8) no
     cambian de nombre en el papel; sólo se aclara qué va en cada uno. */
  const plantacion = g.identidad?.esPlantacion || guiaEsDePlantacion(datos);
  const f = g.identidad?.fuentes;
  const procedencia = [
    g.plan ? `el plan ${[g.plan.planNumber || g.plan.planType, g.plan.parcelaCorta].filter(Boolean).join(" · ")}` : "",
    f?.caratula ? "la carátula del libro" : "",
    f?.permiso ? "el permiso cargado" : "",
  ].filter(Boolean);
  return (
    <Bloque
      titulo={rotuloDelTitulo(plantacion)}
      hint={`Casilleros (5) a (12). Salen de ${procedencia.length ? procedencia.join(", ") : "lo que cargues acá"}: no se tipean en cada guía.`}
      nota="Lo que el libro no sabe queda en blanco en el papel, para llenarlo a mano sobre el talonario. Se corrige en el plan de manejo y sale bien en la próxima."
      faltan={[...faltaTitulo, ...huecos]}
    >
      <ResumenDatos
        datos={[
          { etiqueta: "(7) Titular", valor: g.identidad?.titular ?? "", ancho: 4, falta: "en el plan de manejo" },
        ]}
      />
      <Field span={6} label="Tipo de título" casillero={5} hint="La casilla que se cruza en el papel.">
        <select className={`${I} ${falta(guia.origenRecurso)}`} value={guia.origenRecurso} onChange={(e) => setGuia({ origenRecurso: e.target.value })}>
          <option value="">Sin marcar</option>
          {ORIGENES.map((o) => (
            <option key={o.clave} value={o.clave}>{o.label}</option>
          ))}
        </select>
      </Field>
      <Field
        span={6}
        label="N° del título habilitante"
        casillero={6}
        required
        hint={plantacion ? "En una plantación va el código de su registro (RNPF)." : undefined}
      >
        <input
          type="text"
          className={`${I} font-mono ${falta(datos.titulos[0])}`}
          value={datos.titulos[0] ?? ""}
          onChange={(e) => setDatos((p) => ({ ...p, titulos: e.target.value ? [e.target.value] : [] }))}
        />
      </Field>
      <Field span={6} label="Representante legal" hint="Va bajo el casillero (7) cuando el titular es una empresa o una comunidad.">
        <input type="text" className={I} value={guia.representanteLegal} onChange={(e) => setGuia({ representanteLegal: e.target.value })} />
      </Field>
      <Field
        span={6}
        label="N° de resolución"
        casillero={8}
        hint={plantacion ? "En una plantación va la constancia de inscripción." : undefined}
      >
        <input type="text" className={`${I} ${falta(guia.resolucion)}`} value={guia.resolucion} onChange={(e) => setGuia({ resolucion: e.target.value })} />
      </Field>
      <Field span={12} label="Plan de manejo (tipo)" casillero={9}>
        <input type="text" className={`${I} ${falta(guia.planManejoTipo)}`} value={guia.planManejoTipo} onChange={(e) => setGuia({ planManejoTipo: e.target.value })} />
      </Field>
      <CtpUbigeoSelects
        span={4}
        valor={{ departamento: guia.departamento, provincia: guia.provincia, distrito: guia.distrito }}
        onChange={(v) => setGuia(v)}
      />
    </Bloque>
  );
}

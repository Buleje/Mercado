"use client";

/**
 * «Datos de la guía» del despacho con guía del Libro TH — los casilleros de la
 * GTF en el orden del papel, con los MISMOS bloques que la guía del CTP.
 *
 * Izquierda: el documento (1)(2)(3)(4), el título habilitante (5)–(12), el
 * propietario (13)–(21) y el punto de partida (formato 2024, (17)–(20)).
 * Derecha: el destinatario, que es también el punto de llegada (no hay otro
 * bloque: así lo arma el formato 2024), y el transporte (29)–(34). Abajo, a lo
 * ancho, el traslado con (35)(36)(38). Casi todo llega ya escrito: el
 * título sale del plan de las trozas, el propietario es el titular y el
 * transporte se hereda de la guía anterior. Lo que el libro no sabe queda
 * vacío con «Falta» — nunca se rellena por rellenar.
 */

import type { GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { ORIGENES, ORIGENES_SIN_CASILLA_2024 } from "@/lib/forestal/ctp-gtf-formato";
import { guiaEsDePlantacion, huecosDelTitulo, rotuloDelTitulo } from "@/lib/forestal/loth-guia-despacho";
import type { DespachoGuiaLoth } from "./hooks/use-despacho-guia-loth";
import CtpUbigeoSelects from "./CtpUbigeoSelects";
import { Bloque } from "./ctp-guia-bloques";
import { BloqueDestinatario, BloqueTransporte } from "./ctp-guia-bloques-partes";
import { CLASE_FALTA, ResumenDatos } from "./ctp-guia-piezas";
import { Field, FormularioClaro, I } from "./ctp-shared";
import { BloquePropietarioLoth, parcheDe, type PropsGuiaLoth } from "./LothGuiaBloques";
import { BloquePartidaLoth } from "./LothGuiaPartida";
import { BloqueTrasladoLoth } from "./LothGuiaTraslado";
import LothDestinoCtp from "./LothDestinoCtp";
import LothGuiaDocumento from "./LothGuiaDocumento";
import LothGuiaLineaCopiada from "./LothGuiaLineaCopiada";
import PlantillasGuia from "./PlantillasGuia";

const vacio = (v: string | null | undefined) => !v?.trim();
const falta = (v: string | null | undefined) => (vacio(v) ? CLASE_FALTA : "");

export default function LothGuiaDatos(props: PropsGuiaLoth) {
  const { g, directorio, onAnotarParte, onAnotarVehiculo, onGuardarEnLibreta } = props;
  const { datos, setDatos } = g;
  const set = parcheDe(setDatos);
  /* Lo que falta por bloque sale de la MISMA regla que frena el registro
     (`faltantesDespachoLoth`): la del CTP más el N°, la lista y la partida
     casillero por casillero. */
  const de = (...s: string[]) => g.faltan.filter((f) => s.includes(f.seccion)).map((f) => f.campo);
  /* Los de la partida van a su bloque; el resto del traslado, al de abajo. */
  const esDePartida = (campo: string) => campo.startsWith("Partida");
  const traslado = de("traslado");

  return (
    <FormularioClaro>
      {/* La línea de lo copiado a la izquierda; las plantillas, a la derecha. */}
      <div className="mb-2 flex flex-wrap items-center justify-end gap-2 [&>p]:mb-0 [&>p]:min-w-0 [&>p]:flex-1">
        {g.copiadaDe && <LothGuiaLineaCopiada {...g.copiadaDe} />}
        <PlantillasGuia g={g} />
      </div>
      <div data-guia-datos className="grid gap-3 xl:grid-cols-2 xl:items-start">
        <div className="grid gap-3">
          <LothGuiaDocumento g={g} />
          <BloqueTitulo g={g} faltaTitulo={de("titulos")} />
          <BloquePropietarioLoth {...props} faltan={de("propietario")} />
          <BloquePartidaLoth {...props} faltan={traslado.filter(esDePartida)} />
        </div>
        <div className="grid gap-3">
          <BloqueDestinatario
            datos={datos}
            set={set}
            directorio={directorio}
            onAnotarParte={onAnotarParte}
            onGuardarEnLibreta={onGuardarEnLibreta}
            faltan={de("destinatario")}
            llegada
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
        {/* A lo ancho: la ruta, la lista, el origen y las observaciones. */}
        <BloqueTrasladoLoth g={g} faltan={traslado.filter((c) => !esDePartida(c))} className="xl:col-span-2" />
      </div>
    </FormularioClaro>
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
          {/* Una guía vieja con una casilla que el formato 2024 ya no tiene: se
              muestra lo guardado, pero el papel no cruza ninguna (ADR-494). */}
          {ORIGENES_SIN_CASILLA_2024.filter((o) => o.clave === guia.origenRecurso).map((o) => (
            <option key={o.clave} value={o.clave}>{o.label} (formato 2015, no sale en el papel)</option>
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

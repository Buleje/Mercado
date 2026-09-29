"use client";

/**
 * La placa en la guía de transporte (CTP y Libro TH), con las reglas de la
 * placa peruana y el botón «Buscar placa».
 *
 * Brandon 29-09-2026: «en placa quiero que se aplique formato de caracteres y
 * cantidad de datos que tiene una placa oficial en Perú para evitar inventados,
 * o también hacer uso de API que permita buscar información de la placa y
 * ponerse esos datos». Las guías guardadas traían «WRFWR242», «W3242G» y
 * «QA-450»: ninguna puede existir.
 *
 *   · `CampoPlaca` — mayúsculas y guion solos mientras se tipea; debajo, la
 *     zona registral de la letra («W · Huánuco, Junín y Pasco») o el motivo de
 *     por qué no es una placa. La MISMA regla (`leerPlaca`) que bloquea el
 *     registro en `faltantesGtf`.
 *   · `PlacaDelVehiculo` — el campo + «Buscar»: trae lo que el negocio ya sabe
 *     de esa placa y llena SOLO los casilleros vacíos, diciendo de dónde salió.
 */

import { useEffect, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, Check, Loader2, Search } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useBuscarPlaca, type EstadoBusquedaPlaca } from "@/hooks/use-buscar-placa";
import type { GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { formatDateShort } from "@/lib/format";
import { describirOrigen, rellenarDesdePlaca, resumenDeRelleno, type DatoAplicado } from "@/lib/forestal/placa-historial";
import { EJEMPLO_PLACA, leerPlaca, normalizarPlacaPeru } from "@/lib/forestal/placa-peru";
import { CampoPlaca } from "./ctp-campo-placa";
import { Btn, type CampoSpan } from "./ctp-shared";

/* El casillero vive en su archivo (lo usan también el flete, el Directorio y
   las guías de ingreso); se re-exporta para los que ya lo importaban de acá. */
export { CampoPlaca } from "./ctp-campo-placa";

/** `set` de la guía, reducido a las dos secciones que llena la búsqueda. */
type PonerSeccion = <K extends "vehiculo" | "transportista">(k: K, v: Partial<GtfDatos[K]>) => void;

const fechaCorta = (iso: string) => formatDateShort(iso, { soloFecha: true });

/** Qué dijo SUNARP, en un trozo de la línea. */
function TrozoSunarp({ respuesta, marcaPuesta }: { respuesta: Extract<EstadoBusquedaPlaca, { fase: "listo" }>["respuesta"]; marcaPuesta: boolean }) {
  const { externo, externoEstado, externoMotivo } = respuesta;
  if (externoEstado === "sin_clave") {
    return (
      <span className="inline-flex items-center gap-1 text-[var(--text-tertiary)]">
        SUNARP: sin clave
        <InfoTip
          title="Consulta a SUNARP"
          what="La consulta a SUNARP necesita la clave PLACA_API_TOKEN; por ahora busca en tus guías y en el Directorio."
          ariaLabel="Por qué no se consulta SUNARP"
        />
      </span>
    );
  }
  if (externoEstado === "encontrada" && externo) {
    const vehiculo = [externo.marca, externo.modelo].filter(Boolean).join(" ");
    return (
      <span className="text-[var(--text-secondary)]">
        SUNARP: <b className="text-[var(--text-primary)]">{vehiculo || externo.placa}</b>
        {externo.color ? ` · ${externo.color.toLowerCase()}` : ""}
        {marcaPuesta ? " · marca puesta" : ""}
      </span>
    );
  }
  if (externoEstado === "omitida") {
    return <span className="text-[var(--text-tertiary)]">SUNARP: no hizo falta, ya sabes la marca.</span>;
  }
  if (externoEstado === "tope") {
    return (
      <span className="inline-flex items-center gap-1 text-[var(--text-tertiary)]">
        {externoMotivo}
        <InfoTip
          title="Tope de consultas a SUNARP"
          what="Cada consulta nueva a SUNARP gasta créditos del proveedor; por eso hay un tope por negocio (día y mes) y uno de la cuenta entera por mes. Las placas ya consultadas salen de la memoria sin gastar."
          affects="Se cambia con PLACA_API_TOPE_DIA, PLACA_API_TOPE_MES y PLACA_API_TOPE_MES_GLOBAL."
          ariaLabel="Por qué no se consultó SUNARP"
        />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 font-semibold text-[var(--data-warning-ink)]">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {externoEstado === "no_encontrada" ? "SUNARP no tiene esta placa: revísala." : externoMotivo}
    </span>
  );
}

/** La línea de la búsqueda: qué se llenó y de dónde, o por qué no se llenó nada. */
function LineaDeBusqueda({ estado, aplicados }: { estado: EstadoBusquedaPlaca; aplicados: readonly DatoAplicado[] }) {
  const caja = "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2.5 py-1.5 text-sm sm:col-span-12";
  if (estado.fase === "quieto") return null;
  if (estado.fase === "buscando") {
    return (
      <p role="status" className={`${caja} bg-[var(--surface-sunken)] text-[var(--text-secondary)]`}>
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
        Buscando la placa en tus guías y en el Directorio…
      </p>
    );
  }
  if (estado.fase === "error") {
    return (
      <p role="status" className={`${caja} bg-[var(--data-warning-500)]/12 text-[var(--data-warning-ink)]`}>
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
        {estado.mensaje}
      </p>
    );
  }
  const { sistema } = estado.respuesta;
  const propios = aplicados.filter((a) => a.origen.fuente !== "externo");
  const frases = resumenDeRelleno(propios, fechaCorta);
  const ultima = sistema.ultimaGuia;
  const texto = frases.length
    ? frases.join(" ")
    : sistema.encontrado
      ? `Ya estaba completo${ultima ? ` · la última vez: ${describirOrigen(ultima)}${ultima.fecha ? ` del ${fechaCorta(ultima.fecha)}` : ""}` : ""}.`
      : "No aparece en tus guías ni en el Directorio.";
  return (
    <div role="status" className={`${caja} bg-[var(--surface-sunken)] text-[var(--text-secondary)]`}>
      <span className="flex min-w-0 items-start gap-1.5">
        {sistema.encontrado ? (
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-success-ink)]" aria-hidden />
        ) : (
          <Search className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
        )}
        <span className="min-w-0 break-words">{texto}</span>
      </span>
      <TrozoSunarp respuesta={estado.respuesta} marcaPuesta={aplicados.some((a) => a.origen.fuente === "externo")} />
    </div>
  );
}

/**
 * Placa del vehículo + «Buscar». Devuelve DOS celdas de la grilla: el campo
 * (`span`) y, debajo y a lo ancho, la línea con lo que se encontró.
 */
export function PlacaDelVehiculo({ datos, set, span }: { datos: GtfDatos; set: PonerSeccion; span: CampoSpan }) {
  const { estado, buscar } = useBuscarPlaca();
  const [aplicados, setAplicados] = useState<{ placa: string; lista: DatoAplicado[] }>({ placa: "", lista: [] });
  /* La respuesta vuelve después de hasta 8 s: se aplica sobre la guía de ESE
     momento (lo que se tipeó mientras tanto no se pisa), no la del clic. */
  const datosRef = useRef(datos);
  useEffect(() => {
    datosRef.current = datos;
  });

  const lectura = leerPlaca(datos.vehiculo.placa);
  const actual = lectura.estado === "valida" ? lectura.normalizada : "";

  async function alBuscar() {
    if (lectura.estado !== "valida") return;
    const placa = lectura.normalizada;
    const r = await buscar(placa);
    // Si en el medio se cambió la placa, lo encontrado es de otro camión.
    if (!r || normalizarPlacaPeru(datosRef.current.vehiculo.placa) !== placa) return;
    const rel = rellenarDesdePlaca(datosRef.current, r.sistema, r.externo);
    if (Object.keys(rel.vehiculo).length) set("vehiculo", rel.vehiculo);
    if (Object.keys(rel.transportista).length) set("transportista", rel.transportista);
    setAplicados({ placa, lista: rel.aplicados });
  }

  const buscando = estado.fase === "buscando";
  const deEstaPlaca = estado.fase !== "quieto" && estado.placa === actual;
  return (
    <>
      <CampoPlaca
        label="Placa"
        required
        span={span}
        valor={datos.vehiculo.placa}
        onCambio={(v) => set("vehiculo", { placa: v })}
        onRemolque={(r) => set("vehiculo", { placaRemolque: r })}
        accion={
          /* Sólo el ícono: el campo va en un tercio de la fila (con «Buscar»
             escrito, los rótulos de Modo y Tipo se cortaban a 1280). */
          <Btn
            variant="secondary"
            className="w-11 shrink-0 px-0!"
            aria-label="Buscar placa"
            disabled={!actual || buscando}
            title={actual ? "Buscar placa: trae el tipo, el transportista y el conductor de tus guías" : `Buscar placa: escribe una placa completa (ej. ${EJEMPLO_PLACA})`}
            onClick={() => void alBuscar()}
          >
            {buscando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
          </Btn>
        }
      />
      {deEstaPlaca && <LineaDeBusqueda estado={estado} aplicados={aplicados.placa === actual ? aplicados.lista : []} />}
    </>
  );
}

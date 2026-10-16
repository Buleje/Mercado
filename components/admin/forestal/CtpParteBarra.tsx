"use client";

/**
 * CtpParteBarra — la libreta encima de los campos de una parte de la guía (ADR-317).
 *
 * Tres gestos, en el orden en que se usan de verdad:
 *   1. **Elegir de la libreta** — el 90% de los viajes son al mismo comprador con
 *      el mismo camión. Se elige de una lista ordenada por uso y se llenan los
 *      cuatro campos de una.
 *   2. **Traer de SUNAT/RENIEC** — la primera vez que aparece alguien: se tipea el
 *      RUC/DNI y el nombre y la dirección vienen del padrón, sin typos.
 *   3. **Guardar en la libreta** — para que la próxima vez sea el gesto 1.
 *
 * «Libreta» abre una ventana (`LibretaModal`, Brandon 15-10-2026) para elegir o
 * agregar uno nuevo sin salir de la guía. Va con `aboveModals`: Escape cierra
 * sólo la libreta. Antes era una lista desplegable dentro del bloque porque dos
 * capas sin ese soporte hacían que Escape cerrara la guía.
 */

import { useMemo, useState } from "react";
import { Users, Check, Download, Loader2, Plus } from "@buleje/design-system/icons";
import {
  ROL_LABEL,
  faltantesParaGuia,
  fuenteAutocompletado,
  motivoDocInvalido,
  normalizarDocumento,
  type DocTipo,
  type Parte,
  type ParteInput,
  type RolParte,
} from "@/lib/forestal/directorio";
import { consultarDocumento } from "@/hooks/use-directorio-forestal";
import LibretaModal from "./LibretaModal";
import { Btn } from "./ctp-shared";

/** Los campos de la guía que esta barra sabe completar. */
export interface ValorParte {
  nombre: string;
  docTipo: DocTipo;
  docNumero: string;
  direccion: string;
  /** Casilleros (17)(18)(19) / (26)(27)(28) del formato. */
  departamento?: string;
  provincia?: string;
  distrito?: string;
  /** Sólo transportista. */
  registroMtc?: string;
}

interface Props {
  rol: RolParte;
  valor: ValorParte;
  /** Lista de la libreta para ESTE rol, ya ordenada por uso. */
  opciones: Parte[];
  /**
   * Las demás partes de la libreta — las que todavía NO tienen este papel.
   *
   * Medido en el tenant de Blas (2026-09-15): 5 partes cargadas y **cero** con
   * rol `destinatario`, así que el botón «Libreta» del destinatario aparecía
   * apagado teniendo la libreta llena y había que ir a Gestión → Directorio a
   * marcarle el rol. Se ofrecen abajo, separadas, y elegir una le suma el papel.
   */
  otras?: Parte[];
  onAplicar: (v: Partial<ValorParte>) => void;
  /** Se llama al elegir de la libreta: el consumidor suma el uso al guardar. */
  onElegir?: (parte: Parte) => void;
  /** Alta rápida en la libreta con lo que ya está tipeado. */
  onGuardar?: (v: ValorParte, rol: RolParte) => Promise<void>;
  /** Le suma ESTE rol a una parte que ya está en la libreta con otro papel. */
  onSumarRol?: (parte: Parte, rol: RolParte) => Promise<void>;
  /**
   * Alta completa en el Directorio desde la ventana de la libreta (con el N° de
   * autorización, la licencia, el teléfono…). Devuelve la ficha guardada, que
   * se usa en la guía como si se hubiera elegido. Sin esto, «Agregar nuevo»
   * guarda por `onGuardar` sólo nombre, documento y dirección.
   */
  onCrear?: (input: ParteInput) => Promise<Parte>;
  /** El nombre del bloque en la ventana («Punto de partida»); por defecto, el papel. */
  titulo?: string;
}

export default function CtpParteBarra({
  rol,
  valor,
  opciones,
  otras = [],
  onAplicar,
  onElegir,
  onGuardar,
  onSumarRol,
  onCrear,
  titulo,
}: Props) {
  const [abierta, setAbierta] = useState(false);
  const [estado, setEstado] = useState<"idle" | "consultando" | "guardando">("idle");
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fuente = fuenteAutocompletado(valor.docTipo);
  const docNormalizado = normalizarDocumento(valor.docNumero);
  const docMalFormado = motivoDocInvalido(valor.docTipo, valor.docNumero);
  const puedeConsultar = Boolean(fuente) && !docMalFormado && docNormalizado.length > 0;
  const libretaVacia = opciones.length === 0 && otras.length === 0;
  const puedeAgregar = Boolean(onCrear || onGuardar);

  /** ¿Lo que hay tipeado ya está en la libreta? Se compara por documento. */
  const yaEstá = useMemo(
    () => opciones.some((p) => p.docNumero && p.docNumero === docNormalizado),
    [opciones, docNormalizado],
  );

  /**
   * Lo que le falta a la parte elegida para poder ir en la guía CON este papel
   * (`faltantesParaGuia`, el mismo juez que usa el Directorio). Se dice al
   * elegirla y no al imprimir: un destinatario sin documento se arregla acá, con
   * la libreta abierta, no cuando el camión ya está cargado.
   */
  function avisoDeFaltantes(p: Parte, prefijo: string): string {
    const faltan = faltantesParaGuia(p, rol);
    return faltan.length === 0
      ? `${prefijo}.`
      : `${prefijo}, pero para la guía le falta ${faltan.join(" y ")}: complétalo en los campos de abajo.`;
  }

  /** Le suma este papel a una parte que ya está en la libreta con otro. */
  async function usarConOtroRol(p: Parte) {
    usar(p);
    if (!onSumarRol) return;
    setEstado("guardando");
    try {
      await onSumarRol(p, rol);
      setAviso(avisoDeFaltantes(p, `${p.nombre} quedó en la libreta también como ${ROL_LABEL[rol].toLowerCase()}`));
    } catch (e) {
      /* El dato ya se copió a la guía: que no se haya podido guardar el rol no
         invalida el despacho, sólo significa que la próxima vez hay que
         volver a buscarlo en esta misma lista. */
      setError(`Se cargaron los datos, pero no se pudo guardar el papel de ${ROL_LABEL[rol].toLowerCase()}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setEstado("idle");
    }
  }

  function usar(p: Parte, prefijo = `${p.nombre} cargado desde la libreta`) {
    onAplicar({
      nombre: p.nombre,
      docTipo: p.docTipo ?? valor.docTipo,
      docNumero: p.docNumero ?? "",
      // Sólo la dirección: el ubigeo va en sus columnas. Con `direccionCompleta`
      // el distrito, la provincia y el departamento salían DOS veces en el punto
      // impreso («JR. X, Callería, …, UCAYALI, Callería, …, UCAYALI»).
      direccion: p.direccion ?? "",
      // La libreta ya las tiene separadas: aplanarlas dentro de `direccion` y
      // descartar las columnas dejaba los casilleros (17)-(19) y (26)-(28)
      // vacíos teniendo el dato a mano.
      departamento: p.region ?? "",
      provincia: p.provincia ?? "",
      distrito: p.distrito ?? "",
      ...(rol === "transportista" ? { registroMtc: p.registroMtc ?? "" } : {}),
    });
    onElegir?.(p);
    setAbierta(false);
    setAviso(avisoDeFaltantes(p, prefijo));
    setError(null);
  }

  /**
   * «Agregar nuevo» de la ventana: guarda en el Directorio y lo usa en la guía.
   * Con `onCrear` la ficha entra completa y se usa como si se hubiera elegido;
   * sin él, `onGuardar` guarda lo básico y se aplica lo escrito. Si no se pudo
   * guardar, tira: la ventana queda abierta con el motivo.
   */
  async function agregarNueva(input: ParteInput, v: ValorParte) {
    if (onCrear) {
      const parte = await onCrear(input);
      usar(parte, `${parte.nombre} quedó en la libreta y en la guía`);
      return;
    }
    if (!onGuardar) return;
    await onGuardar(v, rol);
    onAplicar(v);
    setAbierta(false);
    setAviso(`${v.nombre} quedó en la libreta y en la guía.`);
    setError(null);
  }

  async function traerDelPadron() {
    setEstado("consultando");
    setAviso(null);
    setError(null);
    try {
      const datos = await consultarDocumento(valor.docTipo, valor.docNumero);
      if (!datos) {
        setError(`No se encontró el ${valor.docTipo} en ${fuente}. Cárgalo a mano.`);
        return;
      }
      onAplicar({
        nombre: datos.nombre,
        direccion: [datos.direccion, datos.distrito, datos.provincia, datos.region].filter(Boolean).join(", "),
      });
      setAviso(
        datos.estado && datos.estado.toUpperCase() !== "ACTIVO"
          ? `${datos.nombre} — ojo: SUNAT lo marca ${datos.estado}.`
          : `${datos.nombre}, traído de ${fuente}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEstado("idle");
    }
  }

  async function guardarEnLibreta() {
    if (!onGuardar) return;
    setEstado("guardando");
    setAviso(null);
    setError(null);
    try {
      await onGuardar(valor, rol);
      setAviso(`${valor.nombre} quedó en la libreta como ${ROL_LABEL[rol].toLowerCase()}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEstado("idle");
    }
  }

  return (
    <div className="mb-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Btn
          size="sm"
          variant="secondary"
          className="max-sm:h-12"
          onClick={() => setAbierta(true)}
          aria-haspopup="dialog"
          /* Apagado sólo si no hay a quién ofrecer NI cómo agregar: con la
             libreta vacía la ventana abre directo en «Agregar nuevo». */
          disabled={libretaVacia && !puedeAgregar}
          title={
            libretaVacia
              ? puedeAgregar
                ? "La libreta está vacía: agrega el primero"
                : "Todavía no hay nadie en la libreta"
              : opciones.length === 0
                ? `Nadie está guardado como ${ROL_LABEL[rol].toLowerCase()}, pero hay ${otras.length} con otro papel`
                : undefined
          }
        >
          <Users className="h-4 w-4" />
          Libreta
          <span className="rounded bg-[var(--surface-raised)]/60 px-1.5 font-mono text-xs tabular-nums">
            {opciones.length}
          </span>
        </Btn>

        {fuente && (
          <Btn size="sm" variant="secondary" disabled={!puedeConsultar || estado !== "idle"} onClick={() => void traerDelPadron()}>
            {estado === "consultando" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Traer de {fuente}
          </Btn>
        )}

        {onGuardar && valor.nombre.trim().length > 1 && (
          <Btn size="sm" variant="secondary" disabled={estado !== "idle"} onClick={() => void guardarEnLibreta()}>
            {estado === "guardando" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : yaEstá ? (
              <Check className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {yaEstá ? "Actualizar en la libreta" : "Guardar en la libreta"}
          </Btn>
        )}
      </div>

      {abierta && (
        <LibretaModal
          rol={rol}
          titulo={titulo}
          opciones={opciones}
          otras={otras}
          borrador={valor}
          conExtras={Boolean(onCrear)}
          puedeAgregar={puedeAgregar}
          onUsar={(p) => usar(p)}
          onUsarConOtroRol={(p) => void usarConOtroRol(p)}
          onAgregar={agregarNueva}
          onCerrar={() => setAbierta(false)}
        />
      )}

      {docMalFormado && docNormalizado.length > 0 && (
        <p className="mt-2 text-sm font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{docMalFormado}</p>
      )}
      {aviso && <p className="mt-2 text-sm font-medium text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">{aviso}</p>}
      {error && <p className="mt-2 text-sm font-medium text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
    </div>
  );
}

/* El selector de placa vive en su archivo; se re-exporta para no tocar los imports. */
export { CtpVehiculoBarra } from "./CtpVehiculoBarra";

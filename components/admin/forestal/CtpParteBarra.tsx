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
 * capas sin ese soporte hacían que Escape cerrara la guía. Desde el 16-10 la
 * ventana muestra la libreta entera por categorías, con la ficha al lado.
 */

import { useMemo, useState } from "react";
import { Users, Check, Download, Loader2, Plus } from "@buleje/design-system/icons";
import {
  ROL_LABEL,
  fuenteAutocompletado,
  motivoDocInvalido,
  normalizarDocumento,
  type Parte,
  type ParteInput,
  type RolParte,
  type Vehiculo,
  type VehiculoInput,
} from "@/lib/forestal/directorio";
import { aLaGuia, avisoDeFaltantes, type ChoqueDeLocal, type GuardarEnLibreta, type ValorParte } from "@/lib/forestal/libreta";
import { consultarDocumento } from "@/hooks/use-directorio-forestal";
import LibretaModal from "./LibretaModal";
import AvisosDeBarra from "./ctp-parte-barra-avisos";
import { Btn } from "./ctp-shared";

/** Los campos de la guía que esta barra sabe completar (vive en `lib/forestal/libreta`). */
export type { ValorParte };

interface Props {
  rol: RolParte;
  valor: ValorParte;
  /** Lista de la libreta para ESTE rol, ya ordenada por uso. */
  opciones: Parte[];
  /**
   * Las demás partes de la libreta (sin este papel): elegir una se lo suma. Blas
   * (15-09) tenía 5 partes y cero destinatarios: el botón salía apagado.
   */
  otras?: Parte[];
  onAplicar: (v: Partial<ValorParte>) => void;
  /** Se llama al elegir de la libreta: el consumidor suma el uso al guardar. */
  onElegir?: (parte: Parte) => void;
  /** Alta rápida en la libreta con lo que ya está tipeado. */
  onGuardar?: GuardarEnLibreta;
  /** Le suma ESTE rol a una parte que ya está en la libreta con otro papel. */
  onSumarRol?: (parte: Parte, rol: RolParte) => Promise<void>;
  /**
   * Alta completa (y edición, con `id`) en el Directorio desde la ventana. Sin
   * esto, «Agregar nuevo» guarda por `onGuardar` lo escrito en el bloque.
   */
  onCrear?: (input: ParteInput & { id?: string }) => Promise<Parte>;
  /** El nombre del bloque en la ventana («Punto de partida»); por defecto, el papel. */
  titulo?: string;
  /** Los vehículos de la libreta: la ventana los muestra en su pestaña (y los edita con `onGuardarVehiculo`). */
  vehiculos?: Vehiculo[];
  onGuardarVehiculo?: (input: VehiculoInput & { id?: string }) => Promise<Vehiculo>;
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
  vehiculos,
  onGuardarVehiculo,
}: Props) {
  const [abierta, setAbierta] = useState(false);
  const [estado, setEstado] = useState<"idle" | "consultando" | "guardando">("idle");
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** El local choca con la ficha de su RUC: se pregunta antes de guardar (revisión 16-10). Vale mientras no cambie lo escrito. */
  const [choqueDe, setChoqueDe] = useState<{ c: ChoqueDeLocal; clave: string } | null>(null);
  const claveValor = `${valor.docNumero}|${valor.direccion}|${valor.autorizacion ?? ""}`;
  const choque = choqueDe?.clave === claveValor ? choqueDe.c : null;

  const fuente = fuenteAutocompletado(valor.docTipo);
  const docNormalizado = normalizarDocumento(valor.docNumero);
  const docMalFormado = motivoDocInvalido(valor.docTipo, valor.docNumero);
  const puedeConsultar = Boolean(fuente) && !docMalFormado && docNormalizado.length > 0;
  const libretaVacia = opciones.length === 0 && otras.length === 0;
  const puedeAgregar = Boolean(onCrear || onGuardar);

  /** La libreta entera para la ventana, y quiénes ya tienen este papel. */
  const todas = useMemo(() => {
    const ya = new Set(opciones.map((p) => p.id));
    return [...opciones, ...otras.filter((p) => !ya.has(p.id))];
  }, [opciones, otras]);
  const conPapel = useMemo(() => new Set(opciones.map((p) => p.id)), [opciones]);

  /** ¿Lo que hay tipeado ya está en la libreta? Se compara por documento. */
  const yaEstá = useMemo(
    () => opciones.some((p) => p.docNumero && p.docNumero === docNormalizado),
    [opciones, docNormalizado],
  );

  /** Le suma este papel a una parte que ya está en la libreta con otro. */
  async function usarConOtroRol(p: Parte) {
    usar(p);
    if (!onSumarRol) return;
    setEstado("guardando");
    try {
      await onSumarRol(p, rol);
      setAviso(avisoDeFaltantes(p, rol, `${p.nombre} quedó en la libreta también como ${ROL_LABEL[rol].toLowerCase()}`));
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
    const n = (x: string | null | undefined) => x ?? "";
    onAplicar(
      aLaGuia(
        { nombre: p.nombre, docTipo: p.docTipo ?? valor.docTipo, docNumero: n(p.docNumero), direccion: n(p.direccion), departamento: n(p.region), provincia: n(p.provincia), distrito: n(p.distrito), registroMtc: n(p.registroMtc) },
        rol,
      ),
    );
    onElegir?.(p);
    setAbierta(false);
    setAviso(avisoDeFaltantes(p, rol, prefijo));
    setError(null);
  }

  /**
   * «Agregar nuevo» de la ventana: guarda en el Directorio y lo usa en la guía.
   * Con `onCrear` la ficha entra completa y se usa como si se hubiera elegido;
   * sin él, `onGuardar` guarda lo básico y se aplica lo escrito. Si no se pudo
   * guardar, tira: la ventana queda abierta con el motivo.
   */
  async function agregarNueva(input: ParteInput, v: ValorParte): Promise<{ id: string } | void> {
    if (onCrear) {
      const parte = await onCrear(input);
      usar(parte, `${parte.nombre} quedó en la libreta y en la guía`);
      return parte;
    }
    if (!onGuardar) return;
    const c = await onGuardar(v, rol);
    if (c) throw new Error(`${c.existente.nombre} ya está en la libreta con otro dato (${c.tiene}): guárdalo con «Guardar en la libreta» del bloque.`);
    onAplicar(aLaGuia(v, rol));
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

  async function guardarEnLibreta(aparte = false) {
    if (!onGuardar) return;
    const de = choque?.existente.nombre;
    setEstado("guardando");
    setAviso(null);
    setError(null);
    setChoqueDe(null);
    try {
      const c = await onGuardar(valor, rol, aparte);
      if (c) setChoqueDe({ c, clave: claveValor });
      else setAviso(`${valor.nombre} quedó en la libreta como ${aparte && de ? `otro local de ${de}` : ROL_LABEL[rol].toLowerCase()}.`);
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
          bloque={{ tipo: "parte", rol }}
          titulo={titulo}
          partes={todas}
          conPapel={conPapel}
          vehiculos={vehiculos ?? null}
          borradorParte={valor}
          conExtras={Boolean(onCrear)}
          onUsarParte={(p, sumarRol) => (sumarRol ? void usarConOtroRol(p) : usar(p))}
          onAgregarParte={puedeAgregar ? agregarNueva : undefined}
          onEditarParte={onCrear}
          onEditarVehiculo={onGuardarVehiculo}
          onCerrar={() => setAbierta(false)}
        />
      )}

      <AvisosDeBarra
        docMalFormado={docNormalizado ? docMalFormado : null}
        aviso={aviso}
        error={error}
        choque={choque}
        ocupado={estado !== "idle"}
        onAparte={() => void guardarEnLibreta(true)}
        onCancelar={() => setChoqueDe(null)}
      />
    </div>
  );
}

/* El selector de placa vive en su archivo; se re-exporta para no tocar los imports. */
export { CtpVehiculoBarra } from "./CtpVehiculoBarra";

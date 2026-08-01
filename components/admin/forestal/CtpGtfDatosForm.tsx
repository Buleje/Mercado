"use client";

/**
 * CtpGtfDatosForm — los datos que la Guía de Transporte Forestal necesita para
 * poder viajar (D.S. 018-2015-MINAGRI art. 172; ver `ctp-gtf-datos.ts`).
 *
 * Hasta ahora la GTF de salida se emitía con el número y el producto: servía como
 * comprobante interno, pero en un puesto de control lo que se compara es la PLACA
 * contra la carga, quién es el destinatario y con qué título salió la madera. Nada
 * de eso se capturaba.
 *
 * El propietario del producto es un campo aparte del emisor a propósito: el
 * inciso d) del art. 172 contempla al propietario que NO es el titular del centro
 * de transformación. Por defecto es el CTP (el caso común) y se puede cambiar.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, FileDown, Loader2, Save } from "@buleje/design-system/icons";
import { faltantesGtf, leerGtfDatos, trasladoVigente, type GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import type { FichaCtp } from "@/hooks/use-ficha-ctp";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import type { Parte, RolParte } from "@/lib/forestal/directorio";
import CtpParteBarra, { CtpVehiculoBarra, type ValorParte } from "./CtpParteBarra";
import { Btn, Field, I } from "./ctp-shared";

/** Lo que el sistema completa solo la primera vez que se abre la guía. */
export interface AutoGtf {
  ficha: FichaCtp | null;
  /** El `destino` que ya tiene el despacho: sirve como punto de llegada. */
  destino?: string | null;
  /** Permiso CITES archivado en la Ficha para la especie, si aplica. */
  citesPermiso?: string | null;
  /** Fecha del despacho (`YYYY-MM-DD`) → arranque del traslado. */
  fechaDespacho?: string;
}

/** Secciones del formulario ↔ de qué `FaltanteGtf.seccion` se hace cargo cada una. */
const SECCIONES = [
  { id: "propietario", label: "Propietario", cubre: ["propietario"] },
  { id: "destinatario", label: "Destinatario", cubre: ["destinatario"] },
  { id: "transportista", label: "Transportista y vehículo", cubre: ["transportista", "vehiculo"] },
  { id: "traslado", label: "Traslado y títulos", cubre: ["traslado", "titulos"] },
] as const;

type SeccionId = (typeof SECCIONES)[number]["id"];
/** Claves de `GtfDatos` cuyo valor es un objeto plano — las que parchea `set`. */
type SeccionObjeto = "propietario" | "destinatario" | "transportista" | "vehiculo" | "traslado";
type DocTipo = GtfDatos["propietario"]["docTipo"];

const direccionDe = (f: FichaCtp | null) =>
  [f?.direccion, f?.distrito, f?.provincia, f?.region].filter(Boolean).join(", ");

export default function CtpGtfDatosForm({
  guardado,
  auto,
  onGuardar,
  onImprimir,
  imprimiendo,
}: {
  /** JSON crudo de la base: se lee con desconfianza (`leerGtfDatos` nunca tira). */
  guardado: unknown;
  auto: AutoGtf;
  onGuardar: (datos: GtfDatos) => Promise<boolean>;
  onImprimir: (datos: GtfDatos) => Promise<void>;
  imprimiendo?: boolean;
}) {
  const [datos, setDatos] = useState<GtfDatos>(() => leerGtfDatos(guardado));
  const [seccion, setSeccion] = useState<SeccionId>("propietario");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Por río se pide matrícula y embarcación; por carretera, placa y tipo. */
  const esFluvial = datos.vehiculo.modo === "fluvial";

  /** La libreta (ADR-317): quién ya viajó antes, para no re-tipear los 20 campos. */
  const directorio = useDirectorioForestal();
  /**
   * Qué se eligió de la libreta en ESTA guía. Se cuenta el uso recién al guardar:
   * abrir el desplegable y cambiar de idea no debería subir a nadie en el ranking.
   */
  const [usados, setUsados] = useState<{ partes: Set<string>; vehiculos: Set<string> }>(() => ({
    partes: new Set(),
    vehiculos: new Set(),
  }));

  const anotarParte = useCallback((p: Parte) => {
    setUsados((prev) => ({ partes: new Set(prev.partes).add(p.id), vehiculos: prev.vehiculos }));
  }, []);
  const anotarVehiculo = useCallback((id: string) => {
    setUsados((prev) => ({ partes: prev.partes, vehiculos: new Set(prev.vehiculos).add(id) }));
  }, []);

  /** Alta rápida desde la guía: lo tipeado acá pasa a la libreta con ese rol. */
  const guardarEnLibreta = useCallback(
    async (v: ValorParte, rol: RolParte) => {
      const parte = await directorio.guardarParte({
        roles: [rol],
        nombre: v.nombre,
        docTipo: v.docTipo,
        docNumero: v.docNumero,
        direccion: v.direccion,
        registroMtc: v.registroMtc,
      });
      anotarParte(parte);
    },
    [directorio, anotarParte],
  );

  /**
   * Primera apertura: se copia lo que el sistema ya sabe (identidad del CTP,
   * títulos, destino del despacho). Sólo si la guía está en blanco —una guía ya
   * cargada no se reescribe con la ficha de hoy— y campo por campo, para no pisar
   * lo que el operador haya tipeado.
   */
  useEffect(() => {
    const previo = leerGtfDatos(guardado);
    if (previo.propietario.nombre || previo.destinatario.nombre) return;
    const f = auto.ficha;
    const planta = direccionDe(f);
    setDatos((p) => ({
      ...p,
      propietario: {
        ...p.propietario,
        nombre: p.propietario.nombre || f?.razonSocial || f?.nombreCtp || "",
        docNumero: p.propietario.docNumero || f?.ruc || "",
        direccion: p.propietario.direccion || planta,
      },
      destinatario: { ...p.destinatario, nombre: p.destinatario.nombre || auto.destino || "" },
      traslado: {
        ...p.traslado,
        puntoPartida: p.traslado.puntoPartida || planta,
        puntoLlegada: p.traslado.puntoLlegada || auto.destino || "",
        fechaInicio: p.traslado.fechaInicio || auto.fechaDespacho || "",
      },
      titulos: p.titulos.length ? p.titulos : (f?.titulos ?? []).map((t) => t.codigo).filter(Boolean),
      citesPermiso: p.citesPermiso || auto.citesPermiso || "",
    }));
    // Sólo al montar: re-correr pisaría lo tipeado cuando cambia la ficha.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const faltan = useMemo(() => faltantesGtf(datos), [datos]);
  const vigente = useMemo(() => trasladoVigente(datos, new Date()), [datos]);

  /** Parche superficial de una sección; el resto de los campos no se toca. */
  function set<K extends SeccionObjeto>(k: K, v: Partial<GtfDatos[K]>) {
    setDatos((p) => ({ ...p, [k]: { ...p[k], ...v } }));
  }

  /** El CTP como propietario: su identidad de la Ficha. Destildar limpia, para que
   *  no quede el RUC del CTP a nombre de un tercero. */
  function marcarPropietarioCtp(esElCtp: boolean) {
    const f = auto.ficha;
    set(
      "propietario",
      esElCtp
        ? {
            esElCtp,
            nombre: f?.razonSocial || f?.nombreCtp || "",
            docTipo: "RUC",
            docNumero: f?.ruc ?? "",
            direccion: direccionDe(f),
          }
        : { esElCtp, nombre: "", docNumero: "", direccion: "" },
    );
  }

  async function guardar() {
    setGuardando(true);
    setAviso(null);
    setError(null);
    const ok = await onGuardar(datos);
    setGuardando(false);
    if (!ok) return;
    setAviso("Datos de la guía guardados.");
    // La guía quedó: recién ahí sube el ranking de la libreta.
    if (usados.partes.size || usados.vehiculos.size) {
      directorio.marcarUso({ partes: [...usados.partes], vehiculos: [...usados.vehiculos] });
    }
  }

  async function imprimir() {
    setAviso(null);
    setError(null);
    try {
      await onImprimir(datos);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-3">
      {/* Qué le falta a la guía para poder viajar. */}
      <div
        className={`rounded-xl border-2 p-3 ${
          faltan.length === 0
            ? "border-[var(--data-success-500)]/40 bg-[var(--data-success-50)]"
            : "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)]"
        }`}
      >
        {faltan.length === 0 ? (
          <p className="flex items-center gap-2 text-sm font-bold text-[var(--data-success-700)]">
            <Check className="h-4 w-4 shrink-0" /> La guía está completa: se puede imprimir el original y las dos copias.
          </p>
        ) : (
          <>
            <p className="flex items-center gap-2 text-sm font-bold text-[var(--data-warning-700)]">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Falta{faltan.length === 1 ? "" : "n"} {faltan.length} dato{faltan.length === 1 ? "" : "s"} para poder imprimirla
            </p>
            <ul className="mt-1 space-y-0.5 text-sm text-[var(--text-secondary)]">
              {faltan.map((f) => (
                <li key={f.campo}>
                  <strong className="text-[var(--text-primary)]">{f.campo}</strong> — {f.motivo}
                </li>
              ))}
            </ul>
          </>
        )}
        {/* `-700` no llega a AA sobre el canvas dark: en dark se usa `-500`. */}
        {vigente === false && (
          <p className="mt-1.5 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            La vigencia venció el {datos.traslado.fechaFin}: actualizá las fechas antes de mover el producto.
          </p>
        )}
      </div>

      {/* Cuatro pasos cortos en vez de veinte campos de una. */}
      <div className="flex flex-wrap gap-1.5">
        {SECCIONES.map((s) => {
          const conFalta = faltan.some((f) => (s.cubre as readonly string[]).includes(f.seccion));
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={seccion === s.id}
              onClick={() => setSeccion(s.id)}
              className={`inline-flex h-10 items-center gap-1.5 rounded-lg border-2 px-3 text-sm font-bold transition-colors ${
                seccion === s.id
                  ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
              }`}
            >
              {s.label}
              {conFalta && (
                <span className="h-2 w-2 rounded-full bg-[var(--data-warning-500)]" aria-label="tiene datos pendientes" />
              )}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
        {seccion === "propietario" && (
          <div className="space-y-3">
            <label className="flex items-start gap-2 text-sm font-medium text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={datos.propietario.esElCtp}
                onChange={(e) => marcarPropietarioCtp(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--brand-ink)]"
              />
              <span>
                El dueño de la madera es este CTP
                <span className="mt-0.5 block font-normal text-[var(--text-tertiary)]">
                  Si la madera es de un tercero (el CTP sólo la transformó), destildá y cargá sus datos: la norma
                  distingue al propietario del producto del titular del centro.
                </span>
              </span>
            </label>
            {/* La libreta sólo tiene sentido cuando la madera es de un tercero:
                si el dueño es el CTP, sus datos ya vienen de la Ficha. */}
            {!datos.propietario.esElCtp && (
              <CtpParteBarra
                rol="proveedor"
                valor={datos.propietario}
                opciones={directorio.porRol("proveedor")}
                onAplicar={(v) => set("propietario", v)}
                onElegir={anotarParte}
                onGuardar={guardarEnLibreta}
              />
            )}
            <ParteCampos
              etiquetaNombre="Propietario del producto"
              parte={datos.propietario}
              onChange={(v) => set("propietario", v)}
            />
          </div>
        )}

        {seccion === "destinatario" && (
          <>
            <CtpParteBarra
              rol="destinatario"
              valor={datos.destinatario}
              opciones={directorio.porRol("destinatario")}
              onAplicar={(v) => set("destinatario", v)}
              onElegir={anotarParte}
              onGuardar={guardarEnLibreta}
            />
            <ParteCampos
              etiquetaNombre="Destinatario"
              direccionRequerida
              parte={datos.destinatario}
              onChange={(v) => set("destinatario", v)}
            />
          </>
        )}

        {seccion === "transportista" && (
          <div className="space-y-3">
            <CtpParteBarra
              rol="transportista"
              valor={datos.transportista}
              opciones={directorio.porRol("transportista")}
              onAplicar={(v) => set("transportista", v)}
              onElegir={anotarParte}
              onGuardar={guardarEnLibreta}
            />
            <ParteCampos
              etiquetaNombre="Transportista"
              parte={datos.transportista}
              onChange={(v) => set("transportista", v)}
              extra={
                <Field label="Registro MTC" hint="Si es empresa de transporte">
                  <input
                    type="text"
                    className={I}
                    value={datos.transportista.registroMtc}
                    onChange={(e) => set("transportista", { registroMtc: e.target.value })}
                  />
                </Field>
              }
            />
            <div className="grid gap-3 border-t-2 border-[var(--rule-soft)] pt-3 sm:grid-cols-3">
              <CtpVehiculoBarra
                vehiculos={directorio.vehiculosActivos}
                onAplicar={(v) => set("vehiculo", v)}
                onElegir={anotarVehiculo}
              />
              {/* Acá la selva manda: buena parte de la madera sale por río, y
                  un control fluvial no busca una placa. El modo cambia lo que se
                  pide, en vez de obligar al operador a inventar un dato. */}
              <Field label="Modo de transporte" hint="Por río, por carretera o combinado">
                <select
                  className={I}
                  value={datos.vehiculo.modo}
                  onChange={(e) => set("vehiculo", { modo: e.target.value as "terrestre" | "fluvial" | "multimodal" })}
                >
                  <option value="terrestre">Terrestre</option>
                  <option value="fluvial">Fluvial</option>
                  <option value="multimodal">Multimodal (río + carretera)</option>
                </select>
              </Field>
              <Field
                label={esFluvial ? "Matrícula" : "Placa"}
                required
                hint={esFluvial ? "La de la embarcación" : "Lo primero que compara un control"}
              >
                <input
                  type="text"
                  className={`${I} font-mono uppercase`}
                  value={datos.vehiculo.placa}
                  onChange={(e) => set("vehiculo", { placa: e.target.value.toUpperCase() })}
                />
              </Field>
              <Field label="Marca">
                <input type="text" className={I} value={datos.vehiculo.marca} onChange={(e) => set("vehiculo", { marca: e.target.value })} />
              </Field>
              {esFluvial ? (
                <Field label="Nombre de la embarcación" required hint="Así se la identifica en el control">
                  <input type="text" className={I} value={datos.vehiculo.embarcacion} onChange={(e) => set("vehiculo", { embarcacion: e.target.value })} placeholder="Chata Doña Rosa" />
                </Field>
              ) : (
                <Field label="Tipo de vehículo" hint="Camión, tráiler…">
                  <input type="text" className={I} value={datos.vehiculo.tipo} onChange={(e) => set("vehiculo", { tipo: e.target.value })} />
                </Field>
              )}
              {/* El chofer se elige aparte del transportista: en la selva es
                  común que la empresa ponga el camión y el chofer sea otro. Al
                  elegirlo de la libreta viene con su licencia, que es lo que
                  pide el puesto de control. */}
              <div className="sm:col-span-3">
                <CtpParteBarra
                  rol="conductor"
                  valor={{
                    nombre: datos.vehiculo.conductor,
                    docTipo: "DNI",
                    docNumero: datos.vehiculo.conductorDni,
                    direccion: "",
                  }}
                  opciones={directorio.porRol("conductor")}
                  onAplicar={(v) =>
                    set("vehiculo", {
                      ...(v.nombre === undefined ? {} : { conductor: v.nombre }),
                      ...(v.docNumero === undefined ? {} : { conductorDni: v.docNumero }),
                    })
                  }
                  onElegir={(p) => {
                    anotarParte(p);
                    if (p.licencia) set("vehiculo", { licencia: p.licencia });
                  }}
                  onGuardar={async (v) => {
                    const parte = await directorio.guardarParte({
                      roles: ["conductor"],
                      nombre: v.nombre,
                      docTipo: "DNI",
                      docNumero: v.docNumero,
                      // La licencia es el dato que hace útil a un conductor en la
                      // libreta: se guarda con él, no se pierde al cerrar la guía.
                      licencia: datos.vehiculo.licencia,
                    });
                    anotarParte(parte);
                  }}
                />
              </div>
              {/* Por río el responsable es el PATRÓN. El faltante ya lo llama así:
                  si el campo dijera otra cosa, el aviso mandaría a buscar algo que
                  no existe en pantalla. */}
              <Field label={esFluvial ? "Patrón de la embarcación" : "Conductor"} required>
                <input type="text" className={I} value={datos.vehiculo.conductor} onChange={(e) => set("vehiculo", { conductor: e.target.value })} />
              </Field>
              <Field label={esFluvial ? "DNI del patrón" : "DNI del conductor"}>
                <input type="text" className={`${I} font-mono`} value={datos.vehiculo.conductorDni} onChange={(e) => set("vehiculo", { conductorDni: e.target.value })} />
              </Field>
              <Field label={esFluvial ? "Licencia de navegación" : "Licencia de conducir"}>
                <input type="text" className={`${I} font-mono`} value={datos.vehiculo.licencia} onChange={(e) => set("vehiculo", { licencia: e.target.value })} />
              </Field>
            </div>
          </div>
        )}

        {seccion === "traslado" && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Punto de partida" required>
                <input type="text" className={I} value={datos.traslado.puntoPartida} onChange={(e) => set("traslado", { puntoPartida: e.target.value })} />
              </Field>
              <Field label="Punto de llegada" required>
                <input type="text" className={I} value={datos.traslado.puntoLlegada} onChange={(e) => set("traslado", { puntoLlegada: e.target.value })} />
              </Field>
              {/* La ruta a lo ancho: así las dos fechas quedan lado a lado abajo. */}
              <div className="sm:col-span-2">
                <Field label="Ruta declarada" hint="Los puestos de control la cotejan">
                  <input type="text" className={I} value={datos.traslado.ruta} onChange={(e) => set("traslado", { ruta: e.target.value })} />
                </Field>
              </div>
              {/* Cada fecha ocupa su propia celda: en una sub-grilla el `input[type=date]`
                  quedaba tan angosto que recortaba el año. */}
              <Field label="Inicio del traslado" required>
                <input type="date" className={I} value={datos.traslado.fechaInicio} onChange={(e) => set("traslado", { fechaInicio: e.target.value })} />
              </Field>
              <Field label="Vigencia hasta" hint="La fija la ARFFS por ruta y distancia">
                <input type="date" className={I} value={datos.traslado.fechaFin} onChange={(e) => set("traslado", { fechaFin: e.target.value })} />
              </Field>
            </div>
            <div className="grid gap-3 border-t-2 border-[var(--rule-soft)] pt-3 sm:grid-cols-2">
              <Field label="Títulos habilitantes" required hint="Separá con coma. Acreditan el origen legal de la madera">
                <input
                  type="text"
                  className={I}
                  value={datos.titulos.join(", ")}
                  onChange={(e) =>
                    setDatos((p) => ({
                      ...p,
                      titulos: e.target.value.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 10),
                    }))
                  }
                />
              </Field>
              <Field label="N° de permiso CITES" hint="Si la especie es protegida — es legal CON permiso">
                <input type="text" className={I} value={datos.citesPermiso} onChange={(e) => setDatos((p) => ({ ...p, citesPermiso: e.target.value }))} />
              </Field>
              {/* La GTF ampara el TRASLADO; la factura, la operación. Van juntas
                  en el control y hasta ahora el número sólo vivía en observaciones. */}
              <Field label="Comprobante de venta" hint="El que ampara la operación, si ya se emitió">
                <select
                  className={I}
                  value={datos.comprobante.tipo}
                  onChange={(e) =>
                    setDatos((p) => ({ ...p, comprobante: { ...p.comprobante, tipo: e.target.value as GtfDatos["comprobante"]["tipo"] } }))
                  }
                >
                  <option value="ninguno">Sin comprobante todavía</option>
                  <option value="factura">Factura</option>
                  <option value="boleta">Boleta</option>
                  <option value="guia_remision">Guía de remisión</option>
                  <option value="otro">Otro</option>
                </select>
              </Field>
              {datos.comprobante.tipo !== "ninguno" && (
                <Field label="N° del comprobante">
                  <input
                    type="text"
                    className={`${I} font-mono`}
                    value={datos.comprobante.numero}
                    placeholder="F001-00001234"
                    onChange={(e) => setDatos((p) => ({ ...p, comprobante: { ...p.comprobante, numero: e.target.value } }))}
                  />
                </Field>
              )}
              <Field label="Observaciones">
                <input type="text" className={I} value={datos.observaciones} onChange={(e) => setDatos((p) => ({ ...p, observaciones: e.target.value }))} />
              </Field>
            </div>
          </div>
        )}
      </div>

      {aviso && (
        <p role="status" className="rounded-xl border-2 border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] p-2.5 text-sm font-bold text-[var(--data-success-700)]">
          {aviso}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl border-2 border-[var(--data-error-500)]/40 bg-[var(--surface-sunken)] p-2.5 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--text-tertiary)]">
          Sale en original y dos copias, como manda la RDE 122-2015 (art. 5).
        </p>
        <div className="flex gap-2">
          <Btn variant="secondary" disabled={guardando} onClick={() => void guardar()}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {guardando ? "Guardando…" : "Guardar datos"}
          </Btn>
          <Btn variant="dark" disabled={faltan.length > 0 || imprimiendo} onClick={() => void imprimir()}>
            {imprimiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            Imprimir guía (3 copias)
          </Btn>
        </div>
      </div>
    </div>
  );
}

/** Identidad de una parte que interviene en el traslado (nombre + documento + dirección). */
function ParteCampos({
  etiquetaNombre,
  parte,
  onChange,
  direccionRequerida,
  extra,
}: {
  etiquetaNombre: string;
  parte: { nombre: string; docTipo: DocTipo; docNumero: string; direccion: string };
  onChange: (v: { nombre?: string; docTipo?: DocTipo; docNumero?: string; direccion?: string }) => void;
  direccionRequerida?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {/* Nombre y dirección a lo ancho: una razón social entra completa y la
          etiqueta no envuelve (envolviendo, el asterisco quedaba huérfano). */}
      <Field label={etiquetaNombre} required>
        <input type="text" className={I} value={parte.nombre} onChange={(e) => onChange({ nombre: e.target.value })} />
      </Field>
      <Field
        label="Dirección"
        required={direccionRequerida}
        hint={direccionRequerida ? "Es el punto de llegada que cotejan los controles" : undefined}
      >
        <input type="text" className={I} value={parte.direccion} onChange={(e) => onChange({ direccion: e.target.value })} />
      </Field>
      <Field label="Tipo de documento">
        <select className={I} value={parte.docTipo} onChange={(e) => onChange({ docTipo: e.target.value as DocTipo })}>
          {(["RUC", "DNI", "CE", "PASAPORTE"] as const).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="N° de documento">
        <input type="text" className={`${I} font-mono`} value={parte.docNumero} onChange={(e) => onChange({ docNumero: e.target.value })} />
      </Field>
      {extra}
    </div>
  );
}

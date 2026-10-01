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
 * Es una barra y no un modal a propósito: el formulario de la guía ya vive dentro
 * de un modal, y anidar dos capas bloqueantes hace que Escape cierre la de abajo.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Users,
  Check,
  ChevronDown,
  Download,
  Loader2,
  Plus,
  Search,
} from "@buleje/design-system/icons";
import {
  ROL_LABEL,
  direccionCompleta,
  faltantesParaGuia,
  filtrarPartes,
  formatearPlaca,
  fuenteAutocompletado,
  motivoDocInvalido,
  normalizarDocumento,
  type DocTipo,
  type Parte,
  type RolParte,
} from "@/lib/forestal/directorio";
import { consultarDocumento } from "@/hooks/use-directorio-forestal";
import { Btn, I } from "./ctp-shared";

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
}: Props) {
  const [abierta, setAbierta] = useState(false);
  const [q, setQ] = useState("");
  const buscador = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<"idle" | "consultando" | "guardando">("idle");
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // El foco va al buscador al desplegar: es lo único que se hace ahí. Con `ref`
  // y no `autoFocus` porque el atributo enfoca también en el primer render, y
  // jsx-a11y lo marca por eso mismo.
  useEffect(() => {
    if (abierta) buscador.current?.focus();
  }, [abierta]);

  const filtradas = useMemo(() => filtrarPartes(opciones, q).slice(0, 40), [opciones, q]);
  const filtradasOtras = useMemo(() => filtrarPartes(otras, q).slice(0, 20), [otras, q]);
  const fuente = fuenteAutocompletado(valor.docTipo);
  const docNormalizado = normalizarDocumento(valor.docNumero);
  const docMalFormado = motivoDocInvalido(valor.docTipo, valor.docNumero);
  const puedeConsultar = Boolean(fuente) && !docMalFormado && docNormalizado.length > 0;

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

  function usar(p: Parte) {
    onAplicar({
      nombre: p.nombre,
      docTipo: p.docTipo ?? valor.docTipo,
      docNumero: p.docNumero ?? "",
      direccion: direccionCompleta(p),
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
    setQ("");
    setAviso(avisoDeFaltantes(p, `${p.nombre} cargado desde la libreta`));
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
          variant={abierta ? "dark" : "secondary"}
          onClick={() => setAbierta((v) => !v)}
          aria-expanded={abierta}
          /* Apagado sólo si la libreta entera está vacía. Antes se apagaba
             cuando no había nadie con ESTE papel, y con 5 partes cargadas y 0
             destinatarios el botón quedaba muerto teniendo a quién ofrecer. */
          disabled={opciones.length === 0 && otras.length === 0}
          title={
            opciones.length === 0 && otras.length === 0
              ? "Todavía no hay nadie en la libreta"
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
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${abierta ? "rotate-180" : ""}`} />
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
        <div className="mt-2 space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              ref={buscador}
              type="text"
              className={`${I} pl-9`}
              placeholder={`Buscar ${ROL_LABEL[rol].toLowerCase()} por nombre o documento…`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {filtradas.length === 0 && filtradasOtras.length === 0 ? (
            <p className="rounded-lg bg-[var(--surface-raised)] px-3 py-3 text-center text-sm text-[var(--text-tertiary)]">
              {q ? `Nadie coincide con “${q}”.` : "La libreta está vacía."}
            </p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {filtradas.map((p) => (
                <li key={p.id}>
                  <FilaDeParte parte={p} rol={rol} onUsar={() => usar(p)} />
                </li>
              ))}
              {filtradasOtras.length > 0 && (
                <>
                  <li className="px-1 pt-2">
                    <p className="text-xs font-bold text-[var(--text-secondary)]">
                      También en tu libreta, con otro papel
                    </p>
                    <p className="text-xs text-[var(--text-tertiary)]">
                      Elegir a uno le suma el papel de {ROL_LABEL[rol].toLowerCase()}: la próxima vez sale arriba.
                    </p>
                  </li>
                  {filtradasOtras.map((p) => (
                    <li key={p.id}>
                      <FilaDeParte parte={p} rol={rol} otroPapel onUsar={() => void usarConOtroRol(p)} />
                    </li>
                  ))}
                </>
              )}
            </ul>
          )}
        </div>
      )}

      {docMalFormado && docNormalizado.length > 0 && (
        <p className="mt-2 text-sm font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{docMalFormado}</p>
      )}
      {aviso && <p className="mt-2 text-sm font-medium text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">{aviso}</p>}
      {error && <p className="mt-2 text-sm font-medium text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
    </div>
  );
}

/** Una fila de la libreta, con lo que le falta para poder ir en la guía. */
function FilaDeParte({
  parte,
  rol,
  otroPapel,
  onUsar,
}: {
  parte: Parte;
  rol: RolParte;
  /** Está guardada con OTRO papel: elegirla se lo suma. */
  otroPapel?: boolean;
  onUsar: () => void;
}) {
  const faltan = faltantesParaGuia(parte, rol);
  return (
    <button
      type="button"
      onClick={onUsar}
      className="flex w-full items-center gap-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-1.5 min-h-10 text-left transition-colors hover:border-[var(--accent)] hover:bg-primary/5"
    >
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{parte.nombre}</span>
        <span className="block truncate text-xs text-[var(--text-tertiary)]">
          {[
            otroPapel ? parte.roles.map((r) => ROL_LABEL[r]).join(", ") : null,
            parte.docNumero ? `${parte.docTipo} ${parte.docNumero}` : null,
            direccionCompleta(parte) || null,
          ]
            .filter(Boolean)
            .join(" · ") || "Sin documento cargado"}
        </span>
        {/* Lo que le falta para la guía se ve ANTES de elegirlo: si no, se
            descubre recién al imprimir, con el camión cargado. */}
        {faltan.length > 0 && (
          <span className="mt-0.5 block truncate text-xs font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            Para la guía le falta {faltan.join(" y ")}
          </span>
        )}
      </div>
      {parte.usos > 0 && (
        <span className="shrink-0 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-bold tabular-nums text-[var(--text-tertiary)]">
          {parte.usos}×
        </span>
      )}
    </button>
  );
}

/**
 * Selector de placa. El vehículo no es una "parte" (no tiene documento ni
 * dirección), pero se elige en el mismo paso que el transportista, así que vive
 * al lado. Elegir una placa completa además marca, tipo y —si el vehículo tiene
 * dueño cargado— deja al transportista listo para copiarse.
 *
 * Con la lista vacía ya NO desaparece: hasta 2026-09-15 se auto-ocultaba, así
 * que el único camino para guardar un camión era ir a Gestión → Directorio y
 * volver. En el tenant de Blas había **cero** vehículos cargados, o sea que la
 * barra nunca se dibujó: ahora ofrece crearlo desde la propia guía.
 */
export function CtpVehiculoBarra({
  vehiculos,
  onAplicar,
  onElegir,
  onCrear,
}: {
  vehiculos: { id: string; placa: string; marca: string | null; tipo: string | null; transportistaNombre: string | null; usos: number }[];
  onAplicar: (v: { placa: string; marca: string; tipo: string }) => void;
  onElegir?: (id: string) => void;
  /** Abre el alta de vehículo sin salir de la guía. */
  onCrear?: () => void;
}) {
  const [abierta, setAbierta] = useState(false);
  if (vehiculos.length === 0) {
    return onCrear ? (
      <div className="sm:col-span-3">
        <Btn size="sm" variant="secondary" onClick={onCrear}>
          <Plus className="h-4 w-4" />
          Guardar esta placa en el directorio
        </Btn>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
          Todavía no hay camiones guardados. El que cargues acá se te va a ofrecer en la próxima guía.
        </p>
      </div>
    ) : null;
  }

  return (
    <div className="sm:col-span-3">
      <div className="flex flex-wrap items-center gap-2">
        <Btn size="sm" variant={abierta ? "dark" : "secondary"} onClick={() => setAbierta((v) => !v)} aria-expanded={abierta}>
          <Users className="h-4 w-4" />
          Placas guardadas
          <span className="rounded bg-[var(--surface-raised)]/60 px-1.5 font-mono text-xs tabular-nums">{vehiculos.length}</span>
        </Btn>
        {onCrear && (
          <Btn size="sm" variant="secondary" onClick={onCrear}>
            <Plus className="h-4 w-4" />
            Agregar vehículo
          </Btn>
        )}
      </div>
      {abierta && (
        <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
          {vehiculos.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => {
                  onAplicar({ placa: v.placa, marca: v.marca ?? "", tipo: v.tipo ?? "" });
                  onElegir?.(v.id);
                  setAbierta(false);
                }}
                className="flex w-full items-center gap-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 min-h-10 text-left transition-colors hover:border-[var(--accent)] hover:bg-primary/5"
              >
                <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{formatearPlaca(v.placa)}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-tertiary)]">
                  {[v.marca, v.tipo, v.transportistaNombre].filter(Boolean).join(" · ")}
                </span>
                {v.usos > 0 && <span className="shrink-0 text-xs tabular-nums text-[var(--text-tertiary)]">{v.usos}×</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

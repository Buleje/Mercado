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
  /** Sólo transportista. */
  registroMtc?: string;
}

interface Props {
  rol: RolParte;
  valor: ValorParte;
  /** Lista de la libreta para ESTE rol, ya ordenada por uso. */
  opciones: Parte[];
  onAplicar: (v: Partial<ValorParte>) => void;
  /** Se llama al elegir de la libreta: el consumidor suma el uso al guardar. */
  onElegir?: (parte: Parte) => void;
  /** Alta rápida en la libreta con lo que ya está tipeado. */
  onGuardar?: (v: ValorParte, rol: RolParte) => Promise<void>;
}

export default function CtpParteBarra({ rol, valor, opciones, onAplicar, onElegir, onGuardar }: Props) {
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
  const fuente = fuenteAutocompletado(valor.docTipo);
  const docNormalizado = normalizarDocumento(valor.docNumero);
  const docMalFormado = motivoDocInvalido(valor.docTipo, valor.docNumero);
  const puedeConsultar = Boolean(fuente) && !docMalFormado && docNormalizado.length > 0;

  /** ¿Lo que hay tipeado ya está en la libreta? Se compara por documento. */
  const yaEstá = useMemo(
    () => opciones.some((p) => p.docNumero && p.docNumero === docNormalizado),
    [opciones, docNormalizado],
  );

  function usar(p: Parte) {
    onAplicar({
      nombre: p.nombre,
      docTipo: p.docTipo ?? valor.docTipo,
      docNumero: p.docNumero ?? "",
      direccion: direccionCompleta(p),
      ...(rol === "transportista" ? { registroMtc: p.registroMtc ?? "" } : {}),
    });
    onElegir?.(p);
    setAbierta(false);
    setQ("");
    setAviso(`${p.nombre} cargado desde la libreta.`);
    setError(null);
  }

  async function traerDelPadron() {
    setEstado("consultando");
    setAviso(null);
    setError(null);
    try {
      const datos = await consultarDocumento(valor.docTipo, valor.docNumero);
      if (!datos) {
        setError(`No se encontró el ${valor.docTipo} en ${fuente}. Cargalo a mano.`);
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
    <div className="mb-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Btn
          size="sm"
          variant={abierta ? "dark" : "secondary"}
          onClick={() => setAbierta((v) => !v)}
          aria-expanded={abierta}
          disabled={opciones.length === 0}
          title={opciones.length === 0 ? "Todavía no hay nadie con este rol en la libreta" : undefined}
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
          {filtradas.length === 0 ? (
            <p className="rounded-lg bg-[var(--surface-raised)] px-3 py-3 text-center text-sm text-[var(--text-tertiary)]">
              Nadie coincide con “{q}”.
            </p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {filtradas.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => usar(p)}
                    className="flex w-full items-center gap-2 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-2 text-left transition-colors hover:border-[var(--accent)] hover:bg-primary/5"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{p.nombre}</span>
                      <span className="block truncate text-xs text-[var(--text-tertiary)]">
                        {[p.docNumero ? `${p.docTipo} ${p.docNumero}` : null, direccionCompleta(p) || null]
                          .filter(Boolean)
                          .join(" · ") || "Sin documento cargado"}
                      </span>
                    </div>
                    {p.usos > 0 && (
                      <span className="shrink-0 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-bold tabular-nums text-[var(--text-tertiary)]">
                        {p.usos}×
                      </span>
                    )}
                  </button>
                </li>
              ))}
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

/**
 * Selector de placa. El vehículo no es una "parte" (no tiene documento ni
 * dirección), pero se elige en el mismo paso que el transportista, así que vive
 * al lado. Elegir una placa completa además marca, tipo y —si el vehículo tiene
 * dueño cargado— deja al transportista listo para copiarse.
 */
export function CtpVehiculoBarra({
  vehiculos,
  onAplicar,
  onElegir,
}: {
  vehiculos: { id: string; placa: string; marca: string | null; tipo: string | null; transportistaNombre: string | null; usos: number }[];
  onAplicar: (v: { placa: string; marca: string; tipo: string }) => void;
  onElegir?: (id: string) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  if (vehiculos.length === 0) return null;

  return (
    <div className="sm:col-span-3">
      <Btn size="sm" variant={abierta ? "dark" : "secondary"} onClick={() => setAbierta((v) => !v)} aria-expanded={abierta}>
        <Users className="h-4 w-4" />
        Placas guardadas
        <span className="rounded bg-[var(--surface-raised)]/60 px-1.5 font-mono text-xs tabular-nums">{vehiculos.length}</span>
      </Btn>
      {abierta && (
        <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-2">
          {vehiculos.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => {
                  onAplicar({ placa: v.placa, marca: v.marca ?? "", tipo: v.tipo ?? "" });
                  onElegir?.(v.id);
                  setAbierta(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-2 text-left transition-colors hover:border-[var(--accent)] hover:bg-primary/5"
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

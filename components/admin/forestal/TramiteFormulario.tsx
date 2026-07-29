"use client";

/**
 * TramiteFormulario — llenar un formato y sacarlo impreso.
 *
 * Los campos los declara el catálogo (`tramites-catalogo`), no este componente:
 * un trámite nuevo aparece acá solo. Lo que sí vive acá es el AUTOLLENADO —
 * traer de la Ficha CTP y del Libro lo que el operador no debería volver a
 * tipear (razón social, serie y último correlativo de GTF, volúmenes del
 * período). Ese es el punto del módulo: el membrete y los datos ya están.
 *
 * Diseño (2026-07-29): trece campos en una grilla plana se leían como un
 * formulario del Estado. Ahora van en tres bloques (a quién va · qué se pide ·
 * quién firma) con el documento vivo al lado — antes había que imprimir para
 * ver cómo quedaba. En pantallas chicas el papel pasa a una pestaña.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, Check, FileDown, FileText, Save, SlidersHorizontal } from "@buleje/design-system/icons";
import { imprimirTramite } from "@/lib/forestal/tramites-print";
import {
  AUTORIDADES,
  GRUPOS_CAMPO,
  asuntoDe,
  faltantesDelTramite,
  type DatosTramite,
  type FormatoTramite,
} from "@/lib/forestal/tramites-catalogo";
import { ESTADOS_TRAMITE, type TramiteRegistro } from "@/lib/forestal/tramites-registro";
import type { CtpReportFicha } from "@/lib/forestal/ctp-print-shared";
import { Btn, Field, I } from "./ctp-shared";
import TramitePreview from "./TramitePreview";
import type { GuardarTramiteInput } from "@/hooks/use-forest-tramites";

/** Lo que el sistema puede completar solo: identidad + datos del libro. */
export interface AutollenadoTramite {
  ficha: CtpReportFicha | null;
  /** Serie de GTF en uso y último correlativo emitido (del Registro de Salida). */
  serieGtf?: string;
  ultimoCorrelativo?: string;
  /** Período elegido en el Libro y sus cifras. */
  periodo?: string;
  ingresosCount?: number;
  volumenIngresado?: string;
  despachosCount?: number;
  /** Especie CITES del período (para el permiso de exportación). */
  especieCites?: string;
}

/** Valor sugerido para un campo con `autollenado`. */
function sugerido(campoId: string, auto: AutollenadoTramite): string {
  const f = auto.ficha ?? {};
  switch (campoId) {
    case "firmante":
      return f.razonSocial ?? "";
    case "lugar":
      return f.provincia?.trim() || f.region?.trim() || "";
    case "serieActual":
      return auto.serieGtf ?? "";
    case "ultimoCorrelativo":
      return auto.ultimoCorrelativo ?? "";
    case "periodo":
      return auto.periodo ?? "";
    case "ingresosCount":
      return auto.ingresosCount != null ? String(auto.ingresosCount) : "";
    case "volumenIngresado":
      return auto.volumenIngresado ?? "";
    case "despachosCount":
      return auto.despachosCount != null ? String(auto.despachosCount) : "";
    case "especie":
      return auto.especieCites ?? "";
    default:
      return "";
  }
}

export default function TramiteFormulario({
  formato,
  auto,
  existente,
  onGuardar,
  onCerrar,
}: {
  formato: FormatoTramite;
  auto: AutollenadoTramite;
  /** Si se abrió desde el expediente: se edita ese trámite. */
  existente?: TramiteRegistro | null;
  onGuardar: (input: GuardarTramiteInput) => Promise<TramiteRegistro | null>;
  onCerrar: () => void;
}) {
  const [datos, setDatos] = useState<DatosTramite>({});
  const [estado, setEstado] = useState<string>(existente?.estado ?? "borrador");
  const [expediente, setExpediente] = useState(existente?.expedienteAutoridad ?? "");
  const [fechaPresentacion, setFechaPresentacion] = useState(existente?.fechaPresentacion ?? "");
  const [notas, setNotas] = useState(existente?.notas ?? "");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  /**
   * Id del expediente una vez guardado. Sin esto, guardar dos veces creaba DOS
   * trámites del mismo documento: el `save` es upsert por id y el segundo POST
   * iba sin id. Se adopta el que devolvió el servidor.
   */
  const [idGuardado, setIdGuardado] = useState<string | null>(existente?.id ?? null);
  /** Móvil: el papel no cabe al lado, va en su propia pestaña. */
  const [panelMovil, setPanelMovil] = useState<"formulario" | "documento">("formulario");

  // Al abrir: lo guardado (si se edita) o lo que el sistema puede completar.
  useEffect(() => {
    if (existente) {
      setDatos(existente.datos ?? {});
      return;
    }
    const base: DatosTramite = {};
    for (const c of formato.campos) {
      const s = c.autollenado ? sugerido(c.id, auto) : "";
      if (s) base[c.id] = s;
    }
    setDatos(base);
    // `auto` cambia con el período; re-llenar al vuelo pisaría lo tipeado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formato.id, existente]);

  const set = (id: string, valor: string) => setDatos((p) => ({ ...p, [id]: valor }));
  const faltantes = useMemo(() => faltantesDelTramite(formato, datos), [formato, datos]);
  const requeridos = useMemo(() => formato.campos.filter((c) => c.requerido), [formato]);
  const listos = requeridos.length - faltantes.length;
  const autoridad = AUTORIDADES[formato.autoridad];
  const autollenados = useMemo(
    () => formato.campos.filter((c) => c.autollenado && (datos[c.id] ?? "").trim()).length,
    [formato, datos],
  );

  function imprimir() {
    try {
      imprimirTramite({ formato, datos, ficha: auto.ficha });
    } catch (err) {
      setAviso(err instanceof Error ? err.message : String(err));
    }
  }

  async function guardar() {
    setGuardando(true);
    setAviso(null);
    const guardado = await onGuardar({
      id: idGuardado ?? existente?.id,
      formatoId: formato.id,
      formatoNombre: formato.nombre,
      autoridad: formato.autoridad,
      asunto: asuntoDe(formato, datos),
      datos,
      estado,
      expedienteAutoridad: expediente.trim() || null,
      fechaPresentacion: fechaPresentacion.trim() || null,
      notas: notas.trim() || null,
    });
    setGuardando(false);
    if (guardado) {
      setIdGuardado(guardado.id);
      setEstado(guardado.estado);
      setFechaPresentacion(guardado.fechaPresentacion ?? "");
      setAviso(
        idGuardado || existente
          ? "Cambios guardados en el expediente."
          : "Guardado en el expediente: ya podés seguirlo desde ahí.",
      );
    }
  }

  const campoInput = (c: (typeof formato.campos)[number]) =>
    c.tipo === "textarea" ? (
      <textarea
        rows={3}
        className={`${I} h-auto py-2`}
        value={datos[c.id] ?? ""}
        placeholder={c.placeholder}
        onChange={(e) => set(c.id, e.target.value)}
      />
    ) : (
      <input
        type={c.tipo === "numero" ? "number" : c.tipo === "fecha" ? "date" : "text"}
        className={I}
        value={datos[c.id] ?? ""}
        placeholder={c.placeholder}
        onChange={(e) => set(c.id, e.target.value)}
      />
    );

  return (
    <div className="space-y-4">
      {/* Cabecera del trámite: identidad editorial + a quién va + progreso. */}
      <div
        className="relative overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] p-5"
        style={{ background: "linear-gradient(135deg, var(--accent-soft) 0%, var(--surface-raised) 60%)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-raised)]/80 px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
              {autoridad.label}
            </span>
            <h3 className="font-display mt-2 text-2xl leading-tight text-[var(--text-primary)]">{formato.nombre}</h3>
            <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">{formato.proposito}</p>
          </div>
          <Btn variant="secondary" onClick={onCerrar}>
            <ArrowLeft className="h-4 w-4" />
            Otros trámites
          </Btn>
        </div>

        {/* Progreso de lo obligatorio: cuántos campos faltan, no un % abstracto. */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="h-2 w-40 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-[var(--motion-base)]"
              style={{ width: `${requeridos.length ? (listos / requeridos.length) * 100 : 100}%` }}
            />
          </div>
          <p className="text-sm font-bold text-[var(--text-secondary)]">
            {faltantes.length === 0 ? (
              <span className="inline-flex items-center gap-1.5 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                <Check className="h-4 w-4" /> Listo para presentar
              </span>
            ) : (
              `${listos} de ${requeridos.length} datos obligatorios`
            )}
          </p>
          {autollenados > 0 && (
            <p className="text-xs text-[var(--text-tertiary)]">
              {autollenados} {autollenados === 1 ? "campo llenado" : "campos llenados"} con tus datos del Libro
            </p>
          )}
        </div>

        {formato.advertencia && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border-l-4 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-3 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{formato.advertencia}</span>
          </p>
        )}
      </div>

      {aviso && (
        <p className="rounded-xl border-2 border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] p-3 text-sm font-bold text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]">
          {aviso}
        </p>
      )}

      {/* Móvil: alternar entre llenar y ver el papel. */}
      <div className="flex gap-2 xl:hidden">
        {(
          [
            { key: "formulario", label: "Llenar", icon: SlidersHorizontal },
            { key: "documento", label: "Ver documento", icon: FileText },
          ] as const
        ).map((t) => {
          const Icono = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setPanelMovil(t.key)}
              aria-pressed={panelMovil === t.key}
              className={`inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border-2 text-sm font-bold transition ${
                panelMovil === t.key
                  ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]"
              }`}
            >
              <Icono className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* `pb-20`: la barra de acciones es sticky y sin esto tapaba el último
          campo (el firmante quedaba detrás del botón de imprimir). */}
      <div className="grid gap-4 pb-20 xl:grid-cols-[minmax(0,1fr)_28rem]">
        {/* ── Columna 1: los campos, en tres bloques ── */}
        <div className={`space-y-4 ${panelMovil === "documento" ? "max-xl:hidden" : ""}`}>
          {GRUPOS_CAMPO.map((g) => {
            const campos = formato.campos.filter((c) => (c.grupo ?? "datos") === g.id);
            if (campos.length === 0) return null;
            return (
              <section key={g.id} className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
                <div className="mb-3 flex flex-wrap items-baseline gap-x-2 border-b-2 border-[var(--rule-soft)] pb-2">
                  <h4 className="text-sm font-bold uppercase tracking-wide text-[var(--text-primary)]">{g.label}</h4>
                  <p className="text-xs text-[var(--text-tertiary)]">{g.hint}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {campos.map((c) => (
                    <Field key={c.id} label={c.label} required={c.requerido} hint={c.hint}>
                      {campoInput(c)}
                    </Field>
                  ))}
                </div>
              </section>
            );
          })}

          {/* Seguimiento: lo que convierte un papel en expediente. */}
          <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4">
            <div className="mb-3 flex flex-wrap items-baseline gap-x-2 border-b-2 border-[var(--rule-soft)] pb-2">
              <h4 className="text-sm font-bold uppercase tracking-wide text-[var(--text-primary)]">Seguimiento</h4>
              <p className="text-xs text-[var(--text-tertiary)]">Para saber después qué pasó con este trámite</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Estado">
                <select className={I} value={estado} onChange={(e) => setEstado(e.target.value)}>
                  {ESTADOS_TRAMITE.map((e) => (
                    <option key={e.key} value={e.key}>{e.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Expediente de la autoridad" hint="El número con el que se pregunta después">
                <input type="text" className={I} value={expediente} onChange={(e) => setExpediente(e.target.value)} />
              </Field>
              <Field label="Fecha de presentación" hint="Sin fecha no se puede contar el plazo">
                <input type="date" className={I} value={fechaPresentacion} onChange={(e) => setFechaPresentacion(e.target.value)} />
              </Field>
              <Field label="Notas internas">
                <input type="text" className={I} value={notas} onChange={(e) => setNotas(e.target.value)} />
              </Field>
            </div>
          </section>
        </div>

        {/* ── Columna 2: el papel, pegado mientras se hace scroll ── */}
        <div className={panelMovil === "formulario" ? "max-xl:hidden" : ""}>
          <TramitePreview formato={formato} datos={datos} ficha={auto.ficha} className="xl:sticky xl:top-4" />
        </div>
      </div>

      {/* Acciones: pegadas al pie, siempre alcanzables. */}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]/95 px-4 py-3 backdrop-blur">
        <p className="text-sm text-[var(--text-tertiary)]">
          {faltantes.length > 0
            ? `Falta: ${faltantes.map((f) => f.label).join(", ")}`
            : "El documento sale con tu membrete; la firma va a mano."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Btn variant="secondary" disabled={guardando} onClick={() => void guardar()}>
            <Save className="h-4 w-4" />
            {guardando ? "Guardando…" : idGuardado || existente ? "Guardar cambios" : "Guardar en expediente"}
          </Btn>
          <Btn variant="dark" disabled={faltantes.length > 0} onClick={imprimir}>
            <FileDown className="h-4 w-4" />
            Imprimir / PDF
          </Btn>
        </div>
      </div>
    </div>
  );
}

"use client";

/**
 * TramiteFormulario — llenar un formato y sacarlo impreso.
 *
 * Los campos los declara el catálogo (`tramites-catalogo`), no este componente:
 * un trámite nuevo aparece acá solo. Lo que sí vive acá es el AUTOLLENADO —
 * traer de la Ficha CTP y del Libro lo que el operador no debería volver a
 * tipear (razón social, serie y último correlativo de GTF, volúmenes del
 * período). Ese es el punto del módulo: el membrete y los datos ya están.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, FileDown, Save } from "@buleje/design-system/icons";
import { imprimirTramite } from "@/lib/forestal/tramites-print";
import {
  AUTORIDADES,
  asuntoDe,
  faltantesDelTramite,
  type DatosTramite,
  type FormatoTramite,
} from "@/lib/forestal/tramites-catalogo";
import { ESTADOS_TRAMITE, type TramiteRegistro } from "@/lib/forestal/tramites-registro";
import type { CtpReportFicha } from "@/lib/forestal/ctp-print-shared";
import { Btn, Field, I } from "./ctp-shared";
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
  /** Si se abrió desde la bandeja: se edita ese expediente. */
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
  const autoridad = AUTORIDADES[formato.autoridad];

  function imprimir() {
    try {
      imprimirTramite({
        formato,
        datos,
        ficha: auto.ficha,
        lugar: auto.ficha?.provincia || auto.ficha?.region || undefined,
      });
    } catch (err) {
      setAviso(err instanceof Error ? err.message : String(err));
    }
  }

  async function guardar(estadoFinal?: string) {
    setGuardando(true);
    setAviso(null);
    const guardado = await onGuardar({
      id: existente?.id,
      formatoId: formato.id,
      formatoNombre: formato.nombre,
      autoridad: formato.autoridad,
      asunto: asuntoDe(formato, datos),
      datos,
      estado: estadoFinal ?? estado,
      expedienteAutoridad: expediente.trim() || null,
      fechaPresentacion: fechaPresentacion.trim() || null,
      notas: notas.trim() || null,
    });
    setGuardando(false);
    if (guardado) {
      setEstado(guardado.estado);
      setFechaPresentacion(guardado.fechaPresentacion ?? "");
      setAviso("Guardado en el expediente.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-[var(--text-primary)]">{formato.nombre}</h3>
            <p className="text-sm text-[var(--text-secondary)]">{formato.proposito}</p>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              Va a <strong className="text-[var(--text-secondary)]">{autoridad.label}</strong> · {autoridad.detalle}
            </p>
          </div>
          <Btn variant="ghost" onClick={onCerrar}>Volver al catálogo</Btn>
        </div>
        {formato.advertencia && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border-l-4 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-3 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{formato.advertencia}</span>
          </p>
        )}
      </div>

      {aviso && (
        <p className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3 text-sm text-[var(--text-secondary)]">
          {aviso}
        </p>
      )}

      <div className="grid gap-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:grid-cols-2">
        {formato.campos.map((c) => (
          <Field key={c.id} label={c.label} required={c.requerido} hint={c.hint}>
            {c.tipo === "textarea" ? (
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
            )}
          </Field>
        ))}
      </div>

      {/* Seguimiento: lo que convierte un papel en expediente. */}
      <div className="grid gap-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4 sm:grid-cols-2 lg:grid-cols-4">
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-tertiary)]">
          {faltantes.length > 0
            ? `Falta llenar: ${faltantes.map((f) => f.label).join(", ")}`
            : "Listo para imprimir o guardar."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Btn variant="secondary" disabled={guardando} onClick={() => void guardar()}>
            <Save className="h-4 w-4" />
            {guardando ? "Guardando…" : existente ? "Guardar cambios" : "Guardar en expediente"}
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

"use client";

/**
 * FichaTarifas — línea de tiempo de versiones + «Nueva tarifa» (ADR-414 §3).
 *
 * Las filas no se editan: guardar de nuevo la misma fecha da de baja la
 * anterior y nace una fila nueva (lo hace el servidor). `SIN_PAGO` es «desde
 * acá no gana» — no es un error, es la línea del cese o la suspensión.
 *
 * Por hora también se pide la jornada: el servidor la acepta desde siempre,
 * pero la ficha nunca la mandaba y quedaba en 8 h. Es la que estima las horas
 * de un día marcado sin entrada ni salida.
 */

import { useState, type FormEvent } from "react";
import { Loader2, Plus, Trash2, Wallet } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { cn, limaDateKey } from "@/lib/utils";
import { AvisoRrhh, BOTON, CLASE_CAMPO, CLASE_CHIP } from "../rrhh-form";
import { etiquetaModalidad, formatearFecha, formatearPEN } from "../rrhh-ui";
import type { Modalidad, TarifaDTO } from "@/lib/rrhh/tipos";
import type { RrhhApiError } from "@/hooks/use-rrhh-puestos";
import { formatNumber } from "@/lib/format";

interface Props {
  tarifas: TarifaDTO[];
  guardando: boolean;
  onGuardar: (input: { modalidad: Modalidad; monto: number; horasJornada?: number; vigenteDesde: string; motivo?: string }) => Promise<{ ok: true; tarifas: TarifaDTO[] } | { ok: false; error: RrhhApiError }>;
  onQuitar: (tarifaId: string) => Promise<{ ok: true; tarifas: TarifaDTO[] } | { ok: false; error: RrhhApiError }>;
  onCambio: () => void;
}

const MODALIDADES: Modalidad[] = ["HORA", "DIA", "SEMANA", "MES", "SIN_PAGO"];

function textoTarifa(t: Pick<TarifaDTO, "modalidad" | "monto">): string {
  return t.modalidad === "SIN_PAGO" ? "Sin pago" : `${formatearPEN(t.monto)} ${etiquetaModalidad(t.modalidad)}`;
}

function textoHoras(h: number): string {
  return `${formatNumber(h, { max: 2 })} h`;
}

export default function FichaTarifas({ tarifas, guardando, onGuardar, onQuitar, onCambio }: Props) {
  const { confirm } = useConfirm();
  const [abierto, setAbierto] = useState(false);
  const [modalidad, setModalidad] = useState<Modalidad>("DIA");
  const [monto, setMonto] = useState("");
  const [horas, setHoras] = useState("8");
  const [vigenteDesde, setVigenteDesde] = useState(() => limaDateKey());
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const hoy = limaDateKey();
  const ordenadas = [...tarifas].sort((a, b) => (a.vigenteDesde < b.vigenteDesde ? 1 : -1));
  const vigenteId = ordenadas.find((t) => t.vigenteDesde <= hoy)?.id;
  const porHora = modalidad === "HORA";

  const abrir = () => {
    // La jornada arranca con la de la tarifa vigente, si ya había una.
    const vigente = ordenadas.find((t) => t.id === vigenteId);
    if (vigente) setHoras(String(vigente.horasJornada));
    setAbierto(true);
  };

  const guardar = async (e?: FormEvent) => {
    e?.preventDefault();
    const montoNum = modalidad === "SIN_PAGO" ? 0 : Number(monto);
    if (modalidad !== "SIN_PAGO" && !(montoNum > 0)) {
      setError("El monto tiene que ser mayor a 0.");
      return;
    }
    const horasNum = Number(horas);
    if (porHora && !(horasNum > 0 && horasNum <= 24)) {
      setError("La jornada tiene que ser de más de 0 y hasta 24 horas.");
      return;
    }
    if (!vigenteDesde) {
      setError("Elige desde qué día vale.");
      return;
    }
    setError(null);
    const res = await onGuardar({
      modalidad,
      monto: montoNum,
      vigenteDesde,
      motivo: motivo.trim() || undefined,
      ...(porHora ? { horasJornada: horasNum } : {}),
    });
    if (!res.ok) {
      setError(res.error.message ?? "No se pudo guardar la tarifa.");
      return;
    }
    setAbierto(false);
    setMonto("");
    setMotivo("");
    onCambio();
  };

  const quitar = async (t: TarifaDTO) => {
    // Antes se quitaba de un clic, sin preguntar: una versión de tarifa cambia lo ganado de todas sus fechas.
    const ok = await confirm({
      title: "¿Quitar esta tarifa?",
      description: `${textoTarifa(t)} desde el ${formatearFecha(t.vigenteDesde)}. Las fechas que cubría pasan a usar la tarifa anterior, si hay una.`,
      intent: "danger",
      confirmLabel: "Sí, quitar",
    });
    if (!ok) return;
    setError(null);
    const res = await onQuitar(t.id);
    if (!res.ok) {
      setError(res.error.message ?? "No se pudo quitar la tarifa.");
      return;
    }
    onCambio();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-secondary)]">Cada cambio es una versión nueva desde una fecha. Las anteriores no se editan.</p>
        {!abierto && (
          <button type="button" onClick={abrir} className={BOTON.chico}>
            <Plus className="h-4 w-4" /> Nueva tarifa
          </button>
        )}
      </div>

      {abierto && (
        <form onSubmit={guardar} noValidate className="space-y-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Se paga">
              {(id) => (
                <select id={id} value={modalidad} onChange={(e) => setModalidad(e.target.value as Modalidad)} className={CLASE_CAMPO}>
                  {MODALIDADES.map((m) => (
                    <option key={m} value={m}>
                      {etiquetaModalidad(m)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            {modalidad !== "SIN_PAGO" ? (
              <Field label="Monto (S/)">
                {(id) => (
                  <input id={id} type="number" inputMode="decimal" min={0} step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" className={cn(CLASE_CAMPO, "tabular-nums")} />
                )}
              </Field>
            ) : (
              <div className="hidden sm:block" aria-hidden />
            )}
            <Field label="Vale desde">
              {(id) => <input id={id} type="date" value={vigenteDesde} onChange={(e) => setVigenteDesde(e.target.value)} className={CLASE_CAMPO} />}
            </Field>
            {porHora && (
              <Field label="Horas de la jornada" hint="Estima las horas de los días sin entrada ni salida.">
                {(id) => (
                  <input id={id} type="number" inputMode="decimal" min={1} max={24} step="0.5" value={horas} onChange={(e) => setHoras(e.target.value)} className={cn(CLASE_CAMPO, "tabular-nums")} />
                )}
              </Field>
            )}
            <Field label="Motivo" hint="Opcional. Ej. aumento por campaña." className={porHora ? "sm:col-span-2" : "sm:col-span-3"}>
              {(id) => <input id={id} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} className={CLASE_CAMPO} />}
            </Field>
          </div>
          {error && (
            <p role="alert" className="text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAbierto(false);
                setError(null);
              }}
              className={BOTON.chicoFantasma}
            >
              Cancelar
            </button>
            <button type="submit" disabled={guardando} className={BOTON.chicoPrimario}>
              {guardando && <Loader2 className="h-4 w-4 animate-spin" />} Guardar tarifa
            </button>
          </div>
        </form>
      )}

      {!abierto && error && <AvisoRrhh tono="error">{error}</AvisoRrhh>}

      {ordenadas.length === 0 ? (
        <AvisoRrhh tono="neutro" icono={Wallet}>
          Sin tarifa registrada todavía. Sin tarifa, sus días no suman en lo ganado.
        </AvisoRrhh>
      ) : (
        <ol className="space-y-2.5">
          {ordenadas.map((t) => {
            const esVigente = t.id === vigenteId;
            const programada = t.vigenteDesde > hoy;
            return (
              <li
                key={t.id}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-xl border px-4 py-3",
                  esVigente ? "border-primary/40 bg-primary/5" : "border-[var(--rule-base)] bg-[var(--surface-raised)]",
                )}
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold tabular-nums text-[var(--text-primary)]">
                    {textoTarifa(t)}
                    {esVigente && <span className={cn(CLASE_CHIP, "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]")}>Vigente</span>}
                    {programada && <span className={cn(CLASE_CHIP, "bg-[var(--data-info-500)]/10 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]")}>Programada</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                    Desde el {formatearFecha(t.vigenteDesde)}
                    {t.modalidad === "HORA" && ` · jornada de ${textoHoras(t.horasJornada)}`}
                    {t.motivo && ` · ${t.motivo}`}
                  </p>
                </div>
                <button type="button" disabled={guardando} onClick={() => quitar(t)} className={BOTON.icono} aria-label={`Quitar la tarifa desde el ${formatearFecha(t.vigenteDesde)}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

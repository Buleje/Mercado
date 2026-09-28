"use client";

/**
 * CtpGuiasGuardadasBandeja — en Ingresos, las guías que se guardaron antes de
 * que llegue la madera y todavía esperan su ingreso (ADR-442).
 *
 * Hermana de `CtpGuiasBandeja` (las guías del monte sin ingresar) y con su
 * mismo aspecto: la tarea pendiente, a la vista, con el botón que la resuelve.
 * «Ingresar» abre el alta de ingreso ya llena con la guía guardada; sus papeles
 * los ve el ingreso solo, por la GTF. Sin guías por ingresar no dibuja nada.
 *
 * Van por vencimiento (la fecha más vieja arriba, sin fecha al final) y el
 * título avisa las que vencen en ≤2 días o ya vencieron: en Blas 11 de 12
 * guías llegaron después de su vencimiento (27-09).
 */

import { Fragment, useMemo } from "react";
import { AlertTriangle, ArrowRight, FolderOpen } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useGuiasGuardadas } from "@/hooks/use-guias-guardadas";
import type { GuiaGuardadaVista } from "@/lib/forestal/guias-guardadas";
import {
  contarVencimientos,
  DIAS_VENCE_PRONTO,
  ordenarPorVencimiento,
  trozosDelAviso,
  vencimientoDeGuiaGuardada,
  type CuentaDeVencimientos,
} from "@/lib/forestal/vencimiento-guia-guardada";
import { limaDateKey } from "@/lib/utils";
import { Btn } from "./ctp-shared";
import { ChipDocsGuardada } from "./ctp-guias-guardadas-fila";
import { ChipVencimiento } from "./ctp-guia-vence-chip";

const VISIBLES = 5;

/* Los mismos tonos que el chip (`ctp-guia-vence-chip`): vencida en ámbar como
   «vencida sin recibir» de la tabla de Ingresos, pronto en azul. */
const TINTA_AVISO = {
  vencida: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  hoy: "text-[var(--data-warning-ink)]",
  pronto: "text-[var(--data-info-700)] dark:text-[var(--data-info-500)]",
} as const;

/** «1 vence hoy · 2 vencen pronto · 1 vencida» en el título; nada si ninguna apura. */
function AvisoDeVencimientos({ cuenta }: { cuenta: CuentaDeVencimientos }) {
  const trozos = trozosDelAviso(cuenta);
  if (trozos.length === 0) return null;
  const borde =
    cuenta.vencidas > 0 || cuenta.hoy > 0 ? "border-[var(--data-warning-500)]/60" : "border-[var(--data-info-500)]/60";
  return (
    <span
      data-testid="aviso-vencimientos"
      className={`inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg border bg-[var(--surface-raised)] py-0.5 pl-2 pr-0.5 text-xs font-bold ${borde}`}
    >
      <AlertTriangle
        className={`h-3.5 w-3.5 shrink-0 ${cuenta.vencidas > 0 || cuenta.hoy > 0 ? TINTA_AVISO.vencida : TINTA_AVISO.pronto}`}
        aria-hidden
      />
      {trozos.map((t, i) => (
        <Fragment key={t.tono}>
          {i > 0 && (
            <span className="text-[var(--text-tertiary)]" aria-hidden>
              ·
            </span>
          )}
          <span className={TINTA_AVISO[t.tono]}>{t.texto}</span>
        </Fragment>
      ))}
      <InfoTip
        title="Vencimiento de la guía"
        ariaLabel="Qué significa el aviso de vencimiento"
        what={`Cuánto le queda a cada guía antes de vencer, según su ficha de SERFOR. «Pronto» es en ${DIAS_VENCE_PRONTO} días o menos.`}
        affects="Si la madera llega después del vencimiento, viajó con la guía vencida: al registrarla, el libro te pide confirmarlo con el motivo."
        body={
          cuenta.sinFecha === 0
            ? undefined
            : cuenta.sinFecha === 1
              ? "1 guía no tiene fecha de vencimiento: búscala en SERFOR con su N° de registro."
              : `${cuenta.sinFecha} guías no tienen fecha de vencimiento: búscalas en SERFOR con su N° de registro.`
        }
        example="Vence el martes y hoy es domingo: «vence en 2 días». Llama al transportista antes de que venza."
      />
    </span>
  );
}

export interface CtpGuiasGuardadasBandejaProps {
  /** Subirlo la vuelve a pedir (después de registrar un ingreso o de tocar sus papeles). */
  recargarKey?: number;
  onAbrir: (g: GuiaGuardadaVista) => void;
  onDocumentos: (g: GuiaGuardadaVista) => void;
  onIngresar: (g: GuiaGuardadaVista) => void;
  onVerTodas: () => void;
}

export default function CtpGuiasGuardadasBandeja({
  recargarKey = 0,
  onAbrir,
  onDocumentos,
  onIngresar,
  onVerTodas,
}: CtpGuiasGuardadasBandejaProps) {
  // Señal secundaria: si la lista falla, la bandeja simplemente no aparece.
  const { datos } = useGuiasGuardadas({ estado: "por_ingresar", recargarKey });
  const hoy = limaDateKey();
  const { filas, cuenta } = useMemo(() => {
    const porIngresar = (datos?.guias ?? []).filter((g) => !g.ingreso);
    const filas = ordenarPorVencimiento(porIngresar, hoy).map((g) => ({ g, v: vencimientoDeGuiaGuardada(g, hoy) }));
    return { filas, cuenta: contarVencimientos(filas.map((f) => f.v)) };
  }, [datos, hoy]);
  if (filas.length === 0) return null;
  const n = datos?.porIngresar ?? filas.length;

  return (
    // Mismo tinte que la bandeja del monte: alpha REAL (`bg-primary/N`), no
    // `--accent-soft` (en dark compilaba a un panel claro con texto teal).
    <div
      className="rounded-2xl border-2 border-[var(--accent)] bg-primary/5 p-3 dark:bg-primary/10"
      data-testid="bandeja-guias-guardadas"
    >
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <FolderOpen className="h-4 w-4 text-[var(--accent-ink)]" aria-hidden />
        <CardTitle as="h3" className="text-sm font-bold text-[var(--accent-ink)]">
          {n === 1 ? "1 guía guardada por ingresar" : `${n} guías guardadas por ingresar`}
        </CardTitle>
        <InfoTip
          title="Guías guardadas"
          what="Guías que anotaste con sus papeles antes de que llegue la madera."
          affects="«Ingresar» abre el ingreso con los datos de la guía; sus documentos ya aparecen en la guía del libro."
        />
        <AvisoDeVencimientos cuenta={cuenta} />
        <button
          type="button"
          onClick={onVerTodas}
          className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-bold text-[var(--accent-ink)] underline-offset-2 hover:underline sm:min-h-8"
        >
          Ver todas <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <ul className="space-y-1.5">
        {filas.slice(0, VISIBLES).map(({ g, v }) => (
          <li
            key={g.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-[var(--surface-raised)] px-3 py-2"
          >
            <button
              type="button"
              onClick={() => onAbrir(g)}
              title="Ver y editar la guía guardada"
              className="min-w-0 flex-1 basis-60 text-left"
            >
              <span className="font-mono text-sm font-bold text-[var(--text-primary)] underline-offset-2 hover:underline">
                GTF {g.gtfNumber}
              </span>
              <span className="ml-2 text-xs text-[var(--text-tertiary)]">
                {[g.numeroRegistro ? `Reg. ${g.numeroRegistro}` : null, g.titularNombre, g.permisoCodigo]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>
            <ChipVencimiento v={v} />
            <ChipDocsGuardada n={g.docsLlenos} />
            <div className="flex shrink-0 gap-2 max-sm:w-full">
              <Btn
                size="sm"
                variant="secondary"
                onClick={() => onDocumentos(g)}
                className="max-sm:h-11 max-sm:flex-1"
                aria-label={`Documentos de la guía ${g.gtfNumber}`}
              >
                <FolderOpen className="h-3.5 w-3.5" aria-hidden /> Documentos
              </Btn>
              <Btn
                size="sm"
                variant="primary"
                onClick={() => onIngresar(g)}
                className="max-sm:h-11 max-sm:flex-1"
                aria-label={`Ingresar la guía ${g.gtfNumber}`}
              >
                Ingresar <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Btn>
            </div>
          </li>
        ))}
      </ul>
      {n > VISIBLES && (
        <button
          type="button"
          onClick={onVerTodas}
          className="mt-2 min-h-11 text-sm font-medium text-[var(--text-secondary)] underline-offset-2 hover:underline sm:min-h-0"
        >
          y {n - VISIBLES} más: ver todas
        </button>
      )}
    </div>
  );
}

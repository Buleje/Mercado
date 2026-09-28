"use client";

/**
 * «Lotes que puedes armar» (Brandon, 2026-09-27: «Armar lotes con un clic»).
 *
 * Una fila por especie + permiso con la madera del patio que ya se puede
 * aserrar, y un botón «Crear lote». Quién entra lo decide el servidor
 * (`GET/POST /api/admin/forestal/lotes-aserrio/propuestas`): esto sólo muestra
 * y pide. Sin propuestas no dibuja nada.
 */

import { useState } from "react";
import { toast } from "sonner";
import { CardTitle } from "@buleje/design-system";
import { Boxes, Loader2, Plus } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";
import type { PropuestaDeLote } from "@/lib/forestal/propuesta-de-lotes";
import { Btn } from "./ctp-shared";
import { usePropuestaLotes, type ResultadoCrearLotes } from "./hooks/use-propuesta-lotes";

/** Cuántas filas se ven sin abrir «Ver más»: el bloque no puede tapar los lotes. */
const VISIBLES = 5;

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function avisarResultado(r: ResultadoCrearLotes): void {
  const [uno] = r.creados;
  if (r.creados.length === 1 && uno) {
    toast.success(`Lote ${uno.code} listo: ${plural(uno.trozas, "troza", "trozas")} de ${uno.especie}.`);
  } else if (r.creados.length > 1) {
    toast.success(`Listos ${plural(r.creados.length, "lote", "lotes")}.`);
  }
  const noEntraron = r.creados.flatMap((c) => c.noEntraron);
  if (noEntraron[0]) {
    toast.warning(`${plural(noEntraron.length, "troza no entró", "trozas no entraron")}: ${noEntraron[0].motivo}.`);
  }
  if (r.noCreados[0]) {
    toast.warning(`${plural(r.noCreados.length, "lote no se armó", "lotes no se armaron")}: ${r.noCreados[0].motivo}`);
  }
}

function FilaPropuesta({
  p,
  ocupado,
  creando,
  onCrear,
}: {
  p: PropuestaDeLote;
  ocupado: boolean;
  creando: boolean;
  onCrear: () => void;
}) {
  const origen = [p.titular, p.permiso].filter(Boolean).join(" · ");
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--rule-soft)] py-2 first:border-t-0">
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <b className="text-[var(--text-primary)]">{p.especie}</b>
          <span className="font-mono tabular-nums text-[var(--text-secondary)]">
            {plural(p.trozas, "troza", "trozas")} · {fmtM3(p.m3)} m³ · ≈{fmtPt(p.ptAserrable)} pt
          </span>
        </span>
        {origen && (
          <span className="block truncate text-xs text-[var(--text-tertiary)]" title={origen}>
            {p.permiso ? origen : `${origen} · sin permiso`}
          </span>
        )}
      </span>
      <Btn size="sm" variant="primary" onClick={onCrear} disabled={ocupado} aria-label={`Crear lote de ${p.especie}`}>
        {creando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
        Crear lote
      </Btn>
    </li>
  );
}

export default function CtpPropuestaLotes({
  onCreado,
  refrescarCon,
}: {
  /** La vista recarga sus lotes y su patio. */
  onCreado?: () => void;
  /** Cuando cambia (p. ej. el patio de la vista), se vuelven a pedir las propuestas. */
  refrescarCon?: unknown;
}) {
  const { datos, error, recargar, crear } = usePropuestaLotes(refrescarCon);
  const { confirm } = useConfirm();
  /** La clave de la propuesta que se está creando, o «todos». */
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [verTodas, setVerTodas] = useState(false);

  if (error && !datos) {
    return (
      <p className="text-xs text-[var(--text-tertiary)]">
        No pude calcular los lotes para armar.{" "}
        <button type="button" onClick={() => void recargar()} className="font-bold underline underline-offset-2">
          Reintentar
        </button>
      </p>
    );
  }
  const propuestas = datos?.propuestas ?? [];
  if (propuestas.length === 0) return null;

  async function ejecutar(lista: readonly PropuestaDeLote[], clave: string) {
    setOcupado(clave);
    try {
      avisarResultado(await crear(lista));
      onCreado?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  async function crearTodos() {
    const ok = await confirm({
      title: `¿Crear ${plural(propuestas.length, "lote", "lotes")}?`,
      description: "Uno por especie y permiso, con las trozas que ves. Luego puedes deshacer cualquiera.",
      intent: "info",
      confirmLabel: `Sí, crear ${propuestas.length}`,
    });
    if (ok) await ejecutar(propuestas, "todos");
  }

  const visibles = verTodas ? propuestas : propuestas.slice(0, VISIBLES);
  const ocultas = propuestas.length - visibles.length;
  const esperan = datos?.esperanGuia;
  const sinPermiso = datos?.sinPermiso;

  return (
    <section className="rounded-xl border border-[var(--accent)]/40 bg-primary/5 px-3 py-2" aria-label="Lotes que puedes armar">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Boxes className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
        <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
          Lotes que puedes armar
        </CardTitle>
        <InfoTip
          title="Un lote, una especie, un permiso"
          what="Juntamos las trozas del patio por especie y por permiso. Así cada lote sale limpio para el libro."
          affects="Solo entran trozas con su guía recibida. Las demás esperan."
          example="Copal · 5 trozas → aprietas «Crear lote» y queda el lote LA-2026-007."
        />
        <span className="text-xs text-[var(--text-secondary)]">
          Quedan {plural(propuestas.length, "lote", "lotes")} por armar
        </span>
        {propuestas.length > 1 && (
          <Btn size="sm" variant="secondary" className="ml-auto" onClick={() => void crearTodos()} disabled={ocupado !== null}>
            {ocupado === "todos" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            Crear todos
          </Btn>
        )}
      </header>

      <ul className="mt-1">
        {visibles.map((p) => (
          <FilaPropuesta
            key={p.clave}
            p={p}
            ocupado={ocupado !== null}
            creando={ocupado === p.clave}
            onCrear={() => void ejecutar([p], p.clave)}
          />
        ))}
      </ul>

      {(ocultas > 0 || verTodas || (esperan && esperan.trozas > 0) || (sinPermiso && sinPermiso.trozas > 0)) && (
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-tertiary)]">
          {propuestas.length > VISIBLES && (
            <button
              type="button"
              onClick={() => setVerTodas((v) => !v)}
              className="font-bold text-[var(--accent-ink)] underline underline-offset-2 dark:text-[var(--accent)]"
            >
              {verTodas ? "Ver menos" : `Ver ${ocultas} más`}
            </button>
          )}
          {esperan && esperan.trozas > 0 && (
            <span>
              {plural(esperan.trozas, "troza más", "trozas más")} cuando recibas{" "}
              {esperan.guias === 1 ? "su guía" : `sus ${esperan.guias} guías`}.
            </span>
          )}
          {sinPermiso && sinPermiso.trozas > 0 && (
            <span>
              {plural(sinPermiso.trozas, "troza no dice", "trozas no dicen")} su permiso: ponlo en Ingresos.
            </span>
          )}
        </p>
      )}
    </section>
  );
}

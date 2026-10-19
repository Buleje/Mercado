"use client";

/**
 * Cómo le fue a cada archivo y qué pasó con su permiso (Brandon 19-10,
 * ADR-503): «Permiso P-123 · 120 asignadas · 3 ya tenían · 2 con otro permiso
 * (se respetó el suyo) · 4 heredan». Las filas con otro permiso se nombran
 * por número: son las que alguien tiene que mirar.
 */

import { CheckCircle, XCircle } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { TITULO_FORMATO } from "@/lib/forestal/ctp-formatos-serfor";
import type { ResumenDeArchivo } from "@/lib/forestal/ctp-reporte-import";

const cuenta = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function lineaDeFilas(a: ResumenDeArchivo, escrito: boolean): string {
  const partes = [
    escrito ? cuenta(a.creados, "entró", "entraron") : cuenta(a.porCrear, "entraría", "entrarían"),
    a.existen > 0 ? cuenta(a.existen, "ya estaba", "ya estaban") : null,
    a.errores > 0 ? cuenta(a.errores, "quedó afuera", "quedaron afuera") : null,
  ];
  return partes.filter(Boolean).join(" · ");
}

function lineaDePermiso(p: NonNullable<ResumenDeArchivo["permiso"]>): string {
  return [
    `Permiso ${p.codigo}`,
    cuenta(p.asignadas, "asignada", "asignadas"),
    p.yaTenian > 0 ? `${p.yaTenian} ya ${p.yaTenian === 1 ? "lo tenía" : "lo tenían"}` : null,
    p.conflictos > 0 ? `${p.conflictos} con otro permiso (se respetó el suyo)` : null,
    p.heredan > 0 ? `${p.heredan} ${p.heredan === 1 ? "hereda" : "heredan"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function ResumenPorArchivo({ porArchivo, escrito }: { porArchivo: readonly ResumenDeArchivo[]; escrito: boolean }) {
  /* Un solo archivo sin permiso ni falla: la cabecera del reporte ya lo dice todo. */
  if (porArchivo.length === 0 || (porArchivo.length === 1 && !porArchivo[0].permiso && !porArchivo[0].error)) return null;

  return (
    <div className="space-y-2 rounded-lg bg-[var(--surface-sunken)] p-3" data-resumen-por-archivo>
      <p className="flex items-center gap-1.5 text-base font-extrabold text-[var(--text-primary)]">
        Por archivo
        <InfoTip
          icono="ayuda"
          title="El permiso de cada archivo"
          what="Asignadas: venían sin permiso y quedaron con el del archivo. Con otro permiso: traían uno distinto y se respetó el suyo. Heredan: corridas cuyo origen sale de lo que consumieron."
        />
      </p>
      {porArchivo.map((a, i) => (
        <div key={`${a.archivo}-${a.formato}-${i}`} className="text-sm">
          <p className="flex items-start gap-2">
            {a.error || (escrito && a.creados === 0 && a.errores > 0) ? (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-error)]" aria-label="Falló" />
            ) : (
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-success)]" aria-hidden />
            )}
            <span className="min-w-0">
              <strong className="break-all text-[var(--text-primary)]">{a.archivo}</strong>
              <span className="text-[var(--text-tertiary)]"> · {TITULO_FORMATO[a.formato]}</span>
              {" — "}
              {a.error ? (
                <span className="font-semibold text-[var(--data-error)]">falló: {a.error}</span>
              ) : (
                <span className="tabular-nums text-[var(--text-secondary)]">{lineaDeFilas(a, escrito)}</span>
              )}
            </span>
          </p>
          {a.permiso && <p className="ml-6 tabular-nums text-[var(--text-secondary)]">{lineaDePermiso(a.permiso)}</p>}
          {a.conflictos.length > 0 && (
            <p className="ml-6 text-[var(--data-warning)]">
              {a.conflictos
                .slice(0, 6)
                .map((c) => `fila ${c.fila ?? "?"}${c.delArchivo ? ` (${c.delArchivo})` : ""}${c.motivo ? `: ${c.motivo}` : ""}`)
                .join(" · ")}
              {a.conflictos.length > 6 && ` y ${a.conflictos.length - 6} más — están en el CSV`}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

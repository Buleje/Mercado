"use client";

/** Una fila de «Completar las guardadas»: la guardada y sus tres datos (comprador, CCNN, GTF). */
import { AlertTriangle, Check, Loader2, Save } from "@buleje/design-system/icons";
import { formatNumber } from "@/lib/format";
import { fmtPt } from "@/lib/forestal/cubicacion-formato";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import { CAMPO_CUENTA as CAMPO, ETIQUETA_CUENTA as ETIQUETA } from "./cubicacion-cuenta-persona";
import AvisoDeLaGuia from "./cubicador-guardar-aviso-guia";
import { fechaDeLaGuardada } from "./cubicador-guardadas-tarjeta";
import { button } from "@/components/ui-system/button-variants";
import { NUEVA, useAtarFila } from "./hooks/use-atar-fila";
import type { useLibretaDeLaFicha } from "./hooks/use-libreta-de-la-ficha";

export default function FilaParaAtar({ c, libreta, hecho, alGuardar, onRecargar }: {
  c: CubicacionRegistro;
  libreta: ReturnType<typeof useLibretaDeLaFicha>;
  /** Ya se guardó en esta ventana: el resumen de lo que quedó. */
  hecho?: string;
  alGuardar: (resumen: string) => void;
  onRecargar: () => void;
}) {
  const f = useAtarFila(c, libreta, alGuardar);
  const id = `atar-${c.id}`;
  const cabecera = (
    <div className="min-w-0">
      <p className="truncate text-base font-bold text-[var(--text-primary)]">{c.nombre}</p>
      <p className="text-sm text-[var(--text-secondary)]">
        {fechaDeLaGuardada(c.fecha)} · {fmtPt(c.totales.pieTablar)} PT · {formatNumber(c.totales.piezas)} pzas
        {f.escrito && <> · comprador escrito: «{f.escrito}»</>}
      </p>
    </div>
  );
  if (hecho !== undefined) {
    return (
      <li className="space-y-1 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4" data-atar-fila={c.id} data-hecho="1">
        {cabecera}
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" role="status">
          <Check className="h-4 w-4 shrink-0" aria-hidden /> Guardada{hecho ? `: ${hecho}` : ""}.
        </p>
      </li>
    );
  }
  return (
    <li className="space-y-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4" data-atar-fila={c.id}>
      {cabecera}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={`${id}-comprador`} className={ETIQUETA}>Comprador del Directorio</label>
          <select id={`${id}-comprador`} className={CAMPO} value={f.eleccion} onChange={(e) => f.setElegido(e.target.value)}>
            <option value="">Sin atar todavía</option>
            {libreta.compradores.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}{p.id === f.sugerida?.id ? " (sugerida)" : ""}</option>
            ))}
            {f.escrito && <option value={NUEVA}>Crear ficha nueva «{f.escrito}»</option>}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-ccnn`} className={ETIQUETA}>CCNN</label>
          <input id={`${id}-ccnn`} className={CAMPO} value={f.datos.ficha.comunidad ?? ""} maxLength={120} list={`${id}-ccnns`}
            placeholder="Del Directorio o escrita" autoComplete="off" onChange={(e) => f.ponerComunidad(e.target.value)} />
          <datalist id={`${id}-ccnns`}>{libreta.nombresComunidades.map((n) => <option key={n} value={n} />)}</datalist>
        </div>
        <div>
          <label htmlFor={`${id}-gtf`} className={ETIQUETA}>N° de GTF (opcional)</label>
          <input id={`${id}-gtf`} className={CAMPO} value={f.datos.gtf} maxLength={60} placeholder="Ej.: 0012345"
            onChange={(e) => { const v = e.target.value; f.setDatos((d) => ({ ...d, gtf: v })); }}
            onBlur={(e) => void f.guia.buscar(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void f.guia.buscar(e.currentTarget.value); } }} />
        </div>
      </div>
      <AvisoDeLaGuia aviso={f.guia.aviso} onDeshacer={f.guia.deshacer} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {f.error && (
          <p role="alert" className="mr-auto flex items-center gap-2 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {f.error}
          </p>
        )}
        {f.desactualizada && <button type="button" className={button({ variant: "secondary", className: "gap-2 px-4" })} onClick={onRecargar}>Recargar</button>}
        <button type="button" className={button({ className: "gap-2 px-4" })} disabled={!f.hayQueGuardar || f.guardando} onClick={() => void f.guardar()} data-accion="atar-guardar">
          {f.guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          {f.guardando ? "Guardando…" : "Guardar los cambios"}
        </button>
      </div>
    </li>
  );
}

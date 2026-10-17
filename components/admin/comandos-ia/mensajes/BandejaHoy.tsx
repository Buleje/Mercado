"use client";
/**
 * «Para escribir hoy» — la bandeja de a quién conviene escribirle, sin costo
 * de IA (reglas sobre tus datos). Chips por tipo, casillas (≤10), tono y
 * [Redactar los N] con la cifra de IA antes del botón.
 */
import { useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { CheckCircle2, Loader2, MessageCircle, Sparkles } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { ETIQUETA_TIPO, TIPOS_CANDIDATO, type Candidato, type TipoCandidato } from "@/lib/admin/comandos-ia/candidatos";
import type { Tono } from "@/lib/admin/comandos-ia/plantillas-sin-ia";
import {
  BOTON_PRIMARIO,
  BOTON_SECUNDARIO,
  CHIP_ACTIVO,
  CHIP_BASE,
  CHIP_INACTIVO,
  costoEstimado,
  costoTexto,
  datoDeFila,
  type Bandeja,
} from "./use-mensajes";

export type Hecho = "enviado" | "recordado" | "cerrado";
const ETIQUETA_HECHO: Record<Hecho, string> = { enviado: "WhatsApp abierto", recordado: "Recordatorio creado", cerrado: "Cerrado" };
const MAX = 10;

export default function BandejaHoy({
  bandeja, hechos, redactando, conBorrador, onRedactar, onCerrarSeguimiento, cerrando,
}: {
  bandeja: Bandeja;
  hechos: Record<string, Hecho>;
  redactando: boolean;
  conBorrador: ReadonlySet<string>;
  onRedactar: (ids: string[], tono: Tono) => void;
  onCerrarSeguimiento: (c: Candidato) => void;
  cerrando: string | null;
}) {
  const [filtro, setFiltro] = useState<TipoCandidato | "todos">("todos");
  const [tono, setTono] = useState<Tono>("amable");
  const [quitados, setQuitados] = useState<ReadonlySet<string>>(new Set());

  const escribibles = (c: Candidato) => !c.pagado && !hechos[c.id];
  const visibles = useMemo(
    () => bandeja.candidatos.filter((c) => filtro === "todos" || c.tipo === filtro),
    [bandeja.candidatos, filtro],
  );
  // Marcados = los visibles que se pueden escribir, menos los que destildaste (tope 10).
  const marcados = visibles.filter((c) => escribibles(c) && !quitados.has(c.id)).slice(0, MAX);
  const marcadosIds = new Set(marcados.map((c) => c.id));
  const conteo = TIPOS_CANDIDATO.map((t) => [t, bandeja.candidatos.filter((c) => c.tipo === t).length] as const).filter(([, n]) => n > 0);

  const alternar = (id: string) =>
    setQuitados((q) => {
      const n = new Set(q);
      if (marcadosIds.has(id)) n.add(id);
      else n.delete(id);
      return n;
    });

  return (
    <section aria-labelledby="ci-bandeja-titulo" className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <CardTitle id="ci-bandeja-titulo" as="h3">Para escribir hoy</CardTitle>
          <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-sm font-semibold tabular-nums text-[var(--text-secondary)]">{bandeja.candidatos.length}</span>
          <InfoTip
            title="Para escribir hoy"
            what="Fiados vencidos o que vencen en 7 días, clientes que dejaron de venir (más del doble de su ritmo) y recordatorios que ya tocan."
            affects="Armar la lista no cuesta IA. Solo redactar usa IA, y ves la cifra antes."
            example="Rosa debe S/ 45 hace 12 días · Juan venía cada 7 días y lleva 20 sin venir."
            side="bottom"
          />
        </div>
        {/* Tono, costo y «Redactar» en UNA fila también a 400 px (flex-nowrap):
            a 48 px y 14 px entran si el botón suelta su ícono en el celular. */}
        <div className="flex w-full flex-nowrap items-center gap-2 sm:w-auto" data-acciones-bandeja>
          <div role="group" aria-label="Tono" className="inline-flex shrink-0 overflow-hidden rounded-xl border border-[var(--rule-base)]">
            {(["amable", "claro"] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tono === t}
                onClick={() => setTono(t)}
                className={cn("h-12 px-3 text-sm font-semibold capitalize transition-colors", tono === t ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]")}
              >
                {t}
              </button>
            ))}
          </div>
          <span className="ml-auto whitespace-nowrap text-sm tabular-nums text-[var(--text-tertiary)] sm:ml-0" data-costo-estimado><span className="max-sm:hidden">IA </span>≈ {costoTexto(costoEstimado(marcados.length))}</span>
          <button type="button" className={cn(BOTON_PRIMARIO, "shrink-0 max-sm:px-3")} disabled={redactando || marcados.length === 0} onClick={() => onRedactar(marcados.map((c) => c.id), tono)} data-redactar-todos>
            {redactando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4 max-sm:hidden" aria-hidden />}
            {/* Un solo nodo: el gap del botón separaba «Redactar · los · 10» como tres piezas. */}
            <span>Redactar {marcados.length === 1 ? "1" : <><span className="max-sm:hidden">los </span>{marcados.length}</>}</span>
          </button>
        </div>
      </div>

      {conteo.length > 1 && (
        <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filtrar por tipo">
          <button type="button" aria-pressed={filtro === "todos"} onClick={() => setFiltro("todos")} className={cn(CHIP_BASE, filtro === "todos" ? CHIP_ACTIVO : CHIP_INACTIVO)}>
            Todos <span className="tabular-nums">{bandeja.candidatos.length}</span>
          </button>
          {conteo.map(([t, n]) => (
            <button key={t} type="button" aria-pressed={filtro === t} onClick={() => setFiltro(t)} className={cn(CHIP_BASE, filtro === t ? CHIP_ACTIVO : CHIP_INACTIVO)}>
              {ETIQUETA_TIPO[t]} <span className="tabular-nums">{n}</span>
            </button>
          ))}
        </div>
      )}

      <ul className="mt-3 divide-y divide-[var(--rule-soft)]" data-bandeja>
        {visibles.map((c) => {
          const hecho = hechos[c.id];
          const marcado = marcadosIds.has(c.id);
          return (
            <li key={c.id} className="flex items-center gap-2 py-2" data-candidato={c.id}>
              {/* La casilla se ve de 20 px; se toca en 48 (toda la celda es el label). */}
              <label className="-ml-3 inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center">
                <input
                  type="checkbox"
                  aria-label={`Incluir a ${c.nombre}`}
                  checked={marcado}
                  disabled={!escribibles(c) || (!marcado && marcados.length >= MAX)}
                  onChange={() => alternar(c.id)}
                  className="h-5 w-5 accent-[var(--accent)]"
                />
              </label>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="truncate font-semibold text-[var(--text-primary)]">{c.nombre}</span>
                  <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-sm font-medium text-[var(--text-secondary)]">{ETIQUETA_TIPO[c.tipo]}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-[var(--text-secondary)]">
                  <span className={cn("tabular-nums", c.tipo === "fiado-vencido" && "font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]")}>{datoDeFila(c)}</span>
                  <InfoTip title="De dónde sale" what={c.origen} side="bottom" ariaLabel={`De dónde sale el dato de ${c.nombre}`} />
                  {!c.telefono && <span className="text-[var(--text-tertiary)]">· sin teléfono</span>}
                </div>
              </div>
              <div className="shrink-0">
                {hecho ? (
                  <span className="inline-flex h-12 items-center gap-1 text-sm font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                    <CheckCircle2 className="h-4 w-4" aria-hidden /> <span className="max-sm:sr-only">{ETIQUETA_HECHO[hecho]}</span>
                  </span>
                ) : c.pagado && c.recordatorioId ? (
                  <button type="button" className={BOTON_SECUNDARIO} disabled={cerrando === c.id} onClick={() => onCerrarSeguimiento(c)} data-cerrar-seguimiento>
                    {cerrando === c.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
                    Cerrar
                  </button>
                ) : (
                  <button
                    type="button"
                    className={BOTON_SECUNDARIO}
                    disabled={redactando}
                    onClick={() => onRedactar([c.id], tono)}
                    aria-label={conBorrador.has(c.id) ? `Ver el mensaje para ${c.nombre}` : `Escribirle a ${c.nombre}`}
                    data-escribirle
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden />
                    <span className="max-sm:hidden">{conBorrador.has(c.id) ? "Ver mensaje" : "Escribirle"}</span>
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

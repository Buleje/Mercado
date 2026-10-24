"use client";

/**
 * Una cubicación guardada como TARJETA GRANDE (Brandon 23-10: «bloques grandes
 * para ver que se entienda bien hecho y fácil de usar; al presionar podré usar
 * lo guardado para pasarlo a cubicador de madera, modificar, quitar»).
 *
 * A la vista: nombre, día, especies, PT · m³ · piezas, dueños y si ya está en
 * el Libro; una acción grande («Abrir en el cubicador») y el resto en «⋯».
 * «En el Libro» lo dice el SERVIDOR (líneas vivas, no el id pelado): con eso
 * «Borrar» queda apagado y el ⓘ dice qué línea y el camino para sacarla.
 * El papel de la hoja se despliega en la tarjeta: montado siempre, cada tarjeta
 * pediría sus papeles al Archivo (una lista de 40 = 40 pedidos al abrir).
 */
import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { BookOpen, ChevronDown, Copy, Eye, FileText, FolderOpen, GitCompareArrows, Loader2, Trash2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import type { EnLibroDeGuardada } from "@/components/admin/forestal/hooks/use-guardadas-del-cubicador";
import { PapelDelCubicador } from "@/components/admin/forestal/cubicador-papel/PapelDelCubicador";
import { codigoDeHoja } from "@/components/admin/forestal/cubicador-papel/papel-cubicador";
import { especiesDeCubicacion } from "@/lib/forestal/cubicacion-diferencias";
import { corridasDeCubicacion, type CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import { m3DesdePt } from "@/lib/forestal/cubicacion";
import { formatNumber } from "@/lib/format";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

/** «2026-09-10» → «jueves 10/09» (con el año si no es el de hoy). Date-only: en UTC. */
export function fechaDeLaGuardada(iso: string, anioDeHoy = new Date().getUTCFullYear()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return iso ?? "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const base = `${DIAS[d.getUTCDay()]} ${m[3]}/${m[2]}`;
  return Number(m[1]) === anioDeHoy ? base : `${base}/${m[1]}`;
}

const distintos = (xs: readonly (string | null | undefined)[]): string[] =>
  [...new Set(xs.map((x) => (x ?? "").trim()).filter(Boolean))];

/** Las especies del lote: las de sus piezas; si ninguna la tiene, la del lote (single source en `cubicacion-diferencias`). */
export const especiesDe = (c: CubicacionRegistro): string[] => especiesDeCubicacion(c);

/** De quién es la madera: los dueños de sus piezas y el cliente del lote. */
export const duenosDe = (c: CubicacionRegistro): string[] => distintos([...c.piezas.map((p) => p.dueno), c.cliente]);

/** «CCNN Santa Rosa», «C.N. Puerto Nuevo», «Comunidad …»: si ya lo dice, no se antepone otro «CCNN». */
const YA_DICE_CCNN = /^(ccnn|c\.\s?n\.?|cc\.?\s?nn\.?|comunidad)(\s|$)/i;

/* Los botones del DS (48 px, ADR-489): la acción principal arriba, a lo ancho;
   debajo «Ver detalle» y «Papel» parejos (los tres en una fila no entran en la
   tarjeta y «Papel» quedaba solo en la segunda). */
const BOTON_ABRIR = button({ variant: "accent", className: "basis-full px-4 text-base" });
const BOTON_SECUNDARIO = button({ variant: "secondary", className: "min-w-0 flex-1 gap-1.5 px-4" });

export function TarjetaGuardada({ c, enLibro, abierta, papeles, borrando, copiado, onAbrir, onVerDetalle, onComparar, onDuplicar, onCopiarCodigo, onBorrar }: {
  c: CubicacionRegistro;
  /** Las líneas vivas del Libro que ampara (del servidor). Ausente = no está en el Libro. */
  enLibro?: EnLibroDeGuardada;
  /** Es la que está cargada en el cubicador ahora. */
  abierta: boolean;
  /** Papeles vinculados (foto/PDF de la hoja llena), de una sola lectura para toda la lista. */
  papeles: number;
  borrando: boolean;
  copiado: boolean;
  onAbrir: () => void;
  /** El detalle en una ventana: datos, cifras y resúmenes, sin abrirla en el cubicador. */
  onVerDetalle: () => void;
  /** Comparar contra otra guardada; ausente = no hay otra. */
  onComparar?: () => void;
  onDuplicar: () => void;
  onCopiarCodigo: () => void;
  onBorrar: () => void;
}) {
  const [conPapel, setConPapel] = useState(false);
  /* Ligada a líneas que hoy están anuladas o ya no existen: ya no está en el Libro. */
  const yaNoEsta = !enLibro && corridasDeCubicacion(c).length > 0;
  const lineas = enLibro ? [...enLibro.lineas].sort((a, b) => a.lineNo - b.lineNo).map((l) => `N° ${l.lineNo}`).join(", ") : "";
  const especies = especiesDe(c);
  /* El «De …» son los dueños de las piezas: el cliente va en su propia línea. */
  const duenos = distintos(c.piezas.map((p) => p.dueno));
  const comunidad = c.ficha?.comunidad;
  const pt = c.totales.pieTablar;
  const codigo = codigoDeHoja("aserrada", c.id);
  const acciones: MenuAccion[] = [
    ...(onComparar
      ? [{ id: "comparar", label: "Comparar con otra…", hint: "Diferencia en PT, m³, piezas y medidas contra otra guardada", icon: GitCompareArrows, onSelect: onComparar }]
      : []),
    { id: "duplicar", label: "Duplicar", hint: "Abre una copia: la original queda como está", icon: Copy, onSelect: onDuplicar },
    {
      id: "codigo",
      label: copiado ? "Código copiado" : "Copiar código",
      hint: "Para pegarlo en Resumen por Permiso como objetivo",
      icon: Copy,
      onSelect: onCopiarCodigo,
    },
    {
      id: "borrar",
      label: "Borrar",
      hint: enLibro ? "No se borra: está en el Libro. Primero anula su línea en el Libro › Producción" : undefined,
      icon: Trash2,
      tone: "danger",
      busy: borrando,
      disabled: Boolean(enLibro),
      onSelect: onBorrar,
    },
  ];

  return (
    <article
      data-cubicacion={c.id}
      aria-label={c.nombre}
      className={`flex flex-col gap-3 rounded-2xl border bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-sm)] ${
        abierta ? "border-[var(--accent)] ring-1 ring-[var(--accent)]" : "border-[var(--rule-base)]"
      }`}
    >
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <CardTitle as="h3" className="break-words text-base font-bold leading-snug text-[var(--text-primary)]">
            {c.nombre}
          </CardTitle>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            {fechaDeLaGuardada(c.fecha)}
            {c.gtfNumber ? <> · GTF {c.gtfNumber}</> : null}
            {c.createdBy ? <> · {c.createdBy}</> : null}
          </p>
        </div>
        <ActionMenu label="Más opciones" soloIcono size="sm" actions={acciones} title={`Más opciones de ${c.nombre}`} />
      </header>

      <div className="flex flex-wrap gap-1.5">
        <span
          className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-bold ${
            enLibro
              ? "bg-[var(--data-success-50)] text-[var(--data-success-ink)] dark:bg-[var(--data-success-500)]/15"
              : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
          }`}
        >
          {enLibro && <BookOpen className="h-4 w-4" aria-hidden />}
          {enLibro ? `En el Libro · ${lineas}` : yaNoEsta ? "Su línea del Libro ya no está" : "Sin enviar al Libro"}
        </span>
        {enLibro && (
          <InfoTip
            ariaLabel="Por qué no se puede borrar"
            what={enLibro.motivo}
            example="Abrir y Duplicar siguen andando: la copia sale sin la línea del Libro."
          />
        )}
        {abierta && (
          <span className="inline-flex items-center rounded-lg bg-primary/10 px-2 py-1 text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
            Abierta ahora
          </span>
        )}
        {especies.map((e) => (
          <span key={e} className="inline-flex items-center rounded-lg border border-[var(--rule-base)] px-2 py-1 text-sm font-semibold text-[var(--text-primary)]">
            {e}
          </span>
        ))}
      </div>

      <dl className="grid grid-cols-3 divide-x divide-[var(--rule-base)] rounded-xl bg-[var(--surface-sunken)] py-3 text-center">
        <div>
          <dt className="text-xs font-semibold text-[var(--text-tertiary)]">Pie tablar</dt>
          <dd className="font-mono text-xl font-extrabold tabular-nums text-[var(--text-primary)]">{formatNumber(pt, 2)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-[var(--text-tertiary)]">m³</dt>
          <dd className="font-mono text-xl font-extrabold tabular-nums text-[var(--text-primary)]">{formatNumber(m3DesdePt(pt), 3)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-[var(--text-tertiary)]">Piezas</dt>
          <dd className="font-mono text-xl font-extrabold tabular-nums text-[var(--text-primary)]">{formatNumber(c.totales.piezas)}</dd>
        </div>
      </dl>

      {(c.cliente || comunidad) && (
        <p className="break-words text-sm text-[var(--text-secondary)]" data-dato="cliente-ccnn">
          {c.cliente && <>Cliente <span className="font-semibold text-[var(--text-primary)]">{c.cliente}</span></>}
          {c.cliente && comunidad && " · "}
          {comunidad && <>{YA_DICE_CCNN.test(comunidad) ? "" : "CCNN "}<span className="font-semibold text-[var(--text-primary)]">{comunidad}</span></>}
        </p>
      )}

      {(duenos.length > 0 || c.valor > 0) && (
        <p className="text-sm text-[var(--text-secondary)]">
          {duenos.length > 0 && <>De <span className="font-semibold text-[var(--text-primary)]">{duenos.join(", ")}</span></>}
          {duenos.length > 0 && c.valor > 0 && " · "}
          {c.valor > 0 && <span className="font-mono tabular-nums">S/ {formatNumber(c.valor, 2)}</span>}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <button type="button" onClick={onAbrir} disabled={borrando} className={BOTON_ABRIR} data-accion="abrir-guardada">
          {borrando ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <FolderOpen className="h-5 w-5" aria-hidden />}
          {abierta ? "Volver a abrirla" : "Abrir en el cubicador"}
        </button>
        <button type="button" onClick={onVerDetalle} className={BOTON_SECUNDARIO} data-accion="ver-detalle">
          <Eye className="h-4 w-4" aria-hidden /> Ver detalle
        </button>
        <button
          type="button"
          onClick={() => setConPapel((v) => !v)}
          aria-expanded={conPapel}
          className={BOTON_SECUNDARIO}
          title={`Formato para imprimir y la foto de la hoja llena · código ${codigo}`}
        >
          <FileText className="h-4 w-4" aria-hidden /> Papel
          {papeles > 0 && (
            <span className="rounded-md bg-[var(--accent-soft)] px-1.5 text-xs font-bold tabular-nums text-[var(--accent-ink)] dark:text-[var(--accent)]">{papeles}</span>
          )}
          <ChevronDown className={`h-4 w-4 transition-transform ${conPapel ? "rotate-180" : ""}`} aria-hidden />
        </button>
      </div>

      {conPapel && <PapelDelCubicador tipo="aserrada" cubicacionId={c.id} etiqueta={c.nombre} variante="tarjeta" />}
    </article>
  );
}

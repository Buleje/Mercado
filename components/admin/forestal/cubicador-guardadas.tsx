"use client";

/**
 * Sección «Guardadas» del cubicador de madera: las cubicaciones del negocio en
 * tarjetas grandes, con buscador (texto, código de la hoja) y especie. Abrir una
 * la pasa al cubicador para modificarla y volver a guardarla encima.
 *
 * Reemplaza a `CubicacionesGuardadas` (la lista que se desplegaba debajo del
 * lote desde «Lote ▾») sin perder nada: buscar, abrir, duplicar, copiar el
 * código para Resumen por Permiso, borrar con confirmación y la suma de lo
 * filtrado. Las sumas son de los totales que guardó el servidor (no se recubica).
 */
import { useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, FileText, Loader2, RefreshCw, Search, X } from "@buleje/design-system/icons";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { codigoDeHoja, filtrarPorHoja } from "@/components/admin/forestal/cubicador-papel/papel-cubicador";
import { usePapelesDeCubicaciones } from "@/components/admin/forestal/cubicador-papel/use-papel";
import { corridasDeCubicacion, type CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import { m3DesdePt } from "@/lib/forestal/cubicacion";
import { formatNumber } from "@/lib/format";
import { logger } from "@/lib/logger";
import { TarjetaGuardada, duenosDe, especiesDe } from "./cubicador-guardadas-tarjeta";
import { useGuardadasDelCubicador } from "./hooks/use-guardadas-del-cubicador";

const TODAS = "";

const camposDeBusqueda = (c: CubicacionRegistro) => ({
  codigos: [codigoDeHoja("aserrada", c.id), c.id, c.gtfNumber],
  textos: [c.nombre, c.cliente, c.especie, c.fecha, c.notas, c.gtfNumber, ...especiesDe(c), ...duenosDe(c)],
});

export function GuardadasDelCubicador({ onAbrir, onBorrada, abiertaId, recargarToken, onCerrar }: {
  onAbrir: (c: CubicacionRegistro) => void;
  /** Se borró una: si era la abierta, el cubicador deja de apuntarle. */
  onBorrada?: (id: string) => void;
  abiertaId?: string | null;
  recargarToken?: number;
  /** Sólo dentro de otra ventana (producir sin lote): la lista va debajo del lote y se cierra. */
  onCerrar?: () => void;
}) {
  const { lista, cargando, error, borrando, recargar, borrar } = useGuardadasDelCubicador(recargarToken);
  const { porId: papeles } = usePapelesDeCubicaciones(true);
  const { confirm } = useConfirm();
  const [busqueda, setBusqueda] = useState("");
  const [especie, setEspecie] = useState(TODAS);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  const especies = useMemo(() => [...new Set(lista.flatMap(especiesDe))].sort((a, b) => a.localeCompare(b, "es")), [lista]);
  const visibles = useMemo(() => {
    const porTexto = filtrarPorHoja(lista, busqueda, camposDeBusqueda);
    return especie ? porTexto.filter((c) => especiesDe(c).includes(especie)) : porTexto;
  }, [lista, busqueda, especie]);
  const filtrando = Boolean(busqueda.trim() || especie);
  const suma = useMemo(
    () => visibles.reduce((a, c) => ({ pt: a.pt + c.totales.pieTablar, valor: a.valor + c.valor, piezas: a.piezas + c.totales.piezas }), { pt: 0, valor: 0, piezas: 0 }),
    [visibles],
  );

  const copiarCodigo = (c: CubicacionRegistro) => {
    navigator.clipboard
      ?.writeText(c.id)
      .then(() => {
        setCopiadoId(c.id);
        setTimeout(() => setCopiadoId((v) => (v === c.id ? null : v)), 1500);
      })
      .catch((err: unknown) => logger.warn("[cubicador] no se pudo copiar el código", { error: String(err) }));
  };

  const pedirBorrar = async (c: CubicacionRegistro) => {
    const enLibro = corridasDeCubicacion(c).length > 0;
    const ok = await confirm({
      title: `¿Borrar «${c.nombre}»?`,
      description: enLibro
        ? "Ya está en el Libro: esa línea queda, pero se pierden sus medidas pieza por pieza (las que usa el Anexo 04). No se puede deshacer."
        : "No se puede deshacer.",
      intent: "danger",
      confirmLabel: "Sí, borrar",
    });
    if (!ok) return;
    if (await borrar(c.id)) onBorrada?.(c.id);
  };

  const duplicar = (c: CubicacionRegistro) => onAbrir({ ...c, id: "", nombre: `${c.nombre} (copia)`, ctpEntryId: undefined, ctpEntryIds: undefined });

  return (
    <section aria-label="Cubicaciones guardadas" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <FileText className="h-5 w-5 text-[var(--accent)]" aria-hidden /> Cubicaciones guardadas
          {!cargando && <span className="font-mono text-sm tabular-nums text-[var(--text-tertiary)]">({lista.length})</span>}
        </CardTitle>
        <InfoTip
          what="Cada lote que guardaste con «Guardar» o que mandaste al Libro."
          affects="«Abrir en el cubicador» lo carga para cambiarlo; al guardar, se guarda encima de la misma."
          example="Buscas «MA-7K3» (el código impreso en su hoja) o «Tornillo» y sale el lote."
        />
        {onCerrar && (
          <button type="button" onClick={onCerrar} aria-label="Cerrar las guardadas" className="ml-auto inline-flex min-h-10 items-center rounded-xl border border-[var(--rule-base)] px-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="flex min-w-0 flex-[1_1_16rem] items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 focus-within:border-[var(--accent)]">
          <Search className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, dueño, guía o código de la hoja"
            aria-label="Buscar cubicaciones guardadas"
            className="h-12 min-w-0 flex-1 border-0! bg-transparent! text-base text-[var(--text-primary)] shadow-none! outline-none ring-0!"
          />
        </label>
        {especies.length > 1 && (
          <select
            value={especie}
            onChange={(e) => setEspecie(e.target.value)}
            aria-label="Filtrar por especie"
            className="h-12 min-w-0 flex-[0_1_12rem] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-base text-[var(--text-primary)] focus:border-[var(--accent)]"
          >
            <option value={TODAS}>Todas las especies</option>
            {especies.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        )}
      </div>

      {error && (
        <p role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-3 py-2 text-sm font-semibold text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/12">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {error}
          <button type="button" onClick={recargar} className="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-current px-2.5 text-sm font-bold">
            <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
          </button>
        </p>
      )}

      {cargando ? (
        <p className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Buscando tus cubicaciones…
        </p>
      ) : visibles.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--rule-base)] py-10 text-center text-sm text-[var(--text-secondary)]">
          {lista.length === 0 ? "Todavía no guardaste ninguna. Cubica un lote y toca «Guardar»." : "Ninguna coincide con la búsqueda."}
        </p>
      ) : (
        <>
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-[var(--text-secondary)]">
            {filtrando ? `Suma de las ${visibles.length} que se ven` : `Suma de las ${visibles.length}`}
            <span className="font-mono font-extrabold tabular-nums text-[var(--text-primary)]">
              {formatNumber(suma.pt, 2)} PT · {formatNumber(m3DesdePt(suma.pt), 3)} m³ · {formatNumber(suma.piezas)} pzas
              {suma.valor > 0 && <> · S/ {formatNumber(suma.valor, 2)}</>}
            </span>
          </p>
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {visibles.map((c) => (
              <TarjetaGuardada
                key={c.id}
                c={c}
                abierta={Boolean(abiertaId) && abiertaId === c.id}
                papeles={papeles.get(c.id) ?? 0}
                borrando={borrando === c.id}
                copiado={copiadoId === c.id}
                onAbrir={() => onAbrir(c)}
                onDuplicar={() => duplicar(c)}
                onCopiarCodigo={() => copiarCodigo(c)}
                onBorrar={() => void pedirBorrar(c)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

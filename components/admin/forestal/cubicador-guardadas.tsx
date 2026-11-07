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
import { AlertTriangle, FileText, GitCompareArrows, Loader2, RefreshCw, Search, X } from "@buleje/design-system/icons";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { codigoDeHoja, filtrarPorHoja } from "@/components/admin/forestal/cubicador-papel/papel-cubicador";
import { usePapelesDeCubicaciones } from "@/components/admin/forestal/cubicador-papel/use-papel";
import { corridasDeCubicacion, textosDeFicha, type CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import { m3DesdePt } from "@/lib/forestal/cubicacion";
import { agruparPorFicha, clasificar, deLaFila, type PorFicha } from "@/lib/forestal/cubicacion-por-ficha";
import { formatNumber } from "@/lib/format";
import { logger } from "@/lib/logger";
import { TarjetaGuardada, duenosDe, especiesDe } from "./cubicador-guardadas-tarjeta";
import { useGuardadasDelCubicador } from "./hooks/use-guardadas-del-cubicador";
import { DetalleCubicacionModal } from "./cubicador-detalle-modal";
import { CompararCubicacionesModal } from "./cubicador-comparar-modal";
import { ResumenPorFicha } from "./cubicador-guardadas-resumen";
import { MargenDelMes } from "./cubicador-guardadas-margen-mes";
import AtarGuardadasModal from "./cubicador-atar-modal";
import { AvisosDeGuardadas } from "./cubicador-guardadas-avisos";
import { SalidasDeLaCubicacionModal } from "./cubicador-salidas-modal";
import { resumenEnPatio } from "./cubicador-salidas-logica";
import { useRendimientoDeGuias } from "./hooks/use-rendimiento-de-guias";
import { necesitaAtar } from "@/lib/forestal/cubicacion-atar";
import { mismoNumeroGtf } from "@/lib/forestal/gtf-talonario";
import { numerosDeGuia, rendimientoPorFicha, resumenSinGuia, sinGtf } from "@/lib/forestal/cubicacion-guia-resumen";

const TODAS = "";

const camposDeBusqueda = (c: CubicacionRegistro) => ({
  codigos: [codigoDeHoja("aserrada", c.id), c.id, c.gtfNumber],
  textos: [c.nombre, c.cliente, c.especie, c.fecha, c.notas, c.gtfNumber, ...especiesDe(c), ...duenosDe(c), ...textosDeFicha(c.ficha)],
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
  const { lista, enLibro, cargando, error, borrando, recargar, borrar, reemplazar } = useGuardadasDelCubicador(recargarToken);
  const { porId: papeles } = usePapelesDeCubicaciones(true);
  const { confirm } = useConfirm();
  const [busqueda, setBusqueda] = useState("");
  const [especie, setEspecie] = useState(TODAS);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  /* Una ventana a la vez: «Comparar con otra…» desde el detalle lo cierra y abre el comparador. */
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [comparar, setComparar] = useState<{ aId: string | null } | null>(null);
  /* «Completar»: las guardadas sin comprador del Directorio. La lista de la ventana se fija al abrirla. */
  const [atarIds, setAtarIds] = useState<string[] | null>(null);
  const sinParte = useMemo(() => lista.filter(necesitaAtar), [lista]);
  const detalle = detalleId ? lista.find((c) => c.id === detalleId) ?? null : null;
  /* «Salidas» vive acá y no en la tarjeta: con el filtro «en patio», un viaje de «todo» la saca de la grilla. */
  const [salidasId, setSalidasId] = useState<string | null>(null);
  const salidasDe = salidasId ? lista.find((c) => c.id === salidasId) : undefined;
  /* Los otros camiones de la misma GTF: el rendimiento y el margen del detalle suman todos. */
  const deLaMismaGuia = useMemo(
    () => (detalle?.gtfNumber ? lista.filter((x) => x.id !== detalle.id && mismoNumeroGtf(x.gtfNumber, detalle.gtfNumber)) : []),
    [lista, detalle],
  );
  const puedeComparar = lista.length > 1;
  /* La lista dentro de «Producir sin lote» ya está en una ventana: las suyas van encima. */
  const dentroDeVentana = Boolean(onCerrar);

  const especies = useMemo(() => [...new Set(lista.flatMap(especiesDe))].sort((a, b) => a.localeCompare(b, "es")), [lista]);
  const visibles = useMemo(() => {
    const porTexto = filtrarPorHoja(lista, busqueda, camposDeBusqueda);
    return especie ? porTexto.filter((c) => especiesDe(c).includes(especie)) : porTexto;
  }, [lista, busqueda, especie]);
  /* «N sin GTF»: de lo visible; tocarlo deja sólo esas (y el resumen de abajo las sigue). */
  const [soloSinGuia, setSoloSinGuia] = useState(false);
  const sinGuia = useMemo(() => resumenSinGuia(visibles), [visibles]);
  const filtraSinGuia = soloSinGuia && sinGuia.cantidad > 0;
  const [soloEnPatio, setSoloEnPatio] = useState(false);
  const enPatio = useMemo(() => resumenEnPatio(visibles), [visibles]);
  const filtraEnPatio = soloEnPatio && enPatio.conViajes > 0;
  const base = useMemo(
    () => visibles.filter((c) => (!filtraSinGuia || sinGtf(c)) && (!filtraEnPatio || enPatio.ids.has(c.id))),
    [visibles, filtraSinGuia, filtraEnPatio, enPatio],
  );
  /* El resumen por comunidad/comprador es de lo visible; tocar una fila filtra las tarjetas. */
  const [por, setPor] = useState<PorFicha>("comunidad");
  const [claveFicha, setClaveFicha] = useState<string | null>(null);
  const filasFicha = useMemo(() => agruparPorFicha(base, por), [base, por]);
  const claveActiva = claveFicha && filasFicha.some((f) => f.clave === claveFicha) ? claveFicha : null;
  const mostradas = useMemo(() => (claveActiva ? deLaFila(base, por, claveActiva) : base), [base, por, claveActiva]);
  const filtrando = Boolean(busqueda.trim() || especie || claveActiva || filtraSinGuia || filtraEnPatio);
  /* «Rinde» por comunidad: las guías de TODA la lista, pedidas juntas (no se repiden al filtrar). */
  const { guias, cargando: cargandoGuias } = useRendimientoDeGuias(useMemo(() => numerosDeGuia(lista), [lista]));
  const rinde = useMemo(() => (por === "comunidad" ? rendimientoPorFicha(base, clasificar(base, por), guias) : null), [base, por, guias]);
  const suma = useMemo(
    () => mostradas.reduce((a, c) => ({ pt: a.pt + c.totales.pieTablar, valor: a.valor + c.valor, piezas: a.piezas + c.totales.piezas }), { pt: 0, valor: 0, piezas: 0 }),
    [mostradas],
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
    /* En el Libro no se borra (el menú ya lo apaga; el servidor responde 409 igual). */
    if (enLibro[c.id]) return;
    const ligadaVieja = corridasDeCubicacion(c).length > 0;
    const ok = await confirm({
      title: `¿Borrar «${c.nombre}»?`,
      description: ligadaVieja
        ? "Su línea del Libro ya se anuló o no existe: se borran sus medidas pieza por pieza. No se puede deshacer."
        : "No se puede deshacer.",
      intent: "danger",
      confirmLabel: "Sí, borrar",
    });
    if (!ok) return;
    if (await borrar(c.id)) onBorrada?.(c.id);
  };

  /* La copia es otro lote: sin el hilo al Libro ni los viajes del original (los escribe sólo el servidor). */
  const duplicar = (c: CubicacionRegistro) => onAbrir({ ...c, id: "", nombre: `${c.nombre} (copia)`, ctpEntryId: undefined, ctpEntryIds: undefined, salidas: undefined });

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
        {puedeComparar && (
          <button
            type="button"
            onClick={() => setComparar({ aId: null })}
            className={button({ variant: "secondary", className: "ml-auto gap-1.5 px-4" })}
            data-accion="comparar-dos"
          >
            <GitCompareArrows className="h-4 w-4" aria-hidden /> Comparar dos
          </button>
        )}
        {onCerrar && (
          <button type="button" onClick={onCerrar} aria-label="Cerrar las guardadas" className={`${puedeComparar ? "" : "ml-auto "}inline-flex min-h-10 items-center rounded-xl border border-[var(--rule-base)] px-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)]`}>
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

      {!cargando && (
        <AvisosDeGuardadas
          sinComprador={sinParte.length}
          sinGuia={sinGuia}
          filtrandoSinGuia={soloSinGuia}
          onCompletarComprador={() => setAtarIds(sinParte.map((c) => c.id))}
          onCompletarGuia={() => setAtarIds(sinGuia.ids)}
          onFiltrarSinGuia={() => setSoloSinGuia((v) => !v)}
          enPatio={enPatio}
          filtrandoEnPatio={filtraEnPatio}
          onFiltrarEnPatio={() => setSoloEnPatio((v) => !v)}
        />
      )}

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
          <ResumenPorFicha
            por={por}
            onPor={(p) => { setPor(p); setClaveFicha(null); }}
            filas={filasFicha}
            elegida={claveActiva}
            onElegir={setClaveFicha}
            rinde={rinde}
            cargandoRinde={cargandoGuias}
          />
          {/* De TODAS las guardadas (no de lo filtrado): el mes se elige adentro. */}
          {!dentroDeVentana && <MargenDelMes lista={lista} guias={guias} cargandoGuias={cargandoGuias} />}
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-[var(--text-secondary)]">
            {filtrando ? `Suma de las ${mostradas.length} que se ven` : `Suma de las ${mostradas.length}`}
            <span className="font-mono font-extrabold tabular-nums text-[var(--text-primary)]">
              {formatNumber(suma.pt, 2)} PT · {formatNumber(m3DesdePt(suma.pt), 3)} m³ · {formatNumber(suma.piezas)} pzas
              {suma.valor > 0 && <> · S/ {formatNumber(suma.valor, 2)}</>}
            </span>
          </p>
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {mostradas.map((c) => (
              <TarjetaGuardada
                key={c.id}
                c={c}
                enLibro={enLibro[c.id]}
                abierta={Boolean(abiertaId) && abiertaId === c.id}
                papeles={papeles.get(c.id) ?? 0}
                borrando={borrando === c.id}
                copiado={copiadoId === c.id}
                onAbrir={() => onAbrir(c)}
                onVerDetalle={() => setDetalleId(c.id)}
                onSalidas={() => setSalidasId(c.id)}
                onComparar={puedeComparar ? () => setComparar({ aId: c.id }) : undefined}
                onDuplicar={() => duplicar(c)}
                onCopiarCodigo={() => copiarCodigo(c)}
                onBorrar={() => void pedirBorrar(c)}
              />
            ))}
          </div>
        </>
      )}

      {atarIds && (
        <AtarGuardadasModal
          cubicaciones={atarIds.map((id) => lista.find((x) => x.id === id)).filter((x): x is CubicacionRegistro => Boolean(x))}
          aboveModals={dentroDeVentana}
          onGuardada={recargar} onRecargar={recargar} onClose={() => setAtarIds(null)}
        />
      )}
      {detalle && (
        <DetalleCubicacionModal
          c={detalle}
          deLaMismaGuia={deLaMismaGuia}
          enLibro={enLibro[detalle.id]}
          aboveModals={dentroDeVentana}
          puedeComparar={puedeComparar}
          onClose={() => setDetalleId(null)}
          onAbrir={() => { setDetalleId(null); onAbrir(detalle); }}
          onComparar={() => { setDetalleId(null); setComparar({ aId: detalle.id }); }}
          onCompraAMano={reemplazar}
        />
      )}
      {salidasDe && (
        <SalidasDeLaCubicacionModal c={salidasDe} aboveModals={dentroDeVentana} onClose={() => setSalidasId(null)} onGuardada={reemplazar} />
      )}
      {comparar && (
        <CompararCubicacionesModal key={comparar.aId ?? "dos"} lista={lista} inicialA={comparar.aId}
          aboveModals={dentroDeVentana} onClose={() => setComparar(null)} />
      )}
    </section>
  );
}

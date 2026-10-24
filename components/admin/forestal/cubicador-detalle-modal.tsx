"use client";

/**
 * El detalle de UNA cubicación guardada, sin abrirla en el cubicador (Brandon
 * 24-10: «botón para ver los detalles en modal de cada guardado, resumen tipo
 * especie y otros resúmenes útiles»).
 *
 * Arriba sus datos de papel; después las cifras que se congelaron al guardar
 * (piezas, PT, m³, valor: las del servidor, no se recubica); abajo el lote
 * leído de varias formas con las mismas tablas de Resúmenes (`TablaGrupos`,
 * volumen oficial) y el precio con que se guardó cada pieza, para que el
 * valor de cada grupo sume el `valor` guardado.
 */
import { useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { FileText, FolderOpen, GitCompareArrows } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import type { EnLibroDeGuardada } from "@/components/admin/forestal/hooks/use-guardadas-del-cubicador";
import { codigoDeHoja } from "@/components/admin/forestal/cubicador-papel/papel-cubicador";
import { m3DesdePt } from "@/lib/forestal/cubicacion";
import { precioDeCubicacion, type CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import { agruparOficial, ETIQUETA_DIMENSION, resumenPorEspecie, type DimensionResumen } from "@/lib/forestal/cubicacion-resumen";
import { fmtM3, fmtPct, fmtPt, fmtSoles } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { Chip, KpiResumen, TablaGrupos } from "./resumen-tabla";
import { ChipsDeLectura, FichaDeGuardada, datosDeLaGuardada } from "./cubicador-detalle-ficha";
import { fechaDeLaGuardada } from "./cubicador-guardadas-tarjeta";
import { AccionesWhatsAppDeGuardada } from "./cubicador-detalle-whatsapp";

const DIMENSIONES_DETALLE = ["especie", "tipo", "largo", "medida", "seccion", "dueno"] as const satisfies readonly DimensionResumen[];
type Lectura = "especie-tipo" | (typeof DIMENSIONES_DETALLE)[number];

const LECTURAS: readonly { id: Lectura; label: string }[] = [
  { id: "especie-tipo", label: "Especie × tipo" },
  ...DIMENSIONES_DETALLE.map((d) => ({ id: d, label: ETIQUETA_DIMENSION[d] })),
];

/** «Por sección (esp × anc)» → «Sección (esp × anc)»: la cabecera de la primera columna. */
const primeraColDe = (d: DimensionResumen) => {
  const s = ETIQUETA_DIMENSION[d].replace("Por ", "");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export function DetalleCubicacionModal({ c, enLibro, aboveModals, puedeComparar, onClose, onAbrir, onComparar }: {
  c: CubicacionRegistro;
  enLibro?: EnLibroDeGuardada;
  /** La lista vive dentro de otra ventana («Producir sin lote»): este va encima. */
  aboveModals?: boolean;
  /** Hay otra guardada con la cual comparar. */
  puedeComparar: boolean;
  onClose: () => void;
  onAbrir: () => void;
  onComparar: () => void;
}) {
  const [lectura, setLectura] = useState<Lectura>("especie-tipo");
  const precioDe = useMemo(() => precioDeCubicacion(c), [c]);
  const bloques = useMemo(() => (lectura === "especie-tipo" ? resumenPorEspecie(c.piezas, precioDe) : []), [c.piezas, lectura, precioDe]);
  const agrupado = useMemo(() => (lectura === "especie-tipo" ? null : agruparOficial(c.piezas, lectura, precioDe)), [c.piezas, lectura, precioDe]);
  const datos = useMemo(() => datosDeLaGuardada(c, { enLibro, completa: true }), [c, enLibro]);

  const pt = c.totales.pieTablar;
  const conValor = c.valor > 0;
  const ptDelLote = bloques.reduce((a, b) => a + b.total.pieTablar, 0);

  return (
    <AdminModal
      open
      onClose={onClose}
      size="xl"
      icon={FileText}
      title={c.nombre}
      description={`${fechaDeLaGuardada(c.fecha)} · código ${codigoDeHoja("aserrada", c.id)}`}
      claveVentana="cubicador-detalle-guardada"
      aboveModals={aboveModals}
      ayuda={
        <InfoTip
          what="Lo que se guardó, sin abrirlo en el cubicador: sus datos, sus cifras y el lote leído por especie, tipo, largo, medida, sección o dueño."
          affects="Las cifras de arriba son las que se congelaron al guardar; las tablas, el volumen oficial de sus piezas (el de la GTF)."
          example="«Especie × tipo» dice cuánto Tornillo comercial y cuánta paquetería tiene el lote."
        />
      }
      footer={
        <ModalFooter>
          <AccionesWhatsAppDeGuardada c={c} />
          <button type="button" onClick={onComparar} disabled={!puedeComparar} className={button({ variant: "secondary" })} title={puedeComparar ? undefined : "Guarda otra cubicación para poder comparar"}>
            <GitCompareArrows className="h-4 w-4" aria-hidden /> Comparar con otra…
          </button>
          <button type="button" onClick={onAbrir} className={button({ variant: "accent" })}>
            <FolderOpen className="h-4 w-4" aria-hidden /> Abrir en el cubicador
          </button>
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} space-y-5`}>
        <FichaDeGuardada datos={datos} notas={c.notas} />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <KpiResumen label="Piezas" value={formatNumber(c.totales.piezas)} />
          <KpiResumen label="Pie tablar" value={fmtPt(pt)} unidad="PT" />
          <KpiResumen label="Volumen" value={fmtM3(m3DesdePt(pt))} unidad="m³" />
          <KpiResumen label="Valor" value={conValor ? `S/ ${fmtSoles(c.valor)}` : "—"} hint={conValor ? undefined : "Se guardó sin precio"} destacado={conValor} />
          <KpiResumen label="S/ por PT" value={conValor && pt > 0 ? fmtSoles(c.valor / pt) : "—"} hint="Promedio del lote" />
        </div>

        <section aria-label="Resúmenes de la cubicación" className="space-y-3">
          <ChipsDeLectura opciones={LECTURAS} valor={lectura} onCambiar={setLectura} etiqueta="Cómo leer el lote" />

          {c.piezas.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--rule-base)] py-6 text-center text-sm text-[var(--text-secondary)]">Se guardó sin piezas.</p>
          ) : agrupado && lectura !== "especie-tipo" ? (
            <TablaGrupos
              grupos={agrupado.grupos}
              total={agrupado.total}
              primeraCol={primeraColDe(lectura)}
              conValor={conValor}
              esTipo={lectura === "tipo"}
              caption={`${c.nombre}: ${ETIQUETA_DIMENSION[lectura].toLowerCase()}`}
            />
          ) : (
            <div className="space-y-3">
              {bloques.map((b) => (
                <div key={b.especie} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <CardTitle as="h4" className="text-sm font-bold text-[var(--text-primary)]">{b.especie}</CardTitle>
                    <span className="flex flex-wrap items-center gap-1.5 font-mono text-sm tabular-nums">
                      <Chip>{formatNumber(b.total.cantidad)} pzas</Chip>
                      <Chip>{fmtPt(b.total.pieTablar)} PT</Chip>
                      <Chip>{fmtM3(b.total.m3)} m³</Chip>
                      {bloques.length > 1 && ptDelLote > 0 && <Chip>{fmtPct((b.total.pieTablar / ptDelLote) * 100)} % del lote</Chip>}
                      {conValor && <Chip acento>S/ {fmtSoles(b.total.valor)}</Chip>}
                    </span>
                  </div>
                  <TablaGrupos grupos={b.tipos} total={b.total} primeraCol="Tipo" conValor={conValor} esTipo compacta caption={`Tipos de ${b.especie}`} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminModal>
  );
}

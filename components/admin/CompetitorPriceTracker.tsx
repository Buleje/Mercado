"use client";

import { useMemo, useState } from "react";
import { SectionTitle } from "@buleje/design-system";
import { BarChart3, Laptop, RefreshCw, Search, Users } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import ActionMenu from "@/components/admin/shared/action-menu";
import TableSkeleton from "@/components/admin/shared/TableSkeleton";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { button } from "@/components/ui-system/button-variants";
import { claveDeDia, diaCorto } from "@/lib/compras/ciclo-oc";
import { resumirMercado, sugerenciasMercado, DIAS_VIGENCIA_MERCADO } from "@/lib/compras/mercado";
import { limaDateKey } from "@/lib/utils";
import { usePreciosMercado } from "./compras/mercado/use-precios-mercado";
import TablaMercado from "./compras/mercado/TablaMercado";
import ResumenMercado from "./compras/mercado/ResumenMercado";
import AltasMercado from "./compras/mercado/AltasMercado";
import PrecioVistoModal, { type CasillaMercado } from "./compras/mercado/PrecioVistoModal";

const CHIP_REFERENCIA = "inline-flex items-center rounded-full bg-[var(--data-info-100)] px-2 py-0.5 text-sm font-semibold text-[var(--data-info-ink)] dark:bg-[var(--data-info-500)]/15";

/**
 * Precios del mercado (C38; era Análisis › Inteligencia, hoy en Compras ›
 * Proveedores › Comparar): lo que cobra la COMPETENCIA, con fecha, fuente,
 * moneda y quién lo vio. Es una referencia, separada de las ofertas de tus
 * proveedores (Cotizaciones) y de lo que pagaste (Precio por producto).
 * Se guarda en este navegador o, si lo eliges, con tu equipo.
 *
 * `embebido`: dentro de un bloque que ya lo titula (Compras › Comparar).
 */
export default function CompetitorPriceTracker({ embebido = false }: { embebido?: boolean } = {}) {
  const m = usePreciosMercado();
  const { confirm } = useConfirm();
  const [buscar, setBuscar] = useState("");
  const [casilla, setCasilla] = useState<CasillaMercado | null>(null);
  const hoy = limaDateKey();

  const resumen = useMemo(() => resumirMercado(m.datos, hoy), [m.datos, hoy]);
  const sugerencias = useMemo(() => sugerenciasMercado(m.datos, hoy), [m.datos, hoy]);
  const productos = useMemo(() => {
    const t = buscar.trim().toLowerCase();
    return t ? m.datos.products.filter((p) => p.productName.toLowerCase().includes(t)) : m.datos.products;
  }, [m.datos.products, buscar]);

  const { competitors, products } = m.datos;
  const guardadoEn = m.modo === "equipo"
    ? `Compartido con tu equipo${m.quien.actualizadoPor ? ` · lo último, ${m.quien.actualizadoPor}` : ""}${m.quien.actualizadoEn ? ` el ${diaCorto(claveDeDia(m.quien.actualizadoEn) ?? hoy)}` : ""}`
    : "Guardado en este navegador";

  const quitar = async (titulo: string, detalle: string, hacer: () => void) => {
    const ok = await confirm({
      title: titulo,
      description: m.modo === "equipo" ? `${detalle} Se quita también para tu equipo.` : detalle,
      intent: "danger",
      confirmLabel: "Sí, quitar",
    });
    if (ok) hacer();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {!embebido && (
          <span className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[var(--accent-ink)]" aria-hidden />
            <SectionTitle className="text-[var(--text-primary)]">Precios del mercado</SectionTitle>
          </span>
        )}
        <span className={CHIP_REFERENCIA}>Referencia de la competencia</span>
        <InfoTip
          title="Qué es y qué no es"
          what="Lo que cobra la competencia, anotado por ti o tu equipo con el día, dónde se vio, la moneda y quién lo vio."
          affects={`No es una oferta de un proveedor (eso va en Cotizaciones) ni lo que pagaste (sale de tus órdenes en «Precio por producto»). No cambia ningún precio ni costo del sistema. Un precio de más de ${DIAS_VIGENCIA_MERCADO} días, sin fecha o en dólares se muestra pero no entra en las cuentas.`}
          example="Bodega Pérez cobra S/ 4,80 el arroz 1 kg; lo vio Rosa el jueves en su tienda."
        />
        <span className="text-sm text-[var(--text-secondary)]">
          {competitors.length} competidor{competitors.length === 1 ? "" : "es"} · {products.length} producto{products.length === 1 ? "" : "s"} · {guardadoEn}
          {m.guardando ? " · guardando…" : ""}
        </span>
        <span className="ml-auto">
          <ActionMenu
            label="Opciones"
            soloIcono
            title="Dónde se guarda la lista"
            actions={
              m.modo === "equipo"
                ? [
                    { id: "traer", label: "Traer lo último del equipo", icon: RefreshCw, onSelect: () => void m.traerEquipo() },
                    { id: "local", label: "Dejar de compartir", hint: "Sigues con una copia en este navegador; tu equipo conserva la suya", icon: Laptop, onSelect: m.dejarDeCompartir },
                  ]
                : [
                    { id: "equipo", label: "Compartir con tu equipo", hint: "Junta esta lista con la de tu equipo; los cambios de cada uno quedan con su nombre", icon: Users, busy: m.guardando, onSelect: () => void m.compartir() },
                  ]
            }
          />
        </span>
      </div>

      {m.error ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[var(--data-error-ink)]">{m.error}</span>
          <button type="button" onClick={() => void m.traerEquipo()} className={button({ variant: "ghost", className: "rounded-xl" })}>Reintentar</button>
        </div>
      ) : m.cargando ? (
        <TableSkeleton rows={3} cols={4} />
      ) : (
        <>
          <ResumenMercado resumen={resumen} sugerencias={sugerencias} onAjustar={m.cambiarMiPrecio} />

          <AltasMercado
            competidores={competitors}
            onCompetidor={m.agregarCompetidor}
            onProducto={m.agregarProducto}
            onQuitarCompetidor={(c) => void quitar(`¿Quitar a ${c.name}?`, "Se borran también los precios que le anotaste.", () => m.quitarCompetidor(c.id))}
          />

          {products.length > 3 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
              <input
                type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)}
                placeholder="Buscar producto" aria-label="Buscar producto"
                className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)]"
              />
            </div>
          )}

          {products.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--rule-base)] py-8 text-center text-sm text-[var(--text-secondary)]">
              {competitors.length === 0
                ? "Agrega un competidor y un producto para empezar a comparar."
                : `Agrega productos para comparar con ${competitors.map((c) => c.name).join(", ")}.`}
            </p>
          ) : competitors.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--rule-base)] py-8 text-center text-sm text-[var(--text-secondary)]">Agrega un competidor para anotar sus precios.</p>
          ) : productos.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text-secondary)]">Ningún producto coincide con «{buscar.trim()}».</p>
          ) : (
            <TablaMercado
              productos={productos}
              competidores={competitors}
              hoy={hoy}
              onCasilla={setCasilla}
              onMiPrecio={m.cambiarMiPrecio}
              onQuitarProducto={(p) => void quitar(`¿Quitar ${p.productName}?`, "Se borran también los precios anotados de la competencia.", () => m.quitarProducto(p.productId))}
            />
          )}
        </>
      )}

      <PrecioVistoModal
        casilla={casilla}
        onCerrar={() => setCasilla(null)}
        onGuardar={(c, visto) => { m.guardarPrecio(c.productId, c.competidorId, visto); setCasilla(null); }}
      />
    </div>
  );
}

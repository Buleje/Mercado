"use client";

import { useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Loader2, MessageCircle } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import CampoBuscar from "@/components/ui-system/CampoBuscar";
import { button } from "@/components/ui-system/button-variants";
import { useMembrete } from "@/hooks/use-membrete";
import {
  enlacePedirPrecio, formatearCantidad, ordenarProveedores, proveedoresPorDefecto, telefonoLegible,
  telefonoParaWhatsApp, type ProductoAPedir,
} from "@/lib/compras/pedir-precio";
import PedirPrecioFila from "./PedirPrecioFila";
import { useProveedoresContacto } from "./use-proveedores-contacto";
import type { SugerenciasCompra } from "./use-sugerencias-compra";

/** Con más proveedores que esto aparece el buscador. */
const CON_BUSCADOR = 8;

/**
 * «Pedir precio» en la barra de Sugerencias: abre una ventana con lo marcado y
 * los proveedores del negocio; por cada proveedor marcado, «Abrir WhatsApp» con
 * el mensaje ya escrito. Nosotros no enviamos nada: el dueño ve el mensaje en su
 * WhatsApp y lo manda. Lo que contesten se compara en Compras › Proveedores ›
 * Comparar proveedores (ese comparador no se toca acá).
 */
export default function PedirPrecioWhatsApp({ sc }: { sc: SugerenciasCompra }) {
  const [abierta, setAbierta] = useState(false);
  const [cambios, setCambios] = useState<Record<string, boolean>>({});
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(new Set());
  const [busca, setBusca] = useState("");
  const membrete = useMembrete();
  const { proveedores, error, cargando, reintentar } = useProveedoresContacto(abierta);

  const productos = useMemo<ProductoAPedir[]>(
    () => sc.sugerencias
      .filter((s) => sc.selected.has(s.productId))
      .map((s) => ({ productId: s.productId, nombre: s.productName, cantidad: s.suggestedQty, unidad: s.unit, proveedorId: s.suggestedSupplier?.id ?? null })),
    [sc.sugerencias, sc.selected],
  );

  const porDefecto = useMemo(() => new Set(proveedores ? proveedoresPorDefecto(productos, proveedores) : []), [productos, proveedores]);
  const sugeridos = useMemo(() => new Set(productos.map((p) => p.proveedorId).filter((id): id is string => !!id)), [productos]);
  const lista = useMemo(() => {
    if (!proveedores) return [];
    const q = busca.trim().toLowerCase();
    return ordenarProveedores(proveedores, sugeridos).filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [proveedores, sugeridos, busca]);

  const estaMarcado = (id: string) => cambios[id] ?? porDefecto.has(id);
  const nMarcados = (proveedores ?? []).filter((p) => estaMarcado(p.id) && telefonoParaWhatsApp(p)).length;
  const conTelefono = (proveedores ?? []).filter((p) => telefonoParaWhatsApp(p)).length;

  const cerrar = () => { setAbierta(false); setCambios({}); setAbiertos(new Set()); setBusca(""); };

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className={button({ variant: "secondary", className: "shrink-0 gap-2 rounded-xl px-3 sm:px-4" })}
      >
        <MessageCircle className="h-4 w-4" aria-hidden />
        Pedir precio
      </button>

      <AdminModal
        open={abierta}
        onClose={cerrar}
        title="Pedir precio"
        icon={MessageCircle}
        size="md"
        ayuda={
          <InfoTip
            title="Pedir precio"
            what="Eliges a qué proveedores y se abre su WhatsApp con el mensaje ya escrito. Tú lo revisas y lo envías."
            affects="No se crea ninguna orden. Cuando te contesten, compara los precios en Compras › Proveedores › Comparar proveedores."
            example="Marcaste arroz y aceite; tocas «Abrir WhatsApp» en 3 distribuidores y ellos te cotizan."
          />
        }
        footer={
          <ModalFooter nota={nMarcados > 0 ? `${nMarcados} ${nMarcados === 1 ? "proveedor marcado" : "proveedores marcados"}` : undefined}>
            <button type="button" onClick={cerrar} className={button({ variant: "secondary", className: "rounded-xl" })}>Cerrar</button>
          </ModalFooter>
        }
      >
        <div className={`${MODAL_BODY} space-y-5`}>
          <section className="space-y-2" aria-label="Productos a cotizar">
            <CardTitle className="text-sm font-bold">
              Lo que pides ({productos.length})
            </CardTitle>
            <ul className="max-h-40 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
              {productos.map((p) => (
                <li key={p.productId} className="flex min-h-10 items-center justify-between gap-3 px-3 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">{p.nombre}</span>
                  <span className="shrink-0 font-semibold text-[var(--text-secondary)]">
                    {formatearCantidad(p.cantidad)} {p.unidad || "und"}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-2" aria-label="Proveedores">
            <CardTitle className="text-sm font-bold">
              ¿A quién le pides precio?
            </CardTitle>
            {cargando && (
              <p className="flex min-h-12 items-center gap-2 text-sm text-[var(--text-secondary)]" role="status">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Trayendo tus proveedores…
              </p>
            )}
            {error && (
              <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] px-3 py-2 text-sm text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/10">
                <span className="min-w-0 flex-1">{error}</span>
                <button type="button" onClick={reintentar} className={button({ variant: "secondary", className: "rounded-xl" })}>Reintentar</button>
              </div>
            )}
            {proveedores && proveedores.length === 0 && (
              <p className="text-sm text-[var(--text-secondary)]">Aún no tienes proveedores. Agrégalos en Compras › Proveedores y vuelve.</p>
            )}
            {proveedores && proveedores.length > 0 && conTelefono === 0 && (
              <p className="text-sm text-[var(--text-secondary)]">Ninguno de tus proveedores tiene celular guardado. Ponlo en su ficha (Compras › Proveedores) y vuelve.</p>
            )}
            {proveedores && proveedores.length > CON_BUSCADOR && (
              <CampoBuscar valor={busca} onCambiar={setBusca} placeholder="Buscar proveedor…" etiqueta="Buscar proveedor" limpiable />
            )}
            {lista.length > 0 && (
              <ul className="space-y-2">
                {lista.map((p) => {
                  const numero = telefonoParaWhatsApp(p);
                  return (
                    <PedirPrecioFila
                      key={p.id}
                      nombre={p.name}
                      telefono={numero ? telefonoLegible(numero) : null}
                      sugerido={sugeridos.has(p.id)}
                      marcado={Boolean(numero) && estaMarcado(p.id)}
                      abierto={abiertos.has(p.id)}
                      enlace={enlacePedirPrecio({ proveedor: p, productos, negocio: membrete?.nombre })}
                      onAlternar={() => setCambios((c) => ({ ...c, [p.id]: !estaMarcado(p.id) }))}
                      onAbierto={() => setAbiertos((a) => new Set(a).add(p.id))}
                    />
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </AdminModal>
    </>
  );
}

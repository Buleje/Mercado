"use client";

/**
 * Accesos de la cabecera de Compras (C57, C63, C64): «Buscar» (o «/») para
 * encontrar cualquier orden, proveedor, cuenta, recepción o devolución;
 * «Revisar» con cuántos casos esperan una mano; y en «Más», recibir
 * mercadería (R), compra nueva (N), la hoja de atajos y apagarlos.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { Keyboard, ListChecks, MoreHorizontal, PackageCheck, Search, ShoppingBasket } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import Kbd from "@/components/admin/shared/kbd";
import { button } from "@/components/ui-system/button-variants";
import { useAdminShortcuts } from "@/contexts/admin-shortcuts-context";
import type { ModoBusqueda } from "@/lib/compras/buscar-compras";
import BuscarComprasModal, { type ProveedorParaOrden } from "./BuscarComprasModal";
import RevisarPendientesModal from "./RevisarPendientesModal";
import { useAtajosCompras } from "./use-atajos-compras";
import { useExcepcionesCompras } from "./use-excepciones-compras";

export default function BarraCompras({
  onIr,
  onNuevaOrdenA,
  onNuevaCompra,
}: {
  onIr: (href: string) => void;
  onNuevaOrdenA: (p: ProveedorParaOrden) => void;
  onNuevaCompra: () => void;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  // `vez` remonta la ventana en cada apertura: arranca vacía y en el modo pedido.
  const [busqueda, setBusqueda] = useState<{ abierta: boolean; modo: ModoBusqueda; vez: number }>({ abierta: false, modo: "todo", vez: 0 });
  const [revisando, setRevisando] = useState(false);
  const excepciones = useExcepcionesCompras();
  const { recargar } = excepciones;
  const { open: abrirAyuda } = useAdminShortcuts();

  const abrirBusqueda = useCallback((modo: ModoBusqueda) => setBusqueda((b) => ({ abierta: true, modo, vez: b.vez + 1 })), []);
  const buscar = useCallback(() => abrirBusqueda("todo"), [abrirBusqueda]);
  const recibir = useCallback(() => abrirBusqueda("recibir"), [abrirBusqueda]);
  const abrirRevision = useCallback(() => {
    setRevisando(true);
    void recargar();
  }, [recargar]);
  const atajos = useAtajosCompras(useMemo(() => ({ buscar, nuevaCompra: onNuevaCompra, recibir }), [buscar, onNuevaCompra, recibir]), raiz);

  const acciones: MenuAccion[] = [
    { id: "recibir", label: "Recibir mercadería", hint: atajos.activos ? "Atajo: R" : "Elige la orden que llegó", icon: PackageCheck, onSelect: recibir },
    { id: "nueva", label: "Compra nueva", hint: atajos.activos ? "Atajo: N" : "Ir a Comprar con el buscador listo", icon: ShoppingBasket, onSelect: onNuevaCompra },
    { id: "ayuda", label: "Atajos de teclado", hint: "La hoja con todas las teclas", icon: Keyboard, onSelect: abrirAyuda },
    {
      id: "atajos",
      label: "Atajos de una tecla",
      hint: atajos.activos ? "Activados: / N R. Apágalos si se te disparan sin querer" : "Apagados: actívalos para usar / N R",
      icon: Keyboard,
      activo: atajos.activos,
      onSelect: atajos.alternar,
    },
  ];
  const pendientes = excepciones.sinRevisar;

  return (
    <div ref={raiz} className="flex items-center gap-2">
      <button
        type="button"
        onClick={buscar}
        aria-keyshortcuts={atajos.activos ? "/" : undefined}
        title="Buscar órdenes, proveedores, cuentas, recepciones y devoluciones"
        className={button({ variant: "secondary", className: "h-12 shrink-0 rounded-2xl" })}
      >
        <Search className="h-4 w-4" aria-hidden />
        <span className="max-sm:sr-only">Buscar</span>
        {atajos.activos && (
          <span className="max-md:hidden" aria-hidden>
            <Kbd>/</Kbd>
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={abrirRevision}
        title={pendientes ? `Revisar pendientes: ${pendientes} por revisar` : "Revisar pendientes"}
        className={button({ variant: "secondary", className: "h-12 shrink-0 rounded-2xl" })}
      >
        <ListChecks className="h-4 w-4" aria-hidden />
        <span className="max-sm:sr-only">Revisar</span>
        {pendientes != null && pendientes > 0 && (
          <span className="rounded-full bg-[var(--data-warning-50)] px-2 py-0.5 text-xs font-bold tabular-nums text-[var(--data-warning-700)]">
            {pendientes}
            <span className="sr-only"> por revisar</span>
          </span>
        )}
      </button>
      <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Recibir, compra nueva y atajos" />

      <BuscarComprasModal
        key={busqueda.vez}
        open={busqueda.abierta}
        modoInicial={busqueda.modo}
        onClose={() => setBusqueda((b) => ({ ...b, abierta: false }))}
        onIr={onIr}
        onNuevaOrdenA={onNuevaOrdenA}
      />
      <RevisarPendientesModal open={revisando} onClose={() => setRevisando(false)} onIr={onIr} datos={excepciones} />
    </div>
  );
}

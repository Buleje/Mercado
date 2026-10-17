"use client";

import { useRef, useState, type ReactNode } from "react";
import { SectionTitle } from "@buleje/design-system";
import {
  ScanBarcode, Camera, Zap, MessageCircle, History, RotateCcw, RefreshCcw, Maximize2, Minimize2,
  Type, Volume2, VolumeX, Printer, WifiOff, AlertTriangle, Unlock,
} from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import POSSearchBar from "@/components/admin/pos/POSSearchBar";
import POSVoiceInput from "@/components/admin/pos/POSVoiceInput";
import POSExpressMode from "@/components/admin/pos/POSExpressMode";
import { estaAgotado } from "@/lib/pos/stock-vendible";
import { edadCatalogo } from "@/components/admin/pos/pos-catalogo-offline";
import { fmt, type CartItem, type Product } from "@/components/admin/pos/pos-shared";
import type { POSCarrito } from "@/components/admin/pos/usePOSCarrito";
import { button } from "@/components/ui-system/button-variants";

type TamanoLetra = "normal" | "large" | "xlarge";
const TAMANOS: { id: TamanoLetra; label: string }[] = [
  { id: "normal", label: "Letra normal" },
  { id: "large", label: "Letra grande" },
  { id: "xlarge", label: "Letra extra grande" },
];

interface POSToolbarProps {
  products: Product[];
  carrito: POSCarrito;
  cashRegisterOpen: boolean | null;
  turnoAbierto: boolean | null;
  catalogoGuardadoEn: string | null;
  lastSaleInfo: { total: number; id: string; minutesAgo: number } | null;
  /** El botón «Indicadores» (usePOSIndicadores): va en esta fila; su panel, debajo. */
  indicadores: ReactNode;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  fontSize: TamanoLetra;
  changeFontSize: (size: TamanoLetra) => void;
  soundEnabled: boolean;
  toggleSound: () => void;
  handleBarcode: (code: string) => Promise<void>;
  setSaleError: (msg: string | null) => void;
  onScan: () => void;
  onWhatsApp: () => void;
  onHistorial: () => void;
  onDevolucion: () => void;
  onTrueque: () => void;
}

type DetectorDeCodigos = new (opts?: { formats: string[] }) => { detect: (img: ImageBitmap) => Promise<Array<{ rawValue: string }>> };

const BOTON_48 = button({ variant: "secondary", size: "icon", className: "shrink-0 rounded-xl" });

/**
 * Cabecera de Vender en UNA fila (10-10): buscador con lector, dictado y cámara · lo que falta para
 * vender en regla (turno o caja) · «Indicadores» plegados · atajos ⓘ · «Más».
 * Antes eran tres renglones (título con el estado y la tira «Hoy», el buscador, las categorías) más la
 * tira del turno encima: las categorías bajaron a la grilla que filtran y las cifras, al botón.
 * A 400 px el buscador ocupa su renglón y el resto pasa al de abajo.
 */
export default function POSToolbar(props: POSToolbarProps) {
  const { products, carrito, cashRegisterOpen, turnoAbierto, catalogoGuardadoEn, lastSaleInfo, expanded, fontSize, soundEnabled } = props;
  const { confirm } = useConfirm();
  const fotoRef = useRef<HTMLInputElement>(null);
  const [expressOn, setExpressOn] = useState(() => {
    try { return typeof window !== "undefined" && localStorage.getItem("pos-express-mode") === "true"; } catch { return false; }
  });
  // POSExpressMode sólo se monta encendido: el «apagado» se guarda acá para que no vuelva al recargar.
  const cambiarExpress = (v: boolean) => {
    setExpressOn(v);
    try { localStorage.setItem("pos-express-mode", String(v)); } catch { /* sin almacenamiento */ }
  };
  const hayUltimaVenta = (() => {
    try { return typeof window !== "undefined" && !!localStorage.getItem("pos-last-sale-items"); } catch { return false; }
  })();

  async function repetirUltimaVenta() {
    try {
      const raw = localStorage.getItem("pos-last-sale-items");
      if (!raw) return;
      const items: { productId: number; name: string; quantity: number; price: number; stock?: number }[] = JSON.parse(raw);
      if (carrito.cart.length > 0 && !(await confirm({ title: "¿Reemplazar el carrito actual?", intent: "warning", confirmLabel: "Sí, reemplazar" }))) return;
      const newCart: CartItem[] = [];
      const skipped: string[] = [];
      for (const item of items) {
        const found = products.find((p) => p.id === item.productId);
        if (!found || estaAgotado(found)) { skipped.push(item.name); continue; }
        newCart.push({ product: found, quantity: item.quantity });
      }
      if (newCart.length > 0) carrito.setCart(newCart);
      if (skipped.length > 0) props.setSaleError(`Sin stock: ${skipped.join(", ")}`);
    } catch { /* lista guardada dañada: no hay nada que repetir */ }
  }

  async function leerFoto(file: File) {
    try {
      if ("BarcodeDetector" in window) {
        const bitmap = await createImageBitmap(file);
        const Detector = (window as unknown as { BarcodeDetector: DetectorDeCodigos }).BarcodeDetector;
        const barcodes = await new Detector({ formats: ["ean_13", "ean_8", "code_128", "code_39", "qr_code", "upc_a", "upc_e"] }).detect(bitmap);
        if (barcodes.length > 0) { void props.handleBarcode(barcodes[0].rawValue); return; }
      }
      props.setSaleError("No se detectó un código de barras en la foto. Busca el producto por nombre.");
    } catch {
      props.setSaleError("No se pudo procesar la imagen. Busca el producto por nombre.");
    }
  }

  const acciones: MenuAccion[] = [
    { id: "foto", seccion: "Agregar", label: "Leer código de una foto", hint: "Para cuando el lector no alcanza el producto", icon: Camera, onSelect: () => fotoRef.current?.click() },
    { id: "express", seccion: "Agregar", label: "Modo Express", hint: "Escribe o escanea el código y entra al carrito en el acto", icon: Zap, activo: expressOn, onSelect: () => cambiarExpress(!expressOn) },
    { id: "whatsapp", seccion: "Agregar", label: "Pedido por WhatsApp", hint: "Pega el mensaje del cliente y arma el carrito", icon: MessageCircle, onSelect: props.onWhatsApp },
    ...(hayUltimaVenta ? [{ id: "repetir", seccion: "Agregar", label: "Repetir última venta", icon: RotateCcw, onSelect: () => void repetirUltimaVenta() }] : []),
    { id: "trueque", seccion: "Cobrar", label: "Cobrar con trueque", hint: "Lo que te da el cliente descuenta la venta; la diferencia, en efectivo, Yape o Plin", icon: RefreshCcw, disabled: carrito.cart.length === 0, onSelect: props.onTrueque },
    { id: "historial", seccion: "Cobrar", label: "Ventas de hoy", hint: "Atajo F4 · el total del día y la lista", icon: History, onSelect: props.onHistorial },
    // Antes era una píldora suelta en la fila del título («Última: S/ 12 · 3m»).
    ...(lastSaleInfo ? [{
      id: "reimprimir", seccion: "Cobrar", label: "Reimprimir la última venta",
      hint: `${fmt(lastSaleInfo.total)} · hace ${Math.max(1, lastSaleInfo.minutesAgo)} min`, icon: Printer,
      onSelect: () => { window.open(`/venta/${lastSaleInfo.id}/recibo`, "_blank", "noopener,noreferrer"); },
    }] : []),
    { id: "devolucion", seccion: "Cobrar", label: "Devolución", icon: RotateCcw, tone: "danger", onSelect: props.onDevolucion },
    { id: "pantalla", seccion: "Pantalla", label: expanded ? "Salir de pantalla completa" : "Pantalla completa", icon: expanded ? Minimize2 : Maximize2, onSelect: () => props.setExpanded(!expanded) },
    ...TAMANOS.map((t) => ({ id: `letra-${t.id}`, seccion: "Pantalla", label: t.label, icon: Type, activo: fontSize === t.id, onSelect: () => props.changeFontSize(t.id) })),
    { id: "sonido", seccion: "Pantalla", label: soundEnabled ? "Sonido al vender: sí" : "Sonido al vender: no", icon: soundEnabled ? Volume2 : VolumeX, activo: soundEnabled, onSelect: props.toggleSound },
  ];

  // Lo que falta para vender en regla. Con todo abierto no se dice nada: la barra de pestañas ya
  // dice «Turno abierto». Abrir el turno abre la caja, así que sin turno se manda a Turnos.
  const falta = turnoAbierto === false ? "turno" : cashRegisterOpen === false ? "caja" : null;

  return (
    <div className="space-y-2" data-pos-cabecera>
      <SectionTitle className="sr-only">Vender</SectionTitle>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-[1_1_22rem] items-center gap-2">
          <div className="min-w-0 flex-1">
            <POSSearchBar
              products={products as { id: number; name: string; price: number; image?: string; barcode?: string; stock?: number }[]}
              onAddToCart={carrito.handleAddFromSearch}
            />
          </div>
          <POSVoiceInput
            // El stock viaja para que el dictado avise en el acto cuando no alcanza.
            products={products.map((p) => ({ id: p.id, name: p.name, price: p.price, stock: p.stock }))}
            onAddToCart={carrito.handleAddFromSearch}
          />
          <button type="button" onClick={props.onScan} aria-label="Escanear con la cámara" title="Escanear con la cámara" className={BOTON_48}>
            <ScanBarcode className="h-5 w-5 text-primary" aria-hidden />
          </button>
        </div>
        <div className="flex min-w-0 flex-1 basis-auto items-center justify-end gap-2 sm:flex-none">
          {catalogoGuardadoEn && <ChipListaGuardada guardadoEn={catalogoGuardadoEn} />}
          {falta && (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent(falta === "turno" ? "buleje:navigate-turnos" : "buleje:navigate-caja"))}
              title={falta === "turno" ? "Sin turno: la venta queda a tu nombre (tu comisión), pero no entra en el cuadre de ningún turno" : "Sin caja: lo que cobres no entra al arqueo"}
              className="shrink-0 inline-flex h-12 items-center gap-2 rounded-2xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-3 text-sm font-bold text-[var(--data-warning-ink)] hover:bg-[var(--data-warning-500)]/20 transition-colors"
            >
              <Unlock className="h-4 w-4" aria-hidden />
              {falta === "turno" ? "Abrir turno" : "Abrir caja"}
            </button>
          )}
          {props.indicadores}
          <InfoTip
            title="Atajos del mostrador"
            what="F1 busca · F2 cobra · F3 vacía el carrito · F4 ventas de hoy · Enter agrega el primero de la búsqueda · + y − cambian la cantidad de la primera línea del carrito · Supr la quita · Ctrl+M dicta por voz."
            affects="El lector de código funciona aunque el cursor no esté en el buscador; si el código no está en tu inventario, suena y te avisa."
            example="Pasas el lector por una leche Gloria: entra al carrito con su precio y suena el ding."
          />
          <ActionMenu label="Más" soloIcono size="md" actions={acciones} title="Más acciones del mostrador" />
        </div>
      </div>
      <input
        ref={fotoRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void leerFoto(file);
        }}
      />
      {expressOn && (
        <POSExpressMode
          products={products as { id: number; name: string; price: number; barcode?: string | null; stock?: number | null }[]}
          onAddToCart={carrito.handleAddFromSearch}
          enabled
          onEnabledChange={cambiarExpress}
        />
      )}
    </div>
  );
}

/**
 * Sin conexión el POS vende con la última lista guardada. Si es de otro día se ve la fecha, y pasadas
 * 24 h el aviso sube a rojo: con precios viejos el servidor rechaza al sincronizar la venta pagada por
 * debajo del precio de hoy, cuando la plata ya se cobró.
 */
function ChipListaGuardada({ guardadoEn }: { guardadoEn: string }) {
  const edad = edadCatalogo(guardadoEn);
  if (!edad.viejo) {
    return (
      <span
        className="shrink-0 inline-flex items-center gap-1 text-sm font-semibold text-[var(--data-warning-ink)]"
        title="Sin conexión: vendes con la lista guardada; las ventas se guardan y se suben al volver internet"
      >
        <WifiOff className="h-3.5 w-3.5" aria-hidden /> Lista {edad.etiqueta}
      </span>
    );
  }
  return (
    <span
      role="status"
      data-pos-lista-vieja
      className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-2 py-0.5 text-sm font-bold text-[var(--data-error-ink)]"
      title={`Sin conexión y la lista guardada tiene ${Math.floor(edad.horas / 24)} día(s): si cambiaste precios, cobra el de hoy. Al volver internet, una venta pagada por debajo del precio de hoy se rechaza.`}
    >
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
      <span className="sm:hidden">Lista vieja</span>
      <span className="max-sm:hidden">Lista del {edad.dia} · revisa precios</span>
    </span>
  );
}

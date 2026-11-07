"use client";

/**
 * «Drucila te sugiere» (cajón de la bolsa), en una fila: el kit o dúo que completa
 * lo que llevas, con su ahorro REAL (`sugerirKit`: «por separado» = suma de los precios de
 * la base de sus componentes, sin tachar nada). «Cambiar por el kit» saca de la
 * bolsa una unidad de cada componente que ya llevas y agrega el kit. Necesita
 * `nombre`, `precio` y `componentes` en `codigos` (`cargarMarco`); sin ellos no sale.
 */
import { useMemo } from "react";
import { useCart, type CartItem } from "@/contexts/cart-context";
import { Miniatura } from "./BolsaPartes";
import { imagenDe } from "./imagenes";
import { solesPedido as soles, sugerirKit } from "./pedido-whatsapp";
import type { CodigosProductos, InfoProducto } from "./PedirPorWhatsapp";

/** «a», «a y b», «a, b y c». */
const lista = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;

export function SugerenciaKit({
  items,
  codigos,
}: {
  items: readonly CartItem[];
  codigos: CodigosProductos;
}) {
  const { addItem, updateQty, removeItem } = useCart();
  const porCodigo = useMemo(() => {
    const m = new Map<string, { id: number; info: InfoProducto }>();
    for (const [id, info] of Object.entries(codigos))
      if (info.codigo) m.set(info.codigo, { id: Number(id), info });
    return m;
  }, [codigos]);
  const kits = useMemo(
    () =>
      [...porCodigo.values()].flatMap(({ info }) =>
        info.codigo &&
        info.componentes &&
        info.componentes.length > 1 &&
        typeof info.precio === "number"
          ? [{ codigo: info.codigo, precio: info.precio, componentes: info.componentes }]
          : [],
      ),
    [porCodigo],
  );
  if (kits.length === 0) return null;
  const s = sugerirKit(
    items.map((i) => ({ codigo: codigos[String(i.id)]?.codigo ?? null, cantidad: i.quantity })),
    kits,
    (c) => porCodigo.get(c)?.info.precio,
  );
  const kit = s ? porCodigo.get(s.kit) : undefined;
  if (!s || !kit || typeof kit.info.precio !== "number") return null;
  const precio = kit.info.precio;
  const nombre = kit.info.nombre ?? s.kit;
  const faltan = [...new Set(s.faltan)].map((c) => porCodigo.get(c)?.info.nombre ?? c);

  // Saca de la bolsa una unidad de cada componente que ya llevas y agrega el kit.
  const cambiar = () => {
    const sacar = new Map<string, number>();
    for (const c of s.reemplaza) sacar.set(c, (sacar.get(c) ?? 0) + 1);
    for (const i of items) {
      const n = sacar.get(codigos[String(i.id)]?.codigo ?? "");
      if (!n) continue;
      if (i.quantity > n) updateQty(i.id, i.quantity - n);
      else removeItem(i.id);
    }
    addItem({
      id: kit.id,
      name: nombre,
      category: kit.info.categoria ?? "Kits y ofertas",
      price: precio,
      image: imagenDe({ imagen: kit.info.imagen ?? "", codigo: s.kit }).src ?? "",
      unit: kit.info.unidad ?? "unidad",
    });
  };

  const detalle =
    faltan.length > 0
      ? `Te falta ${lista(faltan)}: en el ${nombre} ahorras ${soles(s.ahorro)}`
      : `Ya llevas todo lo del ${nombre}: júntalo y ahorras ${soles(s.ahorro)}`;

  // Una fila: el kit, «Ahorras S/ X» y «Cambiar». El porqué (lo que falta, por separado
  // vs en kit) va en el nombre accesible del botón y en su `title`.
  return (
    <aside
      aria-label="Drucila te sugiere"
      className="my-3 flex items-center gap-3 rounded-[var(--mu-radio-tarjeta)] bg-[var(--mu-tinte-kits)] py-2 pl-2 pr-2.5"
    >
      <Miniatura
        imagen={kit.info.imagen ?? ""}
        codigo={s.kit}
        categoria="Kits y ofertas"
        fondo="bg-[var(--surface-raised)]"
        id={`sugerido-${kit.id}`}
        className="h-14 w-12"
      />
      <p className="min-w-0 flex-1 text-sm leading-snug">
        <span className="line-clamp-1 font-semibold text-[var(--text-primary)]">{nombre}</span>
        <span className="font-semibold text-[var(--mu-acento-tinta)]">
          Ahorras {soles(s.ahorro)}
        </span>
      </p>
      <button
        type="button"
        onClick={cambiar}
        title={`${detalle}. Por separado ${soles(s.porSeparado)}, en kit ${soles(precio)}.`}
        aria-label={`Cambiar por el ${nombre} a ${soles(precio)}. ${detalle}.`}
        className="mu-foco inline-flex h-12 shrink-0 items-center rounded-full bg-[var(--mu-boton-fondo)] px-4 text-sm font-semibold text-[var(--mu-boton-texto)] transition-colors duration-[var(--mu-dur-corto)] hover:bg-[var(--mu-boton-fondo-hover)]"
      >
        Cambiar
      </button>
    </aside>
  );
}

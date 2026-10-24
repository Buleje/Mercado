"use client";

/**
 * «Desde foto» en Nueva cotización (copiado de Alegra, 18-10): la foto del
 * pedido de un cliente → `/api/ocr/pedido` lee cada línea y la empareja con
 * el catálogo → se revisa acá (lo dudoso en ámbar) → «Pasar a la cotización»
 * llena los ítems del paso 2 → «Confirmar» → se guarda como BORRADOR.
 *
 * Nada de lo que se ve acá es el total: el servidor lo calcula al guardar con
 * el precio del catálogo de hoy (las líneas pasan con `precioCatalogo`).
 */
import { useRef, useState } from "react";
import { Camera, Check, Loader2, X } from "@buleje/design-system/icons";
import AvisoClaveIa from "@/components/admin/shared/AvisoClaveIa";
import { button } from "@/components/ui-system/button-variants";
import { csrfHeaders } from "@/lib/csrf-client";
import { comprimirImagen } from "@/lib/documents/compress-image";
import { logger } from "@/lib/logger";
import type { LineaEmparejada } from "@/lib/ventas/emparejar-pedido";
import { DesdeFotoPedidoRevisar, SIN_PRODUCTO, esDudosa, opcionesDe } from "./DesdeFotoPedidoRevisar";
import { emptyItem, type DraftItem } from "./tipos";
import type { FormNuevaCotizacion } from "./use-nueva-cotizacion";

interface PedidoLeido {
  cliente?: { nombre?: string; documento?: string };
  items: LineaEmparejada[];
  costoIaUsd: number | null;
}

type Estado =
  | { fase: "inicio" }
  | { fase: "leyendo" }
  | { fase: "revisar"; pedido: PedidoLeido; elegidos: string[] }
  | { fase: "pasado"; cuantos: number; dudosos: number }
  | { fase: "error"; mensaje: string; sinLector: boolean; esClave: boolean };

/** Lo elegido en la revisión → filas del paso 2. Sin producto = el texto del papel, sin precio. */
export function itemsDesdeFoto(lineas: readonly LineaEmparejada[], elegidos: readonly string[]): DraftItem[] {
  return lineas.map((l, idx) => {
    const o = opcionesDe(l).find((x) => String(x.productoId) === elegidos[idx]);
    if (!o) return { ...emptyItem(), descripcion: l.textoLeido, cantidad: String(l.cantidad) };
    const precio = String(o.precio);
    return {
      descripcion: o.nombre,
      cantidad: String(l.cantidad),
      precioUnit: precio,
      descuento: "0",
      productoId: String(o.productoId),
      precioCatalogo: precio,
      taxType: o.taxType,
    };
  });
}

const leerComoDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("No se pudo leer el archivo"));
    r.readAsDataURL(file);
  });

const filaVacia = (i: DraftItem) => !i.descripcion.trim() && !i.productoId;

export function DesdeFotoPedido({ form }: { form: FormNuevaCotizacion }) {
  const [estado, setEstado] = useState<Estado>({ fase: "inicio" });
  const entrada = useRef<HTMLInputElement>(null);

  const leer = async (file: File) => {
    setEstado({ fase: "leyendo" });
    try {
      const image = await leerComoDataUrl(await comprimirImagen(file));
      const res = await fetch("/api/ocr/pedido", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ image }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<PedidoLeido> & { error?: string; codigo?: string };
      if (!res.ok || !Array.isArray(data.items)) {
        const esClave = data.codigo === "sin_lector" || data.codigo === "ia_no_disponible";
        setEstado({ fase: "error", mensaje: data.error ?? "No se pudo leer el pedido. Prueba de nuevo.", sinLector: data.codigo === "sin_lector", esClave });
        return;
      }
      if (data.items.length === 0) {
        setEstado({ fase: "error", mensaje: "No encontramos productos en la foto. Prueba con una foto más nítida, de frente.", sinLector: false, esClave: false });
        return;
      }
      const pedido: PedidoLeido = { cliente: data.cliente, items: data.items, costoIaUsd: data.costoIaUsd ?? null };
      setEstado({ fase: "revisar", pedido, elegidos: pedido.items.map((l) => (l.productoId != null ? String(l.productoId) : SIN_PRODUCTO)) });
    } catch (err) {
      logger.warn("[cotizaciones] leer pedido por foto falló", { error: String(err) });
      setEstado({ fase: "error", mensaje: "No se pudo enviar la foto. Revisa tu conexión y prueba de nuevo.", sinLector: false, esClave: false });
    }
  };

  const pasar = () => {
    if (estado.fase !== "revisar") return;
    const nuevos = itemsDesdeFoto(estado.pedido.items, estado.elegidos);
    form.setItems((prev) => [...prev.filter((i) => !filaVacia(i)), ...nuevos]);
    const dudosos = estado.pedido.items.filter((l, i) => esDudosa(l) || estado.elegidos[i] === SIN_PRODUCTO).length;
    setEstado({ fase: "pasado", cuantos: nuevos.length, dudosos });
  };

  const usarCliente = (c: NonNullable<PedidoLeido["cliente"]>) => {
    form.soltarCliente();
    if (c.nombre) form.setClienteNombre(c.nombre);
    if (c.documento) form.setClienteRuc(c.documento);
  };

  const abrirCamara = () => entrada.current?.click();
  const input = (
    <input
      ref={entrada}
      type="file"
      accept="image/*"
      capture="environment"
      className="sr-only"
      aria-label="Foto del pedido"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) void leer(f);
      }}
    />
  );
  const botonFoto = (texto: string) => (
    <button type="button" onClick={abrirCamara} disabled={estado.fase === "leyendo"} className={button({ variant: "secondary", className: "gap-1.5 rounded-xl px-4" })}>
      {estado.fase === "leyendo" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Camera className="h-4 w-4" aria-hidden />}
      {estado.fase === "leyendo" ? "Leyendo el pedido…" : texto}
    </button>
  );

  if (estado.fase !== "revisar") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {input}
        {botonFoto(estado.fase === "pasado" ? "Leer otra foto" : "Desde foto")}
        {estado.fase === "pasado" && (
          <p className="text-sm text-[var(--text-secondary)]" role="status">
            {estado.cuantos} {estado.cuantos === 1 ? "ítem pasado" : "ítems pasados"} de la foto
            {estado.dudosos > 0 ? `; revisa ${estado.dudosos} sin producto o dudosos` : ""}. El total lo calcula el sistema al guardar.
          </p>
        )}
        {estado.fase === "error" &&
          (estado.esClave ? (
            <AvisoClaveIa mensaje={estado.mensaje} conInstrucciones={estado.sinLector} />
          ) : (
            <p role="alert" className="text-sm font-semibold text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">{estado.mensaje}</p>
          ))}
      </div>
    );
  }

  const { pedido, elegidos } = estado;
  const dudosas = pedido.items.filter((l, i) => esDudosa(l) || elegidos[i] === SIN_PRODUCTO).length;
  const cliente = pedido.cliente;
  const clienteDistinto = cliente?.nombre && cliente.nombre.trim().toLowerCase() !== form.clienteNombre.trim().toLowerCase();
  return (
    <section aria-label="Pedido leído de la foto" className="space-y-3 rounded-xl bg-[var(--surface-sunken)] p-3">
      {input}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          {pedido.items.length} {pedido.items.length === 1 ? "línea leída" : "líneas leídas"}
          {dudosas > 0 && <span className="font-normal text-[var(--text-secondary)]"> · {dudosas} para revisar</span>}
        </p>
        <button type="button" onClick={() => setEstado({ fase: "inicio" })} aria-label="Descartar lo leído" className={button({ variant: "ghost", className: "w-12 rounded-xl px-0" })}>
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {cliente && clienteDistinto && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
          El papel dice cliente «{cliente.nombre}»{cliente.documento ? ` (${cliente.documento})` : ""}.
          <button type="button" onClick={() => usarCliente(cliente)} className={button({ variant: "ghost", className: "rounded-xl px-3 text-[var(--accent-ink)] dark:text-[var(--accent)]" })}>Usar este cliente</button>
        </p>
      )}
      <DesdeFotoPedidoRevisar
        lineas={pedido.items}
        elegidos={elegidos}
        onElegir={(idx, valor) => setEstado({ ...estado, elegidos: elegidos.map((v, i) => (i === idx ? valor : v)) })}
      />
      <div className="flex flex-wrap justify-end gap-2">
        {botonFoto("Leer otra foto")}
        <button type="button" onClick={pasar} className={button({ variant: "primary", className: "gap-1.5 rounded-xl px-5" })}>
          <Check className="h-4 w-4" aria-hidden /> Pasar a la cotización
        </button>
      </div>
    </section>
  );
}

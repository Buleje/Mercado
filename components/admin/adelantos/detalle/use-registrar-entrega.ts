"use client";

/**
 * El formulario «Registrar entrega» de la ficha de un adelanto: su estado y el
 * envío. Salió de `DetalleAdelantoModal` (434 líneas) sin cambiar lo que hacía,
 * y sumó lo que el backend ya aceptaba y la pantalla nunca mandaba: `metodoCaja`
 * en una entrega libre en plata (`adelantos.db.ts` mueve la caja con eso).
 */

import { useEffect, useState } from "react";
import { leerJson } from "@/lib/errores/sin-dato";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import type { DbEntregaPactada } from "@/lib/db/adelantos.db";

export type Producto = { id: number; name: string; price: number; stock?: number };

export function useRegistrarEntrega(adelantoId: string, onRegistrada: () => Promise<void> | void) {
  const [tipo, setTipo] = useState<"LIBRE" | "PRODUCTO">("LIBRE");
  const [descripcion, setDescripcion] = useState("");
  const [valor, setValor] = useState("");
  const [productId, setProductId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [sumarAStock, setSumarAStock] = useState(false);
  const [comprobante, setComprobante] = useState<string | null>(null);
  /** "" = no mover la caja: una entrega en trabajo o madera no pasa por el cajón. */
  const [metodoCaja, setMetodoCaja] = useState("");
  /** La cuota que se está liquidando: viaja como `pactadaId` y la marca cumplida. */
  const [pactada, setPactada] = useState<DbEntregaPactada | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);

  useEffect(() => {
    fetch("/api/products", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d: unknown) =>
        setProductos(
          Array.isArray(d)
            ? d.map((p: { id: number; name: string; price?: number; stock?: number }) => ({
                id: p.id,
                name: p.name,
                price: Number(p.price ?? 0),
                stock: p.stock,
              }))
            : [],
        ),
      )
      .catch((e) => logger.warn("[adelantos] /api/products falló", { error: String(e) }));
  }, []);

  /** Prellenar desde una cuota: el texto y el monto ya estaban pactados. */
  const cumplirCuota = (p: DbEntregaPactada) => {
    setPactada(p);
    setTipo("LIBRE");
    setDescripcion(p.descripcionEsperada);
    setValor(String(p.valorEsperado));
    setErr(null);
  };

  const limpiar = () => {
    setDescripcion(""); setValor(""); setProductId(""); setCantidad("");
    setSumarAStock(false); setComprobante(null); setPactada(null); setMetodoCaja("");
  };

  const registrar = async () => {
    setErr(null);
    const body: Record<string, unknown> = {
      tipo,
      notas: descripcion.trim() || undefined,
      comprobanteUrl: comprobante || undefined,
      /* Cierra la cuota en la misma operación: sin esto la entrega queda suelta
         y el plan sigue diciendo que la persona no cumplió. */
      pactadaId: pactada?.id,
    };
    if (tipo === "LIBRE") {
      const v = Number(valor);
      if (!descripcion.trim() || !v || v <= 0) { setErr("Describe la entrega y pon un valor."); return; }
      body.descripcion = descripcion.trim();
      body.valorManual = v;
      /* Sólo en plata: el servidor anota el movimiento según la dirección del
         adelanto (lo dado entra, lo recibido sale — ADR-448). */
      if (metodoCaja) body.metodoCaja = metodoCaja;
    } else {
      const pid = Number(productId);
      if (!pid) { setErr("Elige un producto del catálogo."); return; }
      body.productId = pid;
      body.descripcion = descripcion.trim() || undefined;
      if (cantidad) body.cantidad = Number(cantidad);
      if (valor) body.valorManual = Number(valor);
      body.sumarAStock = sumarAStock;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/adelantos/${adelantoId}/entregas`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (res.ok) {
        limpiar();
        await onRegistrada();
        return;
      }
      const j = await leerJson<{ error?: string; message?: string }>(res);
      /* Devolver en plata lo recibido es sólo del dueño o un administrador; y no puede pasar el saldo (400 con el motivo). */
      setErr(res.status === 403 ? "Esto lo registra el dueño o un administrador." : (j?.message ?? j?.error ?? "No se pudo registrar la entrega."));
    } catch (e) {
      logger.error("[adelantos] no se pudo registrar la entrega", { error: String(e) });
      setErr("No se pudo registrar la entrega. Revisa la conexión.");
    } finally {
      setSaving(false);
    }
  };

  return {
    tipo, setTipo, descripcion, setDescripcion, valor, setValor, productId, setProductId,
    cantidad, setCantidad, sumarAStock, setSumarAStock, comprobante, setComprobante,
    metodoCaja, setMetodoCaja, pactada, saving, err, productos, cumplirCuota, limpiar, registrar,
  };
}

export type RegistroEntrega = ReturnType<typeof useRegistrarEntrega>;

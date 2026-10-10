"use client";

/**
 * Acciones de «Me deben»: ficha del fiado, nuevo fiado y cobrar (un fiado o
 * todo lo que debe un cliente) con su recibo. Salió de FiadosModule.
 *
 * Cobrar ahora lleva el medio (Efectivo/Yape/Plin/Tarjeta) y puede entrar a
 * la caja abierta en la misma transacción (`aCaja`): antes el efectivo de un
 * fiado cobrado no aparecía en el arqueo del turno.
 */
import { useState } from "react";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import { formatDateLong } from "@/lib/format";
import type { DatosCobro, Fiado, ReciboData } from "./tipos";

/** A quién se le cobra: un fiado puntual o el total de un cliente (del más viejo al más nuevo). */
export type Cobrando =
  | { tipo: "fiado"; fiado: Fiado }
  | { tipo: "cliente"; telefono: string; nombre: string; saldo: number };

type RespuestaCaja = { caja?: { sinCaja: boolean } };

const FORM_VACIO = { customerId: "", total: "", descripcion: "", fechaVence: "" };

async function leerError(res: Response, porDefecto: string): Promise<string> {
  const err = (await res.json().catch(() => ({}))) as { error?: string };
  return err.error || porDefecto;
}

export function useFiadoAcciones(alCambiar: () => void) {
  // Ficha
  const [selected, setSelected] = useState<Fiado | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Nuevo fiado
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState(FORM_VACIO);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [dniPhoto, setDniPhoto] = useState<string | null>(null);

  // Cobrar + recibo
  const [cobrando, setCobrando] = useState<Cobrando | null>(null);
  const [paying, setPaying] = useState(false);
  const [pagoError, setPagoError] = useState<string | null>(null);
  const [showRecibo, setShowRecibo] = useState(false);
  const [reciboData, setReciboData] = useState<ReciboData | null>(null);

  const openDetail = async (fiado: Fiado) => {
    setSelected(fiado);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/fiados/${fiado.id}`);
      if (res.ok) setSelected((await res.json()) as Fiado);
    } catch (err) {
      // El fallback (datos del listado) es a propósito: la ficha abre igual.
      console.warn("[FiadosModule] detail fetch failed, using list data as fallback", err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCreate = async () => {
    setCreateError(null);
    const total = parseFloat(newForm.total);
    if (!newForm.customerId.trim()) { setCreateError("Cliente requerido"); return; }
    if (isNaN(total) || total <= 0) { setCreateError("Monto inválido"); return; }

    setCreating(true);
    try {
      const body: Record<string, unknown> = { customerId: newForm.customerId.trim(), total };
      // Foto del DNI: sube a /api/upload y guarda sólo la URL como [FOTO:url].
      // Best-effort: si falla, el fiado se crea igual sin la foto.
      let desc = newForm.descripcion.trim();
      if (dniPhoto) {
        try {
          const blob = await (await fetch(dniPhoto)).blob();
          const fd = new FormData();
          fd.append("file", new File([blob], "fiado-dni.jpg", { type: blob.type || "image/jpeg" }));
          fd.append("folder", "general");
          const upRes = await fetch("/api/upload", { method: "POST", headers: csrfHeaders(), body: fd });
          if (upRes.ok) {
            const up = (await upRes.json()) as { url?: string };
            if (up.url) desc = `[FOTO:${up.url}] ${desc}`.trim();
          }
        } catch {
          /* upload best-effort: se crea el fiado sin la foto si falla */
        }
      }
      if (desc) body.descripcion = desc;
      if (newForm.fechaVence) body.fechaVence = new Date(newForm.fechaVence).toISOString();

      const res = await fetch("/api/fiados", { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await leerError(res, "Error al crear el fiado"));
      setShowNew(false);
      setNewForm(FORM_VACIO);
      setDniPhoto(null);
      alCambiar();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setCreating(false);
    }
  };

  const abrirCobro = (c: Cobrando) => { setPagoError(null); setCobrando(c); };

  const cobrar = async ({ monto, metodo, aCaja, notas }: DatosCobro) => {
    if (!cobrando) return;
    setPagoError(null);
    if (isNaN(monto) || monto <= 0) { setPagoError("Monto inválido"); return; }
    setPaying(true);
    try {
      const nota = notas.trim() || undefined;
      // En el recibo va lo que el servidor aplicó, no lo pedido (por cliente puede ser menos).
      let pagado = monto;
      let saldoAnterior: number, saldoActual: number, nombre: string, telefono: string, sinCaja = false;
      if (cobrando.tipo === "fiado") {
        const f = cobrando.fiado;
        const res = await fetch(`/api/fiados/${f.id}/pagar`, {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ monto, notas: nota, metodo, aCaja }),
        });
        if (!res.ok) throw new Error(await leerError(res, "Error al registrar el pago"));
        const updated = (await res.json()) as Fiado & RespuestaCaja;
        sinCaja = !!updated.caja?.sinCaja;
        saldoAnterior = f.saldo; saldoActual = updated.saldo;
        nombre = f.customerName || f.customerId; telefono = f.customerId;
        if (selected?.id === f.id) setSelected(updated);
      } else {
        const res = await fetch("/api/fiados/cobrar", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ customerPhone: cobrando.telefono, monto, notas: nota, metodo, aCaja, nombre: cobrando.nombre }),
        });
        if (!res.ok) throw new Error(await leerError(res, "Error al cobrar"));
        const r = (await res.json()) as { totalCobrado: number } & RespuestaCaja;
        sinCaja = !!r.caja?.sinCaja;
        pagado = r.totalCobrado;
        saldoAnterior = cobrando.saldo; saldoActual = Math.max(0, cobrando.saldo - r.totalCobrado);
        nombre = cobrando.nombre; telefono = cobrando.telefono;
      }
      if (aCaja && sinCaja) toast.warning("Cobro anotado, pero no había caja abierta: no entró a la caja.");
      setReciboData({
        clienteNombre: nombre, montoPagado: pagado, saldoAnterior, saldoActual,
        fecha: formatDateLong(new Date()), clientePhone: telefono,
        metodo, caja: aCaja ? (sinCaja ? "sin-caja" : "entro") : undefined,
      });
      setShowRecibo(true);
      setCobrando(null);
      alCambiar();
    } catch (e) {
      setPagoError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setPaying(false);
    }
  };

  return {
    selected, setSelected, detailLoading, openDetail,
    showNew, setShowNew, newForm, setNewForm, creating, createError, setCreateError, dniPhoto, setDniPhoto, handleCreate,
    cobrando, setCobrando, abrirCobro, paying, pagoError, cobrar,
    showRecibo, setShowRecibo, reciboData,
  };
}

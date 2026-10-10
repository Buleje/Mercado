"use client";

/** El formulario de «Nueva guía»: campos, ítems, validación y el POST (el cuerpo no cambió). */
import { useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { emptyItem, FORM_VACIO, type DraftItem, type FormGuia } from "./tipos";

export function useNuevaGuia(onCreada: () => void) {
  const [form, setForm] = useState<FormGuia>(FORM_VACIO);
  const [items, setItems] = useState<DraftItem[]>([emptyItem()]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const campo = <K extends keyof FormGuia>(k: K, v: FormGuia[K]) => setForm((p) => ({ ...p, [k]: v }));
  const updateItem = (idx: number, field: keyof DraftItem, value: string) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const addItem = () => setItems((prev) => [...prev, emptyItem()]);

  const reiniciar = () => { setForm(FORM_VACIO); setItems([emptyItem()]); setError(null); };

  const crear = async () => {
    setError(null);
    if (!form.destinatarioNombre.trim()) { setError("Destinatario requerido"); return; }
    if (!form.puntoPartida.trim() || !form.puntoLlegada.trim()) { setError("Puntos de partida y llegada requeridos"); return; }
    if (!form.fechaTraslado) { setError("Fecha de traslado requerida"); return; }
    const parsedItems = items
      .map((i) => ({
        descripcion: i.descripcion,
        cantidad: parseFloat(i.cantidad) || 0,
        unidad: i.unidad,
        pesoUnitario: parseFloat(i.pesoUnitario) || undefined,
      }))
      .filter((i) => i.descripcion.trim() && i.cantidad > 0);
    if (parsedItems.length === 0) { setError("Agrega al menos un item"); return; }
    setCreating(true);
    try {
      const orderIds = form.orderIds.split(",").map((s) => s.trim()).filter(Boolean);
      const res = await fetch("/api/guias-remision", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          ...form,
          orderId: orderIds[0] || undefined,
          orderIds: orderIds.length > 0 ? orderIds : undefined,
          fechaTraslado: new Date(form.fechaTraslado).toISOString(),
          conductorNombre: form.conductorNombre || undefined,
          conductorDni: form.conductorDni || undefined,
          bultos: form.bultos ? parseInt(form.bultos) : undefined,
          documentoRef: form.documentoRef || undefined,
          pesoBruto: form.pesoBruto ? parseFloat(form.pesoBruto) : undefined,
          items: parsedItems,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error al crear" }));
        throw new Error(typeof err.error === "string" ? err.error : "Error al crear guía");
      }
      reiniciar();
      onCreada();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setCreating(false);
    }
  };

  return { form, campo, items, updateItem, removeItem, addItem, creating, error, setError, crear, reiniciar };
}

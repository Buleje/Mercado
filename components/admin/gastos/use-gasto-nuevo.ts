"use client";

import { useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { limaDateKey } from "@/lib/utils";
import type { ExpensePaymentMethod } from "@/lib/expense-meta";
import { errorDeRuc, igvIncluido, type TipoComprobante } from "@/lib/gastos/comprobante-del-gasto";

/**
 * El alta de un gasto: formulario, comprobante, foto, padrón del RUC y la caja.
 *
 * Los totales los decide el servidor (`POST /api/expenses` → `revisarComprobante`):
 * acá el IGV es sólo la vista previa de lo que se va a guardar.
 */

export interface FormGasto {
  category: string;
  description: string;
  amount: string;
  date: string;
  recurring: boolean;
  /** El permiso al que se imputa (ADR-421); arranca «Sin contrato». */
  contratoId: string | null;
  paymentMethod: ExpensePaymentMethod;
  /** Contrato «sale de la caja»: sólo cuenta con efectivo y caja abierta. */
  salidaDeCaja: boolean;
  documentType: TipoComprobante;
  documentNumber: string;
  supplierRuc: string;
  supplierName: string;
  /** `null` = todavía no eligió (obligatorio para una factura). */
  afectoIgv: boolean | null;
  attachmentUrl: string;
}

export interface CajaAbierta {
  abierta: boolean;
  /** Efectivo que debería haber en el cajón (`saldoEsperadoDeCaja`). */
  esperado?: number;
}

export interface Padron {
  nombre: string;
  condicion?: string;
  estado?: string;
}

export interface GastoGuardado {
  monto: number;
  /** `null` = no se pidió salida de caja. */
  caja: { sinCaja: boolean } | null;
}

const formVacio = (): FormGasto => ({
  category: "otros", description: "", amount: "", date: limaDateKey(), recurring: false, contratoId: null,
  paymentMethod: "efectivo", salidaDeCaja: true, documentType: "sin_comprobante", documentNumber: "",
  supplierRuc: "", supplierName: "", afectoIgv: null, attachmentUrl: "",
});

export function useGastoNuevo(abierto: boolean, onGuardado: (r: GastoGuardado) => void) {
  const [form, setForm] = useState<FormGasto>(formVacio);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ texto: string; campo?: string } | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [padron, setPadron] = useState<Padron | null>(null);
  const [buscandoRuc, setBuscandoRuc] = useState(false);
  const [caja, setCaja] = useState<CajaAbierta | null>(null);

  // La caja se mira al abrir: decide si «sale de la caja» se puede marcar.
  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    fetch("/api/finanzas/caja-abierta")
      .then((r) => (r.ok ? r.json() : { abierta: false }))
      .then((d: CajaAbierta) => { if (vivo) setCaja({ abierta: d.abierta === true, esperado: d.esperado }); })
      .catch((err) => { console.warn("[gastos] caja-abierta failed", err); if (vivo) setCaja({ abierta: false }); });
    return () => { vivo = false; };
  }, [abierto]);

  const set = <K extends keyof FormGasto>(campo: K, valor: FormGasto[K]) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    if (error?.campo === campo) setError(null);
  };

  const monto = Number(form.amount) || 0;
  const esFactura = form.documentType === "factura";
  const igvVistaPrevia = esFactura && form.afectoIgv === true ? igvIncluido(monto) : esFactura && form.afectoIgv === false ? 0 : null;
  /** Sin comprobante el campo del RUC no se ve: ni lo revisa ni lo manda. */
  const conPapel = form.documentType !== "sin_comprobante";
  const errorRuc = conPapel ? errorDeRuc(form.supplierRuc) : null;
  /** Sólo un gasto de HOY sale de la caja abierta (el servidor da 400 si no). */
  const esDeHoy = form.date === limaDateKey();
  const puedeSalirDeCaja = form.paymentMethod === "efectivo" && !form.recurring && esDeHoy && caja?.abierta === true;
  const faltaParaFactura = esFactura && (!form.supplierRuc.trim() || !form.documentNumber.trim() || form.afectoIgv == null);
  const puedeGuardar = !saving && !subiendo && form.description.trim() !== "" && monto > 0 && !errorRuc && !faltaParaFactura;
  /** Por qué el botón está apagado, en palabras (sólo cuando ya empezó a llenar). */
  const motivoBloqueo: string | null = (() => {
    if (saving || subiendo || (!form.description.trim() && !(monto > 0))) return null;
    if (!form.description.trim()) return "Escribe qué pagaste.";
    if (!(monto > 0)) return "Escribe el monto que pagaste.";
    if (errorRuc) return errorRuc;
    if (esFactura && !form.documentNumber.trim()) return "Falta el número de la factura.";
    if (esFactura && !form.supplierRuc.trim()) return "La factura lleva el RUC de quien te vendió.";
    if (esFactura && form.afectoIgv == null) return "Elige si la factura cobra IGV o está exonerada.";
    return null;
  })();

  const buscarRuc = async (ruc: string) => {
    setPadron(null);
    if (ruc.length !== 11 || errorDeRuc(ruc)) return;
    setBuscandoRuc(true);
    try {
      const r = await fetch(`/api/documento/lookup?numero=${encodeURIComponent(ruc)}`);
      const d = (await r.json().catch(() => ({}))) as { encontrado?: boolean } & Partial<Padron>;
      if (d.encontrado && d.nombre) {
        setPadron({ nombre: d.nombre, condicion: d.condicion, estado: d.estado });
        setForm((f) => (f.supplierName.trim() ? f : { ...f, supplierName: d.nombre ?? "" }));
      }
    } catch (err) {
      console.warn("[gastos] lookup RUC failed", err);
    } finally {
      setBuscandoRuc(false);
    }
  };

  const subirFoto = async (file: File) => {
    setSubiendo(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "gastos");
      const res = await fetch("/api/upload", { method: "POST", headers: csrfHeaders(), body: fd });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? "No se pudo subir la foto");
      set("attachmentUrl", body.url);
    } catch (err) {
      setError({ texto: err instanceof Error ? err.message : "No se pudo subir la foto", campo: "attachmentUrl" });
    } finally {
      setSubiendo(false);
    }
  };

  const guardar = async () => {
    if (!puedeGuardar) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          category: form.category, description: form.description.trim(), amount: monto, date: form.date,
          recurring: form.recurring, contratoId: form.contratoId, paymentMethod: form.paymentMethod,
          salidaDeCaja: puedeSalirDeCaja && form.salidaDeCaja,
          supplierName: form.supplierName.trim() || undefined,
          documentType: form.documentType,
          documentNumber: form.documentNumber.trim() || undefined,
          supplierRuc: (conPapel && form.supplierRuc.trim()) || undefined,
          afectoIgv: esFactura ? form.afectoIgv : undefined,
          attachmentUrl: form.attachmentUrl || undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; campo?: string; caja?: { sinCaja: boolean } };
      if (!res.ok) {
        setError({ texto: body.error ?? "No se pudo guardar el gasto", campo: body.campo });
        return;
      }
      onGuardado({ monto, caja: body.caja ?? null });
      setForm(formVacio());
      setPadron(null);
    } catch (err) {
      setError({ texto: err instanceof Error ? err.message : "No se pudo guardar el gasto" });
    } finally {
      setSaving(false);
    }
  };

  return {
    form, set, monto, saving, error, subiendo, padron, buscandoRuc, caja,
    igvVistaPrevia, errorRuc, esDeHoy, puedeSalirDeCaja, puedeGuardar, motivoBloqueo, buscarRuc, subirFoto, guardar,
  };
}

export type GastoNuevo = ReturnType<typeof useGastoNuevo>;

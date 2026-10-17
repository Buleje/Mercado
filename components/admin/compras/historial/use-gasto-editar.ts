"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { undoToast } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { errorDeRuc, igvIncluido, type TipoComprobante } from "@/lib/gastos/comprobante-del-gasto";
import { igvAlCambiarMonto } from "@/lib/gastos/corregir-comprobante";
import type { ComprobanteEditable, CamposPapel } from "@/components/admin/gastos/ComprobanteCampos";
import type { Padron } from "@/components/admin/gastos/use-gasto-nuevo";
import { borrarGasto, restaurarGasto } from "./restaurar";
import { fmt, type HistorialItem } from "./shared";

/**
 * Corregir un gasto: los datos de siempre más su comprobante (tipo, N°, RUC,
 * IGV, foto). El historial sólo trae lo que pinta la tabla, así que el papel se
 * lee aparte (`GET /api/expenses/[id]?detalle=1`). Se manda SÓLO lo que cambió:
 * el servidor revisa el comprobante con la regla del alta y decide el IGV.
 */

/** `YYYY-MM-DD` en hora local: con `toISOString()` el día se corre en Perú. */
export function comoFechaInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

type Detalle = {
  documentType?: string | null; documentNumber?: string | null; supplierRuc?: string | null;
  igvAmount?: number | null; afectoIgv?: boolean; attachmentUrl?: string | null;
};

type Papel = Omit<CamposPapel, "supplierName">;

const PAPEL_VACIO: Papel = { documentType: "sin_comprobante", documentNumber: "", supplierRuc: "", afectoIgv: null, attachmentUrl: "" };

function papelDe(d: Detalle): Papel {
  const crudo = String(d.documentType ?? "").trim();
  const tipo = (crudo === "ticket" ? "boleta" : crudo || "sin_comprobante") as TipoComprobante;
  return {
    documentType: tipo,
    documentNumber: d.documentNumber ?? "",
    supplierRuc: d.supplierRuc ?? "",
    // Factura sin IGV anotado = nadie eligió todavía.
    afectoIgv: tipo === "factura" && d.igvAmount != null ? d.afectoIgv === true : null,
    attachmentUrl: d.attachmentUrl ?? "",
  };
}

export function useGastoEditar(item: HistorialItem, onGuardado: () => void, onClose: () => void) {
  const [descripcion, setDescripcion] = useState(item.description);
  const [monto, setMonto] = useState(String(item.amount));
  const [categoria, setCategoria] = useState(item.category);
  const [fecha, setFecha] = useState(() => comoFechaInput(item.fecha));
  const [metodo, setMetodo] = useState<string>(item.meta?.paymentMethod ?? "");
  const [proveedor, setProveedor] = useState(item.supplierName ?? "");
  const [notas, setNotas] = useState(item.meta?.notes ?? "");

  const [papel, setPapel] = useState<Papel>(PAPEL_VACIO);
  /** Lo guardado: contra esto se decide qué cambió. `null` = todavía no se leyó. */
  const [papelGuardado, setPapelGuardado] = useState<Papel | null>(null);
  const [igvGuardado, setIgvGuardado] = useState<number | null>(null);
  const [papelError, setPapelError] = useState(false);
  const [padron, setPadron] = useState<Padron | null>(null);
  const [buscandoRuc, setBuscandoRuc] = useState(false);
  const [subiendo, setSubiendo] = useState(false);

  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<{ texto: string; campo?: string } | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/expenses/${item.refId}?detalle=1`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: Detalle) => {
        if (!vivo) return;
        const p = papelDe(d);
        setPapel(p);
        setPapelGuardado(p);
        setIgvGuardado(d.igvAmount ?? null);
      })
      .catch((err) => { console.warn("[GastoEditarModal] detalle falló", err); if (vivo) setPapelError(true); });
    return () => { vivo = false; };
  }, [item.refId]);

  const montoNum = Number(monto.replace(",", "."));
  const montoValido = Number.isFinite(montoNum) && montoNum > 0;
  const esFactura = papel.documentType === "factura";
  const conPapel = papel.documentType !== "sin_comprobante";
  const papelCambio = papelGuardado != null && (Object.keys(papel) as (keyof Papel)[]).some((k) => papel[k] !== papelGuardado[k]);
  const igvVistaPrevia = !esFactura ? null : papel.afectoIgv === false ? 0 : papel.afectoIgv !== true ? null
    // Sin tocar el papel, lo guardado manda (puede ser una factura mixta); si
    // cambia sólo el monto, la misma cuenta que hace el PUT.
    : !papelCambio && igvGuardado != null
      ? (montoNum === item.amount ? igvGuardado : montoValido ? igvAlCambiarMonto(item.amount, igvGuardado, montoNum) : null)
      : montoValido ? igvIncluido(montoNum) : null;
  const errorRuc = conPapel ? errorDeRuc(papel.supplierRuc) : null;
  /** Lo que falta sólo se pide si tocaste el papel: corregir el monto no obliga a completarlo. */
  const faltaFactura = papelCambio && esFactura && (!papel.supplierRuc.trim() || !papel.documentNumber.trim() || papel.afectoIgv == null);

  const set: ComprobanteEditable["set"] = (campo, valor) => {
    if (campo === "supplierName") setProveedor(String(valor));
    else setPapel((p) => ({ ...p, [campo]: valor }));
    if (error?.campo === campo) setError(null);
  };

  const buscarRuc = async (ruc: string) => {
    setPadron(null);
    if (ruc.length !== 11 || errorDeRuc(ruc)) return;
    setBuscandoRuc(true);
    try {
      const r = await fetch(`/api/documento/lookup?numero=${encodeURIComponent(ruc)}`);
      const d = (await r.json().catch(() => ({}))) as { encontrado?: boolean } & Partial<Padron>;
      if (d.encontrado && d.nombre) {
        setPadron({ nombre: d.nombre, condicion: d.condicion, estado: d.estado });
        setProveedor((p) => (p.trim() ? p : d.nombre ?? ""));
      }
    } catch (err) {
      console.warn("[GastoEditarModal] lookup RUC falló", err);
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
      setPapel((p) => ({ ...p, attachmentUrl: body.url ?? "" }));
    } catch (err) {
      setError({ texto: err instanceof Error ? err.message : "No se pudo subir la foto", campo: "attachmentUrl" });
    } finally {
      setSubiendo(false);
    }
  };

  const guardar = async () => {
    if (!montoValido) { setError({ texto: "El monto tiene que ser un número mayor que cero." }); return; }
    // Un RUC viejo mal tipeado no bloquea corregir el monto: sólo si tocaste el papel.
    if (errorRuc && papelCambio) { setError({ texto: errorRuc, campo: "supplierRuc" }); return; }
    if (faltaFactura) { setError({ texto: "A la factura le falta el número, el RUC o si cobra IGV.", campo: "documentNumber" }); return; }
    setGuardando(true);
    setError(null);

    // Se manda SÓLO lo que cambió. Importa: los gastos viejos (pre-ADR-374)
    // guardan metadata serializada dentro de `description`, así que reescribirla
    // sin necesidad borraría la frecuencia o el día de pago que sólo viven ahí.
    const patch: Record<string, unknown> = {};
    if (descripcion !== item.description) patch.description = descripcion;
    if (montoNum !== item.amount) patch.amount = montoNum;
    if (categoria !== item.category) patch.category = categoria;
    if (fecha !== comoFechaInput(item.fecha)) {
      const [y, m, d] = fecha.split("-").map(Number);
      patch.date = new Date(y ?? 0, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0).toISOString();
    }
    if (metodo !== (item.meta?.paymentMethod ?? "")) patch.paymentMethod = metodo || null;
    if (proveedor !== (item.supplierName ?? "")) patch.supplierName = proveedor || null;
    if (notas !== (item.meta?.notes ?? "")) patch.notes = notas || null;
    if (papelGuardado) {
      if (papel.documentType !== papelGuardado.documentType) patch.documentType = papel.documentType;
      if (papel.documentNumber !== papelGuardado.documentNumber) patch.documentNumber = papel.documentNumber || null;
      if (papel.supplierRuc !== papelGuardado.supplierRuc) patch.supplierRuc = papel.supplierRuc || null;
      if (papel.afectoIgv !== papelGuardado.afectoIgv && papel.afectoIgv != null) patch.afectoIgv = papel.afectoIgv;
      if (papel.attachmentUrl !== papelGuardado.attachmentUrl) patch.attachmentUrl = papel.attachmentUrl || null;
    }

    if (Object.keys(patch).length === 0) { setGuardando(false); onClose(); return; }

    try {
      const res = await fetch(`/api/expenses/${item.refId}`, {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(patch),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; campo?: string; caja?: { aviso?: string } };
      if (!res.ok) {
        // 400 (papel mal) y 409 (retiro en caja) traen el motivo en palabras.
        setError({ texto: body.error ?? "No se pudo guardar el cambio. Intenta de nuevo.", campo: body.campo });
        return;
      }
      if (body.caja?.aviso) toast.message(body.caja.aviso);
      onGuardado();
      onClose();
    } catch (err) {
      console.warn("[GastoEditarModal] guardar falló", err);
      setError({ texto: "No se pudo guardar el cambio. Intenta de nuevo." });
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    setBorrando(true);
    setError(null);
    try {
      const borrado = await borrarGasto(item.refId);
      onGuardado();
      onClose();
      // El undo de 5 segundos reemplaza al «¿estás seguro?» (patrón `undoToast`
      // del DS). Si la plata volvió a la caja, se dice en el mismo aviso.
      undoToast({
        message: "Gasto borrado",
        description: [`${item.description || "Sin descripción"} · ${fmt(item.amount)}`, borrado.caja?.aviso].filter(Boolean).join(" · "),
        onUndo: async () => {
          try {
            const r = await restaurarGasto(borrado);
            if (r.aviso) (r.tono === "aviso" ? toast.warning : toast.success)(r.aviso);
            onGuardado();
          } catch (err) {
            console.warn("[GastoEditarModal] restaurar falló", err);
            toast.error("No se pudo deshacer el borrado. Vuelve a cargar el gasto.");
          }
        },
      });
    } catch (err) {
      console.warn("[GastoEditarModal] borrar falló", err);
      setError({ texto: "No se pudo borrar el gasto. Intenta de nuevo." });
      setBorrando(false);
    }
  };

  /** Lo que `ComprobanteCampos` necesita, con el proveedor compartido con la ficha. */
  const comprobante: ComprobanteEditable = {
    form: { ...papel, supplierName: proveedor },
    set, error, errorRuc, padron, buscandoRuc, igvVistaPrevia, subiendo, buscarRuc, subirFoto,
  };

  return {
    descripcion, setDescripcion, monto, setMonto, categoria, setCategoria, fecha, setFecha,
    metodo, setMetodo, proveedor, setProveedor, notas, setNotas,
    montoValido, conPapel, comprobante, papelListo: papelGuardado != null, papelError,
    guardando, borrando, ocupado: guardando || borrando || subiendo, error, guardar, borrar,
  };
}

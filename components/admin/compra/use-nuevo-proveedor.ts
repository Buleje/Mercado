"use client";

import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { csrfHeaders } from "@/lib/csrf-client";
import type { PurchaseSupplier as Supplier } from "@/lib/types/purchases";

export type DatosProveedor = { name: string; ruc: string; phone: string; email: string; address: string; razonSocial: string };
export type EstadoRuc = { status: "idle" | "loading" | "ok" | "notfound" | "error"; msg?: string };

const VACIO: DatosProveedor = { name: "", ruc: "", phone: "", email: "", address: "", razonSocial: "" };

type Opciones = {
  /** El proveedor creado entra a la lista y queda elegido en la orden. */
  alCrear: (s: Supplier) => void;
  setToastMsg: Dispatch<SetStateAction<string | null>>;
};

/** Modal «Nuevo proveedor» del Punto de compra: RUC → SUNAT → alta en /api/suppliers. */
export function useNuevoProveedor({ alCrear, setToastMsg }: Opciones) {
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newSupplier, setNewSupplier] = useState<DatosProveedor>(VACIO);
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [rucLookup, setRucLookup] = useState<EstadoRuc>({ status: "idle" });

  const cerrarNuevoProveedor = useCallback(() => {
    if (!creatingSupplier) setShowNewSupplier(false);
  }, [creatingSupplier]);
  const nuevoProveedorModalRef = useRef<HTMLDivElement>(null);
  useModalAccesible(nuevoProveedorModalRef, { onCerrar: cerrarNuevoProveedor, activo: showNewSupplier });
  const ventanaNuevoProveedor = useVentanaDeModal(showNewSupplier, { ref: nuevoProveedorModalRef, aplicarTranslate: true, claveMemoria: "pos-nuevo-proveedor" });

  // ── Lookup RUC en SUNAT (auto-completar datos) ───────────────────────────────
  const handleRucLookup = useCallback(async (ruc: string) => {
    if (!/^[12]\d{10}$/.test(ruc)) {
      setRucLookup({ status: "idle" });
      return;
    }
    setRucLookup({ status: "loading" });
    try {
      const res = await fetch(`/api/sunat/lookup-ruc?ruc=${encodeURIComponent(ruc)}`, { credentials: "include" });
      if (res.status === 404) {
        setRucLookup({ status: "notfound", msg: "RUC no existe en SUNAT" });
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRucLookup({ status: "error", msg: data?.error ?? "No se pudo consultar SUNAT" });
        return;
      }
      const data = await res.json() as {
        razonSocial?: string; nombreComercial?: string; direccion?: string;
        departamento?: string; provincia?: string; distrito?: string; estado?: string;
      };
      const fullAddress = [data.direccion, data.distrito, data.provincia, data.departamento]
        .filter(Boolean).join(", ").replace(/,\s+,/g, ",");
      setNewSupplier((s) => ({
        ...s,
        // Si aún no se escribió un nombre, usar razón social
        name: s.name.trim() ? s.name : (data.nombreComercial || data.razonSocial || s.name),
        razonSocial: data.razonSocial ?? "",
        address: fullAddress,
      }));
      setRucLookup({
        status: "ok",
        msg: data.estado === "ACTIVO" || !data.estado ? "Datos cargados de SUNAT" : `Cuidado: estado ${data.estado}`,
      });
    } catch {
      setRucLookup({ status: "error", msg: "Error de red al consultar SUNAT" });
    }
  }, []);

  /** Abre el modal; con datos de la factura escaneada, ya trae RUC y nombre y consulta SUNAT. */
  const abrir = useCallback((prefill?: { ruc?: string; name?: string }) => {
    const ruc = (prefill?.ruc ?? "").replace(/\D/g, "").slice(0, 11);
    setNewSupplier({ ...VACIO, ruc, name: prefill?.name?.trim() ?? "" });
    setRucLookup({ status: "idle" });
    setShowNewSupplier(true);
    if (ruc.length === 11) void handleRucLookup(ruc);
  }, [handleRucLookup]);

  const handleCreateSupplier = useCallback(async () => {
    const name = newSupplier.name.trim();
    if (!name) {
      setToastMsg("Falta el nombre del proveedor");
      return;
    }
    setCreatingSupplier(true);
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          name,
          ruc: newSupplier.ruc.trim() || undefined,
          phone: newSupplier.phone.trim() || undefined,
          email: newSupplier.email.trim() || undefined,
          address: newSupplier.address.trim() || undefined,
          razonSocial: newSupplier.razonSocial.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ? "Datos invalidos" : `Error ${res.status}`);
      }
      const created: Supplier = await res.json();
      alCrear(created);
      setShowNewSupplier(false);
      setNewSupplier(VACIO);
      setRucLookup({ status: "idle" });
      setToastMsg(`Proveedor "${created.name}" creado y seleccionado`);
    } catch (e) {
      setToastMsg(e instanceof Error ? e.message : "No se pudo crear el proveedor");
    } finally {
      setCreatingSupplier(false);
    }
  }, [newSupplier, alCrear, setToastMsg]);

  return {
    showNewSupplier, setShowNewSupplier, abrir, newSupplier, setNewSupplier, creatingSupplier, rucLookup, setRucLookup,
    cerrarNuevoProveedor, nuevoProveedorModalRef, ventanaNuevoProveedor, handleRucLookup, handleCreateSupplier,
  };
}

export type NuevoProveedor = ReturnType<typeof useNuevoProveedor>;

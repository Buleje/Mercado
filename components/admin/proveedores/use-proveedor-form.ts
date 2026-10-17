'use client';

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { csrfHeaders } from "@/lib/csrf-client";
import { EMPTY_FORM, cuerpoDelProveedor, formDesdeProveedor, type SupplierFormData } from './proveedor-form-datos';

export type RucLookup = { status: "idle" | "loading" | "ok" | "notfound" | "error"; msg?: string };
export type Formato = 'simple' | 'completo';

/**
 * Estado y acciones del formulario de proveedor: formato recordado, la ficha,
 * el autocompletado por RUC en SUNAT y el guardado (POST o PATCH).
 */
export function useProveedorForm({ supplier, initialFormat, onSaved, onClose }: {
  supplier?: Record<string, unknown> | null;
  initialFormat?: Formato;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<Formato>(() => {
    if (initialFormat) return initialFormat;
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('proveedor-form-format') as Formato) ?? 'simple';
    }
    return 'simple';
  });
  const [form, setForm] = useState<SupplierFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rucLookup, setRucLookup] = useState<RucLookup>({ status: "idle" });
  const isEdit = !!supplier;

  // ── Lookup RUC en SUNAT ───────────────────────────────────────────────────
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
        setRucLookup({ status: "error", msg: "No se pudo consultar SUNAT" });
        return;
      }
      const data = await res.json() as {
        razonSocial?: string;
        nombreComercial?: string;
        direccion?: string;
        departamento?: string;
        provincia?: string;
        distrito?: string;
        estado?: string;
      };
      setForm((f) => ({
        ...f,
        razonSocial: data.razonSocial ?? f.razonSocial,
        name: f.name || data.nombreComercial || data.razonSocial || f.name,
        direccion: data.direccion?.trim() || f.direccion,
        departamento: data.departamento || f.departamento,
        provincia: data.provincia || f.provincia,
        distrito: data.distrito || f.distrito,
        tipoPersona: f.tipoPersona === 'natural' ? f.tipoPersona : 'juridica',
      }));
      setRucLookup({
        status: "ok",
        msg: data.estado === "ACTIVO" || !data.estado ? "Datos cargados de SUNAT" : `Estado: ${data.estado}`,
      });
    } catch {
      setRucLookup({ status: "error", msg: "Error de red al consultar SUNAT" });
    }
  }, []);

  // Populate form when editing
  useEffect(() => {
    setForm(supplier ? formDesdeProveedor(supplier) : EMPTY_FORM);
  }, [supplier]);

  const changeFormat = useCallback((f: Formato) => {
    setFormat(f);
    if (typeof window !== 'undefined') localStorage.setItem('proveedor-form-format', f);
  }, []);

  const set = useCallback(<K extends keyof SupplierFormData>(key: K, value: SupplierFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const nombre = form.tipoPersona === 'juridica' ? form.razonSocial || form.name : form.name;
    if (!nombre.trim()) {
      setError('El nombre es requerido');
      return;
    }

    setSaving(true);
    try {
      const body = cuerpoDelProveedor(form);
      if (isEdit) {
        const res = await fetch(`/api/suppliers/${encodeURIComponent(supplier!.id as string)}`, {
          method: 'PATCH',
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? 'Error al actualizar');
        }
      } else {
        const res = await fetch('/api/suppliers', {
          method: 'POST',
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? 'Error al crear');
        }
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setSaving(false);
    }
  };

  return { format, changeFormat, form, setForm, set, saving, error, rucLookup, setRucLookup, handleRucLookup, isEdit, handleSubmit };
}

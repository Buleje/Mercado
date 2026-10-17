'use client';

import { useState, useEffect, useCallback, useMemo, type FormEvent } from 'react';
import { csrfHeaders } from "@/lib/csrf-client";
import {
  avisoDeDocumento, coincidenciasDeProveedor, errorDeDocumento, type Coincidencia, type ProveedorParaCruce,
} from "@/lib/compras/proveedor-identidad";
import { EMPTY_FORM, cuerpoDelProveedor, formDesdeProveedor, type SupplierFormData } from './proveedor-form-datos';

export type RucLookup = { status: "idle" | "loading" | "ok" | "notfound" | "error"; msg?: string };
export type Formato = 'simple' | 'completo';

/**
 * Estado y acciones del formulario de proveedor: formato recordado, la ficha,
 * el autocompletado por RUC en SUNAT y el guardado (POST o PATCH).
 */
export function useProveedorForm({ supplier, initialFormat, onSaved, onClose, existentes = [] }: {
  supplier?: Record<string, unknown> | null;
  initialFormat?: Formato;
  onSaved: () => void;
  onClose: () => void;
  /** Los proveedores ya guardados: para avisar «se parece a…» antes de guardar (C34). */
  existentes?: readonly ProveedorParaCruce[];
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
  // El servidor frenó por documento repetido (409): el próximo «Guardar igual» lo confirma.
  const [confirmarDuplicado, setConfirmarDuplicado] = useState(false);
  const isEdit = !!supplier;
  const idPropio = typeof supplier?.id === 'string' ? supplier.id : undefined;

  // C34: con quién se parece mientras escribes (avisa; no une ni bloquea).
  const coincidencias: Coincidencia[] = useMemo(() => {
    const nombre = form.tipoPersona === 'juridica' ? form.razonSocial || form.name : form.name;
    return coincidenciasDeProveedor(
      { name: nombre, razonSocial: form.razonSocial, tipoDocumento: form.tipoDocumento, documento: form.documento,
        phone: form.phone, whatsappSecundario: form.whatsappSecundario, email: form.email },
      existentes,
      idPropio,
    );
  }, [existentes, idPropio, form.tipoPersona, form.razonSocial, form.name, form.tipoDocumento, form.documento, form.phone, form.whatsappSecundario, form.email]);
  const avisoDocumento = avisoDeDocumento(form.tipoDocumento, form.documento);

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
    // Otro documento = otra pregunta: la confirmación anterior no vale.
    if (key === 'documento' || key === 'tipoDocumento') setConfirmarDuplicado(false);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const nombre = form.tipoPersona === 'juridica' ? form.razonSocial || form.name : form.name;
    if (!nombre.trim()) {
      setError('El nombre es requerido');
      return;
    }
    const errorDoc = errorDeDocumento(form.tipoDocumento, form.documento);
    if (errorDoc) {
      setError(errorDoc);
      return;
    }

    setSaving(true);
    try {
      const body = { ...cuerpoDelProveedor(form), ...(confirmarDuplicado ? { confirmarDuplicado: true } : {}) };
      if (isEdit) {
        const res = await fetch(`/api/suppliers/${encodeURIComponent(supplier!.id as string)}`, {
          method: 'PATCH',
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await mensajeDeError(res, 'Error al actualizar', setConfirmarDuplicado));
      } else {
        const res = await fetch('/api/suppliers', {
          method: 'POST',
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await mensajeDeError(res, 'Error al crear', setConfirmarDuplicado));
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setSaving(false);
    }
  };

  return {
    format, changeFormat, form, setForm, set, saving, error, rucLookup, setRucLookup, handleRucLookup, isEdit, handleSubmit,
    coincidencias, avisoDocumento, confirmarDuplicado,
  };
}

/**
 * El texto que se muestra cuando la API dice que no. El 400 de Zod trae un
 * objeto por campo (antes salía «[object Object]»); el 409 de documento
 * repetido deja listo el «Guardar igual».
 */
async function mensajeDeError(res: Response, porDefecto: string, setConfirmar: (v: boolean) => void): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: unknown };
  if (res.status === 409) setConfirmar(true);
  if (typeof data.error === 'string') return data.error;
  if (data.error && typeof data.error === 'object') {
    const campos = Object.keys(data.error as Record<string, unknown>);
    if (campos.length > 0) return `Revisa estos datos: ${campos.join(', ')}.`;
  }
  return porDefecto;
}

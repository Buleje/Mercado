import { useState, useEffect, useCallback, useRef } from "react";
import type { CustomerData, Order, TimelineEvent } from "@/components/admin/cliente360/cliente360-compartido";
import { guardarCliente } from "@/components/admin/cliente360/guardar-cliente";

/** Etiquetas guardadas como JSON en `customer.tags`; cualquier otra cosa = sin etiquetas. */
function etiquetasDe(tags: string | null | undefined): string[] {
  if (!tags) return [];
  try {
    const parsed: unknown = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

/** Estado, carga y guardados de la ficha 360 del cliente (antes dentro de Customer360Tab). */
export function useCliente360(phone: string) {
  const [customer, setCustomer]   = useState<CustomerData | null>(null);
  const [orders, setOrders]       = useState<Order[]>([]);
  const [timeline, setTimeline]   = useState<TimelineEvent[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(false);
  const [notes, setNotes]         = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved]   = useState(false);
  const [showEstadoCuenta, setShowEstadoCuenta] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  // Mejora 10R2: Observaciones con auto-save debounce
  const [observaciones, setObservaciones] = useState("");
  const [obsExpanded, setObsExpanded] = useState(false);
  const [savingObs, setSavingObs] = useState(false);
  const [obsSaved, setObsSaved] = useState(false);
  const obsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tags state
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [savingTags, setSavingTags] = useState(false);

  // Credit limit state
  const [editingCreditLimit, setEditingCreditLimit] = useState(false);
  const [creditLimitInput, setCreditLimitInput] = useState("");
  const [savingCreditLimit, setSavingCreditLimit] = useState(false);

  const load = useCallback(async () => {
    if (!phone) return;
    setLoading(true);
    setError(false);
    try {
      const [custRes, ordersRes, timelineRes] = await Promise.all([
        fetch(`/api/customers/${encodeURIComponent(phone)}`),
        fetch(`/api/customers/${encodeURIComponent(phone)}/orders`),
        fetch(`/api/customers/${encodeURIComponent(phone)}/timeline`),
      ]);
      if (!custRes.ok) throw new Error("customer not found");
      const [custData, ordersData, timelineData] = await Promise.all([
        custRes.json(),
        ordersRes.ok ? ordersRes.json() : [],
        timelineRes.ok ? timelineRes.json() : [],
      ]);
      setCustomer(custData);
      /**
       * Lo editable se llena SÓLO al traerlo del servidor. En un efecto de
       * `customer`, marcar un aviso o guardar el tope (ambos hacen setCustomer)
       * borraba la nota a medio escribir y devolvía las etiquetas recién puestas.
       */
      setTags(etiquetasDe(custData.tags));
      setCreditLimitInput(String(custData.creditLimit ?? 0));
      setObservaciones(custData.observaciones ?? "");
      setNotes(custData.privateNotes ?? "");
      if (custData.observaciones) setObsExpanded(true);
      setOrders(ordersData);
      setTimeline(timelineData);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [phone]);

  useEffect(() => { load(); }, [load]);

  const handleAddTag = async (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || tags.includes(trimmed) || !phone) return;
    const previos = tags;
    const updated = [...tags, trimmed];
    setTags(updated);
    setNewTag("");
    setSavingTags(true);
    try {
      // Si el servidor rechaza, la etiqueta vuelve: dejarla en pantalla sería
      // decirle al usuario que quedó guardada.
      if (!await guardarCliente(phone, { tags: JSON.stringify(updated) }, "guardar la etiqueta")) {
        setTags(previos);
      } else {
        setCustomer(prev => (prev ? { ...prev, tags: JSON.stringify(updated) } : prev));
      }
    } finally {
      setSavingTags(false);
    }
  };

  const handleRemoveTag = async (tag: string) => {
    if (!phone) return;
    const previos = tags;
    const updated = tags.filter(t => t !== tag);
    setTags(updated);
    setSavingTags(true);
    try {
      if (!await guardarCliente(phone, { tags: JSON.stringify(updated) }, "quitar la etiqueta")) {
        setTags(previos);
      } else {
        setCustomer(prev => (prev ? { ...prev, tags: JSON.stringify(updated) } : prev));
      }
    } finally {
      setSavingTags(false);
    }
  };

  const handleSaveCreditLimit = async () => {
    if (!phone) return;
    const limit = parseFloat(creditLimitInput);
    if (isNaN(limit) || limit < 0) return;
    setSavingCreditLimit(true);
    try {
      /**
       * El tope de fiado es lo más caro de esta pantalla: `setCustomer` pintaba
       * el límite nuevo sin saber si el servidor lo había aceptado, y el cajero
       * fiaba contra un número que sólo existía en su navegador.
       */
      if (!await guardarCliente(phone, { creditLimit: limit }, "guardar el límite de crédito")) return;
      setCustomer(prev => prev ? { ...prev, creditLimit: limit } : prev);
      setEditingCreditLimit(false);
    } finally {
      setSavingCreditLimit(false);
    }
  };

  // Mejora 10R2: Auto-save observaciones con debounce 1s
  const handleObservacionesChange = (value: string) => {
    setObservaciones(value);
    setObsSaved(false);
    if (obsTimerRef.current) clearTimeout(obsTimerRef.current);
    obsTimerRef.current = setTimeout(async () => {
      if (!phone) return;
      setSavingObs(true);
      try {
        // El «Guardado ✓» del autosave salía siempre, incluso con el PATCH
        // rechazado: el usuario cerraba la ficha convencido de que su
        // observación quedó escrita.
        if (await guardarCliente(phone, { observaciones: value }, "guardar las observaciones")) {
          setCustomer(prev => (prev ? { ...prev, observaciones: value } : prev));
          setObsSaved(true);
          setTimeout(() => setObsSaved(false), 2500);
        }
      } finally { setSavingObs(false); }
    }, 1000);
  };

  const handleSaveNotes = async () => {
    if (!phone) return;
    setSavingNotes(true);
    try {
      if (await guardarCliente(phone, { privateNotes: notes }, "guardar las notas")) {
        setCustomer(prev => (prev ? { ...prev, privateNotes: notes } : prev));
        setNotesSaved(true);
        setTimeout(() => setNotesSaved(false), 2500);
      }
    } finally {
      setSavingNotes(false);
    }
  };
  return {
    phone, customer, setCustomer, orders, setOrders, timeline, setTimeline, loading, setLoading, error,
    setError, notes, setNotes, savingNotes, setSavingNotes, notesSaved, setNotesSaved,
    showEstadoCuenta, setShowEstadoCuenta, showEditModal, setShowEditModal, observaciones,
    setObservaciones, obsExpanded, setObsExpanded, savingObs, setSavingObs, obsSaved, setObsSaved,
    obsTimerRef, tags, setTags, newTag, setNewTag, savingTags, setSavingTags, editingCreditLimit,
    setEditingCreditLimit, creditLimitInput, setCreditLimitInput, savingCreditLimit,
    setSavingCreditLimit, load, handleAddTag, handleRemoveTag, handleSaveCreditLimit,
    handleObservacionesChange, handleSaveNotes,
  };
}

export type Cliente360 = ReturnType<typeof useCliente360>;

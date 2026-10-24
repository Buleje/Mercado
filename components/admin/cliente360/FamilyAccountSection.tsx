"use client";

import { CardTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useState } from "react";
import { Users, Star, Loader2, X } from "@buleje/design-system/icons";
import { getInitials, getAvatarColor, type CustomerData } from "@/components/admin/cliente360/cliente360-compartido";

// ── Idea 17: Family Account Component ─────────────────────────────────────

export type FamilyMember = { nombre: string; teléfono: string; relacion: string };

export function FamilyAccountSection({ phone, customer }: { phone: string; customer: CustomerData }) {
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>(() => {
    try {
      const obs = customer?.observaciones ?? "";
      const match = obs.match(/\{"familia":\s*\[.*?\]\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return Array.isArray(parsed.familia) ? parsed.familia : [];
      }
    } catch { /* ignore */ }
    return [];
  });
  const [addingMember, setAddingMember] = useState(false);
  const [newMember, setNewMember] = useState({ nombre: "", teléfono: "", relacion: "esposa" });
  const [savingFamily, setSavingFamily] = useState(false);

  const saveFamily = async (members: FamilyMember[]) => {
    setFamilyMembers(members);
    setSavingFamily(true);
    try {
      const currentObs = customer?.observaciones ?? "";
      const familyJson = JSON.stringify({ familia: members });
      const cleanedObs = currentObs.replace(/\{"familia":\s*\[.*?\]\}\s*/g, "").trim();
      const newObs = cleanedObs ? `${cleanedObs}\n${familyJson}` : familyJson;
      await fetch(`/api/customers/${encodeURIComponent(phone)}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ observaciones: newObs }),
      });
    } catch { /* ignore */ }
    setSavingFamily(false);
  };

  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-2">
          <Users className="h-4 w-4 text-[var(--data-success-500)]" /> Cuenta Familiar
          {savingFamily && <Loader2 className="h-3 w-3 animate-spin text-[var(--text-tertiary)]" />}
        </CardTitle>
        <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">{familyMembers.length} miembros</span>
      </div>
      <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mb-3">Las compras de toda la familia suman al mismo historial. El fiado y puntos son compartidos.</p>

      <div className="flex items-center gap-2 bg-primary/10 dark:bg-primary/15 rounded-lg px-3 py-2 mb-2">
        <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ backgroundColor: getAvatarColor(customer.name) }}>
          {getInitials(customer.name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{customer.name} <span className="text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">(titular)</span></p>
          <p className="text-xs text-[var(--text-tertiary)]">{customer.phone}</p>
        </div>
        <Star className="h-3.5 w-3.5 text-[var(--data-warning-500)] shrink-0" />
      </div>

      {familyMembers.map((m, i) => (
        <div key={i} className="flex items-center gap-2 bg-[var(--surface-alt)] rounded-lg px-3 py-2 mb-1.5">
          <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ backgroundColor: getAvatarColor(m.nombre) }}>
            {getInitials(m.nombre)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{m.nombre} <span className="text-[var(--text-tertiary)] font-normal">({m.relacion})</span></p>
            <p className="text-xs text-[var(--text-tertiary)]">{m.teléfono}</p>
          </div>
          <button aria-label="Quitar" onClick={() => saveFamily(familyMembers.filter((_, idx) => idx !== i))} className="text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {addingMember ? (
        <div className="mt-2 bg-primary/10 dark:bg-primary/15 rounded-lg p-3 space-y-2">
          <p className="text-xs font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">Nuevo miembro familiar</p>
          <div className="grid grid-cols-2 gap-2">
            <input type="text" placeholder="Nombre" value={newMember.nombre} onChange={e => setNewMember({...newMember, nombre: e.target.value})} className="text-xs border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl px-2 py-1.5 bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)]" />
            <input type="tel" placeholder="Teléfono" value={newMember.teléfono} onChange={e => setNewMember({...newMember, teléfono: e.target.value})} className="text-xs border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl px-2 py-1.5 bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)]" />
          </div>
          <select value={newMember.relacion} onChange={e => setNewMember({...newMember, relacion: e.target.value})} className="text-xs border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl px-2 py-1.5 bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] w-full">
            <option value="esposa">Esposa/o</option>
            <option value="hijo">Hijo/a</option>
            <option value="padre">Padre/Madre</option>
            <option value="hermano">Hermano/a</option>
            <option value="otro">Otro</option>
          </select>
          <div className="flex gap-2">
            <button onClick={() => { if (newMember.nombre.trim()) { saveFamily([...familyMembers, newMember]); setNewMember({ nombre: "", teléfono: "", relacion: "esposa" }); setAddingMember(false); } }} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90">Agregar</button>
            <button onClick={() => setAddingMember(false)} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">Cancelar</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAddingMember(true)} className="mt-2 w-full py-2 rounded-xl border border-dashed border-[var(--rule-base)] dark:border-[var(--rule-base)] text-xs font-bold text-[var(--text-tertiary)] hover:text-primary hover:border-primary/40 transition-colors">
          + Agregar miembro familiar
        </button>
      )}
    </div>
  );
}

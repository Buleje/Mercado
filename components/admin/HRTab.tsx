"use client";

import { CardTitle, PageTitle } from "@buleje/design-system";
import { Field } from '@/components/admin/shared/Field';

import { useState, useMemo } from "react";
import {
  Users, Plus, X, Download, Search, Calendar,
  CheckCircle, AlertTriangle, Clock, UserCheck,
  Phone, Briefcase, Loader2,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type EmployeeStatus = "activo" | "inactivo" | "vacaciones" | "licencia";
type AttendanceStatus = "presente" | "tarde" | "ausente" | "permiso" | "vacacion";

type Employee = {
  id: string;
  name: string;
  dni: string;
  role: string;
  department: string;
  phone: string;
  email: string;
  startDate: string;
  baseSalary: number;
  status: EmployeeStatus;
  photoInitials: string;
  color: string;
};

type AttendanceRecord = {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  checkIn?: string;
  checkOut?: string;
  notes: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function yearsOf(startDate: string): string {
  const months = Math.floor((Date.now() - new Date(startDate).getTime()) / (30.44 * 86400000));
  if (months < 1) return "< 1 mes";
  if (months < 12) return `${months} mes${months > 1 ? "es" : ""}`;
  const y = Math.floor(months / 12); const m = months % 12;
  return `${y} año${y > 1 ? "s" : ""}${m > 0 ? ` ${m}m` : ""}`;
}
function today(): string { return new Date().toISOString().slice(0, 10); }

const STATUS_EMP: Record<EmployeeStatus, { label: string; color: string; bg: string }> = {
  activo:     { label: "Activo",      color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
  inactivo:   { label: "Inactivo",    color: "text-[var(--text-secondary)] dark:text-muted",          bg: "bg-[var(--surface-sunken)] dark:bg-surface" },
  vacaciones: { label: "Vacaciones",  color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",       bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
  licencia:   { label: "Licencia",    color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",     bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30" },
};
const STATUS_ATT: Record<AttendanceStatus, { label: string; color: string; bg: string; icon: typeof CheckCircle }> = {
  presente: { label: "Presente", color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", icon: CheckCircle },
  tarde:    { label: "Tarde",    color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",      bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30",    icon: Clock },
  ausente:  { label: "Ausente",  color: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",          bg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30",        icon: AlertTriangle },
  permiso:  { label: "Permiso",  color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",        bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",      icon: UserCheck },
  vacacion: { label: "Vacación", color: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",    bg: "bg-[var(--surface-sunken)]", icon: Calendar },
};

// ── Seed data ─────────────────────────────────────────────────────────────────

const D = today();
const SEED_EMPLOYEES: Employee[] = [];

const SEED_ATTENDANCE: AttendanceRecord[] = [];

const EMPTY_EMP: Omit<Employee, "id" | "photoInitials" | "color"> = {
  name: "", dni: "", role: "", department: "Ventas", phone: "", email: "",
  startDate: "", baseSalary: 1025, status: "activo",
};

const COLORS = ["bg-[var(--text-primary)]", "bg-cyan-500", "bg-[var(--accent-soft)]", "bg-[var(--data-warning-500)]", "bg-[var(--text-primary)]", "bg-[var(--text-primary)]", "bg-sky-500", "bg-[var(--accent)]", "bg-orange-500", "bg-[var(--text-primary)]"];

// ── Component ─────────────────────────────────────────────────────────────────

export default function HRTab() {
  const [employees, setEmployees] = useState<Employee[]>(SEED_EMPLOYEES);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(SEED_ATTENDANCE);
  const [view, setView] = useState<"empleados" | "asistencia">("empleados");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<EmployeeStatus | "todos">("todos");
  const [filterDept, setFilterDept] = useState("todos");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_EMP });
  const [attDate, setAttDate] = useState(D);
  const [verifyingDni, setVerifyingDni] = useState(false);
  const [dniMsg, setDniMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const departments = useMemo(() => [...new Set(employees.map(e => e.department))], [employees]);

  const filteredEmployees = useMemo(() => {
    let list = [...employees];
    if (filterStatus !== "todos") list = list.filter(e => e.status === filterStatus);
    if (filterDept !== "todos") list = list.filter(e => e.department === filterDept);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e => e.name.toLowerCase().includes(q) || e.dni.includes(q) || e.role.toLowerCase().includes(q));
    }
    return list;
  }, [employees, filterStatus, filterDept, search]);

  const attForDate = useMemo(() => attendance.filter(a => a.date === attDate), [attendance, attDate]);

  const stats = useMemo(() => ({
    total: employees.length,
    activo: employees.filter(e => e.status === "activo").length,
    vacaciones: employees.filter(e => e.status === "vacaciones").length,
    presente: attForDate.filter(a => a.status === "presente").length,
    tarde: attForDate.filter(a => a.status === "tarde").length,
    ausente: attForDate.filter(a => a.status === "ausente").length,
  }), [employees, attForDate]);

  function handleAddEmployee() {
    if (!form.name.trim() || !form.dni.trim() || !form.role.trim()) return;
    const initials = form.name.trim().split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
    const color = COLORS[employees.length % COLORS.length];
    const emp: Employee = { id: `e-${Date.now()}`, ...form, photoInitials: initials, color };
    setEmployees(prev => [...prev, emp]);
    setShowForm(false);
    setForm({ ...EMPTY_EMP });
    setDniMsg(null);
  }

  async function handleVerifyDni(dni: string) {
    if (!/^\d{8}$/.test(dni)) return;
    setVerifyingDni(true);
    setDniMsg(null);
    try {
      const res = await fetch(`/api/reniec/dni/${encodeURIComponent(dni)}`);
      const data = await res.json() as Record<string, string>;
      if (!res.ok) {
        setDniMsg({ ok: false, text: (data.error as string) ?? "No se pudo consultar RENIEC." });
        return;
      }
      const nombreCompleto: string = data.nombreCompleto ?? "";
      if (!form.name.trim() && nombreCompleto) {
        setForm(p => ({ ...p, name: nombreCompleto }));
      }
      setDniMsg({ ok: true, text: nombreCompleto ? nombreCompleto : "DNI válido." });
    } catch {
      setDniMsg({ ok: false, text: "Error de conexión con RENIEC." });
    } finally {
      setVerifyingDni(false);
    }
  }

  function updateAttendance(empId: string, status: AttendanceStatus) {
    setAttendance(prev => {
      const exists = prev.find(a => a.date === attDate && a.employeeId === empId);
      if (exists) return prev.map(a => a.date === attDate && a.employeeId === empId ? { ...a, status } : a);
      return [...prev, { id: `att-${empId}-${Date.now()}`, employeeId: empId, date: attDate, status, checkIn: "", checkOut: "", notes: "" }];
    });
  }

  function getAttStatus(empId: string): AttendanceStatus | undefined {
    return attForDate.find(a => a.employeeId === empId)?.status;
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <PageTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> Recursos Humanos
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Gestión de empleados, asistencia y recursos del personal</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => exportToCSV(employees.map(e => ({ nombre: e.name, dni: e.dni, cargo: e.role, departamento: e.department, teléfono: e.phone, email: e.email, ingreso: e.startDate, antiguedad: yearsOf(e.startDate), salario: e.baseSalary, estado: e.status })), "empleados")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:bg-[var(--surface-alt)] dark:hover:bg-accent transition-colors">
            <Download className="h-4 w-4" /> Exportar
          </button>
          <button onClick={() => setShowForm(v => !v)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Nuevo empleado
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {[
          { label: "Total", value: stats.total, color: "text-[var(--text-primary)] dark:text-[var(--text-primary)]", bg: "bg-[var(--surface-alt)] dark:bg-surface/50" },
          { label: "Activos", value: stats.activo, color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
          { label: "Vacaciones", value: stats.vacaciones, color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
          { label: "Presentes hoy", value: stats.presente, color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
          { label: "Con retraso", value: stats.tarde, color: "text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30" },
          { label: "Ausentes hoy", value: stats.ausente, color: "text-[var(--data-error-500)]", bg: "bg-[var(--data-error-50)] dark:bg-red-950/30" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("rounded-xl p-3 text-center", bg)}>
            <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* New employee form */}
      {showForm && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <CardTitle className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm flex flex-wrap items-center gap-2"><Plus className="h-4 w-4 text-primary" /> Registrar empleado</CardTitle>
            <button onClick={() => { setShowForm(false); setDniMsg(null); }}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <EField label="Nombre completo *" value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="Apellidos Nombres" span={2} />
            <Field label="DNI *" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">
              {(id) => (
                <>
                  <div className="flex gap-1.5">
                    <input
                      id={id}
                      type="text"
                      value={form.dni}
                      onChange={e => { setForm(p => ({ ...p, dni: e.target.value.replace(/\D/g, "").slice(0, 8) })); setDniMsg(null); }}
                      placeholder="00000000"
                      maxLength={8}
                      className="flex-1 min-w-0 text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    {form.dni.length === 8 && (
                      <button
                        type="button"
                        onClick={() => handleVerifyDni(form.dni)}
                        disabled={verifyingDni}
                        className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-40 flex items-center gap-1.5 shrink-0 hover:bg-primary/90 transition-colors"
                      >
                        {verifyingDni ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                        Verificar
                      </button>
                    )}
                  </div>
                  {dniMsg && (
                    <p className={`mt-1 text-xs font-medium ${dniMsg.ok ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]"}`}>
                      {dniMsg.text}
                    </p>
                  )}
                </>
              )}
            </Field>
            <Field label="Estado" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as EmployeeStatus }))} className="w-full text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                {(Object.keys(STATUS_EMP) as EmployeeStatus[]).map(s => <option key={s} value={s}>{STATUS_EMP[s].label}</option>)}
              </select>
            </Field>
            <EField label="Cargo *" value={form.role} onChange={v => setForm(p => ({ ...p, role: v }))} placeholder="Ej: Cajero, Almacenero..." />
            <Field label="Departamento" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">
              <select value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))} className="w-full text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                {["Ventas", "Logística", "Operaciones", "Administración", "TI"].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
            <EField label="Teléfono" value={form.phone} onChange={v => setForm(p => ({ ...p, phone: v }))} placeholder="9XXXXXXXX" />
            <EField label="Email" value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} placeholder="email@bodega.com" />
            <EField label="Fecha ingreso" value={form.startDate} onChange={v => setForm(p => ({ ...p, startDate: v }))} type="date" />
            <Field label="Salario base (S/)" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">
              <input type="number" value={form.baseSalary} onChange={e => setForm(p => ({ ...p, baseSalary: parseFloat(e.target.value) || 0 }))} min="1025" step="25" className="w-full text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button onClick={() => { setShowForm(false); setDniMsg(null); }} className="px-2 sm:px-4 py-1.5 sm:py-2 text-sm rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted">Cancelar</button>
            <button onClick={handleAddEmployee} className="px-2 sm:px-4 py-1.5 sm:py-2 text-sm rounded-lg bg-primary text-white font-semibold hover:bg-primary/90">Registrar</button>
          </div>
        </div>
      )}

      {/* View tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {(["empleados", "asistencia"] as const).map(v => (
          <button key={v} onClick={() => setView(v)} className={cn("px-2 sm:px-4 py-1.5 sm:py-2 text-sm font-semibold rounded-lg capitalize transition-colors", view === v ? "bg-primary text-white" : "bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-alt)] dark:hover:bg-accent")}>
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {/* Employees list */}
      {view === "empleados" && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre, DNI o cargo..." className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]" />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as EmployeeStatus | "todos")} className="text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]">
              <option value="todos">Todos los estados</option>
              {(Object.keys(STATUS_EMP) as EmployeeStatus[]).map(s => <option key={s} value={s}>{STATUS_EMP[s].label}</option>)}
            </select>
            <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]">
              <option value="todos">Todos los depto.</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
            {filteredEmployees.map(e => {
              const sm = STATUS_EMP[e.status];
              return (
                <div key={e.id} className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 flex flex-wrap items-start gap-2 sm:gap-4">
                  <div className={cn("w-11 h-11 rounded-lg flex items-center justify-center text-white font-extrabold text-sm shrink-0", e.color)}>{e.photoInitials}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                      <div>
                        <p className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm">{e.name}</p>
                        <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{e.role} · {e.department}</p>
                      </div>
                      <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full shrink-0", sm.bg, sm.color)}>{sm.label}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)] dark:text-muted mt-2">
                      <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" /> DNI {e.dni}</span>
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {yearsOf(e.startDate)}</span>
                      {e.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {e.phone}</span>}
                      <span className="flex items-center gap-1 font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(e.baseSalary)}/mes</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredEmployees.length === 0 && <p className="col-span-2 text-sm text-[var(--text-tertiary)] dark:text-muted text-center py-8">Sin empleados con los filtros seleccionados.</p>}
          </div>
        </div>
      )}

      {/* Attendance view */}
      {view === "asistencia" && (
        <div className="space-y-6">
          <Field label="Fecha:" labelClassName="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]" className="flex items-center gap-3">
            <input type="date" value={attDate} onChange={e => setAttDate(e.target.value)} className="text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]" />
          </Field>
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl overflow-y-hidden overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="bg-[var(--surface-alt)] dark:bg-surface/50 border-b border-[var(--rule-base)] dark:border-[var(--rule-base)]">
                <tr>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Empleado</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Cargo</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Estado de hoy</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Cambiar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                {employees.map(emp => {
                  const attStatus = getAttStatus(emp.id);
                  const meta = attStatus ? STATUS_ATT[attStatus] : null;
                  const Icon = meta?.icon ?? Clock;
                  return (
                    <tr key={emp.id} className="hover:bg-[var(--surface-alt)]/50 dark:hover:bg-surface/30">
                      <td className="px-2 sm:px-4 py-2 sm:py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0", emp.color)}>{emp.photoInitials}</div>
                          <span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{emp.name}</span>
                        </div>
                      </td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-secondary)] dark:text-muted">{emp.role}</td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                        {meta
                          ? <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold", meta.bg, meta.color)}><Icon className="h-3 w-3" />{meta.label}</span>
                          : <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">Sin registrar</span>
                        }
                      </td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3">
                        <div className="flex gap-1 flex-wrap">
                          {(Object.keys(STATUS_ATT) as AttendanceStatus[]).map(s => {
                            const m = STATUS_ATT[s];
                            const isActive = attStatus === s;
                            return (
                              <button key={s} onClick={() => updateAttendance(emp.id, s)} className={cn("px-2 py-1 rounded-lg text-xs font-semibold transition-colors", isActive ? `${m.bg} ${m.color} ring-2 ring-inset ring-current` : "bg-[var(--surface-alt)] dark:bg-surface/50 text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-sunken)] dark:hover:bg-accent")}>
                                {m.label}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function EField({ label, value, onChange, type = "text", placeholder, span }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; span?: number }) {
  return (
    <Field
      label={label}
      labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1"
      className={span ? `col-span-${span}` : undefined}
    >
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30" />
    </Field>
  );
}

"use client";

/**
 * VinculoContraparte — atar el contrato al cliente o proveedor de verdad.
 *
 * Hasta ahora la contraparte era texto libre: "Ferretería El Clavo" escrito a
 * mano en el contrato no era la MISMA Ferretería El Clavo que le comprás todas
 * las semanas. Con el vínculo puesto, desde la ficha del proveedor se pueden
 * ver sus contratos y lo que hay comprometido con él, que es la pregunta que
 * uno se hace antes de pedirle un descuento.
 *
 * Los campos ya existían en el modelo sin usarse; esto es lo que faltaba para
 * que sirvan.
 */

import { useEffect, useState } from "react";
import { BlockTitle } from "@buleje/design-system";
import { Loader2, Link2, Check, X, User, Truck, Users } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";

interface Persona {
  id: string;
  nombre: string;
  detalle: string;
}

interface Props {
  contratoId: string;
  clienteNombre: string;
  customerId: string | null;
  supplierId: string | null;
  /** ADR-414 §6: el tercer lado, «Trabajador» (un `Colaborador` de RRHH). */
  colaboradorId?: string | null;
  onVinculado?: (patch: { customerId: string | null; supplierId: string | null; colaboradorId: string | null }) => void;
}

/** Los tres lados posibles: a quién le vendés, a quién le comprás, o quién trabaja para vos. */
type Lado = "cliente" | "proveedor" | "trabajador";

/** Constante de módulo (no del componente): así el `useEffect` de abajo no la
 *  necesita en sus dependencias — un objeto literal en el cuerpo del
 *  componente es una identidad nueva en cada render. */
const ENDPOINT_POR_LADO: Record<Lado, string> = {
  cliente: "/api/customers",
  proveedor: "/api/suppliers",
  trabajador: "/api/rrhh/colaboradores?campos=min",
};

export default function VinculoContraparte({
  contratoId, clienteNombre, customerId, supplierId, colaboradorId = null, onVinculado,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const [lado, setLado] = useState<Lado>("proveedor");
  const [gente, setGente] = useState<Persona[]>([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const vinculado = Boolean(customerId || supplierId || colaboradorId);

  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    setCargando(true);
    setError(null);
    fetch(ENDPOINT_POR_LADO[lado], { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!vigente) return;
        const crudo: unknown = Array.isArray(j)
          ? j
          : (j && typeof j === "object"
              ? Object.values(j).find((v) => Array.isArray(v)) ?? []
              : []);
        const lista = (crudo as Record<string, unknown>[]).map((x) => ({
          // Clientes por teléfono, proveedores por id, colaboradores por id:
          // se toma lo primero que exista en vez de asumir una sola forma.
          id: String(x.id ?? x.phone ?? ""),
          nombre: String(x.name ?? x.razonSocial ?? x.nombre ?? "Sin nombre"),
          detalle: String(x.ruc ?? x.phone ?? x.location ?? (x.puesto as { nombre?: string } | undefined)?.nombre ?? ""),
        })).filter((p) => p.id);
        setGente(lista);
      })
      .catch((err) => {
        console.warn("[contratos] no se pudo cargar la lista", err);
        if (vigente) setError("No se pudo cargar la lista");
      })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [abierto, lado]);

  const guardar = async (id: string | null) => {
    setGuardando(true);
    setError(null);
    // Un contrato es con UNO: atarlo a un lado desata a los otros dos.
    const patch = lado === "cliente"
      ? { customerId: id, supplierId: null, colaboradorId: null }
      : lado === "proveedor"
        ? { supplierId: id, customerId: null, colaboradorId: null }
        : { colaboradorId: id, customerId: null, supplierId: null };
    try {
      const res = await fetch(`/api/contratos/${contratoId}`, {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("No se pudo vincular");
      onVinculado?.(patch);
      setAbierto(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo vincular");
    } finally {
      setGuardando(false);
    }
  };

  const filtrada = busqueda.trim()
    ? gente.filter((p) => `${p.nombre} ${p.detalle}`.toLowerCase().includes(busqueda.trim().toLowerCase()))
    : gente;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <BlockTitle className="flex items-center gap-2">
          <Link2 className="h-4 w-4" /> Con quién es
        </BlockTitle>
        <button
          onClick={() => setAbierto((v) => !v)}
          className="text-xs font-bold text-primary hover:underline"
        >
          {vinculado ? "Cambiar" : "Vincular a la ficha"}
        </button>
      </div>

      {!abierto && (
        <p className="text-xs text-[var(--text-secondary)]">
          {vinculado
            ? `Atado a la ficha de ${customerId ? "un cliente" : supplierId ? "un proveedor" : "un trabajador"}: desde ahí se ven sus contratos y lo comprometido.`
            : `Hoy dice "${clienteNombre}" como texto suelto. Vinculándolo a su ficha, sus contratos aparecen ahí.`}
        </p>
      )}

      {abierto && (
        <div className="space-y-2 rounded-xl border border-[var(--rule-base)] p-2.5">
          <div className="flex gap-1.5">
            {([["proveedor", "Proveedor", Truck], ["cliente", "Cliente", User], ["trabajador", "Trabajador", Users]] as const).map(([v, texto, Icono]) => (
              <button
                key={v}
                onClick={() => setLado(v)}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 px-2 py-1.5 text-xs font-bold transition-colors",
                  lado === v
                    ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                    : "border-[var(--rule-base)] text-[var(--text-secondary)]",
                )}
              >
                <Icono className="h-3.5 w-3.5" /> {texto}
              </button>
            ))}
          </div>

          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={lado === "trabajador" ? "Buscar por nombre…" : "Buscar por nombre o RUC…"}
            className="w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 h-10 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
          />

          {cargando && <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />}

          {!cargando && filtrada.length === 0 && (
            <p className="py-3 text-center text-xs text-[var(--text-tertiary)]">
              {gente.length === 0
                ? `Todavía no hay ${lado === "cliente" ? "clientes" : lado === "proveedor" ? "proveedores" : "personas"} cargados.`
                : "Ninguno coincide con lo que buscas."}
            </p>
          )}

          <ul className="max-h-52 space-y-1 overflow-y-auto">
            {filtrada.slice(0, 40).map((p) => {
              const esteEsta = lado === "cliente" ? customerId === p.id : lado === "proveedor" ? supplierId === p.id : colaboradorId === p.id;
              return (
                <li key={p.id}>
                  <button
                    onClick={() => guardar(esteEsta ? null : p.id)}
                    disabled={guardando}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors disabled:opacity-60",
                      esteEsta ? "bg-primary/10" : "hover:bg-[var(--surface-sunken)]",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{p.nombre}</span>
                      {p.detalle && (
                        <span className="block truncate text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{p.detalle}</span>
                      )}
                    </span>
                    {esteEsta && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                </li>
              );
            })}
          </ul>

          {error && <p className="text-xs text-[var(--data-error-500)]">{error}</p>}

          <button
            onClick={() => setAbierto(false)}
            className="inline-flex items-center gap-1 text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            <X className="h-3.5 w-3.5" /> Cerrar
          </button>
        </div>
      )}
    </div>
  );
}

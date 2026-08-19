"use client";

/**
 * CtpDirectorioView — la libreta del aserradero (ADR-317).
 *
 * Quién le vende, a quién le vende, quién transporta y con qué camión. Antes eso
 * vivía disperso: el proveedor como texto libre en cada ingreso, el resto tipeado
 * de nuevo en cada guía. Acá es UNA fila por actor, con su documento, y desde acá
 * se ve cuánto se usó cada uno.
 *
 * Los faltantes se muestran por rol y no bloquean: una libreta a medio llenar
 * sigue sirviendo, pero el operador tiene que ver antes de imprimir que a ese
 * destinatario le falta la dirección.
 */

import { useMemo, useState } from "react";
import { Share2, Loader2, Pencil, Plus, Search, Trash2, Truck, Users } from "@buleje/design-system/icons";
import {
  ROLES_PARTE,
  ROL_DESCRIPCION,
  ROL_LABEL,
  ROL_PLURAL,
  direccionCompleta,
  faltantesParaGuia,
  filtrarPartes,
  filtrarVehiculos,
  formatearPlaca,
  type Parte,
  type RolParte,
  type Vehiculo,
} from "@/lib/forestal/directorio";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import CtpDirectorioDesdeGuias from "./CtpDirectorioDesdeGuias";
import CtpParteModal from "./CtpParteModal";
import CtpVehiculoModal from "./CtpVehiculoModal";
import CtpProveedorTrazaModal from "./CtpProveedorTrazaModal";
import { Btn, I, TablaSkeleton, VistaHeader, IconAction } from "./ctp-shared";

type Pestaña = RolParte | "vehiculos";

const PESTAÑAS: { id: Pestaña; label: string }[] = [
  ...ROLES_PARTE.map((r) => ({ id: r as Pestaña, label: ROL_PLURAL[r] })),
  { id: "vehiculos", label: "Vehículos" },
];

/** "1 parte" y no "1 partes": el conteo del encabezado se lee todo el tiempo. */
const plural = (n: number, sing: string, plur: string) => `${n} ${n === 1 ? sing : plur}`;

export default function CtpDirectorioView() {
  const dir = useDirectorioForestal();
  const [pestaña, setPestaña] = useState<Pestaña>("destinatario");
  const [q, setQ] = useState("");
  const [editando, setEditando] = useState<{ tipo: "parte"; valor: Parte | null } | { tipo: "vehiculo"; valor: Vehiculo | null } | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  /** Titular cuya cadena se está mirando (ADR-319). */
  const [trazando, setTrazando] = useState<string | null>(null);

  const esVehiculos = pestaña === "vehiculos";
  const transportistas = useMemo(() => dir.porRol("transportista"), [dir]);

  const partesVisibles = useMemo(() => {
    if (esVehiculos) return [];
    // Incluye las inactivas: esta vista ES la administración, y una parte dada de
    // baja tiene que poder verse para reactivarla.
    const delRol = dir.partes.filter((p) => p.roles.includes(pestaña as RolParte));
    return filtrarPartes(delRol, q);
  }, [dir.partes, pestaña, q, esVehiculos]);

  const vehiculosVisibles = useMemo(
    () => (esVehiculos ? filtrarVehiculos(dir.vehiculos, q) : []),
    [dir.vehiculos, q, esVehiculos],
  );

  const conteo = (p: Pestaña) =>
    p === "vehiculos" ? dir.vehiculos.length : dir.partes.filter((x) => x.roles.includes(p as RolParte)).length;

  async function borrar(id: string, nombre: string, tipo: "parte" | "vehiculo") {
    if (!window.confirm(`¿Dar de baja a ${nombre}? Deja de ofrecerse en las guías; lo ya emitido no cambia.`)) return;
    setBorrando(id);
    try {
      if (tipo === "parte") await dir.eliminarParte(id);
      else await dir.eliminarVehiculo(id);
    } finally {
      setBorrando(null);
    }
  }

  return (
    <div className="space-y-3">
      <VistaHeader
        titulo="Directorio"
        meta={`${plural(dir.partes.length, "parte", "partes")} · ${plural(dir.vehiculos.length, "vehículo", "vehículos")}`}
        hint="Proveedores, destinatarios, transportistas, conductores y placas. Se completan solos en la guía."
      >
        <Btn
          size="sm"
          variant="primary"
          onClick={() =>
            setEditando(esVehiculos ? { tipo: "vehiculo", valor: null } : { tipo: "parte", valor: null })
          }
        >
          <Plus className="h-4 w-4" />
          {esVehiculos ? "Agregar vehículo" : `Agregar ${ROL_LABEL[pestaña as RolParte].toLowerCase()}`}
        </Btn>
      </VistaHeader>

      {/* La libreta que ya está escrita en las guías (ADR-357). Va ARRIBA de las
          pestañas: con el directorio en cero, lo primero que hay que ver es que
          los contactos ya existen y de dónde sacarlos. */}
      <CtpDirectorioDesdeGuias
        partes={dir.partes}
        vehiculos={dir.vehiculos}
        onGuardarParte={dir.guardarParte}
        onGuardarVehiculo={dir.guardarVehiculo}
      />

      <div className="flex flex-wrap gap-1.5">
        {PESTAÑAS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={pestaña === p.id}
            title={p.id === "vehiculos" ? "Las placas que ya viajaron" : ROL_DESCRIPCION[p.id as RolParte]}
            onClick={() => setPestaña(p.id)}
            className={`inline-flex h-10 items-center gap-1.5 rounded-lg border-2 px-3 text-sm font-bold transition-colors ${
              pestaña === p.id
                ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
            }`}
          >
            {p.id === "vehiculos" ? <Truck className="h-4 w-4" /> : <Users className="h-4 w-4" />}
            {p.label}
            <span className="rounded bg-[var(--surface-sunken)] px-1.5 font-mono text-xs tabular-nums">{conteo(p.id)}</span>
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
        <input
          type="search"
          className={`${I} pl-9`}
          placeholder={esVehiculos ? "Buscar por placa, marca o dueño…" : "Buscar por nombre o documento…"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {dir.error && (
        <p role="alert" className="rounded-xl border-2 border-[var(--data-error-500)]/40 bg-[var(--surface-sunken)] p-3 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {dir.error}
        </p>
      )}

      {dir.cargando ? (
        <TablaSkeleton />
      ) : esVehiculos ? (
        <ListaVehiculos
          vehiculos={vehiculosVisibles}
          borrando={borrando}
          onEditar={(v) => setEditando({ tipo: "vehiculo", valor: v })}
          onBorrar={(v) => void borrar(v.id, formatearPlaca(v.placa), "vehiculo")}
        />
      ) : (
        <ListaPartes
          partes={partesVisibles}
          rol={pestaña as RolParte}
          borrando={borrando}
          onTrazar={(p) => setTrazando(p.nombre)}
          onEditar={(p) => setEditando({ tipo: "parte", valor: p })}
          onBorrar={(p) => void borrar(p.id, p.nombre, "parte")}
        />
      )}

      {editando?.tipo === "parte" && (
        <CtpParteModal
          parte={editando.valor}
          rolInicial={esVehiculos ? "destinatario" : (pestaña as RolParte)}
          onGuardar={async (input) => {
            await dir.guardarParte(input);
          }}
          onClose={() => setEditando(null)}
        />
      )}
      {trazando && <CtpProveedorTrazaModal proveedor={trazando} onClose={() => setTrazando(null)} />}
      {editando?.tipo === "vehiculo" && (
        <CtpVehiculoModal
          vehiculo={editando.valor}
          transportistas={transportistas}
          existentes={dir.vehiculos}
          onGuardar={async (input) => {
            await dir.guardarVehiculo(input);
          }}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}

function Vacio({ texto }: { texto: string }) {
  return (
    <p className="rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
      {texto}
    </p>
  );
}

function ListaPartes({
  partes,
  rol,
  borrando,
  onEditar,
  onBorrar,
  onTrazar,
}: {
  partes: Parte[];
  rol: RolParte;
  borrando: string | null;
  onEditar: (p: Parte) => void;
  onBorrar: (p: Parte) => void;
  /** Sólo para proveedores: abre su cadena completa. */
  onTrazar: (p: Parte) => void;
}) {
  if (partes.length === 0) {
    return <Vacio texto={`Todavía no hay ${ROL_PLURAL[rol].toLowerCase()} cargados. El primero se agrega acá o desde una guía.`} />;
  }
  return (
    <ul className="space-y-1.5">
      {partes.map((p) => {
        const faltan = faltantesParaGuia(p, rol);
        return (
          <li
            key={p.id}
            className={`flex items-center gap-3 rounded-xl border-2 bg-[var(--surface-raised)] px-3 py-2.5 ${
              p.activo ? "border-[var(--rule-base)]" : "border-dashed border-[var(--rule-soft)] opacity-70"
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="truncate text-sm font-bold text-[var(--text-primary)]">{p.nombre}</span>
                {p.docNumero && (
                  <span className="font-mono text-xs text-[var(--text-tertiary)]">{p.docTipo} {p.docNumero}</span>
                )}
                {!p.activo && <span className="text-xs font-bold text-[var(--text-tertiary)]">dado de baja</span>}
              </div>
              <span className="block truncate text-xs text-[var(--text-tertiary)]">
                {[direccionCompleta(p) || null, p.tituloHabilitante, p.licencia ? `Lic. ${p.licencia}` : null]
                  .filter(Boolean)
                  .join(" · ") || "Sin dirección cargada"}
              </span>
              {faltan.length > 0 && (
                <span className="mt-0.5 block text-xs font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                  Para una guía le falta: {faltan.join(", ")}
                </span>
              )}
            </div>
            {p.usos > 0 && (
              <span className="shrink-0 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-bold tabular-nums text-[var(--text-secondary)]" title="Veces usado en un documento">
                {p.usos}×
              </span>
            )}
            <div className="flex shrink-0 items-center gap-1">
              {/* Sólo el proveedor tiene cadena hacia adelante: es de quien
                  entró la madera. Un destinatario no "rinde". */}
              {rol === "proveedor" && (
                <IconAction
                  icon={Share2}
                  label="Ver todo lo que trajo y en qué terminó"
                  onClick={() => onTrazar(p)}
                  tone="accent"
                />
              )}
              <IconAction icon={Pencil} label="Editar" onClick={() => onEditar(p)} tone="info" />
              {borrando === p.id ? (
                <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />
              ) : (
                <IconAction icon={Trash2} label="Dar de baja" onClick={() => onBorrar(p)} tone="danger" />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ListaVehiculos({
  vehiculos,
  borrando,
  onEditar,
  onBorrar,
}: {
  vehiculos: Vehiculo[];
  borrando: string | null;
  onEditar: (v: Vehiculo) => void;
  onBorrar: (v: Vehiculo) => void;
}) {
  if (vehiculos.length === 0) {
    return <Vacio texto="Todavía no hay vehículos cargados. Agregá el primero para elegirlo por placa en la guía." />;
  }
  return (
    <ul className="space-y-1.5">
      {vehiculos.map((v) => (
        <li
          key={v.id}
          className={`flex items-center gap-3 rounded-xl border-2 bg-[var(--surface-raised)] px-3 py-2.5 ${
            v.activo ? "border-[var(--rule-base)]" : "border-dashed border-[var(--rule-soft)] opacity-70"
          }`}
        >
          <span className="shrink-0 font-mono text-sm font-bold text-[var(--text-primary)]">{formatearPlaca(v.placa)}</span>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm text-[var(--text-secondary)]">
              {[v.marca, v.tipo, v.configuracion].filter(Boolean).join(" · ") || "Sin datos del vehículo"}
            </span>
            <span className="block truncate text-xs text-[var(--text-tertiary)]">
              {[v.transportistaNombre, v.capacidadM3 != null ? `${v.capacidadM3} m³` : null].filter(Boolean).join(" · ") ||
                "Sin dueño asignado"}
            </span>
          </div>
          {v.usos > 0 && (
            <span className="shrink-0 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-bold tabular-nums text-[var(--text-secondary)]">
              {v.usos}×
            </span>
          )}
          <div className="flex shrink-0 items-center gap-1">
            <IconAction icon={Pencil} label="Editar" onClick={() => onEditar(v)} tone="info" />
            {borrando === v.id ? (
              <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />
            ) : (
              <IconAction icon={Trash2} label="Dar de baja" onClick={() => onBorrar(v)} tone="danger" />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

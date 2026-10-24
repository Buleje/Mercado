"use client";

/**
 * Las listas del Directorio (ADR-317): las partes de un rol y los vehículos.
 * Salieron de `CtpDirectorioView` (compactación del libro, 17-10) cuando la
 * vista sumó la pestaña «Tu CTP» y el archivo pasaba de 480 líneas.
 */

import { Loader2, MessageCircle, Pencil, Share2, Trash2 } from "@buleje/design-system/icons";
import {
  CATEGORIA_LABEL,
  ROL_PLURAL,
  categoriaEfectiva,
  direccionCompleta,
  faltantesParaGuia,
  formatearPlaca,
  type Parte,
  type RolParte,
  type Vehiculo,
} from "@/lib/forestal/directorio";
import { enlaceWhatsAppConTexto } from "@/lib/adelantos/contacto";
import { IconAction } from "./ctp-shared";

function Vacio({ texto }: { texto: string }) {
  return (
    <p className="rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
      {texto}
    </p>
  );
}

export function ListaPartes({
  partes,
  rol,
  borrando,
  vacioTexto,
  onEditar,
  onBorrar,
  onTrazar,
}: {
  partes: Parte[];
  rol: RolParte;
  borrando: string | null;
  /** Override del mensaje vacío — el filtro "Sólo incompletos" no es "no hay nada". */
  vacioTexto?: string;
  onEditar: (p: Parte) => void;
  onBorrar: (p: Parte) => void;
  /** Sólo para proveedores: abre su cadena completa. */
  onTrazar: (p: Parte) => void;
}) {
  if (partes.length === 0) {
    return <Vacio texto={vacioTexto ?? `Todavía no hay ${ROL_PLURAL[rol].toLowerCase()} cargados. El primero se agrega acá o desde una guía.`} />;
  }
  return (
    <ul className="space-y-1.5">
      {partes.map((p) => {
        const faltan = faltantesParaGuia(p, rol);
        return (
          <li
            key={p.id}
            className={`flex items-center gap-3 rounded-xl border bg-[var(--surface-raised)] px-3 py-2.5 ${
              p.activo ? "border-[var(--rule-base)]" : "border-dashed border-[var(--rule-soft)] opacity-70"
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="truncate text-sm font-bold text-[var(--text-primary)]">{p.nombre}</span>
                {p.docNumero && (
                  <span className="font-mono text-xs text-[var(--text-tertiary)]">{p.docTipo} {p.docNumero}</span>
                )}
                {rol === "proveedor" && (
                  <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">
                    {CATEGORIA_LABEL[categoriaEfectiva(p.categoria)]}
                  </span>
                )}
                {!p.activo && <span className="text-xs font-bold text-[var(--text-tertiary)]">dado de baja</span>}
              </div>
              <span className="block truncate text-xs text-[var(--text-tertiary)]">
                {[direccionCompleta(p) || null, p.codigoCtp ? `CTP ${p.codigoCtp}` : null, p.tipoEstablecimiento, p.tituloHabilitante, p.licencia ? `Lic. ${p.licencia}` : null]
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
              {p.telefono && (
                <IconAction
                  icon={MessageCircle}
                  label={`Escribirle a ${p.nombre} por WhatsApp`}
                  onClick={() => {
                    const link = enlaceWhatsAppConTexto(p.telefono, `Hola ${p.nombre}, te escribo desde el aserradero.`);
                    if (link) window.open(link, "_blank", "noopener,noreferrer");
                  }}
                  tone="success"
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

export function ListaVehiculos({
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
    return <Vacio texto="Todavía no hay vehículos cargados. Agrega el primero para elegirlo por placa en la guía." />;
  }
  return (
    <ul className="space-y-1.5">
      {vehiculos.map((v) => (
        <li
          key={v.id}
          className={`flex items-center gap-3 rounded-xl border bg-[var(--surface-raised)] px-3 py-2.5 ${
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

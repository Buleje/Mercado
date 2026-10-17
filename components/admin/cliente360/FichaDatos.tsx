"use client";

import { CardTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { cumpleDe } from "@/lib/clientes/cumpleanos";
import { formatDateNumeric } from "@/lib/format";
import type { CustomerData } from "@/components/admin/cliente360/cliente360-compartido";

/** Datos de la ficha (documento, contacto, ubigeo, cumpleaños…). Bloque de la ficha 360 (Customer360Tab). */
export default function FichaDatos({ customer }: { customer: CustomerData }) {
  return (
    <>
      {/* Ficha completa del cliente */}
      {(customer.documento || customer.categoria || customer.departamento || customer.email || customer.observaciones || cumpleDe(customer)) && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
          <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3">Datos de la ficha</CardTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm">
            {customer.tipoPersona && (
              <div className="flex gap-2"><span className="text-[var(--text-tertiary)] dark:text-muted shrink-0">Tipo:</span><span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] capitalize">{customer.tipoPersona}</span></div>
            )}
            {customer.documento && (
              <div className="flex gap-2"><span className="text-[var(--text-tertiary)] dark:text-muted shrink-0">{customer.tipoDocumento ?? 'Doc'}:</span><span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] font-mono">{customer.documento}</span></div>
            )}
            {customer.razonSocial && (
              <div className="flex gap-2"><span className="text-[var(--text-tertiary)] dark:text-muted shrink-0">Razon Social:</span><span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{customer.razonSocial}</span></div>
            )}
            {customer.email && (
              <div className="flex gap-2"><span className="text-[var(--text-tertiary)] dark:text-muted shrink-0">Email:</span><span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{customer.email}</span></div>
            )}
            {customer.whatsappSecundario && (
              <div className="flex gap-2"><span className="text-[var(--text-tertiary)] dark:text-muted shrink-0">WA 2:</span><span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{customer.whatsappSecundario}</span></div>
            )}
            {customer.departamento && (
              <div className="flex gap-2"><span className="text-[var(--text-tertiary)] dark:text-muted shrink-0">Ubigeo:</span><span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{[customer.departamento, customer.provincia, customer.distrito].filter(Boolean).join(', ')}</span></div>
            )}
            {customer.direccion && (
              <div className="flex gap-2"><span className="text-[var(--text-tertiary)] dark:text-muted shrink-0">Direccion:</span><span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{customer.direccion}</span></div>
            )}
            {customer.vendedorAsignado && (
              <div className="flex gap-2"><span className="text-[var(--text-tertiary)] dark:text-muted shrink-0">Vendedor:</span><span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{customer.vendedorAsignado}</span></div>
            )}
            {customer.genero && (
              <div className="flex gap-2"><span className="text-[var(--text-tertiary)] dark:text-muted shrink-0">Genero:</span><span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{customer.genero === 'M' ? 'Masculino' : customer.genero === 'F' ? 'Femenino' : 'Otro'}</span></div>
            )}
            {cumpleDe(customer) && (
              <div className="flex gap-2"><span className="text-[var(--text-tertiary)] dark:text-muted shrink-0">Nacimiento:</span><span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{formatDateNumeric(cumpleDe(customer) ?? "", { soloFecha: true })}</span></div>
            )}
            {customer.comoLlego && (
              <div className="flex gap-2"><span className="text-[var(--text-tertiary)] dark:text-muted shrink-0">Llego por:</span><span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] capitalize">{customer.comoLlego}</span></div>
            )}
          </div>
          {/* Badges */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {customer.categoria && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 dark:bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:text-[var(--data-success-500)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 capitalize">{customer.categoria}</span>
            )}
            {customer.canal && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] capitalize">{customer.canal}</span>
            )}
            {customer.listaPrecio && customer.listaPrecio !== 'general' && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--data-warning-50)] dark:bg-amber-950/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] capitalize">Lista: {customer.listaPrecio}</span>
            )}
            {customer.estado && customer.estado !== 'activo' && (
              <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full border",
                customer.estado === 'bloqueado' ? "bg-[var(--data-error-50)] dark:bg-red-950/30 text-[var(--data-error-500)] dark:text-[var(--data-error-500)] border-[var(--data-error-500)] dark:border-[var(--data-error-500)]" : "bg-[var(--surface-sunken)]/30 text-[var(--text-secondary)] border-[var(--rule-base)] "
              )}>
                {customer.estado === 'bloqueado' ? 'BLOQUEADO' : 'INACTIVO'}
              </span>
            )}
          </div>
          {customer.observaciones && (
            <p className="mt-3 text-xs text-[var(--text-secondary)] dark:text-muted italic border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] pt-2">{customer.observaciones}</p>
          )}
        </div>
      )}
    </>
  );
}

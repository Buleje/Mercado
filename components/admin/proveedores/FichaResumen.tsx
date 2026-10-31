"use client";

import type { ReactNode } from "react";
import { BlockTitle, StatCard } from "@buleje/design-system";
import { AlertTriangle, MessageCircle } from "@buleje/design-system/icons";
import type { DbSupplier } from "@/lib/jsondb";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { diaCorto } from "@/lib/compras/ciclo-oc";
import { avisoDeDocumento, tipoDeDocumento } from "@/lib/compras/proveedor-identidad";
import { formatCurrency } from "@/lib/format";
import { urlWhatsApp } from "./datos-proveedores";
import type { FichaConPermiso } from "./use-ficha-de-proveedor";

const PAGO: Record<string, string> = {
  contado: "Contado",
  credito_7: "Crédito a 7 días",
  credito_15: "Crédito a 15 días",
  credito_30: "Crédito a 30 días",
};

const BLOQUE = "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4";
const ENLACE = "font-semibold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]";

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-[var(--text-secondary)]">{etiqueta}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-[var(--text-primary)]">{children}</dd>
    </div>
  );
}

const NADA = <span className="font-normal text-[var(--text-tertiary)]">—</span>;

/** Lo que se mira primero de un proveedor: cifras, contacto, condiciones y documentación. */
export default function FichaResumen({ proveedor: p, ficha }: { proveedor: DbSupplier; ficha: FichaConPermiso | null }) {
  const r = ficha?.resumen ?? null;
  const documento = (p.documento || p.ruc || "").trim();
  const aviso = avisoDeDocumento(p.tipoDocumento, documento);
  const direccion = [p.direccion || p.address, p.distrito, p.provincia, p.departamento].filter(Boolean).join(", ");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy={!r}>
        {ficha?.veDeuda && (
          <StatCard
            density="compact"
            label="Le debes"
            value={r ? formatCurrency(r.saldo) : "…"}
            emphasis={r && r.vencido > 0 ? "error" : "neutral"}
            subValue={r ? (r.vencido > 0 ? `${formatCurrency(r.vencido)} vencido` : r.saldo > 0 ? `${r.cuentasAbiertas} cuenta${r.cuentasAbiertas === 1 ? "" : "s"} al día` : "Al día") : undefined}
          />
        )}
        <StatCard
          density="compact"
          label="Le compraste en 12 meses"
          value={r ? formatCurrency(r.compradoEnElAnio) : "…"}
          subValue={r ? `${r.ordenesEnElAnio} ${r.ordenesEnElAnio === 1 ? "orden que llegó" : "órdenes que llegaron"}` : undefined}
        />
        <StatCard
          density="compact"
          label="En camino"
          value={r ? String(r.enCamino) : "…"}
          subValue={r ? (r.enCamino > 0 ? (r.enCamino === 1 ? "orden por llegar" : "órdenes por llegar") : "Nada pendiente") : undefined}
        />
        <StatCard
          density="compact"
          label="Devoluciones abiertas"
          value={r ? String(r.devolucionesAbiertas) : "…"}
          emphasis={r && r.devolucionesAbiertas > 0 ? "warning" : "neutral"}
          subValue={r ? (r.montoDevolucionesAbiertas > 0 ? `${formatCurrency(r.montoDevolucionesAbiertas)} por recuperar` : "Ninguna por resolver") : undefined}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <section className={BLOQUE} aria-labelledby="ficha-contacto">
          <BlockTitle id="ficha-contacto" className="mb-1">Contacto</BlockTitle>
          <dl className="divide-y divide-[var(--rule-soft)] text-sm">
            <Dato etiqueta="Persona">{p.personaContacto || NADA}</Dato>
            <Dato etiqueta="Teléfono">
              {p.phone ? (
                <a href={urlWhatsApp(p.phone, "Hola, quisiera hacer un pedido.")} target="_blank" rel="noopener noreferrer" className={`${ENLACE} inline-flex items-center gap-1`}>
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                  {p.phone}
                </a>
              ) : NADA}
            </Dato>
            {p.whatsappSecundario && <Dato etiqueta="Otro número">{p.whatsappSecundario}</Dato>}
            <Dato etiqueta="Correo">{p.email ? <a href={`mailto:${p.email}`} className={ENLACE}>{p.email}</a> : NADA}</Dato>
            <Dato etiqueta="Dirección">{direccion || NADA}</Dato>
          </dl>
        </section>

        <section className={BLOQUE} aria-labelledby="ficha-condiciones">
          <BlockTitle id="ficha-condiciones" className="mb-1">Condiciones</BlockTitle>
          <dl className="divide-y divide-[var(--rule-soft)] text-sm">
            <Dato etiqueta="Forma de pago">{PAGO[p.condicionPago ?? ""] ?? NADA}</Dato>
            <Dato etiqueta="Días de crédito">{p.diasCredito ? `${p.diasCredito} días` : NADA}</Dato>
            <Dato etiqueta="Tarda en entregar">{p.leadTimeDias ? `Dice ${p.leadTimeDias} día${p.leadTimeDias === 1 ? "" : "s"}` : NADA}</Dato>
            <Dato etiqueta="Rubro">{p.categoria || NADA}</Dato>
            <Dato etiqueta="Última compra">{r?.ultimaCompra ? diaCorto(r.ultimaCompra) : r ? "Nunca" : "…"}</Dato>
          </dl>
        </section>

        <section className={BLOQUE} aria-labelledby="ficha-documentos">
          <div className="mb-1 flex items-center gap-1.5">
            <BlockTitle id="ficha-documentos">Documentación</BlockTitle>
            <InfoTip
              title="Documento del proveedor"
              what="El RUC tiene 11 dígitos y el DNI 8. Al guardar se revisa el formato y si ya tienes otro proveedor con el mismo número."
              affects="Con RUC válido puedes pedirle factura y el sistema completa su razón social desde SUNAT."
              example="20601234567 (empresa) · 10456789012 (persona con negocio)"
            />
          </div>
          <dl className="divide-y divide-[var(--rule-soft)] text-sm">
            <Dato etiqueta={tipoDeDocumento(p.tipoDocumento)}>{documento ? <span className="font-mono">{documento}</span> : NADA}</Dato>
            <Dato etiqueta="Razón social">{p.razonSocial || NADA}</Dato>
            <Dato etiqueta="Banco">{p.banco || NADA}</Dato>
            <Dato etiqueta="Cuenta">{p.cuentaBancaria ? <span className="font-mono">{p.cuentaBancaria}</span> : NADA}</Dato>
          </dl>
          {aviso && (
            <p className="mt-2 flex items-start gap-1.5 text-sm font-medium text-[var(--data-warning-ink)]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {aviso}
            </p>
          )}
        </section>
      </div>

      {(p.observaciones || p.notes) && (
        <section className={BLOQUE} aria-labelledby="ficha-notas">
          <BlockTitle id="ficha-notas" className="mb-1">Notas</BlockTitle>
          <p className="whitespace-pre-line text-sm text-[var(--text-secondary)]">{p.observaciones || p.notes}</p>
        </section>
      )}
    </div>
  );
}

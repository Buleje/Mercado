import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { hrefDe } from "@/lib/admin/enlaces-panel";
import { formatCurrency } from "@/lib/currency";
import { isSpecializationEnabled } from "@/lib/specializations";
import { mismoDocumento, normalizarDocumento } from "@/lib/rrhh/documento";
import {
  motivosDeCoincidencia,
  ordenarCuentas,
  textoDeSaldo,
  ultimos9,
  type OtraCuentaDTO,
  type OtrasCuentasDTO,
} from "@/lib/rrhh/otras-cuentas";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { CustomersDB } from "@/lib/db/customers.db";
import { GuiaPlataDB } from "@/lib/db/guia-plata.db";

/** Tope por fuente: una coincidencia por documento/celular son 1-2 filas; 20 ya es un dato raro. */
const TOPE = 20;

/** Una cifra que no se pudo leer no tumba la lista: se anota y la cuenta se muestra sin cifra. */
async function sinCaer<T>(ctx: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    logger.warn(`[rrhh/cuentas] no leyó ${ctx}`, { error: String(err) });
    return null;
  }
}

/**
 * CuentasColaboradorDB — «Sus cuentas» del trabajador: las cuentas que la misma
 * persona tiene en otros módulos (Mi Plata, proveedores, clientes, comunidades),
 * encontradas por documento o celular (`lib/rrhh/otras-cuentas.ts`).
 *
 * Roles: la ruta deja pasar sólo el nivel `completo` de RRHH (admin, dueño),
 * los mismos que ven la cuenta y la vinculan (ADR-414 §7). Esos dos pasan
 * todas las rutas de origen (`/api/fiados`, `/api/customers`, `/api/purchases`,
 * `/api/adelantos`), así que acá no hay recorte por fuente; si algún día se abre
 * a otro rol, el recorte va como en `TerceroEnElSistemaDB` (veFiado, veCliente…).
 */
export const CuentasColaboradorDB = {
  async otras(tenantId: string, colaboradorId: string): Promise<OtrasCuentasDTO | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const el = await prisma.colaborador.findFirst({
      where: { id: colaboradorId, tenantId, deletedAt: null },
      select: { id: true, documento: true, celular: true, beneficiarioId: true },
    });
    if (!el) return null;

    const doc = normalizarDocumento(el.documento);
    const tel = ultimos9(el.celular);
    const buscaPor = { documento: !!doc, celular: !!tel };
    if (!doc && !tel) return { buscaPor, cuentas: [] };

    // Prefiltro en SQL (contiene el documento / termina en el celular); la
    // coincidencia exacta la decide `motivosDeCoincidencia` sobre lo normalizado.
    const porDoc = (campo: string) => (doc ? [{ [campo]: { contains: doc, mode: "insensitive" as const } }] : []);
    const porTel = (campo: string) => (tel ? [{ [campo]: { endsWith: tel } }] : []);

    const [personas, proveedores, clientes, comunidades, ocupadas] = await Promise.all([
      prisma.adelantoBeneficiario.findMany({
        where: { tenantId, activo: true, OR: [...porDoc("documento"), ...porTel("telefono")] },
        select: { id: true, nombre: true, documento: true, telefono: true, forestPartyId: true },
        take: TOPE,
      }),
      prisma.supplier.findMany({
        where: { tenantId, OR: [...porDoc("documento"), ...porDoc("ruc"), ...porTel("phone")] },
        select: { id: true, name: true, razonSocial: true, documento: true, ruc: true, phone: true },
        take: TOPE,
      }),
      prisma.customer.findMany({
        where: { tenantId, OR: [...porDoc("documento"), ...porTel("phone")] },
        select: { id: true, name: true, documento: true, phone: true },
        take: TOPE,
      }),
      prisma.forestParty.findMany({
        where: { tenantId, deletedAt: null, OR: [...porDoc("docNumero"), ...porTel("telefono")] },
        select: { id: true, nombre: true, docNumero: true, telefono: true },
        take: TOPE,
      }),
      prisma.colaborador.findMany({
        where: { tenantId, deletedAt: null, beneficiarioId: { not: null }, id: { not: el.id } },
        select: { beneficiarioId: true },
      }),
    ]);
    const deOtro = new Set(ocupadas.map((o) => o.beneficiarioId as string));
    const quien = { documento: el.documento, celular: el.celular };
    const cuentas: OtraCuentaDTO[] = [];

    // ── Personas de Mi Plata (no la suya: esa ya la muestra «Cuenta en Adelantos») ──
    const personasDeEl = personas
      .filter((p) => p.id !== el.beneficiarioId)
      .map((p) => ({ p, por: motivosDeCoincidencia(quien, { documentos: [p.documento], telefonos: [p.telefono] }) }))
      .filter((x) => x.por.length > 0);
    if (personasDeEl.length > 0) {
      const saldos = await sinCaer("los saldos de Mi Plata", () => AdelantosDB.listBeneficiarios(tenantId));
      const neto = new Map((saldos ?? []).map((b) => [b.id, b.neto.PEN ?? 0]));
      for (const { p, por } of personasDeEl) {
        // Vincular sólo si él no tiene cuenta, la persona no es de otro trabajador
        // y el documento no choca (`vincularBeneficiario` lo rechazaría igual).
        const docChoca = !!doc && !!p.documento && !mismoDocumento(doc, p.documento);
        const s = textoDeSaldo(saldos ? (neto.get(p.id) ?? 0) : null);
        cuentas.push({
          clave: `persona:${p.id}`,
          tipo: "persona",
          id: p.id,
          nombre: deOtro.has(p.id) ? `${p.nombre} (cuenta de otro trabajador)` : p.nombre,
          por,
          ...s,
          href: hrefDe("cuenta-adelantos", p.forestPartyId ? `parte:${p.forestPartyId}` : `benef:${p.id}`),
          vinculable: !el.beneficiarioId && !deOtro.has(p.id) && !docChoca,
        });
      }
    }

    // ── Proveedores ──
    for (const s of proveedores) {
      const por = motivosDeCoincidencia(quien, { documentos: [s.documento, s.ruc], telefonos: [s.phone] });
      if (por.length === 0) continue;
      cuentas.push({
        clave: `proveedor:${s.id}`,
        tipo: "proveedor",
        id: s.id,
        nombre: s.razonSocial?.trim() || s.name,
        por,
        cifra: null,
        tono: "neutro",
        href: hrefDe("proveedor", s.id),
        vinculable: false,
      });
    }

    // ── Clientes (con su fiado) ──
    const clientesDeEl = clientes
      .map((c) => ({ c, por: motivosDeCoincidencia(quien, { documentos: [c.documento], telefonos: [c.phone] }) }))
      .filter((x) => x.por.length > 0);
    if (clientesDeEl.length > 0) {
      const fiados = await sinCaer("los fiados", () => CustomersDB.deudaDeFiados(tenantId));
      for (const { c, por } of clientesDeEl) {
        const f = fiados?.get(c.phone);
        cuentas.push({
          clave: `cliente:${c.id}`,
          tipo: "cliente",
          id: c.id,
          nombre: c.name || c.phone,
          por,
          cifra: f && f.deuda > 0 ? `Fiado: te debe ${formatCurrency(f.deuda)}` : null,
          tono: f && f.deuda > 0 ? "atencion" : "neutro",
          // El CRM abre la ficha por teléfono (enlaces-panel).
          href: hrefDe("cliente", c.phone),
          vinculable: false,
        });
      }
    }

    // ── Comunidades / terceros del directorio forestal ──
    const comunidadesDeEl = comunidades
      .map((p) => ({ p, por: motivosDeCoincidencia(quien, { documentos: [p.docNumero], telefonos: [p.telefono] }) }))
      .filter((x) => x.por.length > 0);
    if (comunidadesDeEl.length > 0) {
      const forestal = (await sinCaer("la especialización forestal", () => isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro"))) === true;
      for (const { p, por } of comunidadesDeEl) {
        const r = await sinCaer("la cuenta de la comunidad", () => GuiaPlataDB.resumenPersona(tenantId, p.id));
        cuentas.push({
          clave: `comunidad:${p.id}`,
          tipo: "comunidad",
          id: p.id,
          nombre: p.nombre,
          por,
          ...textoDeSaldo(r ? r.neto : null),
          href: forestal ? hrefDe("parte", p.id) : hrefDe("cuenta-adelantos", `parte:${p.id}`),
          vinculable: false,
        });
      }
    }

    return { buscaPor, cuentas: ordenarCuentas(cuentas) };
  },
};

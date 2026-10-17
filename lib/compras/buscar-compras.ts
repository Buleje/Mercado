/**
 * C57 — Buscar en Compras. Una cadena («F001-123», «Arroz», «20601234567»,
 * «#AB12CD34», «S/ 450») encuentra órdenes, proveedores, cuentas por pagar,
 * devoluciones y recepciones, y cada resultado dice con qué está vinculado
 * (sus recepciones, su deuda, cuándo llega) y qué se puede hacer.
 *
 * Las acciones sólo NAVEGAN: abren la ficha o la sección donde se revisa.
 * Nada confirma una compra, un pago ni una devolución desde el buscador.
 *
 * Función pura: el servidor arma `DatosDeCompras` (`datos-de-compras.ts`) y
 * la deuda viaja sólo a quien gestiona la plata (`cuentas: null` si no).
 */

import { hrefDe } from "@/lib/admin/enlaces-panel";
import { formatCurrency } from "@/lib/format";
import { claveDeDia, diaCorto, diasEntre, esperaEntrega, grupoDeEntrega } from "./ciclo-oc";
import { claveDocumento, codigoDeOrden, descripcionALaVista } from "./referencia-documento";

// ── Lo que se busca ───────────────────────────────────────────────────────────

export type OrdenDeCompras = {
  id: string;
  supplierId: string;
  supplierName: string;
  items: ReadonlyArray<{ productId: number; name: string; quantity: number; unitCost?: number; unit?: string }>;
  total: number;
  status: string;
  notes?: string | null;
  invoiceNumber?: string | null;
  invoiceType?: string | null;
  deliveryDate?: string | null;
  createdAt: string;
  createdBy?: string | null;
  receivedBy?: string | null;
};
export type ProveedorDeCompras = { id: string; name: string; ruc?: string | null; documento?: string | null; phone?: string | null; personaContacto?: string | null };
export type CuentaDeCompras = {
  id: string;
  supplierId: string;
  supplierName: string;
  purchaseOrderId?: string | null;
  description: string;
  amount: number;
  paidAmount: number;
  status: string;
  dueDate: string | null;
  createdAt: string;
};
export type DevolucionDeCompras = {
  id: string;
  proveedorId: string | null;
  proveedorNombre: string;
  motivo: string;
  estado: string;
  notas: string | null;
  createdAt: string;
  items: ReadonlyArray<{ nombre: string; cantidad: number; unidad: string; precioUnitario: number | null }>;
};
export type RecepcionDeCompras = {
  id: string;
  ref: string;
  purchaseOrderId: string | null;
  supplierName: string;
  status: string;
  inspector: string | null;
  fecha: string | null;
};
export type DatosDeCompras = {
  ordenes: OrdenDeCompras[];
  proveedores: ProveedorDeCompras[];
  /** `null` = este rol no ve la plata (almacenero): ni deudas ni saldos. */
  cuentas: CuentaDeCompras[] | null;
  devoluciones: DevolucionDeCompras[];
  recepciones: RecepcionDeCompras[];
};

// ── Lo que se devuelve ────────────────────────────────────────────────────────

export type TipoHallazgo = "orden" | "proveedor" | "cuenta" | "devolucion" | "recepcion";
export type AccionHallazgo = {
  rotulo: string;
  /** A dónde lleva (dentro del panel). `null` si la acción es `nuevaOrdenA`. */
  href: string | null;
  /** «Nueva orden a este proveedor»: el cliente lo deja elegido y abre Órdenes. */
  nuevaOrdenA?: { id: string; name: string };
};
export type Hallazgo = {
  /** `tipo:id`, estable entre búsquedas. */
  clave: string;
  tipo: TipoHallazgo;
  titulo: string;
  detalle: string;
  /** Lo vinculado: «2 recepciones», «debes S/ 50,00 · vence jueves 10/09». */
  vinculos: string[];
  /** Dónde coincidió, si no es el título: «producto Arroz Costeño». */
  motivo: string | null;
  acciones: AccionHallazgo[];
  exacto: boolean;
  /** YYYY-MM-DD para ordenar (lo más nuevo arriba). */
  fecha: string;
};
export type GrupoHallazgos = { tipo: TipoHallazgo; rotulo: string; hallazgos: Hallazgo[]; total: number };
export type ResultadoBusqueda = { consulta: string; modo: ModoBusqueda; grupos: GrupoHallazgos[]; total: number };
export type ModoBusqueda = "todo" | "recibir";

const ROTULOS: Record<TipoHallazgo, string> = {
  orden: "Órdenes de compra",
  proveedor: "Proveedores",
  cuenta: "Por pagar",
  devolucion: "Devoluciones",
  recepcion: "Recepciones",
};
const ORDEN_GRUPOS: TipoHallazgo[] = ["orden", "proveedor", "cuenta", "recepcion", "devolucion"];

const ESTADO_OC: Record<string, string> = {
  pendiente: "Pendiente", parcial: "Llegó una parte", recibido: "Recibida", cancelado: "Cancelada", auto_generated: "Sugerida",
};
const ESTADO_DEVOLUCION: Record<string, string> = { PENDIENTE: "Por enviar", ENVIADA: "Enviada", RESUELTA: "Resuelta", ANULADA: "Anulada" };
const ESTADO_RECEPCION: Record<string, string> = {
  programada: "Programada", "en-proceso": "En revisión", aceptada: "Aceptada", parcial: "Parcial", rechazada: "Rechazada",
};

export const HREF_POR_PAGAR = "/admin?tab=compras&vista=cuentas-por-pagar&sub=cuentas";
export const HREF_DEVOLUCIONES = "/admin?tab=compras&vista=devoluciones";
export const HREF_RECEPCIONES = "/admin?tab=compras&vista=ordenes-compra&sub=recibir";
const conConsulta = (base: string, q: string) => `${base}&q=${encodeURIComponent(q)}`;

/** Minúsculas y sin tildes: «Azúcar» encuentra «azucar». */
export const plano = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Importe escrito como consulta («S/ 450», «1,250.50»), o `null`. */
export function importeDeConsulta(q: string): number | null {
  const t = q.trim();
  if (!/^(s\/\s*)?[\d.,]+$/i.test(t) || !/\d/.test(t)) return null;
  const n = Number(t.replace(/^s\/\s*/i, "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** «AB12CD34» o «#ab12cd34»: el código corto de una orden. */
function codigoDeConsulta(q: string): string | null {
  const t = q.trim().replace(/^#/, "").toUpperCase();
  return /^[A-Z0-9-]{6,8}$/.test(t) && /\d/.test(t) ? t : null;
}

type Campo = readonly [rotulo: string | null, valor: string | null | undefined];

/**
 * Todas las palabras tienen que aparecer en algún campo (Y, no O). El motivo es
 * el primer campo con rótulo que tiene una de ellas: si coincidió en el título,
 * no hace falta decir dónde.
 */
function coincidePalabras(campos: readonly Campo[], palabras: readonly string[]): { ok: boolean; motivo: string | null } {
  if (palabras.length === 0) return { ok: false, motivo: null };
  const planos = campos.map(([rotulo, valor]) => ({ rotulo, texto: plano(valor), valor: valor ?? "" }));
  const todo = planos.map((c) => c.texto).join(" ");
  if (!palabras.every((p) => todo.includes(p))) return { ok: false, motivo: null };
  const enTitulo = planos.filter((c) => c.rotulo === null).some((c) => palabras.every((p) => c.texto.includes(p)));
  if (enTitulo) return { ok: true, motivo: null };
  const conMotivo = planos.find((c) => c.rotulo !== null && palabras.some((p) => c.texto.includes(p)));
  return { ok: true, motivo: conMotivo ? `${conMotivo.rotulo} ${conMotivo.valor.trim().slice(0, 60)}` : null };
}

function vencimiento(vence: string | null, hoy: string): string {
  if (!vence) return "sin fecha de pago";
  const d = diasEntre(hoy, vence);
  if (d < 0) return `venció el ${diaCorto(vence)}`;
  if (d === 0) return "vence hoy";
  return `vence el ${diaCorto(vence)}`;
}

function saldoDe(c: CuentaDeCompras): number {
  return Math.max(0, Math.round((num(c.amount) - num(c.paidAmount)) * 100) / 100);
}

function entregaDeOrden(o: OrdenDeCompras, hoy: string): string | null {
  if (!esperaEntrega(o.status)) return null;
  const prometida = claveDeDia(o.deliveryDate ?? null);
  if (!prometida) return "Sin fecha de entrega";
  const grupo = grupoDeEntrega(o.deliveryDate ?? null, hoy);
  if (grupo === "atrasadas") {
    const d = diasEntre(prometida, hoy);
    return `Atrasada ${d} día${d === 1 ? "" : "s"} (prometida el ${diaCorto(prometida)})`;
  }
  if (grupo === "hoy") return "Llega hoy";
  return `Llega el ${diaCorto(prometida)}`;
}

type Indices = {
  recepcionesDe: Map<string, RecepcionDeCompras[]>;
  cuentaDe: Map<string, CuentaDeCompras>;
  ordenPorId: Map<string, OrdenDeCompras>;
};

function indexar(d: DatosDeCompras): Indices {
  const recepcionesDe = new Map<string, RecepcionDeCompras[]>();
  for (const r of d.recepciones) {
    if (!r.purchaseOrderId) continue;
    recepcionesDe.set(r.purchaseOrderId, [...(recepcionesDe.get(r.purchaseOrderId) ?? []), r]);
  }
  const cuentaDe = new Map<string, CuentaDeCompras>();
  for (const c of d.cuentas ?? []) if (c.purchaseOrderId) cuentaDe.set(c.purchaseOrderId, c);
  return { recepcionesDe, cuentaDe, ordenPorId: new Map(d.ordenes.map((o) => [o.id, o])) };
}

// ── Cada tipo de hallazgo ─────────────────────────────────────────────────────

function hallazgoOrden(o: OrdenDeCompras, idx: Indices, verPlata: boolean, hoy: string, motivo: string | null, exacto: boolean): Hallazgo {
  const fecha = claveDeDia(o.createdAt) ?? hoy;
  const comprobante = o.invoiceNumber?.trim() ? ` · ${o.invoiceType === "boleta" ? "Boleta" : o.invoiceType === "guia" ? "Guía" : "Factura"} ${o.invoiceNumber.trim()}` : "";
  const recepciones = idx.recepcionesDe.get(o.id) ?? [];
  const vinculos: string[] = [];
  const entrega = entregaDeOrden(o, hoy);
  if (entrega) vinculos.push(entrega);
  if (recepciones.length > 0) {
    vinculos.push(`${recepciones.length === 1 ? "1 recepción" : `${recepciones.length} recepciones`} (${recepciones.slice(0, 3).map((r) => r.ref).join(", ")})`);
  }
  const cuenta = idx.cuentaDe.get(o.id);
  if (verPlata && cuenta) {
    const saldo = saldoDe(cuenta);
    vinculos.push(saldo > 0 ? `Debes ${formatCurrency(saldo)} · ${vencimiento(claveDeDia(cuenta.dueDate), hoy)}` : "Su cuenta está pagada");
  }
  const href = hrefDe("oc", o.id) ?? HREF_RECEPCIONES;
  const acciones: AccionHallazgo[] = [{ rotulo: esperaEntrega(o.status) ? "Abrir para recibir" : "Ver la orden", href }];
  if (verPlata && cuenta && saldoDe(cuenta) > 0) {
    acciones.push({ rotulo: "Ver su cuenta", href: conConsulta(HREF_POR_PAGAR, descripcionALaVista(cuenta.description, cuenta.purchaseOrderId)) });
  }
  return {
    clave: `orden:${o.id}`,
    tipo: "orden",
    titulo: `Orden ${codigoDeOrden(o.id)} · ${o.supplierName || "Sin proveedor"}`,
    detalle: `${ESTADO_OC[o.status] ?? o.status} · ${diaCorto(fecha)} · ${formatCurrency(num(o.total))}${comprobante}`,
    vinculos,
    motivo,
    acciones,
    exacto,
    fecha,
  };
}

function hallazgoProveedor(p: ProveedorDeCompras, d: DatosDeCompras, verPlata: boolean, hoy: string, motivo: string | null, exacto: boolean): Hallazgo {
  const ordenes = d.ordenes.filter((o) => o.supplierId === p.id && o.status !== "cancelado");
  const porRecibir = ordenes.filter((o) => esperaEntrega(o.status)).length;
  const ultima = ordenes.map((o) => claveDeDia(o.createdAt)).filter((f): f is string => !!f).sort().pop();
  const vinculos: string[] = [];
  if (ordenes.length > 0) vinculos.push(`${ordenes.length === 1 ? "1 orden" : `${ordenes.length} órdenes`}${ultima ? ` · la última el ${diaCorto(ultima)}` : ""}`);
  if (porRecibir > 0) vinculos.push(`${porRecibir} por recibir`);
  const deuda = verPlata ? (d.cuentas ?? []).filter((c) => c.supplierId === p.id).reduce((s, c) => s + saldoDe(c), 0) : 0;
  if (deuda > 0) vinculos.push(`Le debes ${formatCurrency(Math.round(deuda * 100) / 100)}`);
  const documento = p.ruc?.trim() || p.documento?.trim();
  const acciones: AccionHallazgo[] = [
    { rotulo: "Ver su ficha", href: hrefDe("proveedor", p.id) },
    { rotulo: "Nueva orden", href: null, nuevaOrdenA: { id: p.id, name: p.name } },
  ];
  if (deuda > 0) acciones.push({ rotulo: "Ver lo que le debes", href: conConsulta(HREF_POR_PAGAR, p.name) });
  return {
    clave: `proveedor:${p.id}`,
    tipo: "proveedor",
    titulo: p.name,
    detalle: [documento ? `RUC/DNI ${documento}` : null, p.phone?.trim() ? `Tel. ${p.phone.trim()}` : null].filter(Boolean).join(" · ") || "Sin RUC ni teléfono",
    vinculos,
    motivo,
    acciones,
    exacto,
    fecha: ultima ?? "0000-00-00",
  };
}

function hallazgoCuenta(c: CuentaDeCompras, idx: Indices, hoy: string, motivo: string | null, exacto: boolean): Hallazgo {
  const saldo = saldoDe(c);
  const visible = descripcionALaVista(c.description, c.purchaseOrderId);
  const orden = c.purchaseOrderId ? idx.ordenPorId.get(c.purchaseOrderId) : undefined;
  const acciones: AccionHallazgo[] = [{ rotulo: "Ver en Por pagar", href: conConsulta(HREF_POR_PAGAR, visible || c.supplierName) }];
  if (orden) acciones.push({ rotulo: "Ver la orden", href: hrefDe("oc", orden.id) });
  return {
    clave: `cuenta:${c.id}`,
    tipo: "cuenta",
    titulo: `${visible || "Cuenta"} · ${c.supplierName}`,
    detalle: saldo > 0
      ? `Debes ${formatCurrency(saldo)} de ${formatCurrency(num(c.amount))} · ${vencimiento(claveDeDia(c.dueDate), hoy)}`
      : `Pagada · ${formatCurrency(num(c.amount))}`,
    vinculos: orden ? [`De la orden ${codigoDeOrden(orden.id)} (${ESTADO_OC[orden.status] ?? orden.status})`] : [],
    motivo,
    acciones,
    exacto,
    fecha: claveDeDia(c.createdAt) ?? hoy,
  };
}

function hallazgoDevolucion(v: DevolucionDeCompras, hoy: string, motivo: string | null): Hallazgo {
  const fecha = claveDeDia(v.createdAt) ?? hoy;
  const n = v.items.length;
  return {
    clave: `devolucion:${v.id}`,
    tipo: "devolucion",
    titulo: `Devolución a ${v.proveedorNombre}`,
    detalle: `${ESTADO_DEVOLUCION[v.estado] ?? v.estado} · ${diaCorto(fecha)} · ${n === 1 ? "1 producto" : `${n} productos`} · ${v.motivo}`,
    vinculos: [],
    motivo,
    acciones: [{ rotulo: "Ver en Devoluciones", href: conConsulta(HREF_DEVOLUCIONES, v.proveedorNombre) }],
    exacto: false,
    fecha,
  };
}

function hallazgoRecepcion(r: RecepcionDeCompras, idx: Indices, hoy: string, motivo: string | null, exacto: boolean): Hallazgo {
  const orden = r.purchaseOrderId ? idx.ordenPorId.get(r.purchaseOrderId) : undefined;
  const fecha = r.fecha ?? hoy;
  return {
    clave: `recepcion:${r.id}`,
    tipo: "recepcion",
    titulo: `Recepción ${r.ref} · ${r.supplierName}`,
    detalle: [ESTADO_RECEPCION[r.status] ?? r.status, diaCorto(fecha), r.inspector ? `revisó ${r.inspector}` : null].filter(Boolean).join(" · "),
    vinculos: orden ? [`De la orden ${codigoDeOrden(orden.id)}`] : ["Sin orden de compra"],
    motivo,
    acciones: orden ? [{ rotulo: "Ver la orden", href: hrefDe("oc", orden.id) }] : [{ rotulo: "Ver recepciones", href: HREF_RECEPCIONES }],
    exacto,
    fecha,
  };
}

// ── La búsqueda ───────────────────────────────────────────────────────────────

export type OpcionesBusqueda = { hoy: string; modo?: ModoBusqueda; tope?: number };

/** Mínimo de letras para buscar (en modo «recibir» se lista todo lo que espera). */
export const MINIMO_CONSULTA = 2;

/**
 * Busca `consulta` en todo Compras. Coincidencias exactas (comprobante, código
 * de orden, RUC, ref de recepción, importe) primero; después lo más nuevo.
 * Lo vinculado entra aunque no coincida el texto: buscar «F001-123» trae la
 * orden y también su recepción y su cuenta.
 */
export function buscarEnCompras(d: DatosDeCompras, consulta: string, opts: OpcionesBusqueda): ResultadoBusqueda {
  const modo = opts.modo ?? "todo";
  const tope = opts.tope ?? (modo === "recibir" ? 20 : 6);
  const q = consulta.trim().slice(0, 80);
  const palabras = plano(q).split(/\s+/).filter(Boolean);
  const verPlata = d.cuentas !== null;
  const idx = indexar(d);
  const hoy = opts.hoy;
  if (modo === "todo" && q.length < MINIMO_CONSULTA) return { consulta: q, modo, grupos: [], total: 0 };

  const clave = claveDocumento(q);
  const codigo = codigoDeConsulta(q);
  const importe = importeDeConsulta(q);
  const digitos = q.replace(/\D/g, "");
  const igualImporte = (n: number) => importe != null && Math.abs(n - importe) <= 0.004;

  const porTipo = new Map<TipoHallazgo, Hallazgo[]>(ORDEN_GRUPOS.map((t) => [t, []]));
  const vistos = new Set<string>();
  const sumar = (h: Hallazgo) => {
    if (vistos.has(h.clave)) return;
    vistos.add(h.clave);
    porTipo.get(h.tipo)?.push(h);
  };

  // Órdenes
  const ordenesEncontradas: OrdenDeCompras[] = [];
  const ordenes = modo === "recibir" ? d.ordenes.filter((o) => esperaEntrega(o.status)) : d.ordenes;
  for (const o of ordenes) {
    const exacto =
      (clave != null && claveDocumento(o.invoiceNumber) === clave) ||
      (codigo != null && (o.id.toUpperCase().endsWith(codigo) || o.id.toUpperCase() === codigo)) ||
      igualImporte(num(o.total));
    const m = palabras.length === 0
      ? { ok: modo === "recibir", motivo: null }
      : coincidePalabras([
          [null, `Orden ${codigoDeOrden(o.id)} ${o.supplierName}`],
          ["comprobante", o.invoiceNumber],
          ["producto", o.items.map((i) => i.name).join(" · ")],
          ["nota", o.notes],
          ["hizo", [o.createdBy, o.receivedBy].filter(Boolean).join(" ")],
        ], palabras);
    if (!exacto && !m.ok) continue;
    const motivo = exacto && clave && claveDocumento(o.invoiceNumber) === clave ? `comprobante ${o.invoiceNumber}` : m.motivo;
    ordenesEncontradas.push(o);
    sumar(hallazgoOrden(o, idx, verPlata, hoy, motivo, exacto));
  }

  if (modo === "todo") {
    // Proveedores
    for (const p of d.proveedores) {
      const doc = `${p.ruc ?? ""} ${p.documento ?? ""}`.replace(/\D/g, " ").trim();
      const exacto = digitos.length >= 8 && doc.split(/\s+/).includes(digitos);
      const m = coincidePalabras([
        [null, p.name],
        ["RUC/DNI", [...new Set([p.ruc, p.documento].filter(Boolean))].join(" ")],
        ["teléfono", p.phone],
        ["contacto", p.personaContacto],
      ], palabras);
      if (exacto || m.ok) sumar(hallazgoProveedor(p, d, verPlata, hoy, m.motivo, exacto));
    }

    // Cuentas por pagar (sólo quien ve la plata)
    for (const c of d.cuentas ?? []) {
      const visible = descripcionALaVista(c.description, c.purchaseOrderId);
      const exacto = (clave != null && claveDocumento(c.description) === clave) || igualImporte(num(c.amount)) || igualImporte(saldoDe(c));
      // Sólo lo que se ve: la descripción cruda trae el id técnico de la orden («Auto-generado desde OC cm…»).
      const m = coincidePalabras([[null, `${visible} ${c.supplierName}`]], palabras);
      if (exacto || m.ok) sumar(hallazgoCuenta(c, idx, hoy, m.motivo, exacto));
    }

    // Recepciones
    for (const r of d.recepciones) {
      const exacto = plano(r.ref) === plano(q);
      const m = coincidePalabras([[null, `Recepción ${r.ref} ${r.supplierName}`], ["revisó", r.inspector]], palabras);
      if (exacto || m.ok) sumar(hallazgoRecepcion(r, idx, hoy, m.motivo, exacto));
    }

    // Devoluciones
    for (const v of d.devoluciones) {
      const m = coincidePalabras([
        [null, `Devolución ${v.proveedorNombre}`],
        ["motivo", v.motivo],
        ["producto", v.items.map((i) => i.nombre).join(" · ")],
        ["nota", v.notas],
      ], palabras);
      if (m.ok) sumar(hallazgoDevolucion(v, hoy, m.motivo));
    }

    // Lo vinculado: de pocas órdenes encontradas, sus recepciones y su cuenta;
    // de una cuenta o una recepción encontrada, su orden.
    if (ordenesEncontradas.length <= 5) {
      for (const o of ordenesEncontradas) {
        const de = `de la orden ${codigoDeOrden(o.id)}`;
        for (const r of idx.recepcionesDe.get(o.id) ?? []) sumar(hallazgoRecepcion(r, idx, hoy, de, false));
        const c = idx.cuentaDe.get(o.id);
        if (c) sumar(hallazgoCuenta(c, idx, hoy, de, false));
      }
    }
    for (const h of [...(porTipo.get("cuenta") ?? []), ...(porTipo.get("recepcion") ?? [])]) {
      const id = h.tipo === "cuenta"
        ? (d.cuentas ?? []).find((c) => `cuenta:${c.id}` === h.clave)?.purchaseOrderId
        : d.recepciones.find((r) => `recepcion:${r.id}` === h.clave)?.purchaseOrderId;
      const o = id ? idx.ordenPorId.get(id) : undefined;
      if (o) sumar(hallazgoOrden(o, idx, verPlata, hoy, h.tipo === "cuenta" ? "su cuenta coincide" : "su recepción coincide", false));
    }
  }

  const ordenar = (a: Hallazgo, b: Hallazgo) => {
    if (a.exacto !== b.exacto) return a.exacto ? -1 : 1;
    if (modo === "recibir" && a.tipo === "orden") {
      const fa = claveDeDia(idx.ordenPorId.get(a.clave.slice(6))?.deliveryDate ?? null) ?? "9999-99-99";
      const fb = claveDeDia(idx.ordenPorId.get(b.clave.slice(6))?.deliveryDate ?? null) ?? "9999-99-99";
      return fa.localeCompare(fb);
    }
    return b.fecha.localeCompare(a.fecha);
  };
  const grupos: GrupoHallazgos[] = ORDEN_GRUPOS
    .map((tipo) => {
      const todos = (porTipo.get(tipo) ?? []).sort(ordenar);
      return { tipo, rotulo: ROTULOS[tipo], hallazgos: todos.slice(0, tope), total: todos.length };
    })
    .filter((g) => g.total > 0);
  return { consulta: q, modo, grupos, total: grupos.reduce((s, g) => s + g.total, 0) };
}

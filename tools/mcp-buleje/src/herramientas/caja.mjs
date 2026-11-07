// Grupo «caja»: cajas, tesorería y cierres. Todo lo que mueve plata pide OK.
import { z, negocio, idRuta, limpiar, lista, ficha, soles, fechaLima, claveMonto, fichaPorId, filasCompletas, verificado, NO_VERIFICADO } from "../util-herramientas.mjs";

/** «la caja abierta el 29/10 08:10» leída del panel por id (las cajas no tienen nombre). */
function cajaVista(c) {
  if (!c || typeof c !== "object" || !c.openedAt) return `${NO_VERIFICADO} (caja: no se pudo leer)`;
  const estado = c.status && String(c.status).toUpperCase() !== "OPEN" && String(c.status).toLowerCase() !== "abierta" ? ` — OJO: está ${String(c.status).toLowerCase()}` : "";
  return `la caja abierta el ${fechaLima(c.openedAt)}${estado}`;
}
/** Nombre de una cuenta de tesorería por id en la lista del panel. */
const cuentaVista = (cuentas, id) => {
  const c = cuentas?.find((x) => x && String(x.id) === String(id));
  return c ? `«${verificado(c.nombre ?? c.name)}»` : `${NO_VERIFICADO} (cuenta: no se pudo leer)`;
};

const VISTAS = {
  cajas: { ruta: "/api/cash-registers" },
  movimientos: { ruta: "/api/cash-registers/movements" },
  por_dia: { ruta: "/api/cash-registers/por-dia" },
  historial: { ruta: "/api/cash-registers/historial" },
  tesoreria: { ruta: "/api/treasury/resumen" },
};

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
export const herramientas = [
  {
    nombre: "caja_ver",
    grupo: "caja",
    tipo: "lectura",
    descripcion: "Consulta la caja. vista=cajas (cajas y su saldo en S/), movimientos (de una caja: cajaId), por_dia (resumen por día; dias), historial (cambios de caja) o tesoreria (cuentas y saldos en S/).",
    entrada: {
      negocio,
      vista: z.enum(["cajas", "movimientos", "por_dia", "historial", "tesoreria"]).default("cajas"),
      cajaId: z.string().max(60).optional().describe("Para vista=movimientos o historial"),
      dias: z.number().int().min(1).max(90).optional().describe("Para vista=por_dia"),
      limite: z.number().int().min(1).max(50).optional(),
      cursor: z.string().max(100).optional(),
    },
    pedido: (a) => {
      const v = a.vista ?? "cajas";
      const ruta = VISTAS[v].ruta;
      const query = v === "movimientos" ? limpiar({ cashRegisterId: a.cajaId, limit: a.limite })
        : v === "por_dia" ? limpiar({ dias: a.dias })
        : v === "historial" ? limpiar({ registerId: a.cajaId, limit: a.limite })
        : v === "cajas" ? limpiar({ limit: a.limite, cursor: a.cursor })
        : {};
      return { metodo: "GET", ruta, query };
    },
    formatear: (d, a) => lista(d, {
      titulo: `Caja (${a?.vista ?? "cajas"})`,
      cols: [["Caja", ["name", "nombre", "id"]], ["Estado", ["status", "estado"]], ["Saldo", ["balance", "saldo", "currentAmount", "amount", "monto"], "s"], ["Tipo", ["type", "tipo"]], ["Motivo", ["motivo", "descripcion"]], ["Fecha", ["createdAt", "date", "fecha"], "f"]],
    }),
  },
  {
    nombre: "caja_movimiento",
    grupo: "caja",
    tipo: "confirmar",
    descripcion: "Anota un ingreso o egreso de efectivo en una caja (POST /api/cash-registers/movements). Mueve plata: pide OK de Brandon. Monto en S/.",
    entrada: {
      negocio,
      cajaId: z.string().min(1).max(60),
      tipo: z.enum(["ingreso", "egreso"]),
      monto: z.number().positive().max(99999999).describe("S/"),
      motivo: z.string().max(200).optional(),
      descripcion: z.string().max(500).optional(),
    },
    pedido: (a) => ({ metodo: "POST", ruta: "/api/cash-registers/movements", cuerpo: limpiar({ cashRegisterId: a.cajaId, type: a.tipo, amount: a.monto, motivo: a.motivo, descripcion: a.descripcion }) }),
    previa: (a, leer) => (/^[\w-]{1,40}$/.test(a.cajaId) ? fichaPorId(leer, `/api/cash-registers/${a.cajaId}`) : Promise.resolve(undefined)),
    resumen: (a, previa) => `${a.tipo === "ingreso" ? "Ingresar" : "Sacar"} ${soles(a.monto)} ${a.tipo === "ingreso" ? "a" : "de"} ${cajaVista(previa)}${a.motivo ? ` por «${a.motivo}»` : ""}.`,
    ventana: (a, previa) => ({
      clave: claveMonto(a.monto, { etiqueta: a.tipo === "ingreso" ? "Monto que entra" : "Monto que sale" }),
      filas: [{ etiqueta: "Caja", valor: cajaVista(previa) }, ...(a.motivo ? [{ etiqueta: "Motivo", valor: a.motivo }] : [])],
    }),
  },
  {
    nombre: "tesoreria_movimiento",
    grupo: "caja",
    tipo: "confirmar",
    descripcion: "Anota un ingreso o egreso en una cuenta de tesorería (POST /api/treasury/movimientos). Mueve plata: pide OK de Brandon. Monto en S/.",
    entrada: {
      negocio,
      cuentaId: z.string().min(1).max(60),
      tipo: z.enum(["INGRESO", "EGRESO"]),
      monto: z.number().positive().max(99999999).describe("S/"),
      descripcion: z.string().max(500).optional(),
      categoria: z.string().max(100).optional(),
      referencia: z.string().max(200).optional(),
    },
    pedido: (a) => ({ metodo: "POST", ruta: "/api/treasury/movimientos", cuerpo: limpiar({ cuentaId: a.cuentaId, tipo: a.tipo, monto: a.monto, descripcion: a.descripcion, categoria: a.categoria, referencia: a.referencia }) }),
    previa: (_a, leer) => filasCompletas(leer, "/api/treasury/cuentas"),
    resumen: (a, previa) => `${a.tipo === "INGRESO" ? "Ingresar" : "Egresar"} ${soles(a.monto)} ${a.tipo === "INGRESO" ? "a" : "de"} la cuenta ${cuentaVista(/** @type {any} */ (previa), a.cuentaId)}${a.descripcion ? `: ${a.descripcion}` : ""}.`,
    ventana: (a, previa) => ({
      clave: claveMonto(a.monto, { etiqueta: a.tipo === "INGRESO" ? "Monto que entra" : "Monto que sale" }),
      filas: [{ etiqueta: "Cuenta", valor: cuentaVista(/** @type {any} */ (previa), a.cuentaId) }],
    }),
  },
  {
    nombre: "tesoreria_transferir",
    grupo: "caja",
    tipo: "confirmar",
    descripcion: "Transfiere plata entre dos cuentas de tesorería (POST /api/treasury/transferencias). Pide OK de Brandon. Monto en S/.",
    entrada: {
      negocio,
      origenId: z.string().min(1).max(60),
      destinoId: z.string().min(1).max(60),
      monto: z.number().positive().max(99999999).describe("S/"),
      descripcion: z.string().max(500).optional(),
    },
    pedido: (a) => ({ metodo: "POST", ruta: "/api/treasury/transferencias", cuerpo: limpiar({ origenId: a.origenId, destinoId: a.destinoId, monto: a.monto, descripcion: a.descripcion }) }),
    previa: (_a, leer) => filasCompletas(leer, "/api/treasury/cuentas"),
    resumen: (a, previa) => `Transferir ${soles(a.monto)} de la cuenta ${cuentaVista(/** @type {any} */ (previa), a.origenId)} a la cuenta ${cuentaVista(/** @type {any} */ (previa), a.destinoId)}${a.descripcion ? ` (${a.descripcion})` : ""}.`,
    ventana: (a, previa) => ({
      clave: claveMonto(a.monto, { etiqueta: "Monto a transferir" }),
      filas: [{ etiqueta: "Desde", valor: cuentaVista(/** @type {any} */ (previa), a.origenId) }, { etiqueta: "Hacia", valor: cuentaVista(/** @type {any} */ (previa), a.destinoId) }],
    }),
  },
  {
    nombre: "caja_cerrar_turno",
    grupo: "caja",
    tipo: "confirmar",
    descripcion: "Cierra la caja abierta y el turno de quien llama (POST /api/cash-registers/close-shift). Con montoContado hace arqueo (diferencia = contado − esperado, en S/); sin él cierra sin conteo. Pide OK de Brandon.",
    entrada: { negocio, montoContado: z.number().nonnegative().max(10000000).optional().describe("Efectivo contado en el cajón, S/"), notas: z.string().max(2000).optional() },
    pedido: (a) => ({ metodo: "POST", ruta: "/api/cash-registers/close-shift", cuerpo: limpiar({ closingAmount: a.montoContado, notes: a.notas }) }),
    previa: async (_a, leer) => {
      const r = await leer({ metodo: "GET", ruta: "/api/cierre-diario/preview" });
      return r.ok ? r.datos : null;
    },
    resumen: (a) => a.montoContado !== undefined
      ? `Cerrar la caja del turno contando ${soles(a.montoContado)} en el cajón (se guarda la diferencia con lo esperado).`
      : "Cerrar la caja del turno SIN conteo (queda como «Cerrada sin conteo»).",
    ventana: (a) => ({ clave: a.montoContado !== undefined ? claveMonto(a.montoContado, { etiqueta: "Efectivo contado" }) : null, filas: [] }),
  },
  {
    nombre: "cierre_diario",
    grupo: "caja",
    tipo: "confirmar",
    descripcion: "Hace el cierre diario del negocio (POST /api/cierre-diario) con el efectivo contado en las cajas abiertas, en S/. Pide OK de Brandon. Antes mira reporte_diario con vista=cierre_preview.",
    entrada: { negocio, efectivoContado: z.number().nonnegative().max(10000000).nullable().optional().describe("S/; null = saltar el conteo"), notas: z.string().max(2000).optional() },
    pedido: (a) => ({ metodo: "POST", ruta: "/api/cierre-diario", cuerpo: limpiar({ efectivoContado: a.efectivoContado, notas: a.notas }) }),
    previa: async (_a, leer) => {
      const r = await leer({ metodo: "GET", ruta: "/api/cierre-diario/preview" });
      return r.ok ? r.datos : null;
    },
    resumen: (a) => `Cerrar el día${a.efectivoContado != null ? ` con ${soles(a.efectivoContado)} contados en las cajas abiertas` : " sin contar el efectivo"}${a.notas ? ` · nota: ${a.notas}` : ""}.`,
    ventana: (a) => ({ clave: a.efectivoContado != null ? claveMonto(a.efectivoContado, { etiqueta: "Efectivo contado" }) : null, filas: [] }),
  },
];

// Grupo «rrhh»: colaboradores, asistencia y pago semanal. Pagar y marcar asistencia piden OK (29-10).
// El servidor tapa DNI, celulares y sueldos de todo lo que vuelve de este grupo (src/tapar.mjs).
import { z, negocio, idRuta, dia, limpiar, lista, ficha, soles, claveMonto, claveNombre, fichaPorId, filaIdentidad, filasCompletas, otrosNombres, verificado } from "../util-herramientas.mjs";

/** Nombre del colaborador por id en la lista del panel + otros nombres (señuelos). */
async function colaboradorDeLista(id, leer) {
  const filas = await filasCompletas(leer, "/api/rrhh/colaboradores", { incluirCesados: "1" });
  const f = filas?.find((x) => x && String(x.id) === String(id));
  return { nombre: f?.nombre, ficha: f, otros: otrosNombres(filas, id) };
}

const ESTADOS = ["PRESENTE", "TARDANZA", "MEDIO_DIA", "FALTA", "PERMISO", "DESCANSO", "VACACIONES", "LICENCIA"];

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
export const herramientas = [
  {
    nombre: "rrhh_ver",
    grupo: "rrhh",
    tipo: "lectura",
    descripcion: "Consulta RRHH. vista=resumen, colaboradores (q, estado, incluirCesados), asistencia (desde/hasta, máx. 62 días) o pago_semana (semana = lunes AAAA-MM-DD; montos en S/).",
    entrada: {
      negocio,
      vista: z.enum(["resumen", "colaboradores", "asistencia", "pago_semana"]).default("resumen"),
      q: z.string().max(100).optional(),
      estado: z.string().max(40).optional(),
      incluirCesados: z.boolean().optional(),
      desde: dia.optional(),
      hasta: dia.optional(),
      semana: dia.optional().describe("Lunes de la semana, solo pago_semana"),
    },
    pedido: (a) => {
      const v = a.vista ?? "resumen";
      if (v === "colaboradores") return { metodo: "GET", ruta: "/api/rrhh/colaboradores", query: limpiar({ q: a.q, estado: a.estado, incluirCesados: a.incluirCesados ? "1" : undefined }) };
      if (v === "asistencia") return { metodo: "GET", ruta: "/api/rrhh/asistencia", query: limpiar({ desde: a.desde, hasta: a.hasta }) };
      if (v === "pago_semana") return { metodo: "GET", ruta: "/api/rrhh/pago-semana", query: limpiar({ semana: a.semana }) };
      return { metodo: "GET", ruta: "/api/rrhh/resumen" };
    },
    formatear: (d, a) => lista(d, { titulo: `RRHH (${a?.vista ?? "resumen"})`, cols: [["Nombre", ["nombre", "name", "colaborador"]], ["Puesto", ["puesto", "puestoNombre"]], ["Estado", ["estado", "status"]], ["Neto", ["neto", "netoSemana", "monto"], "s"], ["Horas", ["horas"], "n"]], vacio: "Sin filas (la respuesta puede ser un resumen: pídelo de nuevo con leer_get si hace falta)." }),
  },
  {
    nombre: "asistencia_marcar",
    grupo: "rrhh",
    tipo: "confirmar",
    descripcion: "Marca asistencia de un colaborador en un día (PUT /api/rrhh/asistencia). estado=null quita la marca. Corregir una marca ya hecha exige un motivo real. La asistencia define el pago: pide OK de Brandon.",
    entrada: {
      negocio,
      colaboradorId: z.string().min(1).max(40),
      fecha: dia,
      estado: z.enum(/** @type {[string, ...string[]]} */ (ESTADOS)).nullable(),
      entrada: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().describe("HH:MM"),
      salida: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().describe("HH:MM"),
      horas: z.number().positive().max(24).optional(),
      nota: z.string().max(300).optional(),
      motivo: z.string().max(300).optional().describe("Obligatorio si corriges una marca existente"),
    },
    pedido: (a) => ({
      metodo: "PUT",
      ruta: "/api/rrhh/asistencia",
      cuerpo: limpiar({ marcas: [limpiar({ colaboradorId: a.colaboradorId, fecha: a.fecha, estado: a.estado, entrada: a.entrada, salida: a.salida, horas: a.horas, nota: a.nota })].map((m) => ({ ...m, estado: a.estado })), motivo: a.motivo }),
    }),
    previa: (a, leer) => colaboradorDeLista(a.colaboradorId, leer),
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const horario = [a.entrada && `entra ${a.entrada}`, a.salida && `sale ${a.salida}`, a.horas && `${a.horas} h`].filter(Boolean).join(", ");
      const que = a.estado ? `Marcar ${a.estado.replace("_", " ").toLowerCase()}` : "Quitar la marca de asistencia";
      return `${que} a ${verificado(p?.nombre)} el ${a.fecha}${horario ? ` (${horario})` : ""}.${a.motivo ? ` Motivo: ${a.motivo}.` : ""} Cambia lo que se le paga esa semana.`;
    },
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return {
        clave: p?.nombre ? claveNombre(p.nombre, p.otros, { etiqueta: "Colaborador" }) : null,
        filas: [filaIdentidad(p?.ficha), { etiqueta: "Día", valor: a.fecha }, { etiqueta: "Marca", valor: a.estado ? a.estado.replace("_", " ").toLowerCase() : "quitar la marca" }],
      };
    },
  },
  {
    nombre: "pago_semana_pagar",
    grupo: "rrhh",
    tipo: "confirmar",
    descripcion: "Paga la semana a un colaborador (POST /api/rrhh/pago-semana). Si saleDeCaja, el efectivo sale de la caja. Si el neto del servidor difiere de netoEsperado, responde 409 con los números nuevos. Montos en S/. Pide OK de Brandon.",
    entrada: {
      negocio,
      colaboradorId: idRuta.describe("Id del colaborador: el nombre del aviso lo saca el panel"),
      desde: dia.describe("Lunes de la semana que se paga"),
      netoEsperado: z.number().min(0).max(1000000).describe("S/ que se ve en pantalla"),
      metodo: z.enum(["efectivo", "yape", "plin", "transferencia"]),
      saleDeCaja: z.boolean(),
      montoManual: z.number().positive().max(1000000).nullable().optional().describe("S/, solo si no tiene tarifa"),
    },
    pedido: (a) => ({ metodo: "POST", ruta: "/api/rrhh/pago-semana", cuerpo: limpiar({ colaboradorId: a.colaboradorId, desde: a.desde, montoManual: a.montoManual, metodo: a.metodo, saleDeCaja: a.saleDeCaja, netoEsperado: a.netoEsperado }) }),
    previa: async (a, leer) => {
      const f = /** @type {any} */ (await fichaPorId(leer, `/api/rrhh/colaboradores/${a.colaboradorId}`));
      const c = f?.colaborador ?? f;
      return { nombre: c?.nombre, ficha: c };
    },
    resumen: (a, previa) => `Pagar ${soles(a.netoEsperado)} a ${verificado(/** @type {any} */ (previa)?.nombre)} por la semana del ${a.desde}, en ${a.metodo}${a.saleDeCaja ? " (sale de la caja)" : ""}.`,
    ventana: (a, previa) => ({
      clave: claveMonto(a.netoEsperado, { etiqueta: "Monto a pagar" }),
      filas: [{ etiqueta: "A quién", valor: verificado(/** @type {any} */ (previa)?.nombre) }, filaIdentidad(/** @type {any} */ (previa)?.ficha), { etiqueta: "Semana del", valor: a.desde }, { etiqueta: "Caja", valor: a.saleDeCaja ? `sale en ${a.metodo}` : "no se toca" }],
    }),
  },
];

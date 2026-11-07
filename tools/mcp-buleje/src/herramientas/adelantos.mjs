// Grupo «adelantos»: plata dada o recibida por adelantado. Dar y anular pide OK.
import { z, negocio, idRuta, limpiar, lista, ficha, soles, numero, filasDe, claveMonto, fichaPorId, filaIdentidad, filasCompletas, leerSeguro, otrosNombres, verificado } from "../util-herramientas.mjs";

const MODALIDAD = { CUENTA_CORRIENTE: "cuenta corriente", ENTREGAS_PACTADAS: "entregas pactadas", DESCUENTO_PLANILLA: "descuento por planilla" };

const METODOS = ["efectivo", "yape", "plin", "tarjeta", "transferencia"];

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
export const herramientas = [
  {
    nombre: "adelantos_ver",
    grupo: "adelantos",
    tipo: "lectura",
    descripcion: "Consulta adelantos. vista=lista (GET /api/adelantos; filtra por estado, beneficiario, modalidad, dirección DADO|RECIBIDO, texto), resumen, cuentas (saldo por persona) o analisis. Montos en S/.",
    entrada: {
      negocio,
      vista: z.enum(["lista", "resumen", "cuentas", "analisis"]).default("lista"),
      estado: z.enum(["ABIERTO", "LIQUIDADO", "EXCEDIDO", "CANCELADO"]).optional(),
      beneficiarioId: z.string().max(40).optional(),
      modalidad: z.enum(["CUENTA_CORRIENTE", "ENTREGAS_PACTADAS", "DESCUENTO_PLANILLA"]).optional(),
      direccion: z.enum(["DADO", "RECIBIDO", "todas"]).optional(),
      buscar: z.string().max(120).optional(),
    },
    pedido: (a) => {
      const v = a.vista ?? "lista";
      if (v === "resumen") return { metodo: "GET", ruta: "/api/adelantos/resumen" };
      if (v === "cuentas") return { metodo: "GET", ruta: "/api/adelantos/cuentas" };
      if (v === "analisis") return { metodo: "GET", ruta: "/api/adelantos/analisis" };
      return { metodo: "GET", ruta: "/api/adelantos", query: limpiar({ status: a.estado, beneficiarioId: a.beneficiarioId, modalidad: a.modalidad, direccion: a.direccion, search: a.buscar }) };
    },
    formatear: (d, a) => (a?.vista ?? "lista") === "lista"
      ? lista(d, { titulo: "Adelantos", cols: [["N.º", ["codigo", "numero", "id"]], ["Persona", ["beneficiarioNombre", "beneficiario.nombre", "nombre"]], ["Monto", ["montoAdelantado", "monto"], "s"], ["Saldo", ["saldo", "saldoPendiente"], "s"], ["Estado", ["status", "estado"]], ["Dirección", ["direccion"]], ["Fecha", ["fechaAdelanto", "createdAt"], "f"]] })
      : (d && typeof d === "object" ? JSON.stringify(d, null, 1).slice(0, 3500) : "Sin datos."),
  },
  {
    nombre: "adelanto_dar",
    grupo: "adelantos",
    tipo: "confirmar",
    descripcion: "Da un adelanto de plata a una persona (POST /api/adelantos). Si sale de la caja, indica metodoCaja. Monto en S/. Mueve plata: pide OK de Brandon.",
    entrada: {
      negocio,
      beneficiarioId: z.string().min(1).max(40).describe("Id de la persona: el nombre del aviso lo saca el panel"),
      monto: z.number().positive().max(9999999999).describe("S/"),
      modalidad: z.enum(["CUENTA_CORRIENTE", "ENTREGAS_PACTADAS", "DESCUENTO_PLANILLA"]).optional(),
      direccion: z.enum(["DADO", "RECIBIDO"]).optional(),
      conceptoRecibido: z.enum(["SERVICIO", "PRESTAMO"]).nullable().optional(),
      metodoCaja: z.enum(/** @type {[string, ...string[]]} */ (METODOS)).nullable().optional().describe("Si sale/entra de la caja, por qué medio"),
      fechaAdelanto: z.string().max(40).optional(),
      fechaVencimiento: z.string().max(40).nullable().optional(),
      notas: z.string().max(1000).optional(),
      reciboManual: z.string().max(60).optional(),
      piesTablares: z.number().positive().max(9999999).optional().describe("PT, si el adelanto es contra madera"),
      piesTablaresTipo: z.enum(["COMPRADO", "VENDIDO", "SERVICIO"]).optional(),
      claveUnica: z.string().min(8).max(100).optional(),
    },
    pedido: (a) => ({
      metodo: "POST",
      ruta: "/api/adelantos",
      cuerpo: limpiar({
        beneficiarioId: a.beneficiarioId, modalidad: a.modalidad, montoAdelantado: a.monto, fechaAdelanto: a.fechaAdelanto, fechaVencimiento: a.fechaVencimiento,
        notas: a.notas, reciboManual: a.reciboManual, piesTablares: a.piesTablares, piesTablaresTipo: a.piesTablaresTipo, direccion: a.direccion,
        conceptoRecibido: a.conceptoRecibido, metodoCaja: a.metodoCaja, idempotencyKey: a.claveUnica,
      }),
    }),
    // El nombre sale de la lista de personas del panel buscando el id (hallazgo 3): nunca de lo que escribe Claude.
    previa: async (a, leer) => {
      const [personas, abiertos] = await Promise.all([
        filasCompletas(leer, "/api/adelantos/beneficiarios"),
        leerSeguro(leer, "/api/adelantos", { beneficiarioId: a.beneficiarioId, status: "ABIERTO" }),
      ]);
      const persona = personas?.find((x) => x && String(x.id) === String(a.beneficiarioId));
      return { nombre: persona?.nombre, persona, otros: otrosNombres(personas, a.beneficiarioId), abiertos: abiertos.ok ? filasDe(abiertos.datos).length : null };
    },
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const nombre = verificado(p?.nombre);
      const medio = a.metodoCaja ? ` en ${a.metodoCaja}` : " (no sale de la caja)";
      const modo = ` Modalidad: ${MODALIDAD[a.modalidad ?? "CUENTA_CORRIENTE"] ?? a.modalidad}.`;
      const pt = a.piesTablares ? ` Contra madera: ${numero(a.piesTablares, 0)} PT${a.piesTablaresTipo ? ` (${a.piesTablaresTipo.toLowerCase()})` : ""}.` : "";
      const prev = p?.abiertos ? ` Ya tiene ${p.abiertos} adelanto(s) abierto(s).` : "";
      return a.direccion === "RECIBIDO"
        ? `Anotar un adelanto RECIBIDO de ${soles(a.monto)} de ${nombre}${medio}.${modo}${pt}${prev}`
        : `Dar adelanto de ${soles(a.monto)} a ${nombre}${medio}.${modo}${pt}${prev}`;
    },
    ventana: (a, previa) => ({
      clave: claveMonto(a.monto, { etiqueta: a.direccion === "RECIBIDO" ? "Monto recibido" : "Monto del adelanto" }),
      filas: [
        { etiqueta: a.direccion === "RECIBIDO" ? "De quién" : "A quién", valor: verificado(/** @type {any} */ (previa)?.nombre) },
        filaIdentidad(/** @type {any} */ (previa)?.persona),
        { etiqueta: "Modalidad", valor: `${MODALIDAD[a.modalidad ?? "CUENTA_CORRIENTE"] ?? String(a.modalidad)}${a.piesTablares ? ` · ${numero(a.piesTablares, 0)} PT` : ""}` },
        { etiqueta: "Caja", valor: a.metodoCaja ? `sale en ${a.metodoCaja}` : "no se toca" },
      ],
    }),
  },
  {
    nombre: "adelanto_anular",
    grupo: "adelantos",
    tipo: "confirmar",
    descripcion: "Anula un adelanto (PATCH /api/adelantos/[id] con cancelar). Con devolucionCaja, la plata vuelve a la caja por ese medio; sin él, la caja no se toca. Pide OK de Brandon.",
    entrada: {
      negocio,
      id: idRuta,
      devolucionCaja: z.enum(/** @type {[string, ...string[]]} */ (METODOS)).nullable().optional().describe("Solo si el efectivo nunca salió y debe volver a la caja"),
      notas: z.string().max(1000).nullable().optional(),
    },
    pedido: (a) => ({ metodo: "PATCH", ruta: `/api/adelantos/${a.id}`, cuerpo: limpiar({ cancelar: true, devolucionCaja: a.devolucionCaja, notas: a.notas }) }),
    previa: (a, leer) => fichaPorId(leer, `/api/adelantos/${a.id}`),
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const monto = p?.montoAdelantado !== undefined ? ` de ${soles(Number(p.montoAdelantado))}` : " (monto: no se pudo leer)";
      const codigo = p?.codigoOperacion ?? p?.codigo ?? a.id;
      return `Anular el adelanto ${codigo}${monto} de ${verificado(p?.beneficiarioNombre ?? p?.beneficiario?.nombre)}. ${a.devolucionCaja ? `La plata vuelve a la caja (${a.devolucionCaja}).` : "La caja NO se toca."}`;
    },
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return {
        clave: p?.montoAdelantado !== undefined ? claveMonto(Number(p.montoAdelantado), { etiqueta: "Monto del adelanto a anular" }) : null,
        filas: [{ etiqueta: "De quién", valor: verificado(p?.beneficiarioNombre ?? p?.beneficiario?.nombre) }, filaIdentidad(p ? p.beneficiario ?? {} : undefined), { etiqueta: "Caja", valor: a.devolucionCaja ? `vuelve en ${a.devolucionCaja}` : "no se toca" }],
      };
    },
  },
  {
    nombre: "adelanto_nota",
    grupo: "adelantos",
    tipo: "escritura",
    descripcion: "Cambia las notas de un adelanto (PATCH /api/adelantos/[id]). No mueve plata. Mandar notas null las borra.",
    entrada: { negocio, id: idRuta, notas: z.string().max(1000).nullable() },
    pedido: (a) => ({ metodo: "PATCH", ruta: `/api/adelantos/${a.id}`, cuerpo: { notas: a.notas } }),
  },
];

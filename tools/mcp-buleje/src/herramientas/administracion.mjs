// Grupo «administracion»: trámites (banco, SUNAT, SUNARP…) y alquileres con su pago mes a mes (ADR-524, 30-10).
// Los trámites son los del panel de Administración (/api/admin/tramites), NO los oficios forestales de directorio.mjs
// (tramites_ver/tramite_guardar del Libro CTP): por eso estos se llaman tramites_admin_*.
// Plata de alquileres (renta, garantía, CCI, pagos) y la clave de la ventana salen del PANEL/args, y piden OK.
import { z, negocio, idRuta, dia, limpiar, lista, ficha, numero, celda, claveCantidad, claveMonto, claveNombre, fichaPorId, filasDe, verificado, linea60, conMarca, colaDe4, antesDelPanel } from "../util-herramientas.mjs";

const ENTIDADES = ["banco", "sunat", "sunarp", "municipalidad", "notaria", "reniec", "otra"];
const ESTADOS_TRAMITE = ["preparando", "enviado", "observado", "aprobado", "rechazado", "cerrado", "desistido"];
const ESTADOS_REQUISITO = ["hay", "falta", "no_aplica"];
const CANALES = ["presencial", "correo", "web", "whatsapp", "otro"];
const ESTADOS_ALQUILER = ["negociacion", "vigente", "terminado"];
const PAPELES = ["arrendador", "inquilino", "gestor"];
const MEDIOS = ["transferencia", "deposito", "efectivo", "yape", "plin", "cheque", "otro"];
const enumDe = (v) => z.enum(/** @type {[string, ...string[]]} */ (v));
const txt = (max) => z.string().max(max).nullable().optional();
const diaNull = dia.nullable().optional();
const num = (max = 1e8) => z.number().min(0).max(max);
const NO_CLAVES = " NUNCA claves, contraseñas ni PIN en ningún campo (el panel lo rechaza).";

/** Cuerpo de un PATCH: solo las claves que vinieron; null SÍ viaja (= borrar), por eso no se usa limpiar(). */
const soloLoQueVino = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

const monedaTxt = (m, moneda) => (moneda === "USD" ? `USD ${numero(m, 2)}` : `S/ ${numero(m, 2)}`);
/** Clave del monto: en soles con claveMonto; en dólares con la cantidad (claveMonto diría «S/»). */
const claveDeMonto = (m, moneda, etiqueta) => (Number.isFinite(Number(m)) && Number(m) > 0 ? (moneda === "USD" ? claveCantidad(Number(m), { etiqueta, unidad: "USD" }) : claveMonto(Number(m), { etiqueta })) : null);

/** Clave = últimos 4 dígitos de la CCI nueva (señuelos: otros 4 dígitos). Si la CCI no tiene 4 dígitos, null. */
function claveCci(cci) {
  const d = String(cci).replace(/\D/g, "");
  if (d.length < 4) return null;
  const u = Number(d.slice(-4));
  const f = (n) => `…${String(((n % 10000) + 10000) % 10000).padStart(4, "0")}`;
  const valor = f(u);
  const senuelos = [u + 1111, u + 3737, u + 5050].map(f).filter((x) => x !== valor).slice(0, 2);
  return senuelos.length === 2 ? { etiqueta: "Últimos 4 dígitos del CCI nuevo", valor, senuelos, palabra: "número" } : null;
}

/** Marca de la previa: no se pudo leer el alquiler, así que no hay moneda confirmada. El pedido queda vacío y el servidor no propone. */
const SIN_MONEDA = Object.freeze({ sinMoneda: true });
const MSG_SIN_MONEDA = "No se propone nada: moneda sin confirmar (no pude leer el alquiler en el panel). Reintenta en un momento.";

const CAMPOS_ALQUILER = {
  nombre: z.string().min(2).max(160).optional().describe("Obligatorio al crear. Ej.: «Local Constitución — Agrobanco»"),
  direccion: txt(250),
  partidaSunarp: txt(40),
  manzana: txt(20),
  lote: txt(20),
  areaM2: num(1e7).nullable().optional(),
  ubigeo: txt(6),
  duenoParteId: idRuta.nullable().optional().describe("Id de la parte (directorio) dueña; o duenoTexto"),
  duenoTexto: txt(160),
  inquilinoParteId: idRuta.nullable().optional(),
  inquilinoTexto: txt(160),
  nuestroPapel: enumDe(PAPELES).nullable().optional(),
  rentaMensual: num().optional().describe("Obligatorio al crear. Monto mensual en la moneda del contrato"),
  moneda: enumDe(["PEN", "USD"]).optional(),
  incluyeImpuestos: z.boolean().nullable().optional(),
  diaPago: z.number().int().min(1).max(31).nullable().optional(),
  garantiaMonto: num().nullable().optional(),
  garantiaPagada: z.boolean().nullable().optional(),
  garantiaPagadaEl: diaNull,
  garantiaDevueltaEl: diaNull,
  inicioEl: dia.optional().describe("Obligatorio al crear (AAAA-MM-DD)"),
  finEl: diaNull,
  renovacionAutomatica: z.boolean().optional(),
  avisoNoRenovarDias: z.number().int().min(0).max(365).nullable().optional(),
  reajuste: txt(200),
  contratoDocumentId: idRuta.nullable().optional().describe("Id del contrato en el drive"),
  cuentaBanco: txt(80),
  cuentaCci: txt(30).describe("CCI donde se paga (20 dígitos)"),
  cuentaTitular: txt(160),
  estado: enumDe(ESTADOS_ALQUILER).optional(),
  notas: txt(1000),
};
const PLATA_ALQUILER = ["rentaMensual", "moneda", "garantiaMonto", "garantiaPagada", "garantiaPagadaEl", "garantiaDevueltaEl", "cuentaBanco", "cuentaCci", "cuentaTitular", "diaPago", "incluyeImpuestos"];

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
export const herramientas = [
  {
    nombre: "tramites_admin_ver",
    grupo: "administracion",
    tipo: "lectura",
    descripcion: "Trámites de Administración ante banco, SUNAT, SUNARP, municipalidad, notaría o RENIEC (GET /api/admin/tramites[/id]): asunto, estado, fechas, próximo paso y requisitos (hay/falta/no aplica) con documentos enlazados. Sin id lista (filtros: estado, entidad, parteId, alquilerId, q, vencenEnDias); con id trae uno con sus requisitos. No son los oficios forestales (esos: tramites_ver). Ej.: estado=\"observado\".",
    entrada: {
      negocio,
      id: idRuta.optional().describe("Un trámite con todos sus requisitos"),
      estado: enumDe(ESTADOS_TRAMITE).optional(),
      entidad: enumDe(ENTIDADES).optional(),
      parteId: idRuta.optional(),
      alquilerId: idRuta.optional(),
      q: z.string().max(80).optional(),
      vencenEnDias: z.number().int().min(1).max(365).optional().describe("Solo los que vencen en N días"),
    },
    pedido: (a) => (a.id
      ? { metodo: "GET", ruta: `/api/admin/tramites/${a.id}` }
      : { metodo: "GET", ruta: "/api/admin/tramites", query: limpiar({ estado: a.estado, entidad: a.entidad, parteId: a.parteId, alquilerId: a.alquilerId, q: a.q, vencen: a.vencenEnDias }) }),
    formatear: (d, a) => {
      const t = /** @type {any} */ (d)?.tramite;
      if (a?.id && t) {
        const reqs = (Array.isArray(t.requisitos) ? t.requisitos : []).map((r) => `- [${r.estado}] ${r.nombre}${r.documentoNombre ? ` · doc: ${r.documentoNombre}` : ""}${r.nota ? ` · ${r.nota}` : ""} (id ${r.id})`);
        const c = t.conteo ?? {};
        return [ficha(t, { titulo: `Trámite ${t.asunto ?? ""}`.trim(), campos: [["Entidad", ["entidadNombre", "entidad"]], ["Estado", ["estado"]], ["Persona", ["parteNombre", "personaNombre"]], ["Iniciado", ["iniciadoEl"], "f"], ["Enviado", ["enviadoEl"], "f"], ["Vence", ["venceEl"], "f"], ["Próximo paso", ["proximoPaso"]], ["Para el", ["proximoPasoEl"], "f"], ["Canal", ["canal"]], ["Contacto", ["contacto"]], ["Notas", ["notas"]], ["Id", ["id"]]] }), `Requisitos: ${c.hay ?? 0} hay · ${c.falta ?? 0} falta · ${c.noAplica ?? 0} no aplica`, ...reqs].join("\n");
      }
      return lista(filasDe(d).map((t) => ({ ...t, faltan: t?.conteo?.falta })), { titulo: "Trámites", cols: [["Asunto", ["asunto"]], ["Entidad", ["entidadNombre", "entidad"]], ["Estado", ["estado"]], ["Vence", ["venceEl"], "f"], ["Próximo", ["proximoPaso"]], ["Faltan", ["faltan"]], ["Id", ["id"]]] });
    },
  },
  {
    nombre: "tramite_admin_guardar",
    grupo: "administracion",
    tipo: "escritura",
    descripcion: "Crea o corrige un trámite de Administración (POST /api/admin/tramites, o PATCH /tramites/{id} si pasas id). Con id SOLO se mandan los campos que pasaste: lo que no mandes no se toca; null = borrar. Al crear, `plantilla` siembra los requisitos (alquiler_banco, sunat_reactivar_ruc, dni_renovar) y `requisitos` agrega los tuyos; los requisitos de uno existente se cambian con tramite_admin_requisitos. Fechas AAAA-MM-DD." + NO_CLAVES + " Ej.: entidad=\"banco\", entidadNombre=\"Agrobanco\", asunto=\"Alquiler del local\", plantilla=\"alquiler_banco\".",
    entrada: {
      negocio,
      id: idRuta.optional().describe("Con id corrige (PATCH parcial); sin id crea"),
      entidad: enumDe(ENTIDADES).optional().describe("Obligatorio al crear"),
      entidadNombre: txt(120).describe("Nombre de la entidad: «Agrobanco», «Municipalidad de Constitución»"),
      asunto: z.string().min(2).max(200).optional().describe("Obligatorio al crear"),
      parteId: idRuta.nullable().optional().describe("Persona del directorio a la que pertenece"),
      alquilerId: idRuta.nullable().optional(),
      estado: enumDe(ESTADOS_TRAMITE).optional(),
      iniciadoEl: diaNull,
      enviadoEl: diaNull,
      venceEl: diaNull,
      proximoPaso: txt(200),
      proximoPasoEl: diaNull,
      canal: enumDe(CANALES).nullable().optional(),
      contacto: txt(200),
      notas: txt(1000),
      plantilla: z.string().max(60).optional().describe("Solo al crear: siembra los requisitos (alquiler_banco, sunat_reactivar_ruc, dni_renovar)"),
      requisitos: z.array(z.object({ nombre: z.string().min(2).max(160), estado: enumDe(ESTADOS_REQUISITO).optional(), documentId: idRuta.optional(), nota: z.string().max(300).optional() })).max(40).optional().describe("Solo al crear"),
    },
    pedido: (a) => {
      const { negocio: _n, seco: _s, id, plantilla, requisitos, ...resto } = a;
      if (id) return { metodo: "PATCH", ruta: `/api/admin/tramites/${id}`, cuerpo: soloLoQueVino(resto) };
      return { metodo: "POST", ruta: "/api/admin/tramites", cuerpo: limpiar({ ...resto, plantilla, requisitos }) };
    },
    formatear: (d) => {
      const t = /** @type {any} */ (d)?.tramite;
      return t ? `Trámite guardado: «${linea60(t.asunto)}» · estado ${t.estado} · id ${t.id}` : "Trámite guardado.";
    },
  },
  {
    nombre: "tramite_admin_requisitos",
    grupo: "administracion",
    tipo: "escritura",
    descripcion: "Cambia los requisitos de un trámite de Administración (PATCH /api/admin/tramites/{id}/requisitos) en una sola operación: agregar [{nombre, estado?, documentId?, nota?}], cambiar [{id, estado?, documentId?|null, nota?, nombre?, orden?}] (el id sale de tramites_admin_ver con id) y quitar [id]. estado = hay | falta | no_aplica; documentId enlaza un documento del drive. Lo que no listes no se toca." + NO_CLAVES + " Ej.: cambiar=[{id:\"r1\", estado:\"hay\", documentId:\"d9\"}].",
    entrada: {
      negocio,
      id: idRuta.describe("Id del trámite"),
      agregar: z.array(z.object({ nombre: z.string().min(2).max(160), estado: enumDe(ESTADOS_REQUISITO).optional(), documentId: idRuta.optional(), nota: z.string().max(300).optional() })).max(40).optional(),
      cambiar: z.array(z.object({ id: idRuta, estado: enumDe(ESTADOS_REQUISITO).optional(), documentId: idRuta.nullable().optional(), nota: z.string().max(300).nullable().optional(), nombre: z.string().min(2).max(160).optional(), orden: z.number().int().min(0).max(999).optional() })).max(40).optional(),
      quitar: z.array(idRuta).max(40).optional(),
    },
    pedido: (a) => ({ metodo: "PATCH", ruta: `/api/admin/tramites/${a.id}/requisitos`, cuerpo: soloLoQueVino({ agregar: a.agregar, cambiar: a.cambiar, quitar: a.quitar }) }),
    formatear: (d) => {
      const t = /** @type {any} */ (d)?.tramite;
      const c = t?.conteo;
      return t ? `Requisitos de «${linea60(t.asunto)}»: ${c?.hay ?? 0} hay · ${c?.falta ?? 0} falta · ${c?.noAplica ?? 0} no aplica.` : "Requisitos actualizados.";
    },
  },
  {
    nombre: "alquileres_ver",
    grupo: "administracion",
    tipo: "lectura",
    descripcion: "Alquileres de locales (GET /api/admin/alquileres[/id]): inmueble, dueño, inquilino, renta mensual (con moneda), garantía, plazo, CCI y el RESUMEN calculado por el panel: meses pagados, total pagado, meses atrasados, deuda, próximo vencimiento y alertas (pago atrasado, fin cerca, aviso de no renovar). Con id incluye los pagos mes a mes. Filtros: estado, duenoParteId. Ej.: estado=\"vigente\".",
    entrada: {
      negocio,
      id: idRuta.optional().describe("Un alquiler con sus pagos"),
      estado: enumDe(ESTADOS_ALQUILER).optional(),
      duenoParteId: idRuta.optional(),
    },
    pedido: (a) => (a.id ? { metodo: "GET", ruta: `/api/admin/alquileres/${a.id}` } : { metodo: "GET", ruta: "/api/admin/alquileres", query: limpiar({ estado: a.estado, duenoParteId: a.duenoParteId }) }),
    formatear: (d, a) => {
      const resumenTxt = (x) => {
        const r = x?.resumen;
        if (!r) return "";
        const m = x.moneda;
        const alertas = (Array.isArray(r.alertas) ? r.alertas : []).map((al) => `⚠ ${al.texto}`);
        return [`Pagados ${r.periodosPagados ?? 0}${r.periodosDelPlazo != null ? ` de ${r.periodosDelPlazo}` : ""} · total ${monedaTxt(r.totalPagado ?? 0, m)}`,
          `Atrasados: ${(r.periodosAtrasados ?? []).length ? r.periodosAtrasados.join(", ") : "ninguno"} · deuda ${monedaTxt(r.deudaAtrasada ?? 0, m)}`,
          `Próximo: ${r.proximoPeriodo ?? "—"}${r.proximoVenceEl ? ` (vence ${celda(r.proximoVenceEl, "f")})` : ""}${r.diasParaFin != null ? ` · faltan ${r.diasParaFin} días para el fin` : ""}`,
          ...alertas].join("\n");
      };
      const unico = (x) => `${x.nombre ?? "Alquiler"} [${x.estado ?? "—"}] · renta ${monedaTxt(x.rentaMensual ?? 0, x.moneda)}${x.diaPago ? ` · día ${x.diaPago}` : ""} · ${celda(x.inicioEl, "f")} → ${celda(x.finEl, "f")} · dueño ${x.duenoNombre ?? x.duenoTexto ?? "—"} · inquilino ${x.inquilinoNombre ?? x.inquilinoTexto ?? "—"} · id ${x.id}`;
      const alq = /** @type {any} */ (d)?.alquiler;
      if (a?.id && alq) {
        const pagos = (Array.isArray(alq.pagos) ? alq.pagos : []).map((p) => `- ${p.periodo}: ${monedaTxt(p.monto, alq.moneda)} el ${celda(p.pagadoEl, "f")} (${p.medio}${p.numeroOperacion ? ` · op. ${p.numeroOperacion}` : ""})`);
        const gar = alq.garantiaMonto != null ? `Garantía ${monedaTxt(alq.garantiaMonto, alq.moneda)} · ${alq.garantiaPagada ? "pagada" : "sin pagar"}` : "";
        return [unico(alq), gar, alq.cuentaCci ? `CCI ${alq.cuentaCci}${alq.cuentaBanco ? ` (${alq.cuentaBanco})` : ""}` : "", resumenTxt(alq), pagos.length ? `Pagos (${pagos.length}):` : "Sin pagos registrados.", ...pagos].filter(Boolean).join("\n");
      }
      const filas = filasDe(d);
      if (!filas.length) return "Alquileres: sin resultados.";
      return [`Alquileres (${filas.length}):`, ...filas.map((x) => `- ${unico(x)}\n  ${resumenTxt(x).split("\n").join("\n  ")}`)].join("\n");
    },
  },
  {
    nombre: "alquiler_guardar",
    grupo: "administracion",
    tipo: "confirmar",
    descripcion: "Crea o corrige un alquiler (POST /api/admin/alquileres, o PATCH /alquileres/{id} si pasas id). Con id SOLO se mandan los campos que pasaste: lo que no mandes no se toca; null = borrar. Al crear: nombre, rentaMensual e inicioEl son obligatorios. Renta, garantía y CCI son plata: pide OK de Brandon. Montos en la moneda del contrato (moneda PEN o USD); fechas AAAA-MM-DD." + NO_CLAVES + " Ej.: nombre=\"Local Constitución\", rentaMensual=1500, moneda=\"PEN\", inicioEl=\"2026-11-01\", diaPago=5.",
    entrada: { negocio, id: idRuta.optional().describe("Con id corrige (PATCH parcial); sin id crea"), ...CAMPOS_ALQUILER },
    pedido: (a, previa) => {
      if (/** @type {any} */ (previa)?.sinMoneda) return [];
      const { negocio: _n, seco: _s, id, ...resto } = a;
      if (id) return { metodo: "PATCH", ruta: `/api/admin/alquileres/${id}`, cuerpo: soloLoQueVino(resto) };
      return { metodo: "POST", ruta: "/api/admin/alquileres", cuerpo: limpiar(resto) };
    },
    previa: async (a, leer) => {
      if (!a.id) return null;
      const f = await fichaPorId(leer, `/api/admin/alquileres/${a.id}`, "alquiler");
      // Sin la ficha no hay moneda ni «antes»: no se propone (nunca se asume PEN).
      if (!f && !a.moneda) return SIN_MONEDA;
      return f ?? null;
    },
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      if (p?.sinMoneda) return MSG_SIN_MONEDA;
      const moneda = a.moneda ?? p?.moneda ?? "PEN";
      const cambios = [];
      if (a.rentaMensual !== undefined) cambios.push(`renta ${a.id ? `${antesDelPanel(p, p?.rentaMensual, (v) => monedaTxt(v, p?.moneda))} → ` : ""}${monedaTxt(a.rentaMensual, moneda)}`);
      if (a.garantiaMonto !== undefined) cambios.push(`garantía ${a.garantiaMonto === null ? "se BORRA" : monedaTxt(a.garantiaMonto, moneda)}`);
      if (a.cuentaCci !== undefined) cambios.push(`CCI ${a.id ? `${antesDelPanel(p, p?.cuentaCci, colaDe4)} → ` : ""}${a.cuentaCci === null ? "se BORRA" : a.rentaMensual !== undefined ? a.cuentaCci : colaDe4(a.cuentaCci)}`);
      const otros = Object.keys(a).filter((k) => !["negocio", "seco", "id", "rentaMensual", "garantiaMonto", "cuentaCci", "nombre"].includes(k) && a[k] !== undefined);
      if (otros.length) cambios.push(`otros datos (${otros.join(", ")})`);
      const quien = a.id ? `el alquiler «${verificado(p?.nombre)}»` : `un alquiler nuevo «${conMarca(a.nombre)}»`;
      return `${a.id ? "Corregir" : "Crear"} ${quien}: ${cambios.length ? cambios.join("; ") : "sin cambios de plata"}.${a.id && !p ? " (no pude leer el alquiler actual en el panel)" : ""}`;
    },
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const moneda = a.moneda ?? p?.moneda ?? "PEN";
      const nombre = p?.nombre ?? a.nombre;
      const clave = a.rentaMensual !== undefined ? claveDeMonto(a.rentaMensual, moneda, "Renta mensual") : a.cuentaCci ? claveCci(a.cuentaCci) ?? claveDeMonto(a.garantiaMonto, moneda, "Garantía") : a.garantiaMonto != null ? claveDeMonto(a.garantiaMonto, moneda, "Garantía") : nombre ? claveNombre(String(nombre), [], { etiqueta: "Alquiler" }) : null;
      return { clave, filas: [{ etiqueta: "Alquiler (hoy)", valor: a.id ? verificado(p?.nombre) : "(nuevo)" }, ...(a.cuentaCci !== undefined ? [{ etiqueta: "CCI nuevo", valor: a.cuentaCci === null ? "(se borra)" : colaDe4(a.cuentaCci) }] : []), ...(a.garantiaMonto != null ? [{ etiqueta: "Garantía", valor: monedaTxt(a.garantiaMonto, moneda) }] : [])] };
    },
  },
  {
    nombre: "alquiler_pago",
    grupo: "administracion",
    tipo: "confirmar",
    descripcion: "Registra el pago de un mes de alquiler (POST /api/admin/alquileres/{id}/pagos). Es un REGISTRO: no mueve caja ni tesorería. periodo AAAA-MM, monto en la moneda del contrato, pagadoEl AAAA-MM-DD, medio. Un mes ya pagado con otros datos es error; repetir el mismo pago idéntico no duplica (el panel responde «duplicado» y cuenta como hecho). Pide OK de Brandon. Ej.: id=\"abc\", periodo=\"2026-11\", monto=1500, pagadoEl=\"2026-11-05\", medio=\"transferencia\", numeroOperacion=\"00123\".",
    entrada: {
      negocio,
      id: idRuta.describe("Id del alquiler"),
      periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "El periodo va como AAAA-MM"),
      monto: z.number().positive().max(1e8),
      pagadoEl: dia,
      medio: enumDe(MEDIOS),
      numeroOperacion: z.string().max(60).optional(),
      comprobanteDocumentId: idRuta.optional().describe("Id del comprobante en el drive"),
      notas: z.string().max(300).optional(),
    },
    pedido: (a, previa) => (/** @type {any} */ (previa)?.sinMoneda ? [] : { metodo: "POST", ruta: `/api/admin/alquileres/${a.id}/pagos`, cuerpo: limpiar({ periodo: a.periodo, monto: a.monto, pagadoEl: a.pagadoEl, medio: a.medio, numeroOperacion: a.numeroOperacion, comprobanteDocumentId: a.comprobanteDocumentId, notas: a.notas }) }),
    previa: async (a, leer) => {
      const f = await fichaPorId(leer, `/api/admin/alquileres/${a.id}`, "alquiler");
      return f ?? SIN_MONEDA;
    },
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      if (p?.sinMoneda) return MSG_SIN_MONEDA;
      const moneda = p?.moneda ?? "PEN";
      const renta = p?.rentaMensual != null && Number(p.rentaMensual) !== Number(a.monto) ? ` (OJO: la renta del contrato es ${monedaTxt(p.rentaMensual, moneda)})` : "";
      return `Registrar el pago de ${a.periodo} del alquiler «${verificado(p?.nombre)}»: ${monedaTxt(a.monto, moneda)} el ${a.pagadoEl} por ${a.medio}${renta}. Es un registro: no mueve caja.`;
    },
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const moneda = p?.moneda ?? "PEN";
      return { clave: claveDeMonto(a.monto, moneda, "Monto del pago"), filas: [{ etiqueta: "Alquiler", valor: verificado(p?.nombre) }, { etiqueta: "Mes", valor: a.periodo }, { etiqueta: "Medio", valor: a.medio }] };
    },
  },
];

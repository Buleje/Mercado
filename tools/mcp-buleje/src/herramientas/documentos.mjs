// Grupo «documentos»: drive de documentos del panel. Subir y mandar a la papelera piden OK (29-10).
import { readdir } from "node:fs/promises";
import { dirname } from "node:path";
import { revisarArchivo } from "../archivos.mjs";
import { z, negocio, idRuta, limpiar, lista, ficha, numero, claveNombre, fichaPorId, filasCompletas, otrosNombres, verificado } from "../util-herramientas.mjs";

const mb = (b) => `${numero(b / 1024 / 1024, b < 1024 * 1024 ? 2 : 1)} MB`;

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
export const herramientas = [
  {
    nombre: "docs_buscar",
    grupo: "documentos",
    tipo: "lectura",
    descripcion: "Busca documentos del drive (GET /api/admin/documents): por texto, carpeta, categoría, etiquetas o los que vencen en N días. Devuelve nombre, categoría, fecha y tamaño. Máx. 50.",
    entrada: {
      negocio,
      q: z.string().max(200).optional(),
      carpetaId: z.string().max(60).optional(),
      categoria: z.string().max(40).optional(),
      etiquetas: z.string().max(200).optional().describe("Separadas por coma"),
      favoritos: z.boolean().optional(),
      venceEnDias: z.number().int().min(1).max(365).optional(),
      limite: z.number().int().min(1).max(50).optional(),
    },
    pedido: (a) => ({ metodo: "GET", ruta: "/api/admin/documents", query: limpiar({ q: a.q, folderId: a.carpetaId, category: a.categoria, tags: a.etiquetas, favorite: a.favoritos ? "1" : undefined, expiring: a.venceEnDias, limite: a.limite ?? 50 }) }),
    formatear: (d) => lista(d, { titulo: "Documentos", cols: [["Nombre", ["name", "nombre"]], ["Categoría", ["category", "categoria"]], ["Fecha", ["createdAt", "updatedAt"], "f"], ["Vence", ["expiresAt", "venceEn"], "f"], ["Id", ["id"]]] }),
  },
  {
    nombre: "doc_ver",
    grupo: "documentos",
    tipo: "lectura",
    descripcion: "Datos de un documento por id (GET /api/admin/documents/[id]): nombre, categoría, etiquetas, estado, versiones.",
    entrada: { negocio, id: idRuta },
    pedido: (a) => ({ metodo: "GET", ruta: `/api/admin/documents/${a.id}` }),
    formatear: (d) => ficha(d, { titulo: "Documento", campos: [["Nombre", ["name"]], ["Categoría", ["category"]], ["Estado", ["status"]], ["Creado", ["createdAt"], "f"], ["Vence", ["expiresAt"], "f"]] }),
  },
  {
    nombre: "doc_subir",
    grupo: "documentos",
    tipo: "confirmar",
    descripcion: "Sube un archivo local al drive (POST /api/admin/documents, multipart). Solo archivos de «Semana actual», Descargas de Windows o ~/Descargas, hasta 25 MB; nada oculto ni .env. Saca una copia de la PC: pide OK de Brandon.",
    entrada: {
      negocio,
      ruta: z.string().min(1).max(500).describe("Ruta absoluta del archivo en esta PC"),
      carpetaId: z.string().max(60).optional(),
    },
    // Sin previa (o si la revisión falló) no hay sello: el cliente no manda nada. Con previa va la ruta REAL y su sha256.
    pedido: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return { metodo: "POST", ruta: "/api/admin/documents", cuerpo: limpiar({ folderId: a.carpetaId }), archivo: { ruta: p?.ok ? p.real : a.ruta, campo: "file", sha256: p?.ok ? p.sha256 : "", bytes: p?.ok ? p.bytes : 0 } };
    },
    // Lee el archivo en la PC (no la red): carpeta permitida, realpath, tamaño y sello. El contenido no sale de acá.
    previa: async (a) => {
      const r = await revisarArchivo(a.ruta);
      if (!r.ok) return { ok: false, motivo: r.motivo };
      let hermanos = [];
      try { hermanos = (await readdir(dirname(r.real))).filter((n) => n !== r.nombre && !n.startsWith(".")).slice(0, 40); } catch { /* sin otros nombres: la ventana usa parecidos */ }
      return { ok: true, real: r.real, nombre: r.nombre, bytes: r.bytes, sha256: r.sha256, hermanos };
    },
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      if (!p?.ok) return `Subir un archivo al drive: NO se puede (${p?.motivo ?? "no se pudo revisar el archivo"}). Si confirmas, no se manda nada.`;
      return `Subir «${p.nombre}» (${mb(p.bytes)}) al drive del panel${a.carpetaId ? ` (carpeta ${a.carpetaId})` : ""}. Sale una copia de esta PC: ${p.real}.`;
    },
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return {
        clave: p?.ok ? claveNombre(p.nombre, p.hermanos, { etiqueta: "Archivo", palabra: "nombre de archivo" }) : null,
        filas: p?.ok ? [{ etiqueta: "Tamaño", valor: mb(p.bytes) }, { etiqueta: "Carpeta de la PC", valor: dirname(p.real).split("/").slice(-2).join("/") }] : [{ etiqueta: "Archivo", valor: "no se puede subir" }],
      };
    },
  },
  {
    nombre: "doc_papelera",
    grupo: "documentos",
    tipo: "confirmar",
    descripcion: "Manda un documento a la papelera (DELETE /api/admin/documents/[id], sin purgar): se puede restaurar desde la papelera del panel. Pide OK de Brandon.",
    entrada: { negocio, id: idRuta.describe("Id del documento: el nombre del aviso lo saca el panel") },
    pedido: (a) => ({ metodo: "DELETE", ruta: `/api/admin/documents/${a.id}` }),
    previa: async (a, leer) => {
      const f = /** @type {any} */ (await fichaPorId(leer, `/api/admin/documents/${a.id}`, "document"));
      const nombre = f?.name ?? f?.originalName;
      const vecinos = nombre ? await filasCompletas(leer, "/api/admin/documents", { folderId: f?.folderId ?? undefined, limite: 50 }) : null;
      return { nombre, otros: otrosNombres(vecinos, a.id) };
    },
    resumen: (a, previa) => `Mandar a la papelera el documento «${verificado(/** @type {any} */ (previa)?.nombre)}». Se puede restaurar.`,
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return { clave: p?.nombre ? claveNombre(p.nombre, p.otros, { etiqueta: "Documento", palabra: "nombre de documento" }) : null, filas: [] };
    },
  },
];

// Grupo «sistema»: estado del panel y de la sesión (solo lectura HTTP).
// panel_prender, negocios, leer_get, confirmar, pendientes y cancelar son locales: los registra el carril B.
import { z, negocio, ficha } from "../util-herramientas.mjs";

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
export const herramientas = [
  {
    nombre: "panel_estado",
    grupo: "sistema",
    tipo: "lectura",
    descripcion: "Dice si el panel responde (GET /api/health): estado, base de datos y hora del servidor.",
    entrada: { negocio },
    pedido: () => ({ metodo: "GET", ruta: "/api/health" }),
    formatear: (d) => ficha(d, { titulo: "Estado del panel", campos: [["Estado", ["status", "estado"]], ["Base de datos", ["db", "database"]], ["Hora", ["timestamp", "time", "hora"]]] }),
  },
  {
    nombre: "sesion_actual",
    grupo: "sistema",
    tipo: "lectura",
    descripcion: "Quién está conectado en este negocio: usuario, rol y negocio (GET /api/auth/me). Sirve para saber con qué permisos actúa Claude.",
    entrada: { negocio },
    pedido: () => ({ metodo: "GET", ruta: "/api/auth/me" }),
    formatear: (d) => ficha(d, { titulo: "Sesión", campos: [["Conectado", ["authenticated"]], ["Usuario", ["username", "name", "sub"]], ["Rol", ["role"]], ["Negocio", ["tenantCodigo", "tenantId"]]] }),
  },
];

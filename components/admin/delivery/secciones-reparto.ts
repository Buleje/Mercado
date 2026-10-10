/**
 * Las secciones de Pedidos y reparto › Reparto: los rótulos de la barra y lo
 * que dice el ⓘ de cada una (Brandon 2026-09-24: «explicar con un ícono, no
 * con párrafos»). Las claves son las de `?sub=`; `postulantes` comparte la
 * sección Equipo (su selector) pero tiene su propia ayuda.
 */

export type SeccionDeBarraReparto = "en-vivo" | "repartidores" | "asignaciones" | "pagos" | "ranking";

export const BARRA_REPARTO: readonly { clave: SeccionDeBarraReparto; rotulo: string }[] = [
  { clave: "en-vivo", rotulo: "En vivo" },
  { clave: "repartidores", rotulo: "Equipo" },
  { clave: "asignaciones", rotulo: "Asignaciones" },
  { clave: "pagos", rotulo: "Pagos" },
  { clave: "ranking", rotulo: "Ranking" },
];

interface Ayuda {
  titulo: string;
  what: string;
  affects?: string;
  example?: string;
}

export const AYUDA_REPARTO: Record<SeccionDeBarraReparto | "postulantes", Ayuda> = {
  "en-vivo": {
    titulo: "En vivo",
    what: "Dónde está cada repartidor y qué está haciendo, al momento: el mapa se actualiza solo cada 10 s.",
    affects: "Los pedidos en camino, con su cliente y su estado, se ven en el Tablero. Abajo, plegadas, las rutas planificadas con sus paradas.",
    example: "Verde = libre, coral = le llegó un pedido y no lo acepta todavía, azul = lleva un pedido.",
  },
  repartidores: {
    titulo: "Equipo",
    what: "Tus repartidores: teléfono, zona, vehículo, tarifa por entrega y si están activos. Con el selector ves a quienes postulan.",
    affects: "Pausar a uno lo saca de las asignaciones; sus entregas y pagos no se borran.",
    example: "La cifra roja de «Equipo» = postulantes por revisar.",
  },
  postulantes: {
    titulo: "Postulantes",
    what: "Quienes pidieron repartir para tu negocio desde la app, con sus datos y documentos (KYC).",
    affects: "Aprobar lo suma a tu equipo; rechazar le avisa. «Lista para aprobar» = documentos completos.",
  },
  asignaciones: {
    titulo: "Asignaciones",
    what: "Qué pedido va con qué repartidor, su estado y la tarifa de esa entrega.",
    affects: "Plegados abajo, los permisos de tienda: qué puede ver o cambiar cada usuario.",
  },
  pagos: {
    titulo: "Pagos",
    what: "Lo que cada repartidor pidió retirar de lo que ganó, desde su app, y el historial de lo pagado o rechazado.",
    affects: "Pagar anota el gasto «Pago a repartidor» en Transporte; en efectivo puede salir de la caja abierta. La cifra roja = retiros por pagar.",
  },
  ranking: {
    titulo: "Ranking",
    what: "Quién entrega más y mejor en el período: entregas, aceptación, tiempo promedio y lo ganado en tarifas.",
    affects: "Lo ganado es lo que sumaron sus tarifas, no lo que ya les pagaste (eso está en Pagos).",
  },
};

/**
 * Las secciones de Pedidos y reparto › Reparto: los rótulos de la barra y lo
 * que dice el ⓘ de cada una (Brandon 2026-09-24: «explicar con un ícono, no
 * con párrafos»). Las claves son las de `?sub=`; `postulantes` comparte la
 * sección Equipo (su selector) pero tiene su propia ayuda.
 */

export type SeccionDeBarraReparto = "en-vivo" | "rutas" | "repartidores" | "asignaciones" | "pagos" | "ranking";

export const BARRA_REPARTO: readonly { clave: SeccionDeBarraReparto; rotulo: string }[] = [
  { clave: "en-vivo", rotulo: "En vivo" },
  { clave: "rutas", rotulo: "Rutas" },
  { clave: "repartidores", rotulo: "Equipo" },
  { clave: "asignaciones", rotulo: "Asignaciones" },
  // La clave sigue siendo `pagos` (enlaces viejos); el rótulo dice lo que es (17-10, P31).
  { clave: "pagos", rotulo: "Retiros" },
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
    affects: "Los pedidos en camino, con su cliente y su estado, se ven en el Tablero. Las rutas planificadas con sus paradas están en «Rutas».",
    example: "Verde = libre, coral = le llegó un pedido y no lo acepta todavía, azul = lleva un pedido.",
  },
  rutas: {
    titulo: "Rutas",
    what: "Las rutas planificadas del día con sus paradas en orden, en su propio mapa, y lo último que pasó en cada entrega.",
    affects: "Dónde está cada repartidor ahora se ve en «En vivo»; acá, el recorrido que tiene que hacer.",
  },
  repartidores: {
    titulo: "Equipo",
    what: "Tus repartidores: teléfono, zona, vehículo, tarifa por entrega y si están activos. Con el selector ves a quienes postulan.",
    affects: "Apagar «Recibe pedidos» lo saca de las asignaciones; sus entregas y retiros no se borran. Con entregas o retiros no se puede eliminar: se desactiva.",
    example: "La cifra roja de «Equipo» = postulantes por revisar.",
  },
  postulantes: {
    titulo: "Postulantes",
    what: "Quienes pidieron repartir para tu negocio desde la app, con sus datos y documentos (KYC).",
    affects: "Aprobar lo suma a tu equipo; rechazar le avisa. «Lista para aprobar» = documentos completos.",
  },
  asignaciones: {
    titulo: "Asignaciones",
    what: "Qué pedido va con qué repartidor, su estado y la tarifa de esa entrega. Si falta un repartidor o un pedido confirmado, te dice qué y adónde ir.",
    affects: "La pastilla «Reparten» dice si sólo tu equipo ve los pedidos o también la red Buleje. Plegados abajo, los permisos de tienda.",
  },
  pagos: {
    titulo: "Retiros de repartidores",
    what: "Lo que TÚ le debes a cada repartidor: pidió retirar, desde su app, lo que ganó con sus tarifas. Abajo, el historial de lo pagado o rechazado.",
    affects: "Pagar anota el gasto «Pago a repartidor» en Transporte; en efectivo puede salir de la caja abierta. No incluye lo que el repartidor cobró a tus clientes en efectivo (eso te lo entrega él). La cifra roja = retiros por pagar.",
  },
  ranking: {
    titulo: "Ranking",
    what: "Quién entrega más y mejor en el período: entregas, aceptación, tiempo promedio y lo ganado en tarifas.",
    affects: "Lo ganado es lo que sumaron sus tarifas, no lo que ya les pagaste (eso está en Retiros).",
  },
};

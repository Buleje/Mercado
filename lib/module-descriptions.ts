// Descripciones y ejemplos cotidianos para cada modulo del sidebar.
// Se usan en los tooltips de ModuleTooltip.tsx.
// Lenguaje simple: como si le explicaras a alguien que nunca uso una computadora.

export interface ModuleDescription {
  summary: string;
  example: string;
}

export const MODULE_DESCRIPTIONS: Record<string, ModuleDescription> = {
  "asistente-ia": {
    summary: "Tu asistente inteligente que te dice como va el negocio",
    example: 'Ej: "Hoy vendiste S/.1,240 y te queda poco arroz"',
  },
  "ventas-caja": {
    summary: "Aqui vendes productos y manejas el dinero de la caja",
    example: "Ej: Cobrar S/.25 de fideos a dona Rosa",
  },
  inventario: {
    summary: "Mira cuanto tienes de cada producto en tu almacen",
    example: "Ej: Te quedan 50 bolsas de arroz y 12 vencen pronto",
  },
  productos: {
    summary: "Tu lista de productos con precios y ofertas",
    example: "Ej: Subir el precio del aceite de S/.8 a S/.8.50",
  },
  compras: {
    summary: "Pide productos a tus proveedores y controla entregas",
    example: "Ej: Pedir 100 bolsas de azucar al proveedor Torres",
  },
  plata: {
    summary: "Tu dinero: cuanto entra, cuanto sale, cuanto ganas",
    example: "Ej: Este mes ganaste S/.3,200 y gastaste S/.1,800",
  },
  clientes: {
    summary: "Informacion de tus clientes: quien compra, quien debe",
    example: "Ej: Maria compra cada semana y debe S/.45",
  },
  config: {
    summary: "Ajustes del sistema: usuarios, permisos, tu pagina web",
    example: "Ej: Agregar un nuevo cajero al sistema",
  },
  fiados: {
    summary: "Control de lo que te deben: quien se llevo fiado y cuanto falta",
    example: "Ej: Don Pedro se llevo S/.50 de abarrotes y ya pago S/.20",
  },
  turnos: {
    summary: "Abrir y cerrar turno del dia con conteo de efectivo",
    example: "Ej: Empezaste con S/.200 en caja, vendiste S/.500, cierras con S/.700",
  },
  recetas: {
    summary: "Recetas para preparar productos: ingredientes y costos",
    example: "Ej: 10 panes de yuca usan 2kg harina + 1lt leche = S/.15 de costo",
  },
  prestamos: {
    summary: "Prestamos a clientes con cuotas mensuales e intereses",
    example: "Ej: Prestaste S/.1,000 a Juan en 6 cuotas de S/.180",
  },
};

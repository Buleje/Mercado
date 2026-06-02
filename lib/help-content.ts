/**
 * lib/help-content.ts — Contenido del Centro de Ayuda (/ayuda).
 *
 * Datos PUROS (sin JSX) para poder usarse en Server Components y en JSON-LD
 * (FAQPage) sin acoplar a componentes. El `icon` es una clave string que la
 * página mapea a un componente Lucide. Cubre TODOS los públicos de la
 * plataforma: clientes, dueños de negocio y repartidores.
 */

export type HelpFaq = { q: string; a: string };
export type HelpTopic = {
  id: string;
  title: string;
  /** Clave de icono Lucide (mapeada en la página). */
  icon: string;
  audience: "Clientes" | "Negocios" | "Repartidores" | "Todos";
  intro: string;
  faqs: HelpFaq[];
};

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "comprar",
    title: "Comprar y pedidos",
    icon: "ShoppingCart",
    audience: "Clientes",
    intro: "Todo sobre cómo hacer, seguir y gestionar tus pedidos.",
    faqs: [
      {
        q: "¿Cómo hago un pedido?",
        a: "Entra a una tienda, agrega productos al carrito con el botón verde y presiona el carrito en la parte superior. Revisa tu pedido, elige tu dirección y la forma de pago, y confirma. Recibes la confirmación al instante y por WhatsApp.",
      },
      {
        q: "¿Necesito crear una cuenta para comprar?",
        a: "Puedes explorar y armar tu carrito sin cuenta. Para confirmar el pedido te pedimos nombre, teléfono y dirección. Crear una cuenta es gratis y rápido, y te permite seguir tus pedidos, guardar direcciones y juntar puntos de fidelidad.",
      },
      {
        q: "¿Puedo pedir de varias tiendas a la vez?",
        a: "Cada pedido es de una sola tienda para que el delivery sea rápido y directo. Puedes hacer varios pedidos seguidos a distintas tiendas sin problema.",
      },
      {
        q: "¿Cómo sigo el estado de mi pedido en tiempo real?",
        a: "Desde 'Mis pedidos' en tu cuenta ves el estado (confirmado, en preparación, en camino, entregado) y, cuando sale el repartidor, puedes seguir la ruta en el mapa. Además te avisamos por WhatsApp en cada paso.",
      },
      {
        q: "¿Cómo cancelo o modifico un pedido?",
        a: "Si la tienda todavía no empezó a prepararlo, puedes cancelarlo desde 'Mis pedidos' o escribiéndonos por WhatsApp. Si ya está en preparación o en camino, contáctanos y vemos las opciones disponibles.",
      },
      {
        q: "¿Hay un monto mínimo de pedido?",
        a: "Depende de cada tienda. Si existe un mínimo, lo verás claramente en el carrito antes de confirmar tu pedido.",
      },
    ],
  },
  {
    id: "pagos",
    title: "Pagos",
    icon: "CreditCard",
    audience: "Clientes",
    intro: "Paga como más te convenga, siempre de forma segura.",
    faqs: [
      {
        q: "¿Qué métodos de pago aceptan?",
        a: "Yape, Plin, efectivo contra entrega y, en tiendas habilitadas, tarjeta de crédito o débito. No necesitas tarjeta para comprar.",
      },
      {
        q: "¿Cómo pago con Yape o Plin?",
        a: "Al confirmar el pedido eliges Yape o Plin, escaneas el QR (o usas el número) y nos indicas el número de operación. La tienda verifica el pago y empieza a preparar tu pedido.",
      },
      {
        q: "¿Es seguro pagar en Buleje?",
        a: "Sí. El total se calcula en nuestros servidores (no se puede alterar), la conexión viaja cifrada y nunca almacenamos los datos de tu tarjeta: los procesan pasarelas de pago certificadas (Stripe, Mercado Pago).",
      },
      {
        q: "¿Me dan boleta o factura?",
        a: "Sí. Las tiendas habilitadas emiten boleta o factura electrónica válida ante SUNAT. Indica tus datos (y tu RUC si necesitas factura) al momento de comprar.",
      },
      {
        q: "¿Puedo pagar en efectivo al recibir?",
        a: "Sí, si la tienda lo permite. Pagas al repartidor cuando llega tu pedido. Ten el monto a la mano para agilizar la entrega.",
      },
      {
        q: "¿Qué pasa si el pago falla o se duplica?",
        a: "Si el pago falla, tu pedido no se confirma y no se te cobra. Si ves un cobro duplicado, escríbenos por WhatsApp con el número de operación y lo resolvemos.",
      },
    ],
  },
  {
    id: "delivery",
    title: "Delivery y seguimiento",
    icon: "Truck",
    audience: "Clientes",
    intro: "Tu pedido en la puerta, rápido y rastreable.",
    faqs: [
      {
        q: "¿Cuánto demora el delivery?",
        a: "En promedio 25 minutos, según la distancia y la carga de la tienda. Verás un tiempo estimado al confirmar y te avisamos apenas el pedido va en camino.",
      },
      {
        q: "¿Cuánto cuesta el envío?",
        a: "El costo del delivery se muestra en el carrito antes de pagar, sin sorpresas. Algunas tiendas ofrecen envío gratis a partir de cierto monto.",
      },
      {
        q: "¿A qué zonas llegan?",
        a: "Operamos en Ciudad Constitución y zonas cercanas, y sumamos cobertura constantemente. Si tu dirección está fuera de cobertura, te lo indicamos al seleccionarla.",
      },
      {
        q: "¿Cómo me comunico con el repartidor?",
        a: "Cuando tu pedido sale a reparto, puedes contactar al repartidor desde la pantalla de seguimiento o por WhatsApp para coordinar la entrega.",
      },
      {
        q: "¿Qué pasa si no estoy cuando llega el pedido?",
        a: "El repartidor te llamará. Deja siempre una referencia clara y un teléfono activo; si no logramos entregar, coordinamos un reintento.",
      },
    ],
  },
  {
    id: "cuenta",
    title: "Mi cuenta, fidelidad y referidos",
    icon: "User",
    audience: "Clientes",
    intro: "Gestiona tu perfil y aprovecha todos los beneficios.",
    faqs: [
      {
        q: "¿Cómo creo mi cuenta?",
        a: "Con tu teléfono y nombre. Es gratis y toma menos de un minuto. Tu cuenta guarda tus pedidos, direcciones, puntos y preferencias.",
      },
      {
        q: "¿Cómo gano y uso puntos de fidelidad?",
        a: "Ganas puntos con tus compras; los ves en tu cuenta y los canjeas por descuentos o beneficios en las tiendas participantes.",
      },
      {
        q: "¿Cómo funciona el programa de referidos?",
        a: "Comparte tu código de referido (lo encuentras en tu cuenta). Cuando un amigo se registra y hace su primera compra, ambos reciben un beneficio.",
      },
      {
        q: "¿Cómo administro mis direcciones?",
        a: "En tu cuenta → Direcciones puedes agregar, editar o marcar una dirección como predeterminada, con su referencia para facilitar la entrega.",
      },
      {
        q: "¿Cómo cambio mis datos o mi contraseña?",
        a: "En tu cuenta → Perfil puedes actualizar tu nombre, teléfono, correo y contraseña cuando lo necesites.",
      },
      {
        q: "¿Cómo elimino mi cuenta y mis datos?",
        a: "Puedes solicitar la eliminación de tu cuenta y tus datos personales desde tu cuenta → Privacidad o escribiéndonos. Lo procesamos en los plazos que exige la ley.",
      },
    ],
  },
  {
    id: "cupones",
    title: "Cupones y promociones",
    icon: "Tag",
    audience: "Clientes",
    intro: "Aprovecha descuentos, ofertas y beneficios.",
    faqs: [
      {
        q: "¿Cómo uso un cupón de descuento?",
        a: "En el carrito, ingresa el código en el campo de cupón antes de pagar. El descuento se aplica al total al instante.",
      },
      {
        q: "¿Por qué mi cupón no funciona?",
        a: "Revisa que esté vigente, que cumplas el monto mínimo, que aplique a esa tienda o productos y que no lo hayas usado antes. Si persiste, escríbenos y lo revisamos.",
      },
      {
        q: "¿Dónde veo las ofertas vigentes?",
        a: "En la portada y dentro de cada tienda verás las promociones y productos en oferta. Activa las notificaciones para enterarte primero.",
      },
    ],
  },
  {
    id: "devoluciones",
    title: "Devoluciones y reembolsos",
    icon: "RotateCcw",
    audience: "Clientes",
    intro: "Si algo no salió bien, lo resolvemos contigo.",
    faqs: [
      {
        q: "¿Puedo devolver un producto?",
        a: "Sí. Si el producto llegó dañado, vencido, equivocado o no corresponde a lo ofrecido, tienes derecho a cambio o devolución conforme al Código de Protección y Defensa del Consumidor.",
      },
      {
        q: "Llegó un producto en mal estado o equivocado, ¿qué hago?",
        a: "Escríbenos por WhatsApp con tu número de pedido y una foto del producto. Coordinamos el cambio o el reembolso con la tienda lo antes posible.",
      },
      {
        q: "¿Cómo pido un reembolso?",
        a: "Reporta el caso por WhatsApp o desde 'Mis pedidos'. Según el medio de pago, el reembolso se hace por el mismo canal (Yape, Plin o tarjeta).",
      },
      {
        q: "¿En cuánto tiempo recibo mi reembolso?",
        a: "Una vez aprobado, los reembolsos por Yape o Plin suelen ser inmediatos; por tarjeta pueden tardar algunos días hábiles según tu banco.",
      },
    ],
  },
  {
    id: "negocio",
    title: "Para tu negocio (vender en Buleje)",
    icon: "Store",
    audience: "Negocios",
    intro: "Lleva tu bodega o negocio online y vende más, con todo en un solo panel.",
    faqs: [
      {
        q: "¿Cómo abro mi tienda en Buleje?",
        a: "Regístrate en Buleje para negocios, completa los datos de tu bodega, carga tus productos y publica. Puedes empezar a vender en minutos.",
      },
      {
        q: "¿Qué necesito para registrarme?",
        a: "Tus datos de contacto y un RUC vigente para emitir comprobantes. Si todavía no tienes RUC, te orientamos para obtenerlo.",
      },
      {
        q: "¿Cuánto cuesta? ¿Cobran comisión?",
        a: "Hay un plan gratis para empezar y planes con más funciones a medida que creces. Consulta los precios y comisiones actualizados en Buleje para negocios y en la página de Planes.",
      },
      {
        q: "¿Qué incluye el panel de administración?",
        a: "Un sistema completo de gestión: catálogo de productos, pedidos en tiempo real, punto de venta (POS), control de inventario, clientes, fidelidad, cupones, reportes y más, todo desde un mismo panel.",
      },
      {
        q: "¿Cómo cargo mis productos?",
        a: "Desde el panel creas productos con foto, precio, stock, variantes y categorías, uno por uno o cargando varios a la vez.",
      },
      {
        q: "¿Cómo manejo los pedidos y el delivery?",
        a: "Recibes los pedidos en tiempo real, los preparas y los marcas como listos; Buleje coordina al repartidor. También puedes usar tu propio reparto si prefieres.",
      },
      {
        q: "¿Emiten boleta y factura electrónica (SUNAT)?",
        a: "Sí. La plataforma soporta facturación electrónica de boletas y facturas integrada con SUNAT para tus ventas.",
      },
      {
        q: "¿Cuándo y cómo recibo mi dinero?",
        a: "Los pagos en Yape, Plin o efectivo los cobras directamente al momento de la venta o la entrega. Los pagos con tarjeta se depositan a tu cuenta según el ciclo de la pasarela de pago.",
      },
    ],
  },
  {
    id: "repartidor",
    title: "Repartidores",
    icon: "Bike",
    audience: "Repartidores",
    intro: "Genera ingresos repartiendo pedidos en tu zona.",
    faqs: [
      {
        q: "¿Cómo me hago repartidor de Buleje?",
        a: "Escríbenos por WhatsApp para postular. Necesitas movilidad propia, un smartphone y disponibilidad horaria en tu zona.",
      },
      {
        q: "¿Cómo funciona la app de delivery?",
        a: "Recibes los pedidos asignados, ves la ruta hacia la tienda y hacia el cliente, y confirmas la entrega desde la app, con seguimiento en vivo.",
      },
      {
        q: "¿Cómo cobro por mis entregas?",
        a: "Cobras por entrega según las condiciones acordadas. Los pagos en efectivo los recibes del cliente y se liquidan según el esquema de tu zona.",
      },
    ],
  },
  {
    id: "seguridad",
    title: "Seguridad, privacidad y legal",
    icon: "ShieldCheck",
    audience: "Todos",
    intro: "Tu seguridad y tus derechos están primero.",
    faqs: [
      {
        q: "¿Mis datos están seguros?",
        a: "Sí. Usamos cifrado, control de accesos y buenas prácticas de seguridad, y nunca guardamos los datos de tu tarjeta. Puedes leer el detalle en nuestra Política de Privacidad.",
      },
      {
        q: "¿Cómo ejerzo mis derechos sobre mis datos?",
        a: "Por la Ley N° 29733 puedes acceder, rectificar, cancelar u oponerte al uso de tus datos personales desde tu cuenta → Privacidad o escribiéndonos. Respondemos en los plazos de ley.",
      },
      {
        q: "¿Cómo presento un reclamo formal?",
        a: "Usa nuestro Libro de Reclamaciones Virtual: registramos tu caso con un código de seguimiento y te respondemos dentro del plazo legal (15 días hábiles).",
      },
      {
        q: "¿Es confiable comprar en Buleje?",
        a: "Somos un marketplace de bodegas y tiendas locales reales, con pagos seguros, seguimiento de pedidos y soporte por WhatsApp. Tu satisfacción y tu confianza son nuestra prioridad.",
      },
    ],
  },
];

/** Todas las preguntas aplanadas — para el JSON-LD FAQPage. */
export const ALL_HELP_FAQS: HelpFaq[] = HELP_TOPICS.flatMap((t) => t.faqs);

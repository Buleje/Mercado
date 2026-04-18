/**
 * lib/mock-guides.ts — Contenido mock para el Content Hub /guias.
 *
 * Stub sin backend: estructura lista para migrar a CMS/Prisma.
 * Categorias canonicas, readingTime en minutos, illustration key del DS.
 */

export type GuideCategory =
  | "Cocina"
  | "Ahorro"
  | "Despensa"
  | "Recetas"
  | "Limpieza"
  | "Salud"
  | "Para tu negocio";

export interface Guide {
  id: string;
  slug: string;
  category: GuideCategory;
  title: string;
  excerpt: string;
  readingTime: number; // minutos
  date: string;        // ISO date string
  illustration: string; // nombre de ilustracion DS
  featured: boolean;
  body: string;        // texto plano tipo markdown — para [slug] page
  relatedSlugs: string[];
}

export const GUIDES: Guide[] = [
  {
    id: "1",
    slug: "armar-despensa-para-el-mes",
    category: "Despensa",
    title: "Cómo armar tu despensa para el mes sin gastar de más",
    excerpt:
      "Un plan de compras inteligente que te permite tener siempre los básicos sin desperdiciar. Ideal para familias de Pucallpa con presupuesto ajustado.",
    readingTime: 6,
    date: "2026-04-12",
    illustration: "BodegaAbriendo",
    featured: true,
    body: `## El secreto está en la lista base

Una despensa bien armada empieza antes de ir a comprar. Anota primero lo que ya tienes, luego lo que falta.

### Los 10 básicos de toda despensa

1. Arroz (5 kg mínimo)
2. Aceite vegetal
3. Azúcar blanca
4. Sal yodada
5. Harina de trigo
6. Fideos surtidos
7. Lentejas o frijoles
8. Leche evaporada (6 latas)
9. Sardinas o atún en lata
10. Ajo y cebolla

## Compra por quincena, no por día

Ir a la bodega todos los días es la razón principal por la que gastamos más. Dos compras grandes al mes son suficientes para los no-perecibles.

### Truco Buleje: usa categorías

Divide tu lista en:
- **Granos y harinas** — duran meses
- **Enlatados** — duran años
- **Frescos** — compra cada 2-3 días
- **Condimentos** — compra por trimestre

## Presupuesto realista para Pucallpa (2026)

| Categoría | Cantidad | Precio aprox. |
|-----------|----------|---------------|
| Arroz 5 kg | 1 bolsa | S/22 |
| Aceite 1 L | 2 botellas | S/18 |
| Fideos | 4 paquetes | S/16 |
| Enlatados | 6 latas | S/30 |

> Consejo: compra los básicos en tu bodega de siempre. Con Buleje puedes hacer el pedido desde casa y recibirlo en 45 minutos.
`,
    relatedSlugs: ["ahorrar-con-cupones", "lista-compras-semanal"],
  },
  {
    id: "2",
    slug: "recetas-rapidas-ingredientes-pucallpa",
    category: "Recetas",
    title: "Recetas rápidas con ingredientes típicos de Pucallpa",
    excerpt:
      "Cinco platos amazónicos que puedes hacer en menos de 30 minutos usando ingredientes que encuentras en cualquier bodega de Ucayali.",
    readingTime: 8,
    date: "2026-04-10",
    illustration: "PaicheEnOlla",
    featured: true,
    body: `## La cocina amazónica es rápida y nutritiva

No necesitas ingredientes raros. Los productos de tu bodega son suficientes para cocinar rico.

### Receta 1: Tacacho con cecina (20 min)

**Ingredientes:**
- Plátano verde maduro x 2
- Manteca de chancho
- Cecina al gusto

**Preparación:** Aplasta el plátano verde cocinado con manteca hasta formar bolas. Acompaña con cecina frita.

### Receta 2: Juane de arroz (25 min con arroz pre-cocido)

**Ingredientes:**
- Arroz cocido 2 tazas
- Huevo duro
- Pollo desmenuzado
- Cúrcuma (palillo)
- Hoja de bijao

**Preparación:** Mezcla el arroz con cúrcuma, pollo y huevo. Envuelve en hoja de bijao y calienta al vapor.

## Por qué usar ingredientes locales

Los ingredientes de Ucayali tienen ventajas claras:
- **Precio menor** — el transporte es corto
- **Frescura mayor** — menos días en tránsito
- **Sabor auténtico** — variedades adaptadas al clima

> Pide tus ingredientes en Buleje y cocina hoy mismo.
`,
    relatedSlugs: ["armar-despensa-para-el-mes", "paiche-como-prepararlo"],
  },
  {
    id: "3",
    slug: "ahorrar-con-cupones",
    category: "Ahorro",
    title: "Guía del comprador: cómo ahorrar con cupones en Buleje",
    excerpt:
      "Los cupones de descuento pueden ahorrarte entre 10% y 30% en tus compras mensuales. Aquí te explicamos cómo activarlos y cuándo usarlos.",
    readingTime: 4,
    date: "2026-04-08",
    illustration: "DoniaElena",
    featured: true,
    body: `## Cómo funcionan los cupones en Buleje

Los cupones son códigos que aplicas en el momento del pago. Cada bodega puede tener sus propios cupones además de los que ofrece Buleje directamente.

### Tipos de cupones disponibles

| Tipo | Ejemplo | Cuándo aplica |
|------|---------|---------------|
| Porcentaje | 15OFF → 15% descuento | Siempre |
| Monto fijo | JULIO10 → S/10 off | Monto mínimo |
| Primera compra | BIENVENIDO | Solo primera vez |
| Referido | código de amigo | Con primer pedido |

### Paso a paso para usar un cupón

1. Agrega productos al carrito
2. Entra a **Ver carrito**
3. Busca el campo "¿Tienes un cupón?"
4. Ingresa el código y presiona **Aplicar**
5. El descuento aparece antes de pagar

## Dónde conseguir cupones

- **Tu cuenta Buleje** — revisa Mi Cuenta > Cupones
- **WhatsApp** — síguenos para cupones exclusivos
- **Programa de referidos** — invita a un amigo y ambos ganan

> No acumules cupones esperando la "gran compra". Los cupones tienen vencimiento. Úsalos antes de que expiren.
`,
    relatedSlugs: ["programa-puntos-lealtad", "como-invitar-amigos"],
  },
  {
    id: "4",
    slug: "lista-compras-semanal",
    category: "Despensa",
    title: "Tu lista de compras semanal en 5 minutos",
    excerpt:
      "Una metodología simple para planificar las compras de la semana sin olvidar nada y sin comprar de más.",
    readingTime: 3,
    date: "2026-04-05",
    illustration: "CuadernoFiadoReal",
    featured: false,
    body: `## El método de las 3 columnas

Divide una hoja (o nota en el celular) en tres columnas:

1. **Lo que tengo** — revisa la alacena
2. **Lo que falta** — lo básico que se acabó
3. **Lo que quiero cocinar** — planifica 3-4 platos

### Ejemplo real

| Tengo | Falta | Esta semana cocino |
|-------|-------|--------------------|
| Arroz | Aceite | Arroz con pollo |
| Cebolla | Tomate | Sopa de res |
| Fideos | Huevos | Tallarin saltado |

> Con Buleje puedes hacer tu lista directamente en la app y pedirla con un tap.
`,
    relatedSlugs: ["armar-despensa-para-el-mes", "ahorrar-con-cupones"],
  },
  {
    id: "5",
    slug: "paiche-como-prepararlo",
    category: "Recetas",
    title: "Paiche: cómo comprarlo y prepararlo bien",
    excerpt:
      "El paiche es el rey de la gastronomía amazónica. Te enseñamos a elegir el corte correcto y las tres formas más ricas de prepararlo.",
    readingTime: 7,
    date: "2026-04-03",
    illustration: "PaicheEnOlla",
    featured: false,
    body: `## Qué es el paiche

El paiche (Arapaima gigas) es uno de los peces de agua dulce más grandes del mundo. En Ucayali es el ingrediente estrella de la cocina local.

### Cómo elegir el paiche en la bodega

- **Color:** rosado claro a naranja — no gris
- **Olor:** fresco a río, nunca fuerte
- **Textura:** firme al tacto

### Las 3 preparaciones clásicas

**1. Paiche a la plancha (15 min)**
Sazona con ajo, sal, pimienta y limón. Plancha 5 min por lado a fuego medio-alto.

**2. Paiche al vapor con bijao (25 min)**
Envuelve el filete en hoja de bijao con cebolla, ajo y culantro. Cocina al vapor.

**3. Ceviche de paiche (20 min)**
Corta en cubos, marina con limón por 10 min, agrega cebolla morada y ají amarillo.

> El paiche también está disponible congelado en Buleje — igual de nutritivo que fresco.
`,
    relatedSlugs: ["recetas-rapidas-ingredientes-pucallpa", "lista-compras-semanal"],
  },
  {
    id: "6",
    slug: "productos-limpieza-bodega",
    category: "Limpieza",
    title: "Los productos de limpieza que nunca deben faltar",
    excerpt:
      "La lista básica de limpieza para el hogar y cuánto dura cada producto. Ahorra comprando en cantidad los que más usas.",
    readingTime: 4,
    date: "2026-04-01",
    illustration: "BodegaAbriendo",
    featured: false,
    body: `## Limpieza básica del hogar

Estos productos cubren el 90% de las necesidades de limpieza de una casa familiar.

### Lista básica mensual

| Producto | Cantidad mensual | Duración |
|----------|-----------------|----------|
| Lejía 1L | 2 botellas | 1 mes |
| Jabón lavar ropa | 1 kg | 3 semanas |
| Limpiatodo multiusos | 1 botella | 1 mes |
| Esponja de fregar | 4 unidades | 1 semana c/u |
| Escoba | 1 (trimestral) | 3 meses |

### Truco: compra el lejía concentrado

El lejía concentrado rinde 4 veces más que el normal. Dilúyelo con agua. Cuesta un poco más pero es más barato por uso.

> Todos estos productos están disponibles en tu bodega Buleje. Pide tu pack de limpieza semanal.
`,
    relatedSlugs: ["armar-despensa-para-el-mes", "lista-compras-semanal"],
  },
  {
    id: "7",
    slug: "alimentacion-saludable-bajo-presupuesto",
    category: "Salud",
    title: "Cómo comer saludable con menos de S/20 al día",
    excerpt:
      "La alimentación nutritiva no tiene que ser cara. Con los ingredientes correctos de tu bodega puedes comer bien toda la semana.",
    readingTime: 6,
    date: "2026-03-28",
    illustration: "CanastaVacia",
    featured: false,
    body: `## El mito de la comida saludable cara

Comer bien no requiere productos importados ni superfoods. Los ingredientes básicos de toda bodega son nutritivos y baratos.

### Los más nutritivos de precio bajo

| Alimento | Precio aprox. | Nutriente principal |
|----------|--------------|-------------------|
| Lenteja 1kg | S/4.50 | Proteína + hierro |
| Huevo x 12 | S/8.00 | Proteína completa |
| Plátano x kg | S/2.00 | Potasio + carbohidratos |
| Cebolla x kg | S/2.50 | Antioxidantes |
| Sardinas lata | S/4.00 | Omega 3 + calcio |

### Menú ejemplo — S/18 por día (familia 4 personas)

**Desayuno:** Avena con leche y plátano — S/3
**Almuerzo:** Lentejas guisadas con arroz — S/8
**Cena:** Huevo revuelto con verduras — S/4
**Snack:** Pan con margarina — S/3

> Pide tus ingredientes en Buleje y recíbelos en tu casa. Sin hacer cola, sin gastar en pasaje.
`,
    relatedSlugs: ["lista-compras-semanal", "paiche-como-prepararlo"],
  },
  {
    id: "8",
    slug: "como-registrar-tu-bodega",
    category: "Para tu negocio",
    title: "Cómo registrar tu bodega en Buleje paso a paso",
    excerpt:
      "El proceso de onboarding tarda 5 minutos. Aquí te explicamos cada paso y qué necesitas tener a mano antes de empezar.",
    readingTime: 5,
    date: "2026-03-25",
    illustration: "BodegaAbriendo",
    featured: false,
    body: `## Antes de empezar

Ten a mano:
- Tu número de celular (principal)
- Nombre de tu bodega
- Dirección exacta (con referencia)
- DNI o RUC (si quieres facturar)

## Los 5 pasos del registro

**Paso 1: Crea tu cuenta**
Ve a buleje.pe/registro. Ingresa tu número de celular. Recibirás un código por WhatsApp.

**Paso 2: Nombre y dirección**
Escribe el nombre de tu bodega y tu dirección. El mapa te ayuda a ubicarte con precisión.

**Paso 3: Elige tu plan**
El plan gratuito te permite empezar con 50 productos y 1 usuario. Puedes cambiar después.

**Paso 4: Carga tus productos**
Usa el catálogo de Buleje para agregar productos rápido — más de 5,000 productos listos con foto y precio.

**Paso 5: Activa tu tienda**
Tu tienda queda activa de inmediato. Comparte el link con tus clientes por WhatsApp.

> El wizard de onboarding te guía en cada paso. Si tienes dudas, el chat de soporte está disponible de lunes a sábado.
`,
    relatedSlugs: ["gestionar-inventario-bodega", "primeras-ventas-buleje"],
  },
  {
    id: "9",
    slug: "gestionar-inventario-bodega",
    category: "Para tu negocio",
    title: "Gestiona el inventario de tu bodega sin complicaciones",
    excerpt:
      "El inventario es la parte más importante del ERP. Aprende a mantenerlo actualizado sin perder horas en el proceso.",
    readingTime: 7,
    date: "2026-03-20",
    illustration: "CuadernoFiadoReal",
    featured: false,
    body: `## Por qué el inventario importa

Un inventario actualizado evita dos problemas costosos:
1. Vender algo que no tienes (cliente frustrado)
2. Pedir mercadería que ya tienes de más (dinero parado)

### El método de conteo semanal

Elige un día fijo — preferible el domingo en la tarde cuando hay menos movimiento. Cuenta sección por sección.

### Cómo usar el escáner de Buleje

El app de Buleje tiene escáner de código de barras. Escanea cada producto para actualizar el stock en segundos.

**Ventajas:**
- No tienes que escribir manualmente
- El historial queda guardado
- Detecta productos sin movimiento

### Alertas de stock mínimo

Configura el stock mínimo para cada producto en Ajustes > Inventario. Buleje te avisa cuando el stock cae por debajo.

> Sincroniza tu inventario físico con Buleje una vez a la semana. 30 minutos de orden te ahorran horas de caos.
`,
    relatedSlugs: ["como-registrar-tu-bodega", "primeras-ventas-buleje"],
  },
  {
    id: "10",
    slug: "primeras-ventas-buleje",
    category: "Para tu negocio",
    title: "Cómo conseguir tus primeras ventas en Buleje",
    excerpt:
      "Las primeras 10 ventas son las más difíciles. Estas estrategias funcionan para bodegas nuevas en Pucallpa.",
    readingTime: 5,
    date: "2026-03-15",
    illustration: "BodegueroCelebrando",
    featured: false,
    body: `## La estrategia de las primeras ventas

No esperes que los clientes lleguen solos. Las primeras ventas requieren acción directa.

### 1. Tu lista de WhatsApp

Crea un grupo o lista de difusión con tus 50 primeros contactos. Anúnciales que tu bodega ya tiene delivery.

### 2. El primer descuento

Ofrece 10% de descuento en el primer pedido con cupón PRIMERA. Todos se animan con un descuento de bienvenida.

### 3. Velocidad de entrega

En los primeros días, prioriza la velocidad. Un pedido en 20 minutos genera un comentario positivo instantáneo.

### 4. Solicita reseñas

Después de cada entrega, manda un WhatsApp: "¿Cómo estuvo el pedido? Tu opinión nos ayuda mucho". Las reseñas atraen más clientes.

## Qué no hacer al principio

- No pongas demasiados productos (mejor 30 bien gestionados que 200 desactualizados)
- No prometas tiempos que no puedes cumplir
- No descuides la presentación del paquete

> El primer mes es de experimentación. Aprende qué piden más tus clientes y prioriza ese stock.
`,
    relatedSlugs: ["como-registrar-tu-bodega", "gestionar-inventario-bodega"],
  },
  {
    id: "11",
    slug: "conservar-alimentos-calor-amazonia",
    category: "Salud",
    title: "Cómo conservar alimentos con el calor de la Amazonía",
    excerpt:
      "En Pucallpa la temperatura promedio es 28°C todo el año. Estas técnicas evitan que tus alimentos se echen a perder antes de tiempo.",
    readingTime: 5,
    date: "2026-03-10",
    illustration: "CorazonLatiendo",
    featured: false,
    body: `## El calor es el enemigo número 1

Con 28-35°C constantes, los alimentos se deterioran mucho más rápido que en ciudades de sierra. La refrigeración correcta es clave.

### Reglas básicas de conservación

**Temperatura de la nevera:** Entre 2°C y 4°C para frescos. El congelador a -18°C.

**La regla de las 2 horas:** Ningún alimento cocido debe estar más de 2 horas a temperatura ambiente en clima cálido.

### Qué no necesita refrigeración

- Arroz y fideos secos — en lugar fresco y seco
- Latas — cualquier temperatura mientras estén cerradas
- Pan — máximo 2 días sin refrigerar en Pucallpa
- Plátanos maduros — temperatura ambiente pero consumir pronto

### Conservación sin nevera

Si no tienes nevera o se fue la luz:
1. Cocina solo lo que vas a comer
2. Guarda los restos en ollas tapadas
3. Consume en máximo 4 horas

> Compra en Buleje la cantidad justa para 3-4 días. Menos desperdicio, más ahorro.
`,
    relatedSlugs: ["alimentacion-saludable-bajo-presupuesto", "lista-compras-semanal"],
  },
  {
    id: "12",
    slug: "programa-puntos-lealtad",
    category: "Ahorro",
    title: "Aprovecha al máximo el programa de puntos Buleje",
    excerpt:
      "Con cada compra acumulas puntos que se convierten en descuentos. Aprende cómo maximizar tus puntos y cuándo canjearlos.",
    readingTime: 4,
    date: "2026-03-05",
    illustration: "BodegueroCelebrando",
    featured: false,
    body: `## Cómo funciona el sistema de puntos

Por cada sol que gastas en Buleje, acumulas 1 punto. Los puntos no vencen mientras hagas al menos 1 compra cada 6 meses.

### Tabla de canje

| Puntos | Equivale a |
|--------|-----------|
| 100 puntos | S/1 de descuento |
| 500 puntos | S/5 de descuento |
| 1000 puntos | S/11 de descuento (bonus 10%) |
| 2000 puntos | S/25 de descuento (bonus 25%) |

### Cómo acumular más rápido

- **Compras grandes** — acumulas en cantidad
- **Referidos** — 200 puntos por cada amigo que compra por primera vez
- **Cumpleaños** — doble de puntos el mes de tu cumpleaños
- **Reseñas** — 50 puntos por dejar una reseña verificada

### Cuándo canjear

El mejor momento para canjear es cuando tienes 1000+ puntos (el bonus de 10% hace la diferencia). No canjees en cantidades pequeñas.

> Revisa tus puntos en Mi Cuenta > Puntos. El historial muestra cada acumulación y canje.
`,
    relatedSlugs: ["ahorrar-con-cupones", "como-invitar-amigos"],
  },
  {
    id: "13",
    slug: "como-invitar-amigos",
    category: "Ahorro",
    title: "Gana puntos invitando a tus amigos a Buleje",
    excerpt:
      "El programa de referidos es la forma más rápida de acumular puntos. Un amigo que compra te da 200 puntos inmediatos.",
    readingTime: 3,
    date: "2026-02-28",
    illustration: "DoniaElena",
    featured: false,
    body: `## Cómo funciona el programa de referidos

Cada cuenta Buleje tiene un código de referido único. Cuando alguien usa tu código en su primera compra, ambos ganan.

### Qué gana cada uno

- **Tú:** 200 puntos (equivale a S/2 en descuentos)
- **Tu amigo:** 10% de descuento en su primera compra

### Cómo compartir tu código

1. Ve a Mi Cuenta > Referidos
2. Copia tu código personal
3. Compártelo por WhatsApp, Facebook o en persona

### Sin límite de referidos

Puedes referir a todos tus contactos. No hay límite de personas ni de puntos ganados por referidos.

> Tu código lo encuentras en Mi Cuenta > Referidos. Compártelo hoy.
`,
    relatedSlugs: ["programa-puntos-lealtad", "ahorrar-con-cupones"],
  },
  {
    id: "14",
    slug: "delivery-rapido-pucallpa",
    category: "Ahorro",
    title: "Cómo recibir tu pedido en menos de 45 minutos",
    excerpt:
      "El tiempo de entrega depende de varios factores. Aquí explicamos cómo optimizar tu pedido para recibirlo lo más rápido posible.",
    readingTime: 3,
    date: "2026-02-20",
    illustration: "PedidoLlegando",
    featured: false,
    body: `## Los factores que afectan el tiempo de entrega

El tiempo de entrega en Buleje depende de tres variables:

1. **Zona** — algunos barrios tienen más cobertura de repartidores
2. **Hora** — mediodía y noche son los momentos más demandados
3. **Tamaño del pedido** — pedidos muy grandes tardan más en prepararse

### Consejos para recibir más rápido

- **Pide entre 9am y 11am** — es el horario de menor demanda
- **Ten tu dirección exacta** — una referencia clara acelera la entrega
- **Activa notificaciones** — así sabes cuando sale el repartidor

### Seguimiento del pedido

Cuando sale tu pedido, recibes un link de seguimiento por WhatsApp. Puedes ver la ubicación del repartidor en tiempo real.

> Si tu pedido tarda más de lo estimado, contacta por WhatsApp al soporte. Resolvemos en minutos.
`,
    relatedSlugs: ["ahorrar-con-cupones", "armar-despensa-para-el-mes"],
  },
  {
    id: "15",
    slug: "primeros-pasos-cuenta-buleje",
    category: "Ahorro",
    title: "Primeros pasos en tu cuenta Buleje",
    excerpt:
      "Acabas de crear tu cuenta. Estos 5 pasos iniciales te ayudan a sacarle el máximo provecho desde el primer día.",
    readingTime: 4,
    date: "2026-02-15",
    illustration: "CorazonLatiendo",
    featured: false,
    body: `## Bienvenido a Buleje

Tu cuenta ya está activa. Hay 5 cosas que vale la pena configurar antes de tu primera compra.

### Paso 1: Confirma tu dirección

En Mi Cuenta > Mis Direcciones, agrega tu dirección de entrega con referencia clara. Esto acelera tus pedidos futuros.

### Paso 2: Activa las notificaciones

Acepta las notificaciones para recibir:
- Confirmación de pedido
- Estado de entrega
- Cupones exclusivos

### Paso 3: Guarda tu bodega favorita

Entra a la bodega más cercana a tu casa y presiona "Guardar como favorita". Así accedes directo sin buscar.

### Paso 4: Revisa los cupones de bienvenida

Ve a Mi Cuenta > Cupones. Probablemente ya tienes un cupón de bienvenida esperándote.

### Paso 5: Comparte tu código de referido

En Mi Cuenta > Referidos encontrarás tu código. Compártelo y gana 200 puntos por cada amigo que compre.

> ¿Alguna duda? El chat de soporte responde en menos de 5 minutos de lunes a sábado.
`,
    relatedSlugs: ["ahorrar-con-cupones", "programa-puntos-lealtad", "como-invitar-amigos"],
  },
];

/** Guias destacadas para el Hero de /guias */
export const FEATURED_GUIDES = GUIDES.filter((g) => g.featured);

/** Busca una guia por slug */
export function getGuideBySlug(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

/** Guias relacionadas dado un array de slugs */
export function getRelatedGuides(slugs: string[]): Guide[] {
  return slugs
    .map((slug) => getGuideBySlug(slug))
    .filter((g): g is Guide => g !== undefined)
    .slice(0, 3);
}

/** Todas las categorias unicas */
export const GUIDE_CATEGORIES: GuideCategory[] = [
  "Cocina",
  "Ahorro",
  "Despensa",
  "Recetas",
  "Limpieza",
  "Salud",
  "Para tu negocio",
];

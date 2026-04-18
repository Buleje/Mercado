/**
 * Mock realista de preguntas y respuestas — comunidad Pucallpa.
 *
 * Las preguntas son genéricas (se asignan por productId determinístico)
 * y las respuestas incluyen vendor badge cuando es la dueña de la tienda.
 */

export type MockAnswer = {
  id: string;
  userId: string;
  userName: string;
  isVendor: boolean;
  body: string;
  helpfulCount: number;
  createdAt: string;
};

export type MockQuestion = {
  id: string;
  productId: number;
  userId: string;
  userName: string;
  question: string;
  createdAt: string;
  answers: MockAnswer[];
};

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const iso = (daysAgo: number, hoursAgo = 0) =>
  new Date(now - daysAgo * DAY - hoursAgo * 3600_000).toISOString();

const QA_LIBRARY: Omit<MockQuestion, "productId">[] = [
  {
    id: "q_001",
    userId: "u_ana_l",
    userName: "Ana L.",
    question: "¿El delivery llega hasta Yarinacocha el mismo día si pido en la mañana?",
    createdAt: iso(4),
    answers: [
      {
        id: "a_001_1",
        userId: "u_dueña_elena",
        userName: "Doña Elena (dueña)",
        isVendor: true,
        body: "Sí señora, si pide antes de las 11 de la mañana le llega el mismo día en la tarde. Para zonas más alejadas como San José cobramos S/3 adicionales.",
        helpfulCount: 23,
        createdAt: iso(4, -6),
      },
      {
        id: "a_001_2",
        userId: "u_pedro_r",
        userName: "Pedro R.",
        isVendor: false,
        body: "Confirmo, yo vivo en Yarinacocha y siempre me llega puntual. Nunca me han fallado.",
        helpfulCount: 11,
        createdAt: iso(3),
      },
    ],
  },
  {
    id: "q_002",
    userId: "u_javier_g",
    userName: "Javier G.",
    question: "¿Tienen variedad orgánica o cómo sabe que es calidad buena?",
    createdAt: iso(11),
    answers: [
      {
        id: "a_002_1",
        userId: "u_dueña_elena",
        userName: "Doña Elena (dueña)",
        isVendor: true,
        body: "Todos nuestros productos los compramos directo de los agricultores de la zona de Campo Verde. Son naturales sin químicos agregados. Si busca con certificado orgánico pídanos por mensaje y le confirmamos.",
        helpfulCount: 19,
        createdAt: iso(11, -3),
      },
    ],
  },
  {
    id: "q_003",
    userId: "u_nancy_h",
    userName: "Nancy H.",
    question: "¿Se puede pagar con Yape o solo efectivo al repartidor?",
    createdAt: iso(18),
    answers: [
      {
        id: "a_003_1",
        userId: "u_dueña_elena",
        userName: "Doña Elena (dueña)",
        isVendor: true,
        body: "Aceptamos Yape, Plin y efectivo. Si paga con Yape confirma el pago antes de que salga el repartidor. El QR sale en el ticket de compra.",
        helpfulCount: 34,
        createdAt: iso(18, -1),
      },
    ],
  },
  {
    id: "q_004",
    userId: "u_ricardo_p",
    userName: "Ricardo P.",
    question: "¿Cuánto tiempo dura el producto después de recibirlo?",
    createdAt: iso(25),
    answers: [
      {
        id: "a_004_1",
        userId: "u_dueña_elena",
        userName: "Doña Elena (dueña)",
        isVendor: true,
        body: "Depende del producto. Los abarrotes secos duran meses con la fecha de vencimiento impresa. Los frescos los despachamos el mismo día que se cosechan o compramos, tienen 3 a 5 días de vida útil refrigerado.",
        helpfulCount: 8,
        createdAt: iso(25, -4),
      },
    ],
  },
  {
    id: "q_005",
    userId: "u_gabriela_m",
    userName: "Gabriela M.",
    question: "Si no me gusta o viene en mal estado, ¿puedo devolverlo?",
    createdAt: iso(40),
    answers: [
      {
        id: "a_005_1",
        userId: "u_dueña_elena",
        userName: "Doña Elena (dueña)",
        isVendor: true,
        body: "Por supuesto. Si el producto llega en mal estado o no cumple con lo que ofrecemos, lo cambiamos o devolvemos el dinero. Nos escribe por el chat con foto del producto y gestionamos el cambio el mismo día.",
        helpfulCount: 42,
        createdAt: iso(40),
      },
      {
        id: "a_005_2",
        userId: "u_sandra_c",
        userName: "Sandra C.",
        isVendor: false,
        body: "Doy fe, me cambiaron una bolsa de arroz que llegó mojada sin problema. Atención seria.",
        helpfulCount: 15,
        createdAt: iso(38),
      },
    ],
  },
  {
    id: "q_006",
    userId: "u_enrique_v",
    userName: "Enrique V.",
    question: "¿Puedo pedir factura con RUC de mi empresa?",
    createdAt: iso(55),
    answers: [
      {
        id: "a_006_1",
        userId: "u_dueña_elena",
        userName: "Doña Elena (dueña)",
        isVendor: true,
        body: "Claro, emitimos factura electrónica. Al hacer el pedido escriba su RUC y razón social en las notas. Le llega la factura al correo el mismo día.",
        helpfulCount: 17,
        createdAt: iso(55),
      },
    ],
  },
  {
    id: "q_007",
    userId: "u_lorena_b",
    userName: "Lorena B.",
    question: "¿Hay descuento si compro al por mayor para el restaurante?",
    createdAt: iso(70),
    answers: [
      {
        id: "a_007_1",
        userId: "u_dueña_elena",
        userName: "Doña Elena (dueña)",
        isVendor: true,
        body: "Sí, a partir de 10 unidades o más de un mismo producto le damos precio mayorista. Si es negocio recurrente podemos hacer un acuerdo mensual con entrega fija cada semana.",
        helpfulCount: 28,
        createdAt: iso(70),
      },
    ],
  },
  {
    id: "q_008",
    userId: "u_marco_a",
    userName: "Marco A.",
    question: "¿El empaque es biodegradable o de plástico?",
    createdAt: iso(85),
    answers: [
      {
        id: "a_008_1",
        userId: "u_dueña_elena",
        userName: "Doña Elena (dueña)",
        isVendor: true,
        body: "Estamos en transición a bolsas biodegradables. Los productos secos ya vienen en papel kraft, los refrigerados en plástico reciclable. Puede devolver las bolsas en la próxima compra y le damos 20 céntimos de descuento por cada una.",
        helpfulCount: 36,
        createdAt: iso(85),
      },
    ],
  },
];

/** Devuelve entre 2 y 5 preguntas por producto, determinístico */
export function getMockQuestionsForProduct(productId: number): MockQuestion[] {
  const seed = ((productId * 1597) >>> 0) % QA_LIBRARY.length;
  const count = 2 + (productId % 4); // 2–5 preguntas
  const out: MockQuestion[] = [];
  for (let i = 0; i < count; i++) {
    const idx = (seed + i) % QA_LIBRARY.length;
    const base = QA_LIBRARY[idx];
    out.push({ ...base, id: `${base.id}_p${productId}`, productId });
  }
  return out;
}

/**
 * Registration: GET + POST /api/marketplace/qa/{productId}
 *
 * Schema espejado desde app/api/marketplace/qa/[productId]/route.ts
 * NOTE: mirror of inline schema in route file
 * NO modificar el route.ts original — solo registrar aquí.
 */
import { z } from "zod";
import { registerEndpoint } from "../registry";
import { ErrorResponseSchema } from "../common";

// NOTE: mirror of inline schema in route file
const QAParamsSchema = z
  .object({
    productId: z.string().openapi({ example: "42", description: "ID numérico del producto" }),
  });

const QuestionBodySchema = z
  .object({
    userName: z.string().min(1).max(80).openapi({ example: "María López" }),
    question: z.string().min(10).max(500).openapi({ example: "¿Este producto tiene garantía?" }),
  })
  .openapi("QAQuestionBody");

const QAItemSchema = z
  .object({
    id:        z.number().int(),
    userName:  z.string(),
    question:  z.string(),
    answer:    z.string().nullable(),
    createdAt: z.string().datetime(),
  })
  .openapi("QAItem");

const QAListResponseSchema = z
  .object({
    data:  z.array(QAItemSchema),
    total: z.number().int(),
  })
  .openapi("QAListResponse");

const QACreatedResponseSchema = z
  .object({
    data: QAItemSchema,
  })
  .openapi("QACreatedResponse");

// GET — listar preguntas y respuestas
registerEndpoint({
  method:  "get",
  path:    "/marketplace/qa/{productId}",
  summary: "Listar preguntas y respuestas de un producto",
  tags:    ["Marketplace", "QA"],
  request: {
    params: QAParamsSchema,
  },
  responses: {
    200: { description: "Lista de preguntas del producto", schema: QAListResponseSchema },
    400: { description: "productId inválido",              schema: ErrorResponseSchema },
  },
  security: "none",
});

// POST — crear nueva pregunta
registerEndpoint({
  method:  "post",
  path:    "/marketplace/qa/{productId}",
  summary: "Registrar nueva pregunta sobre un producto",
  tags:    ["Marketplace", "QA"],
  request: {
    params: QAParamsSchema,
    body:   QuestionBodySchema,
  },
  responses: {
    201: { description: "Pregunta registrada",           schema: QACreatedResponseSchema },
    400: { description: "Datos inválidos o ID inválido", schema: ErrorResponseSchema },
    429: { description: "Rate limit excedido",           schema: ErrorResponseSchema },
  },
  security: "none",
});

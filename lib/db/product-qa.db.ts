import "server-only";
import { getOrSet } from "@/lib/cache";
import { logger } from "@/lib/logger";
import {
  getMockQuestionsForProduct,
  type MockQuestion,
  type MockAnswer,
} from "@/lib/mocks/product-qa.mock";

/**
 * lib/db/product-qa.db.ts — Preguntas y respuestas sobre productos.
 *
 * Contrato listo para migrar a Prisma cuando creemos las tablas
 * `ProductQuestion` + `ProductAnswer`. Hoy sirve mocks determinísticos
 * con lenguaje peruano (doña Elena como vendor, etc.).
 *
 * Convenciones ADR-011:
 *   - `tenantId` primer param.
 *   - Cache 180s (preguntas cambian con menos frecuencia que reviews).
 *   - Logger estructurado en errores.
 */

export type { MockQuestion, MockAnswer } from "@/lib/mocks/product-qa.mock";

export const ProductQADB = {
  /** Lista TODAS las preguntas de un producto, ordenadas por fecha asc (más viejas primero, Amazon-style). */
  async getQuestions(tenantId: string, productId: number): Promise<MockQuestion[]> {
    const cacheKey = `product-qa:${tenantId}:${productId}`;
    return getOrSet(cacheKey, 180, async () => {
      try {
        return getMockQuestionsForProduct(productId);
      } catch (err) {
        logger.error("[ProductQADB.getQuestions] failed", {
          err: String(err),
          productId,
        });
        return [];
      }
    });
  },

  /**
   * Firma lista para cuando tengamos auth real del user. Hoy retorna la
   * versión optimista para que la UI no quiebre.
   */
  async createQuestion(params: {
    tenantId: string;
    productId: number;
    userId: string;
    userName: string;
    question: string;
  }): Promise<MockQuestion> {
    logger.info("[ProductQADB.createQuestion] mock only", {
      productId: params.productId,
    });
    return {
      id: `q_mock_${Date.now()}`,
      productId: params.productId,
      userId: params.userId,
      userName: params.userName,
      question: params.question,
      createdAt: new Date().toISOString(),
      answers: [],
    };
  },

  async createAnswer(params: {
    tenantId: string;
    questionId: string;
    userId: string;
    userName: string;
    isVendor: boolean;
    body: string;
  }): Promise<MockAnswer> {
    logger.info("[ProductQADB.createAnswer] mock only", {
      questionId: params.questionId,
    });
    return {
      id: `a_mock_${Date.now()}`,
      userId: params.userId,
      userName: params.userName,
      isVendor: params.isVendor,
      body: params.body,
      helpfulCount: 0,
      createdAt: new Date().toISOString(),
    };
  },

  async markAnswerHelpful(tenantId: string, answerId: string): Promise<void> {
    logger.info("[ProductQADB.markAnswerHelpful] noop", {
      tenantId,
      answerId,
    });
  },
};

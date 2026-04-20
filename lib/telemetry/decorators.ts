/**
 * lib/telemetry/decorators.ts
 *
 * TC39 Stage 3 / TypeScript 5 decorator for auto-tracing async class methods.
 * No `experimentalDecorators` flag required — uses the native TS5 syntax.
 *
 * Usage:
 * ```ts
 * class OrdersService {
 *   @traced("orders.service.create")
 *   async create(tenantId: string, data: CreateOrderDTO) { ... }
 * }
 * ```
 *
 * The decorator:
 *  1. Wraps the original method in withSpan.
 *  2. Sets "buleje.class" and "buleje.method" attributes automatically.
 *  3. Propagates errors — never swallows them.
 */

import { withSpan } from "./spans";
import { ATTR } from "./semantic-attrs";

// ─────────────────────────────────────────────────────────────────────────────
// TC39 Stage 3 decorator (TS 5.x native — no experimentalDecorators flag)
// ─────────────────────────────────────────────────────────────────────────────

type AsyncFn<This, Args extends unknown[], Return> = (
  this: This,
  ...args: Args
) => Promise<Return>;

/**
 * Method decorator that wraps the decorated async method in an OTel span.
 *
 * @param name  Span name (e.g. "orders.service.create").
 *              Defaults to "<ClassName>.<methodName>" if not provided.
 */
export function traced(name?: string) {
  return function decorateMethod<This extends object, Args extends unknown[], Return>(
    originalMethod: AsyncFn<This, Args, Return>,
    context: ClassMethodDecoratorContext<This, AsyncFn<This, Args, Return>>,
  ): AsyncFn<This, Args, Return> {
    const methodName = String(context.name);

    return async function wrappedMethod(
      this: This,
      ...args: Args
    ): Promise<Return> {
      const className = (this as { constructor?: { name?: string } })?.constructor?.name ?? "Unknown";
      const spanName = name ?? `${className}.${methodName}`;

      return withSpan(
        spanName,
        async (span) => {
          span.setAttribute(ATTR.CLASS_NAME, className);
          span.setAttribute(ATTR.METHOD_NAME, methodName);
          return originalMethod.apply(this, args);
        },
      ) as Promise<Return>;
    };
  };
}

import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { registry } from "./registry";

export function generateOpenAPIDoc() {
  const generator = new OpenApiGeneratorV31(registry.definitions);

  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Bodega San Martín API",
      version: "0.1.0",
      description:
        "ERP/e-commerce multi-tenant API para Bodega San Martín. " +
        "Todos los endpoints de /admin requieren autenticación JWT con rol válido.",
    },
    servers: [{ url: "/api", description: "API Server" }],
  });
}

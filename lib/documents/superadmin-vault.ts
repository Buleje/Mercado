import "server-only";

/**
 * Tenant SINTÉTICO y AISLADO para el vault de documentos EXCLUSIVO del superadmin.
 *
 * No es un tenant real: ningún slug/customDomain puede ser "__superadmin__" (los
 * slugs validan `^[a-z0-9-]{2,40}$`, sin guiones bajos), así que estos Document
 * rows nunca se mezclan con los de un negocio real (p. ej. el tenant "main").
 *
 * `DocumentsDB` scopea TODO por `tenantId` (1er argumento), de modo que pasando
 * esta constante reutilizamos toda la infraestructura de documentos (storage,
 * categorías, favoritos, vencimiento, audit) para el repositorio privado de la
 * plataforma, sin cambios de schema.
 */
export const SUPERADMIN_DOCS_TENANT = "__superadmin__";

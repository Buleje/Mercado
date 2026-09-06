/**
 * Documentos v2 — tipos compartidos client/server.
 *
 * NO importa Prisma client aquí (client-safe). Los DB mappers viven en
 * lib/db/documents.db.ts y producen estos tipos planos serializables.
 */

export const DOC_ACTIONS = [
  "upload",
  "view",
  "download",
  "rename",
  "delete",
  "restore",
  "share",
  "share_revoke",
  "sign",
  "version",
  "move",
  "tag",
  "ocr",
  "ai_categorize",
  "stamp",
  "link",
  "merge",
  "whatsapp_send",
] as const;
export type DocAction = (typeof DOC_ACTIONS)[number];

export const DOC_CATEGORIES = [
  "contratos",
  "facturas",
  "manuales",
  "fotos",
  "personal",
  "otros",
] as const;
export type DocCategory = (typeof DOC_CATEGORIES)[number];

export interface DbDocument {
  id: string;
  tenantId: string;
  folderId: string | null;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  storagePath: string;
  category: string;
  tags: string[];
  favorite: boolean;
  /** Workflow: none | draft | review | approved | archived. */
  status: string;
  expiresAt: string | null;
  customerId: string | null;
  orderId: string | null;
  supplierId: string | null;
  ocrText: string | null;
  ocrMetadata: Record<string, unknown> | null;
  aiCategory: string | null;
  aiTags: string[];
  /** Permisos por documento: vacío = todos los admins; con roles = solo esos. */
  allowedRoles: string[];
  uploadedById: string;
  uploadedAt: string;
  updatedAt: string;
  deletedAt: string | null;
  versionCount?: number;
  shareCount?: number;
}

export interface DbDocumentFolder {
  id: string;
  tenantId: string;
  parentId: string | null;
  name: string;
  color: string | null;
  icon: string | null;
  /** Emoji elegido por el usuario. Gana sobre `icon` al dibujar la carpeta. */
  emoji: string | null;
  /** Etiquetas de la CARPETA (distintas de las del documento). */
  tags: string[];
  /** Permisos por carpeta: vacío = todos los admins; con roles = solo esos. */
  allowedRoles: string[];
  createdAt: string;
  updatedAt: string;
  documentCount?: number;
  children?: DbDocumentFolder[];
}

export interface DbDocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  storagePath: string;
  size: number;
  mimeType: string;
  uploadedById: string;
  uploadedAt: string;
  changeNote: string | null;
}

export interface DbDocumentShare {
  id: string;
  documentId: string;
  tenantId: string;
  token: string;
  expiresAt: string;
  hasPassword: boolean;
  createdById: string;
  createdAt: string;
  accessCount: number;
  lastAccessAt: string | null;
  revokedAt: string | null;
}

/**
 * Enlace público vivo del tenant — unifica los de documento y los de carpeta
 * para el centro de "Enlaces compartidos" del drive.
 */
export interface DbSharedLink {
  id: string;
  kind: "doc" | "folder";
  targetId: string;
  targetName: string;
  token: string;
  expiresAt: string;
  hasPassword: boolean;
  createdById: string;
  createdAt: string;
  accessCount: number;
  lastAccessAt: string | null;
  revokedAt: string | null;
}

export interface DbDocumentAuditLog {
  id: string;
  documentId: string;
  tenantId: string;
  actorId: string;
  action: DocAction;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

/** Evento de auditoría enriquecido con el nombre del documento (feed global). */
export interface DbDocumentActivity {
  id: string;
  documentId: string;
  documentName: string;
  documentDeleted: boolean;
  actorId: string;
  action: DocAction;
  createdAt: string;
}

export interface DbDocumentTemplate {
  id: string;
  tenantId: string | null;
  key: string;
  name: string;
  description: string | null;
  body: string;
  fields: TemplateField[];
  isSystem: boolean;
  createdAt: string;
}

export interface TemplateField {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "currency";
  required?: boolean;
  placeholder?: string;
}

export interface DocumentListFilters {
  folderId?: string | null;
  category?: string;
  q?: string;
  /** ADR-119 — búsqueda semántica: OR de términos contra name/ocrText/tags. */
  qAny?: string[];
  tags?: string[];
  favorite?: boolean;
  customerId?: string;
  orderId?: string;
  supplierId?: string;
  includeDeleted?: boolean;
  /** Vista "Papelera": SÓLO documentos soft-deleted (deletedAt != null). */
  deletedOnly?: boolean;
  /** ADR-119 — vista "Por vencer": documentos que vencen dentro de N días. */
  expiring?: number;
  /** ADR-119 — activar expansión semántica IA de la query `q`. */
  semantic?: boolean;
  /**
   * Traer el `ocrText` completo de cada documento.
   *
   * Por defecto NO se trae: es el texto entero del archivo más lo que le agregó
   * la IA (~4 KB promedio, hasta 17 KB), y en un drive de 292 documentos son
   * **1,1 MB que viajan de Postgres al navegador en cada listado** — más de
   * las tres cuartas partes de la respuesta — para algo que la grilla no
   * dibuja. La búsqueda no lo necesita: filtra en el WHERE, del lado del
   * servidor. Sólo hace falta cuando el cliente tiene que resaltar la
   * coincidencia y ordenar por relevancia, o sea cuando hay una búsqueda
   * escrita. El detalle del documento lo pide aparte.
   */
  conTextoCompleto?: boolean;
}

export const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50 MB hard limit en bucket
export const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 h
export const SHARE_TOKEN_DEFAULT_TTL_DAYS = 7;

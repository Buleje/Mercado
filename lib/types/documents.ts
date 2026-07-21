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
  expiresAt: string | null;
  customerId: string | null;
  orderId: string | null;
  supplierId: string | null;
  ocrText: string | null;
  ocrMetadata: Record<string, unknown> | null;
  aiCategory: string | null;
  aiTags: string[];
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
}

export const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50 MB hard limit en bucket
export const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 h
export const SHARE_TOKEN_DEFAULT_TTL_DAYS = 7;

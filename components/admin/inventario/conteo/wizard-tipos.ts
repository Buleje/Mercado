/** Tipos del asistente de conteo (paso a paso, guardado en el servidor). */

export type ConteoItem = {
  id: string;
  conteoId: string;
  productId: number;
  stockSistema: number;
  stockContado: number | null;
  diferencia: number | null;
  ajustado: boolean;
  product: {
    id: number;
    name: string;
    barcode: string | null;
    category: string;
    image: string;
    stock: number | null;
  } | null;
};

export type Conteo = {
  id: string;
  tipo: string;
  status: string;
  totalItems: number;
};

export type ConteoEnLista = {
  id: string;
  tipo: string;
  status: string;
  fechaInicio: string;
  _count: { items: number };
};

export type ResumenCierre = { totalItems: number; contados: number; conDiferencia: number; ajustados: number };

export type Paso = 1 | 2 | 3 | 4;

export const nombreDe = (i: ConteoItem) => i.product?.name ?? `Producto #${i.productId}`;

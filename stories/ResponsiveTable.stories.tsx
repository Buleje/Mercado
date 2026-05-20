import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Package, ShoppingCart } from "lucide-react";
import { ResponsiveTable } from "../components/ui/ResponsiveTable";

interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  precio: string;
  stock: number;
}

const meta: Meta<typeof ResponsiveTable<Producto>> = {
  title: "UI/ResponsiveTable",
  component: ResponsiveTable,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof ResponsiveTable<Producto>>;

const columnas = [
  { key: "nombre" as const, header: "Producto" },
  { key: "categoria" as const, header: "Categoría", hideOnMobile: true },
  { key: "precio" as const, header: "Precio" },
  { key: "stock" as const, header: "Stock" },
];

const datos: Producto[] = [
  { id: "1", nombre: "Arroz Superior 1kg", categoria: "Abarrotes", precio: "S/ 3.50", stock: 120 },
  { id: "2", nombre: "Aceite Vegetal 1L", categoria: "Abarrotes", precio: "S/ 8.90", stock: 45 },
  { id: "3", nombre: "Azúcar Rubia 1kg", categoria: "Abarrotes", precio: "S/ 2.80", stock: 200 },
  { id: "4", nombre: "Fideos Tallarín", categoria: "Abarrotes", precio: "S/ 1.50", stock: 85 },
  { id: "5", nombre: "Leche Gloria 400g", categoria: "Lácteos", precio: "S/ 4.20", stock: 30 },
];

export const Default: Story = {
  args: {
    columns: columnas,
    data: datos,
    keyExtractor: (item: Producto) => item.id,
  },
};

export const ConClickEnFila: Story = {
  args: {
    columns: columnas,
    data: datos,
    keyExtractor: (item: Producto) => item.id,
    onRowClick: (item: Producto) => alert(`Seleccionado: ${item.nombre}`),
  },
};

export const Cargando: Story = {
  args: {
    columns: columnas,
    data: [],
    keyExtractor: (item: Producto) => item.id,
    loading: true,
    loadingRows: 5,
  },
};

export const SinDatos: Story = {
  args: {
    columns: columnas,
    data: [],
    keyExtractor: (item: Producto) => item.id,
    emptyIcon: Package,
    emptyMessage: "No hay productos registrados",
    emptySubMessage: "Agrega tu primer producto para comenzar",
  },
};

export const SinDatosConIcono: Story = {
  args: {
    columns: columnas,
    data: [],
    keyExtractor: (item: Producto) => item.id,
    emptyIcon: ShoppingCart,
    emptyMessage: "Carrito vacío",
    emptySubMessage: "Agrega productos desde el catálogo",
  },
};

export type ProductUnit = 'piece' | 'weight'

export interface Product {
    id: number
    name: string
    category: string
    barcode: string
    purchasePrice: number
    sellingPrice: number
    unit: ProductUnit
    stock: number
    minStock: number
    image: string
}

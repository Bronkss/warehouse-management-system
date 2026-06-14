import * as XLSX from 'xlsx'

export type ProductUnit = 'piece' | 'weight'
export type ImportAction = 'update' | 'create' | 'skip'
export type ImportStatus = 'matched' | 'review' | 'new' | 'error'
export type MatchType = 'barcode' | 'exact_name' | 'fuzzy_name' | 'none'

export type ExcelRow = Record<string, unknown>

export type ExistingProduct = {
    id: number
    name: string
    category: string
    barcode: string
    purchasePrice: number
    sellingPrice: number
    unit: ProductUnit
    stock: number
    minStock: number
    normalizedName: string
}

export type ImportProduct = {
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

export type ProductSuggestion = {
    id: number
    name: string
    category: string
    barcode: string
    stock: number
    purchasePrice: number
    sellingPrice: number
    score: number
}

export type PreviewRow = {
    rowId: string
    rowNumber: number
    status: ImportStatus
    action: ImportAction
    matchType: MatchType
    matchScore: number
    matchedProductId: number | null
    matchedProductName: string
    matchedProductBarcode: string
    suggestions: ProductSuggestion[]
    error: string | null

    name: string
    category: string
    barcode: string
    purchasePrice: string
    sellingPrice: string
    unit: ProductUnit
    stock: string
    minStock: string
    image: string
}

export function normalizeHeader(value: string): string {
    return value
        .toLowerCase()
        .replaceAll('ё', 'е')
        .replace(/[\s._\-()₽№]/g, '')
        .trim()
}

export function getCell(row: ExcelRow, aliases: string[]): string {
    const normalizedAliases = aliases.map(normalizeHeader)

    for (const [key, value] of Object.entries(row)) {
        const normalizedKey = normalizeHeader(key)

        if (normalizedAliases.includes(normalizedKey)) {
            return String(value ?? '').trim()
        }
    }

    return ''
}

export function parseNumber(value: unknown): number {
    const normalized = String(value || '')
        .replace(',', '.')
        .replace(/\s/g, '')
        .trim()

    const parsed = Number(normalized)

    return Number.isFinite(parsed) ? parsed : 0
}

export function normalizeUnit(value: string): ProductUnit {
    const normalized = value.toLowerCase().trim()

    if (
        normalized.includes('кг') ||
        normalized.includes('вес') ||
        normalized.includes('weight') ||
        normalized.includes('kg')
    ) {
        return 'weight'
    }

    return 'piece'
}

export function generateBarcode(): string {
    const prefix = '200'
    const random = Math.floor(Math.random() * 10000000000)
        .toString()
        .padStart(10, '0')

    const barcode = prefix + random
    const digits = barcode.split('').map(Number)

    const sum = digits.reduce((acc, digit, index) => {
        return acc + (index % 2 === 0 ? digit : digit * 3)
    }, 0)

    const checkDigit = (10 - (sum % 10)) % 10

    return barcode + checkDigit
}

export function calculateSellingPrice(purchasePrice: number, category: string): number {
    const multiplier = category.toLowerCase().includes('пиво') ? 1.35 : 1.30
    return Math.ceil(purchasePrice * multiplier)
}

export function normalizeProductName(value: string): string {
    return String(value || '')
        .toLowerCase()
        .replaceAll('ё', 'е')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function getTokens(value: string): string[] {
    return normalizeProductName(value)
        .split(' ')
        .filter(token => token.length > 1)
}

export function calculateNameSimilarity(a: string, b: string): number {
    const tokensA = new Set(getTokens(a))
    const tokensB = new Set(getTokens(b))

    if (tokensA.size === 0 || tokensB.size === 0) {
        return 0
    }

    let intersection = 0

    for (const token of tokensA) {
        if (tokensB.has(token)) {
            intersection += 1
        }
    }

    const tokenScore = (2 * intersection) / (tokensA.size + tokensB.size)

    const normalizedA = normalizeProductName(a)
    const normalizedB = normalizeProductName(b)

    const substringScore =
        normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)
            ? 0.92
            : 0

    return Math.max(tokenScore, substringScore)
}

export function readExcelRows(buffer: Buffer): ExcelRow[] {
    const workbook = XLSX.read(buffer, {
        type: 'buffer',
    })

    const firstSheetName = workbook.SheetNames[0]

    if (!firstSheetName) {
        throw new Error('В Excel-файле нет листов')
    }

    const worksheet = workbook.Sheets[firstSheetName]

    return XLSX.utils.sheet_to_json<ExcelRow>(worksheet, {
        defval: '',
    })
}

export function mapExcelRow(row: ExcelRow): ImportProduct {
    const name = getCell(row, [
        'Название',
        'Наименование',
        'Товар',
        'name',
        'product',
    ])

    const category = getCell(row, [
        'Категория',
        'category',
    ]) || 'Другое'

    const barcode = getCell(row, [
        'Штрихкод',
        'ШК',
        'Баркод',
        'barcode',
        'bar_code',
    ])

    const purchasePrice = parseNumber(
        getCell(row, [
            'Цена закупки',
            'Закупка',
            'Закупочная цена',
            'purchasePrice',
            'purchase_price',
            'cost',
        ])
    )

    const rawSellingPrice = parseNumber(
        getCell(row, [
            'Цена продажи',
            'Продажа',
            'Розничная цена',
            'sellingPrice',
            'selling_price',
            'price',
        ])
    )

    const stock = parseNumber(
        getCell(row, [
            'Количество',
            'Кол-во',
            'Остаток',
            'Приход',
            'quantity',
            'stock',
            'qty',
        ])
    )

    const minStockRaw = parseNumber(
        getCell(row, [
            'Мин остаток',
            'Минимальный остаток',
            'minStock',
            'min_stock',
        ])
    )

    const unitRaw = getCell(row, [
        'Единица',
        'Ед',
        'Единица измерения',
        'unit',
    ])

    const image = getCell(row, [
        'Изображение',
        'Картинка',
        'Фото',
        'image',
    ])

    return {
        name,
        category,
        barcode,
        purchasePrice,
        sellingPrice: rawSellingPrice > 0
            ? Math.ceil(rawSellingPrice)
            : calculateSellingPrice(purchasePrice, category),
        unit: normalizeUnit(unitRaw),
        stock,
        minStock: minStockRaw > 0 ? minStockRaw : 10,
        image: image || '/icons/products.jpg',
    }
}

export function validateImportProduct(product: ImportProduct, rowNumber: number): string | null {
    if (!product.name) {
        return `Строка ${rowNumber}: не указано название товара`
    }

    if (!product.purchasePrice || product.purchasePrice <= 0) {
        return `Строка ${rowNumber}: некорректная цена закупки`
    }

    if (!product.sellingPrice || product.sellingPrice <= 0) {
        return `Строка ${rowNumber}: некорректная цена продажи`
    }

    if (!product.stock || product.stock <= 0) {
        return `Строка ${rowNumber}: некорректное количество`
    }

    return null
}

export function findSuggestions(
    product: ImportProduct,
    existingProducts: ExistingProduct[],
    forcedProduct?: ExistingProduct | null
): ProductSuggestion[] {
    const suggestions = existingProducts
        .map(existing => ({
            product: existing,
            score: calculateNameSimilarity(product.name, existing.name),
        }))
        .filter(item => item.score >= 0.45)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(item => ({
            id: item.product.id,
            name: item.product.name,
            category: item.product.category,
            barcode: item.product.barcode,
            stock: item.product.stock,
            purchasePrice: item.product.purchasePrice,
            sellingPrice: item.product.sellingPrice,
            score: item.score,
        }))

    if (forcedProduct && !suggestions.some(item => item.id === forcedProduct.id)) {
        suggestions.unshift({
            id: forcedProduct.id,
            name: forcedProduct.name,
            category: forcedProduct.category,
            barcode: forcedProduct.barcode,
            stock: forcedProduct.stock,
            purchasePrice: forcedProduct.purchasePrice,
            sellingPrice: forcedProduct.sellingPrice,
            score: 1,
        })
    }

    return suggestions
}

export function findProductMatch(
    product: ImportProduct,
    existingProducts: ExistingProduct[]
): {
    status: ImportStatus
    action: ImportAction
    matchType: MatchType
    matchScore: number
    product: ExistingProduct | null
} {
    const barcode = String(product.barcode || '').trim()

    if (barcode) {
        const barcodeMatch = existingProducts.find(existing => {
            return String(existing.barcode || '').trim() === barcode
        })

        if (barcodeMatch) {
            return {
                status: 'matched',
                action: 'update',
                matchType: 'barcode',
                matchScore: 1,
                product: barcodeMatch,
            }
        }
    }

    const normalizedName = normalizeProductName(product.name)

    const exactNameMatch = existingProducts.find(existing => {
        return existing.normalizedName === normalizedName
    })

    if (exactNameMatch) {
        return {
            status: 'matched',
            action: 'update',
            matchType: 'exact_name',
            matchScore: 1,
            product: exactNameMatch,
        }
    }

    let bestProduct: ExistingProduct | null = null
    let bestScore = 0

    for (const existing of existingProducts) {
        const score = calculateNameSimilarity(product.name, existing.name)

        if (score > bestScore) {
            bestScore = score
            bestProduct = existing
        }
    }

    if (bestProduct && bestScore >= 0.86) {
        return {
            status: 'matched',
            action: 'update',
            matchType: 'fuzzy_name',
            matchScore: bestScore,
            product: bestProduct,
        }
    }

    if (bestProduct && bestScore >= 0.70) {
        return {
            status: 'review',
            action: 'skip',
            matchType: 'fuzzy_name',
            matchScore: bestScore,
            product: bestProduct,
        }
    }

    return {
        status: 'new',
        action: 'create',
        matchType: 'none',
        matchScore: 0,
        product: null,
    }
}

export function buildPreviewRow(
    product: ImportProduct,
    rowNumber: number,
    existingProducts: ExistingProduct[]
): PreviewRow {
    const validationError = validateImportProduct(product, rowNumber)
    const match = findProductMatch(product, existingProducts)
    const suggestions = findSuggestions(product, existingProducts, match.product)

    if (validationError) {
        return {
            rowId: `${rowNumber}-${Date.now()}-${Math.random()}`,
            rowNumber,
            status: 'error',
            action: 'skip',
            matchType: 'none',
            matchScore: 0,
            matchedProductId: null,
            matchedProductName: '',
            matchedProductBarcode: '',
            suggestions,
            error: validationError,

            name: product.name,
            category: product.category,
            barcode: product.barcode,
            purchasePrice: String(product.purchasePrice || ''),
            sellingPrice: String(product.sellingPrice || ''),
            unit: product.unit,
            stock: String(product.stock || ''),
            minStock: String(product.minStock || ''),
            image: product.image,
        }
    }

    return {
        rowId: `${rowNumber}-${Date.now()}-${Math.random()}`,
        rowNumber,
        status: match.status,
        action: match.action,
        matchType: match.matchType,
        matchScore: match.matchScore,
        matchedProductId: match.product?.id ?? null,
        matchedProductName: match.product?.name ?? '',
        matchedProductBarcode: match.product?.barcode ?? '',
        suggestions,
        error: null,

        name: product.name,
        category: product.category,
        barcode: product.barcode,
        purchasePrice: String(product.purchasePrice),
        sellingPrice: String(product.sellingPrice),
        unit: product.unit,
        stock: String(product.stock),
        minStock: String(product.minStock),
        image: product.image,
    }
}
export const BARCODE_SEPARATOR = '|'

export const formatBarcodeInput = (value: string): string => {
    return value.replace(/\D/g, '').slice(0, 14)
}

export const parseBarcodeList = (value?: string | null): string[] => {
    const raw = String(value || '').trim()

    if (!raw) {
        return []
    }

    return Array.from(
        new Set(
            raw
                .split(/[|,;\n]+/)
                .map(code => code.trim())
                .filter(Boolean)
        )
    )
}

export const serializeBarcodeList = (barcodes: string[]): string => {
    return Array.from(
        new Set(
            barcodes
                .map(code => formatBarcodeInput(code))
                .filter(Boolean)
        )
    ).join(BARCODE_SEPARATOR)
}

export const getPrimaryBarcode = (value?: string | null): string => {
    return parseBarcodeList(value)[0] || ''
}

export const getBarcodeDisplay = (value?: string | null): string => {
    return parseBarcodeList(value).join(', ')
}

export const hasExactBarcode = (barcodeValue: string | undefined, query: string): boolean => {
    const normalizedQuery = formatBarcodeInput(query)

    if (!normalizedQuery) {
        return false
    }

    return parseBarcodeList(barcodeValue).some(code => code === normalizedQuery)
}

export const hasBarcodeSearchMatch = (barcodeValue: string | undefined, query: string): boolean => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
        return false
    }

    return parseBarcodeList(barcodeValue).some(code =>
        code.toLowerCase().includes(normalizedQuery)
    )
}
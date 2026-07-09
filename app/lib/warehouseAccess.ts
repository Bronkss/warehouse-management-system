export type WarehouseLocationType = 'warehouse' | 'store' | string

export type WarehouseSection =
    | 'products'
    | 'sales'
    | 'priemka'
    | 'otgruzki'
    | 'deliveries'
    | 'writeoff'
    | 'inventory'
    | 'online-kassa'
    | 'statistics'
    | 'purchase'

export type WarehouseSectionRule = {
    label: string
    access: 'all' | 'stores' | 'main-warehouse' | 'tochka-only'
    defaultRoute: string
}

export const WAREHOUSE_SECTION_RULES: Record<WarehouseSection, WarehouseSectionRule> = {
    products: {
        label: 'Товары',
        access: 'all',
        defaultRoute: '/products',
    },
    sales: {
        label: 'Продажи',
        access: 'stores',
        defaultRoute: '/sales',
    },
    priemka: {
        label: 'Приёмки',
        access: 'all',
        defaultRoute: '/priemka',
    },
    otgruzki: {
        label: 'Отгрузки',
        access: 'all',
        defaultRoute: '/otgruzki',
    },
    deliveries: {
        label: 'Доставки',
        access: 'tochka-only',
        defaultRoute: '/deliveries',
    },
    writeoff: {
        label: 'Списания',
        access: 'all',
        defaultRoute: '/writeoff',
    },
    inventory: {
        label: 'Инвентаризация',
        access: 'all',
        defaultRoute: '/inventory',
    },
    'online-kassa': {
        label: 'Касса',
        access: 'stores',
        defaultRoute: '/online-kassa',
    },
    statistics: {
        label: 'Статистика',
        access: 'main-warehouse',
        defaultRoute: '/statistics',
    },
    purchase: {
        label: 'Закупка',
        access: 'main-warehouse',
        defaultRoute: '/purchase',
    },
}

export const WAREHOUSE_MENU_ORDER: WarehouseSection[] = [
    'products',
    'sales',
    'priemka',
    'otgruzki',
    'deliveries',
    'writeoff',
    'inventory',
    'statistics',
    'purchase',
]

export function isMainWarehouseLocation(locationSlug: string, locationType?: WarehouseLocationType): boolean {
    return locationSlug === 'main-warehouse' || locationType === 'warehouse'
}

export function canUseWarehouseSection(
    locationSlug: string,
    locationType: WarehouseLocationType | undefined,
    section: WarehouseSection
): boolean {
    const rule = WAREHOUSE_SECTION_RULES[section]

    if (!rule) {
        return false
    }

    if (rule.access === 'all') {
        return true
    }

    if (rule.access === 'stores') {
        return !isMainWarehouseLocation(locationSlug, locationType)
    }

    if (rule.access === 'main-warehouse') {
        return isMainWarehouseLocation(locationSlug, locationType)
    }

    if (rule.access === 'tochka-only') {
        return locationSlug === 'tochka'
    }

    return false
}

export function getAllowedWarehouseSections(
    locationSlug: string,
    locationType?: WarehouseLocationType
): WarehouseSection[] {
    return WAREHOUSE_MENU_ORDER.filter(section => canUseWarehouseSection(locationSlug, locationType, section))
}

export function getFirstAllowedRouteForLocation(
    locationSlug: string,
    locationType?: WarehouseLocationType
): string {
    if (isMainWarehouseLocation(locationSlug, locationType)) {
        return '/system'
    }

    return '/system'
}

export function getWarehouseSectionFromPathname(pathname: string | null | undefined): WarehouseSection | null {
    const path = String(pathname || '').split('?')[0]

    if (!path || path === '/' || path === '/system' || path === '/auth') {
        return null
    }

    if (path === '/online-kassa' || path.startsWith('/online-kassa/')) return 'online-kassa'
    if (path === '/products' || path.startsWith('/products/')) return 'products'
    if (path === '/sales' || path.startsWith('/sales/')) return 'sales'
    if (path === '/priemka' || path.startsWith('/priemka/')) return 'priemka'
    if (path === '/otgruzki' || path.startsWith('/otgruzki/')) return 'otgruzki'
    if (path === '/deliveries' || path.startsWith('/deliveries/')) return 'deliveries'
    if (path === '/writeoff' || path.startsWith('/writeoff/')) return 'writeoff'
    if (path === '/inventory' || path.startsWith('/inventory/')) return 'inventory'
    if (path === '/statistics' || path.startsWith('/statistics/')) return 'statistics'
    if (path === '/purchase' || path.startsWith('/purchase/')) return 'purchase'

    return null
}

export function getForbiddenSectionMessage(
    locationName: string,
    section: WarehouseSection
): string {
    const label = WAREHOUSE_SECTION_RULES[section]?.label || 'Раздел'

    return `Раздел «${label}» недоступен в зоне «${locationName}»`
}

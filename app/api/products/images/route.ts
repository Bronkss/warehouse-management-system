import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { randomUUID } from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024

const ALLOWED_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
])

function getImageExtension(contentType: string): string {
    if (contentType === 'image/png') {
        return 'png'
    }

    if (contentType === 'image/webp') {
        return 'webp'
    }

    return 'jpg'
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData()
        const file = formData.get('file')

        if (!(file instanceof File)) {
            return NextResponse.json(
                { message: 'Файл изображения обязателен' },
                { status: 400 }
            )
        }

        if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
            return NextResponse.json(
                { message: 'Разрешены только JPG, PNG или WEBP' },
                { status: 400 }
            )
        }

        if (file.size > MAX_IMAGE_SIZE_BYTES) {
            return NextResponse.json(
                { message: 'Изображение не должно быть больше 4 МБ' },
                { status: 400 }
            )
        }

        const extension = getImageExtension(file.type)
        const pathname = `products/${randomUUID()}.${extension}`

        const blob = await put(pathname, file, {
            access: 'public',
        })

        return NextResponse.json({
            url: blob.url,
            pathname: blob.pathname,
            contentType: blob.contentType,
        })
    } catch (error) {
        console.error('POST /api/products/images error:', error)

        return NextResponse.json(
            { message: 'Ошибка при загрузке изображения' },
            { status: 500 }
        )
    }
}
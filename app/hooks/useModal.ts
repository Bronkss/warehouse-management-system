// hooks/useModal.ts
'use client'

import { useState, useCallback } from 'react'

interface UseModalReturn {
    isOpen: boolean
    open: () => void
    close: () => void
    toggle: () => void
    setIsOpen: (value: boolean) => void
}

export function useModal(initialState = false): UseModalReturn {
    const [isOpen, setIsOpen] = useState(initialState)

    const open = useCallback(() => setIsOpen(true), [])
    const close = useCallback(() => setIsOpen(false), [])
    const toggle = useCallback(() => setIsOpen(prev => !prev), [])

    return {
        isOpen,
        open,
        close,
        toggle,
        setIsOpen
    }
}
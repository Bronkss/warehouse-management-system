// components/CustomSelect.tsx
'use client'

import { useState, useRef, useEffect } from 'react'

interface SelectOption {
    value: string
    label: string
    disabled?: boolean
}

interface CustomSelectProps {
    value: string
    onChange: (value: string) => void
    options: SelectOption[]
    placeholder?: string
    error?: string
    className?: string
}

export default function CustomSelect({
                                         value,
                                         onChange,
                                         options,
                                         placeholder = 'Выберите...',
                                         error,
                                         className = ''
                                     }: CustomSelectProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [dropdownPosition, setDropdownPosition] = useState<'top' | 'bottom'>('bottom')
    const selectRef = useRef<HTMLDivElement>(null)
    const dropdownRef = useRef<HTMLDivElement>(null)

    const selectedOption = options.find(opt => opt.value === value)

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    useEffect(() => {
        if (isOpen && dropdownRef.current && selectRef.current) {
            const dropdownRect = dropdownRef.current.getBoundingClientRect()
            const selectRect = selectRef.current.getBoundingClientRect()
            const windowHeight = window.innerHeight

            if (dropdownRect.bottom > windowHeight && selectRect.top > dropdownRect.height) {
                setDropdownPosition('top')
            } else {
                setDropdownPosition('bottom')
            }
        }
    }, [isOpen])

    return (
        <div className={`relative ${className}`} ref={selectRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full px-4 py-2 border rounded-lg text-left focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white flex items-center justify-between ${
                    error ? 'border-red-500' : 'border-gray-300'
                } ${!selectedOption ? 'text-gray-400' : 'text-gray-700'}`}
            >
                <span>{selectedOption ? selectedOption.label : placeholder}</span>
                <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'transform rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div
                    ref={dropdownRef}
                    className={`absolute left-0 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto z-[100] ${
                        dropdownPosition === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'
                    }`}
                >
                    {options.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                                if (!option.disabled) {
                                    onChange(option.value)
                                    setIsOpen(false)
                                }
                            }}
                            disabled={option.disabled}
                            className={`w-full text-left px-4 py-2 transition-colors ${
                                option.disabled
                                    ? 'text-gray-400 cursor-not-allowed bg-gray-50'
                                    : option.value === value
                                        ? 'bg-blue-50 text-blue-700 font-medium hover:bg-blue-100'
                                        : 'text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
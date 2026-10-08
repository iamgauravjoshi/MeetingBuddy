import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Joins class names, dropping falsy ones, and lets later Tailwind utilities override earlier conflicting ones,
 * so a caller's `className="mt-4"` wins over a component's default margin (DESIGN.md §4).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

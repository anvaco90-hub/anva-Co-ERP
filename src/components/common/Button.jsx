import React from 'react'
import { Loader2 } from 'lucide-react'

/**
 * ANVA & Co ERP Standard Button Component
 * @param {'primary' | 'secondary' | 'ghost' | 'danger' | 'icon'} variant
 * @param {'sm' | 'md'} size - 'sm' is 32px (tables/compact), 'md' is 40px (page primary)
 * @param {boolean} loading
 * @param {boolean} disabled
 * @param {React.ReactNode} icon
 * @param {string} tooltip
 */
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon = null,
  className = '',
  type = 'button',
  tooltip = '',
  as: Component = 'button',
  ...props
}) {
  const baseClasses =
    'inline-flex items-center justify-center font-medium transition-all duration-150 rounded-button select-none outline-none disabled:opacity-50 disabled:pointer-events-none cursor-pointer active:scale-[0.98]'

  const sizeClasses = {
    sm: variant === 'icon' ? 'h-8 w-8 p-1 text-xs' : 'h-8 px-3 text-xs gap-1.5',
    md: variant === 'icon' ? 'h-10 w-10 p-2 text-sm' : 'h-10 px-4 text-sm gap-2',
  }[size] || 'h-10 px-4 text-sm gap-2'

  const variantClasses = {
    primary:
      'bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white shadow-xs focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40 font-semibold',
    secondary:
      'border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-[var(--text)] shadow-xs focus-visible:ring-2 focus-visible:ring-[var(--primary)]/30',
    ghost:
      'bg-transparent hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] border-transparent',
    danger:
      'bg-[var(--danger)] hover:bg-rose-700 text-white shadow-xs focus-visible:ring-2 focus-visible:ring-rose-500/40 font-semibold',
    icon:
      'bg-transparent hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] border border-transparent hover:border-[var(--border)]',
  }[variant] || ''

  return (
    <Component
      type={Component === 'button' ? type : undefined}
      disabled={disabled || loading}
      title={tooltip}
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      {children && <span>{children}</span>}
    </Component>
  )
}

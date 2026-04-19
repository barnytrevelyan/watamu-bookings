import React from 'react';

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'outline';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default:
    'bg-gray-100 text-gray-700',
  secondary:
    'bg-[var(--color-primary-50)] text-[var(--color-primary-700)]',
  success:
    'bg-[var(--color-green-100)] text-[var(--color-green-700)]',
  warning:
    'bg-[var(--color-secondary-100)] text-[var(--color-secondary-700)]',
  danger:
    'bg-[var(--color-coral-100)] text-[var(--color-coral-700)]',
  info:
    'bg-[var(--color-primary-100)] text-[var(--color-primary-700)]',
  outline:
    'bg-transparent border border-gray-300 text-gray-600',
};

export function Badge({
  variant = 'default',
  children,
  className = '',
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
        ${variantClasses[variant]}
        ${className}
      `}
    >
      {children}
    </span>
  );
}

export default Badge;

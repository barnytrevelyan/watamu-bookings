import React from 'react';
import {
  Wifi,
  Car,
  Waves,
  UtensilsCrossed,
  Wind,
  Tv,
  ShowerHead,
  Flame,
  TreePine,
  Shield,
  Dog,
  Dumbbell,
  type LucideIcon,
} from 'lucide-react';

type AmenityCategory =
  | 'general'
  | 'outdoor'
  | 'kitchen'
  | 'safety'
  | 'entertainment'
  | 'bathroom';

interface AmenityBadgeProps {
  name: string;
  icon?: string;
  category?: AmenityCategory;
  className?: string;
}

const iconMap: Record<string, LucideIcon> = {
  wifi: Wifi,
  parking: Car,
  pool: Waves,
  kitchen: UtensilsCrossed,
  'air-conditioning': Wind,
  tv: Tv,
  shower: ShowerHead,
  bbq: Flame,
  garden: TreePine,
  security: Shield,
  'pet-friendly': Dog,
  gym: Dumbbell,
};

const categoryColors: Record<AmenityCategory, { bg: string; text: string; icon: string }> = {
  general: {
    bg: 'bg-[var(--color-primary-50)]',
    text: 'text-[var(--color-primary-700)]',
    icon: 'text-[var(--color-primary-500)]',
  },
  outdoor: {
    bg: 'bg-[var(--color-green-50)]',
    text: 'text-[var(--color-green-700)]',
    icon: 'text-[var(--color-green-500)]',
  },
  kitchen: {
    bg: 'bg-[var(--color-secondary-50)]',
    text: 'text-[var(--color-secondary-700)]',
    icon: 'text-[var(--color-secondary-500)]',
  },
  safety: {
    bg: 'bg-[var(--color-coral-50)]',
    text: 'text-[var(--color-coral-700)]',
    icon: 'text-[var(--color-coral-500)]',
  },
  entertainment: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    icon: 'text-purple-500',
  },
  bathroom: {
    bg: 'bg-cyan-50',
    text: 'text-cyan-700',
    icon: 'text-cyan-500',
  },
};

export default function AmenityBadge({
  name,
  icon,
  category = 'general',
  className = '',
}: AmenityBadgeProps) {
  const IconComponent = icon ? iconMap[icon] : null;
  const colors = categoryColors[category];

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
        ${colors.bg} ${colors.text}
        ${className}
      `}
    >
      {IconComponent && <IconComponent className={`h-3.5 w-3.5 ${colors.icon}`} />}
      {name}
    </span>
  );
}

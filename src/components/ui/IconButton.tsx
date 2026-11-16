import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  tip?: string;
  active?: boolean;
  children: ReactNode;
  size?: 'sm' | 'md';
}

export function IconButton({
  label,
  tip,
  active = false,
  children,
  size = 'md',
  className,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={cn('icon-button', size === 'sm' && 'icon-button-sm', active && 'is-active', className)}
      aria-label={label}
      aria-pressed={active || undefined}
      data-tip={tip ?? label}
      title={tip ?? label}
      {...props}
    >
      {children}
    </button>
  );
}

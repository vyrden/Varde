import type { HTMLAttributes, ReactElement, ReactNode } from 'react';

import { cn } from '../lib/cn.js';

export interface SidebarProps extends HTMLAttributes<HTMLElement> {
  readonly children?: ReactNode;
}

export function Sidebar({ className, children, ...props }: SidebarProps): ReactElement {
  return (
    <aside
      className={cn(
        'flex h-full w-56 flex-col gap-1 border-r border-border bg-card p-3 text-sm',
        className,
      )}
      {...props}
    >
      {children}
    </aside>
  );
}

export interface SidebarItemProps extends HTMLAttributes<HTMLDivElement> {
  readonly active?: boolean;
}

export function SidebarItem({
  className,
  active = false,
  ...props
}: SidebarItemProps): ReactElement {
  return (
    <div
      className={cn(
        'cursor-pointer rounded-md px-3 py-2 transition-colors hover:bg-accent hover:text-accent-foreground',
        active && 'bg-accent text-accent-foreground',
        className,
      )}
      {...props}
    />
  );
}

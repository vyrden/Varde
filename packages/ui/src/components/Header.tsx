import type { HTMLAttributes, ReactElement, ReactNode } from 'react';

import { cn } from '../lib/cn.js';

export interface HeaderProps extends HTMLAttributes<HTMLElement> {
  readonly brand?: ReactNode;
  readonly actions?: ReactNode;
}

export function Header({
  brand,
  actions,
  className,
  children,
  ...props
}: HeaderProps): ReactElement {
  return (
    <header
      className={cn(
        'sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-border bg-background/80 px-4 backdrop-blur',
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-3 font-semibold">{brand}</div>
      {children ? <div className="flex-1">{children}</div> : null}
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

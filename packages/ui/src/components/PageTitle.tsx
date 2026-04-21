import type { HTMLAttributes, ReactElement, ReactNode } from 'react';

import { cn } from '../lib/cn.js';

export interface PageTitleProps extends HTMLAttributes<HTMLDivElement> {
  readonly title: string;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
}

export function PageTitle({
  title,
  description,
  actions,
  className,
  ...props
}: PageTitleProps): ReactElement {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
      {...props}
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

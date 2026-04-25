import type { ReactNode } from 'react';

/**
 * Icônes SVG par module — partagées entre la sidebar (16 px) et les
 * cards de la liste modules (sized par le caller via le wrapper).
 * `currentColor` : héritent la couleur du parent, ce qui permet de les
 * teinter au hover.
 */
export function moduleIcon(id: string, size: number): ReactNode {
  const props = { width: size, height: size, viewBox: '0 0 16 16', fill: 'none' as const };
  switch (id) {
    case 'logs':
      return (
        <svg {...props} aria-hidden="true">
          <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 7h6M5 9.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case 'reaction-roles':
      return (
        <svg {...props} aria-hidden="true">
          <path
            d="M8 14s-6-4-6-8a6 6 0 0112 0c0 4-6 8-6 8z"
            stroke="currentColor"
            strokeWidth="1.4"
          />
        </svg>
      );
    case 'welcome':
      return (
        <svg {...props} aria-hidden="true">
          <path
            d="M8 2C4.7 2 2 4.7 2 8s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6zm0 2.5a2 2 0 110 4 2 2 0 010-4zm0 7.5c-1.5 0-2.8-.67-3.75-1.74C5.16 9.58 6.51 9 8 9s2.84.58 3.75 1.26C10.8 11.33 9.5 12 8 12z"
            fill="currentColor"
          />
        </svg>
      );
    case 'moderation':
      return (
        <svg {...props} aria-hidden="true">
          <path
            d="M8 2l4 2v4c0 2.5-1.5 4.5-4 5.5C5.5 12.5 4 10.5 4 8V4l4-2z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'hello-world':
      return (
        <svg {...props} aria-hidden="true">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M5.5 9c.5.7 1.4 1.2 2.5 1.2s2-.5 2.5-1.2"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <circle cx="6" cy="6.5" r="0.7" fill="currentColor" />
          <circle cx="10" cy="6.5" r="0.7" fill="currentColor" />
        </svg>
      );
    default:
      return (
        <svg {...props} aria-hidden="true">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
  }
}

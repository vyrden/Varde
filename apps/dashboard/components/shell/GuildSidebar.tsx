'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactElement, ReactNode } from 'react';

interface ModuleEntry {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly hasDedicatedPage: boolean;
}

export interface GuildSidebarProps {
  readonly guildId: string;
  readonly guildName: string;
  readonly modules: readonly ModuleEntry[];
}

interface NavLink {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly icon: ReactNode;
  readonly statusDot?: 'on' | 'off';
}

const iconModules = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor" />
    <rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor" />
    <rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor" />
    <rect x="9" y="9" width="5" height="5" rx="1" fill="currentColor" />
  </svg>
);

const iconAudit = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 4h10M3 8h10M3 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const iconOnboarding = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 5v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
  </svg>
);

const iconPermissions = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M3 13.5c0-2.76 2.24-5 5-5s5 2.24 5 5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

const iconAi = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M8 2l1.5 4.5H14l-3.5 2.5L12 13.5 8 11l-4 2.5 1.5-4.5L2 6.5h4.5L8 2z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  </svg>
);

const iconForModule = (id: string): ReactNode => {
  switch (id) {
    case 'logs':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 7h6M5 9.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case 'reaction-roles':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M8 14s-6-4-6-8a6 6 0 0112 0c0 4-6 8-6 8z"
            stroke="currentColor"
            strokeWidth="1.4"
          />
        </svg>
      );
    case 'welcome':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M8 2C4.7 2 2 4.7 2 8s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6zm0 2.5a2 2 0 110 4 2 2 0 010-4zm0 7.5c-1.5 0-2.8-.67-3.75-1.74C5.16 9.58 6.51 9 8 9s2.84.58 3.75 1.26C10.8 11.33 9.5 12 8 12z"
            fill="currentColor"
          />
        </svg>
      );
    case 'moderation':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M8 2l4 2v4c0 2.5-1.5 4.5-4 5.5C5.5 12.5 4 10.5 4 8V4l4-2z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
  }
};

interface SidebarSectionProps {
  readonly label: string;
  readonly items: readonly NavLink[];
  readonly currentPath: string;
}

function SidebarSection({ label, items, currentPath }: SidebarSectionProps): ReactElement {
  return (
    <div className="px-3 pt-3 pb-1">
      <p className="px-2 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <ul className="space-y-0.5">
        {items.map((it) => {
          const active = currentPath === it.href || currentPath.startsWith(`${it.href}/`);
          return (
            <li key={it.key}>
              <Link
                href={it.href}
                aria-current={active ? 'page' : undefined}
                className={`group flex items-center gap-3 rounded px-2.5 py-2 text-[14px] font-medium transition-all duration-100 ease-out ${
                  active
                    ? 'bg-surface-active text-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center transition-opacity duration-100 ease-out ${active ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'}`}
                >
                  {it.icon}
                </span>
                <span className="flex-1 truncate">{it.label}</span>
                {it.statusDot ? (
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 shrink-0 rounded-full transition-colors ${
                      it.statusDot === 'on' ? 'bg-success' : 'bg-muted-foreground/40'
                    }`}
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Sidebar de navigation pour une guild sélectionnée. 232 px, fond
 * `--sidebar` Discord. 3 sections : Gestion (modules / audit /
 * onboarding), Paramètres (permissions / IA), Modules (un lien par
 * module avec page dédiée + pastille d'état).
 */
export function GuildSidebar({ guildId, guildName, modules }: GuildSidebarProps): ReactElement {
  const pathname = usePathname() ?? '';

  const gestion: NavLink[] = [
    { key: 'modules', label: 'Modules', href: `/guilds/${guildId}`, icon: iconModules },
    { key: 'audit', label: 'Audit', href: `/guilds/${guildId}/audit`, icon: iconAudit },
    {
      key: 'onboarding',
      label: 'Onboarding',
      href: `/guilds/${guildId}/onboarding`,
      icon: iconOnboarding,
    },
  ];

  const settings: NavLink[] = [
    {
      key: 'permissions',
      label: 'Permissions',
      href: `/guilds/${guildId}/settings/permissions`,
      icon: iconPermissions,
    },
    {
      key: 'ai',
      label: 'Fournisseur IA',
      href: `/guilds/${guildId}/settings/ai`,
      icon: iconAi,
    },
  ];

  const moduleLinks: NavLink[] = modules
    .filter((m) => m.hasDedicatedPage)
    .map((m) => ({
      key: m.id,
      label: m.name,
      href: `/guilds/${guildId}/modules/${m.id}`,
      icon: iconForModule(m.id),
      statusDot: m.enabled ? 'on' : 'off',
    }));

  return (
    <aside
      aria-label={`Navigation pour ${guildName}`}
      className="flex w-64 shrink-0 flex-col overflow-y-auto bg-sidebar"
    >
      <div className="flex h-16 shrink-0 items-center border-b border-black/30 px-5 shadow-sm">
        <span
          className="truncate text-lg font-bold leading-tight tracking-tight text-foreground"
          title={guildName}
        >
          {guildName}
        </span>
      </div>

      <div className="space-y-1 py-2">
        <SidebarSection label="Gestion" items={gestion} currentPath={pathname} />
        <SidebarSection label="Paramètres" items={settings} currentPath={pathname} />
        {moduleLinks.length > 0 ? (
          <SidebarSection label="Modules" items={moduleLinks} currentPath={pathname} />
        ) : null}
      </div>

      <div className="mt-auto" />
    </aside>
  );
}

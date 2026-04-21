import { Button, EmptyState, PageTitle } from '@varde/ui';
import type { ReactElement } from 'react';

export default function Page(): ReactElement {
  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <PageTitle
        title="Varde"
        description="Dashboard en construction. Le jalon 2 câble l'authentification et les pages de configuration."
      />
      <div className="mt-6">
        <EmptyState
          title="Pas encore connecté"
          description="Le flux de login Discord arrive au prochain jalon."
          action={
            <Button variant="secondary" disabled>
              Se connecter avec Discord
            </Button>
          }
        />
      </div>
    </main>
  );
}

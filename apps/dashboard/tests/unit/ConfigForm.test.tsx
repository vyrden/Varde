import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ConfigUi } from '@varde/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const saveModuleConfig = vi.fn();

vi.mock('../../lib/actions', () => ({
  saveModuleConfig: (...args: unknown[]) => saveModuleConfig(...args),
}));

import { ConfigForm } from '../../components/ConfigForm';

const helloWorldUi: ConfigUi = {
  fields: [
    {
      path: 'welcomeDelayMs',
      label: "Délai d'accueil (ms)",
      widget: 'number',
      description: 'Entre 0 et 60000.',
      placeholder: '300',
      order: 1,
    },
  ],
};

const multiWidgetUi: ConfigUi = {
  fields: [
    { path: 'name', label: 'Nom', widget: 'text', order: 1 },
    { path: 'enabled', label: 'Actif', widget: 'toggle', order: 2 },
    {
      path: 'tone',
      label: 'Ton',
      widget: 'select',
      options: [
        { value: 'friendly', label: 'Amical' },
        { value: 'formal', label: 'Formel' },
      ],
      order: 3,
    },
    { path: 'bio', label: 'Bio', widget: 'textarea', order: 4 },
  ],
};

describe('ConfigForm', () => {
  beforeEach(() => {
    saveModuleConfig.mockReset();
  });

  it('pré-remplit un champ number depuis initialValues', () => {
    saveModuleConfig.mockResolvedValue({ ok: true });
    render(
      <ConfigForm
        guildId="g1"
        moduleId="hello-world"
        moduleName="Hello World"
        ui={helloWorldUi}
        initialValues={{ welcomeDelayMs: 500 }}
      />,
    );
    const input = screen.getByLabelText("Délai d'accueil (ms)") as HTMLInputElement;
    expect(input.value).toBe('500');
    expect(input.type).toBe('number');
  });

  it('soumet la valeur convertie en number', async () => {
    saveModuleConfig.mockResolvedValue({ ok: true });
    render(
      <ConfigForm
        guildId="g1"
        moduleId="hello-world"
        moduleName="Hello World"
        ui={helloWorldUi}
        initialValues={{ welcomeDelayMs: 300 }}
      />,
    );
    const input = screen.getByLabelText("Délai d'accueil (ms)") as HTMLInputElement;
    fireEvent.change(input, { target: { value: '1200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(saveModuleConfig).toHaveBeenCalledTimes(1));
    expect(saveModuleConfig).toHaveBeenCalledWith('g1', 'hello-world', {
      welcomeDelayMs: 1200,
    });
    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('Configuration enregistrée.');
  });

  it('affiche les issues Zod par champ quand la sauvegarde échoue en 400', async () => {
    saveModuleConfig.mockResolvedValue({
      ok: false,
      status: 400,
      code: 'invalid_config',
      details: [{ path: ['welcomeDelayMs'], message: 'Expected number, received string' }],
    });
    render(
      <ConfigForm
        guildId="g1"
        moduleId="hello-world"
        moduleName="Hello World"
        ui={helloWorldUi}
        initialValues={{ welcomeDelayMs: 300 }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(screen.getByText('Expected number, received string')).toBeDefined());
    // Pas de message de succès
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('affiche un message d erreur générique hors 400', async () => {
    saveModuleConfig.mockResolvedValue({
      ok: false,
      status: 403,
      code: 'forbidden',
      message: 'Pas les droits.',
    });
    render(
      <ConfigForm
        guildId="g1"
        moduleId="hello-world"
        moduleName="Hello World"
        ui={helloWorldUi}
        initialValues={{}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Pas les droits.');
    });
  });

  it('rend tous les widgets et envoie les types correctement', async () => {
    saveModuleConfig.mockResolvedValue({ ok: true });
    render(
      <ConfigForm
        guildId="g1"
        moduleId="multi"
        moduleName="Multi"
        ui={multiWidgetUi}
        initialValues={{ name: 'Alice', enabled: false, tone: 'friendly', bio: 'Hi.' }}
      />,
    );

    // Mutation sur chaque widget
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Bob' } });
    fireEvent.click(screen.getByLabelText('Actif')); // toggle → true
    fireEvent.change(screen.getByLabelText('Ton'), { target: { value: 'formal' } });
    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'Bonjour.' } });

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(saveModuleConfig).toHaveBeenCalledTimes(1));

    expect(saveModuleConfig).toHaveBeenCalledWith('g1', 'multi', {
      name: 'Bob',
      enabled: true,
      tone: 'formal',
      bio: 'Bonjour.',
    });
  });

  it('bloque le submit et affiche les issues quand la validation client échoue (min)', async () => {
    saveModuleConfig.mockResolvedValue({ ok: true });
    const schema = {
      type: 'object',
      properties: {
        welcomeDelayMs: { type: 'integer', minimum: 0, maximum: 60000 },
      },
    };
    render(
      <ConfigForm
        guildId="g1"
        moduleId="hello-world"
        moduleName="Hello World"
        ui={helloWorldUi}
        initialValues={{ welcomeDelayMs: 300 }}
        schema={schema}
      />,
    );
    fireEvent.change(screen.getByLabelText("Délai d'accueil (ms)"), {
      target: { value: '-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(
        screen.getByText(
          (text) => text.toLowerCase().includes('>=') || text.toLowerCase().includes('minimum'),
        ),
      ).toBeDefined(),
    );
    expect(saveModuleConfig).not.toHaveBeenCalled();
  });

  it('laisse passer le submit quand la validation client est OK', async () => {
    saveModuleConfig.mockResolvedValue({ ok: true });
    const schema = {
      type: 'object',
      properties: {
        welcomeDelayMs: { type: 'integer', minimum: 0, maximum: 60000 },
      },
    };
    render(
      <ConfigForm
        guildId="g1"
        moduleId="hello-world"
        moduleName="Hello World"
        ui={helloWorldUi}
        initialValues={{ welcomeDelayMs: 300 }}
        schema={schema}
      />,
    );
    fireEvent.change(screen.getByLabelText("Délai d'accueil (ms)"), {
      target: { value: '1200' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(saveModuleConfig).toHaveBeenCalledTimes(1));
    expect(saveModuleConfig).toHaveBeenCalledWith('g1', 'hello-world', {
      welcomeDelayMs: 1200,
    });
  });

  it('supporte les paths pointés (nested object)', async () => {
    saveModuleConfig.mockResolvedValue({ ok: true });
    const ui: ConfigUi = {
      fields: [{ path: 'moderation.threshold', label: 'Seuil', widget: 'number', order: 1 }],
    };
    render(
      <ConfigForm
        guildId="g1"
        moduleId="mod"
        moduleName="Mod"
        ui={ui}
        initialValues={{ moderation: { threshold: 3 } }}
      />,
    );
    const input = screen.getByLabelText('Seuil') as HTMLInputElement;
    expect(input.value).toBe('3');
    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(saveModuleConfig).toHaveBeenCalledTimes(1));
    expect(saveModuleConfig).toHaveBeenCalledWith('g1', 'mod', {
      moderation: { threshold: 7 },
    });
  });
});

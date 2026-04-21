import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const saveAiSettings = vi.fn();
const testAiSettings = vi.fn();

vi.mock('../../../lib/ai-settings-actions', () => ({
  saveAiSettings: (...args: unknown[]) => saveAiSettings(...args),
  testAiSettings: (...args: unknown[]) => testAiSettings(...args),
}));

import { AIProviderForm } from '../../../components/settings/AIProviderForm';
import type { AiSettingsDto } from '../../../lib/ai-settings-client';

const initialNone: AiSettingsDto = {
  providerId: 'none',
  endpoint: null,
  model: null,
  hasApiKey: false,
  updatedAt: null,
};

const initialOpenAI: AiSettingsDto = {
  providerId: 'openai-compat',
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  hasApiKey: true,
  updatedAt: new Date().toISOString(),
};

describe('AIProviderForm', () => {
  beforeEach(() => {
    saveAiSettings.mockReset();
    testAiSettings.mockReset();
  });

  it('affiche none par défaut et ne montre ni endpoint ni apiKey', () => {
    render(<AIProviderForm guildId="g1" initial={initialNone} />);
    expect(screen.queryByLabelText('Endpoint')).toBeNull();
    expect(screen.queryByLabelText('API key')).toBeNull();
  });

  it('bascule vers openai-compat et révèle endpoint + model + apiKey', () => {
    render(<AIProviderForm guildId="g1" initial={initialNone} />);
    const select = screen.getByLabelText('Provider') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'openai-compat' } });

    expect((screen.getByLabelText('Endpoint') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Modèle') as HTMLInputElement).value).toBe('');
    expect(screen.getByLabelText('API key')).toBeTruthy();
  });

  it('pré-remplit depuis un initial openai-compat existant et marque la clé comme enregistrée', () => {
    render(<AIProviderForm guildId="g1" initial={initialOpenAI} />);
    expect((screen.getByLabelText('Endpoint') as HTMLInputElement).value).toBe(
      'https://api.openai.com/v1',
    );
    expect((screen.getByLabelText('Modèle') as HTMLInputElement).value).toBe('gpt-4o-mini');
    const apikey = screen.getByLabelText('API key') as HTMLInputElement;
    expect(apikey.placeholder).toContain('enregistrée');
  });

  it('soumet ollama en construisant le body attendu', async () => {
    saveAiSettings.mockResolvedValue({ ok: true });
    render(<AIProviderForm guildId="g1" initial={initialNone} />);
    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'ollama' } });
    fireEvent.change(screen.getByLabelText('Endpoint'), {
      target: { value: 'http://localhost:11434' },
    });
    fireEvent.change(screen.getByLabelText('Modèle'), { target: { value: 'llama3.1:8b' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(saveAiSettings).toHaveBeenCalledTimes(1));
    expect(saveAiSettings).toHaveBeenCalledWith('g1', {
      providerId: 'ollama',
      endpoint: 'http://localhost:11434',
      model: 'llama3.1:8b',
    });
  });

  it('le bouton Tester appelle testAiSettings et affiche la latence', async () => {
    testAiSettings.mockResolvedValue({
      ok: true,
      data: { providerId: 'ollama', model: 'llama3.1:8b', ok: true, latencyMs: 412 },
    });
    render(<AIProviderForm guildId="g1" initial={initialNone} />);
    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'ollama' } });
    fireEvent.change(screen.getByLabelText('Endpoint'), {
      target: { value: 'http://localhost:11434' },
    });
    fireEvent.change(screen.getByLabelText('Modèle'), { target: { value: 'llama3.1:8b' } });
    fireEvent.click(screen.getByRole('button', { name: /tester/i }));

    await waitFor(() => expect(testAiSettings).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const status = screen.getByRole('status');
      expect(status.textContent).toContain('412');
    });
  });

  it('refuse un submit openai-compat sans endpoint', async () => {
    render(<AIProviderForm guildId="g1" initial={initialNone} />);
    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'openai-compat' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('endpoint');
    });
    expect(saveAiSettings).not.toHaveBeenCalled();
  });
});

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
    fireEvent.click(screen.getByLabelText('OpenAI-compatible'));

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

  it('soumet ollama en construisant un FormData avec les champs attendus', async () => {
    saveAiSettings.mockResolvedValue({ ok: true });
    render(<AIProviderForm guildId="g1" initial={initialNone} />);
    fireEvent.click(screen.getByLabelText('Ollama'));
    fireEvent.change(screen.getByLabelText('Endpoint'), {
      target: { value: 'http://localhost:11434' },
    });
    fireEvent.change(screen.getByLabelText('Modèle'), { target: { value: 'llama3.1:8b' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(saveAiSettings).toHaveBeenCalledTimes(1));
    const [guildArg, formDataArg] = saveAiSettings.mock.calls[0] ?? [];
    expect(guildArg).toBe('g1');
    expect(formDataArg).toBeInstanceOf(FormData);
    const fd = formDataArg as FormData;
    expect(fd.get('providerId')).toBe('ollama');
    expect(fd.get('endpoint')).toBe('http://localhost:11434');
    expect(fd.get('model')).toBe('llama3.1:8b');
    expect(fd.has('apiKey')).toBe(false);
  });

  it('soumet openai-compat avec une apiKey via FormData (pas d objet JS expansé)', async () => {
    saveAiSettings.mockResolvedValue({ ok: true });
    render(<AIProviderForm guildId="g1" initial={initialNone} />);
    fireEvent.click(screen.getByLabelText('OpenAI-compatible'));
    fireEvent.change(screen.getByLabelText('Endpoint'), {
      target: { value: 'https://api.openai.com/v1' },
    });
    fireEvent.change(screen.getByLabelText('Modèle'), { target: { value: 'gpt-4o-mini' } });
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'sk-test-secret' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(saveAiSettings).toHaveBeenCalledTimes(1));
    const [, formDataArg] = saveAiSettings.mock.calls[0] ?? [];
    expect(formDataArg).toBeInstanceOf(FormData);
    const fd = formDataArg as FormData;
    expect(fd.get('providerId')).toBe('openai-compat');
    expect(fd.get('apiKey')).toBe('sk-test-secret');
  });

  it('le bouton Tester appelle testAiSettings et affiche la latence', async () => {
    testAiSettings.mockResolvedValue({
      ok: true,
      data: { providerId: 'ollama', model: 'llama3.1:8b', ok: true, latencyMs: 412 },
    });
    render(<AIProviderForm guildId="g1" initial={initialNone} />);
    fireEvent.click(screen.getByLabelText('Ollama'));
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
    fireEvent.click(screen.getByLabelText('OpenAI-compatible'));
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('endpoint');
    });
    expect(saveAiSettings).not.toHaveBeenCalled();
  });
});

'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@varde/ui';
import { type FormEvent, type ReactElement, useState } from 'react';

import {
  type AiSettingsMutationResult,
  type AiTestResult,
  saveAiSettings,
  testAiSettings,
} from '../../lib/ai-settings-actions';
import type { AiProviderId, AiSettingsDto } from '../../lib/ai-settings-client';

export interface AIProviderFormProps {
  readonly guildId: string;
  readonly initial: AiSettingsDto;
}

interface FormState {
  readonly providerId: AiProviderId;
  readonly endpoint: string;
  readonly model: string;
  readonly apiKey: string;
}

const stateFrom = (initial: AiSettingsDto): FormState => ({
  providerId: initial.providerId,
  endpoint: initial.endpoint ?? '',
  model: initial.model ?? '',
  apiKey: '',
});

/**
 * Form instance-level pour brancher un provider IA (V1 : par guild).
 * Trois choix : none (stub local, aucun réseau), ollama (endpoint +
 * model, aucune clé), openai-compat (endpoint + model + clé, la clé
 * est chiffrée côté API dans le keystore et ne ressort jamais en
 * clair — le formulaire affiche seulement "Une clé est enregistrée"
 * quand `hasApiKey` est `true`).
 *
 * Les deux boutons appellent deux server actions distinctes :
 * `Tester la connexion` n'écrit rien, construit un provider éphémère
 * côté API et renvoie `ProviderInfo`. `Enregistrer` persiste sans
 * tester. L'admin peut enchaîner test → sauvegarde, ou l'inverse.
 */
export function AIProviderForm({ guildId, initial }: AIProviderFormProps): ReactElement {
  const [state, setState] = useState<FormState>(() => stateFrom(initial));
  const [hasStoredKey, setHasStoredKey] = useState(initial.hasApiKey);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveResult, setSaveResult] = useState<AiSettingsMutationResult | null>(null);
  const [testResult, setTestResult] = useState<AiTestResult | null>(null);

  /**
   * Construit un FormData à partir du state. Passé en argument aux
   * server actions `saveAiSettings` / `testAiSettings` — Next.js
   * Turbopack ne sérialise pas le contenu des FormData dans ses dev
   * logs, ce qui évite de voir la clé API en clair côté terminal.
   */
  const formDataFromState = (): FormData => {
    const formData = new FormData();
    formData.set('providerId', state.providerId);
    if (state.providerId !== 'none') {
      formData.set('endpoint', state.endpoint);
      formData.set('model', state.model);
    }
    if (state.providerId === 'openai-compat' && state.apiKey.length > 0) {
      formData.set('apiKey', state.apiKey);
    }
    return formData;
  };

  const validate = (): { error: string } | null => {
    if (state.providerId === 'none') return null;
    if (state.endpoint.trim().length === 0) return { error: 'endpoint requis' };
    if (state.model.trim().length === 0) return { error: 'model requis' };
    return null;
  };

  const onSave = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSaveResult(null);
    setTestResult(null);
    const err = validate();
    if (err) {
      setSaveResult({ ok: false, message: err.error });
      return;
    }
    setSaving(true);
    try {
      const result = await saveAiSettings(guildId, formDataFromState());
      setSaveResult(result);
      if (result.ok) {
        // Update stored key indicator without full reload.
        if (state.providerId === 'none' || state.providerId === 'ollama') {
          setHasStoredKey(false);
        } else if (state.apiKey.length > 0) {
          setHasStoredKey(true);
          setState((prev) => ({ ...prev, apiKey: '' }));
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const onTest = async (): Promise<void> => {
    setSaveResult(null);
    setTestResult(null);
    const err = validate();
    if (err) {
      setTestResult({ ok: false, message: err.error });
      return;
    }
    setTesting(true);
    try {
      const result = await testAiSettings(guildId, formDataFromState());
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  };

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const needsEndpointAndModel = state.providerId !== 'none';
  const needsApiKey = state.providerId === 'openai-compat';

  return (
    <form onSubmit={onSave} className="space-y-6" aria-label="Paramètres IA">
      <Card>
        <CardHeader>
          <CardTitle>Provider IA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ai-provider">Provider</Label>
            <select
              id="ai-provider"
              name="providerId"
              value={state.providerId}
              onChange={(e) => updateField('providerId', e.target.value as AiProviderId)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="none">Aucun (stub local, sans réseau)</option>
              <option value="ollama">Ollama (auto-hébergé)</option>
              <option value="openai-compat">
                OpenAI-compatible (OpenAI / OpenRouter / Groq / vLLM / LM Studio)
              </option>
            </select>
            <p className="text-xs text-muted-foreground">
              `none` garde tout local via un stub déterministe. `ollama` et `openai-compat` sortent
              du réseau vers l'endpoint indiqué — la clé éventuelle est chiffrée en base, pas
              loggée, pas renvoyée en clair.
            </p>
          </div>

          {needsEndpointAndModel ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="ai-endpoint">Endpoint</Label>
                <Input
                  id="ai-endpoint"
                  name="endpoint"
                  value={state.endpoint}
                  onChange={(e) => updateField('endpoint', e.target.value)}
                  placeholder={
                    state.providerId === 'ollama'
                      ? 'http://localhost:11434'
                      : 'https://api.openai.com/v1'
                  }
                  type="url"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ai-model">Modèle</Label>
                <Input
                  id="ai-model"
                  name="model"
                  value={state.model}
                  onChange={(e) => updateField('model', e.target.value)}
                  placeholder={state.providerId === 'ollama' ? 'llama3.1:8b' : 'gpt-4o-mini'}
                />
              </div>
            </>
          ) : null}

          {needsApiKey ? (
            <div className="space-y-2">
              <Label htmlFor="ai-apikey">API key</Label>
              <Input
                id="ai-apikey"
                name="apiKey"
                type="password"
                value={state.apiKey}
                onChange={(e) => updateField('apiKey', e.target.value)}
                placeholder={hasStoredKey ? '••••••••  (une clé est enregistrée)' : 'sk-...'}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                {hasStoredKey
                  ? 'Laisser vide pour conserver la clé existante. Renseigner pour la remplacer.'
                  : 'La clé est chiffrée côté serveur (AES-256-GCM) et ne transite plus jamais en clair.'}
              </p>
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
            <Button type="button" variant="outline" onClick={onTest} disabled={testing}>
              {testing ? 'Test en cours...' : 'Tester la connexion'}
            </Button>
          </div>

          {saveResult?.ok === true ? (
            <p role="status" className="text-sm text-emerald-600">
              Paramètres enregistrés.
            </p>
          ) : null}
          {saveResult?.ok === false ? (
            <p role="alert" className="text-sm text-destructive">
              {saveResult.message ?? `Erreur ${saveResult.status ?? ''} (${saveResult.code ?? ''})`}
            </p>
          ) : null}

          {testResult?.ok === true && testResult.data ? (
            <p role="status" className="text-sm text-emerald-600">
              {testResult.data.ok
                ? `Provider ok : ${testResult.data.model} — ${testResult.data.latencyMs} ms${testResult.data.details ? ` — ${testResult.data.details}` : ''}`
                : `Provider joignable mais pas prêt : ${testResult.data.details ?? 'raison non fournie'}`}
            </p>
          ) : null}
          {testResult?.ok === false ? (
            <p role="alert" className="text-sm text-destructive">
              {testResult.message ?? `Erreur ${testResult.status ?? ''} (${testResult.code ?? ''})`}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </form>
  );
}

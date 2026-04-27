'use client';

import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@varde/ui';
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

interface ProviderOption {
  readonly id: AiProviderId;
  readonly label: string;
  readonly tagline: string;
  readonly description: string;
  readonly icon: string;
}

const PROVIDERS: ReadonlyArray<ProviderOption> = [
  {
    id: 'none',
    label: 'Aucun',
    tagline: 'Stub local',
    description: 'Sans réseau, déterministe. Idéal pour développer hors-ligne.',
    icon: '🔒',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    tagline: 'Auto-hébergé',
    description: 'Tourne sur ta machine ou un serveur que tu contrôles.',
    icon: '🦙',
  },
  {
    id: 'openai-compat',
    label: 'OpenAI-compatible',
    tagline: 'OpenAI, Groq, OpenRouter…',
    description: 'API tierce. Clé chiffrée AES-256 côté serveur, jamais loggée.',
    icon: '⚡',
  },
];

const stateFrom = (initial: AiSettingsDto): FormState => ({
  providerId: initial.providerId,
  endpoint: initial.endpoint ?? '',
  model: initial.model ?? '',
  apiKey: '',
});

// --- Icônes ---

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M1.5 8C2.8 4.5 5.2 3 8 3s5.2 1.5 6.5 5c-1.3 3.5-3.7 5-6.5 5s-5.2-1.5-6.5-5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 2l12 12M3 5.5C2.4 6.2 1.9 7.1 1.5 8c1.3 3.5 3.7 5 6.5 5 1.1 0 2.2-.2 3.1-.7M6 4c.6-.5 1.3-.8 2-.9C10.8 2.7 13.2 4.5 14.5 8c-.4.9-.9 1.6-1.5 2.3M6.5 6.5a2 2 0 002.8 2.8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 6v3.5M7 4.2v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

interface ConnectionStatusCardProps {
  readonly testing: boolean;
  readonly testResult: AiTestResult | null;
  readonly canTest: boolean;
  readonly onTest: () => void;
  readonly endpoint: string;
}

function ConnectionStatusCard({
  testing,
  testResult,
  canTest,
  onTest,
  endpoint,
}: ConnectionStatusCardProps): ReactElement {
  const dotClass = testing
    ? 'bg-muted-foreground animate-pulse'
    : testResult === null
      ? 'bg-muted-foreground/40'
      : testResult.ok && testResult.data?.ok
        ? 'bg-success'
        : 'bg-destructive';

  let statusLine: ReactElement;
  if (testing) {
    statusLine = <span className="text-foreground">Test en cours…</span>;
  } else if (testResult === null) {
    statusLine = <span className="text-muted-foreground">Connexion non testée</span>;
  } else if (testResult.ok && testResult.data) {
    statusLine = (
      <span className={testResult.data.ok ? 'text-success' : 'text-warning'}>
        {testResult.data.ok ? 'Connecté' : 'Joignable mais pas prêt'}
      </span>
    );
  } else {
    statusLine = (
      <span className="text-destructive">
        {testResult.message ?? `Erreur ${testResult.status ?? ''}`.trim()}
      </span>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Statut de connexion</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
          {statusLine}
        </div>
        {testResult?.ok === true && testResult.data ? (
          <div role="status" className="space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between gap-2">
              <span>Modèle</span>
              <span className="truncate font-mono text-foreground">{testResult.data.model}</span>
            </div>
            {endpoint ? (
              <div className="flex justify-between gap-2">
                <span>Endpoint</span>
                <span className="truncate font-mono text-foreground">{endpoint}</span>
              </div>
            ) : null}
            <div className="flex justify-between gap-2">
              <span>Latence</span>
              <span className="font-mono text-foreground">{testResult.data.latencyMs} ms</span>
            </div>
            {testResult.data.details ? (
              <p className="pt-1 text-muted-foreground">{testResult.data.details}</p>
            ) : null}
          </div>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onTest}
          disabled={testing || !canTest}
          title={!canTest ? 'Renseigne endpoint et modèle pour pouvoir tester' : undefined}
        >
          {testing ? 'Test en cours…' : 'Tester la connexion'}
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Form paramètres IA (V1 : par guild). Layout 2 colonnes — main avec
 * sélection en cards + formulaire conditionnel + footer Sauvegarder,
 * sidebar avec « Statut de connexion » (qui porte le bouton Tester) et
 * « À propos ».
 *
 * Trois choix : `none` (stub local, aucun réseau), `ollama` (endpoint +
 * modèle, aucune clé), `openai-compat` (endpoint + modèle + clé). La
 * clé est chiffrée côté API dans le keystore et ne ressort jamais en
 * clair — un badge « Enregistrée » remplace l'input quand `hasApiKey`
 * est `true`.
 */
export function AIProviderForm({ guildId, initial }: AIProviderFormProps): ReactElement {
  const [state, setState] = useState<FormState>(() => stateFrom(initial));
  const [hasStoredKey, setHasStoredKey] = useState(initial.hasApiKey);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveResult, setSaveResult] = useState<AiSettingsMutationResult | null>(null);
  const [testResult, setTestResult] = useState<AiTestResult | null>(null);

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

  const selectProvider = (next: AiProviderId): void => {
    setState((prev) => ({ ...prev, providerId: next }));
    // Reset le résultat de test quand on change de provider — il
    // référence l'ancien provider et serait trompeur.
    setTestResult(null);
  };

  const needsEndpointAndModel = state.providerId !== 'none';
  const needsApiKey = state.providerId === 'openai-compat';
  const canTest =
    state.providerId === 'none' || (state.endpoint.length > 0 && state.model.length > 0);

  return (
    <form
      onSubmit={onSave}
      className="grid grid-cols-1 gap-6 lg:grid-cols-3"
      aria-label="Paramètres IA"
    >
      <div className="flex flex-col gap-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Provider IA</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <fieldset>
              <legend className="sr-only">Provider IA</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {PROVIDERS.map((p) => {
                  const active = state.providerId === p.id;
                  return (
                    <label
                      key={p.id}
                      className={`group relative flex cursor-pointer flex-col gap-1.5 rounded-lg border p-3 text-sm transition-colors duration-100 ease-out ${
                        active
                          ? 'border-primary bg-primary/5 shadow-[0_0_0_1px_var(--primary)]'
                          : 'border-border bg-card hover:border-muted-foreground'
                      }`}
                    >
                      <input
                        type="radio"
                        name="providerId"
                        value={p.id}
                        checked={active}
                        onChange={() => selectProvider(p.id)}
                        aria-label={p.label}
                        className="sr-only"
                      />
                      <div className="flex items-center gap-2">
                        <span aria-hidden="true" className="text-lg leading-none">
                          {p.icon}
                        </span>
                        <span className="font-medium text-foreground">{p.label}</span>
                        {active ? (
                          <Badge variant="default" className="ml-auto text-[9px]">
                            Sélectionné
                          </Badge>
                        ) : null}
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">{p.tagline}</span>
                      <span className="text-xs text-muted-foreground">{p.description}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {state.providerId === 'none' ? (
              <div className="flex gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                <span className="mt-0.5 shrink-0">
                  <InfoIcon />
                </span>
                <span>
                  Le stub local répond de façon déterministe sans appel réseau. Aucune configuration
                  supplémentaire n'est requise — clique sur Enregistrer pour valider.
                </span>
              </div>
            ) : null}

            {needsEndpointAndModel ? (
              <>
                <div className="space-y-1.5">
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
                <div className="space-y-1.5">
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

            {state.providerId === 'ollama' ? (
              <div className="flex gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                <span className="mt-0.5 shrink-0">
                  <InfoIcon />
                </span>
                <span>
                  Ollama doit être lancé et accessible depuis le serveur Varde (souvent{' '}
                  <code>http://host.docker.internal:11434</code> en Docker).
                </span>
              </div>
            ) : null}

            {needsApiKey ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="ai-apikey">API key</Label>
                  {hasStoredKey ? (
                    <Badge variant="active" className="text-[9px]">
                      ● Enregistrée
                    </Badge>
                  ) : null}
                </div>
                <div className="relative">
                  <Input
                    id="ai-apikey"
                    name="apiKey"
                    type={showKey ? 'text' : 'password'}
                    value={state.apiKey}
                    onChange={(e) => updateField('apiKey', e.target.value)}
                    placeholder={hasStoredKey ? '••••••••  (une clé est enregistrée)' : 'sk-…'}
                    autoComplete="off"
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    aria-label={showKey ? 'Masquer la clé' : 'Afficher la clé'}
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {showKey ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {hasStoredKey
                    ? 'Laisser vide pour conserver la clé existante. Renseigner pour la remplacer.'
                    : 'La clé est chiffrée côté serveur (AES-256-GCM) et ne transite plus jamais en clair.'}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {saveResult?.ok === true ? (
          <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
            Paramètres enregistrés.
          </p>
        ) : null}
        {saveResult?.ok === false ? (
          <p role="alert" className="text-sm text-destructive">
            {saveResult.message ?? `Erreur ${saveResult.status ?? ''} (${saveResult.code ?? ''})`}
          </p>
        ) : null}

        <div className="flex items-center justify-end pt-2">
          <Button type="submit" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>

      <aside className="lg:col-span-1">
        <div className="sticky top-6 flex flex-col gap-4">
          <ConnectionStatusCard
            testing={testing}
            testResult={testResult}
            canTest={canTest}
            onTest={() => void onTest()}
            endpoint={state.endpoint}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">À propos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Utilisé par</span>
                <span className="text-foreground">Onboarding</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Chiffrement</span>
                <span className="font-mono text-foreground">AES-256-GCM</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Clé stockée</span>
                <span className="text-foreground">Côté serveur</span>
              </div>
              <p className="pt-1 text-xs text-muted-foreground">
                La clé API n'est jamais renvoyée en clair. Elle ne transite hors du serveur que vers
                l'endpoint que tu configures ici.
              </p>
            </CardContent>
          </Card>
        </div>
      </aside>
    </form>
  );
}

'use client';

import type { ConfigFieldSpec, ConfigUi } from '@varde/contracts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  Input,
  Label,
  Select,
  StickyActionBar,
} from '@varde/ui';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactElement, useMemo, useState } from 'react';

import { type SaveModuleConfigResult, saveModuleConfig } from '../lib/actions';
import { validateAgainstSchema } from '../lib/client-validation';
import { countFieldChanges } from '../lib/count-field-changes';

export interface ConfigFormProps {
  readonly guildId: string;
  readonly moduleId: string;
  readonly moduleName: string;
  readonly ui: ConfigUi;
  readonly initialValues: Readonly<Record<string, unknown>>;
  readonly schema?: unknown;
}

type FieldState = string | boolean;
type FormState = Record<string, FieldState>;

const getByPath = (obj: unknown, path: string): unknown => {
  const segments = path.split('.');
  let cursor: unknown = obj;
  for (const seg of segments) {
    if (typeof cursor !== 'object' || cursor === null) return undefined;
    cursor = (cursor as Record<string, unknown>)[seg];
  }
  return cursor;
};

const setByPath = (root: Record<string, unknown>, path: string, value: unknown): void => {
  const segments = path.split('.');
  const last = segments.pop();
  if (!last) return;
  let cursor: Record<string, unknown> = root;
  for (const seg of segments) {
    const next = cursor[seg];
    if (typeof next !== 'object' || next === null) {
      cursor[seg] = {};
    }
    cursor = cursor[seg] as Record<string, unknown>;
  }
  cursor[last] = value;
};

const initialFieldState = (field: ConfigFieldSpec, initialValues: unknown): FieldState => {
  const raw = getByPath(initialValues, field.path);
  if (field.widget === 'toggle') {
    return typeof raw === 'boolean' ? raw : false;
  }
  if (raw === undefined || raw === null) return '';
  return String(raw);
};

const sortedFields = (fields: readonly ConfigFieldSpec[]): readonly ConfigFieldSpec[] => {
  return [...fields].sort((a, b) => {
    const order = (a.order ?? 0) - (b.order ?? 0);
    return order !== 0 ? order : a.path.localeCompare(b.path);
  });
};

const buildPayload = (
  fields: readonly ConfigFieldSpec[],
  state: FormState,
): Record<string, unknown> => {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    const value = state[field.path];
    if (field.widget === 'toggle') {
      setByPath(payload, field.path, Boolean(value));
      continue;
    }
    if (field.widget === 'number') {
      if (value === '' || value === undefined) continue;
      const parsed = Number(value);
      setByPath(payload, field.path, Number.isNaN(parsed) ? value : parsed);
      continue;
    }
    if (typeof value === 'string' && value.length === 0) continue;
    setByPath(payload, field.path, value);
  }
  return payload;
};

const pathErrorKey = (path: ReadonlyArray<string | number>): string => path.map(String).join('.');

/**
 * Formulaire générique dérivé du `configUi` d'un module. Les champs
 * sont triés par `order` (puis par `path`) ; chaque widget est rendu
 * via une primitive du design system ou un élément HTML brut stylé
 * pour rester cohérent avec Tailwind 4. La soumission passe par la
 * server action `saveModuleConfig` qui fait office de proxy
 * authentifié vers l'API Fastify (le navigateur ne parle jamais
 * directement à `:4000`, pas besoin de CORS).
 *
 * Stratégie d'erreurs :
 * - 400 `invalid_config` : l'API renvoie les issues Zod ; on mappe
 *   path → message dans `fieldErrors`, affichés sous chaque champ.
 * - autre 4xx/5xx : message générique en tête du formulaire.
 * - succès : message de confirmation transitoire, pas de redirect
 *   pour rester sur place (l'utilisateur peut enchaîner plusieurs
 *   modifications).
 */
export function ConfigForm({
  guildId,
  moduleId,
  moduleName,
  ui,
  initialValues,
  schema,
}: ConfigFormProps): ReactElement {
  const t = useTranslations('moduleConfig.form');
  const fields = useMemo(() => sortedFields(ui.fields), [ui.fields]);
  const buildInitialState = (): FormState => {
    const init: FormState = {};
    for (const field of fields) {
      init[field.path] = initialFieldState(field, initialValues);
    }
    return init;
  };
  // `initialState` est le pivot de la sticky save bar (jalon 7 PR
  // 7.4.8). Il bouge à deux moments :
  // - au mount (snapshot initial),
  // - après chaque save réussi (le formulaire devient le nouveau
  //   référentiel — les modifications suivantes sont à nouveau
  //   « non sauvegardées »).
  // Cancel revient à `initialState`. Counter = diff state ↔ initial.
  const [initialState, setInitialState] = useState<FormState>(buildInitialState);
  const [state, setState] = useState<FormState>(initialState);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SaveModuleConfigResult | null>(null);

  const fieldErrors: Record<string, string> = {};
  if (result?.details) {
    for (const issue of result.details) {
      const key = pathErrorKey(issue.path);
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
  }

  const changeCount = countFieldChanges(initialState, state);
  const dirty = changeCount > 0;

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    await save();
  };

  const save = async (): Promise<void> => {
    setPending(true);
    setResult(null);
    try {
      const payload = buildPayload(fields, state);
      const clientCheck = validateAgainstSchema(schema, payload);
      if (!clientCheck.ok) {
        setResult({
          ok: false,
          status: 400,
          code: 'invalid_config_client',
          details: clientCheck.issues,
        });
        return;
      }
      const next = await saveModuleConfig(guildId, moduleId, payload);
      setResult(next);
      if (next.ok) {
        // Save réussi : le state courant devient le nouveau référentiel.
        // Le compteur retombe à 0 et la sticky bar passe en mode
        // « propre ».
        setInitialState(state);
      }
    } finally {
      setPending(false);
    }
  };

  const onCancel = (): void => {
    setState(initialState);
    setResult(null);
  };

  const updateField = (path: string, value: FieldState): void => {
    setState((prev) => ({ ...prev, [path]: value }));
  };

  return (
    <form onSubmit={onSubmit} aria-label={t('label', { moduleName })}>
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description', { moduleName })}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {fields.map((field) => (
            <FieldRow
              key={field.path}
              field={field}
              value={state[field.path] ?? (field.widget === 'toggle' ? false : '')}
              error={fieldErrors[field.path]}
              onChange={(v) => updateField(field.path, v)}
            />
          ))}

          {result?.ok === true ? (
            <p role="status" className="text-sm text-success">
              {t('savedConfirmation')}
            </p>
          ) : null}
          {result?.ok === false && !result.details ? (
            <p role="alert" className="text-sm text-destructive">
              {result.message ?? t('genericError', { status: result.status ?? '' })}
            </p>
          ) : null}
          {result?.ok === false && result.details ? (
            <p role="alert" className="text-sm text-destructive">
              {t('fieldErrorsHint')}
            </p>
          ) : null}
        </CardContent>
      </Card>
      <StickyActionBar
        dirty={dirty}
        pending={pending}
        onCancel={onCancel}
        onSave={() => {
          void save();
        }}
        cancelLabel={t('cancel')}
        saveLabel={t('save')}
        pendingLabel={t('saving')}
        cleanLabel={t('clean')}
        dirtyLabel={t('dirty', { count: changeCount })}
      />
    </form>
  );
}

interface FieldRowProps {
  readonly field: ConfigFieldSpec;
  readonly value: FieldState;
  readonly error: string | undefined;
  readonly onChange: (value: FieldState) => void;
}

function FieldRow({ field, value, error, onChange }: FieldRowProps): ReactElement {
  const id = `field-${field.path}`;
  const describedBy = [field.description ? `${id}-desc` : null, error ? `${id}-err` : null].filter(
    (v): v is string => v !== null,
  );

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{field.label}</Label>
      {renderWidget(field, value, onChange, id, describedBy)}
      {field.description ? (
        <p id={`${id}-desc`} className="text-sm text-muted-foreground">
          {field.description}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-err`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function renderWidget(
  field: ConfigFieldSpec,
  value: FieldState,
  onChange: (value: FieldState) => void,
  id: string,
  describedBy: readonly string[],
): ReactElement {
  const aria = describedBy.length > 0 ? describedBy.join(' ') : undefined;
  const commonProps = {
    id,
    name: field.path,
    'aria-describedby': aria,
  };

  if (field.widget === 'toggle') {
    return (
      <input
        {...commonProps}
        type="checkbox"
        checked={Boolean(value)}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border border-input"
      />
    );
  }

  if (field.widget === 'select') {
    return (
      <Select
        {...commonProps}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">—</option>
        {(field.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    );
  }

  if (field.widget === 'textarea') {
    return (
      <textarea
        {...commonProps}
        value={typeof value === 'string' ? value : ''}
        placeholder={field.placeholder}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className={cn(
          'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      />
    );
  }

  const inputType = field.widget === 'number' ? 'number' : 'text';
  return (
    <Input
      {...commonProps}
      type={inputType}
      value={typeof value === 'string' ? value : ''}
      placeholder={field.placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

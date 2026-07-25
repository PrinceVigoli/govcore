import type { FormVersionWithNestedTreeSectionsItemFieldsItem } from '@workspace/api-client-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { MapPin, QrCode } from 'lucide-react';
import { FileUploadField } from './FileUploadField';

export type FieldNode = FormVersionWithNestedTreeSectionsItemFieldsItem;

export interface FieldOption {
  label: string;
  value: string;
}

/**
 * `options` and `defaultValue` are stored JSON-encoded (Book 07 §5), matching
 * the rule_conditions.value convention. Parsing is tolerant: a malformed or
 * absent value yields a sensible empty result rather than breaking the render.
 */
export function parseOptions(raw: string | null | undefined): FieldOption[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((o) =>
        typeof o === 'string'
          ? { label: o, value: o }
          : { label: String(o?.label ?? o?.value ?? ''), value: String(o?.value ?? o?.label ?? '') },
      )
      .filter((o) => o.value !== '');
  } catch {
    return [];
  }
}

export function parseDefaultValue(raw: string | null | undefined): unknown {
  if (raw === null || raw === undefined) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Seeds a value map from a version's fields, applying each field's default. */
export function buildInitialValues(fields: FieldNode[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    const fallback = parseDefaultValue(field.defaultValue);
    if (fallback !== undefined) {
      values[field.fieldKey] = fallback;
      continue;
    }
    if (field.fieldType === 'multi_select') values[field.fieldKey] = [];
    else if (field.fieldType === 'checkbox' || field.fieldType === 'switch') {
      // A required boolean must start undefined, not false: the server's
      // `required` check is isEmpty(), and isEmpty(false) is false — seeding
      // `false` would let an unticked "I certify..." box pass validation.
      // Optional booleans still seed false so they submit a real answer.
      if (!field.required) values[field.fieldKey] = false;
    } else values[field.fieldKey] = '';
  }
  return values;
}

interface FieldRendererProps {
  field: FieldNode;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  disabled?: boolean;
  /** Tenant that owns uploads made from this field (Book 09 attachments). */
  tenantId?: number;
}

/**
 * Renders one field from its metadata. The renderer never hardcodes a form's
 * layout (Book 07 §6) — every input here is chosen purely from `fieldType`,
 * so a new form definition renders without any frontend change.
 *
 * Field types with no meaningful web input (signature, qr_scanner,
 * gps_location, file_upload, image) degrade to a labelled capture control
 * rather than being omitted, so a desktop reviewer still sees the field exists
 * and can read a value captured on mobile.
 */
export function FieldRenderer({ field, value, onChange, error, disabled, tenantId = 1 }: FieldRendererProps) {
  const readOnly = disabled || field.readOnly;
  const options = parseOptions(field.options);
  const describedBy = error ? `${field.fieldKey}-error` : field.helpText ? `${field.fieldKey}-help` : undefined;

  const control = () => {
    switch (field.fieldType) {
      case 'textarea':
      case 'rich_text':
        return (
          <Textarea
            id={field.fieldKey}
            value={String(value ?? '')}
            placeholder={field.placeholder ?? undefined}
            disabled={readOnly}
            aria-describedby={describedBy}
            aria-invalid={!!error}
            rows={field.fieldType === 'rich_text' ? 8 : 4}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case 'number':
      case 'currency':
        return (
          <Input
            id={field.fieldKey}
            type="number"
            inputMode="decimal"
            step={field.fieldType === 'currency' ? '0.01' : 'any'}
            value={value === '' || value === null || value === undefined ? '' : String(value)}
            placeholder={field.placeholder ?? undefined}
            disabled={readOnly}
            aria-describedby={describedBy}
            aria-invalid={!!error}
            onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          />
        );

      case 'date':
      case 'time':
        return (
          <Input
            id={field.fieldKey}
            type={field.fieldType}
            value={String(value ?? '')}
            disabled={readOnly}
            aria-describedby={describedBy}
            aria-invalid={!!error}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case 'select':
        return (
          <Select value={String(value ?? '')} onValueChange={onChange} disabled={readOnly}>
            <SelectTrigger id={field.fieldKey} aria-invalid={!!error} aria-describedby={describedBy}>
              <SelectValue placeholder={field.placeholder ?? 'Select an option'} />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'multi_select': {
        const selected = Array.isArray(value) ? (value as string[]) : [];
        return (
          <div className="space-y-2" role="group" aria-describedby={describedBy}>
            {options.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm font-normal cursor-pointer">
                <Checkbox
                  checked={selected.includes(o.value)}
                  disabled={readOnly}
                  onCheckedChange={(checked) =>
                    onChange(checked ? [...selected, o.value] : selected.filter((v) => v !== o.value))
                  }
                />
                {o.label}
              </label>
            ))}
            {options.length === 0 && <p className="text-xs text-muted-foreground">No options configured.</p>}
          </div>
        );
      }

      case 'radio':
        return (
          <RadioGroup
            value={String(value ?? '')}
            onValueChange={onChange}
            disabled={readOnly}
            aria-describedby={describedBy}
          >
            {options.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm font-normal cursor-pointer">
                <RadioGroupItem value={o.value} />
                {o.label}
              </label>
            ))}
          </RadioGroup>
        );

      case 'checkbox':
        return (
          <label className="flex items-center gap-2 text-sm font-normal cursor-pointer">
            <Checkbox
              id={field.fieldKey}
              checked={!!value}
              disabled={readOnly}
              onCheckedChange={(checked) => onChange(!!checked)}
            />
            {field.placeholder ?? 'Yes'}
          </label>
        );

      case 'switch':
        return (
          <div className="flex items-center gap-2">
            <Switch id={field.fieldKey} checked={!!value} disabled={readOnly} onCheckedChange={onChange} />
            <span className="text-sm text-muted-foreground">{field.placeholder ?? (value ? 'On' : 'Off')}</span>
          </div>
        );

      case 'gps_location': {
        const coords = (value ?? {}) as { lat?: number; lng?: number };
        const hasCoords = typeof coords.lat === 'number' && typeof coords.lng === 'number';
        return (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={readOnly}
                className="inline-flex items-center rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
                onClick={() =>
                  navigator.geolocation?.getCurrentPosition(
                    (pos) => onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                    () => onChange({}),
                  )
                }
              >
                <MapPin className="mr-2 h-4 w-4" />
                Use current location
              </button>
              {hasCoords && (
                <Badge variant="secondary" className="font-mono text-xs">
                  {coords.lat!.toFixed(5)}, {coords.lng!.toFixed(5)}
                </Badge>
              )}
            </div>
          </div>
        );
      }

      // File-bearing fields upload through the Document Engine (Book 09) and
      // store the resulting attachment UUID, rather than the unbacked storage
      // string these fields held before that engine existed.
      case 'file_upload':
      case 'image':
      case 'signature':
        return (
          <FileUploadField
            value={value}
            onChange={onChange}
            tenantId={tenantId}
            fieldKey={field.fieldKey}
            disabled={readOnly}
            accept={field.fieldType === 'image' ? 'image/*' : field.fieldType === 'signature' ? 'image/*' : undefined}
          />
        );

      // A QR scanner has no desktop equivalent: the value is a code the mobile
      // client captures, so the web form accepts it as text.
      case 'qr_scanner':
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-md border border-dashed border-input px-3 py-2 text-xs text-muted-foreground">
              <QrCode className="h-4 w-4 shrink-0" />
              Scan on a mobile device, or type the code manually.
            </div>
            <Input
              id={field.fieldKey}
              value={String(value ?? '')}
              placeholder={field.placeholder ?? undefined}
              disabled={readOnly}
              aria-describedby={describedBy}
              aria-invalid={!!error}
              onChange={(e) => onChange(e.target.value)}
            />
          </div>
        );

      default:
        return (
          <Input
            id={field.fieldKey}
            value={String(value ?? '')}
            placeholder={field.placeholder ?? undefined}
            disabled={readOnly}
            aria-describedby={describedBy}
            aria-invalid={!!error}
            onChange={(e) => onChange(e.target.value)}
          />
        );
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={field.fieldKey} className="text-sm">
          {field.label}
          {field.required && <span className="ml-1 text-destructive">*</span>}
        </Label>
        {field.calculationRuleCode && (
          <Badge variant="outline" className="text-[10px] font-normal">
            calculated
          </Badge>
        )}
        {field.visibilityRuleCode && (
          <Badge variant="outline" className="text-[10px] font-normal">
            conditional
          </Badge>
        )}
      </div>

      {control()}

      {field.helpText && !error && (
        <p id={`${field.fieldKey}-help`} className="text-xs text-muted-foreground">
          {field.helpText}
        </p>
      )}
      {error && (
        <p id={`${field.fieldKey}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

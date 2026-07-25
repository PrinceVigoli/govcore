import { useState } from 'react';
import { useRoute, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetForm,
  useCreateFormVersion,
  usePublishFormVersion,
  useGetFormVersion,
  useListFormSubmissions,
  getGetFormQueryKey,
  getGetFormVersionQueryKey,
  getListFormSubmissionsQueryKey,
  FormFieldInputFieldType,
  FieldValidationInputValidationType,
} from '@workspace/api-client-react';
import type {
  FormFieldInputFieldType as FieldTypeValue,
  FieldValidationInputValidationType as ValidationTypeValue,
} from '@workspace/api-client-react';
import { format } from 'date-fns';
import { ArrowLeft, FileText, Loader2, Plus, Trash2, Rocket, ClipboardList, Eye, PencilRuler } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { FormRenderer } from '@/components/forms/FormRenderer';
import { buildInitialValues } from '@/components/forms/FieldRenderer';

// Field and validation types come from the generated spec enums (Book 07 §5,
// §7) rather than a hand-written list, so the builder's choices can never
// drift from what the API accepts.
const FIELD_TYPES = Object.values(FormFieldInputFieldType);
const VALIDATION_TYPES = Object.values(FieldValidationInputValidationType);

type DraftSection = { key: string; tab: string; title: string; description: string };
type DraftField = {
  key: string;
  sectionKey: string;
  fieldKey: string;
  label: string;
  fieldType: FieldTypeValue;
  helpText: string;
  placeholder: string;
  options: string;
  required: boolean;
  visibilityRuleCode: string;
  calculationRuleCode: string;
};
type DraftValidation = { key: string; fieldKey: string; validationType: ValidationTypeValue; config: string; errorMessage: string };

let counter = 0;
const nextKey = (prefix: string) => `${prefix}${(counter += 1)}`;

/** Renders a published version's tree read-only, so an admin can preview the layout. */
function VersionPreview({ versionId }: { versionId: number }) {
  const { data: version, isLoading } = useGetFormVersion(versionId, {
    query: { queryKey: getGetFormVersionQueryKey(versionId) },
  });

  const fields = version?.sections.flatMap((s) => s.fields ?? []) ?? [];
  const [values, setValues] = useState<Record<string, unknown>>({});

  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (!version) return null;

  const seeded = Object.keys(values).length === 0 ? buildInitialValues(fields) : values;

  return (
    <div className="mt-4 rounded-md border border-border bg-muted/20 p-4">
      <FormRenderer
        sections={version.sections}
        values={seeded}
        onChange={(k, v) => setValues({ ...seeded, [k]: v })}
      />
    </div>
  );
}

export default function FormDetail() {
  const [, params] = useRoute('/forms/:id');
  const id = Number(params?.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [builderOpen, setBuilderOpen] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<number | null>(null);
  const [locale, setLocale] = useState('en');

  const [sections, setSections] = useState<DraftSection[]>([
    { key: nextKey('s'), tab: '', title: 'Applicant Details', description: '' },
  ]);
  const [fields, setFields] = useState<DraftField[]>([]);
  const [validations, setValidations] = useState<DraftValidation[]>([]);

  const { data: form, isLoading } = useGetForm(id, {
    query: { enabled: !!id, queryKey: getGetFormQueryKey(id) },
  });
  const { data: submissions } = useListFormSubmissions(
    {},
    { query: { enabled: !!id, queryKey: getListFormSubmissionsQueryKey({}) } },
  );

  const createVersion = useCreateFormVersion();
  const publishVersion = usePublishFormVersion();

  const versionIds = new Set(form?.versions.map((v) => v.id) ?? []);
  const formSubmissions = submissions?.filter((s) => versionIds.has(s.formVersionId)) ?? [];

  const addSection = () => setSections((p) => [...p, { key: nextKey('s'), tab: '', title: '', description: '' }]);
  const removeSection = (key: string) => {
    setSections((p) => p.filter((s) => s.key !== key));
    setFields((p) => p.filter((f) => f.sectionKey !== key));
  };
  const addField = () =>
    setFields((p) => [
      ...p,
      {
        key: nextKey('f'), sectionKey: sections[0]?.key ?? '', fieldKey: '', label: '', fieldType: 'text',
        helpText: '', placeholder: '', options: '', required: false, visibilityRuleCode: '', calculationRuleCode: '',
      },
    ]);
  const removeField = (key: string) => {
    const removed = fields.find((f) => f.key === key);
    setFields((p) => p.filter((f) => f.key !== key));
    if (removed) setValidations((p) => p.filter((v) => v.fieldKey !== removed.fieldKey));
  };
  const addValidation = () =>
    setValidations((p) => [
      ...p,
      { key: nextKey('v'), fieldKey: fields[0]?.fieldKey ?? '', validationType: 'required', config: '', errorMessage: '' },
    ]);

  const updateSection = (key: string, patch: Partial<DraftSection>) =>
    setSections((p) => p.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const updateField = (key: string, patch: Partial<DraftField>) =>
    setFields((p) => p.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  const updateValidation = (key: string, patch: Partial<DraftValidation>) =>
    setValidations((p) => p.map((v) => (v.key === key ? { ...v, ...patch } : v)));

  const submitVersion = () => {
    if (sections.some((s) => !s.title.trim())) {
      toast({ title: 'Every section needs a title', variant: 'destructive' });
      return;
    }
    if (fields.length === 0) {
      toast({ title: 'Add at least one field', variant: 'destructive' });
      return;
    }
    if (fields.some((f) => !f.fieldKey.trim() || !f.label.trim())) {
      toast({ title: 'Every field needs a key and a label', variant: 'destructive' });
      return;
    }
    const keys = fields.map((f) => f.fieldKey);
    if (new Set(keys).size !== keys.length) {
      toast({ title: 'Field keys must be unique within a version', variant: 'destructive' });
      return;
    }

    // `options` and `config` are free-text JSON in the builder; parse them here
    // so a typo surfaces as a toast rather than a 400 from the server.
    let parsedOptions: Record<string, unknown[]> = {};
    try {
      for (const f of fields) {
        if (f.options.trim()) parsedOptions[f.fieldKey] = JSON.parse(f.options);
      }
    } catch {
      toast({ title: 'Options must be valid JSON', description: 'Example: ["New", "Renewal"]', variant: 'destructive' });
      return;
    }

    const validationPayload = [];
    for (const v of validations) {
      let config: unknown = undefined;
      if (v.config.trim()) {
        try {
          config = JSON.parse(v.config);
        } catch {
          toast({ title: `Config for "${v.fieldKey}" must be valid JSON`, variant: 'destructive' });
          return;
        }
      }
      validationPayload.push({
        fieldKey: v.fieldKey,
        validationType: v.validationType,
        config,
        errorMessage: v.errorMessage || undefined,
      });
    }

    createVersion.mutate(
      {
        id,
        data: {
          locale,
          sections: sections.map((s, i) => ({
            key: s.key,
            tab: s.tab || undefined,
            title: s.title,
            description: s.description || undefined,
            sortOrder: i,
          })),
          fields: fields.map((f, i) => ({
            sectionKey: f.sectionKey,
            fieldKey: f.fieldKey,
            label: f.label,
            fieldType: f.fieldType,
            helpText: f.helpText || undefined,
            placeholder: f.placeholder || undefined,
            options: parsedOptions[f.fieldKey] as { label: string; value: string }[] | undefined,
            required: f.required,
            visibilityRuleCode: f.visibilityRuleCode || undefined,
            calculationRuleCode: f.calculationRuleCode || undefined,
            sortOrder: i,
          })),
          validations: validationPayload.map((v, i) => ({ ...v, sortOrder: i })),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetFormQueryKey(id) });
          setBuilderOpen(false);
          toast({ title: 'Draft version created' });
        },
        onError: (err: { message?: string }) =>
          toast({ title: 'Could not create version', description: err.message, variant: 'destructive' }),
      },
    );
  };

  const publish = (versionId: number) =>
    publishVersion.mutate(
      { id: versionId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetFormQueryKey(id) });
          toast({ title: 'Version published', description: 'It is now the single active version for this form.' });
        },
        onError: (err: { message?: string }) =>
          toast({ title: 'Could not publish', description: err.message, variant: 'destructive' }),
      },
    );

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!form) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Form not found.</p>
        <Link href="/forms"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" />Back to forms</Button></Link>
      </div>
    );
  }

  const activeVersion = form.versions.find((v) => v.status === 'active');

  return (
    <div className="space-y-6">
      <div>
        <Link href="/forms">
          <Button variant="ghost" size="sm" className="mb-3 -ml-2">
            <ArrowLeft className="mr-2 h-4 w-4" />Forms
          </Button>
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center">
              <FileText className="h-6 w-6 mr-2 text-muted-foreground" />
              {form.name}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              <span className="font-mono">{form.code}</span> · {form.module} · <span className="font-mono">{form.resourceType}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeVersion && (
              <Link href={`/forms/${form.id}/fill`}>
                <Button variant="outline"><ClipboardList className="mr-2 h-4 w-4" />Fill out</Button>
              </Link>
            )}
            <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
              <DialogTrigger asChild>
                <Button><PencilRuler className="mr-2 h-4 w-4" />Build Version</Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Build a draft version</DialogTitle>
                  <DialogDescription>
                    Define sections, fields, and validations. A published version is immutable — changes always create a new one.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Locale</Label>
                      <Input value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="en" />
                    </div>
                  </div>

                  {/* Sections */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold">Sections</h4>
                      <Button variant="outline" size="sm" onClick={addSection}>
                        <Plus className="mr-2 h-3 w-3" />Add section
                      </Button>
                    </div>
                    {sections.map((s) => (
                      <div key={s.key} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto] items-start rounded-md border border-border p-3">
                        <Input placeholder="Title" value={s.title} onChange={(e) => updateSection(s.key, { title: e.target.value })} />
                        <Input placeholder="Tab (optional)" value={s.tab} onChange={(e) => updateSection(s.key, { tab: e.target.value })} />
                        <Input placeholder="Description" value={s.description} onChange={(e) => updateSection(s.key, { description: e.target.value })} />
                        <Button variant="ghost" size="icon" onClick={() => removeSection(s.key)}>
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  {/* Fields */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold">Fields</h4>
                      <Button variant="outline" size="sm" onClick={addField} disabled={sections.length === 0}>
                        <Plus className="mr-2 h-3 w-3" />Add field
                      </Button>
                    </div>
                    {fields.length === 0 && <p className="text-xs text-muted-foreground">No fields yet.</p>}
                    {fields.map((f) => (
                      <div key={f.key} className="space-y-2 rounded-md border border-border p-3">
                        <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                          <Input placeholder="Field key (e.g. applicant_name)" value={f.fieldKey} onChange={(e) => updateField(f.key, { fieldKey: e.target.value })} />
                          <Input placeholder="Label" value={f.label} onChange={(e) => updateField(f.key, { label: e.target.value })} />
                          <Button variant="ghost" size="icon" onClick={() => removeField(f.key)}>
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                        <div className="grid gap-2 md:grid-cols-3">
                          <Select value={f.fieldType} onValueChange={(v) => updateField(f.key, { fieldType: v as FieldTypeValue })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {FIELD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Select value={f.sectionKey} onValueChange={(v) => updateField(f.key, { sectionKey: v })}>
                            <SelectTrigger><SelectValue placeholder="Section" /></SelectTrigger>
                            <SelectContent>
                              {sections.map((s) => <SelectItem key={s.key} value={s.key}>{s.title || 'Untitled section'}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox checked={f.required} onCheckedChange={(c) => updateField(f.key, { required: !!c })} />
                            Required
                          </label>
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                          <Input placeholder="Help text" value={f.helpText} onChange={(e) => updateField(f.key, { helpText: e.target.value })} />
                          <Input placeholder="Placeholder" value={f.placeholder} onChange={(e) => updateField(f.key, { placeholder: e.target.value })} />
                        </div>
                        {['select', 'multi_select', 'radio'].includes(f.fieldType) && (
                          <Input
                            placeholder='Options JSON, e.g. [{"label":"New","value":"new"}]'
                            value={f.options}
                            onChange={(e) => updateField(f.key, { options: e.target.value })}
                          />
                        )}
                        <div className="grid gap-2 md:grid-cols-2">
                          <Input placeholder="Visibility rule code (optional)" value={f.visibilityRuleCode} onChange={(e) => updateField(f.key, { visibilityRuleCode: e.target.value })} />
                          <Input placeholder="Calculation rule code (optional)" value={f.calculationRuleCode} onChange={(e) => updateField(f.key, { calculationRuleCode: e.target.value })} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Validations */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold">Validations</h4>
                      <Button variant="outline" size="sm" onClick={addValidation} disabled={fields.length === 0}>
                        <Plus className="mr-2 h-3 w-3" />Add validation
                      </Button>
                    </div>
                    {validations.map((v) => (
                      <div key={v.key} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_1fr_auto] items-start rounded-md border border-border p-3">
                        <Select value={v.fieldKey} onValueChange={(val) => updateValidation(v.key, { fieldKey: val })}>
                          <SelectTrigger><SelectValue placeholder="Field" /></SelectTrigger>
                          <SelectContent>
                            {fields.filter((f) => f.fieldKey).map((f) => <SelectItem key={f.key} value={f.fieldKey}>{f.fieldKey}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={v.validationType} onValueChange={(val) => updateValidation(v.key, { validationType: val as ValidationTypeValue })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {VALIDATION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input placeholder='Config JSON, e.g. {"value":18}' value={v.config} onChange={(e) => updateValidation(v.key, { config: e.target.value })} />
                        <Input placeholder="Error message" value={v.errorMessage} onChange={(e) => updateValidation(v.key, { errorMessage: e.target.value })} />
                        <Button variant="ghost" size="icon" onClick={() => setValidations((p) => p.filter((x) => x.key !== v.key))}>
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <DialogFooter>
                  <Button onClick={submitVersion} disabled={createVersion.isPending}>
                    {createVersion.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create draft version
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Versions</CardTitle>
          <CardDescription>
            Publishing activates one version and deprecates the previous one, so historical submissions keep the exact layout they were filled on.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {form.versions.length === 0 && <p className="text-sm text-muted-foreground">No versions yet. Build one to get started.</p>}
          {form.versions.map((v) => (
            <div key={v.id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-sm">Version {v.version}</span>
                  <Badge variant={v.status === 'active' ? 'default' : 'secondary'}>{v.status}</Badge>
                  <span className="text-xs text-muted-foreground font-mono">{v.locale}</span>
                  {v.publishedAt && (
                    <span className="text-xs text-muted-foreground">
                      published {format(new Date(v.publishedAt), 'PP')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setPreviewVersion(previewVersion === v.id ? null : v.id)}>
                    <Eye className="mr-2 h-4 w-4" />
                    {previewVersion === v.id ? 'Hide' : 'Preview'}
                  </Button>
                  {v.status !== 'active' && (
                    <Button variant="outline" size="sm" onClick={() => publish(v.id)} disabled={publishVersion.isPending}>
                      <Rocket className="mr-2 h-4 w-4" />Publish
                    </Button>
                  )}
                </div>
              </div>
              {previewVersion === v.id && <VersionPreview versionId={v.id} />}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Submissions</CardTitle>
          <CardDescription>Entries captured against any version of this form.</CardDescription>
        </CardHeader>
        <CardContent>
          {formSubmissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No submissions yet.</p>
          ) : (
            <div className="space-y-2">
              {formSubmissions.map((s) => (
                <Link key={s.id} href={`/form-submissions/${s.id}`}>
                  <div className="flex items-center justify-between rounded-md border border-border p-3 hover-elevate cursor-pointer">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">#{s.id}</span>
                      <Badge variant={s.status === 'submitted' ? 'default' : 'secondary'}>{s.status}</Badge>
                      {s.workflowInstanceId && (
                        <span className="text-xs text-muted-foreground">workflow #{s.workflowInstanceId}</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(s.createdAt), 'PPp')}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

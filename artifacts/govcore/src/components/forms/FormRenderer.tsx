import { useMemo, useState } from 'react';
import type { FormVersionWithNestedTreeSectionsItem } from '@workspace/api-client-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FieldRenderer, type FieldNode } from './FieldRenderer';

export type SectionNode = FormVersionWithNestedTreeSectionsItem;

const UNTABBED = '__untabbed__';

/**
 * Renders a whole form version from its metadata tree (Book 07 §6). Sections
 * are grouped by their `tab` label — the two-level grouping the schema
 * denormalizes onto form_sections — and a version whose sections all have a
 * null tab renders as one flat, untabbed layout.
 *
 * Statically hidden fields are never rendered. Conditional visibility
 * (visibilityRuleCode) is resolved server-side by the Rules Engine at submit
 * time, so this component shows those fields with a "conditional" marker
 * rather than guessing a rule outcome the client can't evaluate.
 */
export function FormRenderer({
  sections,
  values,
  onChange,
  errors,
  disabled,
  tenantId,
}: {
  sections: SectionNode[];
  values: Record<string, unknown>;
  onChange: (fieldKey: string, value: unknown) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
  /** Owns any files uploaded from this form's file fields. */
  tenantId?: number;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, SectionNode[]>();
    for (const section of [...sections].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const key = section.tab ?? UNTABBED;
      map.set(key, [...(map.get(key) ?? []), section]);
    }
    return Array.from(map.entries());
  }, [sections]);

  const [activeTab, setActiveTab] = useState(groups[0]?.[0] ?? UNTABBED);
  const isTabbed = groups.length > 1 || (groups[0]?.[0] ?? UNTABBED) !== UNTABBED;

  const renderSections = (list: SectionNode[]) => (
    <div className="space-y-8">
      {list.map((section) => {
        const fields = [...(section.fields ?? [])]
          .filter((f) => !f.hidden)
          .sort((a, b) => a.sortOrder - b.sortOrder);

        return (
          <section key={section.id} className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold tracking-tight">{section.title}</h3>
              {section.description && (
                <p className="text-xs text-muted-foreground mt-1">{section.description}</p>
              )}
            </div>

            {fields.length === 0 ? (
              <p className="text-xs text-muted-foreground">No fields in this section.</p>
            ) : (
              <div className="grid gap-5 md:grid-cols-2">
                {fields.map((field: FieldNode) => (
                  <div
                    key={field.id}
                    className={
                      field.fieldType === 'textarea' || field.fieldType === 'rich_text'
                        ? 'md:col-span-2'
                        : undefined
                    }
                  >
                    <FieldRenderer
                      field={field}
                      value={values[field.fieldKey]}
                      error={errors?.[field.fieldKey]}
                      disabled={disabled}
                      tenantId={tenantId}
                      onChange={(v) => onChange(field.fieldKey, v)}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );

  if (!isTabbed) return renderSections(groups[0]?.[1] ?? []);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList className="mb-6 flex-wrap h-auto">
        {groups.map(([tab]) => (
          <TabsTrigger key={tab} value={tab}>
            {tab === UNTABBED ? 'General' : tab}
          </TabsTrigger>
        ))}
      </TabsList>
      {groups.map(([tab, list]) => (
        <TabsContent key={tab} value={tab} className="mt-0">
          {renderSections(list)}
        </TabsContent>
      ))}
    </Tabs>
  );
}

import { useState } from 'react';
import { Link } from 'wouter';
import { useEvaluateRules } from '@workspace/api-client-react';
import type { RuleEvaluationResult } from '@workspace/api-client-react';
import { ArrowLeft, FlaskConical, Loader2, Play, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';

const SAMPLE_CONTEXT = `{
  "applicant_age": 65,
  "business_type": "sari_sari_store",
  "declared_capital": 50000
}`;

/**
 * A sandbox over POST /rules/evaluate. Every evaluation is recorded in the
 * rule history by the engine, so this doubles as a way to produce audit
 * entries while testing policy against a realistic context.
 */
export default function RulesEvaluate() {
  const { toast } = useToast();

  const [tenantId, setTenantId] = useState('1');
  const [module, setModule] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [contextText, setContextText] = useState(SAMPLE_CONTEXT);
  const [result, setResult] = useState<RuleEvaluationResult | null>(null);

  const evaluate = useEvaluateRules();

  const run = () => {
    if (!resourceType.trim()) {
      toast({ title: 'Resource type is required', variant: 'destructive' });
      return;
    }

    let context: Record<string, unknown>;
    try {
      context = JSON.parse(contextText);
    } catch {
      toast({ title: 'Context must be valid JSON', variant: 'destructive' });
      return;
    }
    if (typeof context !== 'object' || context === null || Array.isArray(context)) {
      toast({ title: 'Context must be a JSON object', variant: 'destructive' });
      return;
    }

    setResult(null);
    evaluate.mutate(
      {
        data: {
          tenantId: Number(tenantId) || 1,
          module: module.trim() || undefined,
          resourceType: resourceType.trim(),
          context,
        },
      },
      {
        onSuccess: (data) => setResult(data),
        onError: (err: { message?: string }) =>
          toast({ title: 'Evaluation failed', description: err.message, variant: 'destructive' }),
      },
    );
  };

  const matched = result?.decisions.filter((d) => d.matched) ?? [];
  const unmatched = result?.decisions.filter((d) => !d.matched) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/rules">
          <Button variant="ghost" size="sm" className="mb-3 -ml-2"><ArrowLeft className="mr-2 h-4 w-4" />Rules</Button>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight flex items-center">
          <FlaskConical className="h-6 w-6 mr-2 text-muted-foreground" />
          Test rules
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Run every active rule for a resource type against a sample context, and see which ones match and what they would do.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evaluation request</CardTitle>
          <CardDescription>
            Conditions read fields by name from this context. A rule referencing a field that is absent is recorded as a failure.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="tenantId">Tenant ID</Label>
              <Input id="tenantId" type="number" value={tenantId} onChange={(e) => setTenantId(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="resourceType">Resource type</Label>
              <Input id="resourceType" placeholder="permit_application" value={resourceType} onChange={(e) => setResourceType(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="module">Module (optional)</Label>
              <Input id="module" placeholder="permits" value={module} onChange={(e) => setModule(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="context">Context (JSON)</Label>
            <Textarea id="context" rows={10} className="font-mono text-xs" value={contextText} onChange={(e) => setContextText(e.target.value)} />
          </div>

          <Button onClick={run} disabled={evaluate.isPending}>
            {evaluate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Run evaluation
          </Button>
        </CardContent>
      </Card>

      {result && (
        <>
          {result.decisions.length === 0 && result.failures.length === 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No rules evaluated</AlertTitle>
              <AlertDescription>
                No active rule matches this tenant and resource type. Check that a version has been published.
              </AlertDescription>
            </Alert>
          )}

          {matched.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center">
                  <CheckCircle2 className="h-4 w-4 mr-2 text-muted-foreground" />
                  Matched ({matched.length})
                </CardTitle>
                <CardDescription>Listed in evaluation order — the first is the highest priority.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {matched.map((d) => (
                  <div key={`${d.ruleId}-${d.ruleVersionId}`} className="rounded-md border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="font-mono text-sm font-medium">{d.ruleCode}</span>
                      <Badge variant="default">matched</Badge>
                      <span className="text-xs text-muted-foreground">version #{d.ruleVersionId}</span>
                    </div>
                    {d.actions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No actions attached.</p>
                    ) : (
                      <div className="space-y-1">
                        {d.actions.map((a, i) => (
                          <div key={i} className="text-xs">
                            <span className="font-medium">{a.actionType}</span>
                            {a.target && <span className="text-muted-foreground"> → <span className="font-mono">{a.target}</span></span>}
                            {a.value && <span className="text-muted-foreground"> = <span className="font-mono">{a.value}</span></span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {unmatched.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center">
                  <XCircle className="h-4 w-4 mr-2 text-muted-foreground" />
                  Did not match ({unmatched.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {unmatched.map((d) => (
                    <Badge key={`${d.ruleId}-${d.ruleVersionId}`} variant="secondary" className="font-mono font-normal">
                      {d.ruleCode}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {result.failures.length > 0 && (
            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle className="text-base flex items-center">
                  <AlertTriangle className="h-4 w-4 mr-2 text-destructive" />
                  Failures ({result.failures.length})
                </CardTitle>
                <CardDescription>
                  These rules were skipped. One rule failing never blocks the others.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {result.failures.map((f, i) => (
                  <div key={i} className="rounded-md border border-border p-3">
                    <p className="text-xs font-medium">Rule #{f.ruleId}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{f.error}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

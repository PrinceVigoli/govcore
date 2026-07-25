import { useState } from 'react';
import { Link } from 'wouter';
import {
  useSearch,
  useReindexSearch,
  getSearchQueryKey,
  getListSearchableEntityTypesQueryKey,
  useListSearchableEntityTypes,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Search as SearchIcon, Loader2, RefreshCw, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

// Maps an entity type to how it reads in the UI, and how its detail URL is
// built when the index row didn't store one.
const ENTITY_LABEL: Record<string, string> = {
  rule: 'Rule',
  form: 'Form',
  workflow_definition: 'Workflow',
  document_template: 'Doc template',
  notification_template: 'Notification template',
  department: 'Department',
  user: 'User',
};

export default function SearchPage() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());

  const { data: entityTypesData } = useListSearchableEntityTypes({
    query: { queryKey: getListSearchableEntityTypesQueryKey() },
  });
  const entityTypes = entityTypesData?.entityTypes ?? [];

  const entityTypesParam = selectedTypes.size > 0 ? [...selectedTypes].join(',') : undefined;
  const searchParams = { query, ...(entityTypesParam ? { entityTypes: entityTypesParam } : {}) };

  const { data, isFetching } = useSearch(searchParams, {
    query: { enabled: query.length > 0, queryKey: getSearchQueryKey(searchParams) },
  });

  const reindexMutation = useReindexSearch();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const runSearch = () => setQuery(input.trim());

  const toggleType = (type: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const reindex = () =>
    reindexMutation.mutate(undefined, {
      onSuccess: (result) => {
        const total = result.results.reduce((sum, r) => sum + r.indexed, 0);
        queryClient.invalidateQueries({ queryKey: getSearchQueryKey(searchParams) });
        toast({ title: `Reindexed ${total} record${total === 1 ? '' : 's'}` });
      },
      onError: (err: { message?: string }) =>
        toast({ title: 'Reindex failed', description: err.message, variant: 'destructive' }),
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Search</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Search across rules, forms, workflows, documents, and more. Results are scoped to what your roles can see.
          </p>
        </div>
        <Button variant="outline" onClick={reindex} disabled={reindexMutation.isPending}>
          {reindexMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Reindex
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search everything..."
            className="pl-9"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
          />
        </div>
        <Button onClick={runSearch}>Search</Button>
      </div>

      {entityTypes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entityTypes.map((type) => (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                selectedTypes.has(type)
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              {ENTITY_LABEL[type] ?? type}
            </button>
          ))}
          {selectedTypes.size > 0 && (
            <button onClick={() => setSelectedTypes(new Set())} className="px-2 py-1 text-xs text-muted-foreground underline">
              Clear
            </button>
          )}
        </div>
      )}

      {query.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            Type a query and press Enter to search.
          </CardContent>
        </Card>
      ) : isFetching ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : !data || data.results.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            No results for "{query}"
            {selectedTypes.size > 0 && ' with the current filters'}.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {data.total} result{data.total === 1 ? '' : 's'} across {data.searchedEntityTypes.length} type
            {data.searchedEntityTypes.length === 1 ? '' : 's'}
          </p>
          {data.results.map((r) => {
            const inner = (
              <Card className="hover-elevate">
                <CardContent className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] font-normal">{ENTITY_LABEL[r.entityType] ?? r.entityType}</Badge>
                      <span className="font-medium truncate">{r.title}</span>
                    </div>
                    {r.subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.subtitle}</p>}
                  </div>
                  {r.url && <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </CardContent>
              </Card>
            );
            return r.url ? (
              <Link key={`${r.entityType}-${r.entityId}`} href={r.url}>{inner}</Link>
            ) : (
              <div key={`${r.entityType}-${r.entityId}`}>{inner}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}

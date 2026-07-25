import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, rulesTable, ruleVersionsTable, ruleGroupsTable, ruleConditionsTable, ruleActionsTable } from "@workspace/db";
import {
  CreateRuleBody,
  UpdateRuleBody,
  GetRuleParams,
  UpdateRuleParams,
  DeleteRuleParams,
  CreateRuleVersionParams,
  CreateRuleVersionBody,
  ListRulesQueryParams,
  EvaluateRulesBody,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";
import { serializeRule, serializeRuleVersion, evaluateRules } from "../lib/rulesEngine";

const router = Router();

router.get("/rules", requireAuth, async (req, res): Promise<void> => {
  const q = ListRulesQueryParams.safeParse(req.query);
  const conditions = [];
  if (q.success && q.data.tenantId) conditions.push(eq(rulesTable.tenantId, q.data.tenantId));
  if (q.success && q.data.module) conditions.push(eq(rulesTable.module, q.data.module));
  if (q.success && q.data.ruleType) conditions.push(eq(rulesTable.ruleType, q.data.ruleType));
  if (q.success && q.data.resourceType) conditions.push(eq(rulesTable.resourceType, q.data.resourceType));
  const rules = conditions.length > 0
    ? await db.select().from(rulesTable).where(and(...conditions)).orderBy(rulesTable.name)
    : await db.select().from(rulesTable).orderBy(rulesTable.name);
  res.json(rules.map(serializeRule));
});

// Registered before /rules/:id so "evaluate" is never captured as an :id path param.
router.post("/rules/evaluate", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const parsed = EvaluateRulesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const result = await evaluateRules({
    tenantId: parsed.data.tenantId,
    module: parsed.data.module,
    resourceType: parsed.data.resourceType,
    context: parsed.data.context,
    actorUserId: actor?.userId,
  });
  res.json(result);
});

router.post("/rules", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const parsed = CreateRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [rule] = await db.insert(rulesTable).values(parsed.data).returning();
  await logAudit({ actor, action: "create", resource: "rule", resourceId: rule.id });
  res.status(201).json(serializeRule(rule));
});

router.get("/rules/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetRuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [rule] = await db.select().from(rulesTable).where(eq(rulesTable.id, params.data.id));
  if (!rule) {
    res.status(404).json({ error: "Rule not found" });
    return;
  }
  const versions = await db.select().from(ruleVersionsTable).where(eq(ruleVersionsTable.ruleId, rule.id)).orderBy(ruleVersionsTable.version);
  res.json({ ...serializeRule(rule), versions: versions.map(serializeRuleVersion) });
});

router.patch("/rules/:id", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = UpdateRuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [rule] = await db.update(rulesTable).set(parsed.data).where(eq(rulesTable.id, params.data.id)).returning();
  if (!rule) {
    res.status(404).json({ error: "Rule not found" });
    return;
  }
  await logAudit({ actor, action: "update", resource: "rule", resourceId: rule.id });
  res.json(serializeRule(rule));
});

router.delete("/rules/:id", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = DeleteRuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [rule] = await db.delete(rulesTable).where(eq(rulesTable.id, params.data.id)).returning();
  if (!rule) {
    res.status(404).json({ error: "Rule not found" });
    return;
  }
  await logAudit({ actor, action: "delete", resource: "rule", resourceId: params.data.id });
  res.sendStatus(204);
});

// Create a new draft version: a client-authored tree of condition groups,
// leaf conditions, and actions. Groups carry a temporary `key` used only
// within this request so conditions/nested groups can reference their parent
// before real row ids exist (same pattern as workflow version creation).
router.post("/rules/:id/versions", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = CreateRuleVersionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateRuleVersionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [rule] = await db.select().from(rulesTable).where(eq(rulesTable.id, params.data.id));
  if (!rule) {
    res.status(404).json({ error: "Rule not found" });
    return;
  }

  const groupKeys = parsed.data.groups.map((g) => g.key);
  if (new Set(groupKeys).size !== groupKeys.length) {
    res.status(400).json({ error: "Group keys must be unique within a version" });
    return;
  }
  const rootGroups = parsed.data.groups.filter((g) => !g.parentKey);
  if (rootGroups.length !== 1) {
    res.status(400).json({ error: "Exactly one group must be the root (no parentKey)" });
    return;
  }
  for (const g of parsed.data.groups) {
    if (g.parentKey && !groupKeys.includes(g.parentKey)) {
      res.status(400).json({ error: `Group "${g.key}" references an unknown parentKey` });
      return;
    }
  }
  for (const c of parsed.data.conditions) {
    if (!groupKeys.includes(c.groupKey)) {
      res.status(400).json({ error: `Condition on field "${c.field}" references an unknown groupKey` });
      return;
    }
  }

  const result = await db.transaction(async (tx) => {
    const allVersions = await tx.select().from(ruleVersionsTable).where(eq(ruleVersionsTable.ruleId, rule.id));
    const nextVersion = allVersions.length > 0 ? Math.max(...allVersions.map((v) => v.version)) + 1 : 1;

    const [version] = await tx
      .insert(ruleVersionsTable)
      .values({
        ruleId: rule.id,
        version: nextVersion,
        status: "draft",
        priority: parsed.data.priority ?? 100,
        effectiveDate: parsed.data.effectiveDate ? new Date(parsed.data.effectiveDate) : null,
      })
      .returning();

    const keyToId = new Map<string, number>();
    // Insert root group(s) first, then children, so parentGroupId is always resolvable.
    const remaining = [...parsed.data.groups];
    const insertedGroups = [];
    while (remaining.length > 0) {
      const ready = remaining.filter((g) => !g.parentKey || keyToId.has(g.parentKey));
      if (ready.length === 0) break; // shouldn't happen given the validation above
      for (const g of ready) {
        const [row] = await tx
          .insert(ruleGroupsTable)
          .values({
            ruleVersionId: version.id,
            parentGroupId: g.parentKey ? keyToId.get(g.parentKey)! : null,
            logicalOperator: g.logicalOperator ?? "AND",
            sortOrder: g.sortOrder ?? 0,
          })
          .returning();
        keyToId.set(g.key, row.id);
        insertedGroups.push(row);
      }
      remaining.splice(0, remaining.length, ...remaining.filter((g) => !keyToId.has(g.key)));
    }
    if (remaining.length > 0) {
      throw new Error(`Rule group graph has a cycle or dangling parentKey among: ${remaining.map((g) => g.key).join(", ")}`);
    }

    const insertedConditions = [];
    for (const c of parsed.data.conditions) {
      const [row] = await tx
        .insert(ruleConditionsTable)
        .values({
          ruleVersionId: version.id,
          groupId: keyToId.get(c.groupKey)!,
          field: c.field,
          operator: c.operator,
          value: JSON.stringify(c.value),
          sortOrder: c.sortOrder ?? 0,
        })
        .returning();
      insertedConditions.push(row);
    }

    const insertedActions = [];
    for (const a of parsed.data.actions) {
      const [row] = await tx
        .insert(ruleActionsTable)
        .values({
          ruleVersionId: version.id,
          actionType: a.actionType,
          target: a.target ?? null,
          value: a.value ?? null,
          sortOrder: a.sortOrder ?? 0,
        })
        .returning();
      insertedActions.push(row);
    }

    return { version, groups: insertedGroups, conditions: insertedConditions, actions: insertedActions };
  });

  await logAudit({ actor, action: "create_version", resource: "rule", resourceId: rule.id });
  res.status(201).json({
    ...serializeRuleVersion(result.version),
    groups: result.groups,
    conditions: result.conditions,
    actions: result.actions,
  });
});

export default router;

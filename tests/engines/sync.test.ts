// Tests for the pure Synchronization Engine core (Book 13): conflict detection
// and per-entity policy resolution, plus cursor/batching arithmetic.
//
// This is the suite that matters most in the whole platform: a bug here means a
// municipal office's offline edits are silently discarded, or a central
// approval is quietly overwritten by a stale node. Every policy path and every
// cursor edge is pinned down here, without a database.

import {
  detectsConflict,
  resolve,
  isConflictPolicy,
  CONFLICT_POLICIES,
  type ServerState,
  type IncomingChange,
} from "../../lib/sync-engine/src/conflict";
import {
  buildPullBatch,
  clampBatchSize,
  isValidCursorAdvance,
  nextSeq,
  syncLag,
  DEFAULT_BATCH_SIZE,
  MAX_BATCH_SIZE,
  type ChangeRecord,
} from "../../lib/sync-engine/src/cursor";

let pass = 0,
  fail = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const server = (revision: number, extra: Partial<ServerState> = {}): ServerState => ({
  exists: true,
  revision,
  ...extra,
});
const absent: ServerState = { exists: false, revision: 0 };
const change = (op: IncomingChange["op"], baseRevision: number, extra: Partial<IncomingChange> = {}): IncomingChange => ({
  op,
  entityKey: "REC-1",
  baseRevision,
  payload: { field: "value" },
  ...extra,
});

console.log("\n— detectsConflict: the divergence check —");
check("update on matching revision is clean", detectsConflict(server(3), change("update", 3)), false);
check("update on stale base is a conflict", detectsConflict(server(4), change("update", 3)), true);
check("create when nothing exists is clean", detectsConflict(absent, change("create", 0)), false);
check("create when key already exists is a conflict", detectsConflict(server(1), change("create", 0)), true);
check("update of a record the server never saw is a conflict", detectsConflict(absent, change("update", 2)), true);
check("delete on matching revision is clean", detectsConflict(server(5), change("delete", 5)), false);
check("delete on stale base is a conflict", detectsConflict(server(6), change("delete", 5)), true);
// A base ahead of the server should never happen with a correct cursor; treat
// it as a conflict rather than trusting the node.
check("base ahead of server is a conflict, not trusted", detectsConflict(server(2), change("update", 7)), true);

console.log("\n— resolve: clean fast-forward (no policy involved) —");
for (const policy of CONFLICT_POLICIES) {
  const d = resolve(policy, server(3), change("update", 3));
  check(`${policy}: no divergence -> fast_forward`, d.outcome, "fast_forward");
  check(`${policy}: fast_forward is not flagged a conflict`, d.isConflict, false);
}

console.log("\n— resolve: manual policy escalates rather than discarding —");
const manual = resolve("manual", server(4), change("update", 3));
check("manual -> conflict outcome", manual.outcome, "conflict");
check("manual picks no winner", manual.winner, "none");
check("manual flags a conflict", manual.isConflict, true);

console.log("\n— resolve: deterministic override policies —");
const sw = resolve("server_wins", server(4), change("update", 3));
check("server_wins discards the node change", sw.outcome, "discard");
check("server_wins winner is server", sw.winner, "server");
const nw = resolve("node_wins", server(4), change("update", 3));
check("node_wins applies the node change", nw.outcome, "apply");
check("node_wins winner is node", nw.winner, "node");
check("node_wins still records it as a conflict", nw.isConflict, true);

console.log("\n— resolve: last_write_wins —");
const lwwNode = resolve(
  "last_write_wins",
  server(4, { updatedAt: 1_000 }),
  change("update", 3, { updatedAt: 2_000 }),
);
check("newer node change wins", lwwNode.outcome, "apply");
check("newer node change winner is node", lwwNode.winner, "node");

const lwwServer = resolve(
  "last_write_wins",
  server(4, { updatedAt: 5_000 }),
  change("update", 3, { updatedAt: 2_000 }),
);
check("newer server change wins", lwwServer.outcome, "discard");
check("newer server change winner is server", lwwServer.winner, "server");

// Ties and missing clocks must be deterministic — never a coin flip on
// government data.
const lwwTie = resolve(
  "last_write_wins",
  server(4, { updatedAt: 3_000 }),
  change("update", 3, { updatedAt: 3_000 }),
);
check("tie defaults to server", lwwTie.outcome, "discard");
check("tie winner is server", lwwTie.winner, "server");

const lwwNoNodeTime = resolve("last_write_wins", server(4, { updatedAt: 3_000 }), change("update", 3));
check("missing node timestamp defaults to server", lwwNoNodeTime.outcome, "discard");
const lwwNoServerTime = resolve("last_write_wins", server(4), change("update", 3, { updatedAt: 9_000 }));
check("missing server timestamp defaults to server", lwwNoServerTime.outcome, "discard");

console.log("\n— resolve: duplicate create under each policy —");
check("manual: duplicate create escalates", resolve("manual", server(1), change("create", 0)).outcome, "conflict");
check("server_wins: duplicate create discarded", resolve("server_wins", server(1), change("create", 0)).outcome, "discard");
check("node_wins: duplicate create applied", resolve("node_wins", server(1), change("create", 0)).outcome, "apply");

console.log("\n— isConflictPolicy —");
check("known policy accepted", isConflictPolicy("last_write_wins"), true);
check("unknown policy rejected", isConflictPolicy("whatever_wins"), false);
check("empty string rejected", isConflictPolicy(""), false);
check("all four policies are valid", CONFLICT_POLICIES.every(isConflictPolicy), true);

console.log("\n— clampBatchSize —");
check("undefined -> default", clampBatchSize(undefined), DEFAULT_BATCH_SIZE);
check("zero -> default", clampBatchSize(0), DEFAULT_BATCH_SIZE);
check("negative -> default", clampBatchSize(-10), DEFAULT_BATCH_SIZE);
check("oversized -> capped", clampBatchSize(1_000_000), MAX_BATCH_SIZE);
check("reasonable value kept", clampBatchSize(50), 50);

const rows: ChangeRecord[] = [1, 2, 3, 4, 5].map((seq) => ({
  seq,
  entityType: "document",
  entityKey: `REC-${seq}`,
  op: "update",
  revision: seq,
  originNodeId: seq === 3 ? 9 : null,
}));

console.log("\n— buildPullBatch: cursor arithmetic —");
const all = buildPullBatch(rows, 0, 10);
check("returns everything past the cursor", all.changes.length, 5);
check("nextCursor is the last seq sent", all.nextCursor, 5);
check("hasMore false when fully drained", all.hasMore, false);

const fromMiddle = buildPullBatch(rows, 3, 10);
check("skips changes at or below the cursor", fromMiddle.changes.map((c) => c.seq), [4, 5]);

const limited = buildPullBatch(rows, 0, 2);
check("respects batch size", limited.changes.map((c) => c.seq), [1, 2]);
check("advances only as far as the batch reaches", limited.nextCursor, 2);
check("signals more remain", limited.hasMore, true);

const drained = buildPullBatch(rows, 5, 10);
check("nothing new -> empty batch", drained.changes.length, 0);
// The critical one: with nothing to send the cursor must NOT jump forward, or
// filtered changes beyond it would be skipped forever.
check("empty batch leaves the cursor untouched", drained.nextCursor, 5);
check("empty batch reports no more", drained.hasMore, false);

console.log("\n— buildPullBatch: a node never receives its own changes —");
const excluded = buildPullBatch(rows, 0, 10, 9);
check("own-authored change filtered out", excluded.changes.map((c) => c.seq), [1, 2, 4, 5]);
check("cursor still advances past the filtered change", excluded.nextCursor, 5);

console.log("\n— isValidCursorAdvance —");
check("forward within the log is valid", isValidCursorAdvance(3, 7, 10), true);
check("staying put is valid", isValidCursorAdvance(3, 3, 10), true);
check("backwards is rejected", isValidCursorAdvance(7, 3, 10), false);
check("beyond the log is rejected", isValidCursorAdvance(3, 99, 10), false);
check("negative is rejected", isValidCursorAdvance(3, -1, 10), false);
check("non-integer is rejected", isValidCursorAdvance(3, 4.5, 10), false);

console.log("\n— nextSeq —");
check("empty log starts at 1", nextSeq(null), 1);
check("undefined starts at 1", nextSeq(undefined), 1);
check("increments from max", nextSeq(41), 42);
check("negative treated as empty", nextSeq(-5), 1);

console.log("\n— syncLag —");
check("up to date", syncLag(10, 10), { behind: 0, upToDate: true });
check("behind by 4", syncLag(6, 10), { behind: 4, upToDate: false });
check("cursor ahead never reports negative", syncLag(12, 10), { behind: 0, upToDate: true });

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);

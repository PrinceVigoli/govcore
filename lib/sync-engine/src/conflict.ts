// Book 13 — the pure conflict-resolution core. Given what the server currently
// holds and an incoming change from a node, decide the outcome under the
// entity's policy. No db, no I/O — just facts in, decision out — so the rules
// that determine whether a citizen's edit is kept, overwritten, or escalated to
// a human are exhaustively testable. This is the heart of the per-entity design
// (choice C).
//
// The model is a revision-based optimistic concurrency check. Every syncable
// record carries a monotonically increasing `revision`. A node, when it made
// its offline change, was working from some `baseRevision` (the revision it had
// last seen). Reconciliation compares that base against the server's CURRENT
// revision:
//
//   - server revision == node base  → no one else touched it; FAST-FORWARD
//     (apply the node change cleanly).
//   - server revision  > node base   → someone else changed it since the node
//     forked; this is a genuine CONFLICT, resolved per policy.
//   - node is a create and the key already exists → CONFLICT (duplicate create).
//   - node base  > server revision   → impossible under a correct cursor; treated
//     as a conflict rather than trusted, so a bug can't silently overwrite.

export type ConflictPolicy = "manual" | "last_write_wins" | "server_wins" | "node_wins";
export type SyncOp = "create" | "update" | "delete";

/** The server's current knowledge of a record. `revision` 0 / exists=false means "no such record yet". */
export interface ServerState {
  exists: boolean;
  revision: number;
  updatedAt?: number; // epoch ms; used only to break last_write_wins ties
  deleted?: boolean;
}

/** A change a node made while offline. */
export interface IncomingChange {
  op: SyncOp;
  entityKey: string;
  baseRevision: number; // revision the node was working from (0 for a create)
  payload: unknown; // snapshot the node is proposing; null/omitted for delete
  updatedAt?: number; // epoch ms on the node when the edit was made
}

export type Outcome =
  | "fast_forward" // no divergence; apply cleanly
  | "apply" // conflict, but policy chose the node's side
  | "discard" // conflict, policy chose the server's side (node change dropped)
  | "conflict"; // manual policy; escalate to a human, apply nothing yet

export interface Decision {
  outcome: Outcome;
  /** Which side the decision favored, for the audit trail. */
  winner: "node" | "server" | "none";
  /** True when the two sides genuinely diverged (vs a clean fast-forward). */
  isConflict: boolean;
  reason: string;
}

/**
 * Whether the incoming change diverges from what the server holds — i.e. the
 * server moved on since the node's base revision, so applying blindly would
 * lose work.
 */
export function detectsConflict(server: ServerState, incoming: IncomingChange): boolean {
  // A create for a key that already exists is a conflict (two independent creates).
  if (incoming.op === "create") {
    return server.exists;
  }
  // Update/delete of something the server has never seen: treat as a conflict
  // rather than inventing it, unless the server row was deleted (then it's a
  // delete-vs-delete or update-vs-delete divergence, still a conflict).
  if (!server.exists) {
    return true;
  }
  // The core check: did the server advance past the node's base?
  return server.revision !== incoming.baseRevision;
}

/**
 * Resolves a change under a policy. Pure and total. For "manual" on a genuine
 * conflict it returns outcome "conflict" (escalate); every other case returns a
 * concrete apply/discard/fast_forward so the caller never has to guess.
 */
export function resolve(policy: ConflictPolicy, server: ServerState, incoming: IncomingChange): Decision {
  const conflict = detectsConflict(server, incoming);

  if (!conflict) {
    return {
      outcome: "fast_forward",
      winner: "node",
      isConflict: false,
      reason: "Server unchanged since node's base revision; applied cleanly",
    };
  }

  switch (policy) {
    case "manual":
      return {
        outcome: "conflict",
        winner: "none",
        isConflict: true,
        reason: "Concurrent change under manual policy; escalated for resolution",
      };

    case "server_wins":
      return {
        outcome: "discard",
        winner: "server",
        isConflict: true,
        reason: "Concurrent change; server_wins policy kept the server version",
      };

    case "node_wins":
      return {
        outcome: "apply",
        winner: "node",
        isConflict: true,
        reason: "Concurrent change; node_wins policy applied the node version",
      };

    case "last_write_wins": {
      // Newer wins by wall-clock; if timestamps are missing or equal, the
      // server is authoritative (deterministic tiebreak — never coin-flip on
      // government data). Note the known caveat: LWW trusts node clocks.
      const nodeTime = incoming.updatedAt;
      const serverTime = server.updatedAt;
      if (nodeTime === undefined || serverTime === undefined) {
        return {
          outcome: "discard",
          winner: "server",
          isConflict: true,
          reason: "last_write_wins with missing timestamp; defaulted to server",
        };
      }
      if (nodeTime > serverTime) {
        return { outcome: "apply", winner: "node", isConflict: true, reason: "last_write_wins: node change is newer" };
      }
      return {
        outcome: "discard",
        winner: "server",
        isConflict: true,
        reason: nodeTime === serverTime ? "last_write_wins tie; server kept" : "last_write_wins: server change is newer",
      };
    }
  }
}

/** Valid policy values, for validation at the registration boundary. */
export const CONFLICT_POLICIES: ConflictPolicy[] = ["manual", "last_write_wins", "server_wins", "node_wins"];

export function isConflictPolicy(value: string): value is ConflictPolicy {
  return (CONFLICT_POLICIES as string[]).includes(value);
}

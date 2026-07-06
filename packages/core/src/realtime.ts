// Subscribe-and-invalidate helper (PHILOSOPHY Realtime — canonical, locked):
// wires per-product channel `invalidate` broadcast events into TanStack Query
// invalidation. Clients refetch through the API — NO Postgres-Changes
// subscriptions, no RLS holes, the schema stays private.
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SubscribeAndInvalidateOptions {
  /** Per-product channel, e.g. "template:realtime" — products never cross-talk. */
  channel: string;
  /**
   * Broadcast resource → query keys to invalidate. The hey-api TanStack plugin
   * generates OBJECT-shaped keys ([{ _id: "listItems", baseUrl, ... }]), so a bare
   * ["items"] prefix would never match — pass the generated key fns' results, e.g.
   * `{ items: [listItemsQueryKey()] }` (partial deep matching also catches the
   * `_infinite` variant). Unmapped resources fall back to the plain [resource] key.
   */
  keys?: Record<string, ReadonlyArray<QueryKey>>;
}

/** Returns the unsubscribe function — hand it straight to useEffect. */
export function subscribeAndInvalidate(
  supabase: SupabaseClient,
  queryClient: QueryClient,
  opts: SubscribeAndInvalidateOptions,
): () => void {
  const channel = supabase
    .channel(opts.channel)
    .on("broadcast", { event: "invalidate" }, (msg) => {
      const resource = (msg.payload as { resource?: string }).resource;
      if (!resource) return;
      for (const queryKey of opts.keys?.[resource] ?? [[resource]]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    })
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

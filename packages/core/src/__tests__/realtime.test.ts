// Realtime is a LOCKED decision (PHILOSOPHY): broadcast-only. Tables stay RLS-deny-all, the API
// broadcasts `invalidate` on a per-product channel, and clients refetch through the API. This is
// the client half of that contract; if it stopped invalidating, the UI would silently serve stale
// data and every existing gate would still be green.
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { subscribeAndInvalidate } from "../realtime";

type BroadcastHandler = (msg: { payload: unknown }) => void;

/** Stand-in for the supabase client: records the channel name and captures the handler that
 *  `.on("broadcast", { event: "invalidate" }, …)` registers, so a broadcast can be replayed. */
function fakeSupabase() {
  let handler: BroadcastHandler | undefined;
  const subscribe = jest.fn();
  const removeChannel = jest.fn();
  const channelObject = {};
  const channel = jest.fn((_name: string) => ({
    on: (_type: string, filter: { event: string }, fn: BroadcastHandler) => {
      if (filter.event === "invalidate") handler = fn;
      return { subscribe: () => (subscribe(), channelObject) };
    },
  }));
  return {
    supabase: { channel, removeChannel } as unknown as SupabaseClient,
    channel,
    subscribe,
    removeChannel,
    channelObject,
    broadcast: (payload: unknown) => {
      if (!handler) throw new Error("no invalidate handler was registered");
      handler({ payload });
    },
  };
}

function fakeQueryClient() {
  const invalidateQueries = jest.fn();
  return { queryClient: { invalidateQueries } as unknown as QueryClient, invalidateQueries };
}

describe("subscribeAndInvalidate", () => {
  it("subscribes to the per-product channel it was given", () => {
    const s = fakeSupabase();
    const q = fakeQueryClient();

    subscribeAndInvalidate(s.supabase, q.queryClient, { channel: "template:realtime" });

    // Products never cross-talk: the channel name is the isolation boundary.
    expect(s.channel).toHaveBeenCalledWith("template:realtime");
    expect(s.subscribe).toHaveBeenCalled();
  });

  it("invalidates the MAPPED query keys for a broadcast resource", () => {
    const s = fakeSupabase();
    const q = fakeQueryClient();
    // hey-api's TanStack plugin generates object-shaped keys, so a bare ["items"] prefix
    // would never match — the mapping is what makes invalidation actually land.
    const generated: QueryKey = [{ _id: "listItems", baseUrl: "http://localhost:8000" }];

    subscribeAndInvalidate(s.supabase, q.queryClient, {
      channel: "template:realtime",
      keys: { items: [generated] },
    });
    s.broadcast({ resource: "items" });

    expect(q.invalidateQueries).toHaveBeenCalledWith({ queryKey: generated });
  });

  it("falls back to the plain [resource] key when the resource is unmapped", () => {
    const s = fakeSupabase();
    const q = fakeQueryClient();

    subscribeAndInvalidate(s.supabase, q.queryClient, { channel: "template:realtime" });
    s.broadcast({ resource: "widgets" });

    expect(q.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["widgets"] });
  });

  it("ignores a broadcast with no resource instead of invalidating everything", () => {
    const s = fakeSupabase();
    const q = fakeQueryClient();

    subscribeAndInvalidate(s.supabase, q.queryClient, { channel: "template:realtime" });
    s.broadcast({});

    expect(q.invalidateQueries).not.toHaveBeenCalled();
  });

  it("returns an unsubscribe that removes the channel", () => {
    const s = fakeSupabase();
    const q = fakeQueryClient();

    const unsubscribe = subscribeAndInvalidate(s.supabase, q.queryClient, {
      channel: "template:realtime",
    });
    unsubscribe();

    // Without this a remounting screen stacks subscriptions and multiplies refetches.
    expect(s.removeChannel).toHaveBeenCalledWith(s.channelObject);
  });
});

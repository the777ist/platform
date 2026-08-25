// This hook is the client half of the LOCKED broadcast-only realtime decision (PHILOSOPHY):
// tables stay RLS-deny-all, the API broadcasts `invalidate` on a PER-PRODUCT channel, and clients
// refetch through the API. Two things here are easy to break silently:
//
//  - the channel name. It is rewritten per product by the generator, and a wrong one means the
//    client subscribes to a channel nobody broadcasts on: no error, no refetch, just stale data.
//  - the query key. hey-api generates OBJECT-shaped keys, so a bare ["items"] would never match
//    and invalidation would quietly do nothing.
import { renderHook } from "@testing-library/react-native";
import { subscribeAndInvalidate } from "@platform/core";
import { listItemsQueryKey } from "@platform/template-api-client";
import { useItemsRealtime } from "../use-items-realtime";

const mockUnsubscribe = jest.fn();
jest.mock("@platform/core", () => ({
  subscribeAndInvalidate: jest.fn(() => mockUnsubscribe),
  supabase: { __brand: "supabase" },
}));
jest.mock("@platform/template-api-client", () => ({
  listItemsQueryKey: jest.fn(() => [{ _id: "listItems" }]),
}));

const queryClient = { __brand: "queryClient" };
jest.mock("@tanstack/react-query", () => ({ useQueryClient: () => queryClient }));

const mockSubscribe = subscribeAndInvalidate as jest.MockedFunction<typeof subscribeAndInvalidate>;

beforeEach(() => jest.clearAllMocks());

describe("useItemsRealtime", () => {
  it("subscribes on this product's channel with the GENERATED query key", async () => {
    await renderHook(() => useItemsRealtime());

    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    const [supabaseArg, queryClientArg, options] = mockSubscribe.mock.calls[0]!;
    expect(supabaseArg).toEqual({ __brand: "supabase" });
    expect(queryClientArg).toBe(queryClient);
    expect(options.channel).toBe("template:realtime");
    // Must be the generated key fn's result, not a hand-written ["items"].
    expect(options.keys).toEqual({ items: [listItemsQueryKey()] });
  });

  it("unsubscribes on unmount, so a remounting screen cannot stack subscriptions", async () => {
    const { unmount } = await renderHook(() => useItemsRealtime());
    expect(mockUnsubscribe).not.toHaveBeenCalled();

    await unmount();

    // Without this every navigation away and back multiplies the refetches.
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});

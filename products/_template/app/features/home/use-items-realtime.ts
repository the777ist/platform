// Wire the per-product broadcast channel into TanStack invalidation (PHILOSOPHY
// Realtime: broadcast-only — the API broadcasts after mutations; clients refetch
// through the API). The generated hey-api query keys are OBJECT-shaped, so the
// mapping passes the generated key fn result — a bare ["items"] would never match.
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeAndInvalidate, supabase } from "@the777incident/core";
import { listItemsQueryKey } from "@the777incident/template-api-client";

export function useItemsRealtime(): void {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      subscribeAndInvalidate(supabase, queryClient, {
        channel: "template:realtime",
        // Partial deep matching also catches the `_infinite: true` variant the
        // home list actually uses.
        keys: { items: [listItemsQueryKey()] },
      }),
    [queryClient],
  );
}

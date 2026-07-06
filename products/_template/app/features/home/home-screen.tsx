// PHILOSOPHY.md (features/home tree): "list screen via generated API hooks".
// Renders cursor-paginated /v1/items through the generated useInfiniteQuery hook.
// Loading / error / empty states; cache-persisted (the persister is configured in
// packages/core query.ts from Phase 2, so a reload paints cached pages instantly).
// Phase 8 adds the add-item mutation (exercised by the web E2E) and wires the
// broadcast-only realtime subscription — a mutation in ANY client invalidates the
// list in every subscribed client, which then refetches through the API.
import { useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";
import { Button, Input, Text } from "@the777incident/ui";
// Generated TanStack Query plugin exports (`{{name}}InfiniteOptions` /
// `{{name}}Mutation` off the api's route-name operationIds). The infinite options
// wire queryKey + a queryFn that maps pageParam onto the `cursor` query param — but
// NOT initialPageParam/getNextPageParam, so those are supplied here off the
// contract's next_cursor field.
import {
  createItemMutation,
  listItemsInfiniteOptions,
  listItemsQueryKey,
} from "@the777incident/template-api-client";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { useItemsRealtime } from "./use-items-realtime";

function AddItemRow() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const create = useMutation({
    ...createItemMutation(),
    onSuccess: () => {
      setTitle("");
      // The broadcast round-trip refreshes every OTHER client; invalidate locally
      // too so the creating client never waits on the realtime path.
      void queryClient.invalidateQueries({ queryKey: listItemsQueryKey() });
    },
  });

  return (
    <View className="border-border flex-row items-center gap-2 border-b p-4">
      <Input
        className="flex-1"
        placeholder="Title"
        value={title}
        onChangeText={setTitle}
        editable={!create.isPending}
      />
      <Button
        onPress={() => {
          const trimmed = title.trim();
          if (trimmed) create.mutate({ body: { title: trimmed } });
        }}
        disabled={create.isPending || !title.trim()}
      >
        Add item
      </Button>
    </View>
  );
}

export function HomeScreen() {
  useItemsRealtime();
  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    ...listItemsInfiniteOptions(),
    // "" (not null): the api reads empty-cursor as first page, and the generated queryFn's
    // `typeof pageParam === "object"` guard would treat null as a params object and crash.
    initialPageParam: "",
    // next_cursor is null on the last page — exactly TanStack's "no more pages" signal.
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? null,
  });

  if (isPending) {
    return (
      <View className="bg-background flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="bg-background flex-1 items-center justify-center gap-2 p-6">
        {/* RFC 9457 problem+json is typed; surface its title. */}
        <Text className="text-destructive">Couldn’t load items</Text>
        <Text className="text-muted-foreground">{String(error)}</Text>
        <Text className="text-primary" onPress={() => void refetch()}>
          Tap to retry
        </Text>
      </View>
    );
  }

  const items = data.pages.flatMap((page) => page.items);

  return (
    <View className="bg-background flex-1">
      <AddItemRow />
      {items.length === 0 ? (
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-muted-foreground">No items yet</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerClassName="bg-background"
          renderItem={({ item }) => (
            <View className="border-border border-b p-4">
              <Text className="text-foreground">{item.title}</Text>
            </View>
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator className="py-4" /> : null}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
          }
        />
      )}
    </View>
  );
}
// Note: `FlatList` is RN's built-in virtualized list (no extra dependency). For very long
// lists a product may later swap in `@shopify/flash-list` (same data/render API) — an
// unpinned dependency PHILOSOPHY.md deliberately does not introduce.

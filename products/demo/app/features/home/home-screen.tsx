// PHILOSOPHY.md (features/home tree): "list screen via generated API hooks".
// Renders cursor-paginated /v1/items through the generated useInfiniteQuery hook.
// Loading / error / empty states; cache-persisted (the persister is configured in
// packages/core query.ts from Phase 2, so a reload paints cached pages instantly).
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";
import { Text } from "@platform/ui";
// Generated TanStack Query plugin export (`{{name}}InfiniteOptions` off the api's
// `list_items` operationId). It wires queryKey + a queryFn that maps pageParam onto the
// `cursor` query param — but NOT initialPageParam/getNextPageParam, so those are supplied
// here off the contract's next_cursor field.
import { listItemsInfiniteOptions } from "@platform/demo-api-client";
import { useInfiniteQuery } from "@tanstack/react-query";

export function HomeScreen() {
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

  if (items.length === 0) {
    return (
      <View className="bg-background flex-1 items-center justify-center p-6">
        <Text className="text-muted-foreground">No items yet</Text>
      </View>
    );
  }

  return (
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
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
    />
  );
}
// Note: `FlatList` is RN's built-in virtualized list (no extra dependency). For very long
// lists a product may later swap in `@shopify/flash-list` (same data/render API) — an
// unpinned dependency PHILOSOPHY.md deliberately does not introduce.

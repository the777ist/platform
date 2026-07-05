import { QueryClient } from "@tanstack/react-query";
import { persister } from "./persist";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, gcTime: 1000 * 60 * 60 * 24 },
    },
  });
}

export { persister };

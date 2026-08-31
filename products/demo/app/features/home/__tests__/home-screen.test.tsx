// The home screen is the demo's reference list screen — every product is stamped from it, so
// its four states (pending / error / empty / list) and its create guard become every product's
// behaviour. The create guard is a data-integrity rule, not cosmetics: without it a stray tap
// posts an item with an empty or whitespace-only title, which the list then renders as a blank row.
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { HomeScreen } from "../home-screen";

jest.mock("../use-items-realtime", () => ({ useItemsRealtime: jest.fn() }));
jest.mock("@platform/demo-api-client", () => ({
  createItemMutation: jest.fn(() => ({ mutationFn: jest.fn() })),
  listItemsInfiniteOptions: jest.fn(() => ({ queryKey: ["items"] })),
  listItemsQueryKey: jest.fn(() => [{ _id: "listItems" }]),
}));

const mockInvalidate = jest.fn();
const mockMutate = jest.fn();
jest.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: jest.fn(),
  useMutation: jest.fn(),
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));

const mockUseInfiniteQuery = useInfiniteQuery as jest.MockedFunction<typeof useInfiniteQuery>;
const mockUseMutation = useMutation as jest.MockedFunction<typeof useMutation>;

/** Only the fields HomeScreen reads; anything else would be noise. */
function query(overrides: Record<string, unknown> = {}) {
  mockUseInfiniteQuery.mockReturnValue({
    data: { pages: [{ items: [], next_cursor: null }] },
    isPending: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
    isRefetching: false,
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    ...overrides,
  } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  query();
  mockUseMutation.mockReturnValue({ mutate: mockMutate, isPending: false } as never);
});

describe("HomeScreen states", () => {
  it("shows a spinner while the first page is pending", async () => {
    query({ isPending: true, data: undefined });
    await render(<HomeScreen />);

    // The pending branch returns EARLY, so none of the loaded UI exists. Rendering the add row
    // over a spinner would let a user type into a list that has not loaded, and showing the
    // empty state would claim "no items" before anything was fetched.
    expect(screen.queryByPlaceholderText("Title")).toBeNull();
    expect(screen.queryByText("No items yet")).toBeNull();
    expect(screen.queryByText("Couldn’t load items")).toBeNull();
  });

  it("surfaces a load failure with a retry affordance", async () => {
    const refetch = jest.fn();
    query({ isError: true, error: new Error("boom"), refetch, data: undefined });
    await render(<HomeScreen />);

    expect(screen.getByText("Couldn’t load items")).toBeOnTheScreen();
    await fireEvent.press(screen.getByText("Tap to retry"));
    expect(refetch).toHaveBeenCalled();
  });

  it("retry is a real BUTTON, so web/desktop keyboard users can reach it", async () => {
    const refetch = jest.fn();
    query({ isError: true, error: new Error("boom"), refetch, data: undefined });
    await render(<HomeScreen />);

    // react-native-web's Text attaches only onClick for onPress — no tabIndex, no role — so
    // a bare <Text onPress> is unreachable by Tab and unannounced as a control. RefreshControl
    // is inert on web, which makes this the ONLY in-app recovery affordance there: as a Text,
    // a keyboard-only or screen-reader user has no way out of the error state at all.
    // Pressable (what Button composes) sets tabIndex = disabled ? -1 : 0.
    const retry = screen.getByRole("button", { name: "Tap to retry" });
    await fireEvent.press(retry);

    expect(refetch).toHaveBeenCalled();
  });

  it("surfaces the problem+json title and NEVER a raw stringified error", async () => {
    // The generated client is configured throwOnError, and it throws the PARSED problem+json
    // body — a plain object. String(error) on that renders the literal "[object Object]" in
    // front of the user, which is both useless and a breach of the never-raw-error rule.
    query({ isError: true, error: { title: "Item not found", status: 404 }, data: undefined });
    await render(<HomeScreen />);

    expect(screen.getByText("Couldn’t load items")).toBeOnTheScreen();
    expect(screen.getByText("Item not found")).toBeOnTheScreen();
    expect(screen.queryByText("[object Object]")).toBeNull();
  });

  it("shows ONLY the fixed copy when the failure is not problem+json", async () => {
    // Offline / DNS / CORS throw a real Error, whose stringification leaks an internal
    // ("TypeError: Failed to fetch") that means nothing to a user.
    query({ isError: true, error: new Error("network down"), data: undefined });
    await render(<HomeScreen />);

    expect(screen.getByText("Couldn’t load items")).toBeOnTheScreen();
    expect(screen.queryByText(/network down/)).toBeNull();
  });

  it("shows the empty state rather than a blank screen", async () => {
    query({ data: { pages: [{ items: [], next_cursor: null }] } });
    await render(<HomeScreen />);
    expect(screen.getByText("No items yet")).toBeOnTheScreen();
  });

  it("flattens every page into the list", async () => {
    query({
      data: {
        pages: [
          { items: [{ id: "1", title: "first" }], next_cursor: "c1" },
          { items: [{ id: "2", title: "second" }], next_cursor: null },
        ],
      },
    });
    await render(<HomeScreen />);

    // Page two must not be dropped — cursor pagination is the contract.
    expect(screen.getByText("first")).toBeOnTheScreen();
    expect(screen.getByText("second")).toBeOnTheScreen();
  });
});

describe("AddItemRow", () => {
  // The blank-title defence is TWO layers: the button is disabled, and onPress re-checks. The
  // disabled state is the one a user meets, so it is asserted directly — a press-based test alone
  // passes even if the guard is deleted, because a disabled Pressable never fires onPress. (That
  // was true of an earlier version of this suite, and a mutation run is what exposed it.)
  it("disables Add item until there is a non-whitespace title", async () => {
    await render(<HomeScreen />);
    const button = screen.getByRole("button", { name: "Add item" });

    expect(button).toBeDisabled();

    await fireEvent.changeText(screen.getByPlaceholderText("Title"), "   ");
    expect(button).toBeDisabled();

    await fireEvent.changeText(screen.getByPlaceholderText("Title"), "milk");
    expect(button).toBeEnabled();
  });

  it("creates nothing from a whitespace-only title", async () => {
    await render(<HomeScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText("Title"), "   ");
    await fireEvent.press(screen.getByRole("button", { name: "Add item" }));

    // Otherwise the list renders a blank row that nobody can identify or clean up.
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("TRIMS the title before creating", async () => {
    await render(<HomeScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText("Title"), "  milk  ");
    await fireEvent.press(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() => expect(mockMutate).toHaveBeenCalledWith({ body: { title: "milk" } }));
  });

  it("invalidates the list locally on success so the creator does not wait on realtime", async () => {
    // Capture the onSuccess the screen registers and invoke it, which is what the mutation
    // would do — the local invalidate is what makes the new item appear immediately.
    await render(<HomeScreen />);
    const options = mockUseMutation.mock.calls[0]![0] as { onSuccess?: () => void };
    options.onSuccess?.();

    // The KEY is what makes the new item appear; `refetchType: "active"` (asserted separately
    // below) is what stops it refetching every unmounted page too. Matching the key alone keeps
    // this test about the local-invalidate contract rather than re-pinning the fan-out fix.
    expect(mockInvalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: [{ _id: "listItems" }] }),
    );
  });
});

describe("create failures are visible (never silent)", () => {
  // The create mutation had onSuccess and NO onError anywhere in the app. A rejected create —
  // now a correct 422 problem+json since the DTO gained length bounds — left the user staring
  // at an unchanged screen after tapping Add. Making an error CORRECT without making it VISIBLE
  // is the worse of the two bugs: the input silently does nothing and the title stays put.
  it("surfaces the problem+json title when the create is rejected", async () => {
    query();
    mockUseMutation.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      isError: true,
      error: { title: "String should have at most 200 characters" },
    } as never);
    await render(<HomeScreen />);

    expect(screen.getByText("String should have at most 200 characters")).toBeOnTheScreen();
  });

  it("falls back to fixed copy when the rejection is not problem+json shaped", async () => {
    // A transport failure throws a TypeError, not a problem body — the user still needs to be
    // told the tap failed, and must never be shown the raw internal.
    query();
    mockUseMutation.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      isError: true,
      error: new TypeError("Failed to fetch"),
    } as never);
    await render(<HomeScreen />);

    expect(screen.getByText("Couldn’t add item")).toBeOnTheScreen();
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
    expect(screen.queryByText(/TypeError/)).toBeNull();
  });

  it("shows no error banner on the happy path", async () => {
    // Non-vacuity: the two assertions above would pass against a component that ALWAYS renders
    // the banner. This pins that it is conditional on the mutation actually failing.
    query();
    mockUseMutation.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      isError: false,
    } as never);
    await render(<HomeScreen />);

    expect(screen.queryByText("Couldn’t add item")).toBeNull();
  });
});

describe("invalidation is scoped to mounted lists", () => {
  it("invalidates with refetchType 'active' — not every cached page in the app", async () => {
    // Measured live during the TST-1 UI pass: 24 creates produced 48 list refetches in ONE tab,
    // because a bare invalidateQueries refetches every cached page of every list whether or not
    // it is mounted. `refetchType: "active"` marks the rest stale and lets them refetch when
    // something actually mounts them. The fan-out multiplies by list count AND connected client.
    query();
    mockUseMutation.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      isError: false,
    } as never);
    await render(<HomeScreen />);

    // Drive the real onSuccess the component handed to useMutation.
    const options = mockUseMutation.mock.calls.at(-1)![0] as { onSuccess?: () => void };
    options.onSuccess?.();

    expect(mockInvalidate).toHaveBeenCalledWith(expect.objectContaining({ refetchType: "active" }));
  });
});

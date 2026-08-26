// The home screen is the template's reference list screen — every product is stamped from it, so
// its four states (pending / error / empty / list) and its create guard become every product's
// behaviour. The create guard is a data-integrity rule, not cosmetics: without it a stray tap
// posts an item with an empty or whitespace-only title, which the list then renders as a blank row.
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { HomeScreen } from "../home-screen";

jest.mock("../use-items-realtime", () => ({ useItemsRealtime: jest.fn() }));
jest.mock("@platform/template-api-client", () => ({
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

    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: [{ _id: "listItems" }] });
  });
});

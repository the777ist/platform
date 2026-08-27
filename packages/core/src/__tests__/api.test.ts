// configureApiClient is where PHILOSOPHY's Observability invariant physically lives: "the
// api-client wrapper sends a generated X-Request-Id per request; Sentry events are tagged with
// it on both sides → client→API→logs traceability". Nothing enforced that until now — the header
// could have silently stopped being sent and every gate would still have been green.
import { configureApiClient, type GeneratedApiClient } from "../api";
import { captureRequestId } from "../sentry";
import { getAccessToken } from "../auth";

jest.mock("../sentry", () => ({ captureRequestId: jest.fn(), initSentry: jest.fn() }));
jest.mock("../auth", () => ({ getAccessToken: jest.fn() }));

const mockCaptureRequestId = captureRequestId as jest.MockedFunction<typeof captureRequestId>;
const mockGetAccessToken = getAccessToken as jest.MockedFunction<typeof getAccessToken>;

/** Minimal stand-in for a fetch Request: only `.headers.set/get` is exercised, and building it
 *  by hand keeps the test independent of whether the JS environment ships undici globals. */
function fakeRequest() {
  const headers = new Map<string, string>();
  return {
    headers: {
      set: (k: string, v: string) => headers.set(k.toLowerCase(), v),
      get: (k: string) => headers.get(k.toLowerCase()) ?? null,
    },
  } as unknown as Request;
}

/** Stand-in for the product's generated hey-api client; captures the registered interceptor. */
function fakeClient() {
  let interceptor: ((request: Request) => Request) | undefined;
  const setConfig = jest.fn();
  const client: GeneratedApiClient = {
    setConfig,
    interceptors: {
      request: {
        use: (fn: (request: Request) => Request) => {
          interceptor = fn;
          return undefined;
        },
      },
    },
  };
  return {
    client,
    setConfig,
    run: (request: Request) => {
      if (!interceptor) throw new Error("no interceptor was registered");
      return interceptor(request);
    },
    get registered() {
      return interceptor !== undefined;
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAccessToken.mockReturnValue(null);
});

describe("configureApiClient", () => {
  it("points the client at EXPO_PUBLIC_API_URL", () => {
    const c = fakeClient();
    configureApiClient(c.client);
    expect(c.setConfig).toHaveBeenCalledWith({ baseUrl: "http://localhost:8000" });
  });

  it("sets an X-Request-Id on every request and tags Sentry with the SAME id", () => {
    const c = fakeClient();
    configureApiClient(c.client);

    const request = c.run(fakeRequest());
    const sent = request.headers.get("X-Request-Id");

    expect(sent).toBeTruthy();
    // The whole point of the header is correlation: a different id in Sentry would look
    // identical in every log and be useless for tracing.
    expect(mockCaptureRequestId).toHaveBeenCalledWith(sent);
  });

  it("generates a DIFFERENT id per request", () => {
    const c = fakeClient();
    configureApiClient(c.client);

    const first = c.run(fakeRequest()).headers.get("X-Request-Id");
    const second = c.run(fakeRequest()).headers.get("X-Request-Id");

    expect(first).not.toEqual(second);
  });

  it("forwards the Supabase access token as a Bearer header when signed in", () => {
    mockGetAccessToken.mockReturnValue("jwt-123");
    const c = fakeClient();
    configureApiClient(c.client);

    expect(c.run(fakeRequest()).headers.get("Authorization")).toBe("Bearer jwt-123");
  });

  it("sends no Authorization header when signed out", () => {
    mockGetAccessToken.mockReturnValue(null);
    const c = fakeClient();
    configureApiClient(c.client);

    expect(c.run(fakeRequest()).headers.get("Authorization")).toBeNull();
  });

  it("is idempotent — configuring the same client twice registers one interceptor", () => {
    const c = fakeClient();
    configureApiClient(c.client);
    configureApiClient(c.client);

    // A second setConfig would mean a second interceptor too, i.e. two X-Request-Ids
    // per request with only the last one reaching Sentry.
    expect(c.setConfig).toHaveBeenCalledTimes(1);
  });
});

// Two behaviours here are easy to get wrong in opposite directions:
//
//  - initSentry MUST no-op without a DSN. Local dev and CI have none, and an SDK that initialised
//    anyway would attach handlers and swallow/reshape errors in exactly the environment where you
//    are trying to read them.
//  - captureRequestId MUST tag with the SAME id the api wrapper put on the request header. That
//    tag is the only thing linking a client Sentry event to the API event and the structlog line;
//    a mismatched or missing tag makes every trace look identical and useless.
import type * as SentryTypes from "@sentry/react-native";

jest.mock("@sentry/react-native", () => ({ init: jest.fn(), setTag: jest.fn() }));

// jest.resetModules() hands the re-required module a FRESH mock instance, so a Sentry reference
// captured at the top of this file would never see those calls. The loader returns the mock that
// the module under test actually got.
function loadSentry(env: Record<string, string | undefined>) {
  const saved = { ...process.env };
  Object.entries(env).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
  jest.resetModules();
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    return {
      ...(require("../sentry") as typeof import("../sentry")),
      sentry: require("@sentry/react-native") as jest.Mocked<typeof SentryTypes>,
    };
    /* eslint-enable @typescript-eslint/no-require-imports */
  } finally {
    process.env = saved;
  }
}

beforeEach(() => jest.clearAllMocks());

describe("initSentry", () => {
  it("does NOTHING without a DSN", async () => {
    const { initSentry, sentry } = loadSentry({ EXPO_PUBLIC_SENTRY_DSN: undefined });
    initSentry();
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it("initialises with the DSN and tags the environment", async () => {
    const { initSentry, sentry } = loadSentry({
      EXPO_PUBLIC_SENTRY_DSN: "https://key@sentry.example/1",
      EXPO_PUBLIC_ENV: "staging",
    });
    initSentry();

    expect(sentry.init).toHaveBeenCalledWith(
      // Without `environment`, staging and production events land in one undifferentiated pile.
      expect.objectContaining({
        dsn: "https://key@sentry.example/1",
        environment: "staging",
      }),
    );
  });
});

describe("captureRequestId", () => {
  it("tags the scope with request_id, which is what links client → API → logs", async () => {
    const { captureRequestId, sentry } = loadSentry({
      EXPO_PUBLIC_SENTRY_DSN: "https://key@sentry.example/1",
    });
    captureRequestId("abc-123");

    // The API middleware tags its own scope with the same key and value.
    expect(sentry.setTag).toHaveBeenCalledWith("request_id", "abc-123");
  });
});

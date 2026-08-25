// The upload PATH is a security boundary, not a formatting detail: the avatars bucket's RLS
// policy grants a user write access to `<their id>/…` only. If this ever stopped prefixing the
// user id, every upload would land outside the policy — either failing in production or, worse,
// landing somewhere another user's policy covers. Nothing asserted it until now.
import { uploadAvatar, signedAvatarUrl } from "../storage";
import { getSupabase } from "../supabase";

jest.mock("../supabase", () => ({ getSupabase: jest.fn(), supabase: {} }));

const mockGetSupabase = getSupabase as jest.MockedFunction<typeof getSupabase>;

type UploadArgs = {
  path: string;
  body: unknown;
  options: { contentType?: string; upsert?: boolean };
};

function fakeSupabase(overrides: { uploadError?: Error; signedError?: Error } = {}) {
  const calls: UploadArgs[] = [];
  const upload = jest.fn((path: string, body: unknown, options: UploadArgs["options"]) => {
    calls.push({ path, body, options });
    return Promise.resolve({ error: overrides.uploadError ?? null });
  });
  const getPublicUrl = jest.fn((path: string) => ({
    data: { publicUrl: `https://cdn.test/${path}` },
  }));
  const createSignedUrl = jest.fn(() =>
    Promise.resolve(
      overrides.signedError
        ? { data: null, error: overrides.signedError }
        : { data: { signedUrl: "https://cdn.test/signed" }, error: null },
    ),
  );
  const from = jest.fn(() => ({ upload, getPublicUrl, createSignedUrl }));
  mockGetSupabase.mockReturnValue({ storage: { from } } as never);
  // Accessor rather than calls[0]: tsconfig is strict, and this also turns "the upload never
  // happened" into a clear message instead of a cryptic undefined-property failure.
  const firstUpload = (): UploadArgs => {
    const call = calls[0];
    if (!call) throw new Error("upload was never called");
    return call;
  };
  return { from, upload, getPublicUrl, createSignedUrl, firstUpload };
}

beforeEach(() => {
  jest.clearAllMocks();
  // storage.ts fetches the local file URI into a Blob before uploading.
  globalThis.fetch = jest.fn(() =>
    Promise.resolve({ blob: () => Promise.resolve("BLOB" as unknown as Blob) }),
  ) as unknown as typeof fetch;
});

describe("uploadAvatar", () => {
  it("writes under the OWNER's id, which is what the per-user RLS policy keys on", async () => {
    const s = fakeSupabase();
    await uploadAvatar("user-abc", { uri: "file:///tmp/pic.png", name: "pic.png" });

    expect(s.from).toHaveBeenCalledWith("avatars");
    expect(s.firstUpload().path).toBe("user-abc/avatar.png");
  });

  it("lowercases the extension so PNG and png cannot become two objects", async () => {
    const s = fakeSupabase();
    await uploadAvatar("u1", { uri: "file:///tmp/p.PNG", name: "p.PNG" });
    expect(s.firstUpload().path).toBe("u1/avatar.png");
  });

  it("falls back to jpg when the picker gives no filename", async () => {
    const s = fakeSupabase();
    await uploadAvatar("u1", { uri: "file:///tmp/whatever" });
    expect(s.firstUpload().path).toBe("u1/avatar.jpg");
    expect(s.firstUpload().options.contentType).toBe("image/jpeg");
  });

  it("upserts, so re-uploading replaces the avatar instead of accumulating objects", async () => {
    const s = fakeSupabase();
    await uploadAvatar("u1", { uri: "file:///tmp/p.png", name: "p.png" });
    expect(s.firstUpload().options.upsert).toBe(true);
  });

  it("cache-busts the returned URL so the image refreshes after an upsert", async () => {
    fakeSupabase();
    const result = await uploadAvatar("u1", { uri: "file:///tmp/p.png", name: "p.png" });

    expect(result.path).toBe("u1/avatar.png");
    // Same object path every time, so without a changing query string the <Image> would
    // keep showing the previous avatar.
    expect(result.url).toMatch(/^https:\/\/cdn\.test\/u1\/avatar\.png\?t=\d+$/);
  });

  it("throws when the upload fails instead of returning a broken URL", async () => {
    fakeSupabase({ uploadError: new Error("quota exceeded") });
    await expect(uploadAvatar("u1", { uri: "file:///tmp/p.png", name: "p.png" })).rejects.toThrow(
      "quota exceeded",
    );
  });
});

describe("signedAvatarUrl", () => {
  it("returns the signed URL", async () => {
    fakeSupabase();
    await expect(signedAvatarUrl("u1/avatar.png")).resolves.toBe("https://cdn.test/signed");
  });

  it("throws when signing fails", async () => {
    fakeSupabase({ signedError: new Error("not found") });
    await expect(signedAvatarUrl("u1/avatar.png")).rejects.toThrow("not found");
  });
});

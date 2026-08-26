// This screen supplies the ONE argument that decides where the upload lands: `user.id`. The
// avatars bucket's RLS policy grants a user write access to `<their id>/…` only, so together with
// the packages/core storage test this pins the path end to end — the screen passes the owner, the
// helper prefixes with it.
//
// The guards matter as much: uploading with no signed-in user, or after the picker was cancelled,
// would either throw deep inside supabase or upload an undefined asset.
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import * as ImagePicker from "expo-image-picker";
import { uploadAvatar, useSession } from "@platform/core";
import { AvatarUploader } from "../avatar-uploader";

jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock("@platform/core", () => ({ uploadAvatar: jest.fn(), useSession: jest.fn() }));

const mockPick = ImagePicker.launchImageLibraryAsync as jest.MockedFunction<
  typeof ImagePicker.launchImageLibraryAsync
>;
const mockUpload = uploadAvatar as jest.MockedFunction<typeof uploadAvatar>;
const mockUseSession = useSession as jest.MockedFunction<typeof useSession>;

const pressUpload = () => fireEvent.press(screen.getByRole("button", { name: "Upload avatar" }));

beforeEach(() => {
  jest.clearAllMocks();
  mockUseSession.mockReturnValue({ user: { id: "user-42" } } as never);
  mockPick.mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///tmp/pic.png", mimeType: "image/png", fileName: "pic.png" }],
  } as never);
  mockUpload.mockResolvedValue({ path: "user-42/avatar.png", url: "https://cdn/x.png?t=1" });
});

describe("AvatarUploader", () => {
  it("uploads under the SIGNED-IN user's id", async () => {
    await render(<AvatarUploader />);
    await pressUpload();

    // Anything other than the session user's id lands outside that user's RLS policy.
    await waitFor(() =>
      expect(mockUpload).toHaveBeenCalledWith("user-42", {
        uri: "file:///tmp/pic.png",
        mimeType: "image/png",
        name: "pic.png",
      }),
    );
  });

  it("falls back to avatar.jpg when the picker gives no filename", async () => {
    mockPick.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/x", mimeType: undefined, fileName: null }],
    } as never);
    await render(<AvatarUploader />);
    await pressUpload();

    await waitFor(() =>
      expect(mockUpload).toHaveBeenCalledWith(
        "user-42",
        expect.objectContaining({ name: "avatar.jpg" }),
      ),
    );
  });

  it("does NOTHING when nobody is signed in", async () => {
    mockUseSession.mockReturnValue({ user: null } as never);
    await render(<AvatarUploader />);
    await pressUpload();

    // Without the guard this uploads to `undefined/avatar.…`, outside every policy.
    expect(mockPick).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("does nothing when the picker is cancelled", async () => {
    mockPick.mockResolvedValue({ canceled: true, assets: null } as never);
    await render(<AvatarUploader />);
    await pressUpload();

    await waitFor(() => expect(mockPick).toHaveBeenCalled());
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("does nothing when the picker returns no asset", async () => {
    mockPick.mockResolvedValue({ canceled: false, assets: [] } as never);
    await render(<AvatarUploader />);
    await pressUpload();

    await waitFor(() => expect(mockPick).toHaveBeenCalled());
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("surfaces an upload failure instead of failing silently", async () => {
    mockUpload.mockRejectedValue(new Error("Payload too large"));
    await render(<AvatarUploader />);
    await pressUpload();

    expect(await screen.findByText("Payload too large")).toBeOnTheScreen();
  });

  it("falls back to a readable message when the failure is not an Error", async () => {
    mockUpload.mockRejectedValue("nope");
    await render(<AvatarUploader />);
    await pressUpload();

    expect(await screen.findByText("Upload failed")).toBeOnTheScreen();
  });
});

// registerForPushNotifications must return null rather than throw on every platform where push
// cannot work — web, simulators, Expo Go, denied permission. If it threw instead, app startup
// would break on exactly the surfaces developers use most. It must also never POST a token it did
// not get, and never re-prompt a user who already granted permission.
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { registerForPushNotifications } from "../notifications";

// `isDevice` is exposed through a getter over mutable state: assigning to a property of a
// namespace import does not reliably take effect under the ESM->CJS interop, and a silently
// ineffective mock would make the simulator case pass for the wrong reason.
const mockDeviceState = { isDevice: true };
jest.mock("expo-device", () => ({
  get isDevice() {
    return mockDeviceState.isDevice;
  },
  osName: "iOS",
  modelId: "iPhone15,2",
  modelName: "iPhone",
  osInternalBuildId: "22A123",
}));
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
}));

const mockNotifications = Notifications as jest.Mocked<typeof Notifications>;

beforeEach(() => {
  jest.clearAllMocks();
  (Platform as { OS: string }).OS = "ios";
  mockDeviceState.isDevice = true;
  mockNotifications.getPermissionsAsync.mockResolvedValue({ status: "granted" } as never);
  mockNotifications.requestPermissionsAsync.mockResolvedValue({ status: "granted" } as never);
  mockNotifications.getExpoPushTokenAsync.mockResolvedValue({
    data: "ExponentPushToken[abc]",
  } as never);
});

describe("registerForPushNotifications", () => {
  it("returns the token and posts device_id + expo_token", async () => {
    const post = jest.fn().mockResolvedValue(undefined);

    const token = await registerForPushNotifications(post);

    expect(token).toBe("ExponentPushToken[abc]");
    expect(post).toHaveBeenCalledWith({
      // device_id feeds the API's per user+device unique key.
      device_id: "iOS-iPhone15,2-22A123",
      expo_token: "ExponentPushToken[abc]",
    });
  });

  it("does NOT re-prompt when permission was already granted", async () => {
    const post = jest.fn().mockResolvedValue(undefined);
    await registerForPushNotifications(post);
    // Re-prompting an already-granted user is a no-op dialog on some platforms and an
    // outright annoyance on others.
    expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("prompts once when permission is undetermined, then registers", async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: "undetermined" } as never);
    const post = jest.fn().mockResolvedValue(undefined);

    const token = await registerForPushNotifications(post);

    expect(mockNotifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(token).toBe("ExponentPushToken[abc]");
  });

  it("returns null and posts nothing when permission is denied", async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: "denied" } as never);
    mockNotifications.requestPermissionsAsync.mockResolvedValue({ status: "denied" } as never);
    const post = jest.fn();

    await expect(registerForPushNotifications(post)).resolves.toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it("returns null on web, where this template ships no VAPID setup", async () => {
    (Platform as { OS: string }).OS = "web";
    const post = jest.fn();

    await expect(registerForPushNotifications(post)).resolves.toBeNull();
    expect(post).not.toHaveBeenCalled();
    // It must not even ask: a permission prompt on web would be a visible bug.
    expect(mockNotifications.getPermissionsAsync).not.toHaveBeenCalled();
  });

  it("returns null on a simulator/emulator, which cannot receive push tokens", async () => {
    mockDeviceState.isDevice = false;
    const post = jest.fn();

    await expect(registerForPushNotifications(post)).resolves.toBeNull();
    expect(post).not.toHaveBeenCalled();
  });
});

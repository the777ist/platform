// Push-token registration helper (PHILOSOPHY Push notifications: "token registration
// in the app (expo-notifications), /v1/push-tokens endpoint + table (per user+device)").
// Core is product-agnostic, so the product passes its generated SDK call in (same
// pattern as configureApiClient) — e.g. from (tabs)/_layout.tsx:
//   registerForPushNotifications((body) => registerToken({ body, throwOnError: true }))
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export interface PushRegistration {
  device_id: string;
  expo_token: string;
}

/** Stable-enough per-device identity for the user_id+device_id unique key. Products
 * wanting a hardware-grade id can swap in expo-application (iosIdForVendor/androidId). */
function deviceId(): string {
  const parts = [Device.osName, Device.modelId ?? Device.modelName, Device.osInternalBuildId];
  return parts.filter(Boolean).join("-") || "unknown-device";
}

/**
 * Ask for notification permission, fetch the Expo push token, and POST it to the
 * product API via the injected generated-SDK call. Returns the token, or null when
 * registration is impossible: web (Expo web push needs a VAPID setup this template
 * doesn't ship), simulators/emulators, Expo Go (no dev build), or permission denied.
 * The full loop is verified on real devices — Expo Go cannot receive push tokens.
 */
export async function registerForPushNotifications(
  post: (registration: PushRegistration) => Promise<unknown>,
): Promise<string | null> {
  if (Platform.OS === "web" || !Device.isDevice) return null;
  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== "granted") {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") return null;
  const { data: token } = await Notifications.getExpoPushTokenAsync();
  await post({ device_id: deviceId(), expo_token: token });
  return token;
}

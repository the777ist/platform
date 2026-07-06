import { getSupabase } from "./supabase";

const AVATAR_BUCKET = "avatars";

export type UploadResult = { path: string; url: string };

/**
 * Direct-to-Storage upload (supabase-js, frontend-only path per Topology decision).
 * Stores under `<userId>/avatar.<ext>` so the per-user RLS policy (avatars bucket
 * migration) applies. Returns a public URL (avatars bucket is public) — swap to a
 * signed URL for private buckets.
 */
export async function uploadAvatar(
  userId: string,
  file: { uri: string; mimeType?: string; name?: string },
): Promise<UploadResult> {
  const supabase = getSupabase();
  const ext = (file.name?.split(".").pop() ?? "jpg").toLowerCase();
  const path = `${userId}/avatar.${ext}`;

  // RN/web: fetch the local file URI into a Blob/ArrayBuffer for upload.
  // ⚠️ On React Native, fetching a file:// URI to a Blob has historically been flaky;
  // switch to an ArrayBuffer (expo-file-system read) if uploads misbehave on a device.
  const res = await fetch(file.uri);
  const blob = await res.blob();

  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, blob, {
    contentType: file.mimeType ?? `image/${ext === "jpg" ? "jpeg" : ext}`,
    upsert: true, // re-uploading replaces the user's avatar in place
  });
  if (error) throw error;

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  // cache-bust so the <Image> re-fetches after an upsert overwrites the same path
  return { path, url: `${data.publicUrl}?t=${Date.now()}` };
}

/** For a private bucket variant: time-limited signed URL instead of public. */
export async function signedAvatarUrl(path: string, expiresInSec = 3600): Promise<string> {
  const { data, error } = await getSupabase()
    .storage.from(AVATAR_BUCKET)
    .createSignedUrl(path, expiresInSec);
  if (error) throw error;
  return data.signedUrl;
}

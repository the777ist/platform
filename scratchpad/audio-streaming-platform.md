# Audio-streaming platform — plan & runbook (scratchpad)

> Working note for a future product built on this template. **Not** part of the template's
> canonical docs — it's a design + build plan to pick up when we spin up the audio-streaming
> product. Synthesised from our design chats.

## TL;DR

- **Can the template support it?** Yes — cleanly, as an **additive tier**. The template gives
  the _product shell_ (4-target RN client, auth, layered FastAPI control plane, Postgres
  metadata, Storage, typed client, CI/CD). Audio streaming is a **media plane** bolted on
  alongside — the same "Dockerized service on Fly, autoscaled, behind a LB" shape the template
  already uses.
- **Two versions:**
  - **V0 — VOD adaptive (ship first):** upload → transcode to multi-bitrate HLS → CDN →
    client-side ABR. Runs entirely on the existing stack (Fly + Supabase + a CDN) + one new
    transcode worker. No media servers.
  - **V1 — live (grow into it):** add an ingest + live-packaging tier (SRS / LiveKit /
    nginx-rtmp) as a **separate Fly app** — autoscaled, LB'd, UDP — or a managed provider
    (Mux / Cloudflare Stream / LiveKit Cloud). The FastAPI control plane and the client player
    carry over **unchanged**; only the media _source_ changes.
- **"Adaptive" = multi-bitrate HLS + client ABR.** You get a real adaptive pipeline in V0
  without any live media servers.

---

## Why it fits (and where it doesn't)

| Concern                                                  | Verdict                                                                                                                                                                                                                                        |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VOD (podcasts / music / voice notes)                     | **Fits well** — object storage + CDN + HLS/AAC + a transcode job; pure additive build                                                                                                                                                          |
| Control plane (upload, signed URLs, playlists, metadata) | **Free** — exactly the layered-CRUD FastAPI the template is built for                                                                                                                                                                          |
| Live / real-time (rooms, low-latency broadcast, voice)   | **Not out of the box** — needs a media-server tier (SFU/RTMP/WebRTC). Supabase Realtime here is _broadcast-only cache invalidation_, not a media transport                                                                                     |
| Infra                                                    | Fly.io + Supabase + Vercel — **not** Kubernetes. Fly does container autoscaling / scale-to-zero / multi-region / **UDP** / dedicated IPs, which covers media-server hosting. k8s is a _deliberate_ deviation, only if you specifically want it |
| Media load-balancing                                     | **Special** — WebRTC/RTMP are sticky/stateful (session-affinity, UDP), not round-robin HTTP. A CDN only fronts the HLS/HTTP leg. LiveKit-style coordinators handle node selection; true on any platform, not a Fly limitation                  |

Fly scaling knobs you get for the media tier: horizontal scale to N machines, `fly-autoscaler`
(metrics-based), `autostart/autostop` (scale-to-zero), Fly Proxy LB (TCP/HTTP/TLS + UDP),
dedicated/Anycast IPs, regions.

---

## The gist analogue (AWS VOD → our stack)

The reference gist is a classic **AWS VOD adaptive pipeline** (S3 → Elastic Transcoder → multi-
bitrate HLS+DASH → CloudFront → Video.js, iOS→HLS / else→DASH), done by hand in the console
(no backend, no auth, no metadata). Our V0 is the same architecture, **strictly better**:

| Gist (AWS, manual)                                    | Our analogue                                                                                                                                                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3 S3 buckets (`-in`/`-out`/`-thumbs`)                 | Supabase Storage buckets `media-in` / `media-out` / `media-thumbs` (or S3)                                                                                                                    |
| **Elastic Transcoder** (deprecated → MediaConvert)    | **ffmpeg** transcode worker on a Fly Machine (template's Fly-job pattern), or managed (MediaConvert / Mux / Transloadit)                                                                      |
| HLS **+** DASH, 10s segments                          | **HLS only** for V0 — multi-bitrate AAC (64/128/256 kbps) + `master.m3u8`. HLS plays native on iOS/Android + `hls.js` on web/desktop → DASH unnecessary (optional add)                        |
| **CloudFront** (origin `-out`, CORS, forward headers) | CDN over `media-out`: Supabase Storage CDN or Cloudflare/CloudFront. Same CORS; **signed playback URLs minted by FastAPI**                                                                    |
| Video.js + contrib-hls + dash.js (iOS→HLS/else→DASH)  | Cross-platform RN player: `react-native-track-player`/`expo-video` (native, background + lock-screen) + `hls.js`/Video.js on web — behind `.native/.web` extensions. One component, 4 targets |
| `-thumbs` bucket + 2nd CloudFront                     | `media-thumbs` bucket on same CDN; poster URL in metadata                                                                                                                                     |
| _(nothing — manual console)_                          | **FastAPI control plane**: `assets` table, upload presign, enqueue transcode, status, signed URLs, RLS deny-all, problem+json                                                                 |

What we gain over the gist: **auth + ownership + signed URLs** (gist is wide-open public),
**real metadata + status** in Postgres, a **typed cross-platform client** (not one web `<video>`
tag), **reproducible infra** (as code, not console clicks).

---

## V0 architecture (VOD, audio)

```
RN app (iOS/Android/web/desktop)
   │  1. presign upload            ▲  5. GET /media/{id}/play → signed master.m3u8
   ▼                               │     player does ABR off the manifest
FastAPI api  ── asset row, status ─►  Postgres (assets metadata + status)
   │  2. enqueue transcode (job row)
   ▼
Transcode worker  (Fly Machine: ffmpeg, autostop when idle)
   │  3. media-in → AAC renditions 64/128/256 + master.m3u8 + .ts/.m4s segments
   ▼
Object store (Supabase Storage / S3)  ──►  CDN (Supabase CDN / Cloudflare)  ──► client
                                            ▲ 4. worker callback → status=ready, hls_url, duration
```

Flow: `presign → upload to media-in → enqueue → worker transcodes → writes media-out → callback
sets status=ready → client requests signed master.m3u8 → CDN serves → player ABR`.

## V1 growth (live)

```
broadcaster ──RTMP/WebRTC──► media-server fleet (SRS / nginx-rtmp / LiveKit)  [NEW Fly app]
                                 Fly: autoscaled, LB'd, UDP / dedicated IPs
                                 │  live HLS packaging (multi-bitrate)
                                 ▼
                              CDN  ──► same client HLS player as V0
FastAPI (unchanged) mints stream keys / tokens + stores metadata.
Managed alt: Mux / Cloudflare Stream (live HLS) or LiveKit Cloud (WebRTC) — same wiring, no ops.
```

---

## Where it lives in the monorepo

A normal product feature — slots into the locked patterns:

- **API** — `products/<product>/api/` a `media` aggregate:
  - `models/asset.py` — SQLModel, UUIDv7 PK, RLS deny-all. Fields (sketch): `id`, `owner_id`,
    `title`, `status` (`uploading|processing|ready|failed`), `duration_s`, `hls_key`,
    `poster_key`, `bytes_in`, `created_at`, `updated_at`.
  - `schemas/` — Pydantic v2 DTOs (never the ORM row).
  - `services/media_service.py` — `create_upload` (presign to `media-in`), `enqueue_transcode`,
    `mark_ready` (worker callback), `sign_playback` (signed `master.m3u8`), `list_assets`
    (cursor-paginated), `delete_asset`.
  - `routers/media.py` — thin, `Depends(MediaService)`; problem+json; slowapi keys.
- **Worker** — `<product>-transcoder`: a small Fly app running **ffmpeg**, triggered off a job
  row (template's Fly-machine job pattern), `autostop` when idle. Reads `media-in`, writes HLS
  renditions to `media-out`, POSTs a signed callback to the API.
- **Storage** — `media-in` (uploads, private), `media-out` (HLS output, CDN-fronted),
  `media-thumbs`. CORS + `Cache-Control` on `media-out`.
- **Client** — `products/<product>/app/features/player/`:
  - `player.native.tsx` — `react-native-track-player` (background audio, lock-screen, HLS ABR).
  - `player.web.tsx` — `hls.js` (or Video.js) `<audio>`/`<video>`.
  - shared hook consumes the **generated typed client** (`useGetMediaPlay()` etc. — flows in via
    typegen automatically after the endpoint lands).
- **Contracts** — the media endpoints regenerate the typed client through the normal typegen
  step; never hand-edit the client.

---

## Scale, performance & caching (per the architect Step 5b lens)

- **Storage/CDN, not the API, serves the media.** The API only serves _signed manifest URLs_ —
  bytes go Storage→CDN→client. The API stays a thin, stateless control plane (scales out on Fly).
- **Transcode is off the request path** — always a job (Fly Machine), never inline. Heavy /
  batch transcode → a worker fleet (PHILOSOPHY defers a real queue+worker to "heavier products").
- **`list_assets`** — cursor keyset on the UUIDv7 PK (time-ordered), bounded page size, index on
  `(owner_id, created_at)`; no N+1 (join poster/rendition metadata in one query).
- **Payload** — DTO returns metadata + a _signed URL_, not rendition blobs.
- **Client cache** — TanStack Query for asset lists/metadata (persisted); the **player** relies on
  HLS segment caching at the CDN + the native player's buffer, not the query cache.
- **CDN cache** — long `Cache-Control` on immutable segments; short/none on the manifest if you
  rotate signed URLs (or sign at the segment level / use CDN tokenised auth).
- **Rate-limit / distributed cache** — once the API scales to >1 Fly machine, slowapi's in-memory
  store won't share; add **Redis (Upstash on Fly)** for distributed limits + any hot-key cache.
- **Live fan-out (V1)** — listener scale is the CDN's job (HLS is cacheable); origin scale is the
  packager fleet. WebRTC scale is the SFU's job (sticky nodes + coordinator).

---

## Decisions to lock before building

1. **VOD first (V0) or straight to live (V1)?** Recommend V0 first — validates the whole
   pipeline; the client + control plane carry into V1.
2. **Transcode: self-hosted ffmpeg (Fly) vs managed (Mux / MediaConvert / Transloadit)?**
   Self-hosted = cheaper + full control + fits the Fly-job pattern; managed = zero ops, faster to
   ship. Start self-hosted ffmpeg for audio (light), consider managed if catalog/scale explodes.
3. **Storage: Supabase Storage (built-in CDN, in-stack) vs S3 + Cloudflare/CloudFront?**
   Supabase Storage first (fewest moving parts); move to S3+CF if you outgrow it.
4. **Renditions:** AAC 64/128/256 kbps, 6–10s segments, `master.m3u8`. (Audio is light — fewer,
   smaller renditions than video.)
5. **Access control:** signed manifest URLs (short TTL) vs CDN tokenised auth vs public. Signed
   URLs via FastAPI for V0.
6. **Player libs:** `react-native-track-player` (native) + `hls.js` (web). Confirm desktop
   (Electron = web build → `hls.js`).
7. **Live provider (V1 only):** self-host SRS/LiveKit on Fly vs LiveKit Cloud / Mux / Cloudflare
   Stream. Decide by ops appetite + latency target.

---

## Build runbook (once the base monorepo exists)

**Prereq:** the template is built out (`/implement 1–8`) and your product is stamped
(`pnpm new-product <product>`), running locally.

Use the `ptfm-*` pipeline — this is a genuine multi-phase feature, so run the architect:

1. **`/ptfm-product <product> <TICKET>`** _(optional — for the real product brief: who/why/scope,
   VOD-vs-live, catalog size, latency target, monetisation)._
2. **`/ptfm-architect <product> <TICKET>`** — it will phase this. Expected phases:
   - **Phase 1 — VOD happy path (thin slice):** `assets` table + Alembic migration (RLS deny-all,
     UUIDv7) → `MediaService.create_upload`/`sign_playback` → `routers/media.py` → typegen →
     upload + list + a single-rendition play screen on web+iOS. (Even single-bitrate first.)
   - **Phase 2 — adaptive transcode:** the `<product>-transcoder` Fly app (ffmpeg → multi-bitrate
     HLS) + `enqueue_transcode` + worker callback (`mark_ready`) + status UX. Now it's _adaptive_.
   - **Phase 3 — CDN + signed URLs + poster/thumbs + cross-platform player polish** (background
     audio, lock-screen, offline cache of downloaded tracks).
   - **Phase 4+ (optional) — live:** the ingest/media-server tier (Fly app or managed) → live HLS
     → same player.
     Each phase carries the **Scale & extensibility** section (Step 5b): index/pagination/fan-out,
     transcode-off-request-path, Redis-when-multi-instance, the V0→V1 seam.
3. **Per phase:** `/ptfm-plan <product> <PHASE-TICKET>` → `/ptfm-implement <product> <PHASE-TICKET>`
   → `/ptfm-audit` → `/ptfm-simplify` → `/ptfm-commonify` → `/ptfm-review` → `/ptfm-test-ui`.
4. **Infra to provision** (outside the code): the 3 Storage buckets + CORS + CDN, the
   `<product>-transcoder` Fly app + its ffmpeg image, a signed-callback secret (worker→API), and
   (when the API scales) Redis. Fold these into the product's infra checklist.

**Manual smoke test (V0):** upload an audio file → poll status → worker produces
`media-out/<asset>/master.m3u8` (+ renditions) → `GET /media/{id}/play` returns a signed URL →
player streams and switches renditions under a throttled network.

---

## Open questions / risks

- **`react-native-track-player` ↔ current Expo SDK** — confirm the version pairing (native module;
  needs a dev build, not Expo Go). Web player is separate (`hls.js`).
- **Signed-URL ↔ HLS segment auth** — a signed _manifest_ doesn't auto-sign the _segments_; decide
  segment-level signing vs CDN tokenised auth vs a short-lived signed prefix.
- **Transcode cost/time at catalog scale** — self-hosted ffmpeg fleet vs managed; a real queue if
  volume is high.
- **Live latency target** — HLS live is ~seconds; sub-second needs WebRTC (LiveKit) → different tier.
- **Storage egress cost** — CDN caching + rendition sizing matter; watch Supabase Storage egress
  vs S3+CF economics at scale.

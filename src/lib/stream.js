// src/lib/stream.js  — GIFT3RS Live Streaming (Agora RTC SDK NG)
import AgoraRTC from "agora-rtc-sdk-ng";
import { supabase } from "./supabase";

const APP_ID = import.meta.env.VITE_AGORA_APP_ID;

// Always create a fresh audienceClient per join (no stale state)
let audienceClient = null;

// Correctly named: [audioTrack, videoTrack] = createMicrophoneAndCameraTracks()
let localAudioTrack = null;
let localVideoTrack = null;

export const makeChannel = (userId) => `gift3rs_${userId}_${Date.now()}`;

// ─────────────────────────────────────────────────────────────
// START STREAM
// Creates a FRESH Agora client every time to avoid stale state
// from previous failed/ended streams.
// ─────────────────────────────────────────────────────────────
export const startStream = async ({
  channelName,
  onViewerCountUpdate,
  streamId: providedStreamId,
}) => {
  // Always use a brand-new client — never reuse a client that may be
  // stuck in CONNECTING state from a previous failed attempt
  const hc = AgoraRTC.createClient({ mode: "live", codec: "vp8" });

  try {
    await hc.setClientRole("host");

    // null uid = Agora assigns numeric uid; avoids string/numeric uid mismatch
    await hc.join(APP_ID, channelName, null, null);

    // createMicrophoneAndCameraTracks returns [audioTrack, videoTrack]
    // Destructure in the CORRECT order — audio first, video second
    [localAudioTrack, localVideoTrack] =
      await AgoraRTC.createMicrophoneAndCameraTracks();

    await hc.publish([localAudioTrack, localVideoTrack]);

    if (providedStreamId) {
      const updateCount = async () => {
        const count = hc.remoteUsers.length;
        onViewerCountUpdate?.(count);
        supabase.from("streams")
          .update({ viewer_count: count })
          .eq("id", providedStreamId)
          .then(null, null); // fire-and-forget; .catch() not available on PostgrestBuilder
      };
      hc.on("user-joined", updateCount);
      hc.on("user-left",   updateCount);
    }

    // Store reference so endStream / toggles can access it
    startStream._activeClient = hc;

    return { channelName, localAudioTrack, localVideoTrack };
  } catch (e) {
    // Try to clean up on failure
    try { await hc.leave(); } catch (_) {}
    console.error("[startStream]", e?.code, e?.message || e);
    throw new Error(e?.message || "Failed to start stream");
  }
};
startStream._activeClient = null;

export const playLocalVideo = (element) => {
  if (localVideoTrack && element) localVideoTrack.play(element);
};

export const toggleMic = async (enabled) => {
  if (localAudioTrack) await localAudioTrack.setEnabled(enabled).catch(() => {});
};

export const toggleCamera = async (enabled) => {
  if (localVideoTrack) await localVideoTrack.setEnabled(enabled).catch(() => {});
};

// ─────────────────────────────────────────────────────────────
// END STREAM
// ─────────────────────────────────────────────────────────────
export const endStream = async (streamId) => {
  try {
    if (localVideoTrack) {
      try { localVideoTrack.stop(); localVideoTrack.close(); } catch (_) {}
      localVideoTrack = null;
    }
    if (localAudioTrack) {
      try { localAudioTrack.stop(); localAudioTrack.close(); } catch (_) {}
      localAudioTrack = null;
    }
    const hc = startStream._activeClient;
    if (hc) {
      try { await hc.leave(); } catch (_) {}
      startStream._activeClient = null;
    }
    if (streamId) {
      // Supabase never throws — just await, errors surface in {data,error}
      await supabase.from("streams")
        .update({ is_live: false })
        .eq("id", streamId);
    }
    return true;
  } catch (e) {
    console.error("[endStream]", e);
    return false;
  }
};

// ─────────────────────────────────────────────────────────────
// JOIN as VIEWER
// Fresh client every call — no stale role/channel state
// null uid — stays in numeric mode, same as host
// ─────────────────────────────────────────────────────────────
export const joinStream = async ({
  channelName,
  onVideoTrack,
  onAudioTrack,
  onStreamerLeft,
  onConnected,
}) => {
  audienceClient = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
  const ac = audienceClient;

  try {
    await ac.setClientRole("audience");
    await ac.join(APP_ID, channelName, null, null);

    // Subscribe to any tracks already being published when we join
    for (const ru of ac.remoteUsers) {
      try {
        if (ru.hasVideo) {
          await ac.subscribe(ru, "video");
          onVideoTrack?.(ru.videoTrack);
        }
        if (ru.hasAudio) {
          await ac.subscribe(ru, "audio");
          ru.audioTrack?.play();
          onAudioTrack?.(ru.audioTrack);
        }
      } catch (_) {}
    }

    onConnected?.();

    ac.on("user-published", async (ru, mediaType) => {
      try {
        await ac.subscribe(ru, mediaType);
        if (mediaType === "video") onVideoTrack?.(ru.videoTrack);
        if (mediaType === "audio") { ru.audioTrack?.play(); onAudioTrack?.(ru.audioTrack); }
      } catch (_) {}
    });

    ac.on("user-unpublished", (ru, mediaType) => {
      if (mediaType === "video") try { ru.videoTrack?.stop(); } catch (_) {}
    });

    ac.on("user-left", () => onStreamerLeft?.());

    return true;
  } catch (e) {
    console.error("[joinStream]", e?.code, e?.message || e);
    return false;
  }
};

export const leaveStream = async () => {
  try {
    if (audienceClient) await audienceClient.leave().catch(() => {});
    return true;
  } catch { return false; }
};

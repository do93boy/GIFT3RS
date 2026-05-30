// src/lib/stream.js  — GIFT3RS Live Streaming (Agora RTC SDK NG)
//
// CRITICAL NOTE — createMicrophoneAndCameraTracks return order
// ─────────────────────────────────────────────────────────────
// AgoraRTC.createMicrophoneAndCameraTracks() returns [audioTrack, videoTrack].
// The array is [MIC, CAMERA] — audio comes FIRST.
// Destructuring as [localVideoTrack, localAudioTrack] swaps them, causing:
//   • Camera button mutes mic (and vice-versa)
//   • Live preview is black (playing audio track as video)
//   • Viewer video is black
// Correct destructuring: [localAudioTrack, localVideoTrack]
//
// UID TYPE — always null
// ──────────────────────
// Passing a Supabase UUID string as the Agora UID locks the channel into
// string-uid mode.  Viewers joining with null (→ numeric) are rejected with
// INVALID_OPERATION.  Using null for BOTH sides keeps everything numeric.
//
// SEPARATE CLIENTS
// ────────────────
// One hostClient for streamers, one fresh audienceClient per viewer join.
// Sharing a client between roles causes stale state / role-switch errors.

import AgoraRTC from "agora-rtc-sdk-ng";
import { supabase } from "./supabase";

const APP_ID = import.meta.env.VITE_AGORA_APP_ID;

let hostClient    = null;
let audienceClient = null;

// Module-level track references — correctly named after fix
let localAudioTrack = null;   // IMicrophoneAudioTrack
let localVideoTrack = null;   // ICameraVideoTrack

const getHostClient = () => {
  if (!hostClient) hostClient = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
  return hostClient;
};

const getFreshAudienceClient = () => {
  audienceClient = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
  return audienceClient;
};

export const makeChannel = (userId) => `gift3rs_${userId}_${Date.now()}`;

// ─────────────────────────────────────────────────────────────
// START STREAM (host)
// ─────────────────────────────────────────────────────────────
export const startStream = async ({
  userId,
  channelName,
  title,
  category,
  isSubscriberOnly = false,
  onViewerCountUpdate,
  streamId: providedStreamId,
}) => {
  const hc = getHostClient();

  try {
    try { await hc.leave(); } catch (_) {}

    await hc.setClientRole("host");
    await hc.join(APP_ID, channelName, null, null);

    // ✅ CORRECT ORDER: createMicrophoneAndCameraTracks → [audioTrack, videoTrack]
    [localAudioTrack, localVideoTrack] =
      await AgoraRTC.createMicrophoneAndCameraTracks();

    await hc.publish([localAudioTrack, localVideoTrack]);

    let recordId = providedStreamId;
    if (!recordId) {
      const { data, error } = await supabase
        .from("streams")
        .insert({
          streamer_id: userId, title, category,
          is_live: true, is_subscriber_only: isSubscriberOnly,
          channel_name: channelName, viewer_count: 0,
          started_at: new Date().toISOString(),
        })
        .select("id").single();
      if (error) throw error;
      recordId = data.id;
    }

    const updateCount = async () => {
      const count = hc.remoteUsers.length;
      onViewerCountUpdate?.(count);
      supabase.from("streams").update({ viewer_count: count }).eq("id", recordId).catch(() => {});
    };
    hc.on("user-joined", updateCount);
    hc.on("user-left",   updateCount);

    return { streamId: recordId, channelName, localAudioTrack, localVideoTrack };
  } catch (e) {
    console.error("[startStream]", e?.code, e?.message || e);
    throw new Error(e?.message || String(e));
  }
};

// ─────────────────────────────────────────────────────────────
export const playLocalVideo = (element) => {
  if (localVideoTrack && element) localVideoTrack.play(element);
};

export const toggleMic = async (enabled) => {
  if (localAudioTrack) await localAudioTrack.setEnabled(enabled);
};

export const toggleCamera = async (enabled) => {
  if (localVideoTrack) await localVideoTrack.setEnabled(enabled);
};

// ─────────────────────────────────────────────────────────────
// END STREAM
// ─────────────────────────────────────────────────────────────
export const endStream = async (streamId) => {
  try {
    if (localVideoTrack) { localVideoTrack.stop(); localVideoTrack.close(); localVideoTrack = null; }
    if (localAudioTrack) { localAudioTrack.stop(); localAudioTrack.close(); localAudioTrack = null; }
    if (hostClient) await hostClient.leave().catch(() => {});
    if (streamId) {
      await supabase.from("streams")
        .update({ is_live: false, ended_at: new Date().toISOString() })
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
// ─────────────────────────────────────────────────────────────
export const joinStream = async ({
  channelName,
  onVideoTrack,
  onAudioTrack,
  onStreamerLeft,
  onConnected,
}) => {
  const ac = getFreshAudienceClient();
  try {
    await ac.setClientRole("audience");
    await ac.join(APP_ID, channelName, null, null);

    // Subscribe to any tracks already published when we arrive
    for (const ru of ac.remoteUsers) {
      try {
        if (ru.hasVideo) { await ac.subscribe(ru, "video"); onVideoTrack?.(ru.videoTrack); }
        if (ru.hasAudio) { await ac.subscribe(ru, "audio"); ru.audioTrack?.play(); onAudioTrack?.(ru.audioTrack); }
      } catch (_) {}
    }

    onConnected?.();

    ac.on("user-published", async (ru, mediaType) => {
      try {
        await ac.subscribe(ru, mediaType);
        if (mediaType === "video") { onVideoTrack?.(ru.videoTrack); }
        if (mediaType === "audio") { ru.audioTrack?.play(); onAudioTrack?.(ru.audioTrack); }
      } catch (_) {}
    });

    ac.on("user-unpublished", (ru, mediaType) => {
      if (mediaType === "video") ru.videoTrack?.stop();
    });

    ac.on("user-left", () => onStreamerLeft?.());

    return true;
  } catch (e) {
    console.error("[joinStream]", e?.code, e?.message || e);
    return false;
  }
};

// ─────────────────────────────────────────────────────────────
export const leaveStream = async () => {
  try { if (audienceClient) await audienceClient.leave().catch(() => {}); return true; }
  catch { return false; }
};

export const getLiveStreams = async () => {
  const { data } = await supabase.from("streams")
    .select("*").eq("is_live", true).order("viewer_count", { ascending: false });
  return data || [];
};

export const getStream = async (streamId) => {
  const { data } = await supabase.from("streams").select("*").eq("id", streamId).single();
  return data;
};

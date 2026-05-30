// src/lib/stream.js  — GIFT3RS Live Streaming (Agora RTC SDK NG)
//
// KEY DESIGN CHOICES
// ──────────────────
// 1. Separate host/audience clients — never share one client between roles.
//    Sharing a single client causes "channel already joined" or role-switch
//    errors that kill the join silently.
//
// 2. Always use uid = null — Agora auto-assigns a numeric UID.
//    Passing a Supabase UUID string as uid means Agora registers the channel
//    with string-uid mode; any viewer that then joins with null (numeric) gets
//    rejected with INVALID_OPERATION.  Using null everywhere keeps both sides
//    in numeric mode and avoids the mismatch entirely.
//
// 3. startStream skips the DB insert when a streamId is provided — App.jsx
//    pre-inserts so we don't end up with two live records.

import AgoraRTC from "agora-rtc-sdk-ng";
import { supabase } from "./supabase";

const APP_ID = import.meta.env.VITE_AGORA_APP_ID;

// ── Two separate clients — host stays host, audience stays audience ──────────
let hostClient   = null;
let audienceClient = null;

let localVideoTrack = null;
let localAudioTrack = null;

const getHostClient = () => {
  if (!hostClient) hostClient = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
  return hostClient;
};

const getFreshAudienceClient = () => {
  // Always create a brand-new client for viewers so there is zero leftover state
  audienceClient = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
  return audienceClient;
};

// ────────────────────────────────────────────────────────────────────────────
export const makeChannel = (userId) => `gift3rs_${userId}_${Date.now()}`;

// ────────────────────────────────────────────────────────────────────────────
// START STREAMING
// ────────────────────────────────────────────────────────────────────────────
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
    // Clean slate — leave if somehow still connected
    try { await hc.leave(); } catch (_) {}

    await hc.setClientRole("host");

    // ⚠ Use null UID so Agora uses numeric auto-assignment.
    //   Passing a Supabase UUID string here would lock the channel into
    //   string-uid mode, then viewers with null uid would be rejected.
    await hc.join(APP_ID, channelName, null, null);

    [localVideoTrack, localAudioTrack] =
      await AgoraRTC.createMicrophoneAndCameraTracks();

    await hc.publish([localVideoTrack, localAudioTrack]);

    // Use the pre-inserted record ID from App.jsx if provided
    let recordId = providedStreamId;
    if (!recordId) {
      const { data, error } = await supabase
        .from("streams")
        .insert({
          streamer_id:        userId,
          title,
          category,
          is_live:            true,
          is_subscriber_only: isSubscriberOnly,
          channel_name:       channelName,
          viewer_count:       0,
          started_at:         new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      recordId = data.id;
    }

    const updateCount = async () => {
      const count = hc.remoteUsers.length;
      onViewerCountUpdate?.(count);
      await supabase
        .from("streams")
        .update({ viewer_count: count })
        .eq("id", recordId)
        .catch(() => {});
    };

    hc.on("user-joined", updateCount);
    hc.on("user-left",   updateCount);

    return { streamId: recordId, channelName, localVideoTrack, localAudioTrack };
  } catch (e) {
    console.error("[startStream] error:", e);
    // Surface a human-readable message so streamError in App.jsx is useful
    const msg = e?.message || String(e);
    throw new Error(msg);   // re-throw so App.jsx can catch it
  }
};

// ────────────────────────────────────────────────────────────────────────────
export const playLocalVideo = (element) => {
  if (localVideoTrack && element) localVideoTrack.play(element);
};

export const toggleMic = async (enabled) => {
  if (localAudioTrack) await localAudioTrack.setEnabled(enabled);
};

export const toggleCamera = async (enabled) => {
  if (localVideoTrack) await localVideoTrack.setEnabled(enabled);
};

// ────────────────────────────────────────────────────────────────────────────
// END STREAM
// ────────────────────────────────────────────────────────────────────────────
export const endStream = async (streamId) => {
  try {
    if (localVideoTrack) { localVideoTrack.stop(); localVideoTrack.close(); localVideoTrack = null; }
    if (localAudioTrack) { localAudioTrack.stop(); localAudioTrack.close(); localAudioTrack = null; }
    if (hostClient) { await hostClient.leave().catch(() => {}); }
    if (streamId) {
      await supabase
        .from("streams")
        .update({ is_live: false, ended_at: new Date().toISOString() })
        .eq("id", streamId);
    }
    return true;
  } catch (e) {
    console.error("[endStream] error:", e);
    return false;
  }
};

// ────────────────────────────────────────────────────────────────────────────
// JOIN as VIEWER
// Creates a fresh audience client every time to avoid any stale state.
// Uses null UID so the channel stays in numeric mode (same as the host).
// ────────────────────────────────────────────────────────────────────────────
export const joinStream = async ({
  channelName,
  onVideoTrack,
  onAudioTrack,
  onStreamerLeft,
  onConnected,
}) => {
  // Always start with a brand-new client
  const ac = getFreshAudienceClient();
  try {
    await ac.setClientRole("audience");

    // null UID = Agora assigns a random numeric UID — avoids string/number mismatch
    await ac.join(APP_ID, channelName, null, null);

    // Subscribe to any tracks the host is already publishing
    for (const remoteUser of ac.remoteUsers) {
      try {
        if (remoteUser.hasVideo) {
          await ac.subscribe(remoteUser, "video");
          onVideoTrack?.(remoteUser.videoTrack);
        }
        if (remoteUser.hasAudio) {
          await ac.subscribe(remoteUser, "audio");
          remoteUser.audioTrack?.play();
          onAudioTrack?.(remoteUser.audioTrack);
        }
      } catch (_) {}
    }

    // Signal that Agora join itself succeeded (even if host hasn't published yet)
    onConnected?.();

    ac.on("user-published", async (remoteUser, mediaType) => {
      try {
        await ac.subscribe(remoteUser, mediaType);
        if (mediaType === "video") {
          onVideoTrack?.(remoteUser.videoTrack);
        }
        if (mediaType === "audio") {
          remoteUser.audioTrack?.play();
          onAudioTrack?.(remoteUser.audioTrack);
        }
      } catch (_) {}
    });

    ac.on("user-unpublished", (remoteUser, mediaType) => {
      if (mediaType === "video") remoteUser.videoTrack?.stop();
    });

    ac.on("user-left", () => onStreamerLeft?.());

    return true;
  } catch (e) {
    console.error("[joinStream] error:", e?.code, e?.message || e);
    return false;
  }
};

// ────────────────────────────────────────────────────────────────────────────
export const leaveStream = async () => {
  try {
    if (audienceClient) await audienceClient.leave().catch(() => {});
    return true;
  } catch {
    return false;
  }
};

export const getLiveStreams = async () => {
  const { data } = await supabase
    .from("streams")
    .select("*, profiles(display_name, avatar_url, username)")
    .eq("is_live", true)
    .order("viewer_count", { ascending: false });
  return data || [];
};

export const getStream = async (streamId) => {
  const { data } = await supabase
    .from("streams")
    .select("*, profiles(display_name, avatar_url, username)")
    .eq("id", streamId)
    .single();
  return data;
};

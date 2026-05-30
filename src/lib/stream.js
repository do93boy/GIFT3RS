// src/lib/stream.js
// ─────────────────────────────────────────────────────────────
// GIFT3RS Live Streaming Module — powered by Agora
// ─────────────────────────────────────────────────────────────

import AgoraRTC from "agora-rtc-sdk-ng";
import { supabase } from "./supabase";

const APP_ID = import.meta.env.VITE_AGORA_APP_ID;

const client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });

let localVideoTrack = null;
let localAudioTrack = null;

export const makeChannel = (userId) => `gift3rs_${userId}_${Date.now()}`;

// ─────────────────────────────────────────────────────────────
// START STREAMING — called when streamer clicks Go Live
// Accepts an optional streamId; if provided, skips the DB insert
// (App.jsx pre-inserts so we avoid duplicate live records)
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
  try {
    // Leave any lingering channel first
    try { await client.leave(); } catch (_) {}

    await client.setClientRole("host");
    await client.join(APP_ID, channelName, null, userId);

    [localVideoTrack, localAudioTrack] =
      await AgoraRTC.createMicrophoneAndCameraTracks();

    await client.publish([localVideoTrack, localAudioTrack]);

    // Use the pre-inserted record if App.jsx provided one; otherwise insert
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
      const count = client.remoteUsers.length;
      onViewerCountUpdate?.(count);
      await supabase
        .from("streams")
        .update({ viewer_count: count })
        .eq("id", recordId)
        .catch(() => {});
    };

    client.on("user-joined", updateCount);
    client.on("user-left",   updateCount);

    return { streamId: recordId, channelName, localVideoTrack, localAudioTrack };
  } catch (e) {
    console.error("startStream error:", e);
    return null;
  }
};

export const playLocalVideo = (elementId) => {
  if (localVideoTrack) localVideoTrack.play(elementId);
};

export const toggleMic = async (enabled) => {
  if (localAudioTrack) await localAudioTrack.setEnabled(enabled);
};

export const toggleCamera = async (enabled) => {
  if (localVideoTrack) await localVideoTrack.setEnabled(enabled);
};

export const endStream = async (streamId) => {
  try {
    if (localVideoTrack) { localVideoTrack.stop(); localVideoTrack.close(); localVideoTrack = null; }
    if (localAudioTrack) { localAudioTrack.stop(); localAudioTrack.close(); localAudioTrack = null; }
    await client.leave();
    if (streamId) {
      await supabase
        .from("streams")
        .update({ is_live: false, ended_at: new Date().toISOString() })
        .eq("id", streamId);
    }
    return true;
  } catch (e) {
    console.error("endStream error:", e);
    return false;
  }
};

// ─────────────────────────────────────────────────────────────
// JOIN as VIEWER
// Always leaves the current channel first so the client is clean.
// Also subscribes to any tracks already published when we join.
// ─────────────────────────────────────────────────────────────
export const joinStream = async ({
  channelName,
  userId,
  onVideoTrack,
  onAudioTrack,
  onStreamerLeft,
  onConnected,
}) => {
  try {
    // Reset client state before joining
    try { await client.leave(); } catch (_) {}

    await client.setClientRole("audience");
    await client.join(APP_ID, channelName, null, userId || null);

    // Subscribe to any tracks already live when we arrive
    for (const remoteUser of client.remoteUsers) {
      if (remoteUser.hasVideo) {
        await client.subscribe(remoteUser, "video");
        onVideoTrack?.(remoteUser.videoTrack);
      }
      if (remoteUser.hasAudio) {
        await client.subscribe(remoteUser, "audio");
        remoteUser.audioTrack?.play();
        onAudioTrack?.(remoteUser.audioTrack);
      }
    }

    onConnected?.();

    client.on("user-published", async (remoteUser, mediaType) => {
      await client.subscribe(remoteUser, mediaType);
      if (mediaType === "video") {
        onVideoTrack?.(remoteUser.videoTrack);
      }
      if (mediaType === "audio") {
        remoteUser.audioTrack?.play();
        onAudioTrack?.(remoteUser.audioTrack);
      }
    });

    client.on("user-unpublished", (remoteUser, mediaType) => {
      if (mediaType === "video") remoteUser.videoTrack?.stop();
    });

    client.on("user-left", () => onStreamerLeft?.());

    return true;
  } catch (e) {
    console.error("joinStream error:", e);
    return false;
  }
};

export const leaveStream = async () => {
  try { await client.leave(); return true; } catch { return false; }
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

export { client as agoraClient };

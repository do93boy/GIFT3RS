// src/lib/stream.js
// ─────────────────────────────────────────────────────────────
// GIFT3RS Live Streaming Module — powered by Agora
// Handles: Go Live (host), Watch Live (audience), End Stream
// ─────────────────────────────────────────────────────────────

import AgoraRTC from "agora-rtc-sdk-ng";
import { supabase } from "./supabase";

const APP_ID = import.meta.env.VITE_AGORA_APP_ID;

// Create Agora client in live streaming mode
const client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });

// Track local video and audio
let localVideoTrack = null;
let localAudioTrack = null;

// ─────────────────────────────────────────────────────────────
// GENERATE a unique channel name for a stream
// ─────────────────────────────────────────────────────────────
export const makeChannel = (userId) =>
  `gift3rs_${userId}_${Date.now()}`;

// ─────────────────────────────────────────────────────────────
// START STREAMING — called when streamer clicks Go Live
// ─────────────────────────────────────────────────────────────
export const startStream = async ({
  userId,
  channelName,
  title,
  category,
  isSubscriberOnly = false,
  onViewerCountUpdate,
}) => {
  try {
    // 1. Set role as host
    await client.setClientRole("host");

    // 2. Join the Agora channel
    await client.join(APP_ID, channelName, null, userId);

    // 3. Create camera and mic tracks
    [localVideoTrack, localAudioTrack] =
      await AgoraRTC.createMicrophoneAndCameraTracks();

    // 4. Publish tracks so viewers can see/hear
    await client.publish([localVideoTrack, localAudioTrack]);

    // 5. Save stream to Supabase
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

    // 6. Track viewer count in real time
    client.on("user-joined", async () => {
      const count = client.remoteUsers.length;
      onViewerCountUpdate && onViewerCountUpdate(count);
      await supabase
        .from("streams")
        .update({ viewer_count: count })
        .eq("id", data.id);
    });

    client.on("user-left", async () => {
      const count = client.remoteUsers.length;
      onViewerCountUpdate && onViewerCountUpdate(count);
      await supabase
        .from("streams")
        .update({ viewer_count: count })
        .eq("id", data.id);
    });

    return { streamId: data.id, channelName };
  } catch (e) {
    console.error("startStream error:", e);
    alert("Failed to start stream: " + e.message);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────
// PLAY local video into a DOM element
// ─────────────────────────────────────────────────────────────
export const playLocalVideo = (elementId) => {
  if (localVideoTrack) localVideoTrack.play(elementId);
};

// ─────────────────────────────────────────────────────────────
// TOGGLE MIC
// ─────────────────────────────────────────────────────────────
export const toggleMic = async (enabled) => {
  if (localAudioTrack) await localAudioTrack.setEnabled(enabled);
};

// ─────────────────────────────────────────────────────────────
// TOGGLE CAMERA
// ─────────────────────────────────────────────────────────────
export const toggleCamera = async (enabled) => {
  if (localVideoTrack) await localVideoTrack.setEnabled(enabled);
};

// ─────────────────────────────────────────────────────────────
// END STREAM
// ─────────────────────────────────────────────────────────────
export const endStream = async (streamId) => {
  try {
    if (localVideoTrack) {
      localVideoTrack.stop();
      localVideoTrack.close();
      localVideoTrack = null;
    }
    if (localAudioTrack) {
      localAudioTrack.stop();
      localAudioTrack.close();
      localAudioTrack = null;
    }
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
// ─────────────────────────────────────────────────────────────
export const joinStream = async ({
  channelName,
  userId,
  onVideoTrack,
  onAudioTrack,
  onStreamerLeft,
}) => {
  try {
    await client.setClientRole("audience");
    await client.join(APP_ID, channelName, null, userId || null);

    client.on("user-published", async (remoteUser, mediaType) => {
      await client.subscribe(remoteUser, mediaType);
      if (mediaType === "video") {
        onVideoTrack && onVideoTrack(remoteUser.videoTrack);
      }
      if (mediaType === "audio") {
        remoteUser.audioTrack?.play();
        onAudioTrack && onAudioTrack(remoteUser.audioTrack);
      }
    });

    client.on("user-unpublished", (remoteUser, mediaType) => {
      if (mediaType === "video") remoteUser.videoTrack?.stop();
    });

    client.on("user-left", () => {
      onStreamerLeft && onStreamerLeft();
    });

    return true;
  } catch (e) {
    console.error("joinStream error:", e);
    return false;
  }
};

// ─────────────────────────────────────────────────────────────
// LEAVE as VIEWER
// ─────────────────────────────────────────────────────────────
export const leaveStream = async () => {
  try {
    await client.leave();
    return true;
  } catch {
    return false;
  }
};

// ─────────────────────────────────────────────────────────────
// GET all live streams from database
// ─────────────────────────────────────────────────────────────
export const getLiveStreams = async () => {
  const { data } = await supabase
    .from("streams")
    .select("*, profiles(display_name, avatar_url, username)")
    .eq("is_live", true)
    .order("viewer_count", { ascending: false });
  return data || [];
};

// ─────────────────────────────────────────────────────────────
// GET single stream by ID
// ─────────────────────────────────────────────────────────────
export const getStream = async (streamId) => {
  const { data } = await supabase
    .from("streams")
    .select("*, profiles(display_name, avatar_url, username)")
    .eq("id", streamId)
    .single();
  return data;
};

export { client as agoraClient };
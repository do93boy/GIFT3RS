// src/lib/stream.js  — GIFT3RS Live Streaming (Agora RTC SDK NG)
import AgoraRTC from "agora-rtc-sdk-ng";
import { supabase } from "./supabase";

const APP_ID = import.meta.env.VITE_AGORA_APP_ID;

let audienceClient = null;
let localAudioTrack = null;
let localVideoTrack = null;   // camera track

// Screen-share / composite state
let screenRawStream   = null;
let compositeTrack    = null;
let compositeRAF      = null;
let compositeCanvas   = null;
let _screenMode       = "both"; // "both" | "screen" | "cam"

export const makeChannel = (userId) => `gift3rs_${userId}_${Date.now()}`;

// ─────────────────────────────────────────────────────────────
// START STREAM — fresh client each time
// ─────────────────────────────────────────────────────────────
export const startStream = async ({ channelName, onViewerCountUpdate, streamId: providedStreamId }) => {
  const hc = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
  try {
    await hc.setClientRole("host");
    await hc.join(APP_ID, channelName, null, null);
    [localAudioTrack, localVideoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
    await hc.publish([localAudioTrack, localVideoTrack]);

    if (providedStreamId) {
      const updateCount = () => {
        const count = hc.remoteUsers.length;
        onViewerCountUpdate?.(count);
        supabase.from("streams").update({ viewer_count: count }).eq("id", providedStreamId).then(null, null);
      };
      hc.on("user-joined", updateCount);
      hc.on("user-left",   updateCount);
    }
    startStream._activeClient = hc;
    return { channelName, localAudioTrack, localVideoTrack };
  } catch (e) {
    try { await hc.leave(); } catch (_) {}
    console.error("[startStream]", e?.code, e?.message || e);
    throw new Error(e?.message || "Failed to start stream");
  }
};
startStream._activeClient = null;

export const playLocalVideo = (element) => { if (localVideoTrack && element) localVideoTrack.play(element); };
export const toggleMic = async (enabled) => { if (localAudioTrack) await localAudioTrack.setEnabled(enabled).catch(() => {}); };
export const toggleCamera = async (enabled) => { if (localVideoTrack) await localVideoTrack.setEnabled(enabled).catch(() => {}); };

// Returns the currently-published video track so the studio can render it
export const getActiveVideoTrack = () => compositeTrack || localVideoTrack;

// ─────────────────────────────────────────────────────────────
// SCREEN SHARE — composites screen + camera (PiP) onto a canvas
// and publishes that one track.  mode: "both" | "screen" | "cam"
// ─────────────────────────────────────────────────────────────
export const startScreenShare = async ({ mode = "both" } = {}) => {
  const hc = startStream._activeClient;
  if (!hc) throw new Error("You must be live to share your screen.");
  _screenMode = mode;

  screenRawStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });

  const screenEl = document.createElement("video");
  screenEl.srcObject = screenRawStream; screenEl.muted = true; screenEl.playsInline = true;
  await screenEl.play().catch(() => {});

  let camEl = null;
  if (localVideoTrack) {
    const raw = localVideoTrack.getMediaStreamTrack?.();
    if (raw) { camEl = document.createElement("video"); camEl.srcObject = new MediaStream([raw]); camEl.muted = true; camEl.playsInline = true; await camEl.play().catch(() => {}); }
  }

  compositeCanvas = document.createElement("canvas");
  compositeCanvas.width = 1280; compositeCanvas.height = 720;
  const ctx = compositeCanvas.getContext("2d");

  const draw = () => {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 1280, 720);
    if (_screenMode === "cam") {
      if (camEl?.videoWidth) ctx.drawImage(camEl, 0, 0, 1280, 720);
    } else {
      if (screenEl.videoWidth) {
        // contain screen inside canvas, letterboxed
        const ar = screenEl.videoWidth / screenEl.videoHeight, car = 1280 / 720;
        let w = 1280, h = 720, x = 0, y = 0;
        if (ar > car) { h = 1280 / ar; y = (720 - h) / 2; } else { w = 720 * ar; x = (1280 - w) / 2; }
        ctx.drawImage(screenEl, x, y, w, h);
      }
      if (_screenMode === "both" && camEl?.videoWidth) {
        const w = 300, h = 169, pad = 20;
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 18;
        ctx.drawImage(camEl, 1280 - w - pad, pad, w, h);
        ctx.restore();
        ctx.strokeStyle = "#00E5FF"; ctx.lineWidth = 3;
        ctx.strokeRect(1280 - w - pad, pad, w, h);
      }
    }
    compositeRAF = requestAnimationFrame(draw);
  };
  draw();

  const canvasStream = compositeCanvas.captureStream(30);
  compositeTrack = AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: canvasStream.getVideoTracks()[0] });

  try { if (localVideoTrack) await hc.unpublish(localVideoTrack); } catch (_) {}
  await hc.publish(compositeTrack);

  // If the user stops sharing via the browser bar, clean up
  screenRawStream.getVideoTracks()[0].addEventListener("ended", () => { stopScreenShare().catch(() => {}); });

  return { track: compositeTrack };
};

export const setScreenMode = (mode) => { _screenMode = mode; };

export const stopScreenShare = async () => {
  const hc = startStream._activeClient;
  if (compositeRAF) cancelAnimationFrame(compositeRAF);
  compositeRAF = null;
  if (screenRawStream) { screenRawStream.getTracks().forEach(t => t.stop()); screenRawStream = null; }
  try { if (compositeTrack && hc) await hc.unpublish(compositeTrack); } catch (_) {}
  try { compositeTrack?.close(); } catch (_) {}
  compositeTrack = null;
  compositeCanvas = null;
  try { if (localVideoTrack && hc) await hc.publish(localVideoTrack); } catch (_) {}
  return localVideoTrack;
};

export const isScreenSharing = () => !!compositeTrack;

// ─────────────────────────────────────────────────────────────
// END STREAM — DELETE the row so it disappears everywhere
// ─────────────────────────────────────────────────────────────
export const endStream = async (streamId) => {
  try {
    if (compositeTrack) { try { compositeTrack.close(); } catch (_) {} compositeTrack = null; }
    if (compositeRAF) { cancelAnimationFrame(compositeRAF); compositeRAF = null; }
    if (screenRawStream) { screenRawStream.getTracks().forEach(t => t.stop()); screenRawStream = null; }
    if (localVideoTrack) { try { localVideoTrack.stop(); localVideoTrack.close(); } catch (_) {} localVideoTrack = null; }
    if (localAudioTrack) { try { localAudioTrack.stop(); localAudioTrack.close(); } catch (_) {} localAudioTrack = null; }
    const hc = startStream._activeClient;
    if (hc) { try { await hc.leave(); } catch (_) {} startStream._activeClient = null; }
    if (streamId) {
      // Delete everywhere — the stream is over
      await supabase.from("streams").delete().eq("id", streamId);
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
export const joinStream = async ({ channelName, onVideoTrack, onAudioTrack, onStreamerLeft, onConnected }) => {
  audienceClient = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
  const ac = audienceClient;
  try {
    await ac.setClientRole("audience");
    await ac.join(APP_ID, channelName, null, null);
    for (const ru of ac.remoteUsers) {
      try {
        if (ru.hasVideo) { await ac.subscribe(ru, "video"); onVideoTrack?.(ru.videoTrack); }
        if (ru.hasAudio) { await ac.subscribe(ru, "audio"); ru.audioTrack?.play(); onAudioTrack?.(ru.audioTrack); }
      } catch (_) {}
    }
    onConnected?.();
    ac.on("user-published", async (ru, mt) => {
      try {
        await ac.subscribe(ru, mt);
        if (mt === "video") onVideoTrack?.(ru.videoTrack);
        if (mt === "audio") { ru.audioTrack?.play(); onAudioTrack?.(ru.audioTrack); }
      } catch (_) {}
    });
    ac.on("user-unpublished", (ru, mt) => { if (mt === "video") try { ru.videoTrack?.stop(); } catch (_) {} });
    ac.on("user-left", () => onStreamerLeft?.());
    return true;
  } catch (e) {
    console.error("[joinStream]", e?.code, e?.message || e);
    return false;
  }
};

export const leaveStream = async () => {
  try { if (audienceClient) await audienceClient.leave().catch(() => {}); return true; } catch { return false; }
};

// ─────────────────────────────────────────────────────────────
// HOVER PREVIEW — lightweight throwaway client for feed cards
// Returns the client so the caller can leave() it on mouse-out.
// ─────────────────────────────────────────────────────────────
export const joinStreamPreview = async ({ channelName, onVideoTrack }) => {
  const c = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
  try {
    await c.setClientRole("audience");
    await c.join(APP_ID, channelName, null, null);
    for (const ru of c.remoteUsers) {
      if (ru.hasVideo) { try { await c.subscribe(ru, "video"); onVideoTrack?.(ru.videoTrack); } catch (_) {} }
    }
    c.on("user-published", async (ru, mt) => {
      if (mt === "video") { try { await c.subscribe(ru, "video"); onVideoTrack?.(ru.videoTrack); } catch (_) {} }
    });
    return c;
  } catch (e) {
    try { await c.leave(); } catch (_) {}
    return null;
  }
};

export const leavePreview = async (client) => { try { await client?.leave(); } catch (_) {} };

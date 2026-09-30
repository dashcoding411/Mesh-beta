// One-to-one WebRTC calls. Firestore carries only signalling (offer, answer,
// ICE candidates); once connected, a data channel carries mute/camera/hang-up.
//
// Networks behind carrier-grade NAT need a TURN relay: configure
// VITE_ICE_SERVERS, VITE_TURN_URLS/USERNAME/CREDENTIAL or VITE_TURN_API_URL.
// Group calls would need an SFU and aren't supported.
//
// Signalling is abstracted (firestoreSignal) so sessions can run against an
// in-memory channel in tests.

import {
  addDoc, collection, deleteDoc, doc, getDocs, limit, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import { db } from "../firebase";
import { sendMessage } from "./db";
import { pickCamera } from "./cameras";
import { formatDuration } from "./format";

export const RING_MS = 45_000;
const CONNECT_MS = 30_000;   // answer -> connected
const RECOVER_MS = 25_000;   // reconnect budget after a drop
const RESTART_EVERY_MS = 6_000;
const MAX_RESTARTS = 3;

// ICE servers

const STUN = { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] };
let fetchedRelay = null;

export const relayConfigured = () => !!(import.meta.env.VITE_ICE_SERVERS || import.meta.env.VITE_TURN_URLS || import.meta.env.VITE_TURN_API_URL);

/** Parses VITE_ICE_SERVERS, a JSON array as exported by the TURN provider. */
export function parseIceServers(raw) {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return (Array.isArray(list) ? list : []).filter((s) => s && (typeof s.urls === "string" || Array.isArray(s.urls)));
  } catch {
    console.error("VITE_ICE_SERVERS isn't a JSON list of ICE servers; calls will go without a relay.");
    return [];
  }
}

export async function iceServers() {
  const env = import.meta.env;
  const servers = [STUN, ...parseIceServers(env.VITE_ICE_SERVERS)];
  if (env.VITE_TURN_URLS) {
    servers.push({
      urls: env.VITE_TURN_URLS.split(",").map((u) => u.trim()).filter(Boolean),
      username: env.VITE_TURN_USERNAME,
      credential: env.VITE_TURN_CREDENTIAL,
    });
  }
  if (env.VITE_TURN_API_URL) {
    // Provider credentials are cached for an hour.
    if (!fetchedRelay || Date.now() - fetchedRelay.at > 3_600_000) {
      const list = await fetch(env.VITE_TURN_API_URL).then((r) => (r.ok ? r.json() : [])).catch(() => []);
      const found = Array.isArray(list) ? list : list?.iceServers || [];
      fetchedRelay = found.length ? { at: Date.now(), servers: found } : null;
      servers.push(...found);
    } else {
      servers.push(...fetchedRelay.servers);
    }
  }
  return servers;
}

export const callsSupported = () =>
  typeof window !== "undefined" && !!window.RTCPeerConnection && !!navigator.mediaDevices?.getUserMedia;

// Call documents

export function listenIncomingCalls(uid, callback) {
  const q = query(collection(db, "calls"), where("calleeId", "==", uid), where("status", "==", "ringing"), limit(5));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => !ringExpired(c)));
  }, () => callback([]));
}

export const ringExpired = (c, now = Date.now()) => now - (c.createdAt?.toMillis?.() || now) >= RING_MS;

export async function refuseCall(id, status = "declined") {
  await updateDoc(doc(db, "calls", id), { status, endedAt: serverTimestamp() }).catch(() => {});
}

/** Firestore signalling: the call doc plus a candidate subcollection per side. */
export function firestoreSignal(id) {
  const ref = id ? doc(db, "calls", id) : doc(collection(db, "calls"));
  return {
    id: ref.id,
    create: (data) => setDoc(ref, { ...data, createdAt: serverTimestamp() }),
    update: (patch, stamp) => updateDoc(ref, stamp ? { ...patch, [stamp]: serverTimestamp() } : patch),
    watch: (cb) => onSnapshot(ref, (s) => cb(s.exists() ? s.data() : null), () => {}),
    sendCandidate: (side, c) => addDoc(collection(ref, side), c),
    watchCandidates: (side, cb) => onSnapshot(collection(ref, side), (snap) => {
      snap.docChanges().forEach((ch) => { if (ch.type === "added") cb(ch.doc.data()); });
    }, () => {}),
    async wipe() {
      for (const side of ["callerCandidates", "calleeCandidates"]) {
        const snap = await getDocs(collection(ref, side)).catch(() => null);
        await Promise.all((snap?.docs || []).map((d) => deleteDoc(d.ref).catch(() => {})));
      }
      await deleteDoc(ref).catch(() => {});
    },
  };
}

const MEDIA_AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

async function cameraFor(facing) {
  const size = { width: { ideal: 1280 }, height: { ideal: 720 } };
  const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
  const id = pickCamera(devices, facing);
  return id ? { deviceId: { exact: id }, ...size } : { facingMode: facing, ...size };
}

/**
 * Observable call state for the UI (subscribe with onChange):
 *   state: "starting" | "ringing" | "connecting" | "active" | "reconnecting" | "ended"
 *   endedReason: "declined" | "missed" | "cancelled" | "busy" | "ended" | "failed" | null
 */
export class CallSession {
  /**
   * @param {object} o
   * @param {string} o.chatId
   * @param {{id: string, username: string, photoURL?: string}} o.peer
   * @param {{id: string, username: string, photoURL?: string}} [o.self] required when calling
   * @param {boolean} o.video
   * @param {object} [o.incoming] call doc, when answering
   * @param {object} [o.signal] signalling channel (defaults to Firestore)
   * @param {Function} [o.logCall] leaves the call's line in the conversation
   */
  constructor({ chatId, peer, self = null, video, incoming = null, signal = null, logCall = null }) {
    this.chatId = chatId;
    this.peer = peer;
    this.self = self;
    this.video = video;
    this.incoming = incoming;
    this.isCaller = !incoming;
    this.signal = signal || firestoreSignal(incoming?.id);
    this.logCall = logCall || ((call) => sendMessage(this.chatId, "", { call }));
    this.state = "starting";
    this.endedReason = null;
    this.localStream = null;
    this.remoteStream = new MediaStream();
    this.muted = false;
    this.cameraOff = !video;
    this.noCamera = false;
    this.canFlip = false;
    this.facing = "user";
    this.remoteMuted = false;
    this.remoteCameraOff = false;
    this.startedAt = 0;
    this.listeners = new Set();
    this.unsubs = [];
    this.timers = {};
    this.docReady = !!incoming;
    this.pendingCandidates = [];   // local, until the call doc exists
    this.remoteCandidates = [];    // remote, until their description is applied
    this.offerRev = incoming?.offerRev || 0;
    this.restarts = 0;
  }

  get mySide() { return this.isCaller ? "callerCandidates" : "calleeCandidates"; }
  get theirSide() { return this.isCaller ? "calleeCandidates" : "callerCandidates"; }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach((fn) => fn(this)); }
  set(patch) { Object.assign(this, patch); this.emit(); }

  timer(name, ms, fn) {
    clearTimeout(this.timers[name]);
    this.timers[name] = ms == null ? undefined : setTimeout(fn, ms);
  }

  // Media

  // Falls back to audio-only if the camera is missing, busy or denied.
  async openMedia() {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: MEDIA_AUDIO, video: this.video ? await cameraFor(this.facing) : false });
    } catch (err) {
      if (!this.video) throw err;
      stream = await navigator.mediaDevices.getUserMedia({ audio: MEDIA_AUDIO });
      this.noCamera = true;
      this.cameraOff = true;
    }
    // Hung up during the permission prompt.
    if (this.state === "ended") { stream.getTracks().forEach((t) => t.stop()); return; }
    this.localStream = stream;
    if (this.video && !this.noCamera) {
      const cams = await navigator.mediaDevices.enumerateDevices().then((ds) => ds.filter((d) => d.kind === "videoinput")).catch(() => []);
      this.canFlip = cams.length > 1;
    }
    this.emit();
  }

  // Peer connection

  async buildPeer() {
    const pc = new RTCPeerConnection({ iceServers: await iceServers(), bundlePolicy: "max-bundle" });
    this.pc = pc;
    // Pre-negotiated channel id, so neither side waits for ondatachannel.
    this.dc = pc.createDataChannel("mesh", { negotiated: true, id: 0 });
    this.dc.onopen = () => this.sendState();
    this.dc.onmessage = (e) => this.onPeerMessage(e.data);

    pc.ontrack = (e) => {
      // New MediaStream per track so media elements pick up the change.
      const tracks = e.streams[0]?.getTracks() || [...this.remoteStream.getTracks(), e.track];
      this.remoteStream = new MediaStream(tracks);
      e.track.onunmute = () => this.emit();
      e.track.onmute = () => this.emit();
      this.emit();
    };
    pc.onicecandidate = (e) => {
      if (!e.candidate || !e.candidate.candidate) return;
      const c = e.candidate.toJSON();
      if (this.docReady) this.signal.sendCandidate(this.mySide, c).catch(() => {});
      else this.pendingCandidates.push(c);
    };
    const watchState = () => this.onConnectionState();
    pc.onconnectionstatechange = watchState;
    pc.oniceconnectionstatechange = watchState;
    return pc;
  }

  // Candidates can arrive before their description (they're signalled
// separately), including new-ufrag candidates after an ICE restart.
  addRemoteCandidate(c) {
    const pc = this.pc;
    if (!pc || pc.signalingState === "closed") return;
    const desc = pc.remoteDescription;
    if (!desc || (c.usernameFragment && !desc.sdp.includes(`a=ice-ufrag:${c.usernameFragment}`))) {
      this.remoteCandidates.push(c);
      return;
    }
    pc.addIceCandidate(c).catch(() => {});
  }

  async setRemote(description) {
    await this.pc.setRemoteDescription(description);
    const waiting = this.remoteCandidates.splice(0);
    waiting.forEach((c) => this.addRemoteCandidate(c));
  }

  connectionState() {
    const pc = this.pc;
    if (!pc) return "new";
    if (pc.connectionState) return pc.connectionState;
    return { checking: "connecting", completed: "connected" }[pc.iceConnectionState] || pc.iceConnectionState;
  }

  onConnectionState() {
    if (this.state === "ended") return;
    const s = this.connectionState();
    if (s === "connected") {
      this.timer("connect", null);
      this.timer("recover", null);
      this.timer("restart", null);
      this.restarts = 0;
      this.set({ state: "active", startedAt: this.startedAt || Date.now() });
    } else if ((s === "disconnected" || s === "failed") && this.startedAt) {
      // Dropped mid-call: attempt ICE restarts until RECOVER_MS.
      if (this.state !== "reconnecting") {
        this.set({ state: "reconnecting" });
        this.timer("recover", RECOVER_MS, () => this.finish("failed"));
      }
      if (this.isCaller) this.timer("restart", s === "failed" ? 0 : 2500, () => this.restart());
    } else if (s === "failed") {
      this.finish("failed");
    }
  }

  // Caller-driven ICE restart via a new offer (offerRev + 1).
  async restart() {
    const pc = this.pc;
    if (!pc || this.state === "ended" || this.connectionState() === "connected") return;
    if (this.restarts >= MAX_RESTARTS) return;
    if (pc.signalingState !== "stable") {
      this.timer("restart", RESTART_EVERY_MS, () => this.restart());
      return;
    }
    this.restarts += 1;
    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      this.offerRev += 1;
      await this.signal.update({ offer: { type: offer.type, sdp: offer.sdp }, offerRev: this.offerRev });
    } catch { /* the next try, or the recover timer, handles it */ }
    this.timer("restart", RESTART_EVERY_MS, () => this.restart());
  }

  // Data channel

  sendPeer(msg) {
    if (this.dc?.readyState === "open") { try { this.dc.send(JSON.stringify(msg)); } catch { /* closing */ } }
  }

  sendState() { this.sendPeer({ t: "state", muted: this.muted, cameraOff: this.cameraOff }); }

  onPeerMessage(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.t === "state") this.set({ remoteMuted: !!msg.muted, remoteCameraOff: !!msg.cameraOff });
    if (msg.t === "bye") this.finish("ended", { remote: true });
  }

  // Caller

    async start() {
    await this.openMedia();
    if (this.state === "ended") return;
    const pc = await this.buildPeer();
    if (this.state === "ended") return pc.close();
    const stream = this.localStream;
    pc.addTransceiver(stream.getAudioTracks()[0], { direction: "sendrecv", streams: [stream] });
    // Always negotiate a sendrecv video line, even for voice calls, so either
    // side can turn a camera on later with replaceTrack and no renegotiation.
    const cam = stream.getVideoTracks()[0];
    pc.addTransceiver(cam || "video", { direction: "sendrecv", streams: [stream] });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (this.state === "ended") return; // hung up while the camera was starting
    await this.signal.create({
      callerId: this.self.id,
      callerName: this.self.username || "",
      callerPhoto: this.self.photoURL || "",
      calleeId: this.peer.id,
      chatId: this.chatId,
      video: this.video,
      status: "ringing",
      offer: { type: offer.type, sdp: offer.sdp },
      offerRev: 0,
    });
    this.docReady = true;
    this.pendingCandidates.splice(0).forEach((c) => this.signal.sendCandidate(this.mySide, c).catch(() => {}));
    if (this.state === "ended") {
      await this.signal.update({ status: "missed" }, "endedAt").catch(() => {});
      this.signal.wipe().catch(() => {});
      return;
    }
    this.set({ state: "ringing" });

    this.unsubs.push(this.signal.watch((d) => this.onCallerDoc(d)));
    this.unsubs.push(this.signal.watchCandidates(this.theirSide, (c) => this.addRemoteCandidate(c)));
    this.timer("ring", RING_MS, () => { if (this.state === "ringing") this.finish("missed"); });
  }

  async onCallerDoc(d) {
    if (this.state === "ended") return;
    if (!d) return this.finish("ended", { remote: true });
    if (d.status === "declined") return this.finish("declined", { remote: true });
    if (d.status === "busy") return this.finish("busy", { remote: true });
    if (d.status === "ended" || d.status === "missed") return this.finish("ended", { remote: true });
    const pc = this.pc;
    if (d.answer && (d.answerRev || 0) === this.offerRev && pc.signalingState === "have-local-offer" && !this.applying) {
      this.applying = true;
      try { await this.setRemote(d.answer); } catch { /* a stale answer */ }
      this.applying = false;
      if (this.state === "ringing") {
        this.timer("ring", null);
        this.set({ state: "connecting" });
        this.timer("connect", CONNECT_MS, () => { if (!this.startedAt) this.finish("failed"); });
      }
    }
  }

  // Callee

    async answer() {
    await this.openMedia();
    if (this.state === "ended") return;
    const pc = await this.buildPeer();
    if (this.state === "ended") return pc.close();
    await this.setRemote(this.incoming.offer);
    // addTrack reuses the transceivers created by the offer.
    this.localStream.getTracks().forEach((t) => pc.addTrack(t, this.localStream));
    // Keep the video line sendrecv without a camera, for a later upgrade.
    const video = this.videoTransceiver();
    if (video && video.direction !== "sendrecv") {
      video.direction = "sendrecv";
      video.sender.setStreams?.(this.localStream);
    }
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await this.signal.update({ answer: { type: answer.type, sdp: answer.sdp }, answerRev: this.offerRev, status: "active" }, "answeredAt");
    this.answered = true;
    this.set({ state: "connecting" });
    this.timer("connect", CONNECT_MS, () => { if (!this.startedAt) this.finish("failed"); });
    this.unsubs.push(this.signal.watchCandidates(this.theirSide, (c) => this.addRemoteCandidate(c)));
    this.unsubs.push(this.signal.watch((d) => this.onCalleeDoc(d)));
  }

  async onCalleeDoc(d) {
    if (this.state === "ended") return;
    if (!d || d.status === "ended" || d.status === "missed") return this.finish("ended", { remote: true });
    // ICE restart offer.
    const rev = d.offerRev || 0;
    if (rev > this.offerRev && d.offer && this.pc.signalingState === "stable" && !this.applying) {
      this.applying = true;
      try {
        await this.setRemote(d.offer);
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.offerRev = rev;
        await this.signal.update({ answer: { type: answer.type, sdp: answer.sdp }, answerRev: rev });
      } catch { /* the caller tries again */ }
      this.applying = false;
    }
  }

  async decline() {
    await this.signal.update({ status: "declined" }, "endedAt").catch(() => {});
    this.finish("declined", { remote: true });
  }

  // Controls

  toggleMute() {
    this.localStream?.getAudioTracks().forEach((t) => { t.enabled = this.muted; });
    this.set({ muted: !this.muted });
    this.sendState();
  }

  videoTransceiver() {
    return this.pc?.getTransceivers().find((t) => t.receiver.track?.kind === "video") || null;
  }

  get hasCamera() {
    return this.localStream?.getVideoTracks().some((t) => t.readyState === "live") || false;
  }

  /** Toggles the camera; on a voice call (or without a camera yet) it opens one. Resolves to false on failure. */
  async toggleCamera() {
    if (this.hasCamera) {
      this.localStream.getVideoTracks().forEach((t) => { t.enabled = this.cameraOff; });
      this.set({ cameraOff: !this.cameraOff });
      this.sendState();
      return true;
    }
    const sender = this.videoTransceiver()?.sender;
    if (!sender || this.opening) return false;
    this.opening = true;
    const track = await navigator.mediaDevices.getUserMedia({ video: await cameraFor(this.facing) })
      .then((s) => s.getVideoTracks()[0]).catch(() => null);
    this.opening = false;
    if (!track || this.state === "ended") { track?.stop(); return false; }
    await sender.replaceTrack(track).catch(() => {});
    this.localStream = new MediaStream([...this.localStream.getAudioTracks(), track]);
    const cams = await navigator.mediaDevices.enumerateDevices().then((ds) => ds.filter((d) => d.kind === "videoinput")).catch(() => []);
    this.set({ cameraOff: false, noCamera: false, usedVideo: true, canFlip: cams.length > 1 });
    this.sendState();
    return true;
  }

  /** Switches front/back camera via replaceTrack (no renegotiation). */
  async flipCamera() {
    if (!this.canFlip || !this.localStream || this.flipping) return;
    this.flipping = true;
    const from = this.facing;
    const to = from === "user" ? "environment" : "user";
    const sender = this.videoTransceiver()?.sender;
    // Release first: many phones can't open two cameras at once.
    this.localStream.getVideoTracks().forEach((t) => { t.stop(); this.localStream.removeTrack(t); });
    const open = async (facing) => navigator.mediaDevices.getUserMedia({ video: await cameraFor(facing) }).then((s) => s.getVideoTracks()[0]).catch(() => null);
    let track = await open(to);
    const facing = track ? to : from;
    if (!track) track = await open(from);
    if (track) {
      track.enabled = !this.cameraOff;
      await sender?.replaceTrack(track).catch(() => {});
      this.localStream = new MediaStream([...this.localStream.getAudioTracks(), track]);
    }
    this.flipping = false;
    this.set({ facing });
  }

  async hangUp() {
    await this.finish(this.state === "ringing" || this.state === "starting" ? "cancelled" : "ended");
  }

  // Idempotent teardown. The caller also logs the call in the chat.
  async finish(reason, { remote = false } = {}) {
    if (this.state === "ended") return;
    const length = this.startedAt ? (Date.now() - this.startedAt) / 1000 : 0;
    if (!remote) this.sendPeer({ t: "bye" });
    Object.keys(this.timers).forEach((k) => this.timer(k, null));
    this.unsubs.splice(0).forEach((u) => u());
    this.dc?.close();
    this.pc?.close();
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.set({ state: "ended", endedReason: reason });
    if (!this.docReady) return;
    if (!remote) {
      const status = !this.isCaller && !this.answered ? "declined"
        : reason === "missed" || reason === "cancelled" ? "missed" : "ended";
      await this.signal.update({ status }, "endedAt").catch(() => {});
    }
    if (this.isCaller) {
      const kind = this.video || this.usedVideo ? "Video call" : "Voice call";
      const summary = length > 0 ? `${kind} · ${formatDuration(length)}`
        : reason === "declined" ? `${kind} declined`
        : reason === "busy" ? `${kind} · busy`
        : reason === "failed" ? `${kind} · couldn't connect`
        : `Missed ${kind.toLowerCase()}`;
      Promise.resolve(this.logCall({ video: this.video, seconds: Math.round(length), summary })).catch(() => {});
    }
    // Signalling contains both parties' IPs; delete it once the peer has seen the end state.
    setTimeout(() => this.signal.wipe().catch(() => {}), 4000);
  }
}

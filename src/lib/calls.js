// One-to-one voice and video calls.
//
// How it works: WebRTC connects the two browsers directly and carries the
// audio and video; Firestore only passes the setup messages between them
// (the "offer", the "answer", and network addresses, called ICE candidates).
// Once connected, a small data channel inside the call itself carries mute,
// camera and hang-up, so nothing about the call's content touches our
// servers, and nothing is recorded.
//
// The honest limits, stated in the UI too:
// - To find each other through home routers, browsers ask a STUN server for
//   their public address. We use Google's public STUN servers, so Google sees
//   the IP addresses of people on calls (disclosed in the Privacy Policy).
// - Many networks (most mobile data, strict office Wi-Fi, some home routers)
//   block direct connections. Those calls need a TURN relay. Set
//   VITE_TURN_URLS / VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL, or
//   VITE_TURN_API_URL for a provider that hands out credentials over HTTPS
//   (see the README). Without one, calls between such networks can't connect.
// - Group calls need a media server (an SFU such as LiveKit), which is a
//   separate piece of infrastructure. Calls here are one-to-one.
//
// The signalling is behind a small interface (firestoreSignal below), so the
// whole call can be exercised with an in-memory stand-in.

import {
  addDoc, collection, deleteDoc, doc, getDocs, limit, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import { db } from "../firebase";
import { sendMessage } from "./db";

export const RING_MS = 45_000;
const CONNECT_MS = 30_000;   // from the answer to a working connection
const RECOVER_MS = 25_000;   // how long a dropped call tries to come back
const RESTART_EVERY_MS = 6_000;
const MAX_RESTARTS = 3;

// ---------- network: STUN, and a TURN relay if one is set up ----------

const STUN = { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] };
let fetchedRelay = null; // { at, servers }

export const relayConfigured = () => !!(import.meta.env.VITE_TURN_URLS || import.meta.env.VITE_TURN_API_URL);

export async function iceServers() {
  const env = import.meta.env;
  const servers = [STUN];
  if (env.VITE_TURN_URLS) {
    servers.push({
      urls: env.VITE_TURN_URLS.split(",").map((u) => u.trim()).filter(Boolean),
      username: env.VITE_TURN_USERNAME,
      credential: env.VITE_TURN_CREDENTIAL,
    });
  }
  if (env.VITE_TURN_API_URL) {
    // Short-lived credentials from the provider, reused for an hour.
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

// ---------- the call document ----------

/** Incoming calls ringing for you right now. */
export function listenIncomingCalls(uid, callback) {
  const q = query(collection(db, "calls"), where("calleeId", "==", uid), where("status", "==", "ringing"), limit(5));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => !ringExpired(c)));
  }, () => callback([]));
}

export const ringExpired = (c, now = Date.now()) => now - (c.createdAt?.toMillis?.() || now) >= RING_MS;

/** Say no to a call without picking up: declined, or busy on another call. */
export async function refuseCall(id, status = "declined") {
  await updateDoc(doc(db, "calls", id), { status, endedAt: serverTimestamp() }).catch(() => {});
}

/* The signalling channel for one call, on Firestore: the call document, and
   a subcollection of network addresses for each side. */
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

function formatLength(sec) {
  const m = Math.floor(sec / 60);
  return `${m}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
}

const MEDIA_AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
const cameraFor = (facing) => ({ facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } });

/* A call session. The screen subscribes with onChange and reads:
     state: "starting" | "ringing" | "connecting" | "active" | "reconnecting" | "ended"
     endedReason: "declined" | "missed" | "cancelled" | "busy" | "ended" | "failed" | null
     localStream, remoteStream, muted, cameraOff, noCamera, canFlip,
     remoteMuted, remoteCameraOff, startedAt */
export class CallSession {
  /**
   * @param {object} o
   * @param {string} o.chatId the one-to-one conversation the call belongs to
   * @param {{id: string, username: string, photoURL?: string}} o.peer who you're calling
   * @param {{id: string, username: string, photoURL?: string}} [o.self] you (the caller)
   * @param {boolean} o.video
   * @param {object} [o.incoming] the call document, when answering
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
    this.pendingCandidates = [];   // ours, until the call document exists
    this.remoteCandidates = [];    // theirs, until we have the description they belong to
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

  // ---------- media ----------

  /* The camera is optional: with none, or one that's busy or blocked, a
     video call carries on with your voice and your picture. */
  async openMedia() {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: MEDIA_AUDIO, video: this.video ? cameraFor(this.facing) : false });
    } catch (err) {
      if (!this.video) throw err;
      stream = await navigator.mediaDevices.getUserMedia({ audio: MEDIA_AUDIO });
      this.noCamera = true;
      this.cameraOff = true;
    }
    // Hung up while the browser was asking for the camera.
    if (this.state === "ended") { stream.getTracks().forEach((t) => t.stop()); return; }
    this.localStream = stream;
    if (this.video && !this.noCamera) {
      const cams = await navigator.mediaDevices.enumerateDevices().then((ds) => ds.filter((d) => d.kind === "videoinput")).catch(() => []);
      this.canFlip = cams.length > 1;
    }
    this.emit();
  }

  // ---------- the connection ----------

  async buildPeer() {
    const pc = new RTCPeerConnection({ iceServers: await iceServers(), bundlePolicy: "max-bundle" });
    this.pc = pc;
    // Both sides open the same channel by number, so neither waits for the other.
    this.dc = pc.createDataChannel("mesh", { negotiated: true, id: 0 });
    this.dc.onopen = () => this.sendState();
    this.dc.onmessage = (e) => this.onPeerMessage(e.data);

    pc.ontrack = (e) => {
      // A new stream object each time, so players pick up every track.
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

  /* Candidates can arrive before the description they belong to (they
     travel separately), so keep them until it's in place. After a
     reconnect, the new ones carry a new username fragment. */
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
      // Dropped mid-call (a network change, a tunnel): try to come back.
      if (this.state !== "reconnecting") {
        this.set({ state: "reconnecting" });
        this.timer("recover", RECOVER_MS, () => this.finish("failed"));
      }
      if (this.isCaller) this.timer("restart", s === "failed" ? 0 : 2500, () => this.restart());
    } else if (s === "failed") {
      this.finish("failed");
    }
  }

  /* The caller makes a fresh offer with new network paths; the other side
     answers it through the call document, the same way as the first time. */
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

  // ---------- in-call messages: mute, camera, hang up ----------

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

  // ---------- caller ----------

  /** Ring the other person. */
  async start() {
    await this.openMedia();
    if (this.state === "ended") return;
    const pc = await this.buildPeer();
    if (this.state === "ended") return pc.close();
    const stream = this.localStream;
    pc.addTransceiver(stream.getAudioTracks()[0], { direction: "sendrecv", streams: [stream] });
    // A video call always offers video, so they can send theirs even if
    // your camera is off or missing.
    if (this.video) {
      const cam = stream.getVideoTracks()[0];
      pc.addTransceiver(cam || "video", { direction: cam ? "sendrecv" : "recvonly", streams: [stream] });
    }
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

  // ---------- callee ----------

  /** Pick up. */
  async answer() {
    await this.openMedia();
    if (this.state === "ended") return;
    const pc = await this.buildPeer();
    if (this.state === "ended") return pc.close();
    await this.setRemote(this.incoming.offer);
    // Our tracks go on the lines their offer opened.
    this.localStream.getTracks().forEach((t) => pc.addTrack(t, this.localStream));
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
    // A reconnect: the caller sent a fresh offer.
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

  // ---------- controls ----------

  toggleMute() {
    this.localStream?.getAudioTracks().forEach((t) => { t.enabled = this.muted; });
    this.set({ muted: !this.muted });
    this.sendState();
  }

  toggleCamera() {
    if (this.noCamera) return;
    this.localStream?.getVideoTracks().forEach((t) => { t.enabled = this.cameraOff; });
    this.set({ cameraOff: !this.cameraOff });
    this.sendState();
  }

  /** Front and back camera, on phones. The other side sees the switch without a reconnect. */
  async flipCamera() {
    if (!this.canFlip || !this.localStream) return;
    const facing = this.facing === "user" ? "environment" : "user";
    const fresh = await navigator.mediaDevices.getUserMedia({ video: cameraFor(facing) }).catch(() => null);
    const track = fresh?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !this.cameraOff;
    const sender = this.pc?.getSenders().find((s) => s.track?.kind === "video");
    await sender?.replaceTrack(track);
    const old = this.localStream.getVideoTracks()[0];
    old?.stop();
    this.localStream = new MediaStream([...this.localStream.getAudioTracks(), track]);
    this.set({ facing });
  }

  async hangUp() {
    await this.finish(this.state === "ringing" || this.state === "starting" ? "cancelled" : "ended");
  }

  /* Tear everything down once, tell the other side, and (as the caller)
     leave a line in the conversation: "Video call · 3:12" or "Missed call". */
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
      const kind = this.video ? "Video call" : "Voice call";
      const summary = length > 0 ? `${kind} · ${formatLength(length)}`
        : reason === "declined" ? `${kind} declined`
        : reason === "busy" ? `${kind} · busy`
        : reason === "failed" ? `${kind} · couldn't connect`
        : `Missed ${kind.toLowerCase()}`;
      Promise.resolve(this.logCall({ video: this.video, seconds: Math.round(length), summary })).catch(() => {});
    }
    // The setup messages include both people's IP addresses. Once the call
    // is over they're useless, so delete them, after a pause that lets the
    // other side see the call has ended.
    setTimeout(() => this.signal.wipe().catch(() => {}), 4000);
  }
}

// One-to-one voice and video calls.
//
// How it works: WebRTC connects the two browsers directly and carries the
// audio and video; Firestore only passes the setup messages between them
// (the "offer", the "answer", and network addresses). Nothing about the
// call's content touches our servers, and nothing is recorded.
//
// The honest limits, stated in the UI too:
// - To find each other through home routers, browsers ask a STUN server for
//   their public address. We use Google's public STUN servers, so Google sees
//   the IP addresses of people on calls (disclosed in the Privacy Policy).
// - Some networks (many mobile carriers, strict office Wi-Fi) block direct
//   connections. Those calls need a TURN relay, which costs money to run.
//   Set VITE_TURN_URLS / VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL to add one;
//   without it, roughly one call in ten may fail to connect.
// - Group calls need a media server (an SFU such as LiveKit), which is a
//   separate piece of infrastructure. Calls here are one-to-one.

import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, limit,
} from "firebase/firestore";
import { db } from "../firebase";
import { me, fetchProfile, sendMessage } from "./db";

const RING_MS = 45_000;

export function iceServers() {
  const servers = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  const turn = import.meta.env.VITE_TURN_URLS;
  if (turn) {
    servers.push({
      urls: turn.split(",").map((u) => u.trim()),
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    });
  }
  return servers;
}

export const callsSupported = () =>
  typeof window !== "undefined" && !!window.RTCPeerConnection && !!navigator.mediaDevices?.getUserMedia;

/** Incoming calls ringing for you right now. */
export function listenIncomingCalls(callback) {
  const q = query(collection(db, "calls"), where("calleeId", "==", me()), where("status", "==", "ringing"), limit(5));
  return onSnapshot(q, (snap) => {
    const fresh = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((c) => Date.now() - (c.createdAt?.toMillis?.() || Date.now()) < RING_MS);
    callback(fresh);
  }, () => callback([]));
}

function formatLength(sec) {
  const m = Math.floor(sec / 60);
  return `${m}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
}

/* A call session. The screen subscribes with onChange and reads:
     state: "starting" | "ringing" | "connecting" | "active" | "ended"
     endedReason: "declined" | "missed" | "ended" | "failed" | "busy" | null
     localStream, remoteStream, muted, cameraOff, startedAt */
export class CallSession {
  constructor({ chatId, peer, video, incoming = null }) {
    this.chatId = chatId;
    this.peer = peer; // { id, username, photoURL }
    this.video = video;
    this.incoming = incoming;
    this.isCaller = !incoming;
    this.state = "starting";
    this.endedReason = null;
    this.localStream = null;
    this.remoteStream = new MediaStream();
    this.muted = false;
    this.cameraOff = !video;
    this.startedAt = 0;
    this.listeners = new Set();
    this.unsubs = [];
    this.callRef = incoming ? doc(db, "calls", incoming.id) : doc(collection(db, "calls"));
    this.pendingCandidates = [];
    this.docReady = !!incoming;
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach((fn) => fn(this)); }
  set(patch) { Object.assign(this, patch); this.emit(); }

  async openMedia() {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: this.video ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    });
    this.emit();
  }

  buildPeer(candidateCollection) {
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    this.pc = pc;
    this.localStream.getTracks().forEach((t) => pc.addTrack(t, this.localStream));
    pc.ontrack = (e) => {
      e.streams[0].getTracks().forEach((t) => {
        if (!this.remoteStream.getTracks().includes(t)) this.remoteStream.addTrack(t);
      });
      this.emit();
    };
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      const c = e.candidate.toJSON();
      if (this.docReady) addDoc(collection(this.callRef, candidateCollection), c).catch(() => {});
      else this.pendingCandidates.push(c);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected" && this.state !== "active") {
        this.set({ state: "active", startedAt: Date.now() });
      }
      if (pc.connectionState === "failed") this.finish("failed");
    };
    return pc;
  }

  listenCandidates(name) {
    this.unsubs.push(onSnapshot(collection(this.callRef, name), (snap) => {
      snap.docChanges().forEach((ch) => {
        if (ch.type === "added") this.pc?.addIceCandidate(new RTCIceCandidate(ch.doc.data())).catch(() => {});
      });
    }));
  }

  /** Caller: ring the other person. */
  async start() {
    await this.openMedia();
    const pc = this.buildPeer("callerCandidates");
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const mine = await fetchProfile(me());
    await setDoc(this.callRef, {
      callerId: me(),
      callerName: mine?.username || "",
      callerPhoto: mine?.photoURL || "",
      calleeId: this.peer.id,
      chatId: this.chatId,
      video: this.video,
      status: "ringing",
      offer: { type: offer.type, sdp: offer.sdp },
      createdAt: serverTimestamp(),
    });
    this.docReady = true;
    this.pendingCandidates.splice(0).forEach((c) => addDoc(collection(this.callRef, "callerCandidates"), c).catch(() => {}));
    this.set({ state: "ringing" });

    this.unsubs.push(onSnapshot(this.callRef, (snap) => {
      const d = snap.data();
      if (!d) { if (this.state !== "ended") this.finish("ended", { remote: true }); return; }
      if (d.answer && !pc.currentRemoteDescription) {
        pc.setRemoteDescription(new RTCSessionDescription(d.answer)).catch(() => {});
        if (this.state === "ringing") this.set({ state: "connecting" });
      }
      if (d.status === "declined") this.finish("declined", { remote: true });
      if (d.status === "ended" && this.state !== "ended") this.finish("ended", { remote: true });
    }));
    this.listenCandidates("calleeCandidates");
    this.ringTimer = setTimeout(() => { if (this.state === "ringing") this.finish("missed"); }, RING_MS);
  }

  /** Callee: pick up. */
  async answer() {
    await this.openMedia();
    const pc = this.buildPeer("calleeCandidates");
    await pc.setRemoteDescription(new RTCSessionDescription(this.incoming.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await updateDoc(this.callRef, { answer: { type: answer.type, sdp: answer.sdp }, status: "active", answeredAt: serverTimestamp() });
    this.set({ state: "connecting" });
    this.listenCandidates("callerCandidates");
    this.unsubs.push(onSnapshot(this.callRef, (snap) => {
      if ((!snap.exists() || snap.data()?.status === "ended") && this.state !== "ended") this.finish("ended", { remote: true });
    }));
  }

  async decline() {
    await updateDoc(this.callRef, { status: "declined", endedAt: serverTimestamp() }).catch(() => {});
    this.finish("declined", { remote: true });
  }

  toggleMute() {
    this.localStream?.getAudioTracks().forEach((t) => { t.enabled = this.muted; });
    this.set({ muted: !this.muted });
  }

  toggleCamera() {
    this.localStream?.getVideoTracks().forEach((t) => { t.enabled = this.cameraOff; });
    this.set({ cameraOff: !this.cameraOff });
  }

  async hangUp() {
    await this.finish(this.state === "ringing" ? "cancelled" : "ended");
  }

  /* Tear everything down once, tell the other side, and (as the caller)
     leave a line in the conversation: "Video call · 3:12" or "Missed call". */
  async finish(reason, { remote = false } = {}) {
    if (this.state === "ended") return;
    clearTimeout(this.ringTimer);
    const length = this.startedAt ? (Date.now() - this.startedAt) / 1000 : 0;
    this.unsubs.splice(0).forEach((u) => u());
    this.pc?.close();
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.set({ state: "ended", endedReason: reason });
    if (!remote) {
      const status = reason === "missed" || reason === "cancelled" ? "missed" : "ended";
      await updateDoc(this.callRef, { status, endedAt: serverTimestamp() }).catch(() => {});
    }
    if (this.isCaller && this.docReady) {
      const kind = this.video ? "Video call" : "Voice call";
      const summary = length > 0 ? `${kind} · ${formatLength(length)}`
        : reason === "declined" ? `${kind} declined` : `Missed ${kind.toLowerCase()}`;
      sendMessage(this.chatId, "", { call: { video: this.video, seconds: Math.round(length), summary } }).catch(() => {});
    }
    // The setup messages include both people's IP addresses. Once the call
    // is over they're useless, so delete them, after a pause that lets the
    // other side see the call has ended.
    if (this.docReady) setTimeout(() => this.wipe(), 4000);
  }

  async wipe() {
    for (const name of ["callerCandidates", "calleeCandidates"]) {
      const snap = await getDocs(collection(this.callRef, name)).catch(() => null);
      await Promise.all((snap?.docs || []).map((d) => deleteDoc(d.ref).catch(() => {})));
    }
    await deleteDoc(this.callRef).catch(() => {});
  }
}

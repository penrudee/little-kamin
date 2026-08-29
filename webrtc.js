// webrtc.js - WebRTC Mesh, Realtime State Sync & Patient History Engine
class SyncEngine {
  constructor() {
    this.connections = [];
    this.peer = null;

    // ----- สถานะร้าน (ว่าง/ไม่ว่าง/รอคิว) -----
    this.currentStatus = null; // { state: 'available'|'busy'|'queue', queueCount, ts }

    // ----- ระบบกันสแปม / บล็อกคนไข้ -----
    this.blockedPatientIds = new Set();   // patient_special_id ที่ถูกบล็อก
    this.connToPatientId = new Map();     // conn.peer -> patientSpecialId ล่าสุดที่ conn นี้ขอดู (ใช้ผูกตอนบล็อก)
    this.messageLog = new Map();          // conn.peer -> array ของ timestamp คำขอ ใช้เช็ค rate limit
    this.RATE_LIMIT_COUNT = 8;            // อนุญาตสูงสุดกี่คำขอ
    this.RATE_LIMIT_WINDOW_MS = 10000;    // ต่อกี่ ms (10 วิ)
  }

  async initPeer(isHost = true, hostIdToConnect = null) {
    await this.loadBlockedList();

    this.peer = new Peer({
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
          { urls: "stun:stun3.l.google.com:19302" },
          { urls: "stun:stun4.l.google.com:19302" }
        ]
      }
    });

    this.peer.on("open", (id) => {
      console.log("My Peer ID:", id);
      if (isHost && !hostIdToConnect) {
        this.renderQRCode(id);
        if (typeof renderBookingQR === "function") renderBookingQR(id);
      } else if (hostIdToConnect) {
        this.connectToHost(hostIdToConnect);
      }
    });

    this.peer.on("error", (err) => console.error("PeerJS Error:", err));
    this.peer.on("connection", (conn) => this.setupConnectionEvents(conn));
  }

  connectToHost(hostId) {
    const conn = this.peer.connect(hostId, { reliable: true });
    this.setupConnectionEvents(conn);
  }

  setupConnectionEvents(conn) {
    conn.on("open", () => {
      if (!this.connections.some((c) => c.peer === conn.peer)) {
        this.connections.push(conn);
      }
      this.updateClientCounter();

      // ส่งสถานะร้านปัจจุบันให้ผู้ที่เพิ่งเชื่อมต่อเข้ามาทันที (เช่น คนไข้เพิ่งสแกน QR)
      if (this.currentStatus) {
        conn.send({ type: "STATUS_UPDATE", payload: this.currentStatus });
      }

      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("syncId")) {
        conn.send({ type: "REQUEST_FULL_SYNC" });
      }
    });

    conn.on("data", async (data) => await this.handleIncomingData(conn, data));

    conn.on("close", () => {
      this.connections = this.connections.filter((c) => c !== conn);
      this.updateClientCounter();
    });
  }

  updateClientCounter() {
    const el = document.getElementById("clientCountDisplay");
    if (el) el.innerText = `การเชื่อมต่อ WebRTC Active: ${this.connections.length} จุด`;
  }

  broadcastData(data) {
    this.connections.forEach((conn) => {
      if (conn.open) conn.send(data);
    });
  }

  async handleIncomingData(conn, data) {
    // ----- กันสแปม: เช็คก่อนทุกอย่างสำหรับ type ที่คนไข้เป็นคนยิงเข้ามา -----
    const patientTriggeredTypes = ["REQUEST_PATIENT_HISTORY", "CHAT_MESSAGE", "REQUEST_APPOINTMENT", "REQUEST_PATIENT_INFO_UPDATE"];
    if (patientTriggeredTypes.includes(data.type)) {
      // จำ patientSpecialId ที่ conn นี้เคยขอ ไว้ใช้ตอนบล็อกย้อนหลัง
      const pid = data.patientSpecialId || (data.payload && data.payload.patientSpecialId);
      if (pid) this.connToPatientId.set(conn.peer, pid);

      const knownPid = this.connToPatientId.get(conn.peer);
      if (knownPid && this.blockedPatientIds.has(knownPid)) {
        conn.send({ type: "BLOCKED", payload: { reason: "คุณถูกระงับการใช้งานชั่วคราวโดยร้านยา" } });
        return;
      }

      if (this.isRateLimited(conn)) {
        console.warn("Rate limit exceeded, auto-blocking:", conn.peer, knownPid);
        if (knownPid) await this.blockPatient(knownPid);
        conn.send({ type: "BLOCKED", payload: { reason: "ตรวจพบการส่งคำขอถี่ผิดปกติ ระบบระงับการใช้งานอัตโนมัติ" } });
        conn.close();
        return;
      }
    }

    if (data.type === "REQUEST_FULL_SYNC") {
      const meds = await dbEngine.getAll("medicine");
      const patients = await dbEngine.getAll("patient");
      const bills = await dbEngine.getAll("bill");
      conn.send({ type: "RESPONSE_FULL_SYNC", payload: { meds, patients, bills } });
    }

    if (data.type === "REQUEST_PATIENT_HISTORY") {
      const patients = await dbEngine.getAll("patient");
      const bills = await dbEngine.getAll("bill");
      const targetPatient = patients.find((p) => p.patient_special_id === data.patientSpecialId);
      const targetBills = bills.filter((b) => b.patientSpecialId === data.patientSpecialId || (targetPatient && b.patientName === targetPatient.full_name));
      conn.send({ type: "RESPONSE_PATIENT_HISTORY", payload: { patient: targetPatient, bills: targetBills } });

      // แจ้ง UI หน้าร้าน (ถ้ามี) ว่าคนไข้รายนี้ออนไลน์อยู่ตอนนี้ ผ่าน conn ไหน (ใช้ทำสถานะออนไลน์ในแชทให้แม่นตั้งแต่ยังไม่ทัก)
      if (typeof notifyPatientPresence === "function") {
        notifyPatientPresence(conn, data.patientSpecialId);
      }
    }

    if (data.type === "CHAT_MESSAGE") {
      // ส่งต่อให้ UI ของหน้าร้าน (ถ้ามีฟังก์ชันนี้อยู่ในหน้า index.html) แสดงข้อความและให้เภสัชกรตอบ
      if (typeof handleIncomingChat === "function") {
        handleIncomingChat(conn, data.payload);
      }
    }

    if (data.type === "REQUEST_APPOINTMENT") {
      // ตอบรับทันทีว่าได้รับคำขอแล้ว (คนไข้จะเห็น "ร้านได้รับคำขอแล้ว")
      conn.send({ type: "APPOINTMENT_ACK" });
      if (typeof handleIncomingAppointment === "function") {
        handleIncomingAppointment(conn, data.payload);
      }
    }

    if (data.type === "REQUEST_PATIENT_INFO_UPDATE") {
      // แค่รับคำขอไว้ก่อน ยังไม่แก้ข้อมูลจริง ต้องรอเภสัชกรอนุมัติที่หน้าร้าน
      conn.send({ type: "PATIENT_INFO_UPDATE_REQUESTED" });
      if (typeof handlePatientInfoUpdateRequest === "function") {
        handlePatientInfoUpdateRequest(conn, data.patientSpecialId, data.payload);
      }
    }

    if (data.type === "RESPONSE_FULL_SYNC") {
      const { meds, patients, bills } = data.payload;
      if (meds) for (let m of meds) await dbEngine.update("medicine", m);
      if (patients) for (let p of patients) await dbEngine.update("patient", p);
      if (bills) for (let b of bills) await dbEngine.update("bill", b);
      if (typeof refreshData === "function") await refreshData();
    }

    if (data.type === "SYNC_DB") {
      if (data.store && data.payload) {
        await dbEngine.update(data.store, data.payload);
        if (typeof refreshData === "function") await refreshData();
      }
    }

    if (data.type === "DELETE_DB") {
      if (data.store && data.id) {
        await dbEngine.delete(data.store, data.id);
        if (typeof refreshData === "function") await refreshData();
      }
    }
  }

  // ----- Rate limiting -----
  isRateLimited(conn) {
    const now = Date.now();
    const key = conn.peer;
    const timestamps = (this.messageLog.get(key) || []).filter(
      (t) => now - t < this.RATE_LIMIT_WINDOW_MS
    );
    timestamps.push(now);
    this.messageLog.set(key, timestamps);
    return timestamps.length > this.RATE_LIMIT_COUNT;
  }

  // ----- สถานะร้าน (ว่าง/ไม่ว่าง/รอคิว) -----
  setStatus(state, queueCount = 0) {
    this.currentStatus = { state, queueCount, ts: Date.now() };
    this.broadcastData({ type: "STATUS_UPDATE", payload: this.currentStatus });
    return this.currentStatus;
  }

  // ----- บล็อกคนไข้ (persist ผ่าน dbEngine settings) -----
  async loadBlockedList() {
    try {
      const settings = await dbEngine.getAll("settings");
      const rec = settings.find((s) => s.key === "blocked_patient_ids");
      const ids = rec && rec.value ? JSON.parse(rec.value) : [];
      this.blockedPatientIds = new Set(ids);
    } catch (e) {
      console.error("โหลด blocked list ไม่สำเร็จ:", e);
      this.blockedPatientIds = new Set();
    }
  }

  async saveBlockedList() {
    await dbEngine.update("settings", {
      key: "blocked_patient_ids",
      value: JSON.stringify(Array.from(this.blockedPatientIds))
    });
  }

  async blockPatient(patientSpecialId) {
    this.blockedPatientIds.add(patientSpecialId);
    await this.saveBlockedList();

    // ตัดการเชื่อมต่อของคนไข้รายนี้ถ้ากำลังเปิดอยู่
    for (const [peerId, pid] of this.connToPatientId.entries()) {
      if (pid === patientSpecialId) {
        const conn = this.connections.find((c) => c.peer === peerId);
        if (conn && conn.open) {
          conn.send({ type: "BLOCKED", payload: { reason: "คุณถูกระงับการใช้งานโดยร้านยา" } });
          conn.close();
        }
      }
    }
  }

  async unblockPatient(patientSpecialId) {
    this.blockedPatientIds.delete(patientSpecialId);
    await this.saveBlockedList();
  }

  // ----- ใช้ตอนเภสัชกรอนุมัติคำขอแก้ไขข้อมูลคนไข้ -----
  async applyPatientInfoUpdate(patientSpecialId, payload) {
    const patients = await dbEngine.getAll("patient");
    const target = patients.find((p) => p.patient_special_id === patientSpecialId);
    if (!target) return null;

    const updated = {
      ...target,
      full_name: payload.full_name || target.full_name,
      age: payload.age,
      weight: payload.weight,
      phone: payload.phone
    };
    updated.id = target.id;
    updated.patient_special_id = target.patient_special_id;

    await dbEngine.update("patient", updated);
    this.broadcastData({ type: "SYNC_DB", store: "patient", payload: updated });
    return updated;
  }

  // ส่งข้อความหา connection เฉพาะราย (เช่น แจ้งผลอนุมัติ/ปฏิเสธคำขอ) — คืน true ถ้าส่งสำเร็จ (ยังออนไลน์อยู่)
  sendToConn(connPeer, data) {
    const conn = this.connections.find((c) => c.peer === connPeer && c.open);
    if (conn) {
      conn.send(data);
      return true;
    }
    return false;
  }

  renderQRCode(peerId) {
    const qrContainer = document.getElementById("qrcode");
    if (qrContainer) {
      qrContainer.innerHTML = "";
      const syncUrl = `${window.location.origin}${window.location.pathname}?syncId=${peerId}`;
      new QRCode(qrContainer, { text: syncUrl, width: 128, height: 128 });
    }
  }
}

const syncEngine = new SyncEngine();
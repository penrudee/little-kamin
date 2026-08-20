// webrtc.js - WebRTC Mesh, Realtime State Sync & Patient History Engine
class SyncEngine {
  constructor() {
    this.connections = [];
    this.peer = null;
  }

  initPeer(isHost = true, hostIdToConnect = null) {
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
    }

    if (data.type === "RESPONSE_FULL_SYNC") {
      const { meds, patients, bills } = data.payload;
      if (meds) for (let m of meds) await dbEngine.update("medicine", m);
      if (patients) for (let p of patients) await dbEngine.update("patient", p);
      if (bills) for (let b of bills) await dbEngine.update("bill", b);
      if (typeof refreshData === "function") await refreshData();
    }

    // รองรับการเพิ่ม/แก้ไขข้อมูลลง DB
    if (data.type === "SYNC_DB") {
      if (data.store && data.payload) {
        await dbEngine.update(data.store, data.payload);
        if (typeof refreshData === "function") await refreshData();
      }
    }

    // รองรับการลบข้อมูลจาก DB
    if (data.type === "DELETE_DB") {
      if (data.store && data.id) {
        await dbEngine.delete(data.store, data.id);
        if (typeof refreshData === "function") await refreshData();
      }
    }
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

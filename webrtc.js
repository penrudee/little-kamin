// webrtc.js - WebRTC Mesh, Realtime State Sync & Patient History Engine
class SyncEngine {
  constructor() {
    this.connections = [];
    this.peer = null;
  }

  // เริ่มต้นการทำงานของ PeerJS
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

    this.peer.on("error", (err) => {
      console.error("PeerJS Error:", err.type, err);
    });

    this.peer.on("connection", (conn) => {
      this.setupConnectionEvents(conn);
    });
  }

  // เชื่อมต่อไปยังเครื่อง Host (ร้านยา)
  connectToHost(hostId) {
    console.log("Connecting to Host Peer ID:", hostId);
    const conn = this.peer.connect(hostId, { reliable: true });
    this.setupConnectionEvents(conn);
  }

  // จัดการ Event ของ Connection แต่ละสาย
  setupConnectionEvents(conn) {
    conn.on("open", () => {
      console.log("Data channel opened with:", conn.peer);
      
      if (!this.connections.some((c) => c.peer === conn.peer)) {
        this.connections.push(conn);
      }
      this.updateClientCounter();

      // หากเป็น Client ทั่วไปที่สแกนซิงค์ร้าน ให้ขอข้อมูลทั้งหมด
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("syncId")) {
        conn.send({ type: "REQUEST_FULL_SYNC" });
      }
    });

    conn.on("data", async (data) => {
      await this.handleIncomingData(conn, data);
    });

    conn.on("close", () => {
      console.log("Connection closed with:", conn.peer);
      this.connections = this.connections.filter((c) => c !== conn);
      this.updateClientCounter();
    });

    conn.on("error", (err) => {
      console.error("Connection Error:", err);
    });
  }

  // อัปเดตตัวเลขแสดงจำนวนการเชื่อมต่อบนหน้าจอ
  updateClientCounter() {
    const el = document.getElementById("clientCountDisplay");
    if (el) {
      el.innerText = `การเชื่อมต่อ WebRTC Active: ${this.connections.length} จุด`;
    }
  }

  // ส่งข้อมูลกระจายไปยังทุก Peer ที่เชื่อมต่ออยู่
  broadcastData(data) {
    this.connections.forEach((conn) => {
      if (conn.open) {
        conn.send(data);
      }
    });
  }

  // ประมวลผล Data Packet ที่ได้รับเข้ามา
  async handleIncomingData(conn, data) {
    // 1. ตอบรับคำขอส่งข้อมูลฐานข้อมูลทั้งหมดให้ Client
    if (data.type === "REQUEST_FULL_SYNC") {
      console.log("Sending full database copy to client...");
      const meds = await dbEngine.getAll("medicine");
      const patients = await dbEngine.getAll("patient");
      const bills = await dbEngine.getAll("bill");

      conn.send({
        type: "RESPONSE_FULL_SYNC",
        payload: { meds, patients, bills }
      });
    }

    // 2. ตอบรับคำขอประวัติเฉพาะของคนไข้รายบุคคล (จากหน้า patient_history.html)
    if (data.type === "REQUEST_PATIENT_HISTORY") {
      console.log("Processing patient history request for:", data.patientSpecialId);
      const patients = await dbEngine.getAll("patient");
      const bills = await dbEngine.getAll("bill");

      const targetPatient = patients.find(
        (p) => p.patient_special_id === data.patientSpecialId
      );
      const targetBills = bills.filter(
        (b) =>
          b.patientSpecialId === data.patientSpecialId ||
          (targetPatient && b.patientName === targetPatient.full_name)
      );

      conn.send({
        type: "RESPONSE_PATIENT_HISTORY",
        payload: { patient: targetPatient, bills: targetBills }
      });
    }

    // 3. ฝั่ง Client รับข้อมูลเต็มมาบันทึกลง Local IndexedDB
    if (data.type === "RESPONSE_FULL_SYNC") {
      console.log("Received full database payload:", data.payload);
      const { meds, patients, bills } = data.payload;

      if (meds) for (let m of meds) await dbEngine.update("medicine", m);
      if (patients) for (let p of patients) await dbEngine.update("patient", p);
      if (bills) for (let b of bills) await dbEngine.update("bill", b);

      if (typeof refreshData === "function") await refreshData();
    }

    // 4. Realtime Generic State Sync (เมื่อมีการเพิ่ม/แก้ไขข้อมูลจากเครื่องอื่น)
    if (data.type === "SYNC_DB") {
      console.log(`Received realtime update for store [${data.store}]:`, data.payload);
      if (data.store && data.payload) {
        await dbEngine.update(data.store, data.payload);
        if (typeof refreshData === "function") await refreshData();
      }
    }
  }

  // แสดงผล QR Code หลักของร้านยาสำหรับซิงค์เครื่อง
  renderQRCode(peerId) {
    const qrContainer = document.getElementById("qrcode");
    if (qrContainer) {
      qrContainer.innerHTML = "";
      const syncUrl = `${window.location.origin}${window.location.pathname}?syncId=${peerId}`;
      new QRCode(qrContainer, { text: syncUrl, width: 128, height: 128 });
    }
  }
}

// สร้าง Global Instance
const syncEngine = new SyncEngine();

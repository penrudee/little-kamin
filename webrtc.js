// webrtc.js - WebRTC Mesh & Realtime State Sync System
class SyncEngine {
  constructor() {
    this.connections = [];
    this.peer = null;
  }

  initPeer(isHost = true, hostIdToConnect = null) {
    // ใส่ STUN/TURN Public Servers เพื่อช่วยทะลุ NAT ข้ามเครือข่าย (เช่น Wi-Fi กับ 4G)
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
      alert("เกิดข้อผิดพลาด WebRTC: " + err.type);
    });

    this.peer.on("connection", (conn) => {
      this.setupConnectionEvents(conn);
    });
  }

  connectToHost(hostId) {
    console.log("Connecting to Host:", hostId);
    const conn = this.peer.connect(hostId, { reliable: true });
    this.setupConnectionEvents(conn);
  }

  setupConnectionEvents(conn) {
    conn.on("open", () => {
      console.log("Data channel opened with:", conn.peer);
      
      // เช็กป้องกันการเพิ่ม Connection ซ้ำ
      if (!this.connections.some(c => c.peer === conn.peer)) {
        this.connections.push(conn);
      }
      this.updateClientCounter();

      // หากเป็น Client ให้ขอข้อมูลก้อนใหญ่ทันทีที่ต่อติด
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

  updateClientCounter() {
    const el = document.getElementById("clientCountDisplay");
    if (el) {
      el.innerText = `การเชื่อมต่อ WebRTC Active: ${this.connections.length} จุด`;
    }
  }

  broadcastData(data) {
    this.connections.forEach((conn) => {
      if (conn.open) {
        conn.send(data);
      }
    });
  }

  async handleIncomingData(conn, data) {
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

    if (data.type === "RESPONSE_FULL_SYNC") {
      console.log("Received full database payload:", data.payload);
      const { meds, patients, bills } = data.payload;

      for (let m of meds) await dbEngine.update("medicine", m);
      for (let p of patients) await dbEngine.update("patient", p);
      for (let b of bills) await dbEngine.update("bill", b);

      if (typeof refreshData === "function") await refreshData();
      alert("คัดลอกฐานข้อมูลมายังเครื่องนี้สำเร็จเรียบร้อยแล้ว!");
    }

    if (data.type === "SYNC_DB") {
      console.log(`Received realtime update for store [${data.store}]:`, data.payload);
      if (data.store && data.payload) {
        await dbEngine.update(data.store, data.payload);
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

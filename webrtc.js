// webrtc.js - WebRTC Mesh & Realtime State Sync System
class SyncEngine {
  constructor() {
    this.connections = [];
    this.peer = null;
  }

  initPeer(isHost = true, hostIdToConnect = null) {
    this.peer = new Peer();

    this.peer.on("open", (id) => {
      console.log("My Peer ID:", id);
      if (isHost && !hostIdToConnect) {
        this.renderQRCode(id);
      } else if (hostIdToConnect) {
        this.connectToHost(hostIdToConnect);
      }
    });

    this.peer.on("connection", (conn) => {
      this.connections.push(conn);
      this.updateClientCounter();

      conn.on("open", () => {
        console.log("Client connected:", conn.peer);
      });

      conn.on("data", async (data) => {
        await this.handleIncomingData(conn, data);
      });

      conn.on("close", () => {
        this.connections = this.connections.filter((c) => c !== conn);
        this.updateClientCounter();
      });
    });
  }

  connectToHost(hostId) {
    console.log("Connecting to Host:", hostId);
    const conn = this.peer.connect(hostId);

    conn.on("open", () => {
      this.connections.push(conn);
      console.log("Connected to Host successfully!");
      conn.send({ type: "REQUEST_FULL_SYNC" });
    });

    conn.on("data", async (data) => {
      await this.handleIncomingData(conn, data);
    });

    conn.on("close", () => {
      this.connections = this.connections.filter((c) => c !== conn);
      this.updateClientCounter();
    });
  }

  updateClientCounter() {
    const el = document.getElementById("clientCountDisplay");
    if (el) {
      el.innerText = `การเชื่อมต่อ WebRTC Active: ${this.connections.length} จุด`;
    }
  }

  broadcastData(data) {
    this.connections.forEach((conn) => conn.send(data));
  }

  async handleIncomingData(conn, data) {
    // 1. คัดลอกฐานข้อมูลทั้งหมดส่งให้ Client ที่สแกน QR เข้ามา
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

    // 2. Client รับชุดข้อมูลเต็มจาก Host ครั้งแรก
    if (data.type === "RESPONSE_FULL_SYNC") {
      console.log("Received full database payload:", data.payload);
      const { meds, patients, bills } = data.payload;

      for (let m of meds) await dbEngine.update("medicine", m);
      for (let p of patients) await dbEngine.update("patient", p);
      for (let b of bills) await dbEngine.update("bill", b);

      if (typeof refreshData === "function") await refreshData();
      alert("คัดลอกฐานข้อมูลมายังเครื่องนี้สำเร็จเรียบร้อยแล้ว!");
    }

    // 3. Generic State Sync (บันทึกข้อมูลลง IndexedDB ทันทีเมื่อมีการเพิ่ม/แก้ไขจากเครื่องอื่น)
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

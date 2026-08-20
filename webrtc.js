// webrtc.js - WebRTC Mesh & Full DB Sync System
class SyncEngine {
  constructor() {
    this.connections = [];
    this.peer = null;
  }

  initPeer(isHost = true, hostIdToConnect = null) {
    // สร้าง Peer Connection
    this.peer = new Peer();

    this.peer.on("open", (id) => {
      console.log("My Peer ID:", id);
      if (isHost && !hostIdToConnect) {
        this.renderQRCode(id);
      } else if (hostIdToConnect) {
        // กรณีเป็น Client (สแกน QR มา) ให้เชื่อมต่อไปหา Host ทันที
        this.connectToHost(hostIdToConnect);
      }
    });

    // ฝั่ง PC (Host) รอรับการเชื่อมต่อจาก Smartphone/Client
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
      // เมื่อเชื่อมต่อติด ให้ร้องขอคัดลอกฐานข้อมูลทั้งหมดทันที
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
    // กรณี PC ถูกร้องขอให้คัดลอกข้อมูลส่งไปให้ Smartphone
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

    // กรณี Smartphone ได้รับชุดข้อมูลจาก PC
    if (data.type === "RESPONSE_FULL_SYNC") {
      console.log("Received full database payload:", data.payload);
      const { meds, patients, bills } = data.payload;

      // บันทึกลง IndexedDB เครื่อง Smartphone
      for (let m of meds) await dbEngine.update("medicine", m);
      for (let p of patients) await dbEngine.update("patient", p);
      for (let b of bills) await dbEngine.update("bill", b);

      if (typeof refreshData === "function") await refreshData();
      alert("คัดลอกฐานข้อมูลมายังเครื่องนี้สำเร็จเรียบร้อยแล้ว!");
    }

    // กรณีอัปเดตข้อมูล Realtime ทั่วไป (ยา / คนไข้ / บิล ที่เพิ่มใหม่)
    if (data.type === "SYNC_DB") {
      // จุดที่บั๊ก: เดิมไม่มีการบันทึกข้อมูลที่ส่งมาลง IndexedDB เลย
      // มีแค่ refreshData() ซึ่งอ่านฐานข้อมูล "ในเครื่องตัวเอง" เท่านั้น
      // จึงทำให้ข้อมูลที่โอนมาไม่ถูกบันทึก และดูเหมือนโอนไม่สำเร็จ
      if (data.store && data.payload) {
        await dbEngine.update(data.store, data.payload);
      }
      if (typeof refreshData === "function") await refreshData();
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

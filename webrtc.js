// webrtc.js - WebRTC Mesh Sync System
class SyncEngine {
  constructor() {
    this.connections = [];
    this.peer = null;
    this.connectedClientsCount = 0;
  }

  initPeer(isHost = true, peerId = null) {
    // ใช้ PeerJS public cloud signaling server เพื่อช่วยสร้าง Handshake โดยไม่ผ่าน Backend ของเรา
    this.peer = peerId ? new Peer(peerId) : new Peer();

    this.peer.on("open", (id) => {
      console.log("My Peer ID:", id);
      if (isHost) {
        this.renderQRCode(id);
      }
    });

    this.peer.on("connection", (conn) => {
      this.connections.push(conn);
      this.updateClientCounter();
      
      conn.on("data", (data) => this.handleIncomingData(data));
      conn.on("close", () => {
        this.connections = this.connections.filter(c => c !== conn);
        this.updateClientCounter();
      });
    });
  }

  connectToHost(hostId) {
    const conn = this.peer.connect(hostId);
    conn.on("open", () => {
      this.connections.push(conn);
      console.log("Connected to Host:", hostId);
    });
    conn.on("data", (data) => this.handleIncomingData(data));
  }

  updateClientCounter() {
    const el = document.getElementById("clientCountDisplay");
    if (el) el.innerText = `การเชื่อมต่อ WebRTC Active: ${this.connections.length} จุด`;
  }

  broadcastData(data) {
    this.connections.forEach(conn => conn.send(data));
  }

  handleIncomingData(data) {
    if (data.type === "SYNC_DB") {
      console.log("Received database payload update via WebRTC", data.payload);
      // Logic สำหรับเขียนทับ/อัปเดตลง dbEngine
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

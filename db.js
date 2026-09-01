// db.js - IndexedDB Local Storage Layer
class PharmacyDB {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("PharmacyLocalDB", 5);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("settings")) {
          // ค่าตั้งค่าระบบ (key/value store)
          // key ที่ใช้อยู่: "pharmacy_name" (ชื่อร้านยา), "pharmacy_address" (ที่อยู่ร้าน, ใช้พิมพ์บนฉลากยา),
          // "pharmacist_name" (ชื่อเภสัชกร/ผู้จ่ายยา, ใช้พิมพ์บนฉลากยา)
          db.createObjectStore("settings", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("users")) {
          const userStore = db.createObjectStore("users", { keyPath: "id", autoIncrement: true });
          userStore.createIndex("username", "username", { unique: true });
          userStore.add({ username: "admin", password: "adminZybook" });
        }
        if (!db.objectStoreNames.contains("medicine")) {
          // ฟิลด์ข้อมูลฉลากยา (ใช้ตอนพิมพ์ฉลากยา 80x50mm) ที่เก็บในแต่ละ record ของยา:
          // label_indication (ข้อบ่งใช้), label_usage (วิธีใช้), label_warning (คำเตือน)
          const medStore = db.createObjectStore("medicine", { keyPath: "id", autoIncrement: true });
          medStore.createIndex("trade_name", "trade_name", { unique: false });
        }
        if (!db.objectStoreNames.contains("patient")) {
          db.createObjectStore("patient", { keyPath: "id", autoIncrement: true });
        }
        if (!db.objectStoreNames.contains("bill")) {
          db.createObjectStore("bill", { keyPath: "id", autoIncrement: true });
        }
        if (!db.objectStoreNames.contains("article")) {
          // บทความที่ user (เภสัชกร) เขียนไว้ สำหรับแนบให้คนไข้อ่านตอนขายยา
          const articleStore = db.createObjectStore("article", { keyPath: "id", autoIncrement: true });
          articleStore.createIndex("topic", "topic", { unique: false });
        }
      };
      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this);
      };
      request.onerror = (e) => reject(e);
    });
  }

  async getAll(storeName) {
    return new Promise((resolve) => {
      const tx = this.db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
    });
  }

  async add(storeName, data) {
    return new Promise((resolve) => {
      const tx = this.db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.add(data);
      req.onsuccess = () => resolve(req.result);
    });
  }

  async update(storeName, data) {
    return new Promise((resolve) => {
      const tx = this.db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.put(data);
      req.onsuccess = () => resolve(req.result);
    });
  }

  async delete(storeName, id) {
    return new Promise((resolve) => {
      const tx = this.db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
    });
  }

  async clear(storeName) {
    return new Promise((resolve) => {
      const tx = this.db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
    });
  }
}
const dbEngine = new PharmacyDB();
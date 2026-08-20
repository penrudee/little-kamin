// db.js - IndexedDB Local Storage Layer
class PharmacyDB {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("PharmacyLocalDB", 2);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("users")) {
          const userStore = db.createObjectStore("users", { keyPath: "id", autoIncrement: true });
          userStore.createIndex("username", "username", { unique: true });
          userStore.add({ username: "admin", password: "admin" });
        }
        if (!db.objectStoreNames.contains("medicine")) {
          const medStore = db.createObjectStore("medicine", { keyPath: "id", autoIncrement: true });
          medStore.createIndex("trade_name", "trade_name", { unique: false });
        }
        if (!db.objectStoreNames.contains("patient")) {
          db.createObjectStore("patient", { keyPath: "id", autoIncrement: true });
        }
        if (!db.objectStoreNames.contains("bill")) {
          db.createObjectStore("bill", { keyPath: "id", autoIncrement: true });
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

  // เพิ่มฟังก์ชันสำหรับลบข้อมูลตาม ID
  async delete(storeName, id) {
    return new Promise((resolve) => {
      const tx = this.db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
    });
  }
}
const dbEngine = new PharmacyDB();

// db.js - SQLite / IndexedDB Local Storage Layer
class PharmacyDB {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("PharmacyLocalDB", 1);
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
          const patStore = db.createObjectStore("patient", { keyPath: "id", autoIncrement: true });
          patStore.createIndex("full_name", "full_name", { unique: false });
          patStore.createIndex("patient_special_id", "patient_special_id", { unique: true });
        }
        if (!db.objectStoreNames.contains("visit")) {
          db.createObjectStore("visit", { keyPath: "id", autoIncrement: true });
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
}
const dbEngine = new PharmacyDB();

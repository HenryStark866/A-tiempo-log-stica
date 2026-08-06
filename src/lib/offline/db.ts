/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA BASE LOCAL
 *
 * Un envoltorio delgado sobre IndexedDB, sin librería: lo único que hace falta
 * es un almacén de "acciones en espera" que sobreviva a que se cierre la
 * pestaña, y para eso localStorage no sirve — no admite Blobs, y una foto de
 * evidencia de entrega es justamente lo que hay que guardar mientras no hay
 * señal para subirla.
 *
 * Por qué IndexedDB y no una librería: son quince líneas reales de API, y
 * traer una dependencia para eso es más código que el que ahorra.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const DB_NAME = "yam-offline";
const DB_VERSION = 1;
export const COLA_STORE = "cola";

let dbPromise: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB no disponible en este entorno"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(COLA_STORE)) {
          const store = db.createObjectStore(COLA_STORE, { keyPath: "id" });
          store.createIndex("creadoEn", "creadoEn");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("No se pudo abrir la base local"));
    });
  }
  return dbPromise;
}

/** Envuelve una transacción y la resuelve/rechaza cuando termina de verdad, no cuando la petición individual devuelve. */
function conTransaccion<T>(
  modo: IDBTransactionMode,
  ejecutar: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T> {
  return abrir().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(COLA_STORE, modo);
        const store = tx.objectStore(COLA_STORE);
        const req = ejecutar(store);
        let resultado: T;
        if (req) req.onsuccess = () => (resultado = req.result);
        tx.oncomplete = () => resolve(resultado as T);
        tx.onerror = () => reject(tx.error ?? new Error("Falló la operación local"));
        tx.onabort = () => reject(tx.error ?? new Error("Se abortó la operación local"));
      })
  );
}

export async function put<T>(valor: T): Promise<void> {
  await conTransaccion("readwrite", (s) => s.put(valor));
}

export async function eliminar(id: string): Promise<void> {
  await conTransaccion("readwrite", (s) => s.delete(id));
}

export function listarTodo<T>(): Promise<T[]> {
  return conTransaccion<T[]>("readonly", (s) => s.index("creadoEn").getAll() as unknown as IDBRequest<T[]>);
}

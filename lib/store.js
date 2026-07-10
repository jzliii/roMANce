// 極簡 JSON 檔案儲存：data/characters.json 與 data/chats.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");

function load(name) {
  const file = path.join(DATA_DIR, `${name}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

function save(name, items) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, `${name}.json`);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(items, null, 2));
  fs.renameSync(tmp, file);
}

export const newId = () => crypto.randomBytes(8).toString("hex");

function collection(name) {
  let items = load(name);
  return {
    all: () => items,
    get: (id) => items.find((it) => it.id === id),
    insert(item) {
      items.push(item);
      save(name, items);
      return item;
    },
    update(id, patch) {
      const it = items.find((x) => x.id === id);
      if (!it) return null;
      Object.assign(it, patch, { updatedAt: new Date().toISOString() });
      save(name, items);
      return it;
    },
    remove(id) {
      const before = items.length;
      items = items.filter((x) => x.id !== id);
      save(name, items);
      return items.length < before;
    },
  };
}

export const characters = collection("characters");
export const chats = collection("chats");

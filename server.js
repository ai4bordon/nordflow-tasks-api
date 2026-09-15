#!/usr/bin/env node
// NordFlow Tasks — HTTP-адаптер: превращает запросы в вызовы ядра (src/app.js).
// Зависимостей нет: только стандартная библиотека Node.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp, createStore, demoData } from "./src/app.js";
import { randomBytes } from "node:crypto";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const STORE_FILE = path.join(ROOT, "data", "store.json");
const PORT = Number(process.env.PORT || 3000);
const FRONTEND_DIR = path.join(ROOT, "frontend");
const MIME_STATIC = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

function loadStore() {
  try {
    return {
      data: JSON.parse(fs.readFileSync(STORE_FILE, "utf8")),
      fresh: false,
    };
  } catch {
    // Первый запуск: генерируем пароль демо-учёток здесь и сейчас.
    // В репозитории его нет и не будет; единственный экземпляр — в консоли ниже.
    const demoPassword = randomBytes(4).toString("hex");
    const data = demoData(undefined, demoPassword);
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
    return { data, fresh: true, demoPassword };
  }
}

const boot = loadStore();
const store = createStore(boot.data, { file: STORE_FILE, fs });
const app = createApp({ store });

/** Лимит тела запроса (AUD-02): без него один большой POST кладёт процесс —
    чанки копятся в памяти без границ. 1 МБ с запасом покрывает честные тела
    этого API (задачи, комментарии, заявки). */
const MAX_BODY = 1_000_000;

const readBody = async (req) => {
  let raw = "";
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) return "TOO_LARGE";
    raw += chunk;
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const server = http.createServer(async (req, res) => {
  const send = (status, payload) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, X-Token",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    });
    res.end(JSON.stringify(payload));
  };

  if (req.method === "OPTIONS") return send(204, {});

  const pathname = req.url || "/";
  const auth = req.headers["x-token"] || null;

  // Веб-интерфейс лежит в frontend/ и раздаётся как статика.
  // API живёт только под /api/; карта API — на GET /api.
  if (pathname !== "/api" && !pathname.startsWith("/api/")) {
    const name =
      pathname === "/" ? "index.html" : pathname.replace(/\.\./g, "");
    const full = path.join(FRONTEND_DIR, name);
    if (
      full.startsWith(FRONTEND_DIR) &&
      fs.existsSync(full) &&
      fs.statSync(full).isFile()
    ) {
      const ext = path.extname(full);
      res.writeHead(200, {
        "Content-Type": MIME_STATIC[ext] || "application/octet-stream",
      });
      fs.createReadStream(full).pipe(res);
      return;
    }
    return send(404, { error: "Неизвестный адрес" });
  }

  // Карта API — удобно для проверки и для портфолио.
  if (pathname === "/api") {
    return send(200, {
      service: "NordFlow Tasks API",
      version: "1.0.0",
      docs: "README.md",
      demoAccounts: [
        { email: "anna@nordflow.io", role: "admin" },
        { email: "maxim@nordflow.io", role: "pm" },
        { email: "ilya@nordflow.io", role: "employee" },
      ],
      password: undefined,
      demoNote:
        "Пароль демо-учёток — в консоли сервера при первом запуске; в репозитории паролей нет",
      endpoints: [
        "GET /api/demo",
        "POST /api/login",
        "POST /api/logout",
        "GET /api/me",
        "GET /api/dashboard",
        "GET /api/users",
        "POST /api/users",
        "PATCH /api/users/:id",
        "DELETE /api/users/:id",
        "GET /api/projects",
        "POST /api/projects",
        "GET /api/projects/:id",
        "PATCH /api/projects/:id",
        "POST /api/projects/:id/archive",
        "POST /api/projects/:id/members",
        "DELETE /api/projects/:id/members/:userId",
        "GET /api/projects/:id/board",
        "GET /api/tasks",
        "POST /api/tasks",
        "GET /api/tasks/:id",
        "PATCH /api/tasks/:id",
        "POST /api/tasks/:id/status",
        "POST /api/tasks/:id/comments",
        "PATCH /api/comments/:id",
        "DELETE /api/comments/:id",
        "GET /api/notifications",
        "POST /api/notifications/:id/read",
        "POST /api/notifications/read-all",
        "GET /api/search?q=",
      ],
    });
  }

  const body =
    req.method === "GET" || req.method === "DELETE" ? {} : await readBody(req);
  if (body === null)
    return send(400, { error: "Некорректный JSON в теле запроса" });
  if (body === "TOO_LARGE")
    return send(413, { error: "Тело запроса слишком большое (лимит 1 МБ)" });

  const result = app.dispatch(req.method, pathname, { body, token: auth });
  if (result.status === 204) return send(204, {});
  return send(result.status, result.body);
});

server.listen(PORT, () => {
  console.log(`NordFlow Tasks API: http://localhost:${PORT}`);
  if (boot.fresh) {
    console.log(`Демо-пароль (показан один раз, сохраните): ${boot.demoPassword}`);
    console.log("Демо-учётки целиком — GET /api/demo. Пароль действует, пока жив data/store.json.");
  } else {
    console.log("Демо-данные уже есть. Пароль — тот, что был выдан при первом запуске.");
    console.log("Потеряли пароль: удалите data/store.json и перезапустите сервер.");
  }
});

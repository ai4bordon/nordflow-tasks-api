#!/usr/bin/env node
// NordFlow Tasks — HTTP-адаптер: превращает запросы в вызовы ядра (src/app.js).
// Зависимостей нет: только стандартная библиотека Node.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp, createStore, demoData } from "./src/app.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const STORE_FILE = path.join(ROOT, "data", "store.json");
const PORT = Number(process.env.PORT || 3000);

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    const data = demoData();
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
    return data;
  }
}

const store = createStore(loadStore(), { file: STORE_FILE, fs });
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

  // Корень отдаёт карту API — удобно для проверки и для портфолио.
  if (pathname === "/") {
    return send(200, {
      service: "NordFlow Tasks API",
      version: "1.0.0",
      docs: "README.md",
      demoAccounts: [
        { email: "anna@nordflow.io", role: "admin" },
        { email: "maxim@nordflow.io", role: "pm" },
        { email: "ilya@nordflow.io", role: "employee" },
      ],
      password: "nordflow",
      endpoints: [
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

  if (!pathname.startsWith("/api/"))
    return send(404, { error: "Неизвестный адрес" });

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
  console.log("Демо-вход: anna@nordflow.io / nordflow (администратор)");
});

// Проверка критериев приёмки из ТЗ клиента (раздел 26).
// Тесты ходят в ядро напрямую — порт не поднимается, данные не пишутся на диск.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, createStore, demoData } from "../src/app.js";

const TODAY = new Date("2026-09-15T09:00:00Z");

function setup() {
  const store = createStore(demoData(TODAY));
  const app = createApp({ store, today: () => TODAY });
  const login = (email) =>
    app.dispatch("POST", "/api/login", {
      body: { email, password: "nordflow" },
    }).body.token;
  return { app, store, login };
}

test("1. Вход и выход из системы", () => {
  const { app, login } = setup();
  assert.equal(
    app.dispatch("POST", "/api/login", {
      body: { email: "anna@nordflow.io", password: "nope" },
    }).status,
    401,
  );
  const token = login("anna@nordflow.io");
  assert.ok(token);
  assert.equal(
    app.dispatch("GET", "/api/me", { token }).body.user.role,
    "admin",
  );
  assert.equal(app.dispatch("POST", "/api/logout", { token }).status, 200);
  assert.equal(
    app.dispatch("GET", "/api/me", { token }).status,
    401,
    "после выхода токен не работает",
  );
});

test("2. Администратор создаёт проект и пользователя", () => {
  const { app, login } = setup();
  const token = login("anna@nordflow.io");
  const created = app.dispatch("POST", "/api/users", {
    token,
    body: { name: "Пётр Нов", email: "petr@nordflow.io", role: "employee" },
  });
  assert.equal(created.status, 201);
  const project = app.dispatch("POST", "/api/projects", {
    token,
    body: { name: "Новый проект", leadId: "u2" },
  });
  assert.equal(project.status, 201);
  assert.equal(project.body.project.status, "planning");
});

test("3–4. Руководитель создаёт задачу и назначает исполнителя", () => {
  const { app, login } = setup();
  const token = login("maxim@nordflow.io");
  const res = app.dispatch("POST", "/api/tasks", {
    token,
    body: {
      projectId: "p1",
      title: "Новая задача",
      assigneeId: "u4",
      priority: "high",
      dueDate: "2026-09-20T00:00:00.000Z",
    },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.task.assigneeId, "u4");
  assert.match(res.body.task.key, /^NDS-/);
  const notifications = app.dispatch("GET", "/api/notifications", {
    token: login("ilya@nordflow.io"),
  });
  assert.ok(
    notifications.body.notifications.some(
      (n) => n.type === "assigned" && n.taskId === res.body.task.id,
    ),
  );
});

test("5–6. Список и доска: задачи по колонкам, перемещение меняет статус", () => {
  const { app, login } = setup();
  const pm = login("maxim@nordflow.io");
  const board = app.dispatch("GET", "/api/projects/p1/board", { token: pm });
  assert.equal(board.status, 200);
  assert.equal(board.body.columns.length, 5, "пять колонок канбана");
  const column = board.body.columns.find((c) => c.status === "backlog");
  assert.ok(column.tasks.length > 0);
  const taskId = column.tasks[0].id;
  const moved = app.dispatch("POST", `/api/tasks/${taskId}/status`, {
    token: pm,
    body: { status: "in_progress" },
  });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.task.status, "in_progress");
  const after = app.dispatch("GET", "/api/projects/p1/board", { token: pm });
  assert.equal(
    after.body.columns
      .find((c) => c.status === "in_progress")
      .tasks.some((t) => t.id === taskId),
    true,
  );
  const history = app.dispatch("GET", `/api/tasks/${taskId}`, { token: pm })
    .body.history;
  assert.ok(
    history.some((h) => h.field === "status"),
    "перемещение попало в историю",
  );
});

test("7. Комментарии: свой правим, чужой — нет; администратор удаляет любой", () => {
  const { app, login } = setup();
  const employee = login("ilya@nordflow.io");
  const created = app.dispatch("POST", "/api/tasks/t3/comments", {
    token: employee,
    body: { text: "Готово, смотрите" },
  });
  assert.equal(created.status, 201);
  const commentId = created.body.comment.id;
  assert.equal(
    app.dispatch("PATCH", `/api/comments/${commentId}`, {
      token: employee,
      body: { text: "Уточнил" },
    }).status,
    200,
  );
  const other = login("viktor@nordflow.io");
  assert.equal(
    app.dispatch("PATCH", `/api/comments/${commentId}`, {
      token: other,
      body: { text: "чужое" },
    }).status,
    403,
  );
  const admin = login("anna@nordflow.io");
  assert.equal(
    app.dispatch("DELETE", `/api/comments/${commentId}`, { token: admin })
      .status,
    200,
  );
});

test("8. Фильтры и поиск", () => {
  const { app, login } = setup();
  const token = login("maxim@nordflow.io");
  const overdue = app.dispatch("GET", "/api/tasks?overdue=1", { token });
  assert.ok(overdue.body.tasks.every((t) => t.overdue === true));
  const byPriority = app.dispatch("GET", "/api/tasks?priority=critical", {
    token,
  });
  assert.ok(byPriority.body.tasks.every((t) => t.priority === "critical"));
  const my = app.dispatch("GET", "/api/tasks?scope=my", {
    token: login("ilya@nordflow.io"),
  });
  assert.ok(my.body.tasks.every((t) => t.assigneeId === "u4"));
  const search = app.dispatch("GET", "/api/search?q=garden", { token });
  assert.equal(search.status, 200);
  const found = app.dispatch("GET", "/api/search?q=верстк", { token });
  assert.ok(found.body.tasks.length > 0, "поиск находит задачи по подстроке");
});

test("9. Просроченные задачи помечены", () => {
  const { app, login } = setup();
  const token = login("maxim@nordflow.io");
  const tasks = app.dispatch("GET", "/api/tasks", { token }).body.tasks;
  const overdue = tasks.filter((t) => t.overdue);
  assert.ok(overdue.length >= 3, "в демо-данных есть просроченные задачи");
  assert.ok(
    overdue.every((t) => t.status !== "done"),
    "выполненные не считаются просроченными",
  );
});

test("10. Уведомления появляются внутри приложения", () => {
  const { app, login } = setup();
  const ilya = login("ilya@nordflow.io");
  const list = app.dispatch("GET", "/api/notifications", { token: ilya });
  assert.ok(list.body.notifications.length > 0);
  const first = list.body.notifications.find((n) => !n.derived);
  assert.equal(
    app.dispatch("POST", `/api/notifications/${first.id}/read`, { token: ilya })
      .status,
    200,
  );
  assert.equal(
    app.dispatch("POST", "/api/notifications/read-all", { token: ilya }).status,
    200,
  );
  assert.equal(
    app
      .dispatch("GET", "/api/notifications", { token: ilya })
      .body.notifications.filter((n) => !n.derived && !n.read).length,
    0,
  );
});

test("11–12. Данные и главная: счётчики, сроки, сессия", () => {
  const { app, login } = setup();
  const token = login("ilya@nordflow.io");
  const dash = app.dispatch("GET", "/api/dashboard", { token });
  assert.equal(dash.status, 200);
  assert.equal(typeof dash.body.counters.active, "number");
  assert.equal(typeof dash.body.counters.overdue, "number");
  assert.equal(typeof dash.body.counters.dueThisWeek, "number");
  assert.ok(Array.isArray(dash.body.upcoming));
  assert.ok(dash.body.myProjects.length > 0);
  assert.equal(
    dash.body.teamSummary,
    null,
    "сотрудник не видит сводку по команде",
  );
  const pmDash = app.dispatch("GET", "/api/dashboard", {
    token: login("maxim@nordflow.io"),
  });
  assert.ok(pmDash.body.teamSummary, "руководитель видит сводку по команде");
});

test("13. Пользователь не видит чужие проекты", () => {
  const { app, login } = setup();
  const maria = login("maria@nordflow.io");
  const projects = app.dispatch("GET", "/api/projects", { token: maria }).body
    .projects;
  assert.ok(
    projects.every((p) => p.memberIds.includes("u8") || p.leadId === "u8"),
  );
  assert.equal(
    app.dispatch("GET", "/api/projects/p1", { token: maria }).status,
    403,
    "в чужой проект не пускают",
  );
});

test("14. Демо-данные по ТЗ: 8 пользователей, 3 проекта, 25+ задач", () => {
  const { app, login } = setup();
  const token = login("anna@nordflow.io");
  const users = app.dispatch("GET", "/api/users", { token }).body.users;
  assert.equal(users.length, 8);
  assert.ok(
    users.every(
      (u) => typeof u.load === "number" && typeof u.activeTasks === "number",
    ),
  );
  const projects = app.dispatch("GET", "/api/projects", { token }).body
    .projects;
  assert.equal(projects.length, 3);
  const tasks = app.dispatch("GET", "/api/tasks", { token }).body.tasks;
  assert.ok(tasks.length >= 25, `задач должно быть 25+, а их ${tasks.length}`);
});

test("15. Права: сотрудник не создаёт проект, чужие задачи не редактирует", () => {
  const { app, login } = setup();
  const employee = login("ilya@nordflow.io");
  assert.equal(
    app.dispatch("POST", "/api/projects", {
      token: employee,
      body: { name: "самозахват" },
    }).status,
    403,
  );
  assert.equal(
    app.dispatch("POST", "/api/users", {
      token: employee,
      body: { name: "x", email: "x@x" },
    }).status,
    403,
  );
  assert.equal(
    app.dispatch("POST", "/api/projects/p1/archive", { token: employee })
      .status,
    403,
  );
  const notMine = app.dispatch("PATCH", "/api/tasks/t10", {
    token: employee,
    body: { title: "взлом" },
  });
  assert.equal(notMine.status, 403, "задача чужого проекта недоступна");
});

test("Сотрудник меняет статус своей задачи и оставляет комментарий (сценарий 2)", () => {
  const { app, login } = setup();
  const token = login("ilya@nordflow.io");
  const mine = app
    .dispatch("GET", "/api/tasks?scope=my", { token })
    .body.tasks.filter((t) => t.status !== "done");
  const task = mine[0];
  assert.equal(
    app.dispatch("POST", `/api/tasks/${task.id}/status`, {
      token,
      body: { status: "review" },
    }).status,
    200,
  );
  assert.equal(
    app.dispatch("POST", `/api/tasks/${task.id}/comments`, {
      token,
      body: { text: "Отправил на проверку" },
    }).status,
    201,
  );
});

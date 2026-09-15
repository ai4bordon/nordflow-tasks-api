/* NordFlow Tasks. Frontend. Same origin API, база из config.js. */
(() => {
  const BASE = typeof API_BASE === "string" ? API_BASE : "";
  let token = null;
  let me = null;
  let projectsCache = [];
  let usersCache = [];
  let charts = {};
  let openTaskId = null;
  let boardProjectId = null;

  const STATUS = {
    backlog: "Бэклог",
    planned: "Запланировано",
    in_progress: "В работе",
    review: "На проверке",
    done: "Выполнено",
  };
  const STATUS_ORDER = ["backlog", "planned", "in_progress", "review", "done"];
  const PRIO = {
    low: "Низкий",
    medium: "Средний",
    high: "Высокий",
    critical: "Критический",
  };

  function $(id) {
    return document.getElementById(id);
  }
  function esc(s) {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => map[c]);
  }
  /* Единственная точка вставки HTML в приложении: вся динамика экранирована через esc() выше. */
  function setHTML(el, html) {
    // pi-lens-ignore: no-inner-html-js
    el.innerHTML = html;
  }
  function fmtDate(iso) {
    if (!iso) return "Без срока";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Без срока";
    return d.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }
  function fmtDT(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  function leftText(t, daysLeft) {
    if (t.status === "done") return "Закрыта";
    if (t.dueDate == null) return "Без срока";
    if (daysLeft == null) return fmtDate(t.dueDate);
    if (daysLeft < 0) return `Просрочка: ${Math.abs(daysLeft)} дн.`;
    if (daysLeft === 0) return "Срок: сегодня";
    return `Осталось: ${daysLeft} дн.`;
  }
  function prioHtml(p) {
    return `<span class="prio prio-${esc(p || "medium")}">${esc(PRIO[p] || p || "")}</span>`;
  }
  function statusHtml(s) {
    return `<span class="status-tag">${esc(STATUS[s] || s || "")}</span>`;
  }

  function api(path, opts = {}) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["X-Token"] = token;
    return fetch(`${BASE}${path}`, {
      method: opts.method || "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then((r) => {
      if (r.status === 204) return {};
      return r.json().then((data) => {
        if (!r.ok)
          throw new Error((data && data.error) || `Ошибка ${r.status}`);
        return data;
      });
    });
  }

  function stateBox(el, kind, text, retry) {
    if (kind === "hide") {
      setHTML(el, "");
      el.className = "hidden";
      return;
    }
    el.className = "mt-3";
    if (kind === "loading") {
      setHTML(
        el,
        `<div class="space-y-2" aria-busy="true" aria-label="Загрузка"><div class="skel h-10 rounded"></div><div class="skel h-10 rounded"></div><div class="skel h-10 rounded"></div></div>`,
      );
    } else if (kind === "empty") {
      setHTML(
        el,
        `<div class="bg-white border rounded p-6 text-center text-sm text-slate-600">${esc(text)}</div>`,
      );
    } else if (kind === "error") {
      const id = `retry-${Math.floor(Math.random() * 1e9)}`;
      setHTML(
        el,
        `<div class="bg-white border border-red-300 rounded p-6 text-center text-sm"><p class="text-red-800">${esc(text)}</p><button id="${id}" class="btn-touch mt-2 px-4 border rounded btn-ghost">Повторить</button></div>`,
      );
      $(id).addEventListener("click", retry);
    }
  }

  /* Навигация */
  const PAGES = ["dashboard", "tasks", "board", "team", "notifs"];
  function nav(page) {
    for (const p of PAGES) {
      $(`page-${p}`).classList.toggle("hidden", p !== page);
    }
    for (const b of document.querySelectorAll("[data-nav]")) {
      const on = b.getAttribute("data-nav") === page;
      b.classList.toggle("bg-white/20", on);
      if (on) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    }
    $("bell-panel").classList.add("hidden");
    if (page === "dashboard") loadDashboard();
    if (page === "tasks") loadTasks();
    if (page === "board") loadBoard();
    if (page === "team") loadTeam();
    if (page === "notifs") loadNotifs();
  }
  for (const b of document.querySelectorAll("[data-nav]")) {
    b.addEventListener("click", () => {
      nav(b.getAttribute("data-nav"));
    });
  }

  /* Вход */
  function showLogin() {
    $("view-login").classList.remove("hidden");
    $("view-app").classList.add("hidden");
  }
  function showApp() {
    $("view-login").classList.add("hidden");
    $("view-app").classList.remove("hidden");
  }

  $("btn-showpass").addEventListener("click", function () {
    const inp = $("login-pass");
    const show = inp.type === "password";
    inp.type = show ? "text" : "password";
    this.setAttribute("aria-label", show ? "Скрыть пароль" : "Показать пароль");
    this.setAttribute("aria-pressed", show ? "true" : "false");
    inp.focus();
  });

  function setErr(id, msg) {
    const el = $(id);
    if (!msg) {
      el.classList.add("hidden");
      el.textContent = "";
      return;
    }
    el.textContent = msg;
    el.classList.remove("hidden");
  }

  $("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const email = $("login-email").value.trim();
    const pass = $("login-pass").value;
    setErr("err-email", email ? "" : "Введите почту.");
    setErr("err-pass", pass ? "" : "Введите пароль.");
    setErr("err-login", "");
    if (!email || !pass) return;
    const btn = $("btn-login");
    btn.disabled = true;
    btn.textContent = "Входим...";
    api("/api/login", { method: "POST", body: { email, password: pass } })
      .then((d) => {
        token = d.token;
        me = d.user;
        afterLogin();
      })
      .catch((err) => {
        setErr(
          "err-login",
          err.message || "Не получилось войти. Проверьте данные.",
        );
      })
      .finally(() => {
        btn.disabled = false;
        btn.textContent = "Войти";
      });
  });

  // Демо-вход без зашитых паролей: пароль отдаёт GET /api/demo (генерируется
  // сервером при первом запуске). Кнопки строятся из ответа, а не из разметки.
  let demoPassword = null;
  const ROLE_SHORT = { admin: "Админ", pm: "Рук.", employee: "Сотр." };
  function doDemoLogin(email) {
    if (!demoPassword) return;
    const btn = $("btn-login");
    btn.disabled = true;
    btn.textContent = "Входим...";
    api("/api/login", {
      method: "POST",
      body: { email, password: demoPassword },
    })
      .then((d) => {
        token = d.token;
        me = d.user;
        afterLogin();
      })
      .catch((err) => {
        setErr(
          "err-login",
          err.message || "Не получилось войти. Проверьте данные.",
        );
      })
      .finally(() => {
        btn.disabled = false;
        btn.textContent = "Войти";
      });
  }
  api("/api/demo")
    .then((d) => {
      demoPassword = d.password;
      const box = $("demo-box");
      if (!box) return;
      for (const a of d.accounts || []) {
        const b = document.createElement("button");
        b.type = "button";
        b.className =
          "btn-touch px-3 text-sm border border-slate-300 rounded btn-ghost";
        b.textContent = `${String(a.name).split(" ")[0]}. ${ROLE_SHORT[a.role] || a.role}`;
        b.addEventListener("click", () => {
          $("login-email").value = a.email;
          setErr("err-login", "");
          doDemoLogin(a.email);
        });
        box.append(b);
      }
    })
    .catch(() => {
      const hint = $("demo-hint");
      if (hint) {
        hint.textContent =
          "Демо-учётки недоступны: удалите data/store.json и перезапустите сервер.";
        hint.classList.remove("hidden");
      }
    });

  $("btn-logout").addEventListener("click", () => {
    if (token) api("/api/logout", { method: "POST" }).catch(() => {});
    token = null;
    me = null;
    $("login-pass").value = "";
    showLogin();
  });

  function afterLogin() {
    showApp();
    $("me-name").textContent = me
      ? `${me.name}, ${me.position || me.role}`
      : "";
    for (const b of document.querySelectorAll(".btn-project-new")) {
      b.classList.toggle("hidden", !me || me.role !== "admin");
    }
    refreshBell();
    api("/api/projects")
      .then((d) => {
        projectsCache = d.projects || [];
        fillProjectSelects();
      })
      .catch(() => {});
    api("/api/users")
      .then((d) => {
        usersCache = d.users || [];
        fillAssigneeSelect();
      })
      .catch(() => {});
    nav("dashboard");
  }

  function fillProjectSelects() {
    const opts = projectsCache
      .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`)
      .join("");
    setHTML($("f-project"), `<option value="">Все</option>${opts}`);
    const empty = `<option value="">Нет проектов</option>`;
    setHTML($("board-project"), opts || empty);
    setHTML($("c-project"), opts || empty);
    // Проект мог уйти в архив или быть удалён — тогда доска молча пустела.
    if (!projectsCache.some((p) => p.id === boardProjectId))
      boardProjectId = projectsCache.length ? projectsCache[0].id : null;
    if (boardProjectId) $("board-project").value = boardProjectId;
  }
  function fillAssigneeSelect() {
    const opts = usersCache
      .map((u) => `<option value="${esc(u.id)}">${esc(u.name)}</option>`)
      .join("");
    setHTML(
      $("c-assignee"),
      `<option value="">Без исполнителя</option>${opts}`,
    );
  }
  $("board-project").addEventListener("change", function () {
    boardProjectId = this.value;
    loadBoard();
  });

  /* Главная */
  const chartColors = ["#0B2E4F", "#00A9A5", "#FF7A59", "#8AA0B4", "#D9A21B"];
  function drawCharts(byStatus, users) {
    if (typeof Chart === "undefined") return;
    for (const k of Object.keys(charts)) {
      try {
        charts[k].destroy();
      } catch {}
    }
    charts = {};
    const c1 = $("ch-status");
    if (c1) {
      charts.s = new Chart(c1, {
        type: "doughnut",
        data: {
          labels: byStatus.map((s) => s.title),
          datasets: [
            {
              data: byStatus.map((s) => s.count),
              backgroundColor: chartColors,
            },
          ],
        },
        options: {
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom" } },
        },
      });
    }
    const c2 = $("ch-load");
    if (c2 && users) {
      const top = users
        .slice()
        .sort((a, b) => (b.activeTasks || 0) - (a.activeTasks || 0))
        .slice(0, 8);
      charts.l = new Chart(c2, {
        type: "bar",
        data: {
          labels: top.map((u) => u.name),
          datasets: [
            {
              label: "Активные",
              data: top.map((u) => u.activeTasks || 0),
              backgroundColor: "#0B2E4F",
            },
          ],
        },
        options: {
          indexAxis: "y",
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { ticks: { precision: 0 } } },
        },
      });
    }
  }

  function loadDashboard() {
    const st = $("dash-state");
    const body = $("dash-body");
    body.classList.add("hidden");
    stateBox(st, "loading");
    api("/api/dashboard")
      .then((d) =>
        api("/api/tasks?scope=my")
          .then((mine) => ({ d, mineTotal: (mine.tasks || []).length }))
          .catch(() => ({ d, mineTotal: null })),
      )
      .then((r) => {
        const d = r.d;
        stateBox(st, "hide");
        body.classList.remove("hidden");
        const c = d.counters || {};
        const total = r.mineTotal == null ? c.active + 0 : r.mineTotal;
        const cards = [
          ["Активные", c.active || 0],
          ["Просроченные", c.overdue || 0],
          ["На неделю", c.dueThisWeek || 0],
          ["Всего моих", total],
        ];
        setHTML(
          $("dash-counters"),
          cards
            .map(
              (x) =>
                `<div class="bg-white border rounded p-3"><p class="text-xs text-slate-500">${esc(x[0])}</p><p class="num font-head text-2xl font-bold text-fjord">${esc(String(x[1]))}</p></div>`,
            )
            .join(""),
        );
        const up = d.upcoming || [];
        const emptyUp = `<p class="text-sm text-slate-500 py-4 text-center">Активных задач со сроком нет. Все спокойно.</p>`;
        setHTML(
          $("dash-upcoming"),
          up.length
            ? `<table class="w-full text-sm"><tbody>${up
                .map((t) => {
                  const od = t.daysLeft < 0 && t.dueDate;
                  const cls = od
                    ? "text-red-700 font-semibold"
                    : "text-slate-500";
                  return `<tr class="border-b ${od ? "row-overdue" : ""}"><td class="py-2 pr-2"><button class="text-left text-teal-800 underline" data-open="${esc(t.id)}">${esc(t.title)}</button><span class="num text-xs text-slate-500 block">${esc(t.key)}</span></td><td class="py-2 pr-2">${prioHtml(t.priority)}</td><td class="py-2 text-right whitespace-nowrap"><span class="num">${esc(fmtDate(t.dueDate))}</span><span class="block text-xs ${cls}">${esc(leftText({ status: "x", dueDate: t.dueDate }, t.daysLeft))}</span></td></tr>`;
                })
                .join("")}</tbody></table>`
            : emptyUp,
        );
        const rec = d.recent || [];
        setHTML(
          $("dash-recent"),
          rec.length
            ? rec
                .map(
                  (h) =>
                    `<li class="border-b pb-2"><span class="font-medium">${esc(h.user)}</span> <button class="text-teal-800 underline" data-open="${esc(h.taskId)}">открыть задачу</button><span class="text-slate-500">: ${esc(h.text)}</span> <span class="num text-xs text-slate-400 block">${esc(fmtDT(h.at))}</span></li>`,
                )
                .join("")
            : `<li class="text-slate-500">Изменений пока нет.</li>`,
        );
        const mp = d.myProjects || [];
        setHTML(
          $("dash-projects"),
          mp.length
            ? mp
                .map((p) => {
                  const pct = p.totalTasks
                    ? Math.round(
                        ((p.totalTasks - p.openTasks) / p.totalTasks) * 100,
                      )
                    : 0;
                  const over = p.overdueTasks
                    ? `, просрочено: ${esc(String(p.overdueTasks))}`
                    : "";
                  return `<button data-board="${esc(p.id)}" class="text-left border rounded p-3 hover:border-teal btn-ghost"><span class="font-medium text-sm">${esc(p.name)}</span><span class="num text-xs text-slate-500 block">Открыто: ${esc(String(p.openTasks))} из ${esc(String(p.totalTasks))}${over}</span><span class="block h-2 bg-slate-200 rounded mt-2"><span class="block h-2 rounded" style="width:${pct}%;background:#00A9A5"></span></span></button>`;
                })
                .join("")
            : `<p class="text-sm text-slate-500">Проектов пока нет. Вас еще никуда не добавили.</p>`,
        );
        const byStatus = (d.teamSummary && d.teamSummary.byStatus) || [];
        if (byStatus.length) {
          $("load-card").style.display = "";
          api("/api/users")
            .then((u) => {
              drawCharts(byStatus, u.users || []);
            })
            .catch(() => {
              drawCharts(byStatus, null);
            });
        } else {
          api("/api/tasks?scope=my")
            .then((m) => {
              const agg = {};
              for (const t of m.tasks || []) {
                agg[t.status] = (agg[t.status] || 0) + 1;
              }
              drawCharts(
                STATUS_ORDER.map((s) => ({
                  title: STATUS[s],
                  count: agg[s] || 0,
                })),
                null,
              );
              $("load-card").style.display = "none";
            })
            .catch(() => {
              $("load-card").style.display = "none";
            });
        }
        bindOpenButtons(body);
        bindBoardButtons(body);
      })
      .catch((err) => {
        body.classList.add("hidden");
        stateBox(
          st,
          "error",
          err.message || "Не получилось загрузить главную.",
          loadDashboard,
        );
      });
  }

  function bindOpenButtons(root) {
    for (const b of root.querySelectorAll("[data-open]")) {
      b.onclick = () => {
        openDrawer(b.getAttribute("data-open"));
      };
    }
  }
  function bindBoardButtons(root) {
    for (const b of root.querySelectorAll("[data-board]")) {
      b.onclick = () => {
        boardProjectId = b.getAttribute("data-board");
        $("board-project").value = boardProjectId;
        nav("board");
      };
    }
  }

  /* Задачи */
  function taskQuery() {
    const q = [];
    if ($("f-status").value)
      q.push(`status=${encodeURIComponent($("f-status").value)}`);
    if ($("f-project").value)
      q.push(`projectId=${encodeURIComponent($("f-project").value)}`);
    if ($("f-prio").value)
      q.push(`priority=${encodeURIComponent($("f-prio").value)}`);
    if ($("f-q").value.trim())
      q.push(`q=${encodeURIComponent($("f-q").value.trim())}`);
    if ($("f-over").checked) q.push("overdue=1");
    return q.length ? `?${q.join("&")}` : "";
  }
  function activeFilterText() {
    const parts = [];
    if ($("f-status").value)
      parts.push(`статус: ${STATUS[$("f-status").value]}`);
    if ($("f-project").value) {
      const p = projectsCache.find((x) => x.id === $("f-project").value);
      parts.push(`проект: ${p ? p.name : $("f-project").value}`);
    }
    if ($("f-prio").value) parts.push(`приоритет: ${PRIO[$("f-prio").value]}`);
    if ($("f-q").value.trim()) parts.push(`поиск: ${$("f-q").value.trim()}`);
    if ($("f-over").checked) parts.push("только просроченные");
    $("f-active").textContent = parts.length
      ? `Включены фильтры: ${parts.join("; ")}.`
      : "";
  }
  function loadTasks() {
    activeFilterText();
    const st = $("tasks-state");
    const tbl = $("tasks-table");
    const rows = $("tasks-rows");
    tbl.classList.add("hidden");
    setHTML(rows, "");
    stateBox(st, "loading");
    api(`/api/tasks${taskQuery()}`)
      .then((d) => {
        const list = d.tasks || [];
        if (!list.length) {
          stateBox(
            st,
            "empty",
            "Задач нет. Попробуйте ослабить фильтры или создайте задачу кнопкой сверху.",
          );
          return;
        }
        stateBox(st, "hide");
        tbl.classList.remove("hidden");
        setHTML(
          rows,
          list
            .map((t) => {
              const cls = t.overdue
                ? "text-red-700 font-semibold"
                : "text-slate-500";
              return `<tr class="border-b hover:bg-slate-50 cursor-pointer ${t.overdue ? "row-overdue" : ""}" data-open="${esc(t.id)}" tabindex="0"><td class="p-2" data-th="Задача"><span class="font-medium">${esc(t.title)}</span><span class="num text-xs text-slate-500 block">${esc(t.key)}</span></td><td class="p-2" data-th="Проект">${esc(t.project || "")}</td><td class="p-2" data-th="Статус">${statusHtml(t.status)}</td><td class="p-2" data-th="Приоритет">${prioHtml(t.priority)}</td><td class="p-2 whitespace-nowrap" data-th="Срок"><span class="num">${esc(fmtDate(t.dueDate))}</span><span class="block text-xs ${cls}">${esc(leftText(t, t.daysLeft))}</span></td><td class="p-2" data-th="Постановщик">${esc(t.author || "")}</td></tr>`;
            })
            .join(""),
        );
        for (const r of rows.querySelectorAll("[data-open]")) {
          r.addEventListener("click", () => {
            openDrawer(r.getAttribute("data-open"));
          });
          r.addEventListener("keydown", (e) => {
            if (e.key === "Enter") openDrawer(r.getAttribute("data-open"));
          });
        }
      })
      .catch((err) => {
        stateBox(
          st,
          "error",
          err.message || "Не получилось загрузить задачи.",
          loadTasks,
        );
      });
  }
  for (const id of ["f-status", "f-project", "f-prio", "f-over"]) {
    $(id).addEventListener("change", loadTasks);
  }
  let qT = null;
  $("f-q").addEventListener("input", () => {
    clearTimeout(qT);
    qT = setTimeout(loadTasks, 300);
  });
  $("f-reset").addEventListener("click", () => {
    $("f-status").value = "";
    $("f-project").value = "";
    $("f-prio").value = "";
    $("f-q").value = "";
    $("f-over").checked = false;
    loadTasks();
  });

  /* Доска */
  function loadBoard() {
    const st = $("board-state");
    const cols = $("board-cols");
    setHTML(cols, "");
    if (!boardProjectId) {
      stateBox(st, "empty", "Нет доступных проектов.");
      return;
    }
    stateBox(st, "loading");
    api(`/api/projects/${encodeURIComponent(boardProjectId)}/board`)
      .then((d) => {
        const columns = d.columns || [];
        let total = 0;
        for (const c of columns) {
          total += (c.tasks || []).length;
        }
        if (total) stateBox(st, "hide");
        else
          stateBox(
            st,
            "empty",
            "В проекте пока нет задач. Создайте первую кнопкой сверху.",
          );
        setHTML(
          cols,
          columns
            .map(
              (c) =>
                `<div class="min-w-0 bg-slate-100 border rounded flex flex-col" data-col="${esc(c.status)}"><h2 class="font-head text-sm font-semibold p-2 border-b bg-white rounded-t">${esc(c.title)} <span class="num text-slate-500">${esc(String((c.tasks || []).length))}</span></h2><div class="p-2 space-y-2 min-h-24 col-body" data-status="${esc(c.status)}">${(c.tasks || []).map(cardHtml).join("")}</div></div>`,
            )
            .join(""),
        );
        bindCards(cols);
      })
      .catch((err) => {
        stateBox(
          st,
          "error",
          err.message || "Не получилось загрузить доску.",
          loadBoard,
        );
      });
  }
  function cardHtml(t) {
    const dateCls = t.overdue ? "text-red-700 font-semibold" : "text-slate-500";
    const over = t.overdue
      ? `<p class="text-xs text-red-700 font-semibold mt-1">Просрочена</p>`
      : "";
    const file = t.hasAttachments
      ? `<span class="text-xs text-slate-500">файл</span>`
      : "";
    return `<article draggable="true" data-task="${esc(t.id)}" tabindex="0" aria-label="Задача ${esc(t.key)}" class="bg-white border rounded p-2 cursor-grab ${t.overdue ? "card-overdue" : ""}"><p class="num text-xs text-slate-500">${esc(t.key)}</p><p class="text-sm font-medium leading-snug break-words">${esc(t.title)}</p><p class="text-xs text-slate-500 mt-1">Исполнитель: ${esc(t.assignee || "не назначен")}</p><div class="mt-1 flex items-center gap-1 flex-wrap">${prioHtml(t.priority)}<span class="num text-xs ${dateCls}">${esc(fmtDate(t.dueDate))}</span><span class="text-xs text-slate-500 inline-flex items-center gap-1"><svg width="16" height="16" aria-hidden="true"><use href="#i-msg"/></svg><span class="num">${esc(String(t.comments || 0))}</span></span>${file}</div>${over}</article>`;
  }
  function bindCards(root) {
    if (root.dataset.dndReady !== "1") {
      root.dataset.dndReady = "1";
      root.addEventListener("dragover", (e) => e.preventDefault());
      root.addEventListener("drop", (e) => {
        // Сюда попадаем только при промахе в зазор между колонками.
        if (e.target.closest("[data-col]")) return;
        e.preventDefault();
        stateBox(
          $("board-state"),
          "error",
          "Карточка вернулась на место: отпустите её прямо над колонкой.",
          refreshVisible,
        );
      });
    }
    for (const card of root.querySelectorAll("[data-task]")) {
      card.addEventListener("dragstart", (e) => {
        card.classList.add("dragging");
        e.dataTransfer.setData("text/plain", card.getAttribute("data-task"));
        e.dataTransfer.effectAllowed = "move";
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
      });
      card.addEventListener("click", () => {
        openDrawer(card.getAttribute("data-task"));
      });
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter") openDrawer(card.getAttribute("data-task"));
      });
    }
    for (const col of root.querySelectorAll("[data-col]")) {
      const body = col.querySelector(".col-body") || col;
      const status =
        col.getAttribute("data-col") ||
        (body === col ? null : body.getAttribute("data-status"));
      col.addEventListener("dragover", (e) => {
        e.preventDefault();
        try {
          e.dataTransfer.dropEffect = "move";
        } catch {}
        body.classList.add("dnd-over");
      });
      col.addEventListener("dragleave", () => {
        body.classList.remove("dnd-over");
      });
      col.addEventListener("drop", (e) => {
        e.preventDefault();
        body.classList.remove("dnd-over");
        let id = "";
        try {
          id = e.dataTransfer.getData("text/plain");
        } catch {
          id = "";
        }
        if (!id || !status) {
          stateBox(
            $("board-state"),
            "error",
            "Не получилось перенести: отпустите карточку над колонкой.",
            refreshVisible,
          );
          return;
        }
        api(`/api/tasks/${encodeURIComponent(id)}/status`, {
          method: "POST",
          body: { status },
        })
          .then(refreshVisible)
          .catch((err) => {
            stateBox(
              $("board-state"),
              "error",
              `Карточка вернулась на место: ${err.message || "не получилось перенести задачу."}`,
              refreshVisible,
            );
          });
      });
    }
  }

  /* Drawer задачи */
  function row(k, v) {
    return `<p><span class="text-slate-500">${esc(k)}: </span>${v}</p>`;
  }
  function openDrawer(id) {
    openTaskId = id;
    $("drawer-wrap").classList.remove("hidden");
    $("drawer-body").classList.add("hidden");
    stateBox($("drawer-state"), "loading");
    api(`/api/tasks/${encodeURIComponent(id)}`)
      .then((d) => {
        stateBox($("drawer-state"), "hide");
        $("drawer-body").classList.remove("hidden");
        const t = d.task;
        $("d-key").textContent =
          `${t.key}, проект: ${(t.project && t.project.name) || ""}`;
        $("d-title").textContent = t.title;
        const tagRow =
          t.tags && t.tags.length
            ? row("Теги", t.tags.map(esc).join(", "))
            : "";
        let attachRow = "";
        if (t.attachments && t.attachments.length) {
          const links = t.attachments
            .map((a) =>
              a.url
                ? `<a class="text-teal-800 underline" href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title || a.url)}</a>`
                : esc(a.title || ""),
            )
            .join("<br>");
          attachRow = row("Вложения", links);
        }
        const dueRow = `${fmtDate(t.dueDate)}${t.overdue ? " (просрочена)" : ""}`;
        setHTML(
          $("d-meta"),
          row("Статус", STATUS[t.status] || t.status) +
            row("Приоритет", PRIO[t.priority] || t.priority) +
            row(
              "Исполнитель",
              (t.assignee && t.assignee.name) || "не назначен",
            ) +
            row("Постановщик", (t.author && t.author.name) || "") +
            row("Срок", dueRow) +
            row("Создана", fmtDT(t.createdAt)) +
            tagRow +
            attachRow,
        );
        $("d-desc").textContent = t.description || "Описания нет.";
        const canMove =
          d.canEdit || (me && t.assignee && t.assignee.id === me.id);
        const step = $("d-stepper");
        const cur = STATUS_ORDER.indexOf(t.status);
        setHTML(
          step,
          STATUS_ORDER.map((s, i) => {
            let cls = "border btn-ghost";
            if (s === t.status) cls = "btn-primary";
            else if (i < cur) cls = "bg-teal-100 border border-teal-600";
            const dis = canMove ? "" : "disabled";
            const aria = canMove ? "" : ` aria-disabled="true"`;
            return `<li><button data-step="${s}" ${dis} class="btn-touch px-2 text-xs rounded ${cls}"${aria}>${esc(STATUS[s])}</button></li>`;
          }).join(""),
        );
        $("d-stepper-note").textContent = canMove
          ? "Нажмите на этап, чтобы перевести задачу."
          : "Статус меняет исполнитель, постановщик или руководитель. У вас прав нет.";
        for (const b of step.querySelectorAll("[data-step]")) {
          b.addEventListener("click", () => {
            const s = b.getAttribute("data-step");
            b.disabled = true;
            api(`/api/tasks/${encodeURIComponent(t.id)}/status`, {
              method: "POST",
              body: { status: s },
            })
              .then(() => {
                openDrawer(t.id);
                refreshVisible();
              })
              .catch(() => {
                b.disabled = false;
              });
          });
        }
        const comments = d.comments || [];
        const emptyCl = `<li class="text-slate-500">Комментариев пока нет. Напишите первым.</li>`;
        setHTML(
          $("d-comments"),
          comments.length
            ? comments
                .map((c) => {
                  const edited = c.editedAt ? " (изм.)" : "";
                  return `<li class="border rounded p-2"><span class="font-medium">${esc(c.user)}</span> <span class="num text-xs text-slate-400">${esc(fmtDT(c.at))}${edited}</span><p class="mt-1">${esc(c.text)}</p></li>`;
                })
                .join("")
            : emptyCl,
        );
        const hist = d.history || [];
        setHTML(
          $("d-history"),
          hist.length
            ? hist
                .map(
                  (h) =>
                    `<li><span class="font-medium">${esc(h.user)}</span>: ${esc(h.field)}, ${esc(String(h.from == null ? "" : h.from))} → ${esc(String(h.to == null ? "" : h.to))} <span class="num text-xs text-slate-400">${esc(fmtDT(h.at))}</span></li>`,
                )
                .join("")
            : "<li>История пуста.</li>",
        );
        $("d-close").focus();
      })
      .catch((err) => {
        stateBox(
          $("drawer-state"),
          "error",
          err.message || "Не получилось открыть задачу.",
          () => {
            openDrawer(id);
          },
        );
      });
  }
  function closeDrawer() {
    $("drawer-wrap").classList.add("hidden");
    openTaskId = null;
    loadTasksSilent();
  }
  $("d-close").addEventListener("click", closeDrawer);
  $("drawer-back").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("modal-wrap").classList.contains("hidden")) closeModal();
    else if ($("drawer-wrap").classList.contains("hidden"))
      $("bell-panel").classList.add("hidden");
    else closeDrawer();
  });
  $("d-comment-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const inp = $("d-comment-text");
    const text = inp.value.trim();
    $("d-comment-err").classList.add("hidden");
    if (!text) {
      $("d-comment-err").textContent = "Напишите текст комментария.";
      $("d-comment-err").classList.remove("hidden");
      return;
    }
    api(`/api/tasks/${encodeURIComponent(openTaskId)}/comments`, {
      method: "POST",
      body: { text },
    })
      .then(() => {
        inp.value = "";
        openDrawer(openTaskId);
        refreshBell();
      })
      .catch((err) => {
        $("d-comment-err").textContent = err.message;
        $("d-comment-err").classList.remove("hidden");
      });
  });
  function loadTasksSilent() {
    if (!$("page-tasks").classList.contains("hidden")) loadTasks();
    if (!$("page-dashboard").classList.contains("hidden")) loadDashboard();
  }

  /* Команда */
  function loadTeam() {
    const st = $("team-state");
    const tbl = $("team-table");
    const rows = $("team-rows");
    tbl.classList.add("hidden");
    setHTML(rows, "");
    stateBox(st, "loading");
    api("/api/users")
      .then((d) => {
        const list = d.users || [];
        if (!list.length) {
          stateBox(st, "empty", "В команде пока никого нет.");
          return;
        }
        stateBox(st, "hide");
        tbl.classList.remove("hidden");
        setHTML(
          rows,
          list
            .map((u) => {
              const load = u.load || 0;
              const overCls = u.overdueTasks
                ? "text-red-700 font-semibold"
                : "";
              const bar = load >= 80 ? "#B3261E" : "#00A9A5";
              return `<tr class="border-b"><td class="p-2" data-th="Имя"><span class="font-medium">${esc(u.name)}</span><span class="text-xs text-slate-500 block">${esc(u.email || "")}</span></td><td class="p-2" data-th="Должность">${esc(u.position || "")}</td><td class="p-2" data-th="Активные"><span class="num">${esc(String(u.activeTasks || 0))}</span></td><td class="p-2" data-th="Просроченные"><span class="num ${overCls}">${esc(String(u.overdueTasks || 0))}</span></td><td class="p-2" data-th="Загрузка"><span class="block w-full max-w-40 h-2 bg-slate-200 rounded"><span class="block h-2 rounded" style="width:${load}%;background:${bar}"></span></span><span class="num text-xs text-slate-500">${esc(String(load))}%</span></td></tr>`;
            })
            .join(""),
        );
      })
      .catch((err) => {
        stateBox(
          st,
          "error",
          err.message || "Не получилось загрузить команду.",
          loadTeam,
        );
      });
  }

  /* Уведомления */
  function refreshBell() {
    api("/api/notifications")
      .then((d) => {
        const n = d.unread || 0;
        const badge = $("bell-count");
        badge.textContent = String(n);
        badge.classList.toggle("hidden", !n);
        const list = d.notifications || [];
        const items = list.slice(0, 8);
        setHTML(
          $("bell-list"),
          items.length
            ? items
                .map(
                  (x) =>
                    `<li class="border rounded p-2 ${x.read ? "text-slate-500" : ""}">${esc(x.text)}<span class="num text-xs block text-slate-400">${esc(fmtDT(x.at))}</span></li>`,
                )
                .join("")
            : `<li class="text-slate-500">Уведомлений нет.</li>`,
        );
      })
      .catch(() => {});
  }
  /* После любого изменения обновляем все видимые виды, а не только доску:
     иначе правка из drawer видна лишь после ручного перехода по вкладкам. */
  function refreshVisible() {
    refreshBell();
    if (!$("page-dashboard").classList.contains("hidden")) loadDashboard();
    if (!$("page-tasks").classList.contains("hidden")) loadTasks();
    if (!$("page-board").classList.contains("hidden")) loadBoard();
    if (!$("page-team").classList.contains("hidden")) loadTeam();
  }
  function loadNotifs() {
    const st = $("notif-state");
    const list = $("notif-list");
    setHTML(list, "");
    stateBox(st, "loading");
    api("/api/notifications")
      .then((d) => {
        const items = d.notifications || [];
        if (!items.length) {
          stateBox(st, "empty", "Уведомлений нет. Все спокойно.");
          return;
        }
        stateBox(st, "hide");
        setHTML(
          list,
          items
            .map((x) => {
              const derived = String(x.id || "").startsWith("d-");
              const note = derived
                ? " (снимется само, когда закроется причина)"
                : "";
              const dim = x.read ? "opacity-70" : "";
              const go =
                x.taskId && !derived
                  ? `<button data-goto="${esc(x.taskId)}" class="btn-touch px-2 text-sm text-teal-800 underline">Открыть</button>`
                  : "";
              const read =
                !x.read && !derived
                  ? `<button data-read="${esc(x.id)}" class="btn-touch px-3 text-sm border rounded btn-ghost">Прочитано</button>`
                  : "";
              return `<li class="bg-white border rounded p-3 flex items-start gap-2 ${dim}"><div class="flex-1 text-sm"><p>${esc(x.text)}</p><p class="num text-xs text-slate-400">${esc(fmtDT(x.at))}${note}</p></div>${go}${read}</li>`;
            })
            .join(""),
        );
        for (const b of list.querySelectorAll("[data-read]")) {
          b.addEventListener("click", () => {
            b.disabled = true;
            api(
              `/api/notifications/${encodeURIComponent(b.getAttribute("data-read"))}/read`,
              { method: "POST" },
            )
              .then(() => {
                loadNotifs();
                refreshBell();
              })
              .catch(() => {
                b.disabled = false;
              });
          });
        }
        for (const b of list.querySelectorAll("[data-goto]")) {
          b.addEventListener("click", () => {
            openDrawer(b.getAttribute("data-goto"));
          });
        }
        refreshBell();
      })
      .catch((err) => {
        stateBox(
          st,
          "error",
          err.message || "Не получилось загрузить уведомления.",
          loadNotifs,
        );
      });
  }
  $("btn-readall").addEventListener("click", function () {
    this.disabled = true;
    api("/api/notifications/read-all", { method: "POST" })
      .then(() => {
        loadNotifs();
      })
      .catch(() => {})
      .finally(() => {
        $("btn-readall").disabled = false;
      });
  });
  $("btn-bell").addEventListener("click", () => {
    const p = $("bell-panel");
    p.classList.toggle("hidden");
    if (!p.classList.contains("hidden")) refreshBell();
  });
  $("bell-goto").addEventListener("click", () => {
    nav("notifs");
  });

  /* Создание задачи */
  function openModal() {
    $("modal-wrap").classList.remove("hidden");
    $("create-form").classList.remove("hidden");
    $("project-form").classList.add("hidden");
    $("c-form-err").classList.add("hidden");
    if (!$("c-project").options.length) fillProjectSelects();
    $("c-title").focus();
  }
  function openProjectModal() {
    $("modal-wrap").classList.remove("hidden");
    $("create-form").classList.add("hidden");
    $("project-form").classList.remove("hidden");
    $("p-form-err").classList.add("hidden");
    const lead = $("p-lead");
    setHTML(
      lead,
      (usersCache || [])
        .map(
          (u) =>
            `<option value="${esc(u.id)}">${esc(u.name)} (${esc(ROLE_SHORT[u.role] || u.role)})</option>`,
        )
        .join(""),
    );
    if (me) lead.value = me.id;
    setHTML(
      $("p-members"),
      (usersCache || [])
        .map(
          (u) =>
            `<label class="flex items-center gap-2 text-sm btn-touch"><input type="checkbox" value="${esc(u.id)}" class="w-5 h-5 accent-teal-700"${u.id === (me && me.id) ? " checked" : ""}> ${esc(u.name)}</label>`,
        )
        .join("") || `<p class="text-sm text-slate-500">Нет пользователей.</p>`,
    );
    $("p-name").focus();
  }
  function closeModal() {
    $("modal-wrap").classList.add("hidden");
  }
  $("btn-create").addEventListener("click", openModal);
  for (const b of document.querySelectorAll(".btn-project-new")) {
    b.addEventListener("click", () => {
      if (!me || me.role !== "admin") return;
      openProjectModal();
    });
  }
  for (const b of document.querySelectorAll("[data-close-modal]")) {
    b.addEventListener("click", closeModal);
  }
  function fieldErr(id, msg) {
    const el = document.querySelector(`[data-err="${id}"]`);
    if (!el) return;
    if (!msg) {
      el.classList.add("hidden");
      el.textContent = "";
      return;
    }
    el.textContent = msg;
    el.classList.remove("hidden");
  }
  $("create-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const title = $("c-title").value.trim();
    const projectId = $("c-project").value;
    fieldErr("c-title", title ? "" : "Введите название задачи.");
    fieldErr("c-project", projectId ? "" : "Выберите проект.");
    $("c-form-err").classList.add("hidden");
    if (!title || !projectId) return;
    const due = $("c-due").value
      ? new Date(`${$("c-due").value}T12:00:00.000Z`).toISOString()
      : null;
    const tags = $("c-tags")
      .value.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const body = {
      title,
      projectId,
      assigneeId: $("c-assignee").value || null,
      priority: $("c-prio").value,
      dueDate: due,
      description: $("c-desc").value.trim(),
      tags,
    };
    const btn = $("c-submit");
    btn.disabled = true;
    btn.textContent = "Создаем...";
    api("/api/tasks", { method: "POST", body })
      .then(() => {
        closeModal();
        $("c-title").value = "";
        $("c-desc").value = "";
        $("c-tags").value = "";
        $("c-due").value = "";
        refreshBell();
        if (!$("page-board").classList.contains("hidden")) loadBoard();
        else if ($("page-tasks").classList.contains("hidden")) nav("tasks");
        else loadTasks();
      })
      .catch((err) => {
        const m = $("c-form-err");
        m.textContent = err.message || "Не получилось создать задачу.";
        m.classList.remove("hidden");
      })
      .finally(() => {
        btn.disabled = false;
        btn.textContent = "Создать задачу";
      });
  });

  $("project-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("p-name").value.trim();
    fieldErr("p-name", name ? "" : "Введите название проекта.");
    $("p-form-err").classList.add("hidden");
    if (!name) return;
    const memberIds = [...$("p-members").querySelectorAll("input:checked")].map(
      (c) => c.value,
    );
    const body = {
      name,
      description: $("p-desc").value.trim(),
      leadId: $("p-lead").value || undefined,
      memberIds,
      status: $("p-status").value,
      startDate: $("p-start").value
        ? new Date(`${$("p-start").value}T12:00:00.000Z`).toISOString()
        : undefined,
      dueDate: $("p-due").value
        ? new Date(`${$("p-due").value}T12:00:00.000Z`).toISOString()
        : undefined,
    };
    const btn = $("p-submit");
    btn.disabled = true;
    btn.textContent = "Создаем...";
    api("/api/projects", { method: "POST", body })
      .then((d) => {
        closeModal();
        $("p-name").value = "";
        $("p-desc").value = "";
        $("p-start").value = "";
        $("p-due").value = "";
        return api("/api/projects").then((all) => {
          projectsCache = all.projects || [];
          fillProjectSelects();
          fillAssigneeSelect();
          if (d && d.project) {
            boardProjectId = d.project.id;
            $("board-project").value = boardProjectId;
          }
          refreshVisible();
        });
      })
      .catch((err) => {
        const box = $("p-form-err");
        box.textContent = err.message || "Не получилось создать проект.";
        box.classList.remove("hidden");
      })
      .finally(() => {
        btn.disabled = false;
        btn.textContent = "Создать проект";
      });
  });

  /* Глобальный поиск */
  let sT = null;
  $("global-search").addEventListener("input", function () {
    clearTimeout(sT);
    const q = this.value.trim();
    const box = $("search-results");
    if (q.length < 2) {
      setHTML(box, "");
      box.classList.add("hidden");
      return;
    }
    sT = setTimeout(() => {
      api(`/api/search?q=${encodeURIComponent(q)}`)
        .then((d) => {
          const parts = [];
          for (const p of d.projects || [])
            parts.push(
              `<button data-b="${esc(p.id)}" class="block w-full text-left px-2 py-2 hover:bg-slate-100 btn-touch">Проект: ${esc(p.name)}</button>`,
            );
          for (const t of d.tasks || [])
            parts.push(
              `<button data-o="${esc(t.id)}" class="block w-full text-left px-2 py-2 hover:bg-slate-100 btn-touch"><span class="num text-xs text-slate-500">${esc(t.key)}</span> ${esc(t.title)}</button>`,
            );
          for (const u of d.users || [])
            parts.push(
              `<span class="block px-2 py-2 text-slate-600">Человек: ${esc(u.name)}</span>`,
            );
          setHTML(
            box,
            parts.join("") ||
              `<p class="p-2 text-slate-500">Ничего нет. Попробуйте ключ задачи, например NDS-103.</p>`,
          );
          box.classList.remove("hidden");
          for (const b of box.querySelectorAll("[data-o]")) {
            b.addEventListener("click", () => {
              box.classList.add("hidden");
              openDrawer(b.getAttribute("data-o"));
            });
          }
          for (const b of box.querySelectorAll("[data-b]")) {
            b.addEventListener("click", () => {
              box.classList.add("hidden");
              boardProjectId = b.getAttribute("data-b");
              $("board-project").value = boardProjectId;
              nav("board");
            });
          }
        })
        .catch(() => {});
    }, 300);
  });
  document.addEventListener("click", (e) => {
    if (
      !e.target.closest("#global-search") &&
      !e.target.closest("#search-results")
    )
      $("search-results").classList.add("hidden");
    if (!e.target.closest("#bell-panel") && !e.target.closest("#btn-bell"))
      $("bell-panel").classList.add("hidden");
  });

  showLogin();
})();

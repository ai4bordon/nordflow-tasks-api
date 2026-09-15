// NordFlow Tasks — ядро приложения: домен, права доступа и API.
// Чистые функции без HTTP: сервер (server.js) только передаёт сюда запросы.
// Так ядро тестируется напрямую, без поднятия порта.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const STATUSES = ['backlog', 'planned', 'in_progress', 'review', 'done'];
export const STATUS_TITLES = {
  backlog: 'Бэклог',
  planned: 'Запланировано',
  in_progress: 'В работе',
  review: 'На проверке',
  done: 'Выполнено',
};
export const PRIORITIES = ['low', 'medium', 'high', 'critical'];
export const PROJECT_STATUSES = ['planning', 'active', 'paused', 'done', 'archived'];
export const ROLES = ['admin', 'pm', 'employee'];

const DAY = 24 * 60 * 60 * 1000;

// ---------- служебное ----------

function hashPassword(password) {
  const salt = randomBytes(8).toString('hex');
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}

function checkPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 32);
  return candidate.length === Buffer.from(hash, 'hex').length
    && timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

const now = () => new Date().toISOString();
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Демонстрационные данные по ТЗ, п. 23: 8 пользователей, 3 проекта, 25+ задач. */
export function demoData(today = new Date()) {
  const day = (shift) => new Date(startOfDay(today).getTime() + shift * DAY).toISOString();
  const users = [
    { id: 'u1', name: 'Анна Волкова', position: 'Операционный директор', email: 'anna@nordflow.io', role: 'admin' },
    { id: 'u2', name: 'Максим Орлов', position: 'Руководитель проекта', email: 'maxim@nordflow.io', role: 'pm' },
    { id: 'u3', name: 'Елена Соколова', position: 'Дизайнер', email: 'elena@nordflow.io', role: 'employee' },
    { id: 'u4', name: 'Илья Морозов', position: 'Frontend-разработчик', email: 'ilya@nordflow.io', role: 'employee' },
    { id: 'u5', name: 'Виктор Лебедев', position: 'Backend-разработчик', email: 'viktor@nordflow.io', role: 'employee' },
    { id: 'u6', name: 'Ольга Крылова', position: 'Маркетолог', email: 'olga@nordflow.io', role: 'employee' },
    { id: 'u7', name: 'Дмитрий Фролов', position: 'Тестировщик', email: 'dmitry@nordflow.io', role: 'employee' },
    { id: 'u8', name: 'Мария Белова', position: 'Аналитик', email: 'maria@nordflow.io', role: 'employee' },
  ].map((u) => ({ ...u, password: hashPassword('nordflow'), theme: 'light', createdAt: day(-120) }));

  const projects = [
    { id: 'p1', key: 'NDS', name: 'Сайт для клиента «GreenStone»', description: 'Корпоративный сайт: дизайн, вёрстка, интеграция с CRM.', status: 'active', leadId: 'u2', memberIds: ['u2', 'u3', 'u4', 'u7'], startDate: day(-30), dueDate: day(25), allowEmployeeTasks: true, createdAt: day(-30) },
    { id: 'p2', key: 'NDA', name: 'Запуск рекламной кампании NordFlow', description: 'Кампания на осень: стратегия, креативы, аналитика.', status: 'active', leadId: 'u2', memberIds: ['u2', 'u6', 'u8'], startDate: day(-14), dueDate: day(14), allowEmployeeTasks: false, createdAt: day(-14) },
    { id: 'p3', key: 'NDI', name: 'Внутренняя автоматизация отдела продаж', description: 'CRM-модуль, интеграции, отчёты по воронке.', status: 'planning', leadId: 'u1', memberIds: ['u1', 'u5', 'u8', 'u7'], startDate: day(-7), dueDate: day(45), allowEmployeeTasks: true, createdAt: day(-7) },
  ];

  const spec = [
    ['Собрать структуру страниц и прототип', 'p1', 'u3', 'in_progress', 'high', -3, 2],
    ['Дизайн главной страницы', 'p1', 'u3', 'review', 'high', -6, 1],
    ['Вёрстка блока «Услуги»', 'p1', 'u4', 'in_progress', 'medium', -2, 3],
    ['Подключить форму заявки к CRM', 'p1', 'u4', 'planned', 'high', -1, 6],
    ['SEO-разметка и метатеги', 'p1', 'u2', 'backlog', 'low', -5, 12],
    ['Тестирование вёрстки на мобильных', 'p1', 'u7', 'backlog', 'medium', -4, -1],
    ['Настроить сборку и деплой', 'p1', 'u5', 'done', 'medium', -20, -8],
    ['Согласовать тексты с клиентом', 'p1', 'u2', 'done', 'low', -18, -10],
    ['Аудит конкурентов и позиционирование', 'p2', 'u6', 'done', 'high', -12, -5],
    ['Медиаплан на 3 месяца', 'p2', 'u6', 'in_progress', 'high', -5, 4],
    ['Креативы для соцсетей', 'p2', 'u3', 'in_progress', 'medium', -2, 5],
    ['Настройка пикселей и целей', 'p2', 'u8', 'planned', 'high', -1, 7],
    ['Отчёт по первым неделям', 'p2', 'u8', 'backlog', 'medium', -3, 20],
    ['Согласовать бюджет кампании', 'p2', 'u2', 'review', 'critical', -7, -2],
    ['Собрать требования отдела продаж', 'p3', 'u8', 'in_progress', 'high', -6, 3],
    ['Схема данных CRM-модуля', 'p3', 'u5', 'planned', 'critical', -4, 5],
    ['Интеграция с телефонией', 'p3', 'u5', 'backlog', 'high', -3, 18],
    ['Отчёты по воронке продаж', 'p3', 'u8', 'backlog', 'medium', -2, 22],
    ['Перенести историю сделок', 'p3', 'u5', 'planned', 'low', -1, 15],
    ['Приёмочное тестирование модуля', 'p3', 'u7', 'backlog', 'high', -1, 30],
    ['Обновить регламент работы с лидами', 'p3', 'u1', 'backlog', 'low', -10, -4],
    ['Свести правки после демо', 'p1', 'u3', 'planned', 'medium', -2, 4],
    ['Проверить доступность и скорость', 'p1', 'u7', 'backlog', 'medium', -2, 9],
    ['Подготовить инструкцию для менеджеров', 'p3', 'u2', 'backlog', 'low', -1, 25],
    ['Зафиксировать метрики кампании', 'p2', 'u6', 'in_progress', 'high', -1, -3],
  ];

  const statuses = STATUSES;
  const tasks = [];
  const history = [];
  const comments = [];
  let n = 0;
  for (const [title, projectId, assigneeId, status, priority, createdShift, dueShift] of spec) {
    n += 1;
    const project = projects.find((p) => p.id === projectId);
    const id = `t${n}`;
    const authorId = project.leadId;
    tasks.push({
      id,
      key: `${project.key}-${100 + n}`,
      title,
      description: `${title}. Демонстрационная задача проекта «${project.name}».`,
      projectId,
      status: statuses.includes(status) ? status : 'backlog',
      priority,
      assigneeId,
      authorId,
      tags: n % 3 === 0 ? ['важное'] : [],
      attachments: n % 4 === 0 ? [{ title: 'Макет в Figma', url: 'https://figma.com/file/demo' }] : [],
      createdAt: day(createdShift),
      dueDate: day(dueShift),
      updatedAt: day(createdShift + 1),
    });
    history.push({ id: `h${n}-1`, taskId: id, userId: authorId, at: day(createdShift), field: 'created', from: null, to: 'задача создана' });
    if (status !== 'backlog') {
      history.push({ id: `h${n}-2`, taskId: id, userId: assigneeId, at: day(createdShift + 1), field: 'status', from: 'backlog', to: status });
    }
    if (n % 4 === 0) {
      comments.push({
        id: `c${n}`,
        taskId: id,
        userId: assigneeId,
        text: 'Взял в работу, вернусь с результатом к концу недели.',
        at: day(createdShift + 2),
      });
    }
  }

  return {
    users,
    projects,
    tasks,
    comments,
    history,
    sessions: {},
    notifications: [
      { id: 'n1', userId: 'u4', taskId: 't3', type: 'assigned', text: 'Вам назначена задача NDS-103', at: day(-1), read: false },
      { id: 'n2', userId: 'u4', taskId: 't6', type: 'overdue', text: 'Задача NDS-106 просрочена', at: day(-1), read: false },
      { id: 'n3', userId: 'u6', taskId: 't10', type: 'status', text: 'Задача NDA-110 переведена в работу', at: day(-2), read: true },
    ],
  };
}

/** Хранилище: держит состояние в памяти и сохраняет в JSON-файл (опционально). */
export function createStore(initial, { file = null, fs = null } = {}) {
  let state = initial;
  const save = () => {
    if (file && fs) fs.writeFileSync(file, JSON.stringify(state, null, 2));
  };
  return {
    get state() {
      return state;
    },
    replace(next) {
      state = next;
      save();
    },
    save,
  };
}

// ---------- права доступа ----------

const isAdmin = (user) => user.role === 'admin';
const isPm = (user) => user.role === 'pm';
const isMember = (user, project) => Boolean(project) && (project.memberIds.includes(user.id) || project.leadId === user.id);
const leadsProject = (user, project) => Boolean(project) && project.leadId === user.id;
const canSeeProject = (user, project) => isAdmin(user) || isMember(user, project);
const canManageProject = (user, project) => isAdmin(user) || leadsProject(user, project);
const canEditTask = (user, task, project) => isAdmin(user) || canManageProject(user, project) || task.authorId === user.id;
const canMoveTask = (user, task, project) => canEditTask(user, task, project) || task.assigneeId === user.id;

/** Уведомление в приложении (ТЗ, п. 17). */
function notify(state, userId, taskId, type, text) {
  state.notifications.push({ id: `n${state.notifications.length + 1}-${Date.now()}`, userId, taskId, type, text, at: now(), read: false });
}

function writeHistory(state, taskId, userId, field, from, to) {
  state.history.push({ id: `h${state.history.length + 1}-${Date.now()}`, taskId, userId, at: now(), field, from, to });
}

const publicUser = (u) => ({ id: u.id, name: u.name, position: u.position, email: u.email, role: u.role, theme: u.theme, photo: u.photo ?? null });
/** Поиск не должен спотыкаться о «ё»: «верстк» находит «Вёрстка». */
const norm = (value) => String(value ?? '').toLowerCase().replace(/ё/g, 'е');
const daysLeft = (due, today) => Math.ceil((startOfDay(new Date(due)) - startOfDay(today)) / DAY);

/** Загрузка сотрудника: активные, просроченные и доля загрузки от 10 задач. */
function userLoad(state, userId, today) {
  const own = state.tasks.filter((t) => t.assigneeId === userId && t.status !== 'done');
  const overdue = own.filter((t) => daysLeft(t.dueDate, today) < 0);
  return { activeTasks: own.length, overdueTasks: overdue.length, load: Math.min(100, Math.round((own.length / 10) * 100)) };
}

// ---------- приложение ----------

export function createApp({ store, today = () => new Date() }) {
  const state = () => store.state;

  const error = (status, message) => ({ status, body: { error: message } });

  function userByToken(token) {
    const s = state();
    const userId = s.sessions[token];
    return userId ? s.users.find((u) => u.id === userId) ?? null : null;
  }

  function visibleProjects(user) {
    const s = state();
    return isAdmin(user) ? s.projects : s.projects.filter((p) => canSeeProject(user, p));
  }

  const projectStats = (project, day) => {
    const tasks = state().tasks.filter((t) => t.projectId === project.id);
    return {
      openTasks: tasks.filter((t) => t.status !== 'done').length,
      totalTasks: tasks.length,
      overdueTasks: tasks.filter((t) => t.status !== 'done' && daysLeft(t.dueDate, day) < 0).length,
      members: project.memberIds.length,
    };
  };

  // ---------- маршруты ----------
  const routes = [];
  const route = (method, pattern, handler, options = {}) => {
    const parts = pattern.split('/').filter(Boolean);
    routes.push({ method, parts, handler, options });
  };

  function dispatch(method, path, { body = {}, token = null } = {}) {
    const clean = path.split('?')[0];
    const query = Object.fromEntries(new URLSearchParams(path.includes('?') ? path.split('?')[1] : ''));
    const parts = clean.split('/').filter(Boolean);
    for (const r of routes) {
      if (r.method !== method || r.parts.length !== parts.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < r.parts.length; i += 1) {
        if (r.parts[i].startsWith(':')) params[r.parts[i].slice(1)] = decodeURIComponent(parts[i]);
        else if (r.parts[i] !== parts[i]) { ok = false; break; }
      }
      if (!ok) continue;
      const user = token ? userByToken(token) : null;
      if (!r.options.public && !user) return error(401, 'Требуется авторизация');
      return r.handler({ params, query, body, user, token });
    }
    return error(404, 'Маршрут не найден');
  }

  // ---------- авторизация (ТЗ, п. 7) ----------
  route('POST', '/api/login', ({ body }) => {
    const s = state();
    const user = s.users.find((u) => u.email.toLowerCase() === String(body.email || '').toLowerCase());
    if (!user || !checkPassword(String(body.password || ''), user.password)) {
      return error(401, 'Неверная почта или пароль');
    }
    const token = randomBytes(16).toString('hex');
    s.sessions[token] = user.id;
    store.save();
    return { status: 200, body: { token, user: publicUser(user) } };
  }, { public: true });

  route('POST', '/api/logout', ({ token }) => {
    const s = state();
    delete s.sessions[token];
    store.save();
    return { status: 200, body: { ok: true } };
  });

  /** Сессия живёт в хранилище — после обновления страницы пользователь остаётся в системе. */
  route('GET', '/api/me', ({ user }) => ({ status: 200, body: { user: publicUser(user) } }));

  // ---------- пользователи и команда (ТЗ, п. 18, 19) ----------
  route('GET', '/api/users', ({ user }) => {
    const day = today();
    return {
      status: 200,
      body: {
        users: state().users.map((u) => ({
          ...publicUser(u),
          initials: u.name.split(' ').map((w) => w[0]).join('').slice(0, 2),
          ...userLoad(state(), u.id, day),
        })),
        canManage: isAdmin(user),
      },
    };
  });

  route('POST', '/api/users', ({ body, user }) => {
    if (!isAdmin(user)) return error(403, 'Пользователей создаёт администратор');
    const s = state();
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim();
    const role = ROLES.includes(body.role) ? body.role : 'employee';
    if (!name || !email) return error(400, 'Нужны имя и почта');
    if (s.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) return error(409, 'Такая почта уже занята');
    const created = {
      id: `u${s.users.length + 1}`,
      name,
      email,
      role,
      position: String(body.position || '').trim(),
      password: hashPassword(String(body.password || 'nordflow')),
      theme: 'light',
      createdAt: now(),
    };
    s.users.push(created);
    store.save();
    return { status: 201, body: { user: publicUser(created) } };
  });

  route('PATCH', '/api/users/:id', ({ params, body, user }) => {
    const s = state();
    const target = s.users.find((u) => u.id === params.id);
    if (!target) return error(404, 'Пользователь не найден');
    const own = target.id === user.id;
    if (!isAdmin(user) && !own) return error(403, 'Можно править только свой профиль');
    // Почту и роль меняет только администратор (ТЗ, п. 19).
    if (!isAdmin(user) && (body.email !== undefined || body.role !== undefined)) {
      return error(403, 'Почту и роль меняет администратор');
    }
    if (body.name !== undefined) target.name = String(body.name).trim() || target.name;
    if (body.position !== undefined) target.position = String(body.position).trim();
    if (body.theme !== undefined && ['light', 'dark'].includes(body.theme)) target.theme = body.theme;
    if (body.photo !== undefined) target.photo = String(body.photo);
    if (body.password) target.password = hashPassword(String(body.password));
    if (isAdmin(user)) {
      if (body.email !== undefined) target.email = String(body.email).trim();
      if (body.role !== undefined && ROLES.includes(body.role)) target.role = body.role;
    }
    store.save();
    return { status: 200, body: { user: publicUser(target) } };
  });

  route('DELETE', '/api/users/:id', ({ params, user }) => {
    if (!isAdmin(user)) return error(403, 'Удалять пользователей может администратор');
    const s = state();
    if (params.id === user.id) return error(400, 'Нельзя удалить себя');
    s.users = s.users.filter((u) => u.id !== params.id);
    for (const t of s.tasks) {
      if (t.assigneeId === params.id) t.assigneeId = null;
    }
    for (const p of s.projects) {
      p.memberIds = p.memberIds.filter((id) => id !== params.id);
    }
    store.save();
    return { status: 200, body: { ok: true } };
  });

  // ---------- проекты (ТЗ, п. 10–12) ----------
  route('GET', '/api/projects', ({ user, query }) => {
    const day = today();
    let list = visibleProjects(user);
    if (query.status) list = list.filter((p) => p.status === query.status);
    if (query.q) {
      const needle = norm(query.q);
      list = list.filter((p) => norm(p.name).includes(needle));
    }
    return {
      status: 200,
      body: {
        projects: list.map((p) => ({
          ...p,
          lead: publicUser(state().users.find((u) => u.id === p.leadId) ?? { id: null, name: '—', position: '', email: '', role: '' }),
          ...projectStats(p, day),
        })),
        canCreate: isAdmin(user),
      },
    };
  });

  route('POST', '/api/projects', ({ body, user }) => {
    if (!isAdmin(user)) return error(403, 'Создавать проекты может администратор');
    const s = state();
    const name = String(body.name || '').trim();
    if (!name) return error(400, 'Нужно название проекта');
    const project = {
      id: `p${s.projects.length + 1}`,
      key: String(body.key || name.slice(0, 3)).toUpperCase().slice(0, 4),
      name,
      description: String(body.description || ''),
      status: PROJECT_STATUSES.includes(body.status) ? body.status : 'planning',
      leadId: body.leadId || user.id,
      memberIds: Array.from(new Set([body.leadId || user.id, ...(body.memberIds || [])].filter(Boolean))),
      startDate: body.startDate || now(),
      dueDate: body.dueDate || null,
      allowEmployeeTasks: Boolean(body.allowEmployeeTasks),
      createdAt: now(),
    };
    s.projects.push(project);
    store.save();
    return { status: 201, body: { project } };
  });

  route('GET', '/api/projects/:id', ({ params, user }) => {
    const s = state();
    const project = s.projects.find((p) => p.id === params.id);
    if (!project) return error(404, 'Проект не найден');
    if (!canSeeProject(user, project)) return error(403, 'Нет доступа к проекту');
    const day = today();
    return {
      status: 200,
      body: {
        project: {
          ...project,
          lead: publicUser(s.users.find((u) => u.id === project.leadId) ?? { id: null, name: '—' }),
          members: project.memberIds.map((id) => publicUser(s.users.find((u) => u.id === id) ?? { id, name: '—' })),
          ...projectStats(project, day),
        },
        canManage: canManageProject(user, project),
      },
    };
  });

  route('PATCH', '/api/projects/:id', ({ params, body, user }) => {
    const s = state();
    const project = s.projects.find((p) => p.id === params.id);
    if (!project) return error(404, 'Проект не найден');
    if (!canManageProject(user, project)) return error(403, 'Нет прав на изменение проекта');
    for (const field of ['name', 'description', 'startDate', 'dueDate']) {
      if (body[field] !== undefined) project[field] = body[field];
    }
    if (body.status && PROJECT_STATUSES.includes(body.status)) project.status = body.status;
    if (body.allowEmployeeTasks !== undefined) project.allowEmployeeTasks = Boolean(body.allowEmployeeTasks);
    if (body.leadId && isAdmin(user)) project.leadId = body.leadId;
    if (body.memberIds && Array.isArray(body.memberIds)) project.memberIds = Array.from(new Set(body.memberIds));
    store.save();
    return { status: 200, body: { project } };
  });

  route('POST', '/api/projects/:id/archive', ({ params, user }) => {
    const s = state();
    const project = s.projects.find((p) => p.id === params.id);
    if (!project) return error(404, 'Проект не найден');
    if (!isAdmin(user)) return error(403, 'Архивирует проекты администратор');
    project.status = 'archived';
    store.save();
    return { status: 200, body: { project } };
  });

  route('POST', '/api/projects/:id/members', ({ params, body, user }) => {
    const s = state();
    const project = s.projects.find((p) => p.id === params.id);
    if (!project) return error(404, 'Проект не найден');
    if (!canManageProject(user, project)) return error(403, 'Добавлять участников может руководитель проекта');
    const userId = String(body.userId || '');
    if (!s.users.some((u) => u.id === userId)) return error(404, 'Пользователь не найден');
    if (!project.memberIds.includes(userId)) project.memberIds.push(userId);
    store.save();
    return { status: 200, body: { project } };
  });

  route('DELETE', '/api/projects/:id/members/:userId', ({ params, user }) => {
    const s = state();
    const project = s.projects.find((p) => p.id === params.id);
    if (!project) return error(404, 'Проект не найден');
    if (!canManageProject(user, project)) return error(403, 'Убирать участников может руководитель проекта');
    project.memberIds = project.memberIds.filter((id) => id !== params.userId);
    store.save();
    return { status: 200, body: { project } };
  });

  // ---------- задачи (ТЗ, п. 9, 13–15) ----------
  route('GET', '/api/tasks', ({ user, query }) => {
    const s = state();
    const day = today();
    let list = s.tasks.filter((t) => {
      const project = s.projects.find((p) => p.id === t.projectId);
      return canSeeProject(user, project) && (isAdmin(user) || canManageProject(user, project) || t.assigneeId === user.id || t.authorId === user.id);
    });
    if (query.scope === 'my') list = list.filter((t) => t.assigneeId === user.id);
    if (query.projectId) list = list.filter((t) => t.projectId === query.projectId);
    if (query.status) list = list.filter((t) => t.status === query.status);
    if (query.priority) list = list.filter((t) => t.priority === query.priority);
    if (query.assigneeId) list = list.filter((t) => t.assigneeId === query.assigneeId);
    if (query.overdue === '1') list = list.filter((t) => t.status !== 'done' && daysLeft(t.dueDate, day) < 0);
    if (query.due === 'week') list = list.filter((t) => t.status !== 'done' && daysLeft(t.dueDate, day) >= 0 && daysLeft(t.dueDate, day) <= 7);
    if (query.q) {
      const needle = norm(query.q);
      list = list.filter((t) => norm(t.title).includes(needle) || norm(t.key).includes(needle));
    }
    return {
      status: 200,
      body: {
        tasks: list.map((t) => ({
          ...t,
          overdue: t.status !== 'done' && daysLeft(t.dueDate, day) < 0,
          daysLeft: daysLeft(t.dueDate, day),
          comments: s.comments.filter((c) => c.taskId === t.id).length,
          project: s.projects.find((p) => p.id === t.projectId)?.name ?? null,
          assignee: s.users.find((u) => u.id === t.assigneeId)?.name ?? null,
          author: s.users.find((u) => u.id === t.authorId)?.name ?? null,
        })),
        total: list.length,
      },
    };
  });

  route('POST', '/api/tasks', ({ body, user }) => {
    const s = state();
    const project = s.projects.find((p) => p.id === body.projectId);
    if (!project) return error(400, 'Задача должна быть привязана к проекту');
    if (!canSeeProject(user, project)) return error(403, 'Нет доступа к проекту');
    const mayCreate = isAdmin(user) || canManageProject(user, project) || (project.allowEmployeeTasks && project.memberIds.includes(user.id));
    if (!mayCreate) return error(403, 'В этом проекте сотрудники не создают задачи');
    const title = String(body.title || '').trim();
    if (!title) return error(400, 'Нужно название задачи');
    const status = STATUSES.includes(body.status) ? body.status : 'backlog';
    const priority = PRIORITIES.includes(body.priority) ? body.priority : 'medium';
    if (!body.assigneeId && status === 'in_progress') return error(400, 'Для статуса «В работе» нужен исполнитель');
    const num = s.tasks.filter((t) => t.projectId === project.id).length + 101;
    const task = {
      id: `t${s.tasks.length + 1}`,
      key: `${project.key}-${num}`,
      title,
      description: String(body.description || ''),
      projectId: project.id,
      status,
      priority,
      assigneeId: body.assigneeId || null,
      authorId: user.id,
      tags: Array.isArray(body.tags) ? body.tags : [],
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
      createdAt: now(),
      dueDate: body.dueDate || null,
      updatedAt: now(),
    };
    s.tasks.push(task);
    writeHistory(s, task.id, user.id, 'created', null, 'задача создана');
    if (task.assigneeId) notify(s, task.assigneeId, task.id, 'assigned', `Вам назначена задача ${task.key}`);
    store.save();
    return { status: 201, body: { task } };
  });

  route('GET', '/api/tasks/:id', ({ params, user }) => {
    const s = state();
    const task = s.tasks.find((t) => t.id === params.id || t.key === params.id);
    if (!task) return error(404, 'Задача не найдена');
    const project = s.projects.find((p) => p.id === task.projectId);
    if (!canSeeProject(user, project)) return error(403, 'Нет доступа к задаче');
    return {
      status: 200,
      body: {
        task: {
          ...task,
          overdue: task.status !== 'done' && daysLeft(task.dueDate, today()) < 0,
          project: { id: project.id, name: project.name },
          assignee: task.assigneeId ? publicUser(s.users.find((u) => u.id === task.assigneeId)) : null,
          author: publicUser(s.users.find((u) => u.id === task.authorId)),
        },
        comments: s.comments.filter((c) => c.taskId === task.id).map((c) => ({
          ...c,
          user: s.users.find((u) => u.id === c.userId)?.name ?? '—',
          canDelete: isAdmin(user) || c.userId === user.id,
        })),
        history: s.history.filter((h) => h.taskId === task.id).map((h) => ({
          ...h,
          user: s.users.find((u) => u.id === h.userId)?.name ?? '—',
          statusTitle: STATUS_TITLES[h.to] ?? h.to,
        })).toReversed(),
        canEdit: canEditTask(user, task, project),
      },
    };
  });

  route('PATCH', '/api/tasks/:id', ({ params, body, user }) => {
    const s = state();
    const task = s.tasks.find((t) => t.id === params.id || t.key === params.id);
    if (!task) return error(404, 'Задача не найдена');
    const project = s.projects.find((p) => p.id === task.projectId);
    const mayEditFields = canEditTask(user, task, project);
    const mayMove = canMoveTask(user, task, project);
    if (!mayEditFields && !mayMove) return error(403, 'Нет прав на изменение задачи');
    const touchesFields = ['title', 'description', 'priority', 'tags', 'attachments', 'dueDate', 'assigneeId', 'projectId']
      .some((field) => body[field] !== undefined);
    if (touchesFields && !mayEditFields) return error(403, 'Поля задачи правит автор или руководитель проекта');
    if (body.title !== undefined) task.title = String(body.title).trim() || task.title;
    if (body.description !== undefined) task.description = String(body.description);
    if (body.priority !== undefined && PRIORITIES.includes(body.priority)) task.priority = body.priority;
    if (body.tags !== undefined && Array.isArray(body.tags)) task.tags = body.tags;
    if (body.attachments !== undefined && Array.isArray(body.attachments)) task.attachments = body.attachments;
    if (body.dueDate !== undefined) {
      if (task.dueDate !== body.dueDate) {
        writeHistory(s, task.id, user.id, 'dueDate', task.dueDate, body.dueDate);
        if (task.assigneeId) notify(s, task.assigneeId, task.id, 'due', `Изменён срок задачи ${task.key}`);
      }
      task.dueDate = body.dueDate;
    }
    if (body.assigneeId !== undefined && body.assigneeId !== task.assigneeId) {
      const previous = task.assigneeId;
      task.assigneeId = body.assigneeId || null;
      writeHistory(s, task.id, user.id, 'assigneeId', previous, body.assigneeId);
      if (task.assigneeId) notify(s, task.assigneeId, task.id, 'assigned', `Вам назначена задача ${task.key}`);
    }
    if (body.projectId !== undefined && body.projectId !== task.projectId) {
      const next = s.projects.find((p) => p.id === body.projectId);
      if (!next) return error(400, 'Проект не найден');
      if (!canSeeProject(user, next)) return error(403, 'Нет доступа к новому проекту');
      task.projectId = next.id;
      task.key = `${next.key}-${task.key.split('-')[1] ?? '000'}`;
    }
    if (body.status !== undefined && STATUSES.includes(body.status) && body.status !== task.status) {
      const was = task.status;
      if (!mayMove) return error(403, 'Менять статус может исполнитель или руководитель');
      task.status = body.status;
      writeHistory(s, task.id, user.id, 'status', was, body.status);
      if (task.assigneeId && task.assigneeId !== user.id) notify(s, task.assigneeId, task.id, 'status', `Задача ${task.key}: ${STATUS_TITLES[body.status]}`);
    }
    task.updatedAt = now();
    store.save();
    return { status: 200, body: { task } };
  });

  /** Перемещение карточки на Kanban-доске (ТЗ, п. 12). */
  route('POST', '/api/tasks/:id/status', ({ params, body, user }) => {
    const s = state();
    const task = s.tasks.find((t) => t.id === params.id || t.key === params.id);
    if (!task) return error(404, 'Задача не найдена');
    const project = s.projects.find((p) => p.id === task.projectId);
    if (!canSeeProject(user, project)) return error(403, 'Нет доступа к задаче');
    if (!STATUSES.includes(body.status)) return error(400, 'Неизвестный статус');
    if (!canMoveTask(user, task, project)) return error(403, 'Менять статус может исполнитель или руководитель');
    if (body.status !== task.status) {
      const was = task.status;
      task.status = body.status;
      task.updatedAt = now();
      writeHistory(s, task.id, user.id, 'status', was, body.status);
      if (task.assigneeId && task.assigneeId !== user.id) {
        notify(s, task.assigneeId, task.id, 'status', `Задача ${task.key}: ${STATUS_TITLES[body.status]}`);
      }
      store.save();
    }
    return { status: 200, body: { task } };
  });

  route('GET', '/api/projects/:id/board', ({ params, user }) => {
    const s = state();
    const project = s.projects.find((p) => p.id === params.id);
    if (!project) return error(404, 'Проект не найден');
    if (!canSeeProject(user, project)) return error(403, 'Нет доступа к проекту');
    const day = today();
    return {
      status: 200,
      body: {
        columns: STATUSES.map((status) => ({
          status,
          title: STATUS_TITLES[status],
          tasks: s.tasks.filter((t) => t.projectId === project.id && t.status === status).map((t) => ({
            id: t.id,
            key: t.key,
            title: t.title,
            priority: t.priority,
            dueDate: t.dueDate,
            overdue: t.status !== 'done' && daysLeft(t.dueDate, day) < 0,
            assignee: s.users.find((u) => u.id === t.assigneeId)?.name ?? null,
            comments: s.comments.filter((c) => c.taskId === t.id).length,
            hasAttachments: t.attachments.length > 0,
          })),
        })),
      },
    };
  });

  // ---------- комментарии (ТЗ, п. 16) ----------
  route('POST', '/api/tasks/:id/comments', ({ params, body, user }) => {
    const s = state();
    const task = s.tasks.find((t) => t.id === params.id);
    if (!task) return error(404, 'Задача не найдена');
    const project = s.projects.find((p) => p.id === task.projectId);
    if (!canSeeProject(user, project)) return error(403, 'Нет доступа к задаче');
    const text = String(body.text || '').trim();
    if (!text) return error(400, 'Текст комментария пуст');
    const comment = { id: `c${s.comments.length + 1}`, taskId: task.id, userId: user.id, text, at: now() };
    s.comments.push(comment);
    const watchers = [task.assigneeId, task.authorId, project.leadId].filter((id) => id && id !== user.id);
    for (const id of watchers) notify(s, id, task.id, 'comment', `Новый комментарий в задаче ${task.key}`);
    store.save();
    return { status: 201, body: { comment } };
  });

  route('PATCH', '/api/comments/:id', ({ params, body, user }) => {
    const s = state();
    const comment = s.comments.find((c) => c.id === params.id);
    if (!comment) return error(404, 'Комментарий не найден');
    if (comment.userId !== user.id) return error(403, 'Править можно только свои комментарии');
    comment.text = String(body.text || '').trim() || comment.text;
    comment.editedAt = now();
    store.save();
    return { status: 200, body: { comment } };
  });

  route('DELETE', '/api/comments/:id', ({ params, user }) => {
    const s = state();
    const comment = s.comments.find((c) => c.id === params.id);
    if (!comment) return error(404, 'Комментарий не найден');
    if (comment.userId !== user.id && !isAdmin(user)) return error(403, 'Удалять можно свои комментарии, администратор — любые');
    s.comments = s.comments.filter((c) => c.id !== params.id);
    store.save();
    return { status: 200, body: { ok: true } };
  });

  // ---------- уведомления (ТЗ, п. 17) ----------
  route('GET', '/api/notifications', ({ user }) => {
    const s = state();
    const day = today();
    const derived = s.tasks
      .filter((t) => t.assigneeId === user.id && t.status !== 'done')
      .flatMap((t) => {
        const left = daysLeft(t.dueDate, day);
        if (left < 0) return [{ id: `d-over-${t.id}`, userId: user.id, taskId: t.id, type: 'overdue', text: `Задача ${t.key} просрочена`, at: t.dueDate, read: false, derived: true }];
        if (left <= 2) return [{ id: `d-soon-${t.id}`, userId: user.id, taskId: t.id, type: 'due_soon', text: `Срок задачи ${t.key} — через ${left} дн.`, at: t.dueDate, read: false, derived: true }];
        return [];
      });
    const own = s.notifications.filter((n) => n.userId === user.id);
    const all = [...derived, ...own].sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return { status: 200, body: { notifications: all, unread: all.filter((n) => !n.read).length } };
  });

  route('POST', '/api/notifications/:id/read', ({ params, user }) => {
    const s = state();
    const item = s.notifications.find((n) => n.id === params.id && n.userId === user.id);
    if (!item) return error(404, 'Уведомление не найдено');
    item.read = true;
    store.save();
    return { status: 200, body: { ok: true } };
  });

  route('POST', '/api/notifications/read-all', ({ user }) => {
    const s = state();
    for (const n of s.notifications) {
      if (n.userId === user.id) n.read = true;
    }
    store.save();
    return { status: 200, body: { ok: true } };
  });

  // ---------- главная (ТЗ, п. 8) ----------
  route('GET', '/api/dashboard', ({ user }) => {
    const s = state();
    const day = today();
    const mine = s.tasks.filter((t) => t.assigneeId === user.id);
    const active = mine.filter((t) => t.status !== 'done');
    const overdue = active.filter((t) => daysLeft(t.dueDate, day) < 0);
    const thisWeek = active.filter((t) => daysLeft(t.dueDate, day) >= 0 && daysLeft(t.dueDate, day) <= 7);
    const visibleIds = new Set(visibleProjects(user).map((p) => p.id));
    const teamTasks = s.tasks.filter((t) => visibleIds.has(t.projectId));
    return {
      status: 200,
      body: {
        counters: { active: active.length, overdue: overdue.length, dueThisWeek: thisWeek.length },
        upcoming: active
          .slice()
          .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
          .slice(0, 5)
          .map((t) => ({ id: t.id, key: t.key, title: t.title, dueDate: t.dueDate, daysLeft: daysLeft(t.dueDate, day), priority: t.priority })),
        recent: s.history
          .filter((h) => teamTasks.some((t) => t.id === h.taskId))
          .slice(-6)
          .toReversed()
          .map((h) => ({ taskId: h.taskId, at: h.at, user: s.users.find((u) => u.id === h.userId)?.name ?? '—', text: `${h.field}: ${h.from ?? '—'} → ${h.to}` })),
        myProjects: visibleProjects(user).map((p) => ({ id: p.id, name: p.name, status: p.status, ...projectStats(p, day) })),
        teamSummary: isAdmin(user) || isPm(user)
          ? {
            users: s.users.length,
            projects: visibleProjects(user).length,
            openTasks: teamTasks.filter((t) => t.status !== 'done').length,
            overdueTasks: teamTasks.filter((t) => t.status !== 'done' && daysLeft(t.dueDate, day) < 0).length,
            byStatus: STATUSES.map((status) => ({ status, title: STATUS_TITLES[status], count: teamTasks.filter((t) => t.status === status).length })),
          }
          : null,
      },
    };
  });

  // ---------- поиск (ТЗ, п. 20) ----------
  route('GET', '/api/search', ({ user, query }) => {
    const q = norm(query.q).trim();
    if (!q) return { status: 200, body: { projects: [], tasks: [], users: [] } };
    const s = state();
    const projects = visibleProjects(user).filter((p) => norm(p.name).includes(q) || norm(p.description).includes(q));
    const visibleIds = new Set(visibleProjects(user).map((p) => p.id));
    const tasks = s.tasks
      .filter((t) => visibleIds.has(t.projectId) && (isAdmin(user) || canManageProject(user, s.projects.find((p) => p.id === t.projectId)) || t.assigneeId === user.id || t.authorId === user.id))
      .filter((t) => norm(t.title).includes(q) || norm(t.key).includes(q) || norm(t.description).includes(q))
      .slice(0, 20)
      .map((t) => ({ id: t.id, key: t.key, title: t.title, status: t.status, projectId: t.projectId }));
    const users = s.users.filter((u) => norm(u.name).includes(q) || norm(u.email).includes(q) || norm(u.position).includes(q))
      .map(publicUser);
    return { status: 200, body: { projects: projects.map((p) => ({ id: p.id, name: p.name, status: p.status })), tasks, users } };
  });

  return { dispatch, STATUSES, STATUS_TITLES, PRIORITIES, PROJECT_STATUSES };
}

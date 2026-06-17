// Do not change this key without a migration: user review data lives here.
const STORAGE_KEY = "english-review-checkin:v1";
const SESSION_KEY = "english-review-checkin:today-session:v1";
const SESSION_DATE_KEY = "english-review-checkin:today-session-date:v1";
const REVIEW_LIMIT = 15;
const REVIEW_INTERVALS = [3, 7, 15, 30];

const emptyState = {
  items: [],
  reviewLogs: [],
  dailyCheckIns: []
};

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneEmptyState();

    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch {
    return cloneEmptyState();
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
}

export function addReviewItem({ english, chinese }) {
  const state = loadState();
  const createdAt = new Date().toISOString();
  const item = {
    id: crypto.randomUUID(),
    english: english.trim(),
    chinese: chinese.trim(),
    createdAt,
    nextReviewAt: addDays(new Date(), REVIEW_INTERVALS[0]),
    reviewCount: 0,
    archived: false
  };

  state.items.unshift(item);
  saveState(state);
  return item;
}

export function updateReviewItem({ itemId, english, chinese }) {
  const state = loadState();
  const item = state.items.find((entry) => entry.id === itemId && !entry.archived);
  if (!item) return null;

  item.english = english.trim();
  item.chinese = chinese.trim();
  item.updatedAt = new Date().toISOString();

  saveState(state);
  return item;
}

export function archiveReviewItem(itemId) {
  const state = loadState();
  const item = state.items.find((entry) => entry.id === itemId && !entry.archived);
  if (!item) return null;

  item.archived = true;
  item.archivedAt = new Date().toISOString();
  saveState(state);
  removeItemFromStoredSession(itemId);

  return item;
}

export function getActiveItems() {
  return loadState().items.filter((item) => !item.archived);
}

export function getDueItems(date = new Date()) {
  const today = toDateOnly(date);
  return getActiveItems()
    .filter((item) => item.nextReviewAt <= today)
    .sort((a, b) => {
      if (a.nextReviewAt !== b.nextReviewAt) {
        return a.nextReviewAt.localeCompare(b.nextReviewAt);
      }
      return a.createdAt.localeCompare(b.createdAt);
    });
}

export function countDueItems(date = new Date()) {
  return getDueItems(date).length;
}

export function getTodaySession(date = new Date()) {
  const today = toDateOnly(date);
  const storedDate = localStorage.getItem(SESSION_DATE_KEY);
  const storedSession = localStorage.getItem(SESSION_KEY);

  if (storedDate === today && storedSession) {
    try {
      const parsed = JSON.parse(storedSession);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      clearTodaySession();
    }
  }

  const dueItems = getDueItems(date).slice(0, REVIEW_LIMIT);
  const session = dueItems.map((item) => ({
    id: item.id,
    promptSide: Math.random() > 0.5 ? "english" : "chinese",
    status: "pending"
  }));

  saveTodaySession(session, today);
  return session;
}

export function saveTodaySession(session, date = new Date()) {
  const dateText = typeof date === "string" ? date : toDateOnly(date);
  localStorage.setItem(SESSION_DATE_KEY, dateText);
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearTodaySession() {
  localStorage.removeItem(SESSION_DATE_KEY);
  localStorage.removeItem(SESSION_KEY);
}

export function recordReviewResult({ itemId, promptSide, result }) {
  const state = loadState();
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) return null;

  const reviewedAt = new Date().toISOString();
  const nextReviewAt = calculateNextReviewDate(item.reviewCount, result);

  item.reviewCount += 1;
  item.nextReviewAt = nextReviewAt;

  state.reviewLogs.push({
    id: crypto.randomUUID(),
    itemId,
    reviewedAt,
    promptSide,
    result
  });

  saveState(state);
  return item;
}

export function saveDailyCheckIn(summary, date = new Date()) {
  const state = loadState();
  const dateText = toDateOnly(date);
  const nextCheckIn = {
    date: dateText,
    plannedCount: summary.plannedCount,
    completedCount: summary.completedCount,
    forgotCount: summary.forgotCount,
    unclearCount: summary.unclearCount,
    familiarCount: summary.familiarCount,
    completed: summary.completed
  };

  const existingIndex = state.dailyCheckIns.findIndex((entry) => entry.date === dateText);
  if (existingIndex >= 0) {
    state.dailyCheckIns[existingIndex] = nextCheckIn;
  } else {
    state.dailyCheckIns.push(nextCheckIn);
  }

  saveState(state);
  return nextCheckIn;
}

export function getTodayCheckIn(date = new Date()) {
  const today = toDateOnly(date);
  return loadState().dailyCheckIns.find((entry) => entry.date === today) || null;
}

export function exportBackup() {
  const state = loadState();
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    items: state.items,
    reviewLogs: state.reviewLogs,
    dailyCheckIns: state.dailyCheckIns
  };
}

export function importBackup(backup) {
  const incoming = normalizeBackup(backup);
  const state = loadState();
  const existingItemKeys = new Set(state.items.map(getItemContentKey));
  const existingIds = new Set(state.items.map((item) => item.id));
  const existingLogIds = new Set(state.reviewLogs.map((log) => log.id));
  const existingCheckInDates = new Set(state.dailyCheckIns.map((entry) => entry.date));
  let addedItems = 0;
  let skippedItems = 0;
  let addedReviewLogs = 0;
  let addedCheckIns = 0;

  incoming.items.forEach((item) => {
    const contentKey = getItemContentKey(item);

    if (item.archived || !contentKey || existingItemKeys.has(contentKey)) {
      skippedItems += 1;
      return;
    }

    const nextItem = { ...item };
    while (existingIds.has(nextItem.id)) {
      nextItem.id = crypto.randomUUID();
    }

    state.items.unshift(nextItem);
    existingIds.add(nextItem.id);
    existingItemKeys.add(contentKey);
    addedItems += 1;
  });

  incoming.reviewLogs.forEach((log) => {
    if (!log.id || existingLogIds.has(log.id)) return;
    state.reviewLogs.push(log);
    existingLogIds.add(log.id);
    addedReviewLogs += 1;
  });

  incoming.dailyCheckIns.forEach((entry) => {
    if (!entry.date || existingCheckInDates.has(entry.date)) return;
    state.dailyCheckIns.push(entry);
    existingCheckInDates.add(entry.date);
    addedCheckIns += 1;
  });

  saveState(state);
  clearTodaySession();

  return {
    addedItems,
    skippedItems,
    addedReviewLogs,
    addedCheckIns
  };
}

export function getReviewLimit() {
  return REVIEW_LIMIT;
}

export function toDateOnly(value) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calculateNextReviewDate(reviewCount, result) {
  if (result === "forgot") return addDays(new Date(), 1);
  if (result === "unclear") return addDays(new Date(), 3);

  const nextStage = reviewCount + 1;
  const nextDays = REVIEW_INTERVALS[nextStage] || 30;
  return addDays(new Date(), nextDays);
}

function addDays(value, days) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  date.setDate(date.getDate() + days);
  return toDateOnly(date);
}

function removeItemFromStoredSession(itemId) {
  const storedDate = localStorage.getItem(SESSION_DATE_KEY);
  const storedSession = localStorage.getItem(SESSION_KEY);

  if (!storedDate || !storedSession) {
    return;
  }

  try {
    const parsed = JSON.parse(storedSession);
    if (!Array.isArray(parsed)) return;

    const nextSession = parsed.filter((entry) => entry.id !== itemId);
    if (nextSession.length !== parsed.length) {
      saveTodaySession(nextSession, storedDate);
    }
  } catch {
    clearTodaySession();
  }
}

function normalizeState(value) {
  return {
    items: Array.isArray(value?.items) ? value.items.map(normalizeItem) : [],
    reviewLogs: Array.isArray(value?.reviewLogs) ? value.reviewLogs : [],
    dailyCheckIns: Array.isArray(value?.dailyCheckIns) ? value.dailyCheckIns : []
  };
}

function normalizeBackup(value) {
  if (!value || value.version !== 1) {
    throw new Error("unsupported-backup");
  }

  return normalizeState(value);
}

function normalizeItem(item) {
  return {
    id: item.id || crypto.randomUUID(),
    english: String(item.english || ""),
    chinese: String(item.chinese || ""),
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || null,
    nextReviewAt: item.nextReviewAt || addDays(new Date(), REVIEW_INTERVALS[0]),
    reviewCount: Number.isFinite(item.reviewCount) ? item.reviewCount : 0,
    archived: Boolean(item.archived),
    archivedAt: item.archivedAt || null
  };
}

function getItemContentKey(item) {
  const english = String(item.english || "").trim().toLowerCase().replace(/\s+/g, " ");
  const chinese = String(item.chinese || "").trim().replace(/\s+/g, "");

  if (!english || !chinese) return "";
  return `${english}::${chinese}`;
}

function cloneEmptyState() {
  return {
    items: [...emptyState.items],
    reviewLogs: [...emptyState.reviewLogs],
    dailyCheckIns: [...emptyState.dailyCheckIns]
  };
}

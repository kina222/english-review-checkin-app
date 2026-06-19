import {
  addReviewItem,
  archiveReviewItem,
  countDueItems,
  exportBackup,
  getActiveItems,
  getReviewLimit,
  getTodayCheckIn,
  getTodaySession,
  importBackup,
  recordReviewResult,
  saveDailyCheckIn,
  saveTodaySession,
  toDateOnly,
  updateReviewItem
} from "./storage.js";

const app = document.querySelector("#app");
const APP_VERSION = "2026.06.19.1";

const uiState = {
  tab: "review",
  items: [],
  session: [],
  activeSessionEntry: null,
  answerVisible: false,
  answerDraft: "",
  recognition: null,
  editingItemId: null
};

app.innerHTML = `
  <main class="phone-frame">
    <header class="hero-bar">
      <div class="brand-mark" aria-hidden="true">
        <img src="assets/nami-avatar.jpg" alt="" />
      </div>
      <div class="brand-copy">
        <p>娜美的航海英语手账</p>
        <h1>ZenRepeat</h1>
      </div>
      <div class="streak-badge">
        <span>打卡</span>
        <strong id="checkinStatus">0 天</strong>
      </div>
    </header>

    <section class="route-strip">
      <span>英语日常打卡主线</span>
      <strong id="sessionProgress">0 / 0</strong>
    </section>

    <section class="screen-area">
      <section class="view" id="view-review" data-view="review"></section>
      <section class="view" id="view-add" data-view="add" hidden></section>
      <section class="view" id="view-library" data-view="library" hidden></section>
      <section class="view" id="view-settings" data-view="settings" hidden></section>
    </section>

    <nav class="bottom-nav" aria-label="主导航">
      <button class="nav-button is-active" type="button" data-tab="review">
        <span>⚡</span>
        <strong>复习</strong>
      </button>
      <button class="nav-button" type="button" data-tab="add">
        <span>✍</span>
        <strong>新增</strong>
      </button>
      <button class="nav-button" type="button" data-tab="library">
        <span>🍊</span>
        <strong>内容库</strong>
      </button>
      <button class="nav-button" type="button" data-tab="settings">
        <span>฿</span>
        <strong>备份</strong>
      </button>
    </nav>

    <div class="toast" id="toast" role="status" aria-live="polite"></div>
  </main>
`;

const views = {
  review: document.querySelector("#view-review"),
  add: document.querySelector("#view-add"),
  library: document.querySelector("#view-library"),
  settings: document.querySelector("#view-settings")
};

document.querySelectorAll(".nav-button").forEach((button) => {
  button.addEventListener("click", () => switchTab(button.dataset.tab));
});

refreshApp();
registerServiceWorker();

function refreshApp() {
  uiState.items = getActiveItems();
  uiState.session = getTodaySession();
  renderAll();
}

function renderAll() {
  renderHeader();
  renderReview();
  renderAdd();
  renderLibrary();
  renderSettings();
  setActiveTab(uiState.tab);
}

function renderHeader() {
  const checkins = getCompletedCheckInCount();
  const done = uiState.session.filter((entry) => entry.status === "done").length;
  const total = uiState.session.length;
  document.querySelector("#checkinStatus").textContent = `${checkins} 天`;
  document.querySelector("#sessionProgress").textContent = total ? `${done} / ${total}` : "今日无任务";
}

function renderReview() {
  const session = uiState.session;
  const pendingEntry = session.find((entry) => entry.status === "pending");
  uiState.activeSessionEntry = pendingEntry || null;

  if (!pendingEntry) {
    const summary = getTodaySummary();
    views.review.innerHTML = `
      <article class="poster-card empty-review">
        <div class="poster-label">CLEAR</div>
        <div class="empty-icon">🍊</div>
        <h2>${session.length ? "今天打卡完成" : "今天没有到期复习"}</h2>
        <p>${session.length ? "娜美的航线账本已经核对完毕。" : "新内容会在明天进入复习。今天可以先新增一点日常英语。"}</p>
        <div class="summary-row">
          <span>今日任务</span>
          <strong>${summary.completedCount} / ${summary.plannedCount}</strong>
        </div>
        <button class="primary-action" type="button" data-action="go-add">写下新的英语手账</button>
      </article>
    `;

    views.review.querySelector("[data-action='go-add']").addEventListener("click", () => switchTab("add"));
    saveCompletedCheckInIfNeeded(summary);
    return;
  }

  const item = uiState.items.find((entry) => entry.id === pendingEntry.id);
  if (!item) {
    pendingEntry.status = "done";
    saveTodaySession(session);
    refreshApp();
    return;
  }

  const promptIsEnglish = pendingEntry.promptSide === "english";
  const answerIsEnglish = !promptIsEnglish;
  const promptText = promptIsEnglish ? item.english : item.chinese;
  const answerText = promptIsEnglish ? item.chinese : item.english;
  const promptLabel = pendingEntry.promptSide === "english" ? "英文提示" : "中文提示";
  const nextStageText = getStageText(item.reviewCount);
  const answerLabel = answerIsEnglish ? "输入你想起来的英文" : "输入你想起来的中文";
  const answerPlaceholder = answerIsEnglish ? "先自己写英文，再对照答案。" : "先自己写中文，再对照答案。";
  const keyboardHint = answerIsEnglish ? "latin" : "text";

  views.review.innerHTML = `
    <article class="poster-card">
      <div class="poster-heading">
        <strong>WANTED</strong>
        <span>${promptLabel}</span>
      </div>
      <div class="stage-line">
        <span>${nextStageText}</span>
        <span>今日最多 ${getReviewLimit()} 条</span>
      </div>
      <div class="prompt-text">
        <span>${escapeHtml(promptText)}</span>
        ${promptIsEnglish ? renderSpeakButton(item.english, "朗读英文") : ""}
      </div>
      <div class="answer-zone">
        ${
          uiState.answerVisible
            ? `
              <div class="draft-card">
                <span>你刚才写的是</span>
                <p>${escapeHtml(uiState.answerDraft || "这次没有输入。")}</p>
              </div>
              <div class="answer-card">
                <strong>标准答案</strong>
                <span>${escapeHtml(answerText)}</span>
                ${answerIsEnglish ? renderSpeakButton(item.english, "朗读答案") : ""}
              </div>
            `
            : `
              <label class="recall-box">
                <span>${answerLabel}</span>
                <textarea id="recallInput" rows="4" autocomplete="off" inputmode="${keyboardHint}" placeholder="${answerPlaceholder}"></textarea>
              </label>
              <button class="reveal-button" type="button" data-action="reveal">对照答案</button>
            `
        }
      </div>
    </article>
    <div class="feedback-grid" ${uiState.answerVisible ? "" : "hidden"}>
      <button class="feedback forgot" type="button" data-feedback="forgot">
        <strong>忘了</strong>
        <span>1 天后</span>
      </button>
      <button class="feedback unclear" type="button" data-feedback="unclear">
        <strong>模糊</strong>
        <span>3 天后</span>
      </button>
      <button class="feedback familiar" type="button" data-feedback="familiar">
        <strong>熟了</strong>
        <span>下一档</span>
      </button>
    </div>
  `;

  views.review.querySelector("[data-action='reveal']")?.addEventListener("click", () => {
    uiState.answerDraft = views.review.querySelector("#recallInput")?.value.trim() || "";
    uiState.answerVisible = true;
    renderReview();
  });

  views.review.querySelectorAll("[data-feedback]").forEach((button) => {
    button.addEventListener("click", () => handleFeedback(button.dataset.feedback));
  });

  bindSpeakButtons(views.review);
}

function renderAdd() {
  views.add.innerHTML = `
    <article class="panel-block">
      <div class="section-title">
        <h2>金库账本</h2>
        <span>英文 + 中文</span>
      </div>
      <form class="add-form" id="addForm">
        <label>
          <span>英文内容</span>
          <div class="voice-row">
            <textarea id="englishInput" rows="4" autocomplete="off" placeholder="Time for bed."></textarea>
            <button class="voice-button" type="button" data-voice="english" title="英文语音输入">
              <span>🐌</span>
              <small>听写</small>
            </button>
          </div>
        </label>
        <label>
          <span>中文意思</span>
          <div class="voice-row">
            <textarea id="chineseInput" rows="4" autocomplete="off" placeholder="该睡觉了。"></textarea>
            <button class="voice-button" type="button" data-voice="chinese" title="中文语音输入">
              <span>🐌</span>
              <small>听写</small>
            </button>
          </div>
        </label>
        <p class="helper-text" id="voiceStatus">点“听写”后，允许麦克风权限，然后直接说话。</p>
        <button class="primary-action" type="submit">收入娜美的英语金库</button>
      </form>
    </article>
  `;

  views.add.querySelector("#addForm").addEventListener("submit", handleAddSubmit);
  views.add.querySelectorAll("[data-voice]").forEach((button) => {
    button.addEventListener("click", () => startVoiceInput(button.dataset.voice, button));
  });
}

function renderLibrary() {
  const itemCards = uiState.items
    .map(
      (item) => {
        const isEditing = uiState.editingItemId === item.id;

        return `
          <li class="library-card" data-item-id="${item.id}">
            ${
              isEditing
                ? `
                  <form class="library-edit-form" data-edit-form="${item.id}">
                    <label>
                      <span>英文内容</span>
                      <textarea rows="3" data-edit-english>${escapeHtml(item.english)}</textarea>
                    </label>
                    <label>
                      <span>中文意思</span>
                      <textarea rows="3" data-edit-chinese>${escapeHtml(item.chinese)}</textarea>
                    </label>
                    <div class="library-actions">
                      <button class="mini-action primary" type="submit">保存</button>
                      <button class="mini-action" type="button" data-cancel-edit="${item.id}">取消</button>
                    </div>
                  </form>
                `
                : `
                  <div>
                    <div class="library-english-row">
                      <p class="library-english">${escapeHtml(item.english)}</p>
                      ${renderSpeakButton(item.english, "朗读")}
                    </div>
                    <p class="library-chinese">${escapeHtml(item.chinese)}</p>
                  </div>
                  <time datetime="${item.nextReviewAt}">下次复习：${item.nextReviewAt}</time>
                  <div class="library-actions">
                    <button class="mini-action" type="button" data-edit-item="${item.id}">编辑</button>
                    <button class="mini-action danger" type="button" data-delete-item="${item.id}">删除</button>
                  </div>
                `
            }
          </li>
        `;
      }
    )
    .join("");

  views.library.innerHTML = `
    <article class="panel-block">
      <div class="section-title">
        <h2>橘子航线</h2>
        <span>${uiState.items.length} 条</span>
      </div>
      ${
        uiState.items.length
          ? `<ul class="library-list">${itemCards}</ul>`
          : `<div class="empty-box">还没有内容。先去“新增”写下一条英语。</div>`
      }
    </article>
  `;

  views.library.querySelectorAll("[data-edit-item]").forEach((button) => {
    button.addEventListener("click", () => {
      uiState.editingItemId = button.dataset.editItem;
      renderLibrary();
    });
  });

  views.library.querySelectorAll("[data-cancel-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      uiState.editingItemId = null;
      renderLibrary();
    });
  });

  views.library.querySelectorAll("[data-edit-form]").forEach((form) => {
    form.addEventListener("submit", handleLibraryEditSubmit);
  });

  views.library.querySelectorAll("[data-delete-item]").forEach((button) => {
    button.addEventListener("click", () => handleLibraryDelete(button.dataset.deleteItem));
  });

  bindSpeakButtons(views.library);
}

function renderSettings() {
  const backup = exportBackup();
  views.settings.innerHTML = `
    <article class="panel-block">
      <div class="section-title">
        <h2>贝里管家</h2>
        <span>导出 / 导入</span>
      </div>
      <div class="backup-card">
        <p>数据只保存在本地。建议经常导出一份 JSON 备份，避免浏览器清理数据后丢失。</p>
        <div class="backup-stats">
          <span>内容 ${backup.items.length} 条</span>
          <span>复习记录 ${backup.reviewLogs.length} 条</span>
        </div>
        <button class="primary-action" type="button" id="exportButton">导出 JSON 备份</button>
      </div>
      <div class="backup-card import-card">
        <p>换浏览器、换手机或桌面入口数据为空时，可以导入之前导出的 JSON。导入会合并内容：重复跳过，新内容补进来。</p>
        <button class="secondary-action" type="button" id="importButton">导入 JSON 备份</button>
        <input class="file-input" id="importFileInput" type="file" accept="application/json,.json" />
        <p class="helper-text" id="importStatus">不会覆盖当前内容。</p>
      </div>
      <div class="backup-card version-card">
        <p>当前版本：<strong>${APP_VERSION}</strong></p>
        <p>如果桌面入口还显示旧界面，可以点这里刷新 App 外壳。已录入内容不会被删除。</p>
        <button class="secondary-action" type="button" id="refreshAppButton">刷新到最新版</button>
      </div>
    </article>
  `;

  views.settings.querySelector("#exportButton").addEventListener("click", handleExport);
  views.settings.querySelector("#importButton").addEventListener("click", () => {
    views.settings.querySelector("#importFileInput").click();
  });
  views.settings.querySelector("#importFileInput").addEventListener("change", handleImport);
  views.settings.querySelector("#refreshAppButton").addEventListener("click", handleRefreshAppShell);
}

function handleAddSubmit(event) {
  event.preventDefault();

  const englishInput = views.add.querySelector("#englishInput");
  const chineseInput = views.add.querySelector("#chineseInput");
  const english = englishInput.value.trim();
  const chinese = chineseInput.value.trim();

  if (!english || !chinese) {
    showToast("英文和中文都要填写。");
    return;
  }

  addReviewItem({ english, chinese });
  englishInput.value = "";
  chineseInput.value = "";
  showToast("已收入英语金库，明天开始复习。");
  refreshApp();
}

function handleLibraryEditSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const itemId = form.dataset.editForm;
  const english = form.querySelector("[data-edit-english]").value.trim();
  const chinese = form.querySelector("[data-edit-chinese]").value.trim();

  if (!english || !chinese) {
    showToast("英文和中文都要填写。");
    return;
  }

  const updated = updateReviewItem({ itemId, english, chinese });
  if (!updated) {
    showToast("没有找到这条内容。");
    refreshApp();
    return;
  }

  uiState.editingItemId = null;
  showToast("内容已更新。");
  refreshApp();
}

function handleLibraryDelete(itemId) {
  const item = uiState.items.find((entry) => entry.id === itemId);
  if (!item) return;

  const confirmed = window.confirm(`确定删除这条内容吗？\n\n${item.english}`);
  if (!confirmed) return;

  const archived = archiveReviewItem(itemId);
  if (!archived) {
    showToast("没有找到这条内容。");
    refreshApp();
    return;
  }

  if (uiState.editingItemId === itemId) {
    uiState.editingItemId = null;
  }

  showToast("已从内容库删除。");
  refreshApp();
}

function handleFeedback(result) {
  const entry = uiState.activeSessionEntry;
  if (!entry) return;

  recordReviewResult({
    itemId: entry.id,
    promptSide: entry.promptSide,
    result
  });

  entry.status = "done";
  entry.result = result;
  saveTodaySession(uiState.session);
  saveCompletedCheckInIfNeeded(getTodaySummary());
  uiState.answerVisible = false;
  uiState.answerDraft = "";
  showToast(getFeedbackMessage(result));
  refreshApp();
}

function handleExport() {
  const backup = exportBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `english-review-backup-${toDateOnly(new Date())}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("JSON 备份已导出。");
}

async function handleImport(event) {
  const input = event.currentTarget;
  const status = views.settings.querySelector("#importStatus");
  const file = input.files?.[0];

  if (!file) return;

  try {
    const text = await file.text();
    const backup = JSON.parse(text);
    const result = importBackup(backup);

    uiState.answerVisible = false;
    uiState.answerDraft = "";
    uiState.editingItemId = null;
    refreshApp();
    switchTab("settings");

    const message = `导入完成：新增 ${result.addedItems} 条，跳过重复 ${result.skippedItems} 条。`;
    views.settings.querySelector("#importStatus").textContent = message;
    showToast(message);
  } catch {
    status.textContent = "导入失败。请确认选择的是本 App 导出的 JSON 备份文件。";
    showToast("导入失败，请检查备份文件。");
  } finally {
    input.value = "";
  }
}

async function handleRefreshAppShell() {
  showToast("正在刷新 App 外壳...");

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }

    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch {
    showToast("刷新缓存时遇到问题，正在尝试重新加载。");
  }

  window.location.replace(`./?refresh=${Date.now()}`);
}

function startVoiceInput(field, button) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const status = views.add.querySelector("#voiceStatus");
  const input = field === "english" ? views.add.querySelector("#englishInput") : views.add.querySelector("#chineseInput");

  if (!SpeechRecognition) {
    status.textContent = "当前浏览器不支持 App 内语音，请使用手机系统输入法语音。";
    showToast("请使用系统输入法语音。");
    return;
  }

  if (uiState.recognition) {
    uiState.recognition.stop();
    uiState.recognition = null;
    return;
  }

  input.focus();

  const recognition = new SpeechRecognition();
  uiState.recognition = recognition;
  recognition.lang = field === "english" ? "en-US" : "zh-CN";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  button.classList.add("is-recording");
  status.textContent = "正在听写，请现在开始说话。";
  const originalText = input.value.trim();
  let committedText = "";
  let hasVoiceText = false;

  recognition.onresult = (event) => {
    let interimText = "";

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const text = event.results[index][0].transcript.trim();

      if (!text) {
        continue;
      }

      if (event.results[index].isFinal) {
        committedText = appendVoiceText(committedText, text, field);
        hasVoiceText = true;
      } else {
        interimText = appendVoiceText(interimText, text, field);
        hasVoiceText = true;
      }
    }

    const previewText = appendVoiceText(committedText, interimText, field);

    if (previewText) {
      input.value = appendVoiceText(originalText, previewText, field);
      status.textContent = interimText ? "正在听写，文字会先临时显示在输入框。" : "语音已写入。";
    }

    if (committedText) {
      input.value = appendVoiceText(originalText, committedText, field);
    }
  };

  recognition.onerror = (event) => {
    input.value = originalText;
    status.textContent = getVoiceErrorMessage(event.error);
  };

  recognition.onend = () => {
    uiState.recognition = null;
    button.classList.remove("is-recording");
    if (status.textContent.startsWith("正在听写")) {
      input.value = originalText;
      status.textContent = "没有收到语音。可以再点一次听写，或用系统输入法语音。";
      return;
    }

    if (hasVoiceText) {
      showToast("语音已写入。");
    }
  };

  try {
    recognition.start();
  } catch {
    status.textContent = "语音启动失败，请使用系统输入法语音。";
  }
}

function appendVoiceText(currentText, addedText, field) {
  const current = currentText.trim();
  const added = addedText.trim();

  if (!current) {
    return added;
  }

  if (!added) {
    return current;
  }

  return field === "english" ? `${current} ${added}` : `${current}${added}`;
}

function getVoiceErrorMessage(error) {
  const messages = {
    "not-allowed": "麦克风权限被拒绝。请在浏览器地址栏左侧打开麦克风权限。",
    "service-not-allowed": "浏览器不允许当前页面使用语音服务，可以换 Chrome 或使用系统输入法语音。",
    "no-speech": "没有检测到声音。点听写后要马上说话，或靠近麦克风再试。",
    "audio-capture": "没有检测到麦克风。请检查电脑或浏览器麦克风权限。",
    network: "浏览器语音服务网络异常。可以稍后再试，或使用系统输入法语音。",
    aborted: "听写已停止。"
  };

  return messages[error] || `语音识别失败：${error || "未知原因"}。可以再试一次或用系统输入法语音。`;
}

function switchTab(tab) {
  uiState.tab = tab;
  setActiveTab(tab);
}

function setActiveTab(tab) {
  Object.entries(views).forEach(([key, view]) => {
    view.hidden = key !== tab;
  });

  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === tab);
  });
}

function getTodaySummary() {
  const session = uiState.session;
  return {
    plannedCount: session.length,
    completedCount: session.filter((entry) => entry.status === "done").length,
    forgotCount: session.filter((entry) => entry.result === "forgot").length,
    unclearCount: session.filter((entry) => entry.result === "unclear").length,
    familiarCount: session.filter((entry) => entry.result === "familiar").length,
    completed: session.length > 0 && session.every((entry) => entry.status === "done")
  };
}

function saveCompletedCheckInIfNeeded(summary) {
  if (!summary.completed) return;
  saveDailyCheckIn(summary);
}

function getCompletedCheckInCount() {
  const today = getTodayCheckIn();
  const state = exportBackup();
  const completedDates = new Set(
    state.dailyCheckIns.filter((entry) => entry.completed).map((entry) => entry.date)
  );

  if (today?.completed) completedDates.add(today.date);
  return completedDates.size;
}

function getStageText(reviewCount) {
  if (reviewCount === 0) return "明天复习";
  if (reviewCount === 1) return "3 天后复习";
  if (reviewCount === 2) return "第 7 天复习";
  if (reviewCount === 3) return "第 15 天复习";
  if (reviewCount === 4) return "第 30 天复习";
  return "30 天循环";
}

function getFeedbackMessage(result) {
  if (result === "forgot") return "忘了：1 天后再出现。";
  if (result === "unclear") return "模糊：3 天后再出现。";
  return "熟了：进入下一档。";
}

function bindSpeakButtons(container) {
  container.querySelectorAll("[data-speak-text]").forEach((button) => {
    button.addEventListener("click", () => speakEnglish(button.dataset.speakText));
  });
}

function renderSpeakButton(text, label) {
  return `
    <button class="speak-button" type="button" data-speak-text="${escapeHtml(text)}" aria-label="${escapeHtml(label)}">
      <span aria-hidden="true">🔊</span>
      <small>${escapeHtml(label)}</small>
    </button>
  `;
}

function speakEnglish(text) {
  if (!("speechSynthesis" in window) || !window.SpeechSynthesisUtterance) {
    showToast("当前浏览器不支持朗读。");
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.88;
  utterance.pitch = 1;

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2200);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {
      // 离线缓存失败不影响主功能，保持静默。
    });
  });
}

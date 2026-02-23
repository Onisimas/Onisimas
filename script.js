const plants = [
  { common: "Holy Basil (Tulsi)", scientific: "Ocimum tenuiflorum", treatment: "Cough, cold, fever, immunity booster", hint: "Purple-green aromatic leaves" },
  { common: "Gurjo", scientific: "Tinospora cordifolia", treatment: "Fever, diabetes, immunity, weakness", hint: "Climbing stem used as immunity vine" },
  { common: "Ghod Tapre", scientific: "Centella asiatica", treatment: "Memory improvement, wound healing, skin problems", hint: "Small round leaves near moist ground" },
  { common: "Turmeric", scientific: "Curcuma longa", treatment: "Antiseptic, wound healing, anti-inflammatory", hint: "Yellow rhizome used as spice" },
  { common: "Asuro", scientific: "Justicia adhatoda", treatment: "Cough, asthma, respiratory problems", hint: "Shrub leaves for respiratory syrup" },
  { common: "Yarsagumba", scientific: "Ophiocordyceps sinensis", treatment: "Weakness, energy booster, traditional tonic", hint: "Himalayan caterpillar fungus" },
  { common: "Titepati", scientific: "Artemisia vulgaris", treatment: "Cuts, wounds, infections, insect repellent", hint: "Strong-smell herb used in rituals" },
  { common: "Ghiu Kumari", scientific: "Aloe vera", treatment: "Burns, skin problems, digestion", hint: "Succulent gel-filled leaves" }
];

const levels = [
  { title: "Seed 🌱", minXP: 0 },
  { title: "Sprout 🌿", minXP: 80 },
  { title: "Herbalist 🌳", minXP: 200 },
  { title: "Ayurvedic Master 👑", minXP: 360 }
];

const state = {
  mode: null, score: 0, streak: 0, timer: 0, lives: 3,
  correctInRow: 0, current: null, queue: [], examStep: 0,
  flashVisible: false, memoryTarget: null
};

let timerRef;
const $ = (id) => document.getElementById(id);

const ui = {
  home: $("homePanel"),
  game: $("gamePanel"),
  question: $("questionBox"),
  options: $("optionsBox"),
  typing: $("typingBox"),
  feedback: $("feedback"),
  nextBtn: $("nextBtn"),
  modeTitle: $("modeTitle")
};

function getStore() {
  return JSON.parse(localStorage.getItem("medplant-store") || "{}");
}
function saveStore(payload) {
  localStorage.setItem("medplant-store", JSON.stringify({ ...getStore(), ...payload }));
}
function plantStats() {
  const store = getStore();
  if (!store.stats) {
    const stats = Object.fromEntries(plants.map((p) => [p.common, { attempts: 0, correct: 0 }]));
    saveStore({ stats, xp: 0, games: 0, leaderboard: [] });
  }
  return getStore().stats;
}

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}
function sample(arr, n) {
  return shuffle(arr).slice(0, n);
}
function weightedPlant() {
  const stats = plantStats();
  const weighted = plants.flatMap((p) => {
    const s = stats[p.common] || { attempts: 0, correct: 0 };
    const accuracy = s.attempts ? s.correct / s.attempts : 0;
    const weight = Math.max(1, Math.round((1 - accuracy) * 5));
    return Array.from({ length: weight }, () => p);
  });
  return weighted[Math.floor(Math.random() * weighted.length)];
}

function updateHUD() {
  $("hudScore").textContent = `Score: ${state.score}`;
  $("hudTimer").textContent = `⏳ ${state.timer}`;
  $("hudLives").textContent = `❤️ ${state.lives}`;
  $("hudStreak").textContent = `🔥 ${state.streak}`;
}

function addXP(amount) {
  const store = getStore();
  const xp = (store.xp || 0) + amount;
  saveStore({ xp });
  renderXP();
}

function renderXP() {
  const xp = getStore().xp || 0;
  const lvl = [...levels].reverse().find((l) => xp >= l.minXP) || levels[0];
  const next = levels.find((l) => l.minXP > lvl.minXP);
  const progress = next ? Math.min(100, ((xp - lvl.minXP) / (next.minXP - lvl.minXP)) * 100) : 100;
  $("levelBadge").textContent = lvl.title;
  $("xpText").textContent = `XP: ${xp}`;
  $("xpFill").style.width = `${progress}%`;
}

function renderDashboard() {
  const store = getStore();
  const stats = plantStats();
  let attempts = 0, correct = 0;
  Object.values(stats).forEach((s) => { attempts += s.attempts; correct += s.correct; });
  const accuracy = attempts ? Math.round((correct / attempts) * 100) : 0;
  $("accuracyStat").textContent = `${accuracy}%`;
  $("gamesStat").textContent = store.games || 0;

  let mostWrong = "—", strongest = "—", maxWrong = -1, maxAcc = -1;
  for (const [name, s] of Object.entries(stats)) {
    const wrong = s.attempts - s.correct;
    if (wrong > maxWrong) { maxWrong = wrong; mostWrong = name; }
    const acc = s.attempts ? s.correct / s.attempts : 0;
    if (acc > maxAcc && s.attempts > 0) { maxAcc = acc; strongest = name; }
  }
  $("mostWrongStat").textContent = mostWrong;
  $("strongStat").textContent = strongest;

  const list = $("leaderboard");
  list.innerHTML = "";
  (store.leaderboard || []).slice(0, 5).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `${item.mode}: ${item.score}`;
    list.appendChild(li);
  });
}

function dailyChallenge() {
  const dayKey = new Date().toISOString().slice(0, 10);
  const index = dayKey.split("-").reduce((a, b) => a + Number(b), 0) % plants.length;
  const p = plants[index];
  $("dailyChallenge").innerHTML = `<strong>Daily Challenge:</strong> ${p.common} → ${p.scientific}`;
}

function startMode(mode) {
  state.mode = mode;
  state.score = 0;
  state.streak = 0;
  state.lives = 3;
  state.correctInRow = 0;
  state.examStep = 0;
  state.queue = [];
  ui.feedback.textContent = "";
  ui.feedback.className = "";
  ui.nextBtn.classList.add("hidden");
  showGame(true);

  if (mode === "quick") {
    state.timer = 30;
    ui.modeTitle.textContent = "🔥 Quick Match";
    startTimer(() => endGame("Time is up!"));
    askQuick();
  } else if (mode === "survival") {
    state.timer = 0;
    ui.modeTitle.textContent = "💀 Survival";
    clearInterval(timerRef);
    askSurvival();
  } else if (mode === "memory") {
    state.timer = 5;
    ui.modeTitle.textContent = "🧠 Memory Challenge";
    clearInterval(timerRef);
    askMemory();
  } else if (mode === "exam") {
    state.timer = 0;
    ui.modeTitle.textContent = "📝 SEE Exam Simulation";
    clearInterval(timerRef);
    startExam();
  } else if (mode === "image") {
    state.timer = 0;
    ui.modeTitle.textContent = "🖼 Image Identification";
    clearInterval(timerRef);
    askImage();
  }
  updateHUD();
}

function showGame(on) {
  ui.home.classList.toggle("hidden", on);
  ui.game.classList.toggle("hidden", !on);
}

function startTimer(onDone) {
  clearInterval(timerRef);
  timerRef = setInterval(() => {
    state.timer -= 1;
    updateHUD();
    if (state.timer <= 0) {
      clearInterval(timerRef);
      onDone();
    }
  }, 1000);
}

function recordResult(plantName, isCorrect) {
  const stats = plantStats();
  stats[plantName].attempts += 1;
  if (isCorrect) stats[plantName].correct += 1;
  saveStore({ stats });
}

function buildOptions(answer, kind) {
  const source = kind === "scientific" ? plants.map((p) => p.scientific) : plants.map((p) => p.treatment);
  return shuffle([answer, ...sample(source.filter((x) => x !== answer), 3)]);
}

function askQuick() {
  const p = weightedPlant();
  const askSci = Math.random() > 0.5;
  state.current = { plant: p, answer: askSci ? p.scientific : p.treatment };
  ui.question.textContent = askSci ? `Scientific name of ${p.common}?` : `Best treatment use of ${p.common}?`;
  renderOptionButtons(buildOptions(state.current.answer, askSci ? "scientific" : "treatment"), onAnswer);
}

function askSurvival() {
  const p = weightedPlant();
  const promptType = Math.random() > 0.6 ? "common" : "treatment";
  const answer = promptType === "common" ? p.common : p.treatment;
  state.current = { plant: p, answer };
  ui.question.textContent = promptType === "common" ? `Which plant has scientific name ${p.scientific}?` : `${p.common} is mainly used for:`;
  renderOptionButtons(buildOptions(answer, promptType === "common" ? "common" : "treatment"), onAnswer);
}

function askMemory() {
  const p = weightedPlant();
  state.memoryTarget = p;
  ui.options.innerHTML = "";
  ui.typing.classList.add("hidden");
  ui.question.innerHTML = `Memorize for 5 seconds:<br><strong>${p.common}</strong><br>${p.scientific}<br>${p.treatment}`;
  state.timer = 5;
  updateHUD();
  startTimer(() => {
    ui.question.textContent = `Recall details for ${p.common}`;
    ui.typing.classList.remove("hidden");
    ui.typing.innerHTML = `
      <label>Scientific Name<input id="memSci" placeholder="Type scientific name" /></label>
      <label>Main Treatment<textarea id="memTreat" rows="2" placeholder="Type one or more treatment features"></textarea></label>
      <button id="submitMemory">Submit</button>
    `;
    $("submitMemory").onclick = submitMemory;
  });
}

function startExam() {
  state.queue = [
    ...Array.from({ length: 5 }, () => ({ type: "mcq" })),
    ...Array.from({ length: 5 }, () => ({ type: "match" })),
    ...Array.from({ length: 3 }, () => ({ type: "short" }))
  ];
  nextExamQuestion();
}

function nextExamQuestion() {
  ui.typing.classList.add("hidden");
  ui.nextBtn.classList.add("hidden");
  const item = state.queue[state.examStep];
  if (!item) return endGame("Exam Complete");

  const p = weightedPlant();
  state.current = { plant: p, answer: p.scientific };

  if (item.type === "mcq") {
    ui.question.textContent = `MCQ ${state.examStep + 1}: Scientific name of ${p.common}?`;
    renderOptionButtons(buildOptions(p.scientific, "scientific"), (value) => onExamAnswer(value === p.scientific));
  } else if (item.type === "match") {
    ui.question.textContent = `Match ${state.examStep + 1}: ${p.scientific} corresponds to...`;
    renderOptionButtons(buildOptions(p.common, "common"), (value) => onExamAnswer(value === p.common));
  } else {
    ui.options.innerHTML = "";
    ui.question.textContent = `Short Answer ${state.examStep + 1}: Write one treatment of ${p.common}.`;
    ui.typing.classList.remove("hidden");
    ui.typing.innerHTML = `
      <textarea id="examShort" rows="2" placeholder="Type treatment"></textarea>
      <button id="submitShort">Submit</button>
    `;
    $("submitShort").onclick = () => {
      const value = $("examShort").value.toLowerCase();
      const ok = p.treatment.toLowerCase().split(",").some((w) => value.includes(w.trim().split(" ")[0]));
      onExamAnswer(ok);
    };
  }
}

function askImage() {
  const p = weightedPlant();
  state.current = { plant: p, answer: p.common };
  const template = $("imageQuestionTemplate").content.cloneNode(true);
  ui.question.innerHTML = "";
  ui.question.appendChild(template);
  $("plantImage").textContent = `Hint: ${p.hint}`;
  renderOptionButtons(buildOptions(p.common, "common"), onAnswer);
}

function renderOptionButtons(options, handler) {
  ui.typing.classList.add("hidden");
  ui.options.innerHTML = "";
  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.textContent = opt;
    btn.onclick = () => handler(opt);
    ui.options.appendChild(btn);
  });
}

function onAnswer(value) {
  const ok = value === state.current.answer;
  recordResult(state.current.plant.common, ok);
  if (ok) {
    state.streak += 1;
    state.correctInRow += 1;
    const bonus = state.mode === "quick" ? Math.min(5, state.streak) : 2;
    state.score += 10 + bonus + (state.mode === "survival" && state.correctInRow >= 5 ? 5 : 0);
    ui.feedback.textContent = "✅ Correct";
    ui.feedback.className = "correct";
  } else {
    state.streak = 0;
    if (state.mode === "survival") state.lives -= 1;
    ui.feedback.textContent = `❌ Wrong. Correct: ${state.current.answer}`;
    ui.feedback.className = "wrong";
  }
  updateHUD();
  renderDashboard();

  if (state.mode === "survival" && state.lives <= 0) return endGame("Out of lives");
  if (state.mode === "quick") return askQuick();
  if (state.mode === "survival") return askSurvival();
  if (state.mode === "image") return askImage();
}

function submitMemory() {
  const sci = $("memSci").value.trim().toLowerCase();
  const treatment = $("memTreat").value.trim().toLowerCase();
  const p = state.memoryTarget;
  const sciOk = sci === p.scientific.toLowerCase();
  const treatOk = p.treatment.toLowerCase().split(",").some((key) => treatment.includes(key.trim().split(" ")[0]));
  const ok = sciOk && treatOk;
  recordResult(p.common, ok);
  if (ok) {
    state.score += 25;
    ui.feedback.textContent = "Great memory! +25";
    ui.feedback.className = "correct";
  } else {
    ui.feedback.textContent = `Need revision. ${p.scientific} | ${p.treatment}`;
    ui.feedback.className = "wrong";
  }
  updateHUD();
  renderDashboard();
  ui.nextBtn.classList.remove("hidden");
  ui.nextBtn.onclick = askMemory;
}

function onExamAnswer(ok) {
  recordResult(state.current.plant.common, ok);
  if (ok) {
    state.score += 10;
    ui.feedback.textContent = "Correct";
    ui.feedback.className = "correct";
  } else {
    ui.feedback.textContent = "Incorrect";
    ui.feedback.className = "wrong";
  }
  state.examStep += 1;
  updateHUD();
  renderDashboard();
  ui.nextBtn.classList.remove("hidden");
  ui.nextBtn.onclick = nextExamQuestion;
}

function endGame(reason) {
  clearInterval(timerRef);
  addXP(Math.round(state.score / 4) + 5);
  const store = getStore();
  const leaderboard = [...(store.leaderboard || []), { mode: state.mode, score: state.score }]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  saveStore({ leaderboard, games: (store.games || 0) + 1 });
  renderDashboard();

  ui.feedback.textContent = `${reason}. Final Score: ${state.score}`;
  ui.feedback.className = "";
  ui.options.innerHTML = "";
  ui.typing.classList.add("hidden");
  ui.nextBtn.classList.add("hidden");
}

document.querySelectorAll("[data-mode]").forEach((btn) => {
  btn.addEventListener("click", () => startMode(btn.dataset.mode));
});
$("exitBtn").addEventListener("click", () => {
  clearInterval(timerRef);
  showGame(false);
});

plantStats();
renderDashboard();
renderXP();
dailyChallenge();
updateHUD();

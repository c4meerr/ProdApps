// =========================================
// 1. GLOBAL STATE & INITIALIZATION
// =========================================
let currentUser = null;
let isLoggedIn = false;

document.addEventListener("DOMContentLoaded", () => {

  // 1.1 Initial Page Load
  showPage("loginPage");

  // 1.2 Restore Session (if exists)
  const savedUser = localStorage.getItem("currentUser");
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    isLoggedIn = true;
  }
});


// =========================================
// 2. PAGE NAVIGATION SYSTEM
// =========================================
/**
 * Handles switching between pages
 * Ensures only one page is visible at a time
 */
function showPage(pageId) {

  // 2.1 Hide all pages
  document.querySelectorAll(".page").forEach(page => {
    page.classList.remove("active");
  });

  // 2.2 Show selected page
  const targetPage = document.getElementById(pageId);
  if (targetPage) {
    targetPage.classList.add("active");

    // 2.3 Load dashboard data when needed
    if (pageId === "dashboard") {
      loadUserStreak();
      loadTodos();
    }
  }
}


// =========================================
// 3. AUTHENTICATION (LOGIN / SIGNUP / LOGOUT)
// =========================================

// 3.1 Navigation between login & signup
document.getElementById("goToSignup").addEventListener("click", (e) => {
  e.preventDefault();
  showPage("signupPage");
});

document.getElementById("goToLogin").addEventListener("click", (e) => {
  e.preventDefault();
  showPage("loginPage");
});

// 3.2 Login Logic
document.getElementById("loginForm").addEventListener("submit", (e) => {
  e.preventDefault();

  const email = document.getElementById("loginEmail").value;

  isLoggedIn = true;
  currentUser = { email: email };

  localStorage.setItem("isLoggedIn", "true");
  localStorage.setItem("lastUserEmail", email);

  showPage("dashboard");
});

// 3.3 Signup Logic
document.getElementById("signupForm").addEventListener("submit", (e) => {
  e.preventDefault();
  alert("Account created! Please log in.");
  showPage("loginPage");
});

// 3.4 Logout Logic
["logoutBtn", "logout"].forEach(id => {
  const btn = document.getElementById(id);

  if (btn) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();

      localStorage.removeItem("isLoggedIn");

      isLoggedIn = false;
      currentUser = null;

      showPage("loginPage");
    });
  }
});


// =========================================
// 4. DASHBOARD UI (MENU & TABS)
// =========================================

// 4.1 Hamburger Menu
const menuBtn = document.getElementById("menuBtn");
const menuDropdown = document.getElementById("menuDropdown");

menuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  menuDropdown.classList.toggle("active");
});

// Close menu when clicking outside
document.addEventListener("click", (e) => {
  if (!menuBtn.contains(e.target) && !menuDropdown.contains(e.target)) {
    menuDropdown.classList.remove("active");
  }
});

// 4.2 Tab Switching (To-Do / Activities / Budget)
document.querySelectorAll(".tabs button").forEach(btn => {
  btn.addEventListener("click", () => {

    // Remove active states
    document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

    // Activate selected tab
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});


// =========================================
// 5. STREAK SYSTEM (LOCAL STORAGE)
// =========================================
function loadUserStreak() {
  if (!currentUser) return;

  const streakKey = `streak_${currentUser.email}`;
  const lastCheckKey = `lastCheck_${currentUser.email}`;

  const savedStreak = localStorage.getItem(streakKey) || "0";
  const lastCheckIn = localStorage.getItem(lastCheckKey);

  const today = new Date().toDateString();

  const streakEl = document.getElementById("streakCount");
  const btn = document.getElementById("checkInBtn");

  streakEl.textContent = savedStreak;

  if (lastCheckIn === today) {
    btn.disabled = true;
    btn.textContent = "Checked in today ✅";
  } else {
    btn.disabled = false;
    btn.textContent = "Tap to Check In Today";
  }
}

// 5.1 Handle Check-in
document.getElementById("checkInBtn").addEventListener("click", () => {
  if (!currentUser) return;

  const streakKey = `streak_${currentUser.email}`;
  const lastCheckKey = `lastCheck_${currentUser.email}`;

  const today = new Date().toDateString();
  let streak = parseInt(localStorage.getItem(streakKey) || "0");

  streak++;

  localStorage.setItem(streakKey, streak);
  localStorage.setItem(lastCheckKey, today);

  loadUserStreak();
});


// =========================================
// 6. TO-DO LIST
// =========================================
function loadTodos() {
  const todos = JSON.parse(localStorage.getItem("todos")) || [];
  const list = document.getElementById("todoList");

  list.innerHTML = "";

  todos.forEach((text, index) => {
    const li = document.createElement("li");

    li.innerHTML = `
      <span>${text}</span>
      <button onclick="deleteTodo(${index})" style="background:#ff5e5e; padding:5px 10px; font-size:12px;">Delete</button>
    `;

    list.appendChild(li);
  });
}

// 6.1 Add Task
document.getElementById("addTodo").addEventListener("click", () => {
  const input = document.getElementById("todoInput");
  const text = input.value.trim();

  if (text) {
    const todos = JSON.parse(localStorage.getItem("todos")) || [];
    todos.push(text);

    localStorage.setItem("todos", JSON.stringify(todos));

    input.value = "";
    loadTodos();
  }
});

// 6.2 Enter Key Support
document.getElementById("todoInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    document.getElementById("addTodo").click();
  }
});

// 6.3 Delete Task
function deleteTodo(index) {
  const todos = JSON.parse(localStorage.getItem("todos")) || [];
  todos.splice(index, 1);

  localStorage.setItem("todos", JSON.stringify(todos));
  loadTodos();
}


// =========================================
// 7. POMODORO TIMER
// =========================================
let timeLeft = 25 * 60;
let timerInterval = null;

const timerDisplay = document.querySelector(".pomodoro-timer");

// 7.1 Update Timer Display
function updateTimerDisplay() {
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;

  timerDisplay.textContent =
    `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// 7.2 Mode Switching
document.querySelectorAll(".pomodoro-nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {

    document.querySelectorAll(".pomodoro-nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".pomodoro-screen").forEach(s => s.classList.remove("active"));

    btn.classList.add("active");

    const mode = btn.dataset.pomodoroMode;
    document.getElementById(mode + "Screen").classList.add("active");

    clearInterval(timerInterval);
    timerInterval = null;

    if (mode === "pomodoro") timeLeft = 25 * 60;
    else if (mode === "shortBreak") timeLeft = 5 * 60;
    else if (mode === "longBreak") timeLeft = 15 * 60;

    updateTimerDisplay();
  });
});

// 7.3 Timer Controls (Start / Pause / Reset)
document.addEventListener("click", (e) => {
  const target = e.target;

  // Start
  if (target.id?.toLowerCase().includes("start")) {
    if (timerInterval) return;

    timerInterval = setInterval(() => {
      if (timeLeft > 0) {
        timeLeft--;
        updateTimerDisplay();
      } else {
        clearInterval(timerInterval);
        timerInterval = null;
        alert("Time is up!");
      }
    }, 1000);
  }

  // Pause
  if (target.id?.toLowerCase().includes("pause")) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  // Reset
  if (target.id?.toLowerCase().includes("reset")) {
    clearInterval(timerInterval);
    timerInterval = null;

    const activeBtn = document.querySelector(".pomodoro-nav-btn.active");
    const mode = activeBtn ? activeBtn.dataset.pomodoroMode : "pomodoro";

    if (mode === "pomodoro") timeLeft = 25 * 60;
    else if (mode === "shortBreak") timeLeft = 5 * 60;
    else if (mode === "longBreak") timeLeft = 15 * 60;

    updateTimerDisplay();
  }
});


// =========================================
// 8. DARK MODE
// =========================================
document.getElementById("dark-mode-toggle").addEventListener("click", () => {
  document.body.classList.toggle("dark-mode");

  const isDark = document.body.classList.contains("dark-mode");

  document.getElementById("dark-mode-toggle").textContent =
    isDark ? "Disable Dark Mode" : "Enable Dark Mode";

  localStorage.setItem("theme", isDark ? "dark" : "light");
});

// Load saved theme
if (localStorage.getItem("theme") === "dark") {
  document.body.classList.add("dark-mode");
  document.getElementById("dark-mode-toggle").textContent = "Disable Dark Mode";
}


// =========================================
// 9. PROFILE SETTINGS
// =========================================

// 9.1 Open Settings
document.getElementById("profile-settings").addEventListener("click", () => {

  document.getElementById("editUsername").value =
    document.getElementById("profile-username").textContent;

  document.getElementById("editPhone").value =
    document.getElementById("profile-phone").textContent;

  document.getElementById("editEmail").value =
    document.getElementById("profile-email").textContent;

  showPage("settingsPage");
});

// 9.2 Save Changes
document.getElementById("settingsForm").addEventListener("submit", (e) => {
  e.preventDefault();

  const newName = document.getElementById("editUsername").value;
  const newPhone = document.getElementById("editPhone").value;
  const newEmail = document.getElementById("editEmail").value;

  document.getElementById("profile-username").textContent = newName;
  document.getElementById("profile-phone").textContent = newPhone;
  document.getElementById("profile-email").textContent = newEmail;

  if (currentUser) {
    currentUser.username = newName;
    currentUser.phone = newPhone;
    currentUser.email = newEmail;

    localStorage.setItem("currentUser", JSON.stringify(currentUser));
  }

  alert("Profile updated successfully!");
  showPage("profile");
});

// 9.3 Sync Profile UI
function syncProfileUI() {
  const user = JSON.parse(localStorage.getItem("currentUser"));

  if (user && user.username) {
    document.getElementById("profile-username").textContent = user.username;
    document.getElementById("profile-phone").textContent = user.phone;
    document.getElementById("profile-email").textContent = user.email;
  }
}


// =========================================
// 10. BUDGET TRACKER
// =========================================

// 10.1 Load Budget Tab
document.querySelectorAll(".tabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.dataset.tab === "budget") {
      updateBudgetUI();
    }
  });
});

// 10.2 Update UI
function updateBudgetUI() {
  const transactions = JSON.parse(localStorage.getItem(`budget_${currentUser?.email}`)) || [];

  const list = document.getElementById("transactionList");
  const balanceEl = document.getElementById("totalBalance");
  const incomeEl = document.getElementById("totalIncome");
  const expenseEl = document.getElementById("totalExpense");

  list.innerHTML = "";

  let total = 0, income = 0, expense = 0;

  transactions.forEach((trn, index) => {
    const amount = parseFloat(trn.amount);
    const isIncome = amount > 0;

    total += amount;
    isIncome ? income += amount : expense += amount;

    const li = document.createElement("li");
    li.className = `transaction-item ${isIncome ? 'plus' : 'minus'}`;

    li.innerHTML = `
      <span>${trn.desc}</span>
      <span>${isIncome ? '+' : ''}${amount.toFixed(2)}
        <button onclick="deleteTransaction(${index})" style="background:none; color:#ff5e5e; margin-left:10px; padding:0;">✕</button>
      </span>
    `;

    list.appendChild(li);
  });

  balanceEl.textContent = `$${total.toFixed(2)}`;
  incomeEl.textContent = `+$${income.toFixed(2)}`;
  expenseEl.textContent = `-$${Math.abs(expense).toFixed(2)}`;
}

// 10.3 Add Transaction
document.getElementById("addTransaction").addEventListener("click", () => {

  const desc = document.getElementById("budgetDesc").value.trim();
  const amount = document.getElementById("budgetAmount").value;

  if (desc === "" || amount === "") {
    alert("Please add a description and amount");
    return;
  }

  const transactions = JSON.parse(localStorage.getItem(`budget_${currentUser?.email}`)) || [];

  transactions.push({ desc, amount: parseFloat(amount) });

  localStorage.setItem(`budget_${currentUser?.email}`, JSON.stringify(transactions));

  document.getElementById("budgetDesc").value = "";
  document.getElementById("budgetAmount").value = "";

  updateBudgetUI();
});

// 10.4 Delete Transaction
function deleteTransaction(index) {
  const transactions = JSON.parse(localStorage.getItem(`budget_${currentUser?.email}`)) || [];

  transactions.splice(index, 1);

  localStorage.setItem(`budget_${currentUser?.email}`, JSON.stringify(transactions));
  updateBudgetUI();
}


// =========================================
// 11. ACTIVITY TRACKING & CHART
// =========================================
let sessionStartTime = null;
let activityChart = null;

// 11.1 Start tracking on login
document.getElementById("loginForm").addEventListener("submit", () => {
  sessionStartTime = Date.now();
});

// 11.2 Update Usage
function updateUsageData() {
  if (!isLoggedIn || !sessionStartTime) return;

  const now = Date.now();
  const minutes = Math.floor((now - sessionStartTime) / 60000);

  if (minutes > 0) {
    const today = new Date().toLocaleDateString();

    let usage = JSON.parse(localStorage.getItem(`usage_${currentUser.email}`)) || {};
    usage[today] = (usage[today] || 0) + minutes;

    localStorage.setItem(`usage_${currentUser.email}`, JSON.stringify(usage));

    sessionStartTime = now;
  }
}

// 11.3 Render Chart
function renderActivityChart() {
  updateUsageData();

  const ctx = document.getElementById("activityChart").getContext("2d");
  const usage = JSON.parse(localStorage.getItem(`usage_${currentUser.email}`)) || {};

  const labels = [];
  const data = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);

    const dateStr = d.toLocaleDateString();

    labels.push(d.toLocaleDateString(undefined, { weekday: "short" }));
    data.push(usage[dateStr] || 0);
  }

  document.getElementById("minutesToday").textContent = data[6];

  if (activityChart) activityChart.destroy();

  const isDark = document.body.classList.contains("dark-mode");

  activityChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Minutes Spent",
        data,
        backgroundColor: isDark ? "#82b1ff" : "#2c5aa0",
        borderRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, ticks: { color: isDark ? "#aaa" : "#666" } },
        x: { ticks: { color: isDark ? "#aaa" : "#666" } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

// 11.4 Tab Hook
document.querySelectorAll(".tabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.dataset.tab === "activities") {
      renderActivityChart();
    } else {
      updateUsageData();
    }
  });
});
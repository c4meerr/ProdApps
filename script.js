// =========================================
// 0. FIREBASE INITIALIZATION
// =========================================
// TODO: Replace with your Firebase project config from Firebase Console > Project Settings > Web App
const firebaseConfig = {
  apiKey: "AIzaSyAb8bnSBJf2GWr--MyCyjyEFrHXT1CRD4k",
  authDomain: "minerva-b0f7a.firebaseapp.com",
  projectId: "minerva-b0f7a",
  storageBucket: "minerva-b0f7a.firebasestorage.app",
  messagingSenderId: "1041398854247",
  appId: "1:1041398854247:web:381f9090c7e27af4eb9ac2"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();


// =========================================
// 0b. FIRESTORE SYNC HELPERS
// =========================================
let firestoreReady = false; // tracks whether we've confirmed a successful write

function getUserDocRef() {
  const user = auth.currentUser;
  if (!user) return null;
  return db.collection("users").doc(user.uid);
}

// Save a field (or merge object) into the user's Firestore document
function saveFieldToCloud(data) {
  const ref = getUserDocRef();
  if (!ref) return Promise.resolve();
  return ref.set(data, { merge: true })
    .then(() => { firestoreReady = true; })
    .catch(err => console.error("Firestore save error:", err.code, err.message));
}

// Save a todo list to a subcollection document
function saveTodosToCloud(key, tasks) {
  const ref = getUserDocRef();
  if (!ref) return Promise.resolve();
  const safeKey = encodeURIComponent(key);
  return ref.collection("todos").doc(safeKey).set({ tasks })
    .catch(err => console.error("Firestore todos save error:", err.code, err.message));
}

// Load all user data from Firestore into localStorage on login
async function loadAllFromCloud(uid, email) {
  try {
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) return false; // signal: no doc found
    const data = userDoc.data();

    // Restore profile into localStorage cache
    if (data.xp !== undefined) localStorage.setItem(`xp_${email}`, data.xp);
    if (data.streak !== undefined) localStorage.setItem(`streak_${email}`, data.streak);
    if (data.lastCheckIn) localStorage.setItem(`lastCheck_${email}`, data.lastCheckIn);
    if (data.badges) localStorage.setItem(`badges_${email}`, JSON.stringify(data.badges));
    if (data.projects) localStorage.setItem(`projects_${email}`, JSON.stringify(data.projects));
    if (data.transactions) localStorage.setItem(`budget_${email}`, JSON.stringify(data.transactions));
    if (data.habits) localStorage.setItem(`habits_${email}`, JSON.stringify(data.habits));
    if (data.usage) localStorage.setItem(`usage_${email}`, JSON.stringify(data.usage));
    if (data.taskLog) localStorage.setItem(`tasklog_${email}`, JSON.stringify(data.taskLog));
    if (data.xpLog) localStorage.setItem(`xplog_${email}`, JSON.stringify(data.xpLog));
    if (data.pomodoroSessions !== undefined) pomodoroSessionsCompleted = data.pomodoroSessions;
    if (data.theme) {
      localStorage.setItem("theme", data.theme);
      if (data.theme === "dark") {
        document.body.classList.add("dark-mode");
        document.getElementById("dark-mode-toggle").textContent = "Disable Dark Mode";
      }
    }

    // Restore userdata cache (profile info used for currentUser)
    const userProfile = {
      email: data.email || email,
      username: data.username || email.split("@")[0],
      phone: data.phone || "",
      plan: data.plan || "free"
    };
    localStorage.setItem(`userdata_${email}`, JSON.stringify(userProfile));
    localStorage.setItem("currentUser", JSON.stringify(userProfile));

    // Restore todos from subcollection
    const todosSnap = await db.collection("users").doc(uid).collection("todos").get();
    todosSnap.forEach(doc => {
      const decodedKey = decodeURIComponent(doc.id);
      const docData = doc.data();
      if (docData.tasks) {
        localStorage.setItem(decodedKey, JSON.stringify(docData.tasks));
      }
    });

    // Restore leaderboard entry
    if (data.xp !== undefined) localStorage.setItem(`lb_xp_${email}`, data.xp);

    // Restore avatar
    if (data.avatarUrl) localStorage.setItem(`avatar_${email}`, data.avatarUrl);

    firestoreReady = true;
    return true; // signal: doc found and loaded
  } catch (err) {
    console.error("Error loading from Firestore:", err.code, err.message);
    return false;
  }
}

// Build the full data object from localStorage for saving to Firestore
function buildCloudData() {
  if (!currentUser) return null;
  const email = currentUser.email;
  return {
    email: currentUser.email,
    username: currentUser.username || email.split("@")[0],
    phone: currentUser.phone || "",
    plan: currentUser.plan || "free",
    xp: parseInt(localStorage.getItem(`xp_${email}`) || "0"),
    streak: parseInt(localStorage.getItem(`streak_${email}`) || "0"),
    lastCheckIn: localStorage.getItem(`lastCheck_${email}`) || "",
    badges: JSON.parse(localStorage.getItem(`badges_${email}`) || "[]"),
    projects: JSON.parse(localStorage.getItem(`projects_${email}`) || '["Default"]'),
    transactions: JSON.parse(localStorage.getItem(`budget_${email}`) || "[]"),
    habits: JSON.parse(localStorage.getItem(`habits_${email}`) || "[]"),
    usage: JSON.parse(localStorage.getItem(`usage_${email}`) || "{}"),
    taskLog: JSON.parse(localStorage.getItem(`tasklog_${email}`) || "{}"),
    xpLog: JSON.parse(localStorage.getItem(`xplog_${email}`) || "{}"),
    pomodoroSessions: pomodoroSessionsCompleted,
    avatarUrl: localStorage.getItem(`avatar_${email}`) || "",
    theme: localStorage.getItem("theme") || "light",
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
}

// Save all current user data to Firestore (full sync) — returns a Promise
function syncAllToCloud() {
  if (!currentUser || !auth.currentUser) return Promise.resolve();
  const data = buildCloudData();
  if (!data) return Promise.resolve();

  const userSave = saveFieldToCloud(data);

  const leaderboardSave = db.collection("leaderboard").doc(auth.currentUser.uid).set({
    email: data.email,
    username: data.username,
    plan: data.plan,
    xp: data.xp,
    level: getLevelFromXP(data.xp)
  }, { merge: true }).catch(err => console.error("Leaderboard sync error:", err.code, err.message));

  return Promise.all([userSave, leaderboardSave]);
}

// Ensure user doc exists in Firestore — creates it if missing
async function ensureUserDocInCloud(uid, email) {
  try {
    const docRef = db.collection("users").doc(uid);
    const doc = await docRef.get();
    if (!doc.exists) {
      // No doc in Firestore — create one from current state
      const data = buildCloudData() || {
        email,
        username: email.split("@")[0],
        phone: "",
        plan: "free",
        xp: 0, streak: 0, lastCheckIn: "",
        badges: [], projects: ["Default"], transactions: [], habits: [],
        usage: {}, taskLog: {}, xpLog: {},
        pomodoroSessions: 0, theme: "light",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await docRef.set(data);
      console.log("Created missing user doc in Firestore");
    }
    firestoreReady = true;
  } catch (err) {
    console.error("ensureUserDocInCloud error:", err.code, err.message);
  }
}


// =========================================
// 1. GLOBAL STATE & INITIALIZATION
// =========================================
let currentUser = null;
let isLoggedIn = false;
let userPlan = "free";

document.addEventListener("DOMContentLoaded", () => {
  showPage("loginPage");

  if (localStorage.getItem("theme") === "dark") {
    document.body.classList.add("dark-mode");
    document.getElementById("dark-mode-toggle").textContent = "Disable Dark Mode";
  }

  document.getElementById("plannerDate").value = new Date().toISOString().split("T")[0];

  document.querySelectorAll('input[name="plan"]').forEach(radio => {
    radio.addEventListener("change", () => {
      document.querySelectorAll(".plan-card").forEach(c => c.classList.remove("selected"));
      radio.closest(".plan-card").classList.add("selected");
    });
  });

  initFocusSounds();

  // Firebase Auth state listener — handles page refreshes & persisted sessions
  auth.onAuthStateChanged(async (user) => {
    if (user && !isLoggedIn) {
      const email = user.email;

      // Load all data from Firestore into localStorage
      const loaded = await loadAllFromCloud(user.uid, email);

      // If no Firestore doc existed, create one now
      if (!loaded) {
        await ensureUserDocInCloud(user.uid, email);
      }

      // Reconstruct currentUser from localStorage (populated by loadAllFromCloud)
      const saved = localStorage.getItem(`userdata_${email}`);
      if (saved) {
        currentUser = JSON.parse(saved);
      } else {
        currentUser = { email, username: email.split("@")[0], plan: "free" };
        localStorage.setItem(`userdata_${email}`, JSON.stringify(currentUser));
      }
      userPlan = currentUser.plan || "free";
      isLoggedIn = true;
      localStorage.setItem("currentUser", JSON.stringify(currentUser));
      sessionStartTime = Date.now();
      showPage("dashboard");
    } else if (!user) {
      // User signed out or no session — show login page
      isLoggedIn = false;
      currentUser = null;
      userPlan = "free";
    }
  });
});


// =========================================
// 2. PAGE NAVIGATION SYSTEM
// =========================================
function showPage(pageId) {
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  const targetPage = document.getElementById(pageId);
  if (!targetPage) return;
  targetPage.classList.add("active");

  if (pageId === "dashboard") {
    loadUserStreak();
    loadProjects();
    updateXPBar();
    applyPlanUI();
  }
  if (pageId === "leaderboardPage") renderLeaderboard();
  if (pageId === "profile") {
    syncProfileUI();
    updateProfileXP();
    applyProfilePlanUI();
  }
}


// =========================================
// 3. PLAN SYSTEM
// =========================================
function isPro() { return userPlan === "pro"; }

function applyPlanUI() {
  const proTabs = ["habitsTabBtn", "focusTabBtn", "analyticsTabBtn"];
  proTabs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isPro() ? "" : "none";
  });

  const badge = document.getElementById("proBadgeHeader");
  if (badge) badge.style.display = isPro() ? "block" : "none";
}

function applyProfilePlanUI() {
  const planBadge = document.getElementById("profile-plan-badge");
  const upgradeBtn = document.getElementById("upgradePlanBtn");

  if (planBadge) {
    planBadge.textContent = isPro() ? "⭐ Student Pro" : "Free Plan";
    planBadge.className = "profile-plan-badge" + (isPro() ? " pro" : "");
  }
  if (upgradeBtn) upgradeBtn.style.display = isPro() ? "none" : "";
}

// Upgrade modal
document.addEventListener("click", (e) => {
  if (e.target.id === "upgradePlanBtn" || e.target.id === "modalUpgradeBtn") {
    if (e.target.id === "upgradePlanBtn") {
      document.getElementById("upgradeModal").style.display = "flex";
    } else {
      userPlan = "pro";
      if (currentUser) {
        currentUser.plan = "pro";
        localStorage.setItem("currentUser", JSON.stringify(currentUser));
        localStorage.setItem(`userdata_${currentUser.email}`, JSON.stringify(currentUser));
        saveFieldToCloud({ plan: "pro" });
      }
      document.getElementById("upgradeModal").style.display = "none";
      applyPlanUI();
      applyProfilePlanUI();
      showXPToast("⭐ Welcome to Student Pro!", true);
    }
  }
  if (e.target.id === "modalCloseBtn") {
    document.getElementById("upgradeModal").style.display = "none";
  }
});


// =========================================
// 4. AUTHENTICATION (Firebase Auth)
// =========================================
document.getElementById("goToSignup").addEventListener("click", (e) => {
  e.preventDefault();
  clearAuthErrors();
  showPage("signupPage");
});
document.getElementById("goToLogin").addEventListener("click", (e) => {
  e.preventDefault();
  clearAuthErrors();
  showPage("loginPage");
});

function showAuthError(elementId, message) {
  let el = document.getElementById(elementId);
  if (!el) {
    el = document.createElement("p");
    el.id = elementId;
    el.style.cssText = "color:#e74c3c; font-size:0.82rem; text-align:center; margin-top:-8px; font-weight:600;";
  }
  el.textContent = message;
  return el;
}

function clearAuthErrors() {
  ["loginError", "signupError"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });
}

// Friendly error messages from Firebase error codes
function getAuthErrorMessage(errorCode) {
  switch (errorCode) {
    case "auth/user-not-found": return "No account found with this email. Please sign up first.";
    case "auth/wrong-password": return "Incorrect password. Please try again.";
    case "auth/invalid-credential": return "Invalid email or password. Please try again.";
    case "auth/email-already-in-use": return "An account with this email already exists. Please log in.";
    case "auth/weak-password": return "Password must be at least 6 characters.";
    case "auth/invalid-email": return "Please enter a valid email address.";
    case "auth/too-many-requests": return "Too many attempts. Please wait a moment and try again.";
    case "auth/network-request-failed": return "Network error. Check your internet connection.";
    case "auth/operation-not-allowed": return "Email/password sign-in is not enabled. Enable it in Firebase Console > Authentication > Sign-in method.";
    case "auth/api-key-not-valid.-please-pass-a-valid-api-key.": return "Invalid Firebase API key. Check your firebaseConfig.";
    default: return `Error: ${errorCode || "Unknown error"}. Check browser console for details.`;
  }
}

// --- LOGIN ---
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const password = document.getElementById("loginPassword").value;

  const prevErr = document.getElementById("loginError");
  if (prevErr) prevErr.remove();

  // Disable button while logging in
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = "Signing in...";

  try {
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    const user = userCredential.user;

    // Load data from Firestore into localStorage
    const loaded = await loadAllFromCloud(user.uid, email);

    // If no Firestore doc existed (e.g. signup write failed), create one now
    if (!loaded) {
      await ensureUserDocInCloud(user.uid, email);
    }

    // Reconstruct currentUser from localStorage (populated by loadAllFromCloud)
    const saved = localStorage.getItem(`userdata_${email}`);
    if (saved) {
      currentUser = JSON.parse(saved);
    } else {
      currentUser = { email, username: email.split("@")[0], plan: "free" };
      localStorage.setItem(`userdata_${email}`, JSON.stringify(currentUser));
    }

    userPlan = currentUser.plan || "free";
    isLoggedIn = true;

    localStorage.setItem("currentUser", JSON.stringify(currentUser));
    localStorage.setItem("isLoggedIn", "true");
    localStorage.setItem("lastUserEmail", email);

    registerUserInLeaderboard(email);
    sessionStartTime = Date.now();
    showPage("dashboard");
  } catch (error) {
    console.error("Login error:", error.code, error.message);
    const errEl = showAuthError("loginError", getAuthErrorMessage(error.code));
    document.getElementById("loginForm").appendChild(errEl);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Sign in";
  }
});

// --- SIGNUP ---
document.getElementById("signupForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("signupEmail").value.trim().toLowerCase();
  const password = document.getElementById("signupPassword").value;
  const selectedPlan = document.querySelector('input[name="plan"]:checked')?.value || "free";

  const prevErr = document.getElementById("signupError");
  if (prevErr) prevErr.remove();

  if (password.length < 6) {
    const err = showAuthError("signupError", "Password must be at least 6 characters.");
    document.getElementById("signupForm").appendChild(err);
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = "Creating account...";

  try {
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;

    // Save initial user profile to Firestore (non-blocking — don't let this fail signup)
    const newUserData = {
      email,
      username: email.split("@")[0],
      phone: "",
      plan: selectedPlan,
      xp: 0,
      streak: 0,
      lastCheckIn: "",
      badges: [],
      projects: ["Default"],
      transactions: [],
      habits: [],
      usage: {},
      taskLog: {},
      xpLog: {},
      pomodoroSessions: 0,
      theme: "light",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    try {
      await db.collection("users").doc(user.uid).set(newUserData);
    } catch (firestoreErr) {
      console.warn("Firestore profile save failed (will retry on login):", firestoreErr);
    }

    // Also save locally
    const localUser = { email, username: email.split("@")[0], plan: selectedPlan };
    localStorage.setItem(`userdata_${email}`, JSON.stringify(localUser));

    // Sign out so user goes through login flow
    await auth.signOut();

    alert(`Account created with ${selectedPlan === "pro" ? "Student Pro ⭐" : "Free"} plan! Please log in.`);
    clearAuthErrors();
    showPage("loginPage");
  } catch (error) {
    console.error("Signup error:", error.code, error.message);
    const errEl = showAuthError("signupError", getAuthErrorMessage(error.code));
    document.getElementById("signupForm").appendChild(errEl);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Create account";
  }
});

// --- LOGOUT ---
["logoutBtn", "logout"].forEach(id => {
  const btn = document.getElementById(id);
  if (btn) {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();

      // Sync ALL data to Firestore before signing out — await it
      try {
        await syncAllToCloud();
      } catch (err) {
        console.error("Pre-logout sync error:", err);
      }

      try {
        await auth.signOut();
      } catch (err) {
        console.error("Sign out error:", err);
      }

      localStorage.removeItem("isLoggedIn");
      isLoggedIn = false;
      currentUser = null;
      userPlan = "free";
      firestoreReady = false;
      clearAuthErrors();
      showPage("loginPage");
    });
  }
});


// =========================================
// 5. DASHBOARD UI (MENU & TABS)
// =========================================
const menuBtn = document.getElementById("menuBtn");
const menuDropdown = document.getElementById("menuDropdown");

menuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  menuDropdown.classList.toggle("active");
});

document.addEventListener("click", (e) => {
  if (!menuBtn.contains(e.target) && !menuDropdown.contains(e.target)) {
    menuDropdown.classList.remove("active");
  }
});

document.querySelectorAll(".tabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.classList.contains("pro-tab") && !isPro()) {
      document.getElementById("upgradeModal").style.display = "flex";
      return;
    }

    document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    const tab = document.getElementById(btn.dataset.tab);
    if (tab) tab.classList.add("active");

    if (btn.dataset.tab === "badges") renderBadges();
    if (btn.dataset.tab === "activities") renderActivityChart();
    if (btn.dataset.tab === "budget") updateBudgetUI();
    if (btn.dataset.tab === "habits") renderHabits();
    if (btn.dataset.tab === "analytics") renderAnalytics();
    if (btn.dataset.tab === "focusMode") renderFocusTab();
  });
});


// =========================================
// 6. PROJECT SYSTEM (Free: max 3, Pro: unlimited)
// =========================================
function getProjectsKey() { return `projects_${currentUser?.email}`; }
function getProjects() { return JSON.parse(localStorage.getItem(getProjectsKey())) || ["Default"]; }
function saveProjects(arr) {
  localStorage.setItem(getProjectsKey(), JSON.stringify(arr));
  saveFieldToCloud({ projects: arr });
}

function getCurrentProject() {
  const sel = document.getElementById("projectSelect");
  return sel ? sel.value : "Default";
}

function loadProjects() {
  const projects = getProjects();
  const sel = document.getElementById("projectSelect");
  if (!sel) return;
  sel.innerHTML = "";
  projects.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p; opt.textContent = p;
    sel.appendChild(opt);
  });
  loadTodos();
}

document.getElementById("addProjectBtn").addEventListener("click", () => {
  const projects = getProjects();
  if (!isPro() && projects.length >= 3) {
    document.getElementById("projectLimitNote").style.display = "block";
    document.getElementById("upgradeModal").style.display = "flex";
    return;
  }
  document.getElementById("projectLimitNote").style.display = "none";
  const name = prompt("Project name:");
  if (name && name.trim()) {
    projects.push(name.trim());
    saveProjects(projects);
    loadProjects();
    document.getElementById("projectSelect").value = name.trim();
    loadTodos();
  }
});

document.getElementById("deleteProjectBtn").addEventListener("click", () => {
  const projects = getProjects();
  const cur = getCurrentProject();
  if (cur === "Default") { alert("Cannot delete Default project."); return; }
  if (!confirm(`Delete project "${cur}"?`)) return;
  const updated = projects.filter(p => p !== cur);
  saveProjects(updated);
  loadProjects();
});

document.getElementById("projectSelect").addEventListener("change", loadTodos);


// =========================================
// 7. STREAK SYSTEM
// =========================================
function loadUserStreak() {
  if (!currentUser) return;
  const streakKey = `streak_${currentUser.email}`;
  const lastCheckKey = `lastCheck_${currentUser.email}`;
  const savedStreak = localStorage.getItem(streakKey) || "0";
  const lastCheckIn = localStorage.getItem(lastCheckKey);
  const today = new Date().toDateString();

  document.getElementById("streakCount").textContent = savedStreak;
  const btn = document.getElementById("checkInBtn");
  if (lastCheckIn === today) {
    btn.disabled = true; btn.textContent = "Checked in today ✅";
  } else {
    btn.disabled = false; btn.textContent = "Tap to Check In Today";
  }
}

document.getElementById("checkInBtn").addEventListener("click", () => {
  if (!currentUser) return;
  const streakKey = `streak_${currentUser.email}`;
  const lastCheckKey = `lastCheck_${currentUser.email}`;
  const today = new Date().toDateString();
  let streak = parseInt(localStorage.getItem(streakKey) || "0");
  streak++;
  localStorage.setItem(streakKey, streak);
  localStorage.setItem(lastCheckKey, today);
  saveFieldToCloud({ streak, lastCheckIn: today });
  awardXP(10, "Daily Check-in");
  checkStreakBadges(streak);
  loadUserStreak();
  markHabitDailyCheckIn();
});


// =========================================
// 8. TO-DO LIST (with daily planner date)
// =========================================
function getTodosKey() {
  const project = getCurrentProject();
  const date = document.getElementById("plannerDate")?.value || "";
  return `todos_${currentUser?.email}_${project}_${date}`;
}

function loadTodos() {
  if (!currentUser) return;
  const todos = JSON.parse(localStorage.getItem(getTodosKey())) || [];
  const list = document.getElementById("todoList");
  list.innerHTML = "";

  todos.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = item.done ? "todo-done" : "";
    li.innerHTML = `
      <span class="todo-text" onclick="toggleTodo(${index})" style="cursor:pointer; flex:1; text-decoration:${item.done ? 'line-through' : 'none'}; color:${item.done ? '#aaa' : 'inherit'}">${item.text}</span>
      <div style="display:flex; gap:5px;">
        ${!item.done ? `<button onclick="completeTodo(${index})" style="background:#2ecc71; padding:5px 10px; font-size:12px;">✓</button>` : ''}
        <button onclick="deleteTodo(${index})" style="background:#ff5e5e; padding:5px 10px; font-size:12px;">Delete</button>
      </div>
    `;
    list.appendChild(li);
  });
}

document.getElementById("plannerDate").addEventListener("change", loadTodos);

document.getElementById("addTodo").addEventListener("click", () => {
  const input = document.getElementById("todoInput");
  const text = input.value.trim();
  if (text) {
    const key = getTodosKey();
    const todos = JSON.parse(localStorage.getItem(key)) || [];
    todos.push({ text, done: false });
    localStorage.setItem(key, JSON.stringify(todos));
    saveTodosToCloud(key, todos);
    input.value = "";
    loadTodos();
  }
});

document.getElementById("todoInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter") document.getElementById("addTodo").click();
});

function completeTodo(index) {
  const key = getTodosKey();
  const todos = JSON.parse(localStorage.getItem(key)) || [];
  if (!todos[index].done) {
    todos[index].done = true;
    localStorage.setItem(key, JSON.stringify(todos));
    saveTodosToCloud(key, todos);
    awardXP(20, "Task Completed");
    const doneTasks = todos.filter(t => t.done).length;
    checkTaskBadges(doneTasks);
    logDailyTaskCompletion();
    loadTodos();
  }
}

function deleteTodo(index) {
  const key = getTodosKey();
  const todos = JSON.parse(localStorage.getItem(key)) || [];
  todos.splice(index, 1);
  localStorage.setItem(key, JSON.stringify(todos));
  saveTodosToCloud(key, todos);
  loadTodos();
}

function logDailyTaskCompletion() {
  if (!currentUser) return;
  const today = new Date().toLocaleDateString();
  let taskLog = JSON.parse(localStorage.getItem(`tasklog_${currentUser.email}`)) || {};
  taskLog[today] = (taskLog[today] || 0) + 1;
  localStorage.setItem(`tasklog_${currentUser.email}`, JSON.stringify(taskLog));
  saveFieldToCloud({ taskLog });
}


// =========================================
// 9. POMODORO TIMER
// =========================================
let timeLeft = 25 * 60;
let timerInterval = null;
let pomodoroSessionsCompleted = 0;

const timerDisplay = document.querySelector(".pomodoro-timer");

function updateTimerDisplay() {
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  timerDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

document.querySelectorAll(".pomodoro-nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".pomodoro-nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".pomodoro-screen").forEach(s => s.classList.remove("active"));
    btn.classList.add("active");
    const mode = btn.dataset.pomodoroMode;
    document.getElementById(mode + "Screen").classList.add("active");
    clearInterval(timerInterval); timerInterval = null;
    if (mode === "pomodoro") timeLeft = 25 * 60;
    else if (mode === "shortBreak") timeLeft = 5 * 60;
    else if (mode === "longBreak") timeLeft = 15 * 60;
    updateTimerDisplay();
  });
});

document.addEventListener("click", (e) => {
  const target = e.target;
  if (target.id?.toLowerCase().includes("start") && target.closest(".pomodoro-panel")) {
    if (timerInterval) return;
    timerInterval = setInterval(() => {
      if (timeLeft > 0) {
        timeLeft--;
        updateTimerDisplay();
      } else {
        clearInterval(timerInterval); timerInterval = null;
        const activeBtn = document.querySelector(".pomodoro-nav-btn.active");
        const mode = activeBtn ? activeBtn.dataset.pomodoroMode : "pomodoro";
        if (mode === "pomodoro") {
          pomodoroSessionsCompleted++;
          awardXP(30, "Pomodoro Session Done 🍅");
          checkPomodoroBadges(pomodoroSessionsCompleted);
          saveFieldToCloud({ pomodoroSessions: pomodoroSessionsCompleted });
        }
        alert("Time is up!");
      }
    }, 1000);
  }

  if (target.id?.toLowerCase().includes("pause") && target.closest(".pomodoro-panel")) {
    clearInterval(timerInterval); timerInterval = null;
  }

  if (target.id?.toLowerCase().includes("reset") && target.closest(".pomodoro-panel")) {
    clearInterval(timerInterval); timerInterval = null;
    const activeBtn = document.querySelector(".pomodoro-nav-btn.active");
    const mode = activeBtn ? activeBtn.dataset.pomodoroMode : "pomodoro";
    if (mode === "pomodoro") timeLeft = 25 * 60;
    else if (mode === "shortBreak") timeLeft = 5 * 60;
    else if (mode === "longBreak") timeLeft = 15 * 60;
    updateTimerDisplay();
  }
});


// =========================================
// 10. DARK MODE
// =========================================
document.getElementById("dark-mode-toggle").addEventListener("click", () => {
  document.body.classList.toggle("dark-mode");
  const isDark = document.body.classList.contains("dark-mode");
  document.getElementById("dark-mode-toggle").textContent = isDark ? "Disable Dark Mode" : "Enable Dark Mode";
  localStorage.setItem("theme", isDark ? "dark" : "light");
  saveFieldToCloud({ theme: isDark ? "dark" : "light" });
});


// =========================================
// 11. PROFILE SETTINGS & AVATAR
// =========================================
document.getElementById("profile-settings").addEventListener("click", () => {
  document.getElementById("editUsername").value = document.getElementById("profile-username").textContent;
  document.getElementById("editPhone").value = document.getElementById("profile-phone").textContent;
  document.getElementById("editEmail").value = document.getElementById("profile-email").textContent;
  showPage("settingsPage");
});

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
    localStorage.setItem(`userdata_${currentUser.email}`, JSON.stringify(currentUser));
    saveFieldToCloud({ username: newName, phone: newPhone });
  }
  alert("Profile updated successfully!");
  showPage("profile");
});

function syncProfileUI() {
  const user = JSON.parse(localStorage.getItem("currentUser"));
  if (user) {
    if (user.username) document.getElementById("profile-username").textContent = user.username;
    if (user.phone) document.getElementById("profile-phone").textContent = user.phone;
    if (user.email) document.getElementById("profile-email").textContent = user.email;
  }
  // Restore avatar
  loadAvatar();
}

// --- Profile Picture ---
const DEFAULT_AVATAR = "Default_pfp.avif";

document.getElementById("avatarWrapper").addEventListener("click", () => {
  document.getElementById("avatarInput").click();
});

document.getElementById("avatarInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // Validate: images only, max 2MB
  if (!file.type.startsWith("image/")) {
    alert("Please select an image file.");
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    alert("Image is too large. Please choose an image under 2MB.");
    return;
  }

  const reader = new FileReader();
  reader.onload = (ev) => {
    const dataUrl = ev.target.result;
    document.getElementById("profile-avatar").src = dataUrl;

    // Save to localStorage (keyed per user)
    if (currentUser) {
      localStorage.setItem(`avatar_${currentUser.email}`, dataUrl);
      // Save to Firestore (base64 data URL — works for small images)
      saveFieldToCloud({ avatarUrl: dataUrl });
    }
  };
  reader.readAsDataURL(file);
});

function loadAvatar() {
  const avatarEl = document.getElementById("profile-avatar");
  if (!currentUser) {
    avatarEl.src = DEFAULT_AVATAR;
    return;
  }
  const saved = localStorage.getItem(`avatar_${currentUser.email}`);
  avatarEl.src = saved || DEFAULT_AVATAR;
}


// =========================================
// 12. BUDGET TRACKER
// =========================================
function updateBudgetUI() {
  const transactions = JSON.parse(localStorage.getItem(`budget_${currentUser?.email}`)) || [];
  const list = document.getElementById("transactionList");
  list.innerHTML = "";
  let total = 0, income = 0, expense = 0;

  transactions.forEach((trn, index) => {
    const amount = parseFloat(trn.amount);
    const isIncome = amount > 0;
    total += amount; isIncome ? income += amount : expense += amount;
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

  document.getElementById("totalBalance").textContent = `$${total.toFixed(2)}`;
  document.getElementById("totalIncome").textContent = `+$${income.toFixed(2)}`;
  document.getElementById("totalExpense").textContent = `-$${Math.abs(expense).toFixed(2)}`;
}

document.getElementById("addTransaction").addEventListener("click", () => {
  const desc = document.getElementById("budgetDesc").value.trim();
  const amount = document.getElementById("budgetAmount").value;
  if (!desc || !amount) { alert("Please add a description and amount"); return; }
  const transactions = JSON.parse(localStorage.getItem(`budget_${currentUser?.email}`)) || [];
  transactions.push({ desc, amount: parseFloat(amount) });
  localStorage.setItem(`budget_${currentUser?.email}`, JSON.stringify(transactions));
  saveFieldToCloud({ transactions });
  document.getElementById("budgetDesc").value = "";
  document.getElementById("budgetAmount").value = "";
  updateBudgetUI();
});

function deleteTransaction(index) {
  const transactions = JSON.parse(localStorage.getItem(`budget_${currentUser?.email}`)) || [];
  transactions.splice(index, 1);
  localStorage.setItem(`budget_${currentUser?.email}`, JSON.stringify(transactions));
  saveFieldToCloud({ transactions });
  updateBudgetUI();
}


// =========================================
// 13. ACTIVITY TRACKING & CHART
// =========================================
let sessionStartTime = null;
let activityChart = null;

function updateUsageData() {
  if (!isLoggedIn || !sessionStartTime) return;
  const now = Date.now();
  const minutes = Math.floor((now - sessionStartTime) / 60000);
  if (minutes > 0) {
    const today = new Date().toLocaleDateString();
    let usage = JSON.parse(localStorage.getItem(`usage_${currentUser.email}`)) || {};
    usage[today] = (usage[today] || 0) + minutes;
    localStorage.setItem(`usage_${currentUser.email}`, JSON.stringify(usage));
    saveFieldToCloud({ usage });
    sessionStartTime = now;
  }
}

function renderActivityChart() {
  updateUsageData();
  const ctx = document.getElementById("activityChart").getContext("2d");
  const usage = JSON.parse(localStorage.getItem(`usage_${currentUser.email}`)) || {};
  const labels = [], data = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
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
      datasets: [{ label: "Minutes Spent", data, backgroundColor: isDark ? "#82b1ff" : "#2c5aa0", borderRadius: 5 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, ticks: { color: isDark ? "#aaa" : "#666" } },
        x: { ticks: { color: isDark ? "#aaa" : "#666" } }
      },
      plugins: { legend: { display: false } }
    }
  });
}


// =========================================
// 14. GAMIFICATION — XP & LEVELING
// =========================================
const XP_PER_LEVEL = [0, 100, 250, 500, 900, 1400, 2000, 2750, 3700, 4900, 6500];

function getXPKey() { return `xp_${currentUser?.email}`; }
function getTotalXP() { return parseInt(localStorage.getItem(getXPKey()) || "0"); }

function getLevelFromXP(xp) {
  let level = 1;
  for (let i = 1; i < XP_PER_LEVEL.length; i++) {
    if (xp >= XP_PER_LEVEL[i]) level = i + 1;
    else break;
  }
  return Math.min(level, XP_PER_LEVEL.length);
}

function getXPForNextLevel(level) { return XP_PER_LEVEL[level] ?? XP_PER_LEVEL[XP_PER_LEVEL.length - 1]; }
function getXPForCurrentLevel(level) { return XP_PER_LEVEL[level - 1] ?? 0; }

function awardXP(amount, reason) {
  if (!currentUser) return;
  let xp = getTotalXP();
  const oldLevel = getLevelFromXP(xp);
  xp += amount;
  localStorage.setItem(getXPKey(), xp);
  saveFieldToCloud({ xp });
  const newLevel = getLevelFromXP(xp);
  showXPToast(`+${amount} XP — ${reason}`);
  if (newLevel > oldLevel) setTimeout(() => showXPToast(`🎉 Level Up! You are now Level ${newLevel}!`, true), 1200);
  updateXPBar();
  updateLeaderboardScore();
  logDailyXP(amount);
}

function logDailyXP(amount) {
  if (!currentUser) return;
  const today = new Date().toLocaleDateString();
  let xpLog = JSON.parse(localStorage.getItem(`xplog_${currentUser.email}`)) || {};
  xpLog[today] = (xpLog[today] || 0) + amount;
  localStorage.setItem(`xplog_${currentUser.email}`, JSON.stringify(xpLog));
  saveFieldToCloud({ xpLog });
}

function updateXPBar() {
  if (!currentUser) return;
  const xp = getTotalXP();
  const level = getLevelFromXP(xp);
  const xpCurrent = getXPForCurrentLevel(level);
  const xpNext = getXPForNextLevel(level);
  const progress = xpNext > xpCurrent ? ((xp - xpCurrent) / (xpNext - xpCurrent)) * 100 : 100;
  document.getElementById("levelBadge").textContent = `Lv.${level}`;
  document.getElementById("xpDisplay").textContent = xp;
  document.getElementById("xpNextDisplay").textContent = xpNext;
  document.getElementById("xpBarFill").style.width = `${Math.min(progress, 100)}%`;
}

function updateProfileXP() {
  if (!currentUser) return;
  const xp = getTotalXP();
  const level = getLevelFromXP(xp);
  document.getElementById("profile-level-badge").textContent = `Lv.${level}`;
  document.getElementById("profile-xp-text").textContent = `${xp} XP total`;
}

function showXPToast(message, isLevelUp = false) {
  const toast = document.getElementById("xpToast");
  toast.textContent = message;
  toast.className = `xp-toast show${isLevelUp ? " levelup" : ""}`;
  setTimeout(() => { toast.className = "xp-toast"; }, 2500);
}


// =========================================
// 15. GAMIFICATION — BADGES
// =========================================
const ALL_BADGES = [
  { id: "first_task", icon: "✅", name: "First Step", desc: "Complete your first task", condition: (s) => s.tasksDone >= 1 },
  { id: "task_5", icon: "🔥", name: "On a Roll", desc: "Complete 5 tasks", condition: (s) => s.tasksDone >= 5 },
  { id: "task_20", icon: "⚡", name: "Productivity Machine", desc: "Complete 20 tasks", condition: (s) => s.tasksDone >= 20 },
  { id: "streak_3", icon: "🌟", name: "Consistent", desc: "Maintain a 3-day streak", condition: (s) => s.streak >= 3 },
  { id: "streak_7", icon: "🏆", name: "Week Warrior", desc: "Maintain a 7-day streak", condition: (s) => s.streak >= 7 },
  { id: "streak_30", icon: "👑", name: "Streak Legend", desc: "Maintain a 30-day streak", condition: (s) => s.streak >= 30 },
  { id: "pomodoro_1", icon: "🍅", name: "First Pomodoro", desc: "Complete your first Pomodoro session", condition: (s) => s.pomodoros >= 1 },
  { id: "pomodoro_10", icon: "⏱️", name: "Focus Master", desc: "Complete 10 Pomodoro sessions", condition: (s) => s.pomodoros >= 10 },
  { id: "xp_100", icon: "💎", name: "XP Earner", desc: "Earn 100 XP", condition: (s) => s.xp >= 100 },
  { id: "xp_500", icon: "🚀", name: "XP Grinder", desc: "Earn 500 XP", condition: (s) => s.xp >= 500 },
];

function getEarnedBadges() { return JSON.parse(localStorage.getItem(`badges_${currentUser?.email}`)) || []; }

function awardBadge(badgeId) {
  const earned = getEarnedBadges();
  if (earned.includes(badgeId)) return;
  earned.push(badgeId);
  localStorage.setItem(`badges_${currentUser?.email}`, JSON.stringify(earned));
  saveFieldToCloud({ badges: earned });
  const badge = ALL_BADGES.find(b => b.id === badgeId);
  if (badge) setTimeout(() => showXPToast(`${badge.icon} Badge Unlocked: ${badge.name}!`, true), 2000);
}

function getUserStats() {
  if (!currentUser) return {};
  let tasksDone = 0;
  for (let k in localStorage) {
    if (k.startsWith(`todos_${currentUser.email}_`)) {
      const todos = JSON.parse(localStorage.getItem(k)) || [];
      tasksDone += todos.filter(t => t.done).length;
    }
  }
  const streak = parseInt(localStorage.getItem(`streak_${currentUser.email}`) || "0");
  const xp = getTotalXP();
  return { tasksDone, streak, pomodoros: pomodoroSessionsCompleted, xp };
}

function checkTaskBadges(doneTasks) {
  if (doneTasks >= 1) awardBadge("first_task");
  if (doneTasks >= 5) awardBadge("task_5");
  if (doneTasks >= 20) awardBadge("task_20");
  checkXPBadges();
}

function checkStreakBadges(streak) {
  if (streak >= 3) awardBadge("streak_3");
  if (streak >= 7) awardBadge("streak_7");
  if (streak >= 30) awardBadge("streak_30");
}

function checkPomodoroBadges(count) {
  if (count >= 1) awardBadge("pomodoro_1");
  if (count >= 10) awardBadge("pomodoro_10");
  checkXPBadges();
}

function checkXPBadges() {
  const xp = getTotalXP();
  if (xp >= 100) awardBadge("xp_100");
  if (xp >= 500) awardBadge("xp_500");
}

function renderBadges() {
  const earned = getEarnedBadges();
  const grid = document.getElementById("badgeGrid");
  grid.innerHTML = "";
  ALL_BADGES.forEach(badge => {
    const isEarned = earned.includes(badge.id);
    const div = document.createElement("div");
    div.className = `badge-card ${isEarned ? "earned" : "locked"}`;
    div.innerHTML = `
      <div class="badge-icon">${isEarned ? badge.icon : "🔒"}</div>
      <div class="badge-name">${badge.name}</div>
      <div class="badge-desc">${badge.desc}</div>
      ${isEarned ? '<div class="badge-earned-label">Earned ✓</div>' : ''}
    `;
    grid.appendChild(div);
  });
}


// =========================================
// 16. LEADERBOARD (Firestore-powered)
// =========================================
function registerUserInLeaderboard(email) {
  // Also register in localStorage for backwards compat
  let users = JSON.parse(localStorage.getItem("leaderboard_users")) || [];
  if (!users.includes(email)) { users.push(email); localStorage.setItem("leaderboard_users", JSON.stringify(users)); }
}

function updateLeaderboardScore() {
  if (!currentUser) return;
  const xp = getTotalXP();
  localStorage.setItem(`lb_xp_${currentUser.email}`, xp);

  // Update Firestore leaderboard
  if (auth.currentUser) {
    db.collection("leaderboard").doc(auth.currentUser.uid).set({
      email: currentUser.email,
      username: currentUser.username || currentUser.email.split("@")[0],
      plan: currentUser.plan || "free",
      xp: xp,
      level: getLevelFromXP(xp)
    }, { merge: true }).catch(err => console.error("Leaderboard update error:", err));
  }
}

async function renderLeaderboard() {
  const container = document.getElementById("leaderboardList");
  container.innerHTML = "<p style='text-align:center; color:#999; margin-top:20px;'>Loading...</p>";

  try {
    // Try loading from Firestore first for cross-user leaderboard
    const snapshot = await db.collection("leaderboard").orderBy("xp", "desc").limit(50).get();

    if (!snapshot.empty) {
      container.innerHTML = "";
      const medals = ["🥇", "🥈", "🥉"];
      snapshot.docs.forEach((doc, i) => {
        const entry = doc.data();
        const isYou = currentUser && entry.email === currentUser.email;
        const div = document.createElement("div");
        div.className = `leaderboard-entry ${isYou ? "you" : ""}`;
        div.innerHTML = `
          <span class="lb-rank">${medals[i] || `#${i + 1}`}</span>
          <span class="lb-name">${entry.username || entry.email.split("@")[0]}${isYou ? " (You)" : ""}${entry.plan === "pro" ? ' <span class="lb-pro-badge">PRO</span>' : ''}</span>
          <span class="lb-level">Lv.${entry.level || getLevelFromXP(entry.xp)}</span>
          <span class="lb-xp">${entry.xp || 0} XP</span>
        `;
        container.appendChild(div);
      });
      return;
    }
  } catch (err) {
    console.error("Firestore leaderboard error, falling back to localStorage:", err);
  }

  // Fallback to localStorage leaderboard
  const users = JSON.parse(localStorage.getItem("leaderboard_users")) || [];

  const entries = users.map(email => {
    const xp = parseInt(localStorage.getItem(`lb_xp_${email}`) || "0");
    const level = getLevelFromXP(xp);
    const userData = JSON.parse(localStorage.getItem(`userdata_${email}`)) || {};
    const name = userData.username || email.split("@")[0];
    const plan = userData.plan || "free";
    return { email, xp, level, name, plan };
  }).sort((a, b) => b.xp - a.xp);

  container.innerHTML = "";

  if (entries.length === 0) {
    container.innerHTML = `<p style="text-align:center; color:#999; margin-top:20px;">No users yet. Log in to appear here!</p>`;
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];
  entries.forEach((entry, i) => {
    const isYou = currentUser && entry.email === currentUser.email;
    const div = document.createElement("div");
    div.className = `leaderboard-entry ${isYou ? "you" : ""}`;
    div.innerHTML = `
      <span class="lb-rank">${medals[i] || `#${i + 1}`}</span>
      <span class="lb-name">${entry.name}${isYou ? " (You)" : ""}${entry.plan === "pro" ? ' <span class="lb-pro-badge">PRO</span>' : ''}</span>
      <span class="lb-level">Lv.${entry.level}</span>
      <span class="lb-xp">${entry.xp} XP</span>
    `;
    container.appendChild(div);
  });
}


// =========================================
// 17. HABIT TRACKER (PRO)
// =========================================
function getHabitsKey() { return `habits_${currentUser?.email}`; }
function getHabits() { return JSON.parse(localStorage.getItem(getHabitsKey())) || []; }
function saveHabits(habits) {
  localStorage.setItem(getHabitsKey(), JSON.stringify(habits));
  saveFieldToCloud({ habits });
}

document.getElementById("addHabitBtn").addEventListener("click", () => {
  const input = document.getElementById("habitInput");
  const text = input.value.trim();
  if (!text) return;
  const habits = getHabits();
  habits.push({ name: text, log: {} });
  saveHabits(habits);
  input.value = "";
  renderHabits();
});

function markHabitDailyCheckIn() {
  // no-op if no "Daily Check-in" habit exists
}

function renderHabits() {
  const habits = getHabits();
  const container = document.getElementById("habitList");
  container.innerHTML = "";

  if (habits.length === 0) {
    container.innerHTML = `<p style="color:#aaa; text-align:center; margin-top:20px;">No habits yet. Add one above!</p>`;
    return;
  }

  const today = new Date().toLocaleDateString();

  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    last7.push({ label: d.toLocaleDateString(undefined, { weekday: "short" }), key: d.toLocaleDateString() });
  }

  habits.forEach((habit, idx) => {
    const checkedToday = habit.log[today];
    const streak = calcHabitStreak(habit.log);

    const div = document.createElement("div");
    div.className = "habit-card";
    div.innerHTML = `
      <div class="habit-card-top">
        <span class="habit-name">${habit.name}</span>
        <div class="habit-actions">
          <span class="habit-streak">🔥 ${streak} day${streak !== 1 ? "s" : ""}</span>
          <button class="habit-check-btn ${checkedToday ? "checked" : ""}" onclick="toggleHabitToday(${idx})">
            ${checkedToday ? "✓ Done" : "Check In"}
          </button>
          <button onclick="deleteHabit(${idx})" class="habit-delete-btn">✕</button>
        </div>
      </div>
      <div class="habit-calendar">
        ${last7.map(day => `
          <div class="habit-day ${habit.log[day.key] ? "done" : ""}">
            <span class="habit-day-label">${day.label}</span>
            <span class="habit-day-dot"></span>
          </div>
        `).join("")}
      </div>
    `;
    container.appendChild(div);
  });
}

function toggleHabitToday(idx) {
  const habits = getHabits();
  const today = new Date().toLocaleDateString();
  if (habits[idx].log[today]) {
    delete habits[idx].log[today];
  } else {
    habits[idx].log[today] = true;
    awardXP(5, `Habit: ${habits[idx].name}`);
  }
  saveHabits(habits);
  renderHabits();
}

function deleteHabit(idx) {
  const habits = getHabits();
  habits.splice(idx, 1);
  saveHabits(habits);
  renderHabits();
}

function calcHabitStreak(log) {
  let streak = 0;
  const d = new Date();
  while (true) {
    if (log[d.toLocaleDateString()]) { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }
  return streak;
}


// =========================================
// 18. FOCUS / AMBIENT SOUNDS (PRO)
// =========================================
const FOCUS_SOUNDS = [
  { id: "rain", label: "Rain", emoji: "🌧️", url: "sounds/4 Minute timer with rain sounds.mp3" },
  { id: "forest", label: "Forest", emoji: "🌲", url: "sounds/5 minutes of calming nature sounds (forest).mp3" },
  { id: "cafe", label: "Cafe", emoji: "☕", url: "sounds/5 Minute Countdown Timer  - Cozy Coffee Shop With Fireplace & Music (Jazz).mp3" },
  { id: "ocean", label: "Ocean", emoji: "🌊", url: "sounds/5 Minute Timer - Relaxing Music with Ocean Waves.mp3" },
  { id: "whitenoise", label: "White Noise", emoji: "📻", url: "sounds/5 MIN WHITE NOISE BRAIN BREAK  Short relaxing sound for baby, sleep, adhd, stress relief, focus.mp3" },
  { id: "lofi", label: "Lo-Fi Vibes", emoji: "🎵", url: "sounds/5 minute lofi Timer  Can a Cute Cat Help You Focus While Studying_.mp3" },
];

let activeAudio = null;
let activeSoundId = null;
let focusTimerInterval = null;
let focusSecondsLeft = 0;

function initFocusSounds() {}

function renderFocusTab() {
  const grid = document.getElementById("focusSoundsGrid");
  grid.innerHTML = "";
  FOCUS_SOUNDS.forEach(sound => {
    const btn = document.createElement("button");
    btn.className = `sound-btn ${activeSoundId === sound.id ? "active" : ""}`;
    btn.dataset.soundId = sound.id;
    btn.innerHTML = `<span class="sound-emoji">${sound.emoji}</span><span class="sound-label">${sound.label}</span>`;
    btn.addEventListener("click", () => toggleSound(sound));
    grid.appendChild(btn);
  });
}

function toggleSound(sound) {
  if (activeSoundId === sound.id) {
    if (activeAudio) { activeAudio.pause(); activeAudio = null; }
    activeSoundId = null;
    document.getElementById("focusModeStatus").textContent = "";
  } else {
    if (activeAudio) { activeAudio.pause(); activeAudio = null; }
    activeSoundId = sound.id;
    if (sound.url) {
      activeAudio = new Audio(sound.url);
      activeAudio.loop = true;
      activeAudio.volume = 0.5;
      activeAudio.play().catch(() => {});
    }
    document.getElementById("focusModeStatus").textContent = `Now playing: ${sound.emoji} ${sound.label}`;
  }
  renderFocusTab();
}

document.getElementById("focusTimerStart").addEventListener("click", () => {
  const mins = parseInt(document.getElementById("focusDurationSelect").value);
  focusSecondsLeft = mins * 60;
  clearInterval(focusTimerInterval);
  updateFocusTimerDisplay();

  focusTimerInterval = setInterval(() => {
    if (focusSecondsLeft > 0) {
      focusSecondsLeft--;
      updateFocusTimerDisplay();
    } else {
      clearInterval(focusTimerInterval);
      if (activeAudio) { activeAudio.pause(); activeAudio = null; activeSoundId = null; renderFocusTab(); }
      document.getElementById("focusModeStatus").textContent = "Session complete! 🎉";
      awardXP(25, `Focus Session (${mins} min)`);
      alert(`Great work! ${mins}-minute focus session complete.`);
    }
  }, 1000);
});

document.getElementById("focusTimerStop").addEventListener("click", () => {
  clearInterval(focusTimerInterval);
  if (activeAudio) { activeAudio.pause(); activeAudio = null; activeSoundId = null; renderFocusTab(); }
  focusSecondsLeft = 0;
  updateFocusTimerDisplay();
  document.getElementById("focusModeStatus").textContent = "Session stopped.";
});

function updateFocusTimerDisplay() {
  const mins = Math.floor(focusSecondsLeft / 60);
  const secs = focusSecondsLeft % 60;
  document.getElementById("focusTimerDisplay").textContent =
    `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}


// =========================================
// 19. ANALYTICS DASHBOARD (PRO)
// =========================================
let analyticsTaskChart = null;
let analyticsXPChart = null;

function renderAnalytics() {
  if (!currentUser) return;
  updateUsageData();

  let tasksDone = 0;
  for (let k in localStorage) {
    if (k.startsWith(`todos_${currentUser.email}_`)) {
      const todos = JSON.parse(localStorage.getItem(k)) || [];
      tasksDone += todos.filter(t => t.done).length;
    }
  }

  const streak = parseInt(localStorage.getItem(`streak_${currentUser.email}`) || "0");
  const xp = getTotalXP();
  const habits = getHabits().length;
  const usage = JSON.parse(localStorage.getItem(`usage_${currentUser.email}`)) || {};
  const todayKey = new Date().toLocaleDateString();
  const minutesToday = usage[todayKey] || 0;

  document.getElementById("analyticsTasksDone").textContent = tasksDone;
  document.getElementById("analyticsPomodoros").textContent = pomodoroSessionsCompleted;
  document.getElementById("analyticsStreak").textContent = streak;
  document.getElementById("analyticsXP").textContent = xp;
  document.getElementById("analyticsHabits").textContent = habits;
  document.getElementById("analyticsMinutes").textContent = minutesToday;

  const labels = [], taskData = [], xpData = [];
  const taskLog = JSON.parse(localStorage.getItem(`tasklog_${currentUser.email}`)) || {};
  const xpLog = JSON.parse(localStorage.getItem(`xplog_${currentUser.email}`)) || {};

  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString();
    labels.push(d.toLocaleDateString(undefined, { weekday: "short" }));
    taskData.push(taskLog[key] || 0);
    xpData.push(xpLog[key] || 0);
  }

  const isDark = document.body.classList.contains("dark-mode");

  if (analyticsTaskChart) analyticsTaskChart.destroy();
  analyticsTaskChart = new Chart(document.getElementById("analyticsTaskChart").getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Tasks Completed", data: taskData, backgroundColor: isDark ? "#82b1ff" : "#2c5aa0", borderRadius: 5 }]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { color: isDark ? "#aaa" : "#666" } }, x: { ticks: { color: isDark ? "#aaa" : "#666" } } }, plugins: { legend: { display: false } } }
  });

  if (analyticsXPChart) analyticsXPChart.destroy();
  analyticsXPChart = new Chart(document.getElementById("analyticsXPChart").getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [{ label: "XP Earned", data: xpData, borderColor: isDark ? "#82b1ff" : "#2c5aa0", backgroundColor: isDark ? "rgba(130,177,255,0.15)" : "rgba(44,90,160,0.1)", fill: true, tension: 0.4, pointRadius: 4 }]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { color: isDark ? "#aaa" : "#666" } }, x: { ticks: { color: isDark ? "#aaa" : "#666" } } }, plugins: { legend: { display: false } } }
  });
}


// =========================================
// 20. PERIODIC CLOUD SYNC
// =========================================
// Auto-sync to Firestore every 60 seconds while logged in
setInterval(() => {
  if (isLoggedIn && currentUser && auth.currentUser) {
    syncAllToCloud();
  }
}, 60000);

// Sync before the user leaves the page using sendBeacon as fallback
window.addEventListener("beforeunload", () => {
  if (isLoggedIn && currentUser && auth.currentUser) {
    // Fire-and-hope — beforeunload can't await, but at least try
    syncAllToCloud();
  }
});

// Also sync when the page becomes hidden (tab switch, minimize) — more reliable than beforeunload
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && isLoggedIn && currentUser && auth.currentUser) {
    syncAllToCloud();
  }
});

// ============================================================
// Firebase 登入 / 註冊 / 角色（教練 or 學生）判斷邏輯
// 這個檔案是獨立的，不會動到你原本的 app.js / cal-gemini.js
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ------------------------------------------------------------
// 1. 請把下面換成你在 Firebase Console 註冊網頁應用程式時拿到的設定值
//    Console -> 專案設定 -> 一般 -> 你的應用程式 -> SDK 設定與程式碼
// ------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyAri-8ZHuJZ0CNvN6HoH3SmD6d3vy8ldfg",
  authDomain: "tt-course-arrangement.firebaseapp.com",
  databaseURL: "https://tt-course-arrangement-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "tt-course-arrangement",
  storageBucket: "tt-course-arrangement.firebasestorage.app",
  messagingSenderId: "37190341982",
  appId: "1:37190341982:web:10e543277d0c7e25b86bcf"
};

// ------------------------------------------------------------
// 2. 教練授權碼：只有輸入這組碼的人才能用「教練」身份註冊
//    這只是防君子不防小人的簡易防護（因為程式碼在瀏覽器端看得到原始碼），
//    正式要更安全的話，之後可以改用 Firebase Cloud Functions 在後端驗證。
//    請把下面這串改成你自己的密碼。
// ------------------------------------------------------------
const COACH_INVITE_CODE = "Coach-Hung";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ------------------------------------------------------------
// 畫面元素
// ------------------------------------------------------------
const loginContainer = document.getElementById("login-container");
const coachView = document.getElementById("coach-view");
const studentView = document.getElementById("student-view");

const loginForm = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginError = document.getElementById("login-error");
const loginSubmitBtn = loginForm.querySelector("button[type='submit']");

const registerForm = document.getElementById("register-form");
const registerNameInput = document.getElementById("register-name");
const registerEmailInput = document.getElementById("register-email");
const registerPasswordInput = document.getElementById("register-password");
const registerConfirmInput = document.getElementById("register-confirm");
const registerRoleSelect = document.getElementById("register-role");
const coachCodeField = document.getElementById("coach-code-field");
const registerCoachCodeInput = document.getElementById("register-coach-code");
const registerError = document.getElementById("register-error");
const registerSubmitBtn = registerForm.querySelector("button[type='submit']");

// ------------------------------------------------------------
// 身份選單切換到「教練」時，才顯示授權碼欄位
// ------------------------------------------------------------
registerRoleSelect.addEventListener("change", () => {
  if (registerRoleSelect.value === "coach") {
    coachCodeField.classList.remove("auth-form-hidden");
  } else {
    coachCodeField.classList.add("auth-form-hidden");
  }
});

// ------------------------------------------------------------
// 畫面切換：登入畫面 / 教練畫面 / 學生畫面
// 注意：coach-view 用的是 .hide（有 !important），
//       student-view 原本用 inline style="display:none"，兩者分開處理
// ------------------------------------------------------------
function showLoginScreen() {
  loginContainer.style.display = "flex";
  coachView.classList.add("hide");
  studentView.style.display = "none";
  removeLogoutButton();
}

function showCoachView() {
  loginContainer.style.display = "none";
  coachView.classList.remove("hide");
  studentView.style.display = "none";
  ensureLogoutButton();

  // TODO：如果你的 app.js / cal-gemini.js 裡有「初始化教練行事曆」的函式
  // （例如 initCoachCalendar() 或類似名稱），可以在這裡呼叫它。
  // 目前這個檔案只負責登入與角色判斷，不會自動載入課表資料。
}

function showStudentView(profile) {
  loginContainer.style.display = "none";
  coachView.classList.add("hide");
  studentView.style.display = "block";
  ensureLogoutButton();

  const nameDisplay = document.getElementById("student-name-display");
  if (nameDisplay && profile && profile.name) {
    nameDisplay.textContent = profile.name;
  }

  // TODO：如果你的 app.js / cal-gemini.js 裡有「初始化學生課表」的函式，
  // 可以在這裡呼叫它，例如 initStudentCalendar(currentUser.uid)
}

// ------------------------------------------------------------
// 動態加一個登出按鈕（固定在右上角），避免要手動改太多 HTML
// 之後想自己做成正式按鈕，可以刪掉這段，改成在 HTML 裡放一個
// <button id="logout-btn">登出</button>，再把下面 logout() 綁上去就好
// ------------------------------------------------------------
let logoutBtn = null;
function ensureLogoutButton() {
  if (logoutBtn) return;
  logoutBtn = document.createElement("button");
  logoutBtn.textContent = "登出";
  logoutBtn.style.cssText =
    "position:fixed;top:14px;right:14px;z-index:2000;padding:8px 14px;" +
    "border:none;border-radius:6px;background:#0F2E29;color:#EFEAE0;" +
    "font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 4px 10px rgba(0,0,0,0.15);";
  logoutBtn.addEventListener("click", () => signOut(auth));
  document.body.appendChild(logoutBtn);
}
function removeLogoutButton() {
  if (logoutBtn) {
    logoutBtn.remove();
    logoutBtn = null;
  }
}

// ------------------------------------------------------------
// 錯誤訊息中文化
// ------------------------------------------------------------
function mapFirebaseError(code) {
  const map = {
    "auth/invalid-email": "帳號或密碼錯誤",
    "auth/user-not-found": "帳號或密碼錯誤",
    "auth/wrong-password": "帳號或密碼錯誤",
    "auth/invalid-credential": "帳號或密碼錯誤",
    "auth/too-many-requests": "嘗試次數過多，請稍後再試",
    "auth/network-request-failed": "網路連線異常，請檢查網路",
    "auth/email-already-in-use": "這個 Email 已經被註冊過了",
    "auth/weak-password": "密碼至少需要 6 個字元",
  };
  return map[code] || "發生錯誤，請稍後再試";
}

// ------------------------------------------------------------
// 登入
// ------------------------------------------------------------
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  loginSubmitBtn.disabled = true;
  loginSubmitBtn.textContent = "登入中…";

  try {
    await signInWithEmailAndPassword(
      auth,
      emailInput.value.trim(),
      passwordInput.value
    );
    // 登入成功後的畫面切換交給下面的 onAuthStateChanged 統一處理
  } catch (err) {
    loginError.textContent = mapFirebaseError(err.code);
  } finally {
    loginSubmitBtn.disabled = false;
    loginSubmitBtn.textContent = "登入";
  }
});

// ------------------------------------------------------------
// 註冊
// ------------------------------------------------------------
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  registerError.textContent = "";

  const name = registerNameInput.value.trim();
  const email = registerEmailInput.value.trim();
  const password = registerPasswordInput.value;
  const confirm = registerConfirmInput.value;
  const role = registerRoleSelect.value; // 'coach' or 'student'
  const coachCode = registerCoachCodeInput.value.trim();

  if (!name) {
    registerError.textContent = "請輸入姓名";
    return;
  }
  if (password.length < 6) {
    registerError.textContent = "密碼至少需要 6 個字元";
    return;
  }
  if (password !== confirm) {
    registerError.textContent = "兩次輸入的密碼不一致";
    return;
  }
  if (role === "coach" && coachCode !== COACH_INVITE_CODE) {
    registerError.textContent = "教練授權碼不正確";
    return;
  }

  registerSubmitBtn.disabled = true;
  registerSubmitBtn.textContent = "建立中…";

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    // 把姓名、角色存進 Firestore，之後登入時用來判斷要顯示教練畫面還是學生畫面
    await setDoc(doc(db, "users", cred.user.uid), {
      name,
      email,
      role,
      createdAt: serverTimestamp(),
    });

    // 註冊成功後 Firebase 會自動幫使用者登入，
    // 畫面切換一樣交給 onAuthStateChanged 處理
  } catch (err) {
    registerError.textContent = mapFirebaseError(err.code);
  } finally {
    registerSubmitBtn.disabled = false;
    registerSubmitBtn.textContent = "建立帳號";
  }
});

// ------------------------------------------------------------
// 監聽登入狀態：只要使用者登入 / 註冊 / 重新整理頁面時還記得登入狀態，
// 這裡都會被觸發，統一在這裡決定要顯示哪個畫面
// ------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    showLoginScreen();
    return;
  }

  try {
    const profileSnap = await getDoc(doc(db, "users", user.uid));
    if (!profileSnap.exists()) {
      // 理論上不會發生（註冊時就會建立），保險起見還是處理一下
      registerError.textContent = "";
      loginError.textContent = "找不到帳號資料，請聯絡系統管理者";
      await signOut(auth);
      return;
    }

    const profile = profileSnap.data();
    if (profile.role === "coach") {
      showCoachView();
    } else {
      showStudentView(profile);
    }
  } catch (err) {
    console.error(err);
    loginError.textContent = "讀取帳號資料失敗，請重新整理再試一次";
  }
});

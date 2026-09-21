// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { 
    getFirestore, collection, query, where, getDocs, onSnapshot, setDoc, doc, deleteDoc, getDoc
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { 
    getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
    onAuthStateChanged, sendPasswordResetEmail, signOut,
    setPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCvtWTmqmJt10icRtFRWg58SWf4JE1hXmc",
  authDomain: "calendar-2026-5ba8e.firebaseapp.com",
  projectId: "calendar-2026-5ba8e",
  storageBucket: "calendar-2026-5ba8e.firebasestorage.app",
  messagingSenderId: "357308222372",
  appId: "1:357308222372:web:153a95f8f544e6a59ecf31",
  measurementId: "G-0EP154JP2Z"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ▼▼▼ 新增：設定登入狀態的保存方式
// Firebase 預設是 browserLocalPersistence：登入狀態會一直存在瀏覽器裡，
// 關掉分頁、甚至關掉整個瀏覽器再打開，都還記得你已登入 —— 這就是你遇到的「自動登入」。
//
// 改成 browserSessionPersistence 後：
//   ✅ 關掉分頁 / 關掉瀏覽器 → 下次打開會停留在登入頁面
//   ✅ 在同一個分頁裡按 F5 重新整理 → 仍然保持登入（不會被莫名其妙踢出去）
//
// 如果你希望「連重新整理都要重新登入」，把下面的 browserSessionPersistence
// 換成 inMemoryPersistence（記得上面 import 也要一起改），
// 但那樣使用者不小心按到 F5 就會被登出，體驗會比較差。
setPersistence(auth, browserSessionPersistence)
    .catch((err) => console.error("設定登入狀態保存方式失敗:", err));
// ▲▲▲ 新增結束 ▲▲▲

let unsubscribe = null;
// ▼▼▼ 新增：註冊流程進行中時，暫停 onAuthStateChanged 的畫面切換邏輯，
// 避免 createUserWithEmailAndPassword 自動登入的瞬間閃過 student-view
let suppressAuthUI = false;
// ▲▲▲ 新增結束 ▲▲▲
// ▼▼▼ 修正：教練的判斷方式不變（寫死 Email），
// 但整個檔案只會有「一套」登入/角色邏輯，不會再跟 firebase-auth.js 衝突 ▼▼▼
const COACH_EMAIL = "li641119@gmail.com"; 

// --- 1. 從 cal-gemini.js 匯入渲染函式 ---
import { renderAll } from './cal-gemini.js';

// --- 2. 使用者狀態 ---
export let currentUser = {
    uid: null,
    email: '',
    role: 'coach', // 'coach' 或 'student'
    name: ''
};

// ▼▼▼ 修正：刪除了原本這裡的「假登入測試」submit 監聽器
// （原本用 userData = {uid:"user_123", role: email.includes('student')...} 那段），
// 那段跟下面真正的 Firebase 登入邏輯重複綁在同一個表單上，兩個都會觸發，
// 而且它是純前端假資料，不會真的驗證密碼，必須刪掉。
// ▲▲▲

// ------------------------------------------------------------
// ▼▼▼ 新增：註冊表單邏輯（原本完全沒有實作，導致註冊表單按下去沒反應）
// ------------------------------------------------------------
const registerForm = document.getElementById('register-form');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('register-name').value.trim();
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;
        const confirm = document.getElementById('register-confirm').value;
        const errorMsg = document.getElementById('register-error');
        errorMsg.textContent = '';

        if (!name) {
            errorMsg.textContent = '請輸入姓名';
            return;
        }
        if (password.length < 6) {
            errorMsg.textContent = '密碼至少需要 6 個字元';
            return;
        }
        if (password !== confirm) {
            errorMsg.textContent = '兩次輸入的密碼不一致';
            return;
        }

        // ▼▼▼ 新增：開始註冊流程，暫停畫面自動切換 ▼▼▼
        suppressAuthUI = true;
        let cred = null;
        // ▲▲▲ 新增結束 ▲▲▲

        try {
            cred = await createUserWithEmailAndPassword(auth, email, password);

            // 🔑 關鍵：把姓名跟 Email 對應存到 Firestore 的 students collection，
            // 之後這個人登入時，系統才能用 Email 反查出「這是哪個學生」，
            // 進而只顯示屬於他自己的課程。
            //
            // ⚠️ 非常重要：這裡填的姓名，必須跟教練排課時在「行程名稱」欄位打的
            // 學生姓名「一字不差」完全一樣（包含空白、全形半形），
            // 否則系統會找不到對應的課程。
            await setDoc(doc(db, "students", name), { email: email }, { merge: true });

            // 註冊成功後，Firebase 預設會自動登入，
            // 這裡改成主動登出，跳出成功提醒，清空表單並切回登入分頁，
            // 讓學生用剛剛設定的帳密「重新登入」一次，體驗更明確。
            await signOut(auth);

            registerForm.reset();
            alert("✅ 註冊成功！請使用剛剛設定的帳號密碼重新登入。");

            const loginTabBtn = document.getElementById('tab-login');
            if (loginTabBtn) loginTabBtn.click();
        } catch (error) {
            console.error("註冊失敗:", error.code || error);

            // ▼▼▼ 新增：如果帳號其實已經建立成功（只是後面 setDoc 或 signOut 失敗），
            // 還是要把它登出，避免使用者卡在「有登入但畫面沒切換」的詭異狀態 ▼▼▼
            if (cred) {
                try { await signOut(auth); } catch (_) { /* 忽略 */ }
            }
            // ▲▲▲ 新增結束 ▲▲▲

            const map = {
                'auth/email-already-in-use': '這個 Email 已經被註冊過了',
                'auth/invalid-email': 'Email 格式不正確',
                'auth/weak-password': '密碼至少需要 6 個字元',
                'auth/network-request-failed': '網路連線異常，請檢查網路',
            };
            errorMsg.textContent = map[error.code] || ('註冊失敗：' + error.message);
        } finally {
            // ▼▼▼ 新增：不管成功失敗，註冊流程結束就恢復正常監聽 ▼▼▼
            suppressAuthUI = false;
            // ▲▲▲ 新增結束 ▲▲▲
        }
    });
}
// ▲▲▲ 新增結束 ▲▲▲

// ------------------------------------------------------------
// ▼▼▼ 新增：記住我的帳號（只記 Email，不記密碼，密碼絕對不能存在瀏覽器裡）
// ------------------------------------------------------------
const REMEMBER_EMAIL_KEY = 'coach_app_remembered_email';

document.addEventListener('DOMContentLoaded', () => {
    const emailInput = document.getElementById('email');
    const rememberCheckbox = document.getElementById('remember-email');
    const passwordInput = document.getElementById('password');
    const savedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY);

    if (savedEmail && emailInput && rememberCheckbox) {
        emailInput.value = savedEmail;
        rememberCheckbox.checked = true;
        // 帳號已經帶好了，游標直接跳到密碼欄位，使用者只要打密碼
        if (passwordInput) passwordInput.focus();
    }
});
// ▲▲▲ 新增結束 ▲▲▲

// ------------------------------------------------------------
// 登入表單邏輯（原本檔案下面已經有一份正確的，這裡保留唯一一份）
// ------------------------------------------------------------
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const errorMsg = document.getElementById('login-error');
        const rememberCheckbox = document.getElementById('remember-email');
        errorMsg.textContent = '';

        signInWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                console.log("登入成功:", userCredential.user.email);

                // ▼▼▼ 新增：依勾選狀態儲存或清除記住的帳號 ▼▼▼
                if (rememberCheckbox && rememberCheckbox.checked) {
                    localStorage.setItem(REMEMBER_EMAIL_KEY, email);
                } else {
                    localStorage.removeItem(REMEMBER_EMAIL_KEY);
                }
                // ▲▲▲ 新增結束 ▲▲▲
            })
            .catch((error) => {
                console.error("登入出錯:", error.code);
                if (
                    error.code === 'auth/invalid-credential' ||
                    error.code === 'auth/wrong-password' ||
                    error.code === 'auth/user-not-found'
                ) {
                    errorMsg.textContent = "帳號或密碼錯誤";
                } else {
                    errorMsg.textContent = "登入失敗：" + error.message;
                }
            });
    });
}

// ------------------------------------------------------------
// ▼▼▼ 新增：忘記密碼
// ------------------------------------------------------------
const forgotPasswordLink = document.getElementById('forgot-password-link');
if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', async (e) => {
        e.preventDefault();
        const errorMsg = document.getElementById('login-error');
        const email = document.getElementById('email').value.trim();

        if (!email) {
            errorMsg.textContent = '請先在上面的電子郵件欄位輸入你的帳號信箱';
            return;
        }

        try {
            await sendPasswordResetEmail(auth, email);
            errorMsg.textContent = '';
            alert('📧 重設密碼信件已寄出，請至信箱收信（記得也檢查垃圾郵件匣）');
        } catch (error) {
            console.error('寄送重設密碼信失敗:', error.code);
            const map = {
                'auth/invalid-email': 'Email 格式不正確',
                'auth/user-not-found': '找不到這個 Email 對應的帳號',
                'auth/network-request-failed': '網路連線異常，請檢查網路',
            };
            errorMsg.textContent = map[error.code] || ('寄送失敗：' + error.message);
        }
    });
}
// ▲▲▲ 新增結束 ▲▲▲

// ------------------------------------------------------------
// ▼▼▼ 新增：登出按鈕
// ------------------------------------------------------------
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try {
            await signOut(auth);
            // 畫面切換交給 onAuthStateChanged 處理
        } catch (err) {
            console.error("登出失敗:", err);
            alert("登出失敗，請重新整理頁面再試一次");
        }
    });
}
// ▲▲▲ 新增結束 ▲▲▲

// ------------------------------------------------------------
// ▼▼▼ 修正：驗證身分 / 畫面切換
// 原本這裡完全沒有設定 currentUser，導致 cal-gemini.js 拿去比對姓名時
// 永遠是初始值（空字串），學生怎麼樣都看不到自己的課。
// 現在改成：學生登入時，先去 Firestore 的 students collection
// 用 Email 反查出他的姓名，設定好 currentUser 後才開始同步課表。
// ------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
    // ▼▼▼ 新增：註冊流程進行中，先不要理會這次的登入狀態改變，
    // 避免畫面在「註冊完自動登入」跟「我們手動登出」之間閃一下 student-view
    if (suppressAuthUI) {
        console.log("（註冊流程進行中，暫時忽略這次 onAuthStateChanged）");
        return;
    }
    // ▲▲▲ 新增結束 ▲▲▲

    const loginContainer = document.getElementById('login-container');
    const coachView = document.getElementById('coach-view'); 
    const studentView = document.getElementById('student-view'); 
    const sidebar = document.querySelector('.sidebar');
    const logoutBtnEl = document.getElementById('logout-btn');

    if (user) {
        console.log("當前登入者:", user.email);
        loginContainer.style.display = 'none';
        // ▼▼▼ 新增：登入後顯示登出按鈕 ▼▼▼
        if (logoutBtnEl) logoutBtnEl.classList.remove('hide');
        // ▲▲▲ 新增結束 ▲▲▲

        if (user.email.toLowerCase() === COACH_EMAIL.toLowerCase()) {
            // --- 教練模式 ---
            console.log("教練模式已啟動");

            currentUser = { uid: user.uid, email: user.email, role: 'coach', name: '教練' };

            coachView.classList.remove('hide');
            coachView.style.display = 'block';
            // ▼▼▼ 修改：main-app 現在是「行事曆」這個 coach-panel，
            // 顯示與否交給 CSS 的 .coach-panel.active 規則統一處理，
            // 不再用 inline style 直接設定，避免跟新的導覽列切換邏輯打架 ▼▼▼
            studentView.style.display = 'none';
            // ▲▲▲ 修改結束 ▲▲▲
            if (sidebar) sidebar.style.display = 'flex';

            startLiveSync();
        } else {
            // --- 學生模式：用 Email 反查姓名 ---
            let studentName = '';
            try {
                const q = query(collection(db, "students"), where("email", "==", user.email));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    studentName = snap.docs[0].id; // students collection 的文件 ID 就是姓名
                } else {
                    console.warn("⚠️ 找不到這個 Email 對應的學生姓名。可能原因：這個帳號不是透過註冊表單建立的，或教練還沒幫這個學生排過課。");
                }
            } catch (err) {
                console.error("查詢學生姓名失敗:", err);
            }

            currentUser = { uid: user.uid, email: user.email, role: 'student', name: studentName };

            if (sidebar) sidebar.style.display = 'none';
            coachView.style.display = 'none';
            coachView.classList.add('hide');
            studentView.style.display = 'block';

            const nameEl = document.getElementById('student-name-display');
            if (nameEl) nameEl.innerText = studentName || '同學';

            console.log("啟動學生模式，姓名比對用:", studentName || '(尚未找到對應姓名)');
            startStudentLiveSync(studentName);
        }

        renderAll();
    } else {
        // --- 登出狀態 ---
        console.log("目前為登出狀態");
        loginContainer.style.display = 'flex';
        // ▼▼▼ 新增：登出後隱藏登出按鈕 ▼▼▼
        if (logoutBtnEl) logoutBtnEl.classList.add('hide');
        // ▲▲▲ 新增結束 ▲▲▲
        coachView.style.display = 'none';
        studentView.style.display = 'none';
        if (sidebar) sidebar.style.display = 'flex';

        currentUser = { uid: null, email: '', role: 'coach', name: '' };

        if (unsubscribe) unsubscribe();
    }
});
// ▲▲▲ 修正結束 ▲▲▲

/**及時監視器，同步更新（教練：全部課程） */
function startLiveSync() {
    console.log("🔒 啟動全域資料同步 (教練視角)...");
    if (unsubscribe) unsubscribe(); 

    const q = query(collection(db, "events"));
    unsubscribe = onSnapshot(q, (snapshot) => {
        const myEvents = [];
        snapshot.forEach((doc) => {
            const data = doc.data();

            let itemPrice = data.price !== undefined ? Number(data.price) : undefined;
            myEvents.push({ 
                ...data, 
                id: data.id ? data.id.toString() : doc.id,
                price: itemPrice // 強制導正型態
            });
        });


        console.log("📥 教練成功同步課表數量:", myEvents.length);

        // 強制確保全域與本地變數同時拿到最新的真相來源
        window.courses = myEvents;
        if (typeof courses !== 'undefined') {
            courses = myEvents;
        }

        // ▼▼▼ 新增：每次課表資料更新時，順便檢查有沒有已經過了上課時間、還沒扣款的課程 ▼▼▼
        checkAndDeductPastSessions(myEvents);
        // ▲▲▲ 新增結束 ▲▲▲

        // 🎨 渲染日曆 UI
        if (window.updateCalendarUI) {
            window.updateCalendarUI(myEvents);
        }
        
        // 📊 同步更新左側 Sidebar 的統計數據與時數
        if (window.updateStats) {
            window.updateStats();
        } else if (window.renderAll) {
            window.renderAll();
        }
    });

    // ▼▼▼ 新增：每 5 分鐘重新檢查一次有沒有新的課程時間過了要扣款
    // （單靠 onSnapshot 只有資料變動時才會觸發，時間流逝本身不會觸發，
    // 所以需要另外定時檢查，才不會漏掉「教練整天沒動任何課表，但已經有課上完了」的情況）
    if (window.__sessionDeductionInterval) clearInterval(window.__sessionDeductionInterval);
    window.__sessionDeductionInterval = setInterval(() => {
        checkAndDeductPastSessions(window.courses || []);
    }, 5 * 60 * 1000);
    // ▲▲▲ 新增結束 ▲▲▲
}

// ------------------------------------------------------------
// ▼▼▼ 新增：時間到自動扣課堂數
// 規則：只要「教球」課程排定的下課時間已經過了，不論實際有沒有上課、
// 或學生臨時請假，一律照扣一堂。只會在教練登入的瀏覽器裡執行。
// ------------------------------------------------------------
async function checkAndDeductPastSessions(events) {
    const now = new Date();

    for (const course of events) {
        if (!course || course.type !== 'work' || !course.name || !course.end) continue;

        try {
            if (course.isRepeating) {
                await deductRepeatingCourse(course, now);
            } else {
                await deductOneTimeCourse(course, now);
            }
        } catch (err) {
            console.error(`檢查課程 [${course.name}] 的扣款狀態時發生錯誤:`, err);
        }
    }
}

// 單次課程：時間過了、還沒標記扣過款，就扣一堂並標記
async function deductOneTimeCourse(course, now) {
    if (course.sessionDeducted) return; // 已經扣過了，不重複扣
    if (!course.date) return;

    const classEndDateTime = new Date(`${course.date}T${course.end}:00`);
    if (isNaN(classEndDateTime.getTime()) || classEndDateTime >= now) return; // 時間格式異常或還沒到

    await deductOneSession(course.name);

    try {
        await setDoc(doc(db, "events", course.id.toString()), { sessionDeducted: true }, { merge: true });
    } catch (err) {
        console.error("標記單次課程已扣款失敗:", err);
    }
}

// 重複課程：往回檢查最近 60 天內，符合星期幾、時間已過、還沒扣過的日期，
// 用 deductedDates 陣列記錄哪些日期已經扣過（跟現有的 exceptions 陣列是同樣的模式）
async function deductRepeatingCourse(course, now) {
    const deductedDates = course.deductedDates || [];
    const targetDay = (course.day === "8" ? 0 : parseInt(course.day) - 1);

    const newlyDeducted = [];
    let cursor = new Date(now);
    cursor.setDate(cursor.getDate() - 60); // 只往回追 60 天，避免無限往前查

    while (cursor <= now) {
        if (cursor.getDay() === targetDay) {
            const dStr = cursor.toLocaleDateString('en-CA');
            const classEndDateTime = new Date(`${dStr}T${course.end}:00`);

            // 注意：這裡刻意「不」排除 exceptions（請假）的日期 ——
            // 因為你確認過，臨時請假一樣要扣課
            if (!isNaN(classEndDateTime.getTime()) && classEndDateTime < now && !deductedDates.includes(dStr)) {
                newlyDeducted.push(dStr);
            }
        }
        cursor.setDate(cursor.getDate() + 1);
    }

    if (newlyDeducted.length === 0) return;

    // 依序扣完這幾堂（可能因為好幾天沒開網頁，一次補扣好幾堂）
    for (const dStr of newlyDeducted) {
        await deductOneSession(course.name);
    }

    try {
        await setDoc(
            doc(db, "events", course.id.toString()),
            { deductedDates: [...deductedDates, ...newlyDeducted] },
            { merge: true }
        );
    } catch (err) {
        console.error("標記重複課程已扣款失敗:", err);
    }
}

// 實際去扣 students/{姓名} 的剩餘堂數。
// 刻意不設下限、允許扣成負數 —— 負數代表這個學生已經超支，
// 提醒你該找他補買新的課程包了，而不是默默不扣、讓你以為堂數還夠
async function deductOneSession(studentName) {
    try {
        const ref = doc(db, "students", studentName);
        const snap = await getDoc(ref);
        const data = snap.exists() ? snap.data() : {};
        const total = data.totalSessions !== undefined ? data.totalSessions : 10;
        const remaining = data.remainingSessions !== undefined ? data.remainingSessions : 10;
        const newRemaining = remaining - 1;

        await setDoc(ref, { totalSessions: total, remainingSessions: newRemaining }, { merge: true });
        console.log(`⏱️ 已自動扣除 [${studentName}] 一堂課，剩餘 ${newRemaining} 堂`);

        // 如果目前正開著學生資料庫畫面、而且剛好展開這個學生，順便更新畫面數字
        const remainEl = document.getElementById(`remain-${studentName}`);
        if (remainEl) remainEl.innerText = newRemaining;
    } catch (err) {
        console.error(`自動扣款失敗 [${studentName}]:`, err);
    }
}
// ▲▲▲ 新增結束 ▲▲▲

// ▼▼▼ 修正：改成用「姓名」查詢，不再依賴 studentEmail 欄位。
// 原因：studentEmail 欄位只有在教練排課「當下」剛好查得到 Email 才會寫入，
// 如果學生是排課之後才註冊，舊的行程會永遠找不到 studentEmail，等於課表消失。
// 改用姓名查詢後，不管註冊先後順序，只要姓名對得上就抓得到。
function startStudentLiveSync(studentName) {
    console.log(`🔒學生模式：正在同步 [${studentName}] 的課程...`);
    if (unsubscribe) unsubscribe();

    if (!studentName) {
        // 還沒找到對應姓名（例如剛註冊、教練還沒排過課），顯示空課表即可
        if (window.updateCalendarUI) window.updateCalendarUI([]);
        return;
    }

    const q = query(
        collection(db, "events"), 
        where("name", "==", studentName)
    );
    unsubscribe = onSnapshot(q, (snapshot) => {
        const myEvents = [];
        let totalMinutes = 0;
        let unpaidCount = 0;

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        snapshot.forEach((doc) => {
            const data = doc.data();
            myEvents.push({ ...data, id: data.id ? data.id.toString() : doc.id });

            // 計算時數邏輯
            if (data.date) {
                const courseDate = new Date(data.date);
                // 只篩選跟今天同一個年月的文件
                if (courseDate.getFullYear() === currentYear && courseDate.getMonth() === currentMonth) {
                    
                    // 1. 累加分鐘數 (優先抓 duration，沒有的話用格數算)
                    const duration = data.duration || ((data.endRow - data.startRow) * 10);
                    totalMinutes += duration;

                    // 2. 統計未繳費堂數
                    if (data.type === 'work' && data.isPaid !== true) {
                        unpaidCount++;
                    }
                }
            }
        });
        // 1. 更新時數顯示
        const hoursEl = document.getElementById('student-total-hours');
        if (hoursEl) hoursEl.innerText = (totalMinutes / 60).toFixed(1);

        // 2. 動態更新學生的繳費情形文字與顏色
        const statusDisplay = document.getElementById('student-class-count');
        if (statusDisplay) {
            if (unpaidCount > 0) {
                statusDisplay.innerText = `有 ${unpaidCount} 堂未繳費`;
                statusDisplay.style.color = '#e74c3c'; // 紅色
            } else {
                statusDisplay.innerText = '已全數繳清 ✨';
                statusDisplay.style.color = '#098579'; // 專屬綠色
            }
        }

        // 3. 核心：呼叫原本的行事曆更新函式
        if (window.updateCalendarUI) {
            console.log("🎨 正在為學生渲染大行事曆...");
            window.updateCalendarUI(myEvents);
        }
    });
}

/**儲存或刪除時把資料從雲端存起來或是丟掉 */
window.uploadEvent = async (eventData) => {
    try {
        let currentPrice = parseInt(eventData.price, 10);
        if (isNaN(currentPrice)) {
            const lastCourse = (window.courses || []).find(c => c.name === eventData.name && c.price);
            currentPrice = lastCourse ? parseInt(lastCourse.price, 10) : 600;
        }

        let emailToUpload = "";

        // ▼▼▼ 修正：只有「教球」(type === 'work') 才會去讀寫 students collection。
        // 原因：「上課」「其他行程」是你自己的私人行程，姓名欄位打的通常不是學生姓名
        // （可能是課名、私事），不應該被誤存進學生資料庫，也不該影響堂數或預設學費。
        // ⚠️ 提醒：這個修正只擋住「以後」的污染，之前如果已經有非學生的名字被誤存進
        // students collection，需要你自己去「學生資料庫」畫面用刪除按鈕手動清掉，
        // 系統沒辦法自動分辨哪些是舊的誤存資料。
        if (eventData.type === 'work') {
            const studentRef = doc(db, "students", eventData.name); // 假設文件 ID 就是姓名
            const studentSnap = await getDoc(studentRef);

            if (studentSnap.exists() && studentSnap.data().email) {
                emailToUpload = studentSnap.data().email;
            } else {
                console.warn(`⚠️ 找不到學生 [${eventData.name}] 的對照 Email，已自動預設為空字串。`);
            }

            await setDoc(studentRef, {
                defaultPrice: currentPrice
            }, { merge: true });
            console.log(`🚀 雲端已記憶 ${eventData.name} 的預設學費為: ${currentPrice} 元`);
        }
        // ▲▲▲ 修正結束 ▲▲▲

        // 3. 儲存到原本的 events 集合
        const eventId = eventData.id.toString();

        // 強制對齊 Payload，確保絕對不會帶有 undefined 欄位
        // （studentEmail 保留下來作為備用資訊，目前查詢已改用姓名比對，不強制依賴它）
        const finalPayload = {
            ...eventData,
            price: currentPrice,
            studentEmail: emailToUpload
        };

        await setDoc(doc(db, "events", eventId), finalPayload);
        console.log(`✅ 課程 [${eventData.name}] 金額 $${currentPrice} 已成功寫入雲端！`);
        
    } catch (e) {
        console.error("❌ 上傳失敗:", e);
    }
};

window.removeEventFromCloud = async (eventId) => {
    try {
        if (!eventId) return;
        
        const docRef = doc(db, "events", eventId.toString());
        await deleteDoc(docRef);
        
        console.log(`🗑️ 雲端行程 [ID: ${eventId}] 已成功從 Firestore 抹除`);
    } catch (e) {
        console.error("❌ 雲端刪除失敗:", e);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('toggle-income-btn');
    const incomeSpan = document.getElementById('month-income');

    if (toggleBtn && incomeSpan) {
        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isRevealed = incomeSpan.classList.toggle('revealed');
            if (isRevealed) {
                toggleBtn.innerHTML = "隱藏";
            } else {
                toggleBtn.innerHTML = "查看";
            }
        });
    }

    // 當輸入/選擇學生姓名時，自動從 Firestore 撈出並帶入預設學費
    const studentNameInput = document.getElementById('m-name');
    const priceInput = document.getElementById('m-price');

    if (studentNameInput && priceInput) {
        studentNameInput.addEventListener('input', async (e) => {
            const studentName = e.target.value.trim();
            
            if (!studentName) {
                priceInput.value = ''; // 名字被刪光時，清空價格
                return;
            }

            try {
                const studentRef = doc(db, "students", studentName);
                const studentSnap = await getDoc(studentRef);

                if (studentSnap.exists() && studentSnap.data().defaultPrice !== undefined) {
                    priceInput.value = studentSnap.data().defaultPrice;
                    console.log(`🎯 自動帶入 ${studentName} 的預設學費: ${studentSnap.data().defaultPrice}`);
                }
            } catch (error) {
                console.error("撈取學生預設學費失敗:", error);
            }
        });
    }
});

// ------------------------------------------------------------
// ▼▼▼ 修改：學生資料庫畫面，加上展開查看堂數、調整堂數、新增/刪除學生
// ------------------------------------------------------------
async function renderStudentDbPanel() {
    const listEl = document.getElementById('student-db-list');
    if (!listEl) return;

    listEl.innerHTML = '<p class="no-data-hint">讀取中...</p>';

    try {
        const snap = await getDocs(collection(db, "students"));
        if (snap.empty) {
            listEl.innerHTML = '<p class="no-data-hint">目前還沒有學生資料，點右上角「＋ 新增學生」開始建立</p>';
            return;
        }

        const rows = [];
        snap.forEach((docSnap) => {
            const data = docSnap.data();
            const name = docSnap.id;
            const emailText = data.email ? data.email : '（尚未註冊帳號）';
            const priceText = data.defaultPrice !== undefined ? `$${data.defaultPrice}` : '—';
            // 【新增】堂數：如果 Firestore 裡還沒有這個欄位，預設顯示 10/10
            const total = data.totalSessions !== undefined ? data.totalSessions : 10;
            const remaining = data.remainingSessions !== undefined ? data.remainingSessions : 10;

            rows.push(`
                <div class="db-row-wrap">
                    <div class="db-row db-row-clickable" onclick="toggleStudentDetail('${name}')">
                        <span class="db-name">▸ ${name}</span>
                        <span class="db-meta">${emailText} · 預設學費 ${priceText}</span>
                    </div>
                    <div class="db-detail hide" id="detail-${name}">
                        <div class="db-detail-row">
                            <span>上課堂數</span>
                            <span class="session-count">
                                <button type="button" onclick="adjustSession('${name}', -1)">－</button>
                                <span><strong id="remain-${name}">${remaining}</strong> / <strong id="total-${name}">${total}</strong></span>
                                <button type="button" onclick="adjustSession('${name}', 1)">＋</button>
                            </span>
                        </div>
                        <button type="button" class="clear-btn" onclick="deleteStudent('${name}')">🗑️ 刪除此學生</button>
                    </div>
                </div>
            `);
        });
        listEl.innerHTML = rows.join('');
    } catch (err) {
        console.error("讀取學生資料庫失敗:", err);
        listEl.innerHTML = '<p class="no-data-hint">讀取失敗，請重新整理再試一次</p>';
    }
}

// 點姓名展開/收合堂數區塊（一次只展開一個，避免畫面太亂）
window.toggleStudentDetail = function (name) {
    const detail = document.getElementById(`detail-${name}`);
    if (!detail) return;
    document.querySelectorAll('.db-detail').forEach((el) => {
        if (el !== detail) el.classList.add('hide');
    });
    detail.classList.toggle('hide');
};

// 用 +/－ 按鈕調整剩餘堂數，範圍限制在 0 ~ 總堂數之間
window.adjustSession = async function (name, delta) {
    try {
        const ref = doc(db, "students", name);
        const snap = await getDoc(ref);
        const data = snap.exists() ? snap.data() : {};
        const total = data.totalSessions !== undefined ? data.totalSessions : 10;
        let remaining = data.remainingSessions !== undefined ? data.remainingSessions : 10;

        remaining = Math.max(0, Math.min(total, remaining + delta));

        await setDoc(ref, { totalSessions: total, remainingSessions: remaining }, { merge: true });

        const remainEl = document.getElementById(`remain-${name}`);
        if (remainEl) remainEl.innerText = remaining;
    } catch (err) {
        console.error("更新堂數失敗:", err);
        alert("更新失敗，請重新整理再試一次");
    }
};

// 新增學生：只需要姓名，堂數預設 10/10，之後學生自己註冊時 Email 會自動補上去
window.addStudent = async function () {
    const nameInput = prompt("請輸入學生姓名：");
    if (!nameInput || !nameInput.trim()) return;
    const name = nameInput.trim();

    try {
        const ref = doc(db, "students", name);
        const existing = await getDoc(ref);
        if (existing.exists()) {
            alert("這個姓名已經存在學生名單裡了，如果是同一位學生，不需要重複新增");
            return;
        }

        await setDoc(ref, { totalSessions: 10, remainingSessions: 10 }, { merge: true });
        alert(`✅ 已新增學生：${name}`);
        renderStudentDbPanel();
    } catch (err) {
        console.error("新增學生失敗:", err);
        alert("新增失敗，請稍後再試");
    }
};

// 刪除學生：只會刪除 students collection 裡的對照資料，不會動到已經排好的課程紀錄
window.deleteStudent = async function (name) {
    const sure = confirm(
        `確定要刪除學生「${name}」嗎？\n\n這只會刪除他的帳號對照資料與堂數紀錄，不會刪除他已經排過的課程（如果要清課表要另外手動刪除）。`
    );
    if (!sure) return;

    try {
        await deleteDoc(doc(db, "students", name));
        alert(`已刪除學生：${name}`);
        renderStudentDbPanel();
    } catch (err) {
        console.error("刪除學生失敗:", err);
        alert("刪除失敗，請稍後再試");
    }
};
// ▲▲▲ 修改結束 ▲▲▲

document.addEventListener('DOMContentLoaded', () => {
    const navBtns = document.querySelectorAll('.coach-nav-btn');

    navBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            const targetPanelId = btn.dataset.panel;

            // 切換按鈕的 active 樣式
            navBtns.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');

            // 切換畫面：只有 data-panel-id 對得上的那個才顯示
            document.querySelectorAll('.coach-panel').forEach((panel) => {
                panel.classList.toggle('active', panel.dataset.panelId === targetPanelId);
            });

            // 切換到「本月收入」時，重新計算並渲染（cal-gemini.js 匯出的函式）
            if (targetPanelId === 'panel-income' && typeof window.renderIncomePanel === 'function') {
                window.renderIncomePanel();
            }

            // 切換到「學生資料庫」時，重新從 Firestore 撈一次最新資料
            if (targetPanelId === 'panel-students') {
                renderStudentDbPanel();
            }
        });
    });
});
// ▲▲▲ 新增結束 ▲▲▲

console.log("Firebase 監聽器已啟動");
// Firebase  全域設定
// ------------------------------------------------------------

// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { 
    getFirestore, collection, query, where, getDocs, onSnapshot, setDoc, doc, deleteDoc, getDoc, 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { 
    getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
    onAuthStateChanged, sendPasswordResetEmail, signOut,
    setPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

// firebaseConfig
const firebaseConfig = {
  apiKey: "AIzaSyCvtWTmqmJt10icRtFRWg58SWf4JE1hXmc",
  authDomain: "calendar-2026-5ba8e.firebaseapp.com",
  projectId: "calendar-2026-5ba8e",
  storageBucket: "calendar-2026-5ba8e.firebasestorage.app",
  messagingSenderId: "357308222372",
  appId: "1:357308222372:web:153a95f8f544e6a59ecf31",
  measurementId: "G-0EP154JP2Z"
};

// db, auth
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

setPersistence(auth, browserSessionPersistence)
    .catch((err) => console.error("設定登入狀態保存方式失敗:", err));

let unsubscribe = null;
let suppressAuthUI = false;
const COACH_EMAIL = "li641119@gmail.com"; 

// currentUser
import { renderAll } from './cal-gemini.js';
export let currentUser = {
    uid: null,
    email: '',
    role: 'coach', // 'coach' 或 'student'
    name: ''
};

// 使用者登入
// ------------------------------------------------------------

// 註冊
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

        suppressAuthUI = true;
        let cred = null;

        try {
            cred = await createUserWithEmailAndPassword(auth, email, password);

            const existingSnap = await getDoc(doc(db, "students", name));
            const existingData = existingSnap.exists() ? existingSnap.data() : {};
            const patch = { email: email };
        
            await setDoc(doc(db, "students", name), patch, { merge: true });
            await signOut(auth);

            registerForm.reset();
            alert("✅ 註冊成功！請使用剛剛設定的帳號密碼重新登入。");

            const loginTabBtn = document.getElementById('tab-login');
            if (loginTabBtn) loginTabBtn.click();
        } catch (error) {
            console.error("註冊失敗:", error.code || error);

            if (cred) {
                try { await signOut(auth); } catch (_) { /* 忽略 */ }
            }

            const map = {
                'auth/email-already-in-use': '這個 Email 已經被註冊過了',
                'auth/invalid-email': 'Email 格式不正確',
                'auth/weak-password': '密碼至少需要 6 個字元',
                'auth/network-request-failed': '網路連線異常，請檢查網路',
            };
            errorMsg.textContent = map[error.code] || ('註冊失敗：' + error.message);
        } finally {
            suppressAuthUI = false;
        }
    });
}

//登入
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

                if (rememberCheckbox && rememberCheckbox.checked) {
                    localStorage.setItem(REMEMBER_EMAIL_KEY, email);
                } else {
                    localStorage.removeItem(REMEMBER_EMAIL_KEY);
                }
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

//記住帳號
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

//忘記密碼
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

//登出
const logoutButtons = [
    document.getElementById('logout-btn'),
    document.getElementById('coach-top-logout-btn')
].filter(Boolean);

logoutButtons.forEach((logoutButton) => {

    logoutButton.addEventListener('click', async () => {

        try {
            await signOut(auth);

        } catch (err) {

            console.error("登出失敗:", err);

            alert("登出失敗，請重新整理頁面再試一次");
        }

    });

});

//onAuthStateChanged
onAuthStateChanged(auth, async (user) => {
    if (suppressAuthUI) {
        console.log("（註冊流程進行中，暫時忽略這次 onAuthStateChanged）");
        return;
    }

    const loginContainer = document.getElementById('login-container');
    const coachView = document.getElementById('coach-view'); 
    const studentView = document.getElementById('student-view'); 
    const sidebar = document.querySelector('.sidebar');
    const logoutBtnEl = document.getElementById('logout-btn');

    if (user) {
        console.log("當前登入者:", user.email);
        loginContainer.style.display = 'none';
        if (logoutBtnEl) logoutBtnEl.classList.remove('hide');

        if (user.email.toLowerCase() === COACH_EMAIL.toLowerCase()) {
            console.log("教練模式已啟動");

            currentUser = { uid: user.uid, email: user.email, role: 'coach', name: '教練' };

            coachView.classList.remove('hide');
            coachView.style.display = 'block';
            studentView.style.display = 'none';
            if (sidebar) sidebar.style.display = 'flex';

            startLiveSync();
        } else {
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
        console.log("目前為登出狀態");
        loginContainer.style.display = 'flex';
        if (logoutBtnEl) logoutBtnEl.classList.add('hide');
        coachView.style.display = 'none';
        studentView.style.display = 'none';
        if (sidebar) sidebar.style.display = 'flex';

        currentUser = { uid: null, email: '', role: 'coach', name: '' };

        if (unsubscribe) unsubscribe();
    }
});

// 學生資料
// ------------------------------------------------------------

// 取得學生資料
async function renderStudentDbPanel() {
    const listEl = document.getElementById('student-db-list');
    const template = document.getElementById('student-row-template');

    if (!listEl || !template) return;
    

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

            if (!data.email && !data.isStudent) return;
            
            const emailText = data.email ? data.email : '（尚未註冊帳號）';
            const priceText = data.defaultPrice !== undefined ? `$${data.defaultPrice}` : '—';
            const row = template.content.cloneNode(true);

            const rowWrap = row.querySelector('.db-row-wrap');
            const rowClickable = row.querySelector('.db-row-clickable');
            const detail = row.querySelector('.db-detail');

            const nameEl = row.querySelector('.db-name');
            const metaEl = row.querySelector('.db-meta');

            const deleteBtn = row.querySelector('.delete-student-btn');
            
            nameEl.textContent = `▸ ${name}`;
            metaEl.textContent =
                `${emailText} · 預設學費 ${priceText}`;

            // 點擊學生列 → 展開 / 收合詳細資料
            rowClickable.addEventListener('click', () => {
                detail.classList.toggle('hide');
            });


            // 刪除學生
            deleteBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                deleteStudent(name);
            });


            rows.push(row);
        });


        if (rows.length === 0) {
            listEl.innerHTML =
                '<p class="no-data-hint">目前還沒有學生資料，點右上角「＋ 新增學生」開始建立</p>';
            return;
        }


        // 清空原本內容
        listEl.innerHTML = '';

        // 一次加入所有學生
        rows.forEach((row) => {
            listEl.appendChild(row);
        });

    } catch (err) {

        console.error("讀取學生資料庫失敗:", err);

        listEl.innerHTML =
            '<p class="no-data-hint">讀取失敗，請重新整理再試一次</p>';
    }
}

// 點姓名展開、收合堂數區塊（一次只展開一個，避免畫面太亂）
window.toggleStudentDetail = function (name) {
    const detail = document.getElementById(`detail-${name}`);
    if (!detail) return;
    document.querySelectorAll('.db-detail').forEach((el) => {
        if (el !== detail) el.classList.add('hide');
    });
    detail.classList.toggle('hide');
};

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

        await setDoc(ref, { isStudent: true }, { merge: true });
        alert(`✅ 已新增學生：${name}`);
        renderStudentDbPanel();
    } catch (err) {
        console.error("新增學生失敗:", err);
        alert("新增失敗，請稍後再試");
    }
};

// 刪除學生: 只會刪除 students collection 裡的對照資料，不會動到已經排好的課程紀錄
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



// 課程本身的資料存取
// ------------------------------------------------------------

//更新行程
window.uploadEvent = async (eventData) => {
    try {
        let currentPrice = parseInt(eventData.price, 10);
        if (isNaN(currentPrice)) {
            const lastCourse = (window.courses || []).find(c => c.name === eventData.name && c.price);
            currentPrice = lastCourse ? parseInt(lastCourse.price, 10) : 600;
        }

        let emailToUpload = "";

        if (eventData.type === 'work') {
            const studentRef = doc(db, "students", eventData.name); // 假設文件 ID 就是姓名
            const studentSnap = await getDoc(studentRef);
            const existingData = studentSnap.exists() ? studentSnap.data() : {};

            if (existingData.email) {
                emailToUpload = existingData.email;
            } else {
                console.warn(`⚠️ 找不到學生 [${eventData.name}] 的對照 Email，已自動預設為空字串。`);
            }

            await setDoc(studentRef, { defaultPrice: currentPrice, isStudent: true }, { merge: true });

            console.log(`🚀 雲端已記憶 ${eventData.name} 的預設學費為: ${currentPrice} 元`);
        }

        const eventId = eventData.id.toString();

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

//刪除行程
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

// 跟 Firestore 同步課表資料
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
}

function startStudentLiveSync(studentName) {
    console.log(`🔒學生模式：正在同步 [${studentName}] 的課程...`);
    if (unsubscribe) unsubscribe();

    if (!studentName) {
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
        const currentMonth = now.getMonth() + 1; // 1 ~ 12 月

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            myEvents.push({ ...data, id: data.id ? data.id.toString() : docSnap.id });

            // A. 單次課程統計 (精確用字串拆解年/月，避免 UTC 時區偏差)
            if (data.date && !data.isRepeating) {
                const parts = data.date.split('-');
                if (parts.length === 3) {
                    const y = parseInt(parts[0], 10);
                    const m = parseInt(parts[1], 10);

                    if (y === currentYear && m === currentMonth) {
                        const duration =
                            Number(data.duration) > 0
                                ? Number(data.duration)
                                : (
                                    Number(data.endRow) > Number(data.startRow)
                                        ? (Number(data.endRow) - Number(data.startRow)) * 10
                                        : 60
                                );
                        totalMinutes += Number(duration);

                        if (data.type === 'work' && data.isPaid !== true) {
                            unpaidCount++;
                        }
                    }
                }
            } 
            else if (data.isRepeating && data.day) {
                const targetDay = (data.day === "8" ? 0 : parseInt(data.day, 10) - 1);
                
                const realClassCount = countOccurrencesInMonth(
                    currentYear, 
                    currentMonth, 
                    targetDay, 
                    data.exceptions || []
                );

                const singleDuration = data.duration || ((data.endRow - data.startRow) * 15) || 60;
                totalMinutes += Number(singleDuration) * realClassCount;

                if (data.type === 'work' && data.isPaid !== true) {
                    unpaidCount += realClassCount;
                }
            }
        });

        const hoursEl = document.getElementById('student-total-hours');
        if (hoursEl) hoursEl.innerText = (totalMinutes / 60).toFixed(1);

        const statusDisplay = document.getElementById('student-class-count');
        if (statusDisplay) {
            if (unpaidCount > 0) {
                statusDisplay.innerText = `有 ${unpaidCount} 堂未繳費`;
                statusDisplay.style.color = '#e74c3c';
            } else {
                statusDisplay.innerText = '已全數繳清 ✨';
                statusDisplay.style.color = '#098579';
            }
        }

        if (window.updateCalendarUI) {
            window.updateCalendarUI(myEvents);
        }
    });
}

// 本月收入畫面
// 產生「收入紀錄」在 Firestore 中使用的唯一 ID
function getIncomeRecordId(year, month, studentName) {
    const monthText = String(month + 1).padStart(2, '0');
    return `${currentUser.uid}_${year}-${monthText}_${encodeURIComponent(studentName)}`;
}

// 設定指定學生、指定月份的「收款狀態」
window.setIncomePaidStatus = async function (year, month, studentName, isPaid) {
    if (!currentUser.uid) {
        console.error('❌ 尚未登入，無法儲存收款紀錄');
        return false;
    }

    try {
        const recordId = getIncomeRecordId(year, month, studentName);
        await setDoc(doc(db, "incomeRecords", recordId),{
                coachUid: currentUser.uid,
                year: year,
                month: month + 1,
                studentName: studentName,
                isPaid: isPaid,
                updatedAt: new Date().toISOString()
            },
            { merge: true }
        );

        console.log(
            `💰 收款紀錄已更新：${year}-${String(month + 1).padStart(2, '0')} / ${studentName} / ${isPaid ? '已收款' : '待收款'}`
        );

        return true;

    } catch (error) {
        console.error("❌ 儲存收款紀錄失敗:", error);
        return false;
    }
};


// 讀取某個月份所有學生的收款狀態
window.loadIncomePaidStatuses = async function (
    year,
    month
) {
    if (!currentUser.uid) {
        console.warn('⚠️ 尚未登入，無法讀取收款紀錄');
        return {};
    }

    try {
        const q = query(
            collection(db, "incomeRecords"),
            where("coachUid", "==", currentUser.uid),
            where("year", "==", year),
            where("month", "==", month + 1)
        );

        const snapshot = await getDocs(q);

        const result = {};

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();

            if (data.studentName) {
                result[data.studentName] = data.isPaid === true;
            }
        });

        console.log(
            `📥 已讀取 ${year}-${String(month + 1).padStart(2, '0')} 收款紀錄，共 ${Object.keys(result).length} 筆`
        );

        return result;

    } catch (error) {
        console.error("❌ 讀取收款紀錄失敗:", error);
        return {};
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



const navBtns =
    document.querySelectorAll('.coach-nav-btn');

navBtns.forEach((btn) => {

    btn.addEventListener('click', async () => {

        
        if (btn.id === 'coach-sidebar-logout-btn') {

            const confirmed =
                confirm('確定要登出嗎？');

            if (!confirmed) return;

            try {
                await signOut(auth);
            } catch (err) {
                console.error(
                    "登出失敗:",
                    err
                );

                alert(
                    "登出失敗，請重新整理頁面再試一次"
                );
            }

            return;
        }


        const targetPanelId =
            btn.dataset.panel;

        navBtns.forEach((b) =>
            b.classList.remove('active')
        );

        btn.classList.add('active');

        document
            .querySelectorAll('.coach-panel')
            .forEach((panel) => {

                panel.classList.toggle(
                    'active',
                    panel.dataset.panelId === targetPanelId
                );

            });


       

        if (targetPanelId === 'panel-income' &&
            typeof window.renderIncomePanel === 'function') {

            window.renderIncomePanel();
        }

        if (targetPanelId === 'panel-students') {
            renderStudentDbPanel();
        }

        if (targetPanelId === 'panel-overview') {
            if (typeof window.renderOverviewPanel === 'function') {
                window.renderOverviewPanel();
            }
        }


        if (
            targetPanelId === 'panel-overview' &&
            typeof window.renderCoachOverview === 'function'
        ) {
            window.renderCoachOverview();
        }

    });

});


window.renderCoachOverview = function () {

    const currentCourses =
        window.courses || [];

    const now = new Date();

    const year =
        now.getFullYear();

    const month =
        now.getMonth();

    const today =
        new Date(
            year,
            month,
            now.getDate()
        );

    const day =
        today.getDay();

    const mondayOffset =
        day === 0 ? -6 : 1 - day;

    const monday =
        new Date(today);

    monday.setDate(
        today.getDate() + mondayOffset
    );

    monday.setHours(0, 0, 0, 0);

    const sunday =
        new Date(monday);

    sunday.setDate(
        monday.getDate() + 6
    );

    sunday.setHours(
        23,
        59,
        59,
        999
    );


    let weekCount = 0;
    let monthCount = 0;

    const monthData =
        typeof window.calculateMonthlyData === 'function'
            ? window.calculateMonthlyData(
                year,
                month
            )
            : {
                totalMinutes: 0,
                totalIncome: 0
            };


    currentCourses.forEach(course => {

        if (
            !course ||
            course.type !== 'work'
        ) {
            return;
        }

        if (
            course.isRepeating &&
            course.day
        ) {

            // 本週
            for (
                let i = 0;
                i < 7;
                i++
            ) {

                const date =
                    new Date(monday);

                date.setDate(
                    monday.getDate() + i
                );

                const targetDay =
                    course.day === "8"
                        ? 0
                        : parseInt(
                            course.day,
                            10
                        ) - 1;

                if (
                    date.getDay() === targetDay
                ) {

                    const dateStr =
                        date.toLocaleDateString(
                            'en-CA'
                        );

                    const exceptionList =
                        course.exceptions || [];

                    if (
                        !exceptionList.includes(
                            dateStr
                        )
                    ) {

                        if (
                            !course.date ||
                            dateStr >= course.date
                        ) {
                            weekCount++;
                        }

                    }

                }

            }

        }


        else if (course.date) {

            const courseDate =
                new Date(
                    `${course.date}T00:00:00`
                );

            if (
                courseDate >= monday &&
                courseDate <= sunday
            ) {
                weekCount++;
            }

        }


        if (
            typeof window.calculateMonthlyData === 'function'
        ) {

            
            const stats =
                monthData.studentStats;

            if (
                stats &&
                stats[course.name]
            ) {
                
            }

        }

    });


    Object.values(
        monthData.studentStats || {}
    ).forEach(data => {

        monthCount +=
            Number(data.occurrences || 0);

    });


    const weekCountEl =
        document.getElementById(
            'overview-week-count'
        );

    const monthCountEl =
        document.getElementById(
            'overview-month-count'
        );

    const monthHoursEl =
        document.getElementById(
            'overview-month-hours'
        );

    const monthIncomeEl =
        document.getElementById(
            'overview-month-income'
        );


    if (weekCountEl) {
        weekCountEl.innerText =
            weekCount;
    }

    if (monthCountEl) {
        monthCountEl.innerText =
            monthCount;
    }

    if (monthHoursEl) {
        monthHoursEl.innerText =
            `${(
                monthData.totalMinutes / 60
            ).toFixed(1)} 小時`;
    }

    if (monthIncomeEl) {
        monthIncomeEl.innerText =
            `$${Math.round(
                monthData.totalIncome
            ).toLocaleString()}`;
    }

};


console.log("Firebase 監聽器已啟動");
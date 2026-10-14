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
    document.getElementById('coach-top-logout-btn'),
    document.getElementById('coach-sidebar-logout-btn')
].filter(Boolean);

logoutButtons.forEach((logoutButton) => {

    logoutButton.addEventListener('click', async () => {

        const confirmed = confirm('確定要登出嗎？');
        if (!confirmed) return;

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
            startCoachPaymentWatcher();
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
            startStudentPaymentWatchers(studentName);
            watchOverviewForStudent();
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
        stopCoachPaymentWatcher();
        stopStudentPaymentWatchers();
    }
});

// 學生資料
// ------------------------------------------------------------
// ------------------------------------------------------------
// 學生個人頁：基本資料 + 日期區間的逐堂上課明細
// ------------------------------------------------------------
let currentProfileStudent = null;

function escapeProfileText(text) {
    return String(text ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function openStudentProfile(name, data) {
    currentProfileStudent = name;

    document.getElementById('student-list-view').classList.add('hide');
    document.getElementById('student-profile-view').classList.remove('hide');

    document.getElementById('profile-name').innerText = name;
    document.getElementById('profile-email').innerText = data.email || '（尚未註冊帳號）';
    document.getElementById('profile-price').innerText =
        data.defaultPrice !== undefined ? `$${data.defaultPrice}` : '—';

    // 預設查詢區間：本月 1 號到月底
    const now = new Date();
    document.getElementById('profile-start').value =
        new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-CA');
    document.getElementById('profile-end').value =
        new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString('en-CA');

    renderStudentProfileDetails();
}

window.closeStudentProfile = function () {
    currentProfileStudent = null;
    const listView = document.getElementById('student-list-view');
    const profileView = document.getElementById('student-profile-view');
    if (listView) listView.classList.remove('hide');
    if (profileView) profileView.classList.add('hide');
};

// 刪除成功後 deleteStudent 會呼叫 renderStudentDbPanel，裡面已經會回到名單；
// 按取消則會留在個人頁。
window.deleteStudentFromProfile = function () {
    if (currentProfileStudent) deleteStudent(currentProfileStudent);
};

window.renderStudentProfileDetails = function () {
    if (!currentProfileStudent) return;

    const startVal = document.getElementById('profile-start').value;
    const endVal = document.getElementById('profile-end').value;
    const summaryEl = document.getElementById('profile-summary');
    const listEl = document.getElementById('profile-detail-list');

    listEl.innerHTML = '';

    if (!startVal || !endVal) {
        summaryEl.innerText = '請選擇開始與結束日期';
        return;
    }
    if (startVal > endVal) {
        summaryEl.innerText = '開始日期不能晚於結束日期';
        return;
    }
    if (typeof window.getStudentLessonDetails !== 'function') {
        summaryEl.innerText = '資料尚未載入完成，請稍後再試';
        return;
    }

    const lessons = window.getStudentLessonDetails(currentProfileStudent, startVal, endVal);
    if (lessons.length === 0) {
        summaryEl.innerText = '這段期間沒有上課紀錄';
        return;
    }

    // 統計只算已上完的課
    const done = lessons.filter(l => l.completed);
    const upcomingCount = lessons.length - done.length;
    const totalMinutes = done.reduce((sum, l) => sum + l.minutes, 0);
    const totalMoney = done.reduce((sum, l) => sum + l.money, 0);

    let summary = `已上完 <strong>${done.length}</strong> 堂（${Number((totalMinutes / 60).toFixed(2))} 小時），總金額 <strong>$${Math.round(totalMoney).toLocaleString()}</strong>`;
    if (upcomingCount > 0) {
        summary += `　另有 ${upcomingCount} 堂尚未上課，不列入統計`;
    }
    summaryEl.innerHTML = summary;

    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    const spansYears = startVal.slice(0, 4) !== endVal.slice(0, 4);

    listEl.innerHTML = lessons.map(l => {
        const d = new Date(`${l.dateStr}T00:00:00`);
        const md = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
        const dateLabel = `${spansYears ? d.getFullYear() + '/' : ''}${md} (${weekDays[d.getDay()]})`;
        const hours = Number((l.minutes / 60).toFixed(2));

        return `
            <div class="lesson-item ${l.completed ? '' : 'is-upcoming'}">
                <span class="lesson-date">${dateLabel}</span>
                <span class="lesson-time">${escapeProfileText(l.start)}-${escapeProfileText(l.end)}（${hours} 小時）</span>
                <span class="lesson-loc">📍 ${escapeProfileText(l.loc)}</span>
                <span class="lesson-money">$${Math.round(l.money).toLocaleString()}</span>
                ${l.completed ? '' : '<span class="lesson-tag">未上</span>'}
            </div>`;
    }).join('');
};

// 取得學生資料
async function renderStudentDbPanel() {
    const listEl = document.getElementById('student-db-list');
    const template = document.getElementById('student-row-template');

    if (!listEl || !template) return;
    closeStudentProfile();
    

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
                openStudentProfile(name, data);
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

// ------------------------------------------------------------
// 資訊總覽：停課公告 + 下週時段 + 工時 + 收入
// ------------------------------------------------------------
const OVERVIEW_DOC_ID = 'content';

// 暫存：只存草稿，學生端不會看到變化
window.saveOverviewDraft = async function () {
    const notice = document.getElementById('overview-notice-input').value;
    const slots = document.getElementById('overview-slots-input').value;
    try {
        await setDoc(doc(db, "overview", OVERVIEW_DOC_ID), {
            noticeDraft: notice,
            slotsDraft: slots,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        alert('已暫存');
    } catch (err) {
        console.error('暫存失敗:', err);
        alert('暫存失敗，請稍後再試');
    }
};

// 更新：草稿跟正式發布版一起存，學生端會立刻看到
window.publishOverview = async function () {
    const notice = document.getElementById('overview-notice-input').value;
    const slots = document.getElementById('overview-slots-input').value;
    const sure = confirm('確定要更新嗎？學生會立刻看到最新內容。');
    if (!sure) return;
    try {
        await setDoc(doc(db, "overview", OVERVIEW_DOC_ID), {
            noticeDraft: notice,
            noticeLive: notice,
            slotsDraft: slots,
            slotsLive: slots,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        alert('✅ 已更新，學生端會同步顯示');
    } catch (err) {
        console.error('更新失敗:', err);
        alert('更新失敗，請稍後再試');
    }
};

// 教練打開「總覽」分頁時，把草稿內容帶回輸入框
async function loadOverviewEditor() {
    try {
        const snap = await getDoc(doc(db, "overview", OVERVIEW_DOC_ID));
        const data = snap.exists() ? snap.data() : {};
        const noticeInput = document.getElementById('overview-notice-input');
        const slotsInput = document.getElementById('overview-slots-input');
        if (noticeInput) noticeInput.value = data.noticeDraft || '';
        if (slotsInput) slotsInput.value = data.slotsDraft || '';
    } catch (err) {
        console.error('讀取總覽草稿失敗:', err);
    }
}

// 工時／收入：用「今天」實際日期計算，不受行事曆目前瀏覽到哪一週/哪個月影響
function renderOverviewStats() {
    const courses = window.courses || [];
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();

    const monthData = (typeof window.calculateMonthlyData === 'function')
        ? window.calculateMonthlyData(year, month)
        : { totalMinutes: 0, totalIncome: 0 };

    const dayOfWeek = today.getDay();
    const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + offset);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    let weekMinutes = 0;
    courses.forEach((course) => {
        if (!course || course.type !== 'work') return;
        const duration = Number(course.duration || 0);

        if (course.isRepeating) {
            const targetDay = (course.day === "8" ? 0 : parseInt(course.day, 10) - 1);
            const exceptions = course.exceptions || [];
            for (let i = 0; i < 7; i++) {
                const d = new Date(monday);
                d.setDate(monday.getDate() + i);
                if (d.getDay() !== targetDay) continue;
                const dStr = d.toLocaleDateString('en-CA');
                if (exceptions.includes(dStr)) continue;
                if (course.date && dStr < course.date) continue;
                weekMinutes += duration;
            }
        } else {
            if (!course.date) return;
            const cDate = new Date(`${course.date}T00:00:00`);
            if (cDate >= monday && cDate <= sunday) weekMinutes += duration;
        }
    });

    const weekEl = document.getElementById('overview-week-hours');
    const monthEl = document.getElementById('overview-month-hours');
    const incomeEl = document.getElementById('overview-month-income');
    if (weekEl) weekEl.innerText = (weekMinutes / 60).toFixed(1);
    if (monthEl) monthEl.innerText = (monthData.totalMinutes / 60).toFixed(1);
    if (incomeEl) incomeEl.innerText = Math.round(monthData.totalIncome).toLocaleString();
}

// 導覽列點「總覽」時會呼叫這個（你貼的程式碼裡已經有呼叫 window.renderOverviewPanel 的地方了）
window.renderOverviewPanel = function () {
    loadOverviewEditor();
    renderOverviewStats();
    if (typeof window.renderTodaySchedule === 'function') {
        window.renderTodaySchedule();
    }
    loadPaymentSettingsEditor();
};

// 收入數字的模糊/顯示切換（跟側邊欄那個是同一套邏輯，另外獨立一份給總覽頁用）
document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn2 = document.getElementById('overview-income-toggle');
    const incomeSpan2 = document.getElementById('overview-month-income');
    if (toggleBtn2 && incomeSpan2) {
        toggleBtn2.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isRevealed = incomeSpan2.classList.toggle('revealed');
            toggleBtn2.innerHTML = isRevealed ? '隱藏' : '查看';
        });
    }
});

// 學生端：即時監聽公告/時段，教練一按「更新」就會同步顯示
function watchOverviewForStudent() {
    try {
        onSnapshot(doc(db, "overview", OVERVIEW_DOC_ID), (snap) => {
            const data = snap.exists() ? snap.data() : {};

            const noticeEl = document.getElementById('student-notice-content');
            if (noticeEl) noticeEl.innerText = data.noticeLive || '目前沒有公告';

            const slotsEl = document.getElementById('student-slots-content');
            if (slotsEl) {
                const lines = (data.slotsLive || '').split('\n').map((s) => s.trim()).filter(Boolean);
                if (lines.length === 0) {
                    slotsEl.innerHTML = '<p>目前沒有公告時段</p>';
                } else {
                    slotsEl.innerHTML = lines.map((line) => `<div class="slot-chip">${line}</div>`).join('');
                }
            }
        });
    } catch (err) {
        console.error('監聽總覽資料失敗:', err);
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

// 新增學生
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
            renderStudentNextClassCard();
        }
        
        // 📊 同步更新左側 Sidebar 的統計數據與時數
        if (window.updateStats) {
            window.updateStats();
        } else if (window.renderAll) {
            window.renderAll();
        }
    });
}



function renderStudentNextClassCard() {
    if (!currentUser || currentUser.role !== 'student' || !currentUser.name) return;
    const el = document.getElementById('student-next-class');
    if (!el) return;

    const next = (typeof window.findNextClassForStudentHome === 'function')
        ? window.findNextClassForStudentHome(currentUser.name)
        : null;

    if (!next) {
        el.innerText = '尚無排定課程';
        return;
    }

    const d = new Date(`${next.dateStr}T00:00:00`);
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    const loc = next.course.loc ? ` @ ${next.course.loc}` : '';
    el.innerText = `${d.getMonth() + 1}/${d.getDate()} (${weekDays[d.getDay()]}) ${next.course.start} - ${next.course.end}${loc}`;
}


// 同步student view的資料
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

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            myEvents.push({ ...data, id: data.id ? data.id.toString() : docSnap.id });
        });


        if (window.updateCalendarUI) {
            window.updateCalendarUI(myEvents);
        }

        renderStudentNextClassCard();
        refreshStudentPaymentViews();

        if (typeof window.renderStudentMonthCalendar === 'function') {
            window.renderStudentMonthCalendar();
        }
        if (typeof window.renderProgressChart === 'function') {
            window.renderProgressChart();
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

        await syncReportStatusWithPaid(year, month, studentName, isPaid);
        
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

    try {
        const q = query(
            collection(db, "incomeRecords"),
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

// 自動記憶上課價錢
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

// 登出
navBtns.forEach((btn) => {

    btn.addEventListener('click', async () => {

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

// 學生端標籤頁切換
document.addEventListener('DOMContentLoaded', () => {
    const studentNavBtns = document.querySelectorAll('.student-nav-btn');
    studentNavBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            const targetPanelId = btn.dataset.panel;
            studentNavBtns.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');

            document.querySelectorAll('.student-panel').forEach((panel) => {
                panel.classList.toggle('active', panel.dataset.panelId === targetPanelId);
            });

            if (targetPanelId === 'panel-student-calendar' && typeof window.renderStudentMonthCalendar === 'function') {
                window.renderStudentMonthCalendar();
            }
            if (targetPanelId === 'panel-student-history' && typeof window.renderProgressChart === 'function') {
                window.renderProgressChart();
            }
            if (targetPanelId === 'panel-student-pay') {
                renderStudentPayPanel();
            }
        });
    });
});

// 學生自己查詢上課紀錄：邏輯跟教練端的 queryStudentHistory 一樣，
// 差別只在不用選學生，自動用自己的名字
window.queryMyHistory = function () {
    if (!currentUser || !currentUser.name) return;

    const startInput = document.getElementById('student-history-start');
    const endInput = document.getElementById('student-history-end');
    const resultEl = document.getElementById('student-history-result');
    if (!startInput.value || !endInput.value) {
        resultEl.innerText = '請選擇開始與結束日期';
        return;
    }

    const startDate = new Date(`${startInput.value}T00:00:00`);
    const endDate = new Date(`${endInput.value}T00:00:00`);
    if (startDate > endDate) {
        resultEl.innerText = '開始日期不能晚於結束日期';
        return;
    }

    const allCourses = window.courses || [];
    const myCourses = allCourses.filter((c) => c && c.type === 'work' && c.name === currentUser.name);

    let count = 0;
    let totalMinutes = 0;
    let totalMoney = 0;

    myCourses.forEach((course) => {
        const hourlyRate = course.price !== undefined ? Number(course.price) : 600;
        const duration = Number(course.duration || 0);

        if (course.isRepeating) {
            const targetDay = (course.day === "8" ? 0 : parseInt(course.day) - 1);
            const exceptions = course.exceptions || [];
            let cursor = new Date(startDate);
            while (cursor <= endDate) {
                if (cursor.getDay() === targetDay) {
                    const dStr = cursor.toLocaleDateString('en-CA');
                    if (!exceptions.includes(dStr)) {
                        count++;
                        totalMinutes += duration;
                        totalMoney += (duration / 60) * hourlyRate;
                    }
                }
                cursor.setDate(cursor.getDate() + 1);
            }
        } else {
            if (!course.date) return;
            const courseDate = new Date(`${course.date}T00:00:00`);
            if (courseDate >= startDate && courseDate <= endDate) {
                count++;
                totalMinutes += duration;
                totalMoney += (duration / 60) * hourlyRate;
            }
        }
    });

    if (count === 0) {
        resultEl.innerHTML = '這段期間查無上課紀錄';
        return;
    }

    resultEl.innerHTML = `共 <strong>${count}</strong> 堂課（${(totalMinutes / 60).toFixed(1)} 小時），總金額 <strong>$${Math.round(totalMoney).toLocaleString()}</strong>`;
};

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

// ============================================================
// 繳費流程：學生回報匯款 → 教練確認收款
// monthIdx 一律是 JS 的 0~11
// ============================================================
let paySettings = {};
let payCoachReports = {};
let payStudentReports = {};
let payStudentPaidMonths = {};
let payUnsubCoach = null;
let payUnsubStudent = [];
let payQrDraft = { 1: null, 2: null };
let payYear = new Date().getFullYear();
let payMonthIdx = new Date().getMonth();
let payCurrentAmount = 0;

function payEscape(text) {
    return String(text ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}
function payMonthKey(year, monthIdx) {
    return `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
}
function payMonthNumber(year, monthIdx) { return year * 12 + monthIdx; }
function payReportId(year, monthIdx, studentName) {
    return `${payMonthKey(year, monthIdx)}_${encodeURIComponent(studentName)}`;
}
function payReportCacheKey(year, monthIdx, studentName) {
    return `${payMonthKey(year, monthIdx)}_${studentName}`;
}
function payFormatTime(iso) {
    const t = iso ? new Date(iso) : null;
    if (!t || isNaN(t.getTime())) return '';
    return `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}
window.payFormatTime = payFormatTime;

function payComputeAmount(year, monthIdx) {
    if (typeof window.calculateMonthlyData !== 'function') return { amount: 0, minutes: 0 };
    const d = window.calculateMonthlyData(year, monthIdx);
    return { amount: Math.round(d.totalIncome), minutes: d.totalMinutes };
}

async function payCopyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (_) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (_) { /* 忽略 */ }
        document.body.removeChild(ta);
        return ok;
    }
}

// ---------- 教練端：監聽所有回報 ----------
window.getPaymentReport = function (year, monthIdx, studentName) {
    return payCoachReports[payReportCacheKey(year, monthIdx, studentName)] || null;
};

function updateIncomeNavBadge() {
    const btn = document.querySelector('.coach-nav-btn[data-panel="panel-income"]');
    if (!btn) return;
    const pending = Object.values(payCoachReports).filter(r => r.status === 'reported').length;
    let badge = btn.querySelector('.nav-badge');
    if (pending === 0) {
        if (badge) badge.remove();
        return;
    }
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-badge';
        btn.appendChild(badge);
    }
    badge.textContent = pending;
}

function startCoachPaymentWatcher() {
    stopCoachPaymentWatcher();
    payUnsubCoach = onSnapshot(collection(db, 'paymentReports'), (snap) => {
        const cache = {};
        snap.forEach((d) => {
            const x = d.data();
            cache[payReportCacheKey(x.year, x.month - 1, x.studentName)] = x;
        });
        payCoachReports = cache;
        updateIncomeNavBadge();

        const incomePanel = document.getElementById('panel-income');
        if (incomePanel && incomePanel.classList.contains('active') &&
            typeof window.renderIncomePanel === 'function') {
            window.renderIncomePanel();
        }
    }, (err) => console.error('監聽匯款回報失敗:', err));
}

function stopCoachPaymentWatcher() {
    if (payUnsubCoach) { payUnsubCoach(); payUnsubCoach = null; }
    payCoachReports = {};
    updateIncomeNavBadge();
}

// 教練勾選／取消「已收款」時，同步回報狀態（失敗不影響收款紀錄本身）
async function syncReportStatusWithPaid(year, monthIdx, studentName, isPaid) {
    try {
        if (!payCoachReports[payReportCacheKey(year, monthIdx, studentName)]) return;
        await setDoc(doc(db, 'paymentReports', payReportId(year, monthIdx, studentName)),
            { status: isPaid ? 'confirmed' : 'reported' }, { merge: true });
    } catch (err) {
        console.error('同步回報狀態失敗:', err);
    }
}

window.cancelPaymentReport = async function (year, monthIdx, studentName) {
    if (!confirm(`確定要取消 [${studentName}] 的轉帳回報嗎？\n取消後會回到「待收款」，學生可以重新回報。`)) return;
    try {
        await deleteDoc(doc(db, 'paymentReports', payReportId(year, monthIdx, studentName)));
    } catch (err) {
        console.error('取消回報失敗:', err);
        alert('取消失敗，請稍後再試');
    }
};

// ---------- 教練端：收款資訊設定 ----------
function renderPayQrPreview(slot) {
    const el = document.getElementById(`pay-set-qr${slot}-preview`);
    if (!el) return;
    el.innerHTML = payQrDraft[slot]
        ? `<img src="${payQrDraft[slot]}" alt="QR Code ${slot}">`
        : '<span class="no-data-hint">尚未上傳</span>';
}

function payCompressImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            const encode = (maxSide, quality) => {
                const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
                const w = Math.max(1, Math.round(img.width * scale));
                const h = Math.max(1, Math.round(img.height * scale));
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';   // JPEG 沒有透明，先鋪白底，避免透明 QR 變黑底
                ctx.fillRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
                return canvas.toDataURL('image/jpeg', quality);
            };
            for (const [side, q] of [[480, 0.88], [480, 0.7], [360, 0.7], [320, 0.6]]) {
                const out = encode(side, q);
                if (out.length <= 300000) { resolve(out); return; }
            }
            reject(new Error('圖片太大，請換一張較小的圖'));
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('無法讀取這個圖片檔'));
        };
        img.src = url;
    });
}

async function handlePayQrFile(slot, file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('請選擇圖片檔'); return; }
    try {
        payQrDraft[slot] = await payCompressImage(file);
        renderPayQrPreview(slot);
    } catch (err) {
        alert(err.message || '圖片處理失敗');
    }
}

window.clearPaymentQr = function (slot) {
    payQrDraft[slot] = null;
    const input = document.getElementById(`pay-set-qr${slot}-file`);
    if (input) input.value = '';
    renderPayQrPreview(slot);
};

async function loadPaymentSettingsEditor() {
    try {
        const snap = await getDoc(doc(db, 'settings', 'payment'));
        const s = snap.exists() ? snap.data() : {};
        const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
        setVal('pay-set-bank-name', s.bankName);
        setVal('pay-set-bank-code', s.bankCode);
        setVal('pay-set-account', s.account);
        setVal('pay-set-holder', s.holder);
        setVal('pay-set-qr1-name', s.qr1 && s.qr1.name);
        setVal('pay-set-qr2-name', s.qr2 && s.qr2.name);
        payQrDraft[1] = (s.qr1 && s.qr1.dataUrl) || null;
        payQrDraft[2] = (s.qr2 && s.qr2.dataUrl) || null;
        renderPayQrPreview(1);
        renderPayQrPreview(2);
    } catch (err) {
        console.error('讀取收款資訊失敗:', err);
    }
}

window.savePaymentSettings = async function () {
    const val = (id) => (document.getElementById(id)?.value || '').trim();
    const qrEntry = (slot) => payQrDraft[slot]
        ? { name: val(`pay-set-qr${slot}-name`) || `QR Code ${slot}`, dataUrl: payQrDraft[slot] }
        : null;
    try {
        await setDoc(doc(db, 'settings', 'payment'), {
            bankName: val('pay-set-bank-name'),
            bankCode: val('pay-set-bank-code'),
            account: val('pay-set-account'),
            holder: val('pay-set-holder'),
            qr1: qrEntry(1),
            qr2: qrEntry(2),
            updatedAt: new Date().toISOString()
        });
        alert('✅ 收款資訊已儲存，學生端會同步更新');
    } catch (err) {
        console.error('儲存收款資訊失敗:', err);
        alert('儲存失敗，請稍後再試');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    [1, 2].forEach((slot) => {
        const input = document.getElementById(`pay-set-qr${slot}-file`);
        if (input) input.addEventListener('change', (e) => handlePayQrFile(slot, e.target.files[0]));
    });
});

// ---------- 學生端：監聽自己的繳費狀態、回報、收款資訊 ----------
function stopStudentPaymentWatchers() {
    payUnsubStudent.forEach((fn) => fn());
    payUnsubStudent = [];
    payStudentReports = {};
    payStudentPaidMonths = {};
}

function startStudentPaymentWatchers(studentName) {
    stopStudentPaymentWatchers();
    if (!studentName) return;

    payUnsubStudent.push(onSnapshot(
        query(collection(db, 'incomeRecords'), where('studentName', '==', studentName)),
        (snap) => {
            const paid = {};
            snap.forEach((d) => {
                const x = d.data();
                if (x.isPaid === true) paid[payMonthKey(x.year, x.month - 1)] = true;
            });
            payStudentPaidMonths = paid;
            refreshStudentPaymentViews();
        },
        (err) => console.error('監聽繳費狀態失敗:', err)
    ));

    payUnsubStudent.push(onSnapshot(
        query(collection(db, 'paymentReports'), where('studentName', '==', studentName)),
        (snap) => {
            const reports = {};
            snap.forEach((d) => {
                const x = d.data();
                reports[payMonthKey(x.year, x.month - 1)] = x;
            });
            payStudentReports = reports;
            refreshStudentPaymentViews();
        },
        (err) => console.error('監聽匯款回報失敗:', err)
    ));

    payUnsubStudent.push(onSnapshot(
        doc(db, 'settings', 'payment'),
        (snap) => {
            paySettings = snap.exists() ? snap.data() : {};
            refreshStudentPaymentViews();
        },
        (err) => console.error('監聽收款資訊失敗:', err)
    ));
}

function refreshStudentPaymentViews() {
    if (!currentUser || currentUser.role !== 'student') return;
    updateHomePaymentCard();
    const payPanel = document.getElementById('panel-student-pay');
    if (payPanel && payPanel.classList.contains('active')) renderStudentPayPanel();
}

// 首頁「繳費情形」卡（以今天所在的月份為準）
function updateHomePaymentCard() {
    const el = document.getElementById('student-class-count');
    if (!el) return;
    const set = (text, color) => { el.innerText = text; el.style.color = color; };

    const now = new Date();
    const key = payMonthKey(now.getFullYear(), now.getMonth());
    const report = payStudentReports[key];

    if (payStudentPaidMonths[key] === true) { set('已繳費', '#2e7d32'); return; }
    if (report && report.status === 'reported') { set('已回報，待確認', '#e67e22'); return; }
    if (Array.isArray(window.courses) &&
        payComputeAmount(now.getFullYear(), now.getMonth()).amount <= 0) {
        set('本月無費用', '#7f8c8d');
        return;
    }
    set('未繳費', '#d32f2f');
}

function payEarliestMonthNumber() {
    const now = new Date();
    let min = payMonthNumber(now.getFullYear(), now.getMonth());
    (window.courses || []).forEach((c) => {
        if (!c || c.type !== 'work' || !c.date) return;
        const y = parseInt(c.date.slice(0, 4), 10);
        const m = parseInt(c.date.slice(5, 7), 10) - 1;
        if (Number.isFinite(y) && Number.isFinite(m)) min = Math.min(min, payMonthNumber(y, m));
    });
    return min;
}

window.changePayMonth = function (direction) {
    const now = new Date();
    const maxNum = payMonthNumber(now.getFullYear(), now.getMonth());
    const minNum = Math.min(payEarliestMonthNumber(), maxNum);
    const next = Math.max(minNum, Math.min(maxNum, payMonthNumber(payYear, payMonthIdx) + direction));
    payYear = Math.floor(next / 12);
    payMonthIdx = next % 12;
    renderStudentPayPanel();
};

function setPayBanner(type, html) {
    const el = document.getElementById('pay-status-banner');
    if (el) el.innerHTML = `<div class="pay-banner pay-banner-${type}">${html}</div>`;
}

function renderPayMethodHtml(amount) {
    const s = paySettings || {};
    const qrs = [s.qr1, s.qr2].filter((q) => q && q.dataUrl);
    if (!s.account && qrs.length === 0) {
        return `<div class="pay-card"><p class="no-data-hint">教練尚未設定收款資訊，請直接聯繫教練。</p></div>`;
    }

    let html = '';
    if (s.account) {
        const bankText = `${payEscape(s.bankName || '')}${s.bankCode ? `（代碼 ${payEscape(s.bankCode)}）` : ''}`;
        html += `
            <div class="pay-card">
                <h3 class="pay-section-title">🏦 銀行轉帳</h3>
                ${bankText ? `<div class="pay-info-row"><span>銀行</span><strong>${bankText}</strong></div>` : ''}
                <div class="pay-info-row"><span>帳號</span><strong>${payEscape(s.account)}</strong></div>
                ${s.holder ? `<div class="pay-info-row"><span>戶名</span><strong>${payEscape(s.holder)}</strong></div>` : ''}
                <div class="pay-info-row"><span>金額</span><strong>$${amount.toLocaleString()}</strong></div>
                <div class="pay-copy-row">
                    <button type="button" onclick="copyPayInfo('account', this)">複製帳號</button>
                    <button type="button" onclick="copyPayInfo('amount', this)">複製金額</button>
                    <button type="button" onclick="copyPayInfo('all', this)">複製全部資訊</button>
                </div>
            </div>`;
    }
    if (qrs.length > 0) {
        html += `
            <div class="pay-card">
                <h3 class="pay-section-title">📱 行動支付 QR Code</h3>
                <div class="pay-qr-grid">
                    ${qrs.map((q) => `
                        <figure class="pay-qr">
                            <img src="${q.dataUrl}" alt="${payEscape(q.name)}">
                            <figcaption>${payEscape(q.name)}</figcaption>
                        </figure>`).join('')}
                </div>
                <p class="pay-qr-hint">掃碼時請輸入金額 $${amount.toLocaleString()}</p>
            </div>`;
    }
    return html;
}

window.copyPayInfo = async function (kind, btn) {
    const s = paySettings || {};
    let text = '';
    if (kind === 'account') {
        text = s.account || '';
    } else if (kind === 'amount') {
        text = String(payCurrentAmount);
    } else {
        const bankLine = `${s.bankName || ''}${s.bankCode ? `（代碼 ${s.bankCode}）` : ''}`;
        text = [
            `銀行：${bankLine}`,
            `帳號：${s.account || ''}`,
            `戶名：${s.holder || ''}`,
            `金額：$${payCurrentAmount.toLocaleString()}`
        ].join('\n');
    }

    const ok = await payCopyToClipboard(text);
    if (!ok) { alert('複製失敗，請手動長按文字複製'); return; }
    if (btn) {
        const original = btn.innerText;
        btn.innerText = '已複製 ✓';
        setTimeout(() => { btn.innerText = original; }, 1500);
    }
};

function renderStudentPayPanel() {
    if (!currentUser || currentUser.role !== 'student' || !currentUser.name) return;

    const now = new Date();
    const maxNum = payMonthNumber(now.getFullYear(), now.getMonth());
    const minNum = Math.min(payEarliestMonthNumber(), maxNum);
    const curNum = Math.max(minNum, Math.min(maxNum, payMonthNumber(payYear, payMonthIdx)));
    payYear = Math.floor(curNum / 12);
    payMonthIdx = curNum % 12;

    const labelEl = document.getElementById('pay-month-label');
    if (labelEl) labelEl.innerText = `${payYear} 年 ${payMonthIdx + 1} 月`;
    const prevBtn = document.getElementById('pay-month-prev');
    const nextBtn = document.getElementById('pay-month-next');
    if (prevBtn) prevBtn.disabled = curNum <= minNum;
    if (nextBtn) nextBtn.disabled = curNum >= maxNum;

    const { amount, minutes } = payComputeAmount(payYear, payMonthIdx);
    payCurrentAmount = amount;

    const amountEl = document.getElementById('pay-amount');
    const hoursEl = document.getElementById('pay-hours');
    if (amountEl) amountEl.innerText = `$${amount.toLocaleString()}`;
    if (hoursEl) hoursEl.innerText = `共 ${Number((minutes / 60).toFixed(2))} 小時`;

    const methodEl = document.getElementById('pay-method-area');
    const reportEl = document.getElementById('pay-report-area');
    const key = payMonthKey(payYear, payMonthIdx);
    const paid = payStudentPaidMonths[key] === true;
    const report = payStudentReports[key] || null;

    if (amount <= 0) {
        setPayBanner('none', '這個月沒有需要繳費的課程');
        if (methodEl) methodEl.innerHTML = '';
        if (reportEl) reportEl.innerHTML = '';
        return;
    }
    if (paid) {
        setPayBanner('paid', '✅ 已繳費<br><small>教練已確認收款，謝謝！</small>');
        if (methodEl) methodEl.innerHTML = '';
        if (reportEl) reportEl.innerHTML = '';
        return;
    }

    if (methodEl) methodEl.innerHTML = renderPayMethodHtml(amount);

    if (report && report.status === 'reported') {
        setPayBanner('reported',
            `⏳ 已回報，等待教練確認<br><small>後五碼 ${payEscape(report.last5)}｜${payEscape(payFormatTime(report.reportedAt))}</small>`);
        if (reportEl) reportEl.innerHTML =
            `<button type="button" class="pay-report-btn" disabled>已回報，等待教練確認</button>`;
    } else {
        setPayBanner('unpaid', '尚未繳費');
        if (reportEl) reportEl.innerHTML =
            `<button type="button" class="pay-report-btn" onclick="openReportModal()">已匯款，回報繳費狀況</button>`;
    }
}

// ---------- 學生端：回報視窗 ----------
window.openReportModal = function () {
    if (payCurrentAmount <= 0) return;
    document.getElementById('report-modal-summary').innerText =
        `${payYear} 年 ${payMonthIdx + 1} 月　應繳 $${payCurrentAmount.toLocaleString()}`;
    const input = document.getElementById('report-last5');
    input.value = '';
    document.getElementById('report-error').textContent = '';
    document.getElementById('report-form-state').classList.remove('hide');
    document.getElementById('report-done-state').classList.add('hide');
    document.getElementById('report-modal').classList.remove('hide');
    input.focus();
};

window.closeReportModal = function () {
    document.getElementById('report-modal').classList.add('hide');
};

window.submitPaymentReport = async function () {
    const last5 = document.getElementById('report-last5').value.trim();
    const errEl = document.getElementById('report-error');
    const submitBtn = document.getElementById('report-submit-btn');
    errEl.textContent = '';

    if (!/^\d{5}$/.test(last5)) {
        errEl.textContent = '請輸入 5 位數字的匯款帳號後五碼';
        return;
    }
    if (!currentUser || !currentUser.name || payCurrentAmount <= 0) return;

    submitBtn.disabled = true;
    try {
        await setDoc(doc(db, 'paymentReports', payReportId(payYear, payMonthIdx, currentUser.name)), {
            studentName: currentUser.name,
            year: payYear,
            month: payMonthIdx + 1,
            amount: payCurrentAmount,
            last5,
            status: 'reported',
            reportedAt: new Date().toISOString()
        });
        document.getElementById('report-form-state').classList.add('hide');
        document.getElementById('report-done-state').classList.remove('hide');
    } catch (err) {
        console.error('送出回報失敗:', err);
        errEl.textContent = '送出失敗，請稍後再試';
    } finally {
        submitBtn.disabled = false;
    }
};
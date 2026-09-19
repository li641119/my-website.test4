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
// 登入表單邏輯（原本檔案下面已經有一份正確的，這裡保留唯一一份）
// ------------------------------------------------------------
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const errorMsg = document.getElementById('login-error');
        errorMsg.textContent = '';

        signInWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                console.log("登入成功:", userCredential.user.email);
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
    const mainApp = document.getElementById('main-app'); 
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
            mainApp.classList.remove('hide');
            mainApp.style.display = 'flex';
            studentView.style.display = 'none';
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
            if (mainApp) mainApp.style.display = 'none';
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
        if (mainApp) mainApp.style.display = 'none';
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
        
        const studentRef = doc(db, "students", eventData.name); // 假設文件 ID 就是姓名
        const studentSnap = await getDoc(studentRef);
        
        let emailToUpload = "";
        if (studentSnap.exists() && studentSnap.data().email) {
            // 找到 Email 了
            emailToUpload = studentSnap.data().email;
        } else {
            console.warn(`⚠️ 找不到學生 [${eventData.name}] 的對照 Email，已自動預設為空字串。`);
        }

        // 2. 自動記憶機制
        await setDoc(studentRef, { 
            defaultPrice: currentPrice 
        }, { merge: true });
        console.log(`🚀 雲端已記憶 ${eventData.name} 的預設學費為: ${currentPrice} 元`);

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

console.log("Firebase 監聽器已啟動");
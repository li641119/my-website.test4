// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { 
    getFirestore, collection, query, where, getDocs, onSnapshot, setDoc, doc, deleteDoc, getDoc
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
// 1. 新增：匯入 Firebase Auth 模組
import { 
    getAuth, signInWithEmailAndPassword, onAuthStateChanged
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
const auth = getAuth(app); // 初始化 Auth

let unsubscribe = null;
const COACH_EMAIL = "li641119@gmail.com"; 

// --- 1. 從 cal-gemini.js 匯入渲染函式 ---
import { renderAll } from './cal-gemini.js';

// --- 2. 貼上你的使用者狀態與設定函式 ---
export let currentUser = {
    uid: null,
    email: '',
    role: 'coach', // 'coach' 或 'student'
    name: ''
};

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
 
        try {
            await createUserWithEmailAndPassword(auth, email, password);
 
            // 🔑 關鍵：把姓名跟 Email 對應存到 Firestore 的 students collection，
            // 之後這個人登入時，系統才能用 Email 反查出「這是哪個學生」，
            // 進而只顯示屬於他自己的課程。
            //
            // ⚠️ 非常重要：這裡填的姓名，必須跟教練排課時在「行程名稱」欄位打的
            // 學生姓名「一字不差」完全一樣（包含空白、全形半形），
            // 否則系統會找不到對應的課程。
            await setDoc(doc(db, "students", name), { email: email }, { merge: true });
 
            // 註冊成功後 Firebase 會自動幫這個帳號登入，
            // 畫面切換交給下面的 onAuthStateChanged 統一處理，這裡不用做別的事
        } catch (error) {
            console.error("註冊失敗:", error.code);
            const map = {
                'auth/email-already-in-use': '這個 Email 已經被註冊過了',
                'auth/invalid-email': 'Email 格式不正確',
                'auth/weak-password': '密碼至少需要 6 個字元',
                'auth/network-request-failed': '網路連線異常，請檢查網路',
            };
            errorMsg.textContent = map[error.code] || ('註冊失敗：' + error.message);
        }
    });
}

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
 

/**驗證身分*/
onAuthStateChanged(auth, async (user) => {
    const loginContainer = document.getElementById('login-container');
    const mainApp = document.getElementById('main-app'); 
    const coachView = document.getElementById('coach-view'); 
    const studentView = document.getElementById('student-view'); 
    const sidebar = document.querySelector('.sidebar');
 
    if (user) {
        console.log("當前登入者:", user.email);
        loginContainer.style.display = 'none';
 
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
        if (mainApp) mainApp.style.display = 'none';
        coachView.style.display = 'none';
        studentView.style.display = 'none';
        if (sidebar) sidebar.style.display = 'flex';
 
        currentUser = { uid: null, email: '', role: 'coach', name: '' };
 
        if (unsubscribe) unsubscribe();
    }
});

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


// 監聽登入表單
document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const errorMsg = document.getElementById('login-error');

    signInWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            console.log("登入成功:", userCredential.user.email);        
        })
        .catch((error) => {
            console.error("登入出錯:", error.code);
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
                errorMsg.innerText = "帳號或密碼錯誤";
            } else {
                errorMsg.innerText = "登入失敗：" + error.message;
            }
        });
});

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
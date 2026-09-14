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

export function setCurrentUser(user) {
    currentUser = user;
    
    // 1. 隱藏登入門禁
    const loginContainer = document.getElementById('login-container');
    if (loginContainer) loginContainer.style.display = 'none';

    const coachView = document.getElementById('coach-view');
    const studentView = document.getElementById('student-view');

    // 2. 根據身分顯示對應畫面
    if (currentUser.role === 'student') {
        if (coachView) coachView.classList.add('hide');
        if (studentView) studentView.style.display = 'block';

        // 更新學生抬頭資訊
        const nameEl = document.getElementById('student-name-display');
        if (nameEl) nameEl.innerText = currentUser.name || '同學';
    } else {
        if (coachView) coachView.classList.remove('hide');
        if (studentView) studentView.style.display = 'none';
    }

    // 3. 觸發重新渲染
    renderAll();
}

// --- 3. 在表單登入或 Firebase 驗證成功處呼叫 ---
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // 假設從輸入框或 Firebase 驗證取得資料
        const email = document.getElementById('email').value;
        
        // 範例：登入成功後切換身分
        const userData = {
            uid: "user_123",
            email: email,
            role: email.includes('student') ? 'student' : 'coach', // 依據實際驗證邏輯設定
            name: "洪昀"
        };
        
        setCurrentUser(userData);
    });
}

/**驗證身分*/
onAuthStateChanged(auth, user => {
    const loginContainer = document.getElementById('login-container');
    const mainApp = document.getElementById('main-app'); 
    const coachView = document.getElementById('coach-view'); 
    const studentView = document.getElementById('student-view'); 

    if (user) {
        console.log("當前登入者:", user.email);
        loginContainer.style.display = 'none';
        
        // 2. 身分分流判斷
        if (user.email.toLowerCase() === COACH_EMAIL.toLowerCase()) {
            // --- 教練模式 ---
            console.log("教練模式已啟動");

            coachView.classList.remove('hide');
            coachView.style.display = 'block';
            
            mainApp.classList.remove('hide');
            mainApp.style.display = 'flex'; // 顯示包含 sidebar 的大容器
            
            studentView.style.display = 'none';
            
            // 啟動資料監聽
            startLiveSync();
            
            if (window.renderCurrentWeek) window.renderCurrentWeek();
            if (window.updateStats) window.updateStats();
        } else {
            // --- 學生模式 ---
            const sidebar = document.querySelector('.sidebar');
            if (sidebar) sidebar.style.display = 'none';

            coachView.style.display = 'none';
            studentView.style.display = 'block';
            console.log("啟動學生模式");
            startStudentLiveSync(user.email);
        }
    } else {
    // 3. 登出狀態
        console.log("目前為登出狀態");
        loginContainer.style.display = 'flex';
        mainApp.style.display = 'none';
        coachView.style.display = 'none';
        studentView.style.display = 'none';
        
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) sidebar.style.display = 'block';

        if (unsubscribe) unsubscribe();
    }
});

/**及時監視器，同步更新 */
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

function startStudentLiveSync(studentEmail) {
    console.log(`🔒學生模式：正在同步 ${studentEmail} 的課程...`);
    if (unsubscribe) unsubscribe();

    const q = query(
        collection(db, "events"), 
        where("studentEmail", "==", studentEmail)
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
            if (data.data) {
                const courseDate = new Date(data.date);
                // 只篩選跟今天同一個年月的文件
                if (courseDate.getFullYear() === currentYear && courseDate.getMonth() === currentMonth) {
                    
                    // 1. 累加分鐘數 (優先抓 duration，沒有的話用格數算)
                    const duration = data.duration || ((data.endRow - data.startRow) * 10);
                    totalMinutes += duration;

                    // 2. 統計未繳費堂數 (假設你在教課完成後，會去資料庫將該課堂標記為 isPaid: true)
                    // 如果沒有標記或為 false，且類別是教球 (work)，就計入未繳費
                    if (data.type === 'work' && data.isPaid !== true) {
                        unpaidCount++;
                    }
                }
            }
        });
        // 1. 更新時數顯示
        document.getElementById('student-total-hours').innerText = (totalMinutes / 60).toFixed(1);

        // 2. 🚀【重大修正 2】：動態更新學生的繳費情形文字與顏色
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

        // 🚀【安全修正點 2】：強制對齊 Payload，確保絕對不會帶有 undefined 欄位
        const finalPayload = {
            ...eventData,
            price: currentPrice,
            studentEmail: emailToUpload // 🌟 穩穩地帶入字串，Firebase 絕對放行
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
    } // 👈 這是 catch 的結尾
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

    //🚀 【新增】：當輸入/選擇學生姓名時，自動從 Firestore 撈出並帶入預設學費//

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
                // 去雲端資料庫查找是否有這個學生的文件
                const studentRef = doc(db, "students", studentName);
                const studentSnap = await getDoc(studentRef);

                if (studentSnap.exists() && studentSnap.data().defaultPrice !== undefined) {
                    // 找到了！秒速自動帶入學費
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
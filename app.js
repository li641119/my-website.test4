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


onAuthStateChanged(auth, user => {
    const loginContainer = document.getElementById('login-container');
    const mainApp = document.getElementById('main-app'); 
    const coachView = document.getElementById('coach-view'); 
    const studentView = document.getElementById('student-view'); 

    if (user) {
        console.log("當前登入者:", user.email);
        loginContainer.style.display = 'none';
        mainApp.style.display = 'flex'; // 無論是誰，主容器都要打開
        
        // 2. 身分分流判斷
        if (user.email === COACH_EMAIL) {
            // --- 教練模式 ---
            mainApp.style.display = 'flex'; // 顯示包含 sidebar 的大容器
            coachView.style.display = 'block';
            studentView.style.display = 'none';
            console.log("教練模式已啟動");
            
            startLiveSync();
            
            if (window.renderCurrentWeek) window.renderCurrentWeek();
            if (window.updateStats) window.updateStats();
        } else {
            // --- 學生模式 ---
            coachView.style.display = 'none';
            studentView.style.display = 'block';
            console.log("啟動學生模式");
            // 啟動「只抓自己課程」的同步
            startStudentLiveSync(user.email);
        }
    } else {
    // 3. 登出狀態
        console.log("目前為登出狀態");
        loginContainer.style.display = 'block';
        mainApp.style.display = 'none';
        coachView.style.display = 'none';
        studentView.style.display = 'none';
        if (unsubscribe) unsubscribe(); // 登出時停止監聽
    }
});

function startLiveSync() {
    console.log("🔒 啟動全域資料同步 (教練視角)...");
    if (unsubscribe) unsubscribe(); 
    const q = query(collection(db, "events"));
    unsubscribe = onSnapshot(q, (snapshot) => {
        const myEvents = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            myEvents.push({ ...data, id: data.id || doc.id });
        });
        if (window.updateCalendarUI) window.updateCalendarUI(myEvents);
    });
}

function startStudentLiveSync(studentEmail) {
    console.log(`🔒 正在下載 ${studentEmail} 的專屬課程...`);
    if (unsubscribe) unsubscribe();
    const q = query(collection(db, "events"), where("studentEmail", "==", studentEmail));
    unsubscribe = onSnapshot(q, (snapshot) => {
        const myEvents = [];
        snapshot.forEach((doc) => {
            myEvents.push({ ...doc.data(), id: doc.id });
        });
        console.log("🔔 學生收到更新，課程數量：", myEvents.length);
        if (window.updateCalendarUI) window.updateCalendarUI(myEvents);
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

window.uploadEvent = async (eventData) => {
    try {
        // 1. 根據學生姓名去 students 表查找 Email
        const studentRef = doc(db, "students", eventData.title); // 假設文件 ID 就是姓名
        const studentSnap = await getDoc(studentRef);
        
        if (studentSnap.exists()) {
            // 2. 找到 Email 了，自動補進 eventData
            eventData.studentEmail = studentSnap.data().email;
        } else {
            console.warn("找不到此學生的對照 Email，學生登入後將看不到此課程");
        }

        // 3. 儲存到原本的 events 集合
        const eventId = eventData.id.toString();
        await setDoc(doc(db, "events", eventId), eventData);
        console.log("✅ 課程已關聯學生帳號並上傳成功！");
    } catch (e) {
        console.error("❌ 上傳失敗:", e);
    }
};

window.removeEventFromCloud = async (eventId) => {
    try {
        const idStr = eventId.toString();
        await deleteDoc(doc(db, "events", idStr));
        console.log("✅ 雲端資料已刪除:", idStr);
    } catch (e) {
        console.error("❌ 刪除失敗:", e);
    }
};

console.log("Firebase 監聽器已啟動");
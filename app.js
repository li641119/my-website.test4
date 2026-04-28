// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { 
    getFirestore, collection, query, where, getDocs, onSnapshot, setDoc, doc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
// 1. 新增：匯入 Firebase Auth 模組
import { getAuth, signInWithEmailAndPassword
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

function handleLoginSuccess(user) {
    console.log("登入成功，用戶 UID:", user.uid);
    document.getElementById('login-container').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
    startLiveSync(user.uid);
}

// 監聽登入表單
document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const errorMsg = document.getElementById('login-error');

    signInWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            // 驗證成功
            handleLoginSuccess(userCredential.user);        
        })
            .catch((error) => {
            // 驗證失敗 (例如密碼錯誤或帳號不存在)
            console.error("登入出錯:", error.code);
            if (error.code === 'auth/user-not-found') {
                errorMsg.innerText = "找不到此帳號";
            } else if (error.code === 'auth/wrong-password') {
                errorMsg.innerText = "密碼錯誤";
            } else {
                errorMsg.innerText = "登入失敗：" + error.message;
            }
        });
});

function startLiveSync(uid) {
    console.log("🔒 啟動個人資料同步...");
    if (unsubscribe) unsubscribe(); // 避免重複監聽

    const q = query(collection(db, "events"));
    
    // 使用 onSnapshot 確保資料變動時 UI 會自動更新
    unsubscribe = onSnapshot(q, (snapshot) => {
        const myEvents = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            const eventWithId = { ...data, id: data.id || doc.id };
            myEvents.push(eventWithId);
        });
        
        console.log("🔔 收到個人雲端更新，共有資料：", myEvents.length);
        if (window.updateCalendarUI) {
            window.updateCalendarUI(myEvents);
        }
    });
}

window.uploadEvent = async (eventData) => {
    try {
        const currentUser = auth.currentUser;
        if (currentUser) {
            eventData.studentId = currentUser.uid;
        }

        const eventId = eventData.id.toString();
        await setDoc(doc(db, "events", eventId), eventData);
        console.log("✅ 雲端上傳成功！");
    } catch (e) {
        console.error("❌ 雲端上傳失敗:", e);
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
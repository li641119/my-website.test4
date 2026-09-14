// --- 全域變數 ---
import { currentUser } from './app.js';
let courses = [];
let viewDate = new Date(); 
let editingId = null; // 【編輯功能關鍵】用於追蹤正在編輯的行程 ID

const presetColors = [
    '#c2bcbc', '#b5e3db', '#d5e3c7', '#efe78e', '#fad595', 
    '#ffc0c7', '#f5c5ff', '#b2ceff', '#c4cbff'
];

// 在 cal-gemini.js 中
window.updateCalendarUI = function(cloudEvents) {
    try {
        console.log("📥 [updateCalendarUI] 收到雲端資料，數量：", cloudEvents ? cloudEvents.length : 0);
        
        if (!cloudEvents) return;

        // 🚀【防禦 1】：確保全域變數 window.courses 與本地 courses 都成功拿到資料
        window.courses = cloudEvents;
        if (typeof courses !== 'undefined') {
            courses = cloudEvents;
        }

        // 🚀【防禦 2】：檢查畫面的日期就緒了沒，沒就緒就先刷一次日期
        const testHeader = document.querySelector('.day-header');
        if (!testHeader || !testHeader.dataset || !testHeader.dataset.fullDate) {
            console.log("📅 日期資料尚未注入 DOM，正在嘗試呼叫 updateWeekDates...");
            if (typeof updateWeekDates === 'function') {
                updateWeekDates(); 
            }
        }
        
        // 🚀【防禦 3】：執行渲染，並用超安全的邏輯包覆
        if (typeof renderAll === 'function') {
            renderAll(); 
        } else {
            console.error("❌ 錯誤：在 window 中找不到 renderAll 函式！");
        }
        
    } catch (error) {
        console.error("❌ [updateCalendarUI] 核心同步程序發生崩潰:", error);
    }
};

// --- 1. 初始化 ---
document.addEventListener('DOMContentLoaded', () => {
    updateWeekDates();
    loadData();
    
    // 監聽點擊空白處新增
    const dropzone = document.getElementById('dropzone');
    if (dropzone) {
        dropzone.addEventListener('click', (e) => {
            if (e.target.id === 'dropzone' || e.target.classList.contains('grid-lines')) {
                openModal(); // 新增模式
            }
        });
    }

    const nameInput = document.getElementById('m-name');
    if (nameInput) {
        nameInput.addEventListener('blur', function() {
            const name = this.value.trim();
            const currentCourses = window.courses || courses || [];
            
            // 從既有課表中，由新到舊尋找這名學生的歷史紀錄
            const lastCourse = [...currentCourses].reverse().find(c => c.name === name && c.price);
            
            if (lastCourse) {
                if (lastCourse.color) setupColorPalette(lastCourse.color);
                
                // 如果教練還沒打金額，自動幫教練填入他上一次的學費
                const priceInput = document.getElementById('m-price');
                if (priceInput && priceInput.value === "" && lastCourse.price) {
                    priceInput.value = lastCourse.price;
                    console.log(`🎯 自動帶入 ${name} 的歷史學費: ${lastCourse.price} 元`);
                }
            }
        });
    }
});

// --- 2. 彈窗控制 (整合編輯模式) ---
function openModal(isEdit = false, courseData = null) { 
    const modal = document.getElementById('eventModal');
    if (!modal) return;
    const submitBtn = modal.querySelector('button[onclick="saveFromModal()"]');
    editingId = isEdit ? courseData.id : null; // 設定目前是否為編輯模式

    modal.style.display = 'block'; 

    const list = document.getElementById('student-list') || createStudentList();
    const currentCourses = window.courses || courses || [];
    const names = [...new Set(currentCourses.map(c => c.name))];
    list.innerHTML = names.map(n => `<option value="${n}">`).join('');

    if (isEdit && courseData) {
        // --- 編輯模式：填入舊資料 ---
        document.getElementById('m-name').value = courseData.name || "";
        document.getElementById('m-price').value = courseData.price !== undefined ? courseData.price : "";
        
        // 地點判斷
        const isStandardLoc = ["中正高中", "秀峰高中"].includes(courseData.loc);
        document.getElementById('m-loc').value = isStandardLoc ? courseData.loc : "CUSTOM";
        if (!isStandardLoc) {
            document.getElementById('m-loc-custom').value = courseData.loc || "";
            document.getElementById('m-loc-custom').style.display = 'block';
        } else {
            document.getElementById('m-loc-custom').style.display = 'none';
        }
        
        document.getElementById('m-day').value = courseData.day;
        document.getElementById('m-type').value = courseData.type;
        document.getElementById('m-start').value = courseData.start;
        document.getElementById('m-end').value = courseData.end;
        document.getElementById('m-repeat').checked = courseData.isRepeating;
        setupColorPalette(courseData.color);
        if (submitBtn) submitBtn.innerText = "更新行程"; // 改變按鈕文字
    } else {
        // --- 新增模式：重置欄位 ---
        document.getElementById('m-name').value = "";
        document.getElementById('m-price').value = "";
        document.getElementById('m-loc-custom').value = "";
        document.getElementById('m-loc-custom').style.display = 'none';
        document.getElementById('m-repeat').checked = false;
        if (submitBtn) submitBtn.innerText = "儲存行程";
        setupColorPalette(); 
    }
}

function createStudentList() {
    let dl = document.getElementById('student-list');
    if (!dl) {
        dl = document.createElement('datalist');
        dl.id = 'student-list';
        document.body.appendChild(dl);
    }
    const nameInput = document.getElementById('m-name');
    if (nameInput) nameInput.setAttribute('list', 'student-list');
    return dl;
}

function closeModal() { 
    const modal = document.getElementById('eventModal');
    if (modal) modal.style.display = 'none'; 
    editingId = null;
}

function setupColorPalette(selectedColor = presetColors[0]) {
    const palette = document.getElementById('color-palette');
    if (!palette) return;
    palette.innerHTML = ''; 
    presetColors.forEach(color => {
        const btn = document.createElement('div');
        btn.className = 'color-circle';
        btn.style.backgroundColor = color;
        if (color === selectedColor) btn.classList.add('active');
        btn.onclick = (e) => {
            e.stopPropagation();
            selectColor(color, btn);
        };
        palette.appendChild(btn);
    });
    const colorInput = document.getElementById('m-color');
    if (colorInput) colorInput.value = selectedColor;
}

function selectColor(color, element) {
    document.querySelectorAll('.color-circle').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');
    const colorInput = document.getElementById('m-color');
    if (colorInput) colorInput.value = color;
}

// --- 3. 時間運算與儲存 ---
function timeToRow(timeStr) {
    if (!timeStr) return NaN;
    const [hrs, mins] = timeStr.split(':').map(Number);
    return 2 + (((hrs - 8) * 60 + mins) / 10);
}

function saveFromModal() {
    const name = document.getElementById('m-name').value.trim();
    const locSelect = document.getElementById('m-loc');
    let loc = locSelect.value === 'CUSTOM' ? (document.getElementById('m-loc-custom').value.trim() || "自定義地點") : locSelect.value;
    const day = document.getElementById('m-day').value;
    const type = document.getElementById('m-type').value;
    const start = document.getElementById('m-start').value;
    const end = document.getElementById('m-end').value;
    const isRepeating = document.getElementById('m-repeat').checked;
    
    // 優先抓取輸入框金額，若空則尋找該學生最近一次的歷史學費，最後才 fallback 600
    const priceInputVal = document.getElementById('m-price').value;
    let price = parseInt(priceInputVal, 10);

    const currentCourses = window.courses || courses || [];

    if (isNaN(price)) {
        const lastCourseOfStudent = currentCourses.find(c => c.name === name && c.price);
        price = lastCourseOfStudent ? parseInt(lastCourseOfStudent.price, 10) : 600;
    }
    
    if (!name || !start || !end) return alert("請填寫完整資訊");

    // 【修正 3】：優先拿色盤選擇的顏色，若無才 fallback 學生既有顏色或預設灰色
    const selectedColorVal = document.getElementById('m-color')?.value;
    const existingStudent = currentCourses.find(c => c.name === name && c.color);
    const eventColor = selectedColorVal || (existingStudent ? existingStudent.color : '#c2bcbc'); 
        
    const startRow = timeToRow(start);
    const endRow = timeToRow(end);
    const duration = (endRow - startRow) * 10;

    if (isNaN(startRow) || isNaN(endRow)) return;

    // 檢查衝突
    const hasConflict = currentCourses.find(c => {
        if (c.id.toString() === (editingId ? editingId.toString() : "")) return false; 
        return c.day === day && (startRow < c.endRow && endRow > c.startRow);
    });
    if (hasConflict && !confirm(`⚠️ 時段與 [${hasConflict.name}] 衝突，確定要排入嗎？`)) return;

    // 計算日期
    const dayHeaders = document.querySelectorAll('.day-header');
    const targetHeader = Array.from(dayHeaders).find(h => h.dataset.day === (day === "8" ? "0" : (parseInt(day)-1).toString()) );
    const dateStr = targetHeader ? targetHeader.dataset.fullDate : new Date().toLocaleDateString('en-CA');

    const eventId = editingId ? editingId.toString() : Date.now().toString(); 
    
    const editingCourse = editingId ? currentCourses.find(c => c.id.toString() === editingId.toString()) : null;

    const courseData = { 
        id: eventId, 
        name, loc, day, type, 
        startRow, endRow, 
        start, end, 
        duration, 
        price,
        date: dateStr, 
        isRepeating, 
        color: eventColor, 
        exceptions: editingCourse && editingCourse.exceptions ? editingCourse.exceptions : []
    };

    console.log("📤 準備上傳:", courseData);

    if (typeof window.uploadEvent === 'function') {
        window.uploadEvent(courseData); // 呼叫 app.js 的功能
    }

    closeModal();
}

// --- 4. 核心渲染 (整合全月與本週統計) ---
function calculateMonthlyData(targetYear, targetMonth) {
    let totalMinutes = 0;
    let totalIncome = 0; 
    let studentStats = {};

    const currentCourses = window.courses || courses || [];

    currentCourses.forEach(course => {
        if (!course || course.type !== 'work') return;

        // 保底時薪判斷
        const hourlyRate = course.price !== undefined ? Number(course.price) : 600;

        if (course.isRepeating) {
            let d = new Date(targetYear, targetMonth, 1);
            while (d.getMonth() === targetMonth) {
                const dDay = d.getDay();
                const tDay = (course.day === "8" ? 0 : parseInt(course.day) - 1);
                const dStr = d.toLocaleDateString('en-CA');

                if (dDay === tDay && (!course.exceptions || !course.exceptions.includes(dStr))) {
                    const duration = Number(course.duration || 0);
                    const currentEventIncome = (duration / 60) * hourlyRate; 
                    
                    totalMinutes += duration;
                    totalIncome += currentEventIncome;

                    if (!studentStats[course.name]) {
                        studentStats[course.name] = { mins: 0, money: 0 };
                    }
                    studentStats[course.name].mins += duration;
                    studentStats[course.name].money += currentEventIncome;
                }
                d.setDate(d.getDate() + 1);
            }
        } else {
            if (course.date) {
                const p = course.date.split('-');
                if (parseInt(p[0]) === targetYear && (parseInt(p[1]) - 1) === targetMonth) {
                    const duration = Number(course.duration || 0);
                    const currentEventIncome = (duration / 60) * hourlyRate; 

                    totalMinutes += duration;
                    totalIncome += currentEventIncome;

                    if (!studentStats[course.name]) {
                        studentStats[course.name] = { mins: 0, money: 0 };
                    }
                    studentStats[course.name].mins += duration;
                    studentStats[course.name].money += currentEventIncome;
                }
            }
        }
    });
    return { totalMinutes, totalIncome, studentStats };
}

window.updateStats = function() {
    console.log("📊 [updateStats] 收到重新計算統計的請求");
    renderAll();
}

// --- 5. 繪製行程方塊 (修正刪除與顏色套用邏輯) ---
function drawEvent(course, container, dStr, col, overlapCount = 1) {
    const div = document.createElement('div');
    div.className = 'placed-event';
    if (overlapCount > 1) {
        div.classList.add('is-duplicate'); // 供 CSS 自訂邊框警示
    }

    const currentCourses = window.courses || courses || [];
    const latestStudentData = currentCourses.find(c => c.name === course.name && c.color);
    
    // 【修正 2】：使用正確計算出來的 currentColor，修復側邊欄改色後卡片顏色不更新問題
    const currentColor = latestStudentData ? latestStudentData.color : (course.color || '#828181');
    div.style.backgroundColor = currentColor;
    div.style.position = 'relative'; // 確保徽章可定位於右下角

    let gridCol = (col === 0 ? 7 : col) + 1; 
    div.style.gridColumn = gridCol;
    div.style.gridRow = `${course.startRow} / ${course.endRow}`;
    
    const isShort = course.duration <= 90; 
    const repeatTag = course.isRepeating ? "🔄" : "";

    const badgeHTML = overlapCount > 1 
        ? `<div class="duplicate-badge" title="此時段有 ${overlapCount} 堂重複課程" style="position: absolute; bottom: 2px; right: 2px; background: #040404; color: #fff; font-size: 10px; font-weight: bold; padding: 1px 5px; border-radius: 8px; line-height: 1; z-index: 2; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">×${overlapCount}</div>`
        : '';

    div.innerHTML = isShort ? `
        <div style="display: flex; flex-direction: column; justify-content: center; height: 100%;">
            <strong style="font-size: 10px; font-weight: 700">${course.name}${repeatTag}</strong>
            <span style="font-size: 10px; scale: 0.9; transform-origin: left;">${course.start} | ${course.loc}</span>
        </div>
        ${badgeHTML}
    ` : `
        <strong>${course.name} ${repeatTag}</strong>
        <span>📍 ${course.loc}</span>
        <span>⏰ ${course.start}-${course.end}</span>
        ${badgeHTML}
    `;

    // 點擊編輯
    div.onclick = (e) => { 
        e.stopPropagation(); 
        openModal(true, course); 
    };

    // 右鍵刪除邏輯
    div.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();

        const idStr = course.id.toString();

        if (!course.isRepeating) {
            if (confirm(`確定要刪除 [${course.name}] 嗎？`)) {
                if (typeof window.removeEventFromCloud === 'function') {
                    window.removeEventFromCloud(idStr);
                }
                if (typeof window.courses !== 'undefined') {
                    window.courses = window.courses.filter(c => c.id.toString() !== idStr);
                }
                courses = courses.filter(c => c.id.toString() !== idStr);
                renderAll();
            }
        } else {
            const action = prompt("請選擇刪除方式：\n1. 僅刪除本週 (" + dStr + ")\n2. 永久刪除整個循環", "1");
            
            if (action === "1") {
                if (!course.exceptions) course.exceptions = [];
                if (!course.exceptions.includes(dStr)) {
                    course.exceptions.push(dStr);

                    const idx = courses.findIndex(c => c.id.toString() === idStr);
                    if (idx !== -1) courses[idx] = course;
                    if (window.courses) {
                        const wIdx = window.courses.findIndex(c => c.id.toString() === idStr);
                        if (wIdx !== -1) window.courses[wIdx] = course;
                    }

                    if (typeof window.uploadEvent === 'function') {
                        window.uploadEvent(course); // 同步回雲端
                    }
                    renderAll(); 
                } else {
                    alert("該日期已在刪除清單中");
                }
            } else if (action === "2") {
                if (confirm(`⚠️ 警告：這將刪除所有週次的 [${course.name}]，確定嗎？`)) {
                    if (typeof window.removeEventFromCloud === 'function') {
                        window.removeEventFromCloud(idStr);
                    }
                    if (typeof window.courses !== 'undefined') {
                        window.courses = window.courses.filter(c => c.id.toString() !== idStr);
                    }
                    courses = courses.filter(c => c.id.toString() !== idStr); 
                    renderAll(); 
                }
            }
        }
    };

    container.appendChild(div);
}

// --- 6. 側邊欄渲染 ---
function renderSidebar(studentStats) {
    const statsDiv = document.getElementById('monthly-stats');
    if (!statsDiv) return;
    statsDiv.innerHTML = "";
    
    const entries = Object.entries(studentStats).sort((a, b) => b[1].mins - a[1].mins);    
    if (entries.length === 0) { 
        statsDiv.innerHTML = `<p class="no-record-tip">本月尚無教球紀錄</p>`; 
        return; 
    }

    const currentCourses = window.courses || courses || [];

    entries.forEach(([name, data]) => {
        const student = currentCourses.find(c => c.name === name && c.color);
        const color = student ? student.color : '#c4c4c4';
        const p = document.createElement('div');
        p.className = 'stat-item';
        
        p.innerHTML = `
            <input type="color" value="${color}" 
                onchange="updateStudentColor('${name}', this.value)">
            <span class="student-name">${name}</span>
            <div class="info-right">
                <strong>${(data.mins / 60).toFixed(1)} <span class="unit">hr</span></strong>
                <span class="income">$${Math.round(data.money).toLocaleString()}</span>
            </div>
        `;
        
        statsDiv.appendChild(p);
    });
}

function updateStudentColor(name, newColor) {
    const currentCourses = window.courses || courses || [];
    currentCourses.filter(c => c.name === name).forEach(c => {
        c.color = newColor;
        if (typeof window.uploadEvent === 'function') {
            window.uploadEvent(c);
        }
    });
    renderAll();
    saveToStorage();
}

// --- 7. 日期與儲存 ---
function updateWeekDates() {
    const dayOfWeek = viewDate.getDay(); 
    const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(viewDate);
    monday.setDate(viewDate.getDate() + offset);

    const dayHeaders = document.querySelectorAll('.day-header');
    dayHeaders.forEach((header, index) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + index);
        const label = header.querySelector('.date-label');
        if (label) label.innerText = `${date.getMonth() + 1}/${date.getDate()}`;
        header.dataset.fullDate = date.toLocaleDateString('en-CA');
    });

    const middleDate = new Date(monday); 
    middleDate.setDate(monday.getDate() + 3);
    const rangeEl = document.getElementById('current-month-range');
    if (rangeEl) {
        rangeEl.innerText = `📅 ${middleDate.getFullYear()}年 ${middleDate.getMonth() + 1}月行程`;
    }
}

function changeWeek(direction) {
    viewDate.setDate(viewDate.getDate() + (direction * 7));
    updateWeekDates(); 
    renderAll();
}

function goToday() {
    viewDate = new Date();
    updateWeekDates(); 
    renderAll();
}

function toggleCustomLoc() {
    const select = document.getElementById('m-loc');
    const customInput = document.getElementById('m-loc-custom');
    if (select && customInput) {
        customInput.style.display = (select.value === 'CUSTOM') ? 'block' : 'none';
    }
}

function saveToStorage() { 
    const currentCourses = window.courses || courses || [];
    localStorage.setItem('coach_data_v3', JSON.stringify(currentCourses)); 
}

function loadData() {
    console.log("正在連線至雲端資料庫...");
}

function renderAndSave() { 
    renderAll();
}

// 【修正 1】：實作未定義的 clearWorkData 函式
function clearWorkData() {
    if (confirm("⚠️ 確定要清空所有課程資料嗎？此操作不可逆！")) {
        courses = [];
        window.courses = [];
        localStorage.removeItem('coach_data_v3');
        renderAll();
        console.log("🧹 課程資料已清空");
    }
}

/** 🛠️ Helper: 計算指定月份每週一的 Date 物件陣列 */
function getMondaysOfMonth(year, month) {
    const mondays = [];
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // 找到當月第一天所在的週一
    let current = new Date(firstDay);
    const dayOfWeek = current.getDay();
    const diffToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
    current.setDate(current.getDate() + diffToMonday);

    // 只要當週包含當月的日子，就記錄下來
    while (current <= lastDay || current.getMonth() === month) {
        mondays.push(new Date(current));
        current.setDate(current.getDate() + 7);
        if (current.getMonth() !== month && current.getDate() > 7) break;
    }
    return mondays;
}

export function renderAll() {
    try {
        const isStudent = currentUser && currentUser.role === 'student';

        // 🎯 1. 取得行事曆容器與日期標頭
        const container = isStudent 
            ? (document.getElementById('student-calendar-grid') || document.getElementById('dropzone'))
            : document.getElementById('dropzone');

        if (!container) return;

        // 清除舊的行程方塊
        container.querySelectorAll('.placed-event').forEach(el => el.remove());

        const dayHeaders = document.querySelectorAll('.day-header');
        if (!dayHeaders || dayHeaders.length < 7 || !dayHeaders[3]?.dataset?.fullDate) {
            console.log("📅 [renderAll] 日期標頭尚未就緒，暫緩渲染");
            return;
        }

        const weekDates = Array.from(dayHeaders).map(h => h.dataset.fullDate);
        const middleDate = new Date(dayHeaders[3].dataset.fullDate);
        const currentYear = middleDate.getFullYear();
        const currentMonth = middleDate.getMonth();

        let weekTotalMinutes = 0;
        let studentMonthMinutes = 0;

        const currentCourses = window.courses || courses || [];

        // 🎯 2. 收集當週需要繪製的行程 ( pendingEvents )
        const pendingEvents = [];

        currentCourses.forEach(course => {
            if (!course) return;

            // 🔒 學生權限過濾：若為學生登入，僅保留名稱匹配的課程
            if (isStudent) {
                const studentNameMatch = course.name === currentUser.name || course.studentName === currentUser.name;
                if (!studentNameMatch) return; 
            }

            const isException = (dStr) => course.exceptions && course.exceptions.includes(dStr);

            if (course.isRepeating) {
                dayHeaders.forEach(header => {
                    const dStr = header.dataset.fullDate;
                    const hDay = header.dataset.day; // 週一="1"...週日="0"

                    let normalizedCourseDay = (course.day === "8" ? "0" : (parseInt(course.day) - 1).toString());

                    if (normalizedCourseDay === hDay && !isException(dStr)) {
                        pendingEvents.push({ course, dStr, col: parseInt(hDay) });
                        if (course.type === 'work') weekTotalMinutes += Number(course.duration || 0);
                    }
                });
            } else {
                if (weekDates.includes(course.date)) {
                    const targetHeader = Array.from(dayHeaders).find(h => h.dataset.fullDate === course.date);
                    if (targetHeader) {
                        pendingEvents.push({ course, dStr: course.date, col: parseInt(targetHeader.dataset.day) });
                        if (course.type === 'work') weekTotalMinutes += Number(course.duration || 0);
                    }
                }
            }
        });

        // 🎯 3. 精確計算重疊數量 ( overlapCount ) 並進行 DOM 繪製
        pendingEvents.forEach(({ course, dStr, col }) => {
            const overlapCount = pendingEvents.filter(item => 
                item.dStr === dStr && 
                !(course.endRow <= item.course.startRow || course.startRow >= item.course.endRow)
            ).length;

            if (typeof drawEvent === 'function') {
                drawEvent(course, container, dStr, col, overlapCount);
            }
        });

        // 🎯 4. 數據統計與 UI 介面更新
        if (isStudent) {
            // 🎓 學生端：計算學生當月總上課時數
            currentCourses.forEach(course => {
                const isMyCourse = course.name === currentUser.name || course.studentName === currentUser.name;
                if (isMyCourse && course.type === 'work') {
                    if (typeof course.isMonthMatch === 'function' ? course.isMonthMatch(currentYear, currentMonth) : true) {
                        studentMonthMinutes += Number(course.duration || 0);
                    }
                }
            });

            // 更新學生頁面數字
            const studentHoursEl = document.getElementById('student-total-hours');
            if (studentHoursEl) {
                studentHoursEl.innerText = (studentMonthMinutes / 60).toFixed(1);
            }

            // 更新繳費狀態
            const paymentEl = document.getElementById('student-class-count');
            if (paymentEl) {
                const isPaid = currentUser.isPaid ?? false;
                paymentEl.innerText = isPaid ? '已繳費' : '未繳費';
                paymentEl.style.color = isPaid ? '#2e7d32' : '#d32f2f';
            }

        } else {
            // 👨‍🏫 教練端：全月數據與側邊欄渲染
            if (typeof calculateMonthlyData === 'function') {
                const monthData = calculateMonthlyData(currentYear, currentMonth);

                const weekTotalEl = document.getElementById('week-total');
                if (weekTotalEl) weekTotalEl.innerText = (weekTotalMinutes / 60).toFixed(1);

                const monthTotalEl = document.getElementById('month-total');
                if (monthTotalEl) monthTotalEl.innerText = (monthData.totalMinutes / 60).toFixed(1);

                const monthIncomeEl = document.getElementById('month-income');
                if (monthIncomeEl) monthIncomeEl.innerText = Math.round(monthData.totalIncome).toLocaleString();

                if (typeof renderSidebar === 'function') {
                    renderSidebar(monthData.studentStats);
                }
            }
        }
    } catch (error) {
        console.error("❌ renderAll 執行失敗:", error);
    }
}

window.renderAll = renderAll;

/** 🚀 匯出整月課表與統計圖片（單一側邊欄 + 舒適排版） */
window.exportScheduleToImage = async function(event) {
    const btn = event?.currentTarget || event?.target;
    const originalText = btn?.innerText || '';
    const mainApp = document.getElementById('main-app') || document.querySelector('.main-wrapper');

    if (!mainApp) return alert("找不到要截圖的畫面區域");

    if (btn) {
        btn.innerText = '📸 正在生成全月課表...';
        btn.disabled = true;
    }

    const originalViewDate = new Date(viewDate); // 1. 備份原始日期
    const targetYear = viewDate.getFullYear();
    const targetMonth = viewDate.getMonth();
    const weekMondays = getMondaysOfMonth(targetYear, targetMonth);

    const WEEK_SPACING = 30; 

    try {
        const canvases = [];

        // 2. 依次擷取每週畫面
        for (let i = 0; i < weekMondays.length; i++) {
            const monday = weekMondays[i];
            const isFirstWeek = (i === 0);

            viewDate = new Date(monday);
            if (typeof updateWeekDates === 'function') updateWeekDates();
            if (typeof renderAll === 'function') renderAll();

            // 等待 DOM 重繪
            await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 150)));

            const canvas = await html2canvas(mainApp, {
                scale: 1.5,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
                onclone: (clonedDoc) => {
                    clonedDoc.querySelectorAll('#export-ics-btn, .floating-controls, .toggle-income-btn')
                             .forEach(el => el.style.visibility = 'hidden');

                    if (!isFirstWeek) {
                        const sidebar = clonedDoc.querySelector('.sidebar') || clonedDoc.querySelector('#monthly-stats-container');
                        if (sidebar) {
                            sidebar.style.display = 'none';
                        }
                    }
                }
            });
            canvases.push(canvas);
        }

        // 3. 計算拼接後的總寬度與總高度
        const totalWidth = canvases[0].width;
        const totalHeight = canvases.reduce((sum, c) => sum + c.height, 0) + (WEEK_SPACING * (canvases.length - 1));

        const mergedCanvas = document.createElement('canvas');
        mergedCanvas.width = totalWidth;
        mergedCanvas.height = totalHeight;
        const ctx = mergedCanvas.getContext('2d');

        // 滿版白色背景
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, totalWidth, totalHeight);

        // 4. 垂直繪製與拼接
        let currentY = 0;
        for (let i = 0; i < canvases.length; i++) {
            const c = canvases[i];
            ctx.drawImage(c, 0, currentY);
            currentY += c.height + WEEK_SPACING;
        }

        // 5. 匯出圖片檔案
        mergedCanvas.toBlob((blob) => {
            if (!blob) throw new Error('Blob 生成失敗');
            
            const imageUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = imageUrl;
            link.download = `桌球課表全月報表_${targetYear}年${targetMonth + 1}月.png`;
            document.body.appendChild(link);
            link.click();
            
            document.body.removeChild(link);
            URL.revokeObjectURL(imageUrl);
        }, 'image/png');

    } catch (err) {
        console.error('匯出全月圖片失敗:', err);
        alert('匯出時發生錯誤，請確認是否有引入 html2canvas 套件。');
    } finally {
        // 6. 還原原始畫面狀態
        viewDate = originalViewDate;
        if (typeof updateWeekDates === 'function') updateWeekDates();
        if (typeof renderAll === 'function') renderAll();

        if (btn) {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }
};

window.saveFromModal = saveFromModal;
window.closeModal = closeModal;
window.changeWeek = changeWeek;
window.goToday = goToday;
window.toggleCustomLoc = toggleCustomLoc;
window.clearWorkData = clearWorkData;
window.updateStudentColor = updateStudentColor;
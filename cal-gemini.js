// --- 全域變數 ---
import { currentUser } from './app.js';
// 教練端財務資料起算點：財務報表的月份切換、收入折線圖共用
const FINANCE_DATA_START = '2026-10-01';
const FINANCE_START_YEAR = parseInt(FINANCE_DATA_START.slice(0, 4), 10);
const FINANCE_START_MONTH_IDX = parseInt(FINANCE_DATA_START.slice(5, 7), 10) - 1;

// 財務報表目前選的月份（獨立於行事曆翻到哪一週）
let incomePanelYear = new Date().getFullYear();
let incomePanelMonth = new Date().getMonth();
// 學生端資料起算點：這個日期之前的課程，學生端所有畫面都不顯示、不計算。
// 教練端不受影響。
const STUDENT_DATA_START = '2026-10-01';
const STUDENT_START_YEAR = parseInt(STUDENT_DATA_START.slice(0, 4), 10);
const STUDENT_START_MONTH_IDX = parseInt(STUDENT_DATA_START.slice(5, 7), 10) - 1;
window.STUDENT_DATA_START = STUDENT_DATA_START;
window.studentDataStartLabel = () => `${STUDENT_START_YEAR} 年 ${STUDENT_START_MONTH_IDX + 1} 月`;

// 把查詢區間裁到起算點之後；整段都在起算點之前就回傳 null
function clampToStudentStart(startStr, endStr) {
    const start = startStr < STUDENT_DATA_START ? STUDENT_DATA_START : startStr;
    return start > endStr ? null : { start, end: endStr };
}

let courses = [];
let viewDate = new Date(); 
let editingId = null; // 【編輯功能關鍵】用於追蹤正在編輯的行程 ID
let editingDateStr = null; // 目前編輯的是哪一天的方塊（「只刪本週」要用）

const presetColors = [
    '#c2bcbc', '#b5e3db', '#d5e3c7', '#efe78e', '#fad595', 
    '#ffc0c7', '#f5c5ff', '#b2ceff', '#c4cbff'
];

// ------------------------------------------------------------
// ▼▼▼ 修改：精準計算指定月份的實際上課日期
// ------------------------------------------------------------

function formatLocalDate(year, monthIndex, day) {
    return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getRecurringDatesInMonth(
    year,
    monthIndex,
    targetDay,
    exceptions = [],
    courseStartDate = null,
    courseEndDate = null
) {
    const result = [];

    const exceptionSet = new Set(
        (exceptions || []).map(date => String(date))
    );

    const daysInMonth = new Date(
        year,
        monthIndex + 1,
        0
    ).getDate();

    for (let day = 1; day <= daysInMonth; day++) {

        const currentDate = new Date(
            year,
            monthIndex,
            day
        );

        if (currentDate.getDay() !== targetDay) {
            continue;
        }

        const dateStr = formatLocalDate(
            year,
            monthIndex,
            day
        );

        if (
            courseStartDate &&
            dateStr < courseStartDate
        ) {
            continue;
        }

        if (
            courseEndDate &&
            dateStr > courseEndDate
        ) {
            continue;
        }

        if (exceptionSet.has(dateStr)) {
            continue;
        }

        result.push(dateStr);
    }

    return result;
}

function countOccurrencesInMonth(
    year,
    monthIndex,
    targetDay,
    exceptions = [],
    courseStartDate = null
) {
    return getRecurringDatesInMonth(
        year,
        monthIndex,
        targetDay,
        exceptions,
        courseStartDate
    ).length;
}


window.updateCalendarUI = function(cloudEvents) {
    try {
        console.log("📥 [updateCalendarUI] 收到雲端資料，數量：", cloudEvents ? cloudEvents.length : 0);
        
        if (!cloudEvents) return;

        window.courses = cloudEvents;
        if (typeof courses !== 'undefined') {
            courses = cloudEvents;
        }

        const testHeader = document.querySelector('.day-header');
        if (!testHeader || !testHeader.dataset || !testHeader.dataset.fullDate) {
            console.log("📅 日期資料尚未注入 DOM，正在嘗試呼叫 updateWeekDates...");
            if (typeof updateWeekDates === 'function') {
                updateWeekDates(); 
            }
        }
        
        if (typeof renderAll === 'function') {
            renderAll(); 
        } else {
            console.error("❌ 錯誤：在 window 中找不到 renderAll 函式！");
        }
        
    } catch (error) {
        console.error("❌ [updateCalendarUI] 核心同步程序發生崩潰:", error);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    updateWeekDates();
    loadData();
    
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
            
            const lastCourse = [...currentCourses].reverse().find(c => c.name === name && c.price);
            
            if (lastCourse) {
                if (lastCourse.color) setupColorPalette(lastCourse.color);
                
                const priceInput = document.getElementById('m-price');
                if (priceInput && priceInput.value === "" && lastCourse.price) {
                    priceInput.value = lastCourse.price;
                    console.log(`🎯 自動帶入 ${name} 的歷史學費: ${lastCourse.price} 元`);
                }
            }
        });
    }

    const repeatCheckbox = document.getElementById('m-repeat');
    if (repeatCheckbox) {
        repeatCheckbox.addEventListener('change', toggleRepeatEndVisibility);
    }
});

function openModal(isEdit = false, courseData = null, dateStr = null) { 
    const modal = document.getElementById('eventModal');
    if (!modal) return;
    const submitBtn = modal.querySelector('button[onclick="saveFromModal()"]');
    editingId = isEdit ? courseData.id : null; // 設定目前是否為編輯模式
    editingDateStr = isEdit ? dateStr : null;

    modal.style.display = 'block'; 

    const list = document.getElementById('student-list') || createStudentList();
    const currentCourses = window.courses || courses || [];
    const names = [...new Set(currentCourses.map(c => c.name))];
    list.innerHTML = names.map(n => `<option value="${n}">`).join('');

    if (isEdit && courseData) {
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
        document.getElementById('m-repeat-end').value = courseData.repeatEndDate || '';
        setupColorPalette(courseData.color);
        if (submitBtn) submitBtn.innerText = "更新行程"; // 改變按鈕文字
    } else {
        // --- 新增模式：重置欄位 ---
        document.getElementById('m-name').value = "";
        document.getElementById('m-price').value = "";
        document.getElementById('m-loc-custom').value = "";
        document.getElementById('m-loc-custom').style.display = 'none';
        document.getElementById('m-repeat').checked = false;
        document.getElementById('m-repeat-end').value = '';
        if (submitBtn) submitBtn.innerText = "儲存行程";
        setupColorPalette(); 
    }

    toggleRepeatEndVisibility();
    updateModalDeleteButtons(isEdit, courseData, dateStr);
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

// ------------------------------------------------------------
// 共用刪除邏輯：右鍵刪除和彈窗裡的刪除按鈕都呼叫這兩個函式，
// 避免同一套邏輯寫兩份、改一邊忘了另一邊。
// 「刪單次課程」和「刪整個循環」其實是同一個動作（把整筆文件刪掉），所以合併成一個函式。
// ------------------------------------------------------------
function deleteCourseDocument(course) {
    const idStr = course.id.toString();
    if (typeof window.removeEventFromCloud === 'function') {
        window.removeEventFromCloud(idStr);
    }
    window.courses = (window.courses || []).filter(c => c.id.toString() !== idStr);
    courses = courses.filter(c => c.id.toString() !== idStr);
    renderAll();
}

function deleteCourseOccurrence(course, dStr) {
    if (!course.exceptions) course.exceptions = [];
    if (course.exceptions.includes(dStr)) {
        alert("該日期已在刪除清單中");
        return;
    }
    course.exceptions.push(dStr);

    const idStr = course.id.toString();
    const idx = courses.findIndex(c => c.id.toString() === idStr);
    if (idx !== -1) courses[idx] = course;
    if (window.courses) {
        const wIdx = window.courses.findIndex(c => c.id.toString() === idStr);
        if (wIdx !== -1) window.courses[wIdx] = course;
    }

    if (typeof window.uploadEvent === 'function') {
        window.uploadEvent(course);
    }
    renderAll();
}

// 依照點開的是「單次」還是「重複」課程，決定彈窗裡顯示哪幾顆刪除按鈕
function updateModalDeleteButtons(isEdit, courseData, dateStr) {
    const area = document.getElementById('modal-delete-area');
    if (!area) return;

    if (!isEdit || !courseData) {
        area.classList.add('hide');
        return;
    }

    area.classList.remove('hide');
    const singleBtn = document.getElementById('btn-delete-single');
    const weekBtn = document.getElementById('btn-delete-this-week');
    const allBtn = document.getElementById('btn-delete-all');

    // 這裡看的是「已存檔的課程」是不是重複，不是彈窗裡勾選框目前的狀態
    if (courseData.isRepeating) {
        singleBtn.classList.add('hide');
        weekBtn.classList.remove('hide');
        allBtn.classList.remove('hide');
        weekBtn.innerText = dateStr ? `🗑️ 只刪本週（${dateStr}）` : '🗑️ 只刪本週';
    } else {
        singleBtn.classList.remove('hide');
        weekBtn.classList.add('hide');
        allBtn.classList.add('hide');
    }
}

function deleteFromModal(mode) {
    if (!editingId) return;
    const currentCourses = window.courses || courses || [];
    const course = currentCourses.find(c => c.id.toString() === editingId.toString());
    if (!course) return;

    if (mode === 'single') {
        if (confirm(`確定要刪除 [${course.name}] 嗎？`)) {
            deleteCourseDocument(course);
            closeModal();
        }
    } else if (mode === 'thisWeek') {
        if (!editingDateStr) {
            alert('找不到要刪除的日期，請關閉後重新點選該週的課程');
            return;
        }
        if (confirm(`確定只刪除 ${editingDateStr} 這一天的 [${course.name}] 嗎？其他週次不受影響。`)) {
            deleteCourseOccurrence(course, editingDateStr);
            closeModal();
        }
    } else if (mode === 'all') {
        if (confirm(`⚠️ 警告：這將刪除所有週次的 [${course.name}]，確定嗎？`)) {
            deleteCourseDocument(course);
            closeModal();
        }
    }
}

function closeModal() { 
    const modal = document.getElementById('eventModal');
    if (modal) modal.style.display = 'none'; 
    editingId = null;
    editingDateStr = null;
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
    
    const priceInputVal = document.getElementById('m-price').value;
    let price = parseInt(priceInputVal, 10);

    const currentCourses = window.courses || courses || [];

    if (isNaN(price)) {
        const lastCourseOfStudent = currentCourses.find(c => c.name === name && c.price);
        price = lastCourseOfStudent ? parseInt(lastCourseOfStudent.price, 10) : 600;
    }
    
    if (!name || !start || !end) return alert("請填寫完整資訊");

    const selectedColorVal = document.getElementById('m-color')?.value;
    const existingStudent = currentCourses.find(c => c.name === name && c.color);
    const eventColor = selectedColorVal || (existingStudent ? existingStudent.color : '#c2bcbc'); 
        
    const startRow = timeToRow(start);
    const endRow = timeToRow(end);
    // 預設計算單堂分鐘數
    const duration = (endRow - startRow) * 10;

    if (isNaN(startRow) || isNaN(endRow)) return;

    // 檢查衝突
    const hasConflict = currentCourses.find(c => {
        if (c.id.toString() === (editingId ? editingId.toString() : "")) return false; 
        return c.day === day && (startRow < c.endRow && endRow > c.startRow);
    });
    if (hasConflict && !confirm(`⚠️ 時段與 [${hasConflict.name}] 衝突，確定要排入嗎？`)) return;

    const eventId = editingId ? editingId.toString() : Date.now().toString(); 

    const editingCourse = editingId ? currentCourses.find(c => c.id.toString() === editingId.toString()) : null;

    let dateStr;
    if (editingCourse && editingCourse.isRepeating && isRepeating) {
        // 編輯「本來就是重複課程」的課，保留原本的開始日期，
        // 不要被目前瀏覽的週次覆蓋掉，避免開始日期無聲無息跑掉
        dateStr = editingCourse.date;
    } else {
        const dayHeaders = document.querySelectorAll('.day-header');
        const targetHeader = Array.from(dayHeaders).find(h => h.dataset.day === (day === "8" ? "0" : (parseInt(day)-1).toString()) );
        dateStr = targetHeader ? targetHeader.dataset.fullDate : new Date().toLocaleDateString('en-CA');
    }

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
        exceptions: editingCourse && editingCourse.exceptions ? editingCourse.exceptions : [],
        repeatEndDate: isRepeating ? (document.getElementById('m-repeat-end').value || null) : null,
    };

    console.log("📤 準備上傳:", courseData);

    if (typeof window.uploadEvent === 'function') {
        window.uploadEvent(courseData);
    }

    closeModal();
}

function getCourseDurationMinutes(course) {

    const storedDuration = Number(course.duration);

    if (
        Number.isFinite(storedDuration) &&
        storedDuration > 0
    ) {
        return storedDuration;
    }

    const startRow = Number(course.startRow);
    const endRow = Number(course.endRow);

    if (
        Number.isFinite(startRow) &&
        Number.isFinite(endRow) &&
        endRow > startRow
    ) {
        return (endRow - startRow) * 10;
    }

    return 60;
}


function normalizeCourseDate(dateValue) {

    if (!dateValue) return null;

    const text = String(dateValue).trim();

    // YYYY-MM-DD
    const match = text.match(
        /^(\d{4})-(\d{1,2})-(\d{1,2})$/
    );

    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    if (
        !Number.isInteger(year) ||
        !Number.isInteger(month) ||
        !Number.isInteger(day) ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31
    ) {
        return null;
    }

    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isDateWithinRepeatRange(course, dStr) {
    if (course.date && dStr < course.date) return false;
    if (course.repeatEndDate && dStr > course.repeatEndDate) return false;
    return true;
}

function calculateMonthlyData(targetYear, targetMonth) {

    let totalMinutes = 0;
    let totalIncome = 0;

    const studentStats = {};

    const currentCourses =
        window.courses || courses || [];

    const monthStartDate =
        formatLocalDate(
            targetYear,
            targetMonth,
            1
        );

    const monthEndDay =
        new Date(
            targetYear,
            targetMonth + 1,
            0
        ).getDate();

    const monthEndDate =
        formatLocalDate(
            targetYear,
            targetMonth,
            monthEndDay
        );

    currentCourses.forEach(course => {

        if (
            !course ||
            course.type !== 'work' ||
            !course.name
        ) {
            return;
        }

    
        const singleDuration =
            getCourseDurationMinutes(course);


        const hourlyRate =
            Number.isFinite(Number(course.price))
                ? Number(course.price)
                : 600;

        let actualDates = [];


        if (
            course.isRepeating &&
            course.day
        ) {

            const targetDay =
                course.day === "8"
                    ? 0
                    : parseInt(course.day, 10) - 1;

            const courseStartDate =
                normalizeCourseDate(course.date);

            actualDates =
                getRecurringDatesInMonth(
                    targetYear,
                    targetMonth,
                    targetDay,
                    course.exceptions || [],
                    courseStartDate,
                    course.repeatEndDate || null
                );

        }

    
        else if (course.date) {

            const courseDate =
                normalizeCourseDate(course.date);

            if (
                courseDate &&
                courseDate >= monthStartDate &&
                courseDate <= monthEndDate
            ) {
                actualDates = [courseDate];
            }
        }

    
        if (actualDates.length === 0) {
            return;
        }

        const occurrenceCount =
            actualDates.length;

        const courseTotalMinutes =
            singleDuration * occurrenceCount;

        const courseTotalIncome =
            (courseTotalMinutes / 60) *
            hourlyRate;

        totalMinutes += courseTotalMinutes;
        totalIncome += courseTotalIncome;


        if (!studentStats[course.name]) {

            studentStats[course.name] = {
                mins: 0,
                money: 0,
                occurrences: 0
            };
        }

        studentStats[course.name].mins +=
            courseTotalMinutes;

        studentStats[course.name].money +=
            courseTotalIncome;

        studentStats[course.name].occurrences +=
            occurrenceCount;
    });

    return {
        totalMinutes,
        totalIncome,
        studentStats
    };
}

window.calculateMonthlyData =
    calculateMonthlyData;


window.updateStats = function() {
    console.log("📊 [updateStats] 收到重新計算統計的請求");
    renderAll();
}


// 已收款狀態改讀 app.js 即時監聽的 window.incomePaidMap（month 是 JS 的 0~11）
function getIncomePaidStatus(year, month, studentName) {
    const map = window.incomePaidMap || {};
    return map[`${year}-${month + 1}-${studentName}`] === true;
}

// 把財務報表月份限制在「起算月 ~ 本月」之間，回傳目前位置與邊界
function clampIncomeMonth() {
    const now = new Date();
    const maxNum = now.getFullYear() * 12 + now.getMonth();
    const minNum = Math.min(FINANCE_START_YEAR * 12 + FINANCE_START_MONTH_IDX, maxNum);
    const cur = Math.max(minNum, Math.min(maxNum, incomePanelYear * 12 + incomePanelMonth));
    incomePanelYear = Math.floor(cur / 12);
    incomePanelMonth = cur % 12;
    return { cur, minNum, maxNum };
}

window.changeIncomeMonth = function (direction) {
    const { cur } = clampIncomeMonth();
    const next = cur + direction;
    incomePanelYear = Math.floor(next / 12);
    incomePanelMonth = next % 12;
    renderIncomePanel();
};

// 勾選「已收款」：寫入的是財務報表目前選的月份，不是行事曆翻到的月份
window.toggleIncomePaid = async function (studentName, checked) {
    if (typeof window.setIncomePaidStatus !== 'function') {
        console.error('❌ 找不到 window.setIncomePaidStatus');
        return;
    }
    const success = await window.setIncomePaidStatus(incomePanelYear, incomePanelMonth, studentName, checked);
    if (!success) {
        alert('收款紀錄儲存失敗，請檢查網路連線後再試一次。');
        renderIncomePanel();   // 還原勾選框
    }
};

export function renderIncomePanel() {
    renderIncomeTrend();   // 折線圖有自己的月份範圍，不受下面的月份切換影響

    const { cur, minNum, maxNum } = clampIncomeMonth();
    const year = incomePanelYear;
    const month = incomePanelMonth;

    const labelEl = document.getElementById('income-month-label');
    if (labelEl) labelEl.innerText = `${year} 年 ${month + 1} 月`;
    const prevBtn = document.getElementById('income-month-prev');
    const nextBtn = document.getElementById('income-month-next');
    if (prevBtn) prevBtn.disabled = cur <= minNum;
    if (nextBtn) nextBtn.disabled = cur >= maxNum;

    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    };

    const monthData = calculateMonthlyData(year, month);
    setText('income-panel-total-hours', `${(monthData.totalMinutes / 60).toFixed(1)} 小時`);
    setText('income-panel-total-income', `$${Math.round(monthData.totalIncome).toLocaleString()}`);

    const breakdownEl = document.getElementById('income-panel-breakdown');
    if (!breakdownEl) return;

    const entries = Object.entries(monthData.studentStats).sort((a, b) => b[1].money - a[1].money);

    if (entries.length === 0) {
        breakdownEl.innerHTML = '<p class="no-data-hint">這個月沒有教球紀錄</p>';
        setText('income-panel-paid-income', '$0');
        setText('income-panel-pending-income', '$0');
        return;
    }

    let paidIncome = 0;
    let pendingIncome = 0;
    entries.forEach(([name, data]) => {
        if (getIncomePaidStatus(year, month, name)) paidIncome += data.money;
        else pendingIncome += data.money;
    });
    setText('income-panel-paid-income', `$${Math.round(paidIncome).toLocaleString()}`);
    setText('income-panel-pending-income', `$${Math.round(pendingIncome).toLocaleString()}`);

    breakdownEl.innerHTML = entries.map(([name, data]) => {
        const isPaid = getIncomePaidStatus(year, month, name);
        const report = typeof window.getPaymentReport === 'function'
            ? window.getPaymentReport(year, month, name)
            : null;
        // 優先順序：已收款 > 學生已轉帳 > 待收款
        const isReported = !isPaid && !!report && report.status === 'reported';

        const safeName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const money = Math.round(data.money);

        let reportTag = '';
        if (isReported) {
            const reportAmount = Number(report.amount) || 0;
            const last5 = String(report.last5 || '').replace(/[^0-9]/g, '');
            const timeText = window.payFormatTime ? window.payFormatTime(report.reportedAt) : '';
            const warn = reportAmount !== money
                ? `<span class="income-report-warn">⚠️ 與目前應收 $${money.toLocaleString()} 不同</span>`
                : '';
            reportTag = `
                <div class="income-report-tag">
                    <span class="income-report-badge">學生已轉帳</span>
                    <span>$${reportAmount.toLocaleString()}｜後五碼 ${last5}｜${timeText}</span>
                    ${warn}
                    <button type="button" class="cancel-report-btn"
                        onclick="cancelPaymentReport(${year}, ${month}, '${safeName}')">取消回報</button>
                </div>`;
        }

        return `
            <div class="db-row income-student-row ${isPaid ? 'is-paid' : ''} ${isReported ? 'is-reported' : ''}">
                <label class="income-paid-checkbox">
                    <input type="checkbox" ${isPaid ? 'checked' : ''}
                        onchange="toggleIncomePaid('${safeName}', this.checked)">
                    <span>已收款</span>
                </label>
                <span class="db-name">${name}</span>
                <span class="db-meta">${(data.mins / 60).toFixed(1)} 小時 · $${money.toLocaleString()}</span>
                ${reportTag}
            </div>`;
    }).join('');
}


// 從 Firebase 重新載入指定月份
async function loadIncomePaidStatusForMonth(year, month) {

    if (
        incomePaidCacheYear === year &&
        incomePaidCacheMonth === month
    ) {
        return;
    }

    incomePaidCacheYear = year;
    incomePaidCacheMonth = month;

    incomePaidCache = {};

    if (typeof window.loadIncomePaidStatuses !== 'function') {
        console.error('❌ 找不到 window.loadIncomePaidStatuses');
        return;
    }

    try {

        const result =
            await window.loadIncomePaidStatuses(
                year,
                month
            );

        incomePaidCache = result || {};

    } catch (error) {

        console.error(
            '❌ 載入月份收款狀態失敗:',
            error
        );

        incomePaidCache = {};
    }
}

// 保留給 app.js / HTML 導覽列使用
window.renderIncomePanel = renderIncomePanel;


// --- 5. 繪製行程方塊 ---
function drawEvent(course, container, dStr, col, overlapCount = 1) {
    const div = document.createElement('div');
    div.className = 'placed-event';
    if (overlapCount > 1) {
        div.classList.add('is-duplicate');
    }

    const currentCourses = window.courses || courses || [];
    const latestStudentData = currentCourses.find(c => c.name === course.name && c.color);
    
    const currentColor = latestStudentData ? latestStudentData.color : (course.color || '#828181');
    div.style.backgroundColor = currentColor;
    div.style.position = 'relative';

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

    div.onclick = (e) => { 
        e.stopPropagation(); 
        openModal(true, course, dStr); 
    };

    // 桌機右鍵刪除保留，邏輯改成呼叫上面的共用函式
    div.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!course.isRepeating) {
            if (confirm(`確定要刪除 [${course.name}] 嗎？`)) {
                deleteCourseDocument(course);
            }
        } else {
            const action = prompt("請選擇刪除方式：\n1. 僅刪除本週 (" + dStr + ")\n2. 永久刪除整個循環", "1");
            if (action === "1") {
                deleteCourseOccurrence(course, dStr);
            } else if (action === "2") {
                if (confirm(`⚠️ 警告：這將刪除所有週次的 [${course.name}]，確定嗎？`)) {
                    deleteCourseDocument(course);
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

function toggleRepeatEndVisibility() {
    const repeatCheckbox = document.getElementById('m-repeat');
    const wrapper = document.getElementById('repeat-end-wrapper');
    if (repeatCheckbox && wrapper) {
        wrapper.classList.toggle('hide', !repeatCheckbox.checked);
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

function clearWorkData() {
    if (confirm("⚠️ 確定要清空所有課程資料嗎？此操作不可逆！")) {
        courses = [];
        window.courses = [];
        localStorage.removeItem('coach_data_v3');
        renderAll();
        console.log("🧹 課程資料已清空");
    }
}

function getMondaysOfMonth(year, month) {
    const mondays = [];
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    let current = new Date(firstDay);
    const dayOfWeek = current.getDay();
    const diffToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
    current.setDate(current.getDate() + diffToMonday);

    while (current <= lastDay || current.getMonth() === month) {
        mondays.push(new Date(current));
        current.setDate(current.getDate() + 7);
        if (current.getMonth() !== month && current.getDate() > 7) break;
    }
    return mondays;
}

// ------------------------------------------------------------
// ▼▼▼ 修正：renderAll (教練端與學生端的時數渲染)
// ------------------------------------------------------------
export function renderAll() {
    try {
        const isStudent = currentUser && currentUser.role === 'student';

        const container = isStudent 
            ? (document.getElementById('student-calendar-grid') || document.getElementById('dropzone'))
            : document.getElementById('dropzone');

        if (!container) return;

        container.querySelectorAll('.placed-event').forEach(el => el.remove());

        const dayHeaders = document.querySelectorAll('.day-header');
        if (!dayHeaders || dayHeaders.length < 7 || !dayHeaders[3]?.dataset?.fullDate) {
            console.log("📅 [renderAll] 日期標頭尚未就緒，暫緩渲染");
            return;
        }

        const weekDates = Array.from(dayHeaders).map(h => h.dataset.fullDate);
        const currentYear = viewDate.getFullYear();
        const currentMonth = viewDate.getMonth();

        let weekTotalMinutes = 0;
        const currentCourses = window.courses || courses || [];
        const pendingEvents = [];

        // 1. 收集當週需要繪製的行程
        currentCourses.forEach(course => {
            if (!course) return;

            if (isStudent) {
                const studentNameMatch = course.name === currentUser.name || course.studentName === currentUser.name;
                if (!studentNameMatch) return; 
            }

            const isException = (dStr) => course.exceptions && course.exceptions.includes(dStr);

            if (course.isRepeating) {
                dayHeaders.forEach(header => {
                    const dStr = header.dataset.fullDate;
                    const hDay = header.dataset.day;

                    let normalizedCourseDay = (course.day === "8" ? "0" : (parseInt(course.day, 10) - 1).toString());

                    if (normalizedCourseDay === hDay && !isException(dStr) && isDateWithinRepeatRange(course, dStr)) {
                        pendingEvents.push({ course, dStr, col: parseInt(hDay) });
                        // ▼▼▼ 修改：使用統一的課程時數計算 ▼▼▼
                        
                        if (course.type === 'work') {
                            const singleDur =
                                getCourseDurationMinutes(course);

                            weekTotalMinutes += singleDur;
                        }
                    }
                });
            } else {
                if (weekDates.includes(course.date)) {
                    const targetHeader = Array.from(dayHeaders).find(h => h.dataset.fullDate === course.date);
                    if (targetHeader) {
                        pendingEvents.push({ course, dStr: course.date, col: parseInt(targetHeader.dataset.day) });
                        // ▼▼▼ 修改：使用統一的課程時數計算 ▼▼▼
                    if (course.type === 'work') {
                        const singleDur =
                            getCourseDurationMinutes(course);

                        weekTotalMinutes += singleDur;
                        }
                    }
                }
            }
        });

        // 2. 繪製行程卡片
        pendingEvents.forEach(({ course, dStr, col }) => {
            const overlapCount = pendingEvents.filter(item => 
                item.dStr === dStr && 
                !(course.endRow <= item.course.startRow || course.startRow >= item.course.endRow)
            ).length;

            if (typeof drawEvent === 'function') {
                drawEvent(course, container, dStr, col, overlapCount);
            }
        });

        // 3. 數據統計與 UI 介面更新
        if (isStudent) {
            renderStudentHomeSummary();
        } else {
            // 👨‍🏫 教練端：計算月度數據並渲染側邊欄
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
        if (!isStudent) {
            renderTodaySchedule();
            const incomePanel = document.getElementById('panel-income');
            if (incomePanel && incomePanel.classList.contains('active')) {
                renderIncomePanel();
            }
        }
    } catch (error) {
        console.error("❌ renderAll 執行失敗:", error);
    }
}

window.renderAll = renderAll;

// --- 8. 匯出圖片 ---
window.exportScheduleToImage = async function(event) {
    const btn = event?.currentTarget || event?.target;
    const originalText = btn?.innerText || '';
    const mainApp = document.getElementById('main-app') || document.querySelector('.main-wrapper');

    if (!mainApp) return alert("找不到要截圖的畫面區域");

    if (btn) {
        btn.innerText = '📸 正在生成全月課表...';
        btn.disabled = true;
    }

    const originalViewDate = new Date(viewDate);
    const targetYear = viewDate.getFullYear();
    const targetMonth = viewDate.getMonth();
    const weekMondays = getMondaysOfMonth(targetYear, targetMonth);

    const WEEK_SPACING = 30; 

    try {
        const canvases = [];

        for (let i = 0; i < weekMondays.length; i++) {
            const monday = weekMondays[i];
            const isFirstWeek = (i === 0);

            viewDate = new Date(monday);
            if (typeof updateWeekDates === 'function') updateWeekDates();
            if (typeof renderAll === 'function') renderAll();

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

        const totalWidth = canvases[0].width;
        const totalHeight = canvases.reduce((sum, c) => sum + c.height, 0) + (WEEK_SPACING * (canvases.length - 1));

        const mergedCanvas = document.createElement('canvas');
        mergedCanvas.width = totalWidth;
        mergedCanvas.height = totalHeight;
        const ctx = mergedCanvas.getContext('2d');

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, totalWidth, totalHeight);

        let currentY = 0;
        for (let i = 0; i < canvases.length; i++) {
            const c = canvases[i];
            ctx.drawImage(c, 0, currentY);
            currentY += c.height + WEEK_SPACING;
        }

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

// ------------------------------------------------------------
// 學生端：課程日曆（月曆格式）
// ------------------------------------------------------------
let studentCalendarDate = new Date();

function isWorkDayForStudent(studentName, course, dStr) {
    if (dStr < STUDENT_DATA_START) return false;
    if (!course || course.type !== 'work' || course.name !== studentName) return false;
    return courseOccursOnDate(course, dStr);
}

function getStudentCoursesOnDate(studentName, dStr) {
    const all = window.courses || [];
    return all.filter((c) => isWorkDayForStudent(studentName, c, dStr));
}

function findNextClassForStudentHome(studentName) {
    const today = new Date();
    for (let i = 0; i <= 60; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const dStr = d.toLocaleDateString('en-CA');
        const matches = getStudentCoursesOnDate(studentName, dStr);
        if (matches.length > 0) {
            return { dateStr: dStr, course: matches[0] };
        }
    }
    return null;
}

window.findNextClassForStudentHome = findNextClassForStudentHome;

window.changeStudentMonth = function (direction) {
    const target = new Date(
        studentCalendarDate.getFullYear(),
        studentCalendarDate.getMonth() + direction,
        1
    );
    const minDate = new Date(STUDENT_START_YEAR, STUDENT_START_MONTH_IDX, 1);
    if (target < minDate) return;
    studentCalendarDate = target;
    renderStudentMonthCalendar();
};

function renderStudentMonthCalendar() {
    const gridEl = document.getElementById('student-month-grid');
    const labelEl = document.getElementById('student-month-label');
    if (!gridEl || !currentUser || !currentUser.name) return;

    const minMonthNum = STUDENT_START_YEAR * 12 + STUDENT_START_MONTH_IDX;
    if (studentCalendarDate.getFullYear() * 12 + studentCalendarDate.getMonth() < minMonthNum) {
        studentCalendarDate = new Date(STUDENT_START_YEAR, STUDENT_START_MONTH_IDX, 1);
    }

    const year = studentCalendarDate.getFullYear();
    const month = studentCalendarDate.getMonth();
    if (labelEl) labelEl.innerText = `${year}年 ${month + 1}月`;
    const prevMonthBtn = document.querySelector('#panel-student-calendar .month-calendar-header button');
    if (prevMonthBtn) prevMonthBtn.disabled = (year * 12 + month) <= minMonthNum;

    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = new Date().toLocaleDateString('en-CA');
    const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六'];

    let html = weekdayLabels.map((w) => `<div class="month-weekday">${w}</div>`).join('');

    for (let i = 0; i < startOffset; i++) {
        html += `<div class="month-cell empty"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const hasClass = getStudentCoursesOnDate(currentUser.name, dStr).length > 0;
        let cls = 'month-cell';
        if (hasClass) {
            cls += dStr < todayStr ? ' day-done' : ' day-upcoming';
        }
        html += `<div class="${cls}" onclick="showStudentDayDetail('${dStr}')">${day}</div>`;
    }

    gridEl.innerHTML = html;
}
window.renderStudentMonthCalendar = renderStudentMonthCalendar;

window.showStudentDayDetail = function (dStr) {
    const detailEl = document.getElementById('student-day-detail');
    if (!detailEl || !currentUser) return;

    const matches = getStudentCoursesOnDate(currentUser.name, dStr);
    if (matches.length === 0) {
        detailEl.innerHTML = `<p class="no-data-hint">${dStr} 沒有課程</p>`;
        return;
    }

    detailEl.innerHTML = matches.map((c) => `
        <div class="db-row">
            <div class="db-main">
                <span class="db-name">${dStr}</span>
                <span class="db-time">⏰ ${c.start}-${c.end}</span>
            </div>
            <span class="db-meta">📍 ${c.loc}</span>
        </div>
    `).join('');
};

// ------------------------------------------------------------
// 共用規則：某一堂課在指定日期（YYYY-MM-DD）有沒有上課。
// 單次課程看日期；重複課程看星期幾、請假例外、開始日與「重複到」結束日。
// 學生月曆、今日行程都呼叫這一個函式，規則只存在一處。
// ------------------------------------------------------------
function courseOccursOnDate(course, dStr) {
    if (!course) return false;

    if (course.isRepeating) {
        if (!course.day) return false;
        const targetDay = (course.day === "8" ? 0 : parseInt(course.day, 10) - 1);
        const d = new Date(`${dStr}T00:00:00`);
        if (d.getDay() !== targetDay) return false;
        if ((course.exceptions || []).includes(dStr)) return false;
        return isDateWithinRepeatRange(course, dStr);
    }

    return course.date === dStr;
}

// 教練總覽：今日行程（只列教球課，依開始時間排序，用今天的實際日期）
function renderTodaySchedule() {
    const listEl = document.getElementById('overview-today-list');
    if (!listEl) return;

    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA');

    const dateLabelEl = document.getElementById('overview-today-date');
    if (dateLabelEl) {
        const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
        dateLabelEl.innerText = `${now.getMonth() + 1}/${now.getDate()} (${weekDays[now.getDay()]})`;
    }

    const todays = (window.courses || courses || [])
        .filter(c => c && c.type === 'work' && courseOccursOnDate(c, todayStr))
        .sort((a, b) => (a.start || '').localeCompare(b.start || ''));

    if (todays.length === 0) {
        listEl.innerHTML = '<p class="no-data-hint" style="text-align: left" >今天沒有行程</p>';
        return;
    }

    listEl.innerHTML = todays.map(c => `
        <div class="today-item">
            <span class="today-time">${c.start} - ${c.end}</span>
            <span class="today-name">${c.name}</span>
            <span class="today-loc">@ ${c.loc}</span>
        </div>
    `).join('');
}
window.renderTodaySchedule = renderTodaySchedule;

window.deleteFromModal = deleteFromModal;

// 取得某位學生在日期區間內的教球課明細（由舊到新）。
// 是否上課沿用共用規則 courseOccursOnDate，時長與費率的算法跟「本月收入」一致。
function getStudentLessonDetails(studentName, startStr, endStr) {
    const studentCourses = (window.courses || courses || [])
        .filter(c => c && c.type === 'work' && c.name === studentName);

    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA');
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const results = [];
    const cursor = new Date(`${startStr}T00:00:00`);
    const last = new Date(`${endStr}T00:00:00`);

    while (cursor <= last) {
        const dStr = cursor.toLocaleDateString('en-CA');
        studentCourses.forEach(c => {
            if (!courseOccursOnDate(c, dStr)) return;
            const minutes = getCourseDurationMinutes(c);
            const rate = Number.isFinite(Number(c.price)) ? Number(c.price) : 600;
            results.push({
                dateStr: dStr,
                start: c.start,
                end: c.end,
                loc: c.loc,
                minutes,
                money: (minutes / 60) * rate,
                completed: dStr < todayStr || (dStr === todayStr && (c.end || '') <= nowTime)
            });
        });
        cursor.setDate(cursor.getDate() + 1);
    }

    results.sort((a, b) =>
        a.dateStr.localeCompare(b.dateStr) || (a.start || '').localeCompare(b.start || '')
    );
    return results;
}
window.getStudentLessonDetails = getStudentLessonDetails;

// ------------------------------------------------------------
// 學生端：學習歷程折線圖（橫軸月份、縱軸該月已上完的上課小時數）
// 時數沿用 getStudentLessonDetails，跟月曆、教練端個人頁是同一套規則；
// 只算已上完的課，所以當年度只會畫到目前這個月。
// ------------------------------------------------------------
let chartYear = new Date().getFullYear();

function getEarliestLessonYear(studentName) {
    const years = (window.courses || courses || [])
        .filter(c => c && c.type === 'work' && c.name === studentName && c.date)
        .map(c => parseInt(c.date.slice(0, 4), 10))
        .filter(y => Number.isFinite(y));
    return years.length ? Math.min(...years) : new Date().getFullYear();
}

function getMonthlyHoursForYear(studentName, year) {
    const hours = new Array(12).fill(0);
    const range = clampToStudentStart(`${year}-01-01`, `${year}-12-31`);
    if (!range) return hours;

    getStudentLessonDetails(studentName, range.start, range.end).forEach(l => {
        if (!l.completed) return;
        const monthIdx = parseInt(l.dateStr.slice(5, 7), 10) - 1;
        hours[monthIdx] += l.minutes / 60;
    });
    return hours;
}

// 依資料決定縱軸最大值與刻度間距
function niceChartScale(maxVal) {
    if (maxVal <= 4) return { step: 1, max: 4 };
    const rough = maxVal / 4;
    const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500];
    const step = steps.find(s => s >= rough) || 1000;
    return { step, max: Math.ceil(maxVal / step) * step };
}

function renderProgressChart() {
    const container = document.getElementById('progress-chart');
    if (!container) return;
    if (!currentUser || currentUser.role !== 'student' || !currentUser.name) return;

    const name = currentUser.name;
    const now = new Date();
    const nowYear = now.getFullYear();
    // 年份範圍：起算年 ~ 今年，也不早於這位學生最早有課的那一年
    const earliest = Math.max(STUDENT_START_YEAR, Math.min(getEarliestLessonYear(name), nowYear));

    if (chartYear > nowYear) chartYear = nowYear;
    if (chartYear < earliest) chartYear = earliest;

    const labelEl = document.getElementById('chart-year-label');
    if (labelEl) labelEl.innerText = `${chartYear} 年`;
    const prevBtn = document.getElementById('chart-year-prev');
    const nextBtn = document.getElementById('chart-year-next');
    if (prevBtn) prevBtn.disabled = chartYear <= earliest;
    if (nextBtn) nextBtn.disabled = chartYear >= nowYear;

    // 畫圖的月份範圍：起算年只從起算月開始，今年只畫到目前這個月
    const firstIdx = chartYear === STUDENT_START_YEAR ? STUDENT_START_MONTH_IDX : 0;
    const lastIdx = chartYear === nowYear ? now.getMonth() : 11;
    const plotted = getMonthlyHoursForYear(name, chartYear).slice(0, lastIdx + 1);
    const visible = plotted.slice(firstIdx);
    const total = visible.reduce((sum, h) => sum + h, 0);
    const hasData = visible.some(h => h > 0);

    const totalEl = document.getElementById('chart-year-total');
    if (totalEl) {
        const totalText = Number(total.toFixed(1));
        totalEl.innerText = chartYear === nowYear
            ? `今年已上完累計 ${totalText} 小時`
            : `全年已上完共 ${totalText} 小時`;
    }

    const W = 480, H = 250, L = 38, R = 12, T = 28, B = 34, PAD = 14;
    const plotW = W - L - R;
    const plotH = H - T - B;
    const xStep = (plotW - PAD * 2) / 11;
    const xAt = i => L + PAD + i * xStep;
    const { step, max } = niceChartScale(Math.max(...visible, 0));
    const yAt = v => T + plotH - (v / max) * plotH;

    let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${chartYear} 年每月上課時數折線圖">`;

    for (let v = 0; v <= max; v += step) {
        const y = yAt(v);
        svg += `<line x1="${L}" y1="${y}" x2="${L + plotW}" y2="${y}" stroke="${v === 0 ? '#b0bec5' : '#eceff1'}" stroke-width="1"/>`;
        svg += `<text x="${L - 8}" y="${y + 4}" text-anchor="end" font-size="12" fill="#7f8c8d">${v}</text>`;
    }

    svg += `<text x="4" y="14" font-size="12" fill="#7f8c8d">小時</text>`;
    svg += `<text x="${W - 4}" y="${T + plotH + 22}" text-anchor="end" font-size="12" fill="#7f8c8d">月</text>`;
    for (let i = 0; i < 12; i++) {
        const color = i < firstIdx ? '#cfd8dc' : '#7f8c8d';   // 起算月以前的月份淺灰
        svg += `<text x="${xAt(i)}" y="${T + plotH + 22}" text-anchor="middle" font-size="12" fill="${color}">${i + 1}</text>`;
    }

    if (hasData) {
        const pts = plotted
            .map((h, i) => (i >= firstIdx ? `${xAt(i).toFixed(1)},${yAt(h).toFixed(1)}` : null))
            .filter(Boolean)
            .join(' ');
        svg += `<polyline points="${pts}" fill="none" stroke="#4db6ac" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
        plotted.forEach((h, i) => {
            if (i < firstIdx) return;
            const x = xAt(i).toFixed(1);
            const y = yAt(h);
            svg += `<circle cx="${x}" cy="${y.toFixed(1)}" r="4.5" fill="#fff" stroke="#4db6ac" stroke-width="2.5"/>`;
            svg += `<text x="${x}" y="${(y - 10).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="#2c3e50">${Number(h.toFixed(1))}</text>`;
        });
    } else {
        svg += `<text x="${L + plotW / 2}" y="${T + plotH / 2}" text-anchor="middle" font-size="14" fill="#95a5a6">這段期間沒有上課紀錄</text>`;
    }

    svg += `</svg>`;
    container.innerHTML = svg;
}

window.changeChartYear = function (direction) {
    chartYear += direction;
    renderProgressChart();
};
window.renderProgressChart = renderProgressChart;

// ------------------------------------------------------------
// 學生端統一數字來源：同一份明細同時算出「已上完」和「預定」兩組數字。
//   已上完：日期在今天以前，或今天且下課時間已過
//   預定　：區間內所有排進行事曆的課（包含已上完的）
// 首頁、繳費頁、上課紀錄查詢都從這裡取值，不再各算各的。
// ------------------------------------------------------------
function formatHours(minutes) {
    return Number((minutes / 60).toFixed(2));
}
window.formatHours = formatHours;

function getStudentPeriodSummary(studentName, startStr, endStr) {
    const range = clampToStudentStart(startStr, endStr);
    const lessons = range ? getStudentLessonDetails(studentName, range.start, range.end) : [];
    const blank = () => ({ count: 0, minutes: 0, money: 0 });
    const completed = blank();
    const scheduled = blank();

    lessons.forEach(l => {
        scheduled.count += 1;
        scheduled.minutes += l.minutes;
        scheduled.money += l.money;
        if (l.completed) {
            completed.count += 1;
            completed.minutes += l.minutes;
            completed.money += l.money;
        }
    });
    return { completed, scheduled };
}

function getStudentMonthSummary(studentName, year, monthIdx) {
    const mm = String(monthIdx + 1).padStart(2, '0');
    const lastDay = new Date(year, monthIdx + 1, 0).getDate();
    return getStudentPeriodSummary(
        studentName,
        `${year}-${mm}-01`,
        `${year}-${mm}-${String(lastDay).padStart(2, '0')}`
    );
}

window.getStudentPeriodSummary = getStudentPeriodSummary;
window.getStudentMonthSummary = getStudentMonthSummary;

// 學生首頁「本月上課時數」：大字是已上完，小字是本月預定（以今天所在的月份為準）
function renderStudentHomeSummary() {
    if (!currentUser || currentUser.role !== 'student' || !currentUser.name) return;
    const now = new Date();
    const s = getStudentMonthSummary(currentUser.name, now.getFullYear(), now.getMonth());
    const hoursEl = document.getElementById('student-total-hours');
    const subEl = document.getElementById('student-total-hours-sub');
    if (hoursEl) hoursEl.innerText = `${formatHours(s.completed.minutes)} 小時`;
    if (subEl) subEl.innerText = `本月預定 ${formatHours(s.scheduled.minutes)} 小時`;
}

// ------------------------------------------------------------
// 教練端：收入折線圖（近 6 個月／近 1 年／今年累計）
// 每月金額用 calculateMonthlyData（跟財務報表「本月預定收入」同一套）；
// 已收款 = 該月已被勾選「已收款」的學生的預定收入加總，待收款 = 預定 − 已收款。
// ------------------------------------------------------------
let trendRange = '6m';
let trendData = [];
let trendGeom = { xs: [], ys: [] };
let trendActiveIndex = null;
let trendLastPointer = 'mouse';

const TREND_W = 480, TREND_H = 270;
const TREND_L = 58, TREND_R = 14, TREND_T = 30, TREND_B = 46, TREND_PAD = 14;

// 金額專用的刻度（1、2、5 × 10 的次方），學生端那個是給小時數用的，不適合幾萬元的數字
function niceMoneyScale(maxVal) {
    if (!(maxVal > 0)) return { step: 1000, max: 4000 };
    const rough = maxVal / 4;
    const pow = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / pow;
    const mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    const step = mult * pow;
    return { step, max: Math.ceil(maxVal / step) * step };
}

function trendMoney(v) {
    return `$${Math.round(v).toLocaleString()}`;
}

function getTrendMonthList(range) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const count = range === '12m' ? 12 : range === 'ytd' ? m + 1 : 6;
    const startNum = FINANCE_START_YEAR * 12 + FINANCE_START_MONTH_IDX;
    const list = [];
    for (let i = count - 1; i >= 0; i--) {
        const d = new Date(y, m - i, 1);
        if (d.getFullYear() * 12 + d.getMonth() < startNum) continue;   // 起算月以前不畫
        list.push({ year: d.getFullYear(), monthIdx: d.getMonth() });
    }
    return list;
}

function computeTrendData(range) {
    const paidMap = window.incomePaidMap || {};
    return getTrendMonthList(range).map(({ year, monthIdx }) => {
        const data = calculateMonthlyData(year, monthIdx);
        let paid = 0;
        Object.entries(data.studentStats).forEach(([name, s]) => {
            if (paidMap[`${year}-${monthIdx + 1}-${name}`] === true) paid += s.money;
        });
        const income = data.totalIncome;
        return { year, monthIdx, income, paid, pending: Math.max(0, income - paid) };
    });
}

function renderIncomeTrend() {
    const chartEl = document.getElementById('income-trend-chart');
    if (!chartEl) return;
    if (currentUser && currentUser.role === 'student') return;

    trendData = computeTrendData(trendRange);
    const n = trendData.length;

    const totals = trendData.reduce(
        (acc, d) => ({ income: acc.income + d.income, paid: acc.paid + d.paid, pending: acc.pending + d.pending }),
        { income: 0, paid: 0, pending: 0 }
    );
    const labelMap = { '6m': '近 6 個月合計', '12m': '近 1 年合計', 'ytd': '今年累計' };
    const summaryEl = document.getElementById('income-trend-summary');
    if (summaryEl) {
        summaryEl.innerHTML = `${labelMap[trendRange]}：<strong>${trendMoney(totals.income)}</strong>　` +
            `<span class="trend-paid">已收款 ${trendMoney(totals.paid)}</span>　` +
            `<span class="trend-pending">待收款 ${trendMoney(totals.pending)}</span>`;
    }

    const plotW = TREND_W - TREND_L - TREND_R;
    const plotH = TREND_H - TREND_T - TREND_B;
    const xAt = (i) => n === 1
        ? TREND_L + plotW / 2
        : TREND_L + TREND_PAD + i * ((plotW - TREND_PAD * 2) / (n - 1));
    const { step, max } = niceMoneyScale(Math.max(...trendData.map(d => d.income), 0));
    const yAt = (v) => TREND_T + plotH - (v / max) * plotH;
    const hasData = trendData.some(d => d.income > 0);

    trendGeom = { xs: trendData.map((_, i) => xAt(i)), ys: trendData.map(d => yAt(d.income)) };

    let svg = `<svg viewBox="0 0 ${TREND_W} ${TREND_H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="每月收入折線圖">`;

    for (let v = 0; v <= max; v += step) {
        const y = yAt(v);
        svg += `<line x1="${TREND_L}" y1="${y}" x2="${TREND_L + plotW}" y2="${y}" stroke="${v === 0 ? '#b0bec5' : '#eceff1'}" stroke-width="1"/>`;
        svg += `<text x="${TREND_L - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#7f8c8d">${v.toLocaleString()}</text>`;
    }
    svg += `<text x="4" y="14" font-size="12" fill="#7f8c8d">元</text>`;

    const baseY = TREND_T + plotH;
    trendData.forEach((d, i) => {
        const x = trendGeom.xs[i];
        svg += `<text x="${x}" y="${baseY + 18}" text-anchor="middle" font-size="12" fill="#7f8c8d">${d.monthIdx + 1}月</text>`;
        // 第一個點與每年 1 月，多標一行年份，跨年時才看得出來
        if (i === 0 || d.monthIdx === 0) {
            svg += `<text x="${x}" y="${baseY + 33}" text-anchor="middle" font-size="10" fill="#b0bec5">${d.year}</text>`;
        }
    });

    if (hasData) {
        const pts = trendData.map((d, i) => `${trendGeom.xs[i].toFixed(1)},${trendGeom.ys[i].toFixed(1)}`).join(' ');
        svg += `<polyline points="${pts}" fill="none" stroke="#4db6ac" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
        trendData.forEach((d, i) => {
            const x = trendGeom.xs[i].toFixed(1);
            const y = trendGeom.ys[i];
            svg += `<circle class="trend-dot" data-dot="${i}" cx="${x}" cy="${y.toFixed(1)}" r="4.5"/>`;
            // 點太多會互相擠在一起，只有 7 個點以內才直接標金額，其餘靠提示框
            if (n <= 7) {
                svg += `<text x="${x}" y="${(y - 10).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="#2c3e50">${Math.round(d.income).toLocaleString()}</text>`;
            }
        });
        // 透明的大圓放在最上層，手指比較好點
        trendData.forEach((d, i) => {
            svg += `<circle class="trend-hit" data-hit="${i}" cx="${trendGeom.xs[i].toFixed(1)}" cy="${trendGeom.ys[i].toFixed(1)}" r="16"/>`;
        });
    } else {
        svg += `<text x="${TREND_L + plotW / 2}" y="${TREND_T + plotH / 2}" text-anchor="middle" font-size="14" fill="#95a5a6">這段期間沒有收入紀錄</text>`;
    }

    svg += `</svg>`;
    chartEl.innerHTML = svg;

    if (hasData && trendActiveIndex !== null && trendActiveIndex < n) {
        showTrendTooltip(trendActiveIndex);
    } else {
        hideTrendTooltip();
    }
}

function showTrendTooltip(i) {
    const tip = document.getElementById('income-trend-tooltip');
    const wrap = document.getElementById('income-trend-wrap');
    const svgEl = document.querySelector('#income-trend-chart svg');
    const d = trendData[i];
    if (!tip || !wrap || !svgEl || !d) return;

    trendActiveIndex = i;
    tip.innerHTML = `
        <div class="trend-tip-title">${d.year} 年 ${d.monthIdx + 1} 月</div>
        <div class="trend-tip-row"><span>預定收入</span><strong>${trendMoney(d.income)}</strong></div>
        <div class="trend-tip-row"><span>已收款</span><strong class="trend-paid">${trendMoney(d.paid)}</strong></div>
        <div class="trend-tip-row"><span>待收款</span><strong class="trend-pending">${trendMoney(d.pending)}</strong></div>`;
    tip.classList.remove('hide');

    // SVG 會隨螢幕寬度縮放，所以要用實際畫出來的大小換算圓點的位置
    const svgRect = svgEl.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const scale = svgRect.width / TREND_W;
    const px = (svgRect.left - wrapRect.left) + trendGeom.xs[i] * scale;
    const py = (svgRect.top - wrapRect.top) + trendGeom.ys[i] * scale;

    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const left = Math.max(4, Math.min(px - tw / 2, wrapRect.width - tw - 4));
    let top = py - th - 12;
    if (top < 4) top = py + 14;   // 上方放不下就改放在點的下面
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;

    document.querySelectorAll('#income-trend-chart .trend-dot').forEach(c => {
        c.classList.toggle('active', Number(c.dataset.dot) === i);
    });
}

function hideTrendTooltip() {
    trendActiveIndex = null;
    const tip = document.getElementById('income-trend-tooltip');
    if (tip) tip.classList.add('hide');
    document.querySelectorAll('#income-trend-chart .trend-dot').forEach(c => c.classList.remove('active'));
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.trend-range-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            trendRange = btn.dataset.range;
            document.querySelectorAll('.trend-range-btn').forEach(b => b.classList.toggle('active', b === btn));
            trendActiveIndex = null;
            renderIncomeTrend();
        });
    });

    const wrap = document.getElementById('income-trend-wrap');
    if (wrap) {
        wrap.addEventListener('pointerdown', (e) => { trendLastPointer = e.pointerType || 'mouse'; });

        // 滑鼠：移到點上就顯示、移開就收起
        wrap.addEventListener('pointerover', (e) => {
            if (e.pointerType !== 'mouse') return;
            const hit = e.target.closest('[data-hit]');
            if (hit) showTrendTooltip(Number(hit.dataset.hit));
        });
        wrap.addEventListener('pointerout', (e) => {
            if (e.pointerType !== 'mouse') return;
            if (e.target.closest('[data-hit]')) hideTrendTooltip();
        });

        // 觸控：點一下顯示，再點同一個點或點空白處就收起
        wrap.addEventListener('click', (e) => {
            const hit = e.target.closest('[data-hit]');
            if (!hit) { hideTrendTooltip(); return; }
            const i = Number(hit.dataset.hit);
            if (trendLastPointer === 'mouse') { showTrendTooltip(i); return; }
            if (trendActiveIndex === i) hideTrendTooltip(); else showTrendTooltip(i);
        });
    }

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#income-trend-wrap')) hideTrendTooltip();
    });
});

window.renderIncomeTrend = renderIncomeTrend;
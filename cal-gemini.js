// --- 全域變數 ---
import { currentUser } from './app.js';
let courses = [];
let viewDate = new Date(); 
let editingId = null; // 【編輯功能關鍵】用於追蹤正在編輯的行程 ID

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
    courseStartDate = null
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
});

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

    const dayHeaders = document.querySelectorAll('.day-header');
    const targetHeader = Array.from(dayHeaders).find(
    h => h.dataset.day === (parseInt(day, 10) - 1).toString()
);
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
                    courseStartDate
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


let incomePaidCache = {};

let incomePaidCacheYear = null;
let incomePaidCacheMonth = null;


// 取得目前月份的收款狀態
function getIncomePaidStatus(year, month, studentName) {
    return incomePaidCache[studentName] === true;
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


// 勾選「已收款」時
window.toggleIncomePaid = async function (
    studentName,
    checked
) {

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    // 先更新畫面
    incomePaidCache[studentName] = checked;

    renderIncomePanel();

    // 寫入 Firebase
    if (typeof window.setIncomePaidStatus !== 'function') {
        console.error('❌ 找不到 window.setIncomePaidStatus');
        return;
    }

    const success =
        await window.setIncomePaidStatus(
            year,
            month,
            studentName,
            checked
        );

    // 如果 Firebase 寫入失敗
    if (!success) {

        // 還原原本狀態
        incomePaidCache[studentName] = !checked;

        renderIncomePanel();

        alert(
            '收款紀錄儲存失敗，請檢查網路連線後再試一次。'
        );
    }
};

export async function renderIncomePanel() {

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const monthData =
        calculateMonthlyData(year, month);

    const hoursEl =
        document.getElementById(
            'income-panel-total-hours'
        );

    if (hoursEl) {
        hoursEl.innerText =
            `${(monthData.totalMinutes / 60).toFixed(1)} 小時`;
    }


    const incomeEl =
        document.getElementById(
            'income-panel-total-income'
        );

    if (incomeEl) {
        incomeEl.innerText =
            `$${Math.round(monthData.totalIncome).toLocaleString()}`;
    }


    const breakdownEl =
        document.getElementById(
            'income-panel-breakdown'
        );

    if (!breakdownEl) return;


    const entries =
        Object.entries(monthData.studentStats)
        .sort(
            (a, b) =>
                b[1].money - a[1].money
        );

    if (entries.length === 0) {

        breakdownEl.innerHTML =
            '<p class="no-data-hint">本月尚無教球紀錄</p>';

        const paidEl =
            document.getElementById(
                'income-panel-paid-income'
            );

        const pendingEl =
            document.getElementById(
                'income-panel-pending-income'
            );

        if (paidEl) paidEl.innerText = '$0';
        if (pendingEl) pendingEl.innerText = '$0';

        return;
    }


    await loadIncomePaidStatusForMonth(
        year,
        month
    );

    let paidIncome = 0;
    let pendingIncome = 0;

    entries.forEach(
        ([name, data]) => {

            const isPaid =
                getIncomePaidStatus(
                    year,
                    month,
                    name
                );

            if (isPaid) {
                paidIncome += data.money;
            } else {
                pendingIncome += data.money;
            }
        }
    );

    const paidIncomeEl =
        document.getElementById(
            'income-panel-paid-income'
        );

    if (paidIncomeEl) {
        paidIncomeEl.innerText =
            `$${Math.round(paidIncome).toLocaleString()}`;
    }


    const pendingIncomeEl =
        document.getElementById(
            'income-panel-pending-income'
        );

    if (pendingIncomeEl) {
        pendingIncomeEl.innerText =
            `$${Math.round(pendingIncome).toLocaleString()}`;
    }

    breakdownEl.innerHTML =
        entries.map(
            ([name, data]) => {

                const isPaid =
                    getIncomePaidStatus(
                        year,
                        month,
                        name
                    );

                // 避免學生姓名裡的特殊字元破壞 onclick
                const safeName =
                    name
                        .replace(/\\/g, '\\\\')
                        .replace(/'/g, "\\'");

                return `
                    <div class="db-row income-student-row ${isPaid ? 'is-paid' : ''}">

                        <label class="income-paid-checkbox">

                            <input
                                type="checkbox"
                                ${isPaid ? 'checked' : ''}
                                onchange="toggleIncomePaid('${safeName}', this.checked)"
                            >

                            <span>已收款</span>

                        </label>

                        <span class="db-name">
                            ${name}
                        </span>

                        <span class="db-meta">
                            ${(data.mins / 60).toFixed(1)} 小時
                            ·
                            $${Math.round(data.money).toLocaleString()}
                        </span>

                    </div>
                `;
            }
        ).join('');
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
        openModal(true, course); 
    };

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
                        window.uploadEvent(course);
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

                    let normalizedCourseDay = (parseInt(course.day, 10) - 1).toString();

                    if (normalizedCourseDay === hDay && !isException(dStr)) {
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
            // 🎓 學生端：直接使用統一的 calculateMonthlyData 計算，確保數字 100% 一致
            const studentMonthData = calculateMonthlyData(currentYear, currentMonth);

            const studentHoursEl = document.getElementById('student-total-hours');
            if (studentHoursEl) {
                studentHoursEl.innerText = (studentMonthData.totalMinutes / 60).toFixed(1);
            }

            const paymentEl = document.getElementById('student-class-count');
            if (paymentEl) {
                const isPaid = currentUser.isPaid ?? false;
                paymentEl.innerText = isPaid ? '已繳費' : '未繳費';
                paymentEl.style.color = isPaid ? '#2e7d32' : '#d32f2f';
            }

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
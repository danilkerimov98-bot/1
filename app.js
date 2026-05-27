// PWA Задачник - безопасная версия без CSP ошибок

let tasks = [];
let currentFilter = 'all';
let deferredPrompt = null;
let swRegistration = null;
let notificationsEnabled = false;

// DOM элементы
const taskInput = document.getElementById('taskInput');
const addBtn = document.getElementById('addBtn');
const taskList = document.getElementById('taskList');
const totalCount = document.getElementById('totalCount');
const activeCount = document.getElementById('activeCount');
const completedCount = document.getElementById('completedCount');
const filterAll = document.getElementById('filterAll');
const filterActive = document.getElementById('filterActive');
const filterCompleted = document.getElementById('filterCompleted');
const installBtn = document.getElementById('installBtn');
const notifyBtn = document.getElementById('notifyBtn');

// Загрузка задач
function loadTasks() {
    const saved = localStorage.getItem('tasks');
    if (saved) {
        tasks = JSON.parse(saved);
    }
    updateStats();
    render();
}

// Сохранение задач
function saveTasks() {
    localStorage.setItem('tasks', JSON.stringify(tasks));
    updateStats();
}

// Добавление задачи
function addTask() {
    const text = taskInput.value.trim();
    if (!text) return;

    const task = {
        id: Date.now(),
        text: text,
        completed: false,
        createdAt: new Date().toISOString(),
        notified: false
    };

    tasks.unshift(task);
    taskInput.value = '';
    saveTasks();
    render();
    sendNotification('Новая задача', text);
}

// Удаление задачи
function deleteTask(taskId) {
    tasks = tasks.filter(task => task.id !== taskId);
    saveTasks();
    render();
}

// Переключение статуса задачи
function toggleTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
        task.completed = !task.completed;
        saveTasks();
        render();
        if (task.completed) {
            sendNotification('Задача выполнена', task.text);
        }
    }
}

// Получение отфильтрованных задач
function getFilteredTasks() {
    if (currentFilter === 'active') {
        return tasks.filter(task => !task.completed);
    }
    if (currentFilter === 'completed') {
        return tasks.filter(task => task.completed);
    }
    return tasks;
}

// Обновление статистики
function updateStats() {
    const total = tasks.length;
    const active = tasks.filter(t => !t.completed).length;
    const completed = tasks.filter(t => t.completed).length;

    totalCount.textContent = total;
    activeCount.textContent = active;
    completedCount.textContent = completed;
}

// Обработчик клика по задаче
function onTaskClick(taskId) {
    return function () {
        toggleTask(taskId);
    };
}

// Обработчик клика по кнопке удаления
function onDeleteClick(taskId) {
    return function (event) {
        event.stopPropagation();
        deleteTask(taskId);
    };
}

// Создание элемента задачи
function createTaskElement(task) {
    const li = document.createElement('li');
    li.className = 'task-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.addEventListener('change', function () {
        toggleTask(task.id);
    });

    const span = document.createElement('span');
    span.className = 'task-text';
    if (task.completed) {
        span.classList.add('completed');
    }
    span.textContent = task.text;
    span.addEventListener('click', function () {
        toggleTask(task.id);
    });

    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-btn';
    deleteButton.textContent = '🗑️';
    deleteButton.addEventListener('click', function (event) {
        event.stopPropagation();
        deleteTask(task.id);
    });

    li.appendChild(checkbox);
    li.appendChild(span);
    li.appendChild(deleteButton);

    return li;
}

// Отображение задач
function render() {
    const filteredTasks = getFilteredTasks();

    if (filteredTasks.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty';
        emptyDiv.textContent = '📭 Нет задач';
        taskList.innerHTML = '';
        taskList.appendChild(emptyDiv);
        return;
    }

    taskList.innerHTML = '';
    filteredTasks.forEach(task => {
        const taskElement = createTaskElement(task);
        taskList.appendChild(taskElement);
    });
}

// Отправка уведомления
function sendNotification(title, body) {
    if (!notificationsEnabled) return;

    if (swRegistration && swRegistration.showNotification) {
        swRegistration.showNotification(title, { body: body });
    } else if (window.Notification && Notification.permission === 'granted') {
        new Notification(title, { body: body });
    }
}

// Включение уведомлений
async function enableNotifications() {
    if (!window.Notification) {
        alert('Ваш браузер не поддерживает уведомления');
        return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        notificationsEnabled = true;
        notifyBtn.textContent = '🔕 Отключить уведомления';
        notifyBtn.style.background = '#f44336';
        sendNotification('Уведомления включены', 'Вы будете получать оповещения о задачах');
    } else {
        alert('Необходимо разрешить уведомления');
    }
}

// Отключение уведомлений
function disableNotifications() {
    notificationsEnabled = false;
    notifyBtn.textContent = '🔔 Включить уведомления';
    notifyBtn.style.background = '#FF9800';
}

// Обработчик кнопки уведомлений
function onNotifyClick() {
    if (notificationsEnabled) {
        disableNotifications();
    } else {
        enableNotifications();
    }
}

// Регистрация Service Worker
async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        console.log('Service Worker не поддерживается');
        return;
    }

    try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker зарегистрирован:', registration);
        swRegistration = registration;

        // Проверяем статус push подписки
        const subscription = await registration.pushManager.getSubscription();
        notificationsEnabled = subscription !== null;
        if (notificationsEnabled) {
            notifyBtn.textContent = '🔕 Отключить уведомления';
            notifyBtn.style.background = '#f44336';
        }

        // Проверяем обновления
        registration.addEventListener('updatefound', function () {
            console.log('Найдено обновление Service Worker');
        });

    } catch (error) {
        console.error('Ошибка регистрации Service Worker:', error);
    }
}

// Настройка установки PWA
function setupPWAInstall() {
    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferredPrompt = e;
        installBtn.classList.remove('hidden');
    });

    installBtn.addEventListener('click', async function () {
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        const result = await deferredPrompt.userChoice;
        console.log('Результат установки:', result.outcome);

        if (result.outcome === 'accepted') {
            installBtn.classList.add('hidden');
        }
        deferredPrompt = null;
    });
}

// Установка фильтров
function setupFilters() {
    function setActiveFilter(activeButton) {
        [filterAll, filterActive, filterCompleted].forEach(btn => {
            btn.classList.remove('active');
        });
        activeButton.classList.add('active');
    }

    filterAll.addEventListener('click', function () {
        currentFilter = 'all';
        setActiveFilter(filterAll);
        render();
    });

    filterActive.addEventListener('click', function () {
        currentFilter = 'active';
        setActiveFilter(filterActive);
        render();
    });

    filterCompleted.addEventListener('click', function () {
        currentFilter = 'completed';
        setActiveFilter(filterCompleted);
        render();
    });
}

// Проверка дедлайнов (простая версия)
function startDeadlineChecker() {
    setInterval(function () {
        // Здесь можно добавить проверку дедлайнов
        console.log('Проверка задач...');
    }, 60000);
}

// Инициализация приложения
function init() {
    loadTasks();
    setupFilters();
    setupPWAInstall();
    registerServiceWorker();
    startDeadlineChecker();

    addBtn.addEventListener('click', addTask);
    taskInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            addTask();
        }
    });

    notifyBtn.addEventListener('click', onNotifyClick);
}

// Запуск приложения
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

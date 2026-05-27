class TaskManager {
    constructor() {
        this.tasks = [];
        this.currentFilter = 'all';
        this.swRegistration = null;
        this.isSubscribed = false;
        this.init();
    }

    async init() {
        this.loadTasks();
        this.render();
        this.setupEventListeners();
        await this.registerServiceWorker();
        await this.initializePushNotifications();
        this.startDeadlineChecker();
    }

    loadTasks() {
        const saved = localStorage.getItem('tasks');
        if (saved) {
            this.tasks = JSON.parse(saved);
        }
    }

    saveTasks() {
        localStorage.setItem('tasks', JSON.stringify(this.tasks));
        this.updateStats();
    }

    addTask(text, deadline) {
        if (!text.trim()) {
            this.showNotification('Ошибка', 'Введите текст задачи!');
            return;
        }

        const task = {
            id: Date.now(),
            text: text.trim(),
            completed: false,
            createdAt: new Date().toISOString(),
            deadline: deadline || null,
            notificationSent: false
        };

        this.tasks.unshift(task);
        this.saveTasks();
        this.render();

        this.sendPushNotification('Новая задача', `Добавлена задача: ${text}`);

        if (deadline) {
            this.scheduleDeadlineNotification(task);
        }
    }

    deleteTask(id) {
        this.tasks = this.tasks.filter(task => task.id !== id);
        this.saveTasks();
        this.render();
    }

    toggleTask(id) {
        const task = this.tasks.find(t => t.id === id);
        if (task) {
            task.completed = !task.completed;
            this.saveTasks();
            this.render();

            if (task.completed) {
                this.sendPushNotification('Задача выполнена', `Поздравляем! Задача "${task.text}" выполнена!`);
            }
        }
    }

    getFilteredTasks() {
        switch (this.currentFilter) {
            case 'active':
                return this.tasks.filter(task => !task.completed);
            case 'completed':
                return this.tasks.filter(task => task.completed);
            default:
                return this.tasks;
        }
    }

    updateStats() {
        const total = this.tasks.length;
        const active = this.tasks.filter(t => !t.completed).length;
        const completed = this.tasks.filter(t => t.completed).length;

        document.getElementById('totalCount').textContent = total;
        document.getElementById('activeCount').textContent = active;
        document.getElementById('completedCount').textContent = completed;
    }

    render() {
        const taskList = document.getElementById('taskList');
        const filteredTasks = this.getFilteredTasks();

        if (filteredTasks.length === 0) {
            taskList.innerHTML = '<div class="empty-state">📭 Нет задач</div>';
            this.updateStats();
            return;
        }

        taskList.innerHTML = filteredTasks.map(task => {
            const deadlineDate = task.deadline ? new Date(task.deadline) : null;
            const isOverdue = deadlineDate && deadlineDate < new Date() && !task.completed;
            const deadlineText = deadlineDate ? `⏰ ${deadlineDate.toLocaleString()}` : '';

            return `
                <li class="task-item" data-id="${task.id}">
                    <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''}>
                    <span class="task-text ${task.completed ? 'completed' : ''}">${this.escapeHtml(task.text)}</span>
                    ${deadlineText ? `<span class="task-deadline ${isOverdue ? 'overdue' : ''}">${deadlineText}</span>` : ''}
                    <div class="task-actions">
                        <button class="delete-btn">🗑️</button>
                    </div>
                </li>
            `;
        }).join('');

        document.querySelectorAll('.task-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const taskItem = e.target.closest('.task-item');
                const id = parseInt(taskItem.dataset.id);
                this.toggleTask(id);
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const taskItem = e.target.closest('.task-item');
                const id = parseInt(taskItem.dataset.id);
                this.deleteTask(id);
            });
        });

        this.updateStats();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    setupEventListeners() {
        document.getElementById('addTaskBtn').addEventListener('click', () => {
            const input = document.getElementById('taskInput');
            const deadline = document.getElementById('taskDeadline').value;
            this.addTask(input.value, deadline);
            input.value = '';
            document.getElementById('taskDeadline').value = '';
            input.focus();
        });

        document.getElementById('taskInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('addTaskBtn').click();
            }
        });

        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentFilter = btn.dataset.filter;
                this.render();
            });
        });
    }

    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                this.swRegistration = registration;
                console.log('Service Worker registered');
            } catch (error) {
                console.error('Service Worker registration failed:', error);
            }
        }
    }

    async initializePushNotifications() {
        if (!('Notification' in window)) {
            console.log('This browser does not support notifications');
            return;
        }

        const notifyBtn = document.getElementById('notifyBtn');

        if (this.swRegistration) {
            const subscription = await this.swRegistration.pushManager.getSubscription();
            this.isSubscribed = subscription !== null;
            this.updateNotifyButton();
        }

        notifyBtn.addEventListener('click', () => {
            if (this.isSubscribed) {
                this.unsubscribeFromPush();
            } else {
                this.subscribeToPush();
            }
        });
    }

    async subscribeToPush() {
        if (!('Notification' in window)) {
            alert('Ваш браузер не поддерживает уведомления');
            return;
        }

        const permission = await Notification.requestPermission();

        if (permission === 'granted') {
            try {
                const applicationServerKey = this.urlBase64ToUint8Array(
                    'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
                );

                const subscription = await this.swRegistration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: applicationServerKey
                });

                this.isSubscribed = true;
                this.updateNotifyButton();
                this.showNotification('Успех', 'Уведомления включены');
                await this.saveSubscription(subscription);
            } catch (error) {
                console.error('Failed to subscribe:', error);
                this.showNotification('Ошибка', 'Не удалось включить уведомления');
            }
        } else {
            this.showNotification('Внимание', 'Разрешите уведомления в настройках браузера');
        }
    }

    async unsubscribeFromPush() {
        try {
            const subscription = await this.swRegistration.pushManager.getSubscription();
            if (subscription) {
                await subscription.unsubscribe();
                this.isSubscribed = false;
                this.updateNotifyButton();
                this.showNotification('Уведомления отключены', 'Вы больше не будете получать уведомления');
            }
        } catch (error) {
            console.error('Failed to unsubscribe:', error);
        }
    }

    updateNotifyButton() {
        const btn = document.getElementById('notifyBtn');
        if (this.isSubscribed) {
            btn.textContent = '🔕 Отключить уведомления';
            btn.classList.add('subscribed');
        } else {
            btn.textContent = '🔔 Включить уведомления';
            btn.classList.remove('subscribed');
        }
    }

    async saveSubscription(subscription) {
        console.log('Subscription saved:', subscription);
        // Здесь можно отправить подписку на сервер
    }

    showNotification(title, body) {
        if (Notification.permission === 'granted') {
            new Notification(title, { body });
        }
    }

    async sendPushNotification(title, body) {
        if (this.isSubscribed && this.swRegistration) {
            console.log(`Push notification: ${title} - ${body}`);
            this.swRegistration.showNotification(title, {
                body: body,
                vibrate: [200, 100, 200]
            });
        }
    }

    scheduleDeadlineNotification(task) {
        const deadline = new Date(task.deadline);
        const now = new Date();
        const timeUntilDeadline = deadline - now;

        if (timeUntilDeadline > 0 && timeUntilDeadline <= 24 * 60 * 60 * 1000) {
            setTimeout(() => {
                if (!task.completed) {
                    this.sendPushNotification('⚠️ Срок задачи истекает',
                        `Задача "${task.text}" должна быть выполнена до ${deadline.toLocaleString()}`);
                }
            }, timeUntilDeadline - 5 * 60 * 1000);
        }
    }

    startDeadlineChecker() {
        setInterval(() => {
            const now = new Date();
            this.tasks.forEach(task => {
                if (task.deadline && !task.completed) {
                    const deadline = new Date(task.deadline);
                    if (deadline <= now && !task.notificationSent) {
                        this.sendPushNotification('⏰ Срок задачи истек',
                            `Задача "${task.text}" просрочена!`);
                        task.notificationSent = true;
                        this.saveTasks();
                    }
                }
            });
        }, 60000);
    }

    urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/\-/g, '+')
            .replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }
}

const app = new TaskManager();
const app = new TaskManager();
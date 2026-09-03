let currentUser = null;
let userAccounts = [];
let userTransactions = [];
let unreadNotifications = 0;

window.addEventListener('load', initializeApp);

async function initializeApp() {
    const token = localStorage.getItem('authToken');
    const userId = localStorage.getItem('userId');

    if (!token || !userId) {
        window.location.href = 'login.html';
        return;
    }

    try {
        const userResponse = await fetch(`/api/user/${userId}`, { headers: { 'Authorization': token } });
        
        if (userResponse.status === 401) throw new Error('Unauthorized');
        if (!userResponse.ok) return; // Keep session if just a network glitch
        
        currentUser = await userResponse.json();

        const accountsResponse = await fetch(`/api/accounts/${userId}`, { headers: { 'Authorization': token } });
        if (accountsResponse.ok) userAccounts = await accountsResponse.json();

        const transResponse = await fetch(`/api/transactions/${userId}`, { headers: { 'Authorization': token } });
        if (transResponse.ok) userTransactions = await transResponse.json();

        await loadNotifications();

        renderGreeting();
        renderAccounts();
        renderDashboard();
        updateNotificationBadge();
        setupEventListeners();
    } catch (error) {
        console.error('Error loading app:', error);
        if (error.message === 'Unauthorized') {
            localStorage.removeItem('authToken');
            localStorage.removeItem('userId');
            window.location.href = 'login.html';
        }
    }
}

function setupEventListeners() {
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', function() { switchTab(this.getAttribute('data-tab')); });
    });
    document.getElementById('notificationBtn').addEventListener('click', openNotifications);
    document.getElementById('profileBtn').addEventListener('click', () => window.location.href = 'profile.html');
    
    if(document.getElementById('menuBtnRight')) document.getElementById('menuBtnRight').addEventListener('click', openMenu);
    if(document.getElementById('menuBtnLeft')) document.getElementById('menuBtnLeft').addEventListener('click', openMenu);
    
    document.getElementById('headerBack').addEventListener('click', goBack);
}

async function loadNotifications() {
    try {
        const userId = localStorage.getItem('userId');
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/notifications/${userId}/unread-count`, { headers: { 'Authorization': token } });
        if (response.ok) {
            const data = await response.json();
            unreadNotifications = data.unreadCount;
        }
    } catch (error) { console.error('Error loading notifications:', error); }
}

function renderGreeting() {
    document.getElementById('greetingName').textContent = `Hello, ${currentUser.firstName}!`;
    document.getElementById('dashboardGreeting').textContent = `Hello, ${currentUser.firstName}!`;

    const statusBadge = document.getElementById('statusBadge');
    let statusText = currentUser.status.charAt(0).toUpperCase() + currentUser.status.slice(1);
    statusBadge.innerHTML = `<div class="status-badge ${currentUser.status}">${statusText}</div>`;

    if ((currentUser.status === 'suspended' || currentUser.status === 'frozen') && currentUser.adminNote) {
        document.getElementById('alertMessage').textContent = currentUser.adminNote;
        document.getElementById('userAlert').classList.add('show');
    }
}

function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach(el => el.classList.remove('active'));
    document.getElementById(tab).classList.add('active');
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    
    const headerBack = document.getElementById('headerBack');
    if (tab === 'dashboard') headerBack.classList.add('show');
    else headerBack.classList.remove('show');

    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    if (tab === 'accounts') document.getElementById('accountsNav').classList.add('active');
}

function viewAccount(accountId) {
    const account = userAccounts.find(a => a.accountId === accountId);
    if (account) {
        localStorage.setItem('selectedAccount', JSON.stringify(account));
        window.location.href = 'account-details.html';
    }
}

function openNotifications() { window.location.href = 'notifications.html'; }

// --- FIXED NAVIGATION FUNCTION ---
function openPage(page) {
    closeMenu();
    if (page === 'new-account') {
        alert('Feature coming soon');
    } else if (page === 'transfer-page') {
        window.location.href = 'transfer-page.html'; // Explicit .html extension
    } else if (page === 'transactions-page') {
        window.location.href = 'transactions.html';   // Explicit .html extension
    } else {
        // Fallback if the full filename is passed
        window.location.href = page;
    }
}

function openMenu() {
    document.getElementById('sideMenu').classList.add('active');
    document.getElementById('menuOverlay').classList.add('active');
}
function closeMenu() {
    document.getElementById('sideMenu').classList.remove('active');
    document.getElementById('menuOverlay').classList.remove('active');
}
function checkAdmin() {
    const adminToken = localStorage.getItem('adminToken');
    if (adminToken) window.location.href = 'admin.html';
    else if(confirm('Admin login required. Go to login?')) window.location.href = 'login.html';
}
function logout() {
    if(confirm('Log out?')) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userId');
        window.location.href = 'login.html';
    }
}
function goBack() { switchTab('accounts'); }

setInterval(() => { if (currentUser) initializeApp(); }, 30000);

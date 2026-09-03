let allUsers = [];
let allAccounts = [];
let selectedUser = null;

// Initialize on Load
window.addEventListener('load', initializeAdmin);

async function initializeAdmin() {
    // Check security flag or token
    const adminToken = localStorage.getItem('adminToken') || sessionStorage.getItem('adminLoggedIn');
    if (!adminToken) {
        window.location.href = 'login.html'; // Redirect if not logged in
        return;
    }
    
    // Set Admin Name
    document.getElementById('adminName').textContent = localStorage.getItem('adminName') || 'Admin';

    // Set default date for backdate transaction
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('transDate').value = now.toISOString().slice(0,16);

    await loadData();
}

async function loadData() {
    try {
        // Fetch all data in one go (assuming new API structure) OR fetch separately
        // Here we use the separate endpoints for compatibility with previous backend structure
        const usersRes = await fetch('/api/admin/users');
        const accRes = await fetch('/api/debug/accounts');

        if (usersRes.ok && accRes.ok) {
            allUsers = await usersRes.json();
            allAccounts = await accRes.json();
            
            renderUsersList(allUsers);
            updateStats();
        }
    } catch (error) { 
        console.error('Error fetching admin data:', error);
        document.getElementById('usersList').innerHTML = '<div style="text-align: center; color: #c41e3a; padding: 20px;">Error loading data</div>';
    }
}

// --- RENDER FUNCTIONS ---
function renderUsersList(users) {
    const list = document.getElementById('usersList');
    list.innerHTML = '';

    if (!users.length) { 
        list.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">No users found</div>'; 
        return; 
    }

    users.forEach(user => {
        // Find user's main account for preview
        const acc = allAccounts.find(a => a.userId === user.userId);
        const balance = acc ? `$${acc.balance.toLocaleString('en-US', {minimumFractionDigits: 2})}` : '$0.00';
        const acctNum = acc ? acc.accountNumber : 'N/A';

        let statusClass = 'status-successful';
        if(user.status === 'suspended') statusClass = 'status-suspended';
        if(user.status === 'frozen') statusClass = 'status-frozen';

        const item = document.createElement('div');
        item.className = 'user-item';
        item.innerHTML = `
            <div class="user-info">
                <div class="user-name">${user.firstName} ${user.lastName}</div>
                <div class="user-email">${user.email}</div>
                <div style="font-size:11px; color:#666; margin-top:2px;">Acct: ${acctNum} | Bal: <b style="color:#333;">${balance}</b></div>
                <span class="user-status ${statusClass}" style="margin-top:4px;">${user.status}</span>
            </div>
            <div class="user-actions">
                <button class="btn-edit" onclick="openEditModal('${user.userId}')">Manage</button>
            </div>
        `;
        list.appendChild(item);
    });
}

function updateStats() {
    const totalUsers = allUsers.length;
    const activeUsers = allUsers.filter(u => u.status === 'successful').length;
    const suspendedUsers = allUsers.filter(u => u.status !== 'successful').length;
    
    const totalBalance = allAccounts.reduce((sum, a) => sum + a.balance, 0);

    document.getElementById('totalUsers').textContent = totalUsers;
    document.getElementById('activeUsers').textContent = activeUsers;
    document.getElementById('suspendedUsers').textContent = suspendedUsers;
    document.getElementById('totalBalance').textContent = `$${totalBalance.toLocaleString('en-US', {minimumFractionDigits: 0})}`;
}

function searchUsers() {
    const term = document.getElementById('userSearch').value.toLowerCase();
    const filtered = allUsers.filter(u => 
        u.email.toLowerCase().includes(term) || 
        u.firstName.toLowerCase().includes(term) ||
        u.lastName.toLowerCase().includes(term)
    );
    renderUsersList(filtered);
}

// --- MODAL & USER MANAGEMENT ---
function openEditModal(userId) {
    const user = allUsers.find(u => u.userId === userId);
    if (!user) return;
    selectedUser = user;

    // Fill Read-only fields
    document.getElementById('viewName').value = `${user.firstName} ${user.lastName}`;
    document.getElementById('viewEmail').value = user.email;
    document.getElementById('viewSSN').value = user.ssn || 'N/A';
    document.getElementById('viewDL').value = user.driversLicense || 'N/A'; // Updated to match register.html field
    document.getElementById('viewDOB').value = user.dob || 'N/A';
    document.getElementById('viewUserId').value = user.userId;

    // Accounts display
    const userAccs = allAccounts.filter(a => a.userId === userId);
    let accHtml = '';
    userAccs.forEach(a => {
        accHtml += `
            <div style="margin-bottom: 8px; padding: 8px; background: #f9f9f9; border-radius: 4px; border-left: 3px solid #c41e3a;">
                <div style="font-weight:600; font-size:13px;">${a.accountName}</div>
                <div style="font-size:12px; color:#666;"># ${a.accountNumber}</div>
                <div style="font-weight:bold; color:#28a745; font-size:13px;">$${a.balance.toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
            </div>`;
    });
    document.getElementById('userAccountsDisplay').innerHTML = accHtml || '<p style="font-size:12px; color:#999;">No accounts found</p>';

    // Status & Notes
    document.getElementById('editUserStatus').value = user.status;
    document.getElementById('editUserNote').value = user.adminNote || '';

    // Auth Verification Logic
    const auth = user.authVerification || {};
    document.getElementById('authToggle').checked = auth.enabled === true;
    document.getElementById('authName').value = auth.authName || '';
    document.getElementById('authCode').value = auth.authCode || '';
    
    toggleAuthFields();
    document.getElementById('editUserModal').classList.add('show');
}

function closeEditModal() {
    document.getElementById('editUserModal').classList.remove('show');
    selectedUser = null;
}

function toggleAuthFields() {
    const checked = document.getElementById('authToggle').checked;
    document.getElementById('authFields').style.display = checked ? 'block' : 'none';
}

async function saveUserChanges() {
    if (!selectedUser) return;

    const authEnabled = document.getElementById('authToggle').checked;
    
    // Validate Auth
    if (authEnabled && (!document.getElementById('authName').value || !document.getElementById('authCode').value)) {
        alert('Please fill in both Auth Name and Code');
        return;
    }

    const updateData = {
        status: document.getElementById('editUserStatus').value,
        adminNote: document.getElementById('editUserNote').value,
        authVerification: {
            enabled: authEnabled,
            authName: document.getElementById('authName').value,
            authCode: document.getElementById('authCode').value
        }
    };

    try {
        const res = await fetch(`/api/admin/user/${selectedUser.userId}`, { // Using existing endpoint structure
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(updateData)
        });
        
        if(res.ok) {
            alert('User updated successfully!');
            closeEditModal();
            loadData(); 
        } else {
            alert('Error updating user');
        }
    } catch(err) { 
        console.error(err);
        alert('Connection error'); 
    }
}

// --- TRANSACTIONS ---
async function performTx(url, data, msgId) {
    const msgEl = document.getElementById(msgId);
    
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        const result = await res.json();
        
        if(res.ok || result.success) {
            msgEl.textContent = 'Transaction Successful!';
            msgEl.classList.add('show', 'success-message');
            msgEl.classList.remove('error-message');
            
            // Clear inputs based on message ID context
            if(msgId.includes('fund')) {
                document.getElementById('fundAccountNumber').value = '';
                document.getElementById('fundAmount').value = '';
                document.getElementById('fundDescription').value = '';
            } else if(msgId.includes('debit')) {
                document.getElementById('debitAccountNumber').value = '';
                document.getElementById('debitAmount').value = '';
                document.getElementById('debitNote').value = '';
            }
            
            loadData(); 
        } else {
            throw new Error(result.message || 'Transaction Failed');
        }
    } catch(err) { 
        msgEl.textContent = err.message || 'Error processing transaction';
        msgEl.classList.add('show', 'error-message');
        msgEl.classList.remove('success-message');
    }
    
    setTimeout(() => msgEl.classList.remove('show'), 4000);
}

function fundAccount() {
    const acc = document.getElementById('fundAccountNumber').value;
    const amt = document.getElementById('fundAmount').value;
    
    if(!acc || !amt) { alert('Please fill in required fields'); return; }

    performTx('/api/admin/fund-account', {
        accountNumber: acc,
        amount: parseFloat(amt),
        description: document.getElementById('fundDescription').value
    }, 'fundMsg'); // Note: ID changed in HTML to match generic message logic
}

function debitUserAccount() {
    const acc = document.getElementById('debitAccountNumber').value;
    const amt = document.getElementById('debitAmount').value;

    if(!acc || !amt) { alert('Please fill in required fields'); return; }

    performTx('/api/admin/debit-account', {
        accountNumber: acc,
        amount: parseFloat(amt),
        note: document.getElementById('debitNote').value
    }, 'debitMsg'); // Note: ID changed in HTML
}

function createCustomTransaction() {
    const acc = document.getElementById('transAccountNumber').value;
    const amt = document.getElementById('transAmount').value;

    if(!acc || !amt) { alert('Please fill in required fields'); return; }

    performTx('/api/admin/transaction', {
        accountNumber: acc,
        amount: parseFloat(amt),
        type: document.getElementById('transType').value,
        merchant: document.getElementById('transName').value,
        date: document.getElementById('transDate').value
    }, 'transMsg');
}

function logoutAdmin() { 
    if(confirm('Logout?')) {
        localStorage.removeItem('adminToken');
        sessionStorage.removeItem('adminLoggedIn');
        window.location.href = 'login.html'; 
    }
}

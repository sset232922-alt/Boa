let currentStep = 1;
let selectedMethod = '';
let transferData = {};
let currentUser = null;
let userAccounts = [];

window.addEventListener('load', initializeTransfer);

async function initializeTransfer() {
    const userId = localStorage.getItem('userId');
    const token = localStorage.getItem('authToken');

    if (!userId || !token) {
        window.location.href = 'login.html';
        return;
    }

    try {
        const userRes = await fetch(`/api/user/${userId}`, { headers: { 'Authorization': token } });
        currentUser = await userRes.json();

        const accRes = await fetch(`/api/accounts/${userId}`, { headers: { 'Authorization': token } });
        userAccounts = await accRes.json();

        const select = document.getElementById('fromAccount');
        select.innerHTML = '<option value="">Select Account...</option>';
        userAccounts.forEach(acc => {
            const opt = document.createElement('option');
            opt.value = acc.accountId;
            opt.innerText = `${acc.accountName} - $${acc.availableBalance.toFixed(2)}`;
            select.appendChild(opt);
        });
    } catch (err) { console.error(err); }
}

function selectMethod(el, method) {
    document.querySelectorAll('.payment-method').forEach(e => e.classList.remove('selected'));
    el.classList.add('selected');
    selectedMethod = method;
}

function nextStep(step) {
    if (step === 1) {
        if (!document.getElementById('fromAccount').value) return alert('Please select an account.');
        transferData.fromAccountId = document.getElementById('fromAccount').value;
    } 
    else if (step === 2) {
        if (!selectedMethod) return alert('Please select a transfer method.');
        document.querySelectorAll('[id^="fields-"]').forEach(d => d.style.display = 'none');
        document.getElementById(`fields-${selectedMethod}`).style.display = 'block';
    } 
    else if (step === 3) {
        if (!validateFields()) return;
        
        // INTERCEPT: Show appropriate receipt modal
        if (selectedMethod === 'zelle') {
            showZelleReceipt();
        } else {
            showStandardReview();
        }
        return; // Don't proceed to old step 4
    }

    // Only needed for Step 1->2 and 2->3
    document.getElementById(`section${currentStep}`).classList.remove('active');
    document.getElementById(`step${currentStep}`).classList.add('completed');
    document.getElementById(`step${currentStep}`).classList.remove('active');
    
    currentStep++;
    document.getElementById(`section${currentStep}`).classList.add('active');
    document.getElementById(`step${currentStep}`).classList.add('active');
}

function prevStep(step) {
    document.getElementById(`section${currentStep}`).classList.remove('active');
    document.getElementById(`step${currentStep}`).classList.remove('active');
    currentStep--;
    document.getElementById(`section${currentStep}`).classList.add('active');
    document.getElementById(`step${currentStep}`).classList.add('active');
    document.getElementById(`step${currentStep}`).classList.remove('completed');
}

function validateFields() {
    let isValid = true;
    transferData.method = selectedMethod; // Sync

    if (selectedMethod === 'zelle') {
        const name = document.getElementById('zelleName').value;
        const contact = document.getElementById('zelleContact').value;
        const amt = document.getElementById('zelleAmount').value;
        if(!name || !contact || !amt) isValid = false;
        
        transferData.zelleData = { name, contact, amount: parseFloat(amt) };
        transferData.amount = parseFloat(amt);
        transferData.recipientName = name;
        transferData.type = 'zelle';
    }
    else if (selectedMethod === 'mybank') {
        const name = document.getElementById('mbName').value;
        const acct = document.getElementById('mbAccount').value;
        const rout = document.getElementById('mbRouting').value;
        const amt = document.getElementById('mbAmount').value;
        if(!name || !acct || !rout || !amt) isValid = false;
        
        transferData.recipientName = name;
        transferData.bankName = "Bank of America";
        transferData.accountNumber = acct;
        transferData.routing = rout;
        transferData.amount = parseFloat(amt);
        transferData.type = 'internal';
    }
    else if (selectedMethod === 'otherbank' || selectedMethod === 'wire') {
        const name = document.getElementById(selectedMethod === 'wire' ? 'wireName' : 'obName').value;
        const bank = document.getElementById(selectedMethod === 'wire' ? 'wireBankName' : 'obBank').value;
        const acct = document.getElementById(selectedMethod === 'wire' ? 'wireAccount' : 'obAccount').value;
        const amt = document.getElementById(selectedMethod === 'wire' ? 'wireAmount' : 'obAmount').value;
        
        if(!name || !bank || !acct || !amt) isValid = false;
        
        transferData.recipientName = name;
        transferData.bankName = bank;
        transferData.accountNumber = acct;
        transferData.amount = parseFloat(amt);
        transferData.type = 'transfer';
        
        if(selectedMethod === 'wire') {
            transferData.swift = document.getElementById('wireSwift').value;
            transferData.address = document.getElementById('wireAddress').value;
        }
    }

    if (!isValid) alert('Please fill in all required fields.');
    transferData.description = document.getElementById('transferNote').value;
    return isValid;
}

// --- ZELLE RECEIPT ---
function showZelleReceipt() {
    const data = transferData.zelleData;
    document.getElementById('zelleAvatar').textContent = data.name.charAt(0).toUpperCase();
    document.getElementById('zelleReceiptAmount').textContent = `$${data.amount.toFixed(2)}`;
    document.getElementById('zelleReceiptName').textContent = data.name;
    document.getElementById('zelleReceiptPhone').textContent = data.contact;
    document.getElementById('zelleReceiptEnrolled').textContent = `Enrolled as ${data.name}`;
    document.getElementById('zelleReceiptModal').classList.add('show');
}
function closeZelleReceipt() { document.getElementById('zelleReceiptModal').classList.remove('show'); }

// --- STANDARD REVIEW RECEIPT ---
function showStandardReview() {
    const fromAcc = userAccounts.find(a => a.accountId == transferData.fromAccountId);
    const fromName = fromAcc ? `${fromAcc.accountName} (...${fromAcc.accountNumber.slice(-4)})` : 'Selected Account';
    
    document.getElementById('stdReviewAmount').textContent = `$${transferData.amount.toFixed(2)}`;
    
    // Set Icon & Title
    const iconMap = { 'mybank': '🏦', 'otherbank': '🏛️', 'wire': '📡' };
    const titleMap = { 'mybank': 'Internal Transfer', 'otherbank': 'External Transfer', 'wire': 'Wire Transfer' };
    document.getElementById('stdReviewIcon').textContent = iconMap[selectedMethod];
    document.getElementById('stdReviewTitle').textContent = titleMap[selectedMethod];

    // Build Details Rows
    let html = `
        <div class="std-receipt-row"><span class="std-receipt-label">From Account</span><span class="std-receipt-value">${fromName}</span></div>
        <div class="std-receipt-row"><span class="std-receipt-label">Recipient</span><span class="std-receipt-value">${transferData.recipientName}</span></div>
        <div class="std-receipt-row"><span class="std-receipt-label">Bank</span><span class="std-receipt-value">${transferData.bankName}</span></div>
        <div class="std-receipt-row"><span class="std-receipt-label">Account No.</span><span class="std-receipt-value">${transferData.accountNumber}</span></div>
    `;

    if(selectedMethod === 'wire') {
        html += `<div class="std-receipt-row"><span class="std-receipt-label">SWIFT</span><span class="std-receipt-value">${transferData.swift}</span></div>`;
    }
    
    html += `<div class="std-receipt-row"><span class="std-receipt-label">Date</span><span class="std-receipt-value">${new Date().toLocaleDateString()}</span></div>`;

    document.getElementById('stdReviewDetails').innerHTML = html;
    document.getElementById('standardReviewModal').classList.add('show');
}
function closeStandardReview() { document.getElementById('standardReviewModal').classList.remove('show'); }

// --- CONFIRM & SEND ---
function confirmTransfer() {
    // 1. Status Check
    if (currentUser.status === 'frozen' || currentUser.status === 'suspended') {
        document.getElementById('restrictionText').innerText = `Account ${currentUser.status}, contact live chat support.`;
        document.getElementById('restrictionModal').classList.add('show');
        return;
    }
    // 2. Auth Check
    if (currentUser.authVerification && currentUser.authVerification.enabled) {
        document.getElementById('authDesc').textContent = `Enter ${currentUser.authVerification.authName} to confirm.`;
        document.getElementById('authModal').classList.add('show');
    } else {
        processTransaction();
    }
}

async function verifyAuth() {
    const input = document.getElementById('authCodeInput').value;
    if (input === currentUser.authVerification.authCode) {
        document.getElementById('authModal').classList.remove('show');
        processTransaction();
    } else {
        alert('Invalid Code');
    }
}

async function processTransaction() {
    try {
        const payload = {
            fromAccountId: transferData.fromAccountId,
            toAccountNumber: transferData.type === 'internal' ? transferData.accountNumber : null,
            amount: parseFloat(transferData.amount),
            type: transferData.type,
            recipientName: transferData.recipientName,
            description: transferData.description || `${selectedMethod.toUpperCase()} Transfer`
        };

        const response = await fetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': localStorage.getItem('authToken') },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok) {
            closeZelleReceipt();
            closeStandardReview();
            document.getElementById('successModal').classList.add('show');
        } else {
            alert('Transfer Failed: ' + (data.message || 'Unknown error'));
        }
    } catch (error) {
        console.error(error);
        alert('Connection Error');
    }
}

function closeModal(id) { document.getElementById(id).classList.remove('show'); }

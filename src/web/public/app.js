// State
let currentUser = null;
let clients = [];
let setupStatuses = [];

// DOM Elements
const runBtn = document.getElementById('run-btn');
const statusText = document.getElementById('status-text');
const addClientBtn = document.getElementById('add-client-btn');
const clientsContainer = document.getElementById('clients-container');
const logoutBtn = document.getElementById('logout-btn');
const userNameEl = document.getElementById('user-name');

// Initialize
async function init() {
    // Check auth
    const authRes = await fetch('/api/auth/me');
    const authData = await authRes.json();
    
    if (!authData.user) {
        window.location.href = '/login';
        return;
    }
    
    currentUser = authData.user;
    userNameEl.textContent = currentUser.name || currentUser.email;
    
    await loadClients();
    await loadSetupStatus();
    await loadOptions();
    
    startPolling();
}

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(`${btn.dataset.tab}-tab`).classList.add('active');
    });
});

// Logout
logoutBtn.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
});

// Load clients
async function loadClients() {
    try {
        const res = await fetch('/api/clients');
        const data = await res.json();
        clients = data.clients || [];
        renderClients();
    } catch (e) {
        console.error('Error loading clients:', e);
    }
}

// Render clients
function renderClients() {
    clientsContainer.innerHTML = '';
    clients.forEach(client => addClientCard(client));
}

// Add client card
function addClientCard(client = null) {
    const template = document.getElementById('client-template');
    const card = template.content.cloneNode(true);
    const cardEl = card.querySelector('.client-card');
    
    if (client) {
        cardEl.dataset.id = client.id;
        card.querySelector('.client-name-display').textContent = client.name || '新規クライアント';
        card.querySelector('.client-name').value = client.name || '';
        card.querySelector('.client-url').value = client.exporterUrl || '';
        card.querySelector('.client-preset').value = client.presetName || '';
        card.querySelector('.client-sheet-id').value = client.sheetId || '';
        card.querySelector('.client-sheet-name').value = client.sheetName || '';
        card.querySelector('.client-email').value = client.email || '';
        card.querySelector('.client-password').value = client.password || '';
        
        if (client.isSetup) {
            cardEl.classList.add('setup-done');
        }
    } else {
        card.querySelector('.client-name-display').textContent = '新規クライアント';
    }
    
    // Name change handler
    card.querySelector('.client-name').addEventListener('input', function() {
        cardEl.querySelector('.client-name-display').textContent = this.value || '新規クライアント';
    });
    
    // Setup button
    card.querySelector('.btn-setup').addEventListener('click', () => {
        const id = cardEl.dataset.id;
        if (id) runSetup(id);
        else showMessage('先に保存してください', 'error');
    });
    
    // Save button
    card.querySelector('.btn-save').addEventListener('click', () => saveClient(cardEl));
    
    // Remove button
    card.querySelector('.btn-remove').addEventListener('click', () => deleteClientCard(cardEl));
    
    clientsContainer.appendChild(card);
    updateSetupUI();
}

// Save client
async function saveClient(cardEl) {
    const id = cardEl.dataset.id;
    const data = {
        name: cardEl.querySelector('.client-name').value,
        exporterUrl: cardEl.querySelector('.client-url').value,
        presetName: cardEl.querySelector('.client-preset').value,
        sheetId: cardEl.querySelector('.client-sheet-id').value,
        sheetName: cardEl.querySelector('.client-sheet-name').value,
        email: cardEl.querySelector('.client-email').value,
        password: cardEl.querySelector('.client-password').value
    };
    
    try {
        let res;
        if (id) {
            res = await fetch(`/api/clients/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } else {
            res = await fetch('/api/clients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            if (res.ok) {
                const result = await res.json();
                cardEl.dataset.id = result.client.id;
            }
        }
        
        if (res.ok) {
            showMessage('保存しました', 'success');
            await loadClients();
        } else {
            showMessage('保存に失敗しました', 'error');
        }
    } catch (e) {
        showMessage('エラーが発生しました', 'error');
    }
}

// Delete client
async function deleteClientCard(cardEl) {
    const id = cardEl.dataset.id;
    
    if (!id) {
        cardEl.remove();
        return;
    }
    
    if (!confirm('このクライアントを削除しますか？')) return;
    
    try {
        await fetch(`/api/clients/${id}`, { method: 'DELETE' });
        cardEl.remove();
        showMessage('削除しました', 'success');
    } catch (e) {
        showMessage('削除に失敗しました', 'error');
    }
}

// Add client button
addClientBtn.addEventListener('click', () => addClientCard());

// Setup status
async function loadSetupStatus() {
    try {
        const res = await fetch('/api/setup/status');
        const data = await res.json();
        setupStatuses = data.statuses || [];
        updateSetupUI();
    } catch (e) {
        console.error('Error loading setup status:', e);
    }
}

function updateSetupUI() {
    document.querySelectorAll('.client-card').forEach(card => {
        const id = card.dataset.id;
        const status = setupStatuses.find(s => s.id === id);
        
        const badge = card.querySelector('.setup-badge');
        const btn = card.querySelector('.btn-setup');
        
        if (!status) {
            badge.textContent = '未保存';
            badge.className = 'setup-badge none';
            return;
        }
        
        if (status.isRunning) {
            badge.textContent = 'セットアップ中...';
            badge.className = 'setup-badge running';
            btn.disabled = true;
        } else if (status.isSetup) {
            badge.textContent = '✓ 設定済み';
            badge.className = 'setup-badge done';
            btn.disabled = false;
            btn.textContent = '再セットアップ';
            card.classList.add('setup-done');
        } else {
            badge.textContent = '未設定';
            badge.className = 'setup-badge none';
            btn.disabled = false;
            btn.textContent = 'セットアップ';
        }
    });
}

// Run setup
async function runSetup(clientId) {
    try {
        const res = await fetch(`/api/setup/${clientId}`, { method: 'POST' });
        const data = await res.json();
        
        if (res.ok) {
            showMessage(data.message + ' ブラウザでログインしてください。', 'success');
            await loadSetupStatus();
        } else {
            showMessage(data.error, 'error');
        }
    } catch (e) {
        showMessage('セットアップ開始に失敗しました', 'error');
    }
}

// Options
async function loadOptions() {
    try {
        const res = await fetch('/api/options');
        const options = await res.json();
        
        document.getElementById('timeout').value = options.timeout;
        document.getElementById('retryCount').value = options.retryCount;
        document.getElementById('retryDelay').value = options.retryDelay;
        document.getElementById('headless').checked = options.headless;
        document.getElementById('screenshotOnError').checked = options.screenshotOnError;
        document.getElementById('cleanupDownloads').checked = options.cleanupDownloads;
    } catch (e) {
        console.error('Error loading options:', e);
    }
}

document.getElementById('save-options-btn').addEventListener('click', async () => {
    const options = {
        timeout: parseInt(document.getElementById('timeout').value),
        retryCount: parseInt(document.getElementById('retryCount').value),
        retryDelay: parseInt(document.getElementById('retryDelay').value),
        headless: document.getElementById('headless').checked,
        screenshotOnError: document.getElementById('screenshotOnError').checked,
        cleanupDownloads: document.getElementById('cleanupDownloads').checked
    };
    
    try {
        const res = await fetch('/api/options', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options)
        });
        
        if (res.ok) showMessage('オプションを保存しました', 'success');
        else showMessage('保存に失敗しました', 'error');
    } catch (e) {
        showMessage('エラーが発生しました', 'error');
    }
});

// Copy email function
window.copyEmail = function() {
    const email = document.getElementById('service-email').textContent;
    navigator.clipboard.writeText(email).then(() => {
        showMessage('メールアドレスをコピーしました', 'success');
    }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = email;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showMessage('メールアドレスをコピーしました', 'success');
    });
}

// Run automation
runBtn.addEventListener('click', async () => {
    try {
        const res = await fetch('/api/run', { method: 'POST' });
        const data = await res.json();
        
        if (res.ok) {
            showMessage('自動化を開始しました', 'success');
        } else {
            showMessage(data.error, 'error');
        }
    } catch (e) {
        showMessage('実行に失敗しました', 'error');
    }
});

// Status polling
let allLogs = [];

function startPolling() {
    setInterval(async () => {
        try {
            const res = await fetch('/api/status');
            const data = await res.json();
            
            if (data.isRunning) {
                statusText.textContent = '実行中...';
                statusText.className = 'status-running';
                runBtn.disabled = true;
            } else {
                statusText.textContent = '待機中';
                statusText.className = 'status-idle';
                runBtn.disabled = false;
            }
            
            // Update logs
            if (data.logs && data.logs.length > 0) {
                allLogs = data.logs;
                updateLogsUI();
            }
        } catch (e) {}
        
        await loadSetupStatus();
    }, 2000); // 2秒ごと
}

function updateLogsUI() {
    const logsContent = document.getElementById('logs-content');
    if (allLogs.length === 0) {
        logsContent.innerHTML = '<span class="log-empty">ログはありません</span>';
        return;
    }
    
    const html = allLogs.map(l => {
        const time = new Date(l.time).toLocaleTimeString('ja-JP');
        const levelClass = l.level === 'error' ? 'log-error' : 'log-info';
        return `<div class="log-line ${levelClass}"><span class="log-time">${time}</span> ${escapeHtml(l.message)}</div>`;
    }).join('');
    
    logsContent.innerHTML = html;
    logsContent.scrollTop = logsContent.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Clear logs
document.getElementById('clear-logs-btn').addEventListener('click', () => {
    allLogs = [];
    updateLogsUI();
});

// Show message
function showMessage(text, type) {
    const existing = document.querySelector('.message');
    if (existing) existing.remove();
    
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.textContent = text;
    
    const main = document.querySelector('main');
    main.insertBefore(message, main.firstChild);
    
    setTimeout(() => message.remove(), 5000);
}

// Init
document.addEventListener('DOMContentLoaded', init);

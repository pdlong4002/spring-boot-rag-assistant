'use strict';

/* ═══════════════════════════════════════════════════════
   SESSION STORAGE (server-backed)
   Previously used localStorage metadata only. Now load sessions
   from the backend /api/sessions and treat the server as source
   of truth. Keep small local fallback when there are no sessions.
   ═══════════════════════════════════════════════════════ */
let sessions = []; // server-provided list: {id, title, messageCount, ...}

async function loadSessionsFromServer() {
    try {
        const res = await fetch('/api/sessions');
        if (!res.ok) throw new Error('Failed to load sessions');
        const data = await res.json();
        sessions = data || [];
        // if current session exists in server list, update its title
        if (currentSession) {
            const found = sessions.find(s => s.id === currentSession.id);
            if (found) {
                currentSession.title = found.title || currentSession.title;
            }
        }
    } catch (e) {
        // fallback: keep existing sessions array (can be empty)
        console.warn('Could not load sessions from server:', e);
        sessions = sessions || [];
    }
}

function createLocalSession() {
    const s = {
        id: crypto.randomUUID(),
        title: 'New Conversation',
        createdAt: new Date().toISOString()
    };
    sessions.unshift(s);
    return s;
}

/* ═══════════════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════════════ */
let currentSession = null;
let isSending = false;

/* ═══════════════════════════════════════════════════════
   DOM REFERENCES
   ═══════════════════════════════════════════════════════ */
const messagesEl    = document.getElementById('messages');
const messageInput  = document.getElementById('messageInput');
const sendBtn       = document.getElementById('sendBtn');
const convListEl    = document.getElementById('convList');
const dropZone      = document.getElementById('dropZone');
const fileInput     = document.getElementById('fileInput');
const progressWrap  = document.getElementById('progressBarWrap');
const progressFill  = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');
const fileListEl    = document.getElementById('fileList');
const uploadTrigger = document.getElementById('uploadTrigger');

// Note: header rename UI removed — sidebar provides rename/delete actions

/* ═══════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════ */
async function init() {
    // Load sessions for the sidebar but do not auto-open an existing session — start a fresh chat like ChatGPT
    await loadSessionsFromServer();

    // Start with a new conversation view
    currentSession = createLocalSession();
    renderSidebar();
    clearMessages();
    showWelcomeCard();
    messageInput.focus();

    // header rename removed — sidebar action menu handles renames
}

/* ═══════════════════════════════════════════════════════
   SIDEBAR
   ═══════════════════════════════════════════════════════ */
function relativeGroup(isoStr) {
    const now   = new Date();
    const d     = new Date(isoStr);
    const diffD = Math.floor((now - d) / 86400000);
    if (diffD === 0) return 'Today';
    if (diffD === 1) return 'Yesterday';
    if (diffD <= 7) return 'Previous 7 Days';
    return 'Older';
}

function renderSidebar() {
    if (!sessions || sessions.length === 0) {
        convListEl.innerHTML = `
            <div class="conv-empty">
                No conversations yet.<br>
                Hit <strong>New</strong> to start one.
            </div>`;
        return;
    }

    const groupOrder = ['Today', 'Yesterday', 'Previous 7 Days', 'Older'];
    const groups = {};
    sessions.forEach(s => {
        // ensure createdAt exists for grouping; fallback to now
        const created = s.createdAt || new Date().toISOString();
        const g = relativeGroup(created);
        (groups[g] = groups[g] || []).push(s);
    });

    let html = '';
    groupOrder.forEach(label => {
        if (!groups[label]) return;
        html += `<div class="conv-group-label">${label}</div>`;
        groups[label].forEach(s => {
            const active = currentSession && s.id === currentSession.id ? 'active' : '';
            const title = escapeHtml(s.title || 'New Conversation');
            html += `
            <div class="conv-item ${active}" data-session-id="${s.id}" onclick="switchSession('${s.id}')">
                <svg class="conv-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <span class="conv-title">${title}</span>
                <button class="conv-actions-btn" aria-label="Actions" title="Actions">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="5" cy="12" r="1.5"></circle>
                        <circle cx="12" cy="12" r="1.5"></circle>
                        <circle cx="19" cy="12" r="1.5"></circle>
                    </svg>
                </button>
                <div class="conv-actions-menu" data-session-id="${s.id}">
                    <button class="conv-action-rename">Rename</button>
                    <button class="conv-action-delete">Delete</button>
                </div>
            </div>`;
        });
    });
    convListEl.innerHTML = html;

    // Wire up action menus and rename flow for sidebar items
    document.querySelectorAll('.conv-item').forEach(item => {
        const sessionId = item.getAttribute('data-session-id');
        const actionsBtn = item.querySelector('.conv-actions-btn');
        const menu = item.querySelector('.conv-actions-menu');
        const titleEl = item.querySelector('.conv-title');

        // stop item click when interacting with actions
        if (actionsBtn) {
            actionsBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                // toggle menu
                document.querySelectorAll('.conv-actions-menu.show').forEach(m => { if (m !== menu) m.classList.remove('show'); });
                menu.classList.toggle('show');
            });
        }

        // close menu when clicking outside
        document.addEventListener('click', (ev) => {
            if (!item.contains(ev.target)) menu.classList.remove('show');
        });

        // delete action (reuse existing deleteConv)
        const delBtn = item.querySelector('.conv-action-delete');
        if (delBtn) {
            delBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                menu.classList.remove('show');
                deleteConv(sessionId);
            });
        }

        // rename action: inline edit
        const renBtn = item.querySelector('.conv-action-rename');
        if (renBtn) {
            renBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                menu.classList.remove('show');
                // replace title with inline editor
                const currentTitle = titleEl.textContent;
                const input = document.createElement('input');
                input.className = 'conv-rename-input';
                input.value = currentTitle;
                const actionsWrap = document.createElement('span');
                actionsWrap.className = 'conv-rename-actions';
                const saveBtn = document.createElement('button');
                saveBtn.className = 'save';
                saveBtn.textContent = 'Save';
                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'cancel';
                cancelBtn.textContent = 'Cancel';
                actionsWrap.appendChild(saveBtn);
                actionsWrap.appendChild(cancelBtn);

                // hide original title and insert editor
                titleEl.style.display = 'none';
                item.insertBefore(input, actionsBtn);
                item.insertBefore(actionsWrap, actionsBtn);
                input.focus();

                const cleanup = () => {
                    input.remove();
                    actionsWrap.remove();
                    titleEl.style.display = '';
                };

                cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); cleanup(); });

                saveBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const newTitle = input.value.trim() || 'New Conversation';
                    // optimistic update locally
                    const idx = sessions.findIndex(x => x.id === sessionId);
                    if (idx >= 0) sessions[idx].title = newTitle;
                    if (currentSession && currentSession.id === sessionId) {
                        currentSession.title = newTitle;
                    }
                    // try server rename
                    try {
                        const res = await fetch(`/api/sessions/${sessionId}/rename`, {
                            method: 'PUT', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ title: newTitle })
                        });
                        if (!res.ok) throw new Error('rename failed');
                        const data = await res.json();
                        // update with server value if provided
                        const finalTitle = data.title || newTitle;
                        if (idx >= 0) sessions[idx].title = finalTitle;
                        if (currentSession && currentSession.id === sessionId) {
                            currentSession.title = finalTitle;
                        }
                        showToast('Conversation renamed', 'success');
                    } catch (err) {
                        showToast('Rename saved locally', 'default');
                    } finally {
                        renderSidebar();
                    }
                });
            });
        }
    });
}

/* ═══════════════════════════════════════════════════════
   KNOWLEDGE BASE TOGGLE
   ═══════════════════════════════════════════════════════ */
function toggleKnowledge(btn) {
    btn.classList.toggle('open');
    document.getElementById('knowledgeBody').classList.toggle('open');
}

/* ═══════════════════════════════════════════════════════
   CONVERSATION SWITCHING
   ═══════════════════════════════════════════════════════ */
async function switchSession(id) {
    if (currentSession && currentSession.id === id) return;
    const s = sessions.find(x => x.id === id);
    if (!s) {
        // try reloading sessions from server
        await loadSessionsFromServer();
        const found = sessions.find(x => x.id === id);
        if (!found) return;
        currentSession = found;
    } else {
        currentSession = s;
    }
    renderSidebar();
    clearMessages();
    // update header title when switching
    await loadSessionMessages(id);
}

async function loadSessionMessages(sessionId) {
    try {
        const res  = await fetch(`/api/sessions/${sessionId}/messages`);
        const data = await res.json();
        const msgs = data.messages || [];
        if (msgs.length > 0) {
            msgs.forEach(m => {
                const role = (m.role || '').toLowerCase() === 'user' ? 'user' : 'bot';
                appendMessage(role, m.content, false);
            });
            messagesEl.scrollTop = messagesEl.scrollHeight;
            // typeset any LaTeX in the newly added messages
            if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise();
        } else {
            showWelcomeCard();
        }
    } catch {
        showWelcomeCard();
    }
}

async function newChat() {
    // Request backend to clear current session and get a fresh session id
    try {
        const res = await fetch('/api/chat/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: currentSession ? currentSession.id : null })
        });
        const data = await res.json();
        const newId = data.sessionId || crypto.randomUUID();
        // insert locally so UI shows it immediately
        currentSession = { id: newId, title: 'New Conversation', createdAt: new Date().toISOString() };
        sessions.unshift(currentSession);
        renderSidebar();
        clearMessages();
        showWelcomeCard();
        messageInput.focus();
    } catch (e) {
        // fallback to purely local new session
        currentSession = createLocalSession();
        renderSidebar();
        clearMessages();
        showWelcomeCard();
        messageInput.focus();
    }
}

async function deleteConv(id) {
    // Show a centered confirmation modal instead of browser confirm()
    const performDelete = async () => {
        try { await fetch(`/api/sessions/${id}`, { method: 'DELETE' }); } catch { /* ok */ }

        // Refresh sessions from server
        await loadSessionsFromServer();

        // Update local sessions array and currentSession
        sessions = sessions.filter(s => s.id !== id);

        if (currentSession && currentSession.id === id) {
            if (sessions.length > 0) {
                currentSession = sessions[0];
                renderSidebar();
                clearMessages();
                await loadSessionMessages(currentSession.id);
            } else {
                currentSession = createLocalSession();
                renderSidebar();
                clearMessages();
                showWelcomeCard();
            }
        } else {
            renderSidebar();
        }
    };

    showConfirmModal('Delete conversation', 'Are you sure you want to delete this conversation? This action cannot be undone.', async () => {
        await performDelete();
        showToast('Conversation deleted', 'success');
    });
}

// Helper: show a centered confirmation modal with Cancel / Delete
function showConfirmModal(title, message, onConfirm) {
    // avoid duplicate modal
    if (document.querySelector('.confirm-modal-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'confirm-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'confirm-modal';
    modal.innerHTML = `
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
        <div class="actions">
            <button class="btn cancel">Cancel</button>
            <button class="btn danger">Delete</button>
        </div>`;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const btnCancel = modal.querySelector('.btn.cancel');
    const btnDelete = modal.querySelector('.btn.danger');

    const cleanup = () => {
        document.removeEventListener('keydown', onKey);
        overlay.remove();
    };

    const onKey = (e) => { if (e.key === 'Escape') cleanup(); };
    document.addEventListener('keydown', onKey);

    // click outside closes
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) cleanup(); });

    btnCancel.addEventListener('click', (e) => { e.stopPropagation(); cleanup(); });

    btnDelete.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
            btnDelete.disabled = true; btnCancel.disabled = true;
            await onConfirm();
        } finally { cleanup(); }
    });
}

/* ═══════════════════════════════════════════════════════
   MESSAGES
   ═══════════════════════════════════════════════════════ */
function clearMessages() {
    messagesEl.innerHTML = '';
}

function showWelcomeCard() {
    const titleText = (currentSession && currentSession.title) ? escapeHtml(currentSession.title) : 'New Conversation';
    messagesEl.innerHTML = `
    <div class="welcome-card">
        <div class="welcome-header">
            <div class="welcome-title-row">
                <h1 class="welcome-title">${titleText}</h1>
            </div>
        </div>
        <p class="welcome-sub">
            We remember your conversations across sessions — tell us your name, upload documents, and ask anything.<br>
            Your chat history is stored securely in <strong>MySQL</strong> and persists across restarts.
        </p>
        <div class="welcome-chips">
            <button class="chip" onclick="fillInput(this)">Summarize the document</button>
            <button class="chip" onclick="fillInput(this)">What are the key points?</button>
            <button class="chip" onclick="fillInput(this)">My name is...</button>
            <button class="chip" onclick="fillInput(this)">List all topics covered</button>
        </div>
    </div>`;
}

function fillInput(el) {
    const card = messagesEl.querySelector('.welcome-card');
    if (card) card.remove();
    messageInput.value = el.textContent;
    messageInput.focus();
    messageInput.dispatchEvent(new Event('input'));
}

function removeWelcomeCard() {
    const c = messagesEl.querySelector('.welcome-card');
    if (c) c.remove();
}

function appendMessage(role, text, scroll = true) {
    removeWelcomeCard();
    const isUser = role === 'user';
    const div = document.createElement('div');
    div.className = `message message-${isUser ? 'user' : 'bot'}`;
    div.innerHTML = `
        <div class="avatar ${isUser ? 'user-avatar' : 'bot-avatar'}">${isUser ? 'You' : 'AI'}</div>
        <div class="message-content">${formatMarkdown(text)}</div>`;
    messagesEl.appendChild(div);
    if (scroll) messagesEl.scrollTop = messagesEl.scrollHeight;

    // Syntax highlight any code blocks we just inserted
    if (window.hljs && hljs.highlightElement) {
        try {
            div.querySelectorAll('pre code').forEach(el => {
                try { hljs.highlightElement(el); } catch(e) { /* ignore */ }
            });
        } catch(e) { /* ignore */ }
    }

    // Add toolbar + expand/copy behavior to code blocks (allow vertical and horizontal resize/expand)
    try {
        div.querySelectorAll('pre code').forEach(codeEl => {
            if (codeEl.dataset.processed) return;
            codeEl.dataset.processed = '1';

            const pre = codeEl.closest('pre');
            // make pre resizable and scrollable
            pre.style.overflow = 'auto';
            pre.style.resize = 'both';
            pre.style.maxHeight = '60vh';

            // wrap pre in container to position toolbar
            const wrap = document.createElement('div');
            wrap.className = 'code-wrap';
            pre.parentNode.replaceChild(wrap, pre);
            wrap.appendChild(pre);

            // toolbar
            const toolbar = document.createElement('div');
            toolbar.className = 'code-toolbar';

            // Copy button placed in toolbar (icon + label on hover)
            const btnCopy = document.createElement('button');
            btnCopy.type = 'button';
            btnCopy.className = 'code-btn code-copy-btn';
            btnCopy.setAttribute('aria-label', 'Copy code');
            btnCopy.setAttribute('data-tooltip', 'Copy');
            btnCopy.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" style="vertical-align:middle"><rect x="9" y="9" width="10" height="10" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';

            // Expand/Collapse button (small, top-right)
            const btnExpand = document.createElement('button');
            btnExpand.type = 'button';
            btnExpand.className = 'code-btn code-expand';
            btnExpand.setAttribute('aria-label', 'Expand code');
            btnExpand.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" style="vertical-align:middle"><polyline points="9 14 9 21 16 21"></polyline><polyline points="15 9 15 3 8 3"></polyline><polyline points="21 9 21 16 16 16"></polyline><polyline points="3 15 3 8 8 8"></polyline></svg>';

            toolbar.appendChild(btnCopy);
            toolbar.appendChild(btnExpand);
            wrap.appendChild(toolbar);

            // helper to open/close expanded state and manage body scroll
            const openExpanded = () => {
                wrap.classList.add('expanded');
                document.body.style.overflow = 'hidden';
                // ensure pre takes full space
                pre.style.height = '100%';
                pre.style.maxHeight = 'none';
                // listen for esc to close
                const onKey = (e) => { if (e.key === 'Escape') closeExpanded(); };
                document.addEventListener('keydown', onKey);
                wrap._onKey = onKey;
            };
            const closeExpanded = () => {
                wrap.classList.remove('expanded');
                document.body.style.overflow = '';
                pre.style.height = 'auto';
                pre.style.maxHeight = '60vh';
                if (wrap._onKey) document.removeEventListener('keydown', wrap._onKey);
            };

            // click outside (on overlay background) closes when expanded
            wrap.addEventListener('click', (ev) => {
                if (wrap.classList.contains('expanded') && ev.target === wrap) {
                    closeExpanded();
                }
            });

            // expand toggle
            btnExpand.addEventListener('click', () => {
                if (wrap.classList.contains('expanded')) closeExpanded(); else openExpanded();
            });

            // copy button behavior (with tooltip feedback)
            btnCopy.addEventListener('click', async () => {
                const showCopied = () => {
                    btnCopy.classList.add('copied');
                    btnCopy.setAttribute('data-tooltip', 'Copied');
                    setTimeout(() => { btnCopy.classList.remove('copied'); btnCopy.setAttribute('data-tooltip', 'Copy'); }, 1400);
                };
                try {
                    await navigator.clipboard.writeText(codeEl.textContent);
                    showCopied();
                    showToast('Code copied', 'success');
                } catch (e) {
                    try {
                        const ta = document.createElement('textarea');
                        ta.value = codeEl.textContent;
                        ta.style.position = 'absolute';
                        ta.style.left = '-9999px';
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand('copy');
                        ta.remove();
                        showCopied();
                        showToast('Code copied', 'success');
                    } catch (err) {
                        showToast('Copy failed', 'error');
                    }
                }
            });

            // Auto-expand removed: code blocks should only expand when user clicks the expand button
        });
    } catch (e) { /* ignore */ }

    // Render LaTeX (MathJax) for dynamic content
    if (window.MathJax && MathJax.typesetPromise) {
        try { MathJax.typesetPromise([div]); }
        catch (e) { /* ignore MathJax errors */ }
    }
}

function showTyping() {
    removeWelcomeCard();
    const div = document.createElement('div');
    div.id = 'typing';
    div.className = 'message message-bot';
    div.innerHTML = `
        <div class="avatar bot-avatar">AI</div>
        <div class="message-content"><div class="dots">
            <span></span><span></span><span></span>
        </div></div>`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function removeTyping() {
    const t = document.getElementById('typing');
    if (t) t.remove();
}

/* ═══════════════════════════════════════════════════════
   MARKDOWN FORMATTER
   ═══════════════════════════════════════════════════════ */
function formatMarkdown(text) {
    // 1) Extract fenced code blocks and replace with placeholders
    const codeBlocks = [];
    const placeholder = (i) => `@@CODE_BLOCK_${i}@@`;
    text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
        const idx = codeBlocks.length;
        codeBlocks.push({ lang: lang || '', code: code });
        return placeholder(idx);
    });

    // 2) Escape the rest of the text
    let s = escapeHtml(text);

    // 3) Inline code (keep as HTML <code>)
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // 4) Bold & italic
    s = s.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // 5) Headers
    s = s.replace(/^### (.*)/gm, '<h3>$1</h3>');
    s = s.replace(/^## (.*)/gm,  '<h2>$1</h2>');
    s = s.replace(/^# (.*)/gm,   '<h1>$1</h1>');

    // 6) Blockquote
    s = s.replace(/^&gt; (.*)/gm, '<blockquote>$1</blockquote>');

    // 7) Bullet lists
    s = s.replace(/^[-*] (.*)/gm, '<li>$1</li>');
    s = s.replace(/(<li>.*?<\/li>)(\n<li>)/gs, '$1$2');
    s = s.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');

    // 8) Paragraphs and remaining newlines: convert double newlines to paragraph breaks, single newlines to <br>
    s = s.replace(/\n\n+/g, '</p><p>');
    s = s.replace(/\n/g, '<br>');

    // 9) Wrap in paragraph if not starting with block element
    if (!s.match(/^<(h[1-6]|ul|ol|pre|blockquote)/)) {
        s = '<p>' + s + '</p>';
    }

    // 10) Restore code blocks placeholders with properly escaped content (preserve newlines inside <pre>)
    codeBlocks.forEach((cb, i) => {
        // normalize newlines and attempt to fix adjacent includes that got concatenated
        let raw = cb.code.replace(/\r\n/g, '\n');
        // Insert newline between adjacent #include occurrences if they were concatenated
        raw = raw.replace(/(#include\s*(?:<[^>]+>|"[^"]+")?)(?=#include)/g, '$1\n');
        // Ensure comments are intact (no trimming) - keep raw as-is
        const safeCode = escapeHtml(raw);
        const langClass = cb.lang ? ` class="language-${cb.lang}"` : '';
        s = s.replace(placeholder(i), `<pre><code${langClass}>${safeCode}</code></pre>`);
    });

    return s;
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* ═══════════════════════════════════════════════════════
   SEND MESSAGE
   ═══════════════════════════════════════════════════════ */
async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || isSending) return;

    if (!currentSession) {
        currentSession = createLocalSession();
        renderSidebar();
    }

    isSending = true;
    appendMessage('user', text);
    messageInput.value = '';
    messageInput.style.height = 'auto';
    sendBtn.disabled = true;
    showTyping();

    try {
        const res  = await fetch('/api/chat', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ message: text, sessionId: currentSession.id })
        });
        const data = await res.json();
        removeTyping();

        if (res.ok) {
            appendMessage('bot', data.response);
            // Ensure LaTeX in bot response renders
            if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise();

            // After saving message on server, refresh sessions so titles/counts update
            await loadSessionsFromServer();
            const updated = sessions.find(s => s.id === currentSession.id);
            if (updated) currentSession.title = updated.title || currentSession.title;
            renderSidebar();
        } else {
            appendMessage('bot', '⚠️ ' + (data.error || 'Something went wrong.'));
            if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise();
        }
    } catch {
        removeTyping();
        appendMessage('bot', '⚠️ Cannot reach the server. Is the backend running?');
        if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise();
    } finally {
        isSending = false;
        sendBtn.disabled = false;
        messageInput.focus();
    }
}

/* Input events */
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + 'px';
});

/* ═══════════════════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════════════════ */
let _toastTimer;
function showToast(msg, type = 'default') {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    clearTimeout(_toastTimer);
    t.textContent = msg;
    t.className = `toast toast-${type}`;
    t.getBoundingClientRect();
    t.classList.add('show');
    _toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ═══════════════════════════════════════════════════════
   FILE UPLOAD
   ═══════════════════════════════════════════════════════ */
uploadTrigger.addEventListener('click', () => {
    // Open knowledge base section and trigger file picker
    const body   = document.getElementById('knowledgeBody');
    const toggle = document.querySelector('.knowledge-toggle');
    if (!body.classList.contains('open')) {
        toggle.classList.add('open');
        body.classList.add('open');
    }
    fileInput.click();
});

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', async e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    for (const f of [...e.dataTransfer.files]) await uploadFile(f);
});
fileInput.addEventListener('change', async () => {
    for (const f of [...fileInput.files]) await uploadFile(f);
    fileInput.value = '';
});

async function uploadFile(file) {
    progressWrap.style.display = 'block';
    progressFill.style.width = '0%';
    progressLabel.textContent = `Uploading ${file.name}…`;

    let prog = 0;
    const ticker = setInterval(() => {
        prog = Math.min(prog + Math.random() * 14, 85);
        progressFill.style.width = prog + '%';
    }, 160);

    try {
        const fd  = new FormData();
        fd.append('file', file);
        const res  = await fetch('/api/upload', { method: 'POST', body: fd });
        const data = await res.json();
        clearInterval(ticker);
        progressFill.style.width = '100%';

        if (res.ok) {
            progressLabel.textContent = '✓ ' + data.message;
            addFileToList(file.name);
            showToast('✓ Indexed: ' + file.name, 'success');
        } else {
            progressLabel.textContent = '✗ ' + (data.error || 'Upload failed');
            showToast('✗ ' + (data.error || 'Upload failed'), 'error');
        }
    } catch {
        clearInterval(ticker);
        progressLabel.textContent = '✗ Connection error';
        showToast('✗ Upload error', 'error');
    } finally {
        setTimeout(() => { progressWrap.style.display = 'none'; }, 3000);
    }
}

function addFileToList(name) {
    const li = document.createElement('li');
    li.className = 'file-item-sm';
    li.innerHTML = `<span style="color:var(--green)">✓</span>${escapeHtml(name)}`;
    fileListEl.appendChild(li);
}

/* ═══════════════════════════════════════════════════════
   START
   ═══════════════════════════════════════════════════════ */
init();
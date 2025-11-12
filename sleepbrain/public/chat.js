(function () {
  const AUTH_RE = /\/(login|register)\.html$/i;
  const WIDGET_ID = 'chat-widget-container';
  const FLAG_ID = 'chat-flag';
  const MODAL_ID = 'chat-modal';
  const CONTACT_LIST_ID = 'chat-contact-list';
  const CHATBOX_VIEW_ID = 'chat-box-view';
  const CONTACT_VIEW_ID = 'chat-contact-list-view';

  let io = null;                // socket.io cliente
  let currentUserId = null;
  let currentUserName = null;
  let currentChattingWithId = null;

  // ---------------------- utils ----------------------
  function getUserSafe() {
    try { return JSON.parse(localStorage.getItem('usuarioSleepBrain')) || null; }
    catch { return null; }
  }
  function ensureCSS(href) {
    if (!document.querySelector(`link[href="${href}"]`)) {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = href;
      document.head.appendChild(l);
    }
  }
  async function ensureScript(src) {
    if (document.querySelector(`script[src="${src}"]`)) return;
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  // ---------------------- DOM base ----------------------
  async function injectModalHTML() {
    if (document.getElementById(WIDGET_ID)) return;

    // tenta /chat-modal.html e chat-modal.html
    let html = '';
    for (const path of ['/chat-modal.html', 'chat-modal.html']) {
      try {
        const r = await fetch(path, { cache: 'no-store' });
        if (r.ok) { html = await r.text(); break; }
      } catch { /* tenta o próximo */ }
    }

    if (html) {
      const wrap = document.createElement('div');
      wrap.innerHTML = html;
      document.body.appendChild(wrap);
    } else {
      // Fallback completo (cria estrutura mínima do balão + painel)
      const wrap = document.createElement('div');
      wrap.id = WIDGET_ID;
      wrap.className = ''; // css aplica pelo arquivo
      wrap.innerHTML = `
        <button id="${FLAG_ID}" class="sbc-flag" aria-label="Abrir chat">
          <i class="fas fa-comments"></i>
          <span id="chat-notification-flag" class="sbc-flag-badge" style="display:none">0</span>
        </button>
        <section id="${MODAL_ID}" class="sbc-modal" aria-hidden="true">
          <header class="sbc-header">
            <button id="chat-back-button" class="sbc-back" title="Voltar"><i class="fas fa-chevron-left"></i></button>
            <strong id="chat-partner-name">Chat</strong>
            <button id="chat-close-button" class="sbc-close" title="Fechar"><i class="fas fa-times"></i></button>
          </header>
          <div class="sbc-body">
            <aside id="${CONTACT_VIEW_ID}" class="sbc-contacts">
              <div class="sbc-search"><input id="chat-search" placeholder="Buscar pessoas..."/></div>
              <ul id="${CONTACT_LIST_ID}" class="sbc-list"></ul>
            </aside>
            <section id="${CHATBOX_VIEW_ID}" class="sbc-chat hidden">
              <div id="chat-messages" class="sbc-messages"></div>
              <form id="chat-send-form" class="sbc-form">
                <input id="chat-message-input" placeholder="Digite sua mensagem..." autocomplete="off"/>
                <button class="sb-btn" type="submit"><i class="fas fa-paper-plane"></i></button>
              </form>
            </section>
          </div>
        </section>
      `;
      document.body.appendChild(wrap);
    }

    // mostra o balão (remove a classe hidden do container principal)
    const container = document.getElementById(WIDGET_ID);
    if (container) container.classList.remove('hidden');
  }

  // ---------------------- socket ----------------------
  function connectSocket() {
    if (io) return;
    try {
      io = window.io ? window.io() : null;
      if (!io) return;

      io.on('connect', () => {
        if (currentUserId) io.emit('register', currentUserId);
      });

      io.on('chat:notification', (payload) => {
        // badge no balão
        const flag = document.getElementById('chat-notification-flag');
        if (flag && currentChattingWithId !== payload.remetente_id) {
          flag.textContent = String((parseInt(flag.textContent || '0', 10) || 0) + 1);
          flag.style.display = 'flex';
        }
        // se aberto com o contato -> append
        if (currentChattingWithId === payload.remetente_id) {
          appendMessage(payload, 'in');
          markMessagesAsRead(payload.remetente_id, currentUserId);
        }
      });
    } catch { /* ignora, o chat segue abrindo UI */ }
  }

  // ---------------------- API HTTP ----------------------
  async function fetchContatos() {
    try {
      const r = await fetch(`/chat/contatos/${currentUserId}`);
      const json = await r.json();
      renderContatos(Array.isArray(json) ? json : []);
    } catch { renderContatos([]); }
  }
  async function fetchMensagensNaoLidas() {
    try {
      const r = await fetch(`/chat/mensagens/${currentUserId}`);
      const data = await r.json();
      const c = (data?.mensagensNaoLidas || []).length;
      const flag = document.getElementById('chat-notification-flag');
      if (flag) {
        if (c > 0) { flag.textContent = c; flag.style.display = 'flex'; }
        else flag.style.display = 'none';
      }
    } catch {}
  }
  async function fetchHistorico(partnerId) {
    const box = document.getElementById('chat-messages');
    box.innerHTML = '<p class="sbc-loading">Carregando…</p>';
    try {
      const r = await fetch(`/chat/historico/${currentUserId}/${partnerId}`);
      const hist = await r.json();
      box.innerHTML = '';
      (hist || []).forEach(msg => appendMessage(msg, msg.remetente_id === currentUserId ? 'out' : 'in'));
      box.scrollTop = box.scrollHeight;
      await markMessagesAsRead(partnerId, currentUserId);
    } catch {
      box.innerHTML = '<p class="sbc-error">Falha ao carregar histórico.</p>';
    }
  }
  async function markMessagesAsRead(remetenteId, destinatarioId) {
    try {
      await fetch('/chat/marcar-lida', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ remetenteId, destinatarioId })
      });
      await fetchMensagensNaoLidas();
    } catch {}
  }

  // ---------------------- render e eventos ----------------------
  function renderContatos(contatos) {
    const ul = document.getElementById(CONTACT_LIST_ID);
    if (!ul) return;
    ul.innerHTML = '';
    if (!contatos.length) {
      ul.innerHTML = '<li class="sbc-empty">Ninguém por aqui ainda.</li>';
      return;
    }
    contatos.forEach(c => {
      const li = document.createElement('li');
      li.className = 'contact-item';
      li.dataset.id = c.id;
      li.innerHTML = `
        <span class="contact-avatar">${(c.nome||c.email||'U').slice(0,1).toUpperCase()}</span>
        <span class="contact-name">${c.nome || c.email}</span>
        <span class="contact-unread-count hidden">0</span>
      `;
      li.addEventListener('click', () => openChatbox(c.id, c.nome || c.email));
      ul.appendChild(li);
    });
  }
  function appendMessage(payload, type) {
    const box = document.getElementById('chat-messages');
    const wrap = document.createElement('div');
    const p = document.createElement('p');
    p.textContent = payload.conteudo;
    wrap.className = `chat-message ${type === 'in' ? 'message-in' : 'message-out'}`;
    if (type === 'in') {
      const s = document.createElement('span');
      s.className = 'sender-name';
      s.textContent = payload.nome_remetente || 'Usuário';
      wrap.appendChild(s);
    }
    wrap.appendChild(p);
    box.appendChild(wrap);
    box.scrollTop = box.scrollHeight;
  }

  function openChatbox(partnerId, partnerName) {
    currentChattingWithId = partnerId;
    document.getElementById(CONTACT_VIEW_ID).classList.add('hidden');
    document.getElementById(CHATBOX_VIEW_ID).classList.remove('hidden');
    document.getElementById('chat-partner-name').textContent = partnerName;
    document.getElementById('chat-messages').innerHTML = '';
    fetchHistorico(partnerId);
  }
  
  function closeChatbox() {
    currentChattingWithId = null;
    document.getElementById(CONTACT_VIEW_ID).classList.remove('hidden');
    document.getElementById(CHATBOX_VIEW_ID).classList.add('hidden');
  }

  function bindUI() {
    const flag = document.getElementById(FLAG_ID);
    const modal = document.getElementById(MODAL_ID);
    const backBtn = document.getElementById('chat-back-button');
    const closeBtn = document.getElementById('chat-close-button');

    // Função de fechamento do Modal (Mostra o balão novamente)
    const handleCloseModal = () => {
        modal.classList.remove('open');
        flag.classList.remove('hidden'); // 👈 MOSTRA o balão (flag)
    };

    // ⚠️ LÓGICA CORRIGIDA: Abrir modal ao clicar no balão (Esconde o balão)
    flag?.addEventListener('click', () => {
      const u = getUserSafe();
      if (!u) { window.showToast?.('Faça login para usar o chat.', 'error'); return; }
      
      modal.classList.add('open'); // 👈 ABRE o modal
      flag.classList.add('hidden'); // 👈 ESCONDE o balão
      
      // preparar usuário + socket + contatos
      currentUserId = u.id; currentUserName = u.nome || u.email;
      ensureScript('/socket.io/socket.io.js').then(() => {
        connectSocket();
        fetchContatos();
        fetchMensagensNaoLidas();
      }).catch(() => {
        // mesmo sem socket, a UI abre
        fetchContatos();
      });
    });

    // Botões dentro do modal
    backBtn?.addEventListener('click', closeChatbox); // Volta para a lista de contatos (dentro do modal)
    closeBtn?.addEventListener('click', handleCloseModal); // 👈 FECHA o modal totalmente

    // envio
    document.getElementById('chat-send-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const u = getUserSafe();
      const input = document.getElementById('chat-message-input');
      const text = input.value.trim();
      if (!u) { window.showToast?.('Faça login para usar o chat.','error'); return; }
      if (!currentChattingWithId) { window.showToast?.('Selecione um contato.','error'); return; }
      if (!text) return;

      const payload = {
        remetenteId: u.id,
        destinatarioId: currentChattingWithId,
        nomeRemetente: u.nome || u.email,
        conteudo: text
      };

      appendMessage(payload, 'out');
      input.value = '';

      try { io?.emit?.('chat:message', payload); } catch {}
    });

    // filtro dos contatos
    document.getElementById('chat-search')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      document.querySelectorAll(`#${CONTACT_LIST_ID} .contact-item`).forEach(li => {
        const name = (li.querySelector('.contact-name')?.textContent || '').toLowerCase();
        li.style.display = name.includes(q) ? '' : 'none';
      });
    });
  }

  // ---------------------- init ----------------------
  async function initChat() {
    // não sobe em login/register
    if (AUTH_RE.test(location.pathname)) return;

    ensureCSS('/assets/css/sb-chat.css');
    await injectModalHTML();
    bindUI();
    
    // ⚠️ NOVO: Garante o estado inicial: modal fechado, balão visível
    document.getElementById(MODAL_ID)?.classList.remove('open');
    document.getElementById(FLAG_ID)?.classList.remove('hidden');
  }

  // expõe e auto-inicializa
  window.initChat = initChat;
  window.closeChatbox = closeChatbox;

  // REMOVIDO: Bloco DOMContentLoaded
  // window.addEventListener('DOMContentLoaded', () => {
  //   initChat().catch(()=>{});
  // });
})();
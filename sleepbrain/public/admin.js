// public/admin.js — build 2025-11-11
console.log('[Admin UI] build 2025-11-11');

document.addEventListener('DOMContentLoaded', () => {
  window.carregarHeader('header-placeholder', window.getUser());
  wireCreateUserModal();
  initAdminPage();
});

// =================== Modal "Novo Usuário" ===================

function wireCreateUserModal() {
  const btnOpen = document.getElementById('btn-novo-usuario');
  const dlg = document.getElementById('dlg-user');
  const form = document.getElementById('formCreateUser');
  const btnCancel = document.getElementById('cu-cancelar');
  const msgEl = document.getElementById('modal-user-msg');
  const emailHint = document.getElementById('cu-email-hint');

  const u = window.getUser();
  // Só admins veem o botão
  if (!u || String(u?.role || '').toLowerCase() !== 'admin') {
    btnOpen?.remove();
    return;
  }

  btnOpen?.addEventListener('click', () => {
    form?.reset();
    msgEl.textContent = '';
    emailHint.textContent = '';
    document.getElementById('cu-role').value = 'comum';
    dlg.showModal();
  });

  btnCancel?.addEventListener('click', () => dlg.close());

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = Object.fromEntries(new FormData(form));
    const nome = (data.nome || '').trim();
    const email = (data.email || '').trim();
    const senha = (data.senha || '').trim();
    const role  = (data.role  || 'comum').trim();

    msgEl.textContent = 'Criando usuário...';
    emailHint.textContent = '';

    if (!nome || !email || !senha) {
      window.showToast?.('Preencha nome, e-mail e senha.', 'error');
      msgEl.textContent = 'Preencha todos os campos obrigatórios.';
      return;
    }
    if (role !== 'admin' && role !== 'comum') {
      window.showToast?.('Role inválida.', 'error');
      msgEl.textContent = 'Role inválida.';
      return;
    }

    try {
      const resp = await fetch('/admin/criar-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, email, senha, role })
      });

      const json = await resp.json().catch(() => null);

      if (resp.ok) {
        window.showToast?.(json?.mensagem || 'Usuário criado.', 'success');
        dlg.close();
        initAdminPage(); // recarrega lista
      } else {
        if (resp.status === 409 && json?.erro) emailHint.textContent = json.erro;
        const msg = json?.erro || `Falha (status ${resp.status}).`;
        window.showToast?.(msg, 'error');
        msgEl.textContent = msg;
      }
    } catch {
      window.showToast?.('Erro de conexão.', 'error');
      msgEl.textContent = 'Erro de conexão.';
    }
  });
}

// =================== Lista + Ações ===================

function actionButtonsHTML(user) {
  // Botões só para OUTROS usuários; para "você" volta vazio
  return `
    <div class="user-actions" style="display:flex; gap:8px; flex-wrap:wrap;">
      <button class="sb-btn sb-btn--secondary action-btn" data-id="${user.id}" data-action="toggle-admin" title="Promover/Rebaixar">
        <i class="fas fa-user-gear"></i> Promover/Rebaixar
      </button>
      <button class="sb-btn sb-btn--secondary action-btn" data-id="${user.id}" data-action="${String(user.status).toLowerCase()==='banido'?'unban':'ban'}" title="Banir/Ativar">
        <i class="fas fa-user-slash"></i> ${String(user.status).toLowerCase()==='banido'?'Ativar':'Banir'}
      </button>
      <button class="sb-btn action-btn ban" data-id="${user.id}" data-action="delete" title="Excluir usuário">
        <i class="fas fa-trash"></i> Excluir
      </button>
    </div>
  `;
}

function renderUserList(users) {
  const userListEl = document.getElementById('user-list');
  const msgEl = document.getElementById('admin-user-message');
  userListEl.innerHTML = '';

  if (!Array.isArray(users) || users.length === 0) {
    userListEl.innerHTML = `<tr><td colspan="4" class="loading-row">Nenhum usuário cadastrado.</td></tr>`;
    msgEl.textContent = 'Nenhum usuário cadastrado.';
    return;
  }

  const current = window.getUser();
  const currentId = Number(current?.id);

  users.forEach(user => {
    const isYou = Number(user.id) === currentId;
    const isAdmin = String(user.role).toLowerCase() === 'admin';
    const isBanido = String(user.status).toLowerCase() === 'banido';
    const roleText = isAdmin ? 'Admin' : 'Comum';
    const statusClass = isBanido ? 'status-banido' : 'status-ativo';

    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="user-info">
        <strong>${user.nome || 'Sem Nome'}</strong>
        ${isYou ? '<span class="you-badge">você</span>' : ''}
        <span class="muted" style="display:block;">${user.email}</span>
      </td>
      <td><span class="user-role">${roleText}</span></td>
      <td><span class="user-status ${statusClass}">${user.status || 'ativo'}</span></td>
      <td>${isYou ? '<span class="muted">—</span>' : actionButtonsHTML(user)}</td>
    `;

    if (!isYou) {
      row.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => handleUserAction(e.currentTarget.dataset.id, e.currentTarget.dataset.action));
      });
    }

    userListEl.appendChild(row);
  });

  msgEl.textContent = `Total de usuários: ${users.length}.`;
}

async function handleUserAction(userId, action) {
  const u = window.getUser();
  if (!u || String(u?.role || '').toLowerCase() !== 'admin') {
    window.showToast?.('Acesso negado.', 'error'); return;
  }

  try {
    let endpoint = '';
    let method = 'POST';
    let body;

    if (action === 'delete') {
      if (!confirm('Tem certeza que deseja EXCLUIR permanentemente este usuário?')) return;
      endpoint = `/admin/usuarios/${userId}`;
      method = 'DELETE';
    } else if (action === 'toggle-admin') {
      endpoint = `/admin/toggle-role/${userId}`;
      method = 'POST';
    } else if (action === 'ban' || action === 'unban') {
      endpoint = `/admin/banir`;
      body = JSON.stringify({ userId: Number(userId), action });
    } else {
      return;
    }

    window.showToast?.('Executando ação...', 'success');

    const resp = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body
    });

    const json = await resp.json().catch(() => null);

    if (resp.ok) {
      window.showToast?.(json?.mensagem || 'OK', 'success');
      initAdminPage();
    } else {
      const msg =
        json?.erro ||
        (resp.status >= 500 ? 'Erro interno do servidor.' : `Falha (status ${resp.status}).`);
      window.showToast?.(msg, 'error');
    }
  } catch {
    window.showToast?.('Erro de conexão.', 'error');
  }
}

// =================== Inicialização ===================

async function initAdminPage() {
  const userListEl = document.getElementById('user-list');
  const msgEl = document.getElementById('admin-user-message');
  if (!userListEl) return;

  const u = window.getUser();
  if (!u || String(u?.role || '').toLowerCase() !== 'admin') {
    userListEl.innerHTML = `<tr><td colspan="4" class="loading-row">Acesso negado. Você não é um administrador.</td></tr>`;
    msgEl.textContent = '';
    document.getElementById('btn-novo-usuario')?.remove();
    return;
  }

  msgEl.textContent = `Logado como: ${u.nome || u.email} (${u.role})`;
  userListEl.innerHTML = `<tr><td colspan="4" class="loading-row">Carregando usuários...</td></tr>`;

  try {
    const resp = await fetch('/admin/usuarios', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store'
    });

    let json = null;
    try { json = await resp.json(); } catch {}

    if (resp.ok && Array.isArray(json)) {
      renderUserList(json);
    } else {
      const msg =
        json?.erro ||
        (resp.status >= 500 ? 'Erro interno do servidor.' : `Falha (status ${resp.status}).`);
      userListEl.innerHTML = `<tr><td colspan="4" class="loading-row">Falha ao carregar dados.</td></tr>`;
      msgEl.textContent = 'Falha ao buscar usuários.';
      window.showToast?.(msg, 'error');
    }
  } catch (error) {
    userListEl.innerHTML = `<tr><td colspan="4" class="loading-row">Erro de conexão com o servidor.</td></tr>`;
    msgEl.textContent = 'Falha de conexão com a API.';
    window.showToast?.('Erro de conexão com o servidor.', 'error');
  }
}

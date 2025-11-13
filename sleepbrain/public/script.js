
(function () {
  const LS_USER = 'usuarioSleepBrain';
  const LS_CART_PREFIX = 'sleepbrain_cart_';
  const LS_REG_PREFIX  = 'sleepbrain_reg_';
  const isAuthPage = () => /\/(login|register)\.html$/i.test(location.pathname);

  
  window.showToast = function (msg, type = 'success') {
    let el = document.getElementById('toast-notification');
    if (!el) { alert(msg); return; }
    el.classList.remove('success', 'error', 'show');
    if (type) el.classList.add(type);
    const span = el.querySelector('#toast-message') || el.appendChild(document.createElement('span'));
    span.id = 'toast-message';
    span.textContent = msg;
    requestAnimationFrame(() => {
      el.classList.add('show');
      clearTimeout(el.__t);
      el.__t = setTimeout(() => el.classList.remove('show'), 2300);
    });
  };

  
  window.getUser = () => { try { return JSON.parse(localStorage.getItem(LS_USER)) || null; } catch { return null; } };
  window.setUser = (u) => localStorage.setItem(LS_USER, JSON.stringify(u));
  window.fazerLogout = () => { localStorage.removeItem(LS_USER); showToast('Sessão encerrada.', 'success'); setTimeout(()=>location.href='/login.html',350); };

  
  function injectScriptOnce(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve(true);
      const s = document.createElement('script');
      s.src = src; s.defer = true;
      s.onload = () => resolve(true);
      s.onerror = () => reject(new Error('fail '+src));
      document.head.appendChild(s);
    });
  }
  function ensureLinkOnce(href) {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href;
    document.head.appendChild(l);
  }

 
  window.__SB_CHAT_BOOTED = window.__SB_CHAT_BOOTED || false;

  async function bootChat() {
    if (isAuthPage() || window.__SB_CHAT_BOOTED) return;

    try {
      
      ensureLinkOnce('/assets/css/sb-chat.css');

      
      await injectScriptOnce('/socket.io/socket.io.js');

    
      if (!window.initChat) {
        await injectScriptOnce('/chat.js').catch(async () => {
          await injectScriptOnce('/assets/js/chat.js');
        });
      }

    
      if (typeof window.initChat === 'function') {
        window.__SB_CHAT_BOOTED = true;
        window.initChat();
      }
    } catch (e) {
      console.warn('[chat] não foi possível inicializar:', e.message);
    }
  }

  
  window.carregarHeader = async function (containerId = 'header-placeholder', user = null) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return;

    try {
      const html = await (await fetch('/header.html', { cache: 'no-store' })).text();
      wrap.innerHTML = html;

     
      if (!document.querySelector('link[href$="sb-header.css"]')) {
        const l = document.createElement('link');
        l.rel = 'stylesheet'; l.href = '/assets/css/sb-header.css';
        document.head.appendChild(l);
      }

      const u = user || getUser();
      const logged = !!u?.id;
      const firstName = (u?.nome || u?.email || 'Visitante').split(' ')[0];
      const initial = ((u?.nome || u?.email || 'U').trim()[0] || 'U').toUpperCase();

      const nameEl   = document.getElementById('sb-user-name');
      const iniEl    = document.getElementById('sb-user-initial');
      const dd       = document.getElementById('sb-user-dropdown');
      const adminLink= document.getElementById('sb-link-admin');

      if (nameEl) nameEl.textContent = logged ? firstName : 'Visitante';
      if (iniEl)  iniEl.textContent  = initial;

      if (dd) {
        dd.innerHTML = logged
          ? `<li><a href="/perfil.html"><i class="fas fa-user-cog"></i> Eu</a></li>
             <li><button id="sb-logout-btn"><i class="fas fa-sign-out-alt"></i> Sair</button></li>`
          : `<li><a href="/login.html"><i class="fas fa-sign-in-alt"></i> Fazer login</a></li>
             <li><a href="/register.html"><i class="fas fa-user-plus"></i> Criar conta</a></li>`;
        dd.querySelector('#sb-logout-btn')?.addEventListener('click', fazerLogout);
      }
      if (adminLink) adminLink.style.display = String(u?.role || '').toLowerCase() === 'admin' ? '' : 'none';

      const btnUser = document.getElementById('sb-user-btn');
      btnUser?.addEventListener('click', () => {
        const open = dd.classList.toggle('show');
        btnUser.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      document.addEventListener('click', (e) => {
        if (!dd) return;
        if (!dd.contains(e.target) && !btnUser.contains(e.target)) {
          dd.classList.remove('show'); btnUser?.setAttribute('aria-expanded', 'false');
        }
      });

      
      if (isAuthPage()) {
        document.getElementById('sb-open-cart')?.remove();
        document.getElementById('sb-cart')?.remove();
      } else {
        initCart();
      }

      
      bootChat();

      
      initIndexProductsIfAny();

    } catch (err) {
      console.error('Falha ao carregar header:', err);
    }
  };

 
  const cartKey = () => {
    const u = getUser();
    return LS_CART_PREFIX + (u?.id ? `u${u.id}` : 'guest');
  };

  (function migrateLegacyCartKey() {
    const legacy = localStorage.getItem('sleepbrain_cart');
    if (legacy && !localStorage.getItem(cartKey())) {
      localStorage.setItem(cartKey(), legacy);
      localStorage.removeItem('sleepbrain_cart');
    }
  })();

  const getCart = () => { try { return JSON.parse(localStorage.getItem(cartKey()) || '[]'); } catch { return []; } };
  const setCart = (arr) => { localStorage.setItem(cartKey(), JSON.stringify(arr)); renderCartBadge(); };

  function renderCartBadge() {
    const el = document.getElementById('sb-cart-count');
    if (el) el.textContent = String(getCart().length);
  }

  function renderCart() {
    const body  = document.getElementById('sb-cart-items');
    const total = document.getElementById('sb-cart-total');
    if (!body || !total) return;

    const items = getCart();
    body.innerHTML = '';

    items.forEach(it => {
      const row = document.createElement('div');
      row.className = 'sb-cart__item';
      row.innerHTML = `
        <img src="${it.img}" alt="">
        <div>
          <h5>${it.title}</h5>
          <div class="muted">${it.price || ''}</div>
        </div>
        <div class="actions">
          <a href="${it.url}" target="_blank" rel="noopener" class="sb-icon-btn" title="Comprar na Amazon">
            <i class="fas fa-external-link-alt"></i>
          </a>
          <button class="sb-icon-btn" title="Remover"><i class="fas fa-trash"></i></button>
        </div>
      `;
      row.querySelector('button').addEventListener('click', () => removeFromCart(it.id));
      body.appendChild(row);
    });

    total.textContent = String(items.length);
    renderCartBadge();
  }

  function openCart(){ document.getElementById('sb-cart')?.classList.add('open'); }
  function closeCart(){ document.getElementById('sb-cart')?.classList.remove('open'); }
  function clearCart(){ setCart([]); renderCart(); showToast('Lista limpa.', 'success'); }
  function buyAll(){
    const items = getCart();
    if (items.length === 0) { showToast('Sua lista está vazia.', 'error'); return; }
    items.forEach(i => window.open(i.url, '_blank', 'noopener'));
    showToast('Abrindo produtos na Amazon…', 'success');
  }
  function initCart(){
    renderCart(); renderCartBadge();
    document.getElementById('sb-open-cart')?.addEventListener('click', openCart);
    document.getElementById('sb-close-cart')?.addEventListener('click', closeCart);
    document.getElementById('sb-cart-clear')?.addEventListener('click', clearCart);
    document.getElementById('sb-cart-buyall')?.addEventListener('click', buyAll);
  }

  window.addToCart = function(item){
    const arr = getCart();
    if (!arr.find(x => x.id === item.id)) {
      arr.push({ ...item, qty: 1 });
      setCart(arr); renderCart();
      showToast('Adicionado à lista!', 'success');
    } else {
      showToast('Este item já está na lista.', 'error');
    }
  };
  window.removeFromCart = function(id){ setCart(getCart().filter(x => x.id !== id)); renderCart(); };

  
  function initIndexProductsIfAny(){
    const grid = document.getElementById('sb-products-grid');
    if (!grid) return;
    const products = [
      { id:'p01', title:'Travesseiro Ortobom Nasa',         price:'R$ 129,90', url:'https://www.amazon.com.br/s?k=travesseiro+nasa',            img:'/assets/img/pillow.jpg' },
      { id:'p02', title:'Tampa anti-ruído (sleep buds)',    price:'R$ 349,00', url:'https://www.amazon.com.br/s?k=noise+sleep',                 img:'/assets/img/noise.jpg' },
      { id:'p03', title:'Máscara de dormir 3D',             price:'R$ 69,90',  url:'https://www.amazon.com.br/s?k=m%C3%A1scara+de+dormir+3d',  img:'/assets/img/mask.jpg' },
      { id:'p04', title:'Luminária ajustável para leitura', price:'R$ 219,00', url:'https://www.amazon.com.br/s?k=luminaria+leitura',           img:'/assets/img/lamp.jpg' }
    ];
    renderProducts(products);
  }

  window.renderProducts = function(list){
    const grid = document.getElementById('sb-products-grid');
    if (!grid) return;
    grid.innerHTML = '';
    list.forEach(p => {
      const card = document.createElement('article');
      card.className = 'sb-card product-card';
      card.innerHTML = `
        <img src="${p.img}" alt="">
        <div class="product-card__content">
          <h4>${p.title}</h4>
          <div class="row">
            <span class="muted">${p.price || ''}</span>
            <div style="display:flex; gap:8px">
              <button class="sb-btn sb-btn--secondary">Adicionar</button>
              <a class="sb-btn" href="${p.url}" target="_blank" rel="noopener">Amazon</a>
            </div>
          </div>
        </div>
      `;
      card.querySelector('button').addEventListener('click', () => addToCart(p));
      grid.appendChild(card);
    });
  };

  window.carregarArtigos = async function () {
    const grid = document.getElementById('artigos-grid');
    if (!grid) return;

    const current = getUser();
    const isAdmin = String(current?.role || '').toLowerCase() === 'admin';

    grid.innerHTML = '<p class="muted" style="grid-column:1/-1">Carregando…</p>';

    try {
      const res = await fetch('/buscar-artigos', { cache: 'no-store' });
      const artigos = await res.json();

      if (!res.ok) { grid.innerHTML = '<p class="muted">Falha ao buscar artigos.</p>'; return; }
      if (!Array.isArray(artigos) || artigos.length === 0) {
        grid.innerHTML = '<p class="muted">Nenhum artigo por aqui ainda.</p>'; return;
      }

      grid.innerHTML = '';
      artigos.forEach(a => {
        const autorId = Number(a.autor_id ?? a.autorId ?? a.user_id);
        const isOwner = current && Number(current.id) === autorId;

        const el = document.createElement('article');
        el.className = 'sb-card artigo-card';
        el.setAttribute('data-id', a.id);

        el.innerHTML = `
          ${(isAdmin || isOwner) ? `<button class="delete" title="Apagar"><i class="fas fa-times"></i></button>` : ''}
          <a href="${a.url}" target="_blank" rel="noopener">
            <div class="icon"><i class="fas fa-book-reader"></i></div>
            <div>
              <h3>${a.titulo}</h3>
              <div class="meta">${a.fonte || 'Artigo comunitário'} • ${new Date(a.data_criacao).toLocaleDateString('pt-BR')}</div>
              <p class="muted">${a.descricao}</p>
            </div>
          </a>
        `;

        if (isAdmin || isOwner) {
          el.querySelector('.delete')?.addEventListener('click', async (ev) => {
            ev.preventDefault(); ev.stopPropagation();
            if (!confirm('Excluir este artigo?')) return;
            try {
              const resp = await fetch(`/artigo/deletar/${a.id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: current.id })
              });
              const json = await resp.json();
              if (resp.ok) { el.remove(); showToast('Artigo removido.', 'success'); }
              else { showToast(json.erro || 'Ação não permitida.', 'error'); }
            } catch { showToast('Erro de conexão.', 'error'); }
          });
        }

        grid.appendChild(el);
      });
    } catch (err) { console.error(err); grid.innerHTML = '<p class="muted">Erro ao carregar.</p>'; }
  };

  window.inicializarFormularioArtigo = function () {
    const form = document.getElementById('formCreateArticle');
    if (!form) return;

    const msgEl = document.getElementById('modal-article-msg');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = getUser();
      if (!u) { showToast('Faça login para publicar.', 'error'); return; }

      const data = Object.fromEntries(new FormData(form));
      if (!data.titulo || !data.descricao || !data.url) { showToast('Preencha todos os campos.', 'error'); return; }

      try {
        msgEl && (msgEl.textContent = 'Publicando…');
        data.autor_id = u.id;
        const res = await fetch('/artigo/publicar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
        });
        const json = await res.json();
        if (res.ok) { showToast('Publicado!', 'success'); document.getElementById('dlg-artigo')?.close(); carregarArtigos(); }
        else { showToast(json.erro || 'Falha ao publicar.', 'error'); msgEl && (msgEl.textContent = json.erro || 'Erro.'); }
      } catch { showToast('Erro de conexão.', 'error'); msgEl && (msgEl.textContent = 'Erro de conexão.'); }
    });
  };

  
  window.initPerfilPage = async function () {
    const u = getUser();
    if (!u) { location.href = '/login.html'; return; }

    const nomeEl = document.getElementById('perfilNome');
    const emailEl = document.getElementById('perfilEmail');
    const msgEl   = document.getElementById('perfilMsg');
    const emailHint = document.getElementById('email-hint');

    (function identidade() {
      const nm = u.nome || u.email || 'Usuário';
      document.getElementById('display-name')?.append(document.createTextNode(nm));
      const av = document.getElementById('avatar-initial'); if (av) av.textContent = (nm.trim()[0] || 'U').toUpperCase();
      const br = document.getElementById('badge-role');   if (br) br.textContent = u.role || 'comum';
      const cs = document.getElementById('chip-status');  if (cs) cs.textContent = u.status || 'ativo';
    })();

    try {
      const res = await fetch(`/usuario/${u.id}`, { cache: 'no-store' });
      if (res.ok) { const srv = await res.json(); nomeEl.value = srv.nome || ''; emailEl.value = srv.email || ''; }
      else { nomeEl.value = u.nome || ''; emailEl.value = u.email || ''; }
    } catch { nomeEl.value = u.nome || ''; emailEl.value = u.email || ''; }

    document.querySelectorAll('.btn-eye, .toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.target);
        if (!target) return;
        target.type = (target.type === 'password') ? 'text' : 'password';
        const icon = btn.querySelector('i'); if (icon) icon.className = target.type === 'password' ? 'far fa-eye' : 'far fa-eye-slash';
      });
    });

    document.getElementById('formPerfil')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      emailHint.textContent = ''; msgEl.textContent = 'Salvando…';

      const nome = nomeEl.value.trim();
      const email = emailEl.value.trim();
      const senhaAtual = document.getElementById('perfilSenhaAtual').value;
      const novaSenha  = document.getElementById('perfilNovaSenha').value;

      const payload = {};
      if (nome && nome !== u.nome) payload.nome = nome;
      if (email && email !== u.email) payload.email = email;
      if (novaSenha) { payload.senhaAtual = senhaAtual; payload.novaSenha = novaSenha; }

      if (Object.keys(payload).length === 0) { msgEl.textContent = 'Nada para atualizar.'; return; }

      try {
        const res = await fetch(`/usuario/${u.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (res.ok) {
          if (json.usuario) setUser(json.usuario);
          showToast('Perfil atualizado.', 'success');
          msgEl.textContent = 'Perfil atualizado.';
          document.getElementById('perfilSenhaAtual').value = '';
          document.getElementById('perfilNovaSenha').value = '';
          carregarHeader('header-placeholder', getUser());
        } else {
          if (res.status === 409 && json.erro) emailHint.textContent = json.erro;
          showToast(json.erro || 'Falha ao salvar.', 'error');
          msgEl.textContent = json.erro || 'Falha ao salvar.';
        }
      } catch { showToast('Erro de conexão.', 'error'); msgEl.textContent = 'Erro de conexão.'; }
    });

    document.getElementById('btnCancelar')?.addEventListener('click', async () => {
      emailHint.textContent = ''; msgEl.textContent = '';
      try {
        const res = await fetch(`/usuario/${u.id}`, { cache: 'no-store' });
        if (res.ok) { const srv = await res.json(); nomeEl.value = srv.nome || ''; emailEl.value = srv.email || ''; }
        else { nomeEl.value = u.nome || ''; emailEl.value = u.email || ''; }
      } catch { nomeEl.value = u.nome || ''; emailEl.value = u.email || ''; }
      showToast('Alterações descartadas.', 'success');
    });

    document.getElementById('btnExcluirConta')?.addEventListener('click', async () => {
      if (!confirm('Tem certeza que deseja excluir sua conta?')) return;
      if (!confirm('Última confirmação: esta ação é irreversível.')) return;
      msgEl.textContent = 'Excluindo…';
      try {
        const res = await fetch(`/usuario/${u.id}?requesterId=${encodeURIComponent(u.id)}`, {
          method: 'DELETE', headers: { 'Content-Type': 'application/json', 'x-requester-id': String(u.id) },
          body: JSON.stringify({ requesterId: u.id })
        });
        const json = await res.json();
        if (res.ok) { showToast(json.mensagem || 'Conta excluída.', 'success'); setTimeout(()=>fazerLogout(),600); }
        else { msgEl.textContent = json.erro || 'Falha ao excluir.'; showToast(json.erro || 'Falha ao excluir.', 'error'); }
      } catch { msgEl.textContent = 'Erro de conexão.'; showToast('Erro de conexão.', 'error'); }
    });
  };

  
  function recRange(age){ if (age<=5) return [10,13]; if (age<=13) return [9,11]; if (age<=17) return [8,10]; if (age<=64) return [7,9]; return [7,8]; }
  window.evalSleepQuality = function (age,hours){
    const [min,max]=recRange(age);
    let status='bom',code='rg-good',advice='Ótimo! Mantenha sua rotina de sono e higiene do sono.';
    if (hours<min){ const d=min-hours; status=d<=1?'pode melhorar':'muito ruim'; code=d<=1?'rg-warn':'rg-bad';
      advice=d<=1?`Durma ~${d.toFixed(1)}h a mais para atingir ao menos ${min}h.`:`Seu sono está muito abaixo do recomendado (${min}-${max}h). Ajuste horários e reduza telas à noite.`; }
    else if (hours>max){ const d=hours-max; status=d<=1?'pode melhorar':'muito ruim'; code=d<=1?'rg-warn':'rg-bad';
      advice=d<=1?`Reduza ~${d.toFixed(1)}h para ficar em ${min}-${max}h.`:`Sono excessivo pode sinalizar desregulação. Tente rotinas fixas e exposição solar ao acordar.`; }
    return { status, code, advice, range:[min,max] };
  };
  window.initRegulagemPage = function (){
    const form=document.getElementById('rg-form');
    const out=document.getElementById('rg-resultado');
    const idadeEl=document.getElementById('rg-idade');
    const horasEl=document.getElementById('rg-horas');
    const u=getUser();
    try{ const saved=JSON.parse(localStorage.getItem(LS_REG_PREFIX+(u?.id||'guest'))||'null'); if(saved){ idadeEl.value=saved.idade; horasEl.value=saved.horas; } }catch{}
    form.addEventListener('submit',(e)=>{
      e.preventDefault();
      const idade=Number(idadeEl.value), horas=Number(horasEl.value);
      if(!idade||!horas){ showToast('Preencha idade e horas.','error'); return; }
      const r=evalSleepQuality(idade,horas);
      out.style.display='block';
      out.className=`rg-resultado sb-card ${r.code}`;
      out.innerHTML=`<h3>Resultado: <b>${r.status.toUpperCase()}</b></h3>
        <p>Faixa recomendada para sua idade: <b>${r.range[0]}–${r.range[1]} h/dia</b>.</p>
        <p>${r.advice}</p>`;
      localStorage.setItem(LS_REG_PREFIX+(u?.id||'guest'), JSON.stringify({idade,horas,at:Date.now()}));
    });
    document.getElementById('rg-limpar')?.addEventListener('click',()=>{
      idadeEl.value=''; horasEl.value=''; out.style.display='none';
      localStorage.removeItem(LS_REG_PREFIX+(u?.id||'guest'));
    });
  };

  
  window.openCart = openCart;
  window.closeCart = closeCart;
})();

// server.js — SleepBrain (Express + Socket.IO + MySQL2 + bcrypt)
// Backend compatível com o frontend novo (SleepBrain) e rotas herdadas do LabSono.

require('dotenv').config();

const express  = require('express');
const mysql    = require('mysql2');
const bcrypt   = require('bcrypt');
const path     = require('path');
const cors     = require('cors');
const http     = require('http');
const { Server } = require('socket.io');

const app  = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = Number(process.env.SALT_ROUNDS || 10);

// =========================
// DB (MySQL2 Pool + Promise)
// =========================
const pool = mysql.createPool({
  host           : process.env.DB_HOST || 'localhost',
  user           : process.env.DB_USER || 'root',
  password       : process.env.DB_PASS || 'root',
  database       : process.env.DB_NAME || 'sleepbrain',
  waitForConnections: true,
  connectionLimit   : 10,
  queueLimit        : 0,
});

const db = pool.promise();

// =========================
// Socket.IO
// =========================
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// =========================
// Middlewares
// =========================
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));

// Healthcheck
app.get('/health', (_req, res) => res.json({ ok: true, service: 'sleepbrain' }));

// =========================
// Helpers
// =========================
function isAdmin(role) {
  return String(role || '').toLowerCase() === 'admin';
}
function safeInt(x) {
  const n = parseInt(x, 10);
  return Number.isNaN(n) ? null : n;
}

// ===================================================
// 1) AUTENTICAÇÃO — /cadastro e /login
// ===================================================
app.post('/cadastro', async (req, res) => {
  const { nome, email, senha, role } = req.body || {};
  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: 'Preencha todos os campos!' });
  }
  const userRole = (role === 'admin' || role === 'comum') ? role : 'comum';
  try {
    const [dupes] = await db.query('SELECT id FROM usuarios WHERE email = ? LIMIT 1', [email]);
    if (dupes.length > 0) return res.status(409).json({ erro: 'Este email já está cadastrado.' });
    const hash = await bcrypt.hash(senha, SALT_ROUNDS);
    await db.query(
      'INSERT INTO usuarios (nome, email, senha, role, status, data_criacao) VALUES (?, ?, ?, ?, "ativo", NOW())',
      [nome, email, hash, userRole]
    );
    return res.status(201).json({ mensagem: 'Usuário cadastrado com sucesso!' });
  } catch (err) {
    console.error('[CADASTRO] ERRO:', err);
    return res.status(500).json({ erro: 'Erro interno no servidor.' });
  }
});

app.post('/login', async (req, res) => {
  const { email, senha } = req.body || {};
  if (!email || !senha) return res.status(400).json({ erro: 'Preencha todos os campos!' });
  try {
    const [rows] = await db.query('SELECT * FROM usuarios WHERE email = ? LIMIT 1', [email]);
    if (rows.length === 0) return res.status(404).json({ erro: 'Usuário ou senha incorretos.' });
    const usuario = rows[0];
    if (String(usuario.status || '').toLowerCase() === 'banido') {
      return res.status(403).json({ erro: 'Esta conta foi banida. Entre em contato com o suporte.' });
    }
    const ok = await bcrypt.compare(senha, usuario.senha);
    if (!ok) return res.status(401).json({ erro: 'Usuário ou senha incorretos.' });
    return res.json({
      mensagem: 'Login realizado com sucesso!',
      usuario: {
        id   : usuario.id,
        nome : usuario.nome,
        email: usuario.email,
        role : usuario.role,
        status: usuario.status
      }
    });
  } catch (err) {
    console.error('[LOGIN] ERRO:', err);
    return res.status(500).json({ erro: 'Erro interno na autenticação.' });
  }
});

// =====================================
// 2) ADMIN — criar usuário, listar, banir, toggle role, deletar
// =====================================
app.post('/admin/criar-usuario', async (req, res) => {
  const { nome, email, senha, role } = req.body || {};
  if (!nome || !email || !senha || !role) {
    return res.status(400).json({ erro: 'Preencha nome, email, senha e role.' });
  }
  const r = (role === 'admin' || role === 'comum') ? role : 'comum';
  try {
    const [dupes] = await db.query('SELECT id FROM usuarios WHERE email = ? LIMIT 1', [email]);
    if (dupes.length > 0) return res.status(409).json({ erro: 'Email já cadastrado.' });
    const hash = await bcrypt.hash(senha, SALT_ROUNDS);
    const [result] = await db.query(
      'INSERT INTO usuarios (nome, email, senha, role, status, data_criacao) VALUES (?, ?, ?, ?, "ativo", NOW())',
      [nome, email, hash, r]
    );
    return res.status(201).json({ mensagem: `Usuário '${nome}' criado como ${r}.`, userId: result.insertId });
  } catch (err) {
    console.error('[ADMIN][CRIAR] ERRO:', err);
    return res.status(500).json({ erro: 'Erro interno ao criar usuário.' });
  }
});

app.get('/admin/usuarios', async (_req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nome, email, role, status, data_criacao FROM usuarios ORDER BY id DESC'
    );
    return res.json(rows);
  } catch (err) {
    console.error('[ADMIN][USUARIOS] ERRO:', err);
    return res.status(500).json({ erro: 'Erro interno ao buscar usuários.' });
  }
});

app.post('/admin/banir', async (req, res) => {
  const { userId, action } = req.body || {};
  const id = safeInt(userId);
  if (!id) return res.status(400).json({ erro: 'ID inválido.' });
  const newStatus = action === 'ban' ? 'banido' : (action === 'unban' ? 'ativo' : null);
  if (!newStatus) return res.status(400).json({ erro: 'Ação inválida.' });
  try {
    const [upd] = await db.query('UPDATE usuarios SET status = ? WHERE id = ?', [newStatus, id]);
    if (upd.affectedRows === 0) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    return res.json({ mensagem: `Usuário ${id} foi ${newStatus === 'banido' ? 'banido' : 'ativado'}.` });
  } catch (err) {
    console.error('[ADMIN][BANIR] ERRO:', err);
    return res.status(500).json({ erro: 'Erro interno ao atualizar status.' });
  }
});

app.post('/admin/toggle-role/:id', async (req, res) => {
  const id = safeInt(req.params.id);
  if (!id) return res.status(400).json({ erro: 'ID inválido.' });
  try {
    const [[u]] = await db.query('SELECT id, role FROM usuarios WHERE id = ? LIMIT 1', [id]);
    if (!u) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    const next = String(u.role) === 'admin' ? 'comum' : 'admin';
    await db.query('UPDATE usuarios SET role = ? WHERE id = ?', [next, id]);
    return res.json({ mensagem: `Função alterada para ${next}.`, role: next });
  } catch (err) {
    console.error('[ADMIN][TOGGLE_ROLE] ERRO:', err);
    return res.status(500).json({ erro: 'Erro ao alterar função.' });
  }
});

app.delete('/admin/usuarios/:id', async (req, res) => {
  const id = safeInt(req.params.id);
  if (!id) return res.status(400).json({ erro: 'ID inválido.' });
  try {
    const [rows] = await db.query('SELECT id FROM usuarios WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    const [del] = await db.query('DELETE FROM usuarios WHERE id = ? LIMIT 1', [id]);
    if (del.affectedRows === 0) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    return res.json({ mensagem: 'Usuário excluído pelo admin.' });
  } catch (err) {
    console.error('[ADMIN][DELETE] ERRO:', err);
    return res.status(500).json({ erro: 'Erro ao excluir usuário.' });
  }
});

// =================================
// 3) ARTIGOS — buscar, publicar, deletar
// =================================
app.get('/buscar-artigos', async (_req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT a.id, a.titulo, a.descricao, a.url, a.fonte, a.autor_id, a.data_criacao,
             u.nome AS nome_autor
      FROM artigos a
      JOIN usuarios u ON a.autor_id = u.id
      ORDER BY a.data_criacao DESC
    `);
    return res.json(rows);
  } catch (err) {
    console.error('[ARTIGOS][GET] ERRO:', err);
    return res.status(500).json({ erro: 'Falha ao buscar artigos.' });
  }
});

app.post('/artigo/publicar', async (req, res) => {
  const { titulo, descricao, url, fonte, autor_id } = req.body || {};
  const autorId = safeInt(autor_id);
  if (!titulo || !descricao || !url || !autorId) {
    return res.status(400).json({ erro: 'Preencha todos os campos obrigatórios.' });
  }
  try {
    const [users] = await db.query('SELECT id, status FROM usuarios WHERE id = ? LIMIT 1', [autorId]);
    if (users.length === 0) return res.status(404).json({ erro: 'Autor não encontrado.' });
    if (String(users[0].status).toLowerCase() === 'banido') {
      return res.status(403).json({ erro: 'Usuário banido não pode publicar.' });
    }
    const [ins] = await db.query(
      'INSERT INTO artigos (titulo, descricao, url, fonte, autor_id, data_criacao) VALUES (?, ?, ?, ?, ?, NOW())',
      [titulo, descricao, url, fonte || null, autorId]
    );
    return res.status(201).json({ mensagem: 'Publicado com sucesso!', id: ins.insertId });
  } catch (err) {
    console.error('[ARTIGOS][POST] ERRO:', err);
    return res.status(500).json({ erro: 'Erro ao publicar artigo.' });
  }
});

app.delete('/artigo/deletar/:id', async (req, res) => {
  const artigoId = safeInt(req.params.id);
  const userId   = safeInt((req.body || {}).userId);
  if (!artigoId) return res.status(400).json({ erro: 'ID de artigo inválido.' });
  if (!userId)   return res.status(401).json({ erro: 'Usuário não autenticado.' });

  try {
    const [[usuario]] = await db.query('SELECT id, role FROM usuarios WHERE id = ? LIMIT 1', [userId]);
    if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado.' });

    const [[art]] = await db.query('SELECT id, autor_id FROM artigos WHERE id = ? LIMIT 1', [artigoId]);
    if (!art) return res.status(404).json({ erro: 'Artigo não encontrado.' });

    const pode = isAdmin(usuario.role) || Number(art.autor_id) === Number(usuario.id);
    if (!pode) return res.status(403).json({ erro: 'Acesso negado.' });

    const [del] = await db.query('DELETE FROM artigos WHERE id = ? LIMIT 1', [artigoId]);
    if (del.affectedRows === 0) return res.status(404).json({ erro: 'Artigo não encontrado.' });

    return res.json({ mensagem: 'Artigo deletado com sucesso!' });
  } catch (err) {
    console.error('[ARTIGOS][DELETE] ERRO:', err);
    return res.status(500).json({ erro: 'Erro ao deletar artigo.' });
  }
});

// =====================================
// 4) CHAT — HTTP endpoints
// =====================================
app.get('/chat/contatos/:userId', async (req, res) => {
  const uid = safeInt(req.params.userId);
  if (!uid) return res.status(400).json({ erro: 'ID inválido.' });
  try {
    const [rows] = await db.query(`
      SELECT id, nome, email, role, status
      FROM usuarios
      WHERE id != ? AND status = 'ativo'
      ORDER BY nome ASC
    `, [uid]);
    return res.json(rows);
  } catch (err) {
    console.error('[CHAT][CONTATOS] ERRO:', err);
    return res.status(500).json({ erro: 'Erro ao buscar contatos.' });
  }
});

app.get('/chat/historico/:userAId/:userBId', async (req, res) => {
  const a = safeInt(req.params.userAId);
  const b = safeInt(req.params.userBId);
  if (!a || !b) return res.status(400).json({ erro: 'IDs inválidos.' });
  try {
    const [rows] = await db.query(`
      SELECT m.id, m.remetente_id, m.destinatario_id, m.conteudo, m.data_envio, m.lida,
             ur.nome AS nome_remetente
      FROM mensagens m
      JOIN usuarios ur ON ur.id = m.remetente_id
      WHERE (m.remetente_id = ? AND m.destinatario_id = ?)
         OR (m.remetente_id = ? AND m.destinatario_id = ?)
      ORDER BY m.data_envio ASC
    `, [a, b, b, a]);
    return res.json(rows);
  } catch (err) {
    console.error('[CHAT][HISTORICO] ERRO:', err);
    return res.status(500).json({ erro: 'Erro ao buscar histórico.' });
  }
});

app.get('/chat/mensagens/:userId', async (req, res) => {
  const uid = safeInt(req.params.userId);
  if (!uid) return res.status(400).json({ erro: 'ID inválido.' });
  try {
    const [rows] = await db.query(`
      SELECT m.id, m.remetente_id, m.conteudo, m.data_envio, m.lida,
             ur.nome AS nome_remetente
      FROM mensagens m
      JOIN usuarios ur ON ur.id = m.remetente_id
      WHERE m.destinatario_id = ? AND m.lida = 0
      ORDER BY m.data_envio DESC
    `, [uid]);
    return res.json({ mensagensNaoLidas: rows });
  } catch (err) {
    console.error('[CHAT][NAO_LIDAS] ERRO:', err);
    return res.status(500).json({ erro: 'Erro ao buscar mensagens.' });
  }
});

app.post('/chat/marcar-lida', async (req, res) => {
  const { remetenteId, destinatarioId } = req.body || {};
  const r = safeInt(remetenteId), d = safeInt(destinatarioId);
  if (!r || !d) return res.status(400).json({ erro: 'IDs inválidos.' });
  try {
    const [upd] = await db.query(
      'UPDATE mensagens SET lida = 1 WHERE remetente_id = ? AND destinatario_id = ? AND lida = 0',
      [r, d]
    );
    return res.json({ mensagem: `${upd.affectedRows} mensagens marcadas como lidas.` });
  } catch (err) {
    console.error('[CHAT][MARCAR_LIDA] ERRO:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
});

// =========================
// 5) USUÁRIO — perfil (GET/PUT/DELETE)
// =========================
app.get('/usuario/:id', async (req, res) => {
  const id = safeInt(req.params.id);
  if (!id) return res.status(400).json({ erro: 'ID inválido.' });
  try {
    const [rows] = await db.query(
      'SELECT id, nome, email, role, status, data_criacao FROM usuarios WHERE id = ? LIMIT 1',
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('[USUARIO][GET] ERRO:', err);
    return res.status(500).json({ erro: 'Erro ao buscar usuário.' });
  }
});

app.put('/usuario/:id', async (req, res) => {
  const id = safeInt(req.params.id);
  if (!id) return res.status(400).json({ erro: 'ID inválido.' });
  const { nome, email, senhaAtual, novaSenha } = req.body || {};
  if (!nome && !email && !novaSenha) {
    return res.status(400).json({ erro: 'Envie ao menos um campo para atualizar.' });
  }
  try {
    const [[usuario]] = await db.query('SELECT * FROM usuarios WHERE id = ? LIMIT 1', [id]);
    if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado.' });

    if (email && email !== usuario.email) {
      const [dupes] = await db.query('SELECT id FROM usuarios WHERE email = ? AND id <> ? LIMIT 1', [email, id]);
      if (dupes.length > 0) return res.status(409).json({ erro: 'Este e-mail já está em uso.' });
    }

    let senhaHash = null;
    if (novaSenha) {
      if (!senhaAtual) return res.status(400).json({ erro: 'Informe a senha atual para definir uma nova senha.' });
      const ok = await bcrypt.compare(senhaAtual, usuario.senha);
      if (!ok) return res.status(401).json({ erro: 'Senha atual incorreta.' });
      senhaHash = await bcrypt.hash(novaSenha, SALT_ROUNDS);
    }

    const fields = [], params = [];
    if (nome)      { fields.push('nome = ?');  params.push(nome); }
    if (email)     { fields.push('email = ?'); params.push(email); }
    if (senhaHash) { fields.push('senha = ?'); params.push(senhaHash); }
    if (fields.length === 0) return res.status(400).json({ erro: 'Nada para atualizar.' });

    params.push(id);
    await db.query(`UPDATE usuarios SET ${fields.join(', ')} WHERE id = ?`, params);

    const [[updated]] = await db.query(
      'SELECT id, nome, email, role, status FROM usuarios WHERE id = ? LIMIT 1', [id]
    );

    return res.json({ mensagem: 'Perfil atualizado com sucesso!', usuario: updated });
  } catch (err) {
    console.error('[USUARIO][PUT] ERRO:', err);
    return res.status(500).json({ erro: 'Erro ao atualizar perfil.' });
  }
});

app.delete('/usuario/:id', async (req, res) => {
  const id = safeInt(req.params.id);
  const requesterId = safeInt((req.body || {}).requesterId) || safeInt(req.query.requesterId) || safeInt(req.headers['x-requester-id']);
  if (!id) return res.status(400).json({ erro: 'ID inválido.' });
  if (!requesterId || requesterId !== id) return res.status(403).json({ erro: 'Operação não permitida.' });
  try {
    const [rows] = await db.query('SELECT id FROM usuarios WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    const [del] = await db.query('DELETE FROM usuarios WHERE id = ? LIMIT 1', [id]);
    if (del.affectedRows === 0) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    return res.json({ mensagem: 'Sua conta foi excluída com sucesso.' });
  } catch (err) {
    console.error('[USUARIO][DELETE] ERRO:', err);
    return res.status(500).json({ erro: 'Erro ao excluir conta.' });
  }
});

// =====================================
// 6) Fallback SPA
// =====================================
app.get('*', (req, res) => {
  if (!req.path.includes('.')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  res.sendFile(path.join(__dirname, 'public', req.path));
});

// =========================
// Socket.IO
// =========================
const usersOnline = new Map();
io.on('connection', (socket) => {
  socket.on('register', (userId) => {
    usersOnline.set(Number(userId), socket.id);
  });
  socket.on('chat:message', async (payload) => {
    const { remetenteId, destinatarioId, nomeRemetente, conteudo } = payload || {};
    const r = parseInt(remetenteId,10), d = parseInt(destinatarioId,10);
    if (!r || !d || !conteudo) return;
    try {
      await db.query('INSERT INTO mensagens (remetente_id, destinatario_id, conteudo, lida) VALUES (?, ?, ?, 0)', [r, d, conteudo]);
      const destSocket = usersOnline.get(d);
      const messagePayload = { remetente_id: r, nome_remetente: nomeRemetente, conteudo, data_envio: new Date().toISOString() };
      if (destSocket) io.to(destSocket).emit('chat:notification', messagePayload);
    } catch (err) {
      console.error('[SOCKET][MSG] ERRO:', err);
      socket.emit('chat:error', 'Falha ao enviar a mensagem.');
    }
  });
  socket.on('disconnect', () => {
    for (const [uid, sid] of usersOnline.entries()) {
      if (sid === socket.id) { usersOnline.delete(uid); break; }
    }
  });
});

server.listen(PORT, () => {
  console.log(`SleepBrain rodando: http://localhost:${PORT}`);
});

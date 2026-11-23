const path = require('path');
const express = require('express');
const session = require('express-session');
const ejs = require('ejs');
const { execSync } = require('child_process');
const app = express();
const BD = require('./db');

// Motor de conversão EJS (Views)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'Views'));

// Arquivos estáticos (CSS, Imagens, JS)
app.use(express.static(path.join(__dirname, 'Public')));

// Middlewares para leitura de formulários e JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Configuração de Sessão
app.use(session({
    secret: 'SESISENAI_PAPELARIA_CHAVE_SECRETA',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

// Middleware global para disponibilizar dados de sessão e auxiliares nas views EJS
app.use((req, res, next) => {
    const usuario = req.session.usuario || null;
    if (!Array.isArray(req.session.carrinho)) {
        req.session.carrinho = [];
    }

    const totalItens = req.session.carrinho.reduce((soma, item) => soma + item.quantidade, 0);

    res.locals.usuario = usuario;
    res.locals.tipoUsuario = usuario ? (usuario.tipo === 'admin' ? 'Administrador' : 'Cliente') : null;
    res.locals.carrinhoQtd = totalItens;
    res.locals.qtdCarrinho = totalItens;
    res.locals.moeda = (valor) =>
        Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    next();
});

// Middlewares de Restrição de Acesso
function exigirLogin(req, res, next) {
    if (!req.session.usuario) {
        return res.redirect('/login');
    }
    next();
}

function exigirAdmin(req, res, next) {
    if (!req.session.usuario) {
        return res.redirect('/login');
    }
    if (req.session.usuario.tipo !== 'admin') {
        return res.status(403).send('Acesso restrito a administradores.');
    }
    next();
}

// ---------------------- ROTAS PÚBLICAS & AUTENTICAÇÃO ----------------------

// Landing Page (RN05: apenas produtos ativos)
app.get('/', async (req, res) => {
    try {
        const resultado = await BD.query(`
            SELECT id, nome, preco, estoque, imagem_url, ativo
            FROM produtos 
            WHERE ativo = true 
            ORDER BY id DESC LIMIT 8
        `);
        res.render('landing/index', { produtosAtivos: resultado.rows, produtos: resultado.rows });
    } catch (erro) {
        console.error('Erro ao carregar a página inicial:', erro);
        res.render('landing/index', { produtosAtivos: [], produtos: [] });
    }
});

// Tela de Login
app.get('/login', (req, res) => {
    res.render('login', { erro: null });
});

// Processar Login (RN03: apenas usuários ativos - situacao = 1)
app.post('/login', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const senha = String(req.body.senha || '');

    if (!email || !senha) {
        return res.render('login', { erro: 'Informe e-mail e senha!' });
    }

    try {
        const resultado = await BD.query(`
            SELECT id, nome, email, tipo, situacao
            FROM usuarios 
            WHERE email = $1 AND senha = $2
        `, [email, senha]);

        if (resultado.rows.length === 0) {
            return res.render('login', { erro: 'E-mail ou senha inválidos!' });
        }

        const usuario = resultado.rows[0];

        if (usuario.situacao !== 1) {
            return res.render('login', { erro: 'Esta conta está inativa. Contate o administrador.' });
        }

        req.session.usuario = {
            id: usuario.id,
            nome: usuario.nome,
            email: usuario.email,
            tipo: usuario.tipo
        };

        res.redirect(usuario.tipo === 'admin' ? '/dashboard' : '/catalogo');
    } catch (erro) {
        console.error('Erro ao realizar login:', erro);
        res.status(500).send('Erro interno do servidor ao autenticar.');
    }
});

// Tela de Cadastro
app.get('/cadastro', (req, res) => {
    res.render('cadastro', { erro: null });
});

// Processar Criação de Nova Conta (RN01, RN02, RN03)
app.post('/cadastro', async (req, res) => {
    const nome = String(req.body.nome || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const senha = String(req.body.senha || '');

    if (!nome || !email || !senha) {
        return res.render('cadastro', { erro: 'Por favor, preencha nome, e-mail e senha!' });
    }

    try {
        const usuarioExiste = await BD.query('SELECT id FROM usuarios WHERE email = $1', [email]);
        if (usuarioExiste.rows.length > 0) {
            return res.render('cadastro', { erro: 'Este e-mail já está cadastrado no sistema!' });
        }

        const novoUsuario = await BD.query(`
            INSERT INTO usuarios (nome, email, senha, tipo, situacao)
            VALUES ($1, $2, $3, 'cliente', 1)
            RETURNING id, nome, email, tipo
        `, [nome, email, senha]);

        req.session.usuario = novoUsuario.rows[0];
        res.redirect('/catalogo');
    } catch (erro) {
        console.error('Erro ao cadastrar novo usuário:', erro);
        res.render('cadastro', { erro: 'Erro no servidor ao tentar criar a conta.' });
    }
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

// ---------------------- ROTAS DO CARRINHO DE COMPRAS ----------------------

// Exibir Página do Carrinho (RN05, RN13)
app.get('/carrinho', async (req, res) => {
    const carrinho = req.session.carrinho || [];
    const totalCarrinho = carrinho.reduce((acc, item) => acc + (item.preco_unitario * item.quantidade), 0);

    try {
        const sugeridosRes = await BD.query(
            'SELECT id, nome, preco, estoque, imagem_url FROM produtos WHERE ativo = true AND estoque > 0 ORDER BY RANDOM() LIMIT 6'
        );

        res.render('landing/carrinho', {
            carrinho,
            totalCarrinho,
            sugeridos: sugeridosRes.rows,
            erro: req.query.erro || null
        });
    } catch (erro) {
        console.error('Erro ao carregar o carrinho:', erro);
        res.render('landing/carrinho', {
            carrinho,
            totalCarrinho,
            sugeridos: [],
            erro: null
        });
    }
});

// Adicionar Produto ao Carrinho (RN05, RN12, RN14 - aceita produto_id e produtoId)
app.post('/carrinho/adicionar', async (req, res) => {
    const produtoId = parseInt(req.body.produto_id || req.body.produtoId, 10);
    const qtd = parseInt(req.body.quantidade, 10) || 1;
    const observacoes = String(req.body.observacoes || '').trim();

    if (!produtoId || qtd <= 0) {
        return res.redirect('/catalogo');
    }

    try {
        const resultado = await BD.query(
            'SELECT id, nome, preco, estoque, imagem_url, ativo FROM produtos WHERE id = $1 AND ativo = true',
            [produtoId]
        );

        if (resultado.rows.length === 0) {
            return res.redirect('/catalogo');
        }

        const produto = resultado.rows[0];

        if (produto.estoque <= 0) {
            return res.redirect('/catalogo');
        }

        const carrinho = req.session.carrinho;
        const itemExistente = carrinho.find(item => item.produto_id === produto.id);

        if (itemExistente) {
            const novaQtd = itemExistente.quantidade + qtd;
            itemExistente.quantidade = novaQtd <= produto.estoque ? novaQtd : produto.estoque;
            itemExistente.preco_unitario = parseFloat(produto.preco);
            itemExistente.estoque_max = produto.estoque;
            if (observacoes) {
                itemExistente.observacoes = observacoes;
            }
        } else {
            carrinho.push({
                produto_id: produto.id,
                nome: produto.nome,
                imagem_url: produto.imagem_url || '/IMG/Landing/placeholder.png',
                preco_unitario: parseFloat(produto.preco),
                quantidade: qtd <= produto.estoque ? qtd : produto.estoque,
                estoque_max: produto.estoque,
                observacoes
            });
        }

        res.redirect('/carrinho');
    } catch (erro) {
        console.error('Erro ao adicionar produto ao carrinho:', erro);
        res.redirect('/catalogo');
    }
});

// Atualizar Quantidade no Carrinho (+ / -)
app.post('/carrinho/atualizar', (req, res) => {
    const produtoId = parseInt(req.body.produto_id || req.body.produtoId, 10);
    const acao = req.body.acao;
    const carrinho = req.session.carrinho;
    const index = carrinho.findIndex(item => item.produto_id === produtoId);

    if (index !== -1) {
        if (acao === 'aumentar' && carrinho[index].quantidade < carrinho[index].estoque_max) {
            carrinho[index].quantidade += 1;
        } else if (acao === 'diminuir') {
            carrinho[index].quantidade -= 1;
            if (carrinho[index].quantidade <= 0) {
                carrinho.splice(index, 1);
            }
        }
    }

    res.redirect('/carrinho');
});

// Remover Item do Carrinho
app.post('/carrinho/remover/:id', (req, res) => {
    const produtoId = parseInt(req.params.id, 10);
    req.session.carrinho = req.session.carrinho.filter(item => item.produto_id !== produtoId);
    res.redirect('/carrinho');
});

// ---------------------- ROTAS DE PEDIDOS & CHECKOUT ----------------------

// Finalizar Compra (RN05 a RN15 - Transação Atômica)
app.post('/pedidos/finalizar', exigirLogin, async (req, res) => {
    const usuarioId = req.session.usuario.id;
    const carrinho = req.session.carrinho || [];

    if (carrinho.length === 0) {
        return res.redirect('/carrinho?erro=Seu carrinho está vazio.');
    }

    const client = await BD.connect();

    try {
        await client.query('BEGIN');

        let totalPedido = 0;
        const itensValidados = [];

        for (const item of carrinho) {
            if (!item.quantidade || item.quantidade <= 0) {
                throw new Error(`Quantidade inválida para o produto: ${item.nome}`);
            }

            const prodRes = await client.query(
                'SELECT id, nome, preco, estoque, ativo FROM produtos WHERE id = $1 FOR UPDATE',
                [item.produto_id]
            );

            if (prodRes.rows.length === 0 || !prodRes.rows[0].ativo) {
                throw new Error(`O produto "${item.nome}" não está mais disponível para compra.`);
            }

            const prodBanco = prodRes.rows[0];

            if (prodBanco.estoque < item.quantidade) {
                throw new Error(`Estoque insuficiente para "${prodBanco.nome}". Disponível: ${prodBanco.estoque} un.`);
            }

            const precoMomento = parseFloat(prodBanco.preco);
            totalPedido += precoMomento * item.quantidade;

            itensValidados.push({
                produto_id: prodBanco.id,
                quantidade: item.quantidade,
                preco_unitario: precoMomento
            });
        }

        const pedidoRes = await client.query(
            `INSERT INTO pedidos (usuario_id, total, status, criado_em) 
             VALUES ($1, $2, 'pendente', NOW()) RETURNING id`,
            [usuarioId, totalPedido.toFixed(2)]
        );
        const pedidoId = pedidoRes.rows[0].id;

        for (const item of itensValidados) {
            await client.query(
                `INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, preco_unitario) 
                 VALUES ($1, $2, $3, $4)`,
                [pedidoId, item.produto_id, item.quantidade, item.preco_unitario]
            );

            await client.query(
                `UPDATE produtos SET estoque = estoque - $1 WHERE id = $2`,
                [item.quantidade, item.produto_id]
            );
        }

        await client.query('COMMIT');
        req.session.carrinho = [];
        res.redirect('/meus-pedidos?sucesso=1');
    } catch (erro) {
        await client.query('ROLLBACK');
        console.error('Erro ao finalizar pedido:', erro);
        res.redirect('/carrinho?erro=' + encodeURIComponent(erro.message));
    } finally {
        client.release();
    }
});

// Histórico de Pedidos do Cliente com progressão automática por tempo (RN08, RN10)
app.get('/meus-pedidos', exigirLogin, async (req, res) => {
    const usuarioId = req.session.usuario.id;

    try {
        // Atualiza automaticamente no PostgreSQL conforme o tempo decorrido:
        // >= 20 min (1200s) -> 'pago' | >= 30 min (20 + 10 min = 1800s) -> 'enviado'
        await BD.query(`
            UPDATE pedidos
            SET status = CASE
                WHEN EXTRACT(EPOCH FROM (NOW() - criado_em)) >= 1800 THEN 'enviado'
                WHEN EXTRACT(EPOCH FROM (NOW() - criado_em)) >= 1200 THEN 'pago'
                ELSE status
            END
            WHERE usuario_id = $1
              AND status IN ('pendente', 'pago')
              AND EXTRACT(EPOCH FROM (NOW() - criado_em)) >= 1200
        `, [usuarioId]);

        const pedidosRes = await BD.query(
            'SELECT * FROM pedidos WHERE usuario_id = $1 ORDER BY criado_em DESC',
            [usuarioId]
        );

        const pedidos = pedidosRes.rows;

        for (let pedido of pedidos) {
            const itensRes = await BD.query(
                `SELECT pi.quantidade, pi.preco_unitario, pr.nome, pr.imagem_url 
                 FROM pedido_itens pi 
                 JOIN produtos pr ON pi.produto_id = pr.id 
                 WHERE pi.pedido_id = $1`,
                [pedido.id]
            );
            pedido.itens = itensRes.rows;
        }

        res.render('landing/meus-pedidos', {
            pedidos,
            sucesso: req.query.sucesso || null,
            excluido: req.query.excluido || null
        });
    } catch (erro) {
        console.error('Erro ao buscar pedidos do cliente:', erro);
        res.status(500).send('Erro ao carregar seus pedidos.');
    }
});

// Excluir Pedido do Cliente (Devolve estoque e remove do banco em transação)
app.post('/meus-pedidos/excluir/:id', exigirLogin, async (req, res) => {
    const pedidoId = parseInt(req.params.id, 10);
    const usuarioId = req.session.usuario.id;

    if (isNaN(pedidoId)) {
        return res.redirect('/meus-pedidos');
    }

    const client = await BD.connect();
    try {
        await client.query('BEGIN');

        const pedidoRes = await client.query(
            'SELECT id, status FROM pedidos WHERE id = $1 AND usuario_id = $2 FOR UPDATE',
            [pedidoId, usuarioId]
        );

        if (pedidoRes.rows.length > 0) {
            const pedido = pedidoRes.rows[0];

            // Se o pedido não estava cancelado, devolve os itens ao estoque
            if (pedido.status !== 'cancelado') {
                const itensRes = await client.query(
                    'SELECT produto_id, quantidade FROM pedido_itens WHERE pedido_id = $1',
                    [pedidoId]
                );

                for (const item of itensRes.rows) {
                    await client.query(
                        'UPDATE produtos SET estoque = estoque + $1 WHERE id = $2',
                        [item.quantidade, item.produto_id]
                    );
                }
            }

            await client.query('DELETE FROM pedido_itens WHERE pedido_id = $1', [pedidoId]);
            await client.query('DELETE FROM pedidos WHERE id = $1 AND usuario_id = $2', [pedidoId, usuarioId]);
        }

        await client.query('COMMIT');
        res.redirect('/meus-pedidos?excluido=1');
    } catch (erro) {
        await client.query('ROLLBACK');
        console.error('Erro ao excluir pedido:', erro);
        res.redirect('/meus-pedidos');
    } finally {
        client.release();
    }
});

// Alias de compatibilidade caso algum link antigo aponte para /pedidos/meus
app.get('/pedidos/meus', exigirLogin, (req, res) => {
    res.redirect('/meus-pedidos');
});

// ---------------------- PAINEL ADMINISTRATIVO (DASHBOARD) ----------------------

app.get('/admin', exigirAdmin, (req, res) => {
    res.redirect('/dashboard');
});

app.get('/dashboard', exigirAdmin, async (req, res) => {
    try {
        const [
            totalProdutos,
            totalPedidos,
            totalVendas,
            pedidosStatus,
            estoqueBaixo,
            maisVendidos
        ] = await Promise.all([
            BD.query(`SELECT COUNT(*)::int AS total FROM produtos WHERE ativo = true`),
            BD.query(`SELECT COUNT(*)::int AS total FROM pedidos WHERE status <> 'cancelado'`),
            BD.query(`SELECT COALESCE(SUM(total), 0) AS total FROM pedidos WHERE status IN ('pago', 'enviado')`),
            BD.query(`SELECT status, COUNT(*)::int AS total FROM pedidos GROUP BY status ORDER BY status`),
            BD.query(`SELECT id, nome, estoque FROM produtos WHERE ativo = true AND estoque <= 5 ORDER BY estoque, nome LIMIT 10`),
            BD.query(`
                SELECT p.nome, SUM(pi.quantidade)::int AS total
                FROM pedido_itens pi
                INNER JOIN produtos p ON p.id = pi.produto_id
                INNER JOIN pedidos pe ON pe.id = pi.pedido_id
                WHERE pe.status IN ('pago', 'enviado')
                GROUP BY p.id, p.nome
                ORDER BY total DESC LIMIT 5
            `)
        ]);

        res.render('dashboard', {
            usuario: req.session.usuario,
            totalProdutos: totalProdutos.rows[0].total,
            totalPedidos: totalPedidos.rows[0].total,
            totalVendas: totalVendas.rows[0].total,
            pedidosStatus: pedidosStatus.rows,
            estoqueBaixo: estoqueBaixo.rows,
            maisVendidos: maisVendidos.rows
        });
    } catch (erro) {
        console.error('Erro ao carregar o Dashboard:', erro);
        res.status(500).send('Erro ao carregar o painel administrativo.');
    }
});

// ---------------------- ROTA DIRETA DE EDIÇÃO DE PRODUTO ----------------------

const TEMPLATE_EDITAR_PRODUTO = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Editar Produto - The Office Papelaria</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
    <link rel="stylesheet" href="/CSS/editar-produto.pt.css">
</head>
<body>
    <header class="top-header">
        <div class="header-inner">
            <div class="logo"><a href="/"><img src="/IMG/Landing/logo.png" alt="The Office Papelaria"></a></div>
            <nav class="main-nav">
                <ul>
                    <li><a href="/">Início</a></li>
                    <li><a href="/#sobre">Sobre nós</a></li>
                    <li><a href="/catalogo">Produtos</a></li>
                    <li><a href="/dashboard">Painel Admin</a></li>
                </ul>
            </nav>
            <div class="header-right">
                <div class="header-search">
                    <i class="bi bi-search"></i>
                    <input type="text" placeholder="Buscar na loja..." disabled>
                </div>
                <div class="header-icons">
                    <a href="/meus-pedidos" title="Meus Pedidos"><i class="bi bi-person"></i></a>
                    <a href="/carrinho" class="cart-btn" title="Carrinho">
                        <i class="bi bi-cart3"></i>
                        <% if (typeof qtdCarrinho !== 'undefined' && qtdCarrinho > 0) { %>
                            <span class="cart-badge"><%= qtdCarrinho %></span>
                        <% } %>
                    </a>
                </div>
            </div>
        </div>
    </header>

    <main class="edit-container">
        <a href="/produtos" class="back-link"><i class="bi bi-arrow-left"></i> Voltar para gerenciar produtos</a>
        <div class="page-heading">
            <h1>Editar produto</h1>
            <p>Altere as informações de cadastro e estoque do produto abaixo.</p>
        </div>

        <% if (typeof erro !== 'undefined' && erro) { %>
            <div class="alert-error"><i class="bi bi-exclamation-circle-fill"></i><span><%= erro %></span></div>
        <% } %>

        <div class="edit-card">
            <div class="gallery-col">
                <div class="main-image-box">
                    <img id="imagemPrincipal" src="<%= produto.imagem_url || '/IMG/Landing/placeholder.png' %>" alt="<%= produto.nome %>">
                </div>
                <div class="thumbs-row">
                    <% const imgAtual = produto.imagem_url || '/IMG/Landing/placeholder.png'; %>
                    <button type="button" class="thumb-btn active" onclick="atualizarPreviewImagem()"><img id="thumb1" src="<%= imgAtual %>" alt="Miniatura 1"></button>
                    <button type="button" class="thumb-btn" onclick="atualizarPreviewImagem()"><img id="thumb2" src="<%= imgAtual %>" alt="Miniatura 2"></button>
                    <button type="button" class="thumb-btn" onclick="atualizarPreviewImagem()"><img id="thumb3" src="<%= imgAtual %>" alt="Miniatura 3"></button>
                    <button type="button" class="thumb-btn" onclick="atualizarPreviewImagem()"><img id="thumb4" src="<%= imgAtual %>" alt="Miniatura 4"></button>
                </div>
            </div>

            <div class="details-col">
                <form id="formEditarProduto" action="/produtos/editar/<%= produto.id %>" method="POST" class="edit-form">
                    <div class="field-block">
                        <label for="nomeProduto">Nome do produto</label>
                        <input type="text" id="nomeProduto" name="nome" class="input-title-style" value="<%= produto.nome %>" required>
                    </div>

                    <div class="info-row">
                        <span class="info-label">Estoque</span>
                        <div class="qty-control">
                            <button type="button" class="qty-btn" onclick="alterarEstoque(-1)">&minus;</button>
                            <input type="number" id="inputEstoque" name="estoque" value="<%= produto.estoque %>" min="0" required oninput="atualizarValorTotalEstoque()">
                            <button type="button" class="qty-btn" onclick="alterarEstoque(1)">+</button>
                        </div>
                        <span class="stock-hint">unidades disponíveis</span>
                    </div>

                    <div class="info-row">
                        <label for="inputPreco" class="info-label">Preço unitário</label>
                        <div class="price-input-box">
                            <span>R$</span>
                            <input type="number" id="inputPreco" name="preco" step="0.01" min="0" value="<%= Number(produto.preco).toFixed(2) %>" required oninput="atualizarValorTotalEstoque()">
                        </div>
                    </div>

                    <div class="info-row">
                        <span class="info-label">Valor em estoque</span>
                        <span class="info-value" id="valorTotalEstoque"><%= moeda(produto.preco * produto.estoque) %></span>
                    </div>

                    <div class="info-row">
                        <label for="selectAtivo" class="info-label">Status na loja</label>
                        <select id="selectAtivo" name="ativo" class="select-status">
                            <option value="true" <%= produto.ativo ? 'selected' : '' %>>Ativo (disponível para compra)</option>
                            <option value="false" <%= !produto.ativo ? 'selected' : '' %>>Inativo (oculto da vitrine)</option>
                        </select>
                    </div>

                    <div class="obs-group">
                        <label for="inputImagemUrl">URL da imagem</label>
                        <input type="text" id="inputImagemUrl" name="imagem_url" class="input-url" value="<%= produto.imagem_url || '' %>" placeholder="/IMG/Landing/nome-da-imagem.png" oninput="atualizarPreviewImagem()">
                    </div>

                    <div class="card-internal-actions">
                        <button type="submit" formaction="/produtos/excluir/<%= produto.id %>" formmethod="POST" class="btn-remove-item" onclick="return confirm('Tem certeza que deseja excluir este produto?');">
                            <i class="bi bi-trash3"></i> Excluir produto
                        </button>
                        <button type="button" class="btn-restore-default" onclick="restaurarOriginal()">
                            <i class="bi bi-arrow-clockwise"></i> Restaurar padrão
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <div class="bottom-actions">
            <a href="/produtos" class="btn-continue"><i class="bi bi-arrow-left"></i> Cancelar e voltar</a>
            <button type="submit" form="formEditarProduto" class="btn-save-changes">Salvar alterações <i class="bi bi-check2"></i></button>
        </div>
    </main>

    <script id="dados-produto-json" type="application/json"><%- JSON.stringify({
        nome: produto.nome,
        preco: Number(produto.preco).toFixed(2),
        estoque: Number(produto.estoque),
        ativo: produto.ativo ? 'true' : 'false',
        imagem_url: produto.imagem_url || ''
    }) %></script>

    <script>
        const dadosOriginais = JSON.parse(document.getElementById('dados-produto-json').textContent);
        function formatarMoeda(valor) { return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
        function atualizarValorTotalEstoque() {
            const preco = Math.max(0, parseFloat(document.getElementById('inputPreco').value) || 0);
            const estoque = Math.max(0, parseInt(document.getElementById('inputEstoque').value, 10) || 0);
            document.getElementById('valorTotalEstoque').textContent = formatarMoeda(preco * estoque);
        }
        function alterarEstoque(delta) {
            const input = document.getElementById('inputEstoque');
            let novo = (parseInt(input.value, 10) || 0) + delta;
            if (novo < 0) novo = 0;
            input.value = novo;
            atualizarValorTotalEstoque();
        }
        function atualizarPreviewImagem() {
            const url = document.getElementById('inputImagemUrl').value.trim() || '/IMG/Landing/placeholder.png';
            document.getElementById('imagemPrincipal').src = url;
            ['thumb1', 'thumb2', 'thumb3', 'thumb4'].forEach(id => { document.getElementById(id).src = url; });
        }
        function restaurarOriginal() {
            document.getElementById('nomeProduto').value = dadosOriginais.nome;
            document.getElementById('inputPreco').value = dadosOriginais.preco;
            document.getElementById('inputEstoque').value = dadosOriginais.estoque;
            document.getElementById('selectAtivo').value = dadosOriginais.ativo;
            document.getElementById('inputImagemUrl').value = dadosOriginais.imagem_url;
            atualizarValorTotalEstoque();
            atualizarPreviewImagem();
        }
    </script>
</body>
</html>`;

app.get(['/produtos/editar/:id', '/produtos/:id/editar', '/editar-produto/:id', '/catalogar/editar/:id'], exigirAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.redirect('/produtos');

    try {
        const resultado = await BD.query('SELECT * FROM produtos WHERE id = $1', [id]);
        if (resultado.rows.length === 0) {
            return res.redirect('/produtos');
        }
        const html = ejs.render(TEMPLATE_EDITAR_PRODUTO, {
            ...res.locals,
            produto: resultado.rows[0],
            erro: req.query.erro || null
        });
        return res.send(html);
    } catch (erro) {
        console.error('Erro ao abrir edição:', erro);
        return res.redirect('/produtos');
    }
});

app.post(['/produtos/editar/:id', '/produtos/:id/editar', '/editar-produto/:id'], exigirAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const nome = String(req.body.nome || '').trim();
    const preco = parseFloat(req.body.preco);
    const estoque = parseInt(req.body.estoque, 10);
    const ativo = req.body.ativo === 'true';
    const imagem_url = String(req.body.imagem_url || '').trim() || '/IMG/Landing/placeholder.png';

    if (!nome || isNaN(preco) || isNaN(estoque) || preco < 0 || estoque < 0) {
        return res.redirect(`/produtos/editar/${id}?erro=${encodeURIComponent('Dados inválidos ou estoque negativo.')}`);
    }

    try {
        await BD.query(
            `UPDATE produtos SET nome = $1, preco = $2, estoque = $3, ativo = $4, imagem_url = $5 WHERE id = $6`,
            [nome, preco, estoque, ativo, imagem_url, id]
        );
        return res.redirect('/produtos');
    } catch (erro) {
        console.error('Erro ao salvar edição:', erro);
        return res.redirect(`/produtos/editar/${id}?erro=${encodeURIComponent('Erro ao salvar alterações.')}`);
    }
});

// ---------------------- VINCULAÇÃO DOS MÓDULOS DE ROTAS ----------------------

const lojaRoutes = require('./Routes/lojaRoutes');
app.use('/', lojaRoutes);

const produtosRoutes = require('./Routes/produtosRoutes');
app.use('/produtos', exigirAdmin, produtosRoutes);

const usuariosRoutes = require('./Routes/usuariosRoutes');
app.use('/usuarios', exigirAdmin, usuariosRoutes);

const pedidosRoutes = require('./Routes/pedidosRoutes');
app.use('/pedidos', pedidosRoutes);

// Rota 404
app.use((req, res) => {
    res.status(404).send('Página não encontrada');
});

const PORTA = 3001;

function iniciarServidor() {
    const server = app.listen(PORTA, () => {
        console.log(`Servidor "The Office Papelaria" rodando em: http://localhost:${PORTA}`);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            try {
                execSync(`for /f "tokens=5" %a in ('netstat -aon ^| findstr :${PORTA}') do taskkill /F /PID %a`, { stdio: 'ignore' });
            } catch (_) {}
            setTimeout(iniciarServidor, 500);
        } else {
            console.error(err);
        }
    });
}

iniciarServidor();
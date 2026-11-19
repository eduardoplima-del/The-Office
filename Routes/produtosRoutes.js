const express = require('express');
const router = express.Router();
const BD = require('../db');

// Listar Produtos (GET /produtos)
router.get('/', async (req, res) => {
    try {
        const resultado = await BD.query('SELECT * FROM produtos ORDER BY id DESC');
        res.render('catalogar', {
            produtos: resultado.rows,
            erro: req.query.erro || null
        });
    } catch (erro) {
        console.error('Erro ao listar produtos:', erro);
        res.status(500).send('Erro ao carregar controle de estoque.');
    }
});

// Cadastrar Novo Produto (POST /produtos/novo - RN04, RN05, RN06)
router.post('/novo', async (req, res) => {
    const nome = String(req.body.nome || '').trim();
    const preco = parseFloat(req.body.preco);
    const estoque = parseInt(req.body.estoque, 10);
    const imagem_url = String(req.body.imagem_url || '').trim() || '/IMG/Landing/placeholder.png';

    if (!nome || isNaN(preco) || isNaN(estoque)) {
        return res.redirect('/produtos?erro=' + encodeURIComponent('Nome, preço e quantidade em estoque são obrigatórios.'));
    }

    if (preco < 0 || estoque < 0) {
        return res.redirect('/produtos?erro=' + encodeURIComponent('O estoque e o preço não podem ser negativos.'));
    }

    try {
        await BD.query(
            `INSERT INTO produtos (nome, preco, estoque, imagem_url, ativo) 
             VALUES ($1, $2, $3, $4, true)`,
            [nome, preco, estoque, imagem_url]
        );
        res.redirect('/produtos');
    } catch (erro) {
        console.error('Erro ao cadastrar produto:', erro);
        res.redirect('/produtos?erro=' + encodeURIComponent('Erro ao cadastrar produto.'));
    }
});

// Abrir Edição do Produto (GET /produtos/editar/:id)
router.get(['/editar/:id', '/:id/editar'], async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.redirect('/produtos');

    try {
        const resultado = await BD.query('SELECT * FROM produtos WHERE id = $1', [id]);
        if (resultado.rows.length === 0) {
            return res.redirect('/produtos?erro=' + encodeURIComponent('Produto não encontrado.'));
        }
        res.render('editar-produto', {
            produto: resultado.rows[0],
            erro: req.query.erro || null
        });
    } catch (erro) {
        console.error('Erro ao carregar página de edição:', erro);
        res.redirect('/produtos');
    }
});

// Salvar Edição do Produto (POST /produtos/editar/:id - RN04, RN05, RN06)
router.post(['/editar/:id', '/:id/editar'], async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const nome = String(req.body.nome || '').trim();
    const preco = parseFloat(req.body.preco);
    const estoque = parseInt(req.body.estoque, 10);
    const ativo = req.body.ativo === 'true';
    const imagem_url = String(req.body.imagem_url || '').trim() || '/IMG/Landing/placeholder.png';

    if (!nome || isNaN(preco) || isNaN(estoque)) {
        return res.redirect(`/produtos/editar/${id}?erro=${encodeURIComponent('Preencha nome, preço e estoque corretamente.')}`);
    }

    if (preco < 0 || estoque < 0) {
        return res.redirect(`/produtos/editar/${id}?erro=${encodeURIComponent('O estoque e o preço não podem ser negativos.')}`);
    }

    try {
        await BD.query(
            `UPDATE produtos SET nome = $1, preco = $2, estoque = $3, ativo = $4, imagem_url = $5 WHERE id = $6`,
            [nome, preco, estoque, ativo, imagem_url, id]
        );
        res.redirect('/produtos');
    } catch (erro) {
        console.error('Erro ao atualizar produto:', erro);
        res.redirect(`/produtos/editar/${id}?erro=${encodeURIComponent('Erro ao salvar alterações.')}`);
    }
});

// Alternar Status Ativo/Inativo (POST /produtos/status/:id - RN05)
router.post('/status/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    try {
        await BD.query('UPDATE produtos SET ativo = NOT ativo WHERE id = $1', [id]);
        res.redirect('/produtos');
    } catch (erro) {
        console.error('Erro ao alterar status:', erro);
        res.redirect('/produtos');
    }
});

// Excluir Produto (POST /produtos/excluir/:id)
router.post('/excluir/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    try {
        await BD.query('DELETE FROM produtos WHERE id = $1', [id]);
        res.redirect('/produtos');
    } catch (erro) {
        console.error('Erro ao excluir produto:', erro);
        await BD.query('UPDATE produtos SET ativo = false WHERE id = $1', [id]);
        res.redirect('/produtos?erro=' + encodeURIComponent('Produto possui pedidos vinculados e foi marcado como Inativo.'));
    }
});

module.exports = router;
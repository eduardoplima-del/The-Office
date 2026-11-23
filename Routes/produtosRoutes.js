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

// Cadastrar Novo Produto (POST /produtos/novo)
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

// Alternar Status Ativo/Inativo (POST /produtos/status/:id)
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
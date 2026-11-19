const express = require('express');
const router = express.Router();
const BD = require('../db');

router.get('/catalogo', async (req, res) => {
    try {
        const busca = String(req.query.busca || '').trim();
        const resultado = busca
            ? await BD.query(
                  `SELECT id, nome, preco, estoque, imagem_url, ativo FROM produtos WHERE ativo = true AND nome ILIKE $1 ORDER BY id DESC`,
                  [`%${busca}%`]
              )
            : await BD.query(
                  `SELECT id, nome, preco, estoque, imagem_url, ativo FROM produtos WHERE ativo = true ORDER BY id DESC`
              );

        res.render('landing/produtos', {
            produtos: resultado.rows,
            busca
        });
    } catch (erro) {
        console.error('Erro ao carregar catálogo:', erro);
        res.render('landing/produtos', { produtos: [], busca: '' });
    }
});

module.exports = router;    
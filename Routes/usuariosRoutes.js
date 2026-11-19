const express = require('express');
const router = express.Router();
const BD = require('../db');

router.get('/', async (req, res) => {
    try {
        const resultado = await BD.query('SELECT id, nome, email, tipo, situacao FROM usuarios ORDER BY id ASC');
        res.render('usuarios', { usuarios: resultado.rows, erro: req.query.erro || null });
    } catch (erro) {
        console.error('Erro ao listar usuários:', erro);
        res.status(500).send('Erro ao carregar usuários.');
    }
});

router.post('/situacao/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (req.session.usuario && req.session.usuario.id === id) {
        return res.status(400).send('Você não pode inativar sua própria conta.');
    }
    try {
        await BD.query('UPDATE usuarios SET situacao = CASE WHEN situacao = 1 THEN 0 ELSE 1 END WHERE id = $1', [id]);
        res.redirect('/usuarios');
    } catch (erro) {
        res.redirect('/usuarios');
    }
});

router.post('/tipo/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const tipo = req.body.tipo === 'admin' ? 'admin' : 'cliente';
    try {
        await BD.query('UPDATE usuarios SET tipo = $1 WHERE id = $2', [tipo, id]);
        res.redirect('/usuarios');
    } catch (erro) {
        res.redirect('/usuarios');
    }
});

module.exports = router;
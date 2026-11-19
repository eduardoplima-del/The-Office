const express = require('express');
const router = express.Router();
const BD = require('../db');

const STATUS_VALIDOS = ['pendente', 'pago', 'enviado', 'cancelado'];

router.get('/', async (req, res) => {
    if (!req.session.usuario || req.session.usuario.tipo !== 'admin') {
        return res.status(403).send('Acesso restrito a administradores.');
    }
    try {
        const resultado = await BD.query(`
            SELECT p.*, u.nome AS cliente_nome, u.email AS cliente_email
            FROM pedidos p
            JOIN usuarios u ON u.id = p.usuario_id
            ORDER BY p.criado_em DESC
        `);
        res.render('pedidos', { pedidos: resultado.rows });
    } catch (erro) {
        console.error('Erro ao listar pedidos:', erro);
        res.status(500).send('Erro ao carregar pedidos.');
    }
});

router.post('/status/:id', async (req, res) => {
    if (!req.session.usuario || req.session.usuario.tipo !== 'admin') {
        return res.status(403).send('Acesso restrito a administradores.');
    }

    const pedidoId = parseInt(req.params.id, 10);
    const novoStatus = String(req.body.status || '').trim().toLowerCase();

    if (!STATUS_VALIDOS.includes(novoStatus)) {
        return res.status(400).send('Status inválido.');
    }

    const client = await BD.connect();
    try {
        await client.query('BEGIN');
        const pedidoRes = await client.query('SELECT id, status FROM pedidos WHERE id = $1 FOR UPDATE', [pedidoId]);
        if (pedidoRes.rows.length === 0) throw new Error('Pedido não encontrado.');

        const statusAnterior = pedidoRes.rows[0].status;

        if (novoStatus === 'cancelado' && statusAnterior !== 'cancelado') {
            const itensRes = await client.query('SELECT produto_id, quantidade FROM pedido_itens WHERE pedido_id = $1', [pedidoId]);
            for (const item of itensRes.rows) {
                await client.query('UPDATE produtos SET estoque = estoque + $1 WHERE id = $2', [item.quantidade, item.produto_id]);
            }
        }

        if (statusAnterior === 'cancelado' && novoStatus !== 'cancelado') {
            const itensRes = await client.query('SELECT produto_id, quantidade FROM pedido_itens WHERE pedido_id = $1', [pedidoId]);
            for (const item of itensRes.rows) {
                const prodRes = await client.query('SELECT nome, estoque FROM produtos WHERE id = $1 FOR UPDATE', [item.produto_id]);
                if (prodRes.rows.length === 0 || prodRes.rows[0].estoque < item.quantidade) {
                    throw new Error(`Estoque insuficiente para reativar o pedido (${prodRes.rows[0]?.nome}).`);
                }
                await client.query('UPDATE produtos SET estoque = estoque - $1 WHERE id = $2', [item.quantidade, item.produto_id]);
            }
        }

        await client.query('UPDATE pedidos SET status = $1 WHERE id = $2', [novoStatus, pedidoId]);
        await client.query('COMMIT');
        res.redirect('/dashboard');
    } catch (erro) {
        await client.query('ROLLBACK');
        console.error('Erro ao atualizar status:', erro);
        res.status(400).send(erro.message);
    } finally {
        client.release();
    }
});

module.exports = router;
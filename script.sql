-- ============================================================================
-- SCRIPT SQL CONSOLIDADO - THE OFFICE PAPELARIA (REGRAS RN01 A RN16)
-- ============================================================================

BEGIN;

-- 1. Garantir que colunas essenciais existam caso a base já tenha sido criada antes
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'cliente';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS situacao INTEGER NOT NULL DEFAULT 1;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS imagem_url TEXT DEFAULT '/IMG/Landing/placeholder.png';
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP NOT NULL DEFAULT NOW();

-- 2. Saneamento de registros existentes antes de aplicar as restrições
UPDATE usuarios SET situacao = 1 WHERE situacao IS NULL;
UPDATE usuarios SET tipo = 'cliente' WHERE tipo IS NULL OR tipo NOT IN ('admin', 'cliente');
UPDATE produtos SET ativo = true WHERE ativo IS NULL;
UPDATE produtos SET estoque = 0 WHERE estoque IS NULL OR estoque < 0;
UPDATE produtos SET preco = 0 WHERE preco IS NULL OR preco < 0;
UPDATE pedidos SET status = 'pendente' WHERE status IS NULL OR status NOT IN ('pendente', 'pago', 'enviado', 'cancelado');

-- 3. Regras de Usuários (RN01, RN02, RN03)
ALTER TABLE usuarios
    ALTER COLUMN nome SET NOT NULL,
    ALTER COLUMN email SET NOT NULL,
    ALTER COLUMN senha SET NOT NULL,
    DROP CONSTRAINT IF EXISTS uq_usuarios_email,
    ADD CONSTRAINT uq_usuarios_email UNIQUE (email),
    DROP CONSTRAINT IF EXISTS chk_tipo_usuario,
    ADD CONSTRAINT chk_tipo_usuario CHECK (tipo IN ('admin', 'cliente')),
    DROP CONSTRAINT IF EXISTS chk_situacao_usuario,
    ADD CONSTRAINT chk_situacao_usuario CHECK (situacao IN (0, 1));

-- 4. Regras de Produtos e Estoque (RN04, RN05, RN06)
ALTER TABLE produtos
    ALTER COLUMN nome SET NOT NULL,
    ALTER COLUMN preco SET NOT NULL,
    ALTER COLUMN estoque SET NOT NULL,
    ALTER COLUMN ativo SET NOT NULL,
    DROP CONSTRAINT IF EXISTS chk_estoque_nao_negativo,
    ADD CONSTRAINT chk_estoque_nao_negativo CHECK (estoque >= 0),
    DROP CONSTRAINT IF EXISTS chk_preco_nao_negativo,
    ADD CONSTRAINT chk_preco_nao_negativo CHECK (preco >= 0);

-- 5. Regras de Pedidos (RN07, RN08, RN09, RN10, RN13, RN16)
ALTER TABLE pedidos
    ALTER COLUMN usuario_id SET NOT NULL,
    ALTER COLUMN total SET NOT NULL,
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN criado_em SET NOT NULL,
    DROP CONSTRAINT IF EXISTS chk_total_pedido_nao_negativo,
    ADD CONSTRAINT chk_total_pedido_nao_negativo CHECK (total >= 0),
    DROP CONSTRAINT IF EXISTS chk_status_pedido,
    ADD CONSTRAINT chk_status_pedido CHECK (status IN ('pendente', 'pago', 'enviado', 'cancelado'));

-- 6. Regras de Itens do Pedido (RN11, RN12, RN14, RN15)
ALTER TABLE pedido_itens
    ALTER COLUMN pedido_id SET NOT NULL,
    ALTER COLUMN produto_id SET NOT NULL,
    ALTER COLUMN quantidade SET NOT NULL,
    ALTER COLUMN preco_unitario SET NOT NULL,
    DROP CONSTRAINT IF EXISTS chk_quantidade_item_positiva,
    ADD CONSTRAINT chk_quantidade_item_positiva CHECK (quantidade > 0),
    DROP CONSTRAINT IF EXISTS chk_preco_unitario_nao_negativo,
    ADD CONSTRAINT chk_preco_unitario_nao_negativo CHECK (preco_unitario >= 0);

COMMIT;

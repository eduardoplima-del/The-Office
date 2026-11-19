BEGIN;

-- Criação das tabelas caso ainda não existam
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    senha VARCHAR(255) NOT NULL,
    tipo VARCHAR(20) NOT NULL DEFAULT 'cliente',
    situacao INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS produtos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    preco NUMERIC(10, 2) NOT NULL,
    estoque INTEGER NOT NULL DEFAULT 0,
    imagem_url TEXT DEFAULT '/IMG/Landing/placeholder.png',
    ativo BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS pedidos (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    total NUMERIC(10, 2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pendente',
    criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pedido_itens (
    id SERIAL PRIMARY KEY,
    pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    produto_id INTEGER NOT NULL REFERENCES produtos(id),
    quantidade INTEGER NOT NULL,
    preco_unitario NUMERIC(10, 2) NOT NULL
);

-- Garantia de colunas em bases já existentes
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'cliente';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS situacao INTEGER NOT NULL DEFAULT 1;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS imagem_url TEXT DEFAULT '/IMG/Landing/placeholder.png';
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP NOT NULL DEFAULT NOW();

-- Saneamento de dados existentes
UPDATE usuarios SET situacao = 1 WHERE situacao IS NULL;
UPDATE usuarios SET tipo = 'cliente' WHERE tipo IS NULL OR tipo NOT IN ('admin', 'cliente');
UPDATE produtos SET ativo = true WHERE ativo IS NULL;
UPDATE produtos SET estoque = 0 WHERE estoque IS NULL OR estoque < 0;
UPDATE produtos SET preco = 0 WHERE preco IS NULL OR preco < 0;
UPDATE pedidos SET status = 'pendente' WHERE status IS NULL OR status NOT IN ('pendente', 'pago', 'enviado', 'cancelado');

-- Constraints RN01–RN16
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

ALTER TABLE produtos
    ALTER COLUMN nome SET NOT NULL,
    ALTER COLUMN preco SET NOT NULL,
    ALTER COLUMN estoque SET NOT NULL,
    ALTER COLUMN ativo SET NOT NULL,
    DROP CONSTRAINT IF EXISTS chk_estoque_nao_negativo,
    ADD CONSTRAINT chk_estoque_nao_negativo CHECK (estoque >= 0),
    DROP CONSTRAINT IF EXISTS chk_preco_nao_negativo,
    ADD CONSTRAINT chk_preco_nao_negativo CHECK (preco >= 0);

ALTER TABLE pedidos
    ALTER COLUMN usuario_id SET NOT NULL,
    ALTER COLUMN total SET NOT NULL,
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN criado_em SET NOT NULL,
    DROP CONSTRAINT IF EXISTS chk_total_pedido_nao_negativo,
    ADD CONSTRAINT chk_total_pedido_nao_negativo CHECK (total >= 0),
    DROP CONSTRAINT IF EXISTS chk_status_pedido,
    ADD CONSTRAINT chk_status_pedido CHECK (status IN ('pendente', 'pago', 'enviado', 'cancelado'));

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

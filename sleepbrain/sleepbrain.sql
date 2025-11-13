

DROP DATABASE IF EXISTS sleepbrain;
CREATE DATABASE sleepbrain CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sleepbrain;


CREATE TABLE usuarios (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  nome          VARCHAR(120)      NOT NULL,
  email         VARCHAR(160)      NOT NULL UNIQUE,
  senha         VARCHAR(200)      NOT NULL,
  role          ENUM('comum','admin') NOT NULL DEFAULT 'comum',
  status        ENUM('ativo','banido') NOT NULL DEFAULT 'ativo',
  data_criacao  DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE INDEX idx_usuarios_role   ON usuarios(role);
CREATE INDEX idx_usuarios_status ON usuarios(status);


CREATE TABLE artigos (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  titulo        VARCHAR(160)      NOT NULL,
  descricao     TEXT              NOT NULL,
  url           VARCHAR(500)      NOT NULL,
  fonte         VARCHAR(160)      NULL,
  autor_id      INT               NOT NULL,
  data_criacao  DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_artigos_autor FOREIGN KEY (autor_id)
    REFERENCES usuarios(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_artigos_autor ON artigos(autor_id);
CREATE INDEX idx_artigos_data  ON artigos(data_criacao);


CREATE TABLE mensagens (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  remetente_id     INT         NOT NULL,
  destinatario_id  INT         NOT NULL,
  conteudo         TEXT        NOT NULL,
  data_envio       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lida             TINYINT(1)  NOT NULL DEFAULT 0,
  CONSTRAINT fk_msg_rem  FOREIGN KEY (remetente_id)    REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_dest FOREIGN KEY (destinatario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_msg_dest_lida ON mensagens(destinatario_id, lida, data_envio);
CREATE INDEX idx_msg_pair      ON mensagens(remetente_id, destinatario_id);


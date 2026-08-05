-- Sci-Fi Village — 本地一键建库脚本
-- 用法（任选其一）:
--   mysql -u root -p < server/sql/init_all.sql
--   或在 Navicat / MySQL Workbench 中打开本文件执行
-- 默认库名: sv_village（与 .env.development 中 DB_NAME 一致）

CREATE DATABASE IF NOT EXISTS `sv_village`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `sv_village`;

-- ---------------------------------------------------------------------------
-- 用户 / 世界 / 存档
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(32) NOT NULL,
  `email` VARCHAR(128) DEFAULT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `display_name` VARCHAR(64) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_login_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_username` (`username`),
  UNIQUE KEY `uk_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `worlds` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `owner_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(64) NOT NULL,
  `seed` BIGINT NOT NULL DEFAULT 0,
  `game_mode` ENUM('survival','creative','adventure') NOT NULL DEFAULT 'survival',
  `spawn_x` DOUBLE NOT NULL DEFAULT 0,
  `spawn_y` DOUBLE NOT NULL DEFAULT 64,
  `spawn_z` DOUBLE NOT NULL DEFAULT 0,
  `is_public` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_worlds_owner` (`owner_id`),
  CONSTRAINT `fk_worlds_owner` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `player_states` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `world_id` BIGINT UNSIGNED NOT NULL,
  `pos_x` DOUBLE NOT NULL DEFAULT 0,
  `pos_y` DOUBLE NOT NULL DEFAULT 64,
  `pos_z` DOUBLE NOT NULL DEFAULT 0,
  `yaw` FLOAT NOT NULL DEFAULT 0,
  `pitch` FLOAT NOT NULL DEFAULT 0,
  `health` FLOAT NOT NULL DEFAULT 20,
  `hunger` FLOAT NOT NULL DEFAULT 20,
  `energy` FLOAT NOT NULL DEFAULT 100,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_player_world` (`user_id`, `world_id`),
  KEY `idx_player_world` (`world_id`),
  CONSTRAINT `fk_player_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_player_world` FOREIGN KEY (`world_id`) REFERENCES `worlds` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inventories` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `world_id` BIGINT UNSIGNED NOT NULL,
  `slot_index` SMALLINT UNSIGNED NOT NULL,
  `item_id` VARCHAR(64) NOT NULL,
  `quantity` INT UNSIGNED NOT NULL DEFAULT 1,
  `meta_json` JSON DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_inv_slot` (`user_id`, `world_id`, `slot_index`),
  CONSTRAINT `fk_inv_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_inv_world` FOREIGN KEY (`world_id`) REFERENCES `worlds` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `chunks` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `world_id` BIGINT UNSIGNED NOT NULL,
  `chunk_x` INT NOT NULL,
  `chunk_z` INT NOT NULL,
  `version` INT UNSIGNED NOT NULL DEFAULT 1,
  `data_blob` LONGBLOB,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_chunk` (`world_id`, `chunk_x`, `chunk_z`),
  CONSTRAINT `fk_chunk_world` FOREIGN KEY (`world_id`) REFERENCES `worlds` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `block_overrides` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `world_id` BIGINT UNSIGNED NOT NULL,
  `x` INT NOT NULL,
  `y` INT NOT NULL,
  `z` INT NOT NULL,
  `block_id` VARCHAR(64) NOT NULL,
  `updated_by` BIGINT UNSIGNED DEFAULT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_block_pos` (`world_id`, `x`, `y`, `z`),
  CONSTRAINT `fk_block_world` FOREIGN KEY (`world_id`) REFERENCES `worlds` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 游戏服 / 在线会话
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `game_servers` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(32) NOT NULL,
  `name` VARCHAR(64) NOT NULL,
  `seed` BIGINT NOT NULL DEFAULT 0,
  `max_players` INT UNSIGNED NOT NULL DEFAULT 100,
  `status` ENUM('standby','open','full','draining') NOT NULL DEFAULT 'standby',
  `region` VARCHAR(32) NOT NULL DEFAULT 'default',
  `spawn_x` DOUBLE NOT NULL DEFAULT 24,
  `spawn_y` DOUBLE NOT NULL DEFAULT 16,
  `spawn_z` DOUBLE NOT NULL DEFAULT 36,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_server_code` (`code`),
  KEY `idx_server_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `server_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `server_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `joined_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_seen_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `pos_x` DOUBLE NOT NULL DEFAULT 24,
  `pos_y` DOUBLE NOT NULL DEFAULT 16,
  `pos_z` DOUBLE NOT NULL DEFAULT 36,
  `yaw` FLOAT NOT NULL DEFAULT 0,
  `pitch` FLOAT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_session_user` (`user_id`),
  KEY `idx_session_server` (`server_id`),
  KEY `idx_session_seen` (`last_seen_at`),
  CONSTRAINT `fk_session_server` FOREIGN KEY (`server_id`) REFERENCES `game_servers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_session_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 每服上次位置/视角（退出后仍保留，便于同服重进恢复）
CREATE TABLE IF NOT EXISTS `server_player_anchors` (
  `user_id` BIGINT UNSIGNED NOT NULL,
  `server_id` BIGINT UNSIGNED NOT NULL,
  `pos_x` DOUBLE NOT NULL,
  `pos_y` DOUBLE NOT NULL,
  `pos_z` DOUBLE NOT NULL,
  `yaw` FLOAT NOT NULL DEFAULT 0,
  `pitch` FLOAT NOT NULL DEFAULT -0.2,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `server_id`),
  KEY `idx_anchor_server` (`server_id`),
  CONSTRAINT `fk_anchor_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_anchor_server` FOREIGN KEY (`server_id`) REFERENCES `game_servers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 同服共享地形改动（挖/建/砍/采）
CREATE TABLE IF NOT EXISTS `server_block_overrides` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `server_id` BIGINT UNSIGNED NOT NULL,
  `x` INT NOT NULL,
  `y` INT NOT NULL,
  `z` INT NOT NULL,
  `block_id` VARCHAR(32) NOT NULL,
  `updated_by` BIGINT UNSIGNED NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_server_block_pos` (`server_id`, `x`, `y`, `z`),
  KEY `idx_server_block_xz` (`server_id`, `x`, `z`),
  CONSTRAINT `fk_sbo_server` FOREIGN KEY (`server_id`) REFERENCES `game_servers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 每服每玩家仓库
CREATE TABLE IF NOT EXISTS `server_player_inventories` (
  `user_id` BIGINT UNSIGNED NOT NULL,
  `server_id` BIGINT UNSIGNED NOT NULL,
  `inv_json` JSON NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `server_id`),
  KEY `idx_inv_server` (`server_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 种子服：仅第一台 open，其余 standby（空库时才插入）
INSERT INTO `game_servers` (`code`, `name`, `seed`, `max_players`, `status`)
SELECT * FROM (
  SELECT 'sv-01' AS code, '晨光一村' AS name, 10001 AS seed, 100 AS max_players, 'open' AS status
  UNION ALL SELECT 'sv-02', '雾港二村', 10002, 100, 'standby'
  UNION ALL SELECT 'sv-03', '星壤三村', 10003, 100, 'standby'
  UNION ALL SELECT 'sv-04', '风蚀四村', 10004, 100, 'standby'
  UNION ALL SELECT 'sv-05', '潮汐五村', 10005, 100, 'standby'
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM `game_servers` LIMIT 1);

-- ---------------------------------------------------------------------------
-- 组队 / 邀请
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `parties` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(12) NOT NULL,
  `host_user_id` BIGINT UNSIGNED NOT NULL,
  `server_id` BIGINT UNSIGNED DEFAULT NULL,
  `status` ENUM('open','playing','closed') NOT NULL DEFAULT 'open',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_party_code` (`code`),
  KEY `idx_party_host` (`host_user_id`),
  CONSTRAINT `fk_party_host` FOREIGN KEY (`host_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `party_members` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `party_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `role` ENUM('host','member') NOT NULL DEFAULT 'member',
  `joined_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_party_user` (`user_id`),
  KEY `idx_pm_party` (`party_id`),
  CONSTRAINT `fk_pm_party` FOREIGN KEY (`party_id`) REFERENCES `parties` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pm_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `party_invites` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `party_id` BIGINT UNSIGNED NOT NULL,
  `from_user_id` BIGINT UNSIGNED NOT NULL,
  `to_user_id` BIGINT UNSIGNED NOT NULL,
  `status` ENUM('pending','accepted','declined','expired') NOT NULL DEFAULT 'pending',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_invite_to` (`to_user_id`, `status`),
  KEY `idx_invite_party` (`party_id`),
  CONSTRAINT `fk_invite_party` FOREIGN KEY (`party_id`) REFERENCES `parties` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_invite_from` FOREIGN KEY (`from_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_invite_to` FOREIGN KEY (`to_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 移动端键位布局（可分享）
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `control_layouts` (
  `user_id` BIGINT UNSIGNED NOT NULL,
  `layout_json` JSON NOT NULL,
  `share_code` VARCHAR(12) DEFAULT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uk_share_code` (`share_code`),
  CONSTRAINT `fk_ctrl_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

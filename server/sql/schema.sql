-- Sci-Fi Village schema
CREATE DATABASE IF NOT EXISTS `sv_village`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `sv_village`;

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

-- Game servers + online sessions (run via db:init or migrate)
USE `sv_village`;

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

-- Last pose per user+server (survives leave so rejoin can restore)
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

-- Seed pool: only first is open; others standby until fill threshold
INSERT INTO `game_servers` (`code`, `name`, `seed`, `max_players`, `status`)
SELECT * FROM (
  SELECT 'sv-01' AS code, '晨光一村' AS name, 10001 AS seed, 100 AS max_players, 'open' AS status
  UNION ALL SELECT 'sv-02', '雾港二村', 10002, 100, 'standby'
  UNION ALL SELECT 'sv-03', '星壤三村', 10003, 100, 'standby'
  UNION ALL SELECT 'sv-04', '风蚀四村', 10004, 100, 'standby'
  UNION ALL SELECT 'sv-05', '潮汐五村', 10005, 100, 'standby'
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM `game_servers` LIMIT 1);

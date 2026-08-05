-- Last known pose per user on each game server (survives leave / page close)
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

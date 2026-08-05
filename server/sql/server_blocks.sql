-- Per-server shared terrain overrides (dig / build / chop / mine)
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

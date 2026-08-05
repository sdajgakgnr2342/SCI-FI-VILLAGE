-- Mobile control layouts (per user + share codes)
USE `sv_village`;

CREATE TABLE IF NOT EXISTS `control_layouts` (
  `user_id` BIGINT UNSIGNED NOT NULL,
  `layout_json` JSON NOT NULL,
  `share_code` VARCHAR(12) DEFAULT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uk_share_code` (`share_code`),
  CONSTRAINT `fk_ctrl_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

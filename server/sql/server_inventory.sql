-- 每名玩家在每个共享服上的仓库（材料数量）
CREATE TABLE IF NOT EXISTS `server_player_inventories` (
  `user_id` BIGINT UNSIGNED NOT NULL,
  `server_id` BIGINT UNSIGNED NOT NULL,
  `inv_json` JSON NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `server_id`),
  KEY `idx_inv_server` (`server_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

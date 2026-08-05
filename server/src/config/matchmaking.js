/**
 * 服务器人数均衡策略（真人）
 *
 * 目标：避免「每个服只有零星几人」——用填箱法把人往已有服挤。
 *
 * 规则：
 * 1. 容量上限 MAX=100（仅计真人）
 * 2. 优先进入「已开放且未满」中人数最多的服（fill-first）
 * 3. 仅当所有 open 服人数 ≥ OPEN_THRESHOLD(70) 时，才把一台 standby 升为 open
 * 4. 人数 ≤ DRAIN_BELOW(8) 且存在更热闹的 open 服时，标记 draining，新玩家不再进
 * 5. 心跳超时 SESSION_TTL 视为离线，定期清理
 *
 * 人机不占 100 人容量；人机是本地氛围补充，见 npcPolicy。
 */

const MAX_PLAYERS = 100;
const OPEN_THRESHOLD = 70;
const DRAIN_BELOW = 8;
const SESSION_TTL_SEC = 45;

/** 玩家附近人机策略 */
const NPC_POLICY = {
  /** 附近真人很少时，最多同时出现的人机 */
  maxNearPlayer: 2,
  /** 附近已有 ≥ 此数量真人时，不再刷人机 */
  suppressWhenPlayersNearby: 3,
  /** 人机在玩家附近停留时间（秒） */
  lingerSec: [40, 90],
  /** 进入时出生在玩家背后/侧后的距离 */
  spawnDistance: [10, 16],
  /** 离开阶段行走目标距离（逐渐拉远） */
  departDistance: [28, 48],
  /** 离开时只有距离足够且不在视野内才允许销毁 */
  despawnMinDistance: 34,
  /** 视野半角（度），用于判断盲区 */
  fovHalfDeg: 55,
  /** 推荐 玩家:人机 感知比（说明用）：附近真人少时约 1:1~1:2 */
  ratioHint: '1:0~1:2 local',
};

module.exports = {
  MAX_PLAYERS,
  OPEN_THRESHOLD,
  DRAIN_BELOW,
  SESSION_TTL_SEC,
  NPC_POLICY,
};

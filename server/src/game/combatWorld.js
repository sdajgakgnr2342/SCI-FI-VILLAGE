/**
 * 每服战斗世界：夜怪刷新 / AI / 玩家 HP / 死亡物资盒 / 攻击校验
 */

const {
  PLAYER_MAX_HP,
  REGEN_DELAY_MS,
  REGEN_PER_SEC,
  DEATH_COUNTDOWN_MS,
  WEAPON_DEFS,
  MONSTER_DEFS,
  TIER_IDS,
  sampleDayNight,
  normalizeBag,
  serializeBag,
  freshBag,
} = require('./combatStats');
const { rollKillChest, makeChestEntry, rollHarvestChest } = require('./lootTables');
const {
  SHOP_ITEMS,
  MATERIAL_SELL,
  MEDKIT_SELL,
  WEAPON_SELL,
  CHEST_SELL,
  FURNITURE_IDS,
  rollKillGold,
  emptyFurniture,
  splitDeathWeapons,
  START_GOLD,
} = require('./shopCatalog');

const TICK_MS = 200;
const BURROW_MS = 1200;
const SPAWN_MIN = 18;
const SPAWN_MAX = 36;
const FIRE_RADIUS = 4;
const FIRE_DMG = 25;
const FIRE_TICK = 0.5;

let monSeq = 0;
let crateSeq = 0;

/** @type {Map<number, ServerCombatWorld>} */
const worlds = new Map();

function worldOf(serverId) {
  const id = Number(serverId);
  if (!worlds.has(id)) {
    worlds.set(id, {
      serverId: id,
      monsters: new Map(),
      crates: new Map(),
      furniture: new Map(),
      firePits: [],
      players: new Map(),
      spawnAcc: 0,
    });
  }
  return worlds.get(id);
}

function ensurePlayer(world, userId, bagRaw) {
  const uid = Number(userId);
  let p = world.players.get(uid);
  if (!p) {
    const bag = normalizeBag(bagRaw);
    p = {
      userId: uid,
      x: 0,
      y: 0,
      z: 0,
      bag,
      dead: bag.hp <= 0,
      deathAt: 0,
      attackCd: 0,
      lastSaveHint: 0,
    };
    world.players.set(uid, p);
  }
  return p;
}

function nightSpawnPlan(nightProgress, playerCount) {
  let targetMin = 3;
  let targetMax = 5;
  let maxTier = 2;
  if (nightProgress >= 0.8) {
    targetMin = 14;
    targetMax = 22;
    maxTier = 5;
  } else if (nightProgress >= 0.55) {
    targetMin = 10;
    targetMax = 16;
    maxTier = 4;
  } else if (nightProgress >= 0.25) {
    targetMin = 6;
    targetMax = 10;
    maxTier = 3;
  }
  const scale = Math.max(1, playerCount);
  return {
    target: Math.round(((targetMin + targetMax) / 2) * Math.min(2.5, 0.7 + scale * 0.35)),
    maxTier,
  };
}

function pickTier(maxTier, nightProgress) {
  const weights = {
    scrapmite: 40,
    miregrub: nightProgress < 0.15 ? 20 : 28,
    shardhound: maxTier >= 3 ? 18 : 0,
    voltspire: maxTier >= 4 ? (nightProgress > 0.55 ? 10 : 0) : 0,
    voidmaw: maxTier >= 5 && nightProgress > 0.8 ? 4 : 0,
  };
  if (maxTier < 2) weights.miregrub = 0;
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  let sum = entries.reduce((a, [, w]) => a + w, 0);
  let r = Math.random() * sum;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return 'scrapmite';
}

function countElitesOnTarget(world, targetId) {
  let n = 0;
  for (const m of world.monsters.values()) {
    if (m.targetId === targetId && MONSTER_DEFS[m.kind]?.isElite) n += 1;
  }
  return n;
}

function isSpawnHost(p) {
  // 准备舱未投下：不当刷怪锚点（舱高 y 会把怪刷进舱内）
  return !p.dead && !p.deploying;
}

function spawnNearPlayers(world, socketsByUser) {
  const { nightProgress, isNight } = sampleDayNight();
  if (!isNight) return [];

  const players = [...world.players.values()].filter(
    (p) => isSpawnHost(p) && socketsByUser.has(p.userId)
  );
  if (!players.length) return [];

  const plan = nightSpawnPlan(nightProgress, players.length);
  const spawned = [];

  // 黎明后清场由 tick 处理；这里补足数量
  while (world.monsters.size < plan.target) {
    const host = players[Math.floor(Math.random() * players.length)];
    const ang = Math.random() * Math.PI * 2;
    const dist = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
    const x = host.x + Math.cos(ang) * dist;
    const z = host.z + Math.sin(ang) * dist;
    const kind = pickTier(plan.maxTier, nightProgress);
    const def = MONSTER_DEFS[kind];

    // 深夜 T5 全图稀有
    if (kind === 'voidmaw') {
      let voids = 0;
      for (const m of world.monsters.values()) if (m.kind === 'voidmaw') voids += 1;
      if (voids >= 2) continue;
    }

    monSeq += 1;
    const id = `m_${world.serverId}_${monSeq}`;
    const mon = {
      id,
      kind,
      x,
      y: host.y - 1.2,
      z,
      hp: def.maxHp,
      maxHp: def.maxHp,
      targetId: null,
      attackCd: 0.5,
      burrowT: BURROW_MS / 1000,
      state: 'burrow',
    };
    world.monsters.set(id, mon);
    spawned.push(mon);
    if (spawned.length >= 2) break; // 每 tick 少刷，避免尖刺
  }
  return spawned;
}

function chooseTarget(world, mon, players) {
  const def = MONSTER_DEFS[mon.kind];
  let best = null;
  let bestD = Infinity;
  for (const p of players) {
    if (p.dead || p.deploying) continue;
    const d = Math.hypot(p.x - mon.x, p.z - mon.z);
    if (d > 64) continue;
    if (def.isElite && countElitesOnTarget(world, p.userId) >= 2 && mon.targetId !== p.userId) {
      continue;
    }
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/**
 * 简易密闭：头顶有实心则视为室内禁入（客户端可再细判；服务器用 fire/开放地）
 * 第一版：不查方块库时允许移动，攀爬怪可略抬 y。
 */
function stepMonster(mon, target, dt) {
  const def = MONSTER_DEFS[mon.kind];
  if (mon.state === 'burrow') {
    mon.burrowT -= dt;
    mon.y += (1.2 / (BURROW_MS / 1000)) * dt;
    if (mon.burrowT <= 0) {
      mon.state = 'chase';
      mon.y = target.y;
    }
    return;
  }

  const dx = target.x - mon.x;
  const dz = target.z - mon.z;
  const dist = Math.hypot(dx, dz) || 1;
  const low = mon.hp / mon.maxHp < 0.5;
  const speed = def.speed * (low ? def.lowHpSpeedMul : 1);
  const range = def.attackKind === 'ranged' ? Math.min(def.range, 4) : def.range * 0.85;

  if (dist > range) {
    mon.x += (dx / dist) * speed * dt;
    mon.z += (dz / dist) * speed * dt;
    if (def.canClimb && target.y - mon.y > 0.4) {
      mon.y += Math.min(2.2 * dt, target.y - mon.y);
    } else {
      mon.y += (target.y - mon.y) * Math.min(1, dt * 4);
    }
  }
}

function applyDamageToPlayer(p, amount, now) {
  if (p.dead) return false;
  p.bag.hp = Math.max(0, p.bag.hp - Math.floor(amount));
  p.bag.lastDamageAt = now;
  if (p.bag.hp <= 0) {
    p.bag.hp = 0;
    p.dead = true;
    p.deathAt = now;
    return true;
  }
  return false;
}

function regenPlayers(world, now, dt) {
  for (const p of world.players.values()) {
    if (p.dead) continue;
    if (p.bag.hp <= 0 || p.bag.hp >= PLAYER_MAX_HP) continue;
    if (now - (p.bag.lastDamageAt || 0) < REGEN_DELAY_MS) continue;
    p.bag.hp = Math.min(PLAYER_MAX_HP, p.bag.hp + REGEN_PER_SEC * dt);
  }
}

function slimMonster(m) {
  return {
    id: m.id,
    kind: m.kind,
    x: +m.x.toFixed(2),
    y: +m.y.toFixed(2),
    z: +m.z.toFixed(2),
    hp: Math.ceil(m.hp),
    maxHp: m.maxHp,
    state: m.state,
    targetId: m.targetId,
  };
}

function slimCrate(c) {
  return {
    id: c.id,
    x: c.x,
    y: c.y,
    z: c.z,
    ownerId: c.ownerId,
  };
}

/**
 * @param {*} hubCtx { getSocketsForServer, broadcastAoiToPos, sendToUser, onPlayerKicked, persistBag }
 */
function attachCombatWorld(hubCtx) {
  const timer = setInterval(() => {
    const dt = TICK_MS / 1000;
    const now = Date.now();
    const { isNight, nightProgress } = sampleDayNight(now);

    for (const world of worlds.values()) {
      const socketsByUser = hubCtx.getSocketsForServer(world.serverId);
      if (!socketsByUser.size && world.monsters.size === 0 && world.crates.size === 0) continue;

      // 同步在线玩家位置
      for (const [uid, sock] of socketsByUser) {
        const p = ensurePlayer(world, uid, sock.combatBag);
        if (sock.lastPresence) {
          p.x = sock.lastPresence.x;
          p.y = sock.lastPresence.y;
          p.z = sock.lastPresence.z;
        }
        if (sock.combatBag) p.bag = normalizeBag(sock.combatBag);
      }

      regenPlayers(world, now, dt);

      if (!isNight) {
        // 白天清除夜怪
        if (world.monsters.size) {
          world.monsters.clear();
          hubCtx.broadcastServer(world.serverId, { type: 'combat_monsters', monsters: [], ts: now });
        }
      } else {
        spawnNearPlayers(world, socketsByUser);
      }

      const alivePlayers = [...world.players.values()].filter(
        (p) => !p.dead && socketsByUser.has(p.userId)
      );
      const combatPlayers = alivePlayers.filter((p) => !p.deploying);

      const events = [];

      // 全员还在舱内时，清掉已刷在舱高的怪，避免投下前进舱
      if (!combatPlayers.length) {
        for (const mon of [...world.monsters.values()]) {
          if (mon.y > 18) world.monsters.delete(mon.id);
        }
      }

      for (const mon of [...world.monsters.values()]) {
        const target = chooseTarget(world, mon, combatPlayers);
        mon.targetId = target ? target.userId : null;
        if (!target) continue;

        stepMonster(mon, target, dt);

        const def = MONSTER_DEFS[mon.kind];
        mon.attackCd = Math.max(0, mon.attackCd - dt);
        if (mon.state !== 'chase' || mon.attackCd > 0) continue;

        const dist = Math.hypot(target.x - mon.x, target.z - mon.z);
        let dmg = 0;
        if (def.attackKind === 'ranged' && dist <= def.range) {
          dmg = def.damage;
        } else if (def.attackKind === 'hybrid') {
          if (dist <= def.range) dmg = def.damage;
          else if (dist <= (def.rangeAlt || def.range)) dmg = def.damageAlt || def.damage;
        } else if (dist <= def.range) {
          dmg = def.damage;
        }

        if (dmg > 0) {
          mon.attackCd = def.interval;
          const died = applyDamageToPlayer(target, dmg, now);
          const sock = socketsByUser.get(target.userId);
          if (sock) {
            sock.combatBag = serializeBag(target.bag);
            hubCtx.sendToUser(target.userId, world.serverId, {
              type: 'combat_hp',
              hp: target.bag.hp,
              lastDamageAt: target.bag.lastDamageAt,
              dead: target.dead,
              deathRemain: died ? DEATH_COUNTDOWN_MS / 1000 : undefined,
              fromKind: mon.kind,
              ts: now,
            });
          }
          events.push({
            type: 'monster_attack',
            monsterId: mon.id,
            targetId: target.userId,
            damage: dmg,
          });
          if (died) {
            const name =
              (sock && (sock.displayName || sock.username)) ||
              `玩家${target.userId}`;
            hubCtx.broadcastServer(world.serverId, {
              type: 'combat_death',
              userId: target.userId,
              username: sock ? sock.username : undefined,
              displayName: name,
              x: target.x,
              y: target.y,
              z: target.z,
              countdown: DEATH_COUNTDOWN_MS / 1000,
              ts: now,
            });
          }
        }
      }

      // 火堆灼烧
      for (const pit of world.firePits) {
        pit.acc = (pit.acc || 0) + dt;
        while (pit.acc >= FIRE_TICK) {
          pit.acc -= FIRE_TICK;
          for (const mon of world.monsters.values()) {
            if (Math.hypot(mon.x - pit.x, mon.z - pit.z) <= FIRE_RADIUS) {
              mon.hp -= FIRE_DMG;
            }
          }
        }
      }

      // 怪死亡：必得金币 + 可能掉箱
      for (const mon of [...world.monsters.values()]) {
        if (mon.hp > 0) continue;
        world.monsters.delete(mon.id);
        const tier = rollKillChest(mon.kind);
        events.push({ type: 'monster_dead', monsterId: mon.id, kind: mon.kind, x: mon.x, y: mon.y, z: mon.z });
        if (mon.lastHitBy) {
          const killer = world.players.get(mon.lastHitBy);
          if (killer && !killer.dead) {
            const goldGain = rollKillGold(mon.kind);
            killer.bag.gold = (killer.bag.gold || 0) + goldGain;
            const sock = socketsByUser.get(killer.userId);
            if (sock) {
              sock.combatBag = serializeBag(killer.bag);
              hubCtx.sendToUser(killer.userId, world.serverId, {
                type: 'combat_gold',
                gold: killer.bag.gold,
                gain: goldGain,
                reason: 'kill',
                ts: now,
              });
            }
            if (tier) {
              const chest = makeChestEntry(tier);
              killer.bag.chests.push(chest);
              if (sock) {
                sock.combatBag = serializeBag(killer.bag);
                hubCtx.sendToUser(killer.userId, world.serverId, {
                  type: 'combat_loot_chest',
                  chest,
                  reason: 'kill',
                  ts: now,
                });
              }
            }
          }
        }
      }

      // 死亡倒计时结束 → 物资盒（仅掉当前装备武器）+ 保险箱武器带回 + 踢人
      for (const p of [...world.players.values()]) {
        if (!p.dead || !p.deathAt) continue;
        if (now - p.deathAt < DEATH_COUNTDOWN_MS) continue;

        const full = normalizeBag(p.bag);
        const { dropWeapons, vaultWeapons, overflowGold } = splitDeathWeapons(full);
        const crateBag = serializeBag({
          ...full,
          weapons: dropWeapons,
          equippedWeapon: dropWeapons[0] ? dropWeapons[0].weaponId : 'fist',
        });
        const keepBag = serializeBag({
          ...freshBag(),
          weapons: vaultWeapons,
          equippedWeapon: 'fist',
          gold: START_GOLD + overflowGold,
          hp: PLAYER_MAX_HP,
        });

        crateSeq += 1;
        const crateId = `crate_${world.serverId}_${crateSeq}`;
        const crate = {
          id: crateId,
          x: p.x,
          y: p.y,
          z: p.z,
          ownerId: p.userId,
          bag: crateBag,
        };
        world.crates.set(crateId, crate);
        hubCtx.broadcastServer(world.serverId, {
          type: 'combat_loot_crate',
          crate: slimCrate(crate),
          ts: now,
        });
        p.bag = normalizeBag(keepBag);
        p.dead = false;
        p.deathAt = 0;
        const sock = socketsByUser.get(p.userId);
        if (sock) sock.combatBag = keepBag;
        const vaultHint =
          vaultWeapons.length > 0
            ? `，保险箱保留 ${vaultWeapons.length} 把武器`
            : '';
        const overflowHint =
          overflowGold > 0 ? `，超出武器折合 ${overflowGold} 金` : '';
        hubCtx.onPlayerKicked(p.userId, world.serverId, {
          reason: 'death',
          message: `您已死亡：装备已掉落${vaultHint}${overflowHint}`,
          keepBag,
          vaultCount: vaultWeapons.length,
          overflowGold,
        });
        world.players.delete(p.userId);
      }

      // 周期性怪快照
      world.spawnAcc += dt;
      if (world.spawnAcc >= 0.45) {
        world.spawnAcc = 0;
        const monsters = [...world.monsters.values()].map(slimMonster);
        const crates = [...world.crates.values()].map(slimCrate);
        const furniture = [...world.furniture.values()];
        hubCtx.broadcastServer(world.serverId, {
          type: 'combat_state',
          monsters,
          crates,
          furniture,
          nightProgress,
          isNight,
          events,
          ts: now,
        });
      }
    }
  }, TICK_MS);

  if (typeof timer.unref === 'function') timer.unref();

  return {
    worldOf,
    ensurePlayer,
    handleAttack(serverId, userId, payload) {
      const world = worldOf(serverId);
      const p = world.players.get(Number(userId));
      if (!p || p.dead) return { ok: false, reason: 'dead' };
      const now = Date.now();
      if (p.attackCd > now) return { ok: false, reason: 'cd' };

      let weaponId = payload.weaponId || p.bag.equippedWeapon || 'fist';
      if (payload.useAxe) weaponId = 'axe';
      const def = WEAPON_DEFS[weaponId] || WEAPON_DEFS.fist;
      p.attackCd = now + 1000 / def.rate;

      const ox = Number(payload.x);
      const oy = Number(payload.y);
      const oz = Number(payload.z);
      const dirX = Number(payload.dirX) || 0;
      const dirZ = Number(payload.dirZ) || 0;
      const len = Math.hypot(dirX, dirZ) || 1;
      const nx = dirX / len;
      const nz = dirZ / len;

      let hit = null;
      let hitDist = def.range + 0.5;
      for (const mon of world.monsters.values()) {
        if (mon.state === 'burrow') continue;
        const dx = mon.x - ox;
        const dz = mon.z - oz;
        const dist = Math.hypot(dx, dz);
        if (dist > def.range) continue;
        if (def.kind === 'ranged') {
          // 射线近似：点积
          const along = dx * nx + dz * nz;
          if (along < 0) continue;
          const lateral = Math.abs(dx * nz - dz * nx);
          if (lateral > 1.2) continue;
        }
        if (dist < hitDist) {
          hitDist = dist;
          hit = mon;
        }
      }

      const events = [{ type: 'attack', userId, weaponId, x: ox, y: oy, z: oz }];
      if (hit) {
        hit.hp -= def.damage;
        hit.lastHitBy = Number(userId);
        events.push({
          type: 'hit',
          monsterId: hit.id,
          kind: hit.kind,
          damage: def.damage,
          hp: Math.max(0, hit.hp),
          x: hit.x,
          y: hit.y,
          z: hit.z,
        });
      }

      return {
        ok: true,
        weaponId,
        events,
        hitId: hit?.id || null,
        hitKind: hit?.kind || null,
      };
    },

    handleUseMedkit(serverId, userId, kind) {
      const world = worldOf(serverId);
      const p = world.players.get(Number(userId));
      if (!p || p.dead) return { ok: false };
      const heal = kind === 'medkit_large' ? 2500 : 800;
      const key = kind === 'medkit_large' ? 'medkit_large' : 'medkit_small';
      if ((p.bag[key] || 0) <= 0) return { ok: false };
      p.bag[key] -= 1;
      p.bag.hp = Math.min(PLAYER_MAX_HP, p.bag.hp + heal);
      p.bag.lastDamageAt = 0;
      return { ok: true, bag: serializeBag(p.bag) };
    },

    handleClaimCrate(serverId, userId, crateId) {
      const world = worldOf(serverId);
      const p = world.players.get(Number(userId));
      const crate = world.crates.get(crateId);
      if (!p || p.dead || !crate) return { ok: false };
      if (Math.hypot(p.x - crate.x, p.z - crate.z) > 4) return { ok: false, reason: 'far' };
      const loot = normalizeBag(crate.bag);
      // 合并
      for (const k of Object.keys(loot.materials)) {
        p.bag.materials[k] = (p.bag.materials[k] || 0) + (loot.materials[k] || 0);
      }
      p.bag.chests.push(...loot.chests);
      p.bag.weapons.push(...loot.weapons);
      p.bag.medkit_small += loot.medkit_small;
      p.bag.medkit_large += loot.medkit_large;
      p.bag.gold = (p.bag.gold || 0) + (loot.gold || 0);
      if (!p.bag.furniture) p.bag.furniture = emptyFurniture();
      if (loot.furniture) {
        for (const id of FURNITURE_IDS) {
          p.bag.furniture[id] = (p.bag.furniture[id] || 0) + (loot.furniture[id] || 0);
        }
      }
      world.crates.delete(crateId);
      return { ok: true, bag: serializeBag(p.bag), crateId };
    },

    handleHarvestLoot(serverId, userId, source) {
      const world = worldOf(serverId);
      const p = world.players.get(Number(userId));
      if (!p || p.dead) return { ok: false };
      const tier = rollHarvestChest(source);
      if (!tier) return { ok: true, chest: null };
      const chest = makeChestEntry(tier);
      p.bag.chests.push(chest);
      return { ok: true, chest };
    },

    handleEquipWeapon(serverId, userId, weaponInstanceId) {
      const world = worldOf(serverId);
      const p = world.players.get(Number(userId));
      if (!p || p.dead) return { ok: false };
      if (weaponInstanceId === 'fist') {
        p.bag.equippedWeapon = 'fist';
        return { ok: true, bag: serializeBag(p.bag) };
      }
      const w = p.bag.weapons.find((x) => x.id === weaponInstanceId);
      if (!w) return { ok: false };
      p.bag.equippedWeapon = w.weaponId;
      return { ok: true, bag: serializeBag(p.bag) };
    },

    handleClaimChest(serverId, userId, chestId) {
      const world = worldOf(serverId);
      const p = world.players.get(Number(userId));
      if (!p || p.dead) return { ok: false };
      const idx = p.bag.chests.findIndex((c) => c.id === chestId);
      if (idx < 0) return { ok: false };
      const chest = p.bag.chests[idx];
      const preview = chest.preview || {};
      if (preview.materials) {
        for (const [k, v] of Object.entries(preview.materials)) {
          p.bag.materials[k] = (p.bag.materials[k] || 0) + Number(v || 0);
        }
      }
      if (Array.isArray(preview.weapons)) {
        for (const wid of preview.weapons) {
          p.bag.weapons.push({ id: `wpn_${Date.now()}_${Math.random()}`, weaponId: wid });
        }
      }
      p.bag.medkit_small += Number(preview.medkit_small || 0);
      p.bag.medkit_large += Number(preview.medkit_large || 0);
      p.bag.chests.splice(idx, 1);
      return { ok: true, bag: serializeBag(p.bag) };
    },

    handleShopBuy(serverId, userId, shopItemId) {
      const world = worldOf(serverId);
      const p = world.players.get(Number(userId));
      if (!p || p.dead) return { ok: false, reason: 'dead' };
      const item = SHOP_ITEMS[shopItemId];
      if (!item) return { ok: false, reason: 'item' };
      const price = item.price;
      if ((p.bag.gold || 0) < price) return { ok: false, reason: 'gold' };
      p.bag.gold -= price;
      if (!p.bag.furniture) p.bag.furniture = emptyFurniture();
      if (item.furnitureId) {
        p.bag.furniture[item.furnitureId] = (p.bag.furniture[item.furnitureId] || 0) + 1;
      } else if (item.medkit === 'medkit_small') {
        p.bag.medkit_small = Math.min(99, (p.bag.medkit_small || 0) + 1);
      } else if (item.medkit === 'medkit_large') {
        p.bag.medkit_large = Math.min(99, (p.bag.medkit_large || 0) + 1);
      } else {
        p.bag.gold += price;
        return { ok: false, reason: 'item' };
      }
      return { ok: true, bag: serializeBag(p.bag) };
    },

    handleShopSell(serverId, userId, payload) {
      const world = worldOf(serverId);
      const p = world.players.get(Number(userId));
      if (!p || p.dead) return { ok: false };
      const kind = String(payload.kind || '');
      let gain = 0;

      if (kind === 'material') {
        const mat = String(payload.id || '');
        const n = Math.max(1, Math.floor(Number(payload.count) || 1));
        const price = MATERIAL_SELL[mat];
        if (!price || (p.bag.materials[mat] || 0) < n) return { ok: false };
        p.bag.materials[mat] -= n;
        gain = price * n;
      } else if (kind === 'medkit') {
        const key = payload.id === 'medkit_large' ? 'medkit_large' : 'medkit_small';
        if ((p.bag[key] || 0) <= 0) return { ok: false };
        p.bag[key] -= 1;
        gain = MEDKIT_SELL[key] || 0;
      } else if (kind === 'weapon') {
        const wid = String(payload.id || '');
        const idx = p.bag.weapons.findIndex((w) => w.id === wid);
        if (idx < 0) return { ok: false };
        const wpn = p.bag.weapons[idx];
        gain = WEAPON_SELL[wpn.weaponId] || 0;
        p.bag.weapons.splice(idx, 1);
        if (p.bag.equippedWeapon === wpn.weaponId) p.bag.equippedWeapon = 'fist';
      } else if (kind === 'chest') {
        const cid = String(payload.id || '');
        const idx = p.bag.chests.findIndex((c) => c.id === cid);
        if (idx < 0) return { ok: false };
        const chest = p.bag.chests[idx];
        gain = CHEST_SELL[chest.tier] || 100;
        p.bag.chests.splice(idx, 1);
      } else if (kind === 'furniture') {
        const fid = String(payload.id || '');
        if (!FURNITURE_IDS.includes(fid)) return { ok: false };
        if (!p.bag.furniture) p.bag.furniture = emptyFurniture();
        if ((p.bag.furniture[fid] || 0) <= 0) return { ok: false };
        p.bag.furniture[fid] -= 1;
        // 卖价约为购价 40%
        const buy = Object.values(SHOP_ITEMS).find((x) => x.furnitureId === fid);
        gain = buy ? Math.floor(buy.price * 0.4) : 50;
      } else {
        return { ok: false };
      }

      p.bag.gold = (p.bag.gold || 0) + gain;
      return { ok: true, bag: serializeBag(p.bag), gain };
    },

    handlePlaceFurniture(serverId, userId, payload) {
      const world = worldOf(serverId);
      const p = world.players.get(Number(userId));
      if (!p || p.dead) return { ok: false };
      const propId = String(payload.propId || '');
      if (!FURNITURE_IDS.includes(propId)) return { ok: false };
      if (!p.bag.furniture) p.bag.furniture = emptyFurniture();
      if ((p.bag.furniture[propId] || 0) <= 0) return { ok: false };
      p.bag.furniture[propId] -= 1;
      monSeq += 1;
      const id = `furn_${serverId}_${monSeq}`;
      const placed = {
        id,
        propId,
        x: Number(payload.x) || p.x,
        y: Number(payload.y) || p.y,
        z: Number(payload.z) || p.z,
        yaw: Number(payload.yaw) || 0,
        ownerId: Number(userId),
      };
      world.furniture.set(id, placed);
      if (propId === 'firepit') {
        world.firePits.push({ x: placed.x, y: placed.y, z: placed.z, acc: 0 });
      }
      return { ok: true, bag: serializeBag(p.bag), placed };
    },

    registerFirePit(serverId, x, y, z) {
      const world = worldOf(serverId);
      world.firePits.push({ x, y, z, acc: 0 });
    },

    getPlayerBag(serverId, userId) {
      const p = worldOf(serverId).players.get(Number(userId));
      return p ? serializeBag(p.bag) : null;
    },

    setPlayerBag(serverId, userId, bag) {
      const world = worldOf(serverId);
      const p = ensurePlayer(world, userId, bag);
      p.bag = normalizeBag(bag);
      p.dead = p.bag.hp <= 0;
    },

    removePlayer(serverId, userId) {
      worldOf(serverId).players.delete(Number(userId));
    },

    /**
     * 移除该玩家已放置家具，返回 propId 列表（用于死亡折现）
     */
    removeOwnedFurniture(serverId, userId) {
      const world = worldOf(serverId);
      const uid = Number(userId);
      const removed = [];
      const removedIds = [];
      for (const [id, f] of [...world.furniture.entries()]) {
        if (Number(f.ownerId) !== uid) continue;
        world.furniture.delete(id);
        removed.push(f.propId);
        removedIds.push(id);
        if (f.propId === 'firepit') {
          world.firePits = world.firePits.filter(
            (p) => Math.hypot(p.x - f.x, p.z - f.z) > 0.35
          );
        }
      }
      return { propIds: removed, ids: removedIds };
    },
  };
}

module.exports = { attachCombatWorld, worldOf };

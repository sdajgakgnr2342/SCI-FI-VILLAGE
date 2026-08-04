<template>
  <div class="play">
    <div ref="viewport" class="viewport" />
    <div class="hud">
      <div class="top">
        <router-link to="/worlds">← 世界</router-link>
        <strong>{{ worldName }}</strong>
        <span>{{ hint }}</span>
      </div>
      <div class="hotbar">
        <div
          v-for="slot in hotbar"
          :key="slot.slot"
          class="slot"
          :class="{ active: slot.slot === 0 }"
        >
          <span class="id">{{ slot.itemId }}</span>
          <span class="qty">{{ slot.quantity }}</span>
        </div>
      </div>
      <p class="tips">WASD 移动 · 空格跳跃 · Shift 冲刺 · 鼠标锁定视角 · Q 破坏 · E 放置合金块</p>
    </div>
    <div v-if="loading" class="overlay">加载世界…</div>
    <div v-if="error" class="overlay error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { GameEngine } from '@/game/engine'
import { getInventory, getWorld, syncPosition, type InventoryItem } from '@/api/world'

const route = useRoute()
const viewport = ref<HTMLElement | null>(null)
const loading = ref(true)
const error = ref('')
const worldName = ref('')
const inventory = ref<InventoryItem[]>([])
const hint = ref('')

let engine: GameEngine | null = null

const worldId = computed(() => Number(route.params.worldId))

const hotbar = computed(() => {
  const slots = Array.from({ length: 5 }, (_, i) => ({
    slot: i,
    itemId: '—',
    quantity: 0,
  }))
  for (const item of inventory.value) {
    if (item.slot >= 0 && item.slot < 5) {
      slots[item.slot] = item
    }
  }
  return slots
})

onMounted(async () => {
  if (!viewport.value) return
  try {
    const data = await getWorld(worldId.value)
    worldName.value = data.world.name
    inventory.value = await getInventory(worldId.value)

    engine = new GameEngine(viewport.value, data.world.seed)
    engine.setSpawn(data.player.x || 16, data.player.y || 18, data.player.z || 24, data.player.yaw, data.player.pitch)
    engine.onPosition = (pos) => {
      hint.value = `${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`
      syncPosition({ worldId: worldId.value, ...pos }).catch(() => undefined)
    }
    engine.start()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  engine?.dispose()
  engine = null
})
</script>

<style scoped>
.play {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000;
}

.viewport {
  width: 100%;
  height: 100%;
}

.viewport :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}

.hud {
  pointer-events: none;
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 0.75rem;
}

.top {
  pointer-events: auto;
  display: flex;
  gap: 1rem;
  align-items: center;
  font-size: 0.9rem;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
}

.top a {
  color: var(--accent);
}

.hotbar {
  display: flex;
  gap: 0.35rem;
  justify-content: center;
  margin-bottom: 0.25rem;
}

.slot {
  width: 58px;
  height: 58px;
  border: 2px solid rgba(61, 214, 198, 0.35);
  background: rgba(7, 16, 21, 0.72);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 0.25rem;
  font-size: 0.65rem;
}

.slot.active {
  border-color: var(--accent);
  box-shadow: 0 0 12px rgba(61, 214, 198, 0.25);
}

.qty {
  align-self: flex-end;
  color: var(--warn);
}

.tips {
  text-align: center;
  font-size: 0.78rem;
  color: rgba(232, 244, 242, 0.75);
  text-shadow: 0 1px 3px #000;
  margin-bottom: 0.25rem;
}

.overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(7, 16, 21, 0.82);
  font-family: var(--font-display);
  letter-spacing: 0.08em;
}

.overlay.error {
  color: var(--danger);
}
</style>

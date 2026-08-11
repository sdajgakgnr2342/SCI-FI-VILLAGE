<template>
  <div class="play" :class="{ 'editing-controls': editingControls }">
    <div ref="viewport" class="viewport" />

    <div class="hud">
      <!-- 顶：金币 + 血条 -->
      <div class="top-stats" aria-label="状态">
        <div class="gold-chip" title="金币">
          <span class="gold-ico">金</span>
          <span class="gold-num">{{ formatGold(playerBag.gold) }}</span>
        </div>
        <div class="hp-bar-wrap" aria-label="生命值">
          <div class="hp-bar-track">
            <div
              class="hp-bar-fill"
              :class="hpBand"
              :style="{ width: `${Math.max(0, Math.min(100, (playerHp / 10000) * 100))}%` }"
            />
          </div>
          <span class="hp-bar-text">{{ Math.ceil(playerHp) }} / 10000</span>
        </div>
        <div
          class="daynight-chip"
          :class="{ night: dayNightHud.isNight, dusk: dayNightHud.phase === 'dusk' }"
          :title="dayNightHud.text"
        >
          {{ dayNightHud.text }}
        </div>
      </div>

      <!-- 左上：小队条 + 其下 15 秒广播条 -->
      <div class="corner-left">
        <div v-if="squadHud.length" class="squad-strip">
          <div
            v-for="m in squadHud"
            :key="m.userId"
            class="squad-row"
            :class="{ 'is-fallen': m.fallen }"
          >
            <i class="slot" :style="{ background: squadColor(m.slot) }">{{ m.slot }}</i>
            <span class="sname">{{ shortName(m.name) }}</span>
            <span v-if="m.fallen" class="fallen">已阵亡</span>
            <span v-else-if="m.online === false" class="offline">离线</span>
          </div>
        </div>
        <div class="broadcast-feed" aria-live="polite">
          <div v-for="b in broadcastLive" :key="b.id" class="bcast">
            <span class="b-who">{{ b.who }}</span><span class="b-sep">：</span
            ><span class="b-txt">{{ b.text }}</span>
          </div>
        </div>
      </div>

      <!-- 右上：地图 → 设置 → 标记 → 消息 -->
      <div class="corner-right">
        <MiniMap
          :my-x="mapMe.x"
          :my-z="mapMe.z"
          :my-yaw="mapMe.yaw"
          :my-user-id="auth.user?.id || 0"
          :peers="mapPeers"
          :squad-members="squadHud"
          :terrain-sample="minimapTerrainSample"
          :terrain-rev="mapTerrainRev"
          :squad-marks="squadMarks"
          @clear-my-mark="clearMySquadMark"
        />
        <button
          type="button"
          class="icon-btn"
          title="设置"
          aria-label="设置"
          @click.stop="showSettings = !showSettings"
        >
          <svg class="gear" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.07 7.07 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.23-1.12.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.83 14.52a.5.5 0 0 0-.12.64l1.92 3.32c.12.22.39.3.6.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.58-.22 1.13-.54 1.63-.94l2.39.96c.22.08.48 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
            />
          </svg>
        </button>
        <button
          type="button"
          class="icon-btn mark-btn"
          :class="{ active: !!mySquadMark }"
          title="点一下：标记准星位置；长按本按钮：清除自己的标记"
          aria-label="标记"
          @pointerdown.prevent.stop="onMarkPointerDown"
          @pointerup.prevent.stop="onMarkPointerUp"
          @pointercancel.prevent.stop="onMarkPointerCancel"
          @pointerleave.prevent.stop="onMarkPointerCancel"
        >
          <svg class="gear" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 2c-3.3 0-6 2.6-6 5.8 0 4.4 6 11.2 6 11.2s6-6.8 6-11.2C18 4.6 15.3 2 12 2zm0 8.2a2.4 2.4 0 1 1 0-4.8 2.4 2.4 0 0 1 0 4.8z"
            />
          </svg>
        </button>
        <SquadChat
          :messages="chatMessages"
          :my-user-id="auth.user?.id || 0"
          @send="sendTeamChat"
          @restore-mark="restoreMarkFromChat"
        />
      </div>

      <div v-if="showWare" class="warehouse">
        <h3>
          仓库
          <button type="button" class="chip buy ware-shop-link" @click="toggleShop">商城</button>
        </h3>
        <div class="ware-grid">
          <button
            v-for="m in materials"
            :key="m"
            type="button"
            class="ware-item"
            :class="{ active: selectedMat === m }"
            :title="MATERIAL_LABEL[m]"
            @pointerdown.prevent="selectMat(m)"
          >
            <GameIcon class="mat-icon" :name="MATERIAL_ICON[m]" :size="22" />
            <span class="mlabel">{{ MATERIAL_LABEL[m] }}</span>
            <span class="mqty">{{ inv[m] }}</span>
            <span class="msell" @pointerdown.prevent.stop="sellItem('material', m, 1)">卖</span>
          </button>
        </div>
        <div class="ware-row">
          <span>工具</span>
          <button type="button" class="chip" :class="{ active: tool === 'hand' }" @pointerdown.prevent="setTool('hand')">手</button>
          <button type="button" class="chip" :class="{ active: tool === 'axe' }" @pointerdown.prevent="setTool('axe')">斧头</button>
        </div>
        <div v-if="playerBag.weapons.length" class="ware-row ware-col">
          <span>武器</span>
          <p class="ware-tip ware-tip-inline">
            装备中死亡掉落 · 未装备进保险箱（最多 {{ SAFE_VAULT_MAX }} 把，超出折金）
          </p>
          <button
            type="button"
            class="chip"
            :class="{ active: playerBag.equippedWeapon === 'fist' }"
            @pointerdown.prevent="equipWeapon('fist')"
          >
            拳头
          </button>
          <div v-for="w in playerBag.weapons" :key="w.id" class="wpn-row">
            <button
              type="button"
              class="chip"
              :class="{ active: isEquippedInstance(w) }"
              @pointerdown.prevent="equipWeapon(w.id)"
            >
              {{ weaponLabel(w.weaponId) }}
              <i class="wpn-tag" :class="isDeathDropWeapon(w) ? 'drop' : 'safe'">
                {{ isDeathDropWeapon(w) ? '掉落' : '保险箱' }}
              </i>
            </button>
            <button
              type="button"
              class="chip sell"
              :disabled="!(WEAPON_SELL[w.weaponId] > 0)"
              @pointerdown.prevent="sellItem('weapon', w.id)"
            >
              卖{{ WEAPON_SELL[w.weaponId] || 0 }}
            </button>
          </div>
        </div>
        <div v-if="playerBag.chests.length" class="ware-row ware-col">
          <span>宝箱</span>
          <button
            v-for="c in playerBag.chests"
            :key="c.id"
            type="button"
            class="chip"
            @pointerdown.prevent="openChest(c.id)"
          >
            {{ chestLabel(c.tier) }}
          </button>
          <button
            v-for="c in playerBag.chests"
            :key="`sell-c-${c.id}`"
            type="button"
            class="chip sell"
            @pointerdown.prevent="sellItem('chest', c.id)"
          >
            卖{{ CHEST_SELL[c.tier] || 0 }}
          </button>
        </div>
        <div class="ware-row">
          <span>药物</span>
          <button
            type="button"
            class="chip"
            :disabled="playerBag.medkit_small <= 0"
            @pointerdown.prevent="useMedkit('medkit_small')"
          >
            小药×{{ playerBag.medkit_small }}
          </button>
          <button
            type="button"
            class="chip sell"
            :disabled="playerBag.medkit_small <= 0"
            title="出售"
            @pointerdown.prevent="sellItem('medkit', 'medkit_small')"
          >
            卖{{ MEDKIT_SELL.medkit_small }}
          </button>
          <button
            type="button"
            class="chip"
            :disabled="playerBag.medkit_large <= 0"
            @pointerdown.prevent="useMedkit('medkit_large')"
          >
            大药×{{ playerBag.medkit_large }}
          </button>
          <button
            type="button"
            class="chip sell"
            :disabled="playerBag.medkit_large <= 0"
            title="出售"
            @pointerdown.prevent="sellItem('medkit', 'medkit_large')"
          >
            卖{{ MEDKIT_SELL.medkit_large }}
          </button>
        </div>
        <div v-if="ownedFurniture.length" class="ware-row ware-col">
          <span>建造物</span>
          <div v-for="f in ownedFurniture" :key="f.id" class="furn-row">
            <button
              type="button"
              class="chip"
              :class="{ active: selectedFurniture === f.id }"
              @pointerdown.prevent="selectFurniture(f.id)"
            >
              {{ f.label }}×{{ f.count }}
            </button>
            <button
              type="button"
              class="chip sell"
              title="出售"
              @pointerdown.prevent="sellItem('furniture', f.id)"
            >
              卖{{ furnitureSellPrice(f.id) }}
            </button>
          </div>
        </div>
        <div class="ware-row">
          <span>形状</span>
          <button
            v-for="s in shapes"
            :key="s"
            type="button"
            class="chip"
            :class="{ active: buildShape === s }"
            @pointerdown.prevent="setShape(s)"
          >
            {{ SHAPE_LABEL[s] }}
          </button>
        </div>
        <p class="ware-tip">
          选中材料即建造 · 选中建造物对准后点「放置」 · 取消即挖砍采
        </p>
        <button type="button" class="ghost-close" @click="showWare = false">关闭</button>
      </div>

      <div v-if="showShop" class="warehouse shop-panel">
        <h3>商城 · 金币 {{ formatGold(playerBag.gold) }}</h3>
        <p class="ware-tip">仅出售建造物与药物（武器不可购买）</p>
        <div class="shop-list">
          <div v-for="item in SHOP_ITEMS" :key="item.id" class="shop-row">
            <div class="shop-meta">
              <strong>{{ item.label }}</strong>
              <span v-if="item.hint" class="shop-hint">{{ item.hint }}</span>
            </div>
            <button
              type="button"
              class="chip buy"
              :disabled="playerBag.gold < item.price || isDead"
              @pointerdown.prevent="buyShopItem(item.id)"
            >
              {{ item.price }} 金
            </button>
          </div>
        </div>
        <button type="button" class="ghost-close" @click="showShop = false">关闭</button>
      </div>

      <button
        v-if="!isTouch && !loading && !error"
        type="button"
        class="desk-ware"
        title="仓库"
        aria-label="仓库"
        @click="toggleWare"
      >
        <GameIcon name="ware" :size="26" />
      </button>
      <button
        v-if="!isTouch && !loading && !error"
        type="button"
        class="desk-shop"
        title="商城"
        aria-label="商城"
        @click="toggleShop"
      >
        商
      </button>

      <button
        v-if="!isTouch && !loading && !error && !isDead"
        type="button"
        class="desk-attack"
        title="攻击 (F)"
        aria-label="攻击"
        @pointerdown.prevent="onAttack"
      >
        <svg viewBox="0 0 1024 1024" width="28" height="28" aria-hidden="true">
          <path
            d="M505.37931 745.931034l370.758621-370.75862-13.241379-57.379311-392.827586 392.827587zM439.172414 776.827586c4.413793 4.413793 13.241379 8.827586 17.655172 8.827586l-26.482758-26.482758c4.413793 4.413793 4.413793 8.827586 8.827586 17.655172z"
            fill="currentColor"
          />
          <path
            d="M434.758621 754.758621v-8.827587l-185.379311-185.37931c0 4.413793 4.413793 13.241379 8.827587 17.655173l176.551724 176.551724zM937.931034 406.068966L840.827586 22.068966c-4.413793-8.827586-8.827586-17.655172-17.655172-17.655173-8.827586-4.413793-17.655172 0-26.482759 4.413793L280.275862 520.827586l35.310345 35.310345 485.517241-481.103448 61.793104 242.75862 8.827586-8.827586c8.827586-8.827586 26.482759-8.827586 35.310345 0 8.827586 8.827586 8.827586 26.482759 0 35.310345l-30.896552 30.896552 8.827586 30.896552-366.344827 361.931034 35.310344 35.310345 375.172414-370.758621c8.827586-8.827586 13.241379-17.655172 8.827586-26.482758z"
            fill="currentColor"
          />
        </svg>
      </button>

      <div class="bottom">
        <div class="hotbar">
          <div
            v-for="m in materials"
            :key="m"
            class="slot"
            :class="{ active: selectedMat === m }"
            :title="MATERIAL_LABEL[m]"
            @pointerdown="selectMat(m)"
          >
            <span class="qty">{{ inv[m] ?? 0 }}</span>
            <GameIcon class="mat-icon" :name="MATERIAL_ICON[m]" :size="22" />
            <span class="id">{{ MATERIAL_LABEL[m] }}</span>
          </div>
        </div>
        <p v-if="!isTouch" class="tips">
          {{
            actionHint ||
            `格子#${myCellNum} · Q${buildMode ? '建造' : '操作'} · 点材料建造/再点取消 · C蹲 · ${breakLabel}`
          }}
        </p>
      </div>
    </div>

    <!-- 设置：挂在 play 根层，避免被物体提示盖住 -->
    <div
      v-if="showSettings"
      class="settings-overlay"
      @pointerdown.self.prevent="showSettings = false"
    >
      <div
        class="settings-panel"
        role="dialog"
        aria-label="设置"
        @pointerdown.stop
      >
        <header class="settings-head">
          <h3>设置</h3>
          <button type="button" class="ghost-close head-close" @click="showSettings = false">
            关闭
          </button>
        </header>
        <div class="settings-body">
          <div class="settings-actions">
            <button type="button" class="settings-link" @click="enterControlEdit">
              自定义键位
            </button>
            <button type="button" class="settings-link danger" @click="goExitServer">
              退出服务器
            </button>
          </div>
          <div v-if="isTouch" class="settings-import">
            <input v-model="importCode" class="code-input" maxlength="12" placeholder="输入键位码" />
            <button type="button" class="settings-link slim" @click="doImportCode">导入</button>
          </div>
          <p v-if="shareCodeHint" class="settings-note">{{ shareCodeHint }}</p>

          <div class="settings-block">
            <span class="settings-label">画质</span>
            <div class="settings-row">
              <button
                v-for="q in qualityOptions"
                :key="q"
                type="button"
                class="chip-set"
                :class="{ active: playSettings.quality === q }"
                @click="setQuality(q)"
              >
                {{ QUALITY_LABEL[q] }}
              </button>
            </div>
          </div>
          <label class="settings-toggle">
            <input v-model="playSettings.antialias" type="checkbox" @change="applyGraphicsNow" />
            <span>抗锯齿（默认关）</span>
          </label>
          <label class="settings-toggle">
            <input v-model="playSettings.muted" type="checkbox" @change="applyMuteNow" />
            <span>静音</span>
          </label>
        </div>
      </div>
    </div>

    <div
      v-if="!loading && !error && !showSettings && (actionRing.visible || editingControls)"
      class="hud-widget action-ring"
      :class="{ selected: editingControls && editSelected === 'actionRing' }"
      :style="hudWidgetStyle('actionRing')"
      @pointerdown.prevent.stop="onHudDown($event, 'actionRing')"
      @pointermove="onHudMove($event, 'actionRing')"
      @pointerup="onHudUp"
      @pointercancel="onHudUp"
    >
      <svg viewBox="0 0 100 100" class="ring-svg">
        <circle class="ring-bg" cx="50" cy="50" r="42" />
        <circle
          class="ring-fg"
          cx="50"
          cy="50"
          r="42"
          :stroke-dasharray="ringCirc"
          :stroke-dashoffset="ringOffset"
        />
      </svg>
      <span class="ring-time">{{
        actionRing.visible ? `${actionRing.remain.toFixed(1)}s` : '圆环'
      }}</span>
      <span v-if="actionRing.visible && actionRing.label" class="ring-label">{{
        actionRing.label
      }}</span>
      <span v-if="editingControls" class="edit-tag">操作圆环</span>
    </div>

    <div
      v-if="!loading && !error && !showSettings && (targetName || editingControls)"
      class="hud-widget target-hint"
      :class="{ selected: editingControls && editSelected === 'targetHint' }"
      :style="hudWidgetStyle('targetHint')"
      @pointerdown.prevent.stop="onHudDown($event, 'targetHint')"
      @pointermove="onHudMove($event, 'targetHint')"
      @pointerup="onHudUp"
      @pointercancel="onHudUp"
    >
      {{ targetName || '物体提示' }}
    </div>

    <MobileControls
      v-if="(isTouch || editingControls) && !loading && !error"
      :rotated="landscapeForced"
      :break-label="breakLabel"
      :crouched="crouched"
      :layout="controlLayout"
      :editing="editingControls"
      :selected-id="editSelected"
      :mode-icon="modeIcon"
      :build-mode="buildMode"
      :force-show="isTouch"
      @move="onMove"
      @look="onLook"
      @jump="onJump"
      @break="onBreak"
      @attack="onAttack"
      @crouch-toggle="onCrouchToggle"
      @warehouse="toggleWare"
      @select="onControlSelect"
      @update-item="onControlDrag"
    />

    <!-- 键位编辑条：顶栏，避免挡住右下操作键 -->
    <div
      v-if="editingControls"
      class="ctrl-edit-bar"
      :class="{ collapsed: editBarCollapsed }"
    >
      <button
        type="button"
        class="ctrl-collapse"
        :title="editBarCollapsed ? '展开编辑栏' : '收起编辑栏'"
        :aria-label="editBarCollapsed ? '展开' : '收起'"
        @click.stop="editBarCollapsed = !editBarCollapsed"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            v-if="editBarCollapsed"
            fill="currentColor"
            d="M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z"
          />
          <path
            v-else
            fill="currentColor"
            d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"
          />
        </svg>
      </button>
      <template v-if="!editBarCollapsed">
        <div class="ctrl-edit-head">
          <strong>自定义键位</strong>
          <span>{{ editSelected ? CONTROL_LABEL[editSelected] : '点选控件后拖动' }}</span>
        </div>
        <template v-if="editSelected">
          <label class="slider-row">
            <span>大小</span>
            <input
              type="range"
              min="0.6"
              max="1.8"
              step="0.05"
              :value="controlLayout.items[editSelected].size"
              @input="onSizeSlider"
            />
          </label>
          <label class="slider-row">
            <span>透明度</span>
            <input
              type="range"
              min="0.25"
              max="1"
              step="0.05"
              :value="controlLayout.items[editSelected].opacity"
              @input="onOpacitySlider"
            />
          </label>
        </template>
        <div class="ctrl-edit-actions">
          <button type="button" @click="resetControls">恢复默认</button>
          <button type="button" @click="doShareCode">分享码</button>
          <button type="button" class="primary" @click="saveControls">保存</button>
          <button type="button" @click="cancelControlEdit">取消</button>
        </div>
        <p v-if="editMsg" class="ctrl-edit-msg">{{ editMsg }}</p>
      </template>
      <div v-else class="ctrl-edit-mini">
        <span>{{ editSelected ? CONTROL_LABEL[editSelected] : `拖动 v${CONTROL_DRAG_VERSION}` }}</span>
        <button type="button" class="mini-save" @click="saveControls">保存</button>
        <button type="button" class="mini-cancel" @click="cancelControlEdit">取消</button>
      </div>
    </div>

    <div v-if="deploying" class="deploy-banner" aria-live="polite">
      <div class="deploy-title">准备投送</div>
      <div class="deploy-count">{{ deploySecText }}</div>
      <div class="deploy-sub">
        {{ deployLoadHint }} · 组队可同舱活动 · 倒计时结束后投下
      </div>
      <div class="deploy-bar"><i :style="{ width: `${deployTimePct}%` }" /></div>
    </div>

    <div v-if="isDead" class="death-banner" aria-live="assertive">
      <div class="deploy-title">您已死亡</div>
      <div class="deploy-count">{{ Math.ceil(deathRemain) }}</div>
      <div class="deploy-sub">
        倒计时后：当前装备掉落 · 未装备武器进保险箱带回 · 其余物资留在原地并退出
      </div>
      <div class="deploy-bar"><i :style="{ width: `${(deathRemain / 10) * 100}%` }" /></div>
    </div>

    <div class="blood-overlay" :style="{ opacity: bloodStrength }" aria-hidden="true" />

    <div v-if="loading || leaving" class="overlay">
      <LoadingSpinner :text="leaving ? '正在离开…' : '进入服务器…'" />
    </div>
    <div v-else-if="error" class="overlay error">{{ error }}</div>

    <div v-if="!loading && !error" class="aim" :class="{ build: buildMode, dim: deploying }">
      <div class="crosshair" />
      <div v-if="actionHint && !deploying" class="aim-toast">{{ actionHint }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { GameEngine } from '@/game/engine'
import { DEPLOY_DURATION_SEC } from '@/game/chunkMeshApi'
import { NpcManager } from '@/game/npcManager'
import { PresenceClient } from '@/game/presence'
import { RemotePlayerManager } from '@/game/remotePlayers'
import {
  createInventory,
  createPlayerBag,
  normalizePlayerBag,
  serializePlayerBag,
  mergeMaterialsIntoBag,
  bagMaterials,
  MATERIAL_LABEL,
  SHAPE_LABEL,
  type BuildShape,
  type MaterialId,
  type PlayerBag,
  type ToolId,
  type ConsumableId,
} from '@/game/inventory'
import {
  WEAPON_DEFS,
  bloodOverlayStrength,
  canSprint,
  injuryBand,
  type CombatWeaponId,
  PLAYER_MAX_HP,
  DEATH_COUNTDOWN_SEC,
} from '@/game/combatStats'
import {
  SHOP_ITEMS,
  FURNITURE_IDS,
  FURNITURE_LABEL,
  MEDKIT_SELL,
  WEAPON_SELL,
  CHEST_SELL,
  SAFE_VAULT_MAX,
  furnitureSellPrice,
  formatGold,
  type FurnitureId,
} from '@/game/shopCatalog'
import { CHEST_TIER_LABEL, type ChestTier } from '@/game/treasureChest'
import { CombatWorldView } from '@/game/combatWorldView'
import { sampleDayNightHud, type DayNightHud } from '@/game/dayNight'
import MobileControls from '@/components/MobileControls.vue'
import MiniMap from '@/components/MiniMap.vue'
import SquadChat from '@/components/SquadChat.vue'
import LoadingSpinner from '@/components/LoadingSpinner.vue'
import GameIcon from '@/components/GameIcon.vue'
import { MATERIAL_ICON, type IconName } from '@/components/iconData'
import { squadColor, type MapPeer, type SquadMember } from '@/game/squad'
import {
  SQUAD_MARK_TTL_MS,
  type SquadMark,
} from '@/game/squadMark'
import {
  CHAT_TEXT_MAX,
  nextChatId,
  pushChatItem,
  type SquadChatItem,
} from '@/game/squadChat'
import { onLandscapeLayout } from '@/composables/landscapeBus'
import { joinServer, leaveServer, nearbyPlayers, serverHeartbeat, queryServerBlocks, saveServerBlocks, saveServerInventory } from '@/api/server'
import { fetchPartyMine } from '@/api/party'
import {
  fetchControlLayout,
  importControlLayout,
  saveControlLayout,
  shareControlLayout,
} from '@/api/controls'
import {
  CONTROL_LABEL,
  CONTROL_IDS,
  clampItem,
  defaultControlLayout,
  loadLayoutLocal,
  normalizeControlLayout,
  saveLayoutLocal,
  type ControlId,
  type ControlLayout,
} from '@/game/controlLayout'
import { CONTROL_DRAG_VERSION, beginDragSession, moveDragSession, type DragSession } from '@/game/controlDrag'
import { clearLastServerId, setLastServerId } from '@/utils/lastServer'
import { useAuthStore } from '@/stores/auth'
import { cellNumberAt } from '@/game/mapGrid'
import { NatureAudio } from '@/game/natureAudio'
import { GameAudio } from '@/game/gameAudio'
import {
  loadPlaySettings,
  savePlaySettings,
  QUALITY_LABEL,
  type PlaySettings,
  type QualityPreset,
} from '@/game/playSettings'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const viewport = ref<HTMLElement | null>(null)
const loading = ref(true)
const leaving = ref(false)
const error = ref('')
const serverName = ref('')
const hint = ref('')
const peerHint = ref('')
/** 进服准备舱倒计时 */
const deploying = ref(false)
const deployRemain = ref(0)
const deployTimePct = ref(0)
const deployLoadHint = ref('加载地图与作战资源…')
const deploySecText = computed(() => Math.max(0, Math.ceil(deployRemain.value)))
const isTouch = ref(false)
const showWare = ref(false)
const showShop = ref(false)
const showSettings = ref(false)
const playSettings = reactive<PlaySettings>(loadPlaySettings())
const qualityOptions: QualityPreset[] = ['low', 'standard', 'high']
const actionHint = ref('')
const tool = ref<ToolId>('hand')
const playerBag = reactive(createPlayerBag())
const playerHp = ref(PLAYER_MAX_HP)
const isDead = ref(false)
const deathRemain = ref(0)
const bloodStrength = computed(() => bloodOverlayStrength(playerHp.value))
const hpBand = computed(() => injuryBand(playerHp.value))
const dayNightHud = reactive<DayNightHud>(sampleDayNightHud())
let dayNightTimer: number | undefined
let combatView: CombatWorldView | null = null
let deathCamOffset = false

/** 当前选中的建造材料；有选中=建造，无选中=挖砍采 */
const selectedMat = ref<MaterialId | null>(null)
/** 仓库选中的可放置家具 */
const selectedFurniture = ref<FurnitureId | null>(null)
const buildMode = computed(() => selectedMat.value != null || selectedFurniture.value != null)
const ownedFurniture = computed(() =>
  FURNITURE_IDS.filter((id) => (playerBag.furniture?.[id] || 0) > 0).map((id) => ({
    id,
    label: FURNITURE_LABEL[id],
    count: playerBag.furniture[id] || 0,
  }))
)
const buildShape = ref<BuildShape>('single')
const inv = reactive(createInventory())
/** 操作键图标：有材料=锤子，无材料=铲子 */
const modeIcon = computed<IconName>(() => (buildMode.value ? 'build' : 'dig'))
const breakLabel = computed(() => (buildMode.value ? '建' : '挖'))
const targetName = ref('')
const crouched = ref(false)
const squadMembers = ref<SquadMember[]>([])
const mapMe = reactive({ x: 0, z: 0, yaw: 0 })
const mapPeers = ref<MapPeer[]>([])
const myCellNum = computed(() => cellNumberAt(mapMe.x, mapMe.z))

/** 小地图：按世界种子/覆盖层采样草坪、溪流、石、树等 */
const mapTerrainRev = ref(0)
function minimapTerrainSample(x: number, z: number) {
  return engine?.getMinimapKind(x, z) ?? 'grass'
}

/** 小队战术标记（本地 + WS 同步） */
const squadMarks = ref<SquadMark[]>([])
const mySquadMark = computed(() => {
  const selfId = auth.user?.id || 0
  return squadMarks.value.find((m) => m.userId === selfId) || null
})
let markExpireTimer: number | undefined
let markHoldTimer: number | undefined
let markHoldCleared = false

function mySquadSlot() {
  const selfId = auth.user?.id || 0
  const m = squadHud.value.find((s) => s.userId === selfId)
  return m?.slot || 1
}

function syncSquadMarkVisuals() {
  const now = Date.now()
  squadMarks.value = squadMarks.value.filter((m) => m.expiresAt > now)
  engine?.setSquadMarks(squadMarks.value)
}

function upsertSquadMark(mark: SquadMark) {
  const list = squadMarks.value.filter((m) => m.userId !== mark.userId)
  list.push(mark)
  squadMarks.value = list
  syncSquadMarkVisuals()
  if (markExpireTimer) window.clearTimeout(markExpireTimer)
  const soonest = Math.min(...squadMarks.value.map((m) => m.expiresAt - Date.now()))
  if (Number.isFinite(soonest) && soonest > 0) {
    markExpireTimer = window.setTimeout(() => syncSquadMarkVisuals(), soonest + 30)
  }
}

function removeSquadMark(userId: number) {
  squadMarks.value = squadMarks.value.filter((m) => m.userId !== userId)
  syncSquadMarkVisuals()
}

function clearMySquadMark() {
  const selfId = auth.user?.id || 0
  if (!selfId) return
  if (!squadMarks.value.some((m) => m.userId === selfId)) return
  removeSquadMark(selfId)
  presence?.sendSquadMark({ clear: true })
  hint.value = '已清除标记'
  window.setTimeout(() => {
    if (hint.value === '已清除标记') hint.value = ''
  }, 1200)
}

function onMarkPointerDown() {
  markHoldCleared = false
  if (markHoldTimer) window.clearTimeout(markHoldTimer)
  markHoldTimer = window.setTimeout(() => {
    markHoldCleared = true
    clearMySquadMark()
  }, 420)
}

function onMarkPointerUp() {
  if (markHoldTimer) {
    window.clearTimeout(markHoldTimer)
    markHoldTimer = undefined
  }
  if (markHoldCleared) return
  placeSquadMark()
}

function onMarkPointerCancel() {
  if (markHoldTimer) {
    window.clearTimeout(markHoldTimer)
    markHoldTimer = undefined
  }
}

/** 局内消息（队伍/系统），条数封顶，几乎不影响性能 */
const chatMessages = ref<SquadChatItem[]>([])
/** 左上广播：仅展示近 15 秒，历史仍在队伍消息列表 */
const BROADCAST_TTL_MS = 15_000
/** 广播条最多同时显示条数（越新越靠下，超出顶掉最旧） */
const BROADCAST_MAX = 5
const broadcastLive = ref<{ id: string; who: string; text: string }[]>([])
const broadcastTimers = new Map<string, number>()

function shortChatName(userId: number, fallback?: string | null) {
  const m = squadHud.value.find((s) => s.userId === userId)
  return shortName(m?.name || fallback || '队友')
}

function pushBroadcast(item: SquadChatItem) {
  const isTeamChat = item.channel === 'team' && item.kind === 'chat'
  const isMark = item.kind === 'mark'
  const isDeath = item.kind === 'death'
  if (!isTeamChat && !isMark && !isDeath) return
  const selfId = auth.user?.id || 0
  const who = item.userId === selfId ? '我' : item.name || (isDeath ? '玩家' : '队友')
  const text =
    isMark
      ? item.text || `标记了${item.mark?.label || '地点'}`
      : item.text
  const id = item.id
  const merged = [
    ...broadcastLive.value.filter((b) => b.id !== id),
    { id, who, text },
  ]
  if (merged.length > BROADCAST_MAX) {
    const dropped = merged.slice(0, merged.length - BROADCAST_MAX)
    for (const d of dropped) {
      const t = broadcastTimers.get(d.id)
      if (t) window.clearTimeout(t)
      broadcastTimers.delete(d.id)
    }
  }
  broadcastLive.value = merged.slice(-BROADCAST_MAX)
  const prev = broadcastTimers.get(id)
  if (prev) window.clearTimeout(prev)
  const tid = window.setTimeout(() => {
    broadcastTimers.delete(id)
    broadcastLive.value = broadcastLive.value.filter((b) => b.id !== id)
  }, BROADCAST_TTL_MS)
  broadcastTimers.set(id, tid)
}

/** 已阵亡队友（死亡倒计时至踢服前） */
const fallenSquadIds = ref(new Set<number>())

function markSquadFallen(userId: number) {
  const uid = Number(userId)
  if (!uid) return
  const next = new Set(fallenSquadIds.value)
  next.add(uid)
  fallenSquadIds.value = next
}

function clearSquadFallen(userId: number) {
  const uid = Number(userId)
  if (!uid || !fallenSquadIds.value.has(uid)) return
  const next = new Set(fallenSquadIds.value)
  next.delete(uid)
  fallenSquadIds.value = next
}

function announcePlayerDeath(msg: Record<string, unknown>) {
  const uid = Number(msg.userId)
  if (!uid) return
  const selfId = auth.user?.id || 0
  const name =
    uid === selfId
      ? '我'
      : shortChatName(
          uid,
          String(msg.displayName || msg.username || '') || null
        )
  const isMate =
    uid === selfId || squadMembers.value.some((m) => m.userId === uid)
  if (isMate) markSquadFallen(uid)

  const item: SquadChatItem = {
    id: nextChatId(),
    channel: 'system',
    kind: 'death',
    userId: uid,
    name: uid === selfId ? '我' : name,
    text: '已阵亡',
    ts: Number(msg.ts) || Date.now(),
  }
  appendChat(item)
}

function appendChat(item: SquadChatItem) {
  chatMessages.value = pushChatItem(chatMessages.value, item)
  pushBroadcast(item)
}

function publishMarkSystem(mark: SquadMark, name?: string) {
  const label = mark.label || '地点'
  const who = name || shortChatName(mark.userId)
  const item: SquadChatItem = {
    id: nextChatId(),
    channel: 'system',
    kind: 'mark',
    userId: mark.userId,
    slot: mark.slot,
    name: who,
    text: `标记了${label}`,
    ts: Date.now(),
    mark: {
      userId: mark.userId,
      slot: mark.slot,
      x: mark.x,
      y: mark.y,
      z: mark.z,
      label: mark.label,
    },
  }
  appendChat(item)
  presence?.sendSquadChat({
    channel: 'system',
    kind: 'mark',
    slot: mark.slot,
    text: item.text,
    mark: item.mark,
  })
}

function placeSquadMark() {
  const eng = engine
  const selfId = auth.user?.id || 0
  if (!eng || !selfId) return
  const aim = eng.raycastMarkAim(64)
  if (!aim) {
    hint.value = '无法标记'
    return
  }
  const slot = mySquadSlot()
  const mark: SquadMark = {
    userId: selfId,
    slot,
    x: aim.x,
    y: aim.y,
    z: aim.z,
    label: aim.label,
    expiresAt: Date.now() + SQUAD_MARK_TTL_MS,
  }
  upsertSquadMark(mark)
  presence?.sendSquadMark({
    slot: mark.slot,
    x: mark.x,
    y: mark.y,
    z: mark.z,
    label: mark.label,
  })
  publishMarkSystem(mark, shortName(auth.user?.displayName || auth.user?.username || '我'))
  hint.value = `标记 · ${aim.label}`
  window.setTimeout(() => {
    if (hint.value.startsWith('标记')) hint.value = ''
  }, 1600)
}

function sendTeamChat(text: string) {
  const selfId = auth.user?.id || 0
  const t = text.trim().slice(0, CHAT_TEXT_MAX)
  if (!selfId || !t) return
  const slot = mySquadSlot()
  const name = shortName(auth.user?.displayName || auth.user?.username || '我')
  appendChat({
    id: nextChatId(),
    channel: 'team',
    kind: 'chat',
    userId: selfId,
    slot,
    name,
    text: t,
    ts: Date.now(),
  })
  presence?.sendSquadChat({
    channel: 'team',
    kind: 'chat',
    slot,
    text: t,
  })
}

function restoreMarkFromChat(item: SquadChatItem) {
  const m = item.mark
  if (!m) return
  upsertSquadMark({
    userId: m.userId,
    slot: m.slot,
    x: m.x,
    y: m.y,
    z: m.z,
    label: m.label,
    expiresAt: Date.now() + SQUAD_MARK_TTL_MS,
  })
  hint.value = '已重新显示标记'
  window.setTimeout(() => {
    if (hint.value === '已重新显示标记') hint.value = ''
  }, 1200)
}

function ingestRemoteChat(msg: {
  userId: number
  username?: string
  displayName?: string | null
  channel?: 'team' | 'system'
  kind?: string
  slot?: number
  text?: string
  mark?: {
    userId: number
    slot: number
    x: number
    y: number
    z: number
    label?: string
  }
  ts?: number
}) {
  const selfId = auth.user?.id || 0
  if (!msg.userId || msg.userId === selfId) return
  const slot = msg.slot || squadHud.value.find((s) => s.userId === msg.userId)?.slot || 1
  const name = shortChatName(msg.userId, msg.displayName || msg.username)
  const kind = (msg.kind as SquadChatItem['kind']) || 'chat'
  const channel = msg.channel === 'system' || kind === 'mark' || kind === 'wait' ? 'system' : 'team'
  let text = (msg.text || '').trim()
  if (kind === 'mark') {
    const label = msg.mark?.label || '地点'
    text = `标记了${label}`
  } else if (kind === 'wait') {
    text = '等一下'
  }
  // kind === 'chat'：text 保持纯内容
  appendChat({
    id: nextChatId(),
    channel,
    kind,
    userId: msg.userId,
    slot,
    name,
    text,
    ts: msg.ts || Date.now(),
    mark: msg.mark
      ? {
          userId: msg.mark.userId || msg.userId,
          slot: msg.mark.slot || slot,
          x: msg.mark.x,
          y: msg.mark.y,
          z: msg.mark.z,
          label: msg.mark.label,
        }
      : undefined,
  })
}

/** 左上小队：无组队也至少显示自己为 1 号；离线队友标 offline；阵亡标已阵亡 */
const squadHud = computed(() => {
  const selfId = auth.user?.id || 0
  const onlineIds = new Set(mapPeers.value.map((p) => p.userId))
  const fallen = fallenSquadIds.value
  const withFlags = (list: SquadMember[]) =>
    list.map((m) => ({
      ...m,
      online: m.userId === selfId || onlineIds.has(m.userId),
      fallen: fallen.has(m.userId),
    }))

  if (squadMembers.value.length) return withFlags(squadMembers.value)
  const u = auth.user
  if (!u) return []
  return withFlags([
    {
      userId: u.id,
      name: u.displayName || u.username || '我',
      slot: 1,
    },
  ])
})

const controlLayout = reactive<ControlLayout>(loadLayoutLocal(auth.user?.id))
const editingControls = ref(false)
const editBarCollapsed = ref(false)
const editSelected = ref<ControlId | null>('stick')
const editMsg = ref('')
const importCode = ref('')
const shareCodeHint = ref('')
let layoutBackup: ControlLayout | null = null
let natureAudio: NatureAudio | null = null
let gameAudio: GameAudio | null = null

function persistSettings() {
  savePlaySettings({ ...playSettings })
}

function applyMuteNow() {
  persistSettings()
  natureAudio?.setMuted(playSettings.muted)
  gameAudio?.setMuted(playSettings.muted)
}

function applyGraphicsNow() {
  persistSettings()
  engine?.applyGraphics({
    antialias: playSettings.antialias,
    quality: playSettings.quality,
  })
}

function setQuality(q: QualityPreset) {
  playSettings.quality = q
  applyGraphicsNow()
}

function shortName(name: string) {
  const n = (name || '').trim()
  if (n.length <= 12) return n
  return `${n.slice(0, 11)}…`
}
const actionRing = reactive({
  visible: false,
  progress: 0,
  remain: 0,
  label: '',
})
const ringCirc = 2 * Math.PI * 42
const ringOffset = computed(() => ringCirc * (1 - actionRing.progress))

const materials: MaterialId[] = ['turf', 'stone', 'wood', 'dry_grass', 'dirt', 'sand']
const shapes: BuildShape[] = ['single', 'wall', 'column', 'floor']

let engine: GameEngine | null = null
let npc: NpcManager | null = null
let remotes: RemotePlayerManager | null = null
let presence: PresenceClient | null = null
let nearbyTimer: number | undefined
let blockSyncTimer: number | undefined
let partyTimer: number | undefined
let serverId = 0
let offLayout: (() => void) | undefined
let hintTimer: number | undefined
let presenceAcc = 0
let mapPeerAcc = 0
let mapMeAcc = 0
let lastBlockFetchKey = ''

const BLOCK_FETCH_RADIUS = 112
const BLOCK_FETCH_Y_MIN = -16
const BLOCK_FETCH_Y_MAX = 96

/** 待落库方块队列（按坐标去重，离开前必须冲刷） */
const pendingBlocks = new Map<string, { x: number; y: number; z: number; blockId: string }>()
let blockFlushTimer: number | undefined
let invFlushTimer: number | undefined
let invDirty = false

function blockKey(b: { x: number; y: number; z: number }) {
  return `${b.x},${b.y},${b.z}`
}

async function flushPendingBlocks() {
  if (!serverId || !pendingBlocks.size) return
  const batch = Array.from(pendingBlocks.values())
  pendingBlocks.clear()
  if (blockFlushTimer) {
    window.clearTimeout(blockFlushTimer)
    blockFlushTimer = undefined
  }
  // 分片上传，避免单次过大
  for (let i = 0; i < batch.length; i += 200) {
    const chunk = batch.slice(i, i + 200)
    try {
      await saveServerBlocks(serverId, chunk)
    } catch (e) {
      // 失败放回队列，下次再试
      for (const b of chunk) pendingBlocks.set(blockKey(b), b)
      console.warn('[blocks] save failed', e)
      throw e
    }
  }
}

function scheduleBlockFlush() {
  if (blockFlushTimer) return
  blockFlushTimer = window.setTimeout(() => {
    blockFlushTimer = undefined
    flushPendingBlocks().catch(() => undefined)
  }, 400)
}

function scheduleInventoryFlush() {
  invDirty = true
  if (invFlushTimer) return
  invFlushTimer = window.setTimeout(() => {
    invFlushTimer = undefined
    flushInventory().catch(() => undefined)
  }, 800)
}

function applyInventoryFromServer(raw?: Record<string, unknown> | null) {
  applyBag(raw || {})
}

async function flushInventory() {
  if (!serverId || !invDirty) return
  invDirty = false
  if (invFlushTimer) {
    window.clearTimeout(invFlushTimer)
    invFlushTimer = undefined
  }
  try {
    mergeMaterialsIntoBag(playerBag, { ...inv } as never)
    playerBag.hp = playerHp.value
    const saved = await saveServerInventory(serverId, serializePlayerBag(playerBag) as never)
    applyBag(saved)
    syncBagToPresence()
  } catch (e) {
    invDirty = true
    console.warn('[inventory] save failed', e)
  }
}

async function fetchBlocksAround(cx: number, cz: number, force = false) {
  if (!serverId || !engine) return
  const minX = Math.floor(cx - BLOCK_FETCH_RADIUS)
  const maxX = Math.floor(cx + BLOCK_FETCH_RADIUS)
  const minZ = Math.floor(cz - BLOCK_FETCH_RADIUS)
  const maxZ = Math.floor(cz + BLOCK_FETCH_RADIUS)
  const key = `${Math.floor(cx / 16)},${Math.floor(cz / 16)}`
  if (!force && key === lastBlockFetchKey) return
  lastBlockFetchKey = key
  try {
    const list = await queryServerBlocks({
      serverId,
      minX,
      maxX,
      minY: BLOCK_FETCH_Y_MIN,
      maxY: BLOCK_FETCH_Y_MAX,
      minZ,
      maxZ,
    })
    if (list?.length && engine) {
      engine.applyRemoteBlocks(list)
      mapTerrainRev.value += 1
    }
  } catch {
    // ignore transient
  }
}

function publishLocalBlocks(
  blocks: { x: number; y: number; z: number; blockId: string }[]
) {
  if (!serverId || !blocks.length) return
  for (const b of blocks) {
    pendingBlocks.set(blockKey(b), {
      x: Math.floor(b.x),
      y: Math.floor(b.y),
      z: Math.floor(b.z),
      blockId: b.blockId,
    })
  }
  presence?.sendBlocks(blocks)
  scheduleBlockFlush()
}

async function flushWorldStateBeforeLeave() {
  // 先同步快照姿态（await 前 engine 可能被 dispose）
  const pose = engine?.getPose()
  const cam = engine?.camera.position
  const finalState =
    serverId && cam && pose
      ? {
          serverId,
          x: cam.x,
          y: cam.y,
          z: cam.z,
          yaw: pose.yaw,
          pitch: pose.pitch,
          inventory: { ...inv },
        }
      : null

  try {
    await flushPendingBlocks()
  } catch {
    /* best effort */
  }
  try {
    await flushInventory()
  } catch {
    /* best effort */
  }

  if (finalState) {
    try {
      await leaveServer(finalState)
      return
    } catch {
      /* fall through */
    }
  }
  try {
    await leaveServer()
  } catch {
    /* ignore */
  }
}

const landscape = inject<{
  forced: Ref<boolean>
  tryNativeLock: () => Promise<void>
}>('landscape')
const landscapeForced = computed(() => Boolean(landscape?.forced.value))

const routeServerId = computed(() => Number(route.params.serverId))

function detectInput() {
  isTouch.value =
    window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
}

async function enterFullscreen() {
  try {
    await landscape?.tryNativeLock()
  } catch {
    // ignore
  }
}

/** 异步加载后可能丢失手势授权，首次点击再补一次全屏 */
function armFullscreenGesture() {
  const tryFs = () => {
    if (document.fullscreenElement) return
    void enterFullscreen()
  }
  window.addEventListener('pointerdown', tryFs, { once: true, capture: true })
  window.addEventListener('touchstart', tryFs, { once: true, capture: true, passive: true })
  window.addEventListener('keydown', tryFs, { once: true, capture: true })
}

function syncEngineLoadout() {
  if (!engine) return
  engine.tool = tool.value
  engine.matArmed = selectedMat.value != null
  if (selectedMat.value) engine.buildMaterial = selectedMat.value
  engine.buildShape = buildShape.value
  engine.inventory = inv
  engine.setBuildMode(selectedMat.value != null || selectedFurniture.value != null)
}

function selectMat(m: MaterialId) {
  selectedFurniture.value = null
  selectedMat.value = selectedMat.value === m ? null : m
  syncEngineLoadout()
  if (engine) {
    engine.lastActionHint = selectedMat.value
      ? `建造 · ${MATERIAL_LABEL[selectedMat.value]} · 对准后点「放置」`
      : '操作模式 · 点「操作」挖砍采'
    flashHint()
  }
}

function selectFurniture(id: FurnitureId) {
  selectedMat.value = null
  selectedFurniture.value = selectedFurniture.value === id ? null : id
  syncEngineLoadout()
  if (engine) {
    engine.lastActionHint = selectedFurniture.value
      ? `放置 · ${FURNITURE_LABEL[selectedFurniture.value]} · 对准后点「放置」`
      : '操作模式 · 点「操作」挖砍采'
    flashHint()
  }
}

function toggleWare() {
  showShop.value = false
  showWare.value = !showWare.value
}

function toggleShop() {
  showWare.value = false
  showShop.value = !showShop.value
}

function buyShopItem(shopItemId: string) {
  if (isDead.value) return
  presence?.sendShopBuy(shopItemId)
}

function sellItem(kind: string, id: string, count = 1) {
  if (isDead.value) return
  presence?.sendShopSell({ kind, id, count })
}

function placeSelectedFurniture() {
  if (!engine || !presence || !selectedFurniture.value || isDead.value) return
  const aim = engine.raycastMarkAim(8)
  const pose = engine.getPose()
  const x = aim?.x ?? pose.x - Math.sin(pose.yaw) * 2.2
  const z = aim?.z ?? pose.z - Math.cos(pose.yaw) * 2.2
  const y = aim ? Math.max(0, aim.y - 1.15) : engine.getGroundY(x, z)
  presence.sendFurniturePlace({
    propId: selectedFurniture.value,
    x,
    y,
    z,
    yaw: pose.yaw,
  })
  engine.lastActionHint = `已请求放置 ${FURNITURE_LABEL[selectedFurniture.value]}`
  flashHint()
}

function setTool(t: ToolId) {
  tool.value = t
  syncEngineLoadout()
}
function setShape(s: BuildShape) {
  buildShape.value = s
  syncEngineLoadout()
}

function flashHint(text?: string) {
  if (text) {
    actionHint.value = text
    if (hintTimer) window.clearTimeout(hintTimer)
    hintTimer = window.setTimeout(() => {
      actionHint.value = ''
    }, 2200)
    return
  }
  if (!engine?.lastActionHint) return
  actionHint.value = engine.lastActionHint
  engine.lastActionHint = ''
  if (hintTimer) window.clearTimeout(hintTimer)
  hintTimer = window.setTimeout(() => {
    actionHint.value = ''
  }, 2200)
}

function onMove(forward: number, strafe: number) {
  engine?.setMoveInput(forward, strafe)
}
function onLook(dx: number, dy: number) {
  engine?.applyLook(dx, dy, 0.0062)
}
function onJump() {
  engine?.queueJump()
}
function onCrouchToggle() {
  engine?.queueCrouch()
  crouched.value = Boolean(engine?.crouching)
}
function onBreak() {
  if (!engine || isDead.value) return
  if (selectedFurniture.value) {
    placeSelectedFurniture()
    return
  }
  if (selectedMat.value) {
    engine.beginBuild()
  } else {
    engine.beginHarvest()
    tool.value = engine.tool
    syncEngineLoadout()
  }
  flashHint()
}

function onAttack() {
  if (!engine || isDead.value || !presence) return
  const pose = engine.getPose()
  const yaw = pose.yaw
  let dirX = -Math.sin(yaw)
  let dirZ = -Math.cos(yaw)
  const weaponId =
    tool.value === 'axe' && playerBag.equippedWeapon === 'fist'
      ? 'axe'
      : playerBag.equippedWeapon
  const jitter = engine.combatAimJitter(weaponId)
  dirX += jitter.jx
  dirZ += jitter.jz
  const len = Math.hypot(dirX, dirZ) || 1
  dirX /= len
  dirZ /= len
  presence.sendCombatAttack({
    x: pose.x,
    y: pose.y,
    z: pose.z,
    dirX,
    dirZ,
    weaponId,
    useAxe: tool.value === 'axe' && playerBag.equippedWeapon === 'fist',
  })
  engine.playCombatSwing(weaponId)
  const crateId = combatView?.nearestCrate(pose.x, pose.z)
  if (crateId) presence.sendClaimCrate(crateId)
}

function weaponLabel(id: CombatWeaponId) {
  return WEAPON_DEFS[id]?.label || id
}

/** 当前装备的那一把实例（同名多把时仅第一把视为装备掉落） */
function isEquippedInstance(w: PlayerBag['weapons'][number]) {
  if (playerBag.equippedWeapon === 'fist' || playerBag.equippedWeapon === 'axe') return false
  if (w.weaponId !== playerBag.equippedWeapon) return false
  const first = playerBag.weapons.find((x) => x.weaponId === playerBag.equippedWeapon)
  return first?.id === w.id
}

function isDeathDropWeapon(w: PlayerBag['weapons'][number]) {
  return isEquippedInstance(w)
}

function chestLabel(tier: ChestTier) {
  return CHEST_TIER_LABEL[tier] || tier
}

function applyBag(raw: unknown) {
  const next = normalizePlayerBag(raw)
  const furn = playerBag.furniture
  Object.assign(playerBag, { ...next, furniture: furn })
  Object.assign(furn, next.furniture)
  mergeMaterialsIntoBag(playerBag, next.materials)
  for (const k of Object.keys(inv) as MaterialId[]) {
    inv[k] = next.materials[k] || 0
  }
  playerHp.value = next.hp
  if (selectedFurniture.value && (furn[selectedFurniture.value] || 0) <= 0) {
    selectedFurniture.value = null
    syncEngineLoadout()
  }
  if (engine) {
    engine.combatSlow = !canSprint(next.hp)
    engine.inventory = bagMaterials(playerBag)
  }
}

function equipWeapon(weaponInstanceId: string) {
  if (isDead.value) return
  if (weaponInstanceId === 'fist') {
    playerBag.equippedWeapon = 'fist'
    presence?.sendEquipWeapon('fist')
    return
  }
  presence?.sendEquipWeapon(weaponInstanceId)
}

function openChest(chestId: string) {
  if (isDead.value) return
  presence?.sendClaimChest(chestId)
}

function useMedkit(kind: ConsumableId) {
  if (isDead.value) return
  presence?.sendUseMedkit(kind)
  gameAudio?.play(kind === 'medkit_large' ? 'medkit_large' : 'medkit_small', { volume: 1 })
}

function beginDeathSequence(countdown = DEATH_COUNTDOWN_SEC) {
  isDead.value = true
  deathRemain.value = countdown
  if (engine) {
    engine.combatLocked = true
    engine.combatSlow = true
    // 第三人称：镜头抬高后移
    if (!deathCamOffset) {
      deathCamOffset = true
      engine.camera.position.y += 1.2
      engine.camera.position.x += Math.sin(engine.getPose().yaw) * 2.2
      engine.camera.position.z += Math.cos(engine.getPose().yaw) * 2.2
      engine.camera.lookAt(
        engine.getPose().x,
        engine.getPose().y - 0.6,
        engine.getPose().z
      )
    }
  }
}

function handleCombatMsg(msg: Record<string, unknown>) {
  const t = String(msg.type || '')
  if (t === 'combat_auth' || t === 'combat_bag') {
    if (msg.bag) applyBag(msg.bag)
    else if (msg.hp != null) {
      playerHp.value = Number(msg.hp)
      playerBag.hp = playerHp.value
      if (engine) engine.combatSlow = !canSprint(playerHp.value)
    }
    if (msg.ok === false && msg.reason === 'gold') flashHint('金币不足')
    return
  }
  if (t === 'combat_gold') {
    const gold = Number(msg.gold)
    if (Number.isFinite(gold)) playerBag.gold = gold
    const gain = Number(msg.gain)
    if (gain > 0) flashHint(`+${Math.floor(gain)} 金币`)
    return
  }
  if (t === 'combat_hp') {
    const prev = playerHp.value
    playerHp.value = Number(msg.hp)
    playerBag.hp = playerHp.value
    playerBag.lastDamageAt = Number(msg.lastDamageAt) || Date.now()
    if (engine) engine.combatSlow = !canSprint(playerHp.value)
    if (playerHp.value < prev - 1) {
      gameAudio?.play('player_hurt', { volume: 0.9 })
      // 若带怪物种类信息则播对应攻击音
      const monKind = String(msg.fromKind || '')
      if (monKind) {
        gameAudio?.playMonsterAttack(monKind, { volume: 0.7 })
      }
    }
    if (msg.dead) beginDeathSequence(Number(msg.deathRemain) || DEATH_COUNTDOWN_SEC)
    return
  }
  if (t === 'combat_death') {
    announcePlayerDeath(msg)
    if (Number(msg.userId) === Number(auth.user?.id)) {
      beginDeathSequence(Number(msg.countdown) || DEATH_COUNTDOWN_SEC)
    }
    return
  }
  if (t === 'combat_state') {
    if (Array.isArray(msg.monsters)) {
      // 准备舱内不显示野怪（未投下前不应进舱）
      if (engine?.deploying) combatView?.syncMonsters([])
      else combatView?.syncMonsters(msg.monsters as never[])
    }
    if (Array.isArray(msg.crates)) {
      combatView?.syncCrates(msg.crates as never[])
    }
    if (Array.isArray(msg.furniture)) {
      combatView?.syncFurniture(msg.furniture as never[])
    }
    if (Array.isArray(msg.events)) {
      const pose = engine?.getPose()
      for (const ev of msg.events as Record<string, unknown>[]) {
        const et = String(ev.type || '')
        if (et === 'monster_dead' && ev.kind) {
          gameAudio?.playMonsterDeath(String(ev.kind), {
            volume: 1,
            at: { x: Number(ev.x) || 0, z: Number(ev.z) || 0 },
            listener: pose ? { x: pose.x, z: pose.z } : undefined,
          })
        }
      }
    }
    return
  }
  if (t === 'furniture_placed' && msg.placed) {
    combatView?.addFurniture(msg.placed as never)
    const placed = msg.placed as { propId?: string; x?: number; z?: number }
    const pose = engine?.getPose()
    if (placed.propId) {
      gameAudio?.playFurniturePlace(placed.propId, {
        volume: 0.95,
        at: { x: Number(placed.x) || 0, z: Number(placed.z) || 0 },
        listener: pose ? { x: pose.x, z: pose.z } : undefined,
      })
    }
    return
  }
  if (t === 'furniture_cleared') {
    if (Array.isArray(msg.ids)) {
      combatView?.removeFurnitureIds(msg.ids as string[])
    }
    if (Array.isArray(msg.furniture)) {
      combatView?.syncFurniture(msg.furniture as never[])
    }
    return
  }
  if (t === 'combat_loot_chest' && msg.chest) {
    const chest = msg.chest as PlayerBag['chests'][number]
    playerBag.chests.push(chest)
    flashHint(`获得${chestLabel(chest.tier)}`)
    return
  }
  if (t === 'combat_crate_gone' && msg.crateId) {
    combatView?.removeCrate(String(msg.crateId))
    return
  }
  if (t === 'combat_kick') {
    clearSquadFallen(Number(auth.user?.id) || 0)
    const comp = Number(msg.compensation) || 0
    flashHint(
      String(
        msg.message ||
          (comp > 0
            ? `死亡清场补偿 ${comp} 金币`
            : '您已死亡')
      )
    )
    router.replace({ name: 'home' }).catch(() => undefined)
    return
  }
  if (t === 'combat_attack_result' && msg.ok) {
    const weaponId = String(msg.weaponId || playerBag.equippedWeapon || 'fist')
    const events = Array.isArray(msg.events) ? (msg.events as Record<string, unknown>[]) : []
    const pose = engine?.getPose()
    const listener = pose ? { x: pose.x, z: pose.z } : undefined
    for (const ev of events) {
      if (String(ev.type) !== 'hit') continue
      const at = {
        x: Number(ev.x) || pose?.x || 0,
        z: Number(ev.z) || pose?.z || 0,
      }
      gameAudio?.playWeaponHit(weaponId, { volume: 1, at, listener })
      const kind = String(ev.kind || msg.hitKind || '')
      if (kind) gameAudio?.playMonsterHurt(kind, { volume: 0.9, at, listener })
    }
    return
  }
}

function syncBagToPresence() {
  mergeMaterialsIntoBag(playerBag, { ...inv } as never)
  playerBag.hp = playerHp.value
  presence?.sendSyncBag(serializePlayerBag(playerBag))
}

function layoutUserId() {
  return auth.user?.id || null
}

function applyLayout(layout: ControlLayout) {
  const next = normalizeControlLayout(layout)
  for (const id of CONTROL_IDS) {
    controlLayout.items[id] = { ...next.items[id] }
  }
  controlLayout.version = 3
  saveLayoutLocal(controlLayout, layoutUserId())
}

function enterControlEdit() {
  showSettings.value = false
  layoutBackup = JSON.parse(JSON.stringify(controlLayout)) as ControlLayout
  editingControls.value = true
  // 默认收起，避免挡键位；需要调大小/透明度再展开
  editBarCollapsed.value = true
  editSelected.value = 'stick'
  editMsg.value = `拖动控件调整位置（引擎 v${CONTROL_DRAG_VERSION}）`
}

function cancelControlEdit() {
  onHudUp()
  if (layoutBackup) applyLayout(layoutBackup)
  layoutBackup = null
  editingControls.value = false
  editBarCollapsed.value = false
  editMsg.value = ''
}

function resetControls() {
  applyLayout(defaultControlLayout())
  editMsg.value = '已恢复默认（未保存到云端）'
}

function onControlSelect(id: ControlId) {
  editSelected.value = id
}

function onControlDrag(id: ControlId, patch: { x?: number; y?: number }) {
  const cur = controlLayout.items[id]
  controlLayout.items[id] = clampItem({
    ...cur,
    x: patch.x ?? cur.x,
    y: patch.y ?? cur.y,
  })
}

const hudDragId = ref<number | null>(null)
const hudDragging = ref<ControlId | null>(null)
const hudDragSession = ref<DragSession | null>(null)

function hudWidgetStyle(id: 'targetHint' | 'actionRing') {
  const it = controlLayout.items[id]
  const base = id === 'actionRing' ? 88 : 32
  const size = base * it.size
  return {
    left: `${it.x}%`,
    bottom: `${it.y}%`,
    width: id === 'actionRing' ? `${size}px` : 'auto',
    height: id === 'actionRing' ? `${size}px` : 'auto',
    fontSize: id === 'targetHint' ? `${Math.max(0.62, 0.78 * it.size)}rem` : undefined,
    opacity: it.opacity,
    pointerEvents: (editingControls.value ? 'auto' : 'none') as 'auto' | 'none',
    zIndex: editingControls.value ? 45 : 5,
  }
}

const hudWinOpts: AddEventListenerOptions = { capture: true, passive: false }

function unbindHudWindowDrag() {
  window.removeEventListener('pointermove', onHudWindowMove, hudWinOpts)
  window.removeEventListener('pointerup', onHudWindowUp, hudWinOpts)
  window.removeEventListener('pointercancel', onHudWindowUp, hudWinOpts)
}

function bindHudWindowDrag() {
  unbindHudWindowDrag()
  window.addEventListener('pointermove', onHudWindowMove, hudWinOpts)
  window.addEventListener('pointerup', onHudWindowUp, hudWinOpts)
  window.addEventListener('pointercancel', onHudWindowUp, hudWinOpts)
}

function onHudDown(e: PointerEvent, id: 'targetHint' | 'actionRing') {
  if (!editingControls.value) return
  e.preventDefault()
  e.stopPropagation()
  editSelected.value = id
  hudDragging.value = id
  hudDragId.value = e.pointerId
  const el = e.currentTarget as HTMLElement
  const it = controlLayout.items[id]
  const boxW = el.offsetWidth || (id === 'actionRing' ? 88 : 120) * it.size
  const boxH = el.offsetHeight || (id === 'actionRing' ? 88 : 36) * it.size
  hudDragSession.value = beginDragSession(
    e.clientX,
    e.clientY,
    e.pointerId,
    it.x,
    it.y,
    boxW,
    boxH
  )
  bindHudWindowDrag()
  try {
    el.setPointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
}

function applyHudDrag(e: PointerEvent) {
  const id = hudDragging.value
  const session = hudDragSession.value
  if (!editingControls.value || !id || !session || e.pointerId !== session.pointerId) return
  const next = moveDragSession(e.clientX, e.clientY, session)
  controlLayout.items[id] = clampItem({
    ...controlLayout.items[id],
    x: next.x,
    y: next.y,
  })
}

function onHudWindowMove(e: PointerEvent) {
  if (!hudDragging.value || e.pointerId !== hudDragId.value) return
  e.preventDefault()
  applyHudDrag(e)
}

function onHudWindowUp(e: PointerEvent) {
  if (e.pointerId !== hudDragId.value) return
  e.preventDefault()
  onHudUp()
}

function onHudMove(e: PointerEvent, id: 'targetHint' | 'actionRing') {
  if (!editingControls.value || hudDragging.value !== id || e.pointerId !== hudDragId.value) return
  applyHudDrag(e)
}

function onHudUp(_e?: PointerEvent) {
  hudDragging.value = null
  hudDragId.value = null
  hudDragSession.value = null
  unbindHudWindowDrag()
}

function onSizeSlider(e: Event) {
  const id = editSelected.value
  if (!id) return
  const v = Number((e.target as HTMLInputElement).value)
  controlLayout.items[id] = clampItem({ ...controlLayout.items[id], size: v })
}

function onOpacitySlider(e: Event) {
  const id = editSelected.value
  if (!id) return
  const v = Number((e.target as HTMLInputElement).value)
  controlLayout.items[id] = clampItem({ ...controlLayout.items[id], opacity: v })
}

async function saveControls() {
  try {
    onHudUp()
    const normalized = normalizeControlLayout(controlLayout)
    saveLayoutLocal(normalized, layoutUserId())
    const data = await saveControlLayout(normalized)
    if (data.layout) applyLayout(data.layout)
    layoutBackup = null
    editingControls.value = false
    editMsg.value = ''
    shareCodeHint.value = data.shareCode ? `已保存 · 键位码 ${data.shareCode}` : '键位已保存到账号'
  } catch (e) {
    editMsg.value = e instanceof Error ? e.message : '保存失败'
  }
}

async function doShareCode() {
  try {
    const normalized = normalizeControlLayout(controlLayout)
    saveLayoutLocal(normalized, layoutUserId())
    await saveControlLayout(normalized)
    const data = await shareControlLayout()
    editMsg.value = `键位码：${data.shareCode}（可复制分享）`
    shareCodeHint.value = `键位码 ${data.shareCode}`
    try {
      await navigator.clipboard.writeText(data.shareCode)
      editMsg.value += ' · 已复制'
    } catch {
      /* ignore */
    }
  } catch (e) {
    editMsg.value = e instanceof Error ? e.message : '分享失败'
  }
}

async function doImportCode() {
  try {
    const data = await importControlLayout(importCode.value)
    if (data.layout) applyLayout(data.layout)
    shareCodeHint.value = '已导入键位配置'
    importCode.value = ''
    showSettings.value = false
  } catch (e) {
    shareCodeHint.value = e instanceof Error ? e.message : '导入失败'
  }
}

async function loadCloudLayout() {
  try {
    const data = await fetchControlLayout()
    if (data.layout) {
      applyLayout(data.layout)
    } else {
      // 新账号无云端键位：强制官方默认，不继承本机其它账号的乱布局
      applyLayout(defaultControlLayout())
    }
    if (data.shareCode) shareCodeHint.value = `键位码 ${data.shareCode}`
  } catch {
    applyLayout(loadLayoutLocal(layoutUserId()))
  }
}

async function refreshPartyHud() {
  const selfName = auth.user?.displayName || auth.user?.username || '我'
  const selfId = auth.user?.id || 0
  try {
    const data = await fetchPartyMine()
    const members = (data.members || []).slice(0, 4)
    if (members.length) {
      squadMembers.value = members.map((m, i) => ({
        userId: m.userId,
        name: m.displayName || m.username,
        slot: i + 1,
      }))
      return
    }
  } catch {
    // fall through to solo
  }
  squadMembers.value = selfId
    ? [{ userId: selfId, name: selfName, slot: 1 }]
    : []
}

async function goExitServer() {
  if (leaving.value) return
  leaving.value = true
  showSettings.value = false
  try {
    presence?.disconnect()
    presence = null
    await flushWorldStateBeforeLeave()
  } catch {
    // 会话已失效也继续清本地
  }
  clearLastServerId()
  try {
    sessionStorage.removeItem('sv_join')
  } catch {
    // ignore
  }
  try {
    await router.push('/servers?change=1')
  } catch {
    leaving.value = false
  }
}

function syncActionUi() {
  if (!engine) return
  targetName.value = engine.targetName
  const busy = engine.actionKind != null && engine.actionRemainSec > 0
  actionRing.visible = busy
  actionRing.progress = engine.actionProgress
  actionRing.remain = engine.actionRemainSec
  actionRing.label = engine.targetActionLabel
  if (engine.lastActionHint) flashHint()
}

function onPlayKeyDown(e: KeyboardEvent) {
  if (e.repeat || editingControls.value || showSettings.value) return
  const tag = (e.target as HTMLElement | null)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  // E：取消材料（退出建造）
  if (e.code === 'KeyE') {
    e.preventDefault()
    if (selectedMat.value) {
      selectedMat.value = null
      syncEngineLoadout()
      if (engine) {
        engine.lastActionHint = '已取消材料 · 操作模式'
        flashHint()
      }
    }
  }
  if (e.code === 'KeyF') {
    e.preventDefault()
    onAttack()
  }
}

async function refreshNearby() {
  if (!serverId) return
  try {
    const list = await nearbyPlayers(serverId)
    npc?.setNearbyHumanCount(list.length)
    // WS 未连上时用轮询兜底画人
    if (remotes && (!presence || list.length)) {
      // 仅补充：不覆盖 WS 更实时的数据太狠，只在 remotes 为空时灌入
      if (remotes.count() === 0 && list.length) {
        remotes.syncList(
          list.map((p) => ({
            userId: p.userId,
            username: p.username,
            displayName: p.displayName,
            x: p.x,
            y: p.y,
            z: p.z,
            yaw: 0,
            pitch: 0,
            action: null,
          }))
        )
      }
    }
    peerHint.value = remotes && remotes.count() > 0 ? `附近玩家 ${remotes.count()}` : ''
  } catch {
    // ignore
  }
}

watch(
  squadHud,
  (list) => {
    remotes?.setSquadSlots(list)
  },
  { deep: true }
)

onMounted(async () => {
  detectInput()
  // 清掉跨账号共用的旧键位缓存
  try {
    localStorage.removeItem('sv_control_layout')
  } catch {
    /* ignore */
  }
  // 尽早抢全屏（异步过久会丢掉点击手势授权）
  void enterFullscreen()
  armFullscreenGesture()
  offLayout = onLandscapeLayout(() => engine?.resize())
  if (!auth.user) await auth.loadMe()
  // 按当前账号载入本地键位（避免沿用上一账号）
  applyLayout(loadLayoutLocal(layoutUserId()))

  if (!viewport.value) return
  try {
    // 先塞自己进小队条，避免接口返回前左上空白
    refreshPartyHud()
    // 必须重新 join 建立 server_sessions，否则方块/仓库保存会 409 被静默吞掉
    const data = await joinServer(routeServerId.value)
    try {
      sessionStorage.setItem('sv_join', JSON.stringify(data))
    } catch {
      /* ignore */
    }
    serverId = data.server.id
    serverName.value = data.server.name
    setLastServerId(serverId)
    applyInventoryFromServer(data.inventory)

    engine = new GameEngine(viewport.value, data.server.seed ?? 42, {
      antialias: playSettings.antialias,
      quality: playSettings.quality,
    })
    mapTerrainRev.value += 1
    gameAudio = new GameAudio()
    gameAudio.setMuted(playSettings.muted)
    gameAudio.ensure()
    engine.audio = gameAudio
    engine.inventory = inv
    engine.onInventoryChange = () => {
      scheduleInventoryFlush()
    }
    engine.onHarvestLoot = (source) => {
      presence?.sendHarvestLoot(source)
    }
    engine.onBlocksChange = (blocks) => {
      publishLocalBlocks(blocks)
      mapTerrainRev.value += 1
    }
    combatView = new CombatWorldView(engine.scene)
    syncEngineLoadout()

    const sp = data.player
    const dropX = sp.x
    const dropZ = sp.z
    const dropY = sp.y || engine.getGroundY(dropX, dropZ) + 0.02 + 1.62
    const cabinX = Number.isFinite(sp.cabinX) ? Number(sp.cabinX) : dropX
    const cabinZ = Number.isFinite(sp.cabinZ) ? Number(sp.cabinZ) : dropZ
    const partySlot = Math.max(0, Math.floor(Number(sp.partySlot) || 0))
    mapMe.x = cabinX
    mapMe.z = cabinZ
    mapMe.yaw = sp.yaw || 0

    deploying.value = true
    deployRemain.value = DEPLOY_DURATION_SEC
    deployTimePct.value = 0
    deployLoadHint.value = '加载地图与作战资源…'
    combatView?.syncMonsters([])
    engine.beginDeploy(
      { x: dropX, y: dropY, z: dropZ, yaw: sp.yaw, pitch: sp.pitch },
      {
        durationSec: DEPLOY_DURATION_SEC,
        cabinX,
        cabinZ,
        partySlot,
        onProgress: (remain, timeProgress) => {
          deployRemain.value = remain
          deployTimePct.value = Math.round(Math.min(1, Math.max(0, timeProgress)) * 100)
          if (engine) {
            const warm = Math.round(engine.getDeployWarmProgress() * 100)
            const label = engine.getDeployWarmLabel()
            deployLoadHint.value =
              warm >= 100
                ? '地图铺设中 · 作战资源就绪'
                : `预热 ${label}（${warm}%）· 铺设落点地图`
          }
        },
        onComplete: () => {
          deploying.value = false
          deployRemain.value = 0
          deployTimePct.value = 100
          deployLoadHint.value = '已抵达'
          if (engine) {
            mapMe.x = engine.camera.position.x
            mapMe.z = engine.camera.position.z
            fetchBlocksAround(engine.camera.position.x, engine.camera.position.z, true).catch(
              () => undefined
            )
            if (presence) {
              const pose = engine.getPose()
              presence.sendPresence({
                x: engine.camera.position.x,
                y: engine.camera.position.y,
                z: engine.camera.position.z,
                yaw: pose.yaw,
                pitch: pose.pitch,
                action: pose.action,
                crouching: pose.crouching,
                deploying: false,
              })
            }
          }
          hint.value = '已抵达'
          window.setTimeout(() => {
            if (hint.value === '已抵达') hint.value = ''
          }, 1600)
        },
      }
    )
    // 立刻上报舱内状态，避免服务器按舱高刷怪
    if (presence) {
      const pose = engine.getPose()
      presence.sendPresence({
        x: engine.camera.position.x,
        y: engine.camera.position.y,
        z: engine.camera.position.z,
        yaw: pose.yaw,
        pitch: pose.pitch,
        action: pose.action,
        crouching: pose.crouching,
        deploying: true,
      })
    }
    // 后台拉舱心 + 落点方块覆盖（与网格/预热并行）
    fetchBlocksAround(cabinX, cabinZ, true).catch(() => undefined)
    if (Math.hypot(dropX - cabinX, dropZ - cabinZ) > 8) {
      fetchBlocksAround(dropX, dropZ, true).catch(() => undefined)
    }

    engine.onPosition = (pos) => {
      // 准备舱也心跳：后进队友才能对准同一舱心
      serverHeartbeat({
        serverId,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        yaw: pos.yaw,
        pitch: pos.pitch,
      }).catch(() => undefined)
      if (engine?.deploying) return
      hint.value = `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`
      fetchBlocksAround(pos.x, pos.z).catch(() => undefined)
    }
    engine.onFrame = (dt) => {
      const eng = engine
      if (!eng) return
      if (!eng.deploying) {
        npc?.update(dt)
      }
      remotes?.update(dt)
      combatView?.tick(dt)
      if (isDead.value) {
        deathRemain.value = Math.max(0, deathRemain.value - dt)
      }
      if (eng.tool !== tool.value) tool.value = eng.tool
      if (crouched.value !== eng.crouching) crouched.value = eng.crouching

      // 小地图 / 格子号 ~10Hz，避免每帧写 reactive 触发 Vue 更新
      mapMeAcc += dt
      if (mapMeAcc > 0.1) {
        mapMeAcc = 0
        if (eng.deploying) {
          mapMe.x = cabinX
          mapMe.z = cabinZ
          mapMe.yaw = eng.getPose().yaw
        } else {
          mapMe.x = eng.camera.position.x
          mapMe.z = eng.camera.position.z
          mapMe.yaw = eng.getPose().yaw
        }
      }
      mapPeerAcc += dt
      if (mapPeerAcc > 0.25) {
        mapPeerAcc = 0
        mapPeers.value = remotes?.listMapPeers() || []
      }
      if (!eng.deploying) {
        natureAudio?.setCreekDistance(
          eng.getCreekDistance(eng.camera.position.x, eng.camera.position.z)
        )
      }

      presenceAcc += dt
      if (presenceAcc > 0.12 && presence) {
        presenceAcc = 0
        const pose = eng.getPose()
        presence.sendPresence({
          x: eng.camera.position.x,
          y: eng.camera.position.y,
          z: eng.camera.position.z,
          yaw: pose.yaw,
          pitch: pose.pitch,
          action: pose.action,
          crouching: pose.crouching,
          deploying: eng.deploying,
        })
      }
    }
    engine.onActionUi = () => syncActionUi()

    npc = new NpcManager(
      engine.scene,
      engine.camera,
      data.npcPolicy as import('@/api/server').NpcPolicy,
      {
        standY: (x, z) => engine!.getNpcStandY(x, z),
        walkable: (x, z) => engine!.isNpcWalkable(x, z),
        nearBuild: (x, z, r) => engine!.isPlayerStructureNear(x, z, r ?? 5),
      }
    )
    npc.audio = gameAudio

    remotes = new RemotePlayerManager(engine.scene)
    remotes.audio = gameAudio
    remotes.listener = () => ({
      x: engine!.camera.position.x,
      z: engine!.camera.position.z,
    })
    remotes.setSquadSlots(squadHud.value)
    if (auth.token) {
      presence = new PresenceClient()
      presence.connect(auth.token, serverId, {
        onPeers: (peers) => remotes?.syncList(peers),
        onPresence: (peer) => remotes?.upsert(peer),
        onLeft: (uid) => {
          remotes?.remove(uid)
          removeSquadMark(uid)
          clearSquadFallen(uid)
        },
        onBlocks: (blocks) => {
          engine?.applyRemoteBlocks(blocks)
          if (blocks?.length) mapTerrainRev.value += 1
        },
        onSquadMark: (msg) => {
          const uid = Number(msg.userId)
          if (!uid || uid === auth.user?.id) return
          if (msg.clear) {
            removeSquadMark(uid)
            return
          }
          const slot =
            msg.slot ||
            squadHud.value.find((s) => s.userId === uid)?.slot ||
            1
          upsertSquadMark({
            userId: uid,
            slot,
            x: Number(msg.x) || 0,
            y: Number(msg.y) || 0,
            z: Number(msg.z) || 0,
            label: msg.label || '',
            expiresAt: Date.now() + SQUAD_MARK_TTL_MS,
          })
        },
        onSquadChat: (msg) => ingestRemoteChat(msg),
        onCombat: (msg) => handleCombatMsg(msg),
      })
    }

    engine.start()
    loading.value = false
    window.addEventListener('keydown', onPlayKeyDown)
    natureAudio = new NatureAudio()
    natureAudio.setMuted(playSettings.muted)
    natureAudio.start()
    gameAudio?.ensure()
    await loadCloudLayout()
    await enterFullscreen()
    if (!document.fullscreenElement) armFullscreenGesture()
    nearbyTimer = window.setInterval(() => {
      if (document.hidden) return
      refreshNearby()
    }, 5000)
    refreshNearby()
    const tickDayNight = () => {
      Object.assign(dayNightHud, sampleDayNightHud())
    }
    tickDayNight()
    dayNightTimer = window.setInterval(tickDayNight, 1000)
    refreshPartyHud()
    partyTimer = window.setInterval(() => {
      if (document.hidden) return
      refreshPartyHud()
    }, 10000)
    blockSyncTimer = window.setInterval(() => {
      if (document.hidden || !engine) return
      fetchBlocksAround(engine.camera.position.x, engine.camera.position.z, true).catch(
        () => undefined
      )
    }, 16000)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '进入失败'
    loading.value = false
  }
})

onBeforeUnmount(() => {
  onHudUp()
  offLayout?.()
  window.removeEventListener('keydown', onPlayKeyDown)
  if (nearbyTimer) window.clearInterval(nearbyTimer)
  if (dayNightTimer) window.clearInterval(dayNightTimer)
  if (blockSyncTimer) window.clearInterval(blockSyncTimer)
  if (partyTimer) window.clearInterval(partyTimer)
  if (hintTimer) window.clearTimeout(hintTimer)
  if (blockFlushTimer) window.clearTimeout(blockFlushTimer)
  if (invFlushTimer) window.clearTimeout(invFlushTimer)
  if (markExpireTimer) window.clearTimeout(markExpireTimer)
  if (markHoldTimer) window.clearTimeout(markHoldTimer)
  for (const tid of broadcastTimers.values()) window.clearTimeout(tid)
  broadcastTimers.clear()
  natureAudio?.stop()
  natureAudio = null
  gameAudio?.dispose()
  gameAudio = null
  presence?.disconnect()
  presence = null
  combatView?.dispose()
  combatView = null
  // 同步冲刷（不 await unmount，但尽量 fire-and-await via void）
  void flushWorldStateBeforeLeave()
  sessionStorage.removeItem('sv_join')
  remotes?.dispose()
  remotes = null
  npc?.dispose()
  npc = null
  engine?.dispose()
  engine = null
})
</script>

<style scoped>
.play {
  position: relative;
  width: 100%;
  height: 100%;
  background: #87ceeb;
  overflow: hidden;
  touch-action: none;
  overscroll-behavior: none;
  /* 局内文案不可选中复制，减少误触 */
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.play :deep(input),
.play :deep(textarea) {
  -webkit-user-select: text;
  user-select: text;
}

/* 编辑键位时关掉会抢触摸的 HUD 交互层 */
.play.editing-controls .hotbar,
.play.editing-controls .corner-right,
.play.editing-controls .warehouse,
.play.editing-controls .desk-ware,
.play.editing-controls .desk-shop {
  pointer-events: none !important;
}

.viewport {
  width: 100%;
  height: 100%;
}

.viewport :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
}

.hud {
  pointer-events: none;
  position: absolute;
  inset: 0;
  z-index: 4;
  display: block;
  padding:
    max(0.4rem, env(safe-area-inset-top))
    max(0.4rem, env(safe-area-inset-right))
    max(0.35rem, env(safe-area-inset-bottom))
    max(0.4rem, env(safe-area-inset-left));
}

/* 左上：小队 + 广播 */
.corner-left {
  pointer-events: none;
  position: absolute;
  left: max(0.4rem, env(safe-area-inset-left));
  top: max(0.4rem, env(safe-area-inset-top));
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.28rem;
  max-width: min(240px, 46vw);
  z-index: 9;
}

.squad-strip {
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
  width: 100%;
}

.broadcast-feed {
  /* 固定约 5 行高度，越新越靠下；透明背景 */
  box-sizing: border-box;
  width: 100%;
  height: 6.9rem;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 0.18rem;
  overflow: hidden;
  background: transparent;
  pointer-events: none;
}

.bcast {
  flex-shrink: 0;
  background: transparent;
  color: rgba(245, 248, 247, 0.92);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.75), 0 0 6px rgba(0, 0, 0, 0.35);
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1.3;
  word-break: break-word;
  max-height: 1.3em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  animation: bcast-in 0.2s ease-out;
}

.b-who {
  font-weight: 800;
  color: rgba(240, 201, 58, 0.95);
}

.b-sep {
  color: rgba(236, 242, 244, 0.55);
}

.b-txt {
  color: rgba(245, 248, 247, 0.92);
}

@keyframes bcast-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.squad-row {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.12rem 0.4rem 0.12rem 0.18rem;
  border-radius: 4px;
  background: rgba(8, 14, 18, 0.38);
  color: rgba(245, 248, 247, 0.92);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65);
  min-width: 0;
}

.squad-row .slot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.9);
  color: #111;
  font-size: 0.58rem;
  font-style: normal;
  font-weight: 800;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.squad-row .sname {
  flex: 1;
  min-width: 0;
  font-size: 0.68rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.squad-row .offline {
  flex-shrink: 0;
  font-size: 0.56rem;
  font-weight: 600;
  color: rgba(160, 168, 172, 0.85);
  letter-spacing: 0.02em;
}

.squad-row .fallen {
  flex-shrink: 0;
  font-size: 0.56rem;
  font-weight: 700;
  color: rgba(255, 120, 120, 0.95);
  letter-spacing: 0.02em;
}

.squad-row.is-fallen .sname {
  color: rgba(200, 180, 180, 0.7);
}

/* 右上：地图在上，设置在下 */
.corner-right {
  pointer-events: auto;
  position: absolute;
  right: max(0.4rem, env(safe-area-inset-right));
  top: max(0.4rem, env(safe-area-inset-top));
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.3rem;
  z-index: 10;
}

.icon-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(12, 18, 22, 0.5);
  color: #f2f6f5;
  cursor: pointer;
  padding: 0;
  display: grid;
  place-items: center;
  line-height: 0;
  flex-shrink: 0;
}

.icon-btn .gear {
  width: 16px;
  height: 16px;
  display: block;
}

.icon-btn.mark-btn.active {
  border-color: rgba(240, 201, 58, 0.65);
  background: rgba(240, 201, 58, 0.22);
  color: #ffe9a0;
}

.icon-btn:active {
  transform: scale(0.96);
}

.settings-overlay {
  pointer-events: auto;
  position: absolute;
  inset: 0;
  z-index: 3200;
  display: grid;
  place-items: center;
  padding: max(0.6rem, env(safe-area-inset-top)) max(0.8rem, env(safe-area-inset-right))
    max(0.6rem, env(safe-area-inset-bottom)) max(0.8rem, env(safe-area-inset-left));
  background: rgba(0, 0, 0, 0.5);
  box-sizing: border-box;
}

.settings-panel {
  pointer-events: auto;
  width: min(560px, 92%);
  max-width: 92%;
  max-height: min(86%, 520px);
  height: auto;
  display: flex;
  flex-direction: column;
  background: rgba(18, 26, 32, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  color: #e8eef0;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
  box-sizing: border-box;
  overflow: hidden;
}

.settings-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-shrink: 0;
  padding: 0.7rem 0.85rem 0.55rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.settings-panel h3 {
  margin: 0;
  font-size: 1rem;
}

.settings-head .head-close {
  margin: 0;
  width: auto;
  padding: 0.35rem 0.7rem;
}

.settings-body {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding: 0.75rem 1rem 1rem;
  touch-action: pan-y;
}

.settings-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));
  gap: 0.5rem;
  margin-bottom: 0.45rem;
}

.settings-actions .settings-link {
  width: 100%;
  margin: 0;
  text-align: center;
}

.settings-block {
  margin: 0.55rem 0 0.35rem;
}

.settings-label {
  display: block;
  font-size: 0.72rem;
  color: rgba(232, 238, 240, 0.65);
  margin-bottom: 0.3rem;
}

.settings-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.chip-set {
  flex: 1;
  min-width: 4.5rem;
  padding: 0.45rem 0.35rem;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(232, 238, 240, 0.85);
  font-size: 0.78rem;
  cursor: pointer;
}

.chip-set.active {
  border-color: rgba(126, 231, 220, 0.55);
  background: rgba(126, 231, 220, 0.16);
  color: #9fd9cf;
  font-weight: 700;
}

.settings-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.5rem 0;
  padding: 0.35rem 0;
  font-size: 0.85rem;
  color: rgba(232, 238, 240, 0.9);
  cursor: pointer;
  user-select: none;
}

.settings-toggle input {
  width: 1.1rem;
  height: 1.1rem;
  accent-color: #7ee7dc;
  flex-shrink: 0;
}

.settings-link {
  display: block;
  width: 100%;
  text-align: left;
  margin: 0.4rem 0;
  padding: 0.55rem 0.65rem;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: #9fd9cf;
  cursor: pointer;
  font: inherit;
  font-size: 0.88rem;
  text-decoration: none;
  box-sizing: border-box;
}

.settings-link.danger {
  border-color: rgba(255, 140, 140, 0.45);
  background: rgba(120, 40, 40, 0.35);
  color: #ffc9c9;
}

.settings-import {
  display: flex;
  gap: 0.35rem;
  margin: 0.35rem 0;
  align-items: center;
}

.code-input {
  flex: 1;
  min-width: 0;
  padding: 0.35rem 0.45rem;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(0, 0, 0, 0.25);
  color: #e8eef0;
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.settings-link.slim {
  width: auto;
  margin: 0;
  padding: 0.35rem 0.55rem;
  white-space: nowrap;
}

.ctrl-edit-bar {
  pointer-events: auto;
  position: absolute;
  left: 50%;
  top: max(0.4rem, env(safe-area-inset-top));
  bottom: auto;
  transform: translateX(-50%);
  z-index: 30;
  width: min(420px, 72%);
  background: rgba(12, 20, 26, 0.88);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  padding: 0.55rem 0.7rem 0.65rem;
  color: #e8eef0;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
}

.ctrl-edit-bar.collapsed {
  width: auto;
  max-width: min(92vw, 360px);
  padding: 0.3rem 0.4rem;
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.ctrl-collapse {
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
  width: 30px;
  height: 30px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  color: #e8f4f2;
  display: grid;
  place-items: center;
  padding: 0;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.ctrl-collapse svg {
  width: 18px;
  height: 18px;
}

.ctrl-edit-bar.collapsed .ctrl-collapse {
  position: static;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
}

.ctrl-edit-mini {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}

.ctrl-edit-mini > span {
  font-size: 0.7rem;
  color: rgba(232, 238, 240, 0.85);
  max-width: 7rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ctrl-edit-mini .mini-save,
.ctrl-edit-mini .mini-cancel {
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #e8eef0;
  border-radius: 6px;
  padding: 0.28rem 0.5rem;
  font-size: 0.68rem;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.ctrl-edit-mini .mini-save {
  background: rgba(61, 214, 198, 0.45);
  border-color: #7ee7dc;
}

.ctrl-edit-head {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.78rem;
  margin-bottom: 0.4rem;
  padding-right: 2rem;
}

.ctrl-edit-head span {
  color: rgba(232, 238, 240, 0.55);
  font-size: 0.68rem;
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.7rem;
  margin: 0.25rem 0;
}

.slider-row span {
  width: 3.2rem;
  flex-shrink: 0;
  color: rgba(232, 238, 240, 0.7);
}

.slider-row input {
  flex: 1;
}

.ctrl-edit-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.45rem;
}

.ctrl-edit-actions button {
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #e8eef0;
  border-radius: 6px;
  padding: 0.35rem 0.55rem;
  font-size: 0.7rem;
  cursor: pointer;
}

.ctrl-edit-actions button.primary {
  background: rgba(61, 214, 198, 0.45);
  border-color: #7ee7dc;
}

.ctrl-edit-msg {
  margin: 0.4rem 0 0;
  font-size: 0.68rem;
  color: #f0c878;
}

.settings-note {
  font-size: 0.68rem;
  color: rgba(232, 238, 240, 0.5);
  margin: 0.4rem 0;
}

.ghost-close {
  margin-top: 0.25rem;
  border: none;
  background: transparent;
  color: rgba(232, 238, 240, 0.55);
  cursor: pointer;
  font-size: 0.72rem;
}

.desk-ware {
  pointer-events: auto;
  position: absolute;
  right: max(0.75rem, env(safe-area-inset-right));
  bottom: max(6.5rem, calc(env(safe-area-inset-bottom) + 5.5rem));
  width: 56px;
  height: 56px;
  border-radius: 12px;
  border: 2px solid rgba(180, 160, 255, 0.9);
  background: rgba(50, 40, 90, 0.75);
  color: #e8f4f2;
  display: grid;
  place-items: center;
  cursor: pointer;
  z-index: 5;
  padding: 0;
}

.desk-shop {
  pointer-events: auto;
  position: absolute;
  right: max(0.75rem, env(safe-area-inset-right));
  bottom: max(14.5rem, calc(env(safe-area-inset-bottom) + 13.5rem));
  width: 56px;
  height: 56px;
  border-radius: 12px;
  border: 2px solid rgba(220, 180, 80, 0.95);
  background: rgba(70, 55, 20, 0.78);
  color: #ffe9a8;
  display: grid;
  place-items: center;
  cursor: pointer;
  z-index: 5;
  padding: 0;
  font-weight: 800;
  font-size: 1.05rem;
}

.desk-attack {
  pointer-events: auto;
  position: absolute;
  right: max(0.75rem, env(safe-area-inset-right));
  bottom: max(10.5rem, calc(env(safe-area-inset-bottom) + 9.5rem));
  width: 56px;
  height: 56px;
  border-radius: 12px;
  border: 2px solid rgba(255, 140, 100, 0.9);
  background: rgba(90, 35, 30, 0.78);
  color: #ffe8e0;
  display: grid;
  place-items: center;
  cursor: pointer;
  z-index: 5;
  padding: 0;
}

.warehouse {
  pointer-events: auto;
  position: absolute;
  left: max(0.4rem, env(safe-area-inset-left));
  top: max(0.4rem, env(safe-area-inset-top));
  z-index: 7;
  background: rgba(12, 20, 26, 0.55);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  padding: 0.65rem 0.75rem;
  max-width: min(420px, 92vw);
  color: #e8eef0;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
}

.warehouse h3 {
  margin: 0 0 0.45rem;
  font-size: 0.85rem;
  color: rgba(245, 248, 247, 0.92);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.ware-shop-link {
  font-size: 0.68rem;
  padding: 0.15rem 0.45rem;
}

.ware-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.35rem;
}

.ware-item {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 0.28rem;
  padding: 0.4rem 0.45rem;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.08);
  color: #e8f4f2;
  cursor: pointer;
  font-size: 0.75rem;
  -webkit-tap-highlight-color: transparent;
}

.ware-item .msell {
  font-size: 0.62rem;
  color: rgba(255, 220, 140, 0.85);
  padding: 0.1rem 0.25rem;
  border-radius: 3px;
  border: 1px solid rgba(230, 190, 80, 0.35);
}

.ware-item .mlabel {
  text-align: left;
  color: rgba(232, 244, 242, 0.92);
  font-size: 0.72rem;
}

.ware-item .mat-icon,
.hotbar .mat-icon {
  color: #e8f4f2;
}

.ware-item.active {
  border-color: rgba(126, 231, 220, 0.85);
  background: rgba(61, 214, 198, 0.22);
  box-shadow: 0 0 0 1px rgba(61, 214, 198, 0.25);
}

.mqty {
  font-weight: 700;
  color: #f0c878;
}

.ware-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.5rem;
  font-size: 0.72rem;
  color: rgba(232, 238, 240, 0.75);
}

.chip {
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: #e8eef0;
  border-radius: 999px;
  padding: 0.25rem 0.55rem;
  font-size: 0.7rem;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.chip.active {
  background: rgba(61, 214, 198, 0.55);
  color: #fff;
  border-color: #7ee7dc;
}

.ware-tip {
  margin: 0.45rem 0 0;
  font-size: 0.68rem;
  color: rgba(232, 238, 240, 0.55);
}

.bottom {
  pointer-events: none;
  position: absolute;
  left: 0;
  right: 0;
  bottom: max(0.25rem, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.28rem;
  padding: 0 0.5rem 0.1rem;
}

.tips {
  font-size: 0.68rem;
  color: rgba(245, 248, 247, 0.72);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
  text-align: center;
  max-width: 90vw;
  opacity: 0.85;
}

.hotbar {
  pointer-events: auto;
  display: flex;
  gap: 0.35rem;
  justify-content: center;
  flex-wrap: wrap;
  max-width: 98vw;
}

.hotbar .slot {
  position: relative;
  min-width: 3.4rem;
  width: auto;
  height: auto;
  border: 1.5px solid rgba(255, 255, 255, 0.22);
  background: rgba(12, 20, 26, 0.42);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.18rem;
  padding: 0.4rem 0.45rem 0.3rem;
  font-size: 0.68rem;
  color: #e8f4f2;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
  cursor: pointer;
  box-sizing: border-box;
}

.hotbar .slot .id {
  line-height: 1.15;
  letter-spacing: 0.04em;
  color: rgba(232, 244, 242, 0.95);
  white-space: nowrap;
  text-align: center;
  font-size: 0.68rem;
}

.hotbar .slot .mat-icon {
  flex-shrink: 0;
}

.hotbar .slot.tool {
  background: rgba(31, 138, 122, 0.28);
}

.hotbar .slot.active {
  border-color: rgba(126, 231, 220, 0.85);
  background: rgba(61, 214, 198, 0.22);
  box-shadow: 0 0 0 1px rgba(61, 214, 198, 0.25);
}

.hotbar .qty {
  position: absolute;
  top: 2px;
  right: 4px;
  margin: 0;
  color: #f0c878;
  font-weight: 700;
  font-size: 0.62rem;
  line-height: 1;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.75);
  pointer-events: none;
}

.aim {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 3;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  transform: translate(-50%, -50%);
}

.crosshair {
  width: 14px;
  height: 14px;
  border: 1.5px solid rgba(255, 255, 255, 0.92);
  border-radius: 50%;
  box-shadow:
    0 0 0 1.5px rgba(0, 0, 0, 0.65),
    inset 0 0 0 1px rgba(0, 0, 0, 0.35);
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    width 0.18s ease,
    height 0.18s ease;
}
.aim.build .crosshair {
  width: 18px;
  height: 18px;
  border-color: rgba(142, 240, 180, 0.95);
  box-shadow:
    0 0 0 1.5px rgba(0, 0, 0, 0.55),
    0 0 10px rgba(90, 210, 140, 0.55),
    inset 0 0 0 1px rgba(0, 40, 20, 0.35);
}

.aim-toast {
  margin-top: 40px;
  padding: 0.28rem 0.7rem;
  border-radius: 6px;
  background: rgba(12, 22, 28, 0.72);
  border: 1px solid rgba(240, 200, 120, 0.45);
  color: #f0c878;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65);
  white-space: nowrap;
}

.hud-widget {
  position: absolute;
  z-index: 5;
  pointer-events: none;
  -webkit-tap-highlight-color: transparent;
  box-sizing: border-box;
}

.hud-widget.selected {
  outline: 2px solid #f0c878;
  outline-offset: 3px;
  box-shadow: 0 0 0 4px rgba(240, 200, 120, 0.25);
}

.hud-widget .edit-tag {
  position: absolute;
  bottom: -1.1rem;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.58rem;
  color: rgba(240, 200, 120, 0.95);
  white-space: nowrap;
  text-shadow: 0 1px 2px #000;
}

.target-hint {
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  background: rgba(12, 22, 28, 0.55);
  color: #f2f7f5;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65);
  white-space: nowrap;
  display: grid;
  place-items: center;
}

.action-ring {
  display: grid;
  place-items: center;
}

.ring-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ring-bg {
  fill: none;
  stroke: rgba(0, 0, 0, 0.35);
  stroke-width: 6;
}

.ring-fg {
  fill: none;
  stroke: #f0c878;
  stroke-width: 6;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.05s linear;
}

.ring-time {
  position: relative;
  z-index: 1;
  font-size: 0.95rem;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 3px #000;
}

.ring-label {
  position: absolute;
  top: calc(100% + 2px);
  font-size: 0.62rem;
  color: rgba(255, 255, 255, 0.9);
  text-shadow: 0 1px 2px #000;
  white-space: nowrap;
}

.overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-content: center;
  justify-items: center;
  background: rgba(7, 16, 21, 0.92);
}

.overlay.error {
  color: var(--danger);
  font-family: var(--font-display);
  letter-spacing: 0.08em;
  text-align: center;
  padding: 1.5rem;
}

.deploy-banner {
  position: absolute;
  left: 50%;
  top: 12%;
  transform: translateX(-50%);
  z-index: 18;
  min-width: min(78vw, 320px);
  padding: 0.85rem 1.15rem 1rem;
  text-align: center;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(8, 22, 34, 0.82), rgba(8, 22, 34, 0.55));
  border: 1px solid rgba(140, 210, 255, 0.35);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
}

.death-banner {
  position: absolute;
  left: 50%;
  top: 18%;
  transform: translateX(-50%);
  z-index: 19;
  min-width: min(78vw, 340px);
  padding: 0.85rem 1.15rem 1rem;
  text-align: center;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(40, 8, 12, 0.9), rgba(24, 6, 10, 0.7));
  border: 1px solid rgba(255, 100, 100, 0.45);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
}

.blood-overlay {
  position: absolute;
  inset: 0;
  z-index: 12;
  pointer-events: none;
  background:
    radial-gradient(ellipse at center, transparent 35%, rgba(120, 0, 0, 0.55) 100%),
    repeating-linear-gradient(
      -18deg,
      transparent 0 18px,
      rgba(90, 0, 0, 0.08) 18px 20px
    );
  mix-blend-mode: multiply;
  transition: opacity 0.35s ease;
}

.hp-bar-wrap {
  position: relative;
  left: auto;
  top: auto;
  transform: none;
  z-index: 16;
  width: min(52vw, 280px);
  pointer-events: none;
}

.top-stats {
  position: absolute;
  left: 50%;
  top: max(0.45rem, env(safe-area-inset-top));
  transform: translateX(-50%);
  z-index: 16;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.28rem;
  pointer-events: none;
}

.gold-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.18rem 0.55rem;
  border-radius: 999px;
  background: rgba(30, 24, 8, 0.72);
  border: 1px solid rgba(230, 190, 80, 0.55);
  color: #ffe7a0;
  font-size: 0.78rem;
  font-weight: 700;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65);
}

.daynight-chip {
  margin-top: 0.05rem;
  padding: 0.16rem 0.55rem;
  border-radius: 999px;
  background: rgba(18, 28, 40, 0.72);
  border: 1px solid rgba(160, 190, 220, 0.4);
  color: rgba(220, 235, 250, 0.92);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
  white-space: nowrap;
}

.daynight-chip.dusk {
  border-color: rgba(255, 170, 90, 0.55);
  color: #ffe0b8;
  background: rgba(50, 28, 12, 0.75);
}

.daynight-chip.night {
  border-color: rgba(120, 150, 220, 0.55);
  color: #c8d8ff;
  background: rgba(12, 18, 40, 0.78);
}

.gold-ico {
  width: 1.05rem;
  height: 1.05rem;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 0.58rem;
  background: linear-gradient(145deg, #f0d060, #c89020);
  color: #3a2808;
}

.hp-bar-track {
  height: 0.55rem;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.18);
  overflow: hidden;
}

.hp-bar-fill {
  height: 100%;
  border-radius: inherit;
  transition: width 0.2s ease, background 0.3s ease;
}

.hp-bar-fill.healthy {
  background: linear-gradient(90deg, #3ecf6a, #7dff9a);
}
.hp-bar-fill.light {
  background: linear-gradient(90deg, #e0b020, #ffe066);
}
.hp-bar-fill.critical,
.hp-bar-fill.dead {
  background: linear-gradient(90deg, #c02020, #ff6060);
}

.hp-bar-text {
  display: block;
  margin-top: 0.2rem;
  text-align: center;
  font-size: 0.68rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.85);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
}

.ware-col {
  flex-wrap: wrap;
}

.chip.sell {
  border-color: rgba(230, 190, 80, 0.45);
  color: #ffe7a0;
  background: rgba(70, 55, 18, 0.55);
}

.chip.buy {
  border-color: rgba(120, 210, 160, 0.5);
  color: #c8ffe0;
  background: rgba(20, 60, 40, 0.55);
}

.furn-row {
  display: inline-flex;
  gap: 0.25rem;
  align-items: center;
}

.wpn-row {
  display: inline-flex;
  gap: 0.25rem;
  align-items: center;
}

.wpn-tag {
  display: inline-block;
  margin-left: 0.28rem;
  font-size: 0.58rem;
  font-style: normal;
  font-weight: 700;
  letter-spacing: 0.02em;
  padding: 0.05rem 0.22rem;
  border-radius: 3px;
}

.wpn-tag.drop {
  color: #ffd0c8;
  background: rgba(140, 40, 30, 0.65);
  border: 1px solid rgba(255, 140, 120, 0.45);
}

.wpn-tag.safe {
  color: #d4f0ff;
  background: rgba(30, 70, 100, 0.6);
  border: 1px solid rgba(120, 180, 220, 0.4);
}

.ware-tip-inline {
  flex-basis: 100%;
  margin: 0.1rem 0 0.15rem;
}

.shop-panel {
  max-height: min(70vh, 520px);
  overflow: auto;
}

.shop-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin: 0.35rem 0 0.5rem;
}

.shop-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.35rem 0.4rem;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.shop-meta {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.shop-meta strong {
  font-size: 0.78rem;
  font-weight: 650;
}

.shop-hint {
  font-size: 0.65rem;
  color: rgba(220, 230, 228, 0.55);
}

.deploy-title {
  font-family: var(--font-display, 'Segoe UI', sans-serif);
  font-size: 0.72rem;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: rgba(186, 230, 255, 0.9);
}

.deploy-count {
  margin-top: 0.15rem;
  font-family: var(--font-display, 'Segoe UI', sans-serif);
  font-size: 2.6rem;
  font-weight: 700;
  line-height: 1;
  color: #f4fbff;
  text-shadow: 0 2px 12px rgba(80, 180, 255, 0.45);
}

.deploy-sub {
  margin-top: 0.45rem;
  font-size: 0.78rem;
  color: rgba(220, 235, 245, 0.88);
  line-height: 1.35;
}

.deploy-bar {
  margin-top: 0.7rem;
  height: 4px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}

.deploy-bar > i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #5ec8ff, #b8f0ff);
  transition: width 0.2s ease;
}

.aim.dim .crosshair {
  opacity: 0.35;
}
</style>

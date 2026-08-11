/**
 * 程序化动作音效：按地表区分脚步/落地，动作音更清晰响亮
 */

export type SurfaceKind = 'grass' | 'stone' | 'sand' | 'dirt' | 'wood' | 'water' | 'default'

export type SfxKind =
  | 'foot_grass'
  | 'foot_stone'
  | 'foot_sand'
  | 'foot_dirt'
  | 'foot_wood'
  | 'foot_walk'
  | 'foot_run'
  | 'jump'
  | 'land_grass'
  | 'land_stone'
  | 'land_sand'
  | 'land_dirt'
  | 'land_wood'
  | 'land'
  | 'splash'
  | 'fall_pit'
  | 'dig'
  | 'chop'
  | 'mine'
  | 'build'
  // 武器：挥击 / 开火
  | 'wpn_fist'
  | 'wpn_axe'
  | 'wpn_staff'
  | 'wpn_cleaver'
  | 'wpn_pistol'
  | 'wpn_rifle'
  | 'wpn_sniper'
  // 武器命中
  | 'hit_melee'
  | 'hit_cleaver'
  | 'hit_bullet'
  | 'hit_sniper'
  // 野怪受击 / 死亡 / 攻击玩家
  | 'mon_scrapmite_hurt'
  | 'mon_miregrub_hurt'
  | 'mon_shardhound_hurt'
  | 'mon_voltspire_hurt'
  | 'mon_voidmaw_hurt'
  | 'mon_scrapmite_die'
  | 'mon_miregrub_die'
  | 'mon_shardhound_die'
  | 'mon_voltspire_die'
  | 'mon_voidmaw_die'
  | 'mon_scrapmite_atk'
  | 'mon_miregrub_atk'
  | 'mon_shardhound_atk'
  | 'mon_voltspire_atk'
  | 'mon_voidmaw_atk'
  // 玩家受伤 / 用药
  | 'player_hurt'
  | 'medkit_small'
  | 'medkit_large'
  // 家具放置 / 切换
  | 'furn_window'
  | 'furn_door'
  | 'furn_stove'
  | 'furn_craft'
  | 'furn_lamp'
  | 'furn_fence'
  | 'furn_wire'
  | 'furn_cobble'
  | 'furn_pond'
  | 'furn_firepit'
  | 'furn_door_open'
  | 'furn_door_close'
  | 'furn_lamp_on'
  | 'furn_lamp_off'
  | 'furn_stove_on'
  | 'furn_wire_on'
  | 'furn_pond_on'
  | 'furn_craft_on'
  | 'deploy_tick'
  | 'deploy_go'

type Pos = { x: number; y?: number; z: number }

export class GameAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private sfx: GainNode | null = null
  private muted = false
  private unlocked = false
  private unlockCleanups: Array<() => void> = []
  private lastFoot = 0
  private lastPeerFoot = new Map<number, number>()
  private lastPeerAction = new Map<number, number>()

  setMuted(muted: boolean) {
    this.muted = muted
    if (this.master) this.master.gain.value = muted ? 0 : 1
  }

  isMuted() {
    return this.muted
  }

  ensure() {
    this.ensureUnlockHooks()
    void this.tryResume()
  }

  dispose() {
    this.clearUnlockHooks()
    void this.ctx?.close()
    this.ctx = null
    this.master = null
    this.sfx = null
    this.unlocked = false
    this.lastPeerFoot.clear()
    this.lastPeerAction.clear()
  }

  private ensureUnlockHooks() {
    if (this.unlockCleanups.length) return
    const unlock = () => void this.tryResume()
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    window.addEventListener('touchstart', unlock, { passive: true })
    this.unlockCleanups = [
      () => window.removeEventListener('pointerdown', unlock),
      () => window.removeEventListener('keydown', unlock),
      () => window.removeEventListener('touchstart', unlock),
    ]
  }

  private clearUnlockHooks() {
    for (const off of this.unlockCleanups) off()
    this.unlockCleanups = []
  }

  private async tryResume() {
    if (!this.ctx) this.build()
    if (!this.ctx) return
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume()
      } catch {
        return
      }
    }
    if (this.ctx.state === 'running') {
      this.unlocked = true
      this.clearUnlockHooks()
    }
  }

  private build() {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    this.ctx = ctx
    const master = ctx.createGain()
    master.gain.value = this.muted ? 0 : 1
    master.connect(ctx.destination)
    this.master = master
    const sfx = ctx.createGain()
    sfx.gain.value = 0.92
    sfx.connect(master)
    this.sfx = sfx
  }

  play(kind: SfxKind, opts?: { volume?: number; at?: Pos; listener?: Pos; pitch?: number }) {
    if (this.muted) return
    void this.tryResume()
    if (!this.ctx || !this.sfx || !this.unlocked) return

    let vol = (opts?.volume ?? 1) * 1.15
    if (opts?.at && opts?.listener) {
      const d = Math.hypot(opts.at.x - opts.listener.x, opts.at.z - opts.listener.z)
      const isFoot =
        kind.startsWith('foot_') || kind === 'foot_walk' || kind === 'foot_run'
      const maxD = isFoot ? 22 : 42
      if (d > maxD) return
      if (isFoot) {
        // 别人脚步默认很轻；贴脸（<2.5m）才明显
        let atten = Math.pow(Math.max(0, 1 - d / maxD), 2.4)
        if (d < 2.5) atten = Math.min(1, atten * 3.2 + 0.25)
        else atten *= 0.35
        vol *= atten
      } else {
        vol *= Math.max(0.08, 1 - d / maxD)
      }
    }
    if (vol < 0.015) return

    switch (kind) {
      case 'foot_grass':
      case 'foot_walk':
        // 第一版「走在路上」顿足音，放大更清晰
        this.thud(95 + Math.random() * 35, 0.055, 0.26 * vol, 0.32)
        this.grit(0.08 * vol)
        break
      case 'foot_run':
        this.thud(115 + Math.random() * 45, 0.045, 0.32 * vol, 0.38)
        this.grit(0.1 * vol)
        break
      case 'foot_stone':
        this.stoneStep(0.3 * vol)
        break
      case 'foot_sand':
        this.sandStep(0.28 * vol)
        break
      case 'foot_dirt':
        this.dirtStep(0.26 * vol)
        break
      case 'foot_wood':
        this.woodStep(0.3 * vol)
        break
      case 'jump':
        this.whoosh(200, 480, 0.1, 0.22 * vol)
        break
      case 'land_grass':
      case 'land':
        // 与走路顿足同音色，落地更重
        this.thud(85 + Math.random() * 30, 0.075, 0.42 * vol, 0.4)
        this.grit(0.14 * vol)
        break
      case 'land_stone':
        this.stoneStep(0.42 * vol)
        this.thud(95, 0.08, 0.22 * vol, 0.3)
        break
      case 'land_sand':
        this.sandStep(0.4 * vol)
        break
      case 'land_dirt':
        this.dirtStep(0.38 * vol)
        this.thud(70, 0.07, 0.2 * vol, 0.25)
        break
      case 'land_wood':
        this.woodStep(0.4 * vol)
        break
      case 'splash':
        this.splash(0.55 * vol)
        break
      case 'fall_pit':
        this.whoosh(280, 80, 0.2, 0.28 * vol)
        this.thud(50, 0.12, 0.35 * vol, 0.45)
        break
      case 'dig':
        this.grit(0.38 * vol)
        break
      case 'chop':
        this.woodHit(0.5 * vol)
        break
      case 'mine':
        this.stoneHit(0.48 * vol)
        break
      case 'build':
        this.placeSoft(0.36 * vol)
        break

      case 'wpn_fist':
        this.whoosh(280, 120, 0.08, 0.2 * vol)
        this.thud(90, 0.04, 0.18 * vol, 0.2)
        break
      case 'wpn_axe':
        this.whoosh(220, 90, 0.1, 0.28 * vol)
        this.woodHit(0.22 * vol)
        break
      case 'wpn_staff':
        this.whoosh(180, 70, 0.12, 0.32 * vol)
        this.thud(70, 0.06, 0.2 * vol, 0.15)
        break
      case 'wpn_cleaver':
        this.whoosh(160, 60, 0.11, 0.34 * vol)
        this.metalSwipe(0.4 * vol)
        break
      case 'wpn_pistol':
        this.gunShot(780, 0.09, 0.55 * vol, false)
        break
      case 'wpn_rifle':
        this.gunShot(520, 0.07, 0.48 * vol, true)
        break
      case 'wpn_sniper':
        this.gunShot(340, 0.14, 0.72 * vol, false)
        this.whoosh(900, 200, 0.08, 0.12 * vol)
        break

      case 'hit_melee':
        this.thud(150, 0.05, 0.35 * vol, 0.4)
        this.grit(0.25 * vol)
        break
      case 'hit_cleaver':
        this.metalSwipe(0.45 * vol)
        this.thud(120, 0.06, 0.3 * vol, 0.25)
        break
      case 'hit_bullet':
        this.bulletImpact(0.5 * vol)
        break
      case 'hit_sniper':
        this.bulletImpact(0.7 * vol)
        this.thud(80, 0.08, 0.28 * vol, 0.2)
        break

      case 'mon_scrapmite_hurt':
        this.chitter(0.4 * vol, 1400)
        break
      case 'mon_miregrub_hurt':
        this.squish(0.45 * vol)
        break
      case 'mon_shardhound_hurt':
        this.crystalYelp(0.5 * vol)
        break
      case 'mon_voltspire_hurt':
        this.zap(0.48 * vol)
        break
      case 'mon_voidmaw_hurt':
        this.voidGrowl(0.55 * vol, false)
        break
      case 'mon_scrapmite_die':
        this.chitter(0.5 * vol, 900)
        this.thud(60, 0.1, 0.25 * vol, 0.3)
        break
      case 'mon_miregrub_die':
        this.squish(0.6 * vol)
        this.thud(50, 0.12, 0.3 * vol, 0.35)
        break
      case 'mon_shardhound_die':
        this.crystalYelp(0.55 * vol)
        this.stoneHit(0.35 * vol)
        break
      case 'mon_voltspire_die':
        this.zap(0.6 * vol)
        this.whoosh(600, 80, 0.2, 0.25 * vol)
        break
      case 'mon_voidmaw_die':
        this.voidGrowl(0.7 * vol, true)
        break
      case 'mon_scrapmite_atk':
        this.chitter(0.35 * vol, 1100)
        this.thud(100, 0.04, 0.2 * vol, 0.2)
        break
      case 'mon_miregrub_atk':
        this.squish(0.4 * vol)
        break
      case 'mon_shardhound_atk':
        this.whoosh(300, 100, 0.09, 0.3 * vol)
        this.crystalYelp(0.3 * vol)
        break
      case 'mon_voltspire_atk':
        this.zap(0.55 * vol)
        break
      case 'mon_voidmaw_atk':
        this.voidGrowl(0.5 * vol, false)
        this.whoosh(120, 40, 0.15, 0.28 * vol)
        break

      case 'player_hurt':
        this.playerHurt(0.55 * vol)
        break
      case 'medkit_small':
        this.healChirp(0.4 * vol, false)
        break
      case 'medkit_large':
        this.healChirp(0.55 * vol, true)
        break

      case 'furn_window':
        this.placeSoft(0.4 * vol)
        this.glassClink(0.25 * vol)
        break
      case 'furn_door':
        this.woodHit(0.35 * vol)
        this.placeSoft(0.25 * vol)
        break
      case 'furn_stove':
        this.thud(90, 0.08, 0.35 * vol, 0.3)
        this.metalSwipe(0.2 * vol)
        break
      case 'furn_craft':
        this.thud(110, 0.07, 0.32 * vol, 0.25)
        this.servoWhirr(0.28 * vol)
        break
      case 'furn_lamp':
        this.placeSoft(0.3 * vol)
        this.glassClink(0.2 * vol)
        break
      case 'furn_fence':
        this.woodHit(0.4 * vol)
        break
      case 'furn_wire':
        this.metalSwipe(0.35 * vol)
        this.zap(0.15 * vol)
        break
      case 'furn_cobble':
        this.stoneHit(0.4 * vol)
        break
      case 'furn_pond':
        this.splash(0.35 * vol)
        this.placeSoft(0.2 * vol)
        break
      case 'furn_firepit':
        this.stoneHit(0.3 * vol)
        this.fireCrackle(0.35 * vol)
        break
      case 'furn_door_open':
        this.doorCreak(0.45 * vol, true)
        break
      case 'furn_door_close':
        this.doorCreak(0.45 * vol, false)
        break
      case 'furn_lamp_on':
        this.lampClick(0.4 * vol, true)
        break
      case 'furn_lamp_off':
        this.lampClick(0.35 * vol, false)
        break
      case 'furn_stove_on':
        this.fireCrackle(0.5 * vol)
        this.whoosh(200, 80, 0.12, 0.2 * vol)
        break
      case 'furn_wire_on':
        this.zap(0.45 * vol)
        break
      case 'furn_pond_on':
        this.splash(0.4 * vol)
        break
      case 'furn_craft_on':
        this.servoWhirr(0.5 * vol)
        break
      case 'deploy_tick':
        this.deployDing(0.55 * vol, opts?.pitch ?? 1)
        break
      case 'deploy_go':
        this.deployDing(0.7 * vol, (opts?.pitch ?? 1) * 1.25)
        this.deployDing(0.45 * vol, (opts?.pitch ?? 1) * 1.55)
        break
    }
  }

  playWeaponAttack(weaponId: string, opts?: { volume?: number; at?: Pos; listener?: Pos }) {
    const map: Record<string, SfxKind> = {
      fist: 'wpn_fist',
      axe: 'wpn_axe',
      staff: 'wpn_staff',
      cleaver: 'wpn_cleaver',
      pistol: 'wpn_pistol',
      rifle: 'wpn_rifle',
      sniper: 'wpn_sniper',
    }
    this.play(map[weaponId] || 'wpn_fist', opts)
  }

  playWeaponHit(weaponId: string, opts?: { volume?: number; at?: Pos; listener?: Pos }) {
    if (weaponId === 'sniper') this.play('hit_sniper', opts)
    else if (weaponId === 'pistol' || weaponId === 'rifle') this.play('hit_bullet', opts)
    else if (weaponId === 'cleaver') this.play('hit_cleaver', opts)
    else this.play('hit_melee', opts)
  }

  playMonsterHurt(kind: string, opts?: { volume?: number; at?: Pos; listener?: Pos }) {
    const k = `mon_${kind}_hurt` as SfxKind
    if (this.isKnown(k)) this.play(k, opts)
    else this.play('mon_scrapmite_hurt', opts)
  }

  playMonsterDeath(kind: string, opts?: { volume?: number; at?: Pos; listener?: Pos }) {
    const k = `mon_${kind}_die` as SfxKind
    if (this.isKnown(k)) this.play(k, opts)
    else this.play('mon_scrapmite_die', opts)
  }

  playMonsterAttack(kind: string, opts?: { volume?: number; at?: Pos; listener?: Pos }) {
    const k = `mon_${kind}_atk` as SfxKind
    if (this.isKnown(k)) this.play(k, opts)
    else this.play('mon_scrapmite_atk', opts)
  }

  playFurniturePlace(propId: string, opts?: { volume?: number; at?: Pos; listener?: Pos }) {
    const map: Record<string, SfxKind> = {
      window: 'furn_window',
      door: 'furn_door',
      stove: 'furn_stove',
      craft: 'furn_craft',
      lamp: 'furn_lamp',
      fence: 'furn_fence',
      wire: 'furn_wire',
      cobble: 'furn_cobble',
      pond: 'furn_pond',
      firepit: 'furn_firepit',
    }
    this.play(map[propId] || 'build', opts)
  }

  playFurnitureToggle(
    propId: string,
    activeOrIndex: boolean | number,
    opts?: { volume?: number; at?: Pos; listener?: Pos }
  ) {
    const on = typeof activeOrIndex === 'number' ? activeOrIndex > 0 : activeOrIndex
    if (propId === 'door') this.play(on ? 'furn_door_open' : 'furn_door_close', opts)
    else if (propId === 'lamp') this.play(on ? 'furn_lamp_on' : 'furn_lamp_off', opts)
    else if (propId === 'stove' && on) this.play('furn_stove_on', opts)
    else if (propId === 'wire' && on) this.play('furn_wire_on', opts)
    else if (propId === 'pond' && on) this.play('furn_pond_on', opts)
    else if (propId === 'craft' && on) this.play('furn_craft_on', opts)
    else if (propId === 'firepit' && on) this.play('furn_firepit', opts)
  }

  private isKnown(kind: string): kind is SfxKind {
    return kind.startsWith('mon_') || kind.startsWith('wpn_') || kind.startsWith('furn_')
  }

  footForSurface(surface: SurfaceKind, running: boolean): SfxKind {
    if (surface === 'stone') return 'foot_stone'
    if (surface === 'sand') return 'foot_sand'
    if (surface === 'dirt') return 'foot_dirt'
    if (surface === 'wood') return 'foot_wood'
    if (surface === 'grass') return running ? 'foot_run' : 'foot_grass'
    return running ? 'foot_run' : 'foot_walk'
  }

  landForSurface(surface: SurfaceKind): SfxKind {
    if (surface === 'stone') return 'land_stone'
    if (surface === 'sand') return 'land_sand'
    if (surface === 'dirt') return 'land_dirt'
    if (surface === 'wood') return 'land_wood'
    if (surface === 'water') return 'splash'
    return 'land_grass'
  }

  tickLocalFoot(
    dt: number,
    moving: number,
    running: boolean,
    onGround: boolean,
    surface: SurfaceKind = 'grass'
  ) {
    if (!onGround || moving < 0.12 || surface === 'water') return
    this.lastFoot += dt
    const interval = running ? 0.26 : 0.4
    if (this.lastFoot >= interval) {
      this.lastFoot = 0
      this.play(this.footForSurface(surface, running), { volume: 1.15 + moving * 0.25 })
    }
  }

  tickPeerFoot(
    id: number,
    dt: number,
    moving: boolean,
    running: boolean,
    at: Pos,
    listener: Pos
  ) {
    if (!moving) return
    const prev = this.lastPeerFoot.get(id) || 0
    const next = prev + dt
    const interval = running ? 0.3 : 0.46
    if (next >= interval) {
      this.lastPeerFoot.set(id, 0)
      this.play(running ? 'foot_run' : 'foot_grass', {
        volume: 0.22,
        at,
        listener,
      })
    } else {
      this.lastPeerFoot.set(id, next)
    }
  }

  peerAction(id: number, action: string | null | undefined, at: Pos, listener: Pos) {
    if (!action) return
    const now = performance.now()
    const last = this.lastPeerAction.get(id) || 0
    const gap =
      action === 'chop' || action === 'mine' ? 380 : action === 'dig' || action === 'build' ? 280 : 500
    if (now - last < gap) return
    this.lastPeerAction.set(id, now)
    const kind: SfxKind | null =
      action === 'chop'
        ? 'chop'
        : action === 'mine'
          ? 'mine'
          : action === 'dig' || action === 'clear'
            ? 'dig'
            : action === 'build'
              ? 'build'
              : null
    if (kind) this.play(kind, { volume: 0.75, at, listener })
  }

  private noiseBuf(seconds: number, brown = 0) {
    const ctx = this.ctx!
    const rate = ctx.sampleRate
    const len = Math.floor(rate * seconds)
    const buf = ctx.createBuffer(1, len, rate)
    const data = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1
      last = last * brown + white * (1 - brown * 0.85)
      data[i] = last
    }
    return buf
  }

  private thud(freq: number, dur: number, gain: number, noiseAmt: number) {
    const ctx = this.ctx!
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, t0)
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.45), t0 + dur)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g)
    g.connect(this.sfx!)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)

    if (noiseAmt > 0.05) {
      const src = ctx.createBufferSource()
      src.buffer = this.noiseBuf(dur, 0.4)
      const ng = ctx.createGain()
      const bp = ctx.createBiquadFilter()
      bp.type = 'lowpass'
      bp.frequency.value = 600
      ng.gain.setValueAtTime(0.0001, t0)
      ng.gain.exponentialRampToValueAtTime(gain * noiseAmt * 0.45, t0 + 0.008)
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
      src.connect(bp)
      bp.connect(ng)
      ng.connect(this.sfx!)
      src.start(t0)
      src.stop(t0 + dur)
    }
  }

  private whoosh(f0: number, f1: number, dur: number, gain: number) {
    const ctx = this.ctx!
    const t0 = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf(dur, 0.15)
    const g = ctx.createGain()
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(f0, t0)
    bp.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t0 + dur)
    bp.Q.value = 1.2
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    src.connect(bp)
    bp.connect(g)
    g.connect(this.sfx!)
    src.start(t0)
    src.stop(t0 + dur)
  }

  /** 草坪沙沙：中高频柔噪，像踩草 */
  private grassRustle(gain: number, heavy: boolean) {
    const ctx = this.ctx!
    const t0 = ctx.currentTime
    const dur = heavy ? 0.16 : 0.11
    // 层1：草叶摩擦
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf(dur, 0.08)
    const g = ctx.createGain()
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1600 + Math.random() * 700
    bp.Q.value = 0.55
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.018)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    src.connect(bp)
    bp.connect(g)
    g.connect(this.sfx!)
    src.start(t0)
    src.stop(t0 + dur + 0.02)
    // 层2：更柔的低频蹭地，增加“踩实”感
    const src2 = ctx.createBufferSource()
    src2.buffer = this.noiseBuf(dur * 0.85, 0.35)
    const g2 = ctx.createGain()
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 480
    g2.gain.setValueAtTime(0.0001, t0)
    g2.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * 0.35), t0 + 0.02)
    g2.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.9)
    src2.connect(lp)
    lp.connect(g2)
    g2.connect(this.sfx!)
    src2.start(t0)
    src2.stop(t0 + dur)
  }

  /** 石头：沉闷石面，不要金属水滴感 */
  private stoneStep(gain: number) {
    const ctx = this.ctx!
    const t0 = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf(0.09, 0.55)
    const g = ctx.createGain()
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 520
    lp.Q.value = 0.7
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * 0.85), t0 + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08)
    src.connect(lp)
    lp.connect(g)
    g.connect(this.sfx!)
    src.start(t0)
    src.stop(t0 + 0.09)
    // 低沉顿脚，避免高频叮一声
    this.thud(68 + Math.random() * 18, 0.06, gain * 0.7, 0.35)
  }

  private sandStep(gain: number) {
    const ctx = this.ctx!
    const t0 = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf(0.12, 0.05)
    const g = ctx.createGain()
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1400
    bp.Q.value = 0.6
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11)
    src.connect(bp)
    bp.connect(g)
    g.connect(this.sfx!)
    src.start(t0)
    src.stop(t0 + 0.12)
  }

  private dirtStep(gain: number) {
    this.thud(95, 0.05, gain * 0.7, 0.35)
    this.grit(gain * 0.45)
  }

  private woodStep(gain: number) {
    const ctx = this.ctx!
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(180, t0)
    osc.frequency.exponentialRampToValueAtTime(90, t0 + 0.07)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08)
    osc.connect(g)
    g.connect(this.sfx!)
    osc.start(t0)
    osc.stop(t0 + 0.09)
  }

  private splash(gain: number) {
    const ctx = this.ctx!
    const t0 = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf(0.42, 0.04)
    const g = ctx.createGain()
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(1100, t0)
    bp.frequency.exponentialRampToValueAtTime(220, t0 + 0.35)
    bp.Q.value = 0.65
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4)
    src.connect(bp)
    bp.connect(g)
    g.connect(this.sfx!)
    src.start(t0)
    src.stop(t0 + 0.42)
    this.thud(70, 0.08, gain * 0.35, 0.2)
  }

  private grit(gain: number) {
    const ctx = this.ctx!
    const t0 = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf(0.12, 0.25)
    const g = ctx.createGain()
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 400 + Math.random() * 300
    bp.Q.value = 1.5
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1)
    src.connect(bp)
    bp.connect(g)
    g.connect(this.sfx!)
    src.start(t0)
    src.stop(t0 + 0.12)
  }

  private woodHit(gain: number) {
    const ctx = this.ctx!
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(220 + Math.random() * 40, t0)
    osc.frequency.exponentialRampToValueAtTime(90, t0 + 0.12)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14)
    osc.connect(g)
    g.connect(this.sfx!)
    osc.start(t0)
    osc.stop(t0 + 0.15)
    this.grit(gain * 0.5)
  }

  private stoneHit(gain: number) {
    const ctx = this.ctx!
    const t0 = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf(0.1, 0.55)
    const g = ctx.createGain()
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 800
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09)
    src.connect(hp)
    hp.connect(g)
    g.connect(this.sfx!)
    src.start(t0)
    src.stop(t0 + 0.1)
    this.thud(140, 0.05, gain * 0.55, 0.12)
  }

  private placeSoft(gain: number) {
    const ctx = this.ctx!
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(320, t0)
    osc.frequency.exponentialRampToValueAtTime(160, t0 + 0.08)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1)
    osc.connect(g)
    g.connect(this.sfx!)
    osc.start(t0)
    osc.stop(t0 + 0.11)
  }

  private metalSwipe(gain: number) {
    const ctx = this.ctx!
    const t0 = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf(0.1, 0.02)
    const g = ctx.createGain()
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(2400, t0)
    bp.frequency.exponentialRampToValueAtTime(600, t0 + 0.09)
    bp.Q.value = 2.2
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1)
    src.connect(bp)
    bp.connect(g)
    g.connect(this.sfx!)
    src.start(t0)
    src.stop(t0 + 0.11)
  }

  private gunShot(baseFreq: number, dur: number, gain: number, burst: boolean) {
    const ctx = this.ctx!
    const t0 = ctx.currentTime
    const bang = () => {
      const src = ctx.createBufferSource()
      src.buffer = this.noiseBuf(dur, 0.2)
      const g = ctx.createGain()
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = baseFreq + Math.random() * 120
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.004)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
      src.connect(lp)
      lp.connect(g)
      g.connect(this.sfx!)
      src.start(t0)
      src.stop(t0 + dur + 0.02)
      this.thud(baseFreq * 0.22, dur * 0.7, gain * 0.55, 0.35)
    }
    bang()
    if (burst) {
      // 步枪短连发感（第二发更轻）
      window.setTimeout(() => {
        if (!this.ctx || !this.sfx || this.muted) return
        const t1 = this.ctx.currentTime
        const src = this.ctx.createBufferSource()
        src.buffer = this.noiseBuf(dur * 0.85, 0.2)
        const g = this.ctx.createGain()
        const lp = this.ctx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.value = baseFreq * 0.95
        g.gain.setValueAtTime(0.0001, t1)
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * 0.55), t1 + 0.003)
        g.gain.exponentialRampToValueAtTime(0.0001, t1 + dur * 0.85)
        src.connect(lp)
        lp.connect(g)
        g.connect(this.sfx!)
        src.start(t1)
        src.stop(t1 + dur)
      }, 55)
    }
  }

  private bulletImpact(gain: number) {
    this.thud(220, 0.04, gain * 0.45, 0.5)
    this.grit(gain * 0.55)
    const ctx = this.ctx!
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(880, t0)
    osc.frequency.exponentialRampToValueAtTime(120, t0 + 0.06)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * 0.25), t0 + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07)
    osc.connect(g)
    g.connect(this.sfx!)
    osc.start(t0)
    osc.stop(t0 + 0.08)
  }

  private chitter(gain: number, freq: number) {
    const ctx = this.ctx!
    const t0 = ctx.currentTime
    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'square'
      const f = freq * (0.85 + Math.random() * 0.3)
      const t = t0 + i * 0.028
      osc.frequency.setValueAtTime(f, t)
      osc.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.04)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * 0.35), t + 0.005)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045)
      osc.connect(g)
      g.connect(this.sfx!)
      osc.start(t)
      osc.stop(t + 0.05)
    }
  }

  private squish(gain: number) {
    this.thud(55, 0.1, gain * 0.5, 0.55)
    this.whoosh(400, 90, 0.12, gain * 0.35)
  }

  private crystalYelp(gain: number) {
    const ctx = this.ctx!
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(720, t0)
    osc.frequency.exponentialRampToValueAtTime(180, t0 + 0.14)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16)
    osc.connect(g)
    g.connect(this.sfx!)
    osc.start(t0)
    osc.stop(t0 + 0.17)
    this.glassClink(gain * 0.35)
  }

  private zap(gain: number) {
    const ctx = this.ctx!
    const t0 = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf(0.12, 0.01)
    const g = ctx.createGain()
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(3200, t0)
    bp.frequency.exponentialRampToValueAtTime(400, t0 + 0.1)
    bp.Q.value = 3.5
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11)
    src.connect(bp)
    bp.connect(g)
    g.connect(this.sfx!)
    src.start(t0)
    src.stop(t0 + 0.12)
  }

  private voidGrowl(gain: number, dying: boolean) {
    const ctx = this.ctx!
    const t0 = ctx.currentTime
    const dur = dying ? 0.55 : 0.28
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(dying ? 90 : 140, t0)
    osc.frequency.exponentialRampToValueAtTime(dying ? 28 : 55, t0 + dur)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * 0.7), t0 + 0.04)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 280
    osc.connect(lp)
    lp.connect(g)
    g.connect(this.sfx!)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
    this.whoosh(200, 40, dur * 0.8, gain * 0.35)
  }

  private playerHurt(gain: number) {
    this.thud(110, 0.07, gain * 0.45, 0.35)
    const ctx = this.ctx!
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(260, t0)
    osc.frequency.exponentialRampToValueAtTime(90, t0 + 0.12)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * 0.35), t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14)
    osc.connect(g)
    g.connect(this.sfx!)
    osc.start(t0)
    osc.stop(t0 + 0.15)
  }

  private healChirp(gain: number, large: boolean) {
    const ctx = this.ctx!
    const t0 = ctx.currentTime
    const notes = large ? [520, 660, 820] : [480, 620]
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      const t = t0 + i * 0.06
      osc.type = 'sine'
      osc.frequency.value = f
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * 0.4), t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1)
      osc.connect(g)
      g.connect(this.sfx!)
      osc.start(t)
      osc.stop(t + 0.12)
    })
  }

  private glassClink(gain: number) {
    const ctx = this.ctx!
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1400, t0)
    osc.frequency.exponentialRampToValueAtTime(900, t0 + 0.08)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1)
    osc.connect(g)
    g.connect(this.sfx!)
    osc.start(t0)
    osc.stop(t0 + 0.11)
  }

  private fireCrackle(gain: number) {
    for (let i = 0; i < 5; i++) {
      window.setTimeout(() => {
        if (!this.ctx || this.muted) return
        this.grit(gain * (0.35 + Math.random() * 0.3))
        this.thud(40 + Math.random() * 30, 0.04, gain * 0.15, 0.4)
      }, i * 45)
    }
  }

  private servoWhirr(gain: number) {
    const ctx = this.ctx!
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(180, t0)
    osc.frequency.linearRampToValueAtTime(320, t0 + 0.18)
    osc.frequency.linearRampToValueAtTime(140, t0 + 0.32)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * 0.35), t0 + 0.04)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.34)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 900
    osc.connect(lp)
    lp.connect(g)
    g.connect(this.sfx!)
    osc.start(t0)
    osc.stop(t0 + 0.36)
  }

  private doorCreak(gain: number, open: boolean) {
    const ctx = this.ctx!
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'triangle'
    const f0 = open ? 160 : 220
    const f1 = open ? 90 : 140
    osc.frequency.setValueAtTime(f0, t0)
    osc.frequency.exponentialRampToValueAtTime(f1, t0 + 0.22)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * 0.5), t0 + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25)
    osc.connect(g)
    g.connect(this.sfx!)
    osc.start(t0)
    osc.stop(t0 + 0.27)
    if (!open) this.thud(100, 0.05, gain * 0.35, 0.2)
  }

  private lampClick(gain: number, on: boolean) {
    this.thud(on ? 400 : 280, 0.03, gain * 0.35, 0.15)
    if (on) {
      const ctx = this.ctx!
      const t0 = ctx.currentTime
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 880
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * 0.25), t0 + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12)
      osc.connect(g)
      g.connect(this.sfx!)
      osc.start(t0)
      osc.stop(t0 + 0.13)
    }
  }

  /** 准备舱倒计时叮声 */
  private deployDing(gain: number, pitch = 1) {
    if (!this.ctx || !this.sfx) return
    const t0 = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = 'sine'
    const f0 = 1040 * pitch
    osc.frequency.setValueAtTime(f0, t0)
    osc.frequency.exponentialRampToValueAtTime(Math.max(220, f0 * 0.72), t0 + 0.14)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * 0.55), t0 + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18)
    osc.connect(g)
    g.connect(this.sfx)
    osc.start(t0)
    osc.stop(t0 + 0.2)
    // 轻微一点金属感
    const osc2 = this.ctx.createOscillator()
    const g2 = this.ctx.createGain()
    osc2.type = 'triangle'
    osc2.frequency.value = f0 * 2.02
    g2.gain.setValueAtTime(0.0001, t0)
    g2.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * 0.18), t0 + 0.008)
    g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09)
    osc2.connect(g2)
    g2.connect(this.sfx)
    osc2.start(t0)
    osc2.stop(t0 + 0.1)
  }
}

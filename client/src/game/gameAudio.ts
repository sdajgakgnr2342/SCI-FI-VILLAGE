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

  play(kind: SfxKind, opts?: { volume?: number; at?: Pos; listener?: Pos }) {
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
    }
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
}

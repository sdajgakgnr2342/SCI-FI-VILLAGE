/**
 * 程序化自然环境音：风层 + 树叶沙沙 + 远水 + 虫鸣 + 多样鸟鸣
 */
export class NatureAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private windGain: GainNode | null = null
  private windFilter: BiquadFilterNode | null = null
  private leafGain: GainNode | null = null
  private waterGain: GainNode | null = null
  private insectGain: GainNode | null = null
  private sources: AudioBufferSourceNode[] = []
  private birdTimer = 0
  private rustleTimer = 0
  private raf = 0
  private last = 0
  private running = false
  private unlocked = false
  private muted = false
  private baseMaster = 0.22
  private creekDist = 99
  private unlockCleanups: Array<() => void> = []

  setMuted(muted: boolean) {
    this.muted = muted
    if (this.master) {
      this.master.gain.value = muted ? 0 : this.baseMaster
    }
  }

  /** 距小溪中心距离（格），≤10 时流水声变响 */
  setCreekDistance(dist: number) {
    this.creekDist = Math.max(0, dist)
  }

  start() {
    if (this.running) return
    this.running = true
    this.ensureUnlockHooks()
    void this.tryResume()
  }

  stop() {
    this.running = false
    this.clearUnlockHooks()
    if (this.raf) {
      cancelAnimationFrame(this.raf)
      this.raf = 0
    }
    for (const s of this.sources) {
      try {
        s.stop()
      } catch {
        /* ignore */
      }
    }
    this.sources = []
    void this.ctx?.close()
    this.ctx = null
    this.master = null
    this.windGain = null
    this.windFilter = null
    this.leafGain = null
    this.waterGain = null
    this.insectGain = null
    this.unlocked = false
  }

  private ensureUnlockHooks() {
    if (this.unlockCleanups.length) return
    const unlock = () => {
      void this.tryResume()
    }
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
    if (!this.running) return
    if (!this.ctx) this.buildGraph()
    if (!this.ctx) return
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume()
      } catch {
        return
      }
    }
    if (this.ctx.state !== 'running') return
    this.unlocked = true
    this.clearUnlockHooks()
    if (!this.raf) {
      this.last = performance.now()
      this.birdTimer = 1.5 + Math.random() * 2
      this.rustleTimer = 2 + Math.random() * 3
      this.raf = requestAnimationFrame(this.tick)
    }
  }

  private buildGraph() {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    this.ctx = ctx

    const master = ctx.createGain()
    master.gain.value = this.muted ? 0 : this.baseMaster
    master.connect(ctx.destination)
    this.master = master

    // 远风（压低，避免盖过脚步）
    const windGain = ctx.createGain()
    windGain.gain.value = 0.1
    const windFilter = ctx.createBiquadFilter()
    windFilter.type = 'lowpass'
    windFilter.frequency.value = 320
    windFilter.Q.value = 0.55
    windGain.connect(windFilter)
    windFilter.connect(master)
    this.windGain = windGain
    this.windFilter = windFilter
    this.loopNoise(ctx, windGain, 4.5, 0.72)

    // 树叶沙沙（中高频带通）
    const leafGain = ctx.createGain()
    leafGain.gain.value = 0.06
    const leafBp = ctx.createBiquadFilter()
    leafBp.type = 'bandpass'
    leafBp.frequency.value = 1800
    leafBp.Q.value = 0.8
    leafGain.connect(leafBp)
    leafBp.connect(master)
    this.leafGain = leafGain
    this.loopNoise(ctx, leafGain, 2.8, 0.35)

    // 溪流：默认很轻，靠近才抬升
    const waterGain = ctx.createGain()
    waterGain.gain.value = 0.02
    const waterLp = ctx.createBiquadFilter()
    waterLp.type = 'lowpass'
    waterLp.frequency.value = 1100
    waterGain.connect(waterLp)
    waterLp.connect(master)
    this.waterGain = waterGain
    this.loopNoise(ctx, waterGain, 3.5, 0.5)

    // 虫鸣带
    const insectGain = ctx.createGain()
    insectGain.gain.value = 0.03
    const insectBp = ctx.createBiquadFilter()
    insectBp.type = 'bandpass'
    insectBp.frequency.value = 4800
    insectBp.Q.value = 3.5
    insectGain.connect(insectBp)
    insectBp.connect(master)
    this.insectGain = insectGain
    this.loopNoise(ctx, insectGain, 1.4, 1)
  }

  private loopNoise(ctx: AudioContext, dest: AudioNode, seconds: number, brown: number) {
    const buf = this.makeNoiseBuffer(ctx, seconds, brown)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    src.connect(dest)
    src.start()
    this.sources.push(src)
  }

  private makeNoiseBuffer(ctx: AudioContext, seconds: number, brown = 0) {
    const rate = ctx.sampleRate
    const len = Math.floor(rate * seconds)
    const buf = ctx.createBuffer(1, len, rate)
    const data = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1
      last = last * brown + white * (1 - brown * 0.88)
      data[i] = last * 0.32
    }
    return buf
  }

  private tick = (now: number) => {
    if (!this.running || !this.unlocked || !this.ctx) return
    if (this.muted) {
      this.raf = requestAnimationFrame(this.tick)
      return
    }
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    const t = this.ctx.currentTime

    if (this.windGain && this.windFilter) {
      const gust =
        0.08 + 0.04 * Math.sin(t * 0.13) + 0.03 * Math.sin(t * 0.37 + 0.8) + 0.02 * Math.sin(t * 0.9)
      this.windGain.gain.setTargetAtTime(gust, t, 0.5)
      this.windFilter.frequency.setTargetAtTime(
        240 + 140 * (0.5 + 0.5 * Math.sin(t * 0.08)),
        t,
        0.7
      )
    }
    if (this.leafGain) {
      const rustle = 0.03 + 0.04 * (0.5 + 0.5 * Math.sin(t * 0.55 + 1))
      this.leafGain.gain.setTargetAtTime(rustle, t, 0.25)
    }
    if (this.waterGain) {
      const near = Math.max(0, 1 - this.creekDist / 10)
      const flow = 0.015 + near * near * 0.42 + 0.03 * Math.sin(t * 0.55)
      this.waterGain.gain.setTargetAtTime(flow, t, 0.25)
    }
    if (this.insectGain) {
      const buzz = 0.02 + 0.025 * (0.5 + 0.5 * Math.sin(t * 2.7))
      this.insectGain.gain.setTargetAtTime(buzz, t, 0.15)
    }

    this.birdTimer -= dt
    if (this.birdTimer <= 0) {
      this.playBirdPhrase()
      this.birdTimer = 2.2 + Math.random() * 5.5
    }

    this.rustleTimer -= dt
    if (this.rustleTimer <= 0) {
      this.playLeafBurst()
      this.rustleTimer = 4 + Math.random() * 8
    }

    this.raf = requestAnimationFrame(this.tick)
  }

  /** 一阵树叶翻动 */
  private playLeafBurst() {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.makeNoiseBuffer(ctx, 0.35, 0.2)
    const g = ctx.createGain()
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 2200 + Math.random() * 1200
    bp.Q.value = 1.2
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.05)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32)
    src.connect(bp)
    bp.connect(g)
    g.connect(this.master)
    src.start(t0)
    src.stop(t0 + 0.35)
  }

  /** 一段鸟鸣短语（多音、有回声感） */
  private playBirdPhrase() {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    const style = Math.floor(Math.random() * 3)
    const t0 = ctx.currentTime + 0.02
    let base = 1200 + Math.random() * 1600
    const notes = style === 0 ? 3 : style === 1 ? 2 : 4 + Math.floor(Math.random() * 2)

    for (let i = 0; i < notes; i++) {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = base
      filter.Q.value = 6
      osc.type = i % 2 === 0 ? 'sine' : 'triangle'
      const start = t0 + i * (0.07 + Math.random() * (style === 2 ? 0.05 : 0.09))
      const dur = 0.07 + Math.random() * 0.12
      const f0 = base * (0.94 + Math.random() * 0.14)
      const f1 =
        style === 1
          ? f0 * (1.15 + Math.random() * 0.2)
          : f0 * (0.82 + Math.random() * 0.28)
      osc.frequency.setValueAtTime(f0, start)
      osc.frequency.exponentialRampToValueAtTime(Math.max(280, f1), start + dur)
      g.gain.setValueAtTime(0.0001, start)
      g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.03, start + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
      osc.connect(filter)
      filter.connect(g)
      g.connect(this.master)
      // 轻回声
      const delay = ctx.createDelay(0.4)
      delay.delayTime.value = 0.12 + Math.random() * 0.08
      const eg = ctx.createGain()
      eg.gain.value = 0.22
      g.connect(delay)
      delay.connect(eg)
      eg.connect(this.master)
      osc.start(start)
      osc.stop(start + dur + 0.02)
      base *= 0.9 + Math.random() * 0.18
    }
  }
}

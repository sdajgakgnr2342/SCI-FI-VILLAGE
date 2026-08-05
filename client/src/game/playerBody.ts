import * as THREE from 'three'

export type SwingMode = 'none' | 'axe' | 'dig' | 'place'

/**
 * 第一人称可见肢体：走路摆动 + 挥斧/挖掘动作
 */
export class FirstPersonBody {
  readonly root = new THREE.Group()
  private leftArm: THREE.Group
  private rightArm: THREE.Group
  private leftLeg: THREE.Group
  private rightLeg: THREE.Group
  private axe: THREE.Group
  private phase = 0
  private moveAmt = 0
  private swingT = 0
  private swingMode: SwingMode = 'none'
  private crouchAmt = 0

  constructor() {
    this.root.name = 'fp-body'

    const skin = new THREE.MeshLambertMaterial({ color: 0xe8c4a2 })
    const cloth = new THREE.MeshLambertMaterial({ color: 0x3d7a5a })
    const pants = new THREE.MeshLambertMaterial({ color: 0x3a4a5c })
    const shoe = new THREE.MeshLambertMaterial({ color: 0x2a2a2a })

    this.leftArm = this.makeArm(skin, cloth, -1)
    this.rightArm = this.makeArm(skin, cloth, 1)
    this.leftLeg = this.makeLeg(pants, shoe, -1)
    this.rightLeg = this.makeLeg(pants, shoe, 1)
    this.axe = this.makeAxe()
    this.rightArm.add(this.axe)
    this.axe.visible = false

    this.leftArm.position.set(-0.22, -0.3, -0.4)
    this.rightArm.position.set(0.22, -0.3, -0.4)
    this.leftArm.rotation.z = 0.1
    this.rightArm.rotation.z = -0.1

    this.leftLeg.position.set(-0.12, -1.05, -0.22)
    this.rightLeg.position.set(0.12, -1.05, -0.22)

    this.root.add(this.leftArm, this.rightArm, this.leftLeg, this.rightLeg)

    this.root.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.frustumCulled = false
        m.castShadow = false
        m.receiveShadow = false
      }
    })
  }

  private makeAxe() {
    const g = new THREE.Group()
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.42, 0.04),
      new THREE.MeshLambertMaterial({ color: 0x6b4423 })
    )
    handle.position.set(0.02, -0.2, 0.08)
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.12, 0.05),
      new THREE.MeshLambertMaterial({ color: 0x9aa0a8 })
    )
    head.position.set(0.08, -0.02, 0.08)
    g.add(handle, head)
    g.position.set(0, -0.22, 0.04)
    return g
  }

  private makeArm(skin: THREE.Material, cloth: THREE.Material, side: number) {
    const g = new THREE.Group()
    // 偏细手臂，避免第一人称「胖手」挡视野
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.28, 0.07), cloth)
    upper.position.set(0, -0.1, 0)
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.09, 0.08), skin)
    hand.position.set(0, -0.28, 0.015)
    g.add(upper, hand)
    g.position.x = side * 0.015
    return g
  }

  private makeLeg(pants: THREE.Material, shoe: THREE.Material, side: number) {
    const g = new THREE.Group()
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.16), pants)
    thigh.position.set(0, -0.2, 0)
    const calf = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.36, 0.14), pants)
    calf.position.set(0, -0.52, 0)
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.24), shoe)
    foot.position.set(0, -0.74, 0.04)
    g.add(thigh, calf, foot)
    g.userData.side = side
    return g
  }

  attach(camera: THREE.Camera) {
    camera.add(this.root)
  }

  /** 触发一次挥击（砍/挖/放） */
  playSwing(mode: SwingMode) {
    this.swingMode = mode
    this.swingT = 0
    this.axe.visible = mode === 'axe'
  }

  setHoldingAxe(on: boolean) {
    if (this.swingMode === 'none') this.axe.visible = on
  }

  /**
   * @param crouching 是否蹲下
   */
  update(
    dt: number,
    moveStrength: number,
    sprint: boolean,
    pitch: number,
    crouching = false
  ) {
    // 蹲/起身缓动（约 0.35s），避免肢体瞬变
    this.crouchAmt += ((crouching ? 1 : 0) - this.crouchAmt) * Math.min(1, dt * 4.2)

    const target = Math.min(1, Math.abs(moveStrength))
    this.moveAmt += (target - this.moveAmt) * Math.min(1, dt * 10)

    const cadence = sprint ? 12.5 : 7.5
    if (this.moveAmt > 0.05 && this.swingMode === 'none') {
      this.phase += dt * cadence * (0.55 + this.moveAmt)
    } else if (this.swingMode === 'none') {
      this.phase *= 1 - Math.min(1, dt * 3)
    }

    const amp = (sprint ? 0.55 : 0.34) * this.moveAmt
    let swing = Math.sin(this.phase) * amp
    const bob = Math.abs(Math.sin(this.phase)) * 0.03 * this.moveAmt

    let rightX = -swing
    let leftX = swing
    let rightZ = sprint ? -0.48 : -0.42
    let leftZ = rightZ
    let rightY = -0.28 + bob * 0.85
    let leftY = -0.28 + bob

    // 挥击动画
    if (this.swingMode !== 'none') {
      this.swingT += dt
      const dur = this.swingMode === 'axe' ? 0.45 : 0.28
      const t = Math.min(1, this.swingT / dur)
      // 举起 → 劈下 → 回收
      const raise = t < 0.35 ? t / 0.35 : 1
      const strike = t < 0.35 ? 0 : t < 0.65 ? (t - 0.35) / 0.3 : 1
      const recover = t < 0.65 ? 0 : (t - 0.65) / 0.35

      if (this.swingMode === 'axe') {
        this.axe.visible = true
        rightX = -0.9 * raise + 1.35 * strike - 0.4 * recover
        rightY = -0.18 - 0.08 * raise + 0.12 * strike
        rightZ = -0.35 - 0.2 * raise - 0.25 * strike
        leftX = 0.25 * strike
      } else {
        // 挖/放：向前戳
        rightX = -0.5 * raise + 0.85 * strike - 0.2 * recover
        rightZ = -0.4 - 0.35 * strike
        leftX = 0.15
      }

      if (t >= 1) {
        this.swingMode = 'none'
        this.swingT = 0
      }
    }

    this.leftArm.rotation.x = leftX
    this.rightArm.rotation.x = rightX
    this.leftArm.position.y = leftY - this.crouchAmt * 0.06
    this.rightArm.position.y = rightY - this.crouchAmt * 0.06
    this.leftArm.position.z = leftZ
    this.rightArm.position.z = rightZ

    const lookDown = Math.max(0, -pitch)
    const legZ = -0.22 - lookDown * 0.15
    const legY = -1.05 - bob * 0.5 + this.crouchAmt * 0.22
    this.leftLeg.rotation.x = -swing * 0.9 + this.crouchAmt * 0.55
    this.rightLeg.rotation.x = swing * 0.9 + this.crouchAmt * 0.55
    this.leftLeg.position.set(-0.12, legY, legZ)
    this.rightLeg.position.set(0.12, legY, legZ)

    // 蹲下时镜头相对身体略降（root 下移）
    this.root.position.y = -this.crouchAmt * 0.35

    if (this.moveAmt < 0.05 && this.swingMode === 'none') {
      this.leftArm.rotation.x *= 0.9
      this.rightArm.rotation.x *= 0.9
    }
  }

  dispose() {
    this.root.removeFromParent()
    this.root.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.geometry.dispose()
        const mat = m.material
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else (mat as THREE.Material).dispose()
      }
    })
  }
}

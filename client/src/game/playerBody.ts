import * as THREE from 'three'

export type SwingMode = 'none' | 'axe' | 'dig' | 'place'

/** 静止时手臂相对竖直向前抬起的角度（开口向上的夹角） */
const ARM_REST_X = -0.95
/** 手臂略外展，与身体形成 V 形 */
const ARM_REST_Z = 0.12
/** 肩位：略靠前、略低，避免挡视野 */
const ARM_POS_Y = -0.22
const ARM_POS_Z = -0.28

/**
 * 第一人称可见肢体：走路摆动 + 挥斧/挖掘动作
 * 手臂短、向前抬起；斧柄末端嵌在右手手心。
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
  private holdingAxe = false

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

    // 肩：两侧略外、向前；抬起形成开口向上的夹角
    this.leftArm.position.set(-0.2, ARM_POS_Y, ARM_POS_Z)
    this.rightArm.position.set(0.2, ARM_POS_Y, ARM_POS_Z)
    this.leftArm.rotation.set(ARM_REST_X, 0, ARM_REST_Z)
    this.rightArm.rotation.set(ARM_REST_X, 0, -ARM_REST_Z)

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

  /**
   * 斧组原点 = 握点（木柄末端）。
   * 柄沿手的远端（局部 -Y）伸出，斧头在柄尖，嵌入手心像握住。
   */
  private makeAxe() {
    const g = new THREE.Group()
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.032, 0.4, 0.032),
      new THREE.MeshLambertMaterial({ color: 0x6b4423 })
    )
    // 柄末端（握点）嵌在手心 y≈0；整段柄朝远端 -Y 伸出
    handle.position.set(0.008, -0.17, 0.01)
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.19, 0.1, 0.048),
      new THREE.MeshLambertMaterial({ color: 0x9aa0a8 })
    )
    head.position.set(0.085, -0.36, 0.01)
    g.add(handle, head)
    // 锚到右手手心；刃略朝外前方
    g.position.set(0.012, -0.2, 0.018)
    g.rotation.set(-0.2, 0.65, 0.28)
    return g
  }

  private makeArm(skin: THREE.Material, cloth: THREE.Material, side: number) {
    const g = new THREE.Group()
    // 短臂：袖 + 手，总长约 0.22
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.16, 0.065), cloth)
    upper.position.set(0, -0.07, 0)
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.075), skin)
    hand.position.set(0, -0.2, 0.012)
    g.add(upper, hand)
    g.position.x = side * 0.01
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
    if (mode === 'axe') this.axe.visible = true
  }

  setHoldingAxe(on: boolean) {
    this.holdingAxe = on
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
    this.crouchAmt += ((crouching ? 1 : 0) - this.crouchAmt) * Math.min(1, dt * 4.2)

    const target = Math.min(1, Math.abs(moveStrength))
    this.moveAmt += (target - this.moveAmt) * Math.min(1, dt * 10)

    const cadence = sprint ? 12.5 : 7.5
    if (this.moveAmt > 0.05 && this.swingMode === 'none') {
      this.phase += dt * cadence * (0.55 + this.moveAmt)
    } else if (this.swingMode === 'none') {
      this.phase *= 1 - Math.min(1, dt * 3)
    }

    const amp = (sprint ? 0.48 : 0.32) * this.moveAmt
    const swing = Math.sin(this.phase) * amp
    const bob = Math.abs(Math.sin(this.phase)) * 0.025 * this.moveAmt

    // 基姿：向前抬起；走路时对侧摆动（像真人）
    let rightX = ARM_REST_X - swing
    let leftX = ARM_REST_X + swing
    let rightZ = -ARM_REST_Z
    let leftZ = ARM_REST_Z
    let rightY = ARM_POS_Y + bob * 0.7
    let leftY = ARM_POS_Y + bob
    let rightYaw = 0
    let leftYaw = 0

    if (this.swingMode !== 'none') {
      this.swingT += dt
      const dur = this.swingMode === 'axe' ? 0.52 : 0.32
      const t = Math.min(1, this.swingT / dur)
      // 后仰举起 → 向前劈下 → 回收
      const raise = t < 0.28 ? t / 0.28 : 1
      const strike = t < 0.28 ? 0 : t < 0.58 ? (t - 0.28) / 0.3 : 1
      const recover = t < 0.58 ? 0 : (t - 0.58) / 0.42

      if (this.swingMode === 'axe') {
        this.axe.visible = true
        // 举过肩再劈下：抬起时更负（更抬），劈下冲过静止角
        rightX =
          ARM_REST_X -
          0.85 * raise +
          1.75 * strike -
          0.55 * recover
        rightY = ARM_POS_Y - 0.04 * raise + 0.06 * strike
        rightZ = -ARM_REST_Z - 0.15 * raise - 0.35 * strike + 0.1 * recover
        rightYaw = 0.25 * raise - 0.15 * strike
        leftX = ARM_REST_X + 0.2 * strike
        leftZ = ARM_REST_Z + 0.08 * strike
      } else if (this.swingMode === 'dig') {
        // 挖掘：向前下方戳挖
        rightX = ARM_REST_X - 0.35 * raise + 0.95 * strike - 0.25 * recover
        rightY = ARM_POS_Y + 0.04 * strike
        rightZ = -ARM_REST_Z - 0.45 * strike
        leftX = ARM_REST_X + 0.12
      } else {
        // 放置：轻推
        rightX = ARM_REST_X - 0.2 * raise + 0.55 * strike - 0.15 * recover
        rightZ = -ARM_REST_Z - 0.3 * strike
        leftX = ARM_REST_X + 0.08
      }

      if (t >= 1) {
        this.swingMode = 'none'
        this.swingT = 0
        this.axe.visible = this.holdingAxe
      }
    }

    this.leftArm.rotation.set(leftX, leftYaw, leftZ)
    this.rightArm.rotation.set(rightX, rightYaw, rightZ)
    this.leftArm.position.y = leftY - this.crouchAmt * 0.06
    this.rightArm.position.y = rightY - this.crouchAmt * 0.06
    this.leftArm.position.z = ARM_POS_Z
    this.rightArm.position.z = ARM_POS_Z

    const lookDown = Math.max(0, -pitch)
    const legZ = -0.22 - lookDown * 0.15
    const legY = -1.05 - bob * 0.5 + this.crouchAmt * 0.22
    this.leftLeg.rotation.x = -swing * 0.95 + this.crouchAmt * 0.55
    this.rightLeg.rotation.x = swing * 0.95 + this.crouchAmt * 0.55
    this.leftLeg.position.set(-0.12, legY, legZ)
    this.rightLeg.position.set(0.12, legY, legZ)

    this.root.position.y = -this.crouchAmt * 0.35
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

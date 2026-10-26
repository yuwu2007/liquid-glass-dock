/**
 * Liquid 液态玻璃 —— 透镜构建纯逻辑（2026-09-05 从 BottomNav 内嵌实现抽离为可复用包）
 *
 * 技术路线：自研 SVG 位移贴图（liquid-glass 核心原理，无第三方依赖、零布局侵入）。
 * 双链分工：
 *   A) 描边采集链（#<prefix>-concave-lens，挂 rim）：预模糊(σ)低频化 → PULL 深采 →
 *      saturate → specular 提亮 → 由 .dock-rim 的 gradient mask 剪成环形采集带；
 *   B) 主玻璃缩放链（#<prefix>-scale-lens，挂 glass）：M=scale 等比缩小（凹透镜主视效）
 *      → blur + saturate(glassSaturate)。
 *      折射强度=M、折射弯曲=bend（贴图边缘淡出曲线指数）、背景柔化=blur、玻璃质感≈glassSaturate，
 *      均为可调 profile 参数。不做通道拆色——保持内容原色（2026-09-06 用户决策）。
 * 约束（均已踩坑，勿改）：
 * - 环采样位移场必须保持简单线性且 band ≥ ringWidth，改 smoothstep/收窄会致环消失；
 * - 环形状只能用 CSS gradient mask 剪出（image-mask / feComposite 叠在 backdrop-filter:url()
 *   上会被 Chromium 裁没/丢弃）；
 * - X5/WebKit 系对 backdrop-filter+SVG 位移组合合成不稳 → 能力检测后仅在 Chromium 启用。
 */

export interface LensProfile {
  /** Render the body and curved edge from one backdrop, without a separate sampled rim. */
  refractiveEdge?: boolean
  /**
   * 折射的**采样区**是否外扩到栏外（默认 true = 历史行为）。
   *
   * true  = 采样区 = 栏体 + padding（padding 由 pull/sigma/blur 推算，底栏当前 = 28px）。
   *         于是**栏外的邻近像素**会被折进栏体边缘 —— 真玻璃折的就是四周的光，
   *         但当「栏外内容」与「栏后内容」不是同一块时，边缘会显示**旁边的颜色**
   *         （例：底栏正上方那张彩色卡片，会以压扁的色带出现在栏体上缘 2~3px）。
   * false = 采样区就是栏体本身（padding=0，inset/clip 都归零），边缘只弯曲**栏后**的内容。
   *         这是微信内核（X5/XWeb）上实际呈现的档位，也是站长要的口径
   *         （2026-09-27「边缘应该折栏后的内容，不是旁边内容的颜色」）。
   */
  captureOutside?: boolean
  /** 预模糊半径 σ：低频化采样，压掉高频文字笔画抖动 */
  sigma: number
  /** Optional sharper sampling on straight edges; rounded ends keep sigma. */
  straightEdgeSigma?: number
  /** Unified edge only: vertical color spread along the left and right capsule ends, in px. */
  edgeColorSpreadY?: number
  /** Horizontal hue reach along the thin rim; not the visible rim width. */
  edgeColorSpreadX?: number
  /** Unified edge only: darken the spread sample without changing pure white (1 = no darkening). */
  edgeColorSpreadGamma?: number
  /** Dark backdrops: spread bright content and lift mid/highlights while preserving shadows. */
  edgeHighlightMode?: boolean
  /** Optional spread weight (0..1); mixes RGB together instead of per-channel min/max. */
  edgeSpreadMix?: number
  /** Legacy rim depth; refractiveEdge uses this as the local displacement limit. */
  pull: number
  /** 采样窗宽 band：位移强度线性归零区间（须 ≥ ringWidth，否则环消失） */
  band: number
  /** Unified edge only: sampling depth at rounded ends; straight edges keep pull. */
  endPull?: number
  /** Unified edge only: visible lip width at rounded ends; straight edges keep band. */
  endBand?: number
  /** Extra lip width on the diagonal arc only; the straight edge and side center stay unchanged. */
  cornerShoulderBand?: number
  /** Distance past each rounded end over which its stronger lip fades into the straight edge. */
  endReach?: number
  /** Use only nearby blurred color at rounded ends, keeping wide color spread on straight edges. */
  localizeEndColor?: boolean
  /** Restrict the rounded-end profile to pixels whose contour normal points sideways. */
  localEndArc?: boolean
  /** Rounded-end color spread along the capsule, independent of the straight-edge blur. */
  endColorSpreadY?: number
  /** Rounded-end color spread across the capsule; keep this short to preserve color position. */
  endColorSpreadX?: number
  /** 折射强度 M（2026-09-20 语义变更：原为整体等比缩小系数，现为**边缘内吸**强度——
      最外缘采样点向内的最大位移 ≈ M×40px，离边超过 40px 的内容零折射、原样断开。
      0.12 ≈ 贴边吸 4.8px，观感 = 直线条只在玻璃边缘弯曲，中部完全清晰） */
  scale: number
  /** 位移编码范围 S（concave 链 feDisplacementMap scale，须 ≥ pull，防钳制） */
  encode: number
  /** 深采后色彩饱和度提升（feColorMatrix saturate 值，仅 rim 链） */
  saturate: number
  /** Legacy rim linear gain; unified refraction uses reciprocal gamma to avoid clipping. */
  specularSlope: number
  /** specular 线性提亮斜率 */
  specularIntercept: number
  /**
   * 统一折射链（Chromium）里**折射带整体的提亮量**，0 = 不加（默认）。
   * 作用在 `slit`（位移后的边缘采样）之后：C' = C^(1/slope) + edgeLift。
   * 与 `specularIntercept` 分开是为了不动别的玻璃面 —— 后者默认 0.06 只喂降级内核那条链，
   * 且被顶栏等复用；深色底栏要的是"折射内容整体更亮"（2026-09-27 站长：深色下折射根本看不出来）。
   */
  edgeLift?: number
  /** 玻璃本体 blur（px），用于降级与注释口径（即"背景柔化"） */
  blur: number
  /** 折射弯曲：缩放位移场边缘淡出曲线的指数（1=当前 smoothstep 曲线）。
   *  >1 透镜效果更集中于边缘（弯曲感强），<1 向中部蔓延 */
  bend: number
  /** Optional straight-edge falloff exponent; rounded ends retain bend. */
  straightBend?: number
  /** 主玻璃饱和度（独立于 rim 的 saturate）。越低越通透中性；2 偏重，1.2~1.4 接近苹果液态玻璃 */
  glassSaturate: number
  /** 环色交融软化半径（px，仅 rim 链）：位移采样后再做一次定向模糊，让**沿环方向**相邻的
   *  背景色自然渐变过渡、消除色块之间的生硬断层。0 = 完全跳过该原语（链结构与历史一致，
   *  其他实例不受影响）。沿边方向权重更高（stdDeviation = x y，y 取 0.6x），避免横向环带
   *  被纵向糊掉。建议 1.5~3；过大会把色彩糊成均值、损失取色忠实度。 */
  rimSmooth: number
  /** 液态扭动幅度（px，仅玻璃缩放链）：把**低频值噪声**烘焙进位移贴图（fade 加权、
   *  只作用于贴边区），让玻璃边缘对背景产生细微的"液体掰弯"折射感——
   *  对标 feTurbulence+feDisplacementMap 方案，但噪声直接烘进我们自绘的贴图，
   *  不增加任何滤镜原语（仍是单张 feDisplacementMap，Android WebView 零额外开销、
   *  无逐帧重采样 → 不闪）。0 = 完全不启用（链与历史逐字节一致）。
   *  建议 1~2.5px：>3 会让高对比文字边缘显得"毛糙"。噪声用固定种子 → 每次重建贴图
   *  纹理一致，不会随页面生命周期"换脸"。 */
  wobble: number
}

  /** 默认调参 = BottomNav 线上取值（2026-09-05 验证版 rim 参数勿改）+
   *  2026-09-06 苹果液态玻璃化：玻璃饱和度降至 1.35、背景柔化降至 2px 提升通透感（均用户定值）。
   *  2026-09-06 色带忠实度：rim 预模糊 σ 10→2 —— σ=10 会把采集的黑与白底混成中灰
   *  （实测纯黑→94），用户要求色带忠实取背后所有颜色（含黑），与主玻璃 blur=2 对齐。
   *  2026-09-18 站长要求「模糊度可以再增加点」→ blur 4 → 6（磨砂感更明显）。
   *  ⚠️ 这个数是**玻璃本体的背景柔化（stdDeviation）**，属用户观感定值：改前先问；
   *  真机调参可直接用 `?blur=4~20` 临时覆盖（见 LiquidSurface 的 readBlurOverride），
   *  定下来再把这里改成那个数。
   *  注：曾实验彩边色散（RGB 通道差分位移），因黑字等高对比边缘会"拆出"红青鬼影，
   *  用户明确要求保持原色 → 已移除（见 git 历史 9729520），勿复活 */
  export const DEFAULT_LENS_PROFILE: LensProfile = {
    sigma: 2,
    pull: 52,
    band: 18,
    scale: 0.1,
    encode: 128,
    saturate: 1.5,
    specularSlope: 1.35,
    specularIntercept: 0.06,
    blur: 6,
    bend: 1,
    glassSaturate: 1.35,
    rimSmooth: 0,
    wobble: 0,
  }

/**
 * 深色主题下的 rim 描边参数（整站深色，2026-09-05）。
 * 深色底上不需要强"提亮"让描边恒亮——把 specular 线性提亮压回 ~1.0 / 0.03，
 * 让描边贴近背后实时暗色、仅轻微提亮。**只改这两个数字**：
 * 位移贴图结构 / band≥ringWidth 线性 / scale / saturate / blur 一律沿用默认，
 * 以免破坏 verify-rim-pixels 与 probe-bottomnav 的链结构护栏。
 * 注：2026-09-22 底栏深色改版（对标华为运动健康）走的是 BottomNav 传 darkProfile
 * 覆盖，本表仅作其他深色实例的保守缺省，未动。
 */
export const DARK_LENS_PROFILE: LensProfile = {
  ...DEFAULT_LENS_PROFILE,
  specularSlope: 1.0,
  specularIntercept: 0.03,
}

/**
 * 窄提亮边线（华为"细亮边"）参数：第三条滤镜链，仅在显式传入时挂载。
 * 形状跟随的衰减不靠 CSS mask（贴不出圆角矩形渐变），而由 buildLineMap 的
 * B 通道 alpha 蒙版经 feComposite in 裁出：贴边最亮、向内余弦衰减渗入（w）、
 * 向外柔化融入背景（soft）——等宽硬环拉宽即成"跑马灯"（2026-09-22 站长反馈，勿回退）。
 */
export interface LineProfile {
  /** 亮线向玻璃内渗入的深度 px（余弦衰减），0 = 不挂载该链 */
  w: number
  /** 亮线向背景侧的外晕 px */
  soft: number
  /** 提亮倍数（feComponentTransfer linear slope，"边被光照亮"的感觉） */
  bright: number
  /** 取色后饱和放大 */
  sat: number
}
/** 调参台验证默认值（2026-09-22 站长导出值） */
export const DEFAULT_LINE_PROFILE: LineProfile = { w: 3, soft: 1.5, bright: 2, sat: 3 }

/** 环境能力分级（决定 SVG 位移链的挂载策略）：
 *  - 'full'   桌面 Chromium：合成层稳定，滤镜链可长期挂载。
 *  - 'static' Android 全系（含微信 X5/XWeb）：滤镜走软件光栅化，**滚动中**逐帧重采样会丢帧
 *             并在玻璃边缘闪 1px 黑线（时隐时现、一碰就消失）。
 *             策略 = 只在「静止时」挂载，滚动/触摸/滚轮期间自动卸下 → 既有折射+采色，又不闪。
 *  - 'none'   iOS WebKit 系（Safari/WKWebView 套壳）：对 `backdrop-filter: url()` 支持不稳，
 *             一律不用（回退原生毛玻璃 + plain 采色环）。
 *
 *  ⚠️ 无论哪一档，**色环都要画**（差的是用 concave 还是 plain 采样），见 LiquidSurface 的 effectiveRimMode。
 *  历史事故：曾为了消 Android 黑线把色环整体跳过 → 手机端底部导航退化成一块平玻璃，用户投诉"效果变差"。 */
export function liquidLensCapability(): 'full' | 'static' | 'none' {
  if (typeof window === 'undefined') return 'none'
  const ua = navigator.userAgent
  // iOS 系（含 iOS 上的 Chrome/Firefox/Edge 套壳，均为 WebKit 内核）
  if (/iPhone|iPad|iPod/i.test(ua) || /CriOS|FxiOS|Edgios/i.test(ua)) return 'none'
  // Android（微信/QQ/微博等 X5 套壳同样是 Android，一并走静态挂载）
  const supports = typeof CSS !== 'undefined' && CSS.supports ? CSS.supports.bind(CSS) : null
  if (!supports) return 'none'
  // 真正决定能不能折射的是「backdrop-filter 收不收 url(#svg)」，不是 UA。
  // 小米自带浏览器 / 部分厂商内核 UA 看着是 Chrome，但位移链会被静默丢掉：
  // 那样玻璃既没有折射、也没有 blur（因为透镜模式下本体 backdrop-filter 被置 none），
  // 看起来像一块透明塑料。所以先验这一条，不支持就直接落到加厚兜底。
  const urlChain = supports('backdrop-filter', 'url(#lens-probe)') || supports('-webkit-backdrop-filter', 'url(#lens-probe)')
  if (/Android/i.test(ua)) return urlChain ? 'static' : 'none'
  if (!/Chrome\/\d+/.test(ua)) return 'none'
  if (!urlChain) return 'none'
  return supports('backdrop-filter', 'blur(1px)') || supports('-webkit-backdrop-filter', 'blur(1px)') ? 'full' : 'none'
}

/** 是否具备 SVG 位移链能力（'full' 与 'static' 都算可用，差异只在挂载时机）。 */
export function liquidLensSupported(): boolean {
  return liquidLensCapability() !== 'none'
}

/**
 * 窄边线 alpha 贴图：B 通道 = 沿圆角矩形轮廓的距离衰减蒙版。
 * inset = 距边缘的向内距离（px，负数 = 玻璃外）：d≈0（贴边）最亮，
 * 向内余弦衰减到 w、向外余弦衰减到 soft。余弦两端导数为 0，过渡无硬边。
 */
function buildLineMap(W: number, H: number, R: number, inner: number, outer: number): string {
  const sdf = makeSdf(W, H, R)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const img = ctx.createImageData(W, H)
  const d = img.data
  const fall = (x: number) => (x <= 0 ? 1 : x >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * x))
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const inset = -sdf(x + 0.5, y + 0.5)
      const a = inset >= 0 ? fall(inset / inner) : fall(-inset / outer)
      const i = (y * W + x) * 4
      d[i] = 128
      d[i + 1] = 128
      d[i + 2] = Math.max(0, Math.min(255, Math.round(a * 255)))
      d[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

/** 圆角矩形 SDF 公共构造（负值 = 内部） */
function makeSdf(W: number, H: number, radius: number) {
  const hx = W / 2
  const hy = H / 2
  const r = Math.min(radius, hx, hy)
  return (x: number, y: number) => {
    const qx = Math.abs(x - hx) - (hx - r)
    const qy = Math.abs(y - hy) - (hy - r)
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
  }
}

/**
 * 按容器实测像素尺寸生成位移贴图 + SVG 滤镜定义。
 * 贴图编码：R 通道 = X 位移、G 通道 = Y 位移（sRGB 中性点 128）。
 * @param line 窄提亮边线链参数；不传或 w<=0 时不挂载该链（链结构与历史逐字节一致，
 *             verify-rim-pixels / probe-bottomnav 护栏不受影响）。
 * @param backdropInset Capture margin outside the visible shape, included in W and H.
 * @returns SVG 片段（含 rim 采集链 + glass 缩放链 [+ line 边线链]），尺寸变化时由调用方重建。
 */
export function buildLiquidLens(
  W: number,
  H: number,
  radius: number,
  prefix: string,
  profile: LensProfile = DEFAULT_LENS_PROFILE,
  line: LineProfile | null = null,
  backdropInset = 0,
): string {
  const { sigma: PRE, scale: M, encode: S, saturate: SAT, specularSlope, specularIntercept, edgeLift = 0, bend, glassSaturate: GSAT, rimSmooth: SMOOTH } = profile
  // 环色交融（仅在 rimSmooth>0 时插入该原语）：沿边方向（x）多糊、跨环方向（y）少糊，
  // 让环上相邻背景色渐变衔接而不是硬切；SMOOTH=0 时链结构与历史逐字节一致（护栏脚本可比对）。
  const smoothPrim = SMOOTH > 0
    ? '<feGaussianBlur in="disp" stdDeviation="' + SMOOTH + ' ' + (SMOOTH * 0.6) + '" result="mix"/>'
    : ''
  const afterDisp = SMOOTH > 0 ? 'mix' : 'disp'
  const WOBBLE = profile.wobble
  // 低频值噪声（固定种子，两次重建纹理一致）：~22px 网格取随机值，双线性 + smoothstep 平滑。
  // 只用于 wobble>0 时给缩放贴图的贴边区叠加细微扭动（液态折射感）。
  const wHash = (x: number, y: number) => {
    let h = (x * 374761393 + y * 668265263 + 987643211) | 0
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
  }
  const WCELL = 22
  const wNoise = (px: number, py: number) => {
    const gx = Math.floor(px / WCELL)
    const gy = Math.floor(py / WCELL)
    const fx = px / WCELL - gx
    const fy = py / WCELL - gy
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    const v00 = wHash(gx, gy)
    const v10 = wHash(gx + 1, gy)
    const v01 = wHash(gx, gy + 1)
    const v11 = wHash(gx + 1, gy + 1)
    return v00 + (v10 - v00) * sx + (v01 - v00) * sy + (v00 - v10 - v01 + v11) * sx * sy
  }
  // 尺寸自适应（小组件安全）：深采 PULL 不越过容器短边（留 4px 余量，防外缘采样点
  // 落到 filter region 外的透明区使环发虚）。大尺寸容器（如 343×64 的 Dock）不受影响，
  // 已验证数值原样保留；小胶囊/按钮会自动收敛采样深度。
  const shapeWidth = W - backdropInset * 2
  const shapeHeight = H - backdropInset * 2
  const PULL = Math.min(profile.pull, Math.max(8, Math.min(shapeWidth, shapeHeight) - 4))
  const BAND = profile.band
  const concaveId = `${prefix}-concave-lens`
  const scaleId = `${prefix}-scale-lens`
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const img = ctx.createImageData(W, H)
  const data = img.data
  const hx = W / 2
  const hy = H / 2
  const r = Math.min(radius, shapeWidth / 2, shapeHeight / 2)
  // 圆角矩形 SDF（负值 = 内部；inset = -sdf 即距边缘的内向距离）
  const sdf = (x: number, y: number) => {
    const qx = Math.abs(x - hx) - (shapeWidth / 2 - r)
    const qy = Math.abs(y - hy) - (shapeHeight / 2 - r)
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
  }
  const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

  // 描边采集贴图：外缘满位移(PULL) → 线性归零于 inset≥band；中部零位移。
  // 2026-09-06 增加沿边切向分量：边中点仍垂直深采，越靠近边角采集方向越斜，
  // 让相邻边的颜色沿圆角“流”进来（例如底部黄色会流向左侧下部），视觉上就是
  // 色带颜色被“拉长”并自然淡出，而不是 strict 点对点垂直采集。
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = x + 0.5
      const py = y + 0.5
      let dx = 0
      let dy = 0
      const inset = -sdf(px, py)
      if (inset < BAND) {
        const t = Math.max(0, 1 - Math.max(inset, 0) / BAND)
        if (t > 0) {
          const pull = PULL * t
          const gx = sdf(px + 1, py) - sdf(px - 1, py)
          const gy = sdf(px, py + 1) - sdf(px, py - 1)
          const gl = Math.hypot(gx, gy) || 1
          const nx = gx / gl
          const ny = gy / gl
          // 内法向（指向容器内部）
          const inX = -nx
          const inY = -ny
          // 切向：沿边指向最近的圆角/端部；边中点 wt=0，圆角处 wt=1
          let wt = 0
          const halfW = hx - r
          const halfH = hy - r
          if (halfW > 0 && halfH > 0) {
            const onH = Math.abs(px - hx) <= halfW // 水平边区域（上下边）
            const onV = Math.abs(py - hy) <= halfH // 垂直边区域（左右边）
            if (onH && onV) {
              // 圆角区域：两个方向都朝外，取最大
              wt = 1
            } else if (onH) {
              wt = Math.min(1, Math.abs(px - hx) / halfW)
            } else if (onV) {
              wt = Math.min(1, Math.abs(py - hy) / halfH)
            }
          }
          const tanRatio = 0.6 * wt
          // 切向候选两个方向，选指向最近角落的那个
          const cx = Math.sign(px - hx) || 1
          const cy = Math.sign(py - hy) || 1
          let tx = -ny
          let ty = nx
          if (tx * cx + ty * cy < 0) { tx = -tx; ty = -ty }
          // 混合法向+切向并归一化
          let dirX = inX + tx * tanRatio
          let dirY = inY + ty * tanRatio
          const dlen = Math.hypot(dirX, dirY) || 1
          dirX /= dlen
          dirY /= dlen
          dx = dirX * pull
          dy = dirY * pull
        }
      }
      const i = (y * W + x) * 4
      data[i] = clamp255(Math.round(128 + (dx / S) * 255))
      data[i + 1] = clamp255(Math.round(128 + (dy / S) * 255))
      data[i + 2] = 128
      data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const uri = canvas.toDataURL('image/png')

  // The unified material bends neighboring pixels through a thin curved lip.
  // Its center stays undisplaced; a clipped backdrop samples inward so the lip
  // does not look beyond the captured area at the rounded ends.
  const unified = profile.refractiveEdge === true
  const RANGE = unified ? Math.min(BAND, Math.min(shapeWidth, shapeHeight) / 2) : 40
  // Sampling distance and visible lip width are independent: a thin lip can bend farther.
  const edgePull = Math.min(PULL, Math.min(shapeWidth, shapeHeight) / 2)
  const endPull = unified ? Math.min(Math.max(8, profile.endPull ?? edgePull), Math.min(shapeWidth, shapeHeight) / 2) : edgePull
  // 2026-09-27 站长口径：左右（圆角端）要比上下（直线边）**收** —— 原先这里钳成 Math.max(RANGE, …)，
  // 导致端部只能更宽、表达不出"左右收窄"。现在允许 endBand < RANGE（下钳 6px），端部唇比直线边窄。
  const endBand = unified ? Math.min(Math.max(6, profile.endBand ?? RANGE), Math.min(shapeWidth, shapeHeight) / 2) : RANGE
  const endReach = Math.max(0, profile.endReach ?? 0)
  const hasEndLip = unified && endReach > 0 && (endPull !== edgePull || endBand !== RANGE)
  // 编码基数必须取"所有边里的最大采样距离"，否则直线边位移过大会被钳在 255（实测上边差 3.9px）
  const maxEdgePull = hasEndLip ? Math.max(edgePull, endPull) : edgePull
  const glassEncode = unified ? Math.max(8, maxEdgePull * 2 + 2) : 32
  const endWeightAtX = (px: number) => {
    if (!hasEndLip) return 0
    const sideDistance = Math.min(px - backdropInset, W - backdropInset - px)
    const fade = Math.min(1, Math.max(0, (sideDistance - r) / endReach))
    return 1 - fade * fade * (3 - 2 * fade)
  }
  const endWeightAt = (px: number, py: number) => {
    const horizontalWeight = endWeightAtX(px)
    if (!profile.localEndArc || horizontalWeight === 0) return horizontalWeight
    const gx = sdf(px + 1, py) - sdf(px - 1, py)
    const gy = sdf(px, py + 1) - sdf(px, py - 1)
    return horizontalWeight * Math.abs(gx) / (Math.hypot(gx, gy) || 1)
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = x + 0.5
      const py = y + 0.5
      const inset = -sdf(px, py)
      const endWeight = endWeightAt(px, py)
      let shoulder = 0
      if (unified && profile.cornerShoulderBand && endWeight > 0) {
        const gx = sdf(px + 1, py) - sdf(px - 1, py)
        const gy = sdf(px, py + 1) - sdf(px, py - 1)
        shoulder = Math.max(0, profile.cornerShoulderBand) * endWeight
          * Math.max(0, Math.min(1, 4 * Math.abs(gx * gy) / (gx * gx + gy * gy || 1) - 0.15))
      }
      const localRange = RANGE + (endBand - RANGE) * endWeight + shoulder
      const localPull = edgePull + (endPull - edgePull) * endWeight
      const t = Math.max(0, 1 - Math.max(inset, 0) / localRange)
      let dx = 0
      let dy = 0
      if (t > 0) {
        // Only an extended capture can sample outside the contour.
        const gx = sdf(px + 1, py) - sdf(px - 1, py)
        const gy = sdf(px, py + 1) - sdf(px, py - 1)
        const gl = Math.hypot(gx, gy) || 1
        const curve = unified ? t * t * (3 - 2 * t) : t
        const localBend = unified && profile.straightBend != null
          ? profile.straightBend + (bend - profile.straightBend) * endWeight
          : bend
        const pull = (unified ? localPull : M * RANGE) * Math.pow(curve, localBend)
        // 液态扭动：低频噪声按 t 加权（只扭贴边区，中部保持干净）
        const wobX = WOBBLE > 0 ? (wNoise(px, py) - 0.5) * 2 * WOBBLE * t : 0
        const wobY = WOBBLE > 0 ? (wNoise(px + 512, py + 512) - 0.5) * 2 * WOBBLE * t : 0
        const direction = unified && profile.captureOutside !== false ? 1 : -1
        dx = direction * (gx / gl) * pull + wobX
        dy = direction * (gy / gl) * pull + wobY
      }
      const i = (y * W + x) * 4
      data[i] = clamp255(Math.round(128 + (dx / glassEncode) * 255))
      data[i + 1] = clamp255(Math.round(128 + (dy / glassEncode) * 255))
      // Blue is unused by displacement; it carries the edge-lighting weight.
      data[i + 2] = unified ? Math.round(t * t * (3 - 2 * t) * 255) : 128
      data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const scaleUri = canvas.toDataURL('image/png')
  const endMaskUri = hasEndLip && profile.localizeEndColor
    ? (() => {
        const mask = ctx.createImageData(W, H)
        for (let x = 0; x < W; x++) {
          for (let y = 0; y < H; y++) {
            const i = (y * W + x) * 4
            mask.data[i] = 255
            mask.data[i + 1] = 255
            mask.data[i + 2] = 255
            mask.data[i + 3] = Math.round(endWeightAt(x + 0.5, y + 0.5) * 255)
          }
        }
        ctx.putImageData(mask, 0, 0)
        return canvas.toDataURL('image/png')
      })()
    : null

  // 过滤器采样区向外 padding：链内 blur(σ / profile.blur) 需向矩形外扩展采样才能真正
  // 渲染边缘模糊。此前 x/y=0、宽高=W/H 时，元素最顶部/四边正好落在采样区边界，取不到
  // 矩形外的背景 → 边缘"由模糊变清晰"（顶部贴顶的导航栏最明显）。
  const pad = Math.ceil(Math.max(PRE, profile.blur) * (unified ? 3 : 2) + (unified ? maxEdgePull : 0)) + 2
  const gx = -pad
  const gy = -pad
  const gw = W + pad * 2
  const gh = H + pad * 2
  // 折射带亮度**跟内容走**（2026-09-27 站长：参考里亮边沿边衰减，本站却是一圈均匀亮）。
  // edgeLift 不再直接当 gamma offset，而是乘上"采样亮度"掩码后叠加 → 内容暗处自动衰减。
  const slitNode = edgeLift > 0 ? 'slitLit' : 'slit'
  const spreadBlend = profile.edgeHighlightMode ? 'lighten' : 'darken'
  const spreadMix = profile.edgeSpreadMix == null ? null : Math.max(0, Math.min(1, profile.edgeSpreadMix))
  const blendSpread = (spread: string, result: string, local = 'sedgeLocal') => spreadMix == null
    ? `<feBlend in="${local}" in2="${spread}" mode="${spreadBlend}" result="${result}"/>`
    : `<feComposite in="${local}" in2="${spread}" operator="arithmetic" k1="0" k2="${1 - spreadMix}" k3="${spreadMix}" k4="0" result="${result}"/>`
  // Preserve the dark backdrop and weak blur tails; only sampled mid/highlights gain light.
  const edgeTransfer = ['R', 'G', 'B'].map(channel => profile.edgeHighlightMode
    ? `<feFunc${channel} type="table" tableValues="0 0.125 0.3 0.55 0.76 0.9 0.98 1 1"/>`
    : `<feFunc${channel} type="gamma" amplitude="1" exponent="${1 / Math.max(1, specularSlope)}" offset="0"/>`).join('')

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">` +
    `<filter id="${concaveId}" filterUnits="userSpaceOnUse" x="${gx}" y="${gy}" width="${gw}" height="${gh}" color-interpolation-filters="sRGB">` +
    `<feImage href="${uri}" x="0" y="0" width="${W}" height="${H}" result="map" preserveAspectRatio="none"/>` +
    `<feGaussianBlur in="SourceGraphic" stdDeviation="${PRE}" result="pre"/>` +
    `<feDisplacementMap in="pre" in2="map" scale="${S}" xChannelSelector="R" yChannelSelector="G" result="disp"/>` +
    smoothPrim +
    `<feColorMatrix in="${afterDisp}" type="saturate" values="${SAT}"/>` +
    `<feComponentTransfer><feFuncR type="linear" slope="${specularSlope}" intercept="${specularIntercept}"/><feFuncG type="linear" slope="${specularSlope}" intercept="${specularIntercept}"/><feFuncB type="linear" slope="${specularSlope}" intercept="${specularIntercept}"/></feComponentTransfer>` +
    `</filter>` +
    `<filter id="${scaleId}" filterUnits="userSpaceOnUse" x="${gx}" y="${gy}" width="${gw}" height="${gh}" color-interpolation-filters="sRGB">` +
    `<feImage href="${scaleUri}" x="0" y="0" width="${W}" height="${H}" result="smap" preserveAspectRatio="none"/>` +
    (unified
      ? `<feGaussianBlur in="SourceGraphic" stdDeviation="${profile.blur}" result="sblur"/>` +
        `<feColorMatrix in="sblur" type="saturate" values="${GSAT}" result="sbase"/>` +
        // Keep the nearby color while spreading its blurred hue along the capsule ends.
        (profile.edgeColorSpreadY && profile.edgeColorSpreadY > PRE
          ? `<feGaussianBlur in="SourceGraphic" stdDeviation="${profile.straightEdgeSigma ?? PRE}" result="sedgeLocal"/>` +
            `<feGaussianBlur in="SourceGraphic" stdDeviation="${profile.edgeColorSpreadX ?? PRE} ${profile.edgeColorSpreadY}" result="sedgeSpread"/>` +
            `<feComponentTransfer in="sedgeSpread" result="sedgeSpreadTone"><feFuncR type="gamma" amplitude="1" exponent="${Math.max(1, profile.edgeColorSpreadGamma ?? 1)}" offset="0"/><feFuncG type="gamma" amplitude="1" exponent="${Math.max(1, profile.edgeColorSpreadGamma ?? 1)}" offset="0"/><feFuncB type="gamma" amplitude="1" exponent="${Math.max(1, profile.edgeColorSpreadGamma ?? 1)}" offset="0"/></feComponentTransfer>` +
            blendSpread('sedgeSpreadTone', endMaskUri ? 'sedgeWide' : 'sedgeBlur') +
            (endMaskUri
              ? (profile.straightEdgeSigma == null ? '' : `<feGaussianBlur in="SourceGraphic" stdDeviation="${PRE}" result="sedgeEndLocal"/>`) +
                `<feGaussianBlur in="SourceGraphic" stdDeviation="${profile.endColorSpreadX ?? PRE} ${profile.endColorSpreadY ?? PRE}" result="sedgeEndSpread"/>` +
                `<feComponentTransfer in="sedgeEndSpread" result="sedgeEndTone"><feFuncR type="gamma" amplitude="1" exponent="${Math.max(1, profile.edgeColorSpreadGamma ?? 1)}" offset="0"/><feFuncG type="gamma" amplitude="1" exponent="${Math.max(1, profile.edgeColorSpreadGamma ?? 1)}" offset="0"/><feFuncB type="gamma" amplitude="1" exponent="${Math.max(1, profile.edgeColorSpreadGamma ?? 1)}" offset="0"/></feComponentTransfer>` +
                blendSpread('sedgeEndTone', 'sedgeEndColor', profile.straightEdgeSigma == null ? 'sedgeLocal' : 'sedgeEndLocal') +
                `<feImage href="${endMaskUri}" x="0" y="0" width="${W}" height="${H}" result="sendMask" preserveAspectRatio="none"/>` +
                `<feComposite in="sedgeEndColor" in2="sendMask" operator="in" result="sedgeEnd"/>` +
                `<feComposite in="sedgeWide" in2="sendMask" operator="out" result="sedgeMid"/>` +
                `<feComposite in="sedgeEnd" in2="sedgeMid" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="sedgeBlur"/>`
              : '')
          : `<feGaussianBlur in="SourceGraphic" stdDeviation="${PRE}" result="sedgeBlur"/>`) +
        `<feDisplacementMap in="sedgeBlur" in2="smap" scale="${glassEncode}" xChannelSelector="R" yChannelSelector="G" result="sdisp"/>` +
        // Preserve the blurred backdrop hue while keeping pale colors below pure white.
        `<feColorMatrix in="sdisp" type="saturate" values="${SAT}" result="sedgeColor"/>` +
        `<feComponentTransfer in="sedgeColor" result="slit">${edgeTransfer}</feComponentTransfer>` +
        (edgeLift > 0
          ? `<feColorMatrix in="sedgeColor" type="luminanceToAlpha" result="slitLum"/>` +
            `<feComponentTransfer in="slitLum" result="slitLumSoft"><feFuncA type="gamma" amplitude="1" exponent="0.5" offset="0"/></feComponentTransfer>` +
            `<feFlood flood-color="#ffffff" flood-opacity="${edgeLift}" result="slitLiftSolid"/>` +
            `<feComposite in="slitLiftSolid" in2="slitLumSoft" operator="in" result="slitLift"/>` +
            `<feComposite in="slit" in2="slitLift" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="slitLit"/>`
          : '') +
        `<feColorMatrix in="smap" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0" result="sedge"/>` +
        `<feComposite in="${slitNode}" in2="sedge" operator="in" result="slitEdge"/>` +
        `<feComposite in="sbase" in2="sedge" operator="out" result="sbody"/>` +
        `<feComposite in="slitEdge" in2="sbody" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/>`
      : `<feDisplacementMap in="SourceGraphic" in2="smap" scale="32" xChannelSelector="R" yChannelSelector="G" result="sdisp"/>` +
        `<feGaussianBlur in="sdisp" stdDeviation="${profile.blur}" result="ssoft"/>` +
        `<feColorMatrix in="ssoft" type="saturate" values="${GSAT}"/>`) +
    `</filter>` +
    (line && line.w > 0
      ? (() => {
          const lineUri = buildLineMap(W, H, radius, line.w, Math.max(0.5, line.soft))
          return (
            `<filter id="${prefix}-line-lens" filterUnits="userSpaceOnUse" x="${gx}" y="${gy}" width="${gw}" height="${gh}" color-interpolation-filters="sRGB">` +
            `<feGaussianBlur in="SourceGraphic" stdDeviation="0.4" result="lpre"/>` +
            `<feColorMatrix in="lpre" type="saturate" values="${line.sat}" result="lsat"/>` +
            `<feComponentTransfer in="lsat" result="llit">` +
            `<feFuncR type="linear" slope="${line.bright}" intercept="0"/><feFuncG type="linear" slope="${line.bright}" intercept="0"/><feFuncB type="linear" slope="${line.bright}" intercept="0"/>` +
            `<feFuncA type="linear" slope="1" intercept="0"/></feComponentTransfer>` +
            `<feImage href="${lineUri}" x="0" y="0" width="${W}" height="${H}" result="lmap" preserveAspectRatio="none"/>` +
            `<feColorMatrix in="lmap" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0" result="lmask"/>` +
            `<feComposite in="llit" in2="lmask" operator="in"/>` +
            `</filter>`
          )
        })()
      : '') +
    `</svg>`
  )
}

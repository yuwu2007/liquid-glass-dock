import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react'
import './liquid.css'
import { buildLiquidLens, liquidLensSupported, liquidLensCapability, DEFAULT_LENS_PROFILE, DARK_LENS_PROFILE } from './buildLiquidLens'
import type { LensProfile, LineProfile } from './buildLiquidLens'
import { buildCachedLiquidLens } from './liquidLensCache'

/** 液态玻璃效果容器：玻璃本体（可选透镜）+ 可选"采集色描边环"。
 *  任意元素（导航栏/胶囊按钮/顶栏搜索条…）包一层即可获得同款效果。
 *  效果仅 Chromium 渐进启用，其余环境自动落到默认玻璃（blur4+saturate200）。
 *
 *  套用示例（业务组件只需包一层，无需调参）：
 *    <LiquidSurface rootClassName="fixed bottom-4 left-1/2 -translate-x-1/2 z-50"
 *                   className="flex items-center gap-2 px-4 h-12">
 *      {children}
 *    </LiquidSurface>
 *  - rootClassName：最外层定位/尺寸（决定玻璃矩形与 rim 对齐）；className：玻璃本体布局；
 *  - 小尺寸组件（胶囊/按钮）同样安全：深采位移按容器短边自动收敛（见 buildLiquidLens），
 *    band 也会自动兜底 ≥ ringWidth，不会出现"环消失"；
 *  - ringWidth={0} 关闭描边及透镜；底栏预设位于 dockLensProfile.ts。 */
export interface LiquidSurfaceProps extends Omit<HTMLAttributes<HTMLElement>, 'className' | 'style' | 'children'> {
  /** 渲染为哪种元素，默认 div（导航传 'nav'，按钮传 'button' 等） */
  as?: 'div' | 'nav' | 'section' | 'aside' | 'header' | 'footer' | 'button' | 'span'
  /** 最外层定位容器类名（与玻璃同矩形，rim 垫底于其内） */
  rootClassName?: string
  /** 玻璃本体类名（默认 glass-dock，效果包已内置样式） */
  className?: string
  /** 玻璃本体额外内联样式 */
  style?: CSSProperties
  children?: ReactNode
  /** 圆角：'capsule'=跟随实测高度自动取 h/2（无竖直线段），或指定像素数 */
  radius?: number | 'capsule'
  /** 采集色描边环宽（px），0 = 关闭采集环、仅玻璃。默认 14 */
  ringWidth?: number
  /** 透镜调参覆盖；不传时使用 buildLiquidLens 的通用默认值 */
  profile?: Partial<LensProfile>
  /** 仅深色主题生效的调参覆盖，叠在 profile 之上（浅色行为不受影响）。
   *  底栏深色改版（2026-09-22 调参台导出、对标华为运动健康）用它注入深色专属数值。 */
  darkProfile?: Partial<LensProfile>
  /** 'auto'=Chromium 才启用位移透镜；false 强制只用默认玻璃 */
  enableLens?: 'auto' | boolean
  /** 短暂挂载的弹窗复用相同尺寸的静态贴图；导航等常驻容器保持原路径。 */
  cacheLens?: boolean
  /** 滤镜 id 前缀；不传自动生成唯一前缀（同页多实例互不冲突）。可传固定值便于测试 */
  lensPrefix?: string
  /** 'concave'=SVG 位移采色环（默认，适合底部导航等稳定区域，取色最深）；
   *  'plain'=原生 backdrop-filter 薄采样（垫底取背景真色、无 SVG 逐帧重采样，
   *  适合顶部全宽 + 内容高频滚动穿越的场景，避免闪烁）。仅在 ringWidth>0 时生效。 */
  rimMode?: 'concave' | 'plain'
  /** 描边环额外类名；默认 'dock-rim'。可用于只显示部分边缘的剪裁（如顶部导航栏仅底部一条） */
  rimClassName?: string
  /** 窄提亮边线（华为"细亮边"）：贴边最亮、沿轮廓余弦衰减的彩色光带，
   *  颜色取自背后内容、brightness 提亮。传 { w, soft, bright, sat } 挂载第三条滤镜链，
   *  w=0 或不传 = 不挂载（链结构与历史一致）。画在玻璃之上。 */
  rimLine?: LineProfile
  /** 玻璃压暗基色层不透明度（0~0.9）：深色=暗色 tint、浅色=亮灰 tint（×0.6），
   *  让玻璃体发暗、取色只在边缘与光带处"咬"出来（对标华为深色底栏的关键层）。
   *  不传 = 全透明（历史行为，顶栏等实例不受影响）。 */
  tint?: number
  /** Optional dark-only tint opacity; keeps pale refracted content from being covered. */
  tintDarkOpacity?: number
  /** 深色主题下压暗基色的 RGB 三元组（默认 '38, 40, 44'）。
   *  底栏 2026-09-23 全套套用调参台华为风时传 '9, 10, 13'（调参台 .glass 的底色，
   *  比默认更黑、玻璃体发暗更彻底）；不传保持历史行为，其他实例不受影响。 */
  tintDark?: string
  /** 描边环作为覆盖层渲染在玻璃之上（默认垫底）。顶栏等需要色环保留真实背景色、
   *  不被玻璃本体 blur 二次覆盖时开启 */
  rimOverlay?: boolean
}

let autoInstance = 0

/**
 * 'static' 环境滚动策略（2026-09-18 新增）—— 三种取值：
 *
 *   'always' 玻璃折射链 + 色环深采链都常驻 → **滚动中就是完整效果**（当前默认）
 *            ⚠️ 默认值原为 'glass'，站长实测后反馈「色环只有界面停下来才显现」→ 改为 'always'。
 *            注意：上一次（13:xx 前）只让色环常驻、玻璃仍降级，观感是"环突兀地变大"被否；
 *            这次是**两者一起常驻**，才是一整套一致的观感。
 *   'glass'  只让玻璃折射链常驻，色环随滚动降级（滚动中色环偏淡）
 *   'auto'   两者都随滚动降级 = 2026-09-18 之前的老行为（效果只在停下后出现）
 *
 * 想切换不用改代码：URL 带 `?lens=always|glass|auto` 即可（真机即时对比）。
 * ⚠️ 若真机出现掉帧 / 玻璃边缘 1px 黑线，把 DEFAULT_LENS_SCROLL_POLICY 改回 'auto'。
 */
type LensScrollPolicy = 'auto' | 'glass' | 'always'
const DEFAULT_LENS_SCROLL_POLICY: LensScrollPolicy = 'always'

function readLensScrollPolicy(): LensScrollPolicy {
  if (typeof window === 'undefined') return DEFAULT_LENS_SCROLL_POLICY
  try {
    const v = new URLSearchParams(window.location.search).get('lens')
    if (v === 'auto' || v === 'glass' || v === 'always') return v
  } catch {
    /* 取不到就用默认 */
  }
  return DEFAULT_LENS_SCROLL_POLICY
}

/**
 * 玻璃磨砂程度临时覆盖：`?lensBlur=4~20`（stdDeviation，越大越糊）。
 * 用途：站长在真机上把模糊调到满意，再把这个数写回 DEFAULT_LENS_PROFILE.blur。
 * ⚠️ 只影响「走位移链的玻璃」（底栏这种 scale>0 的）；顶栏/我的活动页是 scale=0 +
 * 自己 inline 的 blur(5px)，不受此参数影响。
 */
function readBlurOverride(): number | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = new URLSearchParams(window.location.search).get('lensBlur')
    if (raw == null) return null
    const v = Number(raw)
    if (Number.isFinite(v) && v > 0) return Math.min(20, Math.max(1, v))
  } catch {
    /* ignore */
  }
  return null
}

export default function LiquidSurface({
  as = 'div',
  rootClassName = '',
  className = '',
  style,
  children,
  radius: radiusProp = 'capsule',
  ringWidth = 14,
  profile,
  darkProfile,
  tintDarkOpacity,
  enableLens = 'auto',
  cacheLens = false,
  lensPrefix,
  rimMode = 'concave',
  rimClassName,
  rimLine,
  tint,
  tintDark,
  rimOverlay = false,
  ...rest
}: LiquidSurfaceProps) {
  const Tag = as as ElementType
  const surfaceRef = useRef<HTMLElement | null>(null)
  const reactId = useId()
  // 渲染期只生成一次：避免自增计数器进 effect 依赖导致无限重渲染
  const idBaseRef = useRef<string | null>(null)
  if (idBaseRef.current === null) {
    idBaseRef.current = lensPrefix || `lq${reactId.replace(/[^a-zA-Z0-9]/g, '')}${++autoInstance}`
  }
  const idBase = idBaseRef.current

  // 实测后的圆角（capsule=容器高/2）与透镜开关状态
  const [radiusPx, setRadiusPx] = useState<number | null>(null)
  const [lens, setLens] = useState({ on: false, svg: '', padding: 0 })
  // 滚动期间临时卸下透镜（仅 'static' 环境用），见下方滚动监听
  const [lensPaused, setLensPaused] = useState(false)
  // 环境能力只探测一次（UA 不会在会话中变）：'full' 桌面 / 'static' Android·微信 / 'none' iOS
  const capabilityRef = useRef<'full' | 'static' | 'none' | null>(null)
  if (capabilityRef.current === null) capabilityRef.current = liquidLensCapability()
  const capability = capabilityRef.current
  // 滚动策略只读一次（URL 参数：?lens=glass|always|auto）
  const scrollPolicyRef = useRef<LensScrollPolicy | null>(null)
  if (scrollPolicyRef.current === null) scrollPolicyRef.current = readLensScrollPolicy()
  const scrollPolicy = scrollPolicyRef.current
  // 模糊度临时覆盖（URL 参数：?lensBlur=4~20），同样只读一次；避免与图片引擎的 blur 参数冲突
  const blurRef = useRef<number | null | undefined>(undefined)
  if (blurRef.current === undefined) blurRef.current = readBlurOverride()
  const blurOverride = blurRef.current
  // 跟随主题选择透镜调参：深色下 rim 链的 saturate+specular 会把深灰底蓝通道放大成"蓝色圈"，
  // 因此深色用 DARK_LENS_PROFILE（specular 压回 ~1.0/0.03）贴近暗色，浅色沿用默认。buildLiquidLens 会再叠加 profile 覆盖。
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false
  )

  useLayoutEffect(() => {
    const onTheme = () => setIsDark(document.documentElement.classList.contains('dark'))
    const mo = new MutationObserver(onTheme)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [])

  useLayoutEffect(() => {
    const surf = surfaceRef.current
    if (!surf) return
    const supported = enableLens === 'auto' ? liquidLensSupported() : enableLens === true
    let raf = 0

    const build = () => {
      raf = 0
      // 用 offsetWidth/offsetHeight（布局尺寸，免疫祖先 transform）：
      // getBoundingClientRect 会把浮层入场动画 detail-zoom 的 scale(0.9→1) 计入测量，
      // 使位移贴图/滤镜区域比玻璃本体窄 ~10% 且不再重测（ResizeObserver 不监听 transform），
      // 玻璃右/下缘会露出一条未经过滤的"断层条"（saturate 差异呈现为深蓝色带）。
      const W = Math.round(surf.offsetWidth)
      const H = Math.round(surf.offsetHeight)
      if (W < 60 || H < 20) return
      // 胶囊圆角 = 实测高/2（玻璃本体与 rim 共用，透镜贴图半径同步）
      const R = radiusProp === 'capsule' ? Math.max(1, Math.round(H / 2)) : (radiusProp ?? 0)
      setRadiusPx(R)
      if (!supported || ringWidth <= 0) {
        setLens({ on: false, svg: '', padding: 0 })
        return
      }
      // 深色用暗色 profile（类自动切换），浅色用默认；显式传入的 profile 恒优先。
      // band 自动兜底 ≥ ringWidth：采样窗窄于环宽时环会消失（buildLiquidLens 的硬约束），
      // 使用者只调 ringWidth 也能得到合法参数。
      const base = isDark ? DARK_LENS_PROFILE : DEFAULT_LENS_PROFILE
      // 合并顺序：基底 < profile（两主题通用）< darkProfile（仅深色）——
      // 底栏 2026-09-22 深色改版以此注入调参台导出值，浅色行为逐字节保持线上原样。
      const merged = { ...base, ...profile, ...(isDark ? darkProfile : null) }
      // 模糊度临时覆盖（真机调参用，见 readBlurOverride）
      if (blurOverride != null) merged.blur = blurOverride
      if (ringWidth > 0) merged.band = Math.max(merged.band, ringWidth)
      // 窄边线链仅在使用者显式传 rimLine 时挂载（w<=0 视为关闭），不传则链结构与历史逐字节一致
      // Capture neighboring pixels before clipping the lens to the visible capsule.
      // ⚠️ captureOutside:false（底栏 2026-09-27 起）→ padding=0：采样区不外扩，
      //    边缘只弯曲栏后内容。原因见 LensProfile.captureOutside 的注释。
      const padding = merged.refractiveEdge && merged.captureOutside !== false
        ? Math.ceil(Math.min(merged.pull, Math.min(W, H) / 2) + 3 * Math.max(merged.sigma, merged.blur))
        : 0
      const builder = cacheLens ? buildCachedLiquidLens : buildLiquidLens
      const svg = builder(W + padding * 2, H + padding * 2, R, idBase, merged,
        !merged.refractiveEdge && rimLine && rimLine.w > 0 ? rimLine : null, padding)
      if (!svg) {
        setLens({ on: false, svg: '', padding: 0 })
        return
      }
      setLens(previous => previous.on && previous.svg === svg && previous.padding === padding
        ? previous : { on: true, svg, padding })
    }
    const scheduleBuild = () => { if (!raf) raf = requestAnimationFrame(build) }
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleBuild)
    ro?.observe(surf)
    if (!ro) window.addEventListener('resize', scheduleBuild)
    build()
    return () => {
      ro?.disconnect()
      if (!ro) window.removeEventListener('resize', scheduleBuild)
      if (raf) cancelAnimationFrame(raf)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ringWidth, radiusProp, enableLens, cacheLens, idBase, isDark, profile, darkProfile, blurOverride, rimLine])

  /**
   * 'static' 环境（Android 全系 / 微信 X5·XWeb）的滚动降级。
   *
   * ⚠️ **站长「一滑动完整效果就消失、停下才出现」的症状就是这里**（2026-09-18 复核）：
   * 降级时整条 SVG 透镜链被卸下 → 玻璃本体退回 .glass-dock 的原生 `blur(4px) saturate(150%)`
   * （**折射/弯曲没了**）、色环退回 plain 采样、羽化也去掉；停下 260ms 再整条挂回。
   * 降级存在的原因：位移链在部分 Android WebView 上走软件光栅化，滚动中逐帧重采样
   * 可能掉帧、并在玻璃边缘闪 1px 黑线（历史事故，见 liquid.css 的注释）。
   *
   * 按 scrollPolicy 决定谁参与暂停（见文件头的 policy 说明）：
   *   'auto'   → 玻璃 + 色环都随滚动降级（最省，老行为，可能牺牲观感）
   *   'glass'  → **玻璃折射链不降级**（默认），滚动中保留完整折射；色环仍降级
   *   'always' → 两者都不降级（此分支连监听都不挂，零开销）
   * 桌面 'full' 不参与暂停，行为与以前完全一致。
   */
  useLayoutEffect(() => {
    if (!lens.on || capability !== 'static' || scrollPolicy === 'always') return
    let timer = 0
    const pause = () => {
      setLensPaused(true)
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => setLensPaused(false), 260)
    }
    window.addEventListener('scroll', pause, true)
    window.addEventListener('touchmove', pause, { passive: true })
    window.addEventListener('wheel', pause, { passive: true })
    return () => {
      if (timer) window.clearTimeout(timer)
      window.removeEventListener('scroll', pause, true)
      window.removeEventListener('touchmove', pause)
      window.removeEventListener('wheel', pause)
    }
  }, [lens.on, capability, scrollPolicy])

  // 两个开关分开算：谁参与滚动降级由 scrollPolicy 决定（2026-09-18）。
  //   glassActive = 玻璃本体的折射链（scale-lens）—— 默认不参与降级 ⇒ 滚动中折射仍在
  //   rimActive   = 色环的深采链（concave-lens）—— 默认仍随滚动降级（保留站长认可的偏淡观感）
  const glassActive = lens.on && (scrollPolicy !== 'auto' || !lensPaused)
  const rimActive = lens.on && (scrollPolicy === 'always' || !lensPaused)
  const concaveFilter = rimActive ? `url(#${idBase}-concave-lens)` : ''
  const scaleFilter = glassActive ? `url(#${idBase}-scale-lens)` : ''
  // plain 色环：原生 backdrop-filter 垫底采样背景真色；提高饱和+对比让色带
  // 比上方玻璃模糊区更浓郁鲜艳 → 取色可辨。无 SVG 逐帧重采样，滚动稳定不闪。
  const plainRimFilter = 'blur(0.6px) saturate(2.6) contrast(1.2)'
  // 主玻璃是否需要位移缩放链：scale>0（真折射）才用透镜链覆盖玻璃本体；
  // scale=0 时玻璃本体保留普通 backdrop-filter（blur+saturate），全矩形成型模糊，
  // rim 仅负责底部采集色环，避免整块玻璃因被 scale-lens 覆盖而缺失模糊。
  const activeProfile = { ...profile, ...(isDark ? darkProfile : null) }
  const scaleVal = activeProfile.scale ?? DEFAULT_LENS_PROFILE.scale
  const useScaleOnGlass = glassActive && scaleVal > 0
  const unifiedGlass = useScaleOnGlass && activeProfile.refractiveEdge === true
  // 色环挂载：只要 ringWidth>0 就画。
  // ⚠️ 透镜不可用时（或滚动中临时卸下时）**不要整体跳过色环**，而是降级为 plain 原生采样环 ——
  // 只做「原生 backdrop-filter 采样 + CSS mask 挖环」，不含 SVG 位移链（黑线真正根因）。
  // 历史上曾为消黑线连色环一起砍掉，结果手机端底部导航只剩一块平玻璃：
  // 边缘不再随背景采色（"色换"消失）、折射也一并没了。传 rimMode='concave' 只代表「优先透镜」。
  const lensDown = !rimActive
  const effectiveRimMode: 'concave' | 'plain' = rimActive ? rimMode : 'plain'
  // The unified lens already bends and lights the edge from the page backdrop.
  const showRim = ringWidth > 0 && !unifiedGlass
  const rimFilter = effectiveRimMode === 'plain' ? plainRimFilter : (rimActive ? concaveFilter : '')

  // 降级路径刻意保持最简合成层：去掉 .dock-rim 的 filter 羽化（blur(0.8px)），
  // 少一层 filter 就少一次软件合成，Android WebView 上不会再闪 1px 黑线；
  // 有透镜的桌面 Chromium 不受影响、继续保留羽化。
  // ⚠️ 判据是「色环自己是否降级」（rimActive），与玻璃是否降级无关 —— 默认策略下
  // 玻璃不降级而色环降级，这里仍应去掉羽化（色环确实在走降级采样）。
  const rimDownStyle: CSSProperties = lensDown ? { filter: 'none', WebkitFilter: 'none' } : {}

  const surfStyle: CSSProperties = { ...style }
  if (radiusPx != null) surfStyle.borderRadius = radiusPx
  // 压暗基色层（华为深色底栏的"玻璃体发暗"）：深色=暗 tint、浅色=亮灰 tint（×0.6）
  if (tint != null && tint > 0) {
    surfStyle.background = isDark
      ? `rgba(${tintDark ?? '38, 40, 44'}, ${Math.max(0, Math.min(0.9, tintDarkOpacity ?? tint))})`
      : `rgba(244, 245, 248, ${Math.min(0.9, tint * 0.6)})`
  }
  // 透镜生效时玻璃本体换用位移缩放链（覆盖 .glass-dock 默认 blur/saturate）
  if (glassActive && scaleFilter && useScaleOnGlass) {
    surfStyle.WebkitBackdropFilter = unifiedGlass ? 'none' : scaleFilter
    surfStyle.backdropFilter = unifiedGlass ? 'none' : scaleFilter
  }

  // 兜底档（iOS / X5 / 内核不支持位移链）：inline 覆盖掉调用方传的 blur(3px)，
  // 否则 CSS 里的加厚兜底会被 inline style 顶掉，看起来还是一层薄雾。
  if (!lens.on) {
    const fb = isDark ? 'blur(18px) saturate(160%) brightness(0.94)' : 'blur(16px) saturate(180%) brightness(1.04)'
    surfStyle.WebkitBackdropFilter = fb
    surfStyle.backdropFilter = fb
  }

  // 窄提亮边线：画在玻璃之上；挂载判据与色环的滚动降级一致（rimActive），
  // static 环境滚动中同步卸下，避免 WebView 逐帧重采样掉帧。
  const lineFilter = rimActive && !unifiedGlass ? `url(#${idBase}-line-lens)` : ''

  return (
    // 诊断用：lens=on 才是真折射；off 说明当前浏览器拿不到 SVG 位移链（iOS/FF/Safari），
    // 此时 CSS 会切到「加厚兜底」以免退化成一层薄雾。见 liquid.css 的 [data-lens="off"]。
    <div
      className={rootClassName}
      data-liquid-surface
      data-lens={lens.on ? 'on' : 'off'}
      data-lens-capability={liquidLensCapability()}
    >
      {/* 垫底兄弟：采集色描边环（默认必须在 glass 之前、同矩形；覆盖层模式则画在玻璃之上，
          不被玻璃本体 blur 二次覆盖，保留真实背景取色。仅 Chromium + ringWidth>0 时挂载） */}
      {Boolean(!rimOverlay && showRim) && (
        <span
          className={`dock-rim ${rimClassName ?? ''}`.trim()}
          aria-hidden="true"
          style={{
            padding: ringWidth,
            borderRadius: radiusPx ?? 0,
            WebkitBackdropFilter: rimFilter,
            backdropFilter: rimFilter,
            ...rimDownStyle,
          }}
        />
      )}
      {unifiedGlass && (
        <span
          className="dock-refractive-backdrop"
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: -lens.padding,
            pointerEvents: 'none',
            clipPath: `inset(${lens.padding}px round ${radiusPx ?? 0}px)`,
            WebkitBackdropFilter: scaleFilter,
            backdropFilter: scaleFilter,
          }}
        />
      )}
      <Tag
        ref={surfaceRef}
        className={`glass-dock ${className}`.trim()}
        style={surfStyle}
        {...rest}
      >
        {children}
      </Tag>
      {Boolean(rimOverlay && showRim) && (
        <span
          className={`dock-rim ${rimClassName ?? ''}`.trim()}
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            padding: ringWidth,
            borderRadius: radiusPx ?? 0,
            WebkitBackdropFilter: rimFilter,
            backdropFilter: rimFilter,
            ...rimDownStyle,
          }}
        />
      )}
      {Boolean(rimLine && rimLine.w > 0 && lens.on && lineFilter) && (
        <span
          className="dock-rim-line"
          aria-hidden="true"
          style={{
            borderRadius: radiusPx ?? 0,
            WebkitBackdropFilter: lineFilter,
            backdropFilter: lineFilter,
          }}
        />
      )}
      {lens.on && (
        <div
          aria-hidden="true"
          style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}
          dangerouslySetInnerHTML={{ __html: lens.svg }}
        />
      )}
    </div>
  )
}

export type { LensProfile, LineProfile }

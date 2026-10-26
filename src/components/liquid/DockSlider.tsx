import { useLayoutEffect, useRef, useState } from 'react'
import './dock-slider.css'

/**
 * DockSlider —— 底栏「Q 弹滑块」三件套封装（2026-09-24，从 BottomNav 抽离）。
 *
 * 一个组件打包：选中项光晕 + 滑动指示胶囊 + 弹簧果冻动画 + 测量/重测逻辑。
 * 从 BottomNav 抽出的原因：站长要求「滑块弹动效果保留并封装」，此后任何底栏类
 * 导航（格子容器 + 激活态）都能直接用，不用复制测量/弹簧那套代码。
 *
 * 用法（格子容器的第一个子节点）：
 *   const itemRefs = useRef<(HTMLElement | null)[]>([])
 *   <div className="relative grid grid-cols-5">
 *     <DockSlider activeIndex={active} getItem={(i) => itemRefs.current[i]} />
 *     {items.map((it, i) => <span ref={(el) => { itemRefs.current[i] = el }} />)}
 *   </div>
 *
 * 行为约定：
 * - paint 前测量（useLayoutEffect），首帧即正确位置，不播飞入；
 * - 切换格子时不再用 CSS transition 滑 320ms，而是由**真实弹簧仿真**驱动位置
 *   （半隐式欧拉积分：F = -K·x - D·v），过冲量是阻尼比的自然结果（ζ≈0.62 ≈
 *   8% 过冲），不是手调关键帧——手调关键帧的形变与运动脱钩，落地会"抽"一下；
 * - 形变（挤压拉伸 + 圆角鼓出）**与瞬时速度成正比**（迪士尼挤压拉伸原则，参考
 *   GitHub Sabrene-Marie/framer-cursor-component 的做法）：滑得快 = 沿行进方向
 *   拉长、上下收窄；减速/回摆 = 形变连续地跟着收，全程无突变的形变帧；
 * - 胶囊位置被栏体内边框夹住，弹簧过冲永远不会把胶囊顶出边框；
 * - 首帧/无激活格只淡入不弹；resize / 格子尺寸变化经 ResizeObserver 重测，
 *   重测只同步位置不弹（避免把 resize 位移误算进弹簧）；
 * - prefers-reduced-motion 时弹簧跳过，退化为直接到位。
 */
export interface DockSliderProps {
  /** 当前激活格子的下标；-1 = 无激活（滑块与光晕隐藏） */
  activeIndex: number
  /** 按标读取格子元素（父组件持有 ref 数组，这里只读，组件不自建注册机制） */
  getItem: (index: number) => HTMLElement | null
  /** 胶囊两端相对格子宽度的内缩（px，两端不贴圆角边界）。默认 7 */
  inset?: number
}

/* ---- 弹簧参数（时间基准，与帧率无关；每帧内子步进 1/120s 保证稳定） ---- */
/** 刚度 K（1/s²）：越大滑得越快、过冲越急 */
const SPRING_K = 380
/** 阻尼 D（1/s）：ζ = D / 2√K ≈ 0.62 欠阻尼 → 约 8% 自然过冲后衰减归位 */
const SPRING_D = 24
/** 形变-速度系数：瞬时速度（px/s）× 此值 = 拉伸量 */
const SQUASH_PER_SPEED = 0.00013
/** 拉伸量上限（12%）：高速时横向最多拉长 12%、纵向最多收窄 ~6.6% */
const SQUASH_MAX = 0.12
/** 收敛阈值：位置差 < 0.4px 且速度 < 6px/s 视为归位，结束仿真 */
const SETTLE_DIST = 0.4
const SETTLE_SPEED = 6

/** 单例弹簧状态（组件内 ref 持有）：跨连续切换保留位置/速度，不会瞬移 */
interface SpringState {
  x: number
  v: number
  raf: number
  running: boolean
  /** 仿真开始前元素原本的 transition —— 连续切换时不能重读，否则会把上一轮的 'none' 当成原值存下来 */
  savedTransition: string
  /** 上一次写过的圆角（节流用：每帧写 borderRadius 会让这一层每帧重绘） */
  lastRadius: number
}

/**
 * 启动弹簧仿真：从 fromX 以零初速释放，趋向 toX。
 * 每帧：积分位置/速度 → 由 |v| 求形变量 → 直写 inline transform。
 * 仿真期间临时摘掉 CSS transition（否则 320ms 过渡会把每帧写入低通滤波成拖影）；
 * 归位后写回最终值并恢复过渡。位置全程夹在 [minX, maxX]（栏体内边框）。
 */
function startSpring(
  el: HTMLElement,
  s: SpringState,
  fromX: number,
  toX: number,
  minX: number,
  maxX: number,
  /** 选中项光晕元素：与胶囊**同一套物理**，同帧写同一位置（见 tick） */
  glowEl: HTMLElement | null,
  /** 胶囊宽度：光晕中心 = 胶囊中心 = x + w/2 */
  capsuleW: number,
) {
  // 连续切换（弹簧还没归位就再点一格）：从**当前实际位置与速度**接着走。
  // 旧写法无条件 `s.x = fromX`（= 上一个目标点）且 `s.v = 0` —— 快速点两格时胶囊会先
  // "跳回上一格"再出发，肉眼就是抽一下；位置/速度都该跨切换保留。
  if (s.running) {
    s.x = Math.min(maxX, Math.max(minX, s.x))
  } else {
    s.x = Math.min(maxX, Math.max(minX, fromX))
    s.v = 0
    s.savedTransition = el.style.transition
  }
  if (s.raf) cancelAnimationFrame(s.raf)
  el.style.transition = 'none'
  // 合成提示只在仿真期间挂：常驻 will-change 会让它长期占一个合成层（见 dock-slider.css）
  el.style.willChange = 'transform'
  let last = performance.now()
  s.running = true

  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    // 子步进：低帧率设备上仍保持稳定
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)))
    const h = dt / steps
    for (let i = 0; i < steps; i++) {
      const a = -SPRING_K * (s.x - toX) - SPRING_D * s.v
      s.v += a * h
      s.x += s.v * h
    }
    // 边框夹持：冲过界就按在边界上、消掉向外速度（永不冲出边框）
    if (s.x > maxX) { s.x = maxX; if (s.v > 0) s.v = 0 }
    if (s.x < minX) { s.x = minX; if (s.v < 0) s.v = 0 }

    // 挤压拉伸与瞬时速度成正比，连续无突变
    const sq = Math.min(SQUASH_MAX, Math.abs(s.v) * SQUASH_PER_SPEED)
    el.style.transform = `translate(${s.x}px, -50%) scale(${1 + sq}, ${1 - sq * 0.55})`
    // 光晕跟着同一套物理走（2026-09-27 站长"你看着来"→ 定为同源）：
    // 原来是 CSS `left/transform 350ms` 缓动去追胶囊，两套时间模型必然错拍；
    // 现在同帧写同一位置，两者一起起步、一起到达，过冲量也一致。
    if (glowEl) glowEl.style.transform = `translate3d(${s.x + capsuleW / 2}px, 0, 0) translate(-50%, -50%)`
    // 圆角鼓出：变化 ≥0.5px 才写 —— 每帧写 borderRadius 会让这一层每帧重绘（形变观感不变）
    const radius = 14 + sq * 45
    if (Math.abs(radius - s.lastRadius) >= 0.5) {
      el.style.borderRadius = `${radius}px`
      s.lastRadius = radius
    }

    if (Math.abs(s.x - toX) < SETTLE_DIST && Math.abs(s.v) < SETTLE_SPEED) {
      // 归位：写回 React 内联同值的最终 transform，恢复过渡与合成提示
      el.style.transition = s.savedTransition
      el.style.willChange = ''
      el.style.transform = `translate(${toX}px, -50%)`
      el.style.borderRadius = ''
      // 光晕也落到最终位置（与 React 内联值同值，不会跳）
      if (glowEl) glowEl.style.transform = `translate3d(${toX + capsuleW / 2}px, 0, 0) translate(-50%, -50%)`
      s.lastRadius = 14
      s.running = false
      return
    }
    s.raf = requestAnimationFrame(tick)
  }
  s.raf = requestAnimationFrame(tick)
}

export default function DockSlider({ activeIndex, getItem, inset = 7 }: DockSliderProps) {
  const indRef = useRef<HTMLSpanElement | null>(null)
  const glowRef = useRef<HTMLSpanElement | null>(null)
  const [pos, setPos] = useState({ x: 0, w: 0 })
  const [visible, setVisible] = useState(false)
  // 上一帧位置：区分「切换滑动」（要弹簧）与「首帧/重测」（只同步位置）
  const prevRef = useRef<{ x: number; w: number } | null>(null)
  const springRef = useRef<SpringState>({ x: 0, v: 0, raf: 0, running: false, savedTransition: '', lastRadius: 14 })

  const measure = (el: HTMLElement) => ({
    x: el.offsetLeft + inset,
    w: Math.max(0, el.offsetWidth - inset * 2),
  })

  // paint 前测量 + ResizeObserver 重测（字体加载/横竖屏/格子尺寸变化）。
  // ⚠️ 本组件渲染在格子们**之前**（DOM 最先以垫底），首个 useLayoutEffect 触发时
  // 后续兄弟格子的 ref 可能还没挂上（React 按树序跑 layout effect）→ 首轮测量
  // 拿到 null/0 宽。因此用 rAF 重试（最多 ~60 帧）直到拿到有效尺寸再播入场。
  useLayoutEffect(() => {
    let disposed = false
    let raf = 0
    let ro: ResizeObserver | null = null
    let retries = 0

    const apply = (next: { x: number; w: number }) => {
      const prev = prevRef.current
      if (prev && visible && indRef.current) {
        const dist = Math.abs(next.x - prev.x)
        const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        if (dist > 2 && !reduced) {
          // 栏体内边框夹持范围：offsetParent = 格子容器（.relative grid）
          const parent = indRef.current.offsetParent as HTMLElement | null
          const pw = parent?.clientWidth ?? Number.POSITIVE_INFINITY
          const maxX = Math.max(0, pw - next.w - 2)
          startSpring(indRef.current, springRef.current, prev.x, next.x, 2, maxX, glowRef.current, next.w)
        }
      }
      prevRef.current = next
      setPos(next)
      setVisible(true)
    }

    const tick = () => {
      if (disposed) return
      if (activeIndex < 0) {
        prevRef.current = null
        setVisible(false)
        return // 无激活格：隐藏即可，无需重试
      }
      const el = getItem(activeIndex)
      if (!el || el.offsetWidth <= 0) {
        // ref 未挂上 / 尺寸未布局（本组件在格子之前渲染，首帧常拿不到）→ rAF 重试
        if (retries++ < 60) raf = requestAnimationFrame(tick)
        return
      }
      apply(measure(el))
      ro = new ResizeObserver(() => {
        // 重测只同步基准与位置，不弹（避免把 resize 位移误算进弹簧）
        prevRef.current = measure(el)
        setPos(prevRef.current)
      })
      ro.observe(el)
    }

    tick()
    return () => {
      disposed = true
      if (raf) cancelAnimationFrame(raf)
      if (springRef.current.raf) cancelAnimationFrame(springRef.current.raf)
      ro?.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, inset])

  const cx = pos.x + pos.w / 2

  return (
    <>
      {/* 选中项光晕：画在指示器与格子内容之下（DOM 最先）。
          位置走 transform（原来写 left：每帧触发布局重排并重算 blur(10px) 滤镜结果）；
          切换时由弹簧仿真与胶囊**同帧写同一位置**（同一套物理），这条内联值只是静止态基准。 */}
      <span
        ref={glowRef}
        aria-hidden="true"
        className="dock-glow"
        style={{ transform: `translate3d(${cx}px, 0, 0) translate(-50%, -50%)`, opacity: visible ? 1 : 0 }}
      />
      {/* 滑动指示胶囊（弹簧仿真期间 transform 由仿真直写，归位后回归 React 内联值） */}
      <span
        ref={indRef}
        aria-hidden="true"
        className="dock-slider-indicator"
        style={{
          transform: `translate(${pos.x}px, -50%)`,
          width: pos.w,
          opacity: visible ? 1 : 0,
        }}
      />
    </>
  )
}

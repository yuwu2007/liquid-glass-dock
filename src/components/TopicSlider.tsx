import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { rubberBand } from '../lib/rubberBand'

/**
 * ⚠️⚠️ 全站滑块唯一来源 —— 禁止再自造第二个滑块 ⚠️⚠️
 *
 * 唯一基准 = 首页顶部导航栏右下角那枚（站长 2026-09-26 口径「全部统一一下 / 要一模一样」）。
 * 实测参数（真浏览器）：
 *   · 外壳   21.52px = p-[2px] + 按钮 py-[3px]+0.72rem+leading-none(17.52)
 *   · 按钮   17.52px 高，px-2 / text-[0.72rem] / leading-none / rounded-[999px]
 *   · 高亮块 与按钮等高（top/bottom = 内边距 2px）、bg-white dark:bg-[#14171c]、
 *            shadow 0 1px 3px rgba(0,0,0,.28)、transform .26s cubic-bezier(.4,0,.2,1)
 *            （Tailwind ease-in-out 即该曲线）
 *   · 选中项 text-ink font-bold（浅色=纯黑，**不是品牌蓝**）/ 未选 text-faint
 * 新增滑块一律调用本组件；不要复制这段类名，也不要再写第二个 SegmentedSlider/SortToggleSlider
 * 实现（曾经的两套并行实现就是尺寸/配色漂移的根源，已全部收编到这里）。
 *
 * 接口对齐 common/SegmentedSlider 的调用习惯（options / value / onChange / className），
 * 另加：
 *   · fill —— 选项 flex-1 均分撑满外层（发布页表单、管理台 tab 栏等原 SegmentedSlider 场景）；
 *            不传 = 按内容宽（首页顶栏 / 搜索页 / 发现页 / 反馈栏那类与文字 Tab 同行的场景）。
 *   · size —— 两档：
 *             `compact`（默认，外壳 21.52px，首页那枚是全站基准，别改高）
 *             `roomy`（外壳 ≈30.8px；站长 2026-09-26 二改：管理端顶部那排「上下太窄了」→ 放宽）
 *   · hug —— **高亮块只包住文字**（不跟随整格宽）。
 *            为什么要它：fill（均分撑满）能让整条不留空白，但高亮会跟着撑成一条长横条，
 *            站长看到的就是「这个横线太长了」。开 hug 后：按钮照旧均分撑满（右边不留空白），
 *            高亮块按**文字宽度**居中收窄成一个小胶囊 —— 两件事终于能同时成立。
 *   · icon —— 选项左侧图标（公布/公告类型等原有能力）。
 *
 * 交互（与 SortToggleSlider 一致，属既有行为，不得退化）：
 *   · 点选项 —— 切换
 *   · 按住横向拖 —— 高亮块跟手，松手按「高亮块中心离哪个选项中心最近」定夺；没跨出原项则回弹
 *
 * ⚠️ 指针捕获（2026-09-26 修，真机复现的桌面鼠标点击失效）：
 *   旧实现在 onPointerDown 里对**容器**调 setPointerCapture。Chrome 据此把随后 click 的目标
 *   改判为「按下点与抬起点的最近公共祖先」= 容器本身 → 按钮自己的 onClick 收不到 → 桌面鼠标
 *   点这个滑块完全没反应（触屏因为隐式捕获落在按钮上，看起来正常）。
 *   现在：**不调用 setPointerCapture**，改在 pointerdown 时给 window 挂 pointermove/up/cancel。
 *   跟手效果不变（window 在冒泡链顶端，手指/鼠标滑出滑块也能继续跟），而 click 仍归按钮 →
 *   鼠标与触屏双端都能点。触屏本身的隐式指针捕获（规范规定 touch 指针默认捕获到 pointerdown
 *   目标）也一并保证抬手仍回到按钮。
 *
 * Portal 场景（首页顶栏把话题栏 createPortal 进玻璃插槽）：组件不依赖任何父级 DOM ——
 *   监听挂在 window、几何只以**自身容器**为参照（offsetLeft 相对最近的 positioned 祖先 = 本容器），
 *   所以在 Portal 里与在普通文档流里表现一致。
 *
 * 触控热区：按钮视觉高度只有 17.52px，触屏上靠 `.topic-slider-hot` 的透明 ::after 上下各撑 14px
 *   → 热区 45.52px ≥ 44px（横向不外扩，见 index.css 内注释：相邻选项只隔 2px，外扩会互相盖住）。
 * 用法：<TopicSlider options={[{key:'hot',label:'热门'}]} value={v} onChange={setV} />
 */

/** 一个选项：key 是回传给 onChange 的值，label 是显示文字（icon 可选） */
export interface TopicSliderOption<T extends string = string> {
  key: T
  label: string
  /** 选项左侧图标（发布页的类型 / 公告类型等原有能力） */
  icon?: ReactNode
}

/** hug 档：高亮块比文字左右各多出的宽度（px），视觉上像一个刚好包住文字的小胶囊 */
const PILL_PAD = 7
/** 拖动 / 点击的区分阈值（px）：位移小于它算点击，不触发切换 */
const DRAG_SLOP = 4
/** 拖动收尾后，浏览器补发的 click 在此时长内到达 → 视为同一次手势，吞掉 */
const CLICK_SWALLOW_MS = 400

export default function TopicSlider<T extends string = string>({
  options,
  value,
  onChange,
  className = '',
  fill = false,
  hug = false,
  size = 'compact',
}: {
  options: readonly TopicSliderOption<T>[]
  value: T
  onChange: (v: T) => void
  /** 附加类名（如 shrink-0 / mb-3 / max-w-[186px]），追加在外壳类名之后 */
  className?: string
  /** 选项 flex-1 均分撑满外层（原 SegmentedSlider 场景）；不传 = 按内容宽 */
  fill?: boolean
  /** 高亮块只包住文字（配合 fill 用：整条撑满、高亮不拉成长横条） */
  hug?: boolean
  /**
   * 档位：
   *   · `compact`（默认）= 首页顶栏那枚，外壳 21.52px，**全站基准**，别改高；
   *   · `roomy` = 加高档，外壳 ≈30.8px（按钮 py 3→6、字号 0.72→0.8rem、外壳内边距 2→3）。
   *     站长 2026-09-26：「关注与粉丝界面这个滑块上下太窄了，可以放宽一点」→ **只给「关注与粉丝」用**。
   *   · `admin` / `adminDetail` = **只在 `.admin-scope` 内出现**的后台档（B2 规范 §3.4）：
   *     外壳钉死 36px（工作区 Tab）/ 32px（详情页内部 Tab），字号 0.82 / 0.78rem。
   *     前台基准仍是 compact 的 21.52px —— 后台档不许往前台铺（两端都别用）。
   */
  size?: 'compact' | 'roomy' | 'admin' | 'adminDetail'
}) {
  /** 加高档：外壳内边距 / 高亮块 inset / 按钮内边距·字号·图标尺寸 三处必须一起跟着变，
   *  否则高亮块会与外壳错位（高亮块是按 top/bottom 绝对定位的）。 */
  const roomy = size === 'roomy'
  /** 后台档（B2）：外壳高度写死在类名上，按钮 h-full 跟着走 ——
   *  免得各页自造 `h-8`/`py-*` 混搭，把同一枚控件在不同页面顶成不同高。 */
  const adminShell = size === 'admin' ? 'h-9' : size === 'adminDetail' ? 'h-8' : ''
  const adminBtn =
    size === 'admin'
      ? 'h-full px-3.5 text-[0.82rem] [&_svg]:size-[0.85rem]'
      : size === 'adminDetail'
        ? 'h-full px-3 text-[0.78rem] [&_svg]:size-[0.8rem]'
        : ''
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])
  /** 选项里那层文字 span（hug 档按它量高亮块宽度） */
  const labelRefs = useRef<(HTMLSpanElement | null)[]>([])
  const [ind, setInd] = useState({ x: 0, w: 0, ready: false })
  /** 拖动中的额外位移（px）：叠加在 ind.x 上，让高亮块跟手 */
  const [dragDx, setDragDx] = useState(0)
  /** 是否正在拖动：拖动中临时关掉 transition */
  const [dragging, setDragging] = useState(false)
  /** 刚撞过边界松手：这一次收回用带回弹的缓动（平时切换仍是 260ms 匀速感） */
  const [springBack, setSpringBack] = useState(false)
  const springTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 本次指针交互（pointerId 用于多指时只认第一根手指） */
  const dragRef = useRef<{ id: number; startX: number; moved: boolean } | null>(null)
  /** 高亮块的左右活动边界（px）：左=第一个选项左缘，右=最后一个选项右缘-高亮块宽。
   *  站长 2026-10-24：拖动必须「撞到边就停」，不能滑到选项之外。 */
  const boundsRef = useRef<{ min: number; max: number } | null>(null)
  /** 拖动收尾时刻：之后 CLICK_SWALLOW_MS 内到达的 click 视为浏览器补发（见下方 onClick） */
  const swallowAtRef = useRef(0)
  /** 当前挂在 window 上的拖动监听（卸载 / 抬手时摘掉，避免多指或反复按下叠加） */
  const listenersRef = useRef<{
    move: (e: PointerEvent) => void
    up: (e: PointerEvent) => void
    cancel: (e: PointerEvent) => void
  } | null>(null)

  const activeIndex = Math.max(0, options.findIndex((o) => o.key === value))

  // paint 前测量：首帧即正确位置。340ms 后复测（等字体加载，宽度别跑偏）+ resize 复测
  useLayoutEffect(() => {
    const measure = () => {
      const el = btnRefs.current[activeIndex]
      if (!el) return
      let x: number
      let w: number
      if (hug) {
        // 高亮块 = 文字宽度 + 左右各 PILL_PAD，并在按钮内居中（按钮可能被 fill 撑得很宽）
        const labelEl = labelRefs.current[activeIndex]
        const textW = labelEl ? labelEl.offsetWidth : 0
        w = Math.min(el.offsetWidth, Math.max(24, textW + PILL_PAD * 2))
        x = Math.max(0, el.offsetLeft + (el.offsetWidth - w) / 2)
      } else {
        x = el.offsetLeft
        w = el.offsetWidth
      }
      setInd({ x, w, ready: true })
      // 活动边界：高亮块左缘最左到第一个选项左缘，最右到最后一个选项右缘（减自身宽度）
      const first = btnRefs.current[0]
      const last = btnRefs.current[options.length - 1]
      if (first && last) {
        boundsRef.current = {
          min: first.offsetLeft,
          max: Math.max(first.offsetLeft, last.offsetLeft + last.offsetWidth - w),
        }
      }
    }
    measure()
    const t = setTimeout(measure, 340)
    window.addEventListener('resize', measure)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', measure)
    }
  }, [activeIndex, options, hug, fill])

  const detach = () => {
    const l = listenersRef.current
    if (!l) return
    window.removeEventListener('pointermove', l.move)
    window.removeEventListener('pointerup', l.up)
    window.removeEventListener('pointercancel', l.cancel)
    listenersRef.current = null
  }

  // 卸载兜底：拖动中组件被卸载（Portal 宿主替换、页面切换）时摘掉 window 监听
  useEffect(() => detach, [])
  // 卸载时摘掉回弹定时器：离开页面后才落地会去 setState 已卸载的组件
  useEffect(() => () => { if (springTimer.current !== null) clearTimeout(springTimer.current) }, [])

  /**
   * 拖动位移的碰撞限制：高亮块左缘只能在 [第一个选项左缘, 最后一个选项右缘-自身宽] 之间移动。
   * 撞到边就停（不再跟手继续滑），松手回弹逻辑不变。
   */
  const clampDx = (dx: number) => {
    const b = boundsRef.current
    if (!b) return dx
    return Math.min(Math.max(ind.x + dx, b.min), b.max) - ind.x
  }

  /**
   * 拖动中的显示位移：边界内跟手；越界部分走橡皮筋（越拉越沉、最多多走 34px），
   * 松手后由 settle 收回到边界内。站长 2026-10-24：「碰到边界可以有点弹性，别太僵硬」。
   */
  const rubberDx = (dx: number) => {
    const hard = clampDx(dx)
    return hard + rubberBand(dx - hard)
  }

  /**
   * 松手定夺：把「高亮块当前实际中心」（起始位置 + 拖动位移 + 半个宽度）和每个选项的中心比，
   * 取**最近**的那个。
   * ⚠️ 不能用「中心落在按钮矩形内」判定 —— 那样有上界：用力甩出去反而「哪个都不在」→ 不切换。
   *    取最近者天然无上界，且「跨过中点才换」与拖动手感一致。
   */
  const settle = (rawDx: number) => {
    const dx = clampDx(rawDx)
    const overshot = Math.abs(rawDx - dx) > 0.5
    const center = ind.x + dx + ind.w / 2
    let hit = -1
    let nearest = Infinity
    options.forEach((_, i) => {
      const b = btnRefs.current[i]
      if (!b) return
      const dist = Math.abs(center - (b.offsetLeft + b.offsetWidth / 2))
      if (dist < nearest) {
        nearest = dist
        hit = i
      }
    })
    if (hit >= 0 && hit !== activeIndex) onChange(options[hit].key)
    setDragDx(0)
    if (overshot) {
      // 撞边松手 → 用带轻微过冲的曲线弹回（不到 0.4s，不做多余弹跳）
      setSpringBack(true)
      if (springTimer.current !== null) clearTimeout(springTimer.current)
      springTimer.current = setTimeout(() => setSpringBack(false), 400)
    }
  }

  return (
    <div
      className={`relative flex items-center gap-0.5 ${roomy ? 'p-[3px]' : 'p-[2px]'} ${adminShell} rounded-[999px] bg-black/[0.05] dark:bg-white/[0.12] ${className}`}
      // 纵向留给页面滚动，横向由本组件接管（避免拖动时页面跟着左右晃）
      style={{ touchAction: 'pan-y' }}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return // 只认左键
        detach() // 上一轮没摘干净（多指）先收尾
        swallowAtRef.current = 0 // 清掉上一轮可能残留的「吞 click」时刻
        dragRef.current = { id: e.pointerId, startX: e.clientX, moved: false }
        setDragging(true)

        // ⚠️ 刻意不调 setPointerCapture（那会让 click 落到容器上，鼠标点不动）。
        //    改挂 window：window 在冒泡链顶端，指针滑出滑块也能跟手。
        const onMove = (ev: PointerEvent) => {
          const d = dragRef.current
          if (!d || d.id !== ev.pointerId) return
          const dx = ev.clientX - d.startX
          if (!d.moved) {
            if (Math.abs(dx) < DRAG_SLOP) return // 阈值内仍算「点击」，不进入拖动
            d.moved = true
          }
          setDragDx(rubberDx(dx))
        }
        const onUp = (ev: PointerEvent) => {
          detach()
          const d = dragRef.current
          if (!d || d.id !== ev.pointerId) return
          const moved = d.moved === true
          dragRef.current = null
          setDragging(false)
          if (!moved) return // 未达拖动阈值：完全交还给按钮自身 onClick
          swallowAtRef.current = performance.now()
          settle(ev.clientX - d.startX)
        }
        const onCancel = (ev: PointerEvent) => {
          detach()
          const d = dragRef.current
          if (!d || d.id !== ev.pointerId) return
          dragRef.current = null
          setDragging(false)
          setDragDx(0)
        }
        listenersRef.current = { move: onMove, up: onUp, cancel: onCancel }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        window.addEventListener('pointercancel', onCancel)
      }}
    >
      {/* 纯色高亮块：浅色=白 / 深色=#14171c，随选中项滑动。
          注意：一律用 rounded-[999px] 而非 rounded-full ——
          index.css 全局规则 .dark .rounded-full 会给每个元素额外加白描边框 */}
      <span
        aria-hidden="true"
        className={`absolute left-0 rounded-[999px] bg-white dark:bg-[#14171c] shadow-[0_1px_3px_rgba(0,0,0,0.28)] transition-transform duration-[260ms] ease-in-out ${roomy ? 'top-[3px] bottom-[3px]' : 'top-[2px] bottom-[2px]'}`}
        style={{
          transform: `translateX(${ind.x + dragDx}px)`,
          width: ind.w,
          opacity: ind.ready ? 1 : 0,
          // 拖动中必须去掉过渡，否则高亮块滞后于手指；undefined = 沿用类名里的 260ms
          // 拖动中去掉过渡（否则滞后于手指）；撞边松手那一下用带轻微过冲的曲线收回，
          // 其余切换沿用 260ms ease-in-out
          transition: dragging ? 'none' : springBack ? 'transform 380ms cubic-bezier(0.18, 1.32, 0.36, 1)' : undefined,
        }}
      />
      {options.map((o, i) => (
        <button
          key={o.key}
          ref={(el) => {
            btnRefs.current[i] = el
          }}
          type="button"
          // [&_svg]:size-[0.72rem] —— 带图标的选项（公告类型 / 内容形式 / 示告栏开关）必须把图标压到
          // 与文字同高（0.72rem）：否则 14px 的图标会把按钮撑到 20px、外壳跟着变 24px，破坏
          // 「全站外壳恒为 21.52px」这条唯一基准（真机实测过：不压图标时 24px）。
          className={`topic-slider-hot relative z-[1] ${roomy ? 'px-3 py-[6px] text-[0.8rem] [&_svg]:size-[0.8rem]' : adminBtn || 'px-2 py-[3px] text-[0.72rem] [&_svg]:size-[0.72rem]'} rounded-[999px] font-pixel leading-none cursor-pointer bg-transparent border-none transition-colors duration-200 ${
            value === o.key ? 'text-ink font-bold' : 'text-faint hover:text-muted'
          }${fill ? ' flex-1 min-w-0 flex items-center justify-center gap-1 whitespace-nowrap' : ''}`}
          onClick={() => {
            // 拖动松手后浏览器常会补一个 click：吞掉，否则刚切好的又被切回去。
            // 用「时刻 + 400ms 窗口」而不是纯布尔标记 —— 纯标记在「拖到容器空白处收尾」
            // （补发的 click 落在容器、没有按钮消费它）时会一直留着，把下一次真实点击吞掉。
            if (performance.now() - swallowAtRef.current < CLICK_SWALLOW_MS) {
              swallowAtRef.current = 0
              return
            }
            if (value !== o.key) onChange(o.key)
          }}
        >
          {o.icon}
          {/* fill 档曾靠截断防撑破：外层宽度固定、选项均分时，长标签用省略号收住。
              hug 档要量这层 span 的宽度（高亮块按它收窄），所以文字一律包一层。 */}
          <span
            ref={(el) => {
              labelRefs.current[i] = el
            }}
            className={fill ? 'truncate' : undefined}
          >
            {o.label}
          </span>
        </button>
      ))}
    </div>
  )
}

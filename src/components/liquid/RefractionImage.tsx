import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, RefObject } from 'react'

/**
 * RefractionImage —— 跨浏览器的"真折射"玻璃（不依赖 backdrop-filter: url()）。
 *
 * 光学模型（与 Apple Liquid Glass 的 Web 复现同一套物理）：
 *   1. 圆角矩形 SDF 得到"离边多远、法线朝哪"；
 *   2. 边缘一圈是凸面（squircle 剖面 h(t)=(1-(1-t)^4)^(1/4)），求表面倾角 θ1；
 *   3. 斯涅尔定律 sinθ1 / n = sinθ2，光线偏折角 = θ1-θ2；
 *   4. 位移 = tan(θ1-θ2) × 玻璃厚度，方向朝面板中心 —— 凸面把光往中间聚，
 *      所以边缘是"放大弯折"，而不是把内部颜色涂抹成一条带子；
 *   5. 高光用三维法线 N=(n·sinθ1, cosθ1) 与水平光 L 的 |N·L|，
 *      在对称两侧各形成一弯亮弧（苹果玻璃边上那两道光）。
 *
 * 这些图在 canvas 里按 3 倍超采样生成，交给 SVG feDisplacementMap 执行，
 * Safari / 微信 X5 / Firefox 都能跑。背景对齐靠 backdropRef。
 */

export default function RefractionImage({
  src,
  backdropRef,
  radius = 28,
  bevel,
  strength = 34,
  ior = 1.5,
  blur = 0.5,
  veil = 0.08,
  saturation = 1,
  specular = 1,
  lightAngle = -55,
  className = '',
  style,
  children,
}: {
  src: string
  /** 背景图元素：玻璃折的就是它（必传，否则不知道面板后面是什么） */
  backdropRef?: RefObject<HTMLElement | null>
  radius?: number
  /** 折射环宽度 px，默认短边的 1/4（封顶 40） */
  bevel?: number
  /** 玻璃光学厚度 px：越大边缘弯得越厉害。20 细腻 / 34 标准 / 60 夸张 */
  strength?: number
  /** 折射率，水 1.33、玻璃 1.5、重火石 1.8 */
  ior?: number
  /** 位移前的高斯模糊：0.5 高透；6~10 就是磨砂玻璃，边缘折射仍然保留 */
  blur?: number
  /** 一层极薄的奶白（0~1）：让玻璃不那么"透得发空"，0 关闭 */
  veil?: number
  /** 饱和度：1 不变，1.15 与站内 GlassPanel 一致（磨砂后颜色不发灰） */
  saturation?: number
  /** 边缘高光强度 0~1.5 */
  specular?: number
  /** 高光方位角（度）：-55 = 光源在右上，对称两侧各一弯亮弧 */
  lightAngle?: number
  className?: string
  /** 固定尺寸测试（圆形/方块）时传 width/height */
  style?: CSSProperties
  children?: ReactNode
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const rawId = useId().replace(/[:]/g, '')
  const filterId = `rfi-${rawId}`
  const clipId = `rfc-${rawId}`
  const [maps, setMaps] = useState<{ disp: string; spec: string; scale: number }>({ disp: '', spec: '', scale: 0 })
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [photoBox, setPhotoBox] = useState({ x: 0, y: 0, w: 0, h: 0 })
  const mapKey = useRef('')
  const buildTimer = useRef<number | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    let raf = 0

    const measure = () => {
      raf = 0
      const w = Math.round(el.offsetWidth)
      const h = Math.round(el.offsetHeight)
      if (w < 40 || h < 40) return

      // 背景偏移每次滚动都要更新；折射贴图只在尺寸/参数变化时重算
      const a = el.getBoundingClientRect()
      const b = backdropRef?.current?.getBoundingClientRect()
      if (b && b.width > 0) {
        setPhotoBox({ x: b.left - a.left, y: b.top - a.top, w: b.width, h: b.height })
      } else {
        setPhotoBox({ x: 0, y: 0, w, h })
      }

      const bv = Math.max(4, Math.min(bevel ?? Math.min(w, h) / 4, Math.min(w, h) / 2 - 1, 120))
      const key = `${w}x${h}:${radius}:${bv}:${strength}:${ior}:${specular}:${lightAngle}`
      if (key !== mapKey.current) {
        mapKey.current = key
        setBox({ w, h })
        // 拖滑杆时一帧可能来几十次：贴图重算做 60ms 防抖，画面上保留上一张
        if (buildTimer.current) window.clearTimeout(buildTimer.current)
        buildTimer.current = window.setTimeout(() => {
          setMaps(buildLensMaps(w, h, Math.min(radius, h / 2), bv, strength, ior, specular, lightAngle))
        }, 60)
      }
    }

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure)
    }

    schedule()
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      if (raf) cancelAnimationFrame(raf)
      if (buildTimer.current) window.clearTimeout(buildTimer.current)
    }
  }, [radius, bevel, strength, ior, specular, lightAngle, backdropRef])

  const { w, h } = box
  const pad = Math.ceil(Math.max(strength, blur * 3, 8))

  return (
    <div
      ref={wrapRef}
      className={`relative overflow-hidden ${className}`.trim()}
      style={{ ...style, borderRadius: radius }}
      data-refraction-image
    >
      {w > 0 && maps.disp && (
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={0} width={w} height={h} rx={Math.min(radius, h / 2)} />
            </clipPath>
            <filter
              id={filterId}
              filterUnits="userSpaceOnUse"
              primitiveUnits="userSpaceOnUse"
              x={-pad}
              y={-pad}
              width={w + pad * 2}
              height={h + pad * 2}
              colorInterpolationFilters="sRGB"
            >
              <feImage href={maps.disp} x={0} y={0} width={w} height={h} preserveAspectRatio="none" result="lens" />
              <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="soft" />
              <feColorMatrix in="soft" type="saturate" values={String(saturation)} result="sat" />
              <feDisplacementMap in="sat" in2="lens" scale={maps.scale} xChannelSelector="R" yChannelSelector="G" result="bent" />
              {/* 0.4px 微柔化：吃掉位移采样留下的"一层一层"横带，不影响轮廓 */}
              <feGaussianBlur in="bent" stdDeviation="0.4" />
            </filter>
          </defs>

          <g clipPath={`url(#${clipId})`}>
            <image
              href={src}
              x={photoBox.x}
              y={photoBox.y}
              width={photoBox.w || w}
              height={photoBox.h || h}
              preserveAspectRatio="xMidYMid slice"
              filter={`url(#${filterId})`}
            />
            {maps.spec && <image href={maps.spec} x={0} y={0} width={w} height={h} preserveAspectRatio="none" />}
          </g>
        </svg>
      )}

      {/* 一层薄奶白；边缘高光全部交给高光贴图，不再叠加 CSS 亮线（避免"一层一层"） */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          borderRadius: radius,
          background: veil > 0 ? `rgba(255,255,255,${veil})` : undefined,
        }}
      />

      <div className="relative">{children}</div>
    </div>
  )
}

/** 生成位移图 + 高光图；scale = 2 × 最大位移，通道 255 即对应最大位移 */
function buildLensMaps(
  W: number,
  H: number,
  R: number,
  bevel: number,
  depth: number,
  ior: number,
  specIntensity: number,
  lightAngle: number,
): { disp: string; spec: string; scale: number } {
  // 超采样：3 倍足够消掉边缘阶梯；面板特别大时降档，避免主线程长时间占用
  let SS = 3
  while (SS > 1 && W * H * SS * SS > 1_200_000) SS--
  const sw = W * SS
  const sh = H * SS
  const halfW = W / 2
  const halfH = H / 2
  const r = Math.min(R, halfW, halfH)
  const TAPER = Math.min(8, bevel * 0.45)

  const dx = new Float32Array(sw * sh)
  const dy = new Float32Array(sw * sh)
  const specA = new Float32Array(sw * sh)
  let maxMag = 0

  // 水平方向光（Lz=0）：对称两弯亮弧，正是苹果玻璃边的样子
  const az = (lightAngle * Math.PI) / 180
  const Lx = Math.cos(az)
  const Ly = Math.sin(az)
  const shininess = 12

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const cx = (x + 0.5) / SS - halfW
      const cy = (y + 0.5) / SS - halfH
      const d = sdRoundRect(cx, cy, halfW, halfH, r)
      if (d >= 0) continue
      const dist = -d
      if (dist >= bevel) continue

      const t = Math.max(dist / bevel, 0.02) // 0 在边缘，1 到平顶；避开斜率奇点
      const u = 1 - t
      const u4 = u * u * u * u
      // 凸面 squircle 剖面的斜率 → 表面倾角
      const slope = (u * u * u) / Math.pow(1 - u4, 0.75)
      const theta1 = Math.atan(slope)

      const innerFade = smoothstep((bevel - dist) / TAPER)
      // 外缘羽化放宽到 1.5px：折射峰不那么尖，横带感明显减弱，但峰值保留
      const outerFade = smoothstep(dist / 1.5)
      const sinT2 = Math.sin(theta1) / ior
      const theta2 = Math.asin(Math.min(1, Math.max(-1, sinT2)))
      const mag = Math.tan(theta1 - theta2) * depth * innerFade * outerFade

      const eps = 1
      const gx = sdRoundRect(cx + eps, cy, halfW, halfH, r) - sdRoundRect(cx - eps, cy, halfW, halfH, r)
      const gy = sdRoundRect(cx, cy + eps, halfW, halfH, r) - sdRoundRect(cx, cy - eps, halfW, halfH, r)
      const gl = Math.hypot(gx, gy) || 1
      const nx = gx / gl
      const ny = gy / gl

      const i = y * sw + x
      // 凸面：取样点朝面板中心 → 边缘放大，而不是涂抹
      dx[i] = -nx * mag
      dy[i] = -ny * mag
      const m = Math.hypot(dx[i], dy[i])
      if (m > maxMag) maxMag = m

      const sinT = Math.sin(theta1)
      const cosT = Math.cos(theta1)
      const dot = nx * sinT * Lx + ny * sinT * Ly
      const directional = Math.pow(Math.abs(dot), shininess)
      const baseline = sinT * 0.06
      const rim = Math.min(1, sinT * 1.8)
      specA[i] = Math.max(directional, baseline) * specIntensity * rim * innerFade * outerFade
    }
  }

  const dispCanvas = document.createElement('canvas')
  dispCanvas.width = sw
  dispCanvas.height = sh
  const dctx = dispCanvas.getContext('2d')
  const specCanvas = document.createElement('canvas')
  specCanvas.width = sw
  specCanvas.height = sh
  const sctx = specCanvas.getContext('2d')
  if (!dctx || !sctx) return { disp: '', spec: '', scale: 0 }

  const dImg = dctx.createImageData(sw, sh)
  const sImg = sctx.createImageData(sw, sh)
  const norm = maxMag > 0 ? 1 / maxMag : 1
  for (let i = 0; i < sw * sh; i++) {
    const o = i * 4
    dImg.data[o] = clamp(128 + dx[i] * norm * 127)
    dImg.data[o + 1] = clamp(128 + dy[i] * norm * 127)
    dImg.data[o + 2] = 128
    dImg.data[o + 3] = 255
    sImg.data[o] = 255
    sImg.data[o + 1] = 255
    sImg.data[o + 2] = 255
    sImg.data[o + 3] = clamp(specA[i] * 255)
  }
  dctx.putImageData(dImg, 0, 0)
  sctx.putImageData(sImg, 0, 0)
  // 高光贴图自身也柔化一下：亮线/暗带不再分层，过渡是连续的
  sctx.filter = `blur(${Math.max(1, SS * 0.7)}px)`
  sctx.drawImage(specCanvas, 0, 0)
  sctx.filter = 'none'

  return { disp: dispCanvas.toDataURL(), spec: specCanvas.toDataURL(), scale: maxMag * 2 }
}

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}

function sdRoundRect(px: number, py: number, halfW: number, halfH: number, r: number): number {
  const qx = Math.abs(px) - (halfW - r)
  const qy = Math.abs(py) - (halfH - r)
  const ax = Math.max(qx, 0)
  const ay = Math.max(qy, 0)
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r
}

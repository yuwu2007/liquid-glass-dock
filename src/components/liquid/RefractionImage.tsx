import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'

/**
 * RefractionImage —— 不依赖 `backdrop-filter: url()` 的折射方案。
 *
 * 关键点：它折射的必须是"面板正后方那块画面"，所以要么传 `backdropRef`
 * （页面里那张真实背景图），要么它会退化成"把同一张图铺满面板"—— 后者看起来
 * 就是贴了张照片，没有玻璃感。演示页里就是靠 backdropRef 与手机背景图对齐。
 *
 * 原理：把背景图按它在页面上的真实位置画进 SVG，再用 `feDisplacementMap`
 * 沿圆角矩形法线把边缘像素往里推。SVG 滤镜在 Safari / Firefox / 微信 X5 都支持
 * （不兼容的只是 `backdrop-filter` 收不收 `url()`）。
 */
export default function RefractionImage({
  src,
  backdropRef,
  radius = 28,
  strength = 22,
  blur = 4,
  className = '',
  children,
}: {
  src: string
  /** 背景图元素（<img> 或任意带背景的容器）：有它才能"折到正确的画面" */
  backdropRef?: RefObject<HTMLElement | null>
  radius?: number
  /** 边缘位移强度（px）：越大越像厚玻璃，过大边缘会糊 */
  strength?: number
  /** 玻璃本体的模糊（px），0 = 完全清晰（更像放大镜而不是玻璃） */
  blur?: number
  className?: string
  children?: ReactNode
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const rawId = useId().replace(/[:]/g, '')
  const filterId = `rfi-${rawId}`
  const [map, setMap] = useState('')
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [photoBox, setPhotoBox] = useState({ x: 0, y: 0, w: 0, h: 0 })

  const pad = Math.ceil(Math.max(strength * 2, blur * 3))

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    let raf = 0

    const measure = () => {
      raf = 0
      const w = Math.round(el.offsetWidth)
      const h = Math.round(el.offsetHeight)
      if (w < 40 || h < 40) return
      setBox({ w, h })

      const a = el.getBoundingClientRect()
      const b = backdropRef?.current?.getBoundingClientRect()
      if (b && b.width > 0) {
        setPhotoBox({ x: b.left - a.left, y: b.top - a.top, w: b.width, h: b.height })
      } else {
        setPhotoBox({ x: 0, y: 0, w, h })
      }
      setMap(buildEdgeMap(w, h, Math.min(radius, h / 2), strength))
    }

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure)
    }

    schedule()
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    // 面板会随内容滚动：背景图是固定的，所以位置要跟着重算
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [radius, strength, backdropRef])

  const { w, h } = box
  // 位移贴图要覆盖到面板外一圈（边缘要把外侧像素折进来）
  const filterBox = { x: -pad, y: -pad, w: w + pad * 2, h: h + pad * 2 }

  return (
    <div
      ref={wrapRef}
      className={`relative overflow-hidden ${className}`.trim()}
      style={{ borderRadius: radius }}
      data-refraction-image
    >
      {w > 0 && (
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <filter
              id={filterId}
              filterUnits="userSpaceOnUse"
              primitiveUnits="userSpaceOnUse"
              x={filterBox.x}
              y={filterBox.y}
              width={filterBox.w}
              height={filterBox.h}
              colorInterpolationFilters="sRGB"
            >
              <feImage href={map} x={0} y={0} width={w} height={h} preserveAspectRatio="none" result="lens" />
              <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="soft" />
              <feDisplacementMap in="soft" in2="lens" scale={strength * 2} xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </defs>
          {/* 背景图按它在页面上的真实位置/尺寸画进来：这样玻璃里透出的就是"面板正后方"的画面 */}
          <image
            href={src}
            x={photoBox.x}
            y={photoBox.y}
            width={photoBox.w || w}
            height={photoBox.h || h}
            preserveAspectRatio="xMidYMid slice"
            filter={`url(#${filterId})`}
          />
        </svg>
      )}

      {/* 玻璃感：上缘高光 + 轻微压暗（不做整体磨砂，否则又变成"贴图"） */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          borderRadius: radius,
          background: 'radial-gradient(120% 100% at 50% 0%, rgba(255,255,255,0.10), transparent 58%)',
          boxShadow:
            'inset 0 0 0 1px rgba(255,255,255,0.42), inset 0 6px 16px -12px rgba(255,255,255,0.45), inset 0 -8px 16px -14px rgba(0,0,0,0.18)',
        }}
      />

      <div className="relative">{children}</div>
    </div>
  )
}

/** 位移贴图：R/G 编码"往内推"的方向，越贴边越强（画布尺寸 = 面板尺寸） */
function buildEdgeMap(W: number, H: number, R: number, strength: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const img = ctx.createImageData(W, H)
  const d = img.data
  // 环宽要够大，才看得出"边缘一圈透镜"；量程吃满，最大位移 ≈ strength px
  const band = Math.max(12, Math.min(30, Math.round(Math.min(W, H) * 0.28)))
  const amp = 127

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = x + 0.5
      const py = y + 0.5
      const sd = sdRoundRect(px, py, W, H, R)
      const depth = -sd
      let dx = 0
      let dy = 0
      if (depth > -band && depth < band) {
        const t = Math.max(0, 1 - Math.max(0, depth) / band)
        const e = 1
        const nx = sdRoundRect(px + e, py, W, H, R) - sdRoundRect(px - e, py, W, H, R)
        const ny = sdRoundRect(px, py + e, W, H, R) - sdRoundRect(px, py - e, W, H, R)
        const len = Math.hypot(nx, ny) || 1
        // smoothstep：边缘最强、向内平滑衰减，避免出现一条硬带
        const k = t * t * (3 - 2 * t) * amp
        dx = -(nx / len) * k
        dy = -(ny / len) * k
      }
      const i = (y * W + x) * 4
      d[i] = Math.max(0, Math.min(255, Math.round(128 + dx)))
      d[i + 1] = Math.max(0, Math.min(255, Math.round(128 + dy)))
      d[i + 2] = 128
      d[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

function sdRoundRect(px: number, py: number, W: number, H: number, R: number): number {
  const hx = W / 2
  const hy = H / 2
  const qx = Math.abs(px - hx) - (hx - R)
  const qy = Math.abs(py - hy) - (hy - R)
  const ax = Math.max(qx, 0)
  const ay = Math.max(qy, 0)
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - R
}

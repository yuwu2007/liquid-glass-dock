import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * RefractionImage —— 不依赖 `backdrop-filter: url()` 的折射方案。
 *
 * 原理：把背景图本身当作采样源，用 SVG `feDisplacementMap` 按圆角矩形法线
 * 把边缘像素往内推，形成透镜边缘的弯曲。SVG 滤镜在 Safari / Firefox / 微信 X5
 * 都支持（不兼容的只是 `backdrop-filter` 收不收 `url()`）。
 *
 * 代价：折的是"你给的那张图"，不是页面实时合成内容 —— 适合壁纸、头图、封面。
 *
 * 实现细节（踩过的坑）：整个折射都在 SVG 内部完成（<image> + filter）。
 * 不要用 CSS `filter: url()` 作用在 HTML <img> 上 —— 那样滤镜区域按 HTML 盒模型
 * 计算，边缘会露出一条笔直的裁切断口。
 */
export default function RefractionImage({
  src,
  radius = 28,
  strength = 22,
  blur = 5,
  className = '',
  children,
}: {
  src: string
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
  const [size, setSize] = useState({ w: 0, h: 0 })

  const pad = Math.ceil(Math.max(strength * 2, blur * 3))

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    let raf = 0
    const build = () => {
      raf = 0
      const w = Math.round(el.offsetWidth)
      const h = Math.round(el.offsetHeight)
      if (w < 40 || h < 40) return
      setSize({ w, h })
      setMap(buildEdgeMap(w + pad * 2, h + pad * 2, pad, pad, w, h, Math.min(radius, h / 2), strength))
    }
    build()
    const ro = new ResizeObserver(() => {
      if (!raf) raf = requestAnimationFrame(build)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [radius, strength, pad])

  const W = size.w + pad * 2
  const H = size.h + pad * 2

  return (
    <div
      ref={wrapRef}
      className={`relative overflow-hidden ${className}`.trim()}
      style={{ borderRadius: radius }}
      data-refraction-image
    >
      {size.w > 0 && (
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${size.w} ${size.h}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <filter
              id={filterId}
              filterUnits="userSpaceOnUse"
              primitiveUnits="userSpaceOnUse"
              x={-pad}
              y={-pad}
              width={W}
              height={H}
              colorInterpolationFilters="sRGB"
            >
              {map && (
                <feImage href={map} x={-pad} y={-pad} width={W} height={H} preserveAspectRatio="none" result="lens" />
              )}
              <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="soft" />
              <feDisplacementMap in="soft" in2="lens" scale={strength} xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </defs>
          <image
            href={src}
            x={-pad}
            y={-pad}
            width={W}
            height={H}
            preserveAspectRatio="xMidYMid slice"
            filter={`url(#${filterId})`}
          />
        </svg>
      )}

      {/* 玻璃感：压暗 + 上缘高光 + 内描边，和 backdrop 版保持同一套观感 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          borderRadius: radius,
          background:
            'radial-gradient(120% 100% at 50% 0%, rgba(255,255,255,0.16), transparent 55%), radial-gradient(140% 120% at 50% 120%, rgba(0,0,0,0.05), transparent 62%)',
          boxShadow:
            'inset 0 0 0 1px rgba(255,255,255,0.30), inset 0 6px 16px -10px rgba(255,255,255,0.55), inset 0 -8px 16px -14px rgba(0,0,0,0.18)',
        }}
      />

      <div className="relative">{children}</div>
    </div>
  )
}

/**
 * 生成位移贴图：R/G 通道编码"往内推"的方向，越贴边越强。
 * 画布带 padding，弧度对齐面板矩形（ox,oy,PanelW,PanelH），
 * 避免位移贴图和源图在边缘错位。
 */
function buildEdgeMap(
  W: number,
  H: number,
  ox: number,
  oy: number,
  PanelW: number,
  PanelH: number,
  R: number,
  strength: number,
): string {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const img = ctx.createImageData(W, H)
  const d = img.data
  const band = Math.max(8, Math.min(30, Math.round(Math.min(PanelW, PanelH) * 0.22)))
  const amp = Math.min(60, strength * 1.6)

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = x + 0.5 - ox
      const py = y + 0.5 - oy
      const sd = sdRoundRect(px, py, PanelW, PanelH, R) // <0 在内部
      const depth = -sd
      let dx = 0
      let dy = 0
      if (depth > -band && depth < band) {
        const t = Math.max(0, 1 - Math.max(0, depth) / band)
        const e = 1
        const nx = sdRoundRect(px + e, py, PanelW, PanelH, R) - sdRoundRect(px - e, py, PanelW, PanelH, R)
        const ny = sdRoundRect(px, py + e, PanelW, PanelH, R) - sdRoundRect(px, py - e, PanelW, PanelH, R)
        const len = Math.hypot(nx, ny) || 1
        const k = t * t * amp
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

/** 圆角矩形的有符号距离（内部为负） */
function sdRoundRect(px: number, py: number, W: number, H: number, R: number): number {
  const hx = W / 2
  const hy = H / 2
  const qx = Math.abs(px - hx) - (hx - R)
  const qy = Math.abs(py - hy) - (hy - R)
  const ax = Math.max(qx, 0)
  const ay = Math.max(qy, 0)
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - R
}

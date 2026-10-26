import type { ReactNode } from 'react'
import LiquidSurface from './LiquidSurface'
import { DOCK_DARK_LENS_PROFILE, DOCK_TUNED_LOCAL_LENS_PROFILE } from './dockLensProfile'

/**
 * GlassPanel —— 一块大的液态玻璃面板（不是为了导航，纯粹展示通透与折射）。
 *
 * 和 DockGlassSurface 的差别只有三处：
 * - 圆角给到 28px（导航是胶囊，面板是卡片）；
 * - 描边环更宽（ringWidth 5），大块面上边缘折射才明显；
 * - tint 更轻（0.12），让背后照片透得更彻底。
 *
 * 关掉 panel 后面的内容，它看起来就只是一层薄雾 —— 玻璃必须有东西可折。
 */
export default function GlassPanel({
  children,
  className = '',
  radius = 28,
  enableLens = 'auto',
}: {
  children: ReactNode
  className?: string
  radius?: number
  enableLens?: 'auto' | boolean
}) {
  return (
    <LiquidSurface
      as="div"
      lensPrefix="yxp"
      rimClassName="yx-rim-smooth"
      ringWidth={5}
      radius={radius}
      rootClassName="relative w-full"
      className={`w-full yx-color-edge overflow-hidden ${className}`.trim()}
      enableLens={enableLens}
      profile={DOCK_TUNED_LOCAL_LENS_PROFILE}
      darkProfile={DOCK_DARK_LENS_PROFILE}
      style={{
        backdropFilter: 'var(--yx-liquid-native-filter, blur(3px) saturate(1.15))',
        WebkitBackdropFilter: 'var(--yx-liquid-native-filter, blur(3px) saturate(1.15))',
      }}
      tint={0.12}
      tintDarkOpacity={0.05}
      tintDark="38, 40, 44"
    >
      {children}
    </LiquidSurface>
  )
}

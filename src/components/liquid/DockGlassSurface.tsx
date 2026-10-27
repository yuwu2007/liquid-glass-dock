import { useMemo } from 'react'
import type { ReactNode } from 'react'
import LiquidSurface from './LiquidSurface'
import type { LensProfile } from './buildLiquidLens'
import { DOCK_DARK_LENS_PROFILE, DOCK_FINE_LENS_PROFILE, DOCK_LENS_PROFILE, DOCK_LOCAL_LENS_PROFILE, DOCK_TUNED_LOCAL_LENS_PROFILE } from './dockLensProfile'

export type DockOpticsVariant = 'current' | 'local' | 'local-tuned' | 'fine'

export interface DockGlassSurfaceProps {
  children: ReactNode
  /** 内置光学预设；profile 会叠加在所选预设之上。 */
  variant?: DockOpticsVariant
  /** auto = 只在支持 backdrop-filter:url() 的 Chromium 启用，其他浏览器磨砂兜底。 */
  enableLens?: 'auto' | boolean
  /** 实时调整光学参数；与 useMemo 配合可避免不必要的贴图重建。 */
  profile?: Partial<LensProfile>
  /** 深色主题追加覆盖；不传使用底栏的深色预设。 */
  darkProfile?: Partial<LensProfile>
  radius?: number | 'capsule'
  ringWidth?: number
  /** 浅色实际奶白不透明度为 tint × 0.6。 */
  tint?: number
  tintDarkOpacity?: number
}

/** Bottom-nav material. Keep layout, sampling profile and theme tint together. */
export default function DockGlassSurface({
  children,
  variant = 'local-tuned',
  enableLens = 'auto',
  profile,
  darkProfile = DOCK_DARK_LENS_PROFILE,
  radius = 'capsule',
  ringWidth = 3,
  tint = 0.18,
  tintDarkOpacity = 0.06,
}: DockGlassSurfaceProps) {
  const preset = variant === 'current' ? DOCK_LENS_PROFILE
    : variant === 'fine' ? DOCK_FINE_LENS_PROFILE
      : variant === 'local' ? DOCK_LOCAL_LENS_PROFILE : DOCK_TUNED_LOCAL_LENS_PROFILE
  const mergedProfile = useMemo(() => profile ? { ...preset, ...profile } : preset, [preset, profile])
  return (
    <LiquidSurface
      as="nav"
      lensPrefix="yx"
      rimClassName="yx-rim-smooth"
      radius={radius}
      ringWidth={ringWidth}
      aria-label="底部导航"
      rootClassName="relative w-full max-w-[440px]"
      className="w-full yx-color-edge overflow-hidden"
      enableLens={enableLens}
      profile={mergedProfile}
      darkProfile={darkProfile}
      style={{ backdropFilter: 'var(--yx-liquid-native-filter, blur(3px) saturate(1.15))', WebkitBackdropFilter: 'var(--yx-liquid-native-filter, blur(3px) saturate(1.15))' }}
      tint={tint}
      tintDarkOpacity={tintDarkOpacity}
      tintDark="38, 40, 44"
    >
      {children}
    </LiquidSurface>
  )
}

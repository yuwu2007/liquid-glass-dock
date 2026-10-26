import type { ReactNode } from 'react'
import LiquidSurface from './LiquidSurface'
import { DOCK_DARK_LENS_PROFILE, DOCK_FINE_LENS_PROFILE, DOCK_LENS_PROFILE, DOCK_LOCAL_LENS_PROFILE, DOCK_TUNED_LOCAL_LENS_PROFILE } from './dockLensProfile'

export type DockOpticsVariant = 'current' | 'local' | 'local-tuned' | 'fine'

/** Bottom-nav material. Keep layout, sampling profile and theme tint together. */
export default function DockGlassSurface({ children, variant = 'local-tuned' }: { children: ReactNode; variant?: DockOpticsVariant }) {
  const profile = variant === 'current' ? DOCK_LENS_PROFILE
    : variant === 'fine' ? DOCK_FINE_LENS_PROFILE
      : variant === 'local' ? DOCK_LOCAL_LENS_PROFILE : DOCK_TUNED_LOCAL_LENS_PROFILE
  return (
    <LiquidSurface
      as="nav"
      lensPrefix="yx"
      rimClassName="yx-rim-smooth"
      ringWidth={3}
      aria-label="底部导航"
      rootClassName="relative w-full max-w-[440px]"
      className="w-full yx-color-edge overflow-hidden"
      profile={profile}
      darkProfile={DOCK_DARK_LENS_PROFILE}
      style={{ backdropFilter: 'var(--yx-liquid-native-filter, blur(3px) saturate(1.15))', WebkitBackdropFilter: 'var(--yx-liquid-native-filter, blur(3px) saturate(1.15))' }}
      tint={0.18}
      tintDarkOpacity={0.06}
      tintDark="38, 40, 44"
    >
      {children}
    </LiquidSurface>
  )
}

import type { LensProfile } from './buildLiquidLens'

/** Bottom navigation's blurred, background-sampled edge. Keep these objects stable for LiquidSurface effects. */
export const DOCK_LENS_PROFILE = {
  refractiveEdge: true,
  /**
   * 2026-09-27 站长反馈 + 实测：外扩采样区会把**栏外**的邻近内容折进栏体边缘
   * （实测：栏外那张彩色卡片会以压扁色带出现在栏体上缘 2~3px，色值跟着卡片走），
   * 而他要的是「边缘折的是栏后内容」（微信内核上看到的就是这一档）。
   * → 关掉外扩：padding=0，采样区=栏体本身。
   */
  captureOutside: false,
  /**
   * 全站口径（2026-09-27 站长，多轮定稿）：
   * · 上下（直线边）：唇宽 band 11px + 采样距离 pull 22px；向两端延续时逐渐收至 7.5px。
   * · 左右（圆角端）：嫌**太深**要收 → 唇宽 endBand 7.5px + 采样距离 endPull 15px（原先端部 16 / 26 比直线边还狠）。
   * 注 1：判断"深浅"看 band（可见唇宽），pull 只决定采样多远 —— 实测 pull 只要 ≥ band，整条唇采到的都是钳在
   *       边上的同一行内容，渲出来逐像素一致（所以别指望只调 pull 能看出变化）。
   * 注 2：原先代码把 endPull/endBand 钳成 ≥ 直线边，端部只能更宽，"左右收"表达不出来；已按站长口径放开下钳
   *       （endPull 地板 8、endBand 地板 6）。另一位助手若要继续调端部，请保持 endXxx < 直线边这个方向。
   */
  pull: 22,
  band: 11,
  endPull: 15,
  endBand: 7.5,
  endReach: 30,
  localizeEndColor: true,
  endColorSpreadX: 3.5,
  // Short vertical falloff lets the lower arc release color as its source moves upward.
  endColorSpreadY: 5,
  scale: 0.12,
  bend: 0.85,
  blur: 2.2,
  glassSaturate: 1.05,
  specularSlope: 1.1,
  specularIntercept: 0,
  sigma: 2.7,
  // Spread color along the straight edges; the end mask fades it into the thinner rounded lip.
  edgeColorSpreadY: 14,
  edgeColorSpreadX: 8,
  // Mostly local color: avoid dark mud and synthetic hues from channel-wise extrema.
  edgeColorSpreadGamma: 1.15,
  edgeSpreadMix: 0.17,
  saturate: 1.2,
  rimSmooth: 0.6,
  wobble: 0,
} satisfies Partial<LensProfile>

export const DOCK_DARK_LENS_PROFILE = {
  // Content-only highlight curve: dark pixels stay dark, pale samples approach white.
  edgeHighlightMode: true,
  specularSlope: 1,
  specularIntercept: 0,
  edgeLift: 0,
  saturate: 1.35,
  // A light-theme gamma would crush dim background colors into black.
  edgeColorSpreadGamma: 1,
} satisfies Partial<LensProfile>

/** Local comparison profile; the production dock continues to use DOCK_LENS_PROFILE. */
export const DOCK_LOCAL_LENS_PROFILE = {
  ...DOCK_LENS_PROFILE,
  localEndArc: true,
  endReach: 22,
  endColorSpreadX: 2.8,
  endColorSpreadY: 3.5,
  edgeColorSpreadX: 5,
  edgeColorSpreadY: 8,
  edgeSpreadMix: 0.08,
} satisfies Partial<LensProfile>

/** Opt-in comparison: tighten and sharpen straight edges without thinning the rounded ends. */
export const DOCK_TUNED_LOCAL_LENS_PROFILE = {
  ...DOCK_LOCAL_LENS_PROFILE,
  band: 10,
  straightBend: 1.15,
  straightEdgeSigma: 2.25,
} satisfies Partial<LensProfile>

/** Compare a thinner, sharper straight lip while preserving the current rounded ends. */
export const DOCK_FINE_LENS_PROFILE = {
  ...DOCK_LENS_PROFILE,
  band: 8,
  straightEdgeSigma: 1.8,
  cornerShoulderBand: 1.8,
} satisfies Partial<LensProfile>

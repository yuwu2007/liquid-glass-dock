import { buildLiquidLens, DEFAULT_LENS_PROFILE } from './buildLiquidLens'

const TEMPLATE_ID = 'yx-cached-material'
const TEMPLATE_REFS = /yx-cached-material-(concave|scale|line)-lens/g

/** 仅缓存几何贴图及滤镜定义，不缓存页面像素、文本或用户数据。 */
export function createLiquidLensCache(
  build: typeof buildLiquidLens = buildLiquidLens,
  { maxEntries = 12, maxChars = 2_000_000 } = {},
): typeof buildLiquidLens {
  const entries = new Map<string, string>()
  let chars = 0
  return (width, height, radius, prefix, profile = DEFAULT_LENS_PROFILE, line = null, inset = 0) => {
    // 对象属性顺序不影响贴图；主题、尺寸、圆角、边缘和模糊参数都必须参与缓存键。
    const ordered = (value: object | null) => value && Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    const key = JSON.stringify([width, height, radius, ordered(profile), ordered(line), inset])
    let svg = entries.get(key)
    if (svg) {
      entries.delete(key)
      entries.set(key, svg)
    } else {
      svg = build(width, height, radius, TEMPLATE_ID, profile, line, inset)
      // Canvas 暂不可用时不缓存空结果；大面板不挤占有限缓存。
      if (svg && maxEntries > 0 && svg.length <= maxChars) {
        entries.set(key, svg)
        chars += svg.length
        while (entries.size > maxEntries || chars > maxChars) {
          const oldest = entries.keys().next().value!
          chars -= entries.get(oldest)!.length
          entries.delete(oldest)
        }
      }
    }
    // 同屏多个弹窗必须各有滤镜 ID，复用贴图不能让它们串用或引用已卸载的节点。
    return svg.replace(TEMPLATE_REFS, (_, kind: string) => `${prefix}-${kind}-lens`)
  }
}

export const buildCachedLiquidLens = createLiquidLensCache()

import { useMemo, useRef, useState } from 'react'
import { Bell, Compass, Copy, Home, Link2, PenLine, RotateCcw, Settings2, User } from 'lucide-react'
import RefractionImage from './components/liquid/RefractionImage'
import DockGlassSurface from './components/liquid/DockGlassSurface'

/**
 * Liquid Glass Playground
 * 一整张可滚动长图 + 一块液态玻璃；所有光学参数开放，调好直接复制 TSX / 分享链接。
 * 形状：圆角卡片、胶囊底栏、圆形、方块（直角到圆角都可）。
 */

const TABS = [
  { label: '首页', Icon: Home },
  { label: '随笔', Icon: PenLine },
  { label: '发现', Icon: Compass },
  { label: '消息', Icon: Bell },
  { label: '我的', Icon: User },
] as const

const BG = `${import.meta.env.BASE_URL}bg/scroll.jpg`

type Shape = 'panel' | 'pill' | 'circle' | 'square'

interface Params {
  strength: number
  bevel: number
  radius: number
  blur: number
  veil: number
  saturation: number
  specular: number
  ior: number
  lightAngle: number
  size: number
}

const DEFAULTS: Params = {
  strength: 30,
  bevel: 18,
  radius: 26,
  blur: 3,
  veil: 0.06,
  saturation: 1.15,
  specular: 1,
  ior: 1.5,
  lightAngle: -55,
  size: 200,
}

const PRESETS: { name: string; patch: Partial<Params> }[] = [
  { name: '细腻', patch: { strength: 16, bevel: 14, blur: 3, veil: 0.05, specular: 0.9 } },
  { name: '标准', patch: { ...DEFAULTS } },
  { name: '夸张', patch: { strength: 48, bevel: 26, blur: 2, veil: 0.04, specular: 1.2 } },
  { name: '高透', patch: { strength: 30, bevel: 18, blur: 0.5, veil: 0.02, saturation: 1.1 } },
  { name: '磨砂', patch: { strength: 24, bevel: 18, blur: 8, veil: 0.12, saturation: 1.2 } },
]

const SHAPES: { id: Shape; label: string }[] = [
  { id: 'panel', label: '圆角卡片' },
  { id: 'pill', label: '胶囊底栏' },
  { id: 'circle', label: '圆形' },
  { id: 'square', label: '方块' },
]

/** 从分享链接恢复参数（?strength=48&bevel=26&shape=circle...） */
function readParams(): { params: Params; shape: Shape } {
  const q = new URLSearchParams(location.search)
  const num = (k: string, fallback: number) => {
    const v = q.get(k)
    if (v === null || v === '') return fallback
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }
  const shape = (q.get('shape') as Shape) || 'panel'
  return {
    shape: SHAPES.some(s => s.id === shape) ? shape : 'panel',
    params: {
      strength: num('strength', DEFAULTS.strength),
      bevel: num('bevel', DEFAULTS.bevel),
      radius: num('radius', DEFAULTS.radius),
      blur: num('blur', DEFAULTS.blur),
      veil: num('veil', DEFAULTS.veil),
      saturation: num('saturation', DEFAULTS.saturation),
      specular: num('specular', DEFAULTS.specular),
      ior: num('ior', DEFAULTS.ior),
      lightAngle: num('lightAngle', DEFAULTS.lightAngle),
      size: num('size', DEFAULTS.size),
    },
  }
}

/** 线上底栏真正在用的材质参数（DockGlassSurface 默认 variant="local-tuned"） */
const LIVE_PARAMS: [string, string][] = [
  ['直边唇宽 band', '10px'],
  ['直边采样 pull', '22px'],
  ['straightBend / Sigma', '1.15 / 2.25'],
  ['圆角端 endBand / endPull', '7.5px / 15px'],
  ['endReach', '22px'],
  ['模糊 blur', '2.2（兜底 blur(3px) saturate(1.15)）'],
  ['饱和 saturate / glassSaturate', '1.2 / 1.05'],
  ['高光 specularSlope / sigma', '1.1 / 2.7'],
  ['rimSmooth', '0.6'],
  ['tint / ringWidth', '0.18 / 3px'],
]

const LIVE_CODE = `import DockGlassSurface from './components/liquid/DockGlassSurface'

{/* 线上底栏同款材质：variant 默认就是 local-tuned。
    真实折射只在 Chromium 启用，其余内核自动落加厚磨砂。 */}
<DockGlassSurface>
  <nav className="flex items-center justify-between px-2 py-2">
    {/* 首页 / 随笔 / 发现 / 消息 / 我的 */}
  </nav>
</DockGlassSurface>`

export default function App() {
  const [initial] = useState(readParams)
  const [params, setParams] = useState<Params>(initial.params)
  const [shape, setShape] = useState<Shape>(initial.shape)
  const [active, setActive] = useState(0)
  const [uiOpen, setUiOpen] = useState(false)
  const [engine, setEngine] = useState<'image' | 'live'>('image')
  const [copied, setCopied] = useState('')
  const bgRef = useRef<HTMLImageElement>(null)

  const set = <K extends keyof Params>(key: K, value: Params[K]) =>
    setParams(p => ({ ...p, [key]: value }))

  const radius = shape === 'circle' ? params.size / 2 : shape === 'pill' ? 999 : params.radius
  const isFixed = shape === 'circle' || shape === 'square'

  const code = useMemo(() => {
    const lines = [
      `  radius={${Math.round(radius)}}`,
      `  bevel={${params.bevel}}`,
      `  strength={${params.strength}}`,
      `  ior={${params.ior}}`,
      `  blur={${params.blur}}`,
      `  veil={${params.veil}}`,
      `  saturation={${params.saturation}}`,
      `  specular={${params.specular}}`,
      `  lightAngle={${params.lightAngle}}`,
    ]
    const sizing = isFixed
      ? `  style={{ width: ${params.size}, height: ${params.size} }}`
      : `  className="w-full"`
    const children =
      shape === 'pill'
        ? `  <nav className="flex items-center justify-between px-2 py-2">{/* 5 个标签 */}</nav>`
        : shape === 'panel'
          ? `  <div className="px-5 py-4">内容</div>`
          : null
    return `import { useRef } from 'react'
import RefractionImage from './components/liquid/RefractionImage'

const bgRef = useRef<HTMLImageElement>(null)

{/* 背景图：玻璃折的就是它，必须同一个 src */}
<img ref={bgRef} src="/bg.jpg" className="block w-full" />

<RefractionImage
  src="/bg.jpg"
  backdropRef={bgRef}
${lines.join('\n')}
${sizing}
${children ? `>\n${children}\n</RefractionImage>` : '/>'}`
  }, [params, radius, shape, isFixed])

  const shareUrl = useMemo(() => {
    const q = new URLSearchParams()
    q.set('shape', shape)
    Object.entries(params).forEach(([k, v]) => q.set(k, String(v)))
    return `${location.origin}${location.pathname}?${q.toString()}`
  }, [params, shape])

  const copy = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(tag)
    window.setTimeout(() => setCopied(''), 1600)
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-neutral-900">
      <div className="h-full w-full overflow-y-auto overscroll-contain">
        <img ref={bgRef} src={BG} alt="" draggable={false} className="block w-full select-none" />
      </div>

      <p className="pointer-events-none absolute left-1/2 top-5 z-10 m-0 -translate-x-1/2 whitespace-nowrap text-[11px] tracking-[0.18em] text-neutral-500">
        上下滑动换背景 · 右上角调参
      </p>

      <button
        type="button"
        aria-label="调参"
        onClick={() => setUiOpen(v => !v)}
        className="absolute right-4 top-4 z-20 grid h-9 w-9 place-items-center rounded-full bg-white/85 text-neutral-700 shadow-md active:scale-95"
      >
        <Settings2 className="h-4 w-4" />
      </button>

      {uiOpen && (
        <div className="absolute right-3 top-16 z-20 max-h-[74vh] w-[min(92vw,340px)] overflow-y-auto rounded-2xl bg-white/95 p-4 text-neutral-800 shadow-2xl">
          <div className="flex items-center justify-between">
            <p className="m-0 text-[13px] font-bold">液态玻璃调参</p>
            <button
              type="button"
              onClick={() => setParams({ ...DEFAULTS })}
              className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-1 text-[11px] text-neutral-500"
            >
              <RotateCcw className="h-3 w-3" /> 重置
            </button>
          </div>

          {/* 引擎：全兼容图片折射 / 线上原版实时折射 */}
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {(['image', 'live'] as const).map(e => (
              <button
                key={e}
                type="button"
                onClick={() => setEngine(e)}
                className={`rounded-lg px-2 py-1.5 text-[11px] ${
                  engine === e ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                {e === 'image' ? '全兼容（图片折射）' : '线上原版（实时）'}
              </button>
            ))}
          </div>

          {engine === 'image' && (
          <>
          {/* 形状 */}
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {SHAPES.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => setShape(s.id)}
                className={`rounded-lg px-1 py-1.5 text-[11px] ${
                  shape === s.id ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* 预设 */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PRESETS.map(p => (
              <button
                key={p.name}
                type="button"
                onClick={() => setParams(cur => ({ ...cur, ...p.patch }))}
                className="rounded-full border border-neutral-200 px-2.5 py-1 text-[11px] text-neutral-600 active:bg-neutral-100"
              >
                {p.name}
              </button>
            ))}
          </div>

          <div className="mt-3 space-y-2.5">
            <Slider label="光学厚度" value={params.strength} min={0} max={80} step={1} unit="px" onChange={v => set('strength', v)} />
            <Slider label="折射环宽" value={params.bevel} min={4} max={80} step={1} unit="px" onChange={v => set('bevel', v)} />
            {(shape === 'panel' || shape === 'square') && (
              <Slider label="圆角" value={params.radius} min={0} max={100} step={1} unit="px" onChange={v => set('radius', v)} />
            )}
            {isFixed && (
              <Slider label="尺寸" value={params.size} min={100} max={320} step={2} unit="px" onChange={v => set('size', v)} />
            )}
            <Slider label="折射率" value={params.ior} min={1} max={2.2} step={0.01} onChange={v => set('ior', v)} />
            <Slider label="模糊" value={params.blur} min={0} max={16} step={0.5} unit="px" onChange={v => set('blur', v)} />
            <Slider label="奶白" value={params.veil} min={0} max={0.3} step={0.01} format={v => `${Math.round(v * 100)}%`} onChange={v => set('veil', v)} />
            <Slider label="饱和度" value={params.saturation} min={0.5} max={2} step={0.05} onChange={v => set('saturation', v)} />
            <Slider label="高光" value={params.specular} min={0} max={2} step={0.05} onChange={v => set('specular', v)} />
            <Slider label="光照角度" value={params.lightAngle} min={-180} max={180} step={5} unit="°" onChange={v => set('lightAngle', v)} />
          </div>

          </>
          )}

          {engine === 'live' && (
            <div className="mt-3">
              <p className="m-0 text-[11px] leading-4 text-neutral-500">
                就是线上底栏那套材质（<code>variant="local-tuned"</code>），不是图片折射。
                真实折射只在 Chromium 启用，iPhone / 微信会落回加厚磨砂——这是它的能力边界，不是参数问题。
              </p>
              <dl className="m-0 mt-2 space-y-1">
                {LIVE_PARAMS.map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3 text-[11px]">
                    <dt className="shrink-0 text-neutral-400">{k}</dt>
                    <dd className="m-0 text-right font-mono text-neutral-800">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* 代码导出 */}
          <div className="mt-4 rounded-xl bg-neutral-950 p-2.5">
            <div className="flex items-center justify-between">
              <p className="m-0 text-[11px] font-semibold text-neutral-400">当前参数的代码</p>
              <button
                type="button"
                onClick={() => copy(engine === 'live' ? LIVE_CODE : code, 'code')}
                className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[11px] text-white"
              >
                <Copy className="h-3 w-3" /> {copied === 'code' ? '已复制' : '复制'}
              </button>
            </div>
            <pre className="m-0 mt-2 max-h-44 overflow-auto whitespace-pre text-[10px] leading-4 text-emerald-200">{engine === 'live' ? LIVE_CODE : code}</pre>
          </div>

          {engine === 'image' && (
          <button
            type="button"
            onClick={() => copy(shareUrl, 'link')}
            className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-neutral-900 px-3 py-2 text-[12px] text-white"
          >
            <Link2 className="h-3.5 w-3.5" /> {copied === 'link' ? '链接已复制' : '复制分享链接（带全部参数）'}
          </button>
          )}
        </div>
      )}

      {/* 线上原版：实时 backdrop 折射（Chromium），与全兼容版并排可切 */}
      {engine === 'live' && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-[max(14px,env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto w-full max-w-[430px] [&_nav]:text-white">
            <DockGlassSurface enableLens>
              <div className="flex items-center justify-between px-2 py-2">
                {TABS.map(({ label, Icon }, i) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setActive(i)}
                    aria-label={label}
                    className={`flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 ${
                      active === i ? 'text-white' : 'text-white/60'
                    }`}
                  >
                    <Icon className="h-[21px] w-[21px]" strokeWidth={active === i ? 2.3 : 1.9} />
                    <span className={`text-[10px] leading-none ${active === i ? 'font-semibold' : ''}`}>{label}</span>
                  </button>
                ))}
              </div>
            </DockGlassSurface>
          </div>
        </div>
      )}

      {/* 玻璃本体（全兼容图片折射） */}
      {engine === 'image' && (
      <div
        className={
          shape === 'pill'
            ? 'pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-[max(14px,env(safe-area-inset-bottom))]'
            : 'pointer-events-none fixed inset-0 z-10 flex items-center justify-center px-6'
        }
      >
        <RefractionImage
          src={BG}
          backdropRef={bgRef}
          radius={radius}
          bevel={params.bevel}
          strength={params.strength}
          ior={params.ior}
          blur={params.blur}
          veil={params.veil}
          saturation={params.saturation}
          specular={params.specular}
          lightAngle={params.lightAngle}
          style={isFixed ? { width: params.size, height: params.size, flex: 'none' } : undefined}
          className={`pointer-events-auto shadow-[0_18px_44px_-18px_rgba(0,0,0,0.5)] ${
            isFixed ? '' : 'w-full max-w-[430px]'
          }`}
        >
          {shape === 'pill' ? (
            <nav className="flex items-center justify-between px-2 py-2 mix-blend-difference">
              {TABS.map(({ label, Icon }, i) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={label}
                  aria-current={active === i}
                  className={`flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 transition-colors ${
                    active === i ? 'text-white' : 'text-white/60'
                  }`}
                >
                  <Icon className="h-[21px] w-[21px]" strokeWidth={active === i ? 2.3 : 1.9} />
                  <span className={`text-[10px] leading-none ${active === i ? 'font-semibold' : ''}`}>{label}</span>
                </button>
              ))}
            </nav>
          ) : shape === 'panel' ? (
            <div className="px-5 py-4 mix-blend-difference">
              <p className="m-0 text-[10px] uppercase tracking-[0.22em] text-white/70">Liquid glass</p>
              <p className="m-0 mt-1 text-lg font-bold text-white">全兼容液态玻璃</p>
              <p className="m-0 mt-1 text-xs leading-5 text-white/80">
                斯涅尔折射 + 边缘高光。拖参数看它怎么变，调好点复制。
              </p>
            </div>
          ) : null}
        </RefractionImage>
      </div>
      )}
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit = '',
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  format?: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-[11px]">
        <span className="text-neutral-500">{label}</span>
        <span className="font-mono text-neutral-800">{format ? format(value) : `${value}${unit}`}</span>
      </span>
      <input
        type="range"
        className="mt-0.5 w-full accent-neutral-900"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
      />
    </label>
  )
}

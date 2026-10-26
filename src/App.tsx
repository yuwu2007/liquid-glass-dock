import { useRef, useState } from 'react'
import { Bell, Compass, Home, PenLine, Settings2, User } from 'lucide-react'
import RefractionImage from './components/liquid/RefractionImage'

/**
 * 单效果演示：一整张长图 + 一块液态玻璃（底栏/大面板可切）。
 * 右上角小按钮收起/展开切换：折射三档、玻璃两种形态；平时不挡画面。
 *
 * 长图顺序：折射校准图（网格/彩线/文字，最容易看出弯折）+ 6 张照片。
 */
const TABS = [
  { label: '首页', Icon: Home },
  { label: '随笔', Icon: PenLine },
  { label: '发现', Icon: Compass },
  { label: '消息', Icon: Bell },
  { label: '我的', Icon: User },
] as const

const BG = `${import.meta.env.BASE_URL}bg/scroll.jpg`

/** 折射三档：底栏只有 60px 高，同样的参数看起来比大面板弱，所以标准档给到 30 */
const LENS = {
  subtle: { bevel: 14, strength: 16 },
  standard: { bevel: 18, strength: 30 },
  bold: { bevel: 24, strength: 48 },
} as const

export default function App() {
  const [active, setActive] = useState(0)
  const [lens, setLens] = useState<keyof typeof LENS>('standard')
  const [shape, setShape] = useState<'dock' | 'panel'>('dock')
  const [uiOpen, setUiOpen] = useState(false)
  const bgRef = useRef<HTMLImageElement>(null)

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-neutral-900">
      <div className="h-full w-full overflow-y-auto overscroll-contain">
        <img
          ref={bgRef}
          src={BG}
          alt=""
          draggable={false}
          className="block w-full select-none"
        />
      </div>

      <p className="pointer-events-none absolute left-1/2 top-5 z-10 m-0 -translate-x-1/2 whitespace-nowrap text-[11px] tracking-[0.18em] text-neutral-500">
        上下滑动 · 看玻璃边缘的折射
      </p>

      {/* 切换入口：默认收起，不挡效果 */}
      <button
        type="button"
        aria-label="效果设置"
        onClick={() => setUiOpen(v => !v)}
        className="absolute right-4 top-4 z-20 grid h-9 w-9 place-items-center rounded-full bg-white/85 text-neutral-700 shadow-md active:scale-95"
      >
        <Settings2 className="h-4 w-4" />
      </button>

      {uiOpen && (
        <div className="absolute right-4 top-16 z-20 w-60 rounded-2xl bg-white p-3 text-neutral-800 shadow-xl">
          <p className="m-0 text-[11px] font-semibold text-neutral-400">折射力度</p>
          <div className="mt-1.5 flex gap-1.5">
            {(Object.keys(LENS) as (keyof typeof LENS)[]).map(k => (
              <button
                key={k}
                type="button"
                onClick={() => setLens(k)}
                className={`flex-1 rounded-full px-2 py-1.5 text-[12px] ${
                  lens === k ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                {k === 'subtle' ? '细腻' : k === 'standard' ? '标准' : '夸张'}
              </button>
            ))}
          </div>
          <p className="m-0 mt-3 text-[11px] font-semibold text-neutral-400">玻璃形态</p>
          <div className="mt-1.5 flex gap-1.5">
            {(['dock', 'panel'] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setShape(s)}
                className={`flex-1 rounded-full px-2 py-1.5 text-[12px] ${
                  shape === s ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                {s === 'dock' ? '底栏' : '大面板'}
              </button>
            ))}
          </div>
          <p className="m-0 mt-2.5 text-[10px] leading-4 text-neutral-400">
            当前：光学厚度 {LENS[lens].strength}px · 折射环宽 {LENS[lens].bevel}px
          </p>
        </div>
      )}

      {/* 玻璃本体：底栏或大面板，共用同一套斯涅尔折射 */}
      <div
        className={
          shape === 'dock'
            ? 'pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-[max(14px,env(safe-area-inset-bottom))]'
            : 'pointer-events-none fixed inset-x-0 top-[24vh] z-10 flex justify-center px-6'
        }
      >
        <RefractionImage
          src={BG}
          backdropRef={bgRef}
          radius={shape === 'dock' ? 34 : 26}
          bevel={LENS[lens].bevel}
          strength={LENS[lens].strength}
          blur={3}
          veil={0.06}
          saturation={1.15}
          className="pointer-events-auto w-full max-w-[430px] shadow-[0_18px_44px_-18px_rgba(0,0,0,0.5)]"
        >
          {shape === 'dock' ? (
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
                <span
                  className={`text-[10px] leading-none ${
                    active === i ? 'font-semibold' : 'font-normal'
                  }`}
                >
                  {label}
                </span>
              </button>
            ))}
          </nav>
          ) : (
            <div className="px-5 py-4 mix-blend-difference">
              <p className="m-0 text-[10px] uppercase tracking-[0.22em] text-white/70">Liquid glass</p>
              <p className="m-0 mt-1 text-lg font-bold text-white">全兼容液态玻璃</p>
              <p className="m-0 mt-1 text-xs leading-5 text-white/80">
                斯涅尔折射 + 边缘高光。滚动长图，看网格和山脊在边缘被折弯。
              </p>
            </div>
          )}
        </RefractionImage>
      </div>
    </div>
  )
}

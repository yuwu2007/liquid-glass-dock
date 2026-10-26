import { useRef, useState } from 'react'
import { Bell, Compass, Home, PenLine, User } from 'lucide-react'
import RefractionImage from './components/liquid/RefractionImage'

/**
 * 单效果演示：只有一块液态玻璃（底栏），后面是一整张长图。
 * 没有磨砂/实时/强度/深色这些对照开关——要看的就是"滚动时玻璃在折什么"。
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

export default function App() {
  const [active, setActive] = useState(0)
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
        上下滑动 · 看底栏边缘的折射
      </p>

      {/* 唯一的玻璃：液态玻璃底栏（斯涅尔折射 + 法线高光，全兼容） */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-[max(14px,env(safe-area-inset-bottom))]">
        <RefractionImage
          src={BG}
          backdropRef={bgRef}
          radius={34}
          bevel={16}
          strength={22}
          blur={3}
          veil={0.06}
          saturation={1.15}
          className="pointer-events-auto w-full max-w-[430px] shadow-[0_18px_44px_-18px_rgba(0,0,0,0.5)]"
        >
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
        </RefractionImage>
      </div>
    </div>
  )
}

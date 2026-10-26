import { useEffect, useRef, useState } from 'react'
import { Bell, Compass, Home, Moon, PenLine, Sun, User } from 'lucide-react'
import DockGlassSurface from './components/liquid/DockGlassSurface'
import DockSlider from './components/liquid/DockSlider'
import GlassPanel from './components/liquid/GlassPanel'
import { liquidLensCapability } from './components/liquid/buildLiquidLens'
import TopicSlider from './components/TopicSlider'

const TABS = [
  { label: '首页', Icon: Home },
  { label: '随笔', Icon: PenLine },
  { label: '发现', Icon: Compass },
  { label: '消息', Icon: Bell },
  { label: '我的', Icon: User },
] as const

const TOPICS = [
  { key: 'all', label: '全部' },
  { key: 'hot', label: '热门' },
  { key: 'follow', label: '关注' },
  { key: 'qa', label: '问答' },
] as const

const FEED = [
  { title: '把秋天装进杯子里', desc: '图书馆门口那棵银杏终于黄了。' },
  { title: '凌晨四点的自习室', desc: '最后一排的灯一直亮着。' },
  { title: '今日份猫猫出没', desc: '在二食堂后门晒太阳，摸它不跑。' },
]

/** 换背景是看玻璃用的：不同明暗、不同细节的照片，折射出来的边缘完全不一样 */
const BACKGROUNDS = [
  { key: 'forest', label: '山林', src: `${import.meta.env.BASE_URL}bg/cool.jpg` },
  { key: 'deep', label: '深海', src: `${import.meta.env.BASE_URL}bg/green.jpg` },
  { key: 'fjord', label: '峡湾', src: `${import.meta.env.BASE_URL}bg/warm.jpg` },
] as const

export default function App() {
  const [active, setActive] = useState(0)
  const [topic, setTopic] = useState<string>('all')
  const [bg, setBg] = useState<string>(BACKGROUNDS[0].key)
  const [dark, setDark] = useState(false)
  const itemRefs = useRef<(HTMLElement | null)[]>([])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  const photo = BACKGROUNDS.find(b => b.key === bg) ?? BACKGROUNDS[0]

  return (
    <div className="relative min-h-full">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-24 top-10 h-80 w-80 rounded-full bg-fuchsia-300/50 blur-3xl" />
        <div className="absolute -right-16 top-1/3 h-96 w-96 rounded-full bg-sky-300/50 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-80 w-[36rem] -translate-x-1/2 rounded-full bg-amber-200/50 blur-3xl" />
      </div>

      <main className="mx-auto flex max-w-5xl flex-col items-center gap-5 px-6 py-9">
        <header className="flex w-full items-center justify-between">
          <div>
            <h1 className="m-0 text-[1.35rem] font-extrabold tracking-tight">Liquid Dock</h1>
            <p className="m-0 mt-1 text-[0.8rem] text-neutral-500">
              液态玻璃底栏 + 弹簧滑动胶囊 + 可拖拽分段滑块（含橡皮筋边界）
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDark(v => !v)}
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-3.5 py-2 text-[0.78rem] text-neutral-700 backdrop-blur transition active:scale-95 dark:border-white/15 dark:bg-white/10 dark:text-white/80"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {dark ? '浅色' : '深色'}
          </button>
        </header>

        {/* 手机框：底栏压在一张真实照片上，玻璃才有东西可折 */}
        <div className="phone">
          <img src={photo.src} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/5 to-black/45" />

          <div className="relative flex h-full flex-col">
            <div className="px-4 pb-2 pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="m-0 text-[0.68rem] uppercase tracking-[0.18em] text-white/65">Campus</p>
                  <h2 className="m-0 mt-0.5 text-[1.05rem] font-extrabold text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.35)]">
                    今天也在好好生活
                  </h2>
                </div>
                <span className="grid h-9 w-9 place-items-center rounded-full bg-white/25 text-[0.7rem] font-bold text-white ring-1 ring-white/40 backdrop-blur">
                  L
                </span>
              </div>

              <div className="mt-3 rounded-full bg-white/45 p-1 ring-1 ring-white/35 backdrop-blur-lg">
                <TopicSlider options={TOPICS.map(t => ({ ...t }))} value={topic} onChange={setTopic} fill />
              </div>
            </div>

            {/* 一块大玻璃：不是为了导航，纯粹看通透度与边缘折射 */}
            <div className="px-4 pb-3">
              <GlassPanel className="px-4 py-3.5">
                <p className="m-0 text-[0.6rem] uppercase tracking-[0.22em] text-white/60">Liquid glass</p>
                <p className="m-0 mt-1 text-[0.98rem] font-extrabold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)]">
                  通透度演示
                </p>
                <p className="m-0 mt-1 text-[0.72rem] leading-5 text-white/75">
                  面板后面的山脊、树影会从玻璃里透出来，边缘处被折射拉弯。
                </p>
              </GlassPanel>
            </div>

            <div className="flex-1 space-y-3 overflow-hidden px-4">
              {FEED.map(item => (
                <article
                  key={item.title}
                  className="rounded-2xl border border-white/25 bg-white/55 p-3 shadow-[0_8px_24px_rgba(0,0,0,0.12)] backdrop-blur-md dark:border-white/10 dark:bg-black/25"
                >
                  <p className="m-0 text-[0.86rem] font-bold text-neutral-900 dark:text-white">{item.title}</p>
                  <p className="m-0 mt-0.5 text-[0.74rem] text-neutral-700 dark:text-white/70">{item.desc}</p>
                </article>
              ))}
            </div>

            {/* 底栏：玻璃材质 + 滑块 */}
            <div className="px-3 pb-3">
              <DockGlassSurface>
                <div className="relative grid grid-cols-5">
                  <DockSlider activeIndex={active} getItem={i => itemRefs.current[i]} />
                  {TABS.map(({ label, Icon }, i) => (
                    <button
                      key={label}
                      ref={el => {
                        itemRefs.current[i] = el
                      }}
                      type="button"
                      onClick={() => setActive(i)}
                      aria-current={active === i ? 'page' : undefined}
                      className={`relative z-[1] flex h-[58px] flex-col items-center justify-center gap-[3px] text-[0.62rem] transition-colors ${
                        active === i ? 'font-bold text-[#005BAC]' : 'text-white/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]'
                      }`}
                    >
                      <Icon className="h-[19px] w-[19px]" strokeWidth={1.9} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </DockGlassSurface>
            </div>
          </div>
        </div>

        {/* 换背景：同一块玻璃，不同底衬 */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <span className="text-[0.74rem] text-neutral-500">换背景看折射</span>
          {BACKGROUNDS.map(b => (
            <button
              key={b.key}
              type="button"
              onClick={() => setBg(b.key)}
              title={b.label}
              aria-label={b.label}
              className={`h-11 w-11 overflow-hidden rounded-xl ring-2 transition ${
                bg === b.key ? 'ring-[#005BAC]' : 'ring-transparent hover:ring-black/20'
              }`}
            >
              <img src={b.src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>

        <p className="m-0 text-[0.72rem] text-neutral-500">
          当前浏览器光学档位：
          <b className="ml-1 text-neutral-700 dark:text-neutral-200">
            {(() => {
              const cap = liquidLensCapability()
              return cap === 'full' ? 'full · 真折射（Chromium SVG 位移链）' : cap === 'static' ? 'static · 折射但滚动时降级（Android WebView）' : 'none · 兜底加厚模糊（iOS / Safari / Firefox）'
            })()}
          </b>
        </p>

        <p className="m-0 max-w-xl text-center text-[0.75rem] leading-6 text-neutral-500">
          拖滑块会跟手，越界时有阻尼橡皮筋；底栏胶囊由真实弹簧仿真驱动，带挤压回弹。
          换一张照片，底栏边缘的折射、染色和高光都会跟着变。
        </p>
      </main>
    </div>
  )
}

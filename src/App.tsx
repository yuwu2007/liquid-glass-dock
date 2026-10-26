import { useEffect, useRef, useState } from 'react'
import { Bell, Compass, Home, Moon, PenLine, Sun, User } from 'lucide-react'
import DockGlassSurface from './components/liquid/DockGlassSurface'
import DockSlider from './components/liquid/DockSlider'
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
  { title: '把秋天装进杯子里', desc: '图书馆门口那棵银杏终于黄了。', tint: 'from-amber-200 to-orange-300' },
  { title: '凌晨四点的自习室', desc: '最后一排的灯一直亮着。', tint: 'from-sky-200 to-indigo-300' },
  { title: '今日份猫猫出没', desc: '在二食堂后门晒太阳，摸它不跑。', tint: 'from-rose-200 to-pink-300' },
]

export default function App() {
  const [active, setActive] = useState(0)
  const [topic, setTopic] = useState<string>('all')
  const [dark, setDark] = useState(false)
  const itemRefs = useRef<(HTMLElement | null)[]>([])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  return (
    <div className="relative min-h-full">
      {/* 背景色块：玻璃要折射的东西 */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-24 top-10 h-80 w-80 rounded-full bg-fuchsia-300/50 blur-3xl" />
        <div className="absolute -right-16 top-1/3 h-96 w-96 rounded-full bg-sky-300/50 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-80 w-[36rem] -translate-x-1/2 rounded-full bg-amber-200/50 blur-3xl" />
      </div>

      <main className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-6 py-10">
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

        {/* 手机框：演示真实尺寸下的手感 */}
        <div className="phone">
          <div className="phone-aurora" />

          <div className="relative flex h-full flex-col">
            <div className="px-4 pb-2 pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="m-0 text-[0.68rem] uppercase tracking-[0.18em] text-neutral-400">Campus</p>
                  <h2 className="m-0 mt-0.5 text-[1.05rem] font-extrabold">今天也在好好生活</h2>
                </div>
                <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-fuchsia-400 to-sky-500 text-[0.7rem] font-bold text-white">
                  秀
                </span>
              </div>

              <div className="mt-3">
                <TopicSlider options={TOPICS.map(t => ({ ...t }))} value={topic} onChange={setTopic} fill />
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-hidden px-4">
              {FEED.map(item => (
                <article
                  key={item.title}
                  className="rounded-2xl border border-black/[0.06] bg-white/80 p-2.5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/[0.06]"
                >
                  <div className={`mb-2 h-24 rounded-xl bg-gradient-to-br ${item.tint}`} />
                  <p className="m-0 text-[0.86rem] font-bold">{item.title}</p>
                  <p className="m-0 mt-0.5 text-[0.74rem] text-neutral-500 dark:text-white/55">{item.desc}</p>
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
                        active === i ? 'font-bold text-[#005BAC]' : 'text-neutral-500 dark:text-white/60'
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

        <p className="m-0 max-w-xl text-center text-[0.75rem] leading-6 text-neutral-500">
          拖滑块会跟手，越界时有阻尼橡皮筋；底栏胶囊由真实弹簧仿真驱动，带挤压回弹。
          浅色 / 深色都走同一套材质与测量逻辑。
        </p>
      </main>
    </div>
  )
}

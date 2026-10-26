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
  { title: '雨后的操场', desc: '跑道上全是水洼，倒着整片天。' },
  { title: '深夜的便利店', desc: '关东煮的汤还在冒热气。' },
  { title: '图书馆五楼靠窗', desc: '这个位置下午三点最好睡。' },
  { title: '食堂新窗口', desc: '红烧肉盖饭十四块，值。' },
  { title: '社团招新', desc: '吉他社在操场边弹了一下午。' },
  { title: '期末周进度', desc: '第三篇论文，第二杯咖啡。' },
  { title: '晚课下课', desc: '路灯把影子拉得很长。' },
  { title: '宿舍阳台', desc: '晾着的被子有太阳的味道。' },
  { title: '夜跑五公里', desc: '跑到桥上的时候风最舒服。' },
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
        <header className="page-chrome flex w-full items-center justify-between">
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

          <div className="relative h-full">
            {/* 内容自己滚，底栏固定在屏幕上（真机上不滚 = 只能看第一屏） */}
            <div data-scroll="1" className="h-full overflow-y-auto overscroll-contain pb-[96px]">
            <div className="px-4 pb-2 pt-5 max-sm:pt-14">
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

            <div className="space-y-3 px-4 pb-2">
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

            </div>

            {/* 底栏：玻璃材质 + 滑块（绝对定位在滚动容器之上） */}
            <div className="absolute inset-x-0 bottom-0 px-3 pb-3">
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

        {/* 真机：演示页就是全屏 App，控制条浮在右上角 */}
        <div className="mobile-only fixed inset-x-0 top-0 z-50 items-center justify-end gap-2 px-3 pt-2">
          <button
            type="button"
            onClick={() => setDark(v => !v)}
            aria-label="切换深浅"
            className="grid h-8 w-8 place-items-center rounded-full bg-black/40 text-white ring-1 ring-white/25 backdrop-blur"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          {BACKGROUNDS.map(b => (
            <button
              key={b.key}
              type="button"
              onClick={() => setBg(b.key)}
              aria-label={b.label}
              className={`h-8 w-8 overflow-hidden rounded-full ring-2 ${bg === b.key ? 'ring-white' : 'ring-white/30'}`}
            >
              <img src={b.src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>

        {/* 换背景：同一块玻璃，不同底衬 */}
        <div className="page-chrome flex flex-wrap items-center justify-center gap-3">
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

        <p className="page-chrome m-0 text-[0.72rem] text-neutral-500">
          当前浏览器光学档位：
          <b className="ml-1 text-neutral-700 dark:text-neutral-200">
            {(() => {
              const cap = liquidLensCapability()
              return cap === 'full' ? 'full · 真折射（Chromium SVG 位移链）' : cap === 'static' ? 'static · 折射但滚动时降级（Android WebView）' : 'none · 兜底加厚模糊（iOS / Safari / Firefox）'
            })()}
          </b>
        </p>

        <p className="page-chrome m-0 max-w-xl text-center text-[0.75rem] leading-6 text-neutral-500">
          拖滑块会跟手，越界时有阻尼橡皮筋；底栏胶囊由真实弹簧仿真驱动，带挤压回弹。
          换一张照片，底栏边缘的折射、染色和高光都会跟着变。
        </p>
      </main>

      {/* ?diag=1：把内核能力摊开，方便别人截图反馈为什么他那边是毛玻璃 */}
      {new URLSearchParams(location.search).has('diag') && (
        <div className="fixed inset-x-2 top-2 z-[60] max-h-[40vh] overflow-auto rounded-xl bg-black/85 p-2.5 font-mono text-[0.58rem] leading-4 text-white/90 backdrop-blur">
          <div>capability: {liquidLensCapability()}</div>
          <div>supports url(#svg): {String(CSS.supports('backdrop-filter', 'url(#x)') || CSS.supports('-webkit-backdrop-filter', 'url(#x)'))}</div>
          <div>surface lens: {[...document.querySelectorAll<HTMLElement>('[data-liquid-surface]')].map(e => e.dataset.lens).join(',') || '-'}</div>
          <div>dpr: {devicePixelRatio} · {innerWidth}×{innerHeight}</div>
          <div className="mt-1 break-all text-white/70">{navigator.userAgent}</div>
        </div>
      )}
    </div>
  )
}

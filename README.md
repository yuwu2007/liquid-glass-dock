# Liquid Dock

**液态玻璃底栏 + 弹簧滑动胶囊 + 可拖拽分段滑块** —— 从一款线上校园社区应用里抽出来的两个交互组件，MIT 开源，无业务依赖。

![浅色 + 山林背景](docs/demo-light.png)

| 浅色 · 山林 | 浅色 · 深海 | 深色 · 山林 |
| --- | --- | --- |
| ![light](docs/demo-light.png) | ![deep](docs/demo-deep.png) | ![dark](docs/demo-dark.png) |

演示页底部有三张缩略图可切换底衬照片——玻璃折的是"栏后"的画面，换一张背景，边缘的折射、染色和高光全都不一样。

---

## 里面有什么

| 组件 | 说明 |
| --- | --- |
| `DockGlassSurface` | 底栏玻璃材质：真实折射（边缘透镜）+ 模糊 + 主题染色，浅/深色两套光学参数 |
| `DockSlider` | 底栏「选中胶囊」：**真实弹簧仿真**驱动位移，切换时带挤压/拉伸回弹，首帧无飞入 |
| `TopicSlider` | 顶部分段滑块：可拖拽、跟手、跨格吸附；**撞到边界走橡皮筋阻尼**，松手回弹 |

三个组件都只依赖 `react`（`TopicSlider` 额外用到 `../lib/rubberBand.ts`，20 行纯函数）。演示页的图标来自 `lucide-react`，组件本身不含图标。

## 快速开始

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 产物在 dist/
```

> 演示页用 Tailwind v4（`@tailwindcss/vite`）。组件里的工具类需要你的项目也有 Tailwind，或把类名替换成自己的 CSS。

> **在线演示**：仓库自带 GitHub Pages 工作流。第一次用需要仓库管理员在 `Settings → Pages → Source` 选 **GitHub Actions** 授权一次，然后到 `Actions → Deploy demo to Pages → Run workflow` 即可（之后可把 `workflow_dispatch` 换回 `push`）。

## 用法

### 底栏：玻璃 + 滑块

```tsx
import { useRef, useState } from 'react'
import DockGlassSurface from './components/liquid/DockGlassSurface'
import DockSlider from './components/liquid/DockSlider'

const TABS = [{ label: '首页', Icon: Home }, /* ... */]

export function Dock() {
  const [active, setActive] = useState(0)
  const itemRefs = useRef<(HTMLElement | null)[]>([])

  return (
    <DockGlassSurface>
      <div className="relative grid grid-cols-5">
        {/* 必须放在格子容器的第一个子节点 */}
        <DockSlider activeIndex={active} getItem={i => itemRefs.current[i]} />
        {TABS.map(({ label, Icon }, i) => (
          <button
            key={label}
            ref={el => { itemRefs.current[i] = el }}
            onClick={() => setActive(i)}
            className="relative z-[1] flex h-[58px] flex-col items-center justify-center gap-[3px] text-[0.62rem]"
          >
            <Icon className="h-[19px] w-[19px]" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </DockGlassSurface>
  )
}
```

`DockSlider` 参数：

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `activeIndex` | `number` | 必填 | 激活格子下标；`-1` 隐藏胶囊与光晕 |
| `getItem` | `(i) => HTMLElement \| null` | 必填 | 读取格子元素（父组件持有 ref 数组，组件不建注册机制） |
| `inset` | `number` | `7` | 胶囊两端相对格子宽度的内缩，避免贴到圆角 |

`DockGlassSurface` 参数：`variant?: 'current' | 'local' | 'local-tuned' | 'fine'`（默认 `local-tuned`，线上在用的那套光学剖面）、`children`。

### 分段滑块

```tsx
import TopicSlider from './components/TopicSlider'

const TOPICS = [
  { key: 'all', label: '全部' },
  { key: 'hot', label: '热门' },
] as const

<TopicSlider options={TOPICS.map(t => ({ ...t }))} value={topic} onChange={setTopic} fill />
```

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `options` | `{ key, label }[]` | 必填 | 选项 |
| `value` | `string` | 必填 | 当前值 |
| `onChange` | `(v) => void` | 必填 | 切换回调 |
| `fill` | `boolean` | `false` | 选项 `flex-1` 均分撑满外层 |
| `hug` | `boolean` | `false` | 配合 `fill`：整条撑满，高亮块只包文字 |
| `size` | `'compact' \| 'roomy'` | `'compact'` | 外壳档位（21.5px / 30.8px） |
| `className` | `string` | `''` | 追加类名 |

## 实现要点（想改参数的人看这里）

**橡皮筋**（`src/lib/rubberBand.ts`）：`1 - 1 / (x / tension + 1)`。前 1px 几乎完全跟手，越拉越沉，渐近上限、正负对称、严格单调。`TopicSlider` 把越界量再乘一个上限（34px）与张力，松手用 `cubic-bezier(0.18, 1.32, 0.36, 1)` 380ms 回弹；边界内切换是 260ms。

**底栏胶囊**：`useLayoutEffect` 里在 paint 前测量格子位置，首帧即落位；切换时不走 CSS transition，而是跑弹簧积分（位移 + 速度），相邻格快速连点时由弹簧自然产生挤压与过冲。容器尺寸变化（横竖屏、字体缩放）会重新测量。

**玻璃折射**：`buildLiquidLens.ts` 为一组圆角矩形边缘生成位移图，`LiquidSurface` 用它驱动 `backdrop-filter`；暗色增量单独走 `darkProfile`，避免浅色折射把深色底冲淡。

**安全区**：底栏内边距吃 `--sat` / `--sab`（演示页为 0），真机 `viewport-fit=cover` 下自动避让。

## 浏览器

`backdrop-filter` + SVG filter 位移图。Chrome / Edge / Safari 16.4+ / 移动端 ArkWeb、微信内置浏览器均可；不支持时会退化为半透明磨砂底（布局与交互不受影响）。

## 灵感与致谢

代码全部为本仓库原创（从线上产品里抽出来的实现），但**技术思路不是凭空来的**，这几处明确致敬：

- **液态玻璃的位移贴图路线**：来自 Apple 在 2025 年 WWDC 提出的 Liquid Glass 设计语言的公开原理；本仓库的 `buildLiquidLens.ts` 是自研实现（双链 SVG 位移贴图 + CSS gradient mask），没有引入第三方代码。
- **胶囊的挤压/拉伸**：思路参考 GitHub 上 [`Sabrene-Marie/framer-cursor-component`](https://github.com/Sabrene-Marie/framer-cursor-component) 的做法（形变与瞬时速度成正比），实现是本仓库自己写的弹簧积分。
- **橡皮筋越界阻尼**：公式沿用 iOS `UIScrollView` 的经典 `1 - 1/(x/tension + 1)`。
- **演示背景照片**：来自 [Unsplash](https://unsplash.com)（经 [picsum.photos](https://picsum.photos) 分发），仅用于展示折射效果，不随 MIT 许可授权。
- **第三方依赖**：React / React DOM（MIT）、Vite（MIT）、Tailwind CSS（MIT）、TypeScript（Apache-2.0）、lucide-react 图标（ISC）。

## License

MIT © 2026 Liquid Dock contributors

---

## English

A compact, production-extracted pair of interaction components: a **liquid-glass bottom dock** with a **spring-driven selection capsule**, and a **draggable segmented slider with rubber-band edges**.

```bash
npm install && npm run dev
```

- `DockGlassSurface` — real edge-lens refraction + blur + theme tint (light/dark profiles).
- `DockSlider` — capsule position driven by an actual spring integrator (no CSS transition), so fast taps squash and overshoot naturally.
- `TopicSlider` — pointer-drag, snap per segment, damped overshoot beyond bounds, spring-back on release.

No business logic, no data layer. Only React + Tailwind utility classes. MIT licensed.

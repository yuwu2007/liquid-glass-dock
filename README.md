# Liquid Glass Dock

**液态玻璃底栏 + 玻璃面板**。从一款线上校园社区应用里抽出来的材质实现，MIT 开源。

| 图片折射 · 圆角玻璃卡片 | 实时页面折射 · 胶囊底栏 |
| --- | --- |
| ![圆角玻璃卡片](docs/glass-card.webp) | ![胶囊玻璃底栏](docs/glass-live.webp) |

## 里面有什么

| 组件 | 说明 |
| --- | --- |
| `DockGlassSurface` | 底栏玻璃材质：边缘透镜折射 + 模糊 + 主题染色，浅/深两套光学参数 |
| `GlassPanel` | 同一材质的大块玻璃面板（卡片/浮层用），圆角 28、环宽 5、tint 0.12 |
| `RefractionImage` | **全兼容折射**：不依赖 `backdrop-filter`，用 SVG 位移滤镜弯曲一张背景图，Safari / Firefox / 微信也能出折射 |
| `LiquidSurface` | 底层实现：测量、位移贴图生成、滤镜挂载、暗色增量 |

## 该用哪一套？（按浏览器 / 按背景）

一句话：**实时页面折射折的是「真实页面」，全兼容图片折射折的是「一张图」。** 先看背景，再看浏览器。

### 按浏览器

| 浏览器 / 环境 | 推荐 | 原因 |
| --- | --- | --- |
| Chrome、Edge、Android 浏览器、Android 微信（Chromium） | **实时页面折射 `DockGlassSurface`** | `backdrop-filter: url()` 可用，直接折射真实 DOM，效果最好、性能最省 |
| iPhone / iPad 的 Safari、iOS 微信、iOS 上的一切浏览器（WebKit） | **全兼容 `RefractionImage`** | WebKit 不支持对 backdrop 挂 SVG 滤镜，实时页面折射在这里只能落回磨砂 |
| 桌面 Safari 17.2+ | **全兼容 `RefractionImage`** | 同上；对元素本身应用 `filter: url()` 是支持的 |
| Firefox | **全兼容 `RefractionImage`** | Firefox 对 backdrop 挂滤镜支持不全，全兼容走 SVG 元素滤镜 |
| 不支持 SVG 滤镜的老环境 | 磨砂兜底 | `RefractionImage` 自带 `feImage` 探测，失败会去掉滤镜只留柔光；实时页面折射也有 `blur()` 兜底 |

### 按背景类型（这一条比浏览器更关键）

| 玻璃后面的内容 | 该用 |
| --- | --- |
| 帖子流、文字列表、卡片、视频等**活 DOM** | **只能实时页面折射**。全兼容折不了 DOM，除非你先把它栅格化成图（不推荐在主流程里这么做） |
| **一张图**：落地页头图、活动页、登录页、照片墙、图片背景卡片 | **全兼容**，iOS / 微信也能看到边缘弯折 |

### 各自代价

- **实时页面折射**：真实、自动跟随内容变化、原生合成器性能好、暗色参数齐全；但非 Chromium 没有真折射。
- **全兼容**：覆盖面广、独立组件可移植；但位移贴图靠主线程逐像素计算，滚动时滤镜要重绘，低端机更吃力，且观感是近似。

实际项目里常见的搭配是：**主 App 底栏用实时页面折射，图片类页面用全兼容**，而不是互相替代。

## 快速开始

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 产物在 dist/
```

演示页用 Tailwind v4（`@tailwindcss/vite`）。组件里的工具类需要你的项目也有 Tailwind，或把类名换成自己的 CSS。

> **在线演示**：https://yuwu2007.github.io/liquid-glass-dock/ （GitHub Pages 自动部署，push 到 `main` 即更新）
>
> 自托管：仓库自带 GitHub Pages 工作流，首次需在 `Settings → Pages → Source` 选 **GitHub Actions**。
>
> 演示页是 **playground**：一整屏可滚动长图（折射校准图 + 6 张照片）+ 一块液态玻璃。
> 右上角「调参」可切换 **圆角卡片 / 胶囊底栏 / 圆形 / 方块**，并实时调整光学厚度、折射环宽、圆角、尺寸、
> 折射率、模糊、奶白、饱和度、高光、光照角度；调好可直接 **复制 TSX 代码** 或 **复制带参数的分享链接**。
> **「实时页面折射」** 引擎也已开放调参：折射强度、直边/圆角唇宽与采样、弯曲指数、
> 模糊、饱和度、高光、奶白等 13 项都直接作用于 `DockGlassSurface`，
> 并支持复制当前 TSX 和分享链接；面板会明确显示当前浏览器是实时折射还是磨砂兜底。
> 拼接原图放在 `artwork/`（不进产物），要换背景重新拼一张 `public/bg/scroll.jpg` 即可。

## 用法

### 底栏玻璃

```tsx
import DockGlassSurface from './components/liquid/DockGlassSurface'

<DockGlassSurface>
  <div className="relative grid grid-cols-5">{/* 5 个 tab */}</div>
</DockGlassSurface>
```

### 实时页面折射具体怎么工作

它**不是截图、不需要背景图，也不是把页面内容复制一份**。调用链是：

1. `DockGlassSurface` 提供底栏布局、`local-tuned` 浅色预设和深色覆盖参数。
2. `LiquidSurface` 测量玻璃的宽、高、圆角，生成位移贴图与 SVG 滤镜。
3. 通过 `backdrop-filter: url(#…)` 让浏览器直接采样玻璃后面的**真实 backdrop**：文字、帖子、图片、视频都算。
4. 页面滚动或 DOM 内容变化后，浏览器下一帧采到的就是新内容；组件不需要重新截图，也不需要你同步一张背景图。
5. 默认 `enableLens="auto"` 会检测 `backdrop-filter` 是否接受 `url()`。支持才挂真折射；不支持就走加厚磨砂，而不是硬挂一条无效滤镜。

所以它和 `RefractionImage` 的区别不是「谁更高级」，而是**采样源不同**：一个采样真实页面，一个采样指定图片。两套组件也不会偷偷自动互换，使用时仍需按背景类型选择。

#### 支持边界与排查

- Chromium 支持时根节点是 `data-lens="on"`；`data-lens-capability` 为 `full`（桌面）或 `static`（Android / 移动 Chromium）。
- iPhone / iPad（包括 iOS 上的 Chrome）、iOS 微信、Firefox 等不支持环境为 `data-lens="off"`，使用浅色 `blur(16px)` / 深色 `blur(18px)` 的加厚磨砂兜底。
- **演示页不要传 `enableLens={true}` 来假装兼容**：`true` 是强制挂载的调试开关；正常业务用默认 `auto`。
- `pull` / `endPull` 才是这条统一边缘链的折射采样距离（强弱）；`band` / `endBand` 控制可见唇宽。
- `scale` 在统一边缘模式中只决定主折射链是否启用，**数值大小不改变位移幅度**；`rimSmooth` 只服务旧的独立采集环；`ringWidth` 在这里主要是唇宽下限与开关，不是独立可见色环。
- 默认预设还有 `localEndArc: true`，圆角权重只落在朝侧面的法线区域；此时 `endReach` 取任何正值都生成相同贴图。以上四项均不放进演示面板，避免假调参。
- `blur`、`sigma`、`rimSmooth` 不是一回事，见下表。

#### 默认 `local-tuned` 参数

| 参数 | 默认值 | 管什么 |
| --- | --- | --- |
| `scale` | `0.12` | 统一边缘模式中仅作为主链开关；位移强弱看 `pull / endPull` |
| `band` / `pull` | `10` / `22` | 直边唇宽 / 采样距离 |
| `straightBend` / `straightEdgeSigma` | `1.15` / `2.25` | 直边弯曲衰减 / 直边预模糊 |
| `endBand` / `endPull` | `7.5` / `15` | 圆角端唇宽 / 采样距离 |
| `endReach` | `22` | 圆角向直边的理论过渡距离；默认 `localEndArc` 下不改变贴图，故面板不开放 |
| `bend` | `0.85` | 圆角端的弯曲衰减指数 |
| `blur` | `2.2` | 主玻璃背景柔化；不是边缘高光宽度 |
| `sigma` / `straightEdgeSigma` | `2.7` / `2.25` | 位移采样前的低频化，压掉细文字抖动 |
| `saturate` / `glassSaturate` | `1.2` / `1.05` | 边缘采色饱和度 / 玻璃主体饱和度 |
| `specularSlope` | `1.1` | 折射内容的提亮增益 |
| `rimSmooth` | `0.6` | 旧独立采集环的位移后柔化；统一边缘链不显示该独立环 |
| `tint` | `0.18` | 奶白参数；浅色实际不透明度为 `tint × 0.6 = 0.108` |
| `ringWidth` | `3` | 采集环宽；`0` 会关闭透镜 |

深色主题还会叠加 `DOCK_DARK_LENS_PROFILE`；显式 `darkProfile` 的优先级高于通用 `profile`。

#### 调参并导出

`profile` 叠加在 `variant` 预设之上，`tint` 与 `ringWidth` 是组件独立 props：

```tsx
<DockGlassSurface
  tint={0.18}
  ringWidth={3}
  profile={{ band: 12, pull: 26, endPull: 18, blur: 2.8 }}
>
  <div className="flex items-center justify-between px-2 py-2">{/* tabs */}</div>
</DockGlassSurface>
```

演示页的「实时页面折射」面板会直接修改这些 props，导出的 TSX 与分享链接都包含当前值。

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `variant` | `'current' \| 'local' \| 'local-tuned' \| 'fine'` | `local-tuned` | 四套光学剖面，默认是 `local-tuned` |
| `enableLens` | `'auto' \| boolean` | `'auto'` | `true` 强制挂折射链、`false` 只走兼容磨砂 |
| `profile` | `Partial<LensProfile>` | — | 覆盖光学参数，叠加在 `variant` 上 |
| `darkProfile` | `Partial<LensProfile>` | 底栏深色预设 | 深色主题下继续叠加 |
| `radius` | `number \| 'capsule'` | `'capsule'` | 固定圆角或自动胶囊 |
| `tint` / `tintDarkOpacity` | `number` | `0.18` / `0.06` | 浅色奶白参数 / 深色压暗不透明度 |
| `ringWidth` | `number` | `3` | 采集环宽，`0` 关闭透镜 |

### 玻璃面板

```tsx
import GlassPanel from './components/liquid/GlassPanel'

<GlassPanel className="px-4 py-3.5" radius={26}>
  <p className="text-white">通透度演示</p>
</GlassPanel>
```

### 全兼容图片折射

```tsx
import { useRef } from 'react'
import RefractionImage from './components/liquid/RefractionImage'

const photoRef = useRef<HTMLImageElement>(null)

<img ref={photoRef} src="/photo.jpg" className="absolute inset-0 h-full w-full object-cover" />
<RefractionImage
  src="/photo.jpg"
  backdropRef={photoRef}
  radius={26}
  bevel={20}
  strength={22}
  className="w-full"
>
  <div className="px-4 py-3">内容</div>
</RefractionImage>
```

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `src` | `string` | 必填 | 背景图，玻璃折射的就是它 |
| `backdropRef` | `RefObject` | 建议必填 | 页面里那张真实背景图；靠它把玻璃里的画面与背景**逐像素对齐**，滚动时也会重算 |
| `radius` | `number` | `28` | 圆角 |
| `bevel` | `number` | 短边/4 | 折射环宽度（上限短边的一半） |
| `strength` | `number` | `34` | 玻璃光学厚度：12 细腻 / 22 标准 / 44 夸张 |
| `ior` | `number` | `1.5` | 折射率 |
| `blur` | `number` | `0.5` | 位移前高斯模糊：0.5 高透，**8 左右就是磨砂玻璃**，边缘折射仍保留 |
| `veil` | `number` | `0.08` | 一层薄奶白（0~1），解决"太透/文字读不清"，0 关闭 |
| `saturation` | `number` | `1` | 饱和度，`1.15` 与 `GlassPanel` 一致（磨砂后不发灰） |
| `specular` | `number` | `1` | 边缘高光强度 |
| `lightAngle` | `number` | `-55` | 高光方位角（度），对称两侧各一弯亮弧 |
| `style` | `CSSProperties` | — | 固定尺寸测试（圆形/方块）时传 `width`/`height` |

> 想和对面的实时版一样通透：`blur={3} saturation={1.15} veil={0.05} bevel={12}`。演示页底栏用的是 `blur={3} saturation={1.15} veil={0.06} bevel={16} strength={22}`。

原理（与 Apple Liquid Glass 的 Web 复现同一套物理，代码为本项目自己实现）：

1. 圆角矩形 SDF → 每像素离边距离与法线；
2. 边缘是凸面 squircle 剖面 `h(t)=(1-(1-t)^4)^(1/4)`，求表面倾角 θ1；
3. 斯涅尔定律 `sinθ1 / ior = sinθ2`，位移 `= tan(θ1-θ2) × strength`，**朝面板中心**——凸面聚光，所以边缘是放大弯折，不是涂抹拉伸；
4. 高光用三维法线与水平光的 `|N·L|`，在对称两侧形成两弯亮弧；
5. 位移图/高光图按 **3 倍超采样**在 canvas 生成，交给 `feImage → feDisplacementMap` 执行。

`feDisplacementMap` 在 Safari / Firefox / 微信 X5 都支持——**不兼容的只是 `backdrop-filter` 收不收 `url()`**。

参考（物理模型与写法启发，非代码来源）：
[kube.io：Liquid Glass in the browser](https://kube.io/blog/liquid-glass-css-svg/)、
[xanaxknight/liquid-glass-css-svg](https://github.com/xanaxknight/liquid-glass-css-svg)、
[VII-Cae/hyalite--liquid-glass](https://github.com/VII-Cae/hyalite--liquid-glass)。

> 注意：它折的是"一张背景图"，不是任意 DOM。要折实时页面内容，只能用 Chromium 的 `GlassPanel`。

## 为什么在别人项目里像"一层薄玻璃"

实时折射（折的是页面真实合成内容）**只有 Chromium 内核成立**。组件在根节点标注了状态，排查先看：

```js
const el = document.querySelector('[data-liquid-surface]')
el.dataset.lens            // 'on' = 真折射；'off' = 兼容磨砂
el.dataset.lensCapability  // 'full' | 'static' | 'none'
```

| 环境 | 档位 | 表现 |
| --- | --- | --- |
| 桌面 / 安卓 Chrome、Edge | `full` | 实时真折射 |
| 安卓厂商浏览器、微信 Android | `static` 或 `none` | 支持时折射；`url(#svg)` 被内核丢掉时落兜底 |
| iPhone / iPad 上的一切浏览器 | `none` | WebKit 不支持 → 兼容磨砂（要折射请用 `RefractionImage`） |
| 桌面 Safari、Firefox | `none` | 同上 |

兜底档是加厚磨砂：`blur(16~18px) saturate(160~180%)` + 内阴影 + 镜面高光，不会退化成薄雾。

除内核外还有四个常见坑：背景是纯色（没东西可折）、祖先带 `filter`/`transform`/`backdrop-filter`（换了采样画布）、全局 CSS 覆盖了 `backdrop-filter`、父容器 `overflow:hidden` 裁掉外扩采样区。

## 实现要点

- **测量**：`useLayoutEffect` 在 paint 前量尺寸，首帧即正确；`ResizeObserver` 负责尺寸变化后重测。
- **位移贴图**：`buildLiquidLens.ts` 为圆角矩形边缘生成位移图；采样环用 CSS `gradient mask` 剪出（`image-mask` / `feComposite` 在 Chromium 上会被裁掉）。
- **暗色增量**：`darkProfile` 单独覆盖，避免浅色折射把深色底冲淡。
- **安全区**：组件不写死内边距，由使用方按 `--sat` / `--sab` 处理。

## 浏览器

Chromium（桌面与安卓）走实时折射；Safari / Firefox / 微信落兼容磨砂；需要全平台折射时用 `RefractionImage` + 图片/视频背景。

## 灵感与致谢

代码为本仓库原创（从线上产品抽出），技术思路并非凭空：

- **液态玻璃的位移贴图路线**：来自 Apple 2025 WWDC 的 Liquid Glass 设计语言的公开原理；本仓库为自研实现。
- **演示背景照片**：来自 [Unsplash](https://unsplash.com)（经 [picsum.photos](https://picsum.photos) 分发），仅用于展示折射效果，不随 MIT 授权。
- **第三方依赖**：React / React DOM（MIT）、Vite（MIT）、Tailwind CSS（MIT）、TypeScript（Apache-2.0）、lucide-react 图标（ISC）。

## License

MIT © 2026 Liquid Glass Dock contributors

---

## English

A liquid-glass **bottom dock** and **glass panels**, extracted from a production campus app.

- `DockGlassSurface` — edge-lens refraction + blur + theme tint (light/dark profiles).
- `GlassPanel` — same material as a large card (radius 28, rim 5, tint 0.12).
- `RefractionImage` — real edge refraction **without** `backdrop-filter: url()`: an SVG displacement filter bends the backdrop image, so it also works in Safari, Firefox and WeChat.

Live refraction of arbitrary scrolling DOM is Chromium-only; elsewhere the component degrades to a thick frosted material. MIT licensed.

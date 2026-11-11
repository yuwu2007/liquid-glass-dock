import { Profiler, StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import RefractionImage from '../../src/components/liquid/RefractionImage'
import '../../src/demo.css'

declare global { interface Window { lensCommits: number } }
window.lensCommits = 0
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="2400"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#ff3200"/><stop offset=".5" stop-color="#0f0"/><stop offset="1" stop-color="#04f"/></linearGradient></defs><path fill="url(#g)" d="M0 0h340v2400H0z"/>${Array.from({ length: 40 }, (_, i) => `<text x="20" y="${i * 60 + 40}" font-size="30">${i} Scroll refraction</text>`).join('')}</svg>`
const src = `data:image/svg+xml,${encodeURIComponent(svg)}`

function Fixture() {
  const ref = useRef<HTMLImageElement>(null)
  const [visible, setVisible] = useState(true)
  return <>
    <button style={{ position: 'fixed', top: 0, right: 0, zIndex: 10 }} onClick={() => setVisible(v => !v)}>Toggle lens</button>
    <div id="outer" style={{ height: 700, overflow: 'auto', marginTop: 30 }}>
      <div style={{ height: 30 }} />
      <div id="inner" style={{ height: 620, overflow: 'auto', margin: '0 10px' }}>
        <img id="backdrop" ref={ref} src={src} style={{ display: 'block', width: 340 }} />
      </div>
      <div style={{ height: 300 }} />
    </div>
    <Profiler id="lens" onRender={() => window.lensCommits++}>
      {visible && <RefractionImage src={src} backdropRef={ref} radius={32} style={{ position: 'fixed', left: 25, top: 530, width: 340, height: 72 }} />}
    </Profiler>
  </>
}
createRoot(document.getElementById('root')!).render(<StrictMode><Fixture /></StrictMode>)

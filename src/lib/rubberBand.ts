/**
 * 边界橡皮筋（站长 2026-10-24：「滑块碰到边界要做点弹性动画」）。
 *
 * 输入越界距离（px，可正可负），返回实际该多走的位移：
 * - 前 1px 几乎全跟（手感连贯，没有硬墙）；
 * - 越拉越沉，渐近上限 limit，永远拉不飞；
 * - 对称、单调、过原点（0 → 0），负数方向一样。
 *
 * 用 1 - 1/(x/tension + 1) 这条曲线：x=tension 时走一半，x→∞ 趋近 limit。
 * 松手后由组件用带回弹的缓动收回边界内。
 */
export function rubberBand(overshoot: number, limit = 34, tension = 26): number {
  if (!overshoot) return 0
  const magnitude = Math.abs(overshoot)
  const damped = limit * (1 - 1 / (magnitude / tension + 1))
  return Math.sign(overshoot) * damped
}

export default rubberBand

<script>
  let { verified = 0, total = 0 } = $props()

  const R = 54
  const C = 2 * Math.PI * R

  const pct = $derived(total > 0 ? verified / total : 0)
  const offset = $derived(C * (1 - pct))
  const label = $derived(`${Math.round(pct * 100)}%`)
</script>

<svg class="ring" viewBox="0 0 128 128" role="img" aria-label={label}>
  <circle class="bg" cx="64" cy="64" r={R} />
  <circle
    class="fg"
    cx="64"
    cy="64"
    r={R}
    stroke-dasharray={C}
    stroke-dashoffset={offset}
    stroke-linecap="round"
  />
  <text x="64" y="72" text-anchor="middle">{label}</text>
</svg>

<style>
  .ring {
    width: 96px;
    height: 96px;
    transform: rotate(-90deg);
  }
  circle {
    fill: none;
    stroke-width: 11;
  }
  .bg {
    stroke: #262b3a;
  }
  .fg {
    stroke: #5ee08a;
    transition: stroke-dashoffset 0.4s ease;
  }
  text {
    transform: rotate(90deg);
    transform-origin: 64px 64px;
    fill: #e6e8ef;
    font-size: 26px;
    font-family: inherit;
    font-weight: bold;
  }
</style>

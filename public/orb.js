// O "rosto" do Argos: um núcleo luminoso com anéis que reagem ao estado
// (idle = aguardando, listening = ouvindo, thinking = pensando, talking = falando).
const arc = (r, from, to) => {
  const p = (deg) => [100 + r * Math.cos((deg * Math.PI) / 180), 100 + r * Math.sin((deg * Math.PI) / 180)];
  const [x1, y1] = p(from), [x2, y2] = p(to);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
};
const ticks = Array.from({ length: 48 }, (_, i) => {
  const a = (i * 7.5 * Math.PI) / 180, r1 = 92, r2 = i % 4 ? 95 : 98;
  return `M${(100 + r1 * Math.cos(a)).toFixed(1)} ${(100 + r1 * Math.sin(a)).toFixed(1)}L${(100 + r2 * Math.cos(a)).toFixed(1)} ${(100 + r2 * Math.sin(a)).toFixed(1)}`;
}).join("");

const SVG = `
<svg viewBox="0 0 200 200" aria-hidden="true">
  <defs>
    <radialGradient id="orbCore" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="var(--orb)"/><stop offset="1" stop-color="var(--orb)" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <path class="orb-ticks" d="${ticks}"/>
  <g class="orb-ring r1"><path d="${arc(84, 0, 110)}"/><path d="${arc(84, 140, 200)}"/><path d="${arc(84, 230, 330)}"/></g>
  <g class="orb-ring r2"><path d="${arc(70, 20, 160)}"/><path d="${arc(70, 200, 340)}"/></g>
  <g class="orb-ring r3"><path d="${arc(56, 0, 60)}"/><path d="${arc(56, 90, 150)}"/><path d="${arc(56, 180, 240)}"/><path d="${arc(56, 270, 330)}"/></g>
  <circle class="orb-halo" cx="100" cy="100" r="44"/>
  <circle class="orb-core" cx="100" cy="100" r="34" fill="url(#orbCore)"/>
</svg>`;

export function mountOrb(el) {
  el.classList.add("orb", "is-idle");
  el.innerHTML = SVG;
  return {
    set(state) {
      el.classList.remove("is-idle", "is-listening", "is-thinking", "is-talking");
      el.classList.add("is-" + state);
    },
  };
}

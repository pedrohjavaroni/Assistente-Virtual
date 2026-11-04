// O guaxinim em SVG, compartilhado pelo app, pelo companheiro de tela (PC) e pela bolha do Android.
// As expressões são controladas por classes CSS no elemento pai: mood-happy, mood-excited,
// mood-thinking, mood-sad, mood-sleepy, mood-cool, mood-love + talking, listening, walking, dirty.
export const RACCOON_SVG = `
<svg class="rc" viewBox="0 0 240 260" aria-label="Raccoon" role="img">
  <defs>
    <linearGradient id="rcFur" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#99a2b8"/><stop offset="1" stop-color="#737c93"/>
    </linearGradient>
    <linearGradient id="rcHood" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2b2f48"/><stop offset="1" stop-color="#1b1d2e"/>
    </linearGradient>
    <linearGradient id="rcShades" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b0c14"/><stop offset=".55" stop-color="#1c2040"/><stop offset="1" stop-color="#3ef0d0"/>
    </linearGradient>
    <filter id="rcGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <ellipse class="rc-shadow" cx="120" cy="250" rx="70" ry="7" fill="#000" opacity=".25"/>

  <!-- cauda -->
  <g class="rc-tail">
    <path d="M166 222 C 222 222, 240 172, 224 126 C 214 150, 200 188, 162 198 Z" fill="url(#rcFur)"/>
    <path d="M213 148 C 220 158, 222 168, 220 176 L 204 184 C 207 174, 206 164, 200 156 Z" fill="#20222f"/>
    <path d="M197 188 C 200 196, 199 203, 196 208 L 180 212 C 184 204, 184 197, 181 191 Z" fill="#20222f"/>
    <path d="M224 126 C 230 136, 229 144, 223 150 C 218 142, 218 133, 224 126 Z" fill="#20222f"/>
  </g>

  <!-- pernas e tênis -->
  <g class="rc-legs">
    <g class="rc-leg rc-leg-l"><rect x="86" y="222" width="22" height="18" rx="4" fill="#14151f"/>
      <path d="M78 248 C 78 236, 110 234, 114 244 L 114 249 L 78 249 Z" fill="#f2f4f9"/>
      <path d="M78 249 L 114 249" stroke="#3ef0d0" stroke-width="3" stroke-linecap="round"/></g>
    <g class="rc-leg rc-leg-r"><rect x="132" y="222" width="22" height="18" rx="4" fill="#14151f"/>
      <path d="M126 244 C 130 234, 162 236, 162 248 L 162 249 L 126 249 Z" fill="#f2f4f9"/>
      <path d="M126 249 L 162 249" stroke="#3ef0d0" stroke-width="3" stroke-linecap="round"/></g>
  </g>

  <!-- corpo: moletom -->
  <g class="rc-body">
    <path d="M64 162 C 56 196, 58 222, 72 230 L 168 230 C 182 222, 184 196, 176 162 C 160 148, 80 148, 64 162 Z" fill="url(#rcHood)"/>
    <path d="M90 202 L 150 202 L 156 224 L 84 224 Z" fill="#161827"/>
    <path d="M108 160 L 106 190" stroke="#3ef0d0" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M132 160 L 134 190" stroke="#3ef0d0" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="106" cy="192" r="3" fill="#3ef0d0"/><circle cx="134" cy="192" r="3" fill="#3ef0d0"/>
    <g class="rc-arm rc-arm-l"><path d="M66 166 C 50 178, 46 206, 54 220 L 72 218 C 70 200, 74 184, 80 172 Z" fill="#232640"/>
      <ellipse cx="62" cy="222" rx="10" ry="7" fill="#20222f"/></g>
    <g class="rc-arm rc-arm-r"><path d="M174 166 C 190 178, 194 206, 186 220 L 168 218 C 170 200, 166 184, 160 172 Z" fill="#232640"/>
      <ellipse cx="178" cy="222" rx="10" ry="7" fill="#20222f"/></g>
    <!-- capuz atrás do pescoço -->
    <path d="M60 150 C 60 128, 180 128, 180 150 C 180 166, 60 166, 60 150 Z" fill="#2b2f48"/>
    <!-- fone no pescoço -->
    <path class="rc-phones-band" d="M78 152 Q 120 182 162 152" stroke="#ff5d8f" stroke-width="7" fill="none" stroke-linecap="round"/>
    <g class="rc-phones-cups"><ellipse cx="76" cy="150" rx="10" ry="13" fill="#ff5d8f"/><ellipse cx="76" cy="150" rx="5" ry="7" fill="#b8325f"/>
      <ellipse cx="164" cy="150" rx="10" ry="13" fill="#ff5d8f"/><ellipse cx="164" cy="150" rx="5" ry="7" fill="#b8325f"/></g>
  </g>

  <!-- cabeça -->
  <g class="rc-head">
    <path d="M60 72 L 62 16 L 104 46 Z" fill="url(#rcFur)"/><path d="M68 62 L 69 32 L 92 48 Z" fill="#20222f"/>
    <path d="M180 72 L 178 16 L 136 46 Z" fill="url(#rcFur)"/><path d="M172 62 L 171 32 L 148 48 Z" fill="#20222f"/>
    <path d="M50 100 C 48 60, 80 38, 120 38 C 160 38, 192 60, 190 100 L 202 112 L 186 116 L 194 128 L 172 128 C 160 142, 140 148, 120 148 C 100 148, 80 142, 68 128 L 46 128 L 54 116 L 38 112 Z" fill="url(#rcFur)"/>
    <path d="M120 44 L 112 68 L 120 78 L 128 68 Z" fill="#20222f" opacity=".75"/>
    <path d="M62 80 Q 84 68 106 77" stroke="#eef0f5" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M178 80 Q 156 68 134 77" stroke="#eef0f5" stroke-width="5" fill="none" stroke-linecap="round"/>
    <!-- máscara de bandido -->
    <path d="M44 96 C 58 78, 96 76, 120 90 C 144 76, 182 78, 196 96 C 184 114, 150 118, 132 106 L 120 112 L 108 106 C 90 118, 56 114, 44 96 Z" fill="#191b27"/>
    <!-- olhos -->
    <g class="rc-eyes">
      <g><ellipse cx="86" cy="97" rx="11" ry="9.5" fill="#f4f6fb"/>
        <g class="rc-iris"><circle cx="88" cy="98" r="6.2" fill="#3ef0d0"/><circle cx="88" cy="98" r="3" fill="#07080d"/><circle cx="90" cy="95.5" r="1.6" fill="#fff"/></g>
        <path class="rc-lid" d="M73 95 Q 86 89 99 95 L 99 85 L 73 85 Z" fill="#191b27"/></g>
      <g><ellipse cx="154" cy="97" rx="11" ry="9.5" fill="#f4f6fb"/>
        <g class="rc-iris"><circle cx="152" cy="98" r="6.2" fill="#3ef0d0"/><circle cx="152" cy="98" r="3" fill="#07080d"/><circle cx="154" cy="95.5" r="1.6" fill="#fff"/></g>
        <path class="rc-lid" d="M141 95 Q 154 89 167 95 L 167 85 L 141 85 Z" fill="#191b27"/></g>
    </g>
    <g class="rc-eyes-closed" stroke="#eef0f5" stroke-width="3.5" fill="none" stroke-linecap="round">
      <path d="M76 99 Q 86 104 96 99"/><path d="M144 99 Q 154 104 164 99"/></g>
    <g class="rc-eyes-happy" stroke="#3ef0d0" stroke-width="4" fill="none" stroke-linecap="round" filter="url(#rcGlow)">
      <path d="M76 101 Q 86 88 96 101"/><path d="M144 101 Q 154 88 164 101"/></g>
    <!-- óculos escuros -->
    <g class="rc-shades">
      <path d="M66 88 L 108 88 L 104 106 C 96 112, 78 112, 70 104 Z" fill="url(#rcShades)"/>
      <path d="M132 88 L 174 88 L 170 104 C 162 112, 144 112, 136 106 Z" fill="url(#rcShades)"/>
      <path d="M58 88 L 182 88" stroke="#0b0c14" stroke-width="4" stroke-linecap="round"/>
      <path d="M76 92 L 86 92" stroke="#fff" stroke-width="2" opacity=".6" stroke-linecap="round"/>
      <path d="M142 92 L 152 92" stroke="#fff" stroke-width="2" opacity=".6" stroke-linecap="round"/>
    </g>
    <g class="rc-blush"><ellipse cx="78" cy="122" rx="9" ry="4.5" fill="#ff5d8f" opacity=".55"/><ellipse cx="162" cy="122" rx="9" ry="4.5" fill="#ff5d8f" opacity=".55"/></g>
    <!-- focinho -->
    <path d="M92 120 C 96 105, 144 105, 148 120 C 146 138, 94 138, 92 120 Z" fill="#eef0f5"/>
    <path d="M110 111 Q 120 105 130 111 Q 126 121 120 122 Q 114 121 110 111 Z" fill="#0d0e14"/>
    <!-- bocas -->
    <path class="rc-m rc-m-smirk" d="M108 127 Q 118 132 132 124" stroke="#191b27" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path class="rc-m rc-m-grin" d="M106 125 Q 120 142 134 125 Z" fill="#5c1626" stroke="#191b27" stroke-width="2" stroke-linejoin="round"/>
    <path class="rc-m rc-m-flat" d="M111 128 L 129 126" stroke="#191b27" stroke-width="3" stroke-linecap="round"/>
    <path class="rc-m rc-m-sad" d="M109 131 Q 120 124 131 131" stroke="#191b27" stroke-width="3" fill="none" stroke-linecap="round"/>
    <ellipse class="rc-m rc-m-talk" cx="120" cy="128" rx="7" ry="6" fill="#5c1626"/>
  </g>

  <g class="rc-zzz" fill="#3ef0d0" font-family="system-ui, sans-serif" font-weight="800">
    <text x="186" y="52" font-size="18">z</text><text x="200" y="34" font-size="24">Z</text></g>
  <g class="rc-dirt" fill="#6b4f3a" opacity=".6">
    <circle cx="92" cy="170" r="6"/><circle cx="150" cy="208" r="5"/><circle cx="158" cy="62" r="4"/><circle cx="70" cy="200" r="4"/></g>
</svg>`;

export function mountRaccoon(el) {
  el.insertAdjacentHTML("afterbegin", RACCOON_SVG);
  return el;
}

export const MOODS = ["happy", "excited", "thinking", "sad", "sleepy", "cool", "love"];

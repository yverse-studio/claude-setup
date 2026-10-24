// REJECTED look (yskills 2026-10-24): replace per the new art direction. Old: cream cat, mint scarf. Flat toon, thick outline. Pure function of t.
const Mascot=(()=>{
  const O='#2b2140',CREAM='#fff1dc',INNER='#f2a7b0',MINT='#5fd3b5',MINT2='#3aa88f',CHEEK='#ffb3a7';
  const sw=7;
  function draw({t,talking,pose,x,y,scale}){
    const bob=Math.sin(t*3.2)*5, wag=Math.sin(t*4.5)*14;
    const blink=(t%3.4)<0.12?0.1:1;
    const mouthOpen=talking?(0.35+0.65*Math.abs(Math.sin(t*14))):0;
    const arm=pose==='point'?-70:pose==='cheer'?-130+Math.sin(t*9)*12:12+Math.sin(t*3.2)*4;
    const mouth=talking
      ?`<ellipse cx="0" cy="-196" rx="${16+mouthOpen*6}" ry="${4+mouthOpen*17}" fill="#7a2a3d" stroke="${O}" stroke-width="${sw-2}"/>`
      :`<path d="M-16 -200 Q-8 -190 0 -198 Q8 -190 16 -200" fill="none" stroke="${O}" stroke-width="${sw-1}" stroke-linecap="round"/>`;
    return `<g transform="translate(${x},${y+bob}) scale(${scale})">
    <ellipse cx="0" cy="8" rx="120" ry="16" fill="#00000026" transform="translate(0,${-bob})"/>
    <path d="M70 -60 Q150 -70 ${150+wag} -170 Q${150+wag} -200 ${120+wag} -190" fill="none" stroke="${O}" stroke-width="${sw+22}" stroke-linecap="round"/>
    <path d="M70 -60 Q150 -70 ${150+wag} -170 Q${150+wag} -200 ${120+wag} -190" fill="none" stroke="${CREAM}" stroke-width="${22}" stroke-linecap="round"/>
    <ellipse cx="0" cy="-95" rx="92" ry="100" fill="${CREAM}" stroke="${O}" stroke-width="${sw}"/>
    <ellipse cx="-38" cy="-8" rx="34" ry="16" fill="${CREAM}" stroke="${O}" stroke-width="${sw}"/>
    <ellipse cx="38" cy="-8" rx="34" ry="16" fill="${CREAM}" stroke="${O}" stroke-width="${sw}"/>
    <g transform="rotate(${-arm*0.0} 0 0)">
      <ellipse cx="-88" cy="-110" rx="24" ry="48" fill="${CREAM}" stroke="${O}" stroke-width="${sw}" transform="rotate(${arm*0.4} -80 -150)"/>
      <ellipse cx="88" cy="-110" rx="24" ry="48" fill="${CREAM}" stroke="${O}" stroke-width="${sw}" transform="rotate(${arm} 80 -150)"/>
    </g>
    <path d="M-62 -168 Q0 -140 62 -168 L66 -146 Q0 -118 -66 -146 Z" fill="${MINT}" stroke="${O}" stroke-width="${sw}" stroke-linejoin="round"/>
    <path d="M30 -140 L52 -90 L24 -84 L12 -130 Z" fill="${MINT2}" stroke="${O}" stroke-width="${sw}" stroke-linejoin="round"/>
    <path d="M-92 -262 L-74 -330 L-30 -284 Z" fill="${CREAM}" stroke="${O}" stroke-width="${sw}" stroke-linejoin="round"/>
    <path d="M-80 -272 L-72 -308 L-48 -282 Z" fill="${INNER}"/>
    <path d="M92 -262 L74 -330 L30 -284 Z" fill="${CREAM}" stroke="${O}" stroke-width="${sw}" stroke-linejoin="round"/>
    <path d="M80 -272 L72 -308 L48 -282 Z" fill="${INNER}"/>
    <ellipse cx="0" cy="-228" rx="108" ry="88" fill="${CREAM}" stroke="${O}" stroke-width="${sw}"/>
    <circle cx="-66" cy="-206" r="15" fill="${CHEEK}"/><circle cx="66" cy="-206" r="15" fill="${CHEEK}"/>
    <g transform="translate(0,-232)">
      <ellipse cx="-40" cy="0" rx="13" ry="${24*blink}" fill="${O}"/><ellipse cx="40" cy="0" rx="13" ry="${24*blink}" fill="${O}"/>
      <circle cx="-36" cy="-7" r="5" fill="#fff" opacity="${blink>0.5?1:0}"/><circle cx="44" cy="-7" r="5" fill="#fff" opacity="${blink>0.5?1:0}"/>
    </g>
    <path d="M-7 -214 L7 -214 L0 -206 Z" fill="${INNER}" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>
    <g transform="translate(0,${talking?4:0})">${mouth}</g>
    </g>`;
  }
  return {draw};
})();

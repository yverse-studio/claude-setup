// One entry per scene "visual": bg gradient, mascot pose, draw(localTime, progress 0..1) -> SVG string in the 1080x1330 stage.
// New explainers add entries here. Keep shapes flat, outlined (#2b2140), few colours.
const O='#2b2140';
const sun=(x,y,r,t)=>`<g transform="translate(${x},${y})"><g transform="rotate(${t*20})">${Array.from({length:12},(_,i)=>`<rect x="-8" y="${-r-44}" width="16" height="36" rx="8" fill="#ffb703" stroke="${O}" stroke-width="5" transform="rotate(${i*30})"/>`).join('')}</g><circle r="${r}" fill="#ffd23f" stroke="${O}" stroke-width="8"/><path d="M-30 14 Q0 40 30 14" fill="none" stroke="${O}" stroke-width="7" stroke-linecap="round"/><circle cx="-26" cy="-14" r="8" fill="${O}"/><circle cx="26" cy="-14" r="8" fill="${O}"/></g>`;
const cloud=(x,y,s=1)=>`<g transform="translate(${x},${y}) scale(${s})" fill="#fff" stroke="${O}" stroke-width="6"><ellipse cx="0" cy="0" rx="90" ry="40"/><ellipse cx="-50" cy="-20" rx="48" ry="38"/><ellipse cx="25" cy="-34" rx="56" ry="46"/></g>`;
const ray=(x1,y1,x2,y2,c,w=14)=>`<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${O}" stroke-width="${w+8}" stroke-linecap="round"/><path d="M${x1} ${y1} L${x2} ${y2}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
const RAINBOW=['#ff4d4d','#ff9f1c','#ffe14d','#4cd964','#35b6ff','#7a5cff'];
const VISUALS={
  blank:{bg:['#cfe9ff','#f4fbff'],draw:()=>''},
  hook:{bg:['#6ec1ff','#d8f1ff'],pose:'point',draw:(t)=>`${sun(840,260,90,t)}${cloud(260+Math.sin(t)*20,340,1.2)}${cloud(700,640,0.8)}
    <text x="540" y="930" text-anchor="middle" font-family="Inter" font-weight="900" font-size="150" fill="#fff" stroke="${O}" stroke-width="22" paint-order="stroke" transform="rotate(-3 540 930)">BLUE?!</text>`},
  prism:{bg:['#2b2a63','#6d5bd0'],pose:'point',draw:(t,p)=>{
    const cx=520,cy=640;
    const out=RAINBOW.map((c,i)=>ray(cx+60,cy+10,cx+60+ (260+p*120),cy-170+i*72,c,12)).join('');
    return `${ray(60,cy-40,cx-40,cy+10,'#fff',26)}
    <path d="M${cx-90} ${cy+110} L${cx} ${cy-120} L${cx+90} ${cy+110} Z" fill="#bfe9ff" stroke="${O}" stroke-width="8" stroke-linejoin="round" opacity="0.95"/>
    ${out}<text x="540" y="1020" text-anchor="middle" font-family="Inter" font-weight="900" font-size="70" fill="#fff" stroke="${O}" stroke-width="14" paint-order="stroke">white light = every colour</text>`;}},
  scatter:{bg:['#48a8ff','#bfe6ff'],pose:'point',draw:(t,p)=>{
    let dots='';for(let i=0;i<26;i++){const x=120+((i*197)%840),y=420+((i*131)%520)+Math.sin(t*2+i)*10;dots+=`<circle cx="${x}" cy="${y}" r="16" fill="#fff" stroke="${O}" stroke-width="5" opacity="0.9"/>`;}
    const blues=Array.from({length:9},(_,i)=>{const a=(i*40+t*140)%360,r=70+((i*53)%160),x=520+Math.cos(a*Math.PI/180)*r*2.2,y=700+Math.sin(a*Math.PI/180)*r*1.5;return `<circle cx="${x}" cy="${y}" r="13" fill="#2f7bff" stroke="${O}" stroke-width="4"/>`}).join('');
    return `${dots}${ray(40,300,420,620,'#ff8a3d',16)}${ray(420,620,980,700,'#ff8a3d',16)}${blues}
    <text x="540" y="1020" text-anchor="middle" font-family="Inter" font-weight="900" font-size="72" fill="#fff" stroke="${O}" stroke-width="14" paint-order="stroke">air bounces blue everywhere</text>`;}},
  sunset:{bg:['#ff7a59','#ffd9a0'],pose:'cheer',draw:(t,p)=>`<rect y="1000" width="1080" height="330" fill="#3b2a5a"/>
    <g transform="translate(540,${1000-120+p*70})"><circle r="150" fill="#ff5a36" stroke="${O}" stroke-width="8"/></g>
    ${Array.from({length:7},(_,i)=>`<path d="M${60+i*150} 760 q75 -40 150 0" fill="none" stroke="#ffffffaa" stroke-width="10" stroke-linecap="round" transform="translate(0,${Math.sin(t*2+i)*8})"/>`).join('')}
    <text x="540" y="330" text-anchor="middle" font-family="Inter" font-weight="900" font-size="80" fill="#fff" stroke="${O}" stroke-width="15" paint-order="stroke">long way = red is left</text>`},
  outro:{bg:['#ffd6e7','#fff3c4'],pose:'cheer',draw:(t)=>`${sun(540,420,100,t)}<text x="540" y="860" text-anchor="middle" font-family="Inter" font-weight="900" font-size="120" fill="#fff" stroke="${O}" stroke-width="20" paint-order="stroke">Follow for more!</text>`}
};

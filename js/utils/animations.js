export function expandSection(el, open){
  if(window.gsap){
    if(open) gsap.fromTo(el,{height:0,opacity:0},{height:'auto',opacity:1,duration:0.28});
    else gsap.to(el,{height:0,opacity:0,duration:0.18});
  } else {
    el.style.display = open ? 'flex' : 'none';
  }
}

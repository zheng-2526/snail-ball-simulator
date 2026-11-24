/* Tracking for fixed-camera footage of a transparent ball. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SnailRealTracker = factory();
})(globalThis, function() {
  'use strict';
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function foreground(image, background, box) {
    const {w, h, data} = image;
    const x0 = Math.max(1, Math.floor(box.x0)), y0 = Math.max(1, Math.floor(box.y0));
    const x1 = Math.min(w - 2, Math.ceil(box.x1)), y1 = Math.min(h - 2, Math.ceil(box.y1));
    const stride = x1 - x0 + 2;
    const integral = new Float32Array(stride * (y1 - y0 + 2));
    for (let y = y0; y <= y1; y++) {
      let rowSum = 0;
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x, target = data[i], base = background.data;
        const edge = Math.max(Math.abs(base[i+1]-base[i-1]), Math.abs(base[i+w]-base[i-w]));
        rowSum += clamp((Math.abs(target-base[i]) - .016 - .45*edge) / .12, 0, 1);
        const pos = (y - y0 + 1)*stride + x - x0 + 1;
        integral[pos] = rowSum + integral[pos-stride];
      }
    }
    return (x,y,dx,dy) => {
      const l = Math.max(x0, x-dx), r = Math.min(x1, x+dx);
      const t = Math.max(y0, y-dy), b = Math.min(y1, y+dy);
      if (r < l || b < t) return 0;
      return (integral[(b-y0+1)*stride+r-x0+1] - integral[(t-y0)*stride+r-x0+1]
        - integral[(b-y0+1)*stride+l-x0] + integral[(t-y0)*stride+l-x0]) / ((2*dx+1)*(2*dy+1));
    };
  }

  function track(image, gradient, background, config) {
    const {seed, predicted, previous=seed, range, down, normal} = config;
    const r = seed.radius, thick = Math.max(7, r*.83), margin = Math.ceil(1.45*r);
    const evidence = foreground(image, background, {
      x0:predicted.x-range-margin, x1:predicted.x+range+margin,
      y0:predicted.y-range-margin, y1:predicted.y+range+margin
    });
    const ray = Array.from({length:32}, (_,i) => [Math.cos(i*Math.PI/16), Math.sin(i*Math.PI/16)]);
    const inSize = Math.round(.68*r), outSize = Math.round(1.16*r);
    const areaRatio = ((2*inSize+1)/(2*outSize+1))**2;
    function score(x,y) {
      if (x < r || y < r || x >= image.w-r || y >= image.h-r) return null;
      const deviation = Math.abs((x-seed.x)*normal.x + (y-seed.y)*normal.y);
      if (deviation > thick) return null;
      if ((x-previous.x)*down.x+(y-previous.y)*down.y < -Math.max(4,r*.20)) return null;
      const inside = evidence(x,y,inSize,inSize);
      if (inside < .018) return null;
      const outside = (evidence(x,y,outSize,outSize)-inside*areaRatio)/(1-areaRatio);
      const contrast = Math.max(0,inside-.85*outside);
      let rim = 0;
      for (const [ux,uy] of ray) {
        let peak = 0;
        for (let d = -2; d <= 2; d+=2) {
          const ix = Math.round(x+(r+d)*ux), iy = Math.round(y+(r+d)*uy);
          if (ix < 1 || iy < 1 || ix >= image.w-1 || iy >= image.h-1) continue;
          const i = iy*image.w+ix;
          const dynamic = Math.abs(image.data[i]-background.data[i]);
          peak = Math.max(peak, Math.min(.18,gradient[i])*clamp((dynamic-.012)/.045,0,1));
        }
        rim += peak;
      }
      rim /= ray.length;
      const dx=x-predicted.x, dy=y-predicted.y;
      const lengthPenalty = Math.abs(dx*down.x + dy*down.y)/range;
      const normalPenalty = Math.abs(dx*normal.x + dy*normal.y)/thick;
      return {x,y,radius:r,offAxis:deviation>.52*r,score:.7*contrast + .9*rim - .040*lengthPenalty - .012*normalPenalty - .14*(deviation/r)**2,
        quality:clamp(.35 + 3.3*contrast + 4.5*rim - .19*outside - .15*lengthPenalty,0,1)};
    }
    let best = null;
    function evaluate(x,y) {
      const candidate = score(x,y);
      if (candidate && (!best || candidate.score > best.score)) best = candidate;
    }
    const stride = Math.max(2,Math.round(r/8));
    const cx=Math.round(predicted.x), cy=Math.round(predicted.y);
    for (let y = cy-range; y <= cy+range; y+=stride) {
      for (let x = cx-range; x <= cx+range; x+=stride) evaluate(x,y);
    }
    if (!best) return null;
    const coarse = best;
    for (let y=coarse.y-stride; y<=coarse.y+stride; y++) {
      for (let x=coarse.x-stride; x<=coarse.x+stride; x++) evaluate(x,y);
    }
    return best;
  }

  function locate(image, gradient, background, frames, seed, range, geometry, time) {
    const recent=[];
    let skipped=0;
    for(let i=frames.length-1;i>=0&&recent.length<3;i--){
      if(frames[i].outer)recent.push(frames[i]);
      else if(!recent.length)skipped++;
    }
    const previous=recent[0]?.outer||seed, oldest=recent.at(-1);
    const dt=recent.length>1?recent[0].video_time_s-oldest.video_time_s:0;
    const step=dt>0?Math.min(1.5,Math.max(0,(time-recent[0].video_time_s)/dt)):0;
    const predicted={
      x:previous.x+step*clamp(previous.x-(oldest?.outer.x??previous.x),-range,range),
      y:previous.y+step*clamp(previous.y-(oldest?.outer.y??previous.y),-range*.5,range*.5)
    };
    predicted.x=clamp(predicted.x,seed.radius,image.w-seed.radius-1);
    predicted.y=clamp(predicted.y,seed.radius,image.h-seed.radius-1);
    return track(image,gradient,background,{seed,previous,predicted,
      range:Math.min(160,Math.max(25,Math.round(range*(1+.45*skipped)))),
      down:geometry.down,normal:geometry.normal});
  }

  return {locate,track};
});

export type Region={x:number;y:number;width:number;height:number};
export function clampRegion(r:Region):Region{
 const clamp=(v:number,min:number,max:number)=>Math.min(max,Math.max(min,Number.isFinite(v)?v:min));
 const x=clamp(r.x,0,.95),y=clamp(r.y,0,.95);
 return {x,y,width:clamp(r.width,.05,1-x),height:clamp(r.height,.05,1-y)};
}
export function dragRegion(a:{x:number;y:number},b:{x:number;y:number}):Region{
 return clampRegion({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)});
}

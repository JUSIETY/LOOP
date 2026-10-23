import type {Item} from './types';
import {defaultConfig} from './defaults';
export function selectionItems(items:Item[]):Item[]{
 if(!items.some(i=>i.id==='milk-carton')||items.some(i=>i.id==='aseptic-carton'))return items;
 const carton=defaultConfig.items.find(i=>i.id==='aseptic-carton')!;
 return [...items,carton];
}
export function photoChoices(ids:string[],items:Item[]):Item[]{
 const expanded=[...ids];
 if(ids.includes('milk-carton')||ids.includes('aseptic-carton'))expanded.push('milk-carton','aseptic-carton');
 if(ids.includes('pet-bottle'))expanded.push('plastic-container');
 return [...new Set(expanded)].map(id=>items.find(i=>i.id===id)).filter((i):i is Item=>!!i);
}

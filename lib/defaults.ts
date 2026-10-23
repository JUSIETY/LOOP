import content from './content.json';
import type { Config, Item } from './types';
export const categories = [
 {id:'pet',name:'투명 페트병',icon:'🧴',color:'#e0f0df'},
 {id:'plastic',name:'플라스틱',icon:'🥡',color:'#e1ebf7'},
 {id:'paper',name:'종이류',icon:'📦',color:'#f1e6d6'},
 {id:'carton',name:'종이팩',icon:'🥛',color:'#e7e2f3'},
 {id:'can',name:'캔류',icon:'🥫',color:'#e5ebeb'},
 {id:'glass',name:'유리병',icon:'🍾',color:'#dbe9e0'},
 {id:'vinyl',name:'비닐류',icon:'🍬',color:'#faead4'},
 {id:'general',name:'일반쓰레기',icon:'🗑️',color:'#edeae5'},
];
export const categoryName=(id:string)=>categories.find(c=>c.id===id)?.name||id;
export const defaultConfig:Config={title:'우리 학교 그린 부스',region:'현장 수거 기준 확인 필요',sourceUrl:content.sources[0].url,verified:false,items:content.items.map(i=>({id:i.id,name:i.name,emoji:i.emoji,category:i.category,reason:i.method+' '+i.reason,tip:i.hint})) as Item[]};
export {content};

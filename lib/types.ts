export const CATEGORY_IDS = ['pet','plastic','paper','carton','can','glass','vinyl','general'] as const;
export type Category = typeof CATEGORY_IDS[number];
export type Item = { id:string; name:string; emoji:string; category:Category; reason:string; tip:string };
export type Config = {title:string; region:string; sourceUrl:string; verified:boolean; items:Item[]};
export type RoomContext = {params: Promise<{room:string}> | {room:string}};

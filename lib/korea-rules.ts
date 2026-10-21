export const nationalSource='https://xn--oy2b29bd3a601b.kr/';
export const seoulSource='https://news.seoul.go.kr/env/archives/564022';
export const petSource='https://www.korea.kr/news/policyNewsView.do?newsId=148881706';
export const ruleKinds=[['bottle','플라스틱 병·투명 용기'],['carton','우유팩·멸균팩'],['box','택배 상자'],['glass','유리병·유리 식기'],['vinyl','비닐 포장재'],['paper','종이컵·영수증·휴지'],['can','금속 캔'],['battery','건전지·보조배터리'],['foam','스티로폼'],['mixed','칫솔·복합재질 제품']] as const;
export type RuleKind=typeof ruleKinds[number][0];
export type RuleResult={destination:string; steps:string; source:string; local:boolean};
export function disposalRule(kind:RuleKind,variant:string,region:string):RuleResult{
 const result=(destination:string,steps:string,source=nationalSource,local=false)=>({destination,steps,source,local});
 if(!variant||variant==='unknown')return result('추가 확인 필요','재질 표시·용도·안쪽 재질을 확인하고, 알 수 없으면 지역 담당자에게 문의하세요.',nationalSource,true);
 switch(kind){
 case 'bottle':return variant==='clear-drink'?result('투명 페트병','생수·음료용 무색 PET병만 해당해요. 비우고 헹군 다음 라벨을 분리하고 압착해 뚜껑을 닫아요.',petSource):variant==='plastic'?result('플라스틱류','투명 식품 용기·유색 PET병은 투명 페트병 전용함에 넣지 않아요. 내용물을 비우고 부속품을 분리해요.',petSource):result('추가 확인 필요','재질 표시와 남은 내용물을 확인하세요.',nationalSource,true);
 case 'carton':return result(variant==='aseptic'?'멸균팩 별도 수거 확인':'일반 종이팩','비우고 씻어 말려요. 일반 폐지와 구분하고, 일반팩·멸균팩을 나누어 받는지 수거함 표시를 확인하세요.',nationalSource,true);
 case 'box':return variant==='plain'?result('종이류','테이프와 송장을 떼고 접어서 배출해요.',seoulSource):result('종량제봉투 안내 · 지역 확인','분리되지 않는 비닐·은박 안감 상자는 일반 골판지와 구분해요.',seoulSource,true);
 case 'glass':return variant==='bottle'?result('유리병','내용물을 비우고 헹궈요. 보증금 대상은 판매처 반환을 확인해요.'):result('특수마대 등 지역별 방법 확인','깨진 유리·내열유리·도자기는 유리병 수거함에 넣지 않아요. 깨진 조각은 보호 포장하고 수거 담당자 안내를 확인하세요.',seoulSource,true);
 case 'vinyl':return variant==='wrap'?result('종량제봉투 안내 · 지역 확인','식품용 랩은 일반 비닐 포장재와 구분해요.',seoulSource,true):variant==='dirty'?(region==='seoul'?result('비닐류 · 서울 안내','고형 내용물을 비우세요. 서울은 일부 오염 비닐도 수거해요. 행사 수거업체 기준을 확인하세요.',seoulSource,true):result('지역 기준 확인','오염 비닐의 수거 범위는 지역마다 달라요. 서울 기준을 전국에 적용하지 않아요.',nationalSource,true)):result('비닐류','내용물을 비우고 이물질을 제거해 용기류와 따로 모아요.');
 case 'paper':return variant==='plain'?result('종이류','깨끗한 일반 종이를 다른 재질과 분리해요.'):variant==='cup'?result('종이컵 수거 기준 확인','컵의 코팅·오염 상태와 지역의 종이컵 수거 여부를 확인하세요.',nationalSource,true):result('종량제봉투','감열지 영수증·사용한 휴지·양면 코팅 종이컵은 일반 폐지와 섞지 않아요.',seoulSource);
 case 'can':return variant==='drink'?result('캔류','내용물을 비우고 헹군 다음 분리 가능한 다른 재질을 떼어요.'):result('별도 처리 확인','가스·압력·내용물이 남은 용기는 부스에서 다루지 말고 지자체 안내를 확인하세요.',nationalSource,true);
 case 'battery':return result('폐전지·전용 수거','캔이나 일반쓰레기로 버리지 않아요. 부풀거나 손상된 배터리는 사용·충전을 중단하고 수거 담당자에게 처리 방법을 문의하세요.',nationalSource,true);
 case 'foam':return variant==='clean'?result('스티로폼류','깨끗한 포장 상자의 라벨·테이프를 제거하고 별도로 모아요.',seoulSource):result('지역 기준 확인','오염된 스티로폼·과일 포장망은 깨끗한 포장 상자와 구분해요.',seoulSource,true);
 case 'mixed':return result('재질별·지역별 확인','플라스틱처럼 보여도 복합재질 제품은 별도 판단이 필요해요. 배터리 포함 제품은 전자제품 수거 경로를 확인하세요.',seoulSource,true);
 }
}
export const variants:Record<RuleKind,readonly (readonly [string,string])[]>={
 bottle:[['clear-drink','생수·음료용 / 무색 투명 / PET 표시 모두 확인'],['plastic','유색 PET병 또는 투명 플라스틱 식품 용기']],
 carton:[['milk','안쪽 은박 없는 일반 우유팩'],['aseptic','안쪽 은박 있는 멸균팩']],
 box:[['plain','안감 없는 깨끗한 골판지'],['lined','분리할 수 없는 은박·비닐 안감']],
 glass:[['bottle','온전한 음료 유리병'],['other','깨진 유리·내열유리·도자기']],
 vinyl:[['clean','내용물을 비운 깨끗한 비닐 포장재'],['dirty','이물질·기름이 묻은 비닐'],['wrap','식품용 랩']],
 paper:[['plain','깨끗한 일반 종이'],['excluded','감열지·사용한 휴지·양면 코팅 컵'],['cup','그 외 종이컵']],
 can:[['drink','비어 있는 음료·식품 캔'],['pressure','가스·도료·압력이 남은 용기']],
 battery:[['battery','건전지 또는 충전식 배터리']],
 foam:[['clean','깨끗한 스티로폼 포장 상자'],['other','오염된 포장재·과일 포장망']],
 mixed:[['mixed','복합재질 또는 전자 부품 포함']]
};

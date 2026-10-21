'use client';
import {useState} from 'react';
import {disposalRule,ruleKinds,variants,nationalSource,type RuleKind} from '../lib/korea-rules';
export default function KoreaGuide(){
 const [kind,setKind]=useState<RuleKind>('bottle');const [variant,setVariant]=useState('');const [region,setRegion]=useState('national');
 const result=disposalRule(kind,variant,region);
 return <section className="panel korea-guide" aria-labelledby="korea-heading">
 <div className="eyebrow">KOREA · 품목 + 재질 + 상태</div><h2 id="korea-heading">한국 분리배출 도우미</h2>
 <p>사진으로 확인하기 어려운 조건을 직접 선택하세요. 챌린지 점수와 별개로 실제 배출 방법을 안내해요.</p>
 <div className="korea-fields"><label>적용 지역<select value={region} onChange={e=>setRegion(e.target.value)}><option value="national">전국 공통 안내 · 지역 세부 기준 확인</option><option value="seoul">서울 · 서울시 안내 참고</option></select></label>
 <label>물건 종류<select value={kind} onChange={e=>{setKind(e.target.value as RuleKind);setVariant('')}}>{ruleKinds.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
 <label>직접 확인한 상태<select value={variant} onChange={e=>setVariant(e.target.value)}><option value="">상태를 선택해 주세요</option>{variants[kind].map(([id,name])=><option key={id} value={id}>{name}</option>)}<option value="unknown">확인하기 어려움</option></select></label></div>
 <div className="korea-result" aria-live="polite"><strong>{result.destination}</strong><p>{result.steps}</p>{result.local&&<small>지역·학교 수거 기준 확인이 필요한 항목이에요.</small>}</div>
 <div className="korea-sources"><a href={result.source} target="_blank" rel="noreferrer">이 안내의 공식 출처 ↗</a><a href={nationalSource} target="_blank" rel="noreferrer">전국 품목사전·우리동네 배출방법 ↗</a><span>자료 확인: 2026. 10. 21</span></div>
 </section>
}
